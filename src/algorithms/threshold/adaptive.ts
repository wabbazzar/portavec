/**
 * Adaptive Thresholding
 *
 * Computes a local threshold for each pixel based on its neighborhood,
 * handling images with uneven illumination or varying backgrounds.
 *
 * Algorithm (using integral images for O(1) local mean):
 * 1. Compute integral image for O(1) rectangular sum queries
 * 2. For each pixel, compute local mean in window
 * 3. Threshold = local_mean - constant (bias toward foreground)
 *
 * Window size affects results:
 * - Small window: captures fine detail but may amplify noise
 * - Large window: smoother but may miss local variations
 *
 * Reference: Sauvola, J. (2000). "Adaptive document image binarization."
 */

import { toGrayscale } from '../../utils/canvas';

/**
 * Compute integral image (summed area table)
 * integral[y][x] = sum of all pixels above and to the left of (x,y)
 *
 * This allows computing sum of any rectangular region in O(1):
 * sum(x1,y1,x2,y2) = integral[y2][x2] - integral[y1-1][x2]
 *                   - integral[y2][x1-1] + integral[y1-1][x1-1]
 */
function computeIntegralImage(
  gray: Uint8ClampedArray,
  width: number,
  height: number
): Float64Array {
  // Use Float64 to avoid overflow for large images
  const integral = new Float64Array((width + 1) * (height + 1));
  const stride = width + 1;

  for (let y = 0; y < height; y++) {
    let rowSum = 0;
    for (let x = 0; x < width; x++) {
      const pixelValue = gray[y * width + x] ?? 0;
      rowSum += pixelValue;
      // integral[y+1][x+1] = pixel + left + above - above-left
      const aboveIdx = y * stride + (x + 1);
      integral[(y + 1) * stride + (x + 1)] =
        rowSum + (integral[aboveIdx] ?? 0);
    }
  }

  return integral;
}

/**
 * Get sum of rectangular region using integral image
 * Coordinates are inclusive: (x1,y1) to (x2,y2)
 */
function getRectSum(
  integral: Float64Array,
  stride: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  // Adjust for 1-indexed integral image
  const a = integral[y1 * stride + x1]!;
  const b = integral[y1 * stride + (x2 + 1)]!;
  const c = integral[(y2 + 1) * stride + x1]!;
  const d = integral[(y2 + 1) * stride + (x2 + 1)]!;
  return d - b - c + a;
}

export interface AdaptiveThresholdOptions {
  /** Window size for local mean calculation (must be odd, default: 11) */
  windowSize?: number;
  /** Constant subtracted from local mean (default: 2) */
  constant?: number;
}

/**
 * Apply adaptive threshold using mean-based method
 * Returns binary image where foreground = 255, background = 0
 */
export function applyAdaptiveThreshold(
  imageData: ImageData,
  options: AdaptiveThresholdOptions = {}
): Uint8ClampedArray {
  const { windowSize = 11, constant = 2 } = options;

  // Ensure window size is odd
  const window = windowSize % 2 === 0 ? windowSize + 1 : windowSize;
  const halfWindow = Math.floor(window / 2);

  const { width, height } = imageData;
  const gray = toGrayscale(imageData);
  const integral = computeIntegralImage(gray, width, height);
  const stride = width + 1;

  const binary = new Uint8ClampedArray(gray.length);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Define window bounds (clamped to image edges)
      const x1 = Math.max(0, x - halfWindow);
      const y1 = Math.max(0, y - halfWindow);
      const x2 = Math.min(width - 1, x + halfWindow);
      const y2 = Math.min(height - 1, y + halfWindow);

      // Window area (number of pixels)
      const area = (x2 - x1 + 1) * (y2 - y1 + 1);

      // Local mean using integral image
      const sum = getRectSum(integral, stride, x1, y1, x2, y2);
      const localMean = sum / area;

      // Local threshold
      const threshold = localMean - constant;

      // Apply threshold (dark pixels become foreground)
      const idx = y * width + x;
      binary[idx] = gray[idx]! <= threshold ? 255 : 0;
    }
  }

  return binary;
}

/**
 * Sauvola's adaptive threshold method
 * Threshold = mean * (1 + k * (stddev / R - 1))
 * where R is the dynamic range (128 for 8-bit grayscale)
 *
 * Better for documents with varying background
 */
export function applySauvolaThreshold(
  imageData: ImageData,
  options: { windowSize?: number; k?: number } = {}
): Uint8ClampedArray {
  const { windowSize = 15, k = 0.5 } = options;
  const R = 128; // Dynamic range for normalization

  const window = windowSize % 2 === 0 ? windowSize + 1 : windowSize;
  const halfWindow = Math.floor(window / 2);

  const { width, height } = imageData;
  const gray = toGrayscale(imageData);

  // Compute integral images for mean and squared mean (for variance)
  const integral = computeIntegralImage(gray, width, height);

  // Compute integral of squared values for variance
  const graySq = new Uint8ClampedArray(gray.length);
  for (let i = 0; i < gray.length; i++) {
    graySq[i] = Math.min(255, (gray[i]! * gray[i]!) / 255);
  }
  const integralSq = computeIntegralImage(graySq, width, height);

  const stride = width + 1;
  const binary = new Uint8ClampedArray(gray.length);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const x1 = Math.max(0, x - halfWindow);
      const y1 = Math.max(0, y - halfWindow);
      const x2 = Math.min(width - 1, x + halfWindow);
      const y2 = Math.min(height - 1, y + halfWindow);

      const area = (x2 - x1 + 1) * (y2 - y1 + 1);

      const sum = getRectSum(integral, stride, x1, y1, x2, y2);
      const sumSq = getRectSum(integralSq, stride, x1, y1, x2, y2) * 255;

      const mean = sum / area;
      const variance = Math.max(0, (sumSq / area) - (mean * mean));
      const stddev = Math.sqrt(variance);

      // Sauvola threshold formula
      const threshold = mean * (1 + k * (stddev / R - 1));

      const idx = y * width + x;
      binary[idx] = gray[idx]! <= threshold ? 255 : 0;
    }
  }

  return binary;
}
