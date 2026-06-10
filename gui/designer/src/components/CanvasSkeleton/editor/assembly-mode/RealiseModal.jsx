/**
 * RealiseModal — A4 «Realise as DAG» (DEC-CANVAS-ASM-REAL-10). Per
 * internal boundary: a MethodPickerCard prefilled with the auto-suggest;
 * a live RealiseDagPreview; confirm dispatches ASSEMBLY_REALISE.
 * Closes on Esc / click-outside (ui-interactions modal contract).
 */
import { useEffect, useMemo } from 'react';
import {
  useSkeletonState, useSkeletonActions, useAssemblyDraftById,
} from '../../store/skeleton-context';
import { suggestMethodForBoundary } from '../../lib/assembly-realise-suggest';
import { methodsFromJunctions } from '../../lib/junction-derive';
import MethodPickerCard from './MethodPickerCard';
import RealiseDagPreview from './RealiseDagPreview';

const EMPTY_JUNCTIONS = {};

export default function RealiseModal({ draftId, onClose }) {
  const state = useSkeletonState();
  const actions = useSkeletonActions();
  const draft = useAssemblyDraftById(draftId);
  const segs = draft ? draft.segments : [];
  const boundaryCount = Math.max(0, segs.length - 1);

  const segName = (i) => {
    const s = segs[i];
    if (!s) return `#${i + 1}`;
    return s.label || s.source?.sourceContainerName || `#${i + 1}`;
  };

  const suggestions = useMemo(() => {
    const out = [];
    for (let i = 0; i < boundaryCount; i += 1) {
      out.push(suggestMethodForBoundary(state, draftId, i));
    }
    return out;
  }, [state, draftId, boundaryCount]);

  // J9 — the per-boundary methods come from the junctions on the strip (the
  // source of truth set by JunctionControl), NOT a radio picker. Falls back to
  // the A4 suggestion, then gibson. realiseAssembly's signature is unchanged.
  const zone = (state.zones || []).find((z) => z.id === draftId) || null;
  const zoneJunctions = (zone && zone.junctions) || EMPTY_JUNCTIONS;
  const methods = useMemo(
    () => methodsFromJunctions(draft, zoneJunctions, suggestions),
    [draft, zoneJunctions, suggestions],
  );

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const allChosen = Object.keys(methods).length >= boundaryCount;

  const confirm = () => {
    actions.realiseAssembly(draftId, methods);
    onClose();
  };

  return (
    <div
      role="dialog"
      data-testid="realise-modal"
      onClick={onClose}
      style={{
        position: 'absolute', inset: 0, zIndex: 120,
        background: 'rgba(28,25,23,0.34)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 620, maxHeight: '86%', display: 'flex', flexDirection: 'column',
          background: 'var(--surface-1)', color: 'var(--text-primary)',
          border: '1px solid var(--border-subtle)', borderRadius: 8,
          boxShadow: '0 10px 32px rgba(28,25,23,0.26)', overflow: 'hidden',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', padding: '8px 12px', borderBottom: '1px solid var(--border-subtle)', background: 'var(--surface-2)' }}>
          <strong style={{ fontSize: 12.5, flex: 1 }}>
            Реализовать «{draft?.name}» как DAG
          </strong>
          <button type="button" data-testid="realise-cancel-x" onClick={onClose} style={ghostBtn}>✕</button>
        </div>

        <div style={{ padding: '8px 12px', fontSize: 11, color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-subtle)' }}>
          {segs.length} сегмент(ов) · {boundaryCount} границ(ы) → {segs.length} PCR ops + {boundaryCount} junctions + продукт
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 12 }}>
          {boundaryCount === 0 && (
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
              Нужно ≥2 сегмента для сборки в DAG.
            </div>
          )}
          {Array.from({ length: boundaryCount }).map((_, i) => (
            <MethodPickerCard
              key={i}
              index={i}
              leftName={segName(i)}
              rightName={segName(i + 1)}
              suggested={suggestions[i]}
              method={methods[i]}
            />
          ))}
          <div style={{ marginTop: 10 }}>
            <RealiseDagPreview draftId={draftId} perBoundaryMethods={methods} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, padding: '8px 12px', borderTop: '1px solid var(--border-subtle)', background: 'var(--surface-2)' }}>
          <span style={{ flex: 1 }} />
          <button type="button" data-testid="realise-cancel" onClick={onClose} style={ghostBtn}>Отмена</button>
          <button
            type="button"
            data-testid="realise-confirm"
            disabled={!allChosen || boundaryCount === 0}
            onClick={confirm}
            style={{
              ...primaryBtn,
              opacity: (!allChosen || boundaryCount === 0) ? 0.5 : 1,
              cursor: (!allChosen || boundaryCount === 0) ? 'not-allowed' : 'pointer',
            }}
          >🪄 Реализовать</button>
        </div>
      </div>
    </div>
  );
}

const ghostBtn = { fontSize: 11, padding: '4px 10px', background: 'transparent', border: '1px solid var(--border-subtle)', borderRadius: 4, cursor: 'pointer', color: 'var(--text-secondary)' };
const primaryBtn = { fontSize: 11.5, padding: '5px 16px', background: 'var(--accent-500,#b85c3e)', color: '#fff', border: 'none', borderRadius: 4, fontWeight: 600 };
