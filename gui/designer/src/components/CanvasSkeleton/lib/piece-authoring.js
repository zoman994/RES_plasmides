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

/**
 * Способ В-2 (PRIMER-LIVE-1) — a piece from a RESOLVED PCR product.
 *
 * The difference from `buildPieceFromExistingPrimers` is where the landings
 * come from. That builder searches the template with `indexOf`, which answers
 * about whichever copy it finds first — on a plasmid with a repeated site that
 * is not the site the user clicked. Here the two landings are already decided
 * by `resolvePcrProduct`, and they travel WITH the piece so nothing downstream
 * has to guess them again.
 *
 * The primer snapshots are deep copies on purpose. A reaction has to be able
 * to say what it was primed with after the pool has moved on — and after the
 * file has been opened on a machine whose freezer contains none of it.
 *
 * @param {object} container the template container
 * @param {object} resolved  a successful `resolvePcrProduct` result
 */
export function buildPieceFromPcrProduct(container, resolved) {
  if (!container || !resolved || resolved.ok !== true) {
    throw new Error('buildPieceFromPcrProduct: нужен успешный результат resolvePcrProduct');
  }
  const { product } = resolved;
  const snapshot = (side) => ({
    id: side.primerId,
    name: side.name ?? null,
    sequence: side.fullSequence,
    bindingSequence: side.bindingSequence ?? null,
    tail: side.tail ?? null,
    direction: side.direction,
    occurrenceKey: side.key,
    start: side.start,
    end: side.end,
  });
  // An origin-crossing product is still an ordinary PCR — the coordinates wrap,
  // the chemistry does not change, and calling it inverse PCR here would put a
  // different reaction in the biolog's protocol. But it cannot be ONE range:
  // `start > end` is rejected by the piece invariant, so the wrap is two real
  // spans on the same source, with `sourceIds` kept parallel to them.
  const ranges = (product.templateRanges || [{ start: product.start, end: product.end }])
    .map((r) => ({
      sourceId: container.id,
      start: r.start,
      end: r.end,
      orientation: 'forward',
    }));

  return {
    sourceIds: ranges.map(() => container.id),
    ranges,
    origin: 'pcr-occurrences',
    acquisitionMethod: 'pcr',
    acquisitionParams: {
      primerPairId: {
        forward: product.forward.fullSequence,
        reverse: product.reverse.fullSequence,
      },
      // WHICH landings were chosen. Without these a reader with two identical
      // sites cannot reconstruct which one the product came from.
      occurrenceKeys: [product.forward.key, product.reverse.key],
      primerSnapshots: {
        forward: snapshot(product.forward),
        reverse: snapshot(product.reverse),
      },
      // The product ITSELF. Everything downstream — assembly preview, export,
      // execution — must show what the biolog approved, and a template slice
      // is not that: it has no 5' tail and no deliberate substitution in it.
      productSequence: product.sequence,
      productLength: product.length,
      wrapsOrigin: product.wrapsOrigin === true,
      // WHICH molecule, and WHICH VERSION of it, this product was resolved
      // against. Coordinates alone cannot say whether they still mean anything.
      documentIdentity: product.documentIdentity ?? null,
    },
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
