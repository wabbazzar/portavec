/**
 * Pipeline Web Worker.
 *
 * Moves the heavy vectorization work (quantize → contour → curve-fit →
 * SVG) off the main thread so the UI stays responsive during long runs
 * (e.g. forest_cat at 512×512 is ~8-15s).
 *
 * Protocol:
 *   main → worker:  { id, kind: 'multi'|'single', image: { data, w, h }, opts }
 *   worker → main:  { id, kind: 'done', svg, pathCount, nodeCount, ms,
 *                     rasterized?: { data, w, h } }
 *                   { id, kind: 'error', message }
 *
 * ImageData pixel buffers are transferred (not copied) — caller detaches
 * the source buffer, worker detaches the rasterized one on return.
 */

import {
  runMultiColorPipeline,
  multicolorToImageData,
  type MultiColorOptions,
} from '../algorithms/pipeline-multicolor';
import { runPipeline, type PipelineOptions } from '../algorithms/pipeline';

export interface WorkerRequestMulti {
  id: number;
  kind: 'multi';
  image: { data: Uint8ClampedArray; w: number; h: number };
  opts: Partial<MultiColorOptions>;
}
export interface WorkerRequestSingle {
  id: number;
  kind: 'single';
  image: { data: Uint8ClampedArray; w: number; h: number };
  opts: Partial<PipelineOptions>;
}
export type WorkerRequest = WorkerRequestMulti | WorkerRequestSingle;

export interface WorkerDone {
  id: number;
  kind: 'done';
  svg: string;
  pathCount: number;
  nodeCount: number;
  ms: number;
  /** Present for multi-color; single-color rasterizes in the main thread. */
  rasterized?: { data: Uint8ClampedArray; w: number; h: number };
}
export interface WorkerError {
  id: number;
  kind: 'error';
  message: string;
}
export type WorkerResponse = WorkerDone | WorkerError;

function toImageData(img: { data: Uint8ClampedArray; w: number; h: number }): ImageData {
  return {
    data: img.data,
    width: img.w,
    height: img.h,
    colorSpace: 'srgb',
  } as ImageData;
}

self.addEventListener('message', (e: MessageEvent<WorkerRequest>) => {
  const req = e.data;
  try {
    const img = toImageData(req.image);
    const t0 = performance.now();
    if (req.kind === 'multi') {
      const result = runMultiColorPipeline(img, req.opts);
      const ms = performance.now() - t0;
      const rasterized = multicolorToImageData(result);
      const pathCount = result.layers.reduce((n, l) => n + l.pathData.length, 0);
      const out: WorkerDone = {
        id: req.id,
        kind: 'done',
        svg: result.svg,
        pathCount,
        nodeCount: pathCount,
        ms,
        rasterized: { data: rasterized.data, w: rasterized.width, h: rasterized.height },
      };
      (self as unknown as Worker).postMessage(out, [rasterized.data.buffer]);
    } else {
      const result = runPipeline(img, req.opts);
      const ms = performance.now() - t0;
      const out: WorkerDone = {
        id: req.id,
        kind: 'done',
        svg: result.svg,
        pathCount: result.metrics.totalContours,
        nodeCount: result.metrics.totalSegments,
        ms,
      };
      (self as unknown as Worker).postMessage(out);
    }
  } catch (err) {
    const out: WorkerError = {
      id: req.id,
      kind: 'error',
      message: err instanceof Error ? err.message : String(err),
    };
    (self as unknown as Worker).postMessage(out);
  }
});
