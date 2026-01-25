import { useAppState, useAppDispatch } from './context/AppContext';
import { ImageLoader } from './ImageLoader';
import { ComparisonView } from './ComparisonView';
import { MetricsPanel } from './MetricsPanel';
import { ParameterControls } from './ParameterControls';
import { DiffOverlay } from './DiffOverlay';
import { downloadSvg } from '../utils/image';
import './App.css';

function App() {
  const { sourceImage, sourceFileName, resultSvg, isProcessing, error } = useAppState();
  const dispatch = useAppDispatch();

  const handleClear = () => {
    dispatch({ type: 'CLEAR_SOURCE' });
  };

  const handleExportSvg = () => {
    if (resultSvg) {
      const baseName = sourceFileName?.replace(/\.[^.]+$/, '') || 'output';
      downloadSvg(resultSvg, `${baseName}.svg`);
    }
  };

  const handleVectorize = () => {
    if (!sourceImage) return;
    dispatch({ type: 'SET_PROCESSING', payload: true });

    // Placeholder: actual pipeline will be connected later
    setTimeout(() => {
      dispatch({ type: 'SET_ERROR', payload: 'Vectorization pipeline not yet implemented' });
    }, 500);
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
          <div className="upload-section">
            <ImageLoader />
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
