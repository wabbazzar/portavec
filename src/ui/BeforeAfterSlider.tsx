import { useCallback, useEffect, useRef, useState } from 'react';
import './BeforeAfterSlider.css';

interface Props {
  sourceImage: ImageData | null;
  resultSvg: string | null;
  resultRasterized: ImageData | null;
}

/**
 * Before/after slider comparison.
 *
 * Stacks the original raster (left) and the vectorized SVG (right) in
 * the same box. A draggable vertical handle reveals one or the other.
 * Keyboard: left/right arrows nudge in 2% steps; home/end jump to edges.
 */
export function BeforeAfterSlider({ sourceImage, resultSvg, resultRasterized }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sourceCanvasRef = useRef<HTMLCanvasElement>(null);
  const resultCanvasRef = useRef<HTMLCanvasElement>(null);
  const [split, setSplit] = useState(50);
  const [dragging, setDragging] = useState(false);

  // Paint the source ImageData onto its canvas whenever it changes.
  useEffect(() => {
    if (sourceImage && sourceCanvasRef.current) {
      const c = sourceCanvasRef.current;
      c.width = sourceImage.width;
      c.height = sourceImage.height;
      c.getContext('2d')?.putImageData(sourceImage, 0, 0);
    }
  }, [sourceImage]);

  // Paint the rasterized result as a fallback when resultSvg isn't ready.
  useEffect(() => {
    if (resultRasterized && !resultSvg && resultCanvasRef.current) {
      const c = resultCanvasRef.current;
      c.width = resultRasterized.width;
      c.height = resultRasterized.height;
      c.getContext('2d')?.putImageData(resultRasterized, 0, 0);
    }
  }, [resultRasterized, resultSvg]);

  const updateFromClientX = useCallback((clientX: number) => {
    const box = containerRef.current?.getBoundingClientRect();
    if (!box) return;
    const pct = Math.max(0, Math.min(100, ((clientX - box.left) / box.width) * 100));
    setSplit(pct);
  }, []);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(true);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    updateFromClientX(e.clientX);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    updateFromClientX(e.clientX);
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    setDragging(false);
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch { /* noop */ }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowLeft') setSplit((v) => Math.max(0, v - 2));
    else if (e.key === 'ArrowRight') setSplit((v) => Math.min(100, v + 2));
    else if (e.key === 'Home') setSplit(0);
    else if (e.key === 'End') setSplit(100);
    else return;
    e.preventDefault();
  };

  const svgSrc = resultSvg
    ? `data:image/svg+xml;utf8,${encodeURIComponent(resultSvg)}`
    : null;

  // Preserve image aspect ratio. Both layers render at 100% of the
  // frame's size so their content overlaps pixel-for-pixel — critical
  // for the clip-path reveal to work correctly.
  const aspect = sourceImage ? `${sourceImage.width} / ${sourceImage.height}` : '1 / 1';

  return (
    <div className="before-after">
      <div
        ref={containerRef}
        className={`before-after-box${dragging ? ' dragging' : ''}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div className="ba-frame" style={{ aspectRatio: aspect }}>
          {/* "After" (vectorized) layer underneath */}
          <div className="ba-layer ba-after">
            {svgSrc ? (
              <img src={svgSrc} alt="Vectorized" draggable={false} />
            ) : (
              <canvas ref={resultCanvasRef} />
            )}
            <span className="ba-label ba-label-after">vectorized</span>
          </div>

          {/* "Before" (original) layer on top, clipped to the left of the handle */}
          <div
            className="ba-layer ba-before"
            style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}
          >
            <canvas ref={sourceCanvasRef} />
            <span className="ba-label ba-label-before">original</span>
          </div>

          {/* Divider handle */}
          <div
            className="ba-handle"
            style={{ left: `${split}%` }}
            role="slider"
            tabIndex={0}
            aria-label="Before/after split"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(split)}
            onKeyDown={onKeyDown}
          >
            <div className="ba-handle-line" />
            <div className="ba-handle-knob">
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
                <path d="M8 6 L3 12 L8 18" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M16 6 L21 12 L16 18" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </div>
        </div>
      </div>
      <div className="before-after-caption">
        drag handle (or ← → keys) to compare · {Math.round(split)}% original
      </div>
    </div>
  );
}
