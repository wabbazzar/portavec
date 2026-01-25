/**
 * Threshold Module - Unified interface for image binarization
 *
 * Provides automatic and manual thresholding methods for converting
 * grayscale images to binary (black/white) for vectorization.
 */

export {
  findOtsuThreshold,
  applyOtsuThreshold,
  applyManualThreshold,
} from './otsu';

export {
  applyAdaptiveThreshold,
  applySauvolaThreshold,
  type AdaptiveThresholdOptions,
} from './adaptive';

export type ThresholdMethod = 'otsu' | 'adaptive' | 'sauvola' | 'manual';

export interface ThresholdOptions {
  method: ThresholdMethod;
  /** Manual threshold value (0-255), used when method is 'manual' */
  manualValue?: number;
  /** Window size for adaptive methods */
  windowSize?: number;
  /** Constant for adaptive method */
  constant?: number;
  /** k parameter for Sauvola method */
  sauvolaK?: number;
}

export interface ThresholdResult {
  /** Binary image (255 = foreground, 0 = background) */
  binary: Uint8ClampedArray;
  /** Threshold value used (for Otsu) or average (for adaptive) */
  threshold: number;
  /** Method used */
  method: ThresholdMethod;
}

import { applyOtsuThreshold, applyManualThreshold } from './otsu';
import { applyAdaptiveThreshold, applySauvolaThreshold } from './adaptive';

/**
 * Apply thresholding to an image using the specified method
 */
export function threshold(
  imageData: ImageData,
  options: ThresholdOptions = { method: 'otsu' }
): ThresholdResult {
  const { method } = options;

  switch (method) {
    case 'otsu': {
      const result = applyOtsuThreshold(imageData);
      return {
        binary: result.binary,
        threshold: result.threshold,
        method: 'otsu',
      };
    }

    case 'manual': {
      const value = options.manualValue ?? 128;
      const binary = applyManualThreshold(imageData, value);
      return {
        binary,
        threshold: value,
        method: 'manual',
      };
    }

    case 'adaptive': {
      const binary = applyAdaptiveThreshold(imageData, {
        windowSize: options.windowSize,
        constant: options.constant,
      });
      return {
        binary,
        threshold: -1, // Adaptive has no single threshold
        method: 'adaptive',
      };
    }

    case 'sauvola': {
      const binary = applySauvolaThreshold(imageData, {
        windowSize: options.windowSize,
        k: options.sauvolaK,
      });
      return {
        binary,
        threshold: -1, // Sauvola has no single threshold
        method: 'sauvola',
      };
    }

    default:
      throw new Error(`Unknown threshold method: ${method}`);
  }
}
