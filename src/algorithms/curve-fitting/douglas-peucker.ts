/**
 * Douglas-Peucker Algorithm for Polyline Simplification
 *
 * Reduces the number of points in a polyline while preserving its shape.
 * Works by recursively finding the point with maximum distance from the
 * line segment between endpoints, keeping points that exceed a tolerance.
 *
 * Algorithm:
 * 1. Connect first and last points with a line
 * 2. Find the point with maximum perpendicular distance from this line
 * 3. If distance > tolerance, recursively simplify each half
 * 4. Otherwise, remove all intermediate points
 *
 * Complexity: O(n²) worst case, O(n log n) typical
 *
 * Reference: Douglas & Peucker (1973). "Algorithms for the reduction of
 * the number of points required to represent a digitized line."
 */

import type { Point } from '../../utils/svg';

/**
 * Calculate perpendicular distance from a point to a line segment
 */
function perpendicularDistance(
  point: Point,
  lineStart: Point,
  lineEnd: Point
): number {
  const dx = lineEnd.x - lineStart.x;
  const dy = lineEnd.y - lineStart.y;

  // Handle degenerate case where line is a point
  const lineLengthSq = dx * dx + dy * dy;
  if (lineLengthSq === 0) {
    const pdx = point.x - lineStart.x;
    const pdy = point.y - lineStart.y;
    return Math.sqrt(pdx * pdx + pdy * pdy);
  }

  // Calculate perpendicular distance using cross product formula
  // |AB × AC| / |AB|
  const numerator = Math.abs(
    dy * point.x - dx * point.y + lineEnd.x * lineStart.y - lineEnd.y * lineStart.x
  );
  const denominator = Math.sqrt(lineLengthSq);

  return numerator / denominator;
}

/**
 * Recursive Douglas-Peucker implementation
 */
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

  // Find point with maximum distance
  for (let i = startIndex + 1; i < endIndex; i++) {
    const distance = perpendicularDistance(points[i]!, lineStart, lineEnd);
    if (distance > maxDistance) {
      maxDistance = distance;
      maxIndex = i;
    }
  }

  // If max distance exceeds tolerance, keep this point and recurse
  if (maxDistance > tolerance) {
    keepIndices.add(maxIndex);
    douglasPeuckerRecursive(points, startIndex, maxIndex, tolerance, keepIndices);
    douglasPeuckerRecursive(points, maxIndex, endIndex, tolerance, keepIndices);
  }
}

/**
 * Simplify a polyline using the Douglas-Peucker algorithm
 *
 * @param points - Array of points to simplify
 * @param tolerance - Maximum allowed deviation from original path (in pixels)
 * @returns Simplified array of points
 */
export function douglasPeucker(points: Point[], tolerance: number): Point[] {
  if (points.length <= 2) {
    return [...points];
  }

  // Always keep first and last points
  const keepIndices = new Set<number>([0, points.length - 1]);

  // Find all points to keep
  douglasPeuckerRecursive(points, 0, points.length - 1, tolerance, keepIndices);

  // Build result array maintaining order
  const sortedIndices = Array.from(keepIndices).sort((a, b) => a - b);
  return sortedIndices.map((i) => points[i]!);
}

/**
 * Simplify a closed contour (polygon) using Douglas-Peucker
 * For closed contours, we need special handling to avoid creating gaps
 */
export function douglasPeuckerClosed(points: Point[], tolerance: number): Point[] {
  if (points.length <= 3) {
    return [...points];
  }

  // For closed contours, we try simplification from different starting points
  // and pick the best result (one that preserves the shape best)

  // Simple approach: treat as open polyline with first point duplicated
  const extended = [...points, points[0]!];
  const simplified = douglasPeucker(extended, tolerance);

  // Remove the duplicate last point if it's the same as first
  if (simplified.length > 1) {
    const first = simplified[0]!;
    const last = simplified[simplified.length - 1]!;
    if (first.x === last.x && first.y === last.y) {
      simplified.pop();
    }
  }

  return simplified;
}

/**
 * Calculate the compression ratio achieved by simplification
 */
export function compressionRatio(originalCount: number, simplifiedCount: number): number {
  if (originalCount === 0) return 1;
  return simplifiedCount / originalCount;
}

/**
 * Estimate optimal tolerance based on polyline characteristics
 * Uses the average segment length as a baseline
 */
export function estimateTolerance(points: Point[], factor: number = 0.5): number {
  if (points.length < 2) return 1;

  let totalLength = 0;
  for (let i = 1; i < points.length; i++) {
    const dx = points[i]!.x - points[i - 1]!.x;
    const dy = points[i]!.y - points[i - 1]!.y;
    totalLength += Math.sqrt(dx * dx + dy * dy);
  }

  const avgSegmentLength = totalLength / (points.length - 1);
  return avgSegmentLength * factor;
}
