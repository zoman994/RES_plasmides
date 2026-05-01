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
