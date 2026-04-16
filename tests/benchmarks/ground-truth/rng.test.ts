import { describe, it, expect } from 'vitest';
import { mulberry32 } from '../../../src/benchmarks/ground-truth/rng';

describe('mulberry32', () => {
  it('produces the same sequence for the same seed', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 100; i++) {
      expect(a.next()).toBe(b.next());
    }
  });

  it('produces different sequences for different seeds', () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    let differ = false;
    for (let i = 0; i < 10; i++) {
      if (a.next() !== b.next()) {
        differ = true;
        break;
      }
    }
    expect(differ).toBe(true);
  });

  it('next() returns values in [0, 1)', () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 1000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('int() respects inclusive bounds', () => {
    const rng = mulberry32(13);
    for (let i = 0; i < 500; i++) {
      const v = rng.int(5, 10);
      expect(v).toBeGreaterThanOrEqual(5);
      expect(v).toBeLessThanOrEqual(10);
      expect(Number.isInteger(v)).toBe(true);
    }
  });

  it('pick() returns elements from the array', () => {
    const rng = mulberry32(99);
    const arr = ['a', 'b', 'c'];
    for (let i = 0; i < 50; i++) {
      expect(arr).toContain(rng.pick(arr));
    }
  });

  it('pick() throws on empty array', () => {
    expect(() => mulberry32(1).pick([])).toThrow();
  });
});
