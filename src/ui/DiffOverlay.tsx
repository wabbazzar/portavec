import { useAppState, useAppDispatch } from './context/AppContext';
import { DiffMode } from './context/reducer';
import './DiffOverlay.css';

const DIFF_MODES: { mode: DiffMode; label: string; icon: string }[] = [
  { mode: 'side-by-side', label: 'Side by Side', icon: '|||' },
  { mode: 'onion', label: 'Onion Skin', icon: '()' },
  { mode: 'difference', label: 'Difference', icon: '+-' },
  { mode: 'toggle', label: 'Toggle', icon: '<>' },
];

export function DiffOverlay() {
  const { diffMode } = useAppState();
  const dispatch = useAppDispatch();

  const setMode = (mode: DiffMode) => {
    dispatch({ type: 'SET_DIFF_MODE', payload: mode });
  };

  return (
    <div className="diff-overlay">
      <span className="diff-label">View Mode:</span>
      <div className="diff-buttons">
        {DIFF_MODES.map(({ mode, label, icon }) => (
          <button
            key={mode}
            className={`diff-button ${diffMode === mode ? 'active' : ''}`}
            onClick={() => setMode(mode)}
            title={label}
          >
            <span className="diff-icon">{icon}</span>
            <span className="diff-text">{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
