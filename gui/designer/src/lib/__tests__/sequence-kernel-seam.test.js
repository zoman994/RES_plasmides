/**
 * U4 item 3 — the seam that selects the sequence kernel.
 *
 * It defaults to LINEAR (U6-F.1/U6-F.2, on measurement), and the forced selection now exists to
 * reach the PRODUCTION engine — for parity tests, differentials and benchmarks. It stays an INTERNAL
 * switch either way: no user setting, no localStorage, no persistence, and a forced selection lasts
 * only until it is reset.
 *
 * U6-F.2 rewrote the two middle cases. They used to force LINEAR and assert LINEAR while LINEAR was
 * already the default, so they would have passed on a seam that did nothing at all; forcing the
 * kernel the default is NOT is what actually observes the switch move.
 *
 * Run: cd gui/designer && npm test -- src/lib/__tests__/sequence-kernel-seam.test.js
 */
import { describe, it, expect, afterEach } from 'vitest';
import {
  getSequenceKernel,
  setSequenceKernelForBenchmark,
  resetSequenceKernel,
  SEQUENCE_KERNEL,
} from '../sequence-kernel-seam';

afterEach(() => resetSequenceKernel());

describe('U4 — the sequence kernel seam', () => {
  it('defaults to linear (U6-F.1/U6-F.2, on measurement)', () => {
    expect(getSequenceKernel()).toBe(SEQUENCE_KERNEL.LINEAR);
  });

  it('a forced selection really moves the switch — to production, the kernel that is NOT the default', () => {
    setSequenceKernelForBenchmark(SEQUENCE_KERNEL.PRODUCTION);
    expect(getSequenceKernel()).toBe(SEQUENCE_KERNEL.PRODUCTION);
  });

  it('reset returns to the default, from a genuinely different selection', () => {
    setSequenceKernelForBenchmark(SEQUENCE_KERNEL.PRODUCTION);
    expect(getSequenceKernel()).toBe(SEQUENCE_KERNEL.PRODUCTION);
    resetSequenceKernel();
    expect(getSequenceKernel()).toBe(SEQUENCE_KERNEL.LINEAR);
  });

  it('an unknown selection is refused — the seam is not a free-form flag', () => {
    setSequenceKernelForBenchmark(SEQUENCE_KERNEL.PRODUCTION);
    expect(() => setSequenceKernelForBenchmark('quantum')).toThrow();
    expect(getSequenceKernel(), 'a refused selection leaves the previous one intact').toBe(SEQUENCE_KERNEL.PRODUCTION);
  });

  it('nothing here reads or writes localStorage', () => {
    // The seam is a module-level variable, not a persisted setting: a fresh import always starts at
    // the compiled-in default, whatever a stored value might say. Guard against a future
    // localStorage creeping in.
    const store = { getItem: () => { throw new Error('localStorage must not be touched'); }, setItem: () => { throw new Error('no'); } };
    const orig = globalThis.localStorage;
    try {
      Object.defineProperty(globalThis, 'localStorage', { value: store, configurable: true });
      setSequenceKernelForBenchmark(SEQUENCE_KERNEL.PRODUCTION);
      expect(getSequenceKernel()).toBe(SEQUENCE_KERNEL.PRODUCTION);
      resetSequenceKernel();
      expect(getSequenceKernel()).toBe(SEQUENCE_KERNEL.LINEAR);
    } finally {
      if (orig === undefined) delete globalThis.localStorage;
      else Object.defineProperty(globalThis, 'localStorage', { value: orig, configurable: true });
    }
  });
});
