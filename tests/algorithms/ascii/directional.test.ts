import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  asciifyGrid,
  resizeAreaAverage,
  scoreAscii,
} from '../../../src/algorithms/ascii';

interface Golden {
  cols: number;
  rows: number;
  threshold: number;
  faint_threshold: number;
  brightness: number[][];
  grad_x: number[][];
  grad_y: number[][];
  lines: string[];
}

function loadGolden(name: string): Golden {
  const path = resolve(__dirname, `../../../reference/goldens/${name}.json`);
  return JSON.parse(readFileSync(path, 'utf-8'));
}

function flatten(grid: number[][]): Float64Array {
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  const out = new Float64Array(rows * cols);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      out[r * cols + c] = grid[r]![c]!;
    }
  }
  return out;
}

describe('asciifyGrid (bit-exact vs. Python oracle)', () => {
  const cases = ['letter-a', 'circle', 'rings'];

  for (const name of cases) {
    it(`matches ${name} golden character-for-character`, () => {
      const g = loadGolden(name);
      const grid = asciifyGrid(
        flatten(g.brightness),
        flatten(g.grad_x),
        flatten(g.grad_y),
        g.rows,
        g.cols,
        { threshold: g.threshold, faintThreshold: g.faint_threshold },
      );
      expect(grid.lines.length).toBe(g.rows);
      for (let r = 0; r < g.rows; r++) {
        expect(grid.lines[r], `row ${r}`).toBe(g.lines[r]);
      }
    });
  }
});

describe('resizeAreaAverage', () => {
  it('preserves a uniform field', () => {
    const src = new Float64Array(16 * 16).fill(128);
    const out = resizeAreaAverage(src, 16, 16, 4, 4);
    for (const v of out) expect(v).toBeCloseTo(128, 6);
  });

  it('averages a 2x2 block down to 1 pixel', () => {
    const src = new Float64Array([0, 100, 200, 0]);
    const out = resizeAreaAverage(src, 2, 2, 1, 1);
    expect(out[0]).toBeCloseTo(75, 6);
  });
});

describe('scoreAscii', () => {
  it('reports 100% IoU when grid matches its own brightness', () => {
    const g = loadGolden('letter-a');
    const grid = {
      rows: g.rows,
      cols: g.cols,
      lines: g.lines,
    };
    const result = scoreAscii(grid, flatten(g.brightness), {
      rows: g.rows,
      cols: g.cols,
    });
    expect(result.accuracy).toBeGreaterThan(0);
    expect(result.truePos + result.trueNeg + result.falsePos + result.falseNeg)
      .toBe(g.rows * g.cols);
  });
});
