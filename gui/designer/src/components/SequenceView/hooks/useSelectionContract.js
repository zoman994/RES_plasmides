import { calcTm } from '../../../tm-calculator.js';
import {
  canonicalSequenceCaret,
  describeSequenceSelection,
  selectionSlice,
} from '../lib/selection-range.js';

/**
 * Derived selection ownership kept out of the oversized SequenceView owner.
 * Display endpoints remain unwrapped; consumer ranges are canonical.
 */
export function useSelectionContract({
  fullSeq,
  seqLength,
  circular,
  caretAnchor,
  caretPos,
  selectionMode,
  selectionStrand,
  showSelectionTm,
  tmPoint,
}) {
  const range = describeSequenceSelection({
    anchor: caretAnchor,
    focus: caretPos,
    seqLength,
    circular,
  });
  const wrapsOrigin = !!range?.wrapsOrigin;
  const usesWrapContext = !!range?.usesWrapContext;

  let selectionFrame = null;
  if (range && selectionMode === 'aa') {
    if (selectionStrand === -1) {
      selectionFrame = ((seqLength - range.end) % 3 + 3) % 3;
    } else {
      selectionFrame = ((range.start % 3) + 3) % 3;
    }
  }

  let selectionTm = null;
  if (range && showSelectionTm && tmPoint && selectionMode !== 'aa') {
    const selected = circular
      ? selectionSlice({
        fullSeq, anchor: caretAnchor, focus: caretPos, seqLength, circular: true,
      })
      : (fullSeq || '').slice(Math.max(0, range.start), range.end);
    if (selected.length > 0) {
      const tm = selected.length >= 7 && selected.length <= 150 ? calcTm(selected) : null;
      selectionTm = { tm, len: selected.length };
    }
  }

  // Only a true origin-crossing range is unsafe for scalar write consumers.
  // A small selection drawn wholly in one ghost band canonicalises normally.
  const safeRange = wrapsOrigin ? null : range;
  const safeAnchor = safeRange
    ? safeRange.start
    : (range ? null : canonicalSequenceCaret(caretAnchor, seqLength, circular));
  const safeFocus = safeRange
    ? safeRange.end
    : (range ? null : canonicalSequenceCaret(caretPos, seqLength, circular));
  return {
    range,
    primerRange: range,
    safeRange,
    safeAnchor,
    safeFocus,
    wrapsOrigin,
    usesWrapContext,
    selectionFrame,
    selectionTm,
  };
}
