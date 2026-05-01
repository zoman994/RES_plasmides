import { getJSON, setJSON } from '../lib/storage';

export const THEME_STORAGE_KEY = 'bodgegene-theme';
export const AGENT_STORAGE_KEY = 'bodgegene-agent';
export const IMPORTER_MODE_STORAGE_KEY = 'bodgegene-importer-mode';

const THEMES = ['light', 'dark'];
const IMPORTER_MODES = ['advanced', 'simple'];

function loadInitialTheme() {
  const t = getJSON(THEME_STORAGE_KEY, null);
  if (THEMES.includes(t)) return t;
  return 'light';
}

function loadInitialAgent() {
  const a = getJSON(AGENT_STORAGE_KEY, null);
  if (a && typeof a === 'object') return { name: a.name || '', email: a.email || '' };
  return { name: '', email: '' };
}

function loadInitialImporterMode() {
  const m = getJSON(IMPORTER_MODE_STORAGE_KEY, null);
  if (IMPORTER_MODES.includes(m)) return m;
  return 'advanced';
}

export function applyThemeToDOM(theme) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (root) root.dataset.theme = theme;
  const ssRoot = document.getElementById('ss-root');
  if (ssRoot) ssRoot.dataset.theme = theme;
}

const TOAST_CAPACITY = 3;
const TOAST_DEFAULT_DISMISS_MS = 3500;

function _newToastId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `t-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export const createUiSlice = (set) => ({
  theme: loadInitialTheme(),
  agent: loadInitialAgent(),
  importerMode: loadInitialImporterMode(),
  modals: { settings: false, projectInfo: false },
  toasts: [],
  canInstallPwa: false,

  setImporterMode: (mode) => {
    if (!IMPORTER_MODES.includes(mode)) return;
    set(state => { state.importerMode = mode; });
    setJSON(IMPORTER_MODE_STORAGE_KEY, mode);
  },

  setTheme: (theme) => {
    if (!THEMES.includes(theme)) return;
    set(state => { state.theme = theme; });
    setJSON(THEME_STORAGE_KEY, theme);
    applyThemeToDOM(theme);
  },

  setAgent: (agent) => {
    const safe = { name: agent?.name || '', email: agent?.email || '' };
    set(state => { state.agent = safe; });
    setJSON(AGENT_STORAGE_KEY, safe);
  },

  openSettings: () => set(state => { state.modals.settings = true; }),
  closeSettings: () => set(state => { state.modals.settings = false; }),

  openProjectInfo: () => set(state => { state.modals.projectInfo = true; }),
  closeProjectInfo: () => set(state => { state.modals.projectInfo = false; }),

  showToast: (msg, kind = 'info', options = {}) => {
    const id = _newToastId();
    const entry = {
      id,
      msg,
      kind,
      createdAt: Date.now(),
      onUndo: typeof options?.onUndo === 'function' ? options.onUndo : null,
      onAutoDismiss: typeof options?.onAutoDismiss === 'function' ? options.onAutoDismiss : null,
      autoDismissMs: typeof options?.autoDismissMs === 'number' ? options.autoDismissMs : TOAST_DEFAULT_DISMISS_MS,
    };
    set(state => {
      while (state.toasts.length >= TOAST_CAPACITY) state.toasts.shift();
      state.toasts.push(entry);
    });
    return id;
  },
  clearToast: (id) => set(state => {
    if (id === undefined || id === null) {
      state.toasts = [];
    } else {
      state.toasts = state.toasts.filter(t => t.id !== id);
    }
  }),

  setCanInstallPwa: (v) => set(state => { state.canInstallPwa = !!v; }),
});
