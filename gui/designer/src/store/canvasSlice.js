export const FULLSCREENS = [
  'start',
  'dag',
  'underConstruction',
  'multiTabBlocked',
  'readOnlyForced',
];

export function isValidFullscreen(name) {
  return FULLSCREENS.includes(name);
}

export const createCanvasSlice = (set) => ({
  canvas: {
    activeFullscreen: 'start',
    navStack: [{ fullscreen: 'start', payload: null }],
    dagViewport: { x: 0, y: 0, zoom: 1 },
  },

  setActiveFullscreen: (fullscreen, payload = null) => {
    if (!isValidFullscreen(fullscreen)) return;
    set(state => {
      state.canvas.activeFullscreen = fullscreen;
      state.canvas.navStack = [{ fullscreen, payload }];
    });
  },

  pushFullscreen: (entry) => {
    if (!entry || !isValidFullscreen(entry.fullscreen)) return;
    set(state => {
      state.canvas.activeFullscreen = entry.fullscreen;
      state.canvas.navStack.push({ fullscreen: entry.fullscreen, payload: entry.payload ?? null });
    });
  },

  popFullscreen: () => {
    set(state => {
      if (state.canvas.navStack.length <= 1) return;
      state.canvas.navStack.pop();
      const top = state.canvas.navStack[state.canvas.navStack.length - 1];
      state.canvas.activeFullscreen = top.fullscreen;
    });
  },
});
