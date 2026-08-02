/**
 * SmartResultRow — one row of the universal search dropdown (P2).
 *
 * Layout: [topology thumb] [title with <mark>] [reason chip] [honest metrics,
 * coloured by strength] [N locations ▸]. Purely presentational — fed a
 * resultRowViewModel (search-result-vm). Colour encodes strength (identity ??
 * compatibility), never «valid/invalid»; an IUPAC hit reads «100% совместимость».
 */
import React from 'react';
import HighlightedText from '../common/HighlightedText';
import LocusSummary from '../Search/LocusSummary';
import { LOCUS_LABELS } from '../../lib/search-locus-labels';
import { strengthColor } from '../../lib/identity-color';
import { t, tf } from '../../i18n';
import { Icon } from '../icons/Icon';

// Icon by result KIND (§10.4) — a project/primer/enzyme must not read as a molecule.
const ICON_FOR_KIND = { entry: 'dna', project: 'folder', primer: 'primer', enzyme: 'restriction' };

export default function SmartResultRow({ vm, onPick, testId, active = false, statusLabel = null }) {
  if (!vm) return null;
  const tid = testId || `smart-result-${vm.id}`;
  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      onClick={() => onPick?.(vm.id, vm)}
      style={{
        width: '100%', textAlign: 'left', border: 'none',
        background: active ? 'var(--surface-2)' : 'transparent',
        padding: 0, cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 8,
        borderBottom: '1px solid var(--border-subtle)',
        fontSize: 11.5,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-2)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = active ? 'var(--surface-2)' : 'transparent'; }}
    >
      <SmartResultContent vm={vm} testId={tid} statusLabel={statusLabel} />
    </button>
  );
}

/**
 * Non-interactive row body for SearchResultsListbox. The listbox <li> owns the
 * option role, DOM id, selected state and click; this body never nests another
 * button/link inside it. SmartResultRow above remains the standalone wrapper for
 * legacy consumers and tests.
 *
 * `statusLabel` (S3-CLOSE K2.4) names the row's VERIFICATION state — "checking" while the
 * biological check is still running, "unverified" once it failed. A confirmed row carries none.
 * It is a plain <span>: the <li> owns the option role, so the body must stay non-interactive.
 */
export function SmartResultContent({ vm, testId, active = false, statusLabel = null }) {
  if (!vm) return null;
  const color = vm.metrics ? strengthColor(vm.metrics) : undefined;
  const tid = testId || `smart-result-${vm.id}`;
  const kindIcon = ICON_FOR_KIND[vm.refKind] || 'dna';
  const kindTitle = ICON_FOR_KIND[vm.refKind]
    ? t(`search.kind.${vm.refKind}`)
    : t(vm.topology === 'circular' ? 'search.topology.circular' : 'search.topology.linear');
  return (
    <div
      data-testid={tid}
      style={{
        width: '100%', padding: '6px 10px',
        display: 'flex', flexDirection: 'column', gap: 3,
        borderBottom: '1px solid var(--border-subtle)',
        background: active ? 'var(--surface-2)' : 'transparent',
        fontSize: 11.5,
      }}
    >
      {/* §5.3.1 — the MAIN line is the name and the identity percentage. Everything else belongs to
          the card the active row opens, so a list of molecules stays scannable. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
      <span
        data-testid={`${tid}-kind-icon`}
        style={{
          flex: '0 0 18px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--text-tertiary)',
        }}
        title={kindTitle}
      >
        <Icon name={kindIcon} size={14} />
      </span>

      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1, overflow: 'hidden' }}>
        <HighlightedText
          text={vm.title}
          spans={vm.nameHighlights}
          testId={`${tid}-title`}
          style={{
            color: 'var(--text-primary)', fontWeight: 500,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}
        />
        {vm.proteinExplain && (
          <span
            data-testid={`${tid}-protein-explain`}
            title={vm.proteinExplain}
            style={{
              fontSize: 9.5, color: 'var(--text-tertiary)',
              display: 'flex', alignItems: 'center', gap: 3,
              overflow: 'hidden', whiteSpace: 'nowrap',
            }}
          >
            <Icon name="dna" size={11} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{vm.proteinExplain}</span>
          </span>
        )}
        {vm.enzymeExplain && (
          <span
            data-testid={`${tid}-enzyme-explain`}
            title={vm.enzymeExplain}
            style={{
              fontSize: 9.5, color: 'var(--text-tertiary)',
              display: 'flex', alignItems: 'center', gap: 3,
              overflow: 'hidden', whiteSpace: 'nowrap',
            }}
          >
            <Icon name="restriction" size={11} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{vm.enzymeExplain}</span>
          </span>
        )}
      </span>

      {statusLabel && (
        <span
          data-testid={`${tid}-status`}
          style={{
            flexShrink: 0, fontSize: 10, padding: '0 6px', borderRadius: 9,
            background: 'var(--info-bg)', color: 'var(--info-fg)',
            border: '1px solid var(--border-subtle)',
          }}
        >{statusLabel}</span>
      )}

      {vm.reasonLabel && (
        <span
          data-testid={`${tid}-reason`}
          style={{
            flexShrink: 0, fontSize: 10, padding: '0 6px', borderRadius: 9,
            background: 'var(--surface-2)', color: 'var(--text-secondary)',
            border: '1px solid var(--border-subtle)',
          }}
        >{vm.reasonLabel}</span>
      )}

      {/* The legacy metric SENTENCE survives ONLY where there is no canonical locus — a protein or
          enzyme hit, which has no alignment and therefore no `identityBps`. On a DNA locus it used to
          render BESIDE the canonical numbers, so one row stated identity twice: `Math.round(float)`
          against basis points (99.99 % printed as «100 %»), and `m.length` against `alignmentLength`
          as the denominator, which differ precisely when there is an indel. */}
      {!vm.locus && vm.metricsText && (
        <span
          data-testid={`${tid}-metrics`}
          style={{ flexShrink: 0, color, fontWeight: 500, fontSize: 10.5 }}
        >{vm.metricsText}</span>
      )}
      {!vm.locus && vm.locationCount > 0 && (
        <span
          data-testid={`${tid}-locations`}
          style={{ flexShrink: 0, color: 'var(--text-tertiary)', fontSize: 10 }}
        >{tf('search.locations', { count: vm.locationCount })}</span>
      )}

      {/* Identity — the one number the main line carries for a DNA locus, from the engine's own
          integer via the SHARED summary. */}
      <LocusSummary summary={vm.locus} testIdPrefix={tid} part="identity" dense labels={LOCUS_LABELS()} />
      </div>

      {/* The compact card of supporting numbers: strand, half-open coordinates (BOTH segments on a
          wrap), M/L, X·I·D, gap events and the physical locus count. It belongs to the ACTIVE row —
          and «active» is one state reached by hover AND by keyboard focus, so this is never
          hover-only information. Same component, same object as the in-molecule popover. */}
      {active && vm.locus && (
        <div
          data-testid={`${tid}-card`}
          style={{
            display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6,
            paddingLeft: 26, // clears the kind icon so the card aligns under the name
          }}
        >
          <LocusSummary summary={vm.locus} testIdPrefix={tid} part="card" dense labels={LOCUS_LABELS()} />
        </div>
      )}
    </div>
  );
}
