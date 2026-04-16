import { describe, it, expect } from 'vitest';
import { addNoise } from '../../../src/benchmarks/ground-truth/noise';

function flatField(w: number, h: number, rgb: [number, number, number]): ImageData {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = rgb[0];
    data[i * 4 + 1] = rgb[1];
    data[i * 4 + 2] = rgb[2];
    data[i * 4 + 3] = 255;
  }
  return { data, width: w, height: h, colorSpace: 'srgb' } as unknown as ImageData;
}

describe('addNoise', () => {
  it('no-op when all sigmas are 0 and blur=0', () => {
    const src = flatField(20, 20, [100, 150, 200]);
    const out = addNoise(src, { seed: 1 });
    expect(out.data).toEqual(src.data);
  });

  it('gaussian: produces per-channel variance near sigma²', () => {
    const src = flatField(40, 40, [128, 128, 128]);
    const out = addNoise(src, { seed: 1, gaussianSigma: 10 });
    let sum = 0;
    let sumSq = 0;
    const N = out.width * out.height;
    for (let i = 0; i < N; i++) {
      const r = out.data[i * 4]! - 128;
      sum += r;
      sumSq += r * r;
    }
    const variance = sumSq / N - (sum / N) ** 2;
    expect(variance).toBeGreaterThan(50);
    expect(variance).toBeLessThan(150);
  });

  it('deterministic: same seed → identical output', () => {
    const src = flatField(30, 30, [100, 100, 100]);
    const a = addNoise(src, { seed: 42, gaussianSigma: 8, blurRadius: 2 });
    const b = addNoise(src, { seed: 42, gaussianSigma: 8, blurRadius: 2 });
    expect(a.data).toEqual(b.data);
  });

  it('different seeds → different output', () => {
    const src = flatField(30, 30, [100, 100, 100]);
    const a = addNoise(src, { seed: 1, gaussianSigma: 8 });
    const b = addNoise(src, { seed: 2, gaussianSigma: 8 });
    expect(a.data).not.toEqual(b.data);
  });

  it('blur: preserves solid color in the interior', () => {
    // Interior of a large solid field should stay the same color after
    // box blur (edge bleeding only affects the border).
    const src = flatField(60, 60, [80, 160, 240]);
    const out = addNoise(src, { seed: 1, blurRadius: 3 });
    const cx = 30;
    const cy = 30;
    const idx = (cy * 60 + cx) * 4;
    expect(out.data[idx]).toBe(80);
    expect(out.data[idx + 1]).toBe(160);
    expect(out.data[idx + 2]).toBe(240);
  });

  it('blur: softens a hard edge', () => {
    // Left half red, right half blue, check the boundary blurs.
    const W = 40;
    const H = 20;
    const data = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const idx = (y * W + x) * 4;
        if (x < W / 2) {
          data[idx] = 255;
          data[idx + 2] = 0;
        } else {
          data[idx] = 0;
          data[idx + 2] = 255;
        }
        data[idx + 3] = 255;
      }
    }
    const src = { data, width: W, height: H, colorSpace: 'srgb' } as unknown as ImageData;
    const out = addNoise(src, { seed: 1, blurRadius: 3 });
    // At the border (x=W/2) red/blue should both be ~128 (mixed).
    const idx = (10 * W + 20) * 4;
    expect(out.data[idx]).toBeGreaterThan(50);
    expect(out.data[idx]).toBeLessThan(200);
    expect(out.data[idx + 2]).toBeGreaterThan(50);
    expect(out.data[idx + 2]).toBeLessThan(200);
  });
});
