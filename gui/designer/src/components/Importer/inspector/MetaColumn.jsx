import { useMemo } from 'react';
import { STRINGS } from '../../../lib/strings';
import { sanitizeWithReport } from '../../../sequence-utils';
import TagsEditor from './TagsEditor';

const S = STRINGS.importer;

/**
 * MetaColumn — 200 px sibling column right of Inspector (M-B.2 K3).
 *
 * Hosts:
 *   - Topology toggle (◯ / —)
 *   - Length / Info / IUPAC cards
 *   - Description / Organism / Source cards (when present)
 *
 * Origin offset control moved to SequenceTab (v0.7.x): biolog wants to pick
 * the start position visually with nucleotide numbers in front of them, not
 * blindly type into a sidebar input. The «межгенные участки» hints follow
 * the control to its new home.
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
  if (!item) return null; // eslint-disable-line react-hooks/rules-of-hooks

  const length = item.length || item.sequence?.length || 0;
  const topology = edits.editedTopology ?? item.topology ?? 'linear';
  const isCircular = topology === 'circular';

  const sanitize = useMemo(() => { // eslint-disable-line react-hooks/rules-of-hooks
    if (!item.sequence) return null;
    try { return sanitizeWithReport(item.sequence); } catch { return null; }
  }, [item.sequence]);

  const onTopologyChange = (next) => {
    if (next === item.topology) {
      // Same as parsed → drop the override.
      onUpdateEdits?.({ editedTopology: undefined });
    } else {
      onUpdateEdits?.({ editedTopology: next });
    }
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ToggleButton
            active={isCircular}
            onClick={() => onTopologyChange('circular')}
            title={S.metaTopologyCircularTitle}
            data-testid="importer-meta-topology-circular"
          >◯</ToggleButton>
          <ToggleButton
            active={!isCircular}
            onClick={() => onTopologyChange('linear')}
            title={S.metaTopologyLinearTitle}
            data-testid="importer-meta-topology-linear"
          >—</ToggleButton>
        </div>
      </Card>

      {/* Origin control moved to SequenceTab — see <SequenceTab>. Length
          card stays here as a quick reference field. */}
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
