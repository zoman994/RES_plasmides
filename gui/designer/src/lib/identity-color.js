/**
 * identity-color — the ONE bucket→colour mapping for search results (P1).
 *
 * Previously copied by hand in two places (LibraryTopBar / SequenceSearchPopover),
 * which drifts. The bucketing lives in `sequence-search.js::identityBucket`
 * (90/80/70 thresholds, tested); this module owns only the colour ladder + the
 * null-safe entry points the UI actually calls.
 *
 * Colour encodes STRENGTH, not «valid/invalid». For an IUPAC (degenerate) query
 * identity is null — «compatibility» is a real number but «identity» is undefined
 * — so we colour by compatibility and NEVER paint an ambiguous hit false-green.
 *
 * Pure; no React/store. Reuses identityBucket (single source for the thresholds).
 */
import { identityBucket } from './sequence-search';

const NEUTRAL = 'var(--text-secondary)';

/** bucket name → CSS colour. Keys mirror identityBucket's outcomes. */
export const BUCKET_COLOR = Object.freeze({
  high: 'var(--success-fg, #16a34a)', // ≥90% — green
  mid: '#d97706', //                     80-89% — amber
  orange: '#ea580c', //                  70-79% — orange
  low: 'var(--text-tertiary)', //        <70% — grey (only with a relaxed threshold)
});

/** A bucket name → its colour, or a neutral fallback for unknown/missing. */
export function bucketColor(bucket) {
  return BUCKET_COLOR[bucket] || NEUTRAL;
}

/**
 * A numeric identity (0..1) → colour. `null`/`undefined` (IUPAC, where identity is
 * undefined-by-design) returns neutral — a degenerate hit is never coloured green.
 */
export function identityColor(identity) {
  if (identity == null || Number.isNaN(identity)) return NEUTRAL;
  return bucketColor(identityBucket(identity));
}

/**
 * Metric-aware colour: prefer real identity; when it is null (IUPAC) fall back to
 * `compatibility` so the row still shows its true strength. Neutral if neither is a
 * usable number.
 * @param {{ identity?:number|null, compatibility?:number|null }|null} metrics
 */
export function strengthColor(metrics) {
  if (!metrics) return NEUTRAL;
  const v = metrics.identity == null ? metrics.compatibility : metrics.identity;
  return identityColor(v);
}
