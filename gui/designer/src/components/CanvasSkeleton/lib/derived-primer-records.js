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
import { reverseComplement } from '../../../sequence-utils';
import { alignPrimerBinding } from '../../../lib/primer-binding-alignment';

function bindingSegments(start, end, length, circular) {
  const span = end - start;
  if (!Number.isInteger(start) || !Number.isInteger(end) || span <= 0 || span > length) return null;
  if (start >= 0 && end <= length) return [{ start, end }];
  if (!circular || length <= 0) return null;
  const lo = ((start % length) + length) % length;
  const first = Math.min(span, length - lo);
  const segments = [{ start: lo, end: lo + first }];
  if (first < span) segments.push({ start: 0, end: span - first });
  return segments;
}

function topStrandAt(template, segments) {
  return segments.map(({ start, end }) => template.slice(start, end)).join('');
}

export function deriveAssemblyPrimerRecords(planPrimers, {
  draftId, provenance, anchorPos = 0, idGen = makeId, now = () => Date.now(),
  templateSequence = null, target = null, reactionId = null,
  sourcePieceId = null, variantPieceId = null,
} = {}) {
  const list = Array.isArray(planPrimers) ? planPrimers : [];
  if (list.length === 0) return [];
  const pairId = `pair-${idGen()}`;
  const t = now();
  const anchor = Math.max(0, Number.isFinite(anchorPos) ? anchorPos : 0);
  const canonicalSites = typeof templateSequence === 'string' && target?.entryId
    && target?.resourceHash && (target.topology === 'linear' || target.topology === 'circular');
  const records = list.map((p) => {
    const direction = p.direction === 'reverse' ? 'reverse' : 'forward';
    const tail = typeof p.tailSequence === 'string' ? p.tailSequence
      : (typeof p.tail === 'string' ? p.tail : '');
    const bindingSequence = p.bindingSequence || p.sequence || '';
    const sequence = `${tail}${bindingSequence}`;
    const len = bindingSequence.length;
    const targetLength = Number.isInteger(p.bindingTargetLength) && p.bindingTargetLength > 0
      ? p.bindingTargetLength : len;
    const bindingStartOffset = Number.isInteger(p.bindingStartOffset) ? p.bindingStartOffset : 0;
    const bindingEndOffset = Number.isInteger(p.bindingEndOffset) ? p.bindingEndOffset : 0;
    const siteStart = direction === 'reverse'
      ? anchor + bindingEndOffset - targetLength
      : anchor + bindingStartOffset;
    const siteEnd = siteStart + targetLength;
    const range = direction === 'reverse'
      ? { start: Math.max(0, siteStart), end: anchor + bindingEndOffset }
      : { start: siteStart, end: siteEnd };
    const id = `asmprm-${idGen()}`;
    let trustedTm = p.tmBinding ?? p.tm ?? null;
    let sites;
    if (canonicalSites) {
      const segments = bindingSegments(
        siteStart,
        siteEnd,
        templateSequence.length,
        target.topology === 'circular',
      );
      if (!segments) return null;
      const top = topStrandAt(templateSequence, segments);
      if (top.length !== targetLength) return null;
      const annealedSequence = direction === 'reverse' ? reverseComplement(top) : top;
      const alignment = alignPrimerBinding(bindingSequence, annealedSequence);
      if (alignment.counts.X > 0 || alignment.counts.I > 0 || alignment.counts.D > 0) {
        trustedTm = null;
      }
      sites = [{
        id: `${id}-s0`,
        sourceIndex: 0,
        target: { ...target },
        location: { kind: segments.length > 1 ? 'join' : 'single', segments },
        strand: direction === 'reverse' ? -1 : 1,
        annealedSequence,
        tail,
        meltingTemperature: trustedTm,
        sourceVisibility: 'shown',
        sourceForms: ['designed'],
        alignment,
      }];
    }
    return {
      schemaVersion: 2,
      id,
      rawId: id,
      draftId,
      pairId,
      range,
      direction,
      sequence,
      sequenceSource: 'designed',
      bindingSequence,
      bindingModel: canonicalSites ? 'aligned-v1' : null,
      tm: trustedTm,
      gc: p.gcPercent ?? p.gc ?? null,
      name: p.name || `derived-${direction}`,
      label: p.name || `derived-${direction}`,
      // Provenance lives ONLY in `source` (Node A canon v12).
      source: {
        ...(provenance || { kind: 'derived' }),
        ...(sourcePieceId ? { sourcePieceId } : {}),
        ...(variantPieceId ? { variantPieceId } : {}),
        ...(reactionId ? { reactionId } : {}),
      },
      tail,
      ...(reactionId ? { reactionId } : {}),
      ...(sites ? { sites } : {}),
      autoMode: 'derived',
      mutated: true,
      status: 'derived',
      notes: p.tailPurpose || '',
      createdAt: t,
      updatedAt: t,
      crossesBoundaries: false,
    };
  });
  return records.some((record) => !record) ? [] : records;
}
