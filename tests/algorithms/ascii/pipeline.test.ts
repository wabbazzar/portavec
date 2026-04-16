import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PNG } from 'pngjs';
import { imageToAscii } from '../../../src/algorithms/ascii';

interface Golden {
  input: string;
  cols: number;
  rows: number;
  threshold: number;
  faint_threshold: number;
  lines: string[];
}

function loadGolden(name: string): Golden {
  return JSON.parse(
    readFileSync(resolve(__dirname, `../../../reference/goldens/${name}.json`), 'utf-8'),
  );
}

function loadPngAsImageData(path: string): ImageData {
  const png = PNG.sync.read(readFileSync(path));
  const { width, height, data } = png;
  const arr = new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength);
  return { data: arr, width, height, colorSpace: 'srgb' } as unknown as ImageData;
}

function charIou(a: string[], b: string[]): number {
  const rows = Math.min(a.length, b.length);
  let tp = 0;
  let fp = 0;
  let fn = 0;
  for (let r = 0; r < rows; r++) {
    const la = a[r] ?? '';
    const lb = b[r] ?? '';
    const cols = Math.max(la.length, lb.length);
    for (let c = 0; c < cols; c++) {
      const ha = c < la.length && la[c] !== ' ';
      const hb = c < lb.length && lb[c] !== ' ';
      if (ha && hb) tp++;
      else if (ha && !hb) fp++;
      else if (!ha && hb) fn++;
    }
  }
  return tp + fp + fn === 0 ? 100 : (tp / (tp + fp + fn)) * 100;
}

function charExactMatch(a: string[], b: string[]): number {
  const rows = Math.min(a.length, b.length);
  let match = 0;
  let total = 0;
  for (let r = 0; r < rows; r++) {
    const la = a[r] ?? '';
    const lb = b[r] ?? '';
    const cols = Math.max(la.length, lb.length);
    for (let c = 0; c < cols; c++) {
      const ca = la[c] ?? ' ';
      const cb = lb[c] ?? ' ';
      total++;
      if (ca === cb) match++;
    }
  }
  return total === 0 ? 100 : (match / total) * 100;
}

describe('imageToAscii (end-to-end vs. Python oracle)', () => {
  const cases = [
    { name: 'letter-a', file: 'letter-a-256.png', minCharIou: 90, minExact: 85 },
    { name: 'circle', file: 'circle-256.png', minCharIou: 90, minExact: 85 },
    { name: 'rings', file: 'concentric-rings-256.png', minCharIou: 85, minExact: 70 },
  ];

  for (const tc of cases) {
    it(`matches ${tc.name} within tolerance (resize differs from PIL LANCZOS)`, () => {
      const g = loadGolden(tc.name);
      const imgPath = resolve(__dirname, `../../../test-images/${tc.file}`);
      const imageData = loadPngAsImageData(imgPath);

      const result = imageToAscii(imageData, {
        cols: g.cols,
        rows: g.rows,
        threshold: g.threshold,
        faintThreshold: g.faint_threshold,
      });

      const iou = charIou(result.lines, g.lines);
      const exact = charExactMatch(result.lines, g.lines);

      expect(iou, `${tc.name} char-IoU`).toBeGreaterThanOrEqual(tc.minCharIou);
      expect(exact, `${tc.name} exact-char`).toBeGreaterThanOrEqual(tc.minExact);
    });
  }
});
