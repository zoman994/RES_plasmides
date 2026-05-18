// Capture the browser's beforeinstallprompt event so the StartScreen footer
// can offer "Install as desktop app" only when the browser is actually able to
// install the PWA.

let _deferredPrompt = null;

export function setupBeforeInstallPromptListener(onAvailable) {
  if (typeof window === 'undefined') return () => {};
  function handleBeforeInstall(e) {
    e.preventDefault();
    _deferredPrompt = e;
    if (typeof onAvailable === 'function') onAvailable(true);
  }
  function handleInstalled() {
    _deferredPrompt = null;
    if (typeof onAvailable === 'function') onAvailable(false);
  }
  window.addEventListener('beforeinstallprompt', handleBeforeInstall);
  window.addEventListener('appinstalled', handleInstalled);
  return () => {
    window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
    window.removeEventListener('appinstalled', handleInstalled);
  };
}

export function canPromptInstall() {
  return _deferredPrompt !== null;
}

export async function promptInstall() {
  if (!_deferredPrompt) return 'unavailable';
  const evt = _deferredPrompt;
  _deferredPrompt = null;
  try {
    await evt.prompt();
    const choice = await evt.userChoice;
    return choice?.outcome || 'dismissed';
  } catch {
    return 'dismissed';
  }
}

/**
 * Best-effort detection of «running as installed PWA».
 * Returns true when the page is launched in standalone display
 * mode (Chrome/Edge install, iOS «Add to Home Screen», desktop
 * shortcut). Defensive: returns false in non-browser env.
 */
/**
 * purgeStaleServiceWorkers — dev-only escape hatch (V77).
 *
 * A service worker registered by a past `vite build` / preview keeps
 * controlling the dev origin (localhost:3000) and serves its OLD
 * precached bundle, so `npm run dev` shows stale code even after a
 * rebuild (biolog hit this repeatedly: «опять старые файлы»). main.jsx
 * calls this ONLY behind `import.meta.env.DEV` — the production PWA
 * service worker (offline support) is never touched.
 *
 * Unregisters every SW registration and deletes every Cache Storage
 * entry. Pure-ish + fully injectable so it is unit-testable; never
 * throws (best-effort cleanup). `hadController` tells the caller a SW
 * was still controlling the page → it should reload once so the next
 * load is served fresh by the dev server.
 *
 * @returns {Promise<{unregistered:number, cachesCleared:number, hadController:boolean}>}
 */
export async function purgeStaleServiceWorkers({
  nav = (typeof navigator !== 'undefined' ? navigator : {}),
  cacheStore = (typeof globalThis !== 'undefined' ? globalThis.caches : undefined),
} = {}) {
  const result = { unregistered: 0, cachesCleared: 0, hadController: false };
  const sw = nav && nav.serviceWorker;
  if (!sw || typeof sw.getRegistrations !== 'function') return result;
  result.hadController = !!sw.controller;
  try {
    const regs = await sw.getRegistrations();
    for (const reg of (regs || [])) {
      try { if (await reg.unregister()) result.unregistered += 1; } catch { /* keep going */ }
    }
  } catch { /* getRegistrations unavailable / blocked */ }
  if (cacheStore && typeof cacheStore.keys === 'function') {
    try {
      const keys = await cacheStore.keys();
      for (const k of (keys || [])) {
        try { if (await cacheStore.delete(k)) result.cachesCleared += 1; } catch { /* keep going */ }
      }
    } catch { /* caches blocked (private mode) */ }
  }
  return result;
}

export function isPwaInstalled() {
  if (typeof window === 'undefined') return false;
  try {
    // Standard standalone signal.
    if (window.matchMedia?.('(display-mode: standalone)')?.matches) return true;
    // iOS Safari uses a non-standard navigator.standalone.
    if (typeof navigator !== 'undefined' && navigator.standalone === true) return true;
  } catch { /* private mode / detached frame */ }
  return false;
}
