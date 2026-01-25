export interface Metrics {
  ssim: number | null;
  pixelDiff: number | null;
  pathCount: number | null;
  nodeCount: number | null;
  processingTimeMs: number | null;
  memorySizeBytes: number | null;
}

export interface Parameters {
  threshold: number;       // 0-255
  curveTolerance: number;  // 0.1-10.0
  minPathLength: number;   // 1-100 pixels
}

export type DiffMode = 'side-by-side' | 'onion' | 'difference' | 'toggle';
export type SourceType = 'file' | 'benchmark';

export interface AppState {
  // Input
  sourceImage: ImageData | null;
  sourceType: SourceType;
  sourceFileName: string | null;

  // Output
  resultSvg: string | null;
  resultRasterized: ImageData | null;

  // Metrics
  metrics: Metrics;

  // Parameters
  parameters: Parameters;

  // UI state
  diffMode: DiffMode;
  isProcessing: boolean;
  error: string | null;
}

export const initialState: AppState = {
  sourceImage: null,
  sourceType: 'file',
  sourceFileName: null,

  resultSvg: null,
  resultRasterized: null,

  metrics: {
    ssim: null,
    pixelDiff: null,
    pathCount: null,
    nodeCount: null,
    processingTimeMs: null,
    memorySizeBytes: null,
  },

  parameters: {
    threshold: 128,
    curveTolerance: 2.0,
    minPathLength: 10,
  },

  diffMode: 'side-by-side',
  isProcessing: false,
  error: null,
};

export type AppAction =
  | { type: 'SET_SOURCE_IMAGE'; payload: { image: ImageData; fileName: string; sourceType: SourceType } }
  | { type: 'CLEAR_SOURCE' }
  | { type: 'SET_RESULT'; payload: { svg: string; rasterized: ImageData; metrics: Partial<Metrics> } }
  | { type: 'SET_METRICS'; payload: Partial<Metrics> }
  | { type: 'SET_PARAMETER'; payload: { key: keyof Parameters; value: number } }
  | { type: 'SET_DIFF_MODE'; payload: DiffMode }
  | { type: 'SET_PROCESSING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null };

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_SOURCE_IMAGE':
      return {
        ...state,
        sourceImage: action.payload.image,
        sourceFileName: action.payload.fileName,
        sourceType: action.payload.sourceType,
        resultSvg: null,
        resultRasterized: null,
        metrics: initialState.metrics,
        error: null,
      };

    case 'CLEAR_SOURCE':
      return {
        ...state,
        sourceImage: null,
        sourceFileName: null,
        resultSvg: null,
        resultRasterized: null,
        metrics: initialState.metrics,
        error: null,
      };

    case 'SET_RESULT':
      return {
        ...state,
        resultSvg: action.payload.svg,
        resultRasterized: action.payload.rasterized,
        metrics: { ...state.metrics, ...action.payload.metrics },
        isProcessing: false,
      };

    case 'SET_METRICS':
      return {
        ...state,
        metrics: { ...state.metrics, ...action.payload },
      };

    case 'SET_PARAMETER':
      return {
        ...state,
        parameters: {
          ...state.parameters,
          [action.payload.key]: action.payload.value,
        },
      };

    case 'SET_DIFF_MODE':
      return {
        ...state,
        diffMode: action.payload,
      };

    case 'SET_PROCESSING':
      return {
        ...state,
        isProcessing: action.payload,
        error: action.payload ? null : state.error,
      };

    case 'SET_ERROR':
      return {
        ...state,
        error: action.payload,
        isProcessing: false,
      };

    default:
      return state;
  }
}
