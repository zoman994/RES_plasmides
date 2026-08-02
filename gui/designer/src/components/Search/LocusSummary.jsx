import React from 'react';

// Identity buckets — SEMANTIC tokens only, never raw hex, so the numbers recolour with the theme.
// Deliberately NOT `lib/identity-color.js::strengthColor`: that ladder still carries two literal
// amber/orange hexes and is keyed on a float, while this one is keyed on the engine's integer basis
// points. Moved here from the popover, which already had it right.
const BUCKET_COLOR = {
  high: 'var(--success-fg)',
  mid: 'var(--warning-fg)',
  orange: 'var(--danger-fg)',
  low: 'var(--text-tertiary)',
};
function bucketColor(identityBps) {
  if (identityBps >= 9000) return BUCKET_COLOR.high;
  if (identityBps >= 8000) return BUCKET_COLOR.mid;
  if (identityBps >= 7000) return BUCKET_COLOR.orange;
  return BUCKET_COLOR.low;
}

// The token is declared in every theme block of index.css, so a `, monospace` fallback would be
// dead code that also lets a missing token pass unnoticed. Coordinates and counters are read by
// comparing them down a column, and a proportional font makes `[1180, 1200)` and `[118, 120)` the
// same width.
const MONO = 'var(--font-mono)';

/**
 * LocusSummary — the ONE presentation of a locus (U5-A).
 *
 * Every surface that shows «where and how well a query matched» renders this component with the same
 * `locusSummary()` object: the global dropdown row and the in-molecule popover. That is the whole
 * point — two independently-written summaries drifted into two different numbers for one occurrence
 * (a float-rounded percentage in one, basis points in the other; coordinates in one, none in the
 * other), and a biologist comparing the two screens had no way to know which was true.
 *
 * `part` splits it the way §5.3.1 splits the row: the main line of a result carries the name and the
 * identity percentage ONLY (`part="identity"`), and the supporting numbers appear in the compact card
 * the active row opens (`part="card"`) — reached by hover AND by keyboard focus, never by hover
 * alone. The popover lists loci in full, so it renders `part="all"`.
 *
 * Every number carries its WORD in the DOM: `X·I·D` used to be a bare «1·1·1» whose meaning lived in
 * a `title` on a non-focusable span, which neither a keyboard user nor a screen reader ever reaches.
 *
 * It is deliberately NON-INTERACTIVE: a plain `<span>` tree with no button, link or tabindex. Its
 * callers put it inside a `role="option"` (the dropdown's `<li>`) or a `<button>` (the popover row),
 * and nesting an interactive element inside either is forbidden by the design system.
 *
 * `components/Search` is a UI-only cluster (its own boundary test enforces it), so the wording is
 * INJECTED rather than looked up here: the component knows how a locus is laid out, and the feature
 * that renders it knows what its labels are called. Reaching into `i18n` from inside would make a
 * presentational leaf depend on the app's string catalogue.
 *
 * @param {{summary: object|null, testIdPrefix: string, part?: 'identity'|'card'|'all',
 *   dense?: boolean, labels?: {strand?: string, coords?: string, coordsTitle?: string}}} props
 *   `summary` is `locusSummary(occurrence)`; `null` renders nothing (a metadata / protein / enzyme
 *   hit has no alignment to describe, and zeros would be a claim rather than an absence).
 */
export default function LocusSummary({
  summary, testIdPrefix, part = 'all', dense = false, labels = {},
}) {
  if (!summary) return null;
  const size = dense ? 10.5 : 11;
  const cell = { fontSize: size, color: 'var(--text-tertiary)', whiteSpace: 'nowrap' };
  const label = { fontSize: dense ? 9.5 : 10, color: 'var(--text-tertiary)', whiteSpace: 'nowrap' };

  const identity = (
    <span
      key="identity"
      data-testid={`${testIdPrefix}-identity`}
      style={{ fontSize: size, fontWeight: 500, color: bucketColor(summary.identityBps) }}
    >{summary.identityPct}%</span>
  );

  if (part === 'identity') return identity;

  const card = [
    <span key="strand-label" style={label}>{labels.strand}</span>,
    <span
      key="strand"
      data-testid={`${testIdPrefix}-strand`}
      style={{
        fontFamily: MONO,
        fontSize: size,
        // `both` and `+` are the accent; a minus-strand hit is deliberately quieter — it is not
        // weaker biology, it is the less common reading direction and should not shout.
        color: summary.strandRaw === '-' ? 'var(--text-tertiary)' : 'var(--accent-700)',
      }}
    >{summary.strand}</span>,

    <span key="coords-label" style={label}>{labels.coords}</span>,
    <span
      key="coords"
      data-testid={`${testIdPrefix}-coords`}
      title={labels.coordsTitle}
      style={{ ...cell, fontFamily: MONO, color: 'var(--text-secondary)' }}
    >{summary.coords}</span>,

    // Every counted cell is mono (CURRENT_TASK §U5): M/L, the X·I·D counts and the gap events are
    // read by comparing them DOWN a column across rows, and proportional digits make that impossible.
    <span key="ml" data-testid={`${testIdPrefix}-ml`} style={{ ...cell, fontFamily: MONO }}>{summary.ntText}</span>,
    <span key="xid" data-testid={`${testIdPrefix}-xid`} style={{ ...cell, fontFamily: MONO }}>{summary.xidText}</span>,
    <span key="gaps" data-testid={`${testIdPrefix}-gaps`} style={{ ...cell, fontFamily: MONO }}>{summary.gapsText}</span>,
  ];
  // How many physical loci the molecule has — from the SAME summary object, so this can never be
  // quietly replaced by the size of the listed window (501 found, 500 listed).
  if (summary.locationsText) {
    card.push(
      <span key="locations" data-testid={`${testIdPrefix}-locations`} style={{ ...cell, fontFamily: MONO }}>{summary.locationsText}</span>,
    );
  }

  return part === 'card' ? <>{card}</> : <>{identity}{card}</>;
}
