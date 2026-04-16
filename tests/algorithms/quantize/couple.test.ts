import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mergeGradientCoupled } from '../../../src/algorithms/quantize';
import type { QuantizeResult } from '../../../src/algorithms/quantize';

function checkerboard(cellA: string, cellB: string, W = 8, H = 8): QuantizeResult {
  // Two clusters interleaved so every pixel has an opposite-color neighbor.
  // Every cluster's entire perimeter is coupled to the other — classic
  // gradient-like spatial coupling.
  const indices = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      indices[y * W + x] = (x + y) % 2;
    }
  }
  return { palette: [cellA, cellB], indices, wcss: 0 };
}

function separated(W = 10, H = 10): QuantizeResult {
  // Left half cluster 0, right half cluster 1. Boundary is only 10 edges.
  // Coupling fraction is small (not merged).
  const indices = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      indices[y * W + x] = x < W / 2 ? 0 : 1;
    }
  }
  return { palette: ['#ff0000', '#ff4400'], indices, wcss: 0 };
}

describe('mergeGradientCoupled', () => {
  it('merges near-color clusters that are fully interleaved', () => {
    // Checkerboard of two near-identical colors → high coupling + low ΔE.
    const initial = checkerboard('#ff2200', '#ff2800', 8, 8);
    const merged = mergeGradientCoupled(initial, { width: 8, height: 8, minK: 1 });
    expect(merged.palette.length).toBe(1);
    expect(merged.coupled).toBe(1);
  });

  it('does not merge far-apart colors even when coupled', () => {
    // Same spatial coupling but ΔE > threshold.
    const initial = checkerboard('#ff0000', '#00ff00', 8, 8);
    const merged = mergeGradientCoupled(initial, { width: 8, height: 8 });
    expect(merged.palette.length).toBe(2);
    expect(merged.coupled).toBe(0);
  });

  it('does not merge close colors that are spatially separated', () => {
    // Low coupling (only 10 edges shared), not merged.
    const initial = separated(10, 10);
    const merged = mergeGradientCoupled(initial, { width: 10, height: 10 });
    expect(merged.palette.length).toBe(2);
    expect(merged.coupled).toBe(0);
  });

  it('respects minK lower bound', () => {
    const initial = checkerboard('#ff2200', '#ff2800', 6, 6);
    const merged = mergeGradientCoupled(initial, { width: 6, height: 6, minK: 2 });
    expect(merged.palette.length).toBe(2);
  });

  it('is deterministic for fixed inputs', () => {
    const initial = checkerboard('#ff2200', '#ff2800', 8, 8);
    const a = mergeGradientCoupled(initial, { width: 8, height: 8 });
    const b = mergeGradientCoupled(initial, { width: 8, height: 8 });
    expect(a.palette).toEqual(b.palette);
    expect(a.indices).toEqual(b.indices);
  });
});

describe('blind barrier: couple.ts', () => {
  it('does not import from ground-truth modules', () => {
    const src = readFileSync(
      resolve(__dirname, '../../../src/algorithms/quantize/couple.ts'),
      'utf-8',
    );
    expect(src).not.toMatch(/from ['"][^'"]*benchmarks\/ground-truth/);
    expect(src).not.toMatch(/import\(['"][^'"]*benchmarks\/ground-truth/);
  });
});
