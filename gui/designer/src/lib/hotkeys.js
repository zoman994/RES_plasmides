import { useEffect } from 'react';
import { useStore } from '../store';
import { STRINGS } from './strings';

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
    label: STRINGS.hotkeys.actionLabels.newProject,
    allowInInput: false,
  },
  'open-bodge': {
    keys: { mac: { meta: true, key: 'o' }, other: { ctrl: true, key: 'o' } },
    scope: 'global',
    label: STRINGS.hotkeys.actionLabels.openBodge,
    allowInInput: false,
  },
  'save-bodge': {
    keys: { mac: { meta: true, key: 's' }, other: { ctrl: true, key: 's' } },
    scope: 'global-with-project',
    label: STRINGS.hotkeys.actionLabels.saveBodge,
    allowInInput: true,
  },
  'close-project': {
    keys: { mac: { meta: true, key: 'w' }, other: { ctrl: true, key: 'w' } },
    scope: 'global-with-project',
    label: STRINGS.hotkeys.actionLabels.closeProject,
    allowInInput: false,
  },
  'open-settings': {
    keys: { mac: { meta: true, key: ',' }, other: { ctrl: true, key: ',' } },
    scope: 'global',
    label: STRINGS.hotkeys.actionLabels.openSettings,
    allowInInput: false,
  },
  'escape': {
    keys: { mac: { key: 'escape' }, other: { key: 'escape' } },
    scope: 'context-aware',
    label: STRINGS.hotkeys.actionLabels.escape,
    allowInInput: true,
  },
  'project-info': {
    keys: { mac: { meta: true, key: 'i' }, other: { ctrl: true, key: 'i' } },
    scope: 'global-with-project',
    label: STRINGS.hotkeys.actionLabels.projectInfo,
    allowInInput: false,
  },
  // T7 DEC-T7-10 — toggle the focused zone graph/sequence. Bare G / S;
  // allowInInput:false so renaming a zone never toggles (R-T7-4).
  'toggle-zone-view-graph': {
    keys: { mac: { key: 'g' }, other: { key: 'g' } },
    scope: 'global-with-project',
    label: STRINGS.hotkeys.actionLabels.toggleZoneGraph,
    allowInInput: false,
  },
  'toggle-zone-view-sequence': {
    keys: { mac: { key: 's' }, other: { key: 's' } },
    scope: 'global-with-project',
    label: STRINGS.hotkeys.actionLabels.toggleZoneSequence,
    allowInInput: false,
  },
  // T10 DEC-T10-06 — toggle the Sanger lab notebook. Bare B;
  // allowInInput:false so typing in a notes textarea never toggles (R-T10-3).
  'toggle-sanger-notebook': {
    keys: { mac: { key: 'b' }, other: { key: 'b' } },
    scope: 'global-with-project',
    label: STRINGS.hotkeys.actionLabels.toggleSangerNotebook,
    allowInInput: false,
  },
  // M-X.8 K6 — Command Palette overlay for project switching.
  // FAIL-fix-pass 5 — alternate Ctrl+Shift+P / ⌘+Shift+P binding
  // for browsers where the primary Ctrl+P is hijacked by the
  // print-dialog default. `keys.{mac,other}` accepts either a
  // single combo or an array of combos (resolver matches any).
  // 11.05.2026 follow-up — `allowInInput: true`. Biolog reported
  // intermittent «hotkey doesn't work» — root cause: focus inside
  // ANY text input (Library tree-search, topbar search, AddModal
  // paste textarea, even the palette's own filter) was making
  // `_isInInputElement` skip these app-level commands → browser
  // default fired (print dialog / find-in-page). Palette + search
  // are global app navigation; biolog always wants them, regardless
  // of focus.
  'command-palette': {
    keys: {
      mac: [{ meta: true, key: 'p' }, { meta: true, shift: true, key: 'p' }],
      other: [{ ctrl: true, key: 'p' }, { ctrl: true, shift: true, key: 'p' }],
    },
    scope: 'global',
    label: STRINGS.hotkeys.actionLabels.commandPalette,
    allowInInput: true,
  },
  // M-X.9 K2 — Local sequence search (Ctrl+F / ⌘F).
  'sequence-search': {
    keys: {
      mac: [{ meta: true, key: 'f' }, { meta: true, shift: true, key: 'f' }],
      other: [{ ctrl: true, key: 'f' }, { ctrl: true, shift: true, key: 'f' }],
    },
    scope: 'global',
    label: 'Поиск ПСО',
    allowInInput: true,
  },
  // V72 — write a primer from the selected DNA range inside the PCR
  // viewer. Scoped to the viewer by HANDLER LIFECYCLE, not by `scope`:
  // PcrModeShell registers the handler via useHotkey only while mounted,
  // and the resolver skips ids with no registered handler WITHOUT
  // calling preventDefault — so Ctrl+R reloads the browser normally
  // everywhere except inside the open PCR viewer. `alt`/`shift` are
  // pinned so Ctrl+R (fwd) and Ctrl+Alt+R (rev) never cross-match and
  // Ctrl+Shift+R stays a hard-reload.
  'pcr-primer-forward': {
    keys: {
      mac: { ctrl: true, alt: false, shift: false, key: 'r' },
      other: { ctrl: true, alt: false, shift: false, key: 'r' },
    },
    scope: 'global',
    label: 'PCR: прямой праймер из выделения',
    allowInInput: true,
  },
  'pcr-primer-reverse': {
    keys: {
      mac: { ctrl: true, alt: true, shift: false, key: 'r' },
      other: { ctrl: true, alt: true, shift: false, key: 'r' },
    },
    scope: 'global',
    label: 'PCR: обратный праймер из выделения',
    allowInInput: true,
  },
  // T5 DEC-T5-02 — bare «P» marks the selection as a piece. Not
  // allowInInput (R-T5-1: must not fire while the biolog types a name).
  'piece-create': {
    keys: {
      mac: { ctrl: false, alt: false, shift: false, key: 'p' },
      other: { ctrl: false, alt: false, shift: false, key: 'p' },
    },
    scope: 'global',
    label: 'Отметить выделение как кусок',
    allowInInput: false,
  },
});

// FAIL-fix-pass 5 — internal helper. Returns the platform's combo
// list, normalising single-object form to a 1-length array so the
// resolver can iterate uniformly.
function _combosForPlatform(def, platform) {
  const raw = platform === 'mac' ? def.keys.mac : def.keys.other;
  if (!raw) return [];
  return Array.isArray(raw) ? raw : [raw];
}

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
  // Primary binding only — alternates are documented in the
  // HotkeyCheatsheet, not in inline UI hints.
  const combos = _combosForPlatform(def, platform);
  return _formatCombo(combos[0], platform);
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
  if (key === wanted) return true;
  // 11.05.2026 — layout-independent fallback. On a Russian/Cyrillic
  // layout `event.key` is the Cyrillic char on the same physical
  // key (Ctrl+P → `event.key === 'з'`, Ctrl+F → 'а', Ctrl+S → 'ы',
  // Ctrl+I → 'ш', etc.) and the strict `key === wanted` test above
  // fails. `event.code` is the physical-key identifier and is
  // layout-independent. For single ASCII letters it's `KeyX`; for
  // ',' it's `Comma`; the rest already match via `event.key`.
  if (wanted.length === 1 && wanted >= 'a' && wanted <= 'z') {
    const expectedCode = `Key${wanted.toUpperCase()}`;
    if (event.code === expectedCode) return true;
  }
  if (wanted === ',' && event.code === 'Comma') return true;
  return false;
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
    modals: s.modals || {},
  };
}

// When ProjectInfoModal/SettingsModal is open, block hotkeys that would create
// or switch project context. Esc + Save-bodge stay live so the user can still
// dismiss the modal and persist edits.
const MODAL_BLOCKED = new Set([
  'new-project', 'open-bodge', 'close-project', 'open-settings', 'project-info',
]);

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

  const modalOpen = !!(ctx.modals && (ctx.modals.projectInfo || ctx.modals.settings));

  // Find all matching entries, then pick the one with highest scope rank.
  let best = null;
  let bestRank = -1;
  for (const [id, def] of Object.entries(HOTKEYS)) {
    const combos = _combosForPlatform(def, platform);
    let matched = false;
    for (const combo of combos) {
      if (_eventMatchesCombo(event, combo)) { matched = true; break; }
    }
    if (!matched) continue;
    if (inInput && !def.allowInInput) continue;
    if (!_scopeAllowed(def.scope, ctx)) continue;
    if (modalOpen && MODAL_BLOCKED.has(id)) continue;
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
