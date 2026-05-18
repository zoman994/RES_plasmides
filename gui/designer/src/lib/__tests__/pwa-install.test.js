/**
 * pwa-install — beforeinstallprompt capture + prompt invocation.
 *
 * Verifies the deferred-prompt lifecycle and the helper used by
 * the sidebar «Установить» button.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  setupBeforeInstallPromptListener, canPromptInstall, promptInstall, isPwaInstalled,
  purgeStaleServiceWorkers,
} from '../pwa-install';

let cleanups = [];

function fireBeforeInstall() {
  const evt = new Event('beforeinstallprompt');
  evt.prompt = vi.fn().mockResolvedValue();
  evt.userChoice = Promise.resolve({ outcome: 'accepted' });
  window.dispatchEvent(evt);
  return evt;
}

beforeEach(() => {
  cleanups = [];
});
afterEach(() => {
  cleanups.forEach((fn) => { try { fn(); } catch { /* */ } });
  cleanups = [];
});

describe('pwa-install', () => {
  it('canPromptInstall is false until beforeinstallprompt fires', () => {
    const onAvailable = vi.fn();
    cleanups.push(setupBeforeInstallPromptListener(onAvailable));
    expect(canPromptInstall()).toBe(false);
    fireBeforeInstall();
    expect(canPromptInstall()).toBe(true);
    expect(onAvailable).toHaveBeenCalledWith(true);
  });

  it('promptInstall returns the userChoice outcome and clears the cached event', async () => {
    cleanups.push(setupBeforeInstallPromptListener(() => {}));
    fireBeforeInstall();
    const out = await promptInstall();
    expect(out).toBe('accepted');
    // Event consumed → next call returns 'unavailable'.
    expect(await promptInstall()).toBe('unavailable');
    expect(canPromptInstall()).toBe(false);
  });

  it('appinstalled event clears the cached prompt', () => {
    const onAvailable = vi.fn();
    cleanups.push(setupBeforeInstallPromptListener(onAvailable));
    fireBeforeInstall();
    expect(canPromptInstall()).toBe(true);
    window.dispatchEvent(new Event('appinstalled'));
    expect(canPromptInstall()).toBe(false);
    expect(onAvailable).toHaveBeenLastCalledWith(false);
  });

  it('isPwaInstalled() is false in test environment (browser-tab mode)', () => {
    expect(isPwaInstalled()).toBe(false);
  });

  it('isPwaInstalled() reports true when matchMedia(\"(display-mode: standalone)\") matches', () => {
    const orig = window.matchMedia;
    window.matchMedia = (q) => ({ matches: q === '(display-mode: standalone)', media: q, addEventListener: () => {}, removeEventListener: () => {} });
    try { expect(isPwaInstalled()).toBe(true); }
    finally { window.matchMedia = orig; }
  });
});

// V77 — dev-only stale-SW purge. A service worker from a past
// build/preview keeps controlling the dev origin and serving an old
// precached bundle (biolog: «опять старые файлы»). main.jsx calls this
// ONLY under import.meta.env.DEV; production PWA SW is never touched.
describe('purgeStaleServiceWorkers', () => {
  it('no serviceWorker API → safe no-op result', async () => {
    const r = await purgeStaleServiceWorkers({ nav: {}, cacheStore: undefined });
    expect(r).toEqual({ unregistered: 0, cachesCleared: 0, hadController: false });
  });

  it('unregisters every registration + clears every cache + reports controller', async () => {
    const unreg = vi.fn().mockResolvedValue(true);
    const nav = {
      serviceWorker: {
        controller: {}, // a SW is currently controlling the page
        getRegistrations: vi.fn().mockResolvedValue([{ unregister: unreg }, { unregister: unreg }]),
      },
    };
    const del = vi.fn().mockResolvedValue(true);
    const cacheStore = { keys: vi.fn().mockResolvedValue(['workbox-precache-v1', 'plasmid-pack-v1']), delete: del };
    const r = await purgeStaleServiceWorkers({ nav, cacheStore });
    expect(unreg).toHaveBeenCalledTimes(2);
    expect(del).toHaveBeenCalledTimes(2);
    expect(del).toHaveBeenCalledWith('workbox-precache-v1');
    expect(r).toEqual({ unregistered: 2, cachesCleared: 2, hadController: true });
  });

  it('hadController false when nothing controls the page', async () => {
    const nav = {
      serviceWorker: { controller: null, getRegistrations: vi.fn().mockResolvedValue([]) },
    };
    const cacheStore = { keys: vi.fn().mockResolvedValue([]), delete: vi.fn() };
    const r = await purgeStaleServiceWorkers({ nav, cacheStore });
    expect(r.hadController).toBe(false);
    expect(r.unregistered).toBe(0);
  });

  it('never throws if an API rejects', async () => {
    const nav = {
      serviceWorker: { controller: {}, getRegistrations: vi.fn().mockRejectedValue(new Error('x')) },
    };
    const cacheStore = { keys: vi.fn().mockRejectedValue(new Error('y')), delete: vi.fn() };
    await expect(purgeStaleServiceWorkers({ nav, cacheStore })).resolves.toBeTruthy();
  });
});
