import { STRINGS } from '../../../lib/strings';

const S = STRINGS.importer;

/**
 * EmptyInspector — placeholder when parsedItems is empty. Mirrors v0.5
 * behaviour: hint to drop a file or pick from the catalog on the left.
 */
export default function EmptyInspector() {
  return (
    <div
      data-testid="importer-empty-inspector"
      style={{
        flex: 1,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: 6, padding: 24,
        color: 'var(--text-tertiary)',
        fontSize: 13,
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: 28, opacity: 0.4 }}>👈</div>
      <div>{S.emptyInspectorHint1}</div>
      <div style={{ fontSize: 11 }}>{S.emptyInspectorHint2}</div>
    </div>
  );
}
