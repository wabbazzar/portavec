/**
 * Bake a 1200×630 og:image from the forest_cat before/after.
 *
 *   npx tsx scripts/build-og-image.ts
 *
 * Layout:
 *   - Dark navy background with subtle accent stripe on the left
 *   - Left ~40%: "Portavec" wordmark + "Raster → Vector, in the browser."
 *   - Right ~60%: forest_cat split composition — left half original
 *     raster, right half quantized/vectorized — with a vertical coral
 *     divider and small "ORIGINAL" / "VECTORIZED" labels.
 *
 * Output: public/og.png
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';

const W = 1200;
const H = 630;
const BG = [0x0b, 0x0b, 0x17];
const ACCENT = [0xe9, 0x45, 0x60];
const TEXT = [0xf5, 0xf5, 0xf7];
const SUBTLE = [0x9c, 0xa0, 0xaf];

function blank(): Uint8Array {
  const buf = new Uint8Array(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    buf[i * 4] = BG[0]!;
    buf[i * 4 + 1] = BG[1]!;
    buf[i * 4 + 2] = BG[2]!;
    buf[i * 4 + 3] = 0xff;
  }
  return buf;
}

function setPixel(buf: Uint8Array, x: number, y: number, rgb: number[]): void {
  if (x < 0 || x >= W || y < 0 || y >= H) return;
  const i = (y * W + x) * 4;
  buf[i] = rgb[0]!;
  buf[i + 1] = rgb[1]!;
  buf[i + 2] = rgb[2]!;
  buf[i + 3] = 0xff;
}

function rect(buf: Uint8Array, x: number, y: number, w: number, h: number, rgb: number[]): void {
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) setPixel(buf, xx, yy, rgb);
  }
}

/** Paint an ImageData-ish input into `buf` at (dx,dy), fitting into (dw,dh) via nearest-neighbor. */
function blit(
  buf: Uint8Array,
  src: { data: Uint8Array; width: number; height: number },
  dx: number,
  dy: number,
  dw: number,
  dh: number,
): void {
  const sx = src.width / dw;
  const sy = src.height / dh;
  for (let j = 0; j < dh; j++) {
    for (let i = 0; i < dw; i++) {
      const srcX = Math.floor(i * sx);
      const srcY = Math.floor(j * sy);
      const si = (srcY * src.width + srcX) * 4;
      const r = src.data[si]!;
      const g = src.data[si + 1]!;
      const b = src.data[si + 2]!;
      setPixel(buf, dx + i, dy + j, [r, g, b]);
    }
  }
}

/**
 * Minimal 5×7 bitmap font for the labels. Only the glyphs we actually
 * need: uppercase letters, a few punctuation. Keeps the script tiny and
 * avoids needing a canvas/font system.
 */
const GLYPHS: Record<string, string[]> = {
  A: ['.XXX.', 'X...X', 'X...X', 'XXXXX', 'X...X', 'X...X', 'X...X'],
  B: ['XXXX.', 'X...X', 'X...X', 'XXXX.', 'X...X', 'X...X', 'XXXX.'],
  C: ['.XXX.', 'X...X', 'X....', 'X....', 'X....', 'X...X', '.XXX.'],
  D: ['XXXX.', 'X...X', 'X...X', 'X...X', 'X...X', 'X...X', 'XXXX.'],
  E: ['XXXXX', 'X....', 'X....', 'XXXX.', 'X....', 'X....', 'XXXXX'],
  G: ['.XXX.', 'X...X', 'X....', 'X.XXX', 'X...X', 'X...X', '.XXX.'],
  H: ['X...X', 'X...X', 'X...X', 'XXXXX', 'X...X', 'X...X', 'X...X'],
  I: ['XXXXX', '..X..', '..X..', '..X..', '..X..', '..X..', 'XXXXX'],
  L: ['X....', 'X....', 'X....', 'X....', 'X....', 'X....', 'XXXXX'],
  M: ['X...X', 'XX.XX', 'X.X.X', 'X.X.X', 'X...X', 'X...X', 'X...X'],
  N: ['X...X', 'XX..X', 'X.X.X', 'X.X.X', 'X..XX', 'X...X', 'X...X'],
  O: ['.XXX.', 'X...X', 'X...X', 'X...X', 'X...X', 'X...X', '.XXX.'],
  P: ['XXXX.', 'X...X', 'X...X', 'XXXX.', 'X....', 'X....', 'X....'],
  R: ['XXXX.', 'X...X', 'X...X', 'XXXX.', 'X.X..', 'X..X.', 'X...X'],
  S: ['.XXXX', 'X....', 'X....', '.XXX.', '....X', '....X', 'XXXX.'],
  T: ['XXXXX', '..X..', '..X..', '..X..', '..X..', '..X..', '..X..'],
  V: ['X...X', 'X...X', 'X...X', 'X...X', 'X...X', '.X.X.', '..X..'],
  W: ['X...X', 'X...X', 'X...X', 'X.X.X', 'X.X.X', 'XX.XX', 'X...X'],
  Z: ['XXXXX', '....X', '...X.', '..X..', '.X...', 'X....', 'XXXXX'],
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
  '→': ['.....', '.X...', '..X..', 'XXXXX', '..X..', '.X...', '.....'],
  '.': ['.....', '.....', '.....', '.....', '.....', '.....', '.XX..'],
  ',': ['.....', '.....', '.....', '.....', '.....', '.XX..', '.X...'],
  '/': ['....X', '...X.', '...X.', '..X..', '.X...', '.X...', 'X....'],
};

function drawText(
  buf: Uint8Array,
  text: string,
  x: number,
  y: number,
  scale: number,
  rgb: number[],
): void {
  let cx = x;
  for (const ch of text.toUpperCase()) {
    const g = GLYPHS[ch] ?? GLYPHS[' ']!;
    for (let gy = 0; gy < 7; gy++) {
      const row = g[gy]!;
      for (let gx = 0; gx < 5; gx++) {
        if (row[gx] === 'X') {
          rect(buf, cx + gx * scale, y + gy * scale, scale, scale, rgb);
        }
      }
    }
    cx += (5 + 1) * scale;
  }
}

function loadPng(path: string): { data: Uint8Array; width: number; height: number } {
  const png = PNG.sync.read(readFileSync(path));
  return { data: new Uint8Array(png.data), width: png.width, height: png.height };
}

function writePng(path: string, buf: Uint8Array): void {
  const png = new PNG({ width: W, height: H });
  for (let i = 0; i < buf.length; i++) png.data[i] = buf[i]!;
  writeFileSync(path, PNG.sync.write(png));
}

function main(): void {
  const buf = blank();

  // Left accent stripe.
  rect(buf, 0, 0, 6, H, ACCENT);

  // Right-side before/after composition:
  //   inset box spanning ~ x=520..1150, y=90..540 (630 wide × 450 tall,
  //   close to 1376:768 aspect-ratio). Split vertically 50/50 with
  //   coral divider.
  const insetX = 560;
  const insetY = 90;
  const insetW = 600;
  const insetH = 450;

  // Background card behind the image
  rect(buf, insetX - 8, insetY - 8, insetW + 16, insetH + 16, [0x14, 0x14, 0x23]);

  // Load the two stage assets
  const original = loadPng('public/about/step-1-original.png');
  const quant = loadPng('public/about/step-2-quantized.png');

  // Draw both across the full inset, then let the divider reveal them.
  // Simpler: draw original on left half, quantized on right half.
  // Need to stretch each half from the full source image — so left
  // half pulls pixels from the left half of `original`, right half
  // from the right half of `quant`. This makes the split actually
  // visible as a real before/after.
  // Blit both across full inset:
  blit(buf, original, insetX, insetY, insetW, insetH);
  // Overlay the right half with quantized
  const halfW = Math.floor(insetW / 2);
  // Blit quant stretched across full inset, but only paint the right half.
  for (let j = 0; j < insetH; j++) {
    for (let i = halfW; i < insetW; i++) {
      const sx = Math.floor((i / insetW) * quant.width);
      const sy = Math.floor((j / insetH) * quant.height);
      const si = (sy * quant.width + sx) * 4;
      setPixel(buf, insetX + i, insetY + j, [
        quant.data[si]!,
        quant.data[si + 1]!,
        quant.data[si + 2]!,
      ]);
    }
  }

  // Vertical coral divider at the split
  rect(buf, insetX + halfW - 2, insetY, 4, insetH, ACCENT);

  // Small ORIGINAL / VECTORIZED labels (top corners of inset)
  drawText(buf, 'ORIGINAL', insetX + 12, insetY + 12, 2, TEXT);
  drawText(buf, 'VECTORIZED', insetX + halfW + 12, insetY + 12, 2, TEXT);

  // Left column: wordmark + tagline
  // Title "PORTAVEC" in accent, large
  drawText(buf, 'PORTAVEC', 70, 220, 8, TEXT);
  // Subhead: "RASTER → VECTOR" with accent arrow
  drawText(buf, 'RASTER', 70, 320, 4, ACCENT);
  drawText(buf, '→', 70 + (6 * 5 + 6) * 4, 320, 4, ACCENT);
  drawText(buf, 'VECTOR', 70 + (6 * 5 + 6) * 4 + 6 * 4, 320, 4, ACCENT);
  // Tagline: "IN THE BROWSER."
  drawText(buf, 'IN THE BROWSER.', 70, 380, 3, SUBTLE);
  // URL line
  drawText(buf, 'WABBAZZAR.COM/PORTAVEC', 70, 520, 2, SUBTLE);

  writePng('public/og.png', buf);
  process.stderr.write('wrote public/og.png (1200×630)\n');
}

main();
