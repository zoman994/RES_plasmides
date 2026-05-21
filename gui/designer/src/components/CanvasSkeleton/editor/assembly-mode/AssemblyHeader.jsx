/**
 * AssemblyHeader — assembly-draft editor header (A2 DEC-CANVAS-ASM-UX-02
 * / G2 DEC-CANVAS-ASM-13). Reuses the Library InlineEditableTitle (no
 * bespoke title widget). Left: name. Center: length/segments/topology.
 * Right: palette legend (collapsible) + topology toggle + Realise as
 * DAG (A2 stub: disabled, tooltip → A4).
 */
import { useState } from 'react';
import InlineEditableTitle from '../../../Library/inspector/InlineEditableTitle';

export default function AssemblyHeader({
  draft, length, segmentCount, paletteLegend,
  onRename, onToggleTopology, onRealise, canRealise,
  onToggleSequenceView,
  /* V92 — caller (AssemblyShellBody) tells header that some side-panel
     is currently hidden via its × button. In that mode, «Палитра»
     click takes over to restore them (not open the legend). */
  anyPanelHidden = false,
  onPaletteClick,
}) {
  const [legendOpen, setLegendOpen] = useState(false);
  const circular = !!(draft.topology && draft.topology.circular);
  const onPaletteBtn = () => {
    if (typeof onPaletteClick === 'function') {
      onPaletteClick();
      return;
    }
    setLegendOpen((v) => !v);
  };

  return (
    <header
      data-testid="assembly-header"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '6px 12px',
        borderBottom: '1px solid var(--border-subtle)',
        background: 'var(--surface-2)',
        flexShrink: 0,
        minHeight: 40,
      }}
    >
      <span aria-hidden style={{ fontSize: 15 }}>🧬</span>
      <div style={{ minWidth: 0, maxWidth: 280 }}>
        <InlineEditableTitle value={draft.name} onCommit={onRename} placeholder="Сборка" />
      </div>

      <span
        data-testid="assembly-header-info"
        style={{ fontSize: 11.5, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}
      >
        {length} bp · {segmentCount} сегм. · {circular ? 'circular' : 'linear'}
      </span>

      <button
        type="button"
        data-testid="assembly-topology-toggle"
        onClick={onToggleTopology}
        title="Переключить топологию (linear ↔ circular)"
        style={{
          fontSize: 11,
          padding: '4px 10px',
          background: 'var(--surface-1)',
          color: 'var(--text-secondary)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 4,
          cursor: 'pointer',
        }}
      >
        {circular ? '⭕ circular' : '— linear'}
      </button>

      {(paletteLegend || []).length > 0 && (
        <div style={{ position: 'relative' }}>
          <button
            type="button"
            data-testid="assembly-palette-legend-toggle"
            onClick={onPaletteBtn}
            title={anyPanelHidden
              ? 'Вернуть скрытые панели редактора'
              : 'Палитра сегментов'}
            style={{
              fontSize: 11,
              padding: '4px 10px',
              background: anyPanelHidden
                ? 'var(--accent-100, #eed2c1)'
                : 'var(--surface-1)',
              color: 'var(--text-secondary)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 4,
              cursor: 'pointer',
            }}
          >🎨 Палитра{anyPanelHidden ? ' ↩' : ''}</button>
          {legendOpen && !anyPanelHidden && (
            <div
              data-testid="assembly-palette-legend"
              style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                marginTop: 4,
                zIndex: 40,
                minWidth: 160,
                maxHeight: 220,
                overflowY: 'auto',
                background: 'var(--surface-1)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 6,
                boxShadow: '0 4px 12px rgba(28,25,23,0.14)',
                padding: 8,
              }}
            >
              {paletteLegend.map((p) => (
                <div key={p.zoneId} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10.5, padding: '2px 0' }}>
                  <span style={{ width: 12, height: 12, borderRadius: 3, background: p.color, flexShrink: 0 }} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* AV-K10 — «S» toggle returns biolog to canvas with this zone
          flipped to viewMode='sequence' (inline preview without
          editor's full chrome). Re-entry: «🧬 Открыть сборку» on the
          zone frame opens the editor again. Hidden when no
          onToggleSequenceView prop is wired (back-compat for unit
          tests rendering AssemblyHeader stand-alone). */}
      {typeof onToggleSequenceView === 'function' && (
        <button
          type="button"
          data-testid="assembly-toggle-sequence-view"
          onClick={onToggleSequenceView}
          title="Свернуть в Sequence-вид на канвасе (S)"
          style={{
            fontSize: 11,
            padding: '4px 10px',
            background: 'var(--surface-1)',
            color: 'var(--text-secondary)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 4,
            cursor: 'pointer',
          }}
        >
          ↩ S
        </button>
      )}
      <button
        type="button"
        data-testid="assembly-realise-btn"
        disabled={!canRealise}
        onClick={canRealise ? onRealise : undefined}
        title={canRealise
          ? 'Reverse-engineer операции из сборки'
          : 'Realise as DAG — reverse-engineer операции из сборки (следующий sprint, A4)'}
        style={{
          marginLeft: 'auto',
          fontSize: 11.5,
          padding: '5px 14px',
          background: canRealise ? 'var(--accent-500, #b85c3e)' : 'transparent',
          color: canRealise ? '#fff' : 'var(--text-tertiary)',
          border: '1px solid ' + (canRealise ? 'var(--accent-500, #b85c3e)' : 'var(--border-subtle)'),
          borderRadius: 4,
          fontWeight: 600,
          cursor: canRealise ? 'pointer' : 'not-allowed',
        }}
      >🪄 Realise as DAG</button>
    </header>
  );
}
