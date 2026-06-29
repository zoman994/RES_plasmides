/**
 * SegmentList — footer table of the assembly's segments (G2
 * DEC-CANVAS-ASM-13 footer). Reorder via ▲ / ▼ buttons (G2 R5 fallback
 * — predictable, no fragile HTML5 row DnD). Orphan rows get a ⚠ badge
 * (K10).
 *
 * V93+V94 — каждая строка несёт chevron ▸/▾; expand раскрывает
 * inline-editor (range/RC/color-swatch/label/Apply/Delete) на месте
 * прежней правой колонки SegmentDetailPanel. Цвет меняется кликом
 * по color-swatch в open-state.
 */
import { useState } from 'react';
import { useSkeletonActions } from '../../store/skeleton-context';
import { SEGMENT_COLORS } from '../../lib/segment-color-palette';
import { acquisitionLabel } from '../../lib/acquisition-label';
import { toUiCoords } from '../../../../lib/annotation-edit';
import { Icon } from '../../../icons/Icon';

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
    // V127 — 1-based display (⚓ DEC-ANN-10): coords stored 0-based half-open.
    const { uiStart, uiEnd } = toUiCoords(seg.start ?? 0, seg.end ?? 0);
    // V129 — make RC explicit next to the coords (the RC column reads poorly).
    // Numbers stay ascending = source span (GenBank `complement(...)`
    // convention, NOT 69:1); ←RC marks the reverse orientation.
    const rc = seg.reverseComplement ? ' ←RC' : '';
    return `${seg.source.sourceContainerName || 'container'} [${uiStart}:${uiEnd}]${rc}`;
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
  // S2 (V162) — per-segment end-chemistry { [id]: {left, right} } so a row can
  // badge a 5′-OH end bound for ligation (needs T4 PNK). Optional/back-compat.
  endChemBySegment,
  // S3 (V163) — per-segment RE-cloning plan: double-digest staging + self-
  // ligation/dephosphorylation. Optional/back-compat.
  reCloningBySegment,
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
  // V93+V94 — какие segment-rows раскрыты в inline-editor mode.
  const [expandedIds, setExpandedIds] = useState(() => new Set());
  const toggleExpanded = (id) => {
    setExpandedIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };
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
    const expanded = expandedIds.has(seg.id);
    return (
      <SegmentRow
        key={seg.id}
        seg={seg}
        i={i}
        len={len}
        isOrphan={isOrphan}
        selected={selected}
        expanded={expanded}
        onToggleExpand={() => toggleExpanded(seg.id)}
        selectionEnabled={selectionEnabled}
        selSet={selSet}
        onToggleSelect={onToggleSelect}
        onSelectSegment={onSelectSegment}
        onAddMutation={onAddMutation}
        endChem={endChemBySegment ? endChemBySegment[seg.id] : null}
        reCloning={reCloningBySegment ? reCloningBySegment[seg.id] : null}
        actions={actions}
        draftId={draft.id}
        segsLen={segs.length}
      />
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
          ><Icon name="link" size={12} style={{ display: 'inline-block', verticalAlign: '-2px' }} /> Сшить ({selSet.size})</button>
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
          Сегментов нет. + Плазмида — выбор из списка выше; кнопки:
          + Обвес / + Синтез / + Gap.
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

/**
 * SegmentRow — single row + inline-editor под ним когда `expanded`.
 * V93+V94 — заменяет правую колонку SegmentDetailPanel (теперь не
 * монтируется). Inline-editor содержит range / RC / color-swatch /
 * label / Apply / Delete — все функции прежнего drawer'а.
 */
function SegmentRow({
  seg, i, len, isOrphan, selected, expanded,
  onToggleExpand,
  selectionEnabled, selSet, onToggleSelect, onSelectSegment, onAddMutation,
  endChem, reCloning,
  actions, draftId, segsLen,
}) {
  const kind = effectiveKind(seg);
  // S2 — an end of this fragment is 5′-OH and bound for a blunt/KLD ligation →
  // it can't seal without T4 PNK (PCR/cursor fragments ship 5′-OH). Amber chip.
  const needsPhos = !!endChem && (
    (endChem.left && endChem.left.needsPhosphorylation)
    || (endChem.right && endChem.right.needsPhosphorylation)
  );
  // S3 — RE-cloning row chips: sequential double-digest + self-ligation/CIP.
  const reSequential = !!(reCloning && reCloning.doubleDigest && reCloning.doubleDigest.sequential);
  const reDephos = !!(reCloning && reCloning.recommendDephosphorylation);
  const isContainer = seg.source?.type === 'container';
  // Local edit buffer — initial state from props.
  const [label, setLabel] = useState(seg.label ?? '');
  // V127 — inline range editor is 1-based (⚓ DEC-ANN-10): show start+1,
  // convert back to 0-based on Apply. end passes through.
  const [start, setStart] = useState((seg.start ?? 0) + 1);
  const [end, setEnd] = useState(seg.end ?? 0);
  const [rc, setRc] = useState(!!seg.reverseComplement);
  const [colorPickerOpen, setColorPickerOpen] = useState(false);

  const applyChanges = () => {
    if (label !== (seg.label ?? '')) {
      actions.updateSegment(draftId, seg.id, { label });
    }
    if (rc !== !!seg.reverseComplement) {
      // V94 — `toggleSegmentRc` (а не UPDATE_SEGMENT) — он recompose'ит
      // sequence через reverseComplement(); generic patch только меняет
      // флаг и оставляет stale последовательность.
      if (typeof actions.toggleSegmentRc === 'function') {
        actions.toggleSegmentRc(draftId, seg.id);
      } else {
        actions.updateSegment(draftId, seg.id, { reverseComplement: rc });
      }
    }
    if (isContainer && typeof actions.updateSegmentRange === 'function') {
      // V127 — inputs are 1-based; convert start back to 0-based store.
      const storeStart = Math.max(0, Number(start) - 1);
      const storeEnd = Number(end);
      if (storeStart !== seg.start || storeEnd !== seg.end) {
        actions.updateSegmentRange(draftId, seg.id, storeStart, storeEnd);
      }
    }
  };

  const pickColor = (color) => {
    actions.updateSegment(draftId, seg.id, { color });
    setColorPickerOpen(false);
  };

  return (
    <>
      <div
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
        <button
          type="button"
          data-testid={`segment-row-expand-${seg.id}`}
          onClick={(e) => { e.stopPropagation(); onToggleExpand(); }}
          title={expanded ? 'Свернуть' : 'Развернуть (диапазон / RC / цвет / метка)'}
          style={{
            width: 18, border: 'none', background: 'transparent',
            cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: 11,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          }}
        ><Icon name={expanded ? 'chevron-down' : 'chevron-right'} size={11} /></button>
        <span style={{ width: 24, color: 'var(--text-tertiary)' }}>{i + 1}</span>
        <span style={{ width: 18 }}>
          {/* V93 — color-swatch теперь интерактивный: клик → color picker
              ниже (inline-editor open if needed). */}
          <button
            type="button"
            data-testid={`segment-row-swatch-${seg.id}`}
            onClick={(e) => {
              e.stopPropagation();
              if (!expanded) onToggleExpand();
              setColorPickerOpen((v) => !v);
            }}
            title="Изменить цвет"
            style={{
              display: 'inline-block', width: 12, height: 12, borderRadius: 3,
              background: seg.color, border: 'none', cursor: 'pointer', padding: 0,
            }}
          />
        </span>
        <span
          data-testid="segment-kind-icon"
          style={{ width: 22, fontSize: 13, lineHeight: 1 }}
          title={kind}
        >
          {KIND_ICON[kind]}
        </span>
        {/* S5 — acquisition badge: how this fragment is obtained (RE / PCR /
            синтез / cursor). Lets a multi-source build read at a glance. */}
        <span
          data-testid="segment-acq-badge"
          data-acquisition={seg.acquisitionMethod || 'undefined'}
          title={acquisitionLabel(seg.acquisitionMethod).full}
          style={{
            flexShrink: 0, marginRight: 6, padding: '0 4px',
            fontSize: 9, fontWeight: 600, lineHeight: '14px',
            borderRadius: 3, color: 'var(--text-secondary)',
            background: 'var(--surface-3, rgba(120,113,108,0.10))',
            border: '0.5px solid var(--border-subtle)',
          }}
        >{acquisitionLabel(seg.acquisitionMethod).short}</span>
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
            <span data-testid="assembly-segment-orphan-badge" style={{ marginLeft: 6, color: 'var(--accent-500, #b85c3e)' }}><Icon name="warning" size={11} style={{ display: 'inline-block', verticalAlign: '-2px' }} /> orphan</span>
          )}
          {needsPhos && (
            <span
              data-testid="segment-endchem-phos"
              title="Конец 5′-OH — добавьте фосфорилирование (T4 PNK) перед лигированием"
              style={{ marginLeft: 6, color: 'var(--amber, #b8860b)', fontSize: 10, fontWeight: 600 }}
            >⚡5′-OH</span>
          )}
          {reSequential && (
            <span
              data-testid="segment-recloning-sequential"
              title="Разные буфер/температура ферментов — режьте последовательно, не одновременно"
              style={{ marginLeft: 6, color: 'var(--amber, #b8860b)', fontSize: 10 }}
            >⇄ посл.</span>
          )}
          {reDephos && (
            <span
              data-testid="segment-recloning-dephos"
              title="Одинаковые концы (не направлено) — дефосфорилируйте вектор (Quick CIP / rSAP)"
              style={{ marginLeft: 6, color: 'var(--amber, #b8860b)', fontSize: 10 }}
            >○ CIP</span>
          )}
        </span>
        <span style={{ width: 64, color: 'var(--text-secondary)' }}>{len} bp</span>
        <span style={{ width: 36 }}>{seg.reverseComplement ? 'RC' : '—'}</span>
        <span style={{ width: 118, textAlign: 'right', display: 'flex', justifyContent: 'flex-end', gap: 4 }}>
          {typeof onAddMutation === 'function' && kind === 'sourced' && (
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
            onClick={(e) => { e.stopPropagation(); actions.reorderSegments(draftId, i, i - 1); }}
            title="Вверх"
            style={{ border: 'none', background: 'transparent', cursor: i === 0 ? 'default' : 'pointer', color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
          ><Icon name="sort" size={12} /></button>
          <button
            type="button"
            data-testid="assembly-segment-down"
            disabled={i === segsLen - 1}
            onClick={(e) => { e.stopPropagation(); actions.reorderSegments(draftId, i, i + 1); }}
            title="Вниз"
            style={{ border: 'none', background: 'transparent', cursor: i === segsLen - 1 ? 'default' : 'pointer', color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
          ><Icon name="sort" size={12} /></button>
          <button
            type="button"
            data-testid="assembly-segment-delete"
            onClick={(e) => { e.stopPropagation(); actions.removeSegment(draftId, seg.id); }}
            title="Удалить сегмент"
            style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--accent-500, #b85c3e)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
          ><Icon name="close" size={12} /></button>
        </span>
      </div>
      {expanded && (
        <div
          data-testid={`segment-row-inline-editor-${seg.id}`}
          onClick={(e) => e.stopPropagation()}
          style={{
            padding: '8px 12px 10px 28px',
            background: 'var(--surface-3, rgba(184,92,62,0.04))',
            borderTop: '1px dashed var(--border-subtle)',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex', flexDirection: 'column', gap: 8, fontSize: 11,
          }}
        >
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            {isContainer && (
              <label style={inlineLabel}>
                start
                <input
                  data-testid={`segment-inline-start-${seg.id}`}
                  type="number"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                  style={inlineNum}
                />
              </label>
            )}
            {isContainer && (
              <label style={inlineLabel}>
                end
                <input
                  data-testid={`segment-inline-end-${seg.id}`}
                  type="number"
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                  style={inlineNum}
                />
              </label>
            )}
            <label style={{ ...inlineLabel, flexDirection: 'row', gap: 4, alignItems: 'center' }}>
              <input
                data-testid={`segment-inline-rc-${seg.id}`}
                type="checkbox"
                checked={rc}
                onChange={() => setRc((v) => !v)}
              />
              RC
            </label>
            {/* V167 — explicit per-fragment acquisition method (transparency +
                «оверлап оверлапом»): promote a cursor fragment to PCR/Overlap-PCR
                so it amplifies (gets primers + a PCR reaction), or mark synth /
                no-PCR. Restriction is set via the RE-site picker (needs enzymes),
                so it's shown but not selectable here. Applies immediately. */}
            <label style={inlineLabel}>
              Метод
              <select
                data-testid={`segment-method-${seg.id}`}
                value={seg.acquisitionMethod || 'undefined'}
                onChange={(e) => {
                  if (actions.zoneDispatch) {
                    actions.zoneDispatch({
                      type: 'SET_PIECE_ACQUISITION_METHOD', pieceId: seg.id, method: e.target.value, params: {},
                    });
                  }
                }}
                style={{ ...inlineNum, width: 132 }}
              >
                <option value="undefined">Курсор (как есть)</option>
                <option value="pcr">ПЦР</option>
                <option value="ov-pcr">Overlap-ПЦР</option>
                <option value="synthesis">Синтез</option>
                <option value="direct">Без ПЦР</option>
                <option value="restriction" disabled>Рестрикция (по сайтам)</option>
              </select>
            </label>
            {/* GAP-2 — discoverability: a digest fragment can be RE-AMPLIFIED. The
                method picker already allows restriction→ПЦР/Overlap-ПЦР (primer-derive
                skips only 'restriction'); this hint tells the biolog the move exists. */}
            {seg.acquisitionMethod === 'restriction' && (
              <div
                data-testid={`segment-reamplify-hint-${seg.id}`}
                style={{ fontSize: 10, color: 'var(--text-secondary, #57534e)', lineHeight: 1.4, maxWidth: 260 }}
              >
                Рестрикция режет фрагмент по сайтам. Выберите ПЦР / Overlap-ПЦР, чтобы
                перепраймировать его в новый ПЦР-продукт (например, под Gibson).
              </div>
            )}
            <label style={inlineLabel}>
              Цвет
              <button
                type="button"
                data-testid={`segment-inline-color-${seg.id}`}
                onClick={() => setColorPickerOpen((v) => !v)}
                title="Открыть палитру цветов"
                style={{
                  width: 24, height: 16, borderRadius: 3,
                  background: seg.color,
                  border: '1px solid var(--border-subtle)', cursor: 'pointer', padding: 0,
                  marginTop: 2,
                }}
              />
            </label>
            <label style={{ ...inlineLabel, flex: 1, minWidth: 120 }}>
              Метка
              <input
                data-testid={`segment-inline-label-${seg.id}`}
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                style={{ ...inlineNum, width: '100%' }}
              />
            </label>
            <button
              type="button"
              data-testid={`segment-inline-apply-${seg.id}`}
              onClick={applyChanges}
              style={{
                fontSize: 11, padding: '4px 12px',
                background: 'var(--accent-500, #b85c3e)', color: '#fff',
                border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600,
              }}
            >Применить</button>
          </div>
          {colorPickerOpen && (
            <div
              data-testid={`segment-inline-color-picker-${seg.id}`}
              style={{
                display: 'flex', gap: 4, flexWrap: 'wrap',
                padding: '4px 0', borderTop: '1px dashed var(--border-subtle)',
              }}
            >
              {(SEGMENT_COLORS || []).map((c) => (
                <button
                  key={c}
                  type="button"
                  data-testid={`segment-inline-color-pick-${seg.id}-${c}`}
                  onClick={() => pickColor(c)}
                  title={c}
                  style={{
                    width: 16, height: 16, borderRadius: 3, background: c,
                    border: c === seg.color ? '2px solid var(--text-primary)' : '1px solid var(--border-subtle)',
                    cursor: 'pointer', padding: 0,
                  }}
                />
              ))}
            </div>
          )}
          {/* Orphan recovery — V94 преемник SegmentDetailPanel.convert-gap. */}
          {isContainer && seg.source?.unavailable && (
            <div
              data-testid={`segment-detail-orphan`}
              style={{
                padding: '6px 0', borderTop: '1px dashed var(--accent-500, #b85c3e)',
                fontSize: 11, color: 'var(--accent-500, #b85c3e)',
                display: 'flex', alignItems: 'center', gap: 8,
              }}
            >
              <Icon name="warning" size={12} style={{ display: 'inline-block', verticalAlign: '-2px' }} /> Source container удалён.
              <button
                type="button"
                data-testid={`segment-detail-convert-gap`}
                onClick={() => {
                  actions.updateSegment(draftId, seg.id, { source: { type: 'manual' } });
                }}
                style={{
                  fontSize: 11, padding: '3px 10px',
                  background: 'transparent',
                  color: 'var(--accent-500, #b85c3e)',
                  border: '1px solid var(--accent-500, #b85c3e)',
                  borderRadius: 4, cursor: 'pointer',
                }}
              >Convert to gap</button>
            </div>
          )}
        </div>
      )}
    </>
  );
}

const inlineLabel = {
  display: 'flex', flexDirection: 'column', fontSize: 10.5,
  color: 'var(--text-secondary)',
};
const inlineNum = {
  fontSize: 11, padding: '3px 6px',
  border: '1px solid var(--border-subtle)', borderRadius: 3,
  background: 'var(--surface-1)', color: 'var(--text-primary)',
  width: 70, marginTop: 2,
};
