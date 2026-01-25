# Portavec Fix Plan

## Phase 1: Research (Priority: Critical) - COMPLETE

- [x] Create docs/ALGORITHM_RESEARCH.md with problem space overview
- [x] Research Potrace algorithm: document polygon decomposition approach, browser viability
- [x] Research edge detection methods: compare Canny vs Sobel vs Marr-Hildreth for browser use
- [x] Research contour tracing: document marching squares and Moore-neighbor algorithms
- [x] Research curve fitting: analyze Schneider's algorithm and Douglas-Peucker simplification
- [x] Create decision matrix scoring algorithms on accuracy, performance, complexity, browser-viability
- [x] Write recommendation section with selected approach and rationale

## Phase 2: Scaffold (Priority: Critical) - IN PROGRESS

### Project Setup - COMPLETE
- [x] Initialize Vite + React + TypeScript project with `npm create vite@latest . -- --template react-ts`
- [x] Add Vitest to devDependencies and create vitest.config.ts
- [x] Configure tsconfig.json with strict mode and ES2022 target
- [x] Create project directory structure per specs/portavec.md
- [x] Add Google Fonts link to index.html (Cinzel, Crimson Text, Playfair Display, Dancing Script)

### UI Shell - COMPLETE
- [x] Implement src/ui/context/reducer.ts with AppState interface and actions
- [x] Implement src/ui/context/AppContext.tsx with React Context provider
- [x] Implement src/ui/ImageLoader.tsx for file input (PNG, JPG, BMP)
- [x] Implement src/ui/ComparisonView.tsx with three-panel layout (original, vectorized, diff)
- [x] Implement src/ui/MetricsPanel.tsx displaying SSIM, paths, time, memory
- [x] Implement src/ui/DiffOverlay.tsx with side-by-side, onion, difference, toggle modes
- [x] Implement src/ui/ParameterControls.tsx with threshold and curve tolerance sliders
- [x] Implement src/ui/App.tsx composing all components with main layout
- [x] Style components with CSS (grid layout, responsive design)

### Utilities - COMPLETE
- [x] Implement src/utils/canvas.ts with ImageData helpers (create, clone, toGrayscale)
- [x] Implement src/utils/image.ts with file loading and blob conversion
- [x] Implement src/utils/svg.ts with path generation and SVG document creation
- [x] Implement src/utils/metrics.ts with placeholder SSIM calculation
- [x] Write unit tests for utility functions

### Benchmark Generator - TODO
- [ ] Implement src/benchmarks/font-loader.ts with document.fonts API wrapper
- [ ] Implement src/benchmarks/generator.ts with BenchmarkCase and BenchmarkSuite interfaces
- [ ] Create src/benchmarks/suites/shapes.ts with square, circle, triangle test cases
- [ ] Create src/benchmarks/suites/letters.ts with O, S, A, M character tests
- [ ] Create src/benchmarks/suites/words.ts with multi-font word tests
- [ ] Add validation: text bounds checking, font load verification, deterministic output
- [ ] Write unit tests for benchmark generator (font loading, SVG/PNG export)

## Phase 3: B&W Implementation (Priority: High)

### Threshold Stage - COMPLETE
- [x] Implement src/algorithms/threshold/otsu.ts with Otsu's automatic threshold method
- [x] Implement src/algorithms/threshold/adaptive.ts with block-based adaptive threshold
- [x] Create src/algorithms/threshold/index.ts with unified threshold function
- [x] Write unit tests for threshold algorithms (known input/output pairs)

### Edge Detection Stage
- [ ] Implement src/algorithms/edge-detection/sobel.ts with Sobel operator
- [ ] Implement src/algorithms/edge-detection/canny.ts with Canny edge detector
- [ ] Create src/algorithms/edge-detection/index.ts with Edge interface and exports
- [ ] Write unit tests for edge detection (simple shapes, expected edge counts)

### Contour Tracing Stage
- [ ] Implement src/algorithms/contour-tracing/marching-squares.ts
- [ ] Add hole detection: identify inner contours vs outer contours
- [ ] Add parent-child relationship tracking for nested contours
- [ ] Create src/algorithms/contour-tracing/index.ts with Contour interface
- [ ] Write unit tests for contour tracing (letter O with hole, nested shapes)

### Curve Fitting Stage
- [ ] Implement src/algorithms/curve-fitting/douglas-peucker.ts for point simplification
- [ ] Implement src/algorithms/curve-fitting/schneider.ts for Bézier curve fitting
- [ ] Create src/algorithms/curve-fitting/index.ts with BezierPath interface
- [ ] Write unit tests for curve fitting (circular arc, S-curve approximation)

### Pipeline Integration
- [ ] Implement src/algorithms/pipeline.ts orchestrating all stages
- [ ] Connect pipeline to UI: trigger on image load, update results
- [ ] Implement full SSIM calculation in src/utils/metrics.ts
- [ ] Update MetricsPanel to display real metrics from pipeline
- [ ] Connect ParameterControls to pipeline configuration
- [ ] Write integration tests: full pipeline with benchmark images

### Benchmark Validation
- [ ] Run shape benchmarks: verify SSIM > 0.95 for square, circle, triangle
- [ ] Run letter benchmarks: verify SSIM > 0.90 for O, S, A, M
- [ ] Run word benchmarks: verify SSIM > 0.85 for Hello, Test, Quick
- [ ] Profile performance: verify < 1s for 512x512 image
- [ ] Fix any issues discovered during benchmark validation

## Completed
- [x] Project initialization
- [x] Create spec.md with full project specification
- [x] Create specs/portavec.md with technical specification

## Notes
- Research phase should be completed before implementation to inform algorithm choices
- Focus on getting one working pipeline first, then optimize
- SSIM thresholds are targets, not blockers - document actual achieved values
- Keep @AGENT.md updated with build/run commands after scaffold phase
