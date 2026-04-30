import { getJSON, setJSON } from '../lib/storage';

export const THEME_STORAGE_KEY = 'bodgegene-theme';
export const AGENT_STORAGE_KEY = 'bodgegene-agent';

const THEMES = ['light', 'dark'];

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

export function applyThemeToDOM(theme) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (root) root.dataset.theme = theme;
  const ssRoot = document.getElementById('ss-root');
  if (ssRoot) ssRoot.dataset.theme = theme;
}

export const createUiSlice = (set) => ({
  theme: loadInitialTheme(),
  agent: loadInitialAgent(),
  modals: { settings: false },
  toast: null,

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

  showToast: (msg, kind = 'info') => set(state => { state.toast = { msg, kind, at: Date.now() }; }),
  clearToast: () => set(state => { state.toast = null; }),
});
