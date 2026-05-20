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

// K8 — op-group kind labels for the strip header.
const KIND_LABEL = {
  overlap_pcr: 'Overlap PCR',
  gibson: 'Gibson',
  golden_gate: 'Golden Gate',
  restriction: 'Restriction',
  kld: 'KLD',
  direct_ligation: 'Direct ligation',
};

export default function SegmentList({
  draft, boundaries, orphanIds, selectedSegmentId, onSelectSegment,
  // K7 — optional grouping controls. When `onToggleSelect` is provided
  // SegmentList renders a checkbox per row + a «🔗 Сшить» button once
  // `selectedSegmentIds` has ≥2 entries; otherwise these are no-ops and
  // the legacy footer renders unchanged.
  selectedSegmentIds, onToggleSelect, onSew,
  // K8 — op-group lookup for the bordered group container header.
  operations,
  // K14 — per-row «+ mut» entry. Optional; when omitted the button
  // doesn't render (back-compat for the K6 / K8 isolated tests).
  onAddMutation,
}) {
  const actions = useSkeletonActions();
  const segs = draft.segments || [];
  const selectionEnabled = typeof onToggleSelect === 'function';
  const selSet = selectedSegmentIds instanceof Set
    ? selectedSegmentIds
    : new Set(Array.isArray(selectedSegmentIds) ? selectedSegmentIds : []);
  const sewVisible = selectionEnabled && selSet.size >= 2;
  const opsById = new Map((operations || []).map((o) => [o.id, o]));
  // K8 — group consecutive same-groupId rows into a single container.
  const chunks = [];
  segs.forEach((seg, i) => {
    const gid = seg.groupId || null;
    const last = chunks[chunks.length - 1];
    if (gid && last && last.kind === 'group' && last.groupId === gid) {
      last.items.push({ seg, i });
    } else if (gid) {
      chunks.push({ kind: 'group', groupId: gid, items: [{ seg, i }] });
    } else {
      chunks.push({ kind: 'solo', items: [{ seg, i }] });
    }
  });

  function renderRow(seg, i) {
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
        <span style={{ width: 118, textAlign: 'right', display: 'flex', justifyContent: 'flex-end', gap: 4 }}>
          {typeof onAddMutation === 'function' && effectiveKind(seg) === 'sourced' && (
            <button
              type="button"
              data-testid={`assembly-segment-add-mut-${seg.id}`}
              onClick={(e) => { e.stopPropagation(); onAddMutation(seg.id); }}
              title="Добавить mutation"
              style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--accent-500, #b85c3e)' }}
            >💎+</button>
          )}
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
  }

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
        <span style={{ width: 118, textAlign: 'right' }}>Действия</span>
      </div>
      {segs.length === 0 && (
        <div style={{ padding: 10, color: 'var(--text-tertiary)' }}>
          Сегментов нет. Перетащите контейнер или «+ Сегмент».
        </div>
      )}
      {chunks.map((c) => {
        if (c.kind === 'solo') {
          const { seg, i } = c.items[0];
          return renderRow(seg, i);
        }
        const op = opsById.get(c.groupId);
        const kindLabel = op ? (KIND_LABEL[op.kind] || op.kind) : c.groupId;
        const groupName = op && op.params && op.params.groupName;
        return (
          <div
            key={c.groupId}
            data-testid={`segment-group-container-${c.groupId}`}
            style={{
              margin: '4px 6px',
              border: '2px solid var(--accent-500, #b85c3e)',
              borderRadius: 6,
              overflow: 'hidden',
              background: 'var(--accent-wash, rgba(184,92,62,0.06))',
            }}
          >
            <div
              data-testid={`segment-group-header-${c.groupId}`}
              style={{
                padding: '4px 10px',
                fontSize: 10.5,
                fontWeight: 600,
                color: 'var(--accent-700, #8a3a22)',
                background: 'var(--accent-wash, rgba(184,92,62,0.10))',
                borderBottom: '1px solid var(--accent-500, #b85c3e)',
              }}
            >
              {kindLabel}{groupName ? ` → ${groupName}` : ''}
            </div>
            {c.items.map(({ seg, i }) => renderRow(seg, i))}
          </div>
        );
      })}
    </div>
  );
}
