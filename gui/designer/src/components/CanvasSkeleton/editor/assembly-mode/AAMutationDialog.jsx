import {
  useEffect, useMemo, useRef, useState,
} from 'react';
import { createPortal } from 'react-dom';
import { AA_NAMES, getCodonsForAA } from '../../../../codons';
import { chooseMutantCodon, getCommonSubstitutions } from '../../../../mutagenesis';
import { t, tf } from '../../../../i18n';
import { Icon } from '../../../icons/Icon';
import useModalKeyboardBoundary from '../../../../hooks/useModalKeyboardBoundary';

const AMINO_ACIDS = Object.keys(AA_NAMES).filter((aa) => aa !== '*').sort();

function recommendedAA(sourceAA) {
  return getCommonSubstitutions(sourceAA).find((item) => item.to !== sourceAA)?.to
    || AMINO_ACIDS.find((aa) => aa !== sourceAA)
    || 'A';
}

function countChanges(fromCodon, toCodon) {
  let count = 0;
  for (let i = 0; i < 3; i += 1) if (fromCodon[i] !== toCodon[i]) count += 1;
  return count;
}

export default function AAMutationDialog({ selection, error = null, onApply, onCancel }) {
  const modalBoundary = useModalKeyboardBoundary(onCancel);
  const sourceAA = String(selection?.aa || '').toUpperCase();
  const sourceCodon = String(selection?.codon || '').toUpperCase();
  const [targetAA, setTargetAA] = useState(() => recommendedAA(sourceAA));
  const codons = useMemo(() => getCodonsForAA(targetAA), [targetAA]);
  const preferredCodon = chooseMutantCodon(sourceCodon, targetAA)?.codon || codons[0]?.codon || '';
  const [targetCodon, setTargetCodon] = useState(preferredCodon);
  const previousFocusRef = useRef(typeof document !== 'undefined' ? document.activeElement : null);

  useEffect(() => {
    setTargetCodon(preferredCodon);
  }, [preferredCodon]);

  useEffect(() => () => {
    const prior = previousFocusRef.current;
    if (prior && typeof prior.focus === 'function' && prior.isConnected) prior.focus();
  }, []);

  const apply = () => onApply({ targetAA, targetCodon });
  const aaIndex = Number.isInteger(selection?.aaIndex) ? selection.aaIndex : '?';

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="aa-mutation-title"
      data-testid="aa-mutation-dialog"
      {...modalBoundary}
      onMouseDown={onCancel}
      style={backdropStyle}
    >
      <div onMouseDown={(event) => event.stopPropagation()} style={panelStyle}>
        <header style={headerStyle}>
          <h2 id="aa-mutation-title" style={titleStyle}>{t('aa.mutation.title')}</h2>
          <button
            type="button"
            aria-label={t('aa.mutation.close')}
            data-testid="aa-mutation-cancel"
            onClick={onCancel}
            style={iconButtonStyle}
          >
            <Icon name="close" size={14} />
          </button>
        </header>

        <div style={bodyStyle}>
          <div data-testid="aa-mutation-source" style={sourceStyle}>
            <span style={fieldLabelStyle}>{t('aa.mutation.source')}</span>
            <strong>{`${sourceAA}${aaIndex} (${sourceCodon})`}</strong>
          </div>

          <div style={formRowStyle}>
            <label style={fieldStyle}>
              <span style={fieldLabelStyle}>{t('aa.mutation.targetAA')}</span>
              <select
                autoFocus
                data-testid="aa-mutation-target-aa"
                value={targetAA}
                onChange={(event) => setTargetAA(event.target.value)}
                style={controlStyle}
              >
                {AMINO_ACIDS.map((aa) => (
                  <option key={aa} value={aa}>{`${aa} · ${AA_NAMES[aa]}`}</option>
                ))}
              </select>
            </label>
            <label style={fieldStyle}>
              <span style={fieldLabelStyle}>{t('aa.mutation.targetCodon')}</span>
              <select
                data-testid="aa-mutation-target-codon"
                value={targetCodon}
                onChange={(event) => setTargetCodon(event.target.value)}
                style={controlStyle}
              >
                {codons.map(({ codon, frequency }) => (
                  <option key={codon} value={codon}>{`${codon} · ${frequency}`}</option>
                ))}
              </select>
            </label>
          </div>

          <div data-testid="aa-mutation-change-count" style={summaryStyle}>
            <strong>{`${sourceAA}${aaIndex} (${sourceCodon}) → ${targetAA} (${targetCodon})`}</strong>
            <span>{tf('aa.mutation.changes', { count: countChanges(sourceCodon, targetCodon) })}</span>
          </div>

          {error && (
            <div role="alert" data-testid="aa-mutation-error" style={errorStyle}>{error}</div>
          )}
        </div>

        <footer style={footerStyle}>
          <button type="button" onClick={onCancel} style={secondaryButtonStyle}>
            {t('aa.mutation.cancel')}
          </button>
          <button
            type="button"
            data-testid="aa-mutation-apply"
            onClick={apply}
            style={primaryButtonStyle}
          >
            {t('aa.mutation.apply')}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

const backdropStyle = {
  position: 'fixed', inset: 0, zIndex: 120,
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
  background: 'color-mix(in srgb, var(--text-primary) 28%, transparent)',
};
const panelStyle = {
  width: 'min(480px, 100%)', overflow: 'hidden',
  background: 'var(--surface-1)', color: 'var(--text-primary)',
  border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)',
  boxShadow: 'var(--shadow-lg)',
};
const headerStyle = {
  display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
  background: 'var(--surface-2)', borderBottom: '1px solid var(--border-subtle)',
};
const titleStyle = { flex: 1, margin: 0, fontSize: 14, fontWeight: 650 };
const iconButtonStyle = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  width: 28, height: 28, padding: 0, cursor: 'pointer',
  color: 'var(--text-secondary)', background: 'transparent',
  border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)',
};
const bodyStyle = { display: 'flex', flexDirection: 'column', gap: 14, padding: 16 };
const sourceStyle = {
  display: 'flex', flexDirection: 'column', gap: 4, padding: 10,
  background: 'var(--surface-2)', borderRadius: 'var(--radius-md)',
};
const formRowStyle = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 };
const fieldStyle = { display: 'flex', flexDirection: 'column', gap: 5 };
const fieldLabelStyle = { fontSize: 11, color: 'var(--text-secondary)' };
const controlStyle = {
  width: '100%', minHeight: 32, padding: '5px 8px',
  color: 'var(--text-primary)', background: 'var(--surface-1)',
  border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)',
};
const summaryStyle = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
  padding: 10, color: 'var(--text-secondary)', background: 'var(--surface-2)',
  borderRadius: 'var(--radius-md)', fontSize: 12,
};
const errorStyle = {
  padding: 10, color: 'var(--danger-fg)', background: 'var(--danger-bg)',
  border: '1px solid var(--danger-fg)', borderRadius: 'var(--radius-md)', fontSize: 12,
};
const footerStyle = {
  display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '10px 12px',
  background: 'var(--surface-2)', borderTop: '1px solid var(--border-subtle)',
};
const secondaryButtonStyle = {
  padding: '6px 12px', cursor: 'pointer', color: 'var(--text-secondary)',
  background: 'transparent', border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-sm)',
};
const primaryButtonStyle = {
  padding: '6px 14px', cursor: 'pointer', fontWeight: 600,
  color: 'var(--surface-1)', background: 'var(--accent-500)', border: 'none',
  borderRadius: 'var(--radius-sm)',
};
