import { STRINGS } from '../../../lib/strings';

const S = STRINGS.importer;

/**
 * MetaColumn — 200 px sidebar right of Inspector (M-B.2 K1 placeholder;
 * topology toggle / origin rotate / IUPAC card / info card land in K3).
 */
export default function MetaColumn({
  item,
  edits, // eslint-disable-line no-unused-vars
  onUpdateEdits, // eslint-disable-line no-unused-vars
}) {
  if (!item) return null;
  const length = item.length || item.sequence?.length || 0;
  const topology = item.topology || 'linear';

  return (
    <aside
      data-testid="importer-meta-column"
      style={{
        width: 200, flexShrink: 0,
        padding: 10,
        borderLeft: '0.5px solid var(--border-subtle, #e7e5e4)',
        background: 'var(--surface-2, #f5f5f4)',
        display: 'flex', flexDirection: 'column', gap: 8,
      }}
    >
      <div
        style={{
          background: 'var(--surface-1)',
          border: '0.5px solid var(--border-default)',
          borderRadius: 'var(--radius-md)',
          padding: '6px 10px',
          fontSize: 11,
        }}
      >
        <div style={{ color: 'var(--text-tertiary)', textTransform: 'uppercase', fontSize: 9, letterSpacing: 0.4 }}>
          {S.metaTopology}
        </div>
        <div style={{ marginTop: 4, color: 'var(--text-primary)', fontWeight: 500 }}>
          {topology === 'circular' ? S.metaTopologyCircular : S.metaTopologyLinear}
        </div>
      </div>
      <div
        style={{
          background: 'var(--surface-1)',
          border: '0.5px solid var(--border-default)',
          borderRadius: 'var(--radius-md)',
          padding: '6px 10px',
          fontSize: 11,
        }}
      >
        <div style={{ color: 'var(--text-tertiary)', textTransform: 'uppercase', fontSize: 9, letterSpacing: 0.4 }}>
          {S.metaLengthLabel}
        </div>
        <div style={{ marginTop: 4, color: 'var(--text-primary)', fontWeight: 500, fontFamily: 'var(--font-mono)' }}>
          {length.toLocaleString()} bp
        </div>
      </div>
    </aside>
  );
}
