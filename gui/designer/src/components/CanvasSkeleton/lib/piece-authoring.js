/**
 * piece-authoring — pure builders for the 4 ways to author a piece
 * (T5 K1, DEC-T5-05/08/14). Return PARTIAL piece data; id / color /
 * timestamps are stamped by the CREATE_PIECE reducer (T1). No dispatch.
 */
import { reverseComplement } from '../../../sequence-utils';

/** Способ А — selection range. */
export function buildPieceFromSelection(container, rangeStart, rangeEnd, orientation = 'forward') {
  return {
    sourceIds: [container.id],
    ranges: [{
      sourceId: container.id,
      start: Math.min(rangeStart, rangeEnd),
      end: Math.max(rangeStart, rangeEnd),
      orientation,
    }],
    origin: 'selection',
    acquisitionMethod: 'undefined',
    acquisitionParams: {},
  };
}

/** Способ Б — feature click. Name + functionalLabel pre-filled. */
export function buildPieceFromFeature(container, feature) {
  return {
    name: feature.name,
    sourceIds: [container.id],
    ranges: [{
      sourceId: container.id,
      start: feature.start,
      end: feature.end,
      orientation: feature.strand === -1 ? 'reverse' : 'forward',
    }],
    origin: 'feature',
    acquisitionMethod: 'undefined',
    acquisitionParams: {},
    functionalLabel: feature.type || feature.name,
  };
}

/**
 * Способ В — existing primers. fwd located on the top strand; the
 * reverse-complement of the reverse primer must occur downstream of
 * fwd. Amplicon = [fwdStart, revRCEnd). Throws on no binding.
 */
export function buildPieceFromExistingPrimers(container, forwardSeq, reverseSeq) {
  const sequence = String(container.sequence || '').toUpperCase();
  const fwd = String(forwardSeq || '').toUpperCase();
  const revRC = reverseComplement(String(reverseSeq || '').toUpperCase());
  const fwdStart = sequence.indexOf(fwd);
  if (fwdStart < 0) throw new Error('Прямой праймер не найден в источнике');
  const revStart = sequence.indexOf(revRC, fwdStart + fwd.length);
  if (revStart < 0) throw new Error('Обратный праймер не найден в источнике после прямого');
  return {
    sourceIds: [container.id],
    ranges: [{
      sourceId: container.id,
      start: fwdStart,
      end: revStart + revRC.length,
      orientation: 'forward',
    }],
    origin: 'existing-primers',
    acquisitionMethod: 'pcr',
    acquisitionParams: { primerPairId: { forward: forwardSeq, reverse: reverseSeq } },
  };
}

/** Способ Г — newly written primers (V72-V74 mechanism) + selection. */
export function buildPieceFromNewPrimers(container, primerPair, selectionRange) {
  return {
    sourceIds: [container.id],
    ranges: [{
      sourceId: container.id,
      start: selectionRange.start,
      end: selectionRange.end,
      orientation: 'forward',
    }],
    origin: 'new-primers',
    acquisitionMethod: 'pcr',
    acquisitionParams: {
      primerPairId: {
        forward: primerPair.forward.sequence,
        reverse: primerPair.reverse.sequence,
      },
    },
  };
}
