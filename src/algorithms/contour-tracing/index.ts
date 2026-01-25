/**
 * Contour Tracing Module - Extract boundaries from binary images
 *
 * Provides algorithms for finding and classifying contours (boundaries)
 * in binary images, including hole detection and hierarchy tracking.
 */

export {
  extractContours,
  contourSignedArea,
  pointInContour,
  simplifyContour,
  type Contour,
} from './marching-squares';

export interface ContourTracingOptions {
  /** Minimum contour length in points (default: 3) */
  minLength?: number;
  /** Simplification tolerance in pixels (0 = no simplification, default: 0) */
  simplifyTolerance?: number;
}

export interface ContourTracingResult {
  /** All extracted contours */
  contours: import('./marching-squares').Contour[];
  /** Number of outer contours (non-holes) */
  outerCount: number;
  /** Number of hole contours */
  holeCount: number;
  /** Total number of points across all contours */
  totalPoints: number;
}

import { extractContours, simplifyContour, type Contour } from './marching-squares';

/**
 * Trace all contours in a binary image
 */
export function traceContours(
  binary: Uint8ClampedArray,
  width: number,
  height: number,
  options: ContourTracingOptions = {}
): ContourTracingResult {
  const { minLength = 3, simplifyTolerance = 0 } = options;

  // Extract raw contours
  let contours = extractContours(binary, width, height);

  // Filter by minimum length
  contours = contours.filter((c) => c.points.length >= minLength);

  // Apply simplification if requested
  if (simplifyTolerance > 0) {
    for (const contour of contours) {
      contour.points = simplifyContour(contour.points, simplifyTolerance);
    }
    // Filter again after simplification
    contours = contours.filter((c) => c.points.length >= minLength);
  }

  // Calculate statistics
  let outerCount = 0;
  let holeCount = 0;
  let totalPoints = 0;

  for (const contour of contours) {
    if (contour.isHole) {
      holeCount++;
    } else {
      outerCount++;
    }
    totalPoints += contour.points.length;
  }

  return {
    contours,
    outerCount,
    holeCount,
    totalPoints,
  };
}

/**
 * Get only outer contours (non-holes)
 */
export function getOuterContours(contours: Contour[]): Contour[] {
  return contours.filter((c) => !c.isHole);
}

/**
 * Get only hole contours
 */
export function getHoleContours(contours: Contour[]): Contour[] {
  return contours.filter((c) => c.isHole);
}

/**
 * Get contours that are children of a specific parent
 */
export function getChildContours(
  contours: Contour[],
  parentIndex: number
): Contour[] {
  return contours.filter((c) => c.parentIndex === parentIndex);
}

/**
 * Calculate the total perimeter of all contours
 */
export function calculateTotalPerimeter(contours: Contour[]): number {
  let total = 0;

  for (const contour of contours) {
    const { points } = contour;
    for (let i = 0; i < points.length; i++) {
      const curr = points[i]!;
      const next = points[(i + 1) % points.length]!;
      const dx = next.x - curr.x;
      const dy = next.y - curr.y;
      total += Math.sqrt(dx * dx + dy * dy);
    }
  }

  return total;
}

/**
 * Merge a contour with its holes into SVG-compatible path data
 * Uses even-odd fill rule where holes are correctly subtracted
 */
export function mergeContourWithHoles(
  outer: Contour,
  holes: Contour[]
): import('../../utils/svg').Point[][] {
  const paths: import('../../utils/svg').Point[][] = [outer.points];

  for (const hole of holes) {
    paths.push(hole.points);
  }

  return paths;
}
