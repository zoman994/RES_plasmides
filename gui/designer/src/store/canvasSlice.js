export const FULLSCREENS = [
  'start',
  'dag',
  'library',
  'importer',
  'underConstruction',
  'multiTabBlocked',
  'readOnlyForced',
];

export function isValidFullscreen(name) {
  return FULLSCREENS.includes(name);
}

// Persist + restore the top navStack entry across reloads. We only
// resurrect screens whose state is self-contained (no dependency on
// transient in-memory data like parsed importer files): currently that
// means «Importer with target=library» — biolog complained that a page
// reload from the Library view kicked them back to the start screen.
// Other fullscreens (DAG, importer→project, etc.) reset to start so we
// don't restore a project that's been deleted or land in importer with
// no parsed item.
const NAV_STORAGE_KEY = 'bodgegene-nav-top';

function isRestorableEntry(entry) {
  if (!entry || !isValidFullscreen(entry.fullscreen)) return false;
  if (entry.fullscreen === 'importer') {
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
    dagViewport: { x: 0, y: 0, zoom: 1 },
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
