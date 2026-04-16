/**
 * Gradient-variant Truth generator.
 *
 * Builds on `generateTruth` but decorates each shape with a linear or
 * radial gradient fill. The truth palette is expanded to include every
 * stop color, so the existing loss function (palette ΔE matching +
 * coverage IoU) scales naturally to gradient recovery: an algorithm
 * that finds N representative colors across a gradient-shape will
 * score partial credit.
 *
 * Deterministic for a given (seed, shapeCount). Reuses the same shape
 * placement rules.
 */

import { generateTruth, shapeBounds } from './generator';
import { mulberry32 } from './rng';
import { hslToHex } from './palette';
import type {
  GeneratorInput,
  GradientFill,
  Point,
  Shape,
  Truth,
} from './schema';

export interface GradientGeneratorInput extends GeneratorInput {
  /**
   * Gradient kind — 'mixed' picks a mix per shape.
   */
  gradientKind?: 'linear' | 'radial' | 'mixed';
  /** Number of stops per gradient. Default 2. */
  stops?: number;
}

export function generateGradientTruth(input: GradientGeneratorInput): Truth {
  const plain = generateTruth(input);
  const rng = mulberry32(input.seed ^ 0x9e3779b9); // decorrelated stream
  const mode = input.gradientKind ?? 'mixed';
  const stops = Math.max(2, Math.floor(input.stops ?? 2));
  const extraPalette: string[] = [];

  const decorated: Shape[] = plain.shapes.map((s) => {
    const kind: 'linear' | 'radial' =
      mode === 'mixed' ? (rng.next() < 0.5 ? 'linear' : 'radial') : mode;
    const gradient = buildGradient(rng, s, kind, stops);
    extraPalette.push(...gradient.stops);
    return { ...s, gradient };
  });

  // De-duplicate palette (case-insensitive hex compare).
  const seen = new Set<string>();
  const palette: string[] = [];
  for (const c of [...plain.palette, ...extraPalette]) {
    const k = c.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    palette.push(c);
  }

  return { ...plain, shapes: decorated, palette };
}

function buildGradient(
  rng: ReturnType<typeof mulberry32>,
  shape: Shape,
  kind: 'linear' | 'radial',
  stopCount: number,
): GradientFill {
  // Complementary palette choice: one stop = the shape's base color,
  // remaining stops sampled from a narrow hue-shift range so the
  // gradient stays visually distinct from other shapes.
  const base = shape.color;
  const hueShift = rng.range(0.08, 0.25) * (rng.next() < 0.5 ? -1 : 1);
  const stops: string[] = [base];
  for (let i = 1; i < stopCount; i++) {
    stops.push(shiftHue(base, hueShift * (i / (stopCount - 1))));
  }

  const b = shapeBounds(shape);
  if (kind === 'linear') {
    // Pick a random axis across the bounding box.
    const angle = rng.range(0, Math.PI);
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    const halfLen = Math.max(b.w, b.h) / 2;
    const dx = Math.cos(angle) * halfLen;
    const dy = Math.sin(angle) * halfLen;
    const p0: Point = { x: cx - dx, y: cy - dy };
    const p1: Point = { x: cx + dx, y: cy + dy };
    return { kind: 'linear', p0, p1, stops };
  }
  // radial — center at shape centroid, radius = half of the longest diagonal
  const center: Point = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  const radius = Math.max(b.w, b.h) / 2;
  return { kind: 'radial', center, radius, stops };
}

function shiftHue(hex: string, delta: number): string {
  const [r, g, b] = hexToRgb(hex);
  const [h, s, l] = rgbToHsl(r, g, b);
  const h2 = (h + delta + 1) % 1;
  return hslToHex(h2, Math.min(1, s * 0.9), Math.max(0, Math.min(1, l + delta * 0.15)));
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const R = r / 255;
  const G = g / 255;
  const B = b / 255;
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === R) h = (G - B) / d + (G < B ? 6 : 0);
  else if (max === G) h = (B - R) / d + 2;
  else h = (R - G) / d + 4;
  return [h / 6, s, l];
}
