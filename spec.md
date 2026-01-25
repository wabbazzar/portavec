# Portavec Specification

Browser-based raster-to-vector conversion tool with ground-truth benchmarking and iterative algorithm improvement.

## Problem Statement

Convert raster images (PNG, JPG) to scalable vector graphics (SVG) with interactive elements. The motivating use case is a fantasy forest scene with doors on trees that need hover/click animations - but the tool should be general-purpose.

**Core insight**: Build a tight feedback loop using synthetic benchmarks where we control the ground truth. Generate vectors (text, shapes) → rasterize → vectorize → compare to original. This enables rapid iteration on algorithms with measurable improvement.

## Technical Requirements

### Runtime Environment
- **Pure browser** - all processing client-side via TypeScript + Canvas/WebGL/WASM
- **No server dependency** - works offline, simple deployment (static hosting)
- **Bundler**: Vite (fast, modern, good WASM support)

### Core Capabilities
1. Load raster image (PNG, JPG, BMP)
2. Process through vectorization pipeline
3. Output SVG with configurable fidelity
4. Display side-by-side comparison with metrics

## Architecture

```
portavec/
├── src/
│   ├── algorithms/           # Vectorization implementations
│   │   ├── edge-detection/   # Canny, Sobel, etc.
│   │   ├── contour-tracing/  # Path extraction
│   │   ├── curve-fitting/    # Bézier approximation
│   │   ├── color-quant/      # Color quantization
│   │   └── pipeline.ts       # Orchestration
│   ├── benchmarks/
│   │   ├── generator.ts      # Create ground-truth test cases
│   │   ├── evaluator.ts      # Compare output to ground truth
│   │   └── suites/           # Test case definitions
│   ├── ui/
│   │   ├── App.tsx           # Main application
│   │   ├── ComparisonView.tsx    # Side-by-side display
│   │   ├── MetricsPanel.tsx      # Telemetry display
│   │   ├── BenchmarkRunner.tsx   # Test suite execution
│   │   └── ImageLoader.tsx       # File input handling
│   ├── optimization/
│   │   ├── grid-search.ts    # Parameter sweep
│   │   └── genetic.ts        # Evolutionary optimization (Phase 2)
│   └── utils/
│       ├── canvas.ts         # Canvas manipulation helpers
│       ├── svg.ts            # SVG generation/parsing
│       └── metrics.ts        # SSIM, path comparison, etc.
├── docs/
│   ├── ALGORITHM_RESEARCH.md # Research findings with citations
│   └── DECISION_LOG.md       # Architecture decisions and rationale
├── tests/                    # Unit tests for algorithm components
├── benchmarks/               # Generated benchmark assets (gitignored)
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
└── spec.md                   # This file
```

## Development Phases

### Phase 1: Research (Prerequisites for all other phases)

**Objective**: Survey existing algorithms, understand tradeoffs, select initial approach.

**Deliverables**:
- `docs/ALGORITHM_RESEARCH.md` with:
  - Overview of raster-to-vector problem space
  - Analysis of key algorithms:
    - **Potrace** (Peter Selinger) - polygon decomposition, bitmap tracing
    - **AutoTrace** - centerline vs outline tracing
    - **Color quantization**: median cut, k-means, octree
    - **Edge detection**: Canny, Sobel, Marr-Hildreth
    - **Bézier fitting**: Schneider's algorithm, least-squares fitting
    - **Neural approaches**: Deep Vectorization (Adobe), LIVE
  - Decision matrix scoring algorithms on:
    - Accuracy (visual fidelity)
    - Performance (browser-viable)
    - Complexity (implementation effort)
    - Flexibility (handles color, gradients, etc.)
  - Recommended starting algorithm with rationale

**Research sources**:
- Academic papers (use web search)
- Existing implementations (Potrace source, Inkscape, etc.)
- Blog posts and tutorials on vectorization

**Exit criteria**: Algorithm selected, approach documented, ready to implement.

### Phase 2: Scaffold

**Objective**: Set up project structure, build infrastructure, create benchmark generator.

**Deliverables**:
- Repository initialized with Vite + TypeScript
- Benchmark generator that:
  - Renders text to canvas with specified fonts
  - Validates rendering (no text runoff, proper bounds)
  - Exports both SVG (ground truth) and PNG (test input)
  - Supports multiple complexity levels
- Comparison UI shell (loads two images side-by-side)
- Metrics calculation stubs (SSIM placeholder, etc.)

**Test fonts to include**:
- System: Arial, Times New Roman, Courier New, Georgia
- Google Fonts: Cinzel, Crimson Text, Playfair Display, Dancing Script
- Edge cases: Very thin strokes, ornate serifs, script fonts with connected letters

**Validation requirements for benchmark generator**:
- Text must fit within canvas bounds (no clipping)
- Consistent rendering across runs
- Export both lossless PNG and source SVG
- Include metadata (font, size, content) in output

**Exit criteria**: Can generate benchmark pairs, view them in UI, project builds cleanly.

### Phase 3: Black & White Implementation

**Objective**: Vectorize binary (1-bit) images - solid black shapes on white background.

**Pipeline**:
1. **Threshold** - Convert to pure black/white
2. **Edge detection** - Find boundaries between regions
3. **Contour tracing** - Extract ordered point sequences
4. **Curve fitting** - Convert points to Bézier paths
5. **SVG generation** - Output clean vector paths

**Benchmark suite**:
- Simple shapes: square, circle, triangle
- Text: Single letters (A, O, S - different curve types)
- Text: Words in various fonts
- Complex: Paragraph of text
- Edge cases: Very thin lines, sharp corners, curves

**Metrics to track**:
- SSIM (structural similarity) between original and re-rasterized output
- Path node count (fewer is better for same quality)
- Visual diff heatmap
- Processing time (ms)
- Memory usage (MB)

**Exit criteria**:
- SSIM > 0.95 on simple shapes
- SSIM > 0.90 on text benchmarks
- Processing time < 1s for 512x512 image

### Phase 4: Grayscale Implementation

**Objective**: Handle images with tonal variation (multiple gray levels).

**Additional pipeline stages**:
1. **Posterization** - Reduce to N gray levels
2. **Region segmentation** - Identify contiguous tonal regions
3. **Layer generation** - Create stacked SVG layers (back to front)
4. **Gradient detection** (optional) - Identify and preserve smooth gradients

**Benchmark suite**:
- Gradient fills (linear, radial)
- Soft-edged shapes
- Photographs with clear tonal separation
- Text with anti-aliasing

**Exit criteria**:
- Handles 4-8 gray levels cleanly
- SSIM > 0.85 on grayscale benchmarks
- Reasonable output file size (not exploding with paths)

### Phase 5: Color Implementation

**Objective**: Full color vectorization with region-based approach.

**Additional pipeline stages**:
1. **Color quantization** - Reduce to palette (median cut or k-means)
2. **Per-color segmentation** - Extract regions for each palette color
3. **Layer ordering** - Determine optimal stacking
4. **Color assignment** - Map regions to SVG fills

**Benchmark suite**:
- Flat color illustrations (like the forest image)
- Icons and logos
- Claude-generated SVGs (rasterize → vectorize → compare to original)
- Photographs (expect lower fidelity, test graceful degradation)

**Target palette sizes**: 4, 8, 16, 32, 64 colors (user configurable)

**Exit criteria**:
- Handles 16-color images well
- SSIM > 0.80 on flat color benchmarks
- Forest door image produces usable output for interactive overlays

### Phase 6: Optimization Framework

**Objective**: Systematic parameter tuning and algorithm improvement.

**Grid search implementation**:
- Define parameter space for each algorithm stage
- Run benchmarks across parameter combinations
- Track metrics, identify optimal configurations
- Visualize parameter sensitivity

**Genetic optimization (future)**:
- Represent algorithm configuration as genome
- Fitness function = weighted metric score
- Mutation: tweak parameters
- Crossover: combine configurations
- Selection: keep best performers

**Exit criteria**:
- Can run parameter sweep on any pipeline stage
- Results logged and visualizable
- Measurable improvement over default parameters

## Comparison UI Specification

### Layout
```
┌─────────────────────────────────────────────────────────────┐
│  [Load Image]  [Run Benchmark Suite]  [Export SVG]          │
├───────────────────────┬───────────────────────┬─────────────┤
│                       │                       │             │
│      Original         │      Vectorized       │    Diff     │
│       (Raster)        │        (SVG)          │   Overlay   │
│                       │                       │             │
├───────────────────────┴───────────────────────┴─────────────┤
│  Metrics Panel                                              │
│  ┌─────────────┬─────────────┬─────────────┬──────────────┐ │
│  │ SSIM: 0.94  │ Paths: 127  │ Time: 342ms │ Memory: 12MB │ │
│  └─────────────┴─────────────┴─────────────┴──────────────┘ │
│  ┌──────────────────────────────────────────────────────────┐│
│  │ [Pixel Diff Heatmap]                                    ││
│  └──────────────────────────────────────────────────────────┘│
├─────────────────────────────────────────────────────────────┤
│  Algorithm Parameters (collapsible)                         │
│  - Edge threshold: [slider]                                 │
│  - Curve tolerance: [slider]                                │
│  - Color count: [dropdown]                                  │
└─────────────────────────────────────────────────────────────┘
```

### Metrics Displayed
| Metric | Description | Target |
|--------|-------------|--------|
| SSIM | Structural similarity (0-1) | > 0.90 |
| Pixel Diff | Percentage of differing pixels | < 5% |
| Path Count | Number of SVG path elements | Lower is better |
| Node Count | Total Bézier control points | Lower is better |
| Processing Time | End-to-end conversion (ms) | < 1000ms |
| Memory Peak | Maximum memory during processing | < 100MB |
| File Size | Output SVG size | Reasonable for use case |

### Diff Overlay Modes
- **Side-by-side**: Original and output adjacent
- **Onion skin**: Semi-transparent overlay
- **Difference**: Highlight pixels that differ
- **Toggle**: Flip between original and output

## Benchmark Generation Rules

### Text Rendering Validation
Before accepting a generated benchmark:
1. **Bounds check**: All text within canvas, no clipping
2. **Legibility**: Render at sufficient size for font details
3. **Consistency**: Same input produces identical output
4. **Format validity**: PNG is lossless, SVG is well-formed

### Complexity Progression
```
Level 1 (Trivial):     Single shape, solid fill
Level 2 (Simple):      Single letter, one font
Level 3 (Basic):       Word, simple font
Level 4 (Standard):    Sentence, mixed fonts
Level 5 (Complex):     Paragraph, decorative fonts
Level 6 (Challenge):   Multi-element composition
Level 7 (Final):       Claude-generated artistic SVGs
```

### Ground Truth Generation
1. Create SVG programmatically (text, shapes, paths)
2. Render SVG to canvas at target resolution
3. Export canvas as PNG (test input)
4. Store original SVG (ground truth)
5. After vectorization, compare output SVG paths to original

## Success Criteria

### MVP (v0.1)
- [ ] Benchmark generator working with text
- [ ] B&W vectorization with SSIM > 0.90 on text
- [ ] Comparison UI with basic metrics
- [ ] Can process 512x512 image in < 2s

### v0.5
- [ ] Grayscale support
- [ ] Color quantization (16 colors)
- [ ] Parameter tuning UI
- [ ] Grid search optimization

### v1.0
- [ ] Full color vectorization
- [ ] Handles forest image with usable output
- [ ] Genetic optimization framework
- [ ] Export production-ready SVGs

## External Resources

### Key Papers to Research
- Selinger, P. "Potrace: a polygon-based tracing algorithm"
- Schneider, P. "An Algorithm for Automatically Fitting Digitized Curves" (Graphics Gems)
- Adobe Research "Deep Vectorization of Technical Drawings"
- "LIVE: Layer-wise Image Vectorization"

### Reference Implementations
- Potrace: http://potrace.sourceforge.net/
- Inkscape trace bitmap: https://gitlab.com/inkscape/inkscape
- Vectorizer.ai (commercial, for comparison)
- imagetracer.js (JavaScript implementation)

## Notes

- This tool is being built to enable interactive overlays on a wedding app forest scene
- The forest image has: multiple trees, decorative doors, a cat character, pond with koi
- End goal: Extract door regions as vector paths for hover/click animations
- Hybrid approach (Option B from initial discussion) remains viable if full vectorization proves too complex - could use this tool just for interactive element extraction
