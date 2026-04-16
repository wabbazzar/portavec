/**
 * Supersampled anti-aliased rasterization of a Truth.
 *
 * Renders the Truth at N× resolution using the existing integer
 * rasterizer, then downsamples with a box filter. Produces partial-alpha
 * edge transitions that match what browsers (and AI-generated images)
 * actually emit — far more realistic than additive Gaussian noise for
 * testing quantization robustness.
 *
 * Edge width at 1:1 downsampled output ≈ 1 pixel for N=2, ≈ 2 for N=4.
 *
 * Blind-barrier safe: produces only ImageData, exposes nothing of Truth.
 */

import { rasterizeTruth } from './rasterize';
import type { Truth } from './schema';

export interface AaOptions {
  /** Supersample factor. 2 = 2x2 subsamples per pixel. Default 4. */
  factor?: number;
}

export function rasterizeTruthAa(truth: Truth, opts: AaOptions = {}): ImageData {
  const factor = Math.max(1, Math.floor(opts.factor ?? 4));
  if (factor === 1) return rasterizeTruth(truth);

  const hiTruth: Truth = scaleTruth(truth, factor);
  const hi = rasterizeTruth(hiTruth);
  return boxDownsample(hi, truth.width, truth.height, factor);
}

function scaleTruth(truth: Truth, f: number): Truth {
  return {
    width: truth.width * f,
    height: truth.height * f,
    background: truth.background,
    palette: truth.palette,
    seed: truth.seed,
    shapes: truth.shapes.map((s) => {
      switch (s.kind) {
        case 'circle':
          return { kind: 'circle', cx: s.cx * f, cy: s.cy * f, r: s.r * f, color: s.color };
        case 'rectangle':
          return {
            kind: 'rectangle',
            x: s.x * f,
            y: s.y * f,
            w: s.w * f,
            h: s.h * f,
            color: s.color,
          };
        case 'triangle':
          return {
            kind: 'triangle',
            p1: { x: s.p1.x * f, y: s.p1.y * f },
            p2: { x: s.p2.x * f, y: s.p2.y * f },
            p3: { x: s.p3.x * f, y: s.p3.y * f },
            color: s.color,
          };
      }
    }),
  };
}

function boxDownsample(src: ImageData, dw: number, dh: number, f: number): ImageData {
  const data = new Uint8ClampedArray(dw * dh * 4);
  const sw = src.width;
  const area = f * f;
  for (let y = 0; y < dh; y++) {
    for (let x = 0; x < dw; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let sy = 0; sy < f; sy++) {
        for (let sx = 0; sx < f; sx++) {
          const si = ((y * f + sy) * sw + (x * f + sx)) * 4;
          r += src.data[si]!;
          g += src.data[si + 1]!;
          b += src.data[si + 2]!;
        }
      }
      const di = (y * dw + x) * 4;
      data[di] = Math.round(r / area);
      data[di + 1] = Math.round(g / area);
      data[di + 2] = Math.round(b / area);
      data[di + 3] = 255;
    }
  }
  return { data, width: dw, height: dh, colorSpace: 'srgb' } as unknown as ImageData;
}
