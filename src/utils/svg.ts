/**
 * SVG generation utilities
 */

export interface Point {
  x: number;
  y: number;
}

export interface BezierSegment {
  type: 'L' | 'C';  // Line or Cubic bezier
  points: Point[];  // 1 point for L, 3 for C (control1, control2, end)
}

export interface BezierPath {
  segments: BezierSegment[];
  closed: boolean;
  isHole?: boolean;
}

/**
 * Convert a BezierPath to SVG path 'd' attribute
 */
export function pathToSvgD(path: BezierPath, startPoint: Point): string {
  let d = `M ${startPoint.x.toFixed(2)} ${startPoint.y.toFixed(2)}`;

  for (const segment of path.segments) {
    if (segment.type === 'L') {
      const p = segment.points[0]!;
      d += ` L ${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
    } else {
      const [c1, c2, end] = segment.points as [Point, Point, Point];
      d += ` C ${c1.x.toFixed(2)} ${c1.y.toFixed(2)} ${c2.x.toFixed(2)} ${c2.y.toFixed(2)} ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
    }
  }

  if (path.closed) {
    d += ' Z';
  }

  return d;
}

/**
 * Convert an array of points to a simple polyline SVG path
 */
export function pointsToSvgD(points: Point[], closed: boolean = true): string {
  if (points.length === 0) return '';

  const first = points[0]!;
  let d = `M ${first.x.toFixed(2)} ${first.y.toFixed(2)}`;

  for (let i = 1; i < points.length; i++) {
    const p = points[i]!;
    d += ` L ${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
  }

  if (closed) {
    d += ' Z';
  }

  return d;
}

/**
 * Create an SVG document containing the given paths
 */
export function createSvgDocument(
  paths: string[],
  width: number,
  height: number,
  options: {
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
    fillRule?: 'nonzero' | 'evenodd';
  } = {}
): string {
  const {
    fill = 'black',
    stroke = 'none',
    strokeWidth = 1,
    fillRule = 'evenodd',
  } = options;

  const pathElements = paths
    .map((d) => `    <path d="${d}" />`)
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     width="${width}"
     height="${height}"
     viewBox="0 0 ${width} ${height}">
  <g fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" fill-rule="${fillRule}">
${pathElements}
  </g>
</svg>`;
}

/**
 * Parse an SVG string and extract path 'd' attributes
 */
export function extractPathsFromSvg(svgContent: string): string[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgContent, 'image/svg+xml');
  const paths = doc.querySelectorAll('path');
  return Array.from(paths).map((p) => p.getAttribute('d') || '');
}

/**
 * Render an SVG string to ImageData
 */
export async function renderSvgToImageData(
  svgContent: string,
  width: number,
  height: number
): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const blob = new Blob([svgContent], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);

    img.onload = () => {
      URL.revokeObjectURL(url);

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        reject(new Error('Failed to create canvas context'));
        return;
      }

      // Fill with white background
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, width, height);

      // Draw SVG
      ctx.drawImage(img, 0, 0, width, height);
      const imageData = ctx.getImageData(0, 0, width, height);
      resolve(imageData);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to render SVG'));
    };

    img.src = url;
  });
}

/**
 * Calculate the bounding box of a set of points
 */
export function getBoundingBox(points: Point[]): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
} {
  if (points.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}
