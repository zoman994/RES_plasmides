/**
 * Canonical resource hash for Library dedup (M-B.1 K3, DEC-IMP-10).
 *
 * Hash = SHA-256 of canonical JSON over `{sequence, topology, ends}`. Sequence
 * is uppercased so trivial case differences don't defeat dedup. Ends collapse
 * to `null` for circular molecules (where the field is meaningless). The hash
 * lives on `LibraryEntry.payload.resourceHash` (containers) and on
 * `Primer.resourceHash` (primers, K6) so the same helper drives both.
 *
 * crypto.subtle is available in browsers and in jsdom (Node ≥ 16). If unavailable
 * we return null — callers degrade to name-only dedup.
 */
export async function computeResourceHash({ sequence, topology, ends } = {}) {
  if (!sequence) return null;
  const canonical = JSON.stringify({
    sequence: String(sequence).toUpperCase(),
    topology: topology === 'circular' ? 'circular' : 'linear',
    ends: topology === 'linear' && ends ? { left: ends.left || '5', right: ends.right || '3' } : null,
  });
  const subtle = (typeof crypto !== 'undefined' && crypto.subtle) ? crypto.subtle : null;
  if (!subtle) return null;
  const buf = new TextEncoder().encode(canonical);
  const digest = await subtle.digest('SHA-256', buf);
  const hex = Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  return `sha256:${hex}`;
}
