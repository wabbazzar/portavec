import { useMemo } from 'react';
import './PaletteStrip.css';

interface Props {
  svg: string | null;
}

interface Swatch {
  hex: string;
  paths: number;
}

/** Pull unique `fill="#..."` values from the SVG and count paths per color. */
function extractPalette(svg: string): Swatch[] {
  const counts = new Map<string, number>();
  const re = /fill="(#[0-9a-fA-F]{6})"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(svg)) != null) {
    const hex = m[1]!.toLowerCase();
    counts.set(hex, (counts.get(hex) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([hex, paths]) => ({ hex, paths }))
    .sort((a, b) => b.paths - a.paths);
}

export function PaletteStrip({ svg }: Props) {
  const swatches = useMemo(() => (svg ? extractPalette(svg) : []), [svg]);
  if (swatches.length === 0) return null;
  return (
    <div className="palette-strip" aria-label="Chosen palette">
      <div className="palette-label">
        Palette <span className="palette-count">{swatches.length} colors</span>
      </div>
      <div className="palette-row">
        {swatches.map((s) => (
          <div key={s.hex} className="palette-swatch" title={`${s.hex} · ${s.paths} paths`}>
            <div className="swatch-chip" style={{ background: s.hex }} />
            <div className="swatch-hex">{s.hex}</div>
            <div className="swatch-meta">{s.paths}p</div>
          </div>
        ))}
      </div>
    </div>
  );
}
