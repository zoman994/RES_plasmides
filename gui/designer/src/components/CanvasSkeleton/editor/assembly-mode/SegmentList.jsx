/**
 * SegmentList — footer table of the assembly's segments (G2
 * DEC-CANVAS-ASM-13 footer). Click a row → open SegmentDetailPanel.
 * Reorder via ▲ / ▼ buttons (G2 R5 fallback — predictable, no fragile
 * HTML5 row DnD). Orphan rows get a ⚠ badge (K10).
 */
import { useSkeletonActions } from '../../store/skeleton-context';

// K6 — strip iconography (SPEC §5.3). pieceKind is set by draftFromZone
// for zone-projected drafts; legacy drafts fall back to source.type.
const KIND_ICON = {
  sourced: '🧬',
  snippet: '✦',
  synthesis: '🧪',
  intermediate: '📦',
  gap: '◊',
};
function effectiveKind(seg) {
  if (seg && seg.pieceKind && KIND_ICON[seg.pieceKind]) return seg.pieceKind;
  if (seg && seg.source && seg.source.type === 'manual') return 'gap';
  return 'sourced';
}

function rowSource(seg, idx) {
  if (seg.source?.type === 'container') {
    return `${seg.source.sourceContainerName || 'container'} [${seg.start}:${seg.end}]`;
  }
  if (seg.source?.type === 'manual') {
    return seg.gapKind ? `gap · ${seg.gapKind}` : 'manual';
  }
  if (seg.source?.type === 'imported') return seg.source.sourceLabel || 'imported';
  return `сегмент ${idx + 1}`;
}

export default function SegmentList({
  draft, boundaries, orphanIds, selectedSegmentId, onSelectSegment,
  // K7 — optional grouping controls. When `onToggleSelect` is provided
  // SegmentList renders a checkbox per row + a «🔗 Сшить» button once
  // `selectedSegmentIds` has ≥2 entries; otherwise these are no-ops and
  // the legacy footer renders unchanged.
  selectedSegmentIds, onToggleSelect, onSew,
}) {
  const actions = useSkeletonActions();
  const segs = draft.segments || [];
  const selectionEnabled = typeof onToggleSelect === 'function';
  const selSet = selectedSegmentIds instanceof Set
    ? selectedSegmentIds
    : new Set(Array.isArray(selectedSegmentIds) ? selectedSegmentIds : []);
  const sewVisible = selectionEnabled && selSet.size >= 2;

  return (
    <div
      data-testid="assembly-segment-list"
      style={{
        flexShrink: 0,
        maxHeight: 168,
        overflowY: 'auto',
        borderTop: '1px solid var(--border-subtle)',
        background: 'var(--surface-2)',
        fontSize: 11,
      }}
    >
      {sewVisible && (
        <div style={{ padding: '6px 10px', background: 'var(--accent-wash, rgba(184,92,62,0.10))', borderBottom: '1px solid var(--accent-500, #b85c3e)' }}>
          <button
            type="button"
            data-testid="segment-list-sew"
            onClick={() => onSew && onSew(Array.from(selSet))}
            style={{
              fontSize: 11.5, padding: '4px 12px',
              background: 'var(--accent-500, #b85c3e)', color: '#fff',
              border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600,
            }}
          >🔗 Сшить ({selSet.size})</button>
        </div>
      )}
      <div style={{ display: 'flex', padding: '4px 10px', color: 'var(--text-tertiary)', fontWeight: 600, position: 'sticky', top: 0, background: 'var(--surface-2)' }}>
        {selectionEnabled && <span style={{ width: 22 }} />}
        <span style={{ width: 24 }}>#</span>
        <span style={{ width: 18 }} />
        <span style={{ width: 22 }} />
        <span style={{ flex: 1 }}>Источник</span>
        <span style={{ width: 64 }}>Длина</span>
        <span style={{ width: 36 }}>RC</span>
        <span style={{ width: 96, textAlign: 'right' }}>Действия</span>
      </div>
      {segs.length === 0 && (
        <div style={{ padding: 10, color: 'var(--text-tertiary)' }}>
          Сегментов нет. Перетащите контейнер или «+ Сегмент».
        </div>
      )}
      {segs.map((seg, i) => {
        const b = boundaries[i];
        const len = b ? b.endOnAssembly - b.startOnAssembly : (seg.length || 0);
        const isOrphan = orphanIds && orphanIds.has(seg.id);
        const selected = seg.id === selectedSegmentId;
        return (
          <div
            key={seg.id}
            data-testid="assembly-segment-row"
            data-segment-id={seg.id}
            data-orphan={isOrphan ? 'true' : 'false'}
            onClick={() => onSelectSegment(seg.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '5px 10px',
              borderTop: '1px solid var(--border-subtle)',
              background: selected ? 'var(--surface-3, rgba(184,92,62,0.10))' : 'transparent',
              cursor: 'pointer',
            }}
          >
            {selectionEnabled && (
              <span style={{ width: 22 }}>
                <input
                  type="checkbox"
                  data-testid={`segment-select-${seg.id}`}
                  checked={selSet.has(seg.id)}
                  onClick={(e) => e.stopPropagation()}
                  onChange={() => onToggleSelect(seg.id)}
                />
              </span>
            )}
            <span style={{ width: 24, color: 'var(--text-tertiary)' }}>{i + 1}</span>
            <span style={{ width: 18 }}>
              <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 3, background: seg.color }} />
            </span>
            <span
              data-testid="segment-kind-icon"
              style={{ width: 22, fontSize: 13, lineHeight: 1 }}
              title={effectiveKind(seg)}
            >
              {KIND_ICON[effectiveKind(seg)]}
            </span>
            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {rowSource(seg, i)}
              {Array.isArray(seg.mutations) && seg.mutations.length > 0 && (
                <span
                  data-testid="segment-mutation-badge"
                  title={`${seg.mutations.length} mutation${seg.mutations.length > 1 ? 's' : ''}`}
                  style={{ marginLeft: 6, color: 'var(--accent-500, #b85c3e)' }}
                >💎</span>
              )}
              {isOrphan && (
                <span data-testid="assembly-segment-orphan-badge" style={{ marginLeft: 6, color: 'var(--accent-500, #b85c3e)' }}>⚠ orphan</span>
              )}
            </span>
            <span style={{ width: 64, color: 'var(--text-secondary)' }}>{len} bp</span>
            <span style={{ width: 36 }}>{seg.reverseComplement ? 'RC' : '—'}</span>
            <span style={{ width: 96, textAlign: 'right', display: 'flex', justifyContent: 'flex-end', gap: 4 }}>
              <button
                type="button"
                data-testid="assembly-segment-up"
                disabled={i === 0}
                onClick={(e) => { e.stopPropagation(); actions.reorderSegments(draft.id, i, i - 1); }}
                title="Вверх"
                style={{ border: 'none', background: 'transparent', cursor: i === 0 ? 'default' : 'pointer', color: 'var(--text-secondary)' }}
              >▲</button>
              <button
                type="button"
                data-testid="assembly-segment-down"
                disabled={i === segs.length - 1}
                onClick={(e) => { e.stopPropagation(); actions.reorderSegments(draft.id, i, i + 1); }}
                title="Вниз"
                style={{ border: 'none', background: 'transparent', cursor: i === segs.length - 1 ? 'default' : 'pointer', color: 'var(--text-secondary)' }}
              >▼</button>
              <button
                type="button"
                data-testid="assembly-segment-delete"
                onClick={(e) => { e.stopPropagation(); actions.removeSegment(draft.id, seg.id); }}
                title="Удалить сегмент"
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--accent-500, #b85c3e)' }}
              >✕</button>
            </span>
          </div>
        );
      })}
    </div>
  );
}
