import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  runMultiColorPipeline,
  multicolorToImageData,
} from '../../src/algorithms/pipeline-multicolor';
import { generateTruth } from '../../src/benchmarks/ground-truth/generator';
import { rasterizeTruth } from '../../src/benchmarks/ground-truth/rasterize';
import { computeLoss } from '../../src/benchmarks/ground-truth/loss';

describe('runMultiColorPipeline', () => {
  it('with k=1 produces a single-layer SVG', () => {
    const truth = generateTruth({ seed: 1, colors: 1, shapeCount: 1, width: 64, height: 64 });
    const img = rasterizeTruth(truth);
    const result = runMultiColorPipeline(img, { k: 1 });
    expect(result.palette.length).toBe(1);
    expect(result.layers.length).toBe(1);
    expect(result.svg).toContain('<path');
  });

  it('produces one palette entry per k when k is manual', () => {
    const truth = generateTruth({ seed: 2, colors: 2, shapeCount: 2, width: 80, height: 80 });
    const img = rasterizeTruth(truth);
    const result = runMultiColorPipeline(img, { k: 3 });
    expect(result.palette.length).toBe(3);
    expect(result.indices.length).toBe(80 * 80);
    expect(result.k).toBe(3);
  });

  it('auto-k (elbow) recovers reasonable loss on clean synthetic truth', () => {
    const seeds = [1, 2, 3, 4, 5];
    const losses: number[] = [];
    for (const seed of seeds) {
      const truth = generateTruth({
        seed, colors: 3, shapeCount: 3, width: 96, height: 96,
      });
      const img = rasterizeTruth(truth);
      const result = runMultiColorPipeline(img);
      const rasterized = multicolorToImageData(result);
      const report = computeLoss(truth, { palette: result.palette, rasterized });
      losses.push(report.loss);
    }
    const median = [...losses].sort((a, b) => a - b)[Math.floor(losses.length / 2)]!;
    // Baseline: median loss across 5 seeds. Not a pass/fail on absolute
    // quality; guards against total regression.
    expect(median, `loss distribution: ${losses.map((l) => l.toFixed(3)).join(', ')}`).toBeLessThan(0.5);
  });

  it('SVG has one <path fill="..."> per non-empty layer', () => {
    const truth = generateTruth({ seed: 7, colors: 2, shapeCount: 2, width: 64, height: 64 });
    const img = rasterizeTruth(truth);
    const result = runMultiColorPipeline(img, { k: 3 });
    for (const layer of result.layers) {
      for (const _d of layer.pathData) {
        expect(result.svg).toContain(`fill="${layer.color}"`);
      }
    }
  });

  it('determinism: same inputs → identical result', () => {
    const truth = generateTruth({ seed: 9, colors: 3, shapeCount: 3, width: 64, height: 64 });
    const img = rasterizeTruth(truth);
    const a = runMultiColorPipeline(img, { k: 4, seed: 17 });
    const b = runMultiColorPipeline(img, { k: 4, seed: 17 });
    expect(a.palette).toEqual(b.palette);
    expect(a.indices).toEqual(b.indices);
    expect(a.svg).toBe(b.svg);
  });
});

describe('blind barrier: pipeline-multicolor', () => {
  it('pipeline-multicolor.ts does not import from ground-truth modules', () => {
    const src = readFileSync(
      resolve(__dirname, '../../src/algorithms/pipeline-multicolor.ts'),
      'utf-8',
    );
    expect(src).not.toMatch(/from ['"][^'"]*benchmarks\/ground-truth/);
    expect(src).not.toMatch(/import\(['"][^'"]*benchmarks\/ground-truth/);
  });
});
