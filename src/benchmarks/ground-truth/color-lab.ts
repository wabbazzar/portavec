/**
 * sRGB ↔ CIE Lab conversions used by the loss function.
 *
 * Standard D65 whitepoint. sRGB is gamma-decoded (IEC 61966-2-1) before
 * the linear RGB → XYZ → Lab chain.
 */

export type Lab = [number, number, number];
export type Rgb = [number, number, number];

export function rgbToLab([r, g, b]: Rgb): Lab {
  const [x, y, z] = rgbToXyz(r, g, b);
  return xyzToLab(x, y, z);
}

function rgbToXyz(r: number, g: number, b: number): [number, number, number] {
  const R = srgbToLinear(r / 255);
  const G = srgbToLinear(g / 255);
  const B = srgbToLinear(b / 255);
  // sRGB D65
  const x = R * 0.4124564 + G * 0.3575761 + B * 0.1804375;
  const y = R * 0.2126729 + G * 0.7151522 + B * 0.0721750;
  const z = R * 0.0193339 + G * 0.1191920 + B * 0.9503041;
  return [x, y, z];
}

function srgbToLinear(v: number): number {
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function xyzToLab(x: number, y: number, z: number): Lab {
  // D65 reference white
  const Xn = 0.95047;
  const Yn = 1.0;
  const Zn = 1.08883;
  const fx = labF(x / Xn);
  const fy = labF(y / Yn);
  const fz = labF(z / Zn);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

function labF(t: number): number {
  const d = 6 / 29;
  return t > d * d * d ? Math.cbrt(t) : t / (3 * d * d) + 4 / 29;
}

/** CIE76 ΔE. Fine for the magnitudes we care about (shape colors are saturated and far apart). */
export function deltaE([l1, a1, b1]: Lab, [l2, a2, b2]: Lab): number {
  const dL = l1 - l2;
  const da = a1 - a2;
  const db = b1 - b2;
  return Math.sqrt(dL * dL + da * da + db * db);
}
