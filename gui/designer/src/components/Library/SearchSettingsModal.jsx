/**
 * SearchSettingsModal — the GLOBAL «Настройки поиска» window (P2).
 *
 * The smart box works with zero configuration; the advanced knobs live HERE, not
 * as a gear on the bar. Opens on the `bodgegene:open-search-settings` event (the
 * bar's «изменить» link). EVERY item carries a plain-language explanation of what
 * it does and why. Save persists via search-prefs (validated/clamped); Reset
 * restores defaults in the form (persisted on Save). Self-contained — mount once.
 */
import React, { useEffect, useState } from 'react';
import {
  loadSearchPrefs, saveSearchPrefs, DEFAULT_SEARCH_PREFS,
} from '../../lib/search-prefs';

// One row per knob: how to render it + the «что и зачем» help text.
const ITEMS = [
  {
    key: 'identityThreshold', label: 'Порог сходства', kind: 'percent', min: 0.5, max: 1, step: 0.05,
    help: 'Скрывать совпадения слабее этого порога. Ниже порог — больше находок, но и больше случайных.',
  },
  {
    key: 'bothStrands', label: 'Обе цепи', kind: 'bool',
    help: 'Искать и на обратной (комплементарной) цепи. Обычно нужно — сайт может быть на любой из двух.',
  },
  {
    key: 'circular', label: 'Кольцевой поиск', kind: 'enum', options: ['auto', 'on', 'off'],
    help: 'Разрешить мотиву пересекать точку начала (origin) кольцевой плазмиды. «auto» — включать для кольцевых.',
  },
  {
    key: 'minQueryLen', label: 'Мин. длина ДНК-запроса', kind: 'int', min: 4, max: 30, step: 1,
    help: 'Короче этого — строка ищется как имя, не как последовательность. Для короткого мотива используйте префикс «seq:».',
  },
  {
    key: 'headVersionsOnly', label: 'Только последние версии (в разработке)', kind: 'bool',
    help: 'Не показывать исторические версии одной молекулы — только её актуальную «голову». Пока не влияет на выдачу — требует связки с деревом версий (lineage).',
  },
  {
    key: 'limit', label: 'Макс. результатов', kind: 'int', min: 10, max: 1000, step: 10,
    help: 'Сколько результатов показывать максимум.',
  },
];

const ENUM_LABEL = { auto: 'авто', on: 'вкл', off: 'выкл' };

export default function SearchSettingsModal() {
  const [open, setOpen] = useState(false);
  const [prefs, setPrefs] = useState(() => loadSearchPrefs());

  useEffect(() => {
    const onOpen = () => { setPrefs(loadSearchPrefs()); setOpen(true); };
    window.addEventListener('bodgegene:open-search-settings', onOpen);
    return () => window.removeEventListener('bodgegene:open-search-settings', onOpen);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open) return null;

  const set = (k, v) => setPrefs((p) => ({ ...p, [k]: v }));
  const onSave = () => { saveSearchPrefs(prefs); setOpen(false); };
  const onReset = () => setPrefs({ ...DEFAULT_SEARCH_PREFS });

  const renderControl = (item) => {
    const v = prefs[item.key];
    const tid = `search-setting-${item.key}`;
    if (item.kind === 'bool') {
      return (
        <input type="checkbox" data-testid={tid} checked={!!v}
          onChange={(e) => set(item.key, e.target.checked)} />
      );
    }
    if (item.kind === 'enum') {
      return (
        <select data-testid={tid} value={v} onChange={(e) => set(item.key, e.target.value)}
          style={selStyle}>
          {item.options.map((o) => <option key={o} value={o}>{ENUM_LABEL[o] || o}</option>)}
        </select>
      );
    }
    // percent / int → range + readout
    const isPct = item.kind === 'percent';
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        <input
          type="range" data-testid={tid} min={item.min} max={item.max} step={item.step} value={v}
          onChange={(e) => set(item.key, isPct ? parseFloat(e.target.value) : parseInt(e.target.value, 10))}
        />
        <span style={{ minWidth: 40, fontSize: 11, color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
          {isPct ? `${Math.round(v * 100)}%` : v}
        </span>
      </span>
    );
  };

  return (
    <div
      data-testid="search-settings-backdrop"
      onClick={() => setOpen(false)}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.32)', display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        data-testid="search-settings-modal"
        role="dialog"
        aria-label="Настройки поиска"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 540, maxWidth: '92vw', maxHeight: '86vh', overflowY: 'auto',
          background: 'var(--surface-1)', color: 'var(--text-primary)',
          border: '1px solid var(--border-default)', borderRadius: 10,
          boxShadow: '0 18px 60px rgba(0,0,0,0.32)', padding: 20,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Настройки поиска</h2>
        </div>
        <p style={{ fontSize: 11.5, color: 'var(--text-tertiary)', margin: '0 0 14px' }}>
          Умный поиск работает и без настроек — здесь спрятаны продвинутые параметры.
        </p>

        {ITEMS.map((item) => (
          <div
            key={item.key}
            style={{ padding: '10px 0', borderTop: '1px solid var(--border-subtle)' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12.5, fontWeight: 500 }}>{item.label}</span>
              {renderControl(item)}
            </div>
            <div
              data-testid={`search-setting-${item.key}-help`}
              style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4, lineHeight: 1.4 }}
            >{item.help}</div>
          </div>
        ))}

        <div style={{ display: 'flex', gap: 8, marginTop: 18, justifyContent: 'flex-end' }}>
          <button
            type="button" data-testid="search-settings-reset" onClick={onReset}
            style={btnGhost}
          >Сбросить к умолчаниям</button>
          <button
            type="button" data-testid="search-settings-save" onClick={onSave}
            style={btnPrimary}
          >Сохранить</button>
        </div>
      </div>
    </div>
  );
}

const selStyle = {
  fontSize: 12, padding: '3px 6px', borderRadius: 4,
  border: '1px solid var(--border-subtle)', background: 'var(--surface-2)', color: 'var(--text-primary)',
};
const btnGhost = {
  fontSize: 12, padding: '6px 12px', borderRadius: 6, cursor: 'pointer',
  background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)',
};
const btnPrimary = {
  fontSize: 12, padding: '6px 14px', borderRadius: 6, cursor: 'pointer', fontWeight: 500,
  background: 'var(--accent-500, #b85c3e)', color: '#fff', border: 'none',
};
