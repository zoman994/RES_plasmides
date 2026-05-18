/**
 * SegmentDetailPanel — right-side drawer for one segment (G2
 * DEC-CANVAS-ASM-22). Source (read-only) + range (container-sourced) +
 * RC + colour + label + delete. Orphan source shows a warning + a
 * «Convert to gap» escape hatch (K10).
 */
import { useState } from 'react';
import { useSkeletonState, useSkeletonActions } from '../../store/skeleton-context';
import { selectAssemblyTarget } from '../../store/selectors-pieces';
import { SEGMENT_COLORS } from '../../lib/segment-color-palette';

export default function SegmentDetailPanel({ draftId, segmentId, onClose }) {
  const state = useSkeletonState();
  const actions = useSkeletonActions();

  // T6 K8 — dual-resolve: a zone id projects to a pieces-shaped
  // draft-like; a legacy assemblyDrafts id resolves unchanged.
  const { draft } = selectAssemblyTarget(state, draftId);
  const segment = draft && (draft.segments || []).find((s) => s.id === segmentId);
  const isContainer = segment?.source?.type === 'container';
  const isOrphan = isContainer && segment.source.unavailable;

  // Local edit buffer. The shell remounts this panel per segment
  // (key={selectedSegmentId}), so initial state from props is correct
  // — no prop-sync effect (avoids react-hooks/set-state-in-effect).
  const [start, setStart] = useState(segment?.start ?? 0);
  const [end, setEnd] = useState(segment?.end ?? 0);
  const [label, setLabel] = useState(segment?.label ?? '');

  if (!segment) {
    return (
      <aside data-testid="segment-detail-panel" style={panelStyle}>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Сегмент не найден</div>
        <button type="button" data-testid="segment-detail-close" onClick={onClose} style={closeBtn}>Закрыть</button>
      </aside>
    );
  }

  const onApply = () => {
    if (label !== (segment.label ?? '')) {
      actions.updateSegment(draftId, segmentId, { label });
    }
    if (isContainer
      && (Number(start) !== segment.start || Number(end) !== segment.end)) {
      actions.updateSegmentRange(draftId, segmentId, Number(start), Number(end));
    }
  };

  return (
    <aside data-testid="segment-detail-panel" style={panelStyle}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
        <strong style={{ fontSize: 12.5, flex: 1 }}>Сегмент</strong>
        <button type="button" data-testid="segment-detail-close" onClick={onClose} style={closeBtn}>✕</button>
      </div>

      <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 6 }}>
        Источник: {segment.source?.type === 'container'
          ? (segment.source.sourceContainerName || 'container')
          : segment.source?.type}
      </div>
      {isOrphan && (
        <div
          data-testid="segment-detail-orphan"
          style={{ fontSize: 11, color: 'var(--accent-500, #b85c3e)', marginBottom: 8 }}
        >
          ⚠ Source container удалён.
          <button
            type="button"
            data-testid="segment-detail-convert-gap"
            onClick={() => {
              actions.updateSegment(draftId, segmentId, {
                source: { type: 'manual' },
              });
              onClose();
            }}
            style={{ ...closeBtn, marginLeft: 6, color: 'var(--accent-500, #b85c3e)' }}
          >Convert to gap</button>
        </div>
      )}

      {isContainer && (
        <label style={fieldStyle}>
          Диапазон
          <span style={{ display: 'flex', gap: 6, marginTop: 2 }}>
            <input
              data-testid="segment-detail-start"
              type="number"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              style={numInput}
            />
            <input
              data-testid="segment-detail-end"
              type="number"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              style={numInput}
            />
          </span>
        </label>
      )}

      <label style={{ ...fieldStyle, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <input
          data-testid="segment-detail-rc"
          type="checkbox"
          checked={!!segment.reverseComplement}
          onChange={() => actions.toggleSegmentRc(draftId, segmentId)}
        />
        Reverse complement
      </label>

      <div style={fieldStyle}>
        Цвет
        <span style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 2 }}>
          {SEGMENT_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              data-testid="segment-detail-color"
              data-color={c}
              onClick={() => actions.updateSegment(draftId, segmentId, { color: c })}
              title={c}
              style={{
                width: 16, height: 16, borderRadius: 3, background: c, cursor: 'pointer',
                border: segment.color === c ? '2px solid var(--text-primary)' : '1px solid var(--border-subtle)',
              }}
            />
          ))}
        </span>
      </div>

      <label style={fieldStyle}>
        Метка
        <input
          data-testid="segment-detail-label"
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          style={{ ...numInput, width: '100%', marginTop: 2 }}
        />
      </label>

      <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
        <button type="button" data-testid="segment-detail-apply" onClick={onApply} style={primaryBtn}>
          Применить
        </button>
        <button
          type="button"
          data-testid="segment-detail-delete"
          onClick={() => { actions.removeSegment(draftId, segmentId); onClose(); }}
          style={{ ...closeBtn, color: 'var(--accent-500, #b85c3e)' }}
        >
          Удалить
        </button>
      </div>
    </aside>
  );
}

const panelStyle = {
  width: 300,
  flexShrink: 0,
  borderLeft: '1px solid var(--border-subtle)',
  background: 'var(--surface-2)',
  padding: 12,
  overflowY: 'auto',
  fontSize: 12,
};
const fieldStyle = { display: 'flex', flexDirection: 'column', fontSize: 11, color: 'var(--text-secondary)', margin: '8px 0' };
const numInput = {
  fontSize: 11.5, padding: '4px 6px', border: '1px solid var(--border-subtle)',
  borderRadius: 4, background: 'var(--surface-1)', color: 'var(--text-primary)', width: 70,
};
const closeBtn = {
  fontSize: 11, padding: '4px 8px', background: 'transparent',
  border: '1px solid var(--border-subtle)', borderRadius: 4, cursor: 'pointer', color: 'var(--text-secondary)',
};
const primaryBtn = {
  fontSize: 11.5, padding: '5px 14px', background: 'var(--accent-500, #b85c3e)',
  color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600,
};
