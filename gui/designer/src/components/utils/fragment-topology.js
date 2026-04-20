/**
 * K12 (Sprint 1.7) — fragment topology helpers.
 *
 * Fragment.topology ('linear' | 'circular' | undefined) is OPTIONAL. When
 * present, it overrides the assembly-level `circular` flag for that fragment.
 * Without it, behaviour falls back to assembly.circular.
 *
 * expectedJunctionCount centralizes the "how many junctions does this
 * fragments-array need" rule used by merge/delete/unfold and buildPlainJunctions.
 *   - n === 0 → 0
 *   - n === 1, single fragment, topology=linear OR assembly=linear → 0  (fixes V17)
 *   - n === 1, circular — still 0 in v1.0 (self-closure rendered as arc indicator, no real junction block)
 *   - n >= 2, circular → n
 *   - n >= 2, linear   → n - 1
 */

export function getFragmentTopology(fragment, assemblyCircular) {
  if (!fragment) return assemblyCircular ? 'circular' : 'linear';
  if (fragment.topology === 'circular' || fragment.topology === 'linear') {
    return fragment.topology;
  }
  return assemblyCircular ? 'circular' : 'linear';
}

export function expectedJunctionCount(fragments, assemblyCircular) {
  const n = fragments?.length || 0;
  if (n === 0) return 0;
  if (n === 1) {
    // Single fragment — only linear OR circular-as-arc. No real junction block in v1.0.
    return 0;
  }
  return assemblyCircular ? n : n - 1;
}
