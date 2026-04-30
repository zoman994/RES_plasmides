import { useEffect } from 'react';
import { useStore } from '../store';

/* ════════════════════════════════════════════════════════════════════════════
 * Hotkey infrastructure (Sprint M-A K4).
 *
 * System-fixed registry — no user rebind, no persistence. Each hotkey has a
 * stable id; components register handlers via `useHotkey(id, handler)`.
 * App.jsx attaches ONE global keydown listener that calls `runHotkeyResolver`,
 * which iterates the registry and dispatches the first match by scope priority.
 *
 * Future milestones (M-D Container Window / M-E Mix Workspace) extend the
 * `HOTKEYS` map with their own ids + scopes (e.g. `'fullscreen:container'`)
 * without touching this file's runtime code. ──────────────────────────────── */

export const HOTKEYS = Object.freeze({
  'new-project': {
    keys: { mac: { meta: true, key: 'n' }, other: { ctrl: true, key: 'n' } },
    scope: 'global',
    label: 'Создать проект',
    allowInInput: false,
  },
  'open-bodge': {
    keys: { mac: { meta: true, key: 'o' }, other: { ctrl: true, key: 'o' } },
    scope: 'global',
    label: 'Открыть .bodge',
    allowInInput: false,
  },
  'save-bodge': {
    keys: { mac: { meta: true, key: 's' }, other: { ctrl: true, key: 's' } },
    scope: 'global-with-project',
    label: 'Сохранить',
    allowInInput: true,
  },
  'close-project': {
    keys: { mac: { meta: true, key: 'w' }, other: { ctrl: true, key: 'w' } },
    scope: 'global-with-project',
    label: 'Закрыть проект',
    allowInInput: false,
  },
  'open-settings': {
    keys: { mac: { meta: true, key: ',' }, other: { ctrl: true, key: ',' } },
    scope: 'global',
    label: 'Настройки',
    allowInInput: false,
  },
  'escape': {
    keys: { mac: { key: 'escape' }, other: { key: 'escape' } },
    scope: 'context-aware',
    label: 'Закрыть',
    allowInInput: true,
  },
  'project-info': {
    keys: { mac: { meta: true, key: 'i' }, other: { ctrl: true, key: 'i' } },
    scope: 'global-with-project',
    label: 'Project info',
    allowInInput: false,
  },
});

const SCOPE_PRIORITY = Object.freeze([
  // higher index → higher priority
  'global',
  'global-with-project',
  'context-aware',
]);

const FULLSCREEN_PRIORITY_OFFSET = 1000;

function scopeRank(scope) {
  if (typeof scope === 'string' && scope.startsWith('fullscreen:')) {
    return FULLSCREEN_PRIORITY_OFFSET;
  }
  const idx = SCOPE_PRIORITY.indexOf(scope);
  return idx >= 0 ? idx : -1;
}

const _handlers = new Map();
let _platformOverride = null;

export function _setPlatformOverrideForTests(value) {
  _platformOverride = value;
}

export function detectPlatform() {
  if (_platformOverride) return _platformOverride;
  if (typeof navigator === 'undefined') return 'other';
  const p = (navigator.platform || '').toLowerCase();
  if (p.includes('mac') || p.includes('iphone') || p.includes('ipad')) return 'mac';
  return 'other';
}

export function registerHandler(id, handler) {
  if (!HOTKEYS[id]) {
    // eslint-disable-next-line no-console
    console.warn(`[bodgegene/hotkeys] unknown id "${id}"`);
    return () => {};
  }
  _handlers.set(id, handler);
  return () => {
    if (_handlers.get(id) === handler) _handlers.delete(id);
  };
}

export function _clearHandlersForTests() {
  _handlers.clear();
}

export function _getHandlersForTests() {
  return new Map(_handlers);
}

export function useHotkey(id, handler) {
  useEffect(() => {
    if (typeof handler !== 'function') return undefined;
    return registerHandler(id, handler);
  }, [id, handler]);
}

export function formatHotkey(id, platform = detectPlatform()) {
  const def = HOTKEYS[id];
  if (!def) return '';
  const combo = platform === 'mac' ? def.keys.mac : def.keys.other;
  return _formatCombo(combo, platform);
}

function _formatCombo(combo, platform) {
  if (!combo) return '';
  const parts = [];
  if (combo.ctrl) parts.push(platform === 'mac' ? '⌃' : 'Ctrl');
  if (combo.meta) parts.push(platform === 'mac' ? '⌘' : 'Win');
  if (combo.alt) parts.push(platform === 'mac' ? '⌥' : 'Alt');
  if (combo.shift) parts.push(platform === 'mac' ? '⇧' : 'Shift');
  const k = combo.key;
  let pretty;
  if (!k) pretty = '';
  else if (k.toLowerCase() === 'escape') pretty = 'Esc';
  else if (k === ',') pretty = ',';
  else if (k.length === 1) pretty = k.toUpperCase();
  else pretty = k;
  parts.push(pretty);
  return platform === 'mac' ? parts.join('') : parts.join('+');
}

function _eventMatchesCombo(event, combo) {
  if (!combo) return false;
  if (combo.ctrl != null && !!event.ctrlKey !== !!combo.ctrl) return false;
  if (combo.meta != null && !!event.metaKey !== !!combo.meta) return false;
  if (combo.alt != null && !!event.altKey !== !!combo.alt) return false;
  if (combo.shift != null && !!event.shiftKey !== !!combo.shift) return false;
  const key = (event.key || '').toLowerCase();
  const wantedRaw = combo.key || '';
  const wanted = wantedRaw.toLowerCase();
  // Cmd/Ctrl modifier without explicit ctrl/meta in combo defaults to false → handled above.
  return key === wanted;
}

function _isInInputElement(target) {
  if (!target) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable === true) return true;
  return false;
}

function _defaultGetContext() {
  const s = useStore.getState();
  return {
    currentProjectId: s.currentProjectId,
    activeFullscreen: s.canvas?.activeFullscreen || 'start',
  };
}

let _getContext = _defaultGetContext;

export function _setGetContextForTests(fn) {
  _getContext = fn || _defaultGetContext;
}

function _scopeAllowed(scope, ctx) {
  if (typeof scope === 'string' && scope.startsWith('fullscreen:')) {
    return scope === `fullscreen:${ctx.activeFullscreen}`;
  }
  switch (scope) {
    case 'global':
      return true;
    case 'global-with-project':
      return !!ctx.currentProjectId;
    case 'context-aware':
      // context-aware handlers themselves decide what to do based on store
      return true;
    default:
      return false;
  }
}

/**
 * Iterate registry, find the highest-priority matching hotkey, and invoke its
 * handler. Returns true if a handler ran, false otherwise.
 *
 * @param {KeyboardEvent} event
 * @param {{ context?: { currentProjectId, activeFullscreen } }} [opts]
 */
export function runHotkeyResolver(event, opts = {}) {
  if (!event || event.defaultPrevented) return false;
  const platform = detectPlatform();
  const ctx = opts.context ? opts.context : _getContext();
  const inInput = _isInInputElement(event.target);

  // Find all matching entries, then pick the one with highest scope rank.
  let best = null;
  let bestRank = -1;
  for (const [id, def] of Object.entries(HOTKEYS)) {
    const combo = platform === 'mac' ? def.keys.mac : def.keys.other;
    if (!_eventMatchesCombo(event, combo)) continue;
    if (inInput && !def.allowInInput) continue;
    if (!_scopeAllowed(def.scope, ctx)) continue;
    if (!_handlers.has(id)) continue;
    const rank = scopeRank(def.scope);
    if (rank > bestRank) { best = id; bestRank = rank; }
  }
  if (!best) return false;

  const handler = _handlers.get(best);
  event.preventDefault();
  try {
    const ret = handler(event);
    if (ret && typeof ret.then === 'function') {
      ret.catch((e) => console.error(`[bodgegene/hotkeys] handler "${best}" rejected:`, e));
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(`[bodgegene/hotkeys] handler "${best}" threw:`, e);
  }
  return true;
}
