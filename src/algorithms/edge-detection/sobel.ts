/**
 * Sobel Edge Detection Operator
 *
 * Computes image gradients using 3x3 convolution kernels to detect edges.
 * Produces both gradient magnitude (edge strength) and direction (edge angle).
 *
 * Kernels:
 * Gx (horizontal):     Gy (vertical):
 * [-1  0 +1]          [-1 -2 -1]
 * [-2  0 +2]          [ 0  0  0]
 * [-1  0 +1]          [+1 +2 +1]
 *
 * Gradient magnitude: G = sqrt(Gx² + Gy²)
 * Gradient direction: θ = atan2(Gy, Gx)
 *
 * Reference: Sobel, I. (1968). "An Isotropic 3×3 Image Gradient Operator"
 */

import { toGrayscale, getPixel } from '../../utils/canvas';

export interface SobelResult {
  /** Gradient magnitude (0-255) */
  magnitude: Uint8ClampedArray;
  /** Gradient direction in radians (-π to π) */
  direction: Float32Array;
  /** Width of the result */
  width: number;
  /** Height of the result */
  height: number;
}

/**
 * Apply Sobel operator to compute edge gradients
 */
export function applySobel(imageData: ImageData): SobelResult {
  const { width, height } = imageData;
  const gray = toGrayscale(imageData);

  const magnitude = new Uint8ClampedArray(width * height);
  const direction = new Float32Array(width * height);

  // Track max magnitude for normalization
  let maxMag = 0;
  const rawMagnitude = new Float32Array(width * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Get 3x3 neighborhood
      const p00 = getPixel(gray, width, x - 1, y - 1);
      const p10 = getPixel(gray, width, x, y - 1);
      const p20 = getPixel(gray, width, x + 1, y - 1);
      const p01 = getPixel(gray, width, x - 1, y);
      const p21 = getPixel(gray, width, x + 1, y);
      const p02 = getPixel(gray, width, x - 1, y + 1);
      const p12 = getPixel(gray, width, x, y + 1);
      const p22 = getPixel(gray, width, x + 1, y + 1);

      // Apply Sobel kernels
      // Gx = (-1)*p00 + (0)*p10 + (1)*p20 + (-2)*p01 + (0)*p11 + (2)*p21 + (-1)*p02 + (0)*p12 + (1)*p22
      const gx = -p00 + p20 - 2 * p01 + 2 * p21 - p02 + p22;

      // Gy = (-1)*p00 + (-2)*p10 + (-1)*p20 + (0)*p01 + (0)*p11 + (0)*p21 + (1)*p02 + (2)*p12 + (1)*p22
      const gy = -p00 - 2 * p10 - p20 + p02 + 2 * p12 + p22;

      const idx = y * width + x;
      const mag = Math.sqrt(gx * gx + gy * gy);
      rawMagnitude[idx] = mag;
      direction[idx] = Math.atan2(gy, gx);

      if (mag > maxMag) maxMag = mag;
    }
  }

  // Normalize magnitude to 0-255
  const scale = maxMag > 0 ? 255 / maxMag : 1;
  for (let i = 0; i < rawMagnitude.length; i++) {
    const rawMag = rawMagnitude[i];
    magnitude[i] = Math.round((rawMag ?? 0) * scale);
  }

  return { magnitude, direction, width, height };
}

/**
 * Apply Sobel and threshold to get binary edge map
 */
export function applySobelThreshold(
  imageData: ImageData,
  threshold: number = 50
): Uint8ClampedArray {
  const { magnitude, width, height } = applySobel(imageData);
  const binary = new Uint8ClampedArray(width * height);

  for (let i = 0; i < magnitude.length; i++) {
    const mag = magnitude[i];
    binary[i] = mag !== undefined && mag >= threshold ? 255 : 0;
  }

  return binary;
}

/**
 * Get horizontal gradient only (Gx)
 */
export function applySobelX(imageData: ImageData): Float32Array {
  const { width, height } = imageData;
  const gray = toGrayscale(imageData);
  const gx = new Float32Array(width * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p00 = getPixel(gray, width, x - 1, y - 1);
      const p20 = getPixel(gray, width, x + 1, y - 1);
      const p01 = getPixel(gray, width, x - 1, y);
      const p21 = getPixel(gray, width, x + 1, y);
      const p02 = getPixel(gray, width, x - 1, y + 1);
      const p22 = getPixel(gray, width, x + 1, y + 1);

      gx[y * width + x] = -p00 + p20 - 2 * p01 + 2 * p21 - p02 + p22;
    }
  }

  return gx;
}

/**
 * Get vertical gradient only (Gy)
 */
export function applySobelY(imageData: ImageData): Float32Array {
  const { width, height } = imageData;
  const gray = toGrayscale(imageData);
  const gy = new Float32Array(width * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p00 = getPixel(gray, width, x - 1, y - 1);
      const p10 = getPixel(gray, width, x, y - 1);
      const p20 = getPixel(gray, width, x + 1, y - 1);
      const p02 = getPixel(gray, width, x - 1, y + 1);
      const p12 = getPixel(gray, width, x, y + 1);
      const p22 = getPixel(gray, width, x + 1, y + 1);

      gy[y * width + x] = -p00 - 2 * p10 - p20 + p02 + 2 * p12 + p22;
    }
  }

  return gy;
}
