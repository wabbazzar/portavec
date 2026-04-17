/**
 * Baseline sweep: run the multicolor benchmark across all combinations of
 *
 *   seeds × colors × shapes
 *
 * and write one JSON per run + a summary JSON. The summary reports
 * median loss across the baseline matrix — that's the number to watch
 * when optimizing the pipeline.
 *
 *   npm run benchmark:multicolor:sweep -- \
 *     [--seeds 1,2,3] [--colors 1,2,3] [--shapes match] \
 *     [--size 128] [--out-dir tests/benchmarks/multicolor-baselines]
 *
 * `--shapes match` uses shapeCount == colorCount (the common case for
 * the current generator; one color per shape).
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runBenchmark, type BenchmarkReport } from './multicolor';
import type { ShapeCount } from './ground-truth/schema';

interface SweepArgs {
  seeds: number[];
  colors: number[];
  shapes: number[] | 'match';
  size: number;
  outDir: string;
  allowOverlap: boolean;
  noises: string[];
}

function parseList(s: string): number[] {
  return s.split(',').map((x) => Number(x.trim())).filter((x) => Number.isFinite(x));
}

function parseArgs(argv: string[]): SweepArgs {
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
  return {
    seeds: parseList(map.seeds ?? '1,2,3'),
    colors: parseList(map.colors ?? '1,2,3'),
    shapes: map.shapes === 'match' || map.shapes == null ? 'match' : parseList(map.shapes),
    size: Number(map.size ?? '128'),
    outDir: map['out-dir'] ?? 'tests/benchmarks/multicolor-baselines',
    allowOverlap: map.overlap === 'true' || map.overlap === '1',
    noises: (map.noise ?? 'clean').split(',').map((s) => s.trim()).filter(Boolean),
  };
}

function median(xs: number[]): number {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[m - 1]! + s[m]!) / 2 : s[m]!;
}

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  mkdirSync(args.outDir, { recursive: true });

  const runs: BenchmarkReport[] = [];
  for (const seed of args.seeds) {
    for (const colors of args.colors) {
      const shapeList = args.shapes === 'match' ? [colors] : args.shapes;
      for (const shapes of shapeList) {
        if (colors < 1 || colors > 30 || shapes < 1 || shapes > 30) continue;
        for (const noise of args.noises) {
          const input = {
            seed,
            colors: colors as ShapeCount,
            shapeCount: shapes as ShapeCount,
            size: args.size,
            allowOverlap: args.allowOverlap,
            noise,
          };
          const report = runBenchmark(input);
          const noiseTag = noise === 'clean' ? '' : `_${noise}`;
          const filename = `seed${seed}_c${colors}_s${shapes}${noiseTag}.json`;
          writeFileSync(join(args.outDir, filename), JSON.stringify(report, null, 2));
          runs.push(report);
          process.stderr.write(
            `${filename}: k=${report.output.k} loss=${report.loss.loss.toFixed(3)} ` +
              `(pal=${report.loss.paletteMatch.toFixed(2)} cov=${report.loss.coverageIoU.toFixed(2)})\n`,
          );
        }
      }
    }
  }

  const losses = runs.map((r) => r.loss.loss);
  const summary = {
    runs: runs.length,
    lossMedian: median(losses),
    lossMean: mean(losses),
    lossMin: Math.min(...losses),
    lossMax: Math.max(...losses),
    paletteMatchMedian: median(runs.map((r) => r.loss.paletteMatch)),
    coverageIoUMedian: median(runs.map((r) => r.loss.coverageIoU)),
    kMatchRate:
      runs.filter((r) => Math.abs(r.output.k - (r.input.shapeCount + 1)) <= 1).length / runs.length,
    generatedAt: new Date().toISOString(),
  };

  const summaryPath = join(args.outDir, 'SUMMARY.json');
  writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
  process.stderr.write(`\n${summaryPath}\n`);
  process.stderr.write(
    `runs=${summary.runs} median loss=${summary.lossMedian.toFixed(3)} ` +
      `mean=${summary.lossMean.toFixed(3)} min=${summary.lossMin.toFixed(3)} ` +
      `max=${summary.lossMax.toFixed(3)}\n`,
  );
  process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
}

main().catch((e) => {
  process.stderr.write(`sweep error: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
