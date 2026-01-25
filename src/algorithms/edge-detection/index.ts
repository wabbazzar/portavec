/**
 * Edge Detection Module - Unified interface for edge detection algorithms
 *
 * Provides Sobel and Canny edge detectors for finding boundaries in images.
 * Edge detection is typically used before contour tracing in vectorization.
 */

export {
  applySobel,
  applySobelThreshold,
  applySobelX,
  applySobelY,
  type SobelResult,
} from './sobel';

export {
  applyCanny,
  applyCannyAuto,
  type CannyOptions,
} from './canny';

export type EdgeMethod = 'sobel' | 'canny' | 'canny-auto';

export interface EdgeDetectionOptions {
  method: EdgeMethod;
  /** Threshold for Sobel edge detection (0-255, default: 50) */
  sobelThreshold?: number;
  /** Gaussian blur sigma for Canny (default: 1.4) */
  sigma?: number;
  /** Low threshold for Canny weak edges (0-255, default: 20) */
  lowThreshold?: number;
  /** High threshold for Canny strong edges (0-255, default: 50) */
  highThreshold?: number;
}

export interface EdgeDetectionResult {
  /** Binary edge map (255 = edge, 0 = no edge) */
  edges: Uint8ClampedArray;
  /** Method used */
  method: EdgeMethod;
  /** Image width */
  width: number;
  /** Image height */
  height: number;
}

import { applySobelThreshold } from './sobel';
import { applyCanny, applyCannyAuto } from './canny';

/**
 * Detect edges in an image using the specified method
 */
export function detectEdges(
  imageData: ImageData,
  options: EdgeDetectionOptions = { method: 'canny' }
): EdgeDetectionResult {
  const { method } = options;
  const { width, height } = imageData;

  switch (method) {
    case 'sobel': {
      const threshold = options.sobelThreshold ?? 50;
      const edges = applySobelThreshold(imageData, threshold);
      return { edges, method: 'sobel', width, height };
    }

    case 'canny': {
      const edges = applyCanny(imageData, {
        sigma: options.sigma,
        lowThreshold: options.lowThreshold,
        highThreshold: options.highThreshold,
      });
      return { edges, method: 'canny', width, height };
    }

    case 'canny-auto': {
      const edges = applyCannyAuto(imageData, {
        sigma: options.sigma,
      });
      return { edges, method: 'canny-auto', width, height };
    }

    default:
      throw new Error(`Unknown edge detection method: ${method}`);
  }
}

/**
 * Count the number of edge pixels in a binary edge map
 */
export function countEdgePixels(edges: Uint8ClampedArray): number {
  let count = 0;
  for (let i = 0; i < edges.length; i++) {
    if (edges[i] !== undefined && edges[i]! > 0) {
      count++;
    }
  }
  return count;
}
