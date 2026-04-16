/**
 * Deterministic image noise — makes the synthetic benchmark resemble
 * real inputs. All noise paths are seeded so benchmark runs reproduce
 * exact test inputs.
 *
 * Noise types:
 *   gaussian       — per-channel additive N(0, σ²) noise, clamped to [0, 255]
 *   boxBlur        — separable box blur simulating JPEG/webcam softness
 *   jitter         — small per-pixel color nudge in Lab-ish space
 *
 * Apply as `addNoise(image, opts)` which composes them in a canonical
 * order: blur first (softens edges), then jitter + gaussian.
 */

import { mulberry32 } from './rng';

export interface NoiseOptions {
  seed: number;
  /** σ for per-channel gaussian noise in 0..255 units. 0 disables. */
  gaussianSigma?: number;
  /** Box-blur half-width in pixels. 0 disables. */
  blurRadius?: number;
  /** σ for small uniform color jitter applied before gaussian. 0 disables. */
  jitterSigma?: number;
}

export function addNoise(src: ImageData, opts: NoiseOptions): ImageData {
  const { seed, gaussianSigma = 0, blurRadius = 0, jitterSigma = 0 } = opts;
  const rng = mulberry32(seed);
  let img = cloneImageData(src);
  if (blurRadius > 0) img = boxBlur(img, blurRadius);
  if (jitterSigma > 0) applyJitter(img, rng, jitterSigma);
  if (gaussianSigma > 0) applyGaussian(img, rng, gaussianSigma);
  return img;
}

function cloneImageData(src: ImageData): ImageData {
  const data = new Uint8ClampedArray(src.data);
  return { data, width: src.width, height: src.height, colorSpace: 'srgb' } as unknown as ImageData;
}

/** Seeded standard normal via Box-Muller (always returns the first of the pair). */
function randn(rng: ReturnType<typeof mulberry32>): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng.next();
  while (v === 0) v = rng.next();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

function applyGaussian(img: ImageData, rng: ReturnType<typeof mulberry32>, sigma: number): void {
  const N = img.width * img.height;
  for (let i = 0; i < N; i++) {
    img.data[i * 4] = clamp(img.data[i * 4]! + randn(rng) * sigma);
    img.data[i * 4 + 1] = clamp(img.data[i * 4 + 1]! + randn(rng) * sigma);
    img.data[i * 4 + 2] = clamp(img.data[i * 4 + 2]! + randn(rng) * sigma);
  }
}

function applyJitter(img: ImageData, rng: ReturnType<typeof mulberry32>, sigma: number): void {
  // Apply the same nudge to all 3 channels per pixel, so the pixel's
  // hue doesn't drift — just its luminance. Simulates photometric noise.
  const N = img.width * img.height;
  for (let i = 0; i < N; i++) {
    const d = randn(rng) * sigma;
    img.data[i * 4] = clamp(img.data[i * 4]! + d);
    img.data[i * 4 + 1] = clamp(img.data[i * 4 + 1]! + d);
    img.data[i * 4 + 2] = clamp(img.data[i * 4 + 2]! + d);
  }
}

/**
 * Two-pass separable box blur. Produces noticeable softness at radius 2,
 * heavy blur at radius 5+.
 */
function boxBlur(img: ImageData, radius: number): ImageData {
  const W = img.width;
  const H = img.height;
  const tmp = new Uint8ClampedArray(W * H * 4);
  const out = new Uint8ClampedArray(W * H * 4);
  const win = radius * 2 + 1;

  // Horizontal pass src -> tmp
  for (let y = 0; y < H; y++) {
    let rSum = 0;
    let gSum = 0;
    let bSum = 0;
    // Prime the window.
    for (let dx = -radius; dx <= radius; dx++) {
      const x = Math.max(0, Math.min(W - 1, dx));
      const idx = (y * W + x) * 4;
      rSum += img.data[idx]!;
      gSum += img.data[idx + 1]!;
      bSum += img.data[idx + 2]!;
    }
    for (let x = 0; x < W; x++) {
      const outIdx = (y * W + x) * 4;
      tmp[outIdx] = Math.round(rSum / win);
      tmp[outIdx + 1] = Math.round(gSum / win);
      tmp[outIdx + 2] = Math.round(bSum / win);
      tmp[outIdx + 3] = 255;
      const xLeave = Math.max(0, Math.min(W - 1, x - radius));
      const xEnter = Math.max(0, Math.min(W - 1, x + radius + 1));
      const leaveIdx = (y * W + xLeave) * 4;
      const enterIdx = (y * W + xEnter) * 4;
      rSum += img.data[enterIdx]! - img.data[leaveIdx]!;
      gSum += img.data[enterIdx + 1]! - img.data[leaveIdx + 1]!;
      bSum += img.data[enterIdx + 2]! - img.data[leaveIdx + 2]!;
    }
  }

  // Vertical pass tmp -> out
  for (let x = 0; x < W; x++) {
    let rSum = 0;
    let gSum = 0;
    let bSum = 0;
    for (let dy = -radius; dy <= radius; dy++) {
      const y = Math.max(0, Math.min(H - 1, dy));
      const idx = (y * W + x) * 4;
      rSum += tmp[idx]!;
      gSum += tmp[idx + 1]!;
      bSum += tmp[idx + 2]!;
    }
    for (let y = 0; y < H; y++) {
      const outIdx = (y * W + x) * 4;
      out[outIdx] = Math.round(rSum / win);
      out[outIdx + 1] = Math.round(gSum / win);
      out[outIdx + 2] = Math.round(bSum / win);
      out[outIdx + 3] = 255;
      const yLeave = Math.max(0, Math.min(H - 1, y - radius));
      const yEnter = Math.max(0, Math.min(H - 1, y + radius + 1));
      const leaveIdx = (yLeave * W + x) * 4;
      const enterIdx = (yEnter * W + x) * 4;
      rSum += tmp[enterIdx]! - tmp[leaveIdx]!;
      gSum += tmp[enterIdx + 1]! - tmp[leaveIdx + 1]!;
      bSum += tmp[enterIdx + 2]! - tmp[leaveIdx + 2]!;
    }
  }

  return { data: out, width: W, height: H, colorSpace: 'srgb' } as unknown as ImageData;
}

function clamp(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}
