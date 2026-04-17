/**
 * Per-image param auto-tuner.
 *
 *   npx tsx scripts/auto-tune.ts [--images <pattern>] [--out <path>]
 *
 * For each image:
 *   - If a <name>.truth.json exists → score each config against computeLoss, pick min loss.
 *   - Otherwise → score with a "palette chroma spread" proxy that rewards
 *     (a) mean pairwise Lab distance of the palette (diversity) and
 *     (b) minimum-nearest-neighbor distance (distinctness, penalizes
 *     clustered-together choices that would render as washed-out).
 *
 * Writes a JSON manifest mapping image name → best config, keyed to the
 * base name without extension.
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { PNG } from 'pngjs';
import { runMultiColorPipeline, multicolorToImageData } from '../src/algorithms/pipeline-multicolor';
import { computeLoss } from '../src/benchmarks/ground-truth/loss';
import type { Truth } from '../src/benchmarks/ground-truth/schema';

const TRAINING_DIR = 'public/training';

// Small grid — ~18 configs per image. Each config ~1-3s on 256×256.
// Keep bounded so sweeping 180 images finishes in under ~2 hours.
const GRID = {
  k: [20, 30, 40, 50] as Array<number | undefined>,
  saliencyWeight: [0, 1] as number[],
  salientSeedBudget: [0, 8] as number[],
  mergeThreshold: [4] as number[],
};

interface Config {
  k?: number;
  saliencyWeight: number;
  salientSeedBudget: number;
  mergeThreshold: number;
}

interface TuneResult {
  name: string;
  width: number;
  height: number;
  hasTruth: boolean;
  best: {
    config: Config;
    score: number;
    scoreType: 'loss' | 'chromaSpread';
    paths: number;
    uniqueFills: number;
    ms: number;
  };
  runs: Array<{ config: Config; score: number; paths: number; ms: number }>;
}

function pngToImageData(buf: Buffer): ImageData {
  const png = PNG.sync.read(buf);
  return {
    data: new Uint8ClampedArray(png.data),
    width: png.width,
    height: png.height,
    colorSpace: 'srgb',
  } as ImageData;
}

// Simple hex → Lab (duplicated locally to avoid benchmark-side import).
function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}
function srgbLinear(v: number): number {
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}
function labF(t: number): number {
  const d = 6 / 29;
  return t > d * d * d ? Math.cbrt(t) : t / (3 * d * d) + 4 / 29;
}
function rgbToLab(r: number, g: number, b: number): [number, number, number] {
  const R = srgbLinear(r / 255), G = srgbLinear(g / 255), B = srgbLinear(b / 255);
  const x = R * 0.4124564 + G * 0.3575761 + B * 0.1804375;
  const y = R * 0.2126729 + G * 0.7151522 + B * 0.0721750;
  const z = R * 0.0193339 + G * 0.1191920 + B * 0.9503041;
  const fx = labF(x / 0.95047), fy = labF(y / 1.0), fz = labF(z / 1.08883);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/**
 * No-truth scorer. Higher = better palette diversity + distinctness.
 * Reward: mean pairwise ΔE × min nearest-neighbor ΔE.
 * A washed-out palette (many similar colors) scores low on both factors.
 */
function chromaSpreadScore(palette: string[]): number {
  if (palette.length < 2) return 0;
  const labs = palette.map((h) => rgbToLab(...hexToRgb(h)));
  let sumPair = 0, pairs = 0;
  let minNN = Infinity;
  for (let i = 0; i < labs.length; i++) {
    let nn = Infinity;
    for (let j = 0; j < labs.length; j++) {
      if (i === j) continue;
      const dL = labs[i]![0] - labs[j]![0];
      const da = labs[i]![1] - labs[j]![1];
      const db = labs[i]![2] - labs[j]![2];
      const d = Math.sqrt(dL * dL + da * da + db * db);
      if (j > i) { sumPair += d; pairs++; }
      if (d < nn) nn = d;
    }
    if (nn < minNN) minNN = nn;
  }
  const meanPair = pairs > 0 ? sumPair / pairs : 0;
  return meanPair * minNN; // product so both diversity AND distinctness matter
}

function* configs(): Generator<Config> {
  for (const k of GRID.k) {
    for (const sw of GRID.saliencyWeight) {
      for (const sb of GRID.salientSeedBudget) {
        for (const mt of GRID.mergeThreshold) {
          yield { k, saliencyWeight: sw, salientSeedBudget: sb, mergeThreshold: mt };
        }
      }
    }
  }
}

function tuneImage(name: string, pngPath: string, truthPath: string | null): TuneResult {
  const img = pngToImageData(readFileSync(pngPath));
  const truth: Truth | null = truthPath ? JSON.parse(readFileSync(truthPath, 'utf8')) : null;
  const hasTruth = truth != null;

  const runs: TuneResult['runs'] = [];
  let best: TuneResult['best'] | null = null;

  for (const cfg of configs()) {
    const t0 = Date.now();
    const result = runMultiColorPipeline(img, { ...cfg });
    const ms = Date.now() - t0;
    const uniqueFills = new Set(result.layers.map((l) => l.color)).size;
    const paths = result.layers.reduce((n, l) => n + l.pathData.length, 0);

    let score: number;
    let scoreType: 'loss' | 'chromaSpread';
    if (hasTruth) {
      const rasterized = multicolorToImageData(result);
      score = computeLoss(truth, { palette: result.palette, rasterized }).loss;
      scoreType = 'loss';
    } else {
      score = -chromaSpreadScore(result.palette); // negate: lower is better for unified comparison
      scoreType = 'chromaSpread';
    }

    runs.push({ config: cfg, score, paths, ms });
    if (best == null || score < best.score) {
      best = { config: cfg, score, scoreType, paths, uniqueFills, ms };
    }
  }

  return {
    name,
    width: img.width,
    height: img.height,
    hasTruth,
    best: best!,
    runs,
  };
}

function parseArgs(argv: string[]): { images?: string; out: string; only?: string[] } {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const v = argv[i + 1];
      if (v == null || v.startsWith('--')) args[key] = 'true';
      else { args[key] = v; i++; }
    }
  }
  return {
    images: args.images,
    out: args.out ?? 'public/training/tuning-manifest.json',
    only: args.only ? args.only.split(',') : undefined,
  };
}

async function main(): Promise<void> {
  const argv = parseArgs(process.argv.slice(2));

  const files = readdirSync(TRAINING_DIR).filter((f) => f.endsWith('.png'));
  const work = argv.only
    ? files.filter((f) => argv.only!.some((o) => f.startsWith(o)))
    : argv.images
      ? files.filter((f) => f.includes(argv.images!))
      : files;

  process.stderr.write(`tuning ${work.length} images from ${TRAINING_DIR}\n`);
  const manifest: Record<string, TuneResult> = {};
  const t0 = Date.now();
  for (let i = 0; i < work.length; i++) {
    const f = work[i]!;
    const name = basename(f, '.png');
    const truth = join(TRAINING_DIR, `${name}.truth.json`);
    const hasTruth = (await import('node:fs')).existsSync(truth);
    const r = tuneImage(name, join(TRAINING_DIR, f), hasTruth ? truth : null);
    manifest[name] = r;
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    const etaSec = ((Date.now() - t0) / (i + 1)) * (work.length - i - 1) / 1000;
    const bestCfg = r.best.config;
    process.stderr.write(
      `[${i + 1}/${work.length}] ${name}: best score=${r.best.score.toFixed(4)} ` +
        `cfg={k=${bestCfg.k ?? 'auto'} sw=${bestCfg.saliencyWeight} sb=${bestCfg.salientSeedBudget} mt=${bestCfg.mergeThreshold}} ` +
        `paths=${r.best.paths} elapsed=${elapsed}s eta=${etaSec.toFixed(0)}s\n`,
    );
  }

  // Compact output: store only best config per image, plus summary of runs.
  const compact = Object.fromEntries(
    Object.entries(manifest).map(([k, v]) => [k, {
      hasTruth: v.hasTruth,
      best: v.best,
      runCount: v.runs.length,
    }]),
  );
  writeFileSync(argv.out, JSON.stringify({ generatedAt: new Date().toISOString(), entries: compact }, null, 2));
  process.stderr.write(`\nwrote ${argv.out} (${Object.keys(compact).length} images)\n`);
}

main().catch((e) => {
  process.stderr.write(`auto-tune error: ${e instanceof Error ? e.stack ?? e.message : String(e)}\n`);
  process.exit(1);
});
