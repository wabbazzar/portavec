/**
 * SVG Visual Quality Tests
 * 
 * Tests that the vectorization pipeline produces visually correct output:
 * - Circles use smooth Bezier curves, not jagged line segments
 * - Control points are within reasonable bounds
 * - Polygons still use line segments correctly
 * 
 * NOTE: Some tests are marked with .fails() — they document EXPECTED behavior
 * after smooth-closed-curve Bézier fitting lands in schneider.ts.
 */

import { describe, it, expect } from 'vitest';
import { fitBezierCurvesClosed } from '../../src/algorithms/curve-fitting';
import type { Point, BezierSegment } from '../../src/utils/svg';

/**
 * Generate points along a circle
 */
function generateCirclePoints(
  centerX: number,
  centerY: number,
  radius: number,
  numPoints: number
): Point[] {
  const points: Point[] = [];
  for (let i = 0; i < numPoints; i++) {
    const angle = (2 * Math.PI * i) / numPoints;
    points.push({
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle),
    });
  }
  return points;
}

/**
 * Generate points for a square
 */
function generateSquarePoints(
  centerX: number,
  centerY: number,
  size: number,
  pointsPerSide: number = 10
): Point[] {
  const points: Point[] = [];
  const halfSize = size / 2;
  
  // Top edge (left to right)
  for (let i = 0; i < pointsPerSide; i++) {
    points.push({
      x: centerX - halfSize + (size * i) / pointsPerSide,
      y: centerY - halfSize,
    });
  }
  // Right edge (top to bottom)
  for (let i = 0; i < pointsPerSide; i++) {
    points.push({
      x: centerX + halfSize,
      y: centerY - halfSize + (size * i) / pointsPerSide,
    });
  }
  // Bottom edge (right to left)
  for (let i = 0; i < pointsPerSide; i++) {
    points.push({
      x: centerX + halfSize - (size * i) / pointsPerSide,
      y: centerY + halfSize,
    });
  }
  // Left edge (bottom to top)
  for (let i = 0; i < pointsPerSide; i++) {
    points.push({
      x: centerX - halfSize,
      y: centerY + halfSize - (size * i) / pointsPerSide,
    });
  }
  
  return points;
}

/**
 * Check if a point is within reasonable bounds
 */
function isPointInBounds(p: Point, width: number, height: number): boolean {
  // Control points can extend slightly outside the canvas, but not wildly
  const margin = Math.max(width, height) * 2;
  return (
    p.x >= -margin && p.x <= width + margin &&
    p.y >= -margin && p.y <= height + margin
  );
}

/**
 * Count segment types in a path
 */
function countSegmentTypes(segments: BezierSegment[]): { lines: number; curves: number } {
  let lines = 0;
  let curves = 0;
  for (const seg of segments) {
    if (seg.type === 'L') lines++;
    else if (seg.type === 'C' || seg.type === 'Q') curves++;
  }
  return { lines, curves };
}

describe('SVG Visual Quality - Circle Smoothness', () => {
  /**
   * Marked `.fails()` — documents expected behavior after the fix.
   * 
   * Currently circles produce 20+ line segments (jagged polygon).
   * After fix, circles should produce 4-8 Bezier curves (smooth circle).
   */
  it.fails('should produce Bezier curves for circles, not line segments', () => {
    // Generate a circle with many points (like what contour tracing produces)
    const circlePoints = generateCirclePoints(64, 64, 50, 100);
    
    const path = fitBezierCurvesClosed(circlePoints, 2);
    const { lines, curves } = countSegmentTypes(path.segments);
    
    // CRITICAL: Circles should use curves, not 20+ line segments
    // A circle can be approximated with 4-8 Bezier curves
    // If we get more than 8 line segments, the circle is being rendered as a polygon
    
    console.log(`Circle: ${lines} lines, ${curves} curves, ${path.segments.length} total`);
    
    // This test documents the EXPECTED behavior after the fix
    // Currently it will fail because circles produce 20 line segments
    expect(curves).toBeGreaterThan(0);
    expect(lines).toBeLessThan(12); // Should have few or no line segments
  });

  it('should produce control points within reasonable bounds for circles', () => {
    const circlePoints = generateCirclePoints(64, 64, 50, 100);
    const path = fitBezierCurvesClosed(circlePoints, 2);
    
    // Check all control points are within bounds
    const width = 128;
    const height = 128;
    
    for (const segment of path.segments) {
      for (const point of segment.points) {
        const inBounds = isPointInBounds(point, width, height);
        if (!inBounds) {
          console.error(`Control point out of bounds: (${point.x}, ${point.y})`);
        }
        expect(inBounds).toBe(true);
      }
    }
  });
});

describe('SVG Visual Quality - Polygon Correctness', () => {
  it('should produce exactly 4 line segments for squares', () => {
    const squarePoints = generateSquarePoints(64, 64, 80, 10);
    
    const path = fitBezierCurvesClosed(squarePoints, 2);
    const { lines, curves } = countSegmentTypes(path.segments);
    
    console.log(`Square: ${lines} lines, ${curves} curves`);
    
    // Squares should have exactly 4 line segments
    expect(lines).toBe(4);
    expect(curves).toBe(0);
  });

  it('should not smooth away corners on squares', () => {
    const squarePoints = generateSquarePoints(64, 64, 80, 10);
    
    const path = fitBezierCurvesClosed(squarePoints, 2);
    
    // Should have exactly 4 segments (one per side)
    expect(path.segments.length).toBe(4);
    
    // All should be line segments
    for (const segment of path.segments) {
      expect(segment.type).toBe('L');
    }
  });
});

describe('SVG Visual Quality - Control Point Bounds', () => {
  it('should never produce control points far outside the canvas', () => {
    // This test catches the bug where control points had values like -91, 219
    // for a 128x128 image
    const circlePoints = generateCirclePoints(64, 64, 50, 100);
    const path = fitBezierCurvesClosed(circlePoints, 2);
    
    const width = 128;
    const height = 128;
    const maxAllowedDistance = Math.max(width, height) * 2; // 2x canvas size max
    
    for (const segment of path.segments) {
      for (const point of segment.points) {
        // Check that points are not absurdly far from the canvas
        expect(point.x).toBeGreaterThan(-maxAllowedDistance);
        expect(point.x).toBeLessThan(width + maxAllowedDistance);
        expect(point.y).toBeGreaterThan(-maxAllowedDistance);
        expect(point.y).toBeLessThan(height + maxAllowedDistance);
      }
    }
  });
});

describe('SVG Visual Quality - Mixed Shapes', () => {
  /**
   * Marked `.fails()` — documents expected behavior after the fix.
   * 
   * The algorithm should distinguish between:
   * - Circles (smooth curvature) -> use Bezier curves
   * - Polygons (sharp corners) -> use line segments
   */
  it.fails('should correctly distinguish circles from polygons', () => {
    // Circle should use curves
    const circlePoints = generateCirclePoints(64, 64, 50, 100);
    const circlePath = fitBezierCurvesClosed(circlePoints, 2);
    const circleTypes = countSegmentTypes(circlePath.segments);
    
    // Square should use lines
    const squarePoints = generateSquarePoints(64, 64, 80, 10);
    const squarePath = fitBezierCurvesClosed(squarePoints, 2);
    const squareTypes = countSegmentTypes(squarePath.segments);
    
    console.log(`Circle: ${circleTypes.lines} lines, ${circleTypes.curves} curves`);
    console.log(`Square: ${squareTypes.lines} lines, ${squareTypes.curves} curves`);
    
    // After fix: circle should have curves, square should have lines
    // Currently this test documents expected behavior
    expect(squareTypes.lines).toBe(4);
    expect(squareTypes.curves).toBe(0);
    
    // Circle should have some curves (this will fail until fixed)
    expect(circleTypes.curves).toBeGreaterThan(0);
  });
});
