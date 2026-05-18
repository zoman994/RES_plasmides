/**
 * usePieceHotkey — T5 K3. Registers the «P» hotkey (DEC-T5-02/13)
 * while mounted; on press, if there is a selection and a consumer
 * onCreatePiece, emits an origin:'selection' authoring request. The
 * resolver already skips inputs (piece-create.allowInInput:false,
 * R-T5-1) and skips ids with no registered handler (so «P» types
 * normally elsewhere).
 */
import { useCallback } from 'react';
import { useHotkey } from '../../../lib/hotkeys';

export function usePieceHotkey({ onCreatePiece, caretAnchor, caretPos }) {
  const handler = useCallback(() => {
    if (typeof onCreatePiece !== 'function') return;
    const a = (typeof caretAnchor === 'number' && Number.isFinite(caretAnchor)) ? caretAnchor : null;
    const f = (typeof caretPos === 'number' && Number.isFinite(caretPos)) ? caretPos : null;
    if (a == null || f == null || a === f) return;
    onCreatePiece({
      origin: 'selection',
      rangeStart: Math.min(a, f),
      rangeEnd: Math.max(a, f),
      orientation: 'forward',
    });
  }, [onCreatePiece, caretAnchor, caretPos]);
  useHotkey('piece-create', handler);
}
