/**
 * Annotator/EmptyAnnotator — Sprint M-X.2 K8 placeholder.
 *
 * Shown when no plugins are enabled and no results exist yet.
 */

import { STRINGS } from '../../lib/strings';

const S = STRINGS.importer.annotator;

export default function EmptyAnnotator() {
  return (
    <div
      data-testid="annotator-empty"
      style={{
        flex: 1, display: 'flex',
        flexDirection: 'column', gap: 8,
        alignItems: 'center', justifyContent: 'center',
        padding: 32, color: 'var(--text-tertiary)',
        fontSize: 12,
      }}
    >
      <div style={{ fontSize: 14 }}>{S.title}</div>
      <div>{S.resultsEmpty}</div>
    </div>
  );
}
