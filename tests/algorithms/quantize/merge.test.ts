import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mergeNearClusters, medianDenoise } from '../../../src/algorithms/quantize';
import type { QuantizeResult } from '../../../src/algorithms/quantize';

function fakeQuantize(
  palette: string[],
  indices: number[],
): QuantizeResult {
  return { palette, indices: new Uint8Array(indices), wcss: 0 };
}

describe('mergeNearClusters', () => {
  it('is identity when all centers are far apart', () => {
    const initial = fakeQuantize(
      ['#ff0000', '#00ff00', '#0000ff', '#ffff00'],
      [0, 1, 2, 3, 0, 1, 2, 3],
    );
    const out = mergeNearClusters(initial, { mergeThreshold: 8 });
    expect(out.palette.length).toBe(4);
    expect(out.mergedFrom).toBe(4);
    expect(Array.from(out.indices)).toEqual([0, 1, 2, 3, 0, 1, 2, 3]);
  });

  it('merges two near-duplicate colors into one', () => {
    // Two near-identical reds + one green.
    const initial = fakeQuantize(
      ['#ff0000', '#fd0000', '#00ff00'],
      [0, 0, 1, 1, 2, 2],
    );
    const out = mergeNearClusters(initial, { mergeThreshold: 10 });
    expect(out.palette.length).toBe(2);
    expect(out.mergedFrom).toBe(3);
  });

  it('respects minK lower bound', () => {
    const initial = fakeQuantize(
      ['#ff0000', '#fd0000', '#f00001'],
      [0, 1, 2, 0, 1, 2],
    );
    const out = mergeNearClusters(initial, { mergeThreshold: 100, minK: 2 });
    expect(out.palette.length).toBeGreaterThanOrEqual(2);
  });
});

describe('blind barrier: quantize post-processing', () => {
  const files = [
    'src/algorithms/quantize/denoise.ts',
    'src/algorithms/quantize/merge.ts',
  ];
  for (const rel of files) {
    it(`${rel} does not import ground-truth`, () => {
      const src = readFileSync(resolve(__dirname, '../../../', rel), 'utf-8');
      expect(src).not.toMatch(/from ['"][^'"]*benchmarks\/ground-truth/);
      expect(src).not.toMatch(/import\(['"][^'"]*benchmarks\/ground-truth/);
    });
  }
});

describe('medianDenoise interior preservation', () => {
  it('preserves solid-color interiors exactly', () => {
    const W = 40;
    const H = 40;
    const data = new Uint8ClampedArray(W * H * 4);
    for (let i = 0; i < W * H; i++) {
      data[i * 4] = 200;
      data[i * 4 + 1] = 100;
      data[i * 4 + 2] = 50;
      data[i * 4 + 3] = 255;
    }
    const src = { data, width: W, height: H, colorSpace: 'srgb' } as unknown as ImageData;
    const out = medianDenoise(src, { radius: 2, passes: 3 });
    const idx = (20 * W + 20) * 4;
    expect(out.data[idx]).toBe(200);
    expect(out.data[idx + 1]).toBe(100);
    expect(out.data[idx + 2]).toBe(50);
  });
});
