/**
 * useSidebarCollapsed — Sprint StartScreen-Pixel.
 *
 * State machine for the StartScreen sidebar collapse:
 *   • Default: expanded (232 px). Persisted in localStorage
 *     under `sidebar.collapsed` (boolean).
 *   • Toggle via:
 *     – ‹‹ button click in sidebar header
 *     – Ctrl+B hotkey (anywhere in the StartScreen)
 *   • Auto-collapse when window.innerWidth < 1100 px,
 *     UNLESS the user has manually overridden (key
 *     `sidebar.manual-override` flips on the first click).
 *
 * Returns `{ collapsed, toggle, expand, collapse }`.
 */
import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY_COLLAPSED = 'sidebar.collapsed';
const STORAGE_KEY_MANUAL = 'sidebar.manual-override';
const NARROW_THRESHOLD = 1100;

function readBool(key) {
  try {
    const v = localStorage.getItem(key);
    if (v === 'true') return true;
    if (v === 'false') return false;
  } catch { /* private mode / jsdom */ }
  return null;
}

function writeBool(key, value) {
  try {
    localStorage.setItem(key, value ? 'true' : 'false');
  } catch { /* ignore */ }
}

function initialCollapsed() {
  const stored = readBool(STORAGE_KEY_COLLAPSED);
  if (stored !== null) return stored;
  if (typeof window !== 'undefined' && window.innerWidth < NARROW_THRESHOLD) return true;
  return false;
}

export function useSidebarCollapsed() {
  const [collapsed, setCollapsed] = useState(initialCollapsed);

  const persist = useCallback((value, manual = false) => {
    writeBool(STORAGE_KEY_COLLAPSED, value);
    if (manual) writeBool(STORAGE_KEY_MANUAL, true);
  }, []);

  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      persist(next, true);
      return next;
    });
  }, [persist]);
  const expand = useCallback(() => {
    setCollapsed(false);
    persist(false, true);
  }, [persist]);
  const collapse = useCallback(() => {
    setCollapsed(true);
    persist(true, true);
  }, [persist]);

  // Ctrl+B hotkey. Window-level so the binding works even when
  // focus is in an input (but skip inputs to avoid clobbering
  // Ctrl+B as «bold» if a future RichTextEditor lands).
  useEffect(() => {
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key !== 'b' && e.key !== 'B' && e.code !== 'KeyB') return;
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.target?.isContentEditable) return;
      e.preventDefault();
      toggle();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle]);

  // Auto-collapse on narrow viewport — runs once per resize, gated
  // by the manual-override flag so user-driven expand sticks.
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onResize = () => {
      const manual = readBool(STORAGE_KEY_MANUAL) === true;
      if (manual) return;
      const narrow = window.innerWidth < NARROW_THRESHOLD;
      setCollapsed((prev) => {
        if (prev === narrow) return prev;
        writeBool(STORAGE_KEY_COLLAPSED, narrow);
        return narrow;
      });
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return { collapsed, toggle, expand, collapse };
}
