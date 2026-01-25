import { useEffect, useRef } from 'react';
import { useAppState } from './context/AppContext';
import './ComparisonView.css';

interface ImagePanelProps {
  title: string;
  imageData: ImageData | null;
  svgContent?: string | null;
  showSvg?: boolean;
}

function ImagePanel({ title, imageData, svgContent, showSvg }: ImagePanelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

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

  const renderContent = () => {
    if (showSvg && svgContent) {
      return (
        <div
          className="svg-container"
          dangerouslySetInnerHTML={{ __html: svgContent }}
        />
      );
    }
    if (imageData) {
      return <canvas ref={canvasRef} className="image-canvas" />;
    }
    return (
      <div className="panel-placeholder">
        <span>No image</span>
      </div>
    );
  };

  return (
    <div className="image-panel">
      <div className="panel-header">
        <span className="panel-title">{title}</span>
        {imageData && (
          <span className="panel-dimensions">
            {imageData.width} x {imageData.height}
          </span>
        )}
      </div>
      <div className="panel-content">
        {renderContent()}
      </div>
    </div>
  );
}

export function ComparisonView() {
  const { sourceImage, resultSvg, resultRasterized, diffMode } = useAppState();

  // Create diff visualization if we have both images
  const diffImage = sourceImage && resultRasterized
    ? createSimpleDiff(sourceImage, resultRasterized)
    : null;

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
      />
      <ImagePanel
        title="Difference"
        imageData={diffImage}
      />
    </div>
  );
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
      // Dim green for matching
      diff.data[i] = 50;
      diff.data[i + 1] = 100;
      diff.data[i + 2] = 50;
      diff.data[i + 3] = 255;
    } else {
      // Bright red for differences
      diff.data[i] = 255;
      diff.data[i + 1] = 50;
      diff.data[i + 2] = 50;
      diff.data[i + 3] = 255;
    }
  }

  return diff;
}
