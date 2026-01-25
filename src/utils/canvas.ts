/**
 * Canvas manipulation utilities for image processing
 */

/**
 * Create a new ImageData with the specified dimensions
 */
export function createImageData(width: number, height: number): ImageData {
  return new ImageData(width, height);
}

/**
 * Clone an existing ImageData
 */
export function cloneImageData(source: ImageData): ImageData {
  const clone = new ImageData(source.width, source.height);
  clone.data.set(source.data);
  return clone;
}

/**
 * Convert an ImageData to grayscale using luminosity method
 * Returns a new Uint8ClampedArray with single-channel grayscale values
 */
export function toGrayscale(imageData: ImageData): Uint8ClampedArray {
  const { data, width, height } = imageData;
  const gray = new Uint8ClampedArray(width * height);

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    // Luminosity formula: 0.299R + 0.587G + 0.114B
    gray[i / 4] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  }

  return gray;
}

/**
 * Convert grayscale array back to ImageData (RGBA format)
 */
export function grayscaleToImageData(
  gray: Uint8ClampedArray,
  width: number,
  height: number
): ImageData {
  const imageData = new ImageData(width, height);
  const { data } = imageData;

  for (let i = 0; i < gray.length; i++) {
    const value = gray[i]!;
    const idx = i * 4;
    data[idx] = value;     // R
    data[idx + 1] = value; // G
    data[idx + 2] = value; // B
    data[idx + 3] = 255;   // A (fully opaque)
  }

  return imageData;
}

/**
 * Convert binary array (0/1 or 0/255) to ImageData
 * Foreground (1 or 255) becomes black, background becomes white
 */
export function binaryToImageData(
  binary: Uint8ClampedArray,
  width: number,
  height: number
): ImageData {
  const imageData = new ImageData(width, height);
  const { data } = imageData;

  for (let i = 0; i < binary.length; i++) {
    // Non-zero = black (foreground), zero = white (background)
    const value = binary[i]! > 0 ? 0 : 255;
    const idx = i * 4;
    data[idx] = value;
    data[idx + 1] = value;
    data[idx + 2] = value;
    data[idx + 3] = 255;
  }

  return imageData;
}

/**
 * Get pixel value at (x, y) from grayscale array
 */
export function getPixel(
  data: Uint8ClampedArray,
  width: number,
  x: number,
  y: number
): number {
  if (x < 0 || x >= width || y < 0 || y >= data.length / width) {
    return 0; // Out of bounds returns 0 (background)
  }
  return data[y * width + x] ?? 0;
}

/**
 * Set pixel value at (x, y) in grayscale array
 */
export function setPixel(
  data: Uint8ClampedArray,
  width: number,
  x: number,
  y: number,
  value: number
): void {
  const height = data.length / width;
  if (x >= 0 && x < width && y >= 0 && y < height) {
    data[y * width + x] = value;
  }
}

/**
 * Create a canvas and context for the given dimensions
 */
export function createCanvas(
  width: number,
  height: number
): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to create canvas 2D context');
  }
  return { canvas, ctx };
}

/**
 * Draw ImageData to a canvas and return the canvas
 */
export function imageDataToCanvas(imageData: ImageData): HTMLCanvasElement {
  const { canvas, ctx } = createCanvas(imageData.width, imageData.height);
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

/**
 * Get ImageData from a canvas
 */
export function canvasToImageData(canvas: HTMLCanvasElement): ImageData {
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to get canvas 2D context');
  }
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}
