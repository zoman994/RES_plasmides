import { useMemo, useState, useEffect } from 'react';
import { STRINGS } from '../../../lib/strings';
import { rotateOriginToPosition } from '../../../rotate-origin';
import { sanitizeWithReport } from '../../../sequence-utils';
import { computeIntergenicHints } from './lib/intergenic-hints';

const S = STRINGS.importer;

/**
 * MetaColumn — 200 px sibling column right of Inspector (M-B.2 K3).
 *
 * Hosts:
 *   - Topology toggle (◯ / —)
 *   - Origin offset input + Apply (visible only when topology === 'circular')
 *   - Intergenic gap hints
 *   - Info card (lengths / counts / IUPAC) when relevant
 *
 * Edit semantics: changes go through `onUpdateEdits(patch)` (parent passes
 * the editor that scopes by fileName). topologyChange writes
 * `editedTopology` so the file-level topology inferred from parser is
 * non-destructive — the original parse stays in `item.topology`. Origin
 * apply writes `editedSequence` + `editedAnnotations` (rotated coord space)
 * matching the v0.5 ImportStartScreen contract.
 */
export default function MetaColumn({
  item,
  edits = {},
  onUpdateEdits,
}) {
  const [originOffset, setOriginOffset] = useState(1);
  if (!item) return null; // eslint-disable-line react-hooks/rules-of-hooks

  const length = item.length || item.sequence?.length || 0;
  const topology = edits.editedTopology ?? item.topology ?? 'linear';
  const isCircular = topology === 'circular';

  // Re-derive intergenic hints from current display annotations.
  const hints = useMemo(() => computeIntergenicHints({ // eslint-disable-line react-hooks/rules-of-hooks
    ...item,
    annotations: edits.editedAnnotations ?? item.annotations,
  }), [item, edits.editedAnnotations]);

  const sanitize = useMemo(() => { // eslint-disable-line react-hooks/rules-of-hooks
    if (!item.sequence) return null;
    try { return sanitizeWithReport(item.sequence); } catch { return null; }
  }, [item.sequence]);

  // Reset originOffset when the parsed item changes.
  useEffect(() => { setOriginOffset(1); }, [item._fileName]); // eslint-disable-line react-hooks/rules-of-hooks

  const onTopologyChange = (next) => {
    if (next === item.topology) {
      // Same as parsed → drop the override.
      onUpdateEdits?.({ editedTopology: undefined });
    } else {
      onUpdateEdits?.({ editedTopology: next });
    }
  };

  const onApplyOrigin = () => {
    if (!isCircular || !item.sequence || !originOffset || originOffset === 1) return;
    const seq = edits.editedSequence ?? item.sequence;
    const anns = edits.editedAnnotations ?? item.annotations ?? [];
    const out = rotateOriginToPosition(seq, anns, originOffset, { topology: 'circular' });
    onUpdateEdits?.({
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

      {isCircular && (
        <Card label={S.metaOrigin}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="number"
              min={1}
              max={Math.max(1, length)}
              value={originOffset}
              data-testid="importer-meta-origin-input"
              onChange={(e) => setOriginOffset(Number(e.target.value) || 1)}
              style={{
                flex: 1, fontSize: 12, fontFamily: 'var(--font-mono)',
                padding: '4px 6px', textAlign: 'right',
                border: '0.5px solid var(--border-default)',
                borderRadius: 'var(--radius-md)', outline: 'none',
              }}
            />
          </div>
          <button
            type="button"
            onClick={onApplyOrigin}
            disabled={originOffset === 1 || originOffset < 1 || originOffset > length}
            data-testid="importer-meta-origin-apply"
            style={{
              marginTop: 6, width: '100%', fontSize: 11,
              padding: '4px 8px',
              background: 'var(--accent-500)',
              color: 'var(--surface-1)',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              cursor: (originOffset === 1 || originOffset < 1 || originOffset > length) ? 'not-allowed' : 'pointer',
              opacity: (originOffset === 1 || originOffset < 1 || originOffset > length) ? 0.4 : 1,
            }}
          >{S.metaOriginApply}</button>
          {hints && (
            <div
              data-testid="importer-meta-origin-hints"
              style={{ marginTop: 6, fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5 }}
            >
              <div style={{
                fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.4,
                color: 'var(--text-tertiary)', fontWeight: 500, marginBottom: 2,
              }}>{S.metaOriginHintLabel}</div>
              <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{hints}</div>
            </div>
          )}
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
