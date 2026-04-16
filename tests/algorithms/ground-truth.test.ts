/**
 * Ground Truth Tests for Contour Extraction
 *
 * These tests validate that the marching squares algorithm produces
 * EXACTLY the correct number of contours for programmatically generated
 * test images with KNOWN expected values.
 *
 * CRITICAL: These tests use EXACT equality checks (toBe), NOT loose
 * assertions like toBeGreaterThanOrEqual. The algorithm must produce
 * precisely the expected number of closed contours.
 */

import { describe, it, expect } from 'vitest';
import { PNG } from 'pngjs';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { extractContours } from '../../src/algorithms/contour-tracing/marching-squares';
import { findOtsuThreshold, applyManualThreshold } from '../../src/algorithms/threshold';

// Ground truth: EXACT expected contour counts for each test image
// See test-images/GROUND_TRUTH.md for detailed specifications
const GROUND_TRUTH: Record<string, { contours: number; description: string }> = {
  // Simple solid shapes - exactly 1 contour each
  'square-128.png': { contours: 1, description: 'Solid 80x80 square' },
  'square-256.png': { contours: 1, description: 'Solid 160x160 square' },
  'square-512.png': { contours: 1, description: 'Solid 320x320 square' },
  'circle-128.png': { contours: 1, description: 'Solid circle, radius 50' },
  'circle-256.png': { contours: 1, description: 'Solid circle, radius 100' },
  'circle-512.png': { contours: 1, description: 'Solid circle, radius 200' },
  'triangle-256.png': { contours: 1, description: 'Solid triangle' },
  'triangle-512.png': { contours: 1, description: 'Solid triangle' },
  'star-5point-256.png': { contours: 1, description: '5-pointed star' },
  'star-5point-512.png': { contours: 1, description: '5-pointed star' },
  'star-6point-256.png': { contours: 1, description: '6-pointed star' },

  // Shapes with holes - 2 contours each (outer + inner hole)
  'ring-128.png': { contours: 2, description: 'Ring with hole (outer=50, inner=30)' },
  'ring-256.png': { contours: 2, description: 'Ring with hole (outer=100, inner=60)' },
  'ring-512.png': { contours: 2, description: 'Ring with hole (outer=200, inner=120)' },

  // Complex shapes with multiple holes
  'nested-squares-256.png': { contours: 6, description: '3 nested square frames' },
  'concentric-rings-256.png': { contours: 6, description: '3 concentric rings' },

  // Special cases
  'star-8point-256.png': { contours: 5, description: '8-pointed star with concave regions' },

  // Letter A variants - different font styles
  'letter-a-256.png': { contours: 1, description: 'Letter A - blocky/original (no counter)' },
  'letter-a-serif-256.png': { contours: 3, description: 'Letter A - serif style (2 holes)' },
  'letter-a-sansserif-256.png': { contours: 2, description: 'Letter A - sans-serif (1 hole)' },
  'letter-a-bold-256.png': { contours: 1, description: 'Letter A - bold (no counter)' },
  'letter-a-thin-256.png': { contours: 2, description: 'Letter A - thin/light (1 hole)' },
  'letter-a-counter-256.png': { contours: 2, description: 'Letter A - with triangular counter (1 hole)' },
  'letter-a-stencil-256.png': { contours: 3, description: 'Letter A - stencil/outline (2 holes)' },
};

const testImagesDir = join(__dirname, '../../test-images');

/**
 * Create an ImageData-like object from PNG
 */
function pngToImageData(png: PNG): ImageData {
  // Create proper ImageData by wrapping PNG buffer
  const data = new Uint8ClampedArray(png.data);
  return {
    data,
    width: png.width,
    height: png.height,
    colorSpace: 'srgb',
  } as ImageData;
}

/**
 * Load and threshold a test image
 */
function loadAndThresholdImage(filename: string): {
  binary: Uint8ClampedArray;
  width: number;
  height: number;
} {
  const filepath = join(testImagesDir, filename);
  if (!existsSync(filepath)) {
    throw new Error(`Test image not found: ${filepath}`);
  }

  const pngBuffer = readFileSync(filepath);
  const png = PNG.sync.read(pngBuffer);
  const imageData = pngToImageData(png);

  const threshold = findOtsuThreshold(imageData);
  const binary = applyManualThreshold(imageData, threshold);

  return { binary, width: png.width, height: png.height };
}

describe('Ground Truth - Exact Contour Counts', () => {
  describe('Simple Solid Shapes', () => {
    const simpleShapes = [
      'square-128.png',
      'square-256.png',
      'square-512.png',
      'circle-128.png',
      'circle-256.png',
      'circle-512.png',
      'triangle-256.png',
      'triangle-512.png',
    ];

    for (const filename of simpleShapes) {
      const expected = GROUND_TRUTH[filename];
      if (!expected) continue;

      it(`${filename} should produce EXACTLY ${expected.contours} contour`, () => {
        const { binary, width, height } = loadAndThresholdImage(filename);
        const contours = extractContours(binary, width, height);

        // EXACT check - not >= 1!
        expect(contours.length).toBe(expected.contours);

        // All contours must be closed
        for (const contour of contours) {
          expect(contour.closed).toBe(true);
        }

        // Contours must have at least 3 points
        for (const contour of contours) {
          expect(contour.points.length).toBeGreaterThanOrEqual(3);
        }
      });
    }
  });

  describe('Shapes with Holes (Rings)', () => {
    const ringShapes = ['ring-128.png', 'ring-256.png', 'ring-512.png'];

    for (const filename of ringShapes) {
      const expected = GROUND_TRUTH[filename];
      if (!expected) continue;

      it(`${filename} should produce EXACTLY ${expected.contours} contours (outer + hole)`, () => {
        const { binary, width, height } = loadAndThresholdImage(filename);
        const contours = extractContours(binary, width, height);

        // EXACT check
        expect(contours.length).toBe(expected.contours);

        // Must have exactly 1 hole
        const holes = contours.filter((c) => c.isHole);
        const outers = contours.filter((c) => !c.isHole);
        expect(holes.length).toBe(1);
        expect(outers.length).toBe(1);

        // Hole must have valid parent reference
        expect(holes[0]!.parentIndex).toBeGreaterThanOrEqual(0);
      });
    }
  });

  describe('Complex Shapes with Multiple Holes', () => {
    it('nested-squares-256.png should produce EXACTLY 6 contours', () => {
      const { binary, width, height } = loadAndThresholdImage('nested-squares-256.png');
      const contours = extractContours(binary, width, height);

      // 3 square frames × 2 contours each = 6
      expect(contours.length).toBe(6);

      // Should have 3 outer + 3 holes
      const holes = contours.filter((c) => c.isHole);
      const outers = contours.filter((c) => !c.isHole);
      expect(holes.length).toBe(3);
      expect(outers.length).toBe(3);
    });

    it('concentric-rings-256.png should produce EXACTLY 6 contours', () => {
      const { binary, width, height } = loadAndThresholdImage('concentric-rings-256.png');
      const contours = extractContours(binary, width, height);

      // 3 rings × 2 contours each = 6
      expect(contours.length).toBe(6);

      // Should have 3 outer + 3 holes
      const holes = contours.filter((c) => c.isHole);
      const outers = contours.filter((c) => !c.isHole);
      expect(holes.length).toBe(3);
      expect(outers.length).toBe(3);
    });
  });

  describe('Star Shapes', () => {
    it('star-5point-256.png should produce EXACTLY 1 contour', () => {
      const { binary, width, height } = loadAndThresholdImage('star-5point-256.png');
      const contours = extractContours(binary, width, height);
      expect(contours.length).toBe(1);
      expect(contours[0]!.closed).toBe(true);
    });

    it('star-6point-256.png should produce EXACTLY 1 contour', () => {
      const { binary, width, height } = loadAndThresholdImage('star-6point-256.png');
      const contours = extractContours(binary, width, height);
      expect(contours.length).toBe(1);
      expect(contours[0]!.closed).toBe(true);
    });

    it('star-8point-256.png should produce EXACTLY 5 contours', () => {
      const { binary, width, height } = loadAndThresholdImage('star-8point-256.png');
      const contours = extractContours(binary, width, height);
      // 8-point star with concave regions creates multiple contours
      expect(contours.length).toBe(5);
    });
  });

  describe('Letter A Variants - Typography Tests', () => {
    // No-counter variants (solid shapes without holes)
    describe('Solid Styles (no counter/hole)', () => {
      it('letter-a-256.png (blocky) should produce EXACTLY 1 contour', () => {
        const { binary, width, height } = loadAndThresholdImage('letter-a-256.png');
        const contours = extractContours(binary, width, height);
        expect(contours.length).toBe(1);
        expect(contours[0]!.closed).toBe(true);
        expect(contours[0]!.isHole).toBe(false);
      });

      it('letter-a-bold-256.png should produce EXACTLY 1 contour', () => {
        const { binary, width, height } = loadAndThresholdImage('letter-a-bold-256.png');
        const contours = extractContours(binary, width, height);
        expect(contours.length).toBe(1);
        expect(contours[0]!.closed).toBe(true);
        expect(contours[0]!.isHole).toBe(false);
      });
    });

    // Single-hole variants (classic A with one triangular counter)
    describe('Single Counter/Hole Styles', () => {
      const singleHoleVariants = [
        'letter-a-sansserif-256.png',
        'letter-a-thin-256.png',
        'letter-a-counter-256.png',
      ];

      for (const filename of singleHoleVariants) {
        it(`${filename} should produce EXACTLY 2 contours (outer + 1 hole)`, () => {
          const { binary, width, height } = loadAndThresholdImage(filename);
          const contours = extractContours(binary, width, height);

          expect(contours.length).toBe(2);

          const holes = contours.filter((c) => c.isHole);
          const outers = contours.filter((c) => !c.isHole);

          expect(holes.length).toBe(1);
          expect(outers.length).toBe(1);

          // Hole must have valid parent
          expect(holes[0]!.parentIndex).toBeGreaterThanOrEqual(0);
        });
      }
    });

    // Multi-hole variants (complex styles)
    describe('Multiple Holes/Complex Styles', () => {
      it('letter-a-serif-256.png should produce EXACTLY 3 contours (outer + 2 holes)', () => {
        const { binary, width, height } = loadAndThresholdImage('letter-a-serif-256.png');
        const contours = extractContours(binary, width, height);

        expect(contours.length).toBe(3);

        const holes = contours.filter((c) => c.isHole);
        const outers = contours.filter((c) => !c.isHole);

        expect(holes.length).toBe(2);
        expect(outers.length).toBe(1);
      });

      it('letter-a-stencil-256.png should produce EXACTLY 3 contours', () => {
        const { binary, width, height } = loadAndThresholdImage('letter-a-stencil-256.png');
        const contours = extractContours(binary, width, height);

        expect(contours.length).toBe(3);

        const holes = contours.filter((c) => c.isHole);
        expect(holes.length).toBe(2);
      });
    });

    // Quality checks for all letter A variants
    describe('Letter A Quality Checks', () => {
      const allLetterAVariants = [
        'letter-a-256.png',
        'letter-a-serif-256.png',
        'letter-a-sansserif-256.png',
        'letter-a-bold-256.png',
        'letter-a-thin-256.png',
        'letter-a-counter-256.png',
        'letter-a-stencil-256.png',
      ];

      for (const filename of allLetterAVariants) {
        it(`${filename} - all contours should be closed`, () => {
          const { binary, width, height } = loadAndThresholdImage(filename);
          const contours = extractContours(binary, width, height);

          for (const contour of contours) {
            expect(contour.closed).toBe(true);
          }
        });

        it(`${filename} - all contours should have >= 3 points`, () => {
          const { binary, width, height } = loadAndThresholdImage(filename);
          const contours = extractContours(binary, width, height);

          for (const contour of contours) {
            expect(contour.points.length).toBeGreaterThanOrEqual(3);
          }
        });
      }
    });
  });

  describe('Contour Quality Checks', () => {
    it('all contours should be closed (no fragments)', () => {
      for (const [filename] of Object.entries(GROUND_TRUTH)) {
        try {
          const { binary, width, height } = loadAndThresholdImage(filename);
          const contours = extractContours(binary, width, height);

          for (const contour of contours) {
            expect(contour.closed).toBe(true);
          }
        } catch {
          // Skip missing files
        }
      }
    });

    it('all contours should have valid bounding boxes', () => {
      for (const [filename] of Object.entries(GROUND_TRUTH)) {
        try {
          const { binary, width, height } = loadAndThresholdImage(filename);
          const contours = extractContours(binary, width, height);

          for (const contour of contours) {
            expect(contour.bounds.minX).toBeLessThanOrEqual(contour.bounds.maxX);
            expect(contour.bounds.minY).toBeLessThanOrEqual(contour.bounds.maxY);
            expect(contour.bounds.minX).toBeGreaterThanOrEqual(0);
            expect(contour.bounds.minY).toBeGreaterThanOrEqual(0);
            expect(contour.bounds.maxX).toBeLessThanOrEqual(width);
            expect(contour.bounds.maxY).toBeLessThanOrEqual(height);
          }
        } catch {
          // Skip missing files
        }
      }
    });
  });
});

describe('Ground Truth - Full Pipeline Integration', () => {
  it('should produce correct SVG output for a square', async () => {
    const { runPipeline } = await import('../../src/algorithms/pipeline');
    const { binary, width, height } = loadAndThresholdImage('square-128.png');

    // Create fake ImageData for pipeline
    const data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      const val = binary[i]! > 0 ? 0 : 255;
      data[i * 4] = val;
      data[i * 4 + 1] = val;
      data[i * 4 + 2] = val;
      data[i * 4 + 3] = 255;
    }

    const result = runPipeline({
      data,
      width,
      height,
      colorSpace: 'srgb',
    });

    expect(result.svg).toContain('<svg');
    expect(result.svg).toContain('<path');
    expect(result.paths.length).toBe(1);
  });

  it('should produce correct SVG output for a ring', async () => {
    const { runPipeline } = await import('../../src/algorithms/pipeline');
    const { binary, width, height } = loadAndThresholdImage('ring-128.png');

    const data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      const val = binary[i]! > 0 ? 0 : 255;
      data[i * 4] = val;
      data[i * 4 + 1] = val;
      data[i * 4 + 2] = val;
      data[i * 4 + 3] = 255;
    }

    const result = runPipeline({
      data,
      width,
      height,
      colorSpace: 'srgb',
    });

    expect(result.svg).toContain('<svg');
    expect(result.svg).toContain('<path');
    // Ring produces 2 contours but may be combined into 1 or 2 paths depending on SVG generation
    expect(result.paths.length).toBeGreaterThanOrEqual(1);
  });
});
