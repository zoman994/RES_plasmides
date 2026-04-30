export const TAB_CHANNEL = 'bodge-tab-control';

export function hasNavigatorLocks() {
  return !!(typeof navigator !== 'undefined'
    && navigator.locks
    && typeof navigator.locks.request === 'function');
}

export function lockNameFor(projectId) {
  return `bodge-project-${projectId}`;
}

export async function acquireProjectLock(projectId) {
  if (!hasNavigatorLocks()) {
    return { hasLock: false, reason: 'no-navigator-locks', releaseFn: () => {} };
  }
  let resolveRelease;
  const releasedPromise = new Promise((resolve) => { resolveRelease = resolve; });
  let onResult;
  const resultPromise = new Promise((resolve) => { onResult = resolve; });

  navigator.locks.request(
    lockNameFor(projectId),
    { mode: 'exclusive', ifAvailable: true },
    (lock) => {
      if (lock === null) {
        onResult({ hasLock: false, reason: 'held-by-other-tab', releaseFn: () => {} });
        return null;
      }
      onResult({
        hasLock: true,
        releaseFn: () => { try { resolveRelease(); } catch { /* ignore */ } },
      });
      return releasedPromise;
    }
  ).catch(() => {
    onResult({ hasLock: false, reason: 'request-failed', releaseFn: () => {} });
  });

  return resultPromise;
}

export function broadcastForceRelease(projectId) {
  if (typeof BroadcastChannel === 'undefined') return false;
  try {
    const ch = new BroadcastChannel(TAB_CHANNEL);
    ch.postMessage({ type: 'force-release', projectId });
    setTimeout(() => { try { ch.close(); } catch { /* ignore */ } }, 50);
    return true;
  } catch {
    return false;
  }
}

export function listenForceRelease(projectId, callback) {
  if (typeof BroadcastChannel === 'undefined') return () => {};
  const ch = new BroadcastChannel(TAB_CHANNEL);
  const handler = (event) => {
    const msg = event.data;
    if (msg && msg.type === 'force-release' && msg.projectId === projectId) {
      try { callback(msg); } catch { /* ignore */ }
    }
  };
  ch.addEventListener('message', handler);
  return () => {
    ch.removeEventListener('message', handler);
    try { ch.close(); } catch { /* ignore */ }
  };
}
