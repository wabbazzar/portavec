import { describe, it, expect } from 'vitest';
import { generateTruth, shapeBounds } from '../../../src/benchmarks/ground-truth/generator';
import type { GeneratorInput } from '../../../src/benchmarks/ground-truth/schema';

function input(partial: Partial<GeneratorInput> = {}): GeneratorInput {
  return {
    seed: 1,
    colors: 2,
    shapeCount: 2,
    width: 256,
    height: 256,
    ...partial,
  } as GeneratorInput;
}

describe('generateTruth', () => {
  it('is deterministic for the same input', () => {
    const a = generateTruth(input({ seed: 42 }));
    const b = generateTruth(input({ seed: 42 }));
    expect(a).toEqual(b);
  });

  it('different seeds produce different truths', () => {
    const a = generateTruth(input({ seed: 1 }));
    const b = generateTruth(input({ seed: 2 }));
    expect(a).not.toEqual(b);
  });

  it('produces exactly shapeCount shapes', () => {
    for (const n of [1, 2, 3] as const) {
      const t = generateTruth(input({ colors: n, shapeCount: n, seed: 5 }));
      expect(t.shapes.length).toBe(n);
      expect(t.palette.length).toBe(n);
    }
  });

  it('every shape has a distinct color from the palette', () => {
    const t = generateTruth(input({ colors: 3, shapeCount: 3, seed: 9 }));
    const colors = t.shapes.map((s) => s.color);
    expect(new Set(colors).size).toBe(t.shapes.length);
    for (const c of colors) expect(t.palette).toContain(c);
  });

  it('all shape bounding boxes fit in the canvas', () => {
    const W = 256;
    const H = 256;
    for (let seed = 1; seed <= 10; seed++) {
      const t = generateTruth(input({ seed, colors: 3, shapeCount: 3, width: W, height: H }));
      for (const s of t.shapes) {
        const b = shapeBounds(s);
        expect(b.x).toBeGreaterThanOrEqual(0);
        expect(b.y).toBeGreaterThanOrEqual(0);
        expect(b.x + b.w).toBeLessThanOrEqual(W);
        expect(b.y + b.h).toBeLessThanOrEqual(H);
      }
    }
  });

  it('shape bounding boxes do not overlap', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const t = generateTruth(input({ seed, colors: 3, shapeCount: 3 }));
      const bs = t.shapes.map(shapeBounds);
      for (let i = 0; i < bs.length; i++) {
        for (let j = i + 1; j < bs.length; j++) {
          const a = bs[i]!;
          const b = bs[j]!;
          const overlap = !(
            a.x + a.w <= b.x ||
            b.x + b.w <= a.x ||
            a.y + a.h <= b.y ||
            b.y + b.h <= a.y
          );
          expect(overlap, `seed=${seed} shapes ${i},${j}`).toBe(false);
        }
      }
    }
  });

  it('rejects mismatched colors and shapeCount', () => {
    expect(() =>
      generateTruth(input({ colors: 2, shapeCount: 3 })),
    ).toThrow(/colors.*shapeCount/);
  });

  it('places 8 shapes with allowOverlap=true', () => {
    const t = generateTruth(input({
      colors: 8, shapeCount: 8, allowOverlap: true,
      width: 256, height: 256, seed: 17,
    }));
    expect(t.shapes.length).toBe(8);
    expect(t.palette.length).toBe(8);
  });

  it('places 16 shapes with allowOverlap=true', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const t = generateTruth(input({
        colors: 16, shapeCount: 16, allowOverlap: true,
        width: 256, height: 256, seed,
      }));
      expect(t.shapes.length).toBe(16);
      expect(t.palette.length).toBe(16);
      expect(new Set(t.palette).size).toBe(16);
    }
  });

  it('rejects out-of-range shapeCount', () => {
    expect(() => generateTruth(input({ colors: 0 as any, shapeCount: 0 as any }))).toThrow();
    expect(() => generateTruth(input({ colors: 17 as any, shapeCount: 17 as any }))).toThrow();
  });

  it('allowOverlap=true produces some overlapping bboxes on avg', () => {
    // Across many seeds at count=4, at least some runs should have overlap.
    let runsWithOverlap = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const t = generateTruth(input({
        colors: 4, shapeCount: 4, allowOverlap: true, seed,
      }));
      const bs = t.shapes.map(shapeBounds);
      outer: for (let i = 0; i < bs.length; i++) {
        for (let j = i + 1; j < bs.length; j++) {
          const a = bs[i]!;
          const b = bs[j]!;
          const overlap = !(
            a.x + a.w <= b.x || b.x + b.w <= a.x ||
            a.y + a.h <= b.y || b.y + b.h <= a.y
          );
          if (overlap) { runsWithOverlap++; break outer; }
        }
      }
    }
    expect(runsWithOverlap, 'expect overlap in most seeds').toBeGreaterThan(3);
  });

  it('allowOverlap=false (default) still enforces no bbox overlap', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const t = generateTruth(input({ colors: 3, shapeCount: 3, seed }));
      const bs = t.shapes.map(shapeBounds);
      for (let i = 0; i < bs.length; i++) {
        for (let j = i + 1; j < bs.length; j++) {
          const a = bs[i]!;
          const b = bs[j]!;
          const overlap = !(
            a.x + a.w <= b.x || b.x + b.w <= a.x ||
            a.y + a.h <= b.y || b.y + b.h <= a.y
          );
          expect(overlap).toBe(false);
        }
      }
    }
  });
});
