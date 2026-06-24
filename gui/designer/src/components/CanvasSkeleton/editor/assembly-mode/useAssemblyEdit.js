/**
 * useAssemblyEdit — the in-editor sequence-edit → piece-operation router,
 * extracted from AssemblyShellBody (size-budget §7: keep the shell under the
 * .jsx hard limit; this is the «edit-driven» engine's natural home). Behaviour
 * identical: translates an onSequenceEdit op (assembly coords) into piece
 * operation(s) via the pure `routeAssemblyEdit`, disbands the op-group(s) of
 * every affected piece first (§5.6 / S2 §5.8), applies, shifts SAVED primer
 * coordinates (S3 §5.4), then moves the caret (§5.8).
 */
import { useCallback } from 'react';
import { routeAssemblyEdit, computeSeqDelta } from '../../lib/assembly-edit-router';
import { STRINGS } from '../../../../lib/strings';

const EA = STRINGS.canvasSkeleton.editableAssembly;
// noop reasons that mean "deferred to S2" → surface an info toast; the
// rest (malformed ops) are silent.
const DEFERRED_NOOP = new Set(['sourced-interior', 'intermediate-interior', 'cross-boundary']);

export function useAssemblyEdit({
  draft, boundaries, threshold, actions, statePieces, draftId, sel,
}) {
  const insertSnippetAt = useCallback((sequence, insertAtIndex) => {
    actions.insertSnippet(draftId, {
      sequence, embedsInPrimer: true, name: EA.newBlockName,
    }, insertAtIndex);
  }, [actions, draftId]);

  const onSequenceEdit = useCallback((op) => {
    const result = routeAssemblyEdit(op, draft, boundaries, { threshold });
    if (!result || result.kind === 'noop') {
      if (result && DEFERRED_NOOP.has(result.reason)) {
        actions.showToast({ kind: 'info', message: EA.editDeferred });
      }
      return;
    }
    // §5.6 / S2 §5.8 — disband the op-group of every affected piece first.
    const affected = result.kind === 'plan'
      ? (result.steps || []).map((s) => s.pieceId).filter(Boolean)
      : (result.pieceId ? [result.pieceId] : []);
    let disbanded = false;
    for (const pid of affected) {
      const piece = (statePieces || []).find((p) => p.id === pid);
      if (piece && piece.groupId) { actions.disbandOpGroup(piece.groupId); disbanded = true; }
    }
    if (disbanded) actions.showToast({ kind: 'warning', message: EA.groupDisbanded });

    switch (result.kind) {
      case 'update-inline': {
        const changes = result.targetKind === 'gap'
          ? { gapSequence: result.sequence, gapLength: result.sequence.length, gapHint: 'known' }
          : { sequence: result.sequence, ...(result.kindFlip ? { kind: result.kindFlip } : {}) };
        actions.updatePiece(result.pieceId, changes);
        break;
      }
      case 'remove-block':
        actions.removeSegment(draftId, result.pieceId);
        break;
      case 'new-block':
        insertSnippetAt(result.char, result.insertAtIndex);
        break;
      case 'split-insert': // S2 — insert inside a sourced piece
        actions.splitPiece(result.pieceId, result.atOffset);
        insertSnippetAt(result.char, result.insertAtIndex);
        break;
      case 'mutate': // S2 — equal-length substitution
        for (const m of result.mutations || []) actions.addPieceMutation(result.pieceId, m);
        break;
      case 'trim': // S2 — edge delete in a sourced piece
        actions.updatePiece(result.pieceId, { ranges: [result.range] });
        break;
      case 'split-delete': // S2 — mid delete in a sourced piece
        actions.splitPiece(result.pieceId, result.atOffset, result.deleteLen);
        if (result.insertSeq) insertSnippetAt(result.insertSeq, result.insertAtIndex);
        break;
      case 'plan': // S2 — spanning delete / replace
        for (const step of result.steps || []) {
          if (step.op === 'remove') actions.removeSegment(draftId, step.pieceId);
          else if (step.op === 'trim') actions.updatePiece(step.pieceId, { ranges: [step.range] });
          else if (step.op === 'splice-inline') {
            const ch = step.targetKind === 'gap'
              ? { gapSequence: step.sequence, gapLength: step.sequence.length, gapHint: 'known' }
              : { sequence: step.sequence };
            actions.updatePiece(step.pieceId, ch);
          } else if (step.op === 'insert-snippet') {
            insertSnippetAt(step.sequence, step.insertAtIndex);
          }
        }
        break;
      default: break;
    }
    // S3 §5.4 — maintain SAVED primer coordinates after the edit shifted
    // the assembled sequence (shift right-of / stale-mark in-region).
    const sd = computeSeqDelta(op);
    if (sd) actions.shiftAssemblyPrimers(draftId, sd.atPos, sd.delta);
    // §5.8 — caret follows the edit (insert → +1; delete → in place;
    // replace → after the replacement).
    let nextCaret = null;
    if (op.kind === 'insert') nextCaret = op.pos + 1;
    else if (op.kind === 'delete') nextCaret = op.pos;
    else if (op.kind === 'replace') {
      nextCaret = op.start + (typeof op.replacement === 'string' ? op.replacement.length : 0);
    }
    if (nextCaret != null) {
      sel.setCaretPos(nextCaret);
      sel.setCaretAnchor(nextCaret);
    }
  }, [draft, boundaries, threshold, actions, statePieces, draftId, sel, insertSnippetAt]);

  return { onSequenceEdit };
}
