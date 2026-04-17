import { describe, it, expect } from 'vitest';
import { mulberry32 } from '../../../src/benchmarks/ground-truth/rng';
import { pickPalette, hexToRgb } from '../../../src/benchmarks/ground-truth/palette';

describe('pickPalette', () => {
  it('returns n distinct colors', () => {
    for (const n of [1, 2, 3, 4, 8, 16]) {
      const palette = pickPalette(mulberry32(1), n);
      expect(palette.length).toBe(n);
      expect(new Set(palette).size).toBe(n);
    }
  });

  it('produces the same palette for the same seed', () => {
    const a = pickPalette(mulberry32(42), 4);
    const b = pickPalette(mulberry32(42), 4);
    expect(a).toEqual(b);
  });

  it('produces different palettes for different seeds', () => {
    const a = pickPalette(mulberry32(1), 4);
    const b = pickPalette(mulberry32(2), 4);
    expect(a).not.toEqual(b);
  });

  it('all colors parse as valid hex', () => {
    const palette = pickPalette(mulberry32(5), 8);
    for (const c of palette) {
      expect(c).toMatch(/^#[0-9a-f]{6}$/);
      const [r, g, b] = hexToRgb(c);
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThanOrEqual(255);
      expect(g).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThanOrEqual(255);
    }
  });

  it('rejects out-of-range n', () => {
    expect(() => pickPalette(mulberry32(1), 0)).toThrow();
    expect(() => pickPalette(mulberry32(1), 31)).toThrow();
    expect(() => pickPalette(mulberry32(1), 1.5)).toThrow();
  });

  it('snapshot for seed=1 at n=4', () => {
    expect(pickPalette(mulberry32(1), 4)).toEqual([
      '#204ddf',
      '#df20ad',
      '#dfb220',
      '#20df52',
    ]);
  });
});
