/**
 * feature-detection — DB loading + async detection entrypoints.
 *
 * The identity/scoring ENGINE moved to `lib/feature-match-core.js`
 * (SPEC_COMMON_FEATURES §2/§4 DEC-CF-08) so detection and promote-dedup
 * share ONE machine. This module keeps the side-effecting parts:
 *   - `loadFeatureDB` — fetch + cache the shipped `common-features.json`
 *   - `detectCommonFeaturesAsync` — load DB + run the engine, non-blocking
 * and re-exports the engine's public names so existing import sites
 * (auto-annotate, file-import, annotator-plugins, tests) keep working
 * unchanged (DEC-CF-09).
 *
 * READ-ONLY: database is a reference, NOT added to user's parts library.
 * ASYNC: does not block UI. Called after instant pattern-based auto-annotation.
 *
 * Two detection modes:
 *   1. CDS: translate input in all 6 frames → exact protein match
 *   2. Non-CDS: sliding window → ≥96% DNA identity
 */

import {
  detectCommonFeatures,
  featureRegionName,
  mergeCollinearPartials,
  PARTIAL_MERGE_MAX_GAP,
} from './lib/feature-match-core';

// Re-export engine public surface for back-compat with existing import
// sites (DEC-CF-08/09). Do NOT add new logic here — the engine lives in
// feature-match-core.js.
export {
  detectCommonFeatures,
  featureRegionName,
  mergeCollinearPartials,
  PARTIAL_MERGE_MAX_GAP,
};

let _db = null;
let _loading = null;

/**
 * Load common features database (lazy, cached).
 * @returns {Promise<Object>} database with .features array
 */
export async function loadFeatureDB() {
  if (_db) return _db;
  if (_loading) return _loading;

  _loading = fetch('/common-features.json')
    .then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    })
    .then(data => {
      _db = data;
      _loading = null;
      return data;
    })
    .catch(err => {
      _loading = null;
      console.warn('Feature DB not available:', err.message);
      return null;
    });

  return _loading;
}

/**
 * Async wrapper: load the MERGED DB (built-in + account overlay, DEC-CF-03)
 * + detect. Non-blocking. Returns empty array if nothing to match against.
 *
 * `getMergedFeatureDB` is pulled in with a dynamic import on purpose: a
 * static import would form a load-time cycle (store → commonFeaturesSlice →
 * feature-detection → store) that can leave a slice creator undefined when
 * feature-detection is the entry module. The dynamic import fires only when
 * a detection actually runs, by which time the store is initialised.
 *
 * @param {string} sequence
 * @returns {Promise<Array>}
 */
export async function detectCommonFeaturesAsync(sequence) {
  const { getMergedFeatureDB } = await import('./store/commonFeaturesSlice');
  const db = await getMergedFeatureDB();
  if (!db || !db.features?.length) return [];
  return detectCommonFeatures(sequence, db);
}
