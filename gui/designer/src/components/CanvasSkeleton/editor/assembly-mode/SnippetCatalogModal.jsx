/**
 * SnippetCatalogModal — M-CANVAS-WORKFLOW-UX K3 (SPEC §3.1.B / §8).
 * «+ Обвес»: pick a built-in or custom snippet (tag / linker /
 * start-stop / RE site) to drop as a kind='snippet' piece — visually a
 * strip block, mechanically embedded into a neighbour primer's tail.
 *
 * Custom snippets persist account-global in the Dexie `snippets` table
 * (K2). Closes on Esc / click-outside (ui-interactions modal contract).
 */
import { useEffect, useMemo, useState } from 'react';
import { v7 as uuidv7 } from 'uuid';
import {
  BUILTIN_SNIPPETS, SNIPPET_CATEGORIES, searchSnippets, isValidSnippetSequence,
} from '../../lib/snippet-catalog';
import { listSnippets, putSnippet } from '../../../../db/dexie-schema';

const CATS = [{ id: 'all', label: 'Все' }, ...SNIPPET_CATEGORIES];

export default function SnippetCatalogModal({ onPick, onCancel }) {
  const [custom, setCustom] = useState([]);
  const [cat, setCat] = useState('all');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [cName, setCName] = useState('');
  const [cSeq, setCSeq] = useState('');

  const reloadCustom = async () => {
    try { setCustom(await listSnippets()); } catch { setCustom([]); }
  };
  useEffect(() => { reloadCustom(); }, []);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const rows = useMemo(() => {
    const pool = searchSnippets(query, custom);
    return cat === 'all' ? pool : pool.filter((s) => s.category === cat);
  }, [query, custom, cat]);

  const cSeqValid = isValidSnippetSequence(cSeq);
  const canSave = cName.trim().length > 0 && cSeqValid;

  const saveCustom = async () => {
    if (!canSave) return;
    const row = {
      id: `snip-custom-${uuidv7()}`,
      name: cName.trim(),
      sequence: cSeq.toUpperCase(),
      category: 'custom',
      isCustom: true,
      createdAt: new Date().toISOString(),
    };
    try { await putSnippet(row); } catch { /* ignore — UI still updates */ }
    await reloadCustom();
    setShowCustomForm(false);
    setCName('');
    setCSeq('');
    setSelected(row);
  };

  const confirm = () => {
    if (!selected) return;
    onPick({
      sequence: selected.sequence,
      snippetType: selected.snippetType || selected.name,
      name: selected.name,
      embedsInPrimer: true,
    });
  };

  return (
    <div
      role="dialog"
      data-testid="snippet-catalog-modal"
      onClick={onCancel}
      style={{
        position: 'absolute', inset: 0, zIndex: 100,
        background: 'rgba(28,25,23,0.32)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 540, maxHeight: '82%', display: 'flex', flexDirection: 'column',
          background: 'var(--surface-1)', color: 'var(--text-primary)',
          border: '1px solid var(--border-subtle)', borderRadius: 8,
          boxShadow: '0 8px 28px rgba(28,25,23,0.24)', overflow: 'hidden',
        }}
      >
        <div style={hdr}>
          <strong style={{ fontSize: 12.5, flex: 1 }}>Каталог обвесов</strong>
          <button type="button" data-testid="snippet-cancel" onClick={onCancel} style={ghostBtn}>✕</button>
        </div>

        <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-subtle)' }}>
          <input
            data-testid="snippet-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск по имени или последовательности…"
            style={textInput}
          />
          <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
            {CATS.map((c) => {
              const active = cat === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  data-testid={`snippet-cat-${c.id}`}
                  onClick={() => setCat(c.id)}
                  style={{
                    padding: '3px 9px', borderRadius: 999, fontSize: 10.5,
                    border: `1px solid ${active ? 'var(--accent-500, #b85c3e)' : 'var(--border-subtle)'}`,
                    background: active ? 'var(--accent-wash, rgba(184,92,62,0.10))' : 'var(--surface-1)',
                    color: active ? 'var(--accent-700, #8a3a22)' : 'var(--text-secondary)',
                    cursor: 'pointer', fontWeight: active ? 600 : 400,
                  }}
                >{c.label}</button>
              );
            })}
          </div>
        </div>

        <div data-testid="snippet-list" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 8 }}>
          {rows.length === 0 && (
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', padding: 10 }}>Ничего не найдено.</div>
          )}
          {rows.map((s) => {
            const sel = selected && selected.id === s.id;
            return (
              <button
                key={s.id}
                type="button"
                data-testid={`snippet-item-${s.id}`}
                onClick={() => setSelected(s)}
                style={{
                  display: 'flex', width: '100%', alignItems: 'center', gap: 8,
                  padding: '6px 10px', marginBottom: 4, textAlign: 'left', fontSize: 11.5,
                  border: `1px solid ${sel ? 'var(--accent-500, #b85c3e)' : 'var(--border-subtle)'}`,
                  background: sel ? 'var(--accent-wash, rgba(184,92,62,0.10))' : 'var(--surface-2)',
                  borderRadius: 4, cursor: 'pointer',
                }}
              >
                <strong style={{ width: 130, flexShrink: 0 }}>{s.name}</strong>
                <span style={{
                  fontFamily: 'var(--font-mono, monospace)', color: 'var(--text-tertiary)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
                }}>{s.sequence}</span>
                <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{s.sequence.length} нт</span>
              </button>
            );
          })}
        </div>

        {selected && (
          <div data-testid="snippet-preview" style={{ padding: '6px 12px', borderTop: '1px solid var(--border-subtle)', fontSize: 11, fontFamily: 'var(--font-mono, monospace)', color: 'var(--text-secondary)', wordBreak: 'break-all' }}>
            {selected.name} = {selected.sequence} ({selected.sequence.length} нт)
          </div>
        )}

        {showCustomForm && (
          <div style={{ padding: 12, borderTop: '1px solid var(--border-subtle)', background: 'var(--surface-2)' }}>
            <input
              data-testid="snippet-custom-name"
              value={cName}
              onChange={(e) => setCName(e.target.value)}
              placeholder="Имя"
              style={{ ...textInput, marginBottom: 6 }}
            />
            <textarea
              data-testid="snippet-custom-seq"
              value={cSeq}
              onChange={(e) => setCSeq(e.target.value)}
              placeholder="ATCG… (≤200 нт)"
              rows={2}
              style={{
                width: '100%', fontSize: 12, fontFamily: 'var(--font-mono, monospace)',
                padding: 8, border: `1px solid ${cSeq && !cSeqValid ? 'var(--accent-500, #b85c3e)' : 'var(--border-subtle)'}`,
                borderRadius: 4, background: 'var(--surface-1)', color: 'var(--text-primary)',
                outline: 'none', resize: 'vertical', boxSizing: 'border-box',
              }}
            />
            <button
              type="button"
              data-testid="snippet-custom-save"
              disabled={!canSave}
              onClick={saveCustom}
              style={{ ...primaryBtn, marginTop: 6, opacity: canSave ? 1 : 0.5, cursor: canSave ? 'pointer' : 'not-allowed' }}
            >Сохранить обвес</button>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, padding: '8px 12px', borderTop: '1px solid var(--border-subtle)', background: 'var(--surface-2)' }}>
          <button
            type="button"
            data-testid="snippet-custom-toggle"
            onClick={() => setShowCustomForm((v) => !v)}
            style={ghostBtn}
          >+ Создать свой</button>
          <span style={{ flex: 1 }} />
          <button type="button" data-testid="snippet-cancel-2" onClick={onCancel} style={ghostBtn}>Отмена</button>
          <button
            type="button"
            data-testid="snippet-add"
            disabled={!selected}
            onClick={confirm}
            style={{ ...primaryBtn, opacity: selected ? 1 : 0.5, cursor: selected ? 'pointer' : 'not-allowed' }}
          >Добавить →</button>
        </div>
      </div>
    </div>
  );
}

const hdr = {
  display: 'flex', alignItems: 'center', padding: '8px 12px',
  borderBottom: '1px solid var(--border-subtle)', background: 'var(--surface-2)',
};
const ghostBtn = {
  fontSize: 11, padding: '4px 10px', background: 'transparent',
  border: '1px solid var(--border-subtle)', borderRadius: 4, cursor: 'pointer', color: 'var(--text-secondary)',
};
const primaryBtn = {
  fontSize: 11.5, padding: '5px 16px', background: 'var(--accent-500, #b85c3e)',
  color: '#fff', border: 'none', borderRadius: 4, fontWeight: 600,
};
const textInput = {
  width: '100%', fontSize: 12, padding: '6px 8px', border: '1px solid var(--border-subtle)',
  borderRadius: 4, background: 'var(--surface-2)', color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box',
};
