import { useEffect, useState } from 'react';
import { useAppState, useAppDispatch } from './context/AppContext';
import { ImageLoader } from './ImageLoader';
import { BenchmarkGallery } from './BenchmarkGallery';
import './BenchmarkGallery.css';
import { ComparisonView } from './ComparisonView';
import { MetricsPanel } from './MetricsPanel';
import { ParameterControls } from './ParameterControls';
import { DiffOverlay } from './DiffOverlay';
import { AboutPage } from './AboutPage';
import { LandingHero } from './LandingHero';
import { PaletteStrip } from './PaletteStrip';
import { parseUrlState, replaceUrlState } from './url-state';
import { loadImageFromUrl } from '../utils/image';
import { downloadSvg } from '../utils/image';
import { renderSvgToImageData } from '../algorithms/pipeline';
import { runMultiInWorker, runSingleInWorker, cancelPipeline } from '../workers/pipeline-client';
import { imageToAscii, type AsciiGrid } from '../algorithms/ascii';
import { calculateSSIM, calculatePixelDiff } from '../utils/metrics';
import type { ThresholdMethod } from '../algorithms/threshold';
import './App.css';

type Route = 'demo' | 'about' | 'notfound';

function resolveRoute(): Route {
  if (typeof window === 'undefined') return 'demo';
  const h = window.location.hash;
  if (!h || h === '#' || h === '#/') return 'demo';
  if (h === '#/about') return 'about';
  return 'notfound';
}

function App() {
  const { sourceImage, sourceFileName, resultSvg, isProcessing, error, parameters } = useAppState();
  const dispatch = useAppDispatch();
  const [asciiResult, setAsciiResult] = useState<AsciiGrid | null>(null);
  const [asciiVisible, setAsciiVisible] = useState(true);
  const [route, setRoute] = useState<Route>(resolveRoute);

  useEffect(() => {
    const onHash = () => setRoute(resolveRoute());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // Deep-link: on first mount, if ?image=<name> is in the URL, load it
  // from the training corpus. If URL also carries params (k=..&sw=..),
  // they override the tuning manifest; otherwise the tuned config is
  // applied as if the user had clicked the gallery tile.
  useEffect(() => {
    if (sourceImage) return;
    const state = parseUrlState();
    if (!state.image) return;
    const name = state.image;
    const base = import.meta.env.BASE_URL;
    (async () => {
      try {
        const image = await loadImageFromUrl(`${base}training/${name}.png`);
        dispatch({
          type: 'SET_SOURCE_IMAGE',
          payload: { image, fileName: `${name}.png`, sourceType: 'benchmark' },
        });
        if (Object.keys(state.params).length > 0) {
          // URL params take precedence.
          dispatch({ type: 'SET_PARAMETERS', payload: { ...state.params, tuned: false } });
        } else {
          // No URL params — try the tuning manifest.
          try {
            const mRes = await fetch(`${base}training/tuning-manifest.json`);
            if (mRes.ok) {
              const m: { entries?: Record<string, { best: { config: { k?: number; saliencyWeight: number; salientSeedBudget: number; mergeThreshold: number } } }> } = await mRes.json();
              const cfg = m.entries?.[name]?.best.config;
              if (cfg) {
                dispatch({
                  type: 'SET_PARAMETERS',
                  payload: {
                    colors: cfg.k ?? 0,
                    saliencyWeight: cfg.saliencyWeight,
                    salientSeedBudget: cfg.salientSeedBudget,
                    mergeThreshold: cfg.mergeThreshold,
                    tuned: true,
                  },
                });
              }
            }
          } catch { /* silent — no manifest is fine */ }
        }
      } catch {
        // Invalid image name, land on the normal demo.
      }
    })();
    // Only run once on initial mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep URL in sync with live params (debounced).
  useEffect(() => {
    if (!sourceFileName) return;
    const t = setTimeout(() => {
      const name = sourceFileName.replace(/\.[^.]+$/, '');
      // Only include params that differ from the "clean" state so the
      // URL stays short when the user hasn't customized.
      replaceUrlState({
        image: name,
        params: parameters.tuned
          ? {}
          : {
              colors: parameters.colors,
              saliencyWeight: parameters.saliencyWeight,
              salientSeedBudget: parameters.salientSeedBudget,
              mergeThreshold: parameters.mergeThreshold,
            },
      });
    }, 300);
    return () => clearTimeout(t);
  }, [sourceFileName, parameters]);

  const goHome = () => {
    history.pushState('', document.title, window.location.pathname + window.location.search);
    setRoute('demo');
  };

  if (route === 'about') {
    return <AboutPage onBack={goHome} />;
  }
  if (route === 'notfound') {
    return (
      <div className="notfound-page">
        <div className="notfound-inner">
          <div className="notfound-eyebrow">404</div>
          <h1 className="notfound-title">That page isn't here.</h1>
          <p className="notfound-sub">
            You might have followed a broken link. The demo and the About page are where we live.
          </p>
          <div className="notfound-ctas">
            <button className="notfound-cta primary" onClick={goHome}>
              ← Demo
            </button>
            <a
              className="notfound-cta secondary"
              href="#/about"
              onClick={(e) => { e.preventDefault(); window.location.hash = '#/about'; }}
            >
              About
            </a>
          </div>
        </div>
      </div>
    );
  }

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
        const result = await runMultiInWorker(sourceImage, {
          k: parameters.colors === 0 ? undefined : parameters.colors,
          curveTolerance: parameters.curveTolerance,
          minContourLength: parameters.minPathLength,
          saliencyWeight: parameters.saliencyWeight,
          salientSeedBudget: parameters.salientSeedBudget,
          mergeThreshold: parameters.mergeThreshold,
        });
        svg = result.svg;
        pathCount = result.pathCount;
        nodeCount = result.nodeCount;
        processingTimeMs = result.processingTimeMs;
        rasterized = result.rasterized;
      } else {
        const thresholdMethod: ThresholdMethod =
          parameters.threshold >= 100 && parameters.threshold <= 150 ? 'otsu' : 'manual';
        const result = await runSingleInWorker(sourceImage, {
          thresholdMethod,
          manualThreshold: parameters.threshold,
          curveTolerance: parameters.curveTolerance,
          minContourLength: parameters.minPathLength,
        });
        svg = result.svg;
        pathCount = result.pathCount;
        nodeCount = result.nodeCount;
        processingTimeMs = result.processingTimeMs;
        // Single-color rasterization uses a DOM Canvas; can't run in worker.
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
      const message = err instanceof Error ? err.message : 'Vectorization failed';
      // 'cancelled' is a user action, not a failure — swallow silently.
      if (message === 'cancelled') {
        dispatch({ type: 'SET_PROCESSING', payload: false });
      } else {
        dispatch({ type: 'SET_ERROR', payload: message });
      }
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
          <a
            className="header-link"
            href="#/about"
            onClick={(e) => {
              e.preventDefault();
              window.location.hash = '#/about';
            }}
          >
            About
          </a>
          <a
            className="header-link"
            href="https://github.com/wabbazzar/portavec"
            target="_blank"
            rel="noreferrer"
          >
            GitHub ↗
          </a>
          {sourceImage && (
            <>
              {isProcessing ? (
                <button
                  className="secondary vectorize-btn cancel-btn"
                  onClick={() => {
                    cancelPipeline();
                    dispatch({ type: 'SET_PROCESSING', payload: false });
                  }}
                  aria-label="Cancel vectorization"
                >
                  <span className="btn-spinner" aria-hidden />
                  <span className="btn-label">Cancel</span>
                </button>
              ) : (
                <button
                  className="primary vectorize-btn"
                  onClick={handleVectorize}
                  aria-label="Vectorize"
                >
                  <span className="btn-label">Vectorize</span>
                </button>
              )}
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

      <main className={`app-main${isProcessing ? ' processing' : ''}`}>
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
            <LandingHero />
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
            <PaletteStrip svg={resultSvg} />
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

      {sourceImage && (
        <footer className="app-footer">
          <MetricsPanel />
          <ParameterControls />
        </footer>
      )}

      <div className="app-credit">
        <span>
          Built by{' '}
          <a href="https://wabbazzar.com" target="_blank" rel="noreferrer">
            Wesley Beckner
          </a>
        </span>
        <span className="credit-dot">·</span>
        <a href="#/about" onClick={(e) => { e.preventDefault(); window.location.hash = '#/about'; }}>
          How it works
        </a>
        <span className="credit-dot">·</span>
        <a href="https://github.com/wabbazzar/portavec" target="_blank" rel="noreferrer">
          Source
        </a>
      </div>
    </div>
  );
}

export default App;
