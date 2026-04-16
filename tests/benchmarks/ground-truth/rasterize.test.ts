import { describe, it, expect } from 'vitest';
import { generateTruth } from '../../../src/benchmarks/ground-truth/generator';
import { rasterizeTruth } from '../../../src/benchmarks/ground-truth/rasterize';
import { hexToRgb } from '../../../src/benchmarks/ground-truth/palette';
import type { Truth } from '../../../src/benchmarks/ground-truth/schema';

function countPixelsByColor(img: ImageData): Map<string, number> {
  const m = new Map<string, number>();
  for (let i = 0; i < img.width * img.height; i++) {
    const r = img.data[i * 4]!;
    const g = img.data[i * 4 + 1]!;
    const b = img.data[i * 4 + 2]!;
    const key = `${r},${g},${b}`;
    m.set(key, (m.get(key) ?? 0) + 1);
  }
  return m;
}

function colorKey(hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  return `${r},${g},${b}`;
}

function countShapeColor(img: ImageData, hex: string): number {
  return countPixelsByColor(img).get(colorKey(hex)) ?? 0;
}

describe('rasterizeTruth', () => {
  it('circle area ≈ πr² within 2%', () => {
    const truth: Truth = {
      width: 200,
      height: 200,
      background: '#ffffff',
      palette: ['#ff0000'],
      shapes: [{ kind: 'circle', cx: 100, cy: 100, r: 50, color: '#ff0000' }],
      seed: 0,
    };
    const img = rasterizeTruth(truth);
    const actual = countShapeColor(img, '#ff0000');
    const expected = Math.PI * 50 * 50;
    expect(Math.abs(actual - expected) / expected).toBeLessThan(0.02);
  });

  it('rectangle area = w × h exactly', () => {
    const truth: Truth = {
      width: 100,
      height: 100,
      background: '#ffffff',
      palette: ['#00ff00'],
      shapes: [{ kind: 'rectangle', x: 10, y: 20, w: 30, h: 40, color: '#00ff00' }],
      seed: 0,
    };
    const img = rasterizeTruth(truth);
    expect(countShapeColor(img, '#00ff00')).toBe(30 * 40);
  });

  it('triangle area ≈ 0.5 × |det| within 2%', () => {
    // Right triangle, legs 60 and 80, area = 2400.
    const truth: Truth = {
      width: 150,
      height: 150,
      background: '#ffffff',
      palette: ['#0000ff'],
      shapes: [
        {
          kind: 'triangle',
          p1: { x: 10, y: 10 },
          p2: { x: 70, y: 10 },
          p3: { x: 10, y: 90 },
          color: '#0000ff',
        },
      ],
      seed: 0,
    };
    const img = rasterizeTruth(truth);
    const actual = countShapeColor(img, '#0000ff');
    expect(Math.abs(actual - 2400) / 2400).toBeLessThan(0.02);
  });

  it('background + shape pixel counts equal total', () => {
    const truth = generateTruth({
      seed: 3,
      colors: 3,
      shapeCount: 3,
      width: 128,
      height: 128,
    });
    const img = rasterizeTruth(truth);
    const counts = countPixelsByColor(img);
    let total = 0;
    for (const v of counts.values()) total += v;
    expect(total).toBe(128 * 128);
  });

  it('all image pixels are either background or a palette color', () => {
    const truth = generateTruth({
      seed: 7,
      colors: 3,
      shapeCount: 3,
      width: 100,
      height: 100,
    });
    const img = rasterizeTruth(truth);
    const allowed = new Set([colorKey(truth.background), ...truth.palette.map(colorKey)]);
    const counts = countPixelsByColor(img);
    for (const key of counts.keys()) {
      expect(allowed.has(key), `unexpected color ${key}`).toBe(true);
    }
  });

  it('deterministic: same truth → identical ImageData', () => {
    const truth = generateTruth({
      seed: 11,
      colors: 2,
      shapeCount: 2,
      width: 80,
      height: 80,
    });
    const a = rasterizeTruth(truth);
    const b = rasterizeTruth(truth);
    expect(a.data).toEqual(b.data);
  });

  it('z-order: last shape paints over earlier shapes', () => {
    // Two rectangles sharing the top-left corner. Last one must win.
    const truth: Truth = {
      width: 50,
      height: 50,
      background: '#ffffff',
      palette: ['#ff0000', '#00ff00'],
      shapes: [
        { kind: 'rectangle', x: 0, y: 0, w: 40, h: 40, color: '#ff0000' },
        { kind: 'rectangle', x: 0, y: 0, w: 20, h: 20, color: '#00ff00' },
      ],
      seed: 0,
    };
    const img = rasterizeTruth(truth);
    // (10, 10) is covered by both; should be green (last painted).
    const idx = 10 * 50 + 10;
    expect(img.data[idx * 4]).toBe(0);
    expect(img.data[idx * 4 + 1]).toBe(255);
    expect(img.data[idx * 4 + 2]).toBe(0);
    // (30, 30) is only covered by the red square.
    const idx2 = 30 * 50 + 30;
    expect(img.data[idx2 * 4]).toBe(255);
    expect(img.data[idx2 * 4 + 1]).toBe(0);
  });
});
