/**
 * Deterministic palette generation for ground-truth shapes.
 *
 * Colors are placed at evenly-spaced hues in HSL space, with a random
 * rotation from the seed so different seeds produce different palettes.
 * Saturation and lightness are fixed to keep colors visually distinct and
 * far from the white background.
 */

import type { Rng } from './rng';

const SAT = 0.75;
const LIGHT = 0.5;

/**
 * Generate `n` distinct hex colors. Caller-supplied `rng` drives the hue
 * rotation, so the output is deterministic for a given seed.
 */
export function pickPalette(rng: Rng, n: number): string[] {
  if (n < 1 || n > 16 || !Number.isInteger(n)) {
    throw new Error(`pickPalette: n must be integer in [1, 16], got ${n}`);
  }
  const rotation = rng.next(); // [0, 1)
  const colors: string[] = [];
  for (let i = 0; i < n; i++) {
    const hue = (rotation + i / n) % 1;
    colors.push(hslToHex(hue, SAT, LIGHT));
  }
  return colors;
}

/**
 * HSL → sRGB hex. `h`, `s`, `l` all in [0, 1].
 * Implements the standard HSL-to-RGB conversion.
 */
export function hslToHex(h: number, s: number, l: number): string {
  const [r, g, b] = hslToRgb(h, s, l);
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    Math.round(hue2rgb(p, q, h) * 255),
    Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  ];
}

function hue2rgb(p: number, q: number, t: number): number {
  let u = t;
  if (u < 0) u += 1;
  if (u > 1) u -= 1;
  if (u < 1 / 6) return p + (q - p) * 6 * u;
  if (u < 1 / 2) return q;
  if (u < 2 / 3) return p + (q - p) * (2 / 3 - u) * 6;
  return p;
}

function toHex(v: number): string {
  return Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0');
}

/** Parse a #rrggbb string. Returns `[r, g, b]` in [0, 255]. */
export function hexToRgb(hex: string): [number, number, number] {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`hexToRgb: invalid color ${hex}`);
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}
