# Algorithm Research: Raster-to-Vector Conversion

## Problem Space Overview

### Definition
Raster-to-vector conversion (vectorization) transforms pixel-based images into mathematical descriptions using geometric primitives (points, lines, curves). The output is resolution-independent and can be scaled infinitely without quality loss.

### Key Challenges

1. **Noise Handling**: Raster images contain anti-aliasing artifacts, compression noise, and sampling irregularities that must be filtered without losing detail.

2. **Curve Approximation**: Converting pixel staircases into smooth curves requires balancing accuracy (fidelity to original) against complexity (number of control points).

3. **Topology Preservation**: Maintaining correct relationships between shapes - holes inside letters (O, A, B), overlapping regions, and nested contours.

4. **Color Handling**: For B&W conversion, determining optimal threshold; for color, segmenting regions and handling gradients.

5. **Performance vs Quality**: Real-time browser execution constrains algorithm complexity. Must process 512x512 images in <1s.

### Quality vs Performance Tradeoffs

| Approach | Quality | Speed | Complexity |
|----------|---------|-------|------------|
| Pixel-perfect tracing | Excellent | Slow | High |
| Simplified polygons | Good | Fast | Low |
| Bézier fitting | Excellent | Medium | Medium |
| Neural approaches | Variable | Slow | Very High |

## Algorithm Analysis

### 1. Potrace (Peter Selinger, 2001)

**How it Works**:
Potrace is a polygon-based tracing algorithm that operates in four stages:
1. **Decomposition**: Converts bitmap to paths by tracing black/white boundaries
2. **Polygon formation**: Creates polygons from traced paths
3. **Vertex adjustment**: Optimizes polygon vertices for smoothness
4. **Curve fitting**: Converts polygon segments to Bézier curves

The key insight is treating the bitmap as a graph where pixels are nodes and edges connect adjacent same-color pixels. Contours are found by walking this graph.

**Strengths**:
- Excellent curve quality, especially for text and line art
- Handles holes correctly via even-odd fill rule
- Deterministic output for same input
- Well-documented algorithm with public domain reference implementation
- Specifically designed for scalable vector output

**Weaknesses**:
- Requires clean binary input (pre-thresholding needed)
- Can struggle with very thin lines (<2px)
- Optimization step has O(n²) complexity for n-vertex polygons
- Not designed for photographs or continuous-tone images

**Browser Viability**:
- **Performance**: Good. Core algorithm is O(n) where n = edge pixels
- **Memory**: Moderate. Stores paths as arrays of points
- Implemented in JavaScript: [nickshanks/potrace-js](https://github.com/nickshanks/potrace-js)

**Implementation Complexity**: Medium (3/5)
- Core tracing is straightforward
- Curve fitting optimization requires careful implementation
- Reference C code available for porting

**Source**: Selinger, P. (2003). "Potrace: a polygon-based tracing algorithm." http://potrace.sourceforge.net/potrace.pdf

---

### 2. Marching Squares (Contour Tracing)

**How it Works**:
Marching squares examines 2x2 pixel neighborhoods to classify them into 16 possible configurations based on which corners are above/below a threshold. Each configuration maps to a specific line segment direction, producing contour lines.

```
Configuration examples:
0000 = empty    1111 = full    0001 = corner
0011 = edge     0110 = saddle  ...
```

The algorithm scans the image left-to-right, top-to-bottom, connecting line segments into continuous contours.

**Strengths**:
- Simple to implement and understand
- Guaranteed to produce closed contours
- O(n) complexity where n = pixel count
- Works on grayscale (any threshold)
- Basis for many vectorization tools

**Weaknesses**:
- Produces only line segments (no curves)
- Ambiguous "saddle" configurations require tie-breaking
- Output is jagged without post-processing
- Cannot distinguish edge direction (for shading)

**Browser Viability**: Excellent
- **Performance**: Very fast, single pass through image
- **Memory**: Low, only stores active contours
- Native JS implementations available

**Implementation Complexity**: Low (2/5)
- Core algorithm: ~100 lines of code
- Edge cases: saddle points, boundary handling

**Source**: Lorensen, W. E., & Cline, H. E. (1987). "Marching cubes: A high resolution 3D surface construction algorithm." ACM SIGGRAPH.

---

### 3. Moore-Neighbor Contour Tracing

**How it Works**:
Starting from a boundary pixel, the algorithm walks the contour by examining the 8-connected neighborhood (Moore neighborhood). It follows the boundary by always turning left/right relative to entry direction, producing a chain of boundary pixels.

```
Neighborhood:
[7][0][1]
[6][x][2]
[5][4][3]
```

**Strengths**:
- Extremely simple algorithm
- Produces ordered boundary point sequences
- Low memory footprint
- Fast execution

**Weaknesses**:
- Produces only pixel coordinates (no sub-pixel precision)
- May miss internal holes without additional passes
- Sensitive to noise (single pixel can alter path)
- No inherent smoothing

**Browser Viability**: Excellent
- **Performance**: O(perimeter length)
- **Memory**: Minimal

**Implementation Complexity**: Very Low (1/5)

**Source**: Moore, E.F. (1959). "Sequential Machines: Selected Papers"

---

### 4. Sobel Edge Detection

**How it Works**:
Applies two 3x3 convolution kernels to detect horizontal and vertical gradients:

```
Gx:          Gy:
[-1 0 +1]    [-1 -2 -1]
[-2 0 +2]    [ 0  0  0]
[-1 0 +1]    [+1 +2 +2]
```

Gradient magnitude: G = √(Gx² + Gy²)
Gradient direction: θ = atan2(Gy, Gx)

**Strengths**:
- Computationally efficient (6 multiplications per pixel)
- Produces gradient direction (useful for shading)
- Good noise suppression via smoothing component
- Well-understood, widely implemented

**Weaknesses**:
- Thick, imprecise edges (not single-pixel)
- Sensitive to noise despite smoothing
- No automatic threshold selection
- May miss weak edges

**Browser Viability**: Excellent
- **Performance**: O(n) single-pass convolution
- **Memory**: Requires output buffer same size as input

**Implementation Complexity**: Low (2/5)

**Source**: Sobel, I. (1968). "An Isotropic 3×3 Image Gradient Operator"

---

### 5. Canny Edge Detection

**How it Works**:
Multi-stage algorithm for optimal edge detection:
1. **Gaussian blur**: Smooth image to reduce noise
2. **Gradient calculation**: Sobel or similar operator
3. **Non-maximum suppression**: Thin edges to single-pixel width
4. **Double threshold**: Classify pixels as strong/weak edges
5. **Hysteresis**: Connect weak edges to strong edges

**Strengths**:
- Thin, accurate edges (single pixel width)
- Good noise suppression
- Adaptive thresholding reduces parameter tuning
- Considered optimal edge detector by theory

**Weaknesses**:
- More complex than Sobel (5 stages)
- Two threshold parameters to tune
- Computationally heavier
- May break edges at sharp corners

**Browser Viability**: Good
- **Performance**: 3-5x slower than Sobel
- **Memory**: Requires multiple intermediate buffers

**Implementation Complexity**: Medium (3/5)

**Source**: Canny, J. (1986). "A Computational Approach to Edge Detection." IEEE PAMI.

---

### 6. Marr-Hildreth Edge Detection (Laplacian of Gaussian)

**How it Works**:
Convolves image with Laplacian of Gaussian (LoG) kernel, then finds zero-crossings:
1. Apply Gaussian smoothing
2. Compute Laplacian (second derivative)
3. Find zero-crossing points

**Strengths**:
- Produces closed contours (zero-crossings are always closed)
- Theoretically elegant
- Single parameter (Gaussian σ)

**Weaknesses**:
- Sensitive to noise despite smoothing
- Poor localization compared to Canny
- Detects false edges at texture boundaries
- Large kernel sizes needed for smoothing

**Browser Viability**: Fair
- **Performance**: Slower than Sobel, comparable to Canny
- **Memory**: Large kernels increase memory

**Implementation Complexity**: Medium (3/5)

**Source**: Marr, D., & Hildreth, E. (1980). "Theory of Edge Detection." Proc. Royal Society.

---

### 7. Douglas-Peucker Simplification

**How it Works**:
Reduces points in a polyline while preserving shape:
1. Connect first and last points with a line
2. Find the point with maximum perpendicular distance
3. If distance > tolerance, recursively simplify each half
4. Otherwise, remove intermediate points

**Strengths**:
- Simple recursive algorithm
- Preserves shape characteristics
- Controllable via single tolerance parameter
- Works on any polyline

**Weaknesses**:
- O(n²) worst case (typically O(n log n))
- May remove important features at high tolerance
- No curve fitting (output is still polyline)
- Corner points may shift

**Browser Viability**: Excellent
- **Performance**: Fast for typical inputs
- **Memory**: Stack depth = recursion depth

**Implementation Complexity**: Low (2/5)

**Source**: Douglas, D., & Peucker, T. (1973). "Algorithms for the reduction of the number of points required to represent a digitized line."

---

### 8. Schneider's Algorithm (Bézier Curve Fitting)

**How it Works**:
Fits cubic Bézier curves to point sequences:
1. Estimate tangent directions at endpoints
2. Use Newton-Raphson iteration to fit curve
3. If error > tolerance, split at maximum error point
4. Recursively fit each segment

The algorithm produces G1-continuous curves (tangent continuity at join points).

**Strengths**:
- Produces smooth, compact output
- Adaptive subdivision for complex shapes
- Well-suited for font and illustration vectorization
- Tangent estimation preserves corners

**Weaknesses**:
- Complex implementation
- Iterative fitting may not converge
- Requires good initial tangent estimates
- O(n²) in worst case

**Browser Viability**: Good
- **Performance**: Moderate, iteration-dependent
- **Memory**: Low

**Implementation Complexity**: High (4/5)

**Source**: Schneider, P. (1990). "An Algorithm for Automatically Fitting Digitized Curves." Graphics Gems I.

---

### 9. Otsu's Thresholding

**How it Works**:
Automatically selects optimal binary threshold by maximizing between-class variance:
1. Compute histogram of pixel intensities
2. For each possible threshold t:
   - Compute mean intensity of foreground/background classes
   - Compute between-class variance
3. Select t that maximizes variance

**Strengths**:
- Automatic threshold selection
- Works well for bimodal histograms
- Fast O(n) implementation possible
- No parameters to tune

**Weaknesses**:
- Assumes bimodal distribution
- Global threshold may fail on uneven lighting
- Poor results for unimodal images
- Single threshold for entire image

**Browser Viability**: Excellent
- **Performance**: O(n) with histogram
- **Memory**: 256-element histogram array

**Implementation Complexity**: Low (2/5)

**Source**: Otsu, N. (1979). "A Threshold Selection Method from Gray-Level Histograms." IEEE Trans. SMC.

---

### 10. Adaptive Thresholding

**How it Works**:
Computes local threshold for each pixel based on neighborhood:
1. For each pixel, examine window (e.g., 11x11)
2. Calculate local mean or weighted mean (Gaussian)
3. Threshold = local_mean - constant
4. Binarize based on local threshold

**Strengths**:
- Handles uneven illumination
- Good for documents with varying background
- Locally adaptive to image content

**Weaknesses**:
- Slower than global threshold
- Window size parameter affects results
- May introduce noise in uniform regions
- Edge effects at image boundaries

**Browser Viability**: Good
- **Performance**: O(n) with integral images
- **Memory**: Requires integral image buffer

**Implementation Complexity**: Medium (3/5)

**Source**: Sauvola, J. (2000). "Adaptive document image binarization."

---

## Decision Matrix

| Algorithm | Accuracy | Performance | Complexity | Browser-Viable | Score |
|-----------|----------|-------------|------------|----------------|-------|
| Potrace | 5/5 | 4/5 | 3/5 | Yes | **4.0** |
| Marching Squares | 3/5 | 5/5 | 5/5 | Yes | **4.3** |
| Moore-Neighbor | 2/5 | 5/5 | 5/5 | Yes | **4.0** |
| Sobel | 3/5 | 5/5 | 5/5 | Yes | **4.3** |
| Canny | 4/5 | 4/5 | 3/5 | Yes | **3.7** |
| Marr-Hildreth | 3/5 | 3/5 | 3/5 | Yes | **3.0** |
| Douglas-Peucker | 4/5 | 4/5 | 5/5 | Yes | **4.3** |
| Schneider | 5/5 | 3/5 | 2/5 | Yes | **3.3** |
| Otsu | 4/5 | 5/5 | 5/5 | Yes | **4.7** |
| Adaptive Threshold | 4/5 | 4/5 | 4/5 | Yes | **4.0** |

**Scoring weights**: Accuracy (35%), Performance (25%), Complexity (20%), Browser-Viability (20%)

---

## Recommendation

### Selected Approach: Hybrid Pipeline

Based on the analysis, I recommend a **four-stage pipeline** combining the best algorithms for each task:

```
Image → [Threshold] → [Edge/Contour] → [Simplify] → [Fit Curves] → SVG
```

#### Stage 1: Thresholding
**Primary**: Otsu's method (automatic, no parameters)
**Fallback**: Adaptive threshold (for uneven lighting)

**Rationale**: Otsu achieves excellent automatic threshold selection with O(n) complexity. Adaptive threshold provides robustness for difficult images.

#### Stage 2: Contour Tracing
**Primary**: Marching Squares

**Rationale**: Marching squares is fast, reliable, and produces closed contours. It handles holes naturally through the even-odd fill rule. While Potrace is higher quality, marching squares provides the best performance/quality tradeoff for our needs, and we can improve quality in later stages.

#### Stage 3: Point Simplification
**Primary**: Douglas-Peucker algorithm

**Rationale**: Essential preprocessing for curve fitting. Reduces point count by 80-90% while preserving shape. Simple implementation with excellent performance.

#### Stage 4: Curve Fitting
**Primary**: Schneider's algorithm for Bézier fitting

**Rationale**: Produces smooth, compact SVG output. While complex to implement, it's essential for quality vectorization. The investment is worthwhile for the significant quality improvement.

### Implementation Approach

1. **Start simple**: Implement marching squares + Douglas-Peucker first
2. **Add curves**: Implement Schneider's algorithm incrementally
3. **Optimize**: Profile and optimize hot paths
4. **Enhance**: Add Canny edge detection as optional preprocessing

### Known Limitations

1. **Binary only initially**: Full color vectorization requires separate development
2. **Anti-aliasing artifacts**: Heavy AA may produce artifacts at boundaries
3. **Thin lines**: Features <2px may be lost or broken
4. **Processing time**: Complex images may exceed 1s target

### Risk Mitigation

- Marching squares fallback if Schneider fails
- Progressive rendering for large images
- Parameter controls for user adjustment
- Comprehensive benchmark suite for quality tracking

---

## References

1. Selinger, P. (2003). "Potrace: a polygon-based tracing algorithm."
2. Lorensen, W. E., & Cline, H. E. (1987). "Marching cubes: A high resolution 3D surface construction algorithm."
3. Canny, J. (1986). "A Computational Approach to Edge Detection."
4. Douglas, D., & Peucker, T. (1973). "Algorithms for the reduction of points required to represent a digitized line."
5. Schneider, P. (1990). "An Algorithm for Automatically Fitting Digitized Curves."
6. Otsu, N. (1979). "A Threshold Selection Method from Gray-Level Histograms."
7. Sauvola, J. (2000). "Adaptive document image binarization."
8. Marr, D., & Hildreth, E. (1980). "Theory of Edge Detection."
