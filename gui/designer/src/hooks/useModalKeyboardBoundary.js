import {
  useCallback, useEffect, useLayoutEffect, useRef,
} from 'react';

// Modal ownership is process-local UI state, deliberately separate from the
// product store. Entries are exact hook instances in mount order so nested
// dialogs can hand Escape back without guessing which component remains open.
const modalStack = [];
let windowListenerAttached = false;

function isPlainEscape(event) {
  return String(event?.key || '').toLowerCase() === 'escape'
    && !event?.ctrlKey && !event?.metaKey && !event?.altKey && !event?.shiftKey;
}

function closeTopmost(event) {
  if (!isPlainEscape(event) || event.defaultPrevented || event.repeat) return false;
  const top = modalStack[modalStack.length - 1];
  if (!top) return false;
  event.preventDefault();
  event.stopPropagation();
  top.onCloseRef.current?.();
  return true;
}

function onWindowKeyDown(event) {
  const top = modalStack[modalStack.length - 1];
  if (top?.root && event.target?.nodeType && top.root.contains(event.target)) return;
  if (!closeTopmost(event)) return;
  // This is the focus-outside (or underneath-another-modal) path. Capture it
  // before the hidden target can interpret the same physical Escape.
  event.stopImmediatePropagation?.();
}

function syncWindowListener() {
  if (typeof window === 'undefined') return;
  if (modalStack.length > 0 && !windowListenerAttached) {
    window.addEventListener('keydown', onWindowKeyDown, true);
    windowListenerAttached = true;
  } else if (modalStack.length === 0 && windowListenerAttached) {
    window.removeEventListener('keydown', onWindowKeyDown, true);
    windowListenerAttached = false;
  }
}

function registerModal(entry) {
  modalStack.push(entry);
  syncWindowListener();
  return () => {
    const index = modalStack.indexOf(entry);
    if (index >= 0) modalStack.splice(index, 1);
    syncWindowListener();
  };
}

/**
 * Props for a modal backdrop/root. The root bubble handler lets controls see
 * their key first, then prevents React parents from acting on the same event.
 * A window capture listener owns Escape when focus stayed outside the top root.
 */
export default function useModalKeyboardBoundary(onClose, { active = true } = {}) {
  const onCloseRef = useRef(onClose);
  const entryRef = useRef({ onCloseRef, root: null });

  useLayoutEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!active) return undefined;
    return registerModal(entryRef.current);
  }, [active]);

  const setRoot = useCallback((root) => {
    entryRef.current.root = root;
  }, []);

  const onKeyDown = useCallback((event) => {
    if (isPlainEscape(event) && !event.defaultPrevented) closeTopmost(event);
    // Target handlers have already run (bubble phase); do not let a portal's
    // React ancestry or another surface interpret this key as its own action.
    event.stopPropagation();
  }, []);

  return {
    ref: setRoot,
    'data-modal-open': '',
    'data-block-global-hotkeys': 'true',
    onKeyDown,
  };
}
