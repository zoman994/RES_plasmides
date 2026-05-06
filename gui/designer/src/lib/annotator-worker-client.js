/**
 * annotator-worker-client.js — Sprint v0.7.2 perf K1.
 *
 * Lazy singleton wrapper around `lib/workers/predictor.worker.js`.
 * Used by `annotator-pipeline.js` to ship CPU-bound plugins off the
 * main thread; falls back to a synchronous in-page run when the
 * Worker constructor is unavailable (vitest's happy-dom, SSR, very
 * old browsers).
 *
 *   runPluginInWorker(pluginId, sequence, region, options)
 *     → Promise<result>   when the worker is up
 *     → null              when the worker can't be constructed
 *
 * The pipeline checks for `null` and falls back to `plugin.run` on
 * the main thread, preserving the existing test contract. No tests
 * had to be retrofitted.
 *
 * Why a singleton: spinning up a Worker costs ~5-15 ms (module
 * graph eval inside the worker scope). Doing it once at first
 * call amortises across the user's whole session. We never
 * terminate it explicitly — the browser cleans it up when the tab
 * closes. Cancellation lives at the message level: pending promises
 * are rejected if `onerror` fires, and the next message goes to a
 * fresh worker.
 *
 * Vitest: we early-return `null` whenever `import.meta.env?.VITEST`
 * is truthy, so the worker module is never instantiated under
 * happy-dom (which has a Worker stub that constructs successfully
 * but never delivers messages, hanging tests forever).
 */

let _worker = null;
let _seq = 0;
const _pending = new Map();
let _disabled = false;

function isWorkerCapable() {
  if (_disabled) return false;
  if (typeof Worker === 'undefined') return false;
  // Skip workers under vitest — happy-dom has a non-functional stub
  // that would hang every test that touches the pipeline.
  try {
    if (import.meta && import.meta.env && import.meta.env.VITEST) return false;
  } catch { /* import.meta.env not available — assume runtime */ }
  return true;
}

function bootWorker() {
  if (_worker) return _worker;
  if (!isWorkerCapable()) return null;
  try {
    _worker = new Worker(
      new URL('./workers/predictor.worker.js', import.meta.url),
      { type: 'module' },
    );
  } catch {
    _disabled = true;
    _worker = null;
    return null;
  }
  _worker.addEventListener('message', (e) => {
    const { id, result, error } = e.data || {};
    const slot = _pending.get(id);
    if (!slot) return;
    _pending.delete(id);
    if (typeof error === 'string') slot.reject(new Error(error));
    else slot.resolve(result);
  });
  _worker.addEventListener('error', () => {
    // Worker crashed — reject all in-flight, force a rebuild on the
    // next call. Caller will see a rejection and fall back to the
    // main-thread plugin.run path.
    for (const slot of _pending.values()) slot.reject(new Error('predictor worker crashed'));
    _pending.clear();
    try { _worker.terminate(); } catch { /* noop */ }
    _worker = null;
  });
  return _worker;
}

export function runPluginInWorker(pluginId, sequence, region, options) {
  const w = bootWorker();
  if (!w) return null;
  const id = ++_seq;
  return new Promise((resolve, reject) => {
    _pending.set(id, { resolve, reject });
    try {
      w.postMessage({ id, type: 'run', pluginId, sequence, region: region || null, options: options || {} });
    } catch (err) {
      _pending.delete(id);
      reject(err);
    }
  });
}

/** Test-only: drop the singleton + pending map. */
export function _resetAnnotatorWorker() {
  if (_worker) {
    try { _worker.terminate(); } catch { /* noop */ }
  }
  _worker = null;
  _pending.clear();
  _seq = 0;
  _disabled = false;
}
