/**
 * derived-primer-records — turn DESIGNED mutagenesis primers
 * (computeMutagenesisStrategy shape: {name, sequence, bindingSequence,
 * tailSequence, tmBinding, gcPercent, direction}) into canonical
 * assembly-pool primer records (the WRITE_ASSEMBLY_PRIMER record shape),
 * tagged with project + assembly provenance in `source`
 * (Игорь 21.06.2026 — «праймеры в пуле получают отметку отношения к проекту
 * и сборке»).
 *
 * Why a separate path (not WRITE_ASSEMBLY_PRIMER): a KLD primer carries the
 * mutant base INSIDE it — it is not a range slice of the assembly sequence,
 * so it must be stored pre-designed, not re-derived from a range. `anchorPos`
 * (assembly coord of the edit) positions the pair so they still render on the
 * sequence: fwd starts at the edit, rev ends just before it.
 *
 * Pure: `idGen`/`now` injectable for deterministic tests.
 */
import { makeId } from '../../../lib/ids';

export function deriveAssemblyPrimerRecords(planPrimers, {
  draftId, provenance, anchorPos = 0, idGen = makeId, now = () => Date.now(),
} = {}) {
  const list = Array.isArray(planPrimers) ? planPrimers : [];
  if (list.length === 0) return [];
  const pairId = `pair-${idGen()}`;
  const t = now();
  const anchor = Math.max(0, Number.isFinite(anchorPos) ? anchorPos : 0);
  return list.map((p) => {
    const direction = p.direction === 'reverse' ? 'reverse' : 'forward';
    const len = (p.sequence || '').length;
    const range = direction === 'reverse'
      ? { start: Math.max(0, anchor - len), end: anchor }
      : { start: anchor, end: anchor + len };
    return {
      id: `asmprm-${idGen()}`,
      draftId,
      pairId,
      range,
      direction,
      sequence: p.sequence || '',
      bindingSequence: p.bindingSequence || p.sequence || '',
      tm: p.tmBinding ?? p.tm ?? null,
      gc: p.gcPercent ?? p.gc ?? null,
      name: p.name || `derived-${direction}`,
      label: p.name || `derived-${direction}`,
      // Provenance lives ONLY in `source` (Node A canon v12).
      source: provenance || { kind: 'derived' },
      tail: p.tailSequence || p.tail || '',
      autoMode: 'derived',
      mutated: true,
      status: 'derived',
      notes: p.tailPurpose || '',
      createdAt: t,
      updatedAt: t,
      crossesBoundaries: false,
    };
  });
}
