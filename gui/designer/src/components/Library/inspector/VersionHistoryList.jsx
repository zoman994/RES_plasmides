/**
 * VersionHistoryList — compact, list-first version history surfaced INLINE in
 * the library inspector (replaces the heavy modal-first git-graph as the
 * primary view; the full graph is a «Граф» button away). Игорь: дерево версий
 * «неудобно и громоздко» → лёгкий вертикальный список с действиями.
 *
 * Each row = one version / branch in the lineage with: role chip (версия vN /
 * ⑂ ветка), status chip, «что изменено», time, and inline actions —
 *   • Открыть   → switch the inspector to that version
 *   • Diff      → inline sequenceDiff vs the current head (замены / Δдлины / GC)
 *   • ✎         → rename (renameLibraryEntry)
 *   • статус    → release / wip / deprecated (setLibraryEntryVersionStatus)
 *   • 🗑        → soft-delete to Trash (markLibraryEntryPendingDelete + undo)
 *
 * Structural model from collectLineage; presentation tokens from version-status.
 */
import { useState, useMemo, useCallback } from 'react';
import { useStore } from '../../../store';
import { collectLineage } from '../lib/version-lineage';
import { STATUS_META, statusMeta, lineageRoleLabel, entryStatus } from '../lib/version-status';
import { sequenceDiff } from '../../../sequence-diff';

function fmtTime(entry) {
  const o = entry?.origin || {};
  const raw = o.editedAt || o.createdAt || entry?.addedAt || '';
  if (!raw) return '';
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) return '';
  try {
    return new Date(ms).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch { return raw; }
}

function Chip({ label, color, bg, title }) {
  return (
    <span title={title} style={{
      fontSize: 9.5, lineHeight: '14px', padding: '0 5px', borderRadius: 8,
      background: bg || 'var(--surface-2)', color: color || 'var(--text-tertiary)',
      border: '1px solid var(--border-subtle)', whiteSpace: 'nowrap', flexShrink: 0,
    }}>{label}</span>
  );
}

const ACTION_BTN = {
  fontSize: 11, padding: '1px 6px', borderRadius: 4, cursor: 'pointer',
  border: '1px solid var(--border-subtle)', background: 'var(--surface-1)',
  color: 'var(--text-secondary)', lineHeight: '16px', whiteSpace: 'nowrap',
};

export default function VersionHistoryList({ focusId, onSelect, onOpenGraph }) {
  const entriesById = useStore((s) => s.libraryEntries);
  const renameLibraryEntry = useStore((s) => s.renameLibraryEntry);
  const setVersionStatus = useStore((s) => s.setLibraryEntryVersionStatus);
  const markPendingDelete = useStore((s) => s.markLibraryEntryPendingDelete);
  const unmarkPendingDelete = useStore((s) => s.unmarkLibraryEntryPendingDelete);
  const showToast = useStore((s) => s.showToast);
  const requestPrompt = useStore((s) => s.requestPrompt);

  const lineage = useMemo(() => collectLineage(entriesById, focusId), [entriesById, focusId]);
  const [open, setOpen] = useState(true);
  const [diffFor, setDiffFor] = useState(null);

  const headEntry = entriesById[lineage.headId] || null;

  // Rows: mainline versions newest-first, then branches.
  const rows = useMemo(() => {
    const vs = lineage.versions.map((n, i) => ({ id: n.id, role: 'version', order: i + 1, isHead: n.id === lineage.headId }));
    vs.reverse();
    const bs = [];
    for (const b of lineage.branches) {
      for (const n of b.nodes) bs.push({ id: n.id, role: 'branch', order: null, isHead: false });
    }
    return [...vs, ...bs];
  }, [lineage]);

  const doRename = useCallback(async (id, currentName) => {
    const next = await requestPrompt({ title: 'Переименовать версию', defaultValue: currentName || '', placeholder: 'Новое имя версии' });
    if (next == null) return;
    const trimmed = String(next).trim();
    if (!trimmed || trimmed === currentName) return;
    try { await renameLibraryEntry(id, trimmed); showToast?.(`Переименовано: ${trimmed}`, 'success'); }
    catch (err) { showToast?.(err?.message || 'Ошибка', 'error'); }
  }, [renameLibraryEntry, showToast, requestPrompt]);

  const doSetStatus = useCallback(async (id, value) => {
    try { await setVersionStatus(id, value || null); }
    catch (err) { showToast?.(err?.message || 'Ошибка', 'error'); }
  }, [setVersionStatus, showToast]);

  const doDelete = useCallback(async (id, name) => {
    // Pick a survivor BEFORE the async delete so a re-render can't strand us.
    const survivorId = (id === focusId)
      ? (lineage.all.find((n) => n.id !== id)?.id || null)
      : null;
    try {
      await markPendingDelete(id);
      showToast?.(`Удалено: ${name || id} (в Корзине)`, 'info', { onUndo: () => unmarkPendingDelete?.(id) });
      if (survivorId) onSelect?.(survivorId); // keep the inspector on a live version
    } catch (err) { showToast?.(err?.message || 'Ошибка', 'error'); }
  }, [markPendingDelete, unmarkPendingDelete, showToast, focusId, lineage, onSelect]);

  if (!focusId || lineage.all.length <= 1) return null;

  return (
    <div data-testid="version-history-list" style={{ padding: '6px 10px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <button
          type="button"
          data-testid="version-history-toggle"
          onClick={() => setOpen((v) => !v)}
          style={{ ...ACTION_BTN, flex: 1, textAlign: 'left', display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <span style={{ color: 'var(--text-tertiary)' }}>{open ? '▾' : '▸'}</span>
          История · {lineage.all.length}
          {lineage.branches.length > 0 && <span data-testid="version-history-branchcount" style={{ color: 'var(--text-tertiary)' }}>· {lineage.branches.length} ⑂</span>}
        </button>
        {onOpenGraph && (
          <button type="button" data-testid="version-history-open-graph" onClick={onOpenGraph} title="Показать граф версий" style={ACTION_BTN}>Граф ⑂</button>
        )}
      </div>

      {open && (
        <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 3 }}>
          {rows.map((row) => {
            const entry = entriesById[row.id];
            if (!entry) return null;
            const isCurrent = row.id === focusId;
            const status = entryStatus(entry);
            const sm = statusMeta(status);
            const showDiff = diffFor === row.id;
            return (
              <div
                key={row.id}
                data-testid={`version-row-${row.id}`}
                data-current={isCurrent ? 'true' : 'false'}
                style={{
                  border: `1px solid ${isCurrent ? 'var(--accent-500)' : 'var(--border-subtle)'}`,
                  background: isCurrent ? 'var(--accent-50)' : 'var(--surface-1)',
                  borderRadius: 'var(--radius-md)', padding: '5px 7px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {row.role === 'branch'
                    ? <Chip label="⑂ ветка" title="ветка" color="var(--accent-700)" />
                    : <Chip label={`v${row.order}`} title={row.isHead ? 'текущая версия' : 'версия'} color={row.isHead ? 'var(--success-fg)' : 'var(--text-tertiary)'} />}
                  <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: 'var(--text-primary)', fontWeight: isCurrent ? 500 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.name || entry.id}</span>
                  {sm && <Chip label={sm.label} title={sm.label} color={sm.color} bg={sm.bg} />}
                  {isCurrent && <Chip label="текущая" title="открыта сейчас" color="var(--success-fg)" />}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10.5, color: 'var(--text-tertiary)', marginTop: 2 }}>
                  {entry.origin?.changes
                    ? <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={entry.origin.changes}>{entry.origin.changes}</span>
                    : <span style={{ flex: 1, color: 'var(--text-quaternary, var(--text-tertiary))' }}>{entry.origin?.kindLabel || lineageRoleLabel(row.role)}</span>}
                  <span>{fmtTime(entry)}</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 5, flexWrap: 'wrap' }}>
                  {!isCurrent && (
                    <button type="button" data-testid={`version-open-${row.id}`} onClick={() => onSelect?.(row.id)} style={ACTION_BTN}>Открыть</button>
                  )}
                  {!isCurrent && (
                    <button type="button" data-testid={`version-diff-${row.id}`} onClick={() => setDiffFor((v) => (v === row.id ? null : row.id))} style={ACTION_BTN}>{showDiff ? 'Скрыть diff' : 'Diff с текущей'}</button>
                  )}
                  <button type="button" data-testid={`version-rename-${row.id}`} onClick={() => doRename(row.id, entry.name)} title="Переименовать" style={ACTION_BTN}>✎</button>
                  <select
                    data-testid={`version-status-${row.id}`}
                    value={status || ''}
                    onChange={(e) => doSetStatus(row.id, e.target.value)}
                    title="Статус версии"
                    style={{ ...ACTION_BTN, padding: '1px 4px' }}
                  >
                    <option value="">— статус —</option>
                    {Object.entries(STATUS_META).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
                  </select>
                  <button type="button" data-testid={`version-delete-${row.id}`} onClick={() => doDelete(row.id, entry.name)} title="Удалить в Корзину" style={{ ...ACTION_BTN, color: 'rgb(220,38,38)' }}>🗑</button>
                </div>

                {showDiff && headEntry && (
                  <VersionDiff
                    testId={`version-diff-panel-${row.id}`}
                    fromEntry={entry}
                    toEntry={headEntry}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function VersionDiff({ fromEntry, toEntry, testId }) {
  const diff = useMemo(() => {
    const a = fromEntry?.payload?.sequence || '';
    const b = toEntry?.payload?.sequence || '';
    const cds = (toEntry?.payload?.annotations || [])
      .filter((x) => /cds/i.test(x?.type || '') && Number.isFinite(x?.start) && Number.isFinite(x?.end))
      .map((x) => ({ start: x.start, end: x.end }));
    return sequenceDiff(a, b, cds);
  }, [fromEntry, toEntry]);
  const subN = diff.substitutions.length;
  const dl = diff.lengthDelta;
  const gc = diff.gcDelta;
  return (
    <div data-testid={testId} style={{ marginTop: 5, padding: '5px 7px', background: 'var(--surface-2)', borderRadius: 'var(--radius-md)', fontSize: 11, color: 'var(--text-secondary)', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
      <span>сравнение с текущей «{toEntry?.name || toEntry?.id}»</span>
      <span>замен: <b>{subN}</b></span>
      <span>Δдлины: <b>{dl > 0 ? `+${dl}` : dl}</b> bp</span>
      <span>ΔGC: <b>{gc > 0 ? `+${gc}` : gc}</b>%</span>
    </div>
  );
}
