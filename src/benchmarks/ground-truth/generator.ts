/**
 * Deterministic shape generator.
 *
 * Given a seed + size + shape count + color count, produces a Truth
 * describing 1–3 non-overlapping colored shapes. Each shape is assigned
 * its own color from an HSL-spaced palette.
 *
 * Algorithm: rejection sampling. For each shape we sample candidate
 * params up to MAX_ATTEMPTS times until its bounding box fits inside
 * the canvas and doesn't intersect any previously placed shape's bbox.
 * Bounding-box non-overlap is conservative (some non-bbox-intersecting
 * arrangements are rejected) but keeps the downstream rasterizer simple.
 */

import { mulberry32 } from './rng';
import { pickPalette } from './palette';
import {
  MAX_SHAPE_COUNT,
  type Bounds,
  type GeneratorInput,
  type Shape,
  type ShapeKind,
  type Truth,
} from './schema';

const MAX_ATTEMPTS = 200;
const BACKGROUND = '#ffffff';
const SHAPE_KINDS: ShapeKind[] = ['circle', 'rectangle', 'triangle'];

export function generateTruth(input: GeneratorInput): Truth {
  if (!Number.isInteger(input.colors) || input.colors < 1 || input.colors > MAX_SHAPE_COUNT) {
    throw new Error(`generateTruth: colors must be integer in [1, ${MAX_SHAPE_COUNT}]`);
  }
  if (!Number.isInteger(input.shapeCount) || input.shapeCount < 1 || input.shapeCount > MAX_SHAPE_COUNT) {
    throw new Error(`generateTruth: shapeCount must be integer in [1, ${MAX_SHAPE_COUNT}]`);
  }
  if (input.colors !== input.shapeCount) {
    throw new Error(
      `generateTruth: colors (${input.colors}) must equal shapeCount (${input.shapeCount})`,
    );
  }
  const rng = mulberry32(input.seed);
  const palette = pickPalette(rng, input.colors);
  const shapes: Shape[] = [];
  const placedBounds: Bounds[] = [];
  const allowOverlap = input.allowOverlap ?? false;

  for (let i = 0; i < input.shapeCount; i++) {
    const color = palette[i]!;
    const kind = rng.pick(SHAPE_KINDS);
    let placed: { shape: Shape; bounds: Bounds } | null = null;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const candidate = sampleShape(
        rng, kind, color, input.width, input.height, input.shapeCount,
      );
      if (!fitsInCanvas(candidate.bounds, input.width, input.height)) continue;
      if (!allowOverlap && placedBounds.some((b) => boundsOverlap(b, candidate.bounds))) {
        continue;
      }
      placed = candidate;
      break;
    }

    if (!placed) {
      throw new Error(
        `generateTruth: failed to place shape ${i} after ${MAX_ATTEMPTS} attempts (seed=${input.seed}, size=${input.width}x${input.height}, allowOverlap=${allowOverlap})`,
      );
    }
    shapes.push(placed.shape);
    placedBounds.push(placed.bounds);
  }

  return {
    width: input.width,
    height: input.height,
    background: BACKGROUND,
    palette,
    shapes,
    seed: input.seed,
  };
}

/** AABB helper for downstream tests. */
export function shapeBounds(shape: Shape): Bounds {
  switch (shape.kind) {
    case 'circle':
      return {
        x: shape.cx - shape.r,
        y: shape.cy - shape.r,
        w: shape.r * 2,
        h: shape.r * 2,
      };
    case 'rectangle':
      return { x: shape.x, y: shape.y, w: shape.w, h: shape.h };
    case 'triangle': {
      const xs = [shape.p1.x, shape.p2.x, shape.p3.x];
      const ys = [shape.p1.y, shape.p2.y, shape.p3.y];
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
    }
  }
}

function fitsInCanvas(b: Bounds, w: number, h: number): boolean {
  return b.x >= 0 && b.y >= 0 && b.x + b.w <= w && b.y + b.h <= h;
}

function boundsOverlap(a: Bounds, b: Bounds): boolean {
  return !(
    a.x + a.w <= b.x ||
    b.x + b.w <= a.x ||
    a.y + a.h <= b.y ||
    b.y + b.h <= a.y
  );
}

function sampleShape(
  rng: ReturnType<typeof mulberry32>,
  kind: ShapeKind,
  color: string,
  W: number,
  H: number,
  shapeCount: number,
): { shape: Shape; bounds: Bounds } {
  // Size envelope scales inversely with shapeCount so more shapes fit.
  // Reference tuning: for shapeCount=3 at 256px, maxDim ≈ 64, minDim ≈ 25.
  // For shapeCount=16 at 256px, shapes are ~half that to keep a mix of
  // overlap and visible distinct regions.
  const base = Math.min(W, H);
  const scale = Math.sqrt(3 / Math.max(1, shapeCount));
  const maxDim = Math.max(16, Math.floor((base / 4) * scale));
  const minDim = Math.max(8, Math.floor((base / 10) * scale));

  switch (kind) {
    case 'circle': {
      const r = rng.int(minDim, maxDim);
      const cx = rng.int(r, W - r);
      const cy = rng.int(r, H - r);
      const shape: Shape = { kind, cx, cy, r, color };
      return { shape, bounds: shapeBounds(shape) };
    }
    case 'rectangle': {
      const w = rng.int(minDim, maxDim);
      const h = rng.int(minDim, maxDim);
      const x = rng.int(0, W - w);
      const y = rng.int(0, H - h);
      const shape: Shape = { kind, x, y, w, h, color };
      return { shape, bounds: shapeBounds(shape) };
    }
    case 'triangle': {
      // Sample an AABB first, then three points inside it (one per corner
      // region) to guarantee the triangle is non-degenerate.
      const w = rng.int(minDim, maxDim);
      const h = rng.int(minDim, maxDim);
      const x = rng.int(0, W - w);
      const y = rng.int(0, H - h);
      const p1 = { x: rng.int(x, x + Math.floor(w / 3)), y: y };
      const p2 = { x: x + w, y: rng.int(y, y + Math.floor(h / 2)) };
      const p3 = { x: rng.int(x, x + w), y: y + h };
      const shape: Shape = { kind, p1, p2, p3, color };
      return { shape, bounds: shapeBounds(shape) };
    }
  }
}
