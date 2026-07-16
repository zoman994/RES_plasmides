/**
 * Prompt-modal ui-slice (BUGS V191/V192) — in-app replacement for the
 * Electron-dead `window.prompt`. requestPrompt() opens the dialog and returns a
 * Promise; resolvePrompt(value|null) fulfils it and clears state.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../index';

describe('prompt-modal slice', () => {
  beforeEach(() => { useStore.setState((s) => { s.prompt = null; }); });

  it('requestPrompt sets state.prompt and resolves with the value from resolvePrompt', async () => {
    const p = useStore.getState().requestPrompt({ title: 'Переименовать', defaultValue: 'old', multiline: false });
    const cur = useStore.getState().prompt;
    expect(cur).toBeTruthy();
    expect(cur.title).toBe('Переименовать');
    expect(cur.defaultValue).toBe('old');
    expect(cur.multiline).toBe(false);
    useStore.getState().resolvePrompt('new name');
    await expect(p).resolves.toBe('new name');
    expect(useStore.getState().prompt).toBeNull();
  });

  it('resolvePrompt(null) cancels — resolves null and clears state', async () => {
    const p = useStore.getState().requestPrompt({ title: 'T' });
    useStore.getState().resolvePrompt(null);
    await expect(p).resolves.toBeNull();
    expect(useStore.getState().prompt).toBeNull();
  });

  it('coerces defaultValue to a string and defaults labels', () => {
    useStore.getState().requestPrompt({ defaultValue: 42 });
    const cur = useStore.getState().prompt;
    expect(cur.defaultValue).toBe('42');
    expect(cur.confirmLabel).toBe('OK');
    expect(cur.cancelLabel).toBe('Отмена');
  });
});
