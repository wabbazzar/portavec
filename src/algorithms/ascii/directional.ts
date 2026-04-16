/**
 * Directional ASCII art converter.
 *
 * Port of reference/convert.py. Two layers:
 *
 *   asciifyGrid(brightness, gradX, gradY, opts)
 *     Pure function over prepared grids. Must be bit-exact with the
 *     Python oracle (reference/convert.py :: image_to_ascii).
 *
 *   imageToAscii(imageData, opts)
 *     Full pipeline including the 4x-oversampled Sobel gradient stage.
 *     The resize uses a canvas DrawImage which differs from PIL LANCZOS,
 *     so IoU vs. the oracle will be high but not 100%.
 */

export interface AsciifyOptions {
  threshold: number;         // below this => '.'
  faintThreshold: number;    // below this => ' '
}

export interface AsciiGrid {
  rows: number;
  cols: number;
  lines: string[];
}

export const defaultAsciifyOptions: AsciifyOptions = {
  threshold: 40,
  faintThreshold: 25,
};

/**
 * Convert per-cell brightness + gradient arrays into a character grid.
 *
 * Bit-exact port of image_to_ascii() from reference/convert.py.
 */
export function asciifyGrid(
  brightness: Float64Array,
  gradX: Float64Array,
  gradY: Float64Array,
  rows: number,
  cols: number,
  opts: Partial<AsciifyOptions> = {},
): AsciiGrid {
  const { threshold, faintThreshold } = { ...defaultAsciifyOptions, ...opts };
  const lines: string[] = [];

  for (let r = 0; r < rows; r++) {
    const chars: string[] = [];
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      const b = brightness[idx]!;

      if (b < faintThreshold) {
        chars.push(' ');
        continue;
      }
      if (b < threshold) {
        chars.push('.');
        continue;
      }

      const gx = gradX[idx]!;
      const gy = gradY[idx]!;
      const mag = Math.sqrt(gx * gx + gy * gy);

      if (mag < 5) {
        if (b > 180) chars.push('#');
        else if (b > 120) chars.push('+');
        else chars.push(':');
        continue;
      }

      // Edge direction perpendicular to the gradient.
      const edgeAngle = Math.atan2(gx, -gy);
      let deg = (edgeAngle * 180) / Math.PI;
      deg = ((deg % 180) + 180) % 180; // match Python's % for negatives

      if (deg > 67.5 && deg < 112.5) chars.push('|');
      else if (deg < 22.5 || deg > 157.5) chars.push('-');
      else if (deg >= 22.5 && deg <= 67.5) chars.push('/');
      else chars.push('\\');
    }
    lines.push(chars.join(''));
  }

  return { rows, cols, lines };
}

export interface ImageToAsciiOptions extends AsciifyOptions {
  cols: number;
  rows: number;
}

export const defaultImageToAsciiOptions: ImageToAsciiOptions = {
  ...defaultAsciifyOptions,
  cols: 80,
  rows: 40,
};

export interface ImageToAsciiResult extends AsciiGrid {
  brightness: Float64Array;
  gradX: Float64Array;
  gradY: Float64Array;
}

/**
 * Full pipeline: ImageData -> ASCII grid.
 *
 * Resize strategy (differs from PIL):
 *   1. Downscale luminance to cols*rows using area-average sampling.
 *   2. Downscale a 4x-oversampled luminance grid for Sobel.
 *   3. Compute central-difference gradients, then 4x4 cell-average.
 */
export function imageToAscii(
  imageData: ImageData,
  options: Partial<ImageToAsciiOptions> = {},
): ImageToAsciiResult {
  const opts = { ...defaultImageToAsciiOptions, ...options };
  const { cols, rows } = opts;

  const luma = toLuminance(imageData);
  const brightness = resizeAreaAverage(luma, imageData.width, imageData.height, cols, rows);

  const hrW = cols * 4;
  const hrH = rows * 4;
  const hr = resizeAreaAverage(luma, imageData.width, imageData.height, hrW, hrH);

  // Central-difference Sobel on hr grid.
  const gx = new Float64Array(hrW * hrH);
  const gy = new Float64Array(hrW * hrH);
  for (let y = 0; y < hrH; y++) {
    for (let x = 1; x < hrW - 1; x++) {
      gx[y * hrW + x] = hr[y * hrW + (x + 1)]! - hr[y * hrW + (x - 1)]!;
    }
  }
  for (let y = 1; y < hrH - 1; y++) {
    for (let x = 0; x < hrW; x++) {
      gy[y * hrW + x] = hr[(y + 1) * hrW + x]! - hr[(y - 1) * hrW + x]!;
    }
  }

  // Average each 4x4 block -> cell-level gradient.
  const gradX = new Float64Array(rows * cols);
  const gradY = new Float64Array(rows * cols);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let sx = 0;
      let sy = 0;
      for (let yy = 0; yy < 4; yy++) {
        for (let xx = 0; xx < 4; xx++) {
          const hi = (r * 4 + yy) * hrW + (c * 4 + xx);
          sx += gx[hi]!;
          sy += gy[hi]!;
        }
      }
      gradX[r * cols + c] = sx / 16;
      gradY[r * cols + c] = sy / 16;
    }
  }

  const grid = asciifyGrid(brightness, gradX, gradY, rows, cols, opts);
  return { ...grid, brightness, gradX, gradY };
}

/**
 * Convert RGBA ImageData to luminance (PIL 'L' mode: ITU-R 601-2).
 *   L = R * 299/1000 + G * 587/1000 + B * 114/1000
 *   truncated to int (matches PIL behavior).
 */
export function toLuminance(imageData: ImageData): Float64Array {
  const { data, width, height } = imageData;
  const out = new Float64Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const r = data[i * 4]!;
    const g = data[i * 4 + 1]!;
    const b = data[i * 4 + 2]!;
    out[i] = Math.trunc((r * 299 + g * 587 + b * 114) / 1000);
  }
  return out;
}

/**
 * Area-average downscale of a luminance plane.
 *
 * Averages source pixels that overlap each destination cell. Not
 * identical to PIL LANCZOS, so values will differ from the oracle's
 * brightness grid — callers compare via IoU, not exact match.
 */
export function resizeAreaAverage(
  src: Float64Array,
  sw: number,
  sh: number,
  dw: number,
  dh: number,
): Float64Array {
  const out = new Float64Array(dw * dh);
  const xScale = sw / dw;
  const yScale = sh / dh;

  for (let dy = 0; dy < dh; dy++) {
    const sy0 = dy * yScale;
    const sy1 = (dy + 1) * yScale;
    const y0 = Math.floor(sy0);
    const y1 = Math.min(sh, Math.ceil(sy1));
    for (let dx = 0; dx < dw; dx++) {
      const sx0 = dx * xScale;
      const sx1 = (dx + 1) * xScale;
      const x0 = Math.floor(sx0);
      const x1 = Math.min(sw, Math.ceil(sx1));

      let sum = 0;
      let wsum = 0;
      for (let y = y0; y < y1; y++) {
        const wy = Math.min(y + 1, sy1) - Math.max(y, sy0);
        if (wy <= 0) continue;
        for (let x = x0; x < x1; x++) {
          const wx = Math.min(x + 1, sx1) - Math.max(x, sx0);
          if (wx <= 0) continue;
          const w = wx * wy;
          sum += src[y * sw + x]! * w;
          wsum += w;
        }
      }
      out[dy * dw + dx] = wsum > 0 ? sum / wsum : 0;
    }
  }
  return out;
}

export interface ScoreResult {
  accuracy: number;
  iou: number;
  precision: number;
  recall: number;
  truePos: number;
  trueNeg: number;
  falsePos: number;
  falseNeg: number;
}

/**
 * Score an ASCII grid against a brightness mask (char present vs. not).
 * Mirrors score_frame() in the Python oracle.
 */
export function scoreAscii(
  grid: AsciiGrid,
  brightness: Float64Array,
  mask: { rows: number; cols: number },
  threshold = 35,
): ScoreResult {
  const rows = Math.min(grid.rows, mask.rows);
  const cols = Math.min(
    grid.lines.reduce((m, l) => Math.max(m, l.length), 0),
    mask.cols,
  );

  let tp = 0;
  let tn = 0;
  let fp = 0;
  let fn = 0;
  for (let r = 0; r < rows; r++) {
    const line = grid.lines[r] ?? '';
    for (let c = 0; c < cols; c++) {
      const hasChar = c < line.length && line[c] !== ' ';
      const hasPixel = brightness[r * mask.cols + c]! >= threshold;
      if (hasChar && hasPixel) tp++;
      else if (!hasChar && !hasPixel) tn++;
      else if (hasChar && !hasPixel) fp++;
      else fn++;
    }
  }
  const total = tp + tn + fp + fn;
  return {
    accuracy: total > 0 ? ((tp + tn) / total) * 100 : 0,
    iou: tp + fp + fn > 0 ? (tp / (tp + fp + fn)) * 100 : 0,
    precision: tp + fp > 0 ? (tp / (tp + fp)) * 100 : 0,
    recall: tp + fn > 0 ? (tp / (tp + fn)) * 100 : 0,
    truePos: tp,
    trueNeg: tn,
    falsePos: fp,
    falseNeg: fn,
  };
}
