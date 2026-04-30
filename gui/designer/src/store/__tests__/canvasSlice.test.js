import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../index';

function reset() {
  useStore.setState((state) => {
    state.canvas.activeFullscreen = 'start';
    state.canvas.navStack = [{ fullscreen: 'start', payload: null }];
  });
}

describe('K2 — canvasSlice', () => {
  beforeEach(reset);

  it('pushFullscreen / popFullscreen behave as a stack', () => {
    const { pushFullscreen, popFullscreen } = useStore.getState();
    pushFullscreen({ fullscreen: 'underConstruction', payload: { milestone: 'M-H', name: 'Library' } });
    expect(useStore.getState().canvas.activeFullscreen).toBe('underConstruction');
    expect(useStore.getState().canvas.navStack.length).toBe(2);
    popFullscreen();
    expect(useStore.getState().canvas.activeFullscreen).toBe('start');
    expect(useStore.getState().canvas.navStack.length).toBe(1);
  });

  it('popFullscreen does not pop below the root', () => {
    const { popFullscreen } = useStore.getState();
    popFullscreen();
    expect(useStore.getState().canvas.activeFullscreen).toBe('start');
    expect(useStore.getState().canvas.navStack.length).toBe(1);
  });

  it('setActiveFullscreen replaces stack with single entry', () => {
    const { pushFullscreen, setActiveFullscreen } = useStore.getState();
    pushFullscreen({ fullscreen: 'underConstruction', payload: null });
    pushFullscreen({ fullscreen: 'underConstruction', payload: null });
    setActiveFullscreen('start');
    expect(useStore.getState().canvas.navStack.length).toBe(1);
    expect(useStore.getState().canvas.activeFullscreen).toBe('start');
  });

  it('rejects unknown fullscreen names', () => {
    useStore.getState().pushFullscreen({ fullscreen: 'nonsense', payload: null });
    expect(useStore.getState().canvas.activeFullscreen).toBe('start');
  });
});
