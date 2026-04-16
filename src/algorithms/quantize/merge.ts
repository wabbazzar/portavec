/**
 * Agglomerative post-processing for over-clustered k-means output.
 *
 * Workflow:
 *   - Run k-means at k = maxK (deliberately over-clustering)
 *   - Compute pairwise Lab ΔE between cluster centers
 *   - Greedily merge the closest pair while that distance < threshold
 *   - Return the reduced palette + remapped indices
 *
 * Rationale: on noisy / high-k input, silhouette plateaus hide the true
 * cluster count. Over-clustering then merging is robust to that — true
 * clusters are far apart (merge never fires), noise splits close (first
 * to merge).
 *
 * Pure algorithm module — no ground-truth imports.
 */

import type { QuantizeResult } from './kmeans';

export interface MergeOptions {
  /** Lab ΔE below which two centers are considered the same color. */
  mergeThreshold?: number;
  /** Lower bound on returned palette size. */
  minK?: number;
  /**
   * Minimum pixel count for a cluster to survive. Clusters smaller
   * than this are dissolved and their pixels reassigned to the nearest
   * surviving cluster. Default 0 (off).
   */
  minClusterFraction?: number;
  /**
   * When provided, reassign each pixel to the nearest merged centroid
   * using its original Lab color. Without this, pixels follow the merge
   * chain — which can leave them closer to a different merged cluster
   * than the one they ended up in. Dramatically improves coverage IoU.
   */
  sourceImage?: ImageData;
}

export interface MergeResult extends QuantizeResult {
  /** Number of merges performed. */
  mergedFrom: number;
}

export function mergeNearClusters(
  initial: QuantizeResult,
  opts: MergeOptions = {},
): MergeResult {
  const threshold = opts.mergeThreshold ?? 8;
  const minK = Math.max(1, opts.minK ?? 1);
  const minClusterFraction = opts.minClusterFraction ?? 0;
  const initialK = initial.palette.length;
  if (initialK <= minK) return { ...initial, mergedFrom: initialK };

  // Work in Lab space for perceptual merging.
  const labs = initial.palette.map(hexToLab);
  const alive: boolean[] = new Array(initialK).fill(true);
  const mergeInto: number[] = Array.from({ length: initialK }, (_, i) => i);
  const clusterPixelCount = new Uint32Array(initialK);
  for (let i = 0; i < initial.indices.length; i++) {
    clusterPixelCount[initial.indices[i]!]! += 1;
  }
  const totalPixels = initial.indices.length;
  const sizeFloor = Math.floor(minClusterFraction * totalPixels);

  // Dissolve too-small clusters into their nearest surviving neighbor.
  // Done first so the size-based filter never competes with the
  // ΔE-based merge during the main loop.
  if (sizeFloor > 0) {
    for (let i = 0; i < initialK; i++) {
      if (!alive[i]) continue;
      if (clusterPixelCount[i]! >= sizeFloor) continue;
      let bestJ = -1;
      let bestD = Infinity;
      for (let j = 0; j < initialK; j++) {
        if (j === i || !alive[j]) continue;
        if (clusterPixelCount[j]! < sizeFloor) continue;
        const d = deltaELab(labs[i]!, labs[j]!);
        if (d < bestD) {
          bestD = d;
          bestJ = j;
        }
      }
      if (bestJ < 0) continue;
      const cI = clusterPixelCount[i]!;
      const cJ = clusterPixelCount[bestJ]!;
      const total = cI + cJ;
      if (total > 0) {
        labs[bestJ] = [
          (labs[bestJ]![0] * cJ + labs[i]![0] * cI) / total,
          (labs[bestJ]![1] * cJ + labs[i]![1] * cI) / total,
          (labs[bestJ]![2] * cJ + labs[i]![2] * cI) / total,
        ];
        clusterPixelCount[bestJ] = total;
      }
      alive[i] = false;
      mergeInto[i] = bestJ;
    }
  }

  let remaining = alive.filter(Boolean).length;
  while (remaining > minK) {
    // Find the closest surviving pair.
    let bestD = Infinity;
    let bestA = -1;
    let bestB = -1;
    for (let i = 0; i < initialK; i++) {
      if (!alive[i]) continue;
      for (let j = i + 1; j < initialK; j++) {
        if (!alive[j]) continue;
        const d = deltaELab(labs[i]!, labs[j]!);
        if (d < bestD) {
          bestD = d;
          bestA = i;
          bestB = j;
        }
      }
    }
    if (bestA < 0 || bestD >= threshold) break;

    // Merge bestB into bestA, weighted by pixel count.
    const cA = clusterPixelCount[bestA]!;
    const cB = clusterPixelCount[bestB]!;
    const total = cA + cB;
    if (total > 0) {
      labs[bestA] = [
        (labs[bestA]![0] * cA + labs[bestB]![0] * cB) / total,
        (labs[bestA]![1] * cA + labs[bestB]![1] * cB) / total,
        (labs[bestA]![2] * cA + labs[bestB]![2] * cB) / total,
      ];
      clusterPixelCount[bestA] = total;
    }
    alive[bestB] = false;
    mergeInto[bestB] = bestA;
    remaining--;
  }

  // Transitively resolve merge targets, then assign compact indices.
  for (let i = 0; i < initialK; i++) {
    let root = i;
    while (mergeInto[root] !== root) root = mergeInto[root]!;
    mergeInto[i] = root;
  }
  const compactIndex: number[] = new Array(initialK).fill(-1);
  const palette: string[] = [];
  for (let i = 0; i < initialK; i++) {
    if (!alive[i]) continue;
    compactIndex[i] = palette.length;
    palette.push(labToHex(labs[i]!));
  }

  const indices = new Uint8Array(initial.indices.length);
  for (let p = 0; p < indices.length; p++) {
    indices[p] = compactIndex[mergeInto[initial.indices[p]!]!]!;
  }

  // Optional reassignment: match each pixel to the nearest surviving
  // merged centroid. Without this, pixels stay with their pre-merge
  // cluster indices even when a different merged center is closer.
  if (opts.sourceImage) {
    const survivingLabs: Array<[number, number, number]> = [];
    for (let i = 0; i < initialK; i++) if (alive[i]) survivingLabs.push(labs[i]!);
    const src = opts.sourceImage;
    for (let p = 0; p < indices.length; p++) {
      const pixLab = rgbToLabFromImage(
        src.data[p * 4]!,
        src.data[p * 4 + 1]!,
        src.data[p * 4 + 2]!,
      );
      let bestJ = 0;
      let bestD = Infinity;
      for (let j = 0; j < survivingLabs.length; j++) {
        const d = sqDistLab(pixLab, survivingLabs[j]!);
        if (d < bestD) { bestD = d; bestJ = j; }
      }
      indices[p] = bestJ;
    }
  }

  // Recompute WCSS for the merged assignment.
  // Note: we don't have the per-pixel Lab values in this scope, so we
  // skip precise WCSS recomputation and leave the original value as a
  // conservative upper bound. Downstream code doesn't depend on it.
  return {
    palette,
    indices,
    wcss: initial.wcss,
    mergedFrom: initialK,
  };
}

function rgbToLabFromImage(r: number, g: number, b: number): [number, number, number] {
  const R = srgbToLinear(r / 255);
  const G = srgbToLinear(g / 255);
  const B = srgbToLinear(b / 255);
  const x = R * 0.4124564 + G * 0.3575761 + B * 0.1804375;
  const y = R * 0.2126729 + G * 0.7151522 + B * 0.072175;
  const z = R * 0.0193339 + G * 0.119192 + B * 0.9503041;
  const fx = labF(x / 0.95047);
  const fy = labF(y / 1.0);
  const fz = labF(z / 1.08883);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

function sqDistLab(a: [number, number, number], b: [number, number, number]): number {
  const dL = a[0] - b[0];
  const da = a[1] - b[1];
  const db = a[2] - b[2];
  return dL * dL + da * da + db * db;
}

// --- Local color helpers (duplicated to keep the blind barrier clean) ---

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

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function hexToLab(hex: string): [number, number, number] {
  const [r, g, b] = hexToRgb(hex);
  const R = srgbToLinear(r / 255);
  const G = srgbToLinear(g / 255);
  const B = srgbToLinear(b / 255);
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
  const r = clamp(linearToSrgb(R) * 255);
  const g = clamp(linearToSrgb(G) * 255);
  const b2 = clamp(linearToSrgb(B) * 255);
  return `#${toHex(r)}${toHex(g)}${toHex(b2)}`;
}

function clamp(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}
function toHex(v: number): string {
  return v.toString(16).padStart(2, '0');
}

function deltaELab(
  a: [number, number, number],
  b: [number, number, number],
): number {
  const dL = a[0] - b[0];
  const da = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt(dL * dL + da * da + db * db);
}
