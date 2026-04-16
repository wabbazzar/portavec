/**
 * Seeded PRNG used by the ground-truth generator.
 *
 * Mulberry32: 32-bit state, ~2^32 period, fast, deterministic.
 * Chosen for portability (no crypto APIs, same output in Node + browser).
 */

export interface Rng {
  /** Uniform float in [0, 1). */
  next(): number;
  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number;
  /** Float in [min, max). */
  range(min: number, max: number): number;
  /** Pick a random element. */
  pick<T>(arr: readonly T[]): T;
}

export function mulberry32(seed: number): Rng {
  // Normalize seed to 32-bit unsigned.
  let state = seed >>> 0;

  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    range: (min, max) => min + next() * (max - min),
    pick: (arr) => {
      if (arr.length === 0) throw new Error('pick() on empty array');
      return arr[Math.floor(next() * arr.length)]!;
    },
  };
}
