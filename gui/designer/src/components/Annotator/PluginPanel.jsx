/**
 * Annotator/PluginPanel — Sprint M-X.2 K8 left pane.
 *
 * Lists all registered plugins with:
 *   - checkbox (state.annotator.enabledPluginIds)
 *   - plugin name + speedHint badge
 *   - status (idle / running spinner / done with count)
 *   - tooltip with unavailableReason when isAvailable returns false
 *
 * `[Запустить N]` button at the bottom of the panel runs the
 * pipeline. N = count of currently-enabled & available plugins.
 *
 * Rendering shape kept minimal — K8 surface is functional, not
 * polished; visual review feedback in M-X.2 acceptance will tune
 * spacing, typography, etc.
 */

import { STRINGS } from '../../lib/strings';

const S = STRINGS.importer.annotator;

const SPEED_LABEL = {
  instant: S.speedHintInstant,
  fast: S.speedHintFast,
  slow: S.speedHintSlow,
};

export default function PluginPanel({
  plugins,
  enabledPluginIds,
  running,
  results,
  onToggle,
  onRun,
  runtimeContext,
}) {
  const enabledCount = plugins.filter((p) => enabledPluginIds[p.id] === true).length;
  const anyRunning = Object.values(running || {}).some(Boolean);

  return (
    <div
      data-testid="annotator-plugin-panel"
      style={{
        display: 'flex', flexDirection: 'column',
        gap: 6, padding: 12, minWidth: 280, maxWidth: 320,
        borderRight: '0.5px solid var(--border-default, #d4d4d4)',
        background: 'var(--surface-1, #fff)',
        height: '100%',
        overflowY: 'auto',
      }}
    >
      <div style={{ fontWeight: 500, fontSize: 13, marginBottom: 4, color: 'var(--text-primary, #111)' }}>
        {S.pluginsHeader}
      </div>
      {plugins.map((p) => {
        const isAvailable = typeof p.isAvailable === 'function' ? !!p.isAvailable(runtimeContext) : true;
        const reason = !isAvailable && typeof p.unavailableReason === 'function'
          ? p.unavailableReason(runtimeContext)
          : null;
        const enabled = !!enabledPluginIds[p.id];
        const isRunning = !!(running && running[p.id]);
        const result = results && results[p.id];
        const hitCount = result?.regions?.length || 0;
        return (
          <div
            key={p.id}
            data-testid="annotator-plugin-row"
            data-plugin-id={p.id}
            data-plugin-enabled={enabled ? 'true' : 'false'}
            data-plugin-available={isAvailable ? 'true' : 'false'}
            title={reason || ''}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '5px 6px',
              borderRadius: 'var(--radius-sm, 3px)',
              background: isAvailable ? 'transparent' : 'var(--surface-2, #f5f5f4)',
              opacity: isAvailable ? 1 : 0.6,
              fontSize: 11,
            }}
          >
            <input
              type="checkbox"
              data-testid="annotator-plugin-checkbox"
              data-plugin-id={p.id}
              checked={enabled}
              disabled={!isAvailable}
              onChange={() => onToggle?.(p.id)}
              style={{ flexShrink: 0 }}
            />
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
              <span
                style={{
                  fontWeight: 500,
                  color: isAvailable ? 'var(--text-primary)' : 'var(--text-tertiary)',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}
              >
                {p.name}
              </span>
              <span style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>
                {p.shortDescription || ''}
              </span>
            </div>
            <span style={{ fontSize: 9, color: 'var(--text-tertiary)', flexShrink: 0 }}>
              {SPEED_LABEL[p.capabilities?.speedHint] || ''}
            </span>
            <span data-testid="annotator-plugin-status" style={{ fontSize: 9, minWidth: 24, textAlign: 'right' }}>
              {isRunning ? S.runningSpinner : (result ? `+${hitCount}` : '')}
            </span>
          </div>
        );
      })}
      <button
        type="button"
        data-testid="annotator-run-button"
        onClick={onRun}
        disabled={enabledCount === 0 || anyRunning}
        style={{
          marginTop: 12,
          padding: '6px 12px',
          background: enabledCount > 0 && !anyRunning ? 'var(--accent-500, #f97316)' : 'var(--surface-2, #e7e5e4)',
          color: enabledCount > 0 && !anyRunning ? '#fff' : 'var(--text-tertiary)',
          border: 'none',
          borderRadius: 'var(--radius-sm, 3px)',
          cursor: enabledCount > 0 && !anyRunning ? 'pointer' : 'not-allowed',
          fontSize: 12,
          fontWeight: 500,
        }}
      >
        {S.runButton(enabledCount)}
      </button>
    </div>
  );
}
