import { useState } from 'react';
import { useAppState, useAppDispatch } from './context/AppContext';
import { ImageLoader } from './ImageLoader';
import { BenchmarkGallery } from './BenchmarkGallery';
import './BenchmarkGallery.css';
import { ComparisonView } from './ComparisonView';
import { MetricsPanel } from './MetricsPanel';
import { ParameterControls } from './ParameterControls';
import { DiffOverlay } from './DiffOverlay';
import { downloadSvg } from '../utils/image';
import { runPipeline, renderSvgToImageData } from '../algorithms/pipeline';
import {
  runMultiColorPipeline,
  multicolorToImageData,
} from '../algorithms/pipeline-multicolor';
import { imageToAscii, type AsciiGrid } from '../algorithms/ascii';
import { calculateSSIM, calculatePixelDiff } from '../utils/metrics';
import type { ThresholdMethod } from '../algorithms/threshold';
import './App.css';

function App() {
  const { sourceImage, sourceFileName, resultSvg, isProcessing, error, parameters } = useAppState();
  const dispatch = useAppDispatch();
  const [asciiResult, setAsciiResult] = useState<AsciiGrid | null>(null);
  const [asciiVisible, setAsciiVisible] = useState(true);

  const handleAsciify = () => {
    if (!sourceImage) return;
    const result = imageToAscii(sourceImage, { cols: 80, rows: 40 });
    setAsciiResult({ rows: result.rows, cols: result.cols, lines: result.lines });
    setAsciiVisible(true);
  };

  const handleClear = () => {
    dispatch({ type: 'CLEAR_SOURCE' });
  };

  const handleExportSvg = () => {
    if (resultSvg) {
      const baseName = sourceFileName?.replace(/\.[^.]+$/, '') || 'output';
      downloadSvg(resultSvg, `${baseName}.svg`);
    }
  };

  const handleVectorize = async () => {
    if (!sourceImage) return;
    dispatch({ type: 'SET_PROCESSING', payload: true });

    try {
      const multiColor = parameters.colors !== 1;
      let svg: string;
      let pathCount: number;
      let nodeCount: number;
      let processingTimeMs: number;
      let rasterized: ImageData;

      if (multiColor) {
        const t0 = performance.now();
        const result = runMultiColorPipeline(sourceImage, {
          k: parameters.colors === 0 ? undefined : parameters.colors,
          curveTolerance: parameters.curveTolerance,
          minContourLength: parameters.minPathLength,
          saliencyWeight: parameters.saliencyWeight,
          salientSeedBudget: parameters.salientSeedBudget,
          mergeThreshold: parameters.mergeThreshold,
        });
        processingTimeMs = performance.now() - t0;
        svg = result.svg;
        pathCount = result.layers.reduce((n, l) => n + l.pathData.length, 0);
        nodeCount = pathCount; // no per-segment count from multi-color pipeline
        // Use our own index-based rasterizer rather than a canvas round-trip
        // — avoids SSIM noise from anti-aliasing.
        rasterized = multicolorToImageData(result);
      } else {
        const thresholdMethod: ThresholdMethod =
          parameters.threshold >= 100 && parameters.threshold <= 150 ? 'otsu' : 'manual';
        const result = runPipeline(sourceImage, {
          thresholdMethod,
          manualThreshold: parameters.threshold,
          curveTolerance: parameters.curveTolerance,
          minContourLength: parameters.minPathLength,
        });
        svg = result.svg;
        pathCount = result.metrics.totalContours;
        nodeCount = result.metrics.totalSegments;
        processingTimeMs = result.metrics.processingTimeMs;
        const { width, height } = sourceImage;
        rasterized = await renderSvgToImageData(svg, width, height);
      }

      const ssim = calculateSSIM(sourceImage, rasterized);
      const pixelDiff = calculatePixelDiff(sourceImage, rasterized);

      dispatch({
        type: 'SET_RESULT',
        payload: {
          svg,
          rasterized,
          metrics: {
            ssim,
            pixelDiff,
            pathCount,
            nodeCount,
            processingTimeMs,
            memorySizeBytes: new Blob([svg]).size,
          },
        },
      });
    } catch (err) {
      dispatch({
        type: 'SET_ERROR',
        payload: err instanceof Error ? err.message : 'Vectorization failed',
      });
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-brand">
          <h1 className="header-title">Portavec</h1>
          <span className="header-subtitle">Raster to Vector</span>
        </div>
        <div className="header-actions">
          {sourceImage && (
            <>
              <button className="primary" onClick={handleVectorize} disabled={isProcessing}>
                {isProcessing ? 'Processing...' : 'Vectorize'}
              </button>
              <button className="secondary" onClick={handleAsciify}>
                ASCIIify
              </button>
              {resultSvg && (
                <button className="secondary" onClick={handleExportSvg}>
                  Export SVG
                </button>
              )}
              <button className="secondary" onClick={handleClear}>
                Clear
              </button>
            </>
          )}
        </div>
      </header>

      <main className="app-main">
        {error && (
          <div className="error-banner">
            <span className="error-icon">!</span>
            <span className="error-message">{error}</span>
            <button
              className="error-dismiss"
              onClick={() => dispatch({ type: 'SET_ERROR', payload: null })}
            >
              Dismiss
            </button>
          </div>
        )}

        {!sourceImage ? (
          <div className="landing">
            <div className="upload-section">
              <ImageLoader />
            </div>
            <BenchmarkGallery />
          </div>
        ) : (
          <>
            <div className="toolbar">
              <div className="toolbar-info">
                <span className="file-name">{sourceFileName}</span>
                <span className="file-dimensions">
                  {sourceImage.width} x {sourceImage.height}
                </span>
              </div>
              <DiffOverlay />
            </div>
            <div className="comparison-section">
              <ComparisonView />
            </div>
            {asciiResult && (
              <div
                style={{
                  margin: '16px 0',
                  padding: '16px',
                  background: '#0a0a0a',
                  border: '1px solid #1e2a3a',
                  borderRadius: '6px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: asciiVisible ? '8px' : '0',
                  }}
                >
                  <div
                    style={{
                      color: '#8aa0b4',
                      fontSize: '11px',
                      letterSpacing: '0.12em',
                      textTransform: 'uppercase',
                    }}
                  >
                    ASCII — {asciiResult.cols}×{asciiResult.rows}
                  </div>
                  <button
                    onClick={() => setAsciiVisible((v) => !v)}
                    style={{
                      background: 'transparent',
                      border: '1px solid #1e2a3a',
                      borderRadius: '4px',
                      color: '#8aa0b4',
                      fontSize: '11px',
                      padding: '4px 10px',
                      cursor: 'pointer',
                      letterSpacing: '0.05em',
                    }}
                  >
                    {asciiVisible ? 'Hide' : 'Show'}
                  </button>
                </div>
                {asciiVisible && (
                  <pre
                    style={{
                      fontFamily: 'ui-monospace, Menlo, Consolas, monospace',
                      fontSize: '14px',
                      lineHeight: '14px',
                      color: '#3cff8f',
                      margin: 0,
                      padding: 0,
                      whiteSpace: 'pre',
                      overflow: 'auto',
                      display: 'inline-block',
                    }}
                  >
                    {asciiResult.lines.join('\n')}
                  </pre>
                )}
              </div>
            )}
          </>
        )}
      </main>

      <footer className="app-footer">
        <MetricsPanel />
        <ParameterControls />
      </footer>
    </div>
  );
}

export default App;
