/**
 * Auto-k for k-means color quantization.
 *
 * Hybrid strategy:
 *   1. WCSS zero-drop fast path — catches noise-free synthetic cases
 *      where WCSS hits zero at the true cluster count.
 *   2. Silhouette coefficient on a subsampled pixel set — robust to
 *      noise floor; peaks at the k with tightest, best-separated
 *      clusters. Preferred whenever the fast path doesn't fire.
 *
 * Pure algorithm module — no ground-truth imports.
 */

import { quantize, type QuantizeResult } from './kmeans';

export interface ChooseKOptions {
  maxK?: number;
  seed: number;
  sampleStride?: number;
  /**
   * Number of pixels to subsample when computing silhouette. Default 800.
   * Silhouette cost is O(k · S²), so keep modest. Min enforced.
   */
  silhouetteSampleSize?: number;
  /**
   * Restart count passed through to each k-means call during the elbow
   * search. Higher values tighten cluster centers on noisy data at
   * linear CPU cost.
   */
  restarts?: number;
  /**
   * When true, skip the silhouette pass and pick k purely from WCSS
   * relative-drop (classical elbow). Faster; more conservative on k.
   */
  pureElbow?: boolean;
}

export interface ChooseKResult {
  k: number;
  wcssByK: number[]; // index 0 unused, wcssByK[k] for k >= 1
  /** Silhouette coefficient per k (0..1 approx). NaN where unavailable. */
  silhouetteByK: number[];
  /** How the final k was chosen. Informational; used by tests. */
  pickedBy: 'zero-drop' | 'silhouette' | 'relative-drop';
}

export function chooseK(imageData: ImageData, opts: ChooseKOptions): ChooseKResult {
  // Default maxK covers up to 31 shape colors + 1 background.
  const maxK = Math.min(64, Math.max(1, opts.maxK ?? 32));

  // Run k-means for every k and keep the assignment + wcss.
  const results: QuantizeResult[] = new Array(maxK + 1);
  const wcssByK: number[] = new Array(maxK + 1).fill(0);
  for (let k = 1; k <= maxK; k++) {
    results[k] = quantize(imageData, {
      k,
      seed: opts.seed,
      sampleStride: opts.sampleStride,
      restarts: opts.restarts,
    });
    wcssByK[k] = results[k]!.wcss;
  }

  if (maxK === 1) {
    return { k: 1, wcssByK, silhouetteByK: [NaN, NaN], pickedBy: 'relative-drop' };
  }

  // ----- Fast path: WCSS zero-drop (clean synthetic case) -----
  const ZERO_EPS = 1e-6;
  const zeroThreshold = wcssByK[1]! * ZERO_EPS;
  for (let k = 2; k <= maxK; k++) {
    if (wcssByK[k]! <= zeroThreshold) {
      const silhouetteByK = new Array(maxK + 1).fill(NaN);
      return { k, wcssByK, silhouetteByK, pickedBy: 'zero-drop' };
    }
  }

  // ----- Pure-elbow shortcut (skips silhouette) -----
  if (opts.pureElbow) {
    const silhouetteByK = new Array(maxK + 1).fill(NaN);
    let fbK = 1;
    let bestDrop = -Infinity;
    for (let k = 2; k <= maxK; k++) {
      const prev = wcssByK[k - 1]!;
      if (prev <= 0) continue;
      const drop = (prev - wcssByK[k]!) / prev;
      if (drop > bestDrop) {
        bestDrop = drop;
        fbK = k;
      }
    }
    return { k: fbK, wcssByK, silhouetteByK, pickedBy: 'relative-drop' };
  }

  // ----- Silhouette pass -----
  const sampleSize = Math.max(64, opts.silhouetteSampleSize ?? 800);
  const { data, width, height } = imageData;
  const N = width * height;
  const sampleStride = Math.max(1, Math.floor(N / sampleSize));
  const sampleIdx: number[] = [];
  for (let i = 0; i < N; i += sampleStride) sampleIdx.push(i);

  // Precompute Lab for sample points once.
  const sampleLab: Array<[number, number, number]> = new Array(sampleIdx.length);
  for (let s = 0; s < sampleIdx.length; s++) {
    const i = sampleIdx[s]!;
    sampleLab[s] = rgbToLabLocal(
      data[i * 4]!, data[i * 4 + 1]!, data[i * 4 + 2]!,
    );
  }

  const silhouetteByK: number[] = new Array(maxK + 1).fill(NaN);
  // silhouette is undefined at k=1 (no "other" cluster to contrast with).
  for (let k = 2; k <= maxK; k++) {
    const assign = new Uint8Array(sampleIdx.length);
    for (let s = 0; s < sampleIdx.length; s++) {
      assign[s] = results[k]!.indices[sampleIdx[s]!]!;
    }
    silhouetteByK[k] = meanSilhouette(sampleLab, assign, k);
  }

  // On noisy inputs, silhouette typically plateaus across a wide range
  // of k and then collapses sharply once k-means starts fitting noise
  // clusters. The right answer is the *last* k on the plateau — not
  // the global maximum.
  //
  // Strategy: find the biggest silhouette drop from (k-1) → (k) and
  // return (k - 1). If no drop exceeds `DROP_THRESHOLD`, fall back to
  // the global max (the classic silhouette answer).
  const DROP_THRESHOLD = 0.1;
  let biggestDrop = 0;
  let kBeforeDrop = 2;
  for (let k = 3; k <= maxK; k++) {
    const prev = silhouetteByK[k - 1];
    const curr = silhouetteByK[k];
    if (!Number.isFinite(prev) || !Number.isFinite(curr)) continue;
    const drop = (prev as number) - (curr as number);
    if (drop > biggestDrop) {
      biggestDrop = drop;
      kBeforeDrop = k - 1;
    }
  }

  let bestK = 2;
  let bestSil = -Infinity;
  for (let k = 2; k <= maxK; k++) {
    const sil = silhouetteByK[k]!;
    if (Number.isFinite(sil) && sil > bestSil) {
      bestSil = sil;
      bestK = k;
    }
  }

  const pickedK = biggestDrop >= DROP_THRESHOLD ? kBeforeDrop : bestK;
  if (Number.isFinite(bestSil)) {
    return { k: pickedK, wcssByK, silhouetteByK, pickedBy: 'silhouette' };
  }

  // ----- Fallback: relative-drop (rarely reached) -----
  let fbK = 1;
  let bestDrop = -Infinity;
  for (let k = 2; k <= maxK; k++) {
    const prev = wcssByK[k - 1]!;
    if (prev <= 0) continue;
    const drop = (prev - wcssByK[k]!) / prev;
    if (drop > bestDrop) {
      bestDrop = drop;
      fbK = k;
    }
  }
  return { k: fbK, wcssByK, silhouetteByK, pickedBy: 'relative-drop' };
}

/**
 * Mean silhouette coefficient for a subsample of pixels already
 * assigned to clusters. Uses Lab-space Euclidean distance.
 *
 * For each point i:
 *   a(i) = mean distance to other points in its cluster
 *   b(i) = min over other clusters of mean distance to that cluster
 *   s(i) = (b - a) / max(a, b)   if |own cluster| > 1, else 0
 */
function meanSilhouette(
  labs: Array<[number, number, number]>,
  assign: Uint8Array,
  k: number,
): number {
  const N = labs.length;
  // Group indices by cluster.
  const clusters: number[][] = new Array(k);
  for (let j = 0; j < k; j++) clusters[j] = [];
  for (let i = 0; i < N; i++) clusters[assign[i]!]!.push(i);

  let sum = 0;
  let count = 0;
  for (let i = 0; i < N; i++) {
    const myCluster = assign[i]!;
    const own = clusters[myCluster]!;
    if (own.length < 2) continue;
    // a(i)
    let aSum = 0;
    for (const j of own) {
      if (j === i) continue;
      aSum += distLab(labs[i]!, labs[j]!);
    }
    const a = aSum / (own.length - 1);
    // b(i)
    let b = Infinity;
    for (let c = 0; c < k; c++) {
      if (c === myCluster) continue;
      const others = clusters[c]!;
      if (others.length === 0) continue;
      let sD = 0;
      for (const j of others) sD += distLab(labs[i]!, labs[j]!);
      const mean = sD / others.length;
      if (mean < b) b = mean;
    }
    const s = b === Infinity ? 0 : (b - a) / Math.max(a, b);
    sum += s;
    count++;
  }
  return count === 0 ? -1 : sum / count;
}

function distLab(a: [number, number, number], b: [number, number, number]): number {
  const dL = a[0] - b[0];
  const da = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt(dL * dL + da * da + db * db);
}

// --- Local sRGB → Lab (kept duplicated to preserve the blind barrier) ---
function srgbToLinear(v: number): number {
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}
function labF(t: number): number {
  const d = 6 / 29;
  return t > d * d * d ? Math.cbrt(t) : t / (3 * d * d) + 4 / 29;
}
function rgbToLabLocal(r: number, g: number, b: number): [number, number, number] {
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

export interface AutoQuantizeOptions extends ChooseKOptions {}

export interface AutoQuantizeResult extends QuantizeResult {
  k: number;
  wcssByK: number[];
  silhouetteByK: number[];
  pickedBy: ChooseKResult['pickedBy'];
}

export function autoQuantize(
  imageData: ImageData,
  opts: AutoQuantizeOptions,
): AutoQuantizeResult {
  const pick = chooseK(imageData, opts);
  const result = quantize(imageData, {
    k: pick.k,
    seed: opts.seed,
    sampleStride: opts.sampleStride,
    restarts: opts.restarts,
  });
  return { ...result, ...pick };
}
