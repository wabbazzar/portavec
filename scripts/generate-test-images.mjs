/**
 * Generate test images for Portavec vectorization testing
 *
 * Creates PNG files of various B&W shapes for testing the vectorization pipeline.
 */

import { PNG } from 'pngjs';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, '..', 'test-images');

// Ensure output directory exists
mkdirSync(OUTPUT_DIR, { recursive: true });

/**
 * Create a PNG with given dimensions
 */
function createPNG(width, height) {
  const png = new PNG({ width, height });
  // Fill with white
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (width * y + x) << 2;
      png.data[idx] = 255;     // R
      png.data[idx + 1] = 255; // G
      png.data[idx + 2] = 255; // B
      png.data[idx + 3] = 255; // A
    }
  }
  return png;
}

/**
 * Set a pixel to black
 */
function setBlack(png, x, y) {
  if (x < 0 || x >= png.width || y < 0 || y >= png.height) return;
  const idx = (png.width * y + x) << 2;
  png.data[idx] = 0;
  png.data[idx + 1] = 0;
  png.data[idx + 2] = 0;
}

/**
 * Save PNG to file
 */
function savePNG(png, filename) {
  const buffer = PNG.sync.write(png);
  const filepath = join(OUTPUT_DIR, filename);
  writeFileSync(filepath, buffer);
  console.log(`Created: ${filepath}`);
}

// ============================================================================
// Shape Generators
// ============================================================================

/**
 * Create a solid square
 */
function createSquare(size, squareSize, padding) {
  const png = createPNG(size, size);

  for (let y = padding; y < padding + squareSize && y < size; y++) {
    for (let x = padding; x < padding + squareSize && x < size; x++) {
      setBlack(png, x, y);
    }
  }

  return png;
}

/**
 * Create a solid circle
 */
function createCircle(size, radius) {
  const png = createPNG(size, size);
  const cx = size / 2;
  const cy = size / 2;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= radius * radius) {
        setBlack(png, x, y);
      }
    }
  }

  return png;
}

/**
 * Create a ring (O shape)
 */
function createRing(size, outerRadius, innerRadius) {
  const png = createPNG(size, size);
  const cx = size / 2;
  const cy = size / 2;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const distSq = dx * dx + dy * dy;
      if (distSq <= outerRadius * outerRadius && distSq >= innerRadius * innerRadius) {
        setBlack(png, x, y);
      }
    }
  }

  return png;
}

/**
 * Create a solid triangle (pointing up)
 */
function createTriangle(size, triHeight, padding) {
  const png = createPNG(size, size);

  const topX = size / 2;
  const topY = padding;
  const bottomY = padding + triHeight;
  const bottomLeftX = padding;
  const bottomRightX = size - padding;

  for (let y = Math.floor(topY); y <= bottomY && y < size; y++) {
    const progress = (y - topY) / (bottomY - topY);
    const leftX = topX + progress * (bottomLeftX - topX);
    const rightX = topX + progress * (bottomRightX - topX);

    for (let x = Math.floor(leftX); x <= Math.ceil(rightX) && x < size; x++) {
      setBlack(png, x, y);
    }
  }

  return png;
}

/**
 * Create a star shape
 */
function createStar(size, outerRadius, innerRadius, points) {
  const png = createPNG(size, size);
  const cx = size / 2;
  const cy = size / 2;

  // Create star polygon vertices
  const vertices = [];
  for (let i = 0; i < points * 2; i++) {
    const angle = (i * Math.PI) / points - Math.PI / 2;
    const radius = i % 2 === 0 ? outerRadius : innerRadius;
    vertices.push({
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle)
    });
  }

  // Fill using scanline
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (pointInPolygon(x, y, vertices)) {
        setBlack(png, x, y);
      }
    }
  }

  return png;
}

/**
 * Check if point is inside polygon (ray casting)
 */
function pointInPolygon(x, y, vertices) {
  let inside = false;
  const n = vertices.length;

  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = vertices[i].x, yi = vertices[i].y;
    const xj = vertices[j].x, yj = vertices[j].y;

    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }

  return inside;
}

/**
 * Create concentric rings (each ring is a separate donut shape)
 */
function createConcentricRings(size, rings, gap) {
  const png = createPNG(size, size);
  const cx = size / 2;
  const cy = size / 2;
  const maxRadius = size / 2 - 10;

  // Each ring has thickness and there's a gap between them
  const ringThickness = 15;  // thickness of each ring band
  const spacing = gap + ringThickness;  // total space per ring

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      for (let r = 0; r < rings; r++) {
        // Start from outside and work inward
        const outerR = maxRadius - r * spacing;
        const innerR = outerR - ringThickness;
        // Make sure innerR is positive (actual ring, not filled circle)
        if (innerR > 5 && dist >= innerR && dist <= outerR) {
          setBlack(png, x, y);
          break;
        }
      }
    }
  }

  return png;
}

/**
 * Create a simple letter-like shape (blocky "A") - original version
 */
function createLetterA(size) {
  const png = createPNG(size, size);
  const padding = Math.floor(size * 0.15);
  const thickness = Math.floor(size * 0.15);

  // Left diagonal
  for (let y = padding; y < size - padding; y++) {
    const progress = (y - padding) / (size - 2 * padding);
    const x = padding + progress * (size / 2 - padding - thickness / 2);
    for (let dx = 0; dx < thickness; dx++) {
      setBlack(png, Math.floor(x + dx), y);
    }
  }

  // Right diagonal
  for (let y = padding; y < size - padding; y++) {
    const progress = (y - padding) / (size - 2 * padding);
    const x = size - padding - progress * (size / 2 - padding - thickness / 2) - thickness;
    for (let dx = 0; dx < thickness; dx++) {
      setBlack(png, Math.floor(x + dx), y);
    }
  }

  // Crossbar
  const crossY = Math.floor(size * 0.55);
  for (let y = crossY; y < crossY + thickness; y++) {
    for (let x = padding + thickness; x < size - padding - thickness; x++) {
      setBlack(png, x, y);
    }
  }

  return png;
}

/**
 * Create a serif-style letter "A" with triangular hole
 * Has serifs at the base and a proper triangular counter (hole)
 */
function createLetterA_Serif(size) {
  const png = createPNG(size, size);
  const cx = size / 2;
  const padding = Math.floor(size * 0.12);
  const thickness = Math.floor(size * 0.12);
  const serifWidth = Math.floor(size * 0.08);
  const serifHeight = Math.floor(size * 0.04);

  const topY = padding;
  const bottomY = size - padding;
  const leftBaseX = padding + serifWidth;
  const rightBaseX = size - padding - serifWidth;

  // Fill the main triangular body
  for (let y = topY; y < bottomY; y++) {
    const progress = (y - topY) / (bottomY - topY);
    const leftX = cx - progress * (cx - leftBaseX);
    const rightX = cx + progress * (rightBaseX - cx);

    // Calculate inner edges for the hollow part
    const innerLeftX = leftX + thickness;
    const innerRightX = rightX - thickness;

    for (let x = Math.floor(leftX); x <= Math.ceil(rightX); x++) {
      // Skip the counter (hole) area - triangular hole in upper portion
      const counterTopY = topY + (bottomY - topY) * 0.35;
      const counterBottomY = topY + (bottomY - topY) * 0.65;

      if (y >= counterTopY && y < counterBottomY) {
        const counterProgress = (y - counterTopY) / (counterBottomY - counterTopY);
        const counterLeftX = cx - counterProgress * (size * 0.15);
        const counterRightX = cx + counterProgress * (size * 0.15);

        if (x >= counterLeftX && x <= counterRightX) {
          continue; // Skip - this is the counter hole
        }
      }

      // Draw if within the A shape
      if (x >= leftX && x <= rightX) {
        if (x <= innerLeftX || x >= innerRightX || y >= bottomY - thickness) {
          setBlack(png, x, y);
        }
      }
    }
  }

  // Add serifs at bottom
  for (let y = bottomY - serifHeight; y < bottomY; y++) {
    // Left serif
    for (let x = padding; x < padding + serifWidth * 2; x++) {
      setBlack(png, x, y);
    }
    // Right serif
    for (let x = size - padding - serifWidth * 2; x < size - padding; x++) {
      setBlack(png, x, y);
    }
  }

  // Add crossbar
  const crossY = Math.floor(size * 0.55);
  const crossHeight = Math.floor(thickness * 0.7);
  for (let y = crossY; y < crossY + crossHeight; y++) {
    const progress = (y - topY) / (bottomY - topY);
    const leftX = cx - progress * (cx - leftBaseX) + thickness;
    const rightX = cx + progress * (rightBaseX - cx) - thickness;
    for (let x = Math.floor(leftX); x <= Math.ceil(rightX); x++) {
      setBlack(png, x, y);
    }
  }

  return png;
}

/**
 * Create a sans-serif letter "A" - clean geometric style
 */
function createLetterA_SansSerif(size) {
  const png = createPNG(size, size);
  const cx = size / 2;
  const padding = Math.floor(size * 0.15);
  const thickness = Math.floor(size * 0.14);

  const topY = padding;
  const bottomY = size - padding;
  const leftBaseX = padding;
  const rightBaseX = size - padding;

  // Draw the two legs with flat bottoms
  for (let y = topY; y < bottomY; y++) {
    const progress = (y - topY) / (bottomY - topY);
    const leftX = cx - progress * (cx - leftBaseX);
    const rightX = cx + progress * (rightBaseX - cx);

    // Left leg
    for (let dx = 0; dx < thickness; dx++) {
      setBlack(png, Math.floor(leftX + dx), y);
    }
    // Right leg
    for (let dx = 0; dx < thickness; dx++) {
      setBlack(png, Math.floor(rightX - thickness + dx), y);
    }
  }

  // Apex connector
  for (let y = topY; y < topY + thickness * 1.2; y++) {
    const progress = (y - topY) / (bottomY - topY);
    const leftX = cx - progress * (cx - leftBaseX);
    const rightX = cx + progress * (rightBaseX - cx);
    for (let x = Math.floor(leftX); x <= Math.ceil(rightX); x++) {
      setBlack(png, x, y);
    }
  }

  // Crossbar
  const crossY = Math.floor(size * 0.58);
  for (let y = crossY; y < crossY + thickness * 0.8; y++) {
    const progress = (y - topY) / (bottomY - topY);
    const leftX = cx - progress * (cx - leftBaseX) + thickness;
    const rightX = cx + progress * (rightBaseX - cx) - thickness;
    for (let x = Math.floor(leftX); x <= Math.ceil(rightX); x++) {
      setBlack(png, x, y);
    }
  }

  return png;
}

/**
 * Create a bold letter "A" - extra thick strokes
 */
function createLetterA_Bold(size) {
  const png = createPNG(size, size);
  const cx = size / 2;
  const padding = Math.floor(size * 0.12);
  const thickness = Math.floor(size * 0.22); // Extra thick

  const topY = padding;
  const bottomY = size - padding;
  const leftBaseX = padding;
  const rightBaseX = size - padding;

  // Draw thick legs
  for (let y = topY; y < bottomY; y++) {
    const progress = (y - topY) / (bottomY - topY);
    const leftX = cx - progress * (cx - leftBaseX);
    const rightX = cx + progress * (rightBaseX - cx);

    // Left leg - extra thick
    for (let dx = 0; dx < thickness; dx++) {
      setBlack(png, Math.floor(leftX + dx), y);
    }
    // Right leg - extra thick
    for (let dx = 0; dx < thickness; dx++) {
      setBlack(png, Math.floor(rightX - thickness + dx), y);
    }
  }

  // Thick apex
  for (let y = topY; y < topY + thickness * 1.5; y++) {
    const progress = (y - topY) / (bottomY - topY);
    const leftX = cx - progress * (cx - leftBaseX);
    const rightX = cx + progress * (rightBaseX - cx);
    for (let x = Math.floor(leftX); x <= Math.ceil(rightX); x++) {
      setBlack(png, x, y);
    }
  }

  // Thick crossbar
  const crossY = Math.floor(size * 0.52);
  for (let y = crossY; y < crossY + thickness; y++) {
    const progress = (y - topY) / (bottomY - topY);
    const leftX = cx - progress * (cx - leftBaseX) + thickness * 0.5;
    const rightX = cx + progress * (rightBaseX - cx) - thickness * 0.5;
    for (let x = Math.floor(leftX); x <= Math.ceil(rightX); x++) {
      setBlack(png, x, y);
    }
  }

  return png;
}

/**
 * Create a thin/light letter "A" - minimal strokes
 */
function createLetterA_Thin(size) {
  const png = createPNG(size, size);
  const cx = size / 2;
  const padding = Math.floor(size * 0.18);
  const thickness = Math.floor(size * 0.06); // Very thin

  const topY = padding;
  const bottomY = size - padding;
  const leftBaseX = padding;
  const rightBaseX = size - padding;

  // Draw thin legs
  for (let y = topY; y < bottomY; y++) {
    const progress = (y - topY) / (bottomY - topY);
    const leftX = cx - progress * (cx - leftBaseX);
    const rightX = cx + progress * (rightBaseX - cx);

    // Left leg
    for (let dx = 0; dx < thickness; dx++) {
      setBlack(png, Math.floor(leftX + dx), y);
    }
    // Right leg
    for (let dx = 0; dx < thickness; dx++) {
      setBlack(png, Math.floor(rightX - thickness + dx), y);
    }
  }

  // Thin apex
  for (let y = topY; y < topY + thickness * 2; y++) {
    const progress = (y - topY) / (bottomY - topY);
    const leftX = cx - progress * (cx - leftBaseX);
    const rightX = cx + progress * (rightBaseX - cx);
    for (let x = Math.floor(leftX); x <= Math.ceil(rightX); x++) {
      setBlack(png, x, y);
    }
  }

  // Thin crossbar
  const crossY = Math.floor(size * 0.55);
  for (let y = crossY; y < crossY + thickness; y++) {
    const progress = (y - topY) / (bottomY - topY);
    const leftX = cx - progress * (cx - leftBaseX) + thickness;
    const rightX = cx + progress * (rightBaseX - cx) - thickness;
    for (let x = Math.floor(leftX); x <= Math.ceil(rightX); x++) {
      setBlack(png, x, y);
    }
  }

  return png;
}

/**
 * Create a filled triangular "A" with a triangular hole (counter)
 * Classic uppercase A with proper counter
 */
function createLetterA_WithCounter(size) {
  const png = createPNG(size, size);
  const cx = size / 2;
  const padding = Math.floor(size * 0.12);

  const topY = padding;
  const bottomY = size - padding;
  const leftBaseX = padding;
  const rightBaseX = size - padding;

  // Define outer triangle vertices
  const outerVertices = [
    { x: cx, y: topY },
    { x: leftBaseX, y: bottomY },
    { x: rightBaseX, y: bottomY }
  ];

  // Define inner triangle (counter) vertices - positioned above crossbar
  const counterTop = topY + (bottomY - topY) * 0.32;
  const counterBottom = topY + (bottomY - topY) * 0.58;
  const counterWidth = (bottomY - topY) * 0.22;

  const innerVertices = [
    { x: cx, y: counterTop },
    { x: cx - counterWidth, y: counterBottom },
    { x: cx + counterWidth, y: counterBottom }
  ];

  // Fill outer triangle, excluding inner counter
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const inOuter = pointInPolygon(x, y, outerVertices);
      const inInner = pointInPolygon(x, y, innerVertices);

      if (inOuter && !inInner) {
        setBlack(png, x, y);
      }
    }
  }

  return png;
}

/**
 * Create a stencil-style letter "A" - outline only, no fill
 */
function createLetterA_Stencil(size) {
  const png = createPNG(size, size);
  const cx = size / 2;
  const padding = Math.floor(size * 0.15);
  const strokeWidth = Math.floor(size * 0.04);

  const topY = padding;
  const bottomY = size - padding;
  const leftBaseX = padding;
  const rightBaseX = size - padding;

  // Draw only the outlines using a stroke approach
  // Left leg outline
  for (let y = topY; y < bottomY; y++) {
    const progress = (y - topY) / (bottomY - topY);
    const x = cx - progress * (cx - leftBaseX);
    for (let dy = -strokeWidth/2; dy <= strokeWidth/2; dy++) {
      for (let dx = -strokeWidth/2; dx <= strokeWidth/2; dx++) {
        setBlack(png, Math.floor(x + dx), Math.floor(y + dy));
      }
    }
  }

  // Right leg outline
  for (let y = topY; y < bottomY; y++) {
    const progress = (y - topY) / (bottomY - topY);
    const x = cx + progress * (rightBaseX - cx);
    for (let dy = -strokeWidth/2; dy <= strokeWidth/2; dy++) {
      for (let dx = -strokeWidth/2; dx <= strokeWidth/2; dx++) {
        setBlack(png, Math.floor(x + dx), Math.floor(y + dy));
      }
    }
  }

  // Bottom line
  for (let x = leftBaseX; x <= rightBaseX; x++) {
    for (let dy = 0; dy < strokeWidth; dy++) {
      setBlack(png, x, bottomY - dy);
    }
  }

  // Crossbar
  const crossY = Math.floor(size * 0.55);
  for (let x = Math.floor(cx - (crossY - topY) / (bottomY - topY) * (cx - leftBaseX));
       x <= Math.floor(cx + (crossY - topY) / (bottomY - topY) * (rightBaseX - cx));
       x++) {
    for (let dy = 0; dy < strokeWidth; dy++) {
      setBlack(png, x, crossY + dy);
    }
  }

  return png;
}

/**
 * Create nested square frames (each is a separate hollow square)
 */
function createNestedSquares(size, squares, gap) {
  const png = createPNG(size, size);
  const cx = size / 2;
  const cy = size / 2;
  const maxHalf = (size - 20) / 2;

  // Each frame has a thickness and there's a gap between them
  const frameThickness = 15;  // thickness of each square frame
  const spacing = gap + frameThickness;  // total space per frame

  for (let s = 0; s < squares; s++) {
    // Start from outside and work inward
    const outerHalf = maxHalf - s * spacing;
    const innerHalf = outerHalf - frameThickness;

    // Make sure innerHalf is positive (actual frame, not filled square)
    if (innerHalf < 5) continue;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = Math.abs(x - cx);
        const dy = Math.abs(y - cy);
        // Inside outer but outside inner = part of the frame
        if (dx <= outerHalf && dy <= outerHalf && (dx > innerHalf || dy > innerHalf)) {
          setBlack(png, x, y);
        }
      }
    }
  }

  return png;
}

// ============================================================================
// Generate All Test Images
// ============================================================================

console.log('Generating test images...\n');

// Basic shapes - 256x256
savePNG(createSquare(256, 160, 48), 'square-256.png');
savePNG(createCircle(256, 100), 'circle-256.png');
savePNG(createTriangle(256, 160, 48), 'triangle-256.png');
savePNG(createRing(256, 100, 60), 'ring-256.png');
savePNG(createStar(256, 100, 40, 5), 'star-5point-256.png');

// Larger versions - 512x512
savePNG(createSquare(512, 320, 96), 'square-512.png');
savePNG(createCircle(512, 200), 'circle-512.png');
savePNG(createTriangle(512, 320, 96), 'triangle-512.png');
savePNG(createRing(512, 200, 120), 'ring-512.png');
savePNG(createStar(512, 200, 80, 5), 'star-5point-512.png');

// Complex shapes
savePNG(createConcentricRings(256, 3, 10), 'concentric-rings-256.png');
savePNG(createNestedSquares(256, 3, 10), 'nested-squares-256.png');
savePNG(createLetterA(256), 'letter-a-256.png');
savePNG(createStar(256, 100, 40, 6), 'star-6point-256.png');
savePNG(createStar(256, 100, 50, 8), 'star-8point-256.png');

// Letter A variants - different "fonts"/styles
savePNG(createLetterA_Serif(256), 'letter-a-serif-256.png');
savePNG(createLetterA_SansSerif(256), 'letter-a-sansserif-256.png');
savePNG(createLetterA_Bold(256), 'letter-a-bold-256.png');
savePNG(createLetterA_Thin(256), 'letter-a-thin-256.png');
savePNG(createLetterA_WithCounter(256), 'letter-a-counter-256.png');
savePNG(createLetterA_Stencil(256), 'letter-a-stencil-256.png');

// Small versions for quick testing - 128x128
savePNG(createSquare(128, 80, 24), 'square-128.png');
savePNG(createCircle(128, 50), 'circle-128.png');
savePNG(createRing(128, 50, 30), 'ring-128.png');

console.log('\nDone! Test images created in:', OUTPUT_DIR);
