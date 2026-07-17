export const FULLSCREENS = [
  'start',
  // 'dag' fullscreen removed 17.06.2026 — DagWorkspace deleted (dead
  // legacy route, superseded by CanvasSkeleton). See TECH_DEBT.
  'library',
  // M-C.1 K4 (DEC-MC1-05) — drill-in placeholder route. Real
  // Container Window fullscreen lands in M-C.2.
  'containerWindow',
  'underConstruction',
  'multiTabBlocked',
  'readOnlyForced',
  // M-CANVAS-SKELETON (DEC-SKELETON-01) — изолированный DEV-only
  // route для скелета всей Canvas-модели (Tree + Canvas + Editor +
  // 4 operations). Replaces M-CANVAS-PROTOTYPE-PCR (узкий PCR).
  // Снос скелета = удаление этого entry + папки
  // `components/CanvasSkeleton/`.
  'canvasSkeleton',
];

export function isValidFullscreen(name) {
  return FULLSCREENS.includes(name);
}

// Persist + restore the top navStack entry across reloads. We only
// resurrect screens whose state is self-contained. Currently that means
// the Library fullscreen; other overlays reset to start so stale project
// context cannot be restored after deletion or migration.
const NAV_STORAGE_KEY = 'bodgegene-nav-top';

function isRestorableEntry(entry) {
  if (!entry || !isValidFullscreen(entry.fullscreen)) return false;
  if (entry.fullscreen === 'library') {
    return entry.payload?.target === 'library';
  }
  return false;
}

function persistTopEntry(entry) {
  if (typeof localStorage === 'undefined') return;
  try {
    if (!isRestorableEntry(entry)) {
      localStorage.removeItem(NAV_STORAGE_KEY);
      return;
    }
    localStorage.setItem(NAV_STORAGE_KEY, JSON.stringify(entry));
  } catch { /* private mode / quota */ }
}

function loadTopEntry() {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(NAV_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return isRestorableEntry(parsed) ? parsed : null;
  } catch { return null; }
}

const restoredEntry = loadTopEntry();
const initialNavStack = restoredEntry
  ? [{ fullscreen: 'start', payload: null }, restoredEntry]
  : [{ fullscreen: 'start', payload: null }];
const initialActiveFullscreen = restoredEntry ? restoredEntry.fullscreen : 'start';

export const createCanvasSlice = (set) => ({
  canvas: {
    activeFullscreen: initialActiveFullscreen,
    navStack: initialNavStack,
  },

  setActiveFullscreen: (fullscreen, payload = null) => {
    if (!isValidFullscreen(fullscreen)) return;
    set(state => {
      state.canvas.activeFullscreen = fullscreen;
      state.canvas.navStack = [{ fullscreen, payload }];
    });
    persistTopEntry({ fullscreen, payload });
  },

  pushFullscreen: (entry) => {
    if (!entry || !isValidFullscreen(entry.fullscreen)) return;
    const top = { fullscreen: entry.fullscreen, payload: entry.payload ?? null };
    set(state => {
      state.canvas.activeFullscreen = top.fullscreen;
      state.canvas.navStack.push(top);
    });
    persistTopEntry(top);
  },

  popFullscreen: () => {
    let nextTop = null;
    set(state => {
      if (state.canvas.navStack.length <= 1) return;
      state.canvas.navStack.pop();
      nextTop = state.canvas.navStack[state.canvas.navStack.length - 1];
      state.canvas.activeFullscreen = nextTop.fullscreen;
    });
    if (nextTop) persistTopEntry(nextTop);
  },
});
