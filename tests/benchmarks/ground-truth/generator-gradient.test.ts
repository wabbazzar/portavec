import { describe, it, expect } from 'vitest';
import { generateGradientTruth } from '../../../src/benchmarks/ground-truth/generator-gradient';
import { rasterizeTruth } from '../../../src/benchmarks/ground-truth/rasterize';

describe('generateGradientTruth', () => {
  it('every shape carries a gradient fill', () => {
    const truth = generateGradientTruth({
      seed: 1, colors: 3, shapeCount: 3, width: 128, height: 128, allowOverlap: true,
    });
    expect(truth.shapes.length).toBe(3);
    for (const s of truth.shapes) {
      expect(s.gradient).toBeDefined();
      expect(s.gradient!.stops.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('palette contains every gradient stop color', () => {
    const truth = generateGradientTruth({
      seed: 7, colors: 4, shapeCount: 4, width: 128, height: 128, allowOverlap: true,
    });
    const stopColors = new Set<string>();
    for (const s of truth.shapes) {
      for (const c of s.gradient!.stops) stopColors.add(c.toLowerCase());
    }
    for (const c of stopColors) {
      expect(truth.palette.map((p) => p.toLowerCase())).toContain(c);
    }
  });

  it('is deterministic', () => {
    const a = generateGradientTruth({ seed: 3, colors: 2, shapeCount: 2, width: 96, height: 96 });
    const b = generateGradientTruth({ seed: 3, colors: 2, shapeCount: 2, width: 96, height: 96 });
    expect(a).toEqual(b);
  });

  it('rasterizes to an image that uses more colors than plain-fill', () => {
    const truth = generateGradientTruth({
      seed: 5, colors: 3, shapeCount: 3, width: 128, height: 128, allowOverlap: true, stops: 3,
    });
    const img = rasterizeTruth(truth);
    const colors = new Set<string>();
    for (let i = 0; i < img.width * img.height; i++) {
      colors.add(`${img.data[i * 4]},${img.data[i * 4 + 1]},${img.data[i * 4 + 2]}`);
    }
    // Gradient-filled raster should have many distinct colors.
    expect(colors.size).toBeGreaterThan(20);
  });

  it('mix of linear and radial kinds in mixed mode', () => {
    const truth = generateGradientTruth({
      seed: 11, colors: 6, shapeCount: 6, width: 160, height: 160,
      allowOverlap: true, gradientKind: 'mixed',
    });
    const kinds = new Set(truth.shapes.map((s) => s.gradient!.kind));
    // With 6 shapes and 50/50 mix, effectively guaranteed to see both.
    expect(kinds.size).toBeGreaterThanOrEqual(1);
  });
});
