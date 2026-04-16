import { describe, it, expect } from 'vitest';
import { generateTruth } from '../../../src/benchmarks/ground-truth/generator';
import { rasterizeTruth } from '../../../src/benchmarks/ground-truth/rasterize';
import { computeLoss } from '../../../src/benchmarks/ground-truth/loss';
import type { VectorOutput } from '../../../src/benchmarks/ground-truth/loss';
import { hexToRgb } from '../../../src/benchmarks/ground-truth/palette';

function makeOutputFromTruth(truth: ReturnType<typeof generateTruth>): VectorOutput {
  return { palette: [...truth.palette], rasterized: rasterizeTruth(truth) };
}

function recolor(img: ImageData, from: string, to: string): ImageData {
  const [fr, fg, fb] = hexToRgb(from);
  const [tr, tg, tb] = hexToRgb(to);
  const data = new Uint8ClampedArray(img.data);
  for (let i = 0; i < img.width * img.height; i++) {
    if (data[i * 4] === fr && data[i * 4 + 1] === fg && data[i * 4 + 2] === fb) {
      data[i * 4] = tr;
      data[i * 4 + 1] = tg;
      data[i * 4 + 2] = tb;
    }
  }
  return { data, width: img.width, height: img.height, colorSpace: 'srgb' } as unknown as ImageData;
}

describe('computeLoss', () => {
  it('perfect reconstruction → loss near 0', () => {
    const truth = generateTruth({ seed: 1, colors: 3, shapeCount: 3, width: 128, height: 128 });
    const out = makeOutputFromTruth(truth);
    const report = computeLoss(truth, out);
    expect(report.loss).toBeLessThan(0.05);
    expect(report.paletteMatch).toBeGreaterThan(0.95);
    expect(report.coverageIoU).toBeGreaterThan(0.95);
  });

  it('wrong palette color → paletteMatch drops', () => {
    const truth = generateTruth({ seed: 1, colors: 2, shapeCount: 2, width: 128, height: 128 });
    const perfect = makeOutputFromTruth(truth);
    const perfectReport = computeLoss(truth, perfect);
    const wrongPal: VectorOutput = {
      palette: ['#000000', '#111111'],
      rasterized: perfect.rasterized,
    };
    const wrongReport = computeLoss(truth, wrongPal);
    expect(wrongReport.paletteMatch).toBeLessThan(perfectReport.paletteMatch - 0.3);
  });

  it('missing shape → coverageIoU drops', () => {
    const truth = generateTruth({ seed: 2, colors: 2, shapeCount: 2, width: 128, height: 128 });
    const full = makeOutputFromTruth(truth);
    // Erase one shape color.
    const erased = recolor(full.rasterized, truth.palette[0]!, truth.background);
    const report = computeLoss(truth, { palette: [...truth.palette], rasterized: erased });
    expect(report.coverageIoU).toBeLessThan(0.6);
    expect(report.loss).toBeGreaterThan(0.2);
  });

  it('deterministic: same inputs → same report', () => {
    const truth = generateTruth({ seed: 5, colors: 3, shapeCount: 3, width: 100, height: 100 });
    const out = makeOutputFromTruth(truth);
    expect(computeLoss(truth, out)).toEqual(computeLoss(truth, out));
  });

  it('palette permutation doesn\'t affect loss', () => {
    const truth = generateTruth({ seed: 3, colors: 3, shapeCount: 3, width: 128, height: 128 });
    const out = makeOutputFromTruth(truth);
    const permuted: VectorOutput = {
      palette: [out.palette[2]!, out.palette[0]!, out.palette[1]!],
      rasterized: out.rasterized,
    };
    const a = computeLoss(truth, out);
    const b = computeLoss(truth, permuted);
    expect(a.loss).toBeCloseTo(b.loss, 6);
  });

  it('rejects size mismatch', () => {
    const truth = generateTruth({ seed: 1, colors: 1, shapeCount: 1, width: 64, height: 64 });
    const wrongSize: VectorOutput = {
      palette: [...truth.palette],
      rasterized: {
        data: new Uint8ClampedArray(32 * 32 * 4),
        width: 32,
        height: 32,
        colorSpace: 'srgb',
      } as unknown as ImageData,
    };
    expect(() => computeLoss(truth, wrongSize)).toThrow(/size/);
  });
});
