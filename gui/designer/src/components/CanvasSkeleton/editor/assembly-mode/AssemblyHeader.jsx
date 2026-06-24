/**
 * AssemblyHeader — assembly-draft editor header (A2 DEC-CANVAS-ASM-UX-02
 * / G2 DEC-CANVAS-ASM-13). Reuses the Library InlineEditableTitle (no
 * bespoke title widget). Left: name. Center: length/segments/topology.
 * Right: palette legend (collapsible) + topology toggle + Realise as
 * DAG (live — A4: reverse-engineers the ops; disabled only until the
 * assembly has ≥2 segments or a single fragment closed into a ring).
 */
import InlineEditableTitle from '../../../Library/inspector/InlineEditableTitle';
import { Icon } from '../../../icons/Icon';

// M-CIRCULARIZE — engine method → short biolog label for the topology/method chip.
const METHOD_LABEL = {
  overlap_pcr: 'Overlap PCR',
  gibson: 'Gibson',
  golden_gate: 'Golden Gate',
  restriction: 'RE-лигирование',
  direct_ligation: 'Лигирование',
  kld: 'KLD',
};

export default function AssemblyHeader({
  draft, length, segmentCount,
  onRename, onRealise, canRealise,
  onToggleSequenceView,
  // M-CIRCULARIZE — the whole-assembly method (for the chip label) + the opener
  // for the «замкнуть в плазмиду» modal that now owns topology + method.
  assemblyMethod,
  onOpenCircularize,
  /* V92 — caller (AssemblyShellBody) tells header that some side-panel is
     currently hidden via its × button → show a small restore-panels control. */
  anyPanelHidden = false,
  onRestorePanels,
}) {
  const circular = !!(draft.topology && draft.topology.circular);
  const methodLabel = assemblyMethod ? METHOD_LABEL[assemblyMethod] || assemblyMethod : null;

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
      <Icon name="dna" size={15} style={{ display: 'inline-block', verticalAlign: '-2px' }} />

      <div style={{ minWidth: 0, maxWidth: 280 }}>
        <InlineEditableTitle value={draft.name} onCommit={onRename} placeholder="Сборка" />
      </div>

      <span
        data-testid="assembly-header-info"
        style={{ fontSize: 11.5, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}
      >
        {length} bp · {segmentCount} сегм. · {circular ? 'circular' : 'linear'}
      </span>

      {/* M-CIRCULARIZE (Игорь 12.06) — one control replaces the bare topology
          toggle + method dropdown. Shows the current topology + assembly method
          and opens the «замкнуть в плазмиду» modal (which owns both). */}
      {typeof onOpenCircularize === 'function' && (
        <button
          type="button"
          data-testid="assembly-circularize-btn"
          onClick={onOpenCircularize}
          title="Замыкание в плазмиду и метод сборки"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontSize: 11, padding: '4px 10px',
            background: circular ? 'var(--accent-wash, rgba(184,92,62,0.10))' : 'var(--surface-1)',
            color: 'var(--text-secondary)',
            border: `1px solid ${circular ? 'var(--accent-500, #b85c3e)' : 'var(--border-subtle)'}`,
            borderRadius: 4, cursor: 'pointer',
          }}
        >
          <Icon name="circular" size={12} style={{ display: 'inline-block', verticalAlign: '-2px' }} />
          {circular ? 'Кольцевая' : 'Линейная'}
          {methodLabel ? <span style={{ color: 'var(--text-tertiary)' }}>· {methodLabel}</span> : null}
          <Icon name="edit" size={10} style={{ display: 'inline-block', verticalAlign: '-2px', color: 'var(--text-tertiary)' }} />
        </button>
      )}

      {/* V92 — restore editor side-panels hidden via their × (was the «Палитра»
          button before M-CIRCULARIZE removed it). Shown only when something is
          hidden. */}
      {anyPanelHidden && typeof onRestorePanels === 'function' && (
        <button
          type="button"
          data-testid="assembly-restore-panels"
          onClick={onRestorePanels}
          title="Вернуть скрытые панели редактора"
          style={{
            fontSize: 11, padding: '4px 9px',
            background: 'var(--accent-100, #eed2c1)', color: 'var(--text-secondary)',
            border: '1px solid var(--border-subtle)', borderRadius: 4, cursor: 'pointer',
          }}
        ><Icon name="panel-right" size={12} style={{ display: 'inline-block', verticalAlign: '-2px' }} /> панели</button>
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
          ? 'Reverse-engineer операции из сборки в DAG'
          : 'Добавьте ещё сегмент (нужно ≥2) или замкните одиночный фрагмент в кольцо'}
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
