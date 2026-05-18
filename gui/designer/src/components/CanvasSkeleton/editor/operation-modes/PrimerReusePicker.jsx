/**
 * PrimerReusePicker — pick an existing primer from the pool
 * (F3 DEC-CANVAS-PCR-07). Filters state.primers by name/sequence
 * substring. Similarity ranking vs the current suggestion
 * (primer-reuse.findCompatiblePrimers) is a follow-up — see F3
 * deviations; the F3 pool is empty so ranking is moot for now.
 */
import { useState } from 'react';
import { useSkeletonState } from '../../store/skeleton-context';

export default function PrimerReusePicker({ onPick }) {
  const state = useSkeletonState();
  const pool = state.primers || [];
  const [q, setQ] = useState('');
  const filtered = pool.filter((p) => {
    if (!q) return true;
    const hay = `${p.name || ''} ${p.sequence || ''}`.toLowerCase();
    return hay.includes(q.toLowerCase());
  });

  return (
    <div data-testid="pcr-reuse-picker" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <input
        data-testid="pcr-reuse-filter"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Фильтр праймеров…"
        style={{ fontSize: 11, padding: '3px 6px', border: '1px solid var(--border-subtle)', borderRadius: 4, background: 'var(--surface-1)' }}
      />
      {filtered.length === 0 && (
        <div data-testid="pcr-reuse-empty" style={{ fontSize: 10.5, color: 'var(--text-tertiary)' }}>
          Нет сохранённых праймеров
        </div>
      )}
      {filtered.map((p) => (
        <button
          key={p.id || p.name || p.sequence}
          type="button"
          data-testid="pcr-reuse-item"
          onClick={() => onPick?.({ ...p, source: 'reused' })}
          style={{ textAlign: 'left', fontSize: 10.5, fontFamily: 'var(--mono, monospace)', padding: '3px 6px', border: '1px solid var(--border-subtle)', borderRadius: 4, background: 'transparent', cursor: 'pointer', color: 'var(--text-secondary)' }}
        >
          {(p.name || '—')} · {(p.sequence || '').slice(0, 18)}
        </button>
      ))}
    </div>
  );
}
