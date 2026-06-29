/**
 * AssemblyPrimersPanel — A3 primer panel. Tabs «Праймеры | Границы».
 * Праймеры: fwd/rev grouped by pairId, inline rename, edit-sequence
 * modal (manual override → status='edited'), delete. Cross-boundary
 * primers carry ⚡ (potential junction primer for A4). Границы: per
 * internal boundary fwd/rev coverage (DEC-CANVAS-ASM-PRIMER-05/07).
 */
import { useMemo, useState } from 'react';
import { Icon } from '../../../icons/Icon';
import PrimerBindingSites from '../../../PrimerBindingSites';
import { useStore } from '../../../../store';
import { primerPoolReuse } from '../../../../primer-reuse';
import { makeId } from '../../../../lib/ids';
import {
  useSkeletonState, useSkeletonActions, useAssemblyDraftById,
} from '../../store/skeleton-context';
import { selectBoundaryCoverage } from '../../store/selectors-assembly';

// WT-UX-18 / AM-7 — the binding Tm (SantaLucia NN) working floor. deriveAutoPrimers
// targets ≥60° (extending up to ~36 nt), but an AT-rich end can fall short; below
// this floor the anneal is unreliable. Aligned to the window cited in the warning
// (~55–65°) so the flag threshold and the copy agree (was 52° — silently let
// 52–55° through while telling the biolog the floor was 55°).
const TM_WORKING_MIN = 55;

function srcLabel(p, segName) {
  if (!p.source) return '';
  // M-CIRCULARIZE — single-fragment self-closure pair.
  if (p.source.kind === 'self-closure') return 'само-замыкание (кольцевание)';
  // Node A §5.7 — auto-group primers carry an honest 'auto-group' kind.
  // With a recorded junction → name it; otherwise it's a per-piece primer.
  if (p.source.kind === 'auto-group') {
    return Number.isFinite(p.source.boundaryAtOffset)
      ? `авто: ${segName(p.source.leftSegmentId)} → ${segName(p.source.rightSegmentId)}`
      : 'авто · кусок';
  }
  if (p.source.kind === 'boundary') {
    return `граница ${segName(p.source.leftSegmentId)} → ${segName(p.source.rightSegmentId)}`;
  }
  return `сегмент ${segName(p.source.segmentId)}`;
}

export function PrimerRow({ p, actions, draftId, onEdit }) {
  const [renaming, setRenaming] = useState(false);
  const [val, setVal] = useState(p.label || p.name);
  const [showBind, setShowBind] = useState(false); // PRIMER-1 — «куда садится» in library
  const cross = (p.crossesBoundaries || []).length >= 2;
  // PRIMER-6 (V180) — auto-reuse: does this auto-derived primer already exist in
  // the unified pool? If so, flag «в наличии» so the biolog reuses it instead of
  // ordering a duplicate (answers «проверяет ли автогенерация наличие в пуле»).
  const primersById = useStore((s) => s.primersById);
  const poolReuse = useMemo(
    () => primerPoolReuse(p, Object.values(primersById || {})),
    [p, primersById],
  );
  // PRIMER-4 (#118) — ephemeral vs durable: assembly primers are DRAFTS
  // (recomputed by the finalizer). «＋ в пул» promotes one to the durable
  // unified pool (a fresh-id snapshot) so it survives + is reusable. Hidden
  // once «в наличии» (already in the pool).
  const addPrimerToPool = useStore((s) => s.addPrimerToPool);
  const currentProjectId = useStore((s) => s.currentProjectId);
  const showToast = useStore((s) => s.showToast);
  const [saving, setSaving] = useState(false);
  const onSaveToPool = async () => {
    if (saving || !addPrimerToPool) return;
    setSaving(true);
    try {
      const res = await addPrimerToPool({
        primer: {
          id: makeId(),
          name: p.label || p.name || 'primer',
          sequence: p.sequence,
          bindingSequence: p.bindingSequence || null,
          tail: typeof p.tail === 'string' ? p.tail : (p.tailSequence || ''),
          direction: p.direction || null,
          tm: typeof p.tmBinding === 'number' ? p.tmBinding : p.tm,
        },
        projectId: currentProjectId ?? null,
        status: 'imported',
        origin: { kind: 'assembly-derived' },
      });
      if (res) showToast?.(`Праймер «${res.name}» сохранён в пул`, 'success');
      else showToast?.('Не удалось сохранить праймер', 'error');
    } finally {
      setSaving(false);
    }
  };
  return (
    <div>
    <div
      data-testid="assembly-primer-row"
      data-cross={cross ? 'true' : 'false'}
      style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0', fontSize: 10.5 }}
    >
      <span title={p.direction}>{p.direction === 'reverse' ? '◀' : '▶'}</span>
      {cross && <span data-testid="assembly-primer-cross" title="Покрывает границу — junction primer (A4)" style={{ display: 'inline-flex', alignItems: 'center' }}><Icon name="warning" size={12} /></span>}
      {/* K12 — autoMode badge: 🔧 auto (will be recomputed by the K15
          finalizer on skeleton change) / 🔒 manual (frozen). */}
      <span
        data-testid={`assembly-primer-automode-${p.id}`}
        data-draft={p.autoMode === 'auto' ? 'true' : undefined}
        title={p.autoMode === 'auto'
          ? 'Черновик — авто-праймер: связывание подобрано по Tm (≥60°, до ~36 нт), 20 нт лишь как fallback без Tm. Доведите вручную при необходимости.'
          : 'Manual — зафиксирован, finalizer не трогает.'}
        style={p.autoMode === 'auto'
          ? { color: 'var(--warning-fg,#b45309)', whiteSpace: 'nowrap' }
          : undefined}
      >
        {p.autoMode === 'auto' ? '🔧 черновик' : '🔒'}
      </span>
      {poolReuse.length > 0 && (
        <span
          data-testid={`assembly-primer-reuse-${p.id}`}
          title={`Уже есть в пуле: ${poolReuse[0].existing.name} — переиспользуйте, не заказывайте заново`}
          style={{
            fontSize: 9, padding: '0 4px', borderRadius: 3, whiteSpace: 'nowrap',
            background: 'var(--success-50, #dcfce7)', color: 'var(--success-fg, #15803d)',
          }}
        >✓ в наличии{poolReuse.length > 1 ? ` (${poolReuse.length})` : ''}</span>
      )}
      {renaming ? (
        <input
          data-testid="assembly-primer-rename-input"
          autoFocus
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { actions.updateAssemblyPrimer(draftId, p.id, { label: val }); setRenaming(false); }
            else if (e.key === 'Escape') { setRenaming(false); }
          }}
          onBlur={() => { actions.updateAssemblyPrimer(draftId, p.id, { label: val }); setRenaming(false); }}
          style={{ width: 80, fontSize: 10.5, padding: '1px 4px' }}
        />
      ) : (
        <button
          type="button"
          data-testid="assembly-primer-rename"
          onClick={() => { setVal(p.label || p.name); setRenaming(true); }}
          title="Переименовать"
          style={{ border: 'none', background: 'transparent', cursor: 'text', fontWeight: 600, color: 'var(--text-primary)', padding: 0 }}
        >{p.label || p.name}</button>
      )}
      {p.status === 'edited' && <span title="Изменён вручную" style={{ display: 'inline-flex', alignItems: 'center', color: 'var(--accent-500,#b85c3e)' }}><Icon name="edit" size={12} /></span>}
      {/* S3 §5.6 — координаты праймера устарели после правки в редакторе. */}
      {p.status === 'stale' && (
        <span
          data-testid="assembly-primer-stale"
          title="Координаты устарели после правки последовательности — проверьте/перепишите праймер"
          style={{ display: 'inline-flex', alignItems: 'center', color: 'var(--warning-fg,#b45309)' }}
        ><Icon name="warning" size={12} /></span>
      )}
      <span style={{ color: 'var(--text-tertiary)' }}>
        {`Tm ${p.tm}°`}
        {Number.isFinite(p.tm) && p.tm < TM_WORKING_MIN && (
          <span
            data-testid={`assembly-primer-tm-warn-${p.id}`}
            title={`Tm связывания ${p.tm}° ниже рабочего ~55–65° (отжиг ненадёжен) — перепишите праймер вручную`}
            style={{ display: 'inline-flex', alignItems: 'center', color: 'var(--warning-fg,#b45309)', marginLeft: 3 }}
          ><Icon name="warning" size={12} /></span>
        )}
        {` · GC ${p.gc}%`}
      </span>
      <span style={{ flex: 1, minWidth: 0, fontFamily: 'var(--font-mono,monospace)', color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {p.sequence}
      </span>
      {/* K12 — lock/reset toggles (mutually exclusive). */}
      {p.autoMode === 'auto' ? (
        <button
          type="button"
          data-testid={`assembly-primer-lock-${p.id}`}
          onClick={() => actions.updateAssemblyPrimer(draftId, p.id, { autoMode: 'manual' })}
          title="Заблокировать (manual) — finalizer не будет трогать"
          style={iconBtnFlex}
        ><Icon name="lock" size={12} /></button>
      ) : (
        <button
          type="button"
          data-testid={`assembly-primer-reset-${p.id}`}
          onClick={() => actions.updateAssemblyPrimer(draftId, p.id, { autoMode: 'auto' })}
          title="Сбросить в auto — finalizer пересчитает"
          style={iconBtnFlex}
        ><Icon name="swap" size={12} /></button>
      )}
      <button
        type="button"
        data-testid="assembly-primer-edit"
        onClick={() => onEdit(p)}
        title="Редактировать ПСО"
        style={iconBtnFlex}
      ><Icon name="edit" size={12} /></button>
      {/* PRIMER-1 — «куда садится»: where this primer anneals across the library. */}
      <button
        type="button"
        data-testid={`assembly-primer-bind-${p.id}`}
        onClick={() => setShowBind((v) => !v)}
        title="Куда садится в библиотеке (специфичность / кросс-референс)"
        style={{ ...iconBtnFlex, color: showBind ? 'var(--accent-600,#4338ca)' : 'var(--text-secondary)' }}
      ><Icon name="search" size={12} /></button>
      {/* PRIMER-4 (#118) — promote this ephemeral draft to the durable pool. */}
      {poolReuse.length === 0 && (
        <button
          type="button"
          data-testid={`assembly-primer-save-pool-${p.id}`}
          onClick={onSaveToPool}
          disabled={saving}
          title="Сохранить в общий пул праймеров (черновик → постоянный)"
          style={{ ...iconBtnFlex, color: 'var(--success-fg,#15803d)' }}
        ><Icon name="plus" size={12} /></button>
      )}
      <button
        type="button"
        data-testid="assembly-primer-delete"
        onClick={() => actions.removeAssemblyPrimer(draftId, p.id)}
        title="Удалить"
        style={{ ...iconBtnFlex, color: 'var(--accent-500,#b85c3e)' }}
      ><Icon name="close" size={12} /></button>
    </div>
    {showBind && <div style={{ padding: '0 0 4px 18px' }}><PrimerBindingSites primer={p} /></div>}
    </div>
  );
}

function EditModal({ primer, draftId, actions, onClose }) {
  const [seq, setSeq] = useState(primer.sequence || '');
  return (
    <div
      role="dialog"
      data-testid="assembly-primer-edit-modal"
      onClick={onClose}
      style={{
        position: 'absolute', inset: 0, zIndex: 110, background: 'rgba(28,25,23,0.32)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 420, background: 'var(--surface-1)', border: '1px solid var(--border-subtle)',
          borderRadius: 8, padding: 14, boxShadow: '0 8px 28px rgba(28,25,23,0.24)',
        }}
      >
        <strong style={{ fontSize: 12.5 }}>Редактировать праймер {primer.label || primer.name}</strong>
        <textarea
          data-testid="assembly-primer-edit-seq"
          value={seq}
          onChange={(e) => setSeq(e.target.value)}
          rows={4}
          style={{
            width: '100%', marginTop: 8, fontFamily: 'var(--font-mono,monospace)', fontSize: 12,
            padding: 8, border: '1px solid var(--border-subtle)', borderRadius: 4,
            background: 'var(--surface-2)', color: 'var(--text-primary)', resize: 'vertical',
          }}
        />
        <div style={{ display: 'flex', gap: 8, marginTop: 10, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose} style={ghostBtn}>Отмена</button>
          <button
            type="button"
            data-testid="assembly-primer-edit-save"
            onClick={() => {
              const clean = seq.replace(/[^a-zA-Z]/g, '').toUpperCase();
              // K12 — a manual sequence edit auto-locks the primer so
              // the K15 finalizer won't overwrite the biolog's change.
              actions.updateAssemblyPrimer(draftId, primer.id, { sequence: clean, autoMode: 'manual' });
              onClose();
            }}
            style={primaryBtn}
          >Сохранить</button>
        </div>
      </div>
    </div>
  );
}

export default function AssemblyPrimersPanel({ draftId, onClose }) {
  const state = useSkeletonState();
  const actions = useSkeletonActions();
  const draft = useAssemblyDraftById(draftId);
  const primers = (state.assemblyDraftPrimers && state.assemblyDraftPrimers[draftId]) || [];
  const coverage = useMemo(() => selectBoundaryCoverage(state, draftId), [state, draftId]);
  const [tab, setTab] = useState('primers');
  const [editing, setEditing] = useState(null);

  const segName = useMemo(() => {
    const byId = {};
    (draft?.segments || []).forEach((s, i) => {
      byId[s.id] = s.label || (s.source?.sourceContainerName) || `#${i + 1}`;
    });
    return (id) => byId[id] || '?';
  }, [draft]);

  const groups = useMemo(() => {
    const map = new Map();
    for (const p of primers) {
      const k = p.pairId || p.id;
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(p);
    }
    const arr = [...map.values()];
    arr.sort((a, b) => {
      const ax = (a[0].crossesBoundaries || []).length >= 2 ? 0 : 1;
      const bx = (b[0].crossesBoundaries || []).length >= 2 ? 0 : 1;
      return ax - bx;
    });
    return arr;
  }, [primers]);

  const covered = coverage.filter((c) => c.fwd && c.rev).length;

  return (
    <div
      data-testid="assembly-primers-panel"
      style={{
        borderTop: '1px solid var(--border-subtle)',
        background: 'var(--surface-2)',
        maxHeight: 220,
        overflowY: 'auto',
        flexShrink: 0,
        position: 'relative',
      }}
    >
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border-subtle)', alignItems: 'stretch' }}>
        <button type="button" data-testid="assembly-primers-tab-primers" onClick={() => setTab('primers')} style={tabBtn(tab === 'primers')}>Праймеры</button>
        <button type="button" data-testid="assembly-primers-tab-boundaries" onClick={() => setTab('boundaries')} style={tabBtn(tab === 'boundaries')}>Границы</button>
        {typeof onClose === 'function' && (
          <button
            type="button"
            data-testid="assembly-primers-panel-close"
            onClick={onClose}
            title="Скрыть панель (вернуть — кнопка «Палитра»)"
            style={{
              flexShrink: 0, padding: '0 10px',
              background: 'transparent', color: 'var(--text-tertiary)',
              border: 'none', cursor: 'pointer', fontSize: 13, lineHeight: 1,
            }}
          >×</button>
        )}
      </div>

      <div data-testid="assembly-primers-header" style={{ padding: '5px 10px', fontSize: 10.5, color: 'var(--text-secondary)' }}>
        {primers.length} праймер(ов) · границы {covered} / {coverage.length} покрыты
      </div>

      {tab === 'primers' && (
        <div style={{ padding: '0 10px 8px' }}>
          {groups.length === 0 && (
            <div style={{ fontSize: 10.5, color: 'var(--text-tertiary)', padding: '4px 0' }}>
              Выдели участок и нажми Ctrl+R / Ctrl+Alt+R, либо ПКМ → праймер.
            </div>
          )}
          {groups.map((g) => (
            <div
              key={g[0].pairId || g[0].id}
              data-testid="assembly-primer-pair"
              style={{ border: '1px solid var(--border-subtle)', borderRadius: 4, padding: '4px 8px', marginBottom: 5, background: 'var(--surface-1)' }}
            >
              <div style={{ fontSize: 9.5, color: 'var(--text-tertiary)', marginBottom: 2 }}>{srcLabel(g[0], segName)}</div>
              {g.map((p) => (
                <PrimerRow
                  key={p.id}
                  p={p}
                  actions={actions}
                  draftId={draftId}
                  onEdit={setEditing}
                />
              ))}
            </div>
          ))}
        </div>
      )}

      {tab === 'boundaries' && (
        <div style={{ padding: '0 10px 8px' }}>
          {coverage.length === 0 && (
            <div style={{ fontSize: 10.5, color: 'var(--text-tertiary)', padding: '4px 0' }}>Нет внутренних границ.</div>
          )}
          {coverage.map((c, i) => (
            <div
              key={c.boundaryAtOffset}
              data-testid="assembly-boundary-row"
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 10.5, borderTop: i ? '1px solid var(--border-subtle)' : 'none' }}
            >
              <span style={{ flex: 1 }}>{segName(c.leftSegmentId)} → {segName(c.rightSegmentId)}</span>
              <span style={{ color: c.fwd ? 'var(--emerald,#4a7c59)' : 'var(--text-tertiary)' }}>▶ {c.fwd ? '✓' : '—'}</span>
              <span style={{ color: c.rev ? 'var(--emerald,#4a7c59)' : 'var(--text-tertiary)' }}>◀ {c.rev ? '✓' : '—'}</span>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <EditModal
          primer={primers.find((x) => x.id === editing.id) || editing}
          draftId={draftId}
          actions={actions}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

const iconBtn = { border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 11 };
const iconBtnFlex = { ...iconBtn, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' };
const ghostBtn = { fontSize: 11, padding: '4px 10px', background: 'transparent', border: '1px solid var(--border-subtle)', borderRadius: 4, cursor: 'pointer', color: 'var(--text-secondary)' };
const primaryBtn = { fontSize: 11.5, padding: '5px 14px', background: 'var(--accent-500,#b85c3e)', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600 };
function tabBtn(active) {
  return {
    flex: 1, fontSize: 11, padding: '5px 8px', border: 'none', cursor: 'pointer',
    background: active ? 'var(--surface-1)' : 'transparent',
    color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
    fontWeight: active ? 600 : 400,
    borderBottom: active ? '2px solid var(--accent-500,#b85c3e)' : '2px solid transparent',
  };
}
