/**
 * Spatial-adjacency merge for gradient regions.
 *
 * Two palette clusters that form a gradient ramp share a long boundary
 * with each other (they're really one continuous region of colors).
 * Two independent shapes that happen to touch share a small boundary
 * relative to their perimeters. We use that signal to detect and merge
 * gradient-coupled clusters *after* the standard ΔE merge has run.
 *
 * Score:
 *   coupling(i, j) = boundary(i, j) / min(perimeter(i), perimeter(j))
 *
 * Pairs with coupling > COUPLING_THRESHOLD and Lab ΔE < DE_THRESHOLD
 * are merged greedily, largest-coupling first. Iterates until no pair
 * exceeds the threshold.
 *
 * Pure algorithm module — ImageData + QuantizeResult in, merged
 * QuantizeResult out. No ground-truth imports.
 */

import type { QuantizeResult } from './kmeans';

export interface CoupleOptions {
  /** Boundary-share fraction above which two clusters are considered coupled. */
  couplingThreshold?: number;
  /** Upper bound on Lab ΔE between centers for a valid coupling merge. */
  deThreshold?: number;
  /** Lower bound on the returned palette size. */
  minK?: number;
  /** Image dimensions required to compute adjacency. */
  width: number;
  height: number;
}

export interface CoupleResult extends QuantizeResult {
  /** Number of gradient-coupling merges performed. */
  coupled: number;
}

export function mergeGradientCoupled(
  initial: QuantizeResult,
  opts: CoupleOptions,
): CoupleResult {
  const couplingThreshold = opts.couplingThreshold ?? 0.4;
  const deThreshold = opts.deThreshold ?? 30;
  const minK = Math.max(1, opts.minK ?? 2);
  const { width, height } = opts;

  let palette = [...initial.palette];
  let indices = new Uint8Array(initial.indices);
  let coupled = 0;

  while (palette.length > minK) {
    const K = palette.length;
    const labs = palette.map(hexToLab);

    // Build adjacency + perimeter counts in one pass.
    const adjacency = new Float64Array(K * K);
    const perimeter = new Float64Array(K);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        const c = indices[i]!;
        // right neighbor
        if (x + 1 < width) {
          const cr = indices[i + 1]!;
          if (cr !== c) {
            adjacency[c * K + cr]! += 1;
            adjacency[cr * K + c]! += 1;
            perimeter[c]! += 1;
            perimeter[cr]! += 1;
          }
        }
        // bottom neighbor
        if (y + 1 < height) {
          const cb = indices[i + width]!;
          if (cb !== c) {
            adjacency[c * K + cb]! += 1;
            adjacency[cb * K + c]! += 1;
            perimeter[c]! += 1;
            perimeter[cb]! += 1;
          }
        }
      }
    }

    // Find the best pair by coupling score that also passes ΔE.
    let bestI = -1;
    let bestJ = -1;
    let bestScore = 0;
    for (let i = 0; i < K; i++) {
      for (let j = i + 1; j < K; j++) {
        const adj = adjacency[i * K + j]!;
        if (adj <= 0) continue;
        const pMin = Math.min(perimeter[i]!, perimeter[j]!);
        if (pMin <= 0) continue;
        const score = adj / pMin;
        if (score < couplingThreshold) continue;
        if (deltaELab(labs[i]!, labs[j]!) > deThreshold) continue;
        if (score > bestScore) {
          bestScore = score;
          bestI = i;
          bestJ = j;
        }
      }
    }
    if (bestI < 0) break;

    // Merge j into i (lower index wins for determinism). Reassign all
    // pixels of j to i, and weight-average the cluster centers.
    const countI = countIndex(indices, bestI);
    const countJ = countIndex(indices, bestJ);
    const total = countI + countJ;
    const merged: [number, number, number] = [
      (labs[bestI]![0] * countI + labs[bestJ]![0] * countJ) / total,
      (labs[bestI]![1] * countI + labs[bestJ]![1] * countJ) / total,
      (labs[bestI]![2] * countI + labs[bestJ]![2] * countJ) / total,
    ];
    palette[bestI] = labToHex(merged);

    // Remove cluster bestJ: shift later clusters down by one.
    palette = palette.filter((_, k) => k !== bestJ);
    const newIndices = new Uint8Array(indices.length);
    for (let p = 0; p < indices.length; p++) {
      const c = indices[p]!;
      if (c === bestJ) newIndices[p] = bestI;
      else if (c > bestJ) newIndices[p] = c - 1;
      else newIndices[p] = c;
    }
    indices = newIndices;
    coupled++;
  }

  return { palette, indices, wcss: initial.wcss, coupled };
}

function countIndex(indices: Uint8Array, target: number): number {
  let n = 0;
  for (let i = 0; i < indices.length; i++) if (indices[i] === target) n++;
  return n;
}

// --- Lab helpers (kept local to preserve the blind barrier) ---
function srgbToLinear(v: number): number {
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}
function linearToSrgb(v: number): number {
  return v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
}
function labF(t: number): number {
  const d = 6 / 29;
  return t > d * d * d ? Math.cbrt(t) : t / (3 * d * d) + 4 / 29;
}
function labFinv(t: number): number {
  const d = 6 / 29;
  return t > d ? t * t * t : 3 * d * d * (t - 4 / 29);
}
function hexToLab(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 0xff) / 255;
  const g = ((n >> 8) & 0xff) / 255;
  const b = (n & 0xff) / 255;
  const R = srgbToLinear(r);
  const G = srgbToLinear(g);
  const B = srgbToLinear(b);
  const x = R * 0.4124564 + G * 0.3575761 + B * 0.1804375;
  const y = R * 0.2126729 + G * 0.7151522 + B * 0.072175;
  const z = R * 0.0193339 + G * 0.119192 + B * 0.9503041;
  const fx = labF(x / 0.95047);
  const fy = labF(y / 1.0);
  const fz = labF(z / 1.08883);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
function labToHex(lab: [number, number, number]): string {
  const [L, a, b] = lab;
  const fy = (L + 16) / 116;
  const fx = a / 500 + fy;
  const fz = fy - b / 200;
  const X = 0.95047 * labFinv(fx);
  const Y = 1.0 * labFinv(fy);
  const Z = 1.08883 * labFinv(fz);
  const R = X * 3.2404542 + Y * -1.5371385 + Z * -0.4985314;
  const G = X * -0.969266 + Y * 1.8760108 + Z * 0.041556;
  const B = X * 0.0556434 + Y * -0.2040259 + Z * 1.0572252;
  const to255 = (v: number) => Math.max(0, Math.min(255, Math.round(linearToSrgb(v) * 255)));
  return `#${toHex(to255(R))}${toHex(to255(G))}${toHex(to255(B))}`;
}
function toHex(v: number): string {
  return v.toString(16).padStart(2, '0');
}
function deltaELab(a: [number, number, number], b: [number, number, number]): number {
  const dL = a[0] - b[0];
  const da = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt(dL * dL + da * da + db * db);
}
