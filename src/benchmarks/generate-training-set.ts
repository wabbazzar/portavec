/**
 * Generate a training set of benchmark truth images.
 *
 *   npm run benchmark:gen-training \
 *     [--out-dir test-images/training] [--seeds 1,2,3,4,5,6] \
 *     [--counts 2,4,6,8] [--size 256]
 *
 * Writes:
 *   <out-dir>/<name>.png       — the rasterized truth image
 *   <out-dir>/<name>.truth.json — the Truth (shapes + palette) for loss scoring
 *   <out-dir>/manifest.json     — index of all generated entries
 *
 * The GUI gallery reads manifest.json to let you browse and load truths
 * as source images. The matching <name>.truth.json lets the benchmark
 * score a vectorization attempt against known truth — but only the
 * harness may read it; the algorithm itself sees only the PNG.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { generateTruth } from './ground-truth/generator';
import { generateGradientTruth } from './ground-truth/generator-gradient';
import { rasterizeTruth } from './ground-truth/rasterize';
import { rasterizeTruthAa } from './ground-truth/rasterize-aa';
import { addNoise, type NoiseOptions } from './ground-truth/noise';
import type { ShapeCount, Truth } from './ground-truth/schema';

interface NoisePreset {
  name: string;
  opts: Omit<NoiseOptions, 'seed'>;
  /** Use supersampled AA rasterization instead of integer. */
  aa?: boolean;
}

interface Args {
  outDir: string;
  seeds: number[];
  counts: number[];
  size: number;
  allowOverlap: boolean;
  noisePresets: NoisePreset[];
  /** Also emit gradient-filled variants under the `_grad` suffix. */
  gradient: boolean;
}

const NOISE_PRESETS: Record<string, NoisePreset> = {
  clean: { name: 'clean', opts: {} },
  soft: { name: 'soft', opts: { gaussianSigma: 4, blurRadius: 1 } },
  noisy: { name: 'noisy', opts: { gaussianSigma: 12, blurRadius: 2, jitterSigma: 3 } },
  heavy: { name: 'heavy', opts: { gaussianSigma: 20, blurRadius: 3, jitterSigma: 5 } },
  aa: { name: 'aa', opts: {}, aa: true },
  aa_noisy: { name: 'aa_noisy', opts: { gaussianSigma: 6, jitterSigma: 2 }, aa: true },
};

function parseList(s: string): number[] {
  return s.split(',').map((x) => Number(x.trim())).filter((x) => Number.isFinite(x));
}

function parseArgs(argv: string[]): Args {
  const map: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const val = argv[i + 1];
      if (val == null || val.startsWith('--')) {
        map[key] = 'true';
      } else {
        map[key] = val;
        i++;
      }
    }
  }
  const noiseNames = (map.noise ?? 'clean').split(',').map((s) => s.trim());
  const noisePresets: NoisePreset[] = [];
  for (const name of noiseNames) {
    if (!(name in NOISE_PRESETS)) {
      throw new Error(`unknown noise preset "${name}". Available: ${Object.keys(NOISE_PRESETS).join(', ')}`);
    }
    noisePresets.push(NOISE_PRESETS[name]!);
  }
  return {
    outDir: map['out-dir'] ?? 'public/training',
    seeds: parseList(map.seeds ?? '1,2,3,4,5,6'),
    counts: parseList(map.counts ?? '2,4,6,8'),
    size: Number(map.size ?? '256'),
    allowOverlap: map['no-overlap'] !== 'true',
    noisePresets,
    gradient: map.gradient === 'true' || map.gradient === '1',
  };
}

function imageDataToPng(img: ImageData): Buffer {
  const png = new PNG({ width: img.width, height: img.height });
  for (let i = 0; i < img.data.length; i++) png.data[i] = img.data[i]!;
  return PNG.sync.write(png);
}

interface ManifestEntry {
  name: string;
  png: string;
  truth: string;
  seed: number;
  shapeCount: number;
  size: number;
  allowOverlap: boolean;
  paletteLength: number;
  noise: string;
}

/**
 * Real-world images kept in the gallery for qualitative evaluation.
 * They have no ground truth — the user inspects the vectorized output
 * visually. Listed under a `real` section in the manifest.
 */
const REAL_IMAGES: Array<{ name: string; png: string; label: string; description: string }> = [
  {
    name: 'hw_forest_cat',
    png: 'hw_forest_cat.png',
    label: 'Forest Cat',
    description: 'AI-generated fantasy forest with orange cat and tree doors',
  },
];

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  mkdirSync(args.outDir, { recursive: true });

  const entries: ManifestEntry[] = [];
  const modes: Array<{ tag: string; make: () => Truth }> = [
    { tag: '', make: () => generateTruth({
        seed: 0, colors: 1, shapeCount: 1, width: 0, height: 0,
      }) as unknown as Truth }, // placeholder; overwritten per (seed, count)
  ];
  void modes; // silence

  for (const seed of args.seeds) {
    for (const count of args.counts) {
      if (count < 1 || count > 30) continue;
      const variants: Array<{ tag: string; truth: Truth }> = [
        {
          tag: '',
          truth: generateTruth({
            seed,
            colors: count as ShapeCount,
            shapeCount: count as ShapeCount,
            width: args.size,
            height: args.size,
            allowOverlap: args.allowOverlap,
          }),
        },
      ];
      if (args.gradient) {
        variants.push({
          tag: '_grad',
          truth: generateGradientTruth({
            seed,
            colors: count as ShapeCount,
            shapeCount: count as ShapeCount,
            width: args.size,
            height: args.size,
            allowOverlap: args.allowOverlap,
            stops: 2,
          }),
        });
      }

      for (const v of variants) {
        const truth = v.truth;
        const clean = rasterizeTruth(truth);
        const aaClean = (): ImageData => rasterizeTruthAa(truth, { factor: 4 });
        for (const preset of args.noisePresets) {
          const base = preset.aa ? aaClean() : clean;
          const hasNoise = Object.keys(preset.opts).length > 0;
          const img = hasNoise
            ? addNoise(base, { seed: seed * 1000 + count, ...preset.opts })
            : base;
          const tag = preset.name === 'clean' ? '' : `_${preset.name}`;
          const name = `seed${seed}_n${count}${v.tag}${tag}`;
          writeFileSync(join(args.outDir, `${name}.png`), imageDataToPng(img));
          writeFileSync(
            join(args.outDir, `${name}.truth.json`),
            JSON.stringify(truth, null, 2),
          );
          entries.push({
            name,
            png: `${name}.png`,
            truth: `${name}.truth.json`,
            seed,
            shapeCount: count,
            size: args.size,
            allowOverlap: args.allowOverlap,
            paletteLength: truth.palette.length,
            noise: preset.name + (v.tag === '_grad' ? '+grad' : ''),
          });
          process.stderr.write(
            `${name}: ${truth.shapes.length} shapes, palette=${truth.palette.length}, noise=${preset.name}${v.tag}\n`,
          );
        }
      }
    }
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    count: entries.length,
    size: args.size,
    allowOverlap: args.allowOverlap,
    entries,
    real: REAL_IMAGES,
  };
  writeFileSync(join(args.outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  process.stderr.write(`\nwrote ${entries.length} images to ${args.outDir}\n`);
  process.stdout.write(JSON.stringify(manifest, null, 2) + '\n');
}

main().catch((e) => {
  process.stderr.write(`gen error: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
