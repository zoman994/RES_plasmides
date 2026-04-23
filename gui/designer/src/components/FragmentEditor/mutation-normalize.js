/**
 * Sprint X-fix K1 — convert a local FragmentEditor `mutations[]` entry into
 * the shape applyMutationGit (Plasmid-Git reducer) expects:
 *   { type, dnaPosition, newCodon? | deleteLength? | insertSequence?, label }
 *
 * `seq` is the editor's current local sequence (user has already applied the
 * mutation locally), used to recover newCodon when the raw entry doesn't
 * carry it explicitly (nt_substitution path, commitCodonEdit path).
 */
export function normalizeMutationForGit(m, seq) {
  const pos = m.codonStart ?? m.position
    ?? ((parseInt(m.label?.match(/\d+/)?.[0] || '1') - 1) * 3);

  if (m.type === 'nt_substitution') {
    const codonStart = Math.floor(pos / 3) * 3;
    return { type: 'substitution', dnaPosition: codonStart,
      newCodon: seq.slice(codonStart, codonStart + 3), label: m.label };
  }
  if (m.type === 'nt_deletion') {
    return { type: 'deletion', dnaPosition: pos,
      deleteLength: m.deletedBp || 1, label: m.label };
  }
  if (m.type === 'nt_insertion') {
    return { type: 'insertion', dnaPosition: pos,
      insertSequence: m.insertSequence || '', label: m.label };
  }
  if (m.type === 'deletion') {
    return { type: 'deletion', dnaPosition: pos,
      deleteLength: m.deletedBp || 3, label: m.label };
  }
  if (m.type === 'insertion') {
    return { type: 'insertion', dnaPosition: pos,
      insertSequence: m.insertSequence || '', label: m.label };
  }
  const codonStart = Math.floor(pos / 3) * 3;
  const newCodon = m.newCodon || seq.slice(codonStart, codonStart + 3);
  return { type: 'substitution', dnaPosition: codonStart, newCodon, label: m.label };
}

/**
 * Sprint X-fix K3 — build the variantData payload for `onSavePart` from a
 * live fragment (HEAD replay) + its commits. Sequence comes from liveFragment,
 * `sourceCommits` captures Git history alongside the variant.
 */
export function buildSavePartPayload({ fragment, liveFragment, seq, annotations, domains, customColor, commits }) {
  const applied = commits.filter(c => c.applied !== false).map(c => c.label).filter(Boolean);
  const description = applied.join(', ') || 'mutagenesis variant';
  const headSeq = liveFragment.sequence || seq;
  const headAnns = Array.isArray(liveFragment.annotations) ? liveFragment.annotations : annotations;
  return {
    name: fragment.name,
    type: fragment.type,
    sequence: headSeq,
    length: headSeq.length,
    domains,
    annotations: headAnns,
    customColor: customColor || undefined,
    parentId: fragment.parentId || fragment.id,
    modification: { type: 'mutation', description },
    sourceCommits: Array.isArray(liveFragment.commits)
      ? liveFragment.commits.map(c => ({ ...c, payload: { ...(c.payload || {}) } }))
      : [],
    testResults: [],
  };
}
