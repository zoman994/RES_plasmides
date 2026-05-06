import { useMemo, useState, useEffect } from 'react';
import { STRINGS } from '../../../lib/strings';
import { sanitizeWithReport } from '../../../sequence-utils';
import { rotateOriginToPosition } from '../../../rotate-origin';
import { computeIntergenicHints } from './lib/intergenic-hints';
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
  const onApplyOrigin = () => {
    if (!canApplyOrigin) return;
    const out = rotateOriginToPosition(
      liveSequence,
      liveAnnotations,
      originOffset,
      { topology: 'circular' },
    );
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
        {/* UX-014 — radio buttons used to be icon-only (◯ / —), which
            biolog couldn't read at a glance. First fix tried mixing
            icon + label in one button but the Unicode glyphs collided
            with the text («значки кривые», 2026-05-06). Now: text-only
            labels — same compact footprint, zero ambiguity. The
            ToggleButton's active outline already conveys the state. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <ToggleButton
            active={isCircular}
            onClick={() => onTopologyChange('circular')}
            title={S.metaTopologyCircularTitle}
            data-testid="importer-meta-topology-circular"
          >{S.metaTopologyCircularLabel || 'Circular'}</ToggleButton>
          <ToggleButton
            active={!isCircular}
            onClick={() => onTopologyChange('linear')}
            title={S.metaTopologyLinearTitle}
            data-testid="importer-meta-topology-linear"
          >{S.metaTopologyLinearLabel || 'Linear'}</ToggleButton>
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                type="number"
                min={1}
                max={Math.max(1, length)}
                value={originOffset}
                data-testid="importer-meta-origin-input"
                onChange={(e) => setOriginOffset(Number(e.target.value) || 1)}
                style={{
                  width: 72, fontSize: 12, fontFamily: 'var(--font-mono)',
                  padding: '3px 6px', textAlign: 'right',
                  background: 'var(--surface-1)', color: 'var(--text-primary)',
                  border: '0.5px solid var(--border-default)',
                  borderRadius: 'var(--radius-md)', outline: 'none',
                }}
              />
              <button
                type="button"
                onClick={onApplyOrigin}
                disabled={!canApplyOrigin}
                data-testid="importer-meta-origin-apply"
                style={{
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
                <span style={{
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--text-primary)',
                  wordBreak: 'break-word',
                }}>{hints}</span>
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
