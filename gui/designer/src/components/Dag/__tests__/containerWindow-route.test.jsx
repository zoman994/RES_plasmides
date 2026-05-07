/**
 * containerWindow route — Sprint M-C.1 K4.
 *
 * Verifies that `'containerWindow'` is a valid fullscreen literal in
 * canvasSlice and that `pushFullscreen({ fullscreen: 'containerWindow' })`
 * actually lands on the stack.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../../../store';
import { isValidFullscreen, FULLSCREENS } from '../../../store/canvasSlice';

function reset() {
  useStore.setState((s) => {
    s.canvas.activeFullscreen = 'start';
    s.canvas.navStack = [{ fullscreen: 'start', payload: null }];
  });
}

beforeEach(reset);

describe('M-C.1 K4 — containerWindow fullscreen route', () => {
  it('FULLSCREENS includes "containerWindow"', () => {
    expect(FULLSCREENS).toContain('containerWindow');
  });

  it('isValidFullscreen returns true for "containerWindow"', () => {
    expect(isValidFullscreen('containerWindow')).toBe(true);
  });

  it('pushFullscreen({fullscreen:"containerWindow"}) lands on the stack', () => {
    useStore.getState().pushFullscreen({
      fullscreen: 'containerWindow',
      payload: { containerId: 'lib-1' },
    });
    expect(useStore.getState().canvas.activeFullscreen).toBe('containerWindow');
    const top = useStore.getState().canvas.navStack[useStore.getState().canvas.navStack.length - 1];
    expect(top.payload?.containerId).toBe('lib-1');
  });

  it('popFullscreen returns to the previous screen', () => {
    useStore.getState().pushFullscreen({
      fullscreen: 'dag',
      payload: { projectId: 'p1' },
    });
    useStore.getState().pushFullscreen({
      fullscreen: 'containerWindow',
      payload: { containerId: 'lib-1' },
    });
    expect(useStore.getState().canvas.activeFullscreen).toBe('containerWindow');
    useStore.getState().popFullscreen();
    expect(useStore.getState().canvas.activeFullscreen).toBe('dag');
  });
});
