# Ticket: Multi-Color Vectorization with Synthetic Ground Truth

**Status:** draft
**Created:** 2026-04-15
**Type:** feature + test infrastructure
**Why it's one ticket:** the feature is pointless without a blind ground-truth harness to optimize against. The Ralph loop needs both halves to iterate.

---

## Problem

Today portavec vectorizes to a single fill color (black silhouette). Real images have multiple colors and require a quantization step before tracing. The existing pipeline has no notion of color layers.

Adding "N colors" is easy to half-implement and hard to evaluate — picking the *right* N colors is an algorithmic judgment call. Without a deterministic oracle, we can't tell a good auto-color-selection from a bad one, and a Ralph loop can't converge.

## Goal

Ship two coupled pieces:

1. **Multi-color vectorization** — quantize input image into N colors, run the existing pipeline per color layer, stack SVG paths in one output.
2. **Synthetic ground-truth harness** — a deterministic shape generator the algorithm is blind to, plus a deterministic loss function comparing algorithm output vs. truth. Enables a Ralph loop to optimize auto-color-selection without human eyeballs.

## Non-goals

- Photographic image quantization quality (this ticket targets synthetic shapes).
- Palette curation UI beyond showing the chosen colors.
- Anti-aliasing / sub-pixel fidelity in the ground truth — pixel-exact is fine.

---

## Acceptance criteria

- User can set `colors = {2, 4, 8, 16}` in the UI; output SVG shows that many fill layers.
- Shape generator produces 1–3 non-overlapping colored shapes at known coordinates with a user-chosen `colors` count.
- Truth is persisted as `{ shapes: [{ kind, params, color }], palette, seed }` and **never** passed into the vectorization algorithm.
- Loss function returns a single scalar `loss ∈ [0, 1]` per run, plus per-shape breakdown (palette-match, coverage-IoU, centroid-error).
- Deterministic: same `seed + colors + shapeCount` → identical image + identical truth + identical loss.
- CLI entrypoint runs the full harness headlessly for Ralph: `npm run benchmark:multicolor -- --seed N --colors K --shapes S` → JSON report.
- A minimum of 3 committed benchmark runs (seeds) with recorded baseline losses before optimization begins.

---

## Thin slices

Each slice is one atomic commit, builds on the last, and is testable in isolation. Slices map to the dev workflow commands.

### Slice 1 — `/spec`: truth schema

**Build:** `src/benchmarks/ground-truth/schema.ts`

Define the `Truth` type and the `GeneratorInput` type. No logic yet.

```ts
type Shape =
  | { kind: 'circle';    cx:number; cy:number; r:number;        color: string }
  | { kind: 'rectangle'; x:number;  y:number;  w:number; h:number; color: string }
  | { kind: 'triangle';  p1:Point;  p2:Point;  p3:Point;        color: string }

type Truth = { width:number; height:number; palette:string[]; shapes:Shape[]; seed:number }

type GeneratorInput = { seed:number; colors:number; shapeCount:1|2|3; width:number; height:number }
```

**Test:** type-level only — no runtime.
**Done when:** file imports cleanly, exports compile.

---

### Slice 2 — `/build`: deterministic PRNG + palette picker

**Build:** `src/benchmarks/ground-truth/rng.ts`, `palette.ts`

- Mulberry32 or similar seeded PRNG.
- `pickPalette(rng, n): string[]` — returns `n` visually-distinct hex colors (HSL spacing, `n ≤ 16`).

**Test:** same seed → same sequence, same palette. Different seeds → different palettes. Palette length == n.
**Done when:** vitest covers both + snapshot of palette for 3 fixed seeds.

---

### Slice 3 — `/build`: shape generator

**Build:** `src/benchmarks/ground-truth/generator.ts`

`generateTruth(input: GeneratorInput): Truth` — places `shapeCount` non-overlapping shapes, each assigned a distinct color from the palette, with bounding boxes that fit inside the canvas.

**Test:**
- Determinism: same input → identical Truth (deep-equal).
- Non-overlap: bounding boxes of any two shapes don't intersect.
- Color uniqueness: no two shapes share a color.
- Canvas bounds: all shapes fit within width/height.

---

### Slice 4 — `/build`: truth → raster

**Build:** `src/benchmarks/ground-truth/rasterize.ts`

`rasterizeTruth(truth: Truth): ImageData` — draws shapes onto an `ImageData` using exact integer rasterization (no AA). Background = white.

**Test:**
- Pixel count of each shape's color matches an analytic bound (e.g., circle area ≈ πr², rectangle = w·h).
- Background pixels + shape pixels = total pixels.
- Visual golden snapshot for one fixed seed.

**Blind barrier:** this function is the *only* place Truth crosses into pixel-space. Downstream code consumes `ImageData` only, never `Truth`.

---

### Slice 5 — `/build`: loss function

**Build:** `src/benchmarks/ground-truth/loss.ts`

`computeLoss(truth: Truth, output: VectorOutput): LossReport`

Where `VectorOutput = { palette: string[]; paths: BezierPath[] }` — the algorithm's result.

```
LossReport = {
  paletteMatch:  number;  // 0..1, bipartite match truth palette ↔ output palette (ΔE in Lab)
  coverageIoU:   number;  // 0..1, rasterize(output) vs rasterize(truth), per-color IoU, avg
  centroidError: number;  // pixels, mean euclidean distance between matched shape centroids
  loss:          number;  // 1 - (0.4*paletteMatch + 0.5*coverageIoU + 0.1*(1 - normalized centroidError))
}
```

**Test:**
- `loss(truth, rasterize(truth)→trace)` < 0.2 for trivial cases (same palette, same shapes).
- Perturbed output (wrong color) → paletteMatch drops predictably.
- Missing shape → coverageIoU drops predictably.
- Deterministic: same (truth, output) → same report.

---

### Slice 6 — `/build`: k-means color quantization

**Build:** `src/algorithms/quantize/kmeans.ts`, `src/algorithms/quantize/elbow.ts`

- `quantize(imageData, k, seed): { palette, indices }` — seeded k-means++ in Lab color space.
- `chooseK(imageData, { maxK = 16, seed }): { k, wcssByK }` — runs k-means for `k ∈ [1..maxK]`, returns the elbow point (max-distance-to-line heuristic on the WCSS curve).
- `autoQuantize(imageData, { maxK, seed }): { k, palette, indices, wcssByK }` — `chooseK` then `quantize` at the chosen `k`. This is what the benchmark harness calls.

**Blind barrier:** `chooseK` sees only pixel data. No hint that the truth used N colors.

**Test:**
- `k = 1` → palette = average color.
- Same seed → same palette + same `k`.
- On rasterized truth with `N ∈ {2, 4, 8}` shape-colors, `chooseK` recovers `k` within ±1 of truth for ≥80% of 12 fixed seeds. (This is a baseline; Ralph's job is to raise it.)
- Recovered palette matches truth palette within ΔE < 5 per color (bipartite).

---

### Slice 7 — `/build`: per-layer pipeline

**Build:** extend `src/algorithms/pipeline.ts`

Add `runMultiColorPipeline(imageData, { colors, ...opts })`:

1. Quantize → `{ palette, indices }`.
2. For each color `i` in palette: build binary mask `indices === i`, run existing contour trace + curve fit.
3. Stack results → `{ svg, layers: [{ color, paths }] }`.

**Test:**
- `colors = 1` → identical output to existing single-color pipeline (regression).
- On rasterized truth, every truth shape has at least one corresponding layer in output.
- SVG string contains one `<path fill="#..">` per non-empty layer.

---

### Slice 8 — `/build`: benchmark entrypoint

**Build:** `src/benchmarks/multicolor.ts` + `package.json` script `benchmark:multicolor`

CLI: `npm run benchmark:multicolor -- --seed N --colors K --shapes S [--out path]`

Pipeline:
```
generateTruth → rasterizeTruth → runMultiColorPipeline → computeLoss → emit JSON
```

**Blind barrier check:** assert at runtime that `runMultiColorPipeline` receives only `ImageData` and pipeline options. The harness should fail loudly if anyone tries to thread `Truth` into it.

**Test:** `npm run benchmark:multicolor -- --seed 1 --colors 4 --shapes 3` prints a LossReport and exits 0.

---

### Slice 9 — `/test`: baseline benchmark runs

Run the benchmark on 3 fixed seeds × {2, 4, 8} colors × {1, 2, 3} shapes = 27 runs. Commit the JSON outputs to `tests/benchmarks/multicolor-baselines/`.

These are the numbers the Ralph loop will try to beat.

---

### Slice 10 — `/build`: UI wiring

**Build:** `ParameterControls.tsx` — add `Colors` slider (2/4/8/16). App.tsx routes to `runMultiColorPipeline` when `colors > 1`.

**Test:** manual — upload Doby, slide colors 2→16, see SVG layers grow. No automated test (UI is thin; the algorithm is covered by Slices 1–9).

---

### Slice 11 — `/review` + `/code-simplify`

Pass over the 10 slices as a whole: delete any scaffolding that turned out unused, merge duplicated loss/rasterize helpers, tighten types.

---

### Slice 12 — `/ship`

Merge to main. The Ralph loop starts from baseline and iterates on whatever slice of the algorithm is weakest (almost certainly palette-match first).

---

## Blind-barrier rules (for the Ralph loop)

The optimization target is `runMultiColorPipeline` + `quantize`. Those two modules must:

- Import nothing from `src/benchmarks/ground-truth/*`.
- Accept only `ImageData` and pipeline options as input.
- ESLint boundary rule (or a grep check in CI) to enforce the import direction.

The benchmark harness is adversarial: it knows the truth, the algorithm does not. If Ralph ever "solves" the benchmark by reading truth, we've contaminated the loop and the number is meaningless.

---

## Decisions

- **Loss weights locked:** `0.4 * paletteMatch + 0.5 * coverageIoU + 0.1 * (1 - normCentroidError)`. The 0.1 on centroid error is intentional — coverage already penalizes shape misplacement indirectly, centroid is a tiebreaker.
- **k-means seed:** independent of the truth seed. Algorithm has no access to truth-side randomness.
- **k-means init:** k-means++ with a data-driven `k` chosen by the **elbow method** on within-cluster sum of squares (WCSS) across `k ∈ [1..16]`. When the user supplies `colors = N` via the UI, that overrides the elbow choice; the benchmark harness always uses the elbow-selected `k` so auto-selection is what's being optimized.

## Open questions

- Should the shape generator also produce holes / concentric shapes? Not in v1 — keep the search space small.
