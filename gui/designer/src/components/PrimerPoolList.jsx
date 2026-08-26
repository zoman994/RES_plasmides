/**
 * PrimerPoolList — PRIMER-2/2b/3 (Игорь /loop 28.06.2026). The flat «список» of
 * the unified primer pool: one view over primerSlice.primersById. Every saved
 * oligo across the library + projects, with its lifecycle status (designed →
 * ordered → received → archived), inline name edit, free-form tags (add/remove),
 * where it binds in the library («куда садится», PrimerBindingSites), a scope
 * badge and delete. Status + tag filters on top.
 *
 * Presentation-only over the store; hosted full-page by PrimerPoolWorkspace
 * (sidebar «Праймеры» destination). No chrome of its own.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store';
import { Icon } from './icons/Icon';
import PrimerStatusControl from './PrimerStatusControl';
import PrimerBindingSites from './PrimerBindingSites';
import { ALL_STATUSES, statusLabel, statusRank } from '../lib/primer-status';
import { t, tf } from '../i18n';

const FILTERS = [
  { value: 'active', label: 'Активные (без архива)' },
  { value: 'all', label: 'Все' },
  ...ALL_STATUSES.map((s) => ({ value: s, label: statusLabel(s) })),
];

export default function PrimerPoolList({ selectedPrimerId = null } = {}) {
  const primersById = useStore((s) => s.primersById);
  const projects = useStore((s) => s.projects);
  const currentProjectId = useStore((s) => s.currentProjectId);
  const promotePrimerStatus = useStore((s) => s.promotePrimerStatus);
  const removePrimerFromPool = useStore((s) => s.removePrimerFromPool);
  const updatePrimerFields = useStore((s) => s.updatePrimerFields);
  const hydratePrimers = useStore((s) => s.hydratePrimers);

  const [filter, setFilter] = useState('active');
  const [tagFilter, setTagFilter] = useState('');

  // Pool's in-memory map is empty until something hydrates it (see useEntryPrimers
  // note). Mounting this list is exactly such a moment — guarded + idempotent.
  useEffect(() => {
    if (typeof hydratePrimers !== 'function') return;
    if (typeof indexedDB === 'undefined') return;
    Promise.resolve(hydratePrimers()).catch(() => {});
  }, [hydratePrimers]);

  // All tags across the whole pool (stable dropdown, independent of filters).
  const allTags = useMemo(() => {
    const set = new Set();
    for (const p of Object.values(primersById || {})) {
      for (const t of p.tags || []) set.add(t);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [primersById]);

  const rows = useMemo(() => {
    let list = Object.values(primersById || {});
    if (filter === 'active') list = list.filter((p) => (p.status || 'imported') !== 'archived');
    else if (filter !== 'all') list = list.filter((p) => (p.status || 'imported') === filter);
    if (tagFilter) list = list.filter((p) => (p.tags || []).includes(tagFilter));
    // A primer picked in global search (§10.4) must ALWAYS be visible — even an archived one
    // the `active` filter would hide — or the pool lands on an empty/wrong row.
    const sel = selectedPrimerId && primersById?.[selectedPrimerId];
    if (sel && !list.some((p) => p.id === selectedPrimerId)) list = [sel, ...list];
    // Stable order: lifecycle rank asc (designed first, archived last), then newest.
    list.sort((a, b) => (statusRank(a.status) - statusRank(b.status))
      || (b.addedAt || '').localeCompare(a.addedAt || ''));
    return list;
  }, [primersById, filter, tagFilter, selectedPrimerId]);

  const scopeLabel = (p) => {
    if (!p.projectId) return 'Библиотека';
    const proj = projects?.[p.projectId];
    const name = proj?.name || p.projectId;
    return p.projectId === currentProjectId ? `${name} · текущий` : name;
  };

  const onPromote = (id, status) => {
    if (typeof promotePrimerStatus === 'function') promotePrimerStatus(id, status);
  };
  const onDelete = (id) => {
    if (typeof removePrimerFromPool === 'function') removePrimerFromPool(id);
  };
  const onRename = (id, name) => {
    if (typeof updatePrimerFields === 'function') updatePrimerFields(id, { name });
  };
  const onSetTags = (id, tags) => {
    if (typeof updatePrimerFields === 'function') updatePrimerFields(id, { tags });
  };

  return (
    <div data-testid="primer-pool-list" style={{ display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%' }}>
      <div style={{
        padding: '0 0 10px', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
        borderBottom: '1px solid var(--border-subtle, #e7e5e4)', marginBottom: 10,
      }}>
        <span style={{ fontSize: 12, color: 'var(--text-secondary, #57534e)' }}>
          В пуле <span data-testid="primer-pool-count" style={{ fontWeight: 600 }}>({rows.length})</span>
        </span>
        <span style={{ flex: 1 }} />
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
          Тег:
          <select
            data-testid="primer-pool-tag-filter"
            value={tagFilter}
            onChange={(e) => setTagFilter(e.target.value)}
            style={selStyle}
          >
            <option value="">Все теги</option>
            {allTags.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
          Статус:
          <select
            data-testid="primer-pool-status-filter"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={selStyle}
          >
            {FILTERS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
        </label>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.length === 0 && (
          <div data-testid="primer-pool-empty" style={{ color: 'var(--text-tertiary, #a8a29e)', fontSize: 12, padding: 8 }}>
            {tagFilter
              ? `Нет праймеров с тегом «${tagFilter}».`
              : (filter === 'active' && Object.keys(primersById || {}).length > 0
                ? 'Нет активных праймеров (все в архиве). Выберите «Все» в фильтре.'
                : 'Пул пуст. Праймеры попадают сюда при импорте .dna, проектировании сборки или создании в библиотеке.')}
          </div>
        )}
        {rows.map((p) => (
          <PrimerPoolRow
            key={p.id}
            primer={p}
            scopeLabel={scopeLabel(p)}
            selected={p.id === selectedPrimerId}
            onPromote={onPromote}
            onDelete={onDelete}
            onRename={onRename}
            onSetTags={onSetTags}
          />
        ))}
      </div>
    </div>
  );
}

function PrimerPoolRow({ primer: p, scopeLabel, onPromote, onDelete, onRename, onSetTags, selected = false }) {
  const tags = p.tags || [];
  const rowRef = useRef(null);
  // A primer picked in global search (§10.4) scrolls its pool row into view + highlights it.
  useEffect(() => {
    if (selected && rowRef.current) rowRef.current.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  }, [selected]);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(p.name || '');
  const [addingTag, setAddingTag] = useState(false);
  const [tagDraft, setTagDraft] = useState('');
  const [showBind, setShowBind] = useState(false);

  const commitName = () => {
    const next = nameDraft.trim();
    if (next && next !== p.name) onRename(p.id, next);
    setEditingName(false);
  };
  const startEdit = () => { setNameDraft(p.name || ''); setEditingName(true); };

  const commitTag = () => {
    const t = tagDraft.trim();
    if (t && !tags.includes(t)) onSetTags(p.id, [...tags, t]);
    setTagDraft('');
    setAddingTag(false);
  };
  const removeTag = (t) => onSetTags(p.id, tags.filter((x) => x !== t));

  return (
    <div
      ref={rowRef}
      data-testid={`primer-pool-row-${p.id}`}
      aria-current={selected ? 'true' : undefined}
      style={{
        border: selected ? '1px solid var(--accent-500)' : '1px solid var(--border-subtle, #e7e5e4)',
        borderRadius: 6, padding: '8px 10px',
        background: selected ? 'var(--surface-2)' : 'var(--surface-1, #fff)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {editingName ? (
          <input
            data-testid={`primer-pool-name-input-${p.id}`}
            autoFocus
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitName();
              else if (e.key === 'Escape') { setEditingName(false); }
            }}
            style={{
              fontSize: 12, fontWeight: 600, padding: '1px 4px',
              border: '1px solid var(--accent-500, #b45309)', borderRadius: 3, minWidth: 120,
            }}
          />
        ) : (
          <button
            type="button"
            data-testid={`primer-pool-name-${p.id}`}
            onClick={startEdit}
            title="Переименовать"
            style={{
              fontSize: 12, fontWeight: 600, background: 'transparent', border: 'none',
              padding: 0, cursor: 'text', color: 'var(--text-primary, #1c1917)',
            }}
          >{p.name || 'primer'}</button>
        )}
        {p.direction && (
          <span style={{ fontSize: 9, padding: '0 4px', borderRadius: 3, background: 'var(--surface-2, #f5f5f4)', color: 'var(--text-secondary, #57534e)' }}>
            {p.direction === 'reverse' ? 'rev' : 'fwd'}
          </span>
        )}
        <span
          data-testid={`primer-pool-scope-${p.id}`}
          style={{ fontSize: 9.5, padding: '0 5px', borderRadius: 9, background: 'var(--accent-50, #fef3c7)', color: 'var(--accent-text, #b45309)' }}
        >{scopeLabel}</span>
        <span style={{ flex: 1 }} />
        <PrimerStatusControl primer={p} onPromote={onPromote} />
      </div>

      <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 10, fontSize: 10.5, color: 'var(--text-secondary, #57534e)' }}>
        {/* ANN-0L — an unknown full oligo is stated, not rendered as a blank
            cell. A source file can declare where a primer binds without ever
            giving the oligo itself, and that record still belongs here. */}
        {p.sequence ? (
          <>
            <span style={{ fontFamily: 'ui-monospace, monospace', color: 'var(--text-primary, #1c1917)', wordBreak: 'break-all' }}>
              {p.sequence.toUpperCase().slice(0, 60)}{p.sequence.length > 60 ? '…' : ''}
            </span>
            <span style={{ whiteSpace: 'nowrap' }}>{p.length || p.sequence.length} nt</span>
          </>
        ) : (
          <span
            data-testid={`primer-pool-noseq-${p.id}`}
            style={{ fontStyle: 'italic', color: 'var(--text-tertiary, #a8a29e)' }}
          >
            {t('primer.sequenceUnknown')}
          </span>
        )}
        <span data-testid={`primer-pool-sites-${p.id}`} style={{ whiteSpace: 'nowrap' }}>
          {Array.isArray(p.sites) && p.sites.length > 0
            ? tf('primer.sitesCount', { n: p.sites.length })
            : t('primer.sitesNone')}
        </span>
        {typeof p.tm === 'number' && <span style={{ whiteSpace: 'nowrap' }}>Tm {p.tm}°C</span>}
      </div>

      {/* PRIMER-3 — tags */}
      <div style={{ marginTop: 5, display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
        {tags.map((t) => (
          <span
            key={t}
            data-testid={`primer-pool-tag-${p.id}-${t}`}
            style={{
              fontSize: 9.5, padding: '1px 4px 1px 7px', borderRadius: 9,
              background: 'var(--surface-2, #f5f5f4)', color: 'var(--text-secondary, #57534e)',
              display: 'inline-flex', alignItems: 'center', gap: 3,
            }}
          >
            {t}
            <button
              type="button"
              data-testid={`primer-pool-tag-remove-${p.id}-${t}`}
              onClick={() => removeTag(t)}
              title="Убрать тег"
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary, #a8a29e)', padding: 0, lineHeight: 1, fontSize: 11 }}
            >×</button>
          </span>
        ))}
        {addingTag ? (
          <input
            data-testid={`primer-pool-tag-input-${p.id}`}
            autoFocus
            value={tagDraft}
            onChange={(e) => setTagDraft(e.target.value)}
            onBlur={commitTag}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitTag();
              else if (e.key === 'Escape') { setTagDraft(''); setAddingTag(false); }
            }}
            placeholder="тег…"
            style={{ fontSize: 9.5, padding: '1px 4px', border: '1px solid var(--accent-500, #b45309)', borderRadius: 9, width: 80 }}
          />
        ) : (
          <button
            type="button"
            data-testid={`primer-pool-tag-add-${p.id}`}
            onClick={() => setAddingTag(true)}
            style={{
              fontSize: 9.5, padding: '1px 6px', borderRadius: 9,
              border: '1px dashed var(--border-default, #d6d3d1)', background: 'transparent',
              color: 'var(--text-tertiary, #a8a29e)', cursor: 'pointer',
            }}
          >+ тег</button>
        )}
      </div>

      <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          type="button"
          data-testid={`primer-pool-bind-${p.id}`}
          onClick={() => setShowBind((v) => !v)}
          style={{
            fontSize: 10, padding: 0, background: 'transparent', border: 'none',
            color: 'var(--accent-500, #4f46e5)', cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 3,
          }}
        ><Icon name="search" size={11} /> куда садится</button>
        <span style={{ flex: 1 }} />
        <button
          type="button"
          data-testid={`primer-pool-delete-${p.id}`}
          onClick={() => onDelete(p.id)}
          title="Удалить из пула"
          style={{
            fontSize: 10, padding: 0, background: 'transparent', border: 'none',
            color: 'var(--text-tertiary, #a8a29e)', cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 3,
          }}
        ><Icon name="trash" size={11} /> удалить</button>
      </div>
      {showBind && <PrimerBindingSites primer={p} />}
    </div>
  );
}

const selStyle = {
  padding: '3px 6px', fontSize: 11,
  border: '1px solid var(--border-default, #d6d3d1)', borderRadius: 4,
};
