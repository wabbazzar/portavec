import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { quantize, chooseK, autoQuantize } from '../../../src/algorithms/quantize';
import { generateTruth } from '../../../src/benchmarks/ground-truth/generator';
import { rasterizeTruth } from '../../../src/benchmarks/ground-truth/rasterize';
import { hexToRgb } from '../../../src/benchmarks/ground-truth/palette';
import { rgbToLab, deltaE } from '../../../src/benchmarks/ground-truth/color-lab';

function bestMatchDeltaE(truthPalette: string[], outPalette: string[]): number[] {
  const tLab = truthPalette.map((h) => rgbToLab(hexToRgb(h)));
  const oLab = outPalette.map((h) => rgbToLab(hexToRgb(h)));
  return tLab.map((t) => Math.min(...oLab.map((o) => deltaE(t, o))));
}

describe('quantize', () => {
  it('k=1 palette is (roughly) the average color', () => {
    // Checker: half white, half black -> avg should be gray.
    const W = 20;
    const H = 20;
    const data = new Uint8ClampedArray(W * H * 4);
    for (let i = 0; i < W * H; i++) {
      const v = i % 2 === 0 ? 255 : 0;
      data[i * 4] = v;
      data[i * 4 + 1] = v;
      data[i * 4 + 2] = v;
      data[i * 4 + 3] = 255;
    }
    const img = { data, width: W, height: H, colorSpace: 'srgb' } as unknown as ImageData;
    const { palette } = quantize(img, { k: 1, seed: 1 });
    const [r, g, b] = hexToRgb(palette[0]!);
    expect(r).toBeGreaterThan(100);
    expect(r).toBeLessThan(200);
    expect(Math.abs(r - g)).toBeLessThan(5);
    expect(Math.abs(g - b)).toBeLessThan(5);
  });

  it('determinism: same seed → same palette + same indices', () => {
    const truth = generateTruth({ seed: 1, colors: 3, shapeCount: 3, width: 96, height: 96 });
    const img = rasterizeTruth(truth);
    const a = quantize(img, { k: 4, seed: 99 });
    const b = quantize(img, { k: 4, seed: 99 });
    expect(a.palette).toEqual(b.palette);
    expect(a.indices).toEqual(b.indices);
  });

  it('recovers truth palette within ΔE<5 when k == truth color count', () => {
    // 1 bg color + N shape colors → k = N+1 should recover all.
    let passed = 0;
    const total = 6;
    for (let seed = 1; seed <= total; seed++) {
      const truth = generateTruth({ seed, colors: 3, shapeCount: 3, width: 96, height: 96 });
      const img = rasterizeTruth(truth);
      const { palette } = quantize(img, { k: 4, seed: 17 });
      const dists = bestMatchDeltaE([truth.background, ...truth.palette], palette);
      if (dists.every((d) => d < 5)) passed++;
    }
    expect(passed).toBeGreaterThanOrEqual(total - 1);
  });
});

describe('chooseK (elbow)', () => {
  it('recovers truth-k (±1) for ≥80% of seeds', () => {
    const seeds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    let within = 0;
    for (const seed of seeds) {
      // truth has 3 shapes + 1 background = 4 colors
      const truth = generateTruth({
        seed, colors: 3, shapeCount: 3, width: 96, height: 96,
      });
      const img = rasterizeTruth(truth);
      const { k } = chooseK(img, { seed: 17, maxK: 8 });
      if (Math.abs(k - 4) <= 1) within++;
    }
    const fraction = within / seeds.length;
    expect(fraction, `chooseK hit ${within}/${seeds.length}`).toBeGreaterThanOrEqual(0.8);
  });

  it('recovers exact truth-k for ≥90% of seeds on synthetic truth', () => {
    // When truth has N exact shape colors + 1 background, WCSS drops to ~0
    // at k=N+1. A good elbow should pick exactly that k.
    const seeds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    let exact = 0;
    for (const seed of seeds) {
      const truth = generateTruth({
        seed, colors: 3, shapeCount: 3, width: 96, height: 96,
      });
      const img = rasterizeTruth(truth);
      const { k } = chooseK(img, { seed: 17, maxK: 8 });
      if (k === 4) exact++;
    }
    const fraction = exact / seeds.length;
    expect(fraction, `chooseK exact hit ${exact}/${seeds.length}`).toBeGreaterThanOrEqual(0.9);
  });

  it('recovers exact truth-k for n=8 overlapping shapes using the default options', () => {
    // At 8 overlapping shapes + background the WCSS hits zero at k=9.
    // The default elbow search range must cover it.
    const seeds = [1, 2, 3, 4, 5, 6];
    let exact = 0;
    for (const seed of seeds) {
      const truth = generateTruth({
        seed, colors: 8, shapeCount: 8, width: 128, height: 128,
        allowOverlap: true,
      });
      const img = rasterizeTruth(truth);
      // NOTE: no explicit maxK — must work on default settings.
      const { k } = chooseK(img, { seed: 17 });
      if (k === 9) exact++;
    }
    expect(exact, `n=8 exact hit ${exact}/${seeds.length}`).toBeGreaterThanOrEqual(Math.ceil(seeds.length * 0.9));
  });

  it('wcssByK is monotonically non-increasing', () => {
    const truth = generateTruth({ seed: 1, colors: 3, shapeCount: 3, width: 64, height: 64 });
    const img = rasterizeTruth(truth);
    const { wcssByK } = chooseK(img, { seed: 17, maxK: 6 });
    for (let k = 2; k <= 6; k++) {
      expect(wcssByK[k]).toBeLessThanOrEqual(wcssByK[k - 1]! + 1e-6);
    }
  });
});

describe('autoQuantize', () => {
  it('returns both k and a palette of length k', () => {
    const truth = generateTruth({ seed: 1, colors: 3, shapeCount: 3, width: 64, height: 64 });
    const img = rasterizeTruth(truth);
    const r = autoQuantize(img, { seed: 17, maxK: 8 });
    expect(r.palette.length).toBe(r.k);
    expect(r.indices.length).toBe(64 * 64);
  });
});

describe('blind barrier: kmeans + elbow modules', () => {
  const algoFiles = [
    'src/algorithms/quantize/kmeans.ts',
    'src/algorithms/quantize/elbow.ts',
    'src/algorithms/quantize/index.ts',
  ];

  for (const rel of algoFiles) {
    it(`${rel} does not import from ground-truth modules`, () => {
      const src = readFileSync(
        resolve(__dirname, '../../../', rel),
        'utf-8',
      );
      expect(src).not.toMatch(/from ['"][^'"]*benchmarks\/ground-truth/);
      expect(src).not.toMatch(/import\(['"][^'"]*benchmarks\/ground-truth/);
    });
  }
});
