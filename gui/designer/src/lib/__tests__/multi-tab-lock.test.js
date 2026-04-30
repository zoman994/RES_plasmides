import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  acquireProjectLock, hasNavigatorLocks, lockNameFor,
  broadcastForceRelease, listenForceRelease, TAB_CHANNEL,
} from '../multi-tab-lock';

function fakeNavigatorLocks() {
  const held = new Map();
  return {
    locks: {
      async request(name, options, callback) {
        if (held.has(name)) {
          if (options && options.ifAvailable) {
            await callback(null);
            return null;
          }
          // FIFO queue is overkill; not used in our tests
          throw new Error('blocked (no queueing in fake)');
        }
        let resolve;
        const released = new Promise((r) => { resolve = r; });
        held.set(name, resolve);
        try {
          const result = await callback({ name, mode: options?.mode || 'exclusive' });
          return result;
        } finally {
          held.delete(name);
          resolve();
        }
      },
    },
  };
}

describe('K3 — multi-tab lock', () => {
  let originalNavigator;
  beforeEach(() => {
    originalNavigator = globalThis.navigator;
  });
  afterEach(() => {
    Object.defineProperty(globalThis, 'navigator', {
      value: originalNavigator, configurable: true, writable: true,
    });
  });

  it('lockNameFor produces a stable per-project name', () => {
    expect(lockNameFor('p-1')).toBe('bodge-project-p-1');
  });

  it('acquireProjectLock returns hasLock=true on first call, false on second', async () => {
    const fake = fakeNavigatorLocks();
    Object.defineProperty(globalThis, 'navigator', { value: fake, configurable: true, writable: true });
    expect(hasNavigatorLocks()).toBe(true);
    const first = await acquireProjectLock('p-x');
    expect(first.hasLock).toBe(true);
    const second = await acquireProjectLock('p-x');
    expect(second.hasLock).toBe(false);
    expect(second.reason).toBe('held-by-other-tab');
    first.releaseFn();
    // give microtasks a chance to release
    await new Promise(r => setTimeout(r, 5));
    const third = await acquireProjectLock('p-x');
    expect(third.hasLock).toBe(true);
    third.releaseFn();
  });

  it('returns hasLock=false with reason when navigator.locks is missing', async () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { /* no locks */ }, configurable: true, writable: true,
    });
    expect(hasNavigatorLocks()).toBe(false);
    const res = await acquireProjectLock('p-y');
    expect(res.hasLock).toBe(false);
    expect(res.reason).toBe('no-navigator-locks');
  });

  it('broadcastForceRelease + listenForceRelease deliver matching messages', async () => {
    if (typeof BroadcastChannel === 'undefined') return; // skip in env without BC
    const received = [];
    const off = listenForceRelease('p-broadcast', (msg) => received.push(msg));
    broadcastForceRelease('p-broadcast');
    await new Promise(r => setTimeout(r, 30));
    expect(received.length).toBeGreaterThanOrEqual(1);
    expect(received[0].type).toBe('force-release');
    expect(TAB_CHANNEL).toBe('bodge-tab-control');
    off();
  });
});
