/**
 * Synthetic ground-truth types for the multi-color vectorization benchmark.
 *
 * The algorithm under test (`quantize`, `runMultiColorPipeline`) must NOT
 * import from this module — doing so contaminates the benchmark. Only the
 * rasterizer (ground-truth/rasterize.ts) and the loss function
 * (ground-truth/loss.ts) are allowed to consume Truth values.
 */

export type Point = { x: number; y: number };

/**
 * Per-shape gradient fill. When present, the rasterizer uses the gradient
 * and the truth palette records every stop color. When absent, shapes
 * render as solid `color`.
 *
 * - 'linear': interpolate along the vector from p0 → p1 (both in pixel coords)
 * - 'radial': interpolate radially from center out to radius
 */
export type GradientFill =
  | { kind: 'linear'; p0: Point; p1: Point; stops: string[] }
  | { kind: 'radial'; center: Point; radius: number; stops: string[] };

export type Shape =
  | { kind: 'circle'; cx: number; cy: number; r: number; color: string; gradient?: GradientFill }
  | { kind: 'rectangle'; x: number; y: number; w: number; h: number; color: string; gradient?: GradientFill }
  | { kind: 'triangle'; p1: Point; p2: Point; p3: Point; color: string; gradient?: GradientFill };

export type ShapeKind = Shape['kind'];

export interface Truth {
  width: number;
  height: number;
  /** Background color (always present, not counted in palette length). */
  background: string;
  /** Exactly `shapes.length` distinct foreground colors, in generation order. */
  palette: string[];
  shapes: Shape[];
  seed: number;
}

/**
 * Integer in [1, 16]. Validated at runtime by `generateTruth`.
 */
export type ShapeCount = number;

export const MAX_SHAPE_COUNT = 16;

export interface GeneratorInput {
  seed: number;
  /**
   * Number of foreground colors the palette should contain. Equals
   * `shapes.length` — each shape gets its own color. Range: 1..16.
   */
  colors: ShapeCount;
  /**
   * Number of shapes to place. Must match `colors`. Range: 1..16.
   */
  shapeCount: ShapeCount;
  width: number;
  height: number;
  /**
   * When true, shapes may overlap; later shapes occlude earlier ones
   * (z-order: `shapes[0]` is drawn first, `shapes[n-1]` is on top).
   * When false (default), rejection sampling ensures bounding boxes
   * never overlap — matches the v1 benchmark behavior.
   */
  allowOverlap?: boolean;
}

/**
 * Axis-aligned bounding box — used for non-overlap checks in the generator
 * and as a public shape summary for downstream assertions.
 */
export interface Bounds {
  x: number;
  y: number;
  w: number;
  h: number;
}
