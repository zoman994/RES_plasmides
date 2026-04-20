/**
 * Biologically correct annotation trimming when a fragment is split.
 *
 * Sprint 1.6 / K6.
 *
 * Context: when mutagenesis strategy splits a fragment into N sub-fragments,
 * annotations must be re-assigned to sub-fragments with biology-aware rules,
 * not just coordinate math. Some features (signal peptide, start/stop codon,
 * restriction sites) become nonsense when trimmed — they must be dropped.
 */

/** N-terminal features: survive only if fully inside AND sub starts at parent pos 0. */
const N_TERMINAL_ONLY = new Set(['signal_peptide', 'transit_peptide', 'propeptide']);

/** Point-like types — drop on any partial overlap. Half a site doesn't cut/bind. */
const DROP_ON_TRIM = new Set([
  'restriction_site',
  'primer_bind',
  'mutation',
  'variation',
  'modified_base',
]);

/** Types that get a " (5' trimmed)" / " (3' trimmed)" / " (trimmed)" suffix on partial overlap. */
const RENAME_ON_TRIM = new Set(['CDS', 'gene']);

/**
 * Assign parent-fragment annotations to a sub-fragment with biological awareness.
 * Returns a new array with local-coordinate annotations for the sub-fragment.
 *
 * @param {Array}  parentAnns — original fragment's annotations (parent coordinates)
 * @param {Object} sf          — { templateStart, templateEnd, length }
 * @returns {Array}
 */
export function trimAnnotationsForSubFragment(parentAnns, sf) {
  if (!parentAnns || parentAnns.length === 0) return [];
  const result = [];
  const subStart = sf.templateStart;
  const subEnd = sf.templateEnd;
  const subLen = sf.length;

  for (const a of parentAnns) {
    // No overlap at all
    if (a.end <= subStart || a.start >= subEnd) continue;

    const fullyInside = a.start >= subStart && a.end <= subEnd;
    const type = a.type || 'misc_feature';

    // Point-like: drop on any partial overlap
    if (DROP_ON_TRIM.has(type)) {
      if (fullyInside) {
        result.push({ ...a, start: a.start - subStart, end: a.end - subStart });
      }
      continue;
    }

    // Start codon: only if it still starts at 0 of the sub-fragment (= parent pos subStart)
    if (type === 'start_codon') {
      if (fullyInside && a.start === subStart) {
        result.push({ ...a, start: 0, end: a.end - subStart });
      }
      continue;
    }

    // Stop codon: only if it ends at the sub-fragment's right edge
    if (type === 'stop_codon') {
      if (fullyInside && a.end === subEnd) {
        result.push({ ...a, start: a.start - subStart, end: subLen });
      }
      continue;
    }

    // N-terminal features: only if fully inside AND parent pos 0 is in the sub (subStart === 0)
    if (N_TERMINAL_ONLY.has(type)) {
      if (fullyInside && subStart === 0 && a.start === 0) {
        result.push({ ...a, start: 0, end: a.end });
      }
      continue;
    }

    // Default: trim with flag. Coordinates are clamped to local space.
    const trimmed5 = a.start < subStart;
    const trimmed3 = a.end > subEnd;
    const clipped = {
      ...a,
      start: Math.max(0, a.start - subStart),
      end: Math.min(subLen, a.end - subStart),
      trimmed: trimmed5 || trimmed3,
    };

    // Rename CDS/gene so user knows this isn't the full feature anymore.
    // Idempotent: don't double-append "trimmed" if the name already carries it.
    if (RENAME_ON_TRIM.has(type) && clipped.trimmed && a.name && !a.name.includes('trimmed')) {
      const suffix = trimmed5 && trimmed3 ? ' (trimmed)'
                   : trimmed5 ? " (5' trimmed)"
                   : " (3' trimmed)";
      clipped.name = a.name + suffix;
    }

    result.push(clipped);
  }

  return result;
}
