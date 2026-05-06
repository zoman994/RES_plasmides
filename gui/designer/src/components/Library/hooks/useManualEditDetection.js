import { useEffect, useRef } from 'react';

/**
 * Detect the first character-level keystroke that would mutate the
 * sequence under the SequenceView caret while the inspector is in
 * EDITABLE mode (M-X.5 K6/K10, DEC-LIB-12 ⚓).
 *
 * Listens window-level keydown so we don't have to thread an
 * additional callback through SequenceView's keyboard hook. Filters
 * by:
 *
 *   1. `armed === true` — caller passes the EDITABLE-pill state.
 *      When read-only, the listener is detached entirely (no idle
 *      cost on the common case).
 *   2. The active element is NOT an input/textarea/contenteditable,
 *      so typing into a TagsEditor or the inline-rename field doesn't
 *      bubble up as a sequence edit.
 *   3. The key is a single A/T/G/C/N/IUPAC character, Backspace, or
 *      Delete. Modifier-key chords (Ctrl/Meta + something) are
 *      ignored — those go through Ctrl+A/C/copy hotkeys etc.
 *
 * On the first match per mount, fires `onFirstEdit({ key, event })`
 * synchronously and **does not** preventDefault — caller decides
 * (typically: open ManualEditConfirmModal, defer the actual
 * character apply). After the first fire the hook self-disarms so
 * subsequent keystrokes don't re-trigger the modal during the same
 * confirm dance. Caller resets by re-mounting the inspector or
 * toggling the `armed` flag back off → on.
 *
 * IUPAC accept set follows annotation-model defaults: ACGTUNRYWSKMBDHV.
 */
const IUPAC_RE = /^[ACGTUNRYWSKMBDHVacgtunrywskmbdhv]$/;
const SEQUENCE_KEYS = new Set(['Backspace', 'Delete']);

function isTypingTarget(target) {
  if (!target) return false;
  const tag = target.tagName ? target.tagName.toLowerCase() : '';
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
  if (target.isContentEditable) return true;
  return false;
}

export function useManualEditDetection({
  armed,
  onFirstEdit,
}) {
  const firedRef = useRef(false);
  // Reset the «already fired» latch whenever `armed` flips. Each EDITABLE
  // → READ-ONLY → EDITABLE cycle gets a fresh chance to fire the modal.
  useEffect(() => {
    firedRef.current = false;
  }, [armed]);

  useEffect(() => {
    if (!armed || typeof window === 'undefined') return undefined;
    const handler = (event) => {
      if (firedRef.current) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;
      const key = event.key;
      const isChar = typeof key === 'string' && key.length === 1 && IUPAC_RE.test(key);
      const isDelete = SEQUENCE_KEYS.has(key);
      if (!isChar && !isDelete) return;
      firedRef.current = true;
      onFirstEdit?.({ key, event });
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [armed, onFirstEdit]);
}
