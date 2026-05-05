/**
 * Assembly utility functions — pure logic, no React/store dependency.
 * Extracted from App.jsx for reuse and testability.
 */
import { expectedJunctionCount } from './components/utils/fragment-topology';

/** Estimate assembly efficiency based on fragment count and method. */
export function estimateEfficiency(count, method) {
  if (method === 'golden_gate') {
    if (count <= 4) return { pct: '>90%', color: 'green' };
    if (count <= 8) return { pct: '~70%', color: 'green' };
    if (count <= 12) return { pct: '~50%', color: 'amber' };
    return { pct: '<30%', color: 'red' };
  }
  if (count <= 2) return { pct: '~95%', color: 'green' };
  if (count === 3) return { pct: '~80%', color: 'green' };
  if (count === 4) return { pct: '~50%', color: 'amber' };
  if (count === 5) return { pct: '~30%', color: 'amber' };
  return { pct: '<20%', color: 'red' };
}

/** Plan hierarchical assembly stages (pairwise merge until ≤ target groups). */
export function planAssemblyStages(frags, _method, maxParts) {
  const target = maxParts === 0
    ? (frags.length <= 3 ? frags.length : 3)
    : Math.min(maxParts, frags.length);
  if (frags.length <= target) return [{ round: 0, groups: [frags.map((_, i) => i)] }];

  const stages = [];
  let currentGroups = frags.map((_, i) => [i]);
  let round = 1;
  while (currentGroups.length > target) {
    const merged = [];
    for (let i = 0; i < currentGroups.length; i += 2) {
      merged.push(i + 1 < currentGroups.length
        ? [...currentGroups[i], ...currentGroups[i + 1]]
        : currentGroups[i]);
    }
    stages.push({ round, groups: merged.map(g => [...g]) });
    currentGroups = merged;
    round++;
  }
  return stages;
}

/** Build plain junctions array (no auto-adjust, used after splits).
 *  K12 — uses expectedJunctionCount for the single-fragment V17 fix.
 */
export function buildPlainJunctions(frags, asmType, isCirc) {
  const count = expectedJunctionCount(frags, isCirc);
  return Array.from({ length: count }, () => ({
    type: asmType === 'golden_gate' ? 'golden_gate' : 'overlap',
    overlapMode: 'split', overlapLength: 30, tmTarget: 62, calcMode: 'length',
    enzyme: 'BsaI', overhang: '',
  }));
}

// `adjustDomains` and `convertDomainsToAnnotations` were removed in the
// v0.6 architectural shift away from a separate domains[] field — every
// domain-level entity now lives in annotations[] with level: 'detail'.
// See ⚓ DECISIONS.md ("ВСЁ в annotations[]"). The migration pass that
// used `convertDomainsToAnnotations` ran once during the v0.5 → v0.6
// upgrade and is no longer reachable.
