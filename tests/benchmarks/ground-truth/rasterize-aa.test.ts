import { describe, it, expect } from 'vitest';
import { generateTruth } from '../../../src/benchmarks/ground-truth/generator';
import { rasterizeTruth } from '../../../src/benchmarks/ground-truth/rasterize';
import { rasterizeTruthAa } from '../../../src/benchmarks/ground-truth/rasterize-aa';
import { hexToRgb } from '../../../src/benchmarks/ground-truth/palette';
import type { Truth } from '../../../src/benchmarks/ground-truth/schema';

function countExact(img: ImageData, hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  let n = 0;
  for (let i = 0; i < img.width * img.height; i++) {
    if (img.data[i * 4] === r && img.data[i * 4 + 1] === g && img.data[i * 4 + 2] === b) n++;
  }
  return n;
}

function countPartial(img: ImageData, hex: string, tolerance: number): number {
  const [r, g, b] = hexToRgb(hex);
  let n = 0;
  for (let i = 0; i < img.width * img.height; i++) {
    const dr = Math.abs(img.data[i * 4]! - r);
    const dg = Math.abs(img.data[i * 4 + 1]! - g);
    const db = Math.abs(img.data[i * 4 + 2]! - b);
    if (dr > 0 && dr <= tolerance && dg <= tolerance + 2 && db <= tolerance + 2) n++;
  }
  return n;
}

describe('rasterizeTruthAa', () => {
  it('factor=1 reduces to integer raster', () => {
    const truth = generateTruth({ seed: 1, colors: 2, shapeCount: 2, width: 64, height: 64 });
    const aa = rasterizeTruthAa(truth, { factor: 1 });
    const exact = rasterizeTruth(truth);
    expect(aa.data).toEqual(exact.data);
  });

  it('factor=4 introduces edge-transition pixels that are neither truth color nor background', () => {
    const truth: Truth = {
      width: 80,
      height: 80,
      background: '#ffffff',
      palette: ['#000000'],
      shapes: [{ kind: 'circle', cx: 40, cy: 40, r: 20, color: '#000000' }],
      seed: 0,
    };
    const exact = rasterizeTruth(truth);
    const aa = rasterizeTruthAa(truth, { factor: 4 });
    // Exact raster: every pixel is exactly bg or fg. AA raster: has a
    // ring of partial-alpha gray pixels along the circle boundary.
    const exactDistinctColors = new Set<string>();
    for (let i = 0; i < exact.width * exact.height; i++) {
      exactDistinctColors.add(
        `${exact.data[i * 4]},${exact.data[i * 4 + 1]},${exact.data[i * 4 + 2]}`,
      );
    }
    const aaDistinctColors = new Set<string>();
    for (let i = 0; i < aa.width * aa.height; i++) {
      aaDistinctColors.add(
        `${aa.data[i * 4]},${aa.data[i * 4 + 1]},${aa.data[i * 4 + 2]}`,
      );
    }
    expect(exactDistinctColors.size).toBe(2);
    expect(aaDistinctColors.size).toBeGreaterThan(5);
  });

  it('factor=4 interior of large shapes still gets exact color', () => {
    const truth: Truth = {
      width: 80,
      height: 80,
      background: '#ffffff',
      palette: ['#ff0000'],
      shapes: [{ kind: 'rectangle', x: 10, y: 10, w: 60, h: 60, color: '#ff0000' }],
      seed: 0,
    };
    const aa = rasterizeTruthAa(truth, { factor: 4 });
    const interior = (y: number, x: number) => (y * 80 + x) * 4;
    const idx = interior(40, 40);
    expect(aa.data[idx]).toBe(255);
    expect(aa.data[idx + 1]).toBe(0);
    expect(aa.data[idx + 2]).toBe(0);
  });

  it('deterministic', () => {
    const truth = generateTruth({ seed: 3, colors: 2, shapeCount: 2, width: 64, height: 64 });
    const a = rasterizeTruthAa(truth, { factor: 4 });
    const b = rasterizeTruthAa(truth, { factor: 4 });
    expect(a.data).toEqual(b.data);
  });

  it('circle edges get partial-alpha transition pixels', () => {
    // Circles have non-integer boundaries, so AA produces pinks along
    // the edge. Rectangles on integer grid positions don't — that's
    // the classic pixel-art fact.
    const truth: Truth = {
      width: 80,
      height: 80,
      background: '#ffffff',
      palette: ['#ff0000'],
      shapes: [{ kind: 'circle', cx: 40, cy: 40, r: 20, color: '#ff0000' }],
      seed: 0,
    };
    const aa = rasterizeTruthAa(truth, { factor: 4 });
    let pinks = 0;
    for (let i = 0; i < aa.width * aa.height; i++) {
      const r = aa.data[i * 4]!;
      const g = aa.data[i * 4 + 1]!;
      const b = aa.data[i * 4 + 2]!;
      if (r === 255 && g > 0 && g < 255 && b > 0 && b < 255) pinks++;
    }
    expect(pinks).toBeGreaterThan(8);
    expect(countExact(aa, '#ff0000')).toBeGreaterThan(0);
    void countPartial;
  });
});
