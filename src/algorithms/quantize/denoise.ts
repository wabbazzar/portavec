/**
 * Edge-preserving pre-filter for color quantization.
 *
 * 3x3 per-channel median filter: replace each pixel's channel value
 * with the median of its 3x3 neighborhood. Removes salt-and-pepper
 * and gaussian noise while preserving color-region boundaries (unlike
 * a box/gaussian blur, which washes them out further).
 *
 * This sits in front of k-means quantization so cluster centers are
 * driven by shape interiors, not noisy edge halos.
 *
 * Pure algorithm module — takes and returns ImageData only.
 */

export interface DenoiseOptions {
  /** 1 = 3x3 window, 2 = 5x5, etc. Default 1. */
  radius?: number;
  /** Number of iterated passes. Default 1. Repeated small passes
   *  are more edge-preserving than one big pass. */
  passes?: number;
}

export function medianDenoise(
  imageData: ImageData,
  opts: DenoiseOptions = {},
): ImageData {
  const passes = opts.passes ?? 1;
  let current = imageData;
  for (let p = 0; p < passes; p++) {
    current = medianOnce(current, opts.radius ?? 1);
  }
  return current;
}

function medianOnce(imageData: ImageData, radius: number): ImageData {
  if (radius <= 0) return imageData;
  const W = imageData.width;
  const H = imageData.height;
  const out = new Uint8ClampedArray(imageData.data.length);
  const win = (radius * 2 + 1) * (radius * 2 + 1);
  // Reusable buffers (one per channel).
  const buf = new Uint8Array(win);

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      for (let c = 0; c < 3; c++) {
        let n = 0;
        for (let dy = -radius; dy <= radius; dy++) {
          const ny = y + dy;
          if (ny < 0 || ny >= H) continue;
          for (let dx = -radius; dx <= radius; dx++) {
            const nx = x + dx;
            if (nx < 0 || nx >= W) continue;
            buf[n++] = imageData.data[(ny * W + nx) * 4 + c]!;
          }
        }
        // Small insertion sort: n ≤ 25 for radius ≤ 2.
        for (let i = 1; i < n; i++) {
          const v = buf[i]!;
          let j = i - 1;
          while (j >= 0 && buf[j]! > v) {
            buf[j + 1] = buf[j]!;
            j--;
          }
          buf[j + 1] = v;
        }
        out[(y * W + x) * 4 + c] = buf[Math.floor(n / 2)]!;
      }
      out[(y * W + x) * 4 + 3] = 255;
    }
  }
  return { data: out, width: W, height: H, colorSpace: 'srgb' } as unknown as ImageData;
}

/**
 * Estimate additive Gaussian noise σ in the luma channel via Laplacian MAD.
 *
 * Method:
 *   1. Compute the 4-neighbor Laplacian L(x,y) = 4*Y - Y(x-1) - Y(x+1) - Y(y-1) - Y(y+1).
 *   2. Take the absolute values, find the median (MAD, median absolute deviation).
 *   3. σ ≈ MAD / 0.6745 (Gaussian consistency constant).
 *
 * Returns σ in 0..255 range. Clean images yield σ ≈ 0-2; JPEG-compressed
 * ~3-8; heavily noisy ~15+. A ~1% strided sample keeps cost small.
 */
export function estimateNoiseSigma(imageData: ImageData, stride: number = 4): number {
  const W = imageData.width;
  const H = imageData.height;
  const data = imageData.data;
  const samples: number[] = [];
  for (let y = 1; y < H - 1; y += stride) {
    for (let x = 1; x < W - 1; x += stride) {
      const y00 = 0.299 * data[(y * W + x) * 4]! + 0.587 * data[(y * W + x) * 4 + 1]! + 0.114 * data[(y * W + x) * 4 + 2]!;
      const yL = 0.299 * data[(y * W + x - 1) * 4]! + 0.587 * data[(y * W + x - 1) * 4 + 1]! + 0.114 * data[(y * W + x - 1) * 4 + 2]!;
      const yR = 0.299 * data[(y * W + x + 1) * 4]! + 0.587 * data[(y * W + x + 1) * 4 + 1]! + 0.114 * data[(y * W + x + 1) * 4 + 2]!;
      const yU = 0.299 * data[((y - 1) * W + x) * 4]! + 0.587 * data[((y - 1) * W + x) * 4 + 1]! + 0.114 * data[((y - 1) * W + x) * 4 + 2]!;
      const yD = 0.299 * data[((y + 1) * W + x) * 4]! + 0.587 * data[((y + 1) * W + x) * 4 + 1]! + 0.114 * data[((y + 1) * W + x) * 4 + 2]!;
      samples.push(Math.abs(4 * y00 - yL - yR - yU - yD));
    }
  }
  if (samples.length === 0) return 0;
  samples.sort((a, b) => a - b);
  const mad = samples[samples.length >> 1]!;
  // Consistency constant for Gaussian + Laplacian has an extra factor:
  // σ ≈ MAD / (0.6745 * sqrt(6)). But we want a simple monotone signal,
  // so apply the standard MAD-to-σ and treat thresholds empirically.
  return mad / (0.6745 * Math.sqrt(6));
}
