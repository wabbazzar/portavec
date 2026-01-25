# Portavec Technical Specification

Browser-based raster-to-vector conversion tool with ground-truth benchmarking.

## Overview

Portavec converts raster images (PNG, JPG) to scalable vector graphics (SVG) with a tight feedback loop using synthetic benchmarks where ground truth is controlled. The tool runs entirely client-side with no server dependency.

## Tech Stack

| Component | Technology | Rationale |
|-----------|------------|-----------|
| Bundler | Vite | Fast HMR, native ESM, excellent WASM support |
| Language | TypeScript | Type safety for algorithm code |
| UI Framework | React | Component-based, ecosystem, familiar |
| State Management | React Context + useReducer | Built-in, sufficient complexity |
| Testing | Vitest | Native Vite integration, fast |
| Styling | CSS Modules or Tailwind | Scoped styles, no runtime |

## Project Structure

```
portavec/
├── src/
│   ├── algorithms/
│   │   ├── edge-detection/
│   │   │   ├── canny.ts           # Canny edge detector
│   │   │   ├── sobel.ts           # Sobel operator
│   │   │   └── index.ts           # Edge detection exports
│   │   ├── contour-tracing/
│   │   │   ├── marching-squares.ts
│   │   │   ├── potrace-decompose.ts
│   │   │   └── index.ts
│   │   ├── curve-fitting/
│   │   │   ├── douglas-peucker.ts  # Point simplification
│   │   │   ├── schneider.ts        # Bézier fitting
│   │   │   └── index.ts
│   │   ├── threshold/
│   │   │   ├── otsu.ts             # Otsu's method
│   │   │   ├── adaptive.ts         # Adaptive threshold
│   │   │   └── index.ts
│   │   └── pipeline.ts             # Orchestration
│   ├── benchmarks/
│   │   ├── generator.ts            # Ground-truth test case creation
│   │   ├── evaluator.ts            # Compare output to ground truth
│   │   ├── font-loader.ts          # Web Font Loader API wrapper
│   │   └── suites/
│   │       ├── shapes.ts           # Basic geometric shapes
│   │       ├── letters.ts          # Single character tests
│   │       ├── words.ts            # Word-level tests
│   │       └── index.ts
│   ├── ui/
│   │   ├── App.tsx                 # Main application
│   │   ├── ComparisonView.tsx      # Side-by-side display
│   │   ├── MetricsPanel.tsx        # Telemetry display
│   │   ├── DiffOverlay.tsx         # Visual diff modes
│   │   ├── ParameterControls.tsx   # Algorithm parameter sliders
│   │   ├── BenchmarkRunner.tsx     # Test suite execution
│   │   ├── ImageLoader.tsx         # File input handling
│   │   └── context/
│   │       ├── AppContext.tsx      # Global state provider
│   │       └── reducer.ts          # State reducer
│   └── utils/
│       ├── canvas.ts               # Canvas manipulation helpers
│       ├── svg.ts                  # SVG generation/parsing
│       ├── metrics.ts              # SSIM, pixel diff calculations
│       └── image.ts                # Image loading utilities
├── docs/
│   ├── ALGORITHM_RESEARCH.md       # Research findings with citations
│   └── DECISION_LOG.md             # Architecture decisions
├── tests/
│   ├── algorithms/                 # Unit tests for algorithm components
│   ├── benchmarks/                 # Benchmark generator tests
│   └── utils/                      # Utility function tests
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
└── vitest.config.ts
```

## Phase 1: Research

### Objective
Survey existing algorithms, understand tradeoffs, select initial approach.

### Deliverables

**docs/ALGORITHM_RESEARCH.md** must contain:

1. **Problem Space Overview**
   - Definition of raster-to-vector conversion
   - Key challenges: noise handling, curve approximation, color handling
   - Quality vs performance tradeoffs

2. **Algorithm Analysis** (for each algorithm):
   - How it works (high-level description)
   - Strengths and weaknesses
   - Browser viability (performance, memory)
   - Implementation complexity

3. **Algorithms to Research**:
   - **Potrace** (Peter Selinger): Polygon decomposition, bitmap tracing
   - **AutoTrace**: Centerline vs outline tracing comparison
   - **Edge Detection**: Canny, Sobel, Marr-Hildreth
   - **Bézier Fitting**: Schneider's algorithm, least-squares fitting
   - **Contour Tracing**: Marching squares, Moore-neighbor

4. **Decision Matrix**
   | Algorithm | Accuracy | Performance | Complexity | Browser-Viable |
   |-----------|----------|-------------|------------|----------------|
   | Potrace   | ?/5      | ?/5         | ?/5        | Yes/No         |
   | ...       | ...      | ...         | ...        | ...            |

5. **Recommendation**
   - Selected algorithm(s) with rationale
   - Implementation approach
   - Known limitations

### Acceptance Criteria
- [ ] Research document exists at docs/ALGORITHM_RESEARCH.md
- [ ] At least 5 algorithms analyzed with pros/cons
- [ ] Decision matrix completed with justified scores
- [ ] Clear recommendation with implementation approach
- [ ] All claims backed by citations or source code references

## Phase 2: Scaffold

### Objective
Set up project structure, build infrastructure, create benchmark generator.

### 2.1 Project Setup

**package.json dependencies**:
```json
{
  "dependencies": {
    "react": "^18.x",
    "react-dom": "^18.x"
  },
  "devDependencies": {
    "@types/react": "^18.x",
    "@types/react-dom": "^18.x",
    "@vitejs/plugin-react": "^4.x",
    "typescript": "^5.x",
    "vite": "^5.x",
    "vitest": "^1.x"
  }
}
```

**TypeScript Configuration**:
- Strict mode enabled
- ES2022 target (modern browser features)
- JSX preserve for Vite

### 2.2 Benchmark Generator

**Core Interface**:
```typescript
interface BenchmarkCase {
  id: string;
  name: string;
  complexity: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  groundTruthSvg: string;    // Original SVG source
  rasterPng: Blob;           // Rasterized version
  metadata: {
    type: 'shape' | 'text' | 'composite';
    font?: string;
    fontSize?: number;
    content?: string;
    dimensions: { width: number; height: number };
  };
}

interface BenchmarkSuite {
  name: string;
  cases: BenchmarkCase[];
}
```

**Font Loading Requirements**:
```typescript
// Use document.fonts API for reliable font detection
async function loadFont(fontFamily: string): Promise<boolean> {
  const testString = 'ABCDabcd1234';
  const font = new FontFace(fontFamily, `local("${fontFamily}")`);

  try {
    await font.load();
    document.fonts.add(font);
    await document.fonts.ready;
    return true;
  } catch {
    return false;
  }
}
```

**System Fonts** (always available):
- Arial, Helvetica
- Times New Roman, Georgia
- Courier New, Monaco
- Verdana, Tahoma

**Google Fonts** (load dynamically):
- Cinzel (decorative serif)
- Crimson Text (elegant serif)
- Playfair Display (high contrast)
- Dancing Script (cursive)

**Validation Rules**:
1. Text must fit within canvas bounds (no clipping)
2. Minimum 10px padding from edges
3. Font must be fully loaded before rendering
4. Consistent rendering (deterministic output)
5. PNG export must be lossless

### 2.3 Comparison UI Shell

**Layout Components**:
```
┌─────────────────────────────────────────────────────────────┐
│  [Load Image]  [Run Benchmarks]  [Export SVG]               │
├───────────────────────┬───────────────────────┬─────────────┤
│                       │                       │             │
│      Original         │      Vectorized       │    Diff     │
│       (Raster)        │        (SVG)          │   Overlay   │
│                       │                       │             │
├───────────────────────┴───────────────────────┴─────────────┤
│  Metrics Panel                                              │
│  SSIM: --  |  Paths: --  |  Time: --  |  Diff: --          │
├─────────────────────────────────────────────────────────────┤
│  Parameters (collapsible)                                   │
│  - Threshold: [slider]                                      │
│  - Curve tolerance: [slider]                                │
└─────────────────────────────────────────────────────────────┘
```

**App State Structure**:
```typescript
interface AppState {
  // Input
  sourceImage: ImageData | null;
  sourceType: 'file' | 'benchmark';

  // Output
  resultSvg: string | null;
  resultRasterized: ImageData | null;

  // Metrics
  metrics: {
    ssim: number | null;
    pixelDiff: number | null;
    pathCount: number | null;
    nodeCount: number | null;
    processingTimeMs: number | null;
    memorySizeBytes: number | null;
  };

  // Parameters
  parameters: {
    threshold: number;       // 0-255
    curveTolerance: number;  // 0.1-10.0
    minPathLength: number;   // 1-100 pixels
  };

  // UI state
  diffMode: 'side-by-side' | 'onion' | 'difference' | 'toggle';
  isProcessing: boolean;
  error: string | null;
}
```

### 2.4 Metrics Stubs

**SSIM Calculation** (placeholder implementation):
```typescript
function calculateSSIM(img1: ImageData, img2: ImageData): number {
  // TODO: Implement proper SSIM
  // For now, return pixel-by-pixel comparison
  let matching = 0;
  const total = img1.data.length / 4;

  for (let i = 0; i < img1.data.length; i += 4) {
    const r1 = img1.data[i], g1 = img1.data[i+1], b1 = img1.data[i+2];
    const r2 = img2.data[i], g2 = img2.data[i+1], b2 = img2.data[i+2];

    if (Math.abs(r1-r2) < 10 && Math.abs(g1-g2) < 10 && Math.abs(b1-b2) < 10) {
      matching++;
    }
  }

  return matching / total;
}
```

### Acceptance Criteria
- [ ] `npm install` succeeds with no errors
- [ ] `npm run dev` starts Vite dev server
- [ ] `npm run build` produces production bundle
- [ ] `npm test` runs Vitest (can have 0 tests initially)
- [ ] Benchmark generator creates valid PNG/SVG pairs
- [ ] Font loading waits for fonts before rendering
- [ ] UI displays two images side-by-side
- [ ] Metrics panel shows placeholder values
- [ ] Parameters panel has working sliders (no-op for now)

## Phase 3: Black & White Implementation

### Objective
Vectorize binary (1-bit) images with high fidelity.

### 3.1 Pipeline Architecture

```typescript
interface PipelineStage<TInput, TOutput> {
  name: string;
  process(input: TInput): TOutput;
}

interface VectorizationPipeline {
  stages: [
    PipelineStage<ImageData, ImageData>,      // Threshold
    PipelineStage<ImageData, Edge[]>,          // Edge detection
    PipelineStage<Edge[], Contour[]>,          // Contour tracing
    PipelineStage<Contour[], BezierPath[]>,    // Curve fitting
    PipelineStage<BezierPath[], string>        // SVG generation
  ];

  run(input: ImageData): string;
}
```

### 3.2 Stage Implementations

**Stage 1: Threshold**
```typescript
interface ThresholdOptions {
  method: 'fixed' | 'otsu' | 'adaptive';
  value?: number;          // For fixed method (0-255)
  blockSize?: number;      // For adaptive (odd number, e.g., 11)
  constant?: number;       // For adaptive (e.g., 2)
}

// Otsu's method: automatic threshold selection
function otsuThreshold(grayscale: Uint8ClampedArray): number {
  // Build histogram
  const histogram = new Array(256).fill(0);
  for (const pixel of grayscale) histogram[pixel]++;

  // Find threshold that maximizes between-class variance
  // ... implementation based on research
}
```

**Stage 2: Edge Detection**
```typescript
interface Edge {
  x: number;
  y: number;
  direction: 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
}

// Implementation based on research findings
// Options: Sobel for simplicity, Canny for quality
```

**Stage 3: Contour Tracing**
```typescript
interface Point {
  x: number;
  y: number;
}

interface Contour {
  points: Point[];
  isHole: boolean;      // Inner contour (subtract from parent)
  parent?: Contour;     // For nested shapes
}

// Marching squares or Potrace-style decomposition
// Must handle holes (e.g., letter 'O' has outer and inner contour)
```

**Stage 4: Curve Fitting**
```typescript
interface BezierSegment {
  type: 'L' | 'C';  // Line or Cubic bezier
  points: Point[];  // 1 point for L, 3 for C (control1, control2, end)
}

interface BezierPath {
  segments: BezierSegment[];
  closed: boolean;
}

// Two-step process:
// 1. Douglas-Peucker for point reduction
// 2. Schneider's algorithm for Bézier fitting
```

**Stage 5: SVG Generation**
```typescript
function pathToSvgD(path: BezierPath): string {
  let d = `M ${path.segments[0].points[0].x} ${path.segments[0].points[0].y}`;

  for (const segment of path.segments) {
    if (segment.type === 'L') {
      d += ` L ${segment.points[0].x} ${segment.points[0].y}`;
    } else {
      d += ` C ${segment.points[0].x} ${segment.points[0].y} ` +
           `${segment.points[1].x} ${segment.points[1].y} ` +
           `${segment.points[2].x} ${segment.points[2].y}`;
    }
  }

  if (path.closed) d += ' Z';
  return d;
}
```

### 3.3 Benchmark Suite

**Level 1 - Shapes**:
- Filled square (50x50)
- Filled circle (r=25)
- Filled triangle (equilateral)
- Rectangle with hole

**Level 2 - Single Letters**:
- 'O' (tests outer/inner contour)
- 'S' (tests curves)
- 'A' (tests angles and hole)
- 'M' (tests sharp corners)

**Level 3 - Words**:
- "Hello" in Arial
- "Test" in Times New Roman
- "Quick" in Georgia

**Level 4 - Edge Cases**:
- Very thin line (1px)
- Sharp corner (45°, 90°, 135°)
- Nearly-touching shapes
- Complex curves (8-figure)

### 3.4 Metrics Implementation

**Full SSIM Implementation**:
```typescript
// Structural Similarity Index
function ssim(img1: ImageData, img2: ImageData): number {
  // Constants for stability
  const k1 = 0.01, k2 = 0.03;
  const L = 255;  // Dynamic range
  const c1 = (k1 * L) ** 2;
  const c2 = (k2 * L) ** 2;

  // Convert to grayscale if needed
  const gray1 = toGrayscale(img1);
  const gray2 = toGrayscale(img2);

  // Calculate means
  const mean1 = average(gray1);
  const mean2 = average(gray2);

  // Calculate variances and covariance
  const var1 = variance(gray1, mean1);
  const var2 = variance(gray2, mean2);
  const covar = covariance(gray1, gray2, mean1, mean2);

  // SSIM formula
  const numerator = (2 * mean1 * mean2 + c1) * (2 * covar + c2);
  const denominator = (mean1**2 + mean2**2 + c1) * (var1 + var2 + c2);

  return numerator / denominator;
}
```

### Acceptance Criteria

**Functional**:
- [ ] Threshold stage converts color/grayscale to binary
- [ ] Edge detection identifies shape boundaries
- [ ] Contour tracing produces ordered point sequences
- [ ] Curve fitting generates smooth Bézier paths
- [ ] SVG output is valid and displays correctly
- [ ] Holes are handled correctly (letter 'O', 'A', etc.)

**Quality Metrics**:
- [ ] SSIM > 0.95 on simple shapes (square, circle, triangle)
- [ ] SSIM > 0.90 on single letters
- [ ] SSIM > 0.85 on words

**Performance**:
- [ ] 512x512 image processes in < 1 second
- [ ] No memory leaks (can process 10 images sequentially)
- [ ] UI remains responsive during processing

**Integration**:
- [ ] Full pipeline runs end-to-end
- [ ] Results display in comparison UI
- [ ] Metrics calculated and displayed
- [ ] Parameters affect output when changed

## Error Handling

### User Errors
- Invalid file type: Show clear message, list supported formats
- File too large: Warn and suggest resize (max 4096x4096)
- Processing failure: Show error, keep previous result displayed

### Algorithm Errors
- Empty contour: Skip, log warning
- Degenerate path: Simplify or skip
- Memory limit: Abort with message, suggest smaller image

### Validation
- All inputs validated before processing
- Type guards for algorithm stage interfaces
- Assertions for invariants in development mode

## Testing Strategy

### Unit Tests (Vitest)
- Each algorithm stage tested independently
- Known input/output pairs for regression
- Edge cases: empty image, single pixel, max size

### Integration Tests
- Full pipeline with benchmark images
- Metrics within expected ranges
- SVG output validates against schema

### Visual Regression (Manual)
- Side-by-side comparison screenshots
- Document any visual artifacts
- Track improvements over time

## Performance Considerations

- Use `OffscreenCanvas` where available
- Process in chunks for large images
- Debounce parameter changes (300ms)
- Cache intermediate results when parameters unchanged
- Consider Web Workers for CPU-intensive stages (Phase 2+)
