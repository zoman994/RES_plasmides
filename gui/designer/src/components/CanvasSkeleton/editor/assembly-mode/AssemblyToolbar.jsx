/**
 * AssemblyToolbar — footer actions (A2 DEC-CANVAS-ASM-UX-02). «+
 * Сегмент» opens the source picker, «+ Gap» the gap modal, Undo/Redo
 * drive the shared skeleton-history (DEC-CANVAS-ASM-UX-13).
 */
import { useSkeletonActions, useSkeletonHistory } from '../../store/skeleton-context';

export default function AssemblyToolbar({
  onAddSegment, onAddSnippet, onAddSynthesis, onAddGap,
  selectedSegmentIds, onSewSelected,
}) {
  const actions = useSkeletonActions();
  const history = useSkeletonHistory();

  const btn = (extra) => ({
    fontSize: 11.5,
    padding: '6px 12px',
    background: 'var(--surface-1)',
    color: 'var(--text-secondary)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 4,
    cursor: 'pointer',
    ...extra,
  });

  return (
    <div
      data-testid="assembly-toolbar"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 12px',
        borderTop: '1px solid var(--border-subtle)',
        background: 'var(--surface-2)',
        flexShrink: 0,
      }}
    >
      <button type="button" data-testid="assembly-add-segment" onClick={onAddSegment} style={btn()}>
        + Плазмида
      </button>
      <button type="button" data-testid="assembly-add-snippet" onClick={onAddSnippet} style={btn()}>
        + Обвес
      </button>
      <button type="button" data-testid="assembly-add-synthesis" onClick={onAddSynthesis} style={btn()}>
        + Синтез
      </button>
      <button type="button" data-testid="assembly-add-gap" onClick={onAddGap} style={btn()}>
        + Gap
      </button>
      {selectedSegmentIds && selectedSegmentIds.size >= 2 && (
        <button
          type="button"
          data-testid="assembly-sew-selected"
          onClick={onSewSelected}
          style={btn({
            background: 'var(--accent-500, #b85c3e)',
            color: '#fff',
            fontWeight: 600,
            border: '1px solid var(--accent-500, #b85c3e)',
          })}
        >
          🔗 Сшить ({selectedSegmentIds.size})
        </button>
      )}
      <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
        <button
          type="button"
          data-testid="assembly-undo"
          disabled={!history.canUndo}
          onClick={() => actions.undo()}
          title="Отменить (Ctrl+Z)"
          style={btn({ cursor: history.canUndo ? 'pointer' : 'not-allowed', opacity: history.canUndo ? 1 : 0.5 })}
        >↶ Undo</button>
        <button
          type="button"
          data-testid="assembly-redo"
          disabled={!history.canRedo}
          onClick={() => actions.redo()}
          title="Повторить (Ctrl+Y)"
          style={btn({ cursor: history.canRedo ? 'pointer' : 'not-allowed', opacity: history.canRedo ? 1 : 0.5 })}
        >↷ Redo</button>
      </div>
    </div>
  );
}
