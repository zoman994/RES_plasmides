/**
 * InlineRenameInput — Sprint M-X.2 K5 (DEC-ANN-05).
 *
 * Renders an absolute-positioned `<input>` over a region's row in
 * AnnotationTrack. Auto-focuses + auto-selects on mount. Save on
 * Enter / blur; cancel on Esc.
 *
 * Position: the orchestrator probes the matching region's bounding
 * box from a containerRef DOM query and passes the resolved (left,
 * top, width, height) — so the input visually replaces the region's
 * label.
 */

import { useEffect, useRef, useState } from 'react';
import { STRINGS } from '../../../lib/strings';

const S = STRINGS.importer.annotationEdit;

export default function InlineRenameInput({
  initialName = '',
  position,           // { left, top, width, height }
  onSave,
  onCancel,
}) {
  const [value, setValue] = useState(initialName);
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    try { el.select?.(); } catch { /* noop */ }
  }, []);

  const stop = (e) => e.stopPropagation();

  return (
    <input
      ref={ref}
      type="text"
      data-testid="sequence-view-inline-rename"
      value={value}
      placeholder={S.renamePlaceholder}
      onChange={(e) => setValue(e.target.value)}
      onPointerDown={stop}
      onMouseDown={stop}
      onClick={stop}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          onSave?.(value);
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          onCancel?.();
        }
      }}
      onBlur={() => onSave?.(value)}
      style={{
        position: 'absolute',
        left: position?.left ?? 0,
        top: position?.top ?? 0,
        width: Math.max(80, position?.width ?? 80),
        height: position?.height ?? 16,
        fontSize: 10,
        fontFamily: 'inherit',
        padding: '0 4px',
        background: 'var(--surface-1, #fff)',
        border: '0.5px solid var(--accent-500, #f97316)',
        borderRadius: 'var(--radius-sm, 3px)',
        outline: 'none',
        zIndex: 10,
        color: 'var(--text-primary, #111)',
      }}
    />
  );
}
