/**
 * useResizableSplit — drag-to-resize for a split-pane divider (Игорь: «везде где
 * есть разделения окон они должны иметь возможность двигать [разделитель], чтобы
 * изменять рабочие области»).
 *
 * Drives ONE controlled pane's size (px); the sibling pane flexes to fill the
 * rest. Works for a horizontal split (axis 'x' → resize width, vertical divider
 * line) or a vertical split (axis 'y' → resize height, horizontal divider line),
 * and for the controlled pane on the START side (left/top) or END side
 * (right/bottom). Pointer-based (touch-friendly, setPointerCapture), keyboard-
 * accessible, double-click resets, and the chosen size persists in localStorage.
 *
 * Usage:
 *   const containerRef = useRef(null);
 *   const { size, separatorProps, dragging } = useResizableSplit({
 *     axis: 'x', side: 'start', initial: 340, min: 240, keepOther: 360,
 *     storageKey: 'align-input-w', containerRef,
 *   });
 *   <div ref={containerRef} style={{ display:'flex' }}>
 *     <div style={{ width: size, flex: `0 0 ${size}px` }}>…fixed pane…</div>
 *     <ResizeHandle axis="x" dragging={dragging} {...separatorProps} />
 *     <div style={{ flex: 1 }}>…flex pane…</div>
 *   </div>
 */
import { useCallback, useEffect, useRef, useState } from 'react';

const KEYBOARD_STEP = 24; // px per arrow keypress

/**
 * Pure size math: given the drag, return the controlled pane's clamped new size.
 * @param {{startSize:number, startCoord:number, coord:number, side?:'start'|'end', min?:number, max?:number}} p
 * @returns {number}
 */
export function computeResizedSize({ startSize, startCoord, coord, side = 'start', min = 0, max = Infinity }) {
  // START pane (left/top) grows as the pointer moves in the + direction
  // (right/down); END pane (right/bottom) grows as it moves in the − direction.
  const delta = side === 'end' ? (startCoord - coord) : (coord - startCoord);
  return Math.max(min, Math.min(max, startSize + delta));
}

function readStored(key) {
  if (!key || typeof window === 'undefined' || !window.localStorage) return null;
  try {
    const v = window.localStorage.getItem(key);
    if (v == null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  } catch { return null; }
}

function writeStored(key, value) {
  if (!key || typeof window === 'undefined' || !window.localStorage) return;
  try { window.localStorage.setItem(key, String(Math.round(value))); } catch { /* quota / private mode — ignore */ }
}

export function useResizableSplit({
  axis = 'x',
  side = 'start',
  initial,
  min = 120,
  // The OTHER (flexible) pane is kept at least this many px — max size of the
  // controlled pane is `container - keepOther`. Measured from containerRef.
  keepOther = 200,
  storageKey,
  containerRef,
} = {}) {
  const [size, setSize] = useState(() => readStored(storageKey) ?? initial);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef(null);

  const getMax = useCallback(() => {
    const el = containerRef && containerRef.current;
    if (!el) return Infinity;
    const total = axis === 'x' ? el.clientWidth : el.clientHeight;
    if (!total) return Infinity;
    return Math.max(min, total - keepOther);
  }, [axis, keepOther, min, containerRef]);

  const clampNow = useCallback((raw) => Math.max(min, Math.min(getMax(), raw)), [min, getMax]);

  // Persist whenever the size settles, and re-clamp if the container shrinks.
  useEffect(() => { writeStored(storageKey, size); }, [storageKey, size]);
  useEffect(() => {
    const onResize = () => setSize((s) => clampNow(s));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [clampNow]);

  const onPointerDown = useCallback((e) => {
    if (e.button != null && e.button !== 0) return; // primary button only
    const coord = axis === 'x' ? e.clientX : e.clientY;
    dragRef.current = { startCoord: coord, startSize: size };
    setDragging(true);
    try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch { /* ignore */ }
    e.preventDefault();
  }, [axis, size]);

  const onPointerMove = useCallback((e) => {
    if (!dragRef.current) return;
    const coord = axis === 'x' ? e.clientX : e.clientY;
    setSize(computeResizedSize({
      startSize: dragRef.current.startSize,
      startCoord: dragRef.current.startCoord,
      coord, side, min, max: getMax(),
    }));
  }, [axis, side, min, getMax]);

  const endDrag = useCallback((e) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setDragging(false);
    try { e?.currentTarget?.releasePointerCapture?.(e.pointerId); } catch { /* ignore */ }
  }, []);

  const onKeyDown = useCallback((e) => {
    const inc = axis === 'x' ? 'ArrowRight' : 'ArrowDown';
    const dec = axis === 'x' ? 'ArrowLeft' : 'ArrowUp';
    if (e.key === inc || e.key === dec) {
      e.preventDefault();
      const dir = e.key === inc ? 1 : -1;
      const signed = side === 'end' ? -dir : dir; // END pane grows toward − coord
      setSize((s) => clampNow(s + signed * KEYBOARD_STEP));
    } else if (e.key === 'Home' || e.key === 'Enter') {
      e.preventDefault();
      setSize(clampNow(initial)); // reset
    }
  }, [axis, side, clampNow, initial]);

  const reset = useCallback(() => setSize(clampNow(initial)), [clampNow, initial]);

  const separatorProps = {
    role: 'separator',
    'aria-orientation': axis === 'x' ? 'vertical' : 'horizontal',
    'aria-valuenow': Math.round(size),
    tabIndex: 0,
    onPointerDown,
    onPointerMove,
    onPointerUp: endDrag,
    onPointerCancel: endDrag,
    onKeyDown,
    onDoubleClick: reset,
  };

  return { size, setSize, dragging, separatorProps, reset };
}
