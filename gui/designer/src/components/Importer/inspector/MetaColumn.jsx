import { useMemo, useState, useEffect } from 'react';
import { STRINGS } from '../../../lib/strings';
import { sanitizeWithReport } from '../../../sequence-utils';
import { rotateOriginToPosition } from '../../../rotate-origin';
import { computeIntergenicHints } from './lib/intergenic-hints';
import { useStore } from '../../../store';
import TagsEditor from './TagsEditor';

const S = STRINGS.importer;

/**
 * MetaColumn — 200 px sibling column right of Inspector (M-B.2 K3).
 *
 * Hosts:
 *   - Tags editor
 *   - Topology toggle (◯ / —)
 *   - Origin offset control + intergenic hints (circular only)
 *   - Length / Info / IUPAC cards
 *   - Description / Organism / Source cards (when present)
 *
 * Origin control history: was here originally → moved to SequenceTab
 * v0.7.x so biolog could pick a start with nucleotide numbers visible →
 * moved back to MetaColumn 04.05.2026 evening (биолог: «эту панель на
 * право, под топологию»). Sequence-tab now stays viewer-only — picking
 * a start point is a metadata edit, sits with topology + length on the
 * right rail.
 *
 * Edit semantics: changes go through `onUpdateEdits(patch)` (parent passes
 * the editor that scopes by fileName). topologyChange writes
 * `editedTopology` so the file-level topology inferred from parser is
 * non-destructive — the original parse stays in `item.topology`.
 */
export default function MetaColumn({
  item,
  edits = {},
  onUpdateEdits,
}) {
  // Origin offset state — must live above the early-return so hooks
  // ordering is stable across re-renders. `null` value means "no item
  // yet"; the input itself only renders when item + isCircular are
  // both true (further down in the JSX).
  const [originOffset, setOriginOffset] = useState(1);
  const itemKey = item ? (item._fileName || item.id || item.name || '') : null;
  // Reset the origin input back to 1 when biolog switches plasmids.
  useEffect(() => { setOriginOffset(1); }, [itemKey]);

  // Compute current sequence + annotations (post-edits) up here so the
  // hooks below can depend on them deterministically. When `item` is
  // null we still need to call useMemo with stable inputs to keep the
  // hook count constant — fall back to empty values.
  const liveSequence = (item && (edits?.editedSequence ?? item.sequence)) || '';
  const liveAnnotations = (item && (Array.isArray(edits?.editedAnnotations)
    ? edits.editedAnnotations
    : (item.annotations || []))) || [];
  const liveTopology = (item && (edits?.editedTopology ?? item.topology)) || 'linear';
  const length = (item && (item.length || liveSequence.length)) || 0;

  const sanitize = useMemo(() => {
    if (!item?.sequence) return null;
    try { return sanitizeWithReport(item.sequence); } catch { return null; }
  }, [item?.sequence]);

  // Intergenic-hint string («1-145, 604-926, …») — same algorithm as
  // SequenceTab used. Only meaningful for circular topology, but cheap
  // to compute regardless; gating happens at render-time.
  const hints = useMemo(
    () => computeIntergenicHints({
      sequence: liveSequence,
      annotations: liveAnnotations,
      topology: liveTopology,
      length,
    }),
    [liveSequence, liveAnnotations, liveTopology, length],
  );

  if (!item) return null;

  const isCircular = liveTopology === 'circular';

  const onTopologyChange = (next) => {
    if (next === item.topology) {
      // Same as parsed → drop the override.
      onUpdateEdits?.({ editedTopology: undefined });
    } else {
      onUpdateEdits?.({ editedTopology: next });
    }
  };

  const canApplyOrigin = isCircular
    && !!liveSequence
    && originOffset > 1
    && originOffset <= length
    && typeof onUpdateEdits === 'function';
  // UX-036 — surface a toast after origin rotation so biolog has
  // explicit confirmation that all region coords got pushed. Without
  // it the change happens silently and the only sign was the input
  // resetting to 1.
  const showToast = useStore((s) => s.showToast);
  const onApplyOrigin = () => {
    if (!canApplyOrigin) return;
    const out = rotateOriginToPosition(
      liveSequence,
      liveAnnotations,
      originOffset,
      { topology: 'circular' },
    );
    const regionsCount = Array.isArray(out?.annotations) ? out.annotations.length : 0;
    if (typeof showToast === 'function') {
      showToast(
        `Origin сменён на ${originOffset} bp · ${regionsCount} регионов пересчитано`,
        'success',
      );
    }
    onUpdateEdits({
      editedSequence: out.sequence,
      editedAnnotations: out.annotations,
    });
    setOriginOffset(1);
  };

  return (
    <aside
      data-testid="importer-meta-column"
      style={{
        width: 200, flexShrink: 0,
        padding: 10,
        borderLeft: '0.5px solid var(--border-subtle, #e7e5e4)',
        background: 'var(--surface-2, #f5f5f4)',
        display: 'flex', flexDirection: 'column', gap: 8,
        minHeight: 0,
        overflowY: 'auto',
      }}
    >
      {/* TagsEditor moved here from the Inspector title row
          (Importer-merge-tabs reshuffle, 04.05.2026 — биолог: «теги
          убираем в боковую панель»). The compact card sits at the top
          of the right rail with a hint label so biolog finds it via
          the same visual taxonomy as the rest of MetaColumn. */}
      <Card label={S.metaTagsLabel}>
        <TagsEditor
          tags={Array.isArray(edits.editedTags) ? edits.editedTags : []}
          onChange={(next) => onUpdateEdits?.({ editedTags: next })}
        />
      </Card>

      <Card label={S.metaTopology}>
        {/* 06.05.2026 round-7: biolog reported «жопа какая-то, всё кривое
            и не влезает». The shared ToggleButton component is hard-
            coded to 32×32 round shape (icon-only) — putting text
            children inside was clipped to the circle, biolog saw
            «Circul» / «Linear» fragments rather than the full labels.
            Switched to a pair of dedicated full-width pill buttons
            stacked vertically — each fills MetaColumn's 200 px column,
            icon on the left, label on the right. No clipping. */}
        <div
          role="radiogroup"
          style={{ display: 'flex', flexDirection: 'column', gap: 4 }}
        >
          <TopologyPill
            active={isCircular}
            onClick={() => onTopologyChange('circular')}
            title={S.metaTopologyCircularTitle}
            data-testid="importer-meta-topology-circular"
            label={S.metaTopologyCircularLabel || 'Circular'}
            icon={(
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                <circle cx="6" cy="6" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
              </svg>
            )}
          />
          <TopologyPill
            active={!isCircular}
            onClick={() => onTopologyChange('linear')}
            title={S.metaTopologyLinearTitle}
            data-testid="importer-meta-topology-linear"
            label={S.metaTopologyLinearLabel || 'Linear'}
            icon={(
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                <line x1="1" y1="6" x2="11" y2="6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            )}
          />
        </div>
      </Card>

      {/* Origin offset — circular only. Sits right under the topology
          card per biolog's 04.05.2026 layout request («эту панель на
          право, под топологию»). Apply rotates the sequence + all
          region/detail/point annotations so the user-picked nucleotide
          number becomes the new position 1. Intergenic hints suggest
          stretches of bare DNA where rotation won't bisect any
          feature. */}
      {isCircular && (
        <Card label={S.metaOrigin}>
          <div
            data-testid="importer-meta-origin"
            style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
          >
            {/* 06.05.2026 round-7: same MetaColumn 200 px squeeze.
                Input + Apply button used to share a row with width:72
                input + nowrap label, total ~150 px excluding card
                padding — fits but tight, biolog screenshot showed
                visual overlap. Input now flex:1 fills the row;
                Apply button keeps its compact label. flex-wrap
                lets the button drop to a second line on truly
                narrow viewports. */}
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
              <input
                type="number"
                min={1}
                max={Math.max(1, length)}
                value={originOffset}
                data-testid="importer-meta-origin-input"
                title="Координата нового начала кольцевой плазмиды (1 = первая база)"
                onChange={(e) => setOriginOffset(Number(e.target.value) || 1)}
                style={{
                  flex: '1 1 64px',
                  minWidth: 0,
                  fontSize: 12, fontFamily: 'var(--font-mono)',
                  padding: '3px 6px', textAlign: 'right',
                  background: 'var(--surface-1)', color: 'var(--text-primary)',
                  border: '0.5px solid var(--border-default)',
                  borderRadius: 'var(--radius-md)', outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
              <button
                type="button"
                onClick={onApplyOrigin}
                disabled={!canApplyOrigin}
                title="Применить: повернуть кольцо чтобы выбранная база стала позицией 1. Все аннотации пересчитаются."
                data-testid="importer-meta-origin-apply"
                style={{
                  flex: '0 0 auto',
                  fontSize: 11,
                  padding: '4px 8px',
                  background: 'var(--accent-500)',
                  color: 'var(--surface-1)',
                  border: 'none',
                  borderRadius: 'var(--radius-md)',
                  cursor: canApplyOrigin ? 'pointer' : 'not-allowed',
                  opacity: canApplyOrigin ? 1 : 0.4,
                  whiteSpace: 'nowrap',
                }}
              >{S.metaOriginApply}</button>
            </div>
            {hints && (
              <div
                data-testid="importer-meta-origin-hints"
                style={{ fontSize: 10, color: 'var(--text-secondary)', lineHeight: 1.4 }}
              >
                <span style={{
                  textTransform: 'uppercase', letterSpacing: 0.4,
                  color: 'var(--text-tertiary)', fontWeight: 500, marginRight: 4,
                }}>{S.metaOriginHintLabel}:</span>
                {/* UX-035 — intergenic ranges used to be plain text. Now
                    each `start–end` is a chip; clicking it pops the
                    matching coordinate into the origin input AND marks
                    it as a candidate. Saves biolog typing the boundary
                    they already see on screen. */}
                <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 4 }}>
                  {hints.split(',').map((range) => {
                    const trimmed = range.trim();
                    if (!trimmed) return null;
                    const startStr = trimmed.split(/[–-]/)[0];
                    const startBp = parseInt(startStr, 10);
                    const valid = Number.isFinite(startBp) && startBp > 0;
                    return (
                      <button
                        key={trimmed}
                        type="button"
                        data-testid={`importer-meta-origin-hint-${trimmed}`}
                        title={`Set origin to bp ${startBp}`}
                        onClick={() => valid && setOriginOffset(startBp)}
                        disabled={!valid}
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: 10,
                          padding: '1px 6px',
                          borderRadius: 9,
                          border: '0.5px solid var(--border-default)',
                          background: 'var(--surface-1)',
                          color: 'var(--text-primary)',
                          cursor: valid ? 'pointer' : 'default',
                        }}
                      >{trimmed}</button>
                    );
                  })}
                </span>
              </div>
            )}
          </div>
        </Card>
      )}

      <Card label={S.metaLengthLabel}>
        <div style={{ fontSize: 13, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', fontWeight: 500 }}>
          {length.toLocaleString()} bp
        </div>
      </Card>

      <Card label={S.metaInfo}>
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>{S.metaInfoFromFile}</span>
            <span style={{ fontWeight: 500 }}>{item._fromFileCount || 0}</span>
          </div>
          {edits.enrichedCache && Array.isArray(edits.enrichedCache) && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>{S.metaInfoEnriched}</span>
              <span style={{ fontWeight: 500, color: 'var(--accent-text)' }}>+{edits.enrichedCache.length - (item._fromFileCount || 0)}</span>
            </div>
          )}
        </div>
      </Card>

      {sanitize?.hasIUPAC && (sanitize.iupacChars || []).length > 0 && (
        <div
          data-testid="importer-meta-iupac"
          style={{
            background: 'var(--warning-chip, #fef3c7)',
            border: '0.5px solid var(--warning-text, #92400e)',
            borderRadius: 'var(--radius-md)',
            padding: '6px 10px',
            fontSize: 11,
            color: 'var(--warning-text, #92400e)',
          }}
        >{S.metaIupac(sanitize.iupacChars.join(', '))}</div>
      )}

      {/* Description / organism cards: shown only if data exists. Fills the
          MetaColumn vertical void (was 650px empty under the topology + length
          + info stack) with actually useful context, not filler. */}
      {item.description && (
        <Card label={S.metaDescription}>
          <div
            data-testid="importer-meta-description"
            style={{
              fontSize: 11, color: 'var(--text-primary)',
              lineHeight: 1.5,
              maxHeight: 240, overflowY: 'auto',
              wordBreak: 'break-word',
            }}
          >{item.description}</div>
        </Card>
      )}
      {item.organism && (
        <Card label={S.metaOrganism}>
          <div
            data-testid="importer-meta-organism"
            style={{ fontSize: 11, color: 'var(--text-primary)', fontStyle: 'italic' }}
          >{item.organism}</div>
        </Card>
      )}
      {item._source && (
        <Card label={S.metaSource}>
          <div
            data-testid="importer-meta-source"
            style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'capitalize' }}
          >{S.metaSourceValue(item._source)}</div>
        </Card>
      )}
    </aside>
  );
}

function Card({ label, children }) {
  return (
    <div
      style={{
        background: 'var(--surface-1)',
        border: '0.5px solid var(--border-default)',
        borderRadius: 'var(--radius-md)',
        padding: '6px 10px',
        display: 'flex', flexDirection: 'column', gap: 4,
      }}
    >
      <div
        style={{
          fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.6,
          color: 'var(--text-secondary)', fontWeight: 600,
        }}
      >{label}</div>
      {children}
    </div>
  );
}

function ToggleButton({ active, children, onClick, title, ...rest }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      {...rest}
      style={{
        width: 32, height: 32,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: '50%',
        border: `0.5px solid ${active ? 'var(--accent-500)' : 'var(--border-default)'}`,
        background: active ? 'var(--accent-50)' : 'var(--surface-1)',
        color: active ? 'var(--accent-text)' : 'var(--text-tertiary)',
        fontWeight: active ? 600 : 400,
        fontSize: 14, cursor: 'pointer',
      }}
    >{children}</button>
  );
}

// Round-7 helper (06.05.2026): full-width pill with icon + label,
// stacked vertically inside the 200 px MetaColumn so the «Circular»
// / «Linear» labels never clip («жопа какая-то, всё кривое и не
// влезает» — biolog). Active state mirrors the orange accent ring
// from the rest of the inspector. role=radio so the radiogroup
// wrapper a11y-tree reads correctly.
function TopologyPill({ active, onClick, title, label, icon, ...rest }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active ? 'true' : 'false'}
      onClick={onClick}
      title={title}
      {...rest}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        width: '100%',
        padding: '5px 10px',
        borderRadius: 'var(--radius-md)',
        border: `1px solid ${active ? 'var(--accent-500)' : 'var(--border-default)'}`,
        background: active ? 'var(--accent-50, #fff7ed)' : 'var(--surface-1)',
        color: active ? 'var(--accent-text, var(--accent-500))' : 'var(--text-secondary)',
        fontWeight: active ? 600 : 400,
        fontSize: 12,
        cursor: 'pointer',
        boxSizing: 'border-box',
        textAlign: 'left',
        transition: 'background 80ms linear, border-color 80ms linear',
      }}
    >
      <span
        aria-hidden
        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}
      >{icon}</span>
      <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
    </button>
  );
}
