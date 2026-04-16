/**
 * Curve Fitting Module - Unified interface for curve fitting algorithms
 *
 * Provides point simplification (Douglas-Peucker) and Bézier curve fitting
 * (Schneider's algorithm) for converting contours to smooth SVG paths.
 */

export {
  douglasPeucker,
  douglasPeuckerClosed,
  compressionRatio,
  estimateTolerance,
} from './douglas-peucker';

export {
  fitBezierCurves,
  fitBezierCurvesClosed,
} from './schneider';

import type { Point, BezierPath, BezierSegment } from '../../utils/svg';
import { douglasPeucker, douglasPeuckerClosed } from './douglas-peucker';
import { fitBezierCurves, fitBezierCurvesClosed } from './schneider';

// Re-export types from svg module for convenience
export type { Point, BezierPath, BezierSegment } from '../../utils/svg';

export type CurveFitMethod = 'bezier' | 'polyline';

export interface CurveFitOptions {
  /** Fitting method: 'bezier' for smooth curves, 'polyline' for simplified lines */
  method: CurveFitMethod;
  /** Maximum error tolerance for curve fitting (in pixels) */
  tolerance: number;
  /** Whether the contour is closed (forms a loop) */
  closed?: boolean;
  /** Simplification tolerance for Douglas-Peucker (0 = no simplification) */
  simplifyTolerance?: number;
}

export interface CurveFitResult {
  /** The fitted path */
  path: BezierPath;
  /** Original point count */
  originalPointCount: number;
  /** Final point/control point count */
  finalPointCount: number;
  /** Compression ratio (final/original) */
  compressionRatio: number;
}

/**
 * Fit curves to a sequence of points
 *
 * @param points - Points to fit curves to
 * @param options - Curve fitting options
 * @returns Fitted path with metadata
 */
export function fitCurves(
  points: Point[],
  options: CurveFitOptions
): CurveFitResult {
  const {
    method,
    tolerance,
    closed = false,
    simplifyTolerance = 0,
  } = options;

  const originalPointCount = points.length;

  if (points.length < 2) {
    return {
      path: { segments: [], closed },
      originalPointCount,
      finalPointCount: 0,
      compressionRatio: 1,
    };
  }

  // Optionally simplify points first
  let workingPoints = points;
  if (simplifyTolerance > 0) {
    workingPoints = closed
      ? douglasPeuckerClosed(points, simplifyTolerance)
      : douglasPeucker(points, simplifyTolerance);
  }

  // Fit curves based on method
  let path: BezierPath;

  switch (method) {
    case 'bezier': {
      path = closed
        ? fitBezierCurvesClosed(workingPoints, tolerance)
        : fitBezierCurves(workingPoints, tolerance);
      break;
    }

    case 'polyline': {
      // For polyline, just use simplified points as line segments
      const simplified = closed
        ? douglasPeuckerClosed(workingPoints, tolerance)
        : douglasPeucker(workingPoints, tolerance);

      const segments: BezierSegment[] = [];
      for (let i = 1; i < simplified.length; i++) {
        segments.push({
          type: 'L',
          points: [simplified[i]!],
        });
      }

      path = { segments, closed };
      break;
    }

    default:
      throw new Error(`Unknown curve fit method: ${method}`);
  }

  // Count final points (including control points for bezier)
  let finalPointCount = 0;
  for (const segment of path.segments) {
    finalPointCount += segment.points.length;
  }

  return {
    path,
    originalPointCount,
    finalPointCount,
    compressionRatio: originalPointCount > 0 ? finalPointCount / originalPointCount : 1,
  };
}

/**
 * Convert a path to SVG path data string
 *
 * @param path - The bezier path to convert
 * @param startPoint - Starting point for the path
 * @returns SVG path data string
 */
export function pathToSvgData(path: BezierPath, startPoint: Point): string {
  if (path.segments.length === 0) {
    return '';
  }

  let d = `M ${startPoint.x} ${startPoint.y}`;

  for (const segment of path.segments) {
    switch (segment.type) {
      case 'L':
        d += ` L ${segment.points[0]!.x} ${segment.points[0]!.y}`;
        break;
      case 'C':
        d += ` C ${segment.points[0]!.x} ${segment.points[0]!.y} ${segment.points[1]!.x} ${segment.points[1]!.y} ${segment.points[2]!.x} ${segment.points[2]!.y}`;
        break;
    }
  }

  if (path.closed) {
    d += ' Z';
  }

  return d;
}

/**
 * Calculate the approximate arc length of a path
 *
 * @param path - The bezier path
 * @param startPoint - Starting point
 * @param samplesPerSegment - Number of samples per curve segment (default: 10)
 * @returns Approximate arc length in pixels
 */
export function pathArcLength(
  path: BezierPath,
  startPoint: Point,
  samplesPerSegment: number = 10
): number {
  let length = 0;
  let currentPoint = startPoint;

  for (const segment of path.segments) {
    switch (segment.type) {
      case 'L': {
        const endPoint = segment.points[0]!;
        const dx = endPoint.x - currentPoint.x;
        const dy = endPoint.y - currentPoint.y;
        length += Math.sqrt(dx * dx + dy * dy);
        currentPoint = endPoint;
        break;
      }

      case 'C': {
        // Approximate cubic bezier arc length by sampling
        const cp1 = segment.points[0]!;
        const cp2 = segment.points[1]!;
        const endPoint = segment.points[2]!;
        let prevPoint = currentPoint;

        for (let i = 1; i <= samplesPerSegment; i++) {
          const t = i / samplesPerSegment;
          const mt = 1 - t;
          const mt2 = mt * mt;
          const mt3 = mt2 * mt;
          const t2 = t * t;
          const t3 = t2 * t;

          const x = mt3 * currentPoint.x + 3 * mt2 * t * cp1.x + 3 * mt * t2 * cp2.x + t3 * endPoint.x;
          const y = mt3 * currentPoint.y + 3 * mt2 * t * cp1.y + 3 * mt * t2 * cp2.y + t3 * endPoint.y;
          const dx = x - prevPoint.x;
          const dy = y - prevPoint.y;
          length += Math.sqrt(dx * dx + dy * dy);
          prevPoint = { x, y };
        }

        currentPoint = endPoint;
        break;
      }
    }
  }

  return length;
}
