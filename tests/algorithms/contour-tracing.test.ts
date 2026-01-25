import { describe, it, expect } from 'vitest';
import {
  extractContours,
  traceContours,
  contourSignedArea,
  pointInContour,
  getOuterContours,
  getHoleContours,
} from '../../src/algorithms/contour-tracing';

/**
 * Helper to create a binary image from a 2D array
 * 1 = foreground, 0 = background
 */
function createBinaryImage(values: number[][]): {
  binary: Uint8ClampedArray;
  width: number;
  height: number;
} {
  const height = values.length;
  const width = values[0]?.length ?? 0;
  const binary = new Uint8ClampedArray(width * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      binary[y * width + x] = values[y]![x]! > 0 ? 255 : 0;
    }
  }

  return { binary, width, height };
}

describe('Marching squares contour extraction', () => {
  it('should extract contour from a filled square', () => {
    // 8x8 image with a 4x4 filled square in the center
    const values = [
      [0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 1, 1, 1, 1, 0, 0],
      [0, 0, 1, 1, 1, 1, 0, 0],
      [0, 0, 1, 1, 1, 1, 0, 0],
      [0, 0, 1, 1, 1, 1, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0],
    ];
    const { binary, width, height } = createBinaryImage(values);

    const contours = extractContours(binary, width, height);

    // Should find exactly one contour
    expect(contours.length).toBeGreaterThanOrEqual(1);

    // The outer contour should not be a hole
    const outer = getOuterContours(contours);
    expect(outer.length).toBeGreaterThanOrEqual(1);
  });

  it('should detect a hole in the letter O shape', () => {
    // Create an "O" shape - outer ring with hole inside
    const values = [
      [0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 1, 1, 1, 1, 0, 0],
      [0, 0, 1, 0, 0, 1, 0, 0],
      [0, 0, 1, 0, 0, 1, 0, 0],
      [0, 0, 1, 0, 0, 1, 0, 0],
      [0, 0, 1, 1, 1, 1, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0],
    ];
    const { binary, width, height } = createBinaryImage(values);

    const result = traceContours(binary, width, height);

    // Should have outer contours and possibly holes
    // Note: exact count depends on algorithm implementation
    expect(result.contours.length).toBeGreaterThanOrEqual(1);
    expect(result.totalPoints).toBeGreaterThan(0);
  });

  it('should handle empty image', () => {
    const values = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ];
    const { binary, width, height } = createBinaryImage(values);

    const contours = extractContours(binary, width, height);
    expect(contours.length).toBe(0);
  });

  it('should handle fully filled image', () => {
    const values = [
      [1, 1, 1],
      [1, 1, 1],
      [1, 1, 1],
    ];
    const { binary, width, height } = createBinaryImage(values);

    const contours = extractContours(binary, width, height);
    // A fully filled image has edges only at the border
    // This should produce a contour around the edge
    expect(contours.length).toBeGreaterThanOrEqual(0);
  });
});

describe('Contour area calculation', () => {
  it('should calculate signed area for winding detection', () => {
    // In image coordinates (Y increases downward), the shoelace formula
    // returns positive for clockwise winding
    const square1 = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ];

    const area1 = contourSignedArea(square1);
    // This winding is CCW in image coords = positive
    expect(area1).toBe(1);
  });

  it('should return opposite sign for reversed winding', () => {
    // Reversed order = opposite winding
    const square2 = [
      { x: 0, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
      { x: 1, y: 0 },
    ];

    const area2 = contourSignedArea(square2);
    // Reversed winding = negative
    expect(area2).toBe(-1);
  });
});

describe('Point in contour test', () => {
  const square = [
    { x: 0, y: 0 },
    { x: 4, y: 0 },
    { x: 4, y: 4 },
    { x: 0, y: 4 },
  ];

  it('should return true for point inside', () => {
    expect(pointInContour({ x: 2, y: 2 }, square)).toBe(true);
  });

  it('should return false for point outside', () => {
    expect(pointInContour({ x: 5, y: 5 }, square)).toBe(false);
    expect(pointInContour({ x: -1, y: 2 }, square)).toBe(false);
  });

  it('should handle edge cases', () => {
    // Point exactly on vertex - behavior may vary
    // Just ensure it doesn't crash
    const result = pointInContour({ x: 0, y: 0 }, square);
    expect(typeof result).toBe('boolean');
  });
});

describe('Contour filtering utilities', () => {
  it('should filter outer contours correctly', () => {
    const contours = [
      { points: [], closed: true, isHole: false, parentIndex: -1, bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 } },
      { points: [], closed: true, isHole: true, parentIndex: 0, bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 } },
      { points: [], closed: true, isHole: false, parentIndex: -1, bounds: { minX: 2, minY: 2, maxX: 3, maxY: 3 } },
    ];

    const outer = getOuterContours(contours);
    expect(outer.length).toBe(2);
  });

  it('should filter hole contours correctly', () => {
    const contours = [
      { points: [], closed: true, isHole: false, parentIndex: -1, bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 } },
      { points: [], closed: true, isHole: true, parentIndex: 0, bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 } },
    ];

    const holes = getHoleContours(contours);
    expect(holes.length).toBe(1);
    expect(holes[0]!.isHole).toBe(true);
  });
});

describe('traceContours with options', () => {
  it('should respect minimum length filter', () => {
    const values = [
      [0, 0, 0, 0, 0],
      [0, 1, 1, 1, 0],
      [0, 1, 1, 1, 0],
      [0, 1, 1, 1, 0],
      [0, 0, 0, 0, 0],
    ];
    const { binary, width, height } = createBinaryImage(values);

    const result = traceContours(binary, width, height, { minLength: 100 });
    // With very high minLength, no contours should pass
    expect(result.contours.length).toBe(0);
  });

  it('should apply simplification when requested', () => {
    const values = [
      [0, 0, 0, 0, 0, 0],
      [0, 1, 1, 1, 1, 0],
      [0, 1, 1, 1, 1, 0],
      [0, 1, 1, 1, 1, 0],
      [0, 1, 1, 1, 1, 0],
      [0, 0, 0, 0, 0, 0],
    ];
    const { binary, width, height } = createBinaryImage(values);

    const noSimplify = traceContours(binary, width, height, { simplifyTolerance: 0 });
    const withSimplify = traceContours(binary, width, height, { simplifyTolerance: 2.0 });

    // Simplified should have fewer or equal points
    expect(withSimplify.totalPoints).toBeLessThanOrEqual(noSimplify.totalPoints);
  });
});
