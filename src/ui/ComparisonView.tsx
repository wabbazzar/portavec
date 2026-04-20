import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useAppState } from './context/AppContext';
import { BeforeAfterSlider } from './BeforeAfterSlider';
import './ComparisonView.css';

interface ImagePanelProps {
  title: string;
  imageData: ImageData | null;
  svgContent?: string | null;
  showSvg?: boolean;
  actions?: ReactNode;
  zoom?: number;
}

function ImagePanel({ title, imageData, svgContent, showSvg, actions, zoom = 1 }: ImagePanelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!showSvg && imageData && canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) {
        canvasRef.current.width = imageData.width;
        canvasRef.current.height = imageData.height;
        ctx.putImageData(imageData, 0, 0);
      }
    }
  }, [imageData, showSvg]);

  // Reset scroll when zoom drops to 1 (nothing to pan).
  useEffect(() => {
    if (zoom <= 1 && contentRef.current) {
      contentRef.current.scrollLeft = 0;
      contentRef.current.scrollTop = 0;
    }
  }, [zoom]);

  const panEnabled = zoom > 1;

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!panEnabled) return;
    const el = contentRef.current;
    if (!el) return;
    e.preventDefault();
    setDragging(true);
    const startX = e.clientX;
    const startY = e.clientY;
    const startLeft = el.scrollLeft;
    const startTop = el.scrollTop;
    el.setPointerCapture(e.pointerId);

    const onMove = (ev: PointerEvent) => {
      el.scrollLeft = startLeft - (ev.clientX - startX);
      el.scrollTop = startTop - (ev.clientY - startY);
    };
    const onUp = (ev: PointerEvent) => {
      setDragging(false);
      try { el.releasePointerCapture(ev.pointerId); } catch { /* noop */ }
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
    };
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
  };

  const renderContent = () => {
    if (showSvg && svgContent) {
      // Render SVG as a real <img> so the browser's native right-click
      // "Copy Image" / "Save Image" works. Data URL round-trip keeps
      // the SVG self-contained.
      const src = `data:image/svg+xml;utf8,${encodeURIComponent(svgContent)}`;
      return (
        <img
          className="image-canvas svg-img"
          src={src}
          alt={title}
          style={{ transform: `scale(${zoom})`, transformOrigin: 'top left' }}
          draggable={false}
        />
      );
    }
    if (imageData) {
      return (
        <canvas
          ref={canvasRef}
          className="image-canvas"
          style={{ transform: `scale(${zoom})`, transformOrigin: 'top left' }}
        />
      );
    }
    return (
      <div className="panel-placeholder">
        <span>No image</span>
      </div>
    );
  };

  const cursor = panEnabled ? (dragging ? 'grabbing' : 'grab') : 'default';

  return (
    <div className="image-panel">
      <div className="panel-header">
        <span className="panel-title">{title}</span>
        <div className="panel-header-right">
          {imageData && (
            <span className="panel-dimensions">
              {imageData.width} x {imageData.height}
            </span>
          )}
          {actions}
        </div>
      </div>
      <div
        ref={contentRef}
        className="panel-content"
        style={{ overflow: panEnabled ? 'auto' : 'hidden', cursor, touchAction: panEnabled ? 'none' : 'auto' }}
        onPointerDown={onPointerDown}
      >
        {renderContent()}
      </div>
    </div>
  );
}

export function ComparisonView() {
  const { sourceImage, resultSvg, resultRasterized, diffMode } = useAppState();
  const [zoom, setZoom] = useState(1);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'ok' | 'err'>('idle');
  const [copySvgStatus, setCopySvgStatus] = useState<'idle' | 'ok' | 'err'>('idle');

  const diffImage = sourceImage && resultRasterized
    ? createSimpleDiff(sourceImage, resultRasterized)
    : null;

  async function copyVectorized() {
    if (!resultSvg || !sourceImage) return;
    try {
      const blob = await svgToPngBlob(resultSvg, sourceImage.width, sourceImage.height);
      // Clipboard API requires a user gesture, which a button click is.
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob }),
      ]);
      setCopyStatus('ok');
      setTimeout(() => setCopyStatus('idle'), 1500);
    } catch {
      setCopyStatus('err');
      setTimeout(() => setCopyStatus('idle'), 2000);
    }
  }

  async function copySvgSource() {
    if (!resultSvg) return;
    try {
      await navigator.clipboard.writeText(resultSvg);
      setCopySvgStatus('ok');
      setTimeout(() => setCopySvgStatus('idle'), 1500);
    } catch {
      setCopySvgStatus('err');
      setTimeout(() => setCopySvgStatus('idle'), 2000);
    }
  }

  const vectorizedActions = resultSvg && (
    <div className="panel-actions">
      <div className="zoom-control" title="Zoom the vectorized view">
        <label>Zoom</label>
        <input
          type="range"
          min={1}
          max={8}
          step={0.25}
          value={zoom}
          onChange={(e) => setZoom(parseFloat(e.target.value))}
        />
        <span className="zoom-value">{zoom.toFixed(1)}×</span>
        {zoom > 1 && (
          <button className="zoom-reset" onClick={() => setZoom(1)} title="Reset zoom">
            reset
          </button>
        )}
      </div>
      <button
        className={`copy-button ${copyStatus}`}
        onClick={copyVectorized}
        title="Copy vectorized image to clipboard as PNG (also try right-click → Copy Image)"
      >
        {copyStatus === 'ok' ? 'Copied ✓' : copyStatus === 'err' ? 'Failed' : 'Copy PNG'}
      </button>
      <button
        className={`copy-button ${copySvgStatus}`}
        onClick={copySvgSource}
        title="Copy the raw SVG source to clipboard — paste into Figma, CodePen, etc."
      >
        {copySvgStatus === 'ok' ? 'Copied ✓' : copySvgStatus === 'err' ? 'Failed' : 'Copy SVG'}
      </button>
    </div>
  );

  if (diffMode === 'slider') {
    return (
      <div className="comparison-view mode-slider">
        <BeforeAfterSlider
          sourceImage={sourceImage}
          resultSvg={resultSvg}
          resultRasterized={resultRasterized}
        />
      </div>
    );
  }

  return (
    <div className={`comparison-view mode-${diffMode}`}>
      <ImagePanel
        title="Original"
        imageData={sourceImage}
      />
      <ImagePanel
        title="Vectorized"
        imageData={resultRasterized}
        svgContent={resultSvg}
        showSvg={true}
        actions={vectorizedActions}
        zoom={zoom}
      />
      <ImagePanel
        title="Difference"
        imageData={diffImage}
      />
    </div>
  );
}

/** Rasterize an SVG string to a PNG Blob for clipboard. */
function svgToPngBlob(svg: string, width: number, height: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error('canvas 2d unavailable'));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      canvas.toBlob((b) => {
        if (b) resolve(b);
        else reject(new Error('toBlob returned null'));
      }, 'image/png');
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('svg image load failed'));
    };
    img.src = url;
  });
}

// Simple diff visualization
function createSimpleDiff(img1: ImageData, img2: ImageData): ImageData | null {
  if (img1.width !== img2.width || img1.height !== img2.height) {
    return null;
  }

  const diff = new ImageData(img1.width, img1.height);
  const tolerance = 10;

  for (let i = 0; i < img1.data.length; i += 4) {
    const r1 = img1.data[i]!;
    const g1 = img1.data[i + 1]!;
    const b1 = img1.data[i + 2]!;
    const r2 = img2.data[i]!;
    const g2 = img2.data[i + 1]!;
    const b2 = img2.data[i + 2]!;

    const matches =
      Math.abs(r1 - r2) <= tolerance &&
      Math.abs(g1 - g2) <= tolerance &&
      Math.abs(b1 - b2) <= tolerance;

    if (matches) {
      diff.data[i] = 50;
      diff.data[i + 1] = 100;
      diff.data[i + 2] = 50;
      diff.data[i + 3] = 255;
    } else {
      diff.data[i] = 255;
      diff.data[i + 1] = 50;
      diff.data[i + 2] = 50;
      diff.data[i + 3] = 255;
    }
  }

  return diff;
}
