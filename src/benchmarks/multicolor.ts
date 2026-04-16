/**
 * CLI entrypoint for the multi-color vectorization benchmark.
 *
 *   npm run benchmark:multicolor -- --seed N --colors K --shapes S \
 *                                   [--size 128] [--out path.json]
 *
 * Pipeline (blind-barrier protected):
 *   generateTruth        (oracle-side)
 *   rasterizeTruth       (oracle-side)
 *       ↓ ImageData only ↓
 *   runMultiColorPipeline (algo-side — must not see Truth)
 *   multicolorToImageData (algo-side)
 *       ↓ output + Truth ↓
 *   computeLoss          (oracle-side)
 *
 * The barrier is enforced by a runtime assertion (below) plus the
 * import-check tests in tests/algorithms/*.
 */

import { writeFileSync } from 'node:fs';
import { generateTruth } from './ground-truth/generator';
import { generateGradientTruth } from './ground-truth/generator-gradient';
import { rasterizeTruth } from './ground-truth/rasterize';
import { rasterizeTruthAa } from './ground-truth/rasterize-aa';
import { addNoise, type NoiseOptions } from './ground-truth/noise';
import { computeLoss } from './ground-truth/loss';
import {
  runMultiColorPipeline,
  multicolorToImageData,
} from '../algorithms/pipeline-multicolor';
import type { Truth } from './ground-truth/schema';

import type { ShapeCount } from './ground-truth/schema';

export interface BenchmarkInput {
  seed: number;
  colors: ShapeCount;
  shapeCount: ShapeCount;
  size: number;
  allowOverlap?: boolean;
  /** Noise preset name; applied to the rasterized truth before the algo sees it. */
  noise?: string;
  /** Full noise options, used if `noise` isn't a preset match. */
  noiseOptions?: Omit<NoiseOptions, 'seed'>;
  /** When true, shapes get linear/radial gradient fills (decorator on plain truth). */
  gradient?: boolean;
  /** Number of gradient stops (default 2). */
  gradientStops?: number;
}

const NOISE_PRESETS: Record<string, Omit<NoiseOptions, 'seed'>> = {
  clean: {},
  soft: { gaussianSigma: 4, blurRadius: 1 },
  noisy: { gaussianSigma: 12, blurRadius: 2, jitterSigma: 3 },
  heavy: { gaussianSigma: 20, blurRadius: 3, jitterSigma: 5 },
};

export interface BenchmarkReport {
  input: BenchmarkInput;
  noise: string;
  truth: {
    palette: string[];
    shapes: Array<{ kind: string; color: string }>;
  };
  output: {
    k: number;
    palette: string[];
    layerPixelCounts: number[];
    svgByteLength: number;
  };
  loss: ReturnType<typeof computeLoss>;
  timingMs: number;
}

export function runBenchmark(input: BenchmarkInput): BenchmarkReport {
  const truth = input.gradient
    ? generateGradientTruth({
        seed: input.seed,
        colors: input.colors,
        shapeCount: input.shapeCount,
        width: input.size,
        height: input.size,
        allowOverlap: input.allowOverlap,
        stops: input.gradientStops ?? 2,
      })
    : generateTruth({
        seed: input.seed,
        colors: input.colors,
        shapeCount: input.shapeCount,
        width: input.size,
        height: input.size,
        allowOverlap: input.allowOverlap,
      });
  const noiseName = input.noise ?? 'clean';
  let image: ImageData;
  if (noiseName === 'aa' || noiseName === 'aa_noisy') {
    // Supersampled anti-aliased rendering (4x).
    image = rasterizeTruthAa(truth, { factor: 4 });
    if (noiseName === 'aa_noisy') {
      image = addNoise(image, {
        seed: input.seed * 1000 + input.shapeCount,
        gaussianSigma: 6,
        jitterSigma: 2,
      });
    }
  } else {
    image = rasterizeTruth(truth);
    const noiseOpts =
      input.noiseOptions ??
      (input.noise ? NOISE_PRESETS[input.noise] : undefined);
    if (noiseOpts && Object.keys(noiseOpts).length > 0) {
      image = addNoise(image, { seed: input.seed * 1000 + input.shapeCount, ...noiseOpts });
    }
  }

  // --- BLIND BARRIER ---
  // The algorithm only sees ImageData. Pass nothing else.
  assertBlind(image, truth);
  const t0 = performance.now();
  const result = runMultiColorPipeline(image);
  const timingMs = performance.now() - t0;
  // ---------------------

  const rasterized = multicolorToImageData(result);
  const loss = computeLoss(truth, { palette: result.palette, rasterized });

  return {
    input,
    noise: noiseName,
    truth: {
      palette: truth.palette,
      shapes: truth.shapes.map((s) => ({ kind: s.kind, color: s.color })),
    },
    output: {
      k: result.k,
      palette: result.palette,
      layerPixelCounts: result.layers.map((l) => l.pixelCount),
      svgByteLength: result.svg.length,
    },
    loss,
    timingMs,
  };
}

/**
 * Runtime check that the value reaching the algorithm is a plain
 * ImageData-shaped object with no hidden reference to Truth. This
 * catches accidental contamination if the benchmark glue is ever
 * refactored.
 */
function assertBlind(image: ImageData, truth: Truth): void {
  if (!('data' in image) || !('width' in image) || !('height' in image)) {
    throw new Error('blind-barrier: image does not look like ImageData');
  }
  // Defensive: ensure the image object isn't the Truth object in disguise.
  if ((image as unknown as { shapes?: unknown }).shapes !== undefined) {
    throw new Error('blind-barrier: image object has a `shapes` field — truth leaked');
  }
  if ((image as unknown as { palette?: unknown }).palette !== undefined) {
    throw new Error('blind-barrier: image object has a `palette` field — truth leaked');
  }
  if (image.width !== truth.width || image.height !== truth.height) {
    throw new Error('blind-barrier: image size != truth size');
  }
}

// --- CLI ---

function parseArgs(argv: string[]): BenchmarkInput & { out?: string } {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const val = argv[i + 1];
      if (val == null || val.startsWith('--')) {
        args[key] = 'true';
      } else {
        args[key] = val;
        i++;
      }
    }
  }
  const colors = Number(args.colors ?? '3');
  const shapeCount = Number(args.shapes ?? args.shapeCount ?? colors);
  if (colors < 1 || colors > 16 || !Number.isInteger(colors)) {
    throw new Error('--colors must be an integer in [1, 16]');
  }
  if (shapeCount < 1 || shapeCount > 16 || !Number.isInteger(shapeCount)) {
    throw new Error('--shapes must be an integer in [1, 16]');
  }
  return {
    seed: Number(args.seed ?? '1'),
    colors: colors as ShapeCount,
    shapeCount: shapeCount as ShapeCount,
    size: Number(args.size ?? '128'),
    allowOverlap: args.overlap === 'true' || args.overlap === '1',
    noise: args.noise,
    gradient: args.gradient === 'true' || args.gradient === '1',
    gradientStops: args['gradient-stops'] ? Number(args['gradient-stops']) : undefined,
    out: args.out,
  };
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const { out, ...input } = parseArgs(argv);
  const report = runBenchmark(input);
  const json = JSON.stringify(report, null, 2);
  if (out) {
    writeFileSync(out, json);
    process.stderr.write(`wrote ${out}\n`);
  }
  process.stdout.write(json + '\n');
  // Quick human-readable summary to stderr so stdout stays pure JSON.
  process.stderr.write(
    `seed=${input.seed} colors=${input.colors} shapes=${input.shapeCount} size=${input.size} ` +
      `k=${report.output.k} loss=${report.loss.loss.toFixed(3)} ` +
      `(pal=${report.loss.paletteMatch.toFixed(2)} cov=${report.loss.coverageIoU.toFixed(2)} ` +
      `cen=${report.loss.centroidError.toFixed(2)}) time=${report.timingMs.toFixed(1)}ms\n`,
  );
}

// Run as CLI when executed directly (not when imported from tests).
const invokedDirectly =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  import.meta.url === `file://${process.argv[1]}`;
if (invokedDirectly) {
  main().catch((e) => {
    process.stderr.write(`error: ${e instanceof Error ? e.message : String(e)}\n`);
    process.exit(1);
  });
}
