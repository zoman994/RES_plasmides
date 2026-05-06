/**
 * annotator-pipeline.js — Sprint M-X.2 K7 orchestrator.
 *
 *   runAnnotatorPipeline(sequence, region | null, enabledPluginIds, options)
 *     → Promise<{
 *         results: Record<pluginId, AnnotatorResult>,
 *         errors:  Record<pluginId, string>,
 *       }>
 *
 *   - Pulls all registered plugins via `getAllPlugins()`.
 *   - Filters by `enabledPluginIds` (record-style {id: true}).
 *   - Runs them in parallel via `Promise.allSettled`.
 *   - Returns BOTH a results map (success branch) and an errors
 *     map (rejected branch) so the UI can show partial results
 *     without a single-plugin failure cascading.
 *
 * `options.onPluginStart(id)` / `options.onPluginEnd(id, result|err)`
 * — optional callbacks the UI uses to flip a per-plugin spinner.
 */

import { getAllPlugins } from './annotator-plugins/registry.js';
import { runPluginInWorker } from './annotator-worker-client.js';

// Plugins routed through the predictor Worker. Network/backend
// plugins (BLAST stub) stay on the main thread — Worker fetch
// policies differ from the page's, and they're not the long-task
// offenders. Pure-CPU detectors (L1 common-features-homology + L2
// structural orf-scan / sigma70 / stem-loop / sgrna-scaffold) are
// the freeze source we're targeting (06.05.2026 biolog: «между
// переключением между сиквенсом и аннотатором секунда ожидания»).
function shouldRunInWorker(plugin) {
  const cap = plugin && plugin.capabilities;
  if (!cap) return false;
  if (cap.requiresNetwork === true) return false;
  if (cap.requiresBackend === true) return false;
  return true;
}

export async function runAnnotatorPipeline(sequence, region, enabledPluginIds, options = {}) {
  const enabled = enabledPluginIds || {};
  const all = getAllPlugins();
  const targets = all.filter((p) => enabled[p.id] === true);

  const onStart = typeof options.onPluginStart === 'function' ? options.onPluginStart : null;
  const onEnd = typeof options.onPluginEnd === 'function' ? options.onPluginEnd : null;
  const sharedOptions = { ...options };
  delete sharedOptions.onPluginStart;
  delete sharedOptions.onPluginEnd;

  const promises = targets.map(async (p) => {
    if (onStart) {
      try { onStart(p.id); } catch { /* swallow callback throws */ }
    }
    try {
      let res;
      // Try Worker first for CPU-only plugins. `runPluginInWorker`
      // returns null when the Worker can't be constructed (vitest's
      // happy-dom stub, SSR, very old browsers) — fall back to
      // synchronous main-thread run, preserving every existing test
      // contract.
      if (shouldRunInWorker(p)) {
        const workerPromise = runPluginInWorker(p.id, sequence, region || null, sharedOptions);
        if (workerPromise) {
          try {
            res = await workerPromise;
          } catch {
            // Worker crashed mid-run — recover on the main thread so
            // a one-off worker failure doesn't surface as a plugin
            // error to the UI.
            res = await p.run(sequence, region || null, sharedOptions);
          }
        } else {
          res = await p.run(sequence, region || null, sharedOptions);
        }
      } else {
        res = await p.run(sequence, region || null, sharedOptions);
      }
      if (onEnd) {
        try { onEnd(p.id, res); } catch { /* noop */ }
      }
      return { id: p.id, result: res };
    } catch (err) {
      const message = err && err.message ? err.message : String(err);
      if (onEnd) {
        try { onEnd(p.id, null, message); } catch { /* noop */ }
      }
      throw new PluginError(p.id, message);
    }
  });

  const settled = await Promise.allSettled(promises);
  const results = {};
  const errors = {};
  for (const s of settled) {
    if (s.status === 'fulfilled') {
      results[s.value.id] = s.value.result;
    } else {
      const reason = s.reason;
      if (reason instanceof PluginError) {
        errors[reason.pluginId] = reason.message;
      }
    }
  }
  return { results, errors };
}

class PluginError extends Error {
  constructor(pluginId, message) {
    super(message);
    this.pluginId = pluginId;
  }
}
