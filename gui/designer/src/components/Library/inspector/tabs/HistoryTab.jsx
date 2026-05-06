import { STRINGS } from '../../../../lib/strings';

const S = STRINGS.importer;

/**
 * HistoryTab — placeholder slot for M-D commits[] (M-B.2 K4).
 *
 * Renders only when SingleInspector decides parsedItem.commits.length > 0.
 * In file-import flow that's always false; cross-project import (M-B.3+)
 * and Container Window M-D will surface real entries here.
 */
export default function HistoryTab({ commits = [] }) {
  return (
    <div data-testid="importer-tab-panel-history" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
        <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{S.tabHistory}</span>
        <span> · </span>
        <span>{commits.length}</span>
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
        {commits.length === 0 ? S.tabHistoryEmptyM_D : S.tabHistoryPlaceholder}
      </div>
    </div>
  );
}
