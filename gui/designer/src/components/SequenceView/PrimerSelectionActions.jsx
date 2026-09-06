/**
 * PrimerSelectionActions — the two questions that live next to a selection.
 *
 *   1. «Do I already have this oligo?» — answered while the selection moves,
 *      from REAL stock only. An exact hit offers reuse; an oligo that lands on
 *      the same place but is not the same tube says so in those words, because
 *      ordering it again is a different decision from reusing one.
 *
 *   2. «These two landings — what would they amplify?» — a compact preview and
 *      exactly ONE action. Not a wizard, not a new modal, and not a second
 *      model of a reaction: the action hands the resolved product to the piece
 *      path the canvas already owns.
 *
 * A pair that cannot amplify shows WHY instead of a disabled button, and
 * warnings never remove the action — a mismatched base is as often a
 * deliberate substitution as a mistake.
 */
import { useMemo } from 'react';
import Icon from '../icons/Icon';
import { t, tf } from '../../i18n';
import {
  matchLabPrimersForSelection,
  buildPrimerFromSelection,
  evaluatePrimerWarnings,
} from '../../lib/primer-live-workflow';
import { resolvePcrProduct } from '../../lib/pcr-amplicon';

const wrap = {
  display: 'flex', flexDirection: 'column', gap: 8,
  padding: '8px 10px',
  background: 'var(--surface-2)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-md, 6px)',
  fontFamily: 'var(--font-ui)',
  fontSize: 12,
  color: 'var(--text-primary)',
};
const headRow = {
  display: 'flex', alignItems: 'center', gap: 6,
  fontSize: 11, color: 'var(--text-secondary)',
};
const chipRow = { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' };
const mono = { fontFamily: 'var(--mono, ui-monospace)', fontSize: 11.5 };
const ghost = {
  fontSize: 11, padding: '3px 10px', background: 'transparent',
  border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md, 6px)',
  cursor: 'pointer', color: 'var(--text-secondary)',
};
const primary = {
  fontSize: 12, padding: '5px 14px', fontWeight: 600, cursor: 'pointer',
  background: 'var(--accent-500)', color: 'var(--accent-text)',
  border: '1px solid var(--accent-700)', borderRadius: 'var(--radius-md, 6px)',
};
const advisoryText = { fontSize: 11, color: 'var(--text-tertiary)' };
const warnText = { fontSize: 11, color: 'var(--warning-fg)' };

function warningText(w) {
  if (w.code === 'mismatch') {
    return tf('pcr.product.warn.mismatch', { positions: (w.positions || []).join(', ') });
  }
  return tf(`pcr.product.warn.${w.code}`, w);
}

export default function PrimerSelectionActions({
  template = '',
  topology = 'linear',
  selection = null,
  occurrences = [],
  primersById = {},
  labRecords = [],
  onReuseLabPrimer,
  onCreatePcrProduct,
}) {
  const labMatches = useMemo(() => {
    if (!selection || !Number.isInteger(selection.start) || !Number.isInteger(selection.end)) {
      return { exact: [], sameBinding: [], substitutions: [] };
    }
    return matchLabPrimersForSelection({
      template, topology, start: selection.start, end: selection.end, records: labRecords,
    });
  }, [template, topology, selection, labRecords]);

  // Two landings is the question. One is a selection, three is a different
  // question the user has not asked yet.
  const resolved = useMemo(() => {
    if (!Array.isArray(occurrences) || occurrences.length !== 2) return null;
    return resolvePcrProduct({ template, topology, occurrences, primersById });
  }, [template, topology, occurrences, primersById]);

  // What the oligo under the selection would be like to work with. These are
  // shown BEFORE anything is created, and none of them prevents creating it —
  // a low Tm or a hairpin is information the biolog weighs, not a veto.
  const selectionWarnings = useMemo(() => {
    if (!selection || !Number.isInteger(selection.start) || !Number.isInteger(selection.end)) {
      return [];
    }
    const record = buildPrimerFromSelection({
      template, topology, start: selection.start, end: selection.end, direction: 'forward',
    });
    if (!record) return [];
    return evaluatePrimerWarnings(record, { template, topology });
  }, [template, topology, selection]);

  const hasLab = labMatches.exact.length > 0
    || labMatches.sameBinding.length > 0
    || labMatches.substitutions.length > 0;
  if (!hasLab && !resolved && selectionWarnings.length === 0) return null;

  return (
    <div
      data-testid="primer-selection-actions"
      data-primer-disclosure-keepopen="true"
      style={wrap}
    >
      {hasLab && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={headRow}>
            <Icon name="primer-pool" size={14} />
            <span>{t('primer.lab.title')}</span>
          </div>
          {labMatches.exact.map((m) => (
            <div key={m.record.id} data-testid={`primer-lab-exact-${m.record.id}`} style={chipRow}>
              <Icon name="check" size={14} style={{ color: 'var(--success-fg)' }} />
              <span style={mono}>{m.record.name || m.record.id}</span>
              <span style={advisoryText}>
                {t('primer.lab.exact')}
                {' · '}
                {t(`primer.lab.orientation.${m.orientation}`)}
              </span>
              {typeof onReuseLabPrimer === 'function' && (
                <button
                  type="button"
                  data-testid={`primer-lab-reuse-${m.record.id}`}
                  onClick={() => onReuseLabPrimer(m.record, {
                    ...m, selection, topology,
                  })}
                  style={ghost}
                >
                  {t('primer.lab.reuse')}
                </button>
              )}
            </div>
          ))}
          {/* Lands here, but is NOT this oligo — another 5' tail or another
              modification. Deliberately given no one-click reuse: choosing it
              is ordering something different, not reusing what you have. */}
          {labMatches.sameBinding.map((m) => (
            <div
              key={m.record.id}
              data-testid={`primer-lab-same-binding-${m.record.id}`}
              style={chipRow}
            >
              <Icon name="info" size={14} style={{ color: 'var(--info-fg)' }} />
              <span style={mono}>{m.record.name || m.record.id}</span>
              <span style={advisoryText}>
                {t('primer.lab.sameBinding')}
                {m.tailDiffers ? ` · ${t('primer.lab.sameBindingTail')}` : ''}
                {m.modificationsDiffer ? ` · ${t('primer.lab.sameBindingMods')}` : ''}
              </span>
            </div>
          ))}
          {/* Advisory, and rendered after every confirmed answer on purpose:
              a near miss must never read as «you have this». */}
          {labMatches.substitutions.map((m) => (
            <div
              key={m.record.id}
              data-testid={`primer-lab-substitution-${m.record.id}`}
              style={chipRow}
            >
              <Icon name="warning" size={14} style={{ color: 'var(--warning-fg)' }} />
              <span style={mono}>{m.record.name || m.record.id}</span>
              <span style={advisoryText}>
                {tf('primer.lab.substitution', { n: m.mismatches })}
              </span>
            </div>
          ))}
        </div>
      )}

      {selectionWarnings.length > 0 && (
        <div data-testid="primer-selection-warnings" style={warnText}>
          {selectionWarnings.map(warningText).join(' · ')}
        </div>
      )}

      {resolved && resolved.ok !== true && (
        <div data-testid="pcr-product-blocked" style={{ ...chipRow, ...warnText }}>
          <Icon name="warning" size={14} />
          <span>{t(`pcr.product.blocked.${resolved.reason}`)}</span>
        </div>
      )}

      {resolved && resolved.ok === true && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div data-testid="pcr-product-preview" style={chipRow}>
            <Icon name="pcr" size={14} />
            <span>{t('pcr.product.title')}</span>
            <span style={mono}>
              {tf('pcr.product.length', { n: resolved.product.length })}
            </span>
            {resolved.product.wrapsOrigin && (
              <span data-testid="pcr-product-wraps" style={advisoryText}>
                {t('pcr.product.wraps')}
              </span>
            )}
          </div>
          {resolved.warnings.length > 0 && (
            <div data-testid="pcr-product-warnings" style={warnText}>
              {resolved.warnings.map(warningText).join(' · ')}
            </div>
          )}
          <div>
            <button
              type="button"
              data-testid="pcr-product-create"
              onClick={() => onCreatePcrProduct && onCreatePcrProduct(resolved)}
              style={primary}
            >
              {t('pcr.product.create')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
