import { describe, it, expect } from 'vitest';
import {
  findOtsuThreshold,
  applyOtsuThreshold,
  applyManualThreshold,
  applyAdaptiveThreshold,
  threshold,
} from '../../src/algorithms/threshold';

/**
 * Helper to create a simple test ImageData
 * Creates a grayscale image from a 2D array of values
 */
function createTestImage(values: number[][]): ImageData {
  const height = values.length;
  const width = values[0]?.length ?? 0;
  const imageData = new ImageData(width, height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const value = values[y]![x]!;
      imageData.data[idx] = value;     // R
      imageData.data[idx + 1] = value; // G
      imageData.data[idx + 2] = value; // B
      imageData.data[idx + 3] = 255;   // A
    }
  }

  return imageData;
}

describe('Otsu threshold', () => {
  it('should find threshold for bimodal histogram', () => {
    // Create image with spread of values to simulate real bimodal distribution
    // Dark cluster: 40-60, Light cluster: 180-220
    const values = [
      [40, 50, 60, 180, 200, 220],
      [45, 55, 55, 190, 210, 185],
    ];
    const imageData = createTestImage(values);

    const threshold = findOtsuThreshold(imageData);

    // Threshold should be between the two clusters
    expect(threshold).toBeGreaterThanOrEqual(60);
    expect(threshold).toBeLessThanOrEqual(180);
  });

  it('should return 0 for all-white image', () => {
    const values = [
      [255, 255],
      [255, 255],
    ];
    const imageData = createTestImage(values);

    const threshold = findOtsuThreshold(imageData);
    expect(threshold).toBe(0);
  });

  it('should binarize correctly with applyOtsuThreshold', () => {
    // Use spread values for realistic test
    const values = [
      [20, 25, 30, 200, 210, 220],
      [15, 35, 28, 195, 215, 205],
    ];
    const imageData = createTestImage(values);

    const { binary, threshold } = applyOtsuThreshold(imageData);

    // Dark pixels should become foreground (255)
    // Light pixels should become background (0)
    expect(binary[0]).toBe(255); // 20 -> foreground (dark)
    expect(binary[3]).toBe(0);   // 200 -> background (light)

    // Threshold should be between dark and light groups
    expect(threshold).toBeGreaterThanOrEqual(35);
    expect(threshold).toBeLessThanOrEqual(195);
  });
});

describe('Manual threshold', () => {
  it('should apply exact threshold value', () => {
    const values = [
      [100, 150],
      [200, 50],
    ];
    const imageData = createTestImage(values);

    const binary = applyManualThreshold(imageData, 125);

    // Values <= 125 become foreground (255)
    expect(binary[0]).toBe(255);  // 100 <= 125
    expect(binary[1]).toBe(0);    // 150 > 125
    expect(binary[2]).toBe(0);    // 200 > 125
    expect(binary[3]).toBe(255);  // 50 <= 125
  });

  it('should handle edge cases', () => {
    const values = [[0, 128, 255]];
    const imageData = createTestImage(values);

    // Threshold at 128 - value equal to threshold should be foreground
    const binary = applyManualThreshold(imageData, 128);
    expect(binary[0]).toBe(255);  // 0 <= 128
    expect(binary[1]).toBe(255);  // 128 <= 128
    expect(binary[2]).toBe(0);    // 255 > 128
  });
});

describe('Adaptive threshold', () => {
  it('should handle uniform regions', () => {
    // Create uniform image
    const values = [
      [100, 100, 100],
      [100, 100, 100],
      [100, 100, 100],
    ];
    const imageData = createTestImage(values);

    const binary = applyAdaptiveThreshold(imageData, {
      windowSize: 3,
      constant: 0,
    });

    // All pixels same as local mean, so all should be foreground
    // (100 <= 100 - 0)
    for (let i = 0; i < binary.length; i++) {
      expect(binary[i]).toBe(255);
    }
  });

  it('should detect local variations', () => {
    // Create image with local dark spot
    const values = [
      [200, 200, 200, 200, 200],
      [200, 200, 200, 200, 200],
      [200, 200, 50, 200, 200],  // Dark center
      [200, 200, 200, 200, 200],
      [200, 200, 200, 200, 200],
    ];
    const imageData = createTestImage(values);

    const binary = applyAdaptiveThreshold(imageData, {
      windowSize: 3,
      constant: 10,
    });

    // Center pixel (50) should be foreground (darker than local mean)
    const centerIdx = 2 * 5 + 2;
    expect(binary[centerIdx]).toBe(255);
  });
});

describe('Unified threshold function', () => {
  const testImage = createTestImage([
    [30, 30, 220, 220],
    [30, 30, 220, 220],
  ]);

  it('should use Otsu by default', () => {
    const result = threshold(testImage);
    expect(result.method).toBe('otsu');
    expect(result.threshold).toBeGreaterThan(0);
  });

  it('should support manual method', () => {
    const result = threshold(testImage, {
      method: 'manual',
      manualValue: 100,
    });
    expect(result.method).toBe('manual');
    expect(result.threshold).toBe(100);
  });

  it('should support adaptive method', () => {
    const result = threshold(testImage, {
      method: 'adaptive',
      windowSize: 3,
    });
    expect(result.method).toBe('adaptive');
    expect(result.threshold).toBe(-1); // Adaptive has no single threshold
  });

  it('should throw for unknown method', () => {
    expect(() => {
      threshold(testImage, { method: 'unknown' as any });
    }).toThrow('Unknown threshold method');
  });
});
