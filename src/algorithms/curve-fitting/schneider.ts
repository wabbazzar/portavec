/**
 * Schneider's Algorithm for Bézier Curve Fitting
 *
 * Fits cubic Bézier curves to a sequence of points, producing smooth,
 * compact vector representations ideal for SVG output.
 *
 * Algorithm:
 * 1. Estimate tangent directions at endpoints
 * 2. Use Newton-Raphson iteration to fit a cubic Bézier
 * 3. If error > tolerance, split at maximum error point
 * 4. Recursively fit each segment
 *
 * The result is a chain of G1-continuous Bézier curves (tangent continuity
 * at join points).
 *
 * Reference: Schneider, P. (1990). "An Algorithm for Automatically Fitting
 * Digitized Curves." Graphics Gems I.
 */

import type { Point, BezierSegment, BezierPath } from '../../utils/svg';
import { douglasPeuckerClosed, douglasPeucker } from './douglas-peucker';

/**
 * Vector operations
 */
function add(a: Point, b: Point): Point {
  return { x: a.x + b.x, y: a.y + b.y };
}

function subtract(a: Point, b: Point): Point {
  return { x: a.x - b.x, y: a.y - b.y };
}

function scale(v: Point, s: number): Point {
  return { x: v.x * s, y: v.y * s };
}

function dot(a: Point, b: Point): number {
  return a.x * b.x + a.y * b.y;
}

function length(v: Point): number {
  return Math.sqrt(v.x * v.x + v.y * v.y);
}

function normalize(v: Point): Point {
  const len = length(v);
  if (len === 0) return { x: 0, y: 0 };
  return { x: v.x / len, y: v.y / len };
}

function negate(v: Point): Point {
  return { x: -v.x, y: -v.y };
}

/**
 * Compute cross product (z-component of 3D cross product with z=0)
 * Used for collinearity detection
 */
function cross(a: Point, b: Point): number {
  return a.x * b.y - a.y * b.x;
}

/**
 * Check if three points are collinear (lie on the same line)
 * Uses cross product - if ~0, points are collinear
 */
function areCollinear(p1: Point, p2: Point, p3: Point, tolerance: number = 1.0): boolean {
  const v1 = subtract(p2, p1);
  const v2 = subtract(p3, p1);
  const crossProduct = cross(v1, v2);
  return Math.abs(crossProduct) < tolerance;
}

/**
 * Check if all points in a range are collinear with the line from first to last
 */
function isSegmentCollinear(points: Point[], startIdx: number, endIdx: number, tolerance: number = 1.0): boolean {
  if (endIdx - startIdx < 2) return true;

  const first = points[startIdx]!;
  const last = points[endIdx]!;

  for (let i = startIdx + 1; i < endIdx; i++) {
    if (!areCollinear(first, points[i]!, last, tolerance)) {
      return false;
    }
  }
  return true;
}

/**
 * Check if a point is a corner (significant direction change)
 * Returns true if the angle between incoming and outgoing vectors
 * deviates significantly from 180 degrees (a straight line)
 */
function isCorner(p1: Point, p2: Point, p3: Point, angleThreshold: number = 30): boolean {
  const v1 = subtract(p2, p1);
  const v2 = subtract(p3, p2);

  const len1 = length(v1);
  const len2 = length(v2);

  if (len1 < 1e-6 || len2 < 1e-6) return false;

  const cosAngle = dot(v1, v2) / (len1 * len2);
  // Clamp to [-1, 1] to handle floating point errors
  const clampedCos = Math.max(-1, Math.min(1, cosAngle));
  const angleDeg = Math.acos(clampedCos) * 180 / Math.PI;

  // If angle deviates from 180 (straight) by more than threshold, it's a corner
  return (180 - angleDeg) > angleThreshold;
}

/**
 * Find all corner indices in a contour
 */
function findCorners(points: Point[], angleThreshold: number = 30, closed: boolean = false): number[] {
  const corners: number[] = [0]; // Always start with first point

  const n = points.length;
  if (n < 3) return corners;

  for (let i = 1; i < n - 1; i++) {
    if (isCorner(points[i - 1]!, points[i]!, points[i + 1]!, angleThreshold)) {
      corners.push(i);
    }
  }

  // For closed contours, check if the last point is a corner
  if (closed && n >= 3) {
    // Check corner at last point (wrapping to first)
    if (isCorner(points[n - 2]!, points[n - 1]!, points[0]!, angleThreshold)) {
      corners.push(n - 1);
    }
    // Check corner at first point (wrapping from last)
    if (isCorner(points[n - 1]!, points[0]!, points[1]!, angleThreshold)) {
      // First point is already in corners, but mark that we should close properly
    }
  }

  // Always end with last point for open paths
  if (!closed && corners[corners.length - 1] !== n - 1) {
    corners.push(n - 1);
  }

  return corners;
}

/**
 * Compute chord-length parameterization
 */
function chordLengthParameterize(points: Point[]): number[] {
  const u = [0];
  for (let i = 1; i < points.length; i++) {
    const dx = points[i]!.x - points[i - 1]!.x;
    const dy = points[i]!.y - points[i - 1]!.y;
    u.push(u[i - 1]! + Math.sqrt(dx * dx + dy * dy));
  }
  // Normalize to [0, 1]
  const total = u[u.length - 1]!;
  if (total > 0) {
    for (let i = 0; i < u.length; i++) {
      u[i] = u[i]! / total;
    }
  }
  return u;
}

/**
 * Evaluate cubic Bézier at parameter t
 * B(t) = (1-t)³P0 + 3(1-t)²tP1 + 3(1-t)t²P2 + t³P3
 */
function evaluateBezier(
  p0: Point,
  p1: Point,
  p2: Point,
  p3: Point,
  t: number
): Point {
  const t2 = t * t;
  const t3 = t2 * t;
  const mt = 1 - t;
  const mt2 = mt * mt;
  const mt3 = mt2 * mt;

  return {
    x: mt3 * p0.x + 3 * mt2 * t * p1.x + 3 * mt * t2 * p2.x + t3 * p3.x,
    y: mt3 * p0.y + 3 * mt2 * t * p1.y + 3 * mt * t2 * p2.y + t3 * p3.y,
  };
}

/**
 * Compute B(i, n, t) - Bernstein polynomial
 */
function B0(t: number): number {
  const mt = 1 - t;
  return mt * mt * mt;
}

function B1(t: number): number {
  const mt = 1 - t;
  return 3 * mt * mt * t;
}

function B2(t: number): number {
  const mt = 1 - t;
  return 3 * mt * t * t;
}

function B3(t: number): number {
  return t * t * t;
}

/**
 * Generate control points for a cubic Bézier curve
 * using the method from Graphics Gems
 */
function generateBezier(
  points: Point[],
  firstIndex: number,
  lastIndex: number,
  u: number[],
  tHat1: Point,
  tHat2: Point
): [Point, Point, Point, Point] {
  const first = points[firstIndex]!;
  const last = points[lastIndex]!;

  // Compute the A matrix elements
  const A: [Point, Point][] = [];
  for (let i = firstIndex; i <= lastIndex; i++) {
    const ui = u[i - firstIndex]!;
    A.push([
      scale(tHat1, B1(ui)),
      scale(tHat2, B2(ui)),
    ]);
  }

  // Create C and X matrices
  const C: [[number, number], [number, number]] = [[0, 0], [0, 0]];
  const X: [number, number] = [0, 0];

  for (let i = firstIndex; i <= lastIndex; i++) {
    const idx = i - firstIndex;
    const ui = u[idx]!;
    const ai = A[idx]!;

    C[0][0] += dot(ai[0], ai[0]);
    C[0][1] += dot(ai[0], ai[1]);
    C[1][0] = C[0][1];
    C[1][1] += dot(ai[1], ai[1]);

    const tmp = subtract(
      points[i]!,
      add(
        add(scale(first, B0(ui)), scale(first, B1(ui))),
        add(scale(last, B2(ui)), scale(last, B3(ui)))
      )
    );

    X[0] += dot(ai[0], tmp);
    X[1] += dot(ai[1], tmp);
  }

  // Compute determinants
  const detC0C1 = C[0][0] * C[1][1] - C[1][0] * C[0][1];
  const detC0X = C[0][0] * X[1] - C[1][0] * X[0];
  const detXC1 = X[0] * C[1][1] - X[1] * C[0][1];

  // Alpha values
  let alphaL: number, alphaR: number;
  if (Math.abs(detC0C1) < 1e-10) {
    // Use simple heuristic if matrix is singular
    const dist = length(subtract(last, first)) / 3;
    alphaL = dist;
    alphaR = dist;
  } else {
    alphaL = detXC1 / detC0C1;
    alphaR = detC0X / detC0C1;
  }

  // Check for negative alpha (control points in wrong direction)
  const segLength = length(subtract(last, first));
  const epsilon = 1e-6 * segLength;

  if (alphaL < epsilon || alphaR < epsilon) {
    // Fall back to simple heuristic
    const dist = segLength / 3;
    return [
      first,
      add(first, scale(tHat1, dist)),
      add(last, scale(tHat2, dist)),
      last,
    ];
  }

  return [
    first,
    add(first, scale(tHat1, alphaL)),
    add(last, scale(tHat2, alphaR)),
    last,
  ];
}

/**
 * Compute maximum error and the parameter where it occurs
 */
function computeMaxError(
  points: Point[],
  firstIndex: number,
  lastIndex: number,
  bezier: [Point, Point, Point, Point],
  u: number[]
): { maxError: number; splitPoint: number } {
  let maxError = 0;
  let splitPoint = Math.floor((lastIndex - firstIndex + 1) / 2) + firstIndex;

  for (let i = firstIndex + 1; i < lastIndex; i++) {
    const idx = i - firstIndex;
    const p = evaluateBezier(bezier[0], bezier[1], bezier[2], bezier[3], u[idx]!);
    const v = subtract(p, points[i]!);
    const dist = v.x * v.x + v.y * v.y;

    if (dist >= maxError) {
      maxError = dist;
      splitPoint = i;
    }
  }

  return { maxError: Math.sqrt(maxError), splitPoint };
}

/**
 * Estimate tangent at endpoint
 */
function computeLeftTangent(points: Point[], index: number): Point {
  const next = Math.min(index + 1, points.length - 1);
  return normalize(subtract(points[next]!, points[index]!));
}

function computeRightTangent(points: Point[], index: number): Point {
  const prev = Math.max(index - 1, 0);
  return normalize(subtract(points[prev]!, points[index]!));
}

function computeCenterTangent(points: Point[], index: number): Point {
  const prev = Math.max(index - 1, 0);
  const next = Math.min(index + 1, points.length - 1);
  const v1 = subtract(points[index]!, points[prev]!);
  const v2 = subtract(points[next]!, points[index]!);
  return normalize(add(v1, v2));
}

/**
 * Fit a sequence of Bézier curves to points
 * Now includes collinearity check to output line segments when appropriate
 */
function fitCubic(
  points: Point[],
  firstIndex: number,
  lastIndex: number,
  tHat1: Point,
  tHat2: Point,
  tolerance: number,
  segments: BezierSegment[],
  collinearTolerance: number = 1.0
): void {
  const nPts = lastIndex - firstIndex + 1;

  // Use simple line for 2 points
  if (nPts === 2) {
    segments.push({
      type: 'L',
      points: [points[lastIndex]!],
    });
    return;
  }

  // Check if all points are collinear - if so, use a line segment
  if (isSegmentCollinear(points, firstIndex, lastIndex, collinearTolerance)) {
    segments.push({
      type: 'L',
      points: [points[lastIndex]!],
    });
    return;
  }

  // Parameterize points
  const u = chordLengthParameterize(points.slice(firstIndex, lastIndex + 1));

  // Generate Bézier curve
  const bezier = generateBezier(points, firstIndex, lastIndex, u, tHat1, tHat2);

  // Compute max error
  const { maxError, splitPoint } = computeMaxError(
    points,
    firstIndex,
    lastIndex,
    bezier,
    u
  );

  // If error is within tolerance, accept this curve
  if (maxError < tolerance) {
    segments.push({
      type: 'C',
      points: [bezier[1], bezier[2], bezier[3]],
    });
    return;
  }

  // Error too large, split and fit recursively
  const tHatCenter = computeCenterTangent(points, splitPoint);

  fitCubic(points, firstIndex, splitPoint, tHat1, tHatCenter, tolerance, segments, collinearTolerance);
  fitCubic(points, splitPoint, lastIndex, negate(tHatCenter), tHat2, tolerance, segments, collinearTolerance);
}

/**
 * Options for curve fitting with line segment detection
 */
export interface CurveFitOptions {
  /** Maximum error tolerance for curve fitting (pixels) */
  tolerance: number;
  /** Angle threshold for corner detection (degrees) */
  cornerAngleThreshold?: number;
  /** Tolerance for collinearity detection */
  collinearTolerance?: number;
}

/**
 * Fit cubic Bézier curves to a sequence of points
 *
 * Strategy:
 * 1. Simplify points using Douglas-Peucker to remove pixel staircase artifacts
 * 2. Detect corners on simplified points
 * 3. For straight sections: output line segments
 * 4. For curved sections: fit Bézier curves
 *
 * @param points - Points to fit curves to
 * @param tolerance - Maximum allowed error (in pixels)
 * @param cornerAngleThreshold - Angle threshold for corner detection (default 30 degrees)
 * @param collinearTolerance - Tolerance for collinearity detection (default 1.0)
 * @returns BezierPath containing the fitted curves and line segments
 */
export function fitBezierCurves(
  points: Point[],
  tolerance: number,
  cornerAngleThreshold: number = 30,
  collinearTolerance: number = 1.0
): BezierPath {
  if (points.length === 0) {
    return { segments: [], closed: false };
  }

  if (points.length === 1) {
    return { segments: [], closed: false };
  }

  if (points.length === 2) {
    // Single line segment
    return {
      segments: [{
        type: 'L',
        points: [points[1]!],
      }],
      closed: false,
    };
  }

  // Step 1: Simplify using Douglas-Peucker to remove pixel artifacts
  const simplified = douglasPeucker(points, tolerance);

  if (simplified.length < 2) {
    return { segments: [], closed: false };
  }

  if (simplified.length === 2) {
    return {
      segments: [{
        type: 'L',
        points: [simplified[1]!],
      }],
      closed: false,
    };
  }

  const segments: BezierSegment[] = [];

  // Step 2: Find corners on simplified points
  const corners = findCorners(simplified, cornerAngleThreshold, false);

  // Step 3: Fit each segment between corners
  for (let i = 0; i < corners.length - 1; i++) {
    const startIdx = corners[i]!;
    const endIdx = corners[i + 1]!;

    if (endIdx <= startIdx) continue;

    const segmentPoints = simplified.slice(startIdx, endIdx + 1);

    // Check if this segment is collinear
    if (segmentPoints.length <= 2 ||
        isSegmentCollinear(segmentPoints, 0, segmentPoints.length - 1, collinearTolerance * 2)) {
      segments.push({
        type: 'L',
        points: [simplified[endIdx]!],
      });
    } else {
      // Fit Bézier curves to this segment
      const tHat1 = computeLeftTangent(segmentPoints, 0);
      const tHat2 = computeRightTangent(segmentPoints, segmentPoints.length - 1);
      fitCubic(segmentPoints, 0, segmentPoints.length - 1, tHat1, tHat2, tolerance, segments, collinearTolerance);
    }
  }

  return { segments, closed: false };
}

/**
 * Fit curves to a closed contour
 *
 * Strategy:
 * 1. Simplify points using Douglas-Peucker to remove pixel staircase artifacts
 * 2. Detect corners on simplified points
 * 3. For polygons: output line segments between corners
 * 4. For curves: fit Bézier curves
 */
export function fitBezierCurvesClosed(
  points: Point[],
  tolerance: number,
  cornerAngleThreshold: number = 30,
  collinearTolerance: number = 1.0
): BezierPath {
  if (points.length < 3) {
    return fitBezierCurves(points, tolerance, cornerAngleThreshold, collinearTolerance);
  }

  // Step 1: Simplify using Douglas-Peucker to remove pixel artifacts
  // Use tolerance as the simplification threshold
  const simplified = douglasPeuckerClosed(points, tolerance);

  if (simplified.length < 3) {
    return fitBezierCurves(simplified, tolerance, cornerAngleThreshold, collinearTolerance);
  }

  const segments: BezierSegment[] = [];

  // Step 2: Find corners in simplified contour
  const corners = findCorners(simplified, cornerAngleThreshold, true);

  // Step 3: If no corners found (smooth curve like a circle), fit as curves
  if (corners.length <= 1) {
    // For smooth curves, use the original points for better quality
    const tHat = computeCenterTangent(points, 0);
    fitCubic(points, 0, points.length - 1, tHat, negate(tHat), tolerance, segments, collinearTolerance);
    return { segments, closed: true };
  }

  // Step 4: Fit each segment between corners
  // For polygonal shapes, all segments between corners should be straight lines
  for (let i = 0; i < corners.length; i++) {
    const startIdx = corners[i]!;
    const nextIdx = (i + 1) % corners.length;
    const endIdx = corners[nextIdx]!;

    const endPoint = simplified[endIdx]!;

    // Get the points in this segment
    let segmentPoints: Point[];
    if (endIdx > startIdx) {
      segmentPoints = simplified.slice(startIdx, endIdx + 1);
    } else {
      // Wrap around
      segmentPoints = [...simplified.slice(startIdx), ...simplified.slice(0, endIdx + 1)];
    }

    // Check if this segment is essentially collinear (straight line)
    if (segmentPoints.length <= 2 ||
        isSegmentCollinear(segmentPoints, 0, segmentPoints.length - 1, collinearTolerance * 2)) {
      // Output a line segment
      segments.push({
        type: 'L',
        points: [endPoint],
      });
    } else {
      // Not collinear, fit curves
      const tHat1 = computeLeftTangent(segmentPoints, 0);
      const tHat2 = computeRightTangent(segmentPoints, segmentPoints.length - 1);
      fitCubic(segmentPoints, 0, segmentPoints.length - 1, tHat1, tHat2, tolerance, segments, collinearTolerance);
    }
  }

  return { segments, closed: true };
}
