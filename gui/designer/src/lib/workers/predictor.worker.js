/**
 * predictor.worker.js — Sprint v0.7.2 perf K1.
 *
 * Off-main-thread executor for Annotator predictor plugins
 * (common-features L1, structural detectors L2: orf-scan / sigma70
 * / stem-loop / sgrna-scaffold). Imports the annotator-plugins
 * registry under the worker's own module scope; plugins register
 * themselves on import (DEC-ANN-08), then `getPluginById` looks
 * them up at run time.
 *
 * Why a worker: L1 common-features-homology runs auto on Annotator
 * open. On 5-10 kb plasmids the synchronous scan takes 200-500 ms
 * which freezes the main thread for the duration of one frame
 * paint cycle plus the React tree's first commit. Biolog 06.05.2026:
 * «между переключением между сиквенсом и аннотатором секунда
 * ожидания — оно должно быстрее мысли переключаться». Moving the
 * scan into a Worker lets React paint the Annotator shell, the
 * progress bar, and the «Просмотр» tab body without contention;
 * the heavy CPU happens in parallel and posts back when ready.
 *
 * Protocol (single round-trip):
 *   main → worker: { id, type: 'run', pluginId, sequence, region, options }
 *   worker → main: { id, result }   on success
 *                  { id, error }    on plugin throw
 *
 * `id` is an opaque correlation token chosen by the client; the
 * worker echoes it back. `error` is a string. Plugins runnable
 * here MUST NOT touch DOM/window — only `requiresNetwork: false &&
 * requiresBackend: false` plugins are routed through the worker
 * client. BLAST stub stays on the main thread (it's the only one
 * with `requiresNetwork: true`, and a worker context's fetch
 * policies differ from the page's).
 */

// Side-effect import populates the registry inside the worker.
import './../annotator-plugins/index.js';
import { getPluginById } from './../annotator-plugins/registry.js';

self.addEventListener('message', async (event) => {
  const data = event.data || {};
  const { id, type, pluginId, sequence, region, options } = data;
  if (type !== 'run' || !id) return;
  const plugin = getPluginById(pluginId);
  if (!plugin || typeof plugin.run !== 'function') {
    self.postMessage({ id, error: `plugin "${pluginId}" not registered in worker` });
    return;
  }
  try {
    const result = await plugin.run(sequence || '', region || null, options || {});
    self.postMessage({ id, result });
  } catch (err) {
    const message = (err && err.message) ? err.message : String(err);
    self.postMessage({ id, error: message });
  }
});
