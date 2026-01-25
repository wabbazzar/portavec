import { useAppState } from './context/AppContext';
import './MetricsPanel.css';

interface MetricItemProps {
  label: string;
  value: string | number | null;
  unit?: string;
  highlight?: boolean;
}

function MetricItem({ label, value, unit, highlight }: MetricItemProps) {
  const displayValue = value === null ? '--' : typeof value === 'number' ? value.toFixed(3) : value;

  return (
    <div className={`metric-item ${highlight ? 'highlight' : ''}`}>
      <span className="metric-label">{label}</span>
      <span className="metric-value">
        {displayValue}
        {unit && value !== null && <span className="metric-unit">{unit}</span>}
      </span>
    </div>
  );
}

export function MetricsPanel() {
  const { metrics, isProcessing } = useAppState();

  const formatBytes = (bytes: number | null): string => {
    if (bytes === null) return '--';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  const formatTime = (ms: number | null): string => {
    if (ms === null) return '--';
    if (ms < 1000) return `${ms.toFixed(0)} ms`;
    return `${(ms / 1000).toFixed(2)} s`;
  };

  return (
    <div className={`metrics-panel ${isProcessing ? 'processing' : ''}`}>
      <div className="metrics-header">
        <span className="metrics-title">Metrics</span>
        {isProcessing && <span className="processing-indicator">Processing...</span>}
      </div>
      <div className="metrics-grid">
        <MetricItem
          label="SSIM"
          value={metrics.ssim}
          highlight={metrics.ssim !== null && metrics.ssim >= 0.95}
        />
        <MetricItem
          label="Pixel Diff"
          value={metrics.pixelDiff !== null ? (metrics.pixelDiff * 100).toFixed(1) : null}
          unit="%"
        />
        <MetricItem
          label="Paths"
          value={metrics.pathCount}
        />
        <MetricItem
          label="Nodes"
          value={metrics.nodeCount}
        />
        <MetricItem
          label="Time"
          value={formatTime(metrics.processingTimeMs)}
        />
        <MetricItem
          label="Size"
          value={formatBytes(metrics.memorySizeBytes)}
        />
      </div>
    </div>
  );
}
