/**
 * Main-thread client for the pipeline Web Worker.
 *
 *   import { runMultiInWorker, runSingleInWorker } from '../workers/pipeline-client';
 *   const result = await runMultiInWorker(sourceImage, opts);
 *
 * Maintains a single lazily-constructed worker; correlates responses by
 * incrementing request id. Transfers pixel buffers to/from the worker
 * so there is no per-call copy of the image data.
 *
 * Note: the source ImageData's `data.buffer` is detached after sending;
 * callers must not reuse the ImageData after calling. If that's a
 * concern, clone first.
 */

import type { MultiColorOptions } from '../algorithms/pipeline-multicolor';
import type { PipelineOptions } from '../algorithms/pipeline';
import type {
  WorkerRequest,
  WorkerResponse,
  WorkerDone,
} from './pipeline.worker';

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, {
  resolve: (r: WorkerDone) => void;
  reject: (e: Error) => void;
}>();

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('./pipeline.worker.ts', import.meta.url), {
    type: 'module',
  });
  worker.addEventListener('message', (e: MessageEvent<WorkerResponse>) => {
    const msg = e.data;
    const p = pending.get(msg.id);
    if (!p) return;
    pending.delete(msg.id);
    if (msg.kind === 'done') p.resolve(msg);
    else p.reject(new Error(msg.message));
  });
  worker.addEventListener('error', (e) => {
    // Fatal worker error — fail all in-flight requests.
    for (const p of pending.values()) p.reject(new Error(e.message || 'worker error'));
    pending.clear();
  });
  return worker;
}

/**
 * Kill any in-flight pipeline. Terminates the worker (the only reliable
 * way to interrupt a long-running synchronous pipeline in JS), rejects
 * every pending promise with a "cancelled" error, and lets the next
 * call lazily respawn. Safe to call when nothing is running.
 */
export function cancelPipeline(): void {
  if (worker) {
    worker.terminate();
    worker = null;
  }
  for (const p of pending.values()) p.reject(new Error('cancelled'));
  pending.clear();
}

function toImage(image: ImageData): { data: Uint8ClampedArray; w: number; h: number } {
  // Clone the buffer so the caller's ImageData stays usable after transfer.
  // Cost is a memcpy of the pixels (~1MB for 512×512), well under the
  // time saved by moving the pipeline off the main thread.
  const data = new Uint8ClampedArray(image.data);
  return { data, w: image.width, h: image.height };
}

function fromImage(img: { data: Uint8ClampedArray; w: number; h: number }): ImageData {
  return { data: img.data, width: img.w, height: img.h, colorSpace: 'srgb' } as ImageData;
}

function send(req: WorkerRequest, transfers: ArrayBuffer[]): Promise<WorkerDone> {
  return new Promise((resolve, reject) => {
    pending.set(req.id, { resolve, reject });
    getWorker().postMessage(req, transfers);
  });
}

export interface MultiResult {
  svg: string;
  pathCount: number;
  nodeCount: number;
  processingTimeMs: number;
  rasterized: ImageData;
}

export async function runMultiInWorker(
  sourceImage: ImageData,
  opts: Partial<MultiColorOptions>,
): Promise<MultiResult> {
  const id = nextId++;
  const image = toImage(sourceImage);
  const done = await send(
    { id, kind: 'multi', image, opts },
    [image.data.buffer],
  );
  return {
    svg: done.svg,
    pathCount: done.pathCount,
    nodeCount: done.nodeCount,
    processingTimeMs: done.ms,
    rasterized: fromImage(done.rasterized!),
  };
}

export interface SingleResult {
  svg: string;
  pathCount: number;
  nodeCount: number;
  processingTimeMs: number;
}

export async function runSingleInWorker(
  sourceImage: ImageData,
  opts: Partial<PipelineOptions>,
): Promise<SingleResult> {
  const id = nextId++;
  const image = toImage(sourceImage);
  const done = await send(
    { id, kind: 'single', image, opts },
    [image.data.buffer],
  );
  return {
    svg: done.svg,
    pathCount: done.pathCount,
    nodeCount: done.nodeCount,
    processingTimeMs: done.ms,
  };
}
