/**
 * Annotator/ResultsPane — Sprint M-X.2 K8 right pane.
 *
 * Groups results by pluginId. Each group is an expandable header
 * (count badge) followed by a list of ResultRow's. K8 keeps the
 * header always-expanded; M-X.2.1 polish can add collapse later.
 */

import { STRINGS } from '../../lib/strings';
import ResultRow from './ResultRow.jsx';

const S = STRINGS.importer.annotator;

export default function ResultsPane({
  results,
  acceptedRegionIds,
  rejectedRegionIds,
  pendingEdits,
  threshold,
  onAccept,
  onReject,
  onEditPatch,
}) {
  const groups = Object.values(results || {}).filter(Boolean);

  if (groups.length === 0) {
    return (
      <div
        data-testid="annotator-results-pane-empty"
        style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 24, color: 'var(--text-tertiary)', fontSize: 12,
        }}
      >
        {S.resultsEmpty}
      </div>
    );
  }

  return (
    <div
      data-testid="annotator-results-pane"
      style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        gap: 12, padding: 12, overflowY: 'auto',
      }}
    >
      <div style={{ fontWeight: 500, fontSize: 13, color: 'var(--text-primary, #111)' }}>
        {S.resultsHeader}
      </div>
      {groups.map((res) => {
        const filtered = (res.regions || []).filter((r) => {
          if (!Number.isFinite(r.confidence)) return true; // sgRNA scaffold-style binary hits keep
          return r.confidence >= (threshold ?? 0);
        });
        return (
          <div key={res.pluginId} data-testid="annotator-result-group" data-plugin-id={res.pluginId}>
            <div
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                marginBottom: 6, fontSize: 12, fontWeight: 500,
                color: 'var(--text-secondary)',
              }}
            >
              <span>{res.pluginName || res.pluginId}</span>
              <span style={{
                background: 'var(--surface-2, #f5f5f4)',
                color: 'var(--text-secondary)',
                padding: '1px 6px', borderRadius: 8, fontSize: 10,
              }}>{filtered.length}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {filtered.map((region) => {
                const id = region.id || `${region.start}:${region.end}:${region.type || ''}:${region.name || ''}`;
                return (
                  <ResultRow
                    key={id}
                    region={{ ...region, id }}
                    pendingPatch={pendingEdits?.[id]}
                    isAccepted={!!acceptedRegionIds?.[id]}
                    isRejected={!!rejectedRegionIds?.[id]}
                    onAccept={() => onAccept?.(id)}
                    onReject={() => onReject?.(id)}
                    onEditPatch={(patch) => onEditPatch?.(id, patch)}
                  />
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
