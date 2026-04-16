/**
 * Marching Squares Algorithm for Contour Tracing
 *
 * Extracts contours (boundaries) from binary images by examining 2x2 pixel
 * neighborhoods and determining the edge configuration.
 *
 * The 16 configurations are based on which corners are "inside" (foreground):
 *   bit 0 (1)  = top-left
 *   bit 1 (2)  = top-right
 *   bit 2 (4)  = bottom-right
 *   bit 3 (8)  = bottom-left
 *
 * Reference: Lorensen & Cline (1987). "Marching Cubes" (2D variant)
 */

import type { Point } from '../../utils/svg';

/**
 * A single contour - a closed or open path of points
 */
export interface Contour {
  /** Points forming the contour (in order) */
  points: Point[];
  /** Whether the contour is closed (first point connects to last) */
  closed: boolean;
  /** Whether this contour is a hole (inner boundary) */
  isHole: boolean;
  /** Index of parent contour (-1 if no parent/outer contour) */
  parentIndex: number;
  /** Bounding box */
  bounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
}

/**
 * Get the marching squares configuration for a 2x2 cell
 * Returns a 4-bit value where each bit represents a corner:
 *   bit 0 (1)  = top-left
 *   bit 1 (2)  = top-right
 *   bit 2 (4)  = bottom-right
 *   bit 3 (8)  = bottom-left
 *
 * OPTIMIZED: Inline pixel access, no boundary checks (caller must ensure valid coords)
 */
function getCellConfigFast(
  binary: Uint8ClampedArray,
  width: number,
  x: number,
  y: number
): number {
  const row = y * width;
  const nextRow = row + width;
  return (
    (binary[row + x]! > 0 ? 1 : 0) |         // top-left
    (binary[row + x + 1]! > 0 ? 2 : 0) |     // top-right
    (binary[nextRow + x + 1]! > 0 ? 4 : 0) | // bottom-right
    (binary[nextRow + x]! > 0 ? 8 : 0)       // bottom-left
  );
}

/**
 * Get cell config with boundary handling (for edge cells)
 */
function getCellConfigSafe(
  binary: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number
): number {
  let config = 0;
  // top-left
  if (x >= 0 && y >= 0 && x < width && y < height && binary[y * width + x]! > 0) config |= 1;
  // top-right
  if (x + 1 >= 0 && y >= 0 && x + 1 < width && y < height && binary[y * width + x + 1]! > 0) config |= 2;
  // bottom-right
  if (x + 1 >= 0 && y + 1 >= 0 && x + 1 < width && y + 1 < height && binary[(y + 1) * width + x + 1]! > 0) config |= 4;
  // bottom-left
  if (x >= 0 && y + 1 >= 0 && x < width && y + 1 < height && binary[(y + 1) * width + x]! > 0) config |= 8;
  return config;
}

/**
 * Legacy function for compatibility - uses safe version
 */
function getCellConfig(
  binary: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number
): number {
  // Use fast path for interior cells, safe path for boundary
  if (x >= 0 && y >= 0 && x + 1 < width && y + 1 < height) {
    return getCellConfigFast(binary, width, x, y);
  }
  return getCellConfigSafe(binary, width, height, x, y);
}

/**
 * Edge indices: 0=top, 1=right, 2=bottom, 3=left
 *
 * NEXT_EDGE[config][entryEdge] = exitEdge
 *
 * This table defines: given a cell configuration and the edge we entered from,
 * which edge should we exit through to continue tracing the contour?
 *
 * The contour traces with FOREGROUND on the RIGHT side (clockwise around filled regions).
 * -1 means invalid entry for that configuration.
 *
 * Entry edge = the edge of THIS cell we came through (opposite of previous cell's exit)
 */
/**
 * NEXT_EDGE[config][entryEdge] = exitEdge
 *
 * Maps each (config, entry edge) pair to the correct exit edge for
 * clockwise tracing with foreground on the RIGHT side.
 *
 * Config bits: bit0=TL, bit1=TR, bit2=BR, bit3=BL
 * (TL=top-left pixel, etc.)
 *
 * Edge indices: 0=top, 1=right, 2=bottom, 3=left
 * -1 means invalid entry for that configuration.
 */
const NEXT_EDGE: number[][] = [
  [-1, -1, -1, -1],  // 0: empty (no edges crossed)
  [ 3, -1, -1,  0],  // 1: TL only - crosses top & left
  [ 1,  0, -1, -1],  // 2: TR only - crosses top & right
  [-1,  3, -1,  1],  // 3: TL+TR (top row) - crosses right & left
  [-1,  2,  1, -1],  // 4: BR only - crosses right & bottom
  [ 3,  2,  1,  0],  // 5: TL+BR (saddle) - crosses all edges
  [ 2, -1,  0, -1],  // 6: TR+BR (right col) - crosses top & bottom
  [-1, -1,  3,  2],  // 7: TL+TR+BR (!BL) - crosses bottom & left
  [-1, -1,  3,  2],  // 8: BL only - crosses bottom & left
  [ 2, -1,  0, -1],  // 9: TL+BL (left col) - crosses top & bottom
  [ 1,  0,  3,  2],  // 10: TR+BL (saddle) - crosses all edges
  [-1,  2,  1, -1],  // 11: TL+TR+BL (!BR) - crosses right & bottom
  [-1,  3, -1,  1],  // 12: BR+BL (bottom row) - crosses right & left
  [ 1,  0, -1, -1],  // 13: TL+BR+BL (!TR) - crosses top & right
  [ 3, -1, -1,  0],  // 14: TR+BR+BL (!TL) - crosses top & left
  [-1, -1, -1, -1],  // 15: all filled (no edges crossed)
];

/**
 * Starting edge for initiating a trace from a cell.
 * START_CONFIG[config] = [startEdge, direction]
 * startEdge = which edge to start the trace from
 * direction: 1=CW (not currently used, always CW)
 * null means no valid starting edge (empty or full cell).
 *
 * The start edge should be one of the edges that the contour crosses.
 */
const START_CONFIG: Array<[number, number] | null> = [
  null,     // 0: empty
  [0, 1],   // 1: TL only - start from top
  [0, 1],   // 2: TR only - start from top
  [1, 1],   // 3: TL+TR (top row) - start from right
  [1, 1],   // 4: BR only - start from right
  [0, 1],   // 5: TL+BR (saddle) - start from top
  [0, 1],   // 6: TR+BR (right col) - start from top
  [2, 1],   // 7: !BL - start from bottom
  [2, 1],   // 8: BL only - start from bottom
  [0, 1],   // 9: TL+BL (left col) - start from top
  [0, 1],   // 10: TR+BL (saddle) - start from top
  [1, 1],   // 11: !BR - start from right
  [1, 1],   // 12: BR+BL (bottom row) - start from right
  [0, 1],   // 13: !TR - start from top
  [0, 1],   // 14: !TL - start from top
  null,     // 15: full
];

/**
 * Get the midpoint of an edge for a cell at (x, y)
 * Edge indices: 0=top, 1=right, 2=bottom, 3=left
 */
function getEdgePoint(x: number, y: number, edge: number): Point {
  switch (edge) {
    case 0: return { x: x + 0.5, y };       // top edge midpoint
    case 1: return { x: x + 1, y: y + 0.5 }; // right edge midpoint
    case 2: return { x: x + 0.5, y: y + 1 }; // bottom edge midpoint
    case 3: return { x, y: y + 0.5 };       // left edge midpoint
    default: return { x: x + 0.5, y: y + 0.5 };
  }
}

/**
 * Get neighbor cell coordinates when crossing an edge
 */
function getNeighbor(x: number, y: number, edge: number): [number, number] {
  switch (edge) {
    case 0: return [x, y - 1];     // top -> above
    case 1: return [x + 1, y];     // right -> right
    case 2: return [x, y + 1];     // bottom -> below
    case 3: return [x - 1, y];     // left -> left
    default: return [x, y];
  }
}

/**
 * Get the opposite edge (entry edge in neighbor cell)
 */
function getOppositeEdge(edge: number): number {
  return (edge + 2) % 4;
}

/**
 * Encode cell position and edge into a single number for fast Set operations
 * Format: (y * width + x) * 4 + edge
 * This avoids expensive string concatenation and parsing
 */
function encodeVisitedKey(x: number, y: number, edge: number, width: number): number {
  return (y * width + x) * 4 + edge;
}

/**
 * Trace a single contour starting from a given cell
 * OPTIMIZED: Uses numeric visited keys instead of strings
 */
function traceContour(
  binary: Uint8ClampedArray,
  width: number,
  height: number,
  startX: number,
  startY: number,
  startEdge: number,
  visited: Set<number>
): Point[] {
  const points: Point[] = [];

  let x = startX;
  let y = startY;
  let entryEdge = startEdge;

  const maxIterations = width * height * 4;
  let iterations = 0;

  // Add the starting point
  points.push(getEdgePoint(x, y, entryEdge));

  while (iterations < maxIterations) {
    const config = getCellConfig(binary, width, height, x, y);
    const exitEdge = NEXT_EDGE[config]?.[entryEdge] ?? -1;

    if (exitEdge === -1) {
      // No valid exit - either bug or we've hit an edge case
      break;
    }

    // Add the exit point
    points.push(getEdgePoint(x, y, exitEdge));

    // Mark this cell as visited for BOTH directions
    // This prevents tracing the same boundary twice (CW and CCW)
    visited.add(encodeVisitedKey(x, y, entryEdge, width));
    visited.add(encodeVisitedKey(x, y, exitEdge, width));

    // Move to neighbor
    const [nx, ny] = getNeighbor(x, y, exitEdge);
    const nextEntry = getOppositeEdge(exitEdge);

    // Check if we've completed the loop
    if (nx === startX && ny === startY && nextEntry === startEdge) {
      break;
    }

    x = nx;
    y = ny;
    entryEdge = nextEntry;
    iterations++;
  }

  return points;
}

/**
 * Extract all contours from a binary image using marching squares
 * OPTIMIZED: Uses numeric visited keys and fast cell config for interior cells
 */
export function extractContours(
  binary: Uint8ClampedArray,
  width: number,
  height: number
): Contour[] {
  const contours: Contour[] = [];
  const visited = new Set<number>();

  // Scan interior cells first (fast path - no boundary checks needed)
  // Then handle boundary cells with safe path
  const maxX = width - 1;
  const maxY = height - 1;

  for (let y = 0; y < height; y++) {
    const isBoundaryY = y === 0 || y >= maxY;

    for (let x = 0; x < width; x++) {
      // Use fast path for interior cells, safe path for boundary
      const config = (x > 0 && x < maxX && !isBoundaryY)
        ? getCellConfigFast(binary, width, x, y)
        : getCellConfigSafe(binary, width, height, x, y);

      // Skip empty and full cells
      if (config === 0 || config === 15) continue;

      const startConfig = START_CONFIG[config];
      if (!startConfig) continue;

      const [startEdge] = startConfig;
      const key = encodeVisitedKey(x, y, startEdge, width);

      if (visited.has(key)) continue;

      const points = traceContour(binary, width, height, x, y, startEdge, visited);

      // Only keep contours with enough points
      if (points.length >= 4) {
        let minX = Infinity, minY = Infinity;
        let maxX = -Infinity, maxY = -Infinity;

        for (const p of points) {
          if (p.x < minX) minX = p.x;
          if (p.y < minY) minY = p.y;
          if (p.x > maxX) maxX = p.x;
          if (p.y > maxY) maxY = p.y;
        }

        contours.push({
          points,
          closed: true,
          isHole: false,
          parentIndex: -1,
          bounds: { minX, minY, maxX, maxY },
        });
      }
    }
  }

  classifyContourHierarchy(contours);
  return contours;
}

/**
 * Calculate the signed area of a contour (positive = CCW, negative = CW)
 */
export function contourSignedArea(points: Point[]): number {
  let area = 0;
  const n = points.length;

  for (let i = 0; i < n; i++) {
    const curr = points[i]!;
    const next = points[(i + 1) % n]!;
    area += curr.x * next.y - next.x * curr.y;
  }

  return area / 2;
}

/**
 * Check if a point is inside a contour using ray casting
 */
export function pointInContour(point: Point, contour: Point[]): boolean {
  let inside = false;
  const n = contour.length;

  for (let i = 0, j = n - 1; i < n; j = i++) {
    const pi = contour[i]!;
    const pj = contour[j]!;

    if (
      ((pi.y > point.y) !== (pj.y > point.y)) &&
      (point.x < (pj.x - pi.x) * (point.y - pi.y) / (pj.y - pi.y) + pi.x)
    ) {
      inside = !inside;
    }
  }

  return inside;
}

function contourInsideContour(a: Contour, b: Contour): boolean {
  if (
    a.bounds.minX < b.bounds.minX ||
    a.bounds.maxX > b.bounds.maxX ||
    a.bounds.minY < b.bounds.minY ||
    a.bounds.maxY > b.bounds.maxY
  ) {
    return false;
  }

  if (a.points.length === 0) return false;
  return pointInContour(a.points[0]!, b.points);
}

function classifyContourHierarchy(contours: Contour[]): void {
  for (const contour of contours) {
    const area = contourSignedArea(contour.points);
    contour.isHole = area > 0;
  }

  for (let i = 0; i < contours.length; i++) {
    const contour = contours[i]!;
    let smallestParent = -1;
    let smallestArea = Infinity;

    for (let j = 0; j < contours.length; j++) {
      if (i === j) continue;

      const candidate = contours[j]!;
      if (contourInsideContour(contour, candidate)) {
        const area = Math.abs(contourSignedArea(candidate.points));
        if (area < smallestArea) {
          smallestArea = area;
          smallestParent = j;
        }
      }
    }

    contour.parentIndex = smallestParent;

    if (smallestParent !== -1) {
      const parent = contours[smallestParent]!;
      contour.isHole = !parent.isHole;
    }
  }
}

/**
 * Simplify contour using Douglas-Peucker algorithm
 */
export function simplifyContour(
  points: Point[],
  tolerance: number = 1.0
): Point[] {
  if (points.length <= 3) return points;

  const keepIndices = new Set<number>([0, points.length - 1]);
  douglasPeuckerRecursive(points, 0, points.length - 1, tolerance, keepIndices);

  const sortedIndices = Array.from(keepIndices).sort((a, b) => a - b);
  return sortedIndices.map((i) => points[i]!);
}

function perpendicularDistance(
  point: Point,
  lineStart: Point,
  lineEnd: Point
): number {
  const dx = lineEnd.x - lineStart.x;
  const dy = lineEnd.y - lineStart.y;

  const lineLengthSq = dx * dx + dy * dy;
  if (lineLengthSq === 0) {
    const pdx = point.x - lineStart.x;
    const pdy = point.y - lineStart.y;
    return Math.sqrt(pdx * pdx + pdy * pdy);
  }

  const numerator = Math.abs(
    dy * point.x - dx * point.y + lineEnd.x * lineStart.y - lineEnd.y * lineStart.x
  );
  return numerator / Math.sqrt(lineLengthSq);
}

function douglasPeuckerRecursive(
  points: Point[],
  startIndex: number,
  endIndex: number,
  tolerance: number,
  keepIndices: Set<number>
): void {
  if (endIndex <= startIndex + 1) {
    return;
  }

  const lineStart = points[startIndex]!;
  const lineEnd = points[endIndex]!;

  let maxDistance = 0;
  let maxIndex = startIndex;

  for (let i = startIndex + 1; i < endIndex; i++) {
    const distance = perpendicularDistance(points[i]!, lineStart, lineEnd);
    if (distance > maxDistance) {
      maxDistance = distance;
      maxIndex = i;
    }
  }

  if (maxDistance > tolerance) {
    keepIndices.add(maxIndex);
    douglasPeuckerRecursive(points, startIndex, maxIndex, tolerance, keepIndices);
    douglasPeuckerRecursive(points, maxIndex, endIndex, tolerance, keepIndices);
  }
}
