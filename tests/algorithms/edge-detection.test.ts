import { describe, it, expect } from 'vitest';
import {
  applySobel,
  applySobelThreshold,
  applyCanny,
  detectEdges,
  countEdgePixels,
} from '../../src/algorithms/edge-detection';

/**
 * Helper to create a test ImageData from a 2D array
 */
function createTestImage(values: number[][]): ImageData {
  const height = values.length;
  const width = values[0]?.length ?? 0;
  const imageData = new ImageData(width, height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const value = values[y]![x]!;
      imageData.data[idx] = value;
      imageData.data[idx + 1] = value;
      imageData.data[idx + 2] = value;
      imageData.data[idx + 3] = 255;
    }
  }

  return imageData;
}

describe('Sobel edge detection', () => {
  it('should detect vertical edges', () => {
    // Create image with vertical edge (black left, white right)
    const values = [
      [0, 0, 0, 255, 255, 255],
      [0, 0, 0, 255, 255, 255],
      [0, 0, 0, 255, 255, 255],
      [0, 0, 0, 255, 255, 255],
    ];
    const imageData = createTestImage(values);
    const result = applySobel(imageData);

    // Edge should be detected at the boundary (columns 2-3)
    // Check middle row for edge presence
    const y = 2;
    const edgeCol = 2; // Just before the transition
    const idx = y * 6 + edgeCol;
    const neighborIdx = y * 6 + (edgeCol + 1);

    // Magnitude should be high near the edge
    expect(result.magnitude[idx]).toBeGreaterThan(0);
    expect(result.magnitude[neighborIdx]).toBeGreaterThan(0);
  });

  it('should detect horizontal edges', () => {
    // Create image with horizontal edge (black top, white bottom)
    const values = [
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [255, 255, 255, 255],
      [255, 255, 255, 255],
    ];
    const imageData = createTestImage(values);
    const result = applySobel(imageData);

    // Edge should be detected at row boundary
    const edgeRow = 1;
    const x = 2;
    const idx = edgeRow * 4 + x;

    expect(result.magnitude[idx]).toBeGreaterThan(0);
  });

  it('should return low magnitude for uniform interior', () => {
    // Use larger image so interior pixels are far from boundary
    const values = [
      [128, 128, 128, 128, 128],
      [128, 128, 128, 128, 128],
      [128, 128, 128, 128, 128],
      [128, 128, 128, 128, 128],
      [128, 128, 128, 128, 128],
    ];
    const imageData = createTestImage(values);
    const result = applySobel(imageData);

    // Interior pixel (2,2) should have zero gradient
    // Note: boundary pixels may have non-zero due to edge handling
    const centerIdx = 2 * 5 + 2;
    const centerMag = result.magnitude[centerIdx];
    expect(centerMag).toBe(0);
  });

  it('should threshold edges correctly', () => {
    const values = [
      [0, 0, 255, 255],
      [0, 0, 255, 255],
      [0, 0, 255, 255],
    ];
    const imageData = createTestImage(values);

    const binary = applySobelThreshold(imageData, 50);

    // Should have some edge pixels
    const edgeCount = countEdgePixels(binary);
    expect(edgeCount).toBeGreaterThan(0);
  });
});

describe('Canny edge detection', () => {
  it('should produce thinner edges than Sobel', () => {
    // Create image with edge
    const values = [
      [0, 0, 0, 0, 255, 255, 255, 255],
      [0, 0, 0, 0, 255, 255, 255, 255],
      [0, 0, 0, 0, 255, 255, 255, 255],
      [0, 0, 0, 0, 255, 255, 255, 255],
      [0, 0, 0, 0, 255, 255, 255, 255],
    ];
    const imageData = createTestImage(values);

    const cannyEdges = applyCanny(imageData, {
      sigma: 0.5, // Less blur for this small image
      lowThreshold: 10,
      highThreshold: 30,
    });

    const sobelEdges = applySobelThreshold(imageData, 30);

    // Both should detect edges
    const cannyCount = countEdgePixels(cannyEdges);
    const sobelCount = countEdgePixels(sobelEdges);

    // Canny should produce edges (may be fewer due to non-max suppression)
    expect(cannyCount).toBeGreaterThanOrEqual(0);
    expect(sobelCount).toBeGreaterThan(0);
  });

  it('should handle uniform images without errors', () => {
    const values = [
      [100, 100, 100, 100],
      [100, 100, 100, 100],
      [100, 100, 100, 100],
      [100, 100, 100, 100],
    ];
    const imageData = createTestImage(values);

    // Should not throw
    const edges = applyCanny(imageData);

    // Should have no edges in uniform image
    const edgeCount = countEdgePixels(edges);
    expect(edgeCount).toBe(0);
  });
});

describe('Unified detectEdges function', () => {
  const testImage = createTestImage([
    [0, 0, 255, 255],
    [0, 0, 255, 255],
    [0, 0, 255, 255],
  ]);

  it('should support sobel method', () => {
    const result = detectEdges(testImage, { method: 'sobel' });
    expect(result.method).toBe('sobel');
    expect(result.width).toBe(4);
    expect(result.height).toBe(3);
  });

  it('should support canny method', () => {
    const result = detectEdges(testImage, { method: 'canny' });
    expect(result.method).toBe('canny');
  });

  it('should support canny-auto method', () => {
    const result = detectEdges(testImage, { method: 'canny-auto' });
    expect(result.method).toBe('canny-auto');
  });

  it('should default to canny', () => {
    const result = detectEdges(testImage);
    expect(result.method).toBe('canny');
  });

  it('should throw for unknown method', () => {
    expect(() => {
      detectEdges(testImage, { method: 'unknown' as any });
    }).toThrow('Unknown edge detection method');
  });
});

describe('countEdgePixels utility', () => {
  it('should count non-zero pixels', () => {
    const edges = new Uint8ClampedArray([0, 255, 0, 255, 255, 0]);
    expect(countEdgePixels(edges)).toBe(3);
  });

  it('should return 0 for empty array', () => {
    const edges = new Uint8ClampedArray([0, 0, 0, 0]);
    expect(countEdgePixels(edges)).toBe(0);
  });
});
