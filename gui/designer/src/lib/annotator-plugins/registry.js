/**
 * annotator-plugins/registry.js — Sprint M-X.2 K7 (DEC-ANN-08).
 *
 * Module-load registration + lookup for the Annotator plugin
 * collection. All plugins call `registerPlugin(this)` when their
 * module is imported; the registry stores them in a Map keyed by id.
 *
 *   registerPlugin(plugin)           — idempotent on re-register
 *   getAllPlugins()                  — array, sorted by registration order
 *   getPluginById(id)                — lookup or null
 *   getAvailablePlugins(runtimeCtx)  — filter by plugin.isAvailable(ctx)
 *
 * Risk §9 #7 mitigation: tests that exercise the pipeline must
 * explicitly import the plugin modules (see __tests__/registry.test.js
 * and __tests__/annotator-pipeline.test.js) so the registry is
 * populated even when the application code path doesn't reach them.
 *
 * Plugin shape (informal — no runtime schema check, just doc comment):
 *   {
 *     id: string,
 *     name: string,
 *     shortDescription: string,
 *     capabilities: {
 *       needsRegion: boolean,
 *       fullSequenceOk: boolean,
 *       async: boolean,
 *       requiresNetwork: boolean,
 *       requiresBackend: boolean,
 *       speedHint: 'instant' | 'fast' | 'slow',
 *     },
 *     isAvailable: (runtimeCtx) => boolean,
 *     unavailableReason?: (runtimeCtx) => string | null,
 *     run: (sequence, region | null, options) => Promise<AnnotatorResult>,
 *   }
 */

const _plugins = new Map();
const _registrationOrder = [];

export function registerPlugin(plugin) {
  if (!plugin || typeof plugin !== 'object') return;
  if (typeof plugin.id !== 'string' || !plugin.id) return;
  if (!_plugins.has(plugin.id)) _registrationOrder.push(plugin.id);
  _plugins.set(plugin.id, plugin);
}

export function getAllPlugins() {
  return _registrationOrder
    .map((id) => _plugins.get(id))
    .filter(Boolean);
}

export function getPluginById(id) {
  return _plugins.get(id) || null;
}

export function getAvailablePlugins(runtimeCtx) {
  const all = getAllPlugins();
  return all.filter((p) => {
    if (typeof p.isAvailable !== 'function') return true;
    try { return !!p.isAvailable(runtimeCtx); } catch { return false; }
  });
}

/** Test-only utility — clears the registry. Not exported from index. */
export function _resetRegistry() {
  _plugins.clear();
  _registrationOrder.length = 0;
}
