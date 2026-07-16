/**
 * search.worker.js — the off-main-thread sequence-search worker (P1.5).
 *
 * Deliberately a 2-line shell: all logic lives in the pure, unit-tested
 * search-worker-core so the worker itself needs no test runtime. Constructed via
 * Vite's `?worker` import at the call site (LibraryTopBar) — the dev-safe form that
 * bundles this + its import graph into a dedicated worker chunk.
 */
import { handleSearchMessage } from './search-worker-core';

self.onmessage = (e) => {
  self.postMessage(handleSearchMessage(e.data));
};
