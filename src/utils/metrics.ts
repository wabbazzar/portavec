/**
 * Image quality metrics utilities
 */

import { toGrayscale } from './canvas';

/**
 * Calculate the Structural Similarity Index (SSIM) between two images
 * Returns a value between 0 and 1, where 1 means identical
 */
export function calculateSSIM(img1: ImageData, img2: ImageData): number {
  if (img1.width !== img2.width || img1.height !== img2.height) {
    throw new Error('Images must have the same dimensions');
  }

  // Constants for stability (from SSIM paper)
  const k1 = 0.01;
  const k2 = 0.03;
  const L = 255;  // Dynamic range
  const c1 = (k1 * L) ** 2;
  const c2 = (k2 * L) ** 2;

  // Convert to grayscale
  const gray1 = toGrayscale(img1);
  const gray2 = toGrayscale(img2);

  const n = gray1.length;

  // Calculate means
  let sum1 = 0;
  let sum2 = 0;
  for (let i = 0; i < n; i++) {
    sum1 += gray1[i]!;
    sum2 += gray2[i]!;
  }
  const mean1 = sum1 / n;
  const mean2 = sum2 / n;

  // Calculate variances and covariance
  let var1 = 0;
  let var2 = 0;
  let covar = 0;
  for (let i = 0; i < n; i++) {
    const diff1 = gray1[i]! - mean1;
    const diff2 = gray2[i]! - mean2;
    var1 += diff1 * diff1;
    var2 += diff2 * diff2;
    covar += diff1 * diff2;
  }
  var1 /= n;
  var2 /= n;
  covar /= n;

  // SSIM formula
  const numerator = (2 * mean1 * mean2 + c1) * (2 * covar + c2);
  const denominator = (mean1 ** 2 + mean2 ** 2 + c1) * (var1 + var2 + c2);

  return numerator / denominator;
}

/**
 * Calculate pixel-by-pixel difference between two images
 * Returns the percentage of pixels that differ (0-1)
 */
export function calculatePixelDiff(
  img1: ImageData,
  img2: ImageData,
  tolerance: number = 10
): number {
  if (img1.width !== img2.width || img1.height !== img2.height) {
    throw new Error('Images must have the same dimensions');
  }

  const { data: data1 } = img1;
  const { data: data2 } = img2;
  const totalPixels = img1.width * img1.height;
  let diffPixels = 0;

  for (let i = 0; i < data1.length; i += 4) {
    const r1 = data1[i]!;
    const g1 = data1[i + 1]!;
    const b1 = data1[i + 2]!;
    const r2 = data2[i]!;
    const g2 = data2[i + 1]!;
    const b2 = data2[i + 2]!;

    // Check if any channel differs by more than tolerance
    if (
      Math.abs(r1 - r2) > tolerance ||
      Math.abs(g1 - g2) > tolerance ||
      Math.abs(b1 - b2) > tolerance
    ) {
      diffPixels++;
    }
  }

  return diffPixels / totalPixels;
}

/**
 * Create a visual difference image highlighting mismatched pixels
 * Returns an ImageData with diff visualization:
 * - Green: pixels match
 * - Red: pixels differ
 */
export function createDiffImage(
  img1: ImageData,
  img2: ImageData,
  tolerance: number = 10
): ImageData {
  if (img1.width !== img2.width || img1.height !== img2.height) {
    throw new Error('Images must have the same dimensions');
  }

  const diff = new ImageData(img1.width, img1.height);
  const { data: data1 } = img1;
  const { data: data2 } = img2;
  const { data: dataDiff } = diff;

  for (let i = 0; i < data1.length; i += 4) {
    const r1 = data1[i]!;
    const g1 = data1[i + 1]!;
    const b1 = data1[i + 2]!;
    const r2 = data2[i]!;
    const g2 = data2[i + 1]!;
    const b2 = data2[i + 2]!;

    const matches =
      Math.abs(r1 - r2) <= tolerance &&
      Math.abs(g1 - g2) <= tolerance &&
      Math.abs(b1 - b2) <= tolerance;

    if (matches) {
      // Green for matching pixels
      dataDiff[i] = 0;       // R
      dataDiff[i + 1] = 200; // G
      dataDiff[i + 2] = 0;   // B
      dataDiff[i + 3] = 255; // A
    } else {
      // Red for differing pixels
      dataDiff[i] = 255;     // R
      dataDiff[i + 1] = 0;   // G
      dataDiff[i + 2] = 0;   // B
      dataDiff[i + 3] = 255; // A
    }
  }

  return diff;
}

/**
 * Calculate basic statistics for an image
 */
export function calculateImageStats(imageData: ImageData): {
  mean: number;
  variance: number;
  min: number;
  max: number;
} {
  const gray = toGrayscale(imageData);
  const n = gray.length;

  // Calculate mean
  let sum = 0;
  let min = 255;
  let max = 0;

  for (let i = 0; i < n; i++) {
    const val = gray[i]!;
    sum += val;
    if (val < min) min = val;
    if (val > max) max = val;
  }

  const mean = sum / n;

  // Calculate variance
  let varianceSum = 0;
  for (let i = 0; i < n; i++) {
    const diff = gray[i]! - mean;
    varianceSum += diff * diff;
  }

  return {
    mean,
    variance: varianceSum / n,
    min,
    max,
  };
}
