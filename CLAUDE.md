# Portavec

Browser-based raster-to-vector conversion with a deterministic ground-truth harness.

**Stack:** Vite + React + TypeScript + Vitest.

## How we work

**Spec-driven thin slices.** Features land through tickets in `specs/tickets/` decomposed into atomic, testable commits (see `multi-color-vectorization.md` for the template — numbered slices, each with a build target and a test). Ship one slice at a time.

**Blind-barrier ground truth.** The vectorization algorithm never sees the truth object — it only consumes rasterized pixels. Truth is compared to algorithm output via a deterministic loss function. Any auto-parameter choice (e.g. picking `k` in k-means) must be decided from pixels alone.

**Determinism everywhere.** Seeded PRNG (`rng.ts`), fixed noise presets, stable k-means++ initialization. Same seed → identical truth → identical raster → identical loss.

**No autonomous loops.** We previously ran an autonomous "Ralph" loop; it's been retired. Progress is human-directed via specs. The benchmark harness is the feedback signal, not a runner.

## Architecture

### Pipelines
- `src/algorithms/pipeline.ts` — single-color: threshold → (opt) edge detect → contour trace → curve fit → SVG.
- `src/algorithms/pipeline-multicolor.ts` — multi-color: denoise → auto-quantize (k-means++ in Lab) → per-layer contour + curve-fit → z-ordered SVG with seam-closing strokes.

### Algorithms (`src/algorithms/`)
- `quantize/` — `kmeans.ts` (Lab, seeded, ++init, restarts), `elbow.ts` (auto-k via WCSS drop or silhouette), `denoise.ts` (median), `merge.ts` (ΔE cluster merging), `couple.ts` (spatial-adjacency gradient coupling, off by default).
- `threshold/` — Otsu, adaptive (Gaussian-weighted local mean).
- `edge-detection/` — Sobel, Canny. Default off.
- `contour-tracing/marching-squares.ts` — 16-config 2×2, closed contours, single-level hole detection.
- `curve-fitting/schneider.ts` — Douglas-Peucker + corner detection + Schneider Bézier fit. **Known issue:** smooth closed curves (circles/rings) currently emit L segments instead of C. Two `.fails()` tests in `tests/algorithms/svg-quality.test.ts` document it.
- `ascii/` — directional ASCII rendering; standalone, not in core SVG pipeline.

### Ground-truth harness (`src/benchmarks/ground-truth/`)
- `schema.ts` — `Truth`, `GeneratorInput`, `VectorOutput`, `LossReport`.
- `rng.ts`, `palette.ts`, `generator.ts`, `rasterize.ts`, `noise.ts` — deterministic truth + raster.
- `loss.ts` — `computeLoss(truth, output)` → `{ paletteMatch, coverageIoU, centroidError, loss }`. Weighted: `loss = 1 − (0.4·paletteMatch + 0.5·coverageIoU + 0.1·(1 − normCentroid))`.

### Corpus (`public/training/`)
180 procedural images + `hw_forest_cat.png`, generated 2026-04-16. Matrix: 5 seeds × {n2, n4, n6, n8, n12, n16} shape-counts × {clean, noisy, aa, grad, grad_aa, grad_noisy}. Each PNG has a paired `.truth.json`; `manifest.json` indexes the set.

## Dev commands

```bash
npm run dev                                   # Vite dev server
npm run build                                 # tsc --noEmit + vite build
npm test                                      # vitest
npm test -- --run                             # single-pass
npm test -- --coverage                        # v8 coverage

npm run benchmark:multicolor                  # single run (args: --seed N --colors K --shapes S)
npm run benchmark:multicolor:sweep            # sweep seeds × colors × shapes × noise
npm run benchmark:gen-training                # regenerate public/training/
```

## Test layout

- `tests/algorithms/` — one file per algorithm family; plus `ground-truth.test.ts` (contour-count assertions against `test-images/`) and `svg-quality.test.ts` (segment-type + bounds).
- `tests/benchmarks/` — loss, generator, rasterize determinism.
- `test-images/` — hand-curated reference rasters with counts documented in `GROUND_TRUTH.md`.
- `test-output/` — a handful of reference SVGs for eyeballing.

## Conventions

- **Blind barrier.** Nothing downstream of `rasterize.ts` may import `Truth`. Enforce by code review.
- **Seeds are first-class params.** Don't introduce a non-seeded random path.
- **Loss is the yardstick, not visual inspection** — for multi-color. Single-color still uses contour-count assertions.
- **Thin slices.** New features get a ticket in `specs/tickets/` before code, with numbered slices.
- **Don't reintroduce autonomous loops.** No `PROMPT.md`/`.ralph_*` style driver files, no self-resetting task runners.

## Known gaps (candidate next tickets)

- Single-color loss metric (currently only multicolor has quantitative loss).
- SVG gradient output (`<linearGradient>`/`<radialGradient>`) — generator produces gradient truths but pipeline emits flat fills.
- Smooth-closed-curve Bézier fit (circle/ring `.fails()` tests).
- Rendered-SVG SSIM as a second loss signal.
- Nested-hole support in marching squares (currently single-level).
