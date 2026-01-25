/**
 * Canny Edge Detection Algorithm
 *
 * Multi-stage algorithm for optimal edge detection:
 * 1. Gaussian blur: Smooth image to reduce noise
 * 2. Gradient calculation: Sobel operator for magnitude and direction
 * 3. Non-maximum suppression: Thin edges to single-pixel width
 * 4. Double threshold: Classify pixels as strong/weak edges
 * 5. Hysteresis: Connect weak edges to strong edges
 *
 * Parameters:
 * - sigma: Gaussian blur standard deviation (higher = more smoothing)
 * - lowThreshold: Weak edge threshold (typically 0.4 * highThreshold)
 * - highThreshold: Strong edge threshold
 *
 * Reference: Canny, J. (1986). "A Computational Approach to Edge Detection."
 */

import { toGrayscale } from '../../utils/canvas';

export interface CannyOptions {
  /** Gaussian blur sigma (default: 1.4) */
  sigma?: number;
  /** Low threshold for weak edges (0-255, default: 20) */
  lowThreshold?: number;
  /** High threshold for strong edges (0-255, default: 50) */
  highThreshold?: number;
}

/**
 * Generate 1D Gaussian kernel
 */
function gaussianKernel(sigma: number): number[] {
  const radius = Math.ceil(sigma * 3);
  const size = radius * 2 + 1;
  const kernel: number[] = [];
  let sum = 0;

  for (let i = 0; i < size; i++) {
    const x = i - radius;
    const value = Math.exp(-(x * x) / (2 * sigma * sigma));
    kernel.push(value);
    sum += value;
  }

  // Normalize
  for (let i = 0; i < size; i++) {
    kernel[i] = (kernel[i] ?? 0) / sum;
  }

  return kernel;
}

/**
 * Apply 1D convolution (separable Gaussian blur)
 */
function convolve1D(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  kernel: number[],
  horizontal: boolean
): Float32Array {
  const result = new Float32Array(width * height);
  const radius = Math.floor(kernel.length / 2);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;

      for (let k = 0; k < kernel.length; k++) {
        const offset = k - radius;
        let px: number, py: number;

        if (horizontal) {
          px = Math.max(0, Math.min(width - 1, x + offset));
          py = y;
        } else {
          px = x;
          py = Math.max(0, Math.min(height - 1, y + offset));
        }

        const pixelValue = data[py * width + px] ?? 0;
        sum += pixelValue * (kernel[k] ?? 0);
      }

      result[y * width + x] = sum;
    }
  }

  return result;
}

/**
 * Apply Gaussian blur using separable convolution
 */
function gaussianBlur(
  gray: Uint8ClampedArray,
  width: number,
  height: number,
  sigma: number
): Float32Array {
  const kernel = gaussianKernel(sigma);

  // Horizontal pass
  const horizontal = convolve1D(gray, width, height, kernel, true);

  // Convert to Uint8ClampedArray for second pass
  const tempData = new Uint8ClampedArray(horizontal.length);
  for (let i = 0; i < horizontal.length; i++) {
    tempData[i] = Math.round(horizontal[i] ?? 0);
  }

  // Vertical pass
  return convolve1D(tempData, width, height, kernel, false);
}

/**
 * Compute gradient magnitude and direction using Sobel
 */
function computeGradients(
  blurred: Float32Array,
  width: number,
  height: number
): { magnitude: Float32Array; direction: Float32Array } {
  const magnitude = new Float32Array(width * height);
  const direction = new Float32Array(width * height);

  const getBlurredPixel = (x: number, y: number): number => {
    if (x < 0 || x >= width || y < 0 || y >= height) return 0;
    return blurred[y * width + x] ?? 0;
  };

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const p00 = getBlurredPixel(x - 1, y - 1);
      const p10 = getBlurredPixel(x, y - 1);
      const p20 = getBlurredPixel(x + 1, y - 1);
      const p01 = getBlurredPixel(x - 1, y);
      const p21 = getBlurredPixel(x + 1, y);
      const p02 = getBlurredPixel(x - 1, y + 1);
      const p12 = getBlurredPixel(x, y + 1);
      const p22 = getBlurredPixel(x + 1, y + 1);

      const gx = -p00 + p20 - 2 * p01 + 2 * p21 - p02 + p22;
      const gy = -p00 - 2 * p10 - p20 + p02 + 2 * p12 + p22;

      const idx = y * width + x;
      magnitude[idx] = Math.sqrt(gx * gx + gy * gy);
      direction[idx] = Math.atan2(gy, gx);
    }
  }

  return { magnitude, direction };
}

/**
 * Non-maximum suppression to thin edges
 */
function nonMaxSuppression(
  magnitude: Float32Array,
  direction: Float32Array,
  width: number,
  height: number
): Float32Array {
  const result = new Float32Array(width * height);

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const mag = magnitude[idx] ?? 0;
      const dir = direction[idx] ?? 0;

      // Quantize direction to 4 main directions (0°, 45°, 90°, 135°)
      // Normalize angle to 0-180° range
      let angle = ((dir * 180) / Math.PI + 180) % 180;

      let neighbor1: number, neighbor2: number;

      if (angle < 22.5 || angle >= 157.5) {
        // Horizontal edge (compare left-right)
        neighbor1 = magnitude[y * width + (x - 1)] ?? 0;
        neighbor2 = magnitude[y * width + (x + 1)] ?? 0;
      } else if (angle < 67.5) {
        // 45° edge (compare diagonal)
        neighbor1 = magnitude[(y - 1) * width + (x + 1)] ?? 0;
        neighbor2 = magnitude[(y + 1) * width + (x - 1)] ?? 0;
      } else if (angle < 112.5) {
        // Vertical edge (compare up-down)
        neighbor1 = magnitude[(y - 1) * width + x] ?? 0;
        neighbor2 = magnitude[(y + 1) * width + x] ?? 0;
      } else {
        // 135° edge (compare diagonal)
        neighbor1 = magnitude[(y - 1) * width + (x - 1)] ?? 0;
        neighbor2 = magnitude[(y + 1) * width + (x + 1)] ?? 0;
      }

      // Keep only local maxima
      if (mag >= neighbor1 && mag >= neighbor2) {
        result[idx] = mag;
      }
    }
  }

  return result;
}

/**
 * Double threshold and hysteresis edge tracking
 */
function hysteresis(
  suppressed: Float32Array,
  width: number,
  height: number,
  lowThreshold: number,
  highThreshold: number
): Uint8ClampedArray {
  const result = new Uint8ClampedArray(width * height);

  // Normalize suppressed values for thresholding
  let maxVal = 0;
  for (let i = 0; i < suppressed.length; i++) {
    const val = suppressed[i] ?? 0;
    if (val > maxVal) maxVal = val;
  }
  const scale = maxVal > 0 ? 255 / maxVal : 1;

  // First pass: mark strong and weak edges
  const STRONG = 255;
  const WEAK = 128;

  for (let i = 0; i < suppressed.length; i++) {
    const normalized = (suppressed[i] ?? 0) * scale;
    if (normalized >= highThreshold) {
      result[i] = STRONG;
    } else if (normalized >= lowThreshold) {
      result[i] = WEAK;
    }
  }

  // Second pass: connect weak edges to strong edges (hysteresis)
  // Use iterative approach instead of recursion to avoid stack overflow
  let changed = true;
  while (changed) {
    changed = false;
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;
        if (result[idx] === WEAK) {
          // Check 8-connected neighbors for strong edge
          const hasStrongNeighbor =
            result[(y - 1) * width + (x - 1)] === STRONG ||
            result[(y - 1) * width + x] === STRONG ||
            result[(y - 1) * width + (x + 1)] === STRONG ||
            result[y * width + (x - 1)] === STRONG ||
            result[y * width + (x + 1)] === STRONG ||
            result[(y + 1) * width + (x - 1)] === STRONG ||
            result[(y + 1) * width + x] === STRONG ||
            result[(y + 1) * width + (x + 1)] === STRONG;

          if (hasStrongNeighbor) {
            result[idx] = STRONG;
            changed = true;
          }
        }
      }
    }
  }

  // Final pass: remove remaining weak edges
  for (let i = 0; i < result.length; i++) {
    if (result[i] === WEAK) {
      result[i] = 0;
    }
  }

  return result;
}

/**
 * Apply Canny edge detection algorithm
 */
export function applyCanny(
  imageData: ImageData,
  options: CannyOptions = {}
): Uint8ClampedArray {
  const { sigma = 1.4, lowThreshold = 20, highThreshold = 50 } = options;

  const { width, height } = imageData;
  const gray = toGrayscale(imageData);

  // Step 1: Gaussian blur
  const blurred = gaussianBlur(gray, width, height, sigma);

  // Step 2: Compute gradients
  const { magnitude, direction } = computeGradients(blurred, width, height);

  // Step 3: Non-maximum suppression
  const suppressed = nonMaxSuppression(magnitude, direction, width, height);

  // Step 4 & 5: Double threshold and hysteresis
  const edges = hysteresis(suppressed, width, height, lowThreshold, highThreshold);

  return edges;
}

/**
 * Apply Canny with automatic threshold selection
 * Uses median of gradient magnitudes to set thresholds
 */
export function applyCannyAuto(
  imageData: ImageData,
  options: { sigma?: number } = {}
): Uint8ClampedArray {
  const { sigma = 1.4 } = options;
  const { width, height } = imageData;
  const gray = toGrayscale(imageData);

  // Compute gradients for threshold estimation
  const blurred = gaussianBlur(gray, width, height, sigma);
  const { magnitude } = computeGradients(blurred, width, height);

  // Find median of non-zero magnitudes
  const nonZero: number[] = [];
  for (let i = 0; i < magnitude.length; i++) {
    const val = magnitude[i] ?? 0;
    if (val > 0) nonZero.push(val);
  }
  nonZero.sort((a, b) => a - b);

  const median = nonZero[Math.floor(nonZero.length / 2)] ?? 50;

  // Set thresholds based on median
  const highThreshold = Math.min(255, median * 1.33);
  const lowThreshold = highThreshold * 0.4;

  return applyCanny(imageData, { sigma, lowThreshold, highThreshold });
}
