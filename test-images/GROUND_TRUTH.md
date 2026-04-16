# Test Images Ground Truth

These images were generated programmatically with EXACT specifications.
Tests MUST validate against these known values - no approximations.

## Image Specifications

### square-128.png
- **Canvas**: 128x128 pixels
- **Shape**: Solid black square, 80x80 pixels
- **Position**: Top-left at (24, 24), bottom-right at (103, 103)
- **Foreground pixels**: 6,400 (80 × 80)
- **Expected contours**: EXACTLY 1
- **Contour must be**: CLOSED
- **Bounding box**: minX=24, minY=24, maxX=104, maxY=104 (±1 for edge interpolation)

### square-256.png
- **Canvas**: 256x256 pixels
- **Shape**: Solid black square, 160x160 pixels
- **Position**: Top-left at (48, 48), bottom-right at (207, 207)
- **Foreground pixels**: 25,600 (160 × 160)
- **Expected contours**: EXACTLY 1
- **Bounding box**: minX=48, minY=48, maxX=208, maxY=208 (±1)

### square-512.png
- **Canvas**: 512x512 pixels
- **Shape**: Solid black square, 320x320 pixels
- **Position**: Top-left at (96, 96), bottom-right at (415, 415)
- **Foreground pixels**: 102,400 (320 × 320)
- **Expected contours**: EXACTLY 1

### circle-128.png
- **Canvas**: 128x128 pixels
- **Shape**: Solid black circle, radius 50
- **Center**: (64, 64)
- **Expected contours**: EXACTLY 1
- **Contour must be**: CLOSED
- **Bounding box**: approximately (14, 14) to (114, 114) (±2)
- **Foreground pixels**: ~7,854 (π × 50²)

### circle-256.png
- **Canvas**: 256x256 pixels
- **Shape**: Solid black circle, radius 100
- **Center**: (128, 128)
- **Expected contours**: EXACTLY 1
- **Bounding box**: approximately (28, 28) to (228, 228) (±2)
- **Foreground pixels**: ~31,416 (π × 100²)

### circle-512.png
- **Canvas**: 512x512 pixels
- **Shape**: Solid black circle, radius 200
- **Center**: (256, 256)
- **Expected contours**: EXACTLY 1
- **Bounding box**: approximately (56, 56) to (456, 456) (±2)

### ring-128.png (Letter O shape)
- **Canvas**: 128x128 pixels
- **Shape**: Ring with outer radius 50, inner radius 30
- **Center**: (64, 64)
- **Expected contours**: EXACTLY 2 (outer boundary + inner hole)
- **Hole detection**: Inner contour MUST be marked as `isHole: true`
- **Parent tracking**: Inner contour's parentIndex must reference outer contour

### ring-256.png
- **Canvas**: 256x256 pixels
- **Shape**: Ring with outer radius 100, inner radius 60
- **Center**: (128, 128)
- **Expected contours**: EXACTLY 2
- **Hole detection**: Required

### ring-512.png
- **Canvas**: 512x512 pixels
- **Shape**: Ring with outer radius 200, inner radius 120
- **Center**: (256, 256)
- **Expected contours**: EXACTLY 2
- **Hole detection**: Required

### triangle-256.png
- **Canvas**: 256x256 pixels
- **Shape**: Solid triangle pointing up
- **Apex**: (128, 48)
- **Base**: from (48, 208) to (208, 208)
- **Expected contours**: EXACTLY 1
- **Contour must be**: CLOSED

### triangle-512.png
- **Canvas**: 512x512 pixels
- **Shape**: Solid triangle pointing up
- **Apex**: (256, 96)
- **Base**: from (96, 416) to (416, 416)
- **Expected contours**: EXACTLY 1

### star-5point-256.png
- **Canvas**: 256x256 pixels
- **Shape**: 5-pointed star
- **Center**: (128, 128)
- **Outer radius**: 100, Inner radius: 40
- **Expected contours**: EXACTLY 1
- **Contour must be**: CLOSED

### star-5point-512.png
- **Canvas**: 512x512 pixels
- **Shape**: 5-pointed star
- **Center**: (256, 256)
- **Outer radius**: 200, Inner radius: 80
- **Expected contours**: EXACTLY 1

### star-6point-256.png
- **Canvas**: 256x256 pixels
- **Shape**: 6-pointed star (Star of David shape)
- **Center**: (128, 128)
- **Outer radius**: 100, Inner radius: 40
- **Expected contours**: EXACTLY 1

### star-8point-256.png
- **Canvas**: 256x256 pixels
- **Shape**: 8-pointed star
- **Center**: (128, 128)
- **Outer radius**: 100, Inner radius: 50
- **Expected contours**: EXACTLY 1

### concentric-rings-256.png
- **Canvas**: 256x256 pixels
- **Shape**: 3 concentric rings with gaps
- **Center**: (128, 128)
- **Expected contours**: EXACTLY 6 (3 outer + 3 inner holes)
- **Each ring must have**: 1 outer contour + 1 hole contour

### nested-squares-256.png
- **Canvas**: 256x256 pixels
- **Shape**: 3 nested square frames
- **Center**: (128, 128)
- **Expected contours**: EXACTLY 6 (3 outer + 3 inner holes)
- **Each frame must have**: 1 outer contour + 1 hole contour

### letter-a-256.png (Original/Blocky)
- **Canvas**: 256x256 pixels
- **Shape**: Blocky letter "A" with separate diagonal strokes and crossbar
- **Expected contours**: EXACTLY 1 (open design - strokes don't form enclosed counter)
- **Style**: Basic geometric, no enclosed counter

### letter-a-serif-256.png
- **Canvas**: 256x256 pixels
- **Shape**: Serif-style letter "A" with serifs at base
- **Expected contours**: EXACTLY 3 (outer + 2 inner holes from counter regions)
- **Style**: Classic serif with triangular counter
- **Hole detection**: 2 holes must be detected

### letter-a-sansserif-256.png
- **Canvas**: 256x256 pixels
- **Shape**: Clean geometric sans-serif letter "A"
- **Expected contours**: EXACTLY 2 (outer + 1 inner hole)
- **Style**: Modern sans-serif
- **Hole detection**: 1 hole must be detected (counter)

### letter-a-bold-256.png
- **Canvas**: 256x256 pixels
- **Shape**: Extra-thick bold letter "A"
- **Expected contours**: EXACTLY 1 (strokes so thick they fill counter)
- **Style**: Heavy/bold weight

### letter-a-thin-256.png
- **Canvas**: 256x256 pixels
- **Shape**: Light/thin weight letter "A"
- **Expected contours**: EXACTLY 2 (outer + 1 inner hole)
- **Style**: Light/hairline weight
- **Hole detection**: 1 hole must be detected

### letter-a-counter-256.png
- **Canvas**: 256x256 pixels
- **Shape**: Filled triangular "A" with proper triangular counter (hole)
- **Expected contours**: EXACTLY 2 (outer triangle + inner counter hole)
- **Style**: Classic filled A with triangular hole
- **Hole detection**: 1 hole must be detected

### letter-a-stencil-256.png
- **Canvas**: 256x256 pixels
- **Shape**: Outline/stencil style letter "A" (stroke only, no fill)
- **Expected contours**: EXACTLY 3 (multiple stroke regions)
- **Style**: Stencil/outline
- **Hole detection**: 2 holes expected

## Validation Rules

### MANDATORY for ALL images:
1. Each contour MUST be CLOSED (first and last points connect)
2. Contour count MUST match expected value EXACTLY
3. Contour bounding box MUST be within ±2 pixels of expected
4. All contours MUST have >= 3 points
5. No "fragment" contours (tiny disconnected pieces)

### MANDATORY for images with holes:
1. Hole contours MUST have `isHole: true`
2. Hole contours MUST have valid `parentIndex` referencing their containing contour
3. Using evenodd fill rule, holes MUST render as transparent (not filled)

### SVG Output Validation:
1. SVG must render visually identical to source (SSIM > 0.95 for simple shapes)
2. Path count in SVG should match contour count
3. SVG file size should be reasonable (< 10x the minimal representation)
