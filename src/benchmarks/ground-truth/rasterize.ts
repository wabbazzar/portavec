/**
 * Truth → ImageData rasterizer.
 *
 * Integer rasterization, no anti-aliasing. Every pixel is either fully
 * the background color or fully one shape's color. This is the only
 * module allowed to bridge Truth and pixel-space — downstream code
 * (quantize, pipeline, loss) sees only ImageData + the algorithm's own
 * output.
 *
 * Z-order: shapes are painted in `Truth.shapes` order. `shapes[0]` is
 * at the bottom; `shapes[n-1]` is on top. Overlapping pixels take the
 * color of the top-most shape that covers them.
 */

import { hexToRgb } from './palette';
import type { GradientFill, Shape, Truth } from './schema';

export function rasterizeTruth(truth: Truth): ImageData {
  const { width, height, background, shapes } = truth;
  const data = new Uint8ClampedArray(width * height * 4);

  // Fill with background.
  const [br, bg, bb] = hexToRgb(background);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = br;
    data[i * 4 + 1] = bg;
    data[i * 4 + 2] = bb;
    data[i * 4 + 3] = 255;
  }

  for (const shape of shapes) {
    const solid = hexToRgb(shape.color);
    const sample = shape.gradient
      ? gradientSampler(shape.gradient)
      : () => solid;
    rasterizeShape(shape, width, height, (x, y) => {
      const idx = y * width + x;
      const [r, g, b] = sample(x, y);
      data[idx * 4] = r;
      data[idx * 4 + 1] = g;
      data[idx * 4 + 2] = b;
      data[idx * 4 + 3] = 255;
    });
  }

  return { data, width, height, colorSpace: 'srgb' } as unknown as ImageData;
}

type PixelSink = (x: number, y: number) => void;
type Rgb = [number, number, number];

function gradientSampler(g: GradientFill): (x: number, y: number) => Rgb {
  const stops = g.stops.map(hexToRgb);
  const interp = (t: number): Rgb => {
    const clamped = t < 0 ? 0 : t > 1 ? 1 : t;
    const pos = clamped * (stops.length - 1);
    const i0 = Math.floor(pos);
    const i1 = Math.min(stops.length - 1, i0 + 1);
    const f = pos - i0;
    const a = stops[i0]!;
    const b = stops[i1]!;
    return [
      Math.round(a[0] + (b[0] - a[0]) * f),
      Math.round(a[1] + (b[1] - a[1]) * f),
      Math.round(a[2] + (b[2] - a[2]) * f),
    ];
  };
  if (g.kind === 'linear') {
    const { p0, p1 } = g;
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const lenSq = dx * dx + dy * dy || 1;
    return (x, y) => {
      const px = x + 0.5 - p0.x;
      const py = y + 0.5 - p0.y;
      const t = (px * dx + py * dy) / lenSq;
      return interp(t);
    };
  }
  // radial
  const { center, radius } = g;
  const invR = radius > 0 ? 1 / radius : 1;
  return (x, y) => {
    const px = x + 0.5 - center.x;
    const py = y + 0.5 - center.y;
    const dist = Math.sqrt(px * px + py * py);
    return interp(dist * invR);
  };
}

function rasterizeShape(shape: Shape, W: number, H: number, sink: PixelSink): void {
  switch (shape.kind) {
    case 'circle':
      rasterizeCircle(shape.cx, shape.cy, shape.r, W, H, sink);
      return;
    case 'rectangle':
      rasterizeRect(shape.x, shape.y, shape.w, shape.h, W, H, sink);
      return;
    case 'triangle':
      rasterizeTriangle(
        shape.p1.x, shape.p1.y,
        shape.p2.x, shape.p2.y,
        shape.p3.x, shape.p3.y,
        W, H, sink,
      );
      return;
  }
}

function rasterizeCircle(
  cx: number, cy: number, r: number, W: number, H: number, sink: PixelSink,
): void {
  const r2 = r * r;
  const x0 = Math.max(0, Math.floor(cx - r));
  const x1 = Math.min(W - 1, Math.ceil(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r));
  const y1 = Math.min(H - 1, Math.ceil(cy + r));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      if (dx * dx + dy * dy <= r2) sink(x, y);
    }
  }
}

function rasterizeRect(
  rx: number, ry: number, rw: number, rh: number, W: number, H: number, sink: PixelSink,
): void {
  const x0 = Math.max(0, Math.floor(rx));
  const y0 = Math.max(0, Math.floor(ry));
  const x1 = Math.min(W - 1, Math.floor(rx + rw) - 1);
  const y1 = Math.min(H - 1, Math.floor(ry + rh) - 1);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) sink(x, y);
  }
}

/**
 * Barycentric-coordinate triangle fill with a pixel-center sample rule.
 */
function rasterizeTriangle(
  ax: number, ay: number, bx: number, by: number, cx: number, cy: number,
  W: number, H: number, sink: PixelSink,
): void {
  const minX = Math.max(0, Math.floor(Math.min(ax, bx, cx)));
  const maxX = Math.min(W - 1, Math.ceil(Math.max(ax, bx, cx)));
  const minY = Math.max(0, Math.floor(Math.min(ay, by, cy)));
  const maxY = Math.min(H - 1, Math.ceil(Math.max(ay, by, cy)));

  const denom = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
  if (denom === 0) return; // degenerate

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      const w1 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / denom;
      const w2 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / denom;
      const w3 = 1 - w1 - w2;
      if (w1 >= 0 && w2 >= 0 && w3 >= 0) sink(x, y);
    }
  }
}
