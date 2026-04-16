import { useAppState, useAppDispatch } from './context/AppContext';
import { Parameters } from './context/reducer';
import './ParameterControls.css';

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  displayValue?: string;
}

function Slider({ label, value, min, max, step, onChange, displayValue }: SliderProps) {
  return (
    <div className="slider-control">
      <div className="slider-header">
        <span className="slider-label">{label}</span>
        <span className="slider-value">{displayValue ?? value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="slider-input"
      />
    </div>
  );
}

export function ParameterControls() {
  const { parameters } = useAppState();
  const dispatch = useAppDispatch();

  const updateParameter = (key: keyof Parameters, value: number) => {
    dispatch({
      type: 'SET_PARAMETER',
      payload: { key, value },
    });
  };

  return (
    <div className="parameter-controls">
      <div className="controls-header">
        <span className="controls-title">Parameters</span>
      </div>
      <div className="controls-grid">
        <Slider
          label="Threshold"
          value={parameters.threshold}
          min={0}
          max={255}
          step={1}
          onChange={(v) => updateParameter('threshold', v)}
        />
        <Slider
          label="Curve Tolerance"
          value={parameters.curveTolerance}
          min={0.1}
          max={10}
          step={0.1}
          onChange={(v) => updateParameter('curveTolerance', v)}
          displayValue={parameters.curveTolerance.toFixed(1)}
        />
        <Slider
          label="Min Path Length"
          value={parameters.minPathLength}
          min={1}
          max={100}
          step={1}
          onChange={(v) => updateParameter('minPathLength', v)}
          displayValue={`${parameters.minPathLength}px`}
        />
        <Slider
          label="Colors"
          value={parameters.colors}
          min={0}
          max={16}
          step={1}
          onChange={(v) => updateParameter('colors', v)}
          displayValue={parameters.colors === 0 ? 'auto' : String(parameters.colors)}
        />
      </div>
    </div>
  );
}
