/**
 * Otsu's Automatic Thresholding Method
 *
 * Automatically determines the optimal binary threshold by maximizing
 * the between-class variance of the bimodal histogram.
 *
 * Algorithm:
 * 1. Compute histogram of grayscale image
 * 2. For each possible threshold t (0-255):
 *    - Compute class probabilities (foreground/background)
 *    - Compute class means
 *    - Compute between-class variance: σ²_B = w0 * w1 * (μ0 - μ1)²
 * 3. Select threshold that maximizes between-class variance
 *
 * Complexity: O(n) where n = pixel count (single pass for histogram)
 *
 * Reference: Otsu, N. (1979). "A Threshold Selection Method from
 * Gray-Level Histograms." IEEE Trans. SMC.
 */

import { toGrayscale } from '../../utils/canvas';

/**
 * Compute histogram of grayscale values (0-255)
 */
function computeHistogram(gray: Uint8ClampedArray): Uint32Array {
  const histogram = new Uint32Array(256);
  for (let i = 0; i < gray.length; i++) {
    const value = gray[i];
    if (value !== undefined) {
      const idx = histogram[value];
      if (idx !== undefined) {
        histogram[value] = idx + 1;
      }
    }
  }
  return histogram;
}

/**
 * Find optimal threshold using Otsu's method
 * Returns the threshold value (0-255)
 */
export function findOtsuThreshold(imageData: ImageData): number {
  const gray = toGrayscale(imageData);
  const histogram = computeHistogram(gray);
  const totalPixels = gray.length;

  // Compute total mean
  let totalSum = 0;
  for (let i = 0; i < 256; i++) {
    totalSum += i * histogram[i]!;
  }

  let sumB = 0;        // Sum of intensities in background
  let wB = 0;          // Weight (pixel count) of background
  let maxVariance = 0;
  let threshold = 0;

  for (let t = 0; t < 256; t++) {
    wB += histogram[t]!;  // Background weight
    if (wB === 0) continue;

    const wF = totalPixels - wB;  // Foreground weight
    if (wF === 0) break;

    sumB += t * histogram[t]!;

    const meanB = sumB / wB;                    // Background mean
    const meanF = (totalSum - sumB) / wF;       // Foreground mean

    // Between-class variance: σ²_B = w0 * w1 * (μ0 - μ1)²
    const variance = wB * wF * (meanB - meanF) ** 2;

    if (variance > maxVariance) {
      maxVariance = variance;
      threshold = t;
    }
  }

  return threshold;
}

/**
 * Apply Otsu's threshold to an image
 * Returns binary image where foreground = 255, background = 0
 */
export function applyOtsuThreshold(imageData: ImageData): {
  binary: Uint8ClampedArray;
  threshold: number;
} {
  const threshold = findOtsuThreshold(imageData);
  const gray = toGrayscale(imageData);
  const binary = new Uint8ClampedArray(gray.length);

  for (let i = 0; i < gray.length; i++) {
    // Pixels <= threshold become foreground (255), others background (0)
    // This convention: dark pixels (like text) become foreground
    binary[i] = gray[i]! <= threshold ? 255 : 0;
  }

  return { binary, threshold };
}

/**
 * Apply a manual threshold to a grayscale image
 * Useful when user wants to override Otsu's automatic selection
 */
export function applyManualThreshold(
  imageData: ImageData,
  threshold: number
): Uint8ClampedArray {
  const gray = toGrayscale(imageData);
  const binary = new Uint8ClampedArray(gray.length);

  for (let i = 0; i < gray.length; i++) {
    binary[i] = gray[i]! <= threshold ? 255 : 0;
  }

  return binary;
}
