import { describe, it, expect } from 'vitest';
import {
  douglasPeucker,
  douglasPeuckerClosed,
  compressionRatio,
  estimateTolerance,
  fitBezierCurves,
  fitBezierCurvesClosed,
  fitCurves,
  pathToSvgData,
  pathArcLength,
} from '../../src/algorithms/curve-fitting';
import type { Point } from '../../src/utils/svg';

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
 * Generate points along an S-curve (sigmoid)
 */
function generateSCurvePoints(
  startX: number,
  startY: number,
  width: number,
  height: number,
  numPoints: number
): Point[] {
  const points: Point[] = [];
  for (let i = 0; i < numPoints; i++) {
    const t = i / (numPoints - 1);
    const x = startX + t * width;
    // Sigmoid function scaled to height
    const s = 1 / (1 + Math.exp(-10 * (t - 0.5)));
    const y = startY + s * height;
    points.push({ x, y });
  }
  return points;
}

/**
 * Generate a straight line of points
 */
function generateLinePoints(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  numPoints: number
): Point[] {
  const points: Point[] = [];
  for (let i = 0; i < numPoints; i++) {
    const t = i / (numPoints - 1);
    points.push({
      x: startX + t * (endX - startX),
      y: startY + t * (endY - startY),
    });
  }
  return points;
}

describe('Douglas-Peucker simplification', () => {
  it('should keep all points for straight line', () => {
    const points = generateLinePoints(0, 0, 100, 100, 10);
    const simplified = douglasPeucker(points, 1);

    // For a straight line, only endpoints are needed
    expect(simplified.length).toBe(2);
    expect(simplified[0]).toEqual({ x: 0, y: 0 });
    expect(simplified[simplified.length - 1]).toEqual({ x: 100, y: 100 });
  });

  it('should preserve corner points', () => {
    // L-shaped path with a corner
    const points: Point[] = [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 50 },
      { x: 100, y: 100 },
    ];

    const simplified = douglasPeucker(points, 1);

    // Should keep start, corner, and end
    expect(simplified.length).toBe(3);
    expect(simplified[0]).toEqual({ x: 0, y: 0 });
    expect(simplified[1]).toEqual({ x: 100, y: 0 });
    expect(simplified[2]).toEqual({ x: 100, y: 100 });
  });

  it('should handle empty and small arrays', () => {
    expect(douglasPeucker([], 1)).toEqual([]);
    expect(douglasPeucker([{ x: 0, y: 0 }], 1)).toEqual([{ x: 0, y: 0 }]);
    expect(douglasPeucker([{ x: 0, y: 0 }, { x: 1, y: 1 }], 1)).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ]);
  });

  it('should reduce circle points with tolerance', () => {
    const circle = generateCirclePoints(50, 50, 30, 100);
    const simplified = douglasPeucker(circle, 2);

    // Should significantly reduce point count while preserving shape
    expect(simplified.length).toBeLessThan(circle.length);
    expect(simplified.length).toBeGreaterThan(4); // At least a few points to approximate
  });

  it('should simplify closed contours', () => {
    const circle = generateCirclePoints(50, 50, 30, 100);
    const simplified = douglasPeuckerClosed(circle, 2);

    expect(simplified.length).toBeLessThan(circle.length);
    expect(simplified.length).toBeGreaterThanOrEqual(3);
  });
});

describe('Compression ratio calculation', () => {
  it('should calculate ratio correctly', () => {
    expect(compressionRatio(100, 50)).toBe(0.5);
    expect(compressionRatio(100, 100)).toBe(1);
    expect(compressionRatio(100, 10)).toBe(0.1);
  });

  it('should handle zero original count', () => {
    expect(compressionRatio(0, 0)).toBe(1);
  });
});

describe('Tolerance estimation', () => {
  it('should estimate tolerance based on segment length', () => {
    const points = generateLinePoints(0, 0, 100, 0, 11);
    // 10 segments of length 10 each
    const tolerance = estimateTolerance(points, 0.5);

    // Average segment length is 10, factor is 0.5, so tolerance should be 5
    expect(tolerance).toBeCloseTo(5, 1);
  });

  it('should handle edge cases', () => {
    expect(estimateTolerance([], 0.5)).toBe(1);
    expect(estimateTolerance([{ x: 0, y: 0 }], 0.5)).toBe(1);
  });
});

describe('Schneider Bézier curve fitting', () => {
  it('should fit a straight line as a simple curve', () => {
    const points = generateLinePoints(0, 0, 100, 100, 10);
    const path = fitBezierCurves(points, 1);

    expect(path.segments.length).toBeGreaterThanOrEqual(1);
    expect(path.closed).toBe(false);
  });

  it('should approximate a circle with curves or line segments', () => {
    const circle = generateCirclePoints(50, 50, 30, 50);
    const path = fitBezierCurvesClosed(circle, 2);

    expect(path.segments.length).toBeGreaterThanOrEqual(1);
    expect(path.closed).toBe(true);

    // After Douglas-Peucker simplification, circles become polygons
    // Each segment should be either line (L) or curve (C)
    for (const segment of path.segments) {
      expect(['L', 'C']).toContain(segment.type);
      // L segments have 1 point, C segments have 3 points
      if (segment.type === 'L') {
        expect(segment.points.length).toBe(1);
      } else {
        expect(segment.points.length).toBe(3);
      }
    }
  });

  it('should approximate an S-curve with Bézier curves', () => {
    const sCurve = generateSCurvePoints(0, 0, 100, 100, 50);
    const path = fitBezierCurves(sCurve, 2);

    expect(path.segments.length).toBeGreaterThanOrEqual(1);
    expect(path.closed).toBe(false);
  });

  it('should handle edge cases', () => {
    // Empty array
    const emptyPath = fitBezierCurves([], 1);
    expect(emptyPath.segments.length).toBe(0);

    // Single point
    const singlePath = fitBezierCurves([{ x: 0, y: 0 }], 1);
    expect(singlePath.segments.length).toBe(0);

    // Two points
    const twoPointPath = fitBezierCurves([{ x: 0, y: 0 }, { x: 100, y: 100 }], 1);
    expect(twoPointPath.segments.length).toBe(1);
    expect(twoPointPath.segments[0]!.type).toBe('L');
  });
});

describe('Unified curve fitting interface', () => {
  it('should fit bezier curves with simplification', () => {
    const circle = generateCirclePoints(50, 50, 30, 100);
    const result = fitCurves(circle, {
      method: 'bezier',
      tolerance: 2,
      closed: true,
      simplifyTolerance: 1,
    });

    expect(result.path.segments.length).toBeGreaterThanOrEqual(1);
    expect(result.path.closed).toBe(true);
    expect(result.originalPointCount).toBe(100);
    expect(result.compressionRatio).toBeLessThan(1);
  });

  it('should fit polylines', () => {
    const sCurve = generateSCurvePoints(0, 0, 100, 100, 50);
    const result = fitCurves(sCurve, {
      method: 'polyline',
      tolerance: 3,
      closed: false,
    });

    expect(result.path.segments.length).toBeGreaterThanOrEqual(1);
    expect(result.path.closed).toBe(false);

    // All segments should be line segments
    for (const segment of result.path.segments) {
      expect(segment.type).toBe('L');
    }
  });

  it('should handle empty input', () => {
    const result = fitCurves([], {
      method: 'bezier',
      tolerance: 1,
    });

    expect(result.path.segments.length).toBe(0);
    expect(result.originalPointCount).toBe(0);
    expect(result.compressionRatio).toBe(1);
  });
});

describe('SVG path data generation', () => {
  it('should generate valid SVG path for line segments', () => {
    const path = {
      segments: [
        { type: 'L' as const, points: [{ x: 100, y: 0 }] },
        { type: 'L' as const, points: [{ x: 100, y: 100 }] },
        { type: 'L' as const, points: [{ x: 0, y: 100 }] },
      ],
      closed: true,
    };

    const svgData = pathToSvgData(path, { x: 0, y: 0 });

    expect(svgData).toContain('M 0 0');
    expect(svgData).toContain('L 100 0');
    expect(svgData).toContain('L 100 100');
    expect(svgData).toContain('L 0 100');
    expect(svgData).toContain('Z');
  });

  it('should generate valid SVG path for cubic curves', () => {
    const path = {
      segments: [
        {
          type: 'C' as const,
          points: [
            { x: 20, y: 0 },
            { x: 80, y: 0 },
            { x: 100, y: 50 },
          ],
        },
      ],
      closed: false,
    };

    const svgData = pathToSvgData(path, { x: 0, y: 50 });

    expect(svgData).toContain('M 0 50');
    expect(svgData).toContain('C 20 0 80 0 100 50');
    expect(svgData).not.toContain('Z');
  });

  it('should handle empty path', () => {
    const path = { segments: [], closed: false };
    const svgData = pathToSvgData(path, { x: 0, y: 0 });
    expect(svgData).toBe('');
  });
});

describe('Path arc length calculation', () => {
  it('should calculate line segment length correctly', () => {
    const path = {
      segments: [{ type: 'L' as const, points: [{ x: 100, y: 0 }] }],
      closed: false,
    };

    const length = pathArcLength(path, { x: 0, y: 0 });
    expect(length).toBeCloseTo(100, 5);
  });

  it('should calculate multi-segment length correctly', () => {
    const path = {
      segments: [
        { type: 'L' as const, points: [{ x: 100, y: 0 }] },
        { type: 'L' as const, points: [{ x: 100, y: 100 }] },
      ],
      closed: false,
    };

    const length = pathArcLength(path, { x: 0, y: 0 });
    expect(length).toBeCloseTo(200, 5);
  });

  it('should approximate curve lengths reasonably', () => {
    // A quarter circle approximated by a cubic bezier
    const path = {
      segments: [
        {
          type: 'C' as const,
          points: [
            { x: 0, y: 55.2 }, // Control point 1 (magic number for circle approximation)
            { x: 44.8, y: 100 }, // Control point 2
            { x: 100, y: 100 }, // End point
          ],
        },
      ],
      closed: false,
    };

    const length = pathArcLength(path, { x: 0, y: 0 }, 100);
    // Quarter circle arc length should be approximately π * r / 2 ≈ 157 for r=100
    // This bezier approximates it, so we allow some tolerance
    expect(length).toBeGreaterThan(100);
    expect(length).toBeLessThan(200);
  });

  it('should handle empty path', () => {
    const path = { segments: [], closed: false };
    const length = pathArcLength(path, { x: 0, y: 0 });
    expect(length).toBe(0);
  });
});
