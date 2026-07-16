/**
 * EnzymeCard — the minimal card an enzyme pick opens (REV #2 §10.5). NON-MODAL: a small
 * `region` (not a dialog) — it focuses itself on open and Escape closes it, without trapping
 * focus. Picking an enzyme opens it; the cut-site scan is a SEPARATE, explicit action that
 * runs a canonical `cut:` query — never an implicit re: rewrite. The scan button lives HERE,
 * outside the interactive result option (no nested button in the row).
 */
import React, { useEffect, useRef } from 'react';
import { effectiveEnzymes } from '../../restriction-db';
import { Icon } from '../icons/Icon';

export default function EnzymeCard({ enzymeId, onScanSites, onClose }) {
  const ref = useRef(null);
  useEffect(() => { if (enzymeId && ref.current) ref.current.focus?.(); }, [enzymeId]);
  if (!enzymeId) return null;
  let site = '';
  try { site = effectiveEnzymes()?.[enzymeId]?.site || ''; } catch { /* pure data module; ignore a load hiccup */ }
  return (
    <div
      ref={ref}
      data-testid="enzyme-card"
      role="region"
      aria-label={`Фермент ${enzymeId}`}
      tabIndex={-1}
      onKeyDown={(e) => { if (e.key === 'Escape') onClose?.(); }}
      style={{
        position: 'absolute', top: 52, right: 12, zIndex: 40, width: 260,
        background: 'var(--surface-1)', border: '1px solid var(--border-subtle)',
        borderRadius: 8, boxShadow: 'var(--shadow-lg)', padding: 12,
        // NOTE: no `outline: 'none'` — the card takes programmatic focus on open, so the
        // global :focus-visible ring must stay visible for keyboard users (K6-P2b review).
        display: 'flex', flexDirection: 'column', gap: 8,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>{enzymeId}</span>
        <button
          type="button" data-testid="enzyme-card-close" onClick={onClose} aria-label="Закрыть"
          style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-tertiary)', display: 'inline-flex' }}
        ><Icon name="close" size={14} /></button>
      </div>
      {site && (
        <div data-testid="enzyme-card-site" style={{ fontSize: 11.5, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
          Сайт: {site}
        </div>
      )}
      <button
        type="button" data-testid="enzyme-card-scan" onClick={onScanSites}
        style={{
          border: '1px solid var(--border-subtle)', borderRadius: 6, cursor: 'pointer',
          background: 'var(--surface-2)', color: 'var(--text-primary)', padding: '5px 8px', fontSize: 11.5,
          display: 'inline-flex', alignItems: 'center', gap: 6,
        }}
      ><Icon name="restriction" size={14} /> Найти сайты в библиотеке</button>
    </div>
  );
}
