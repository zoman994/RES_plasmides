/**
 * AssemblyPipelinePanel — M-CANVAS-WORKFLOW-UX K9 (SPEC §4).
 * Right-side embedded panel «Схема сборки» (NOT a modal). Shows
 * op-groups stacked by groupLayer, an Automode button (K10 wires the
 * algorithm), a Realise button (opens the existing RealiseModal), and
 * a mini-DAG placeholder. Per-card Удалить fires REMOVE_OP_GROUP.
 */
import { useMemo } from 'react';
import { useSkeletonState, useSkeletonActions } from '../../store/skeleton-context';

const KIND_LABEL = {
  overlap_pcr: 'Overlap PCR',
  gibson: 'Gibson',
  golden_gate: 'Golden Gate',
  restriction: 'Restriction',
  kld: 'KLD',
  direct_ligation: 'Direct ligation',
};

export default function AssemblyPipelinePanel({
  draftId, zoneId, onRealise, onAutomode,
}) {
  const state = useSkeletonState();
  const actions = useSkeletonActions();

  // The «зона = пробирки на столе» (SPEC §2): only ops belonging to
  // THIS zone, and only op-groups (legacy ops live on canvas).
  const groups = useMemo(() => (state.operations || []).filter(
    (op) => op && op.isOpGroup && op.zoneId === zoneId,
  ), [state.operations, zoneId]);

  // groupLayer 0 = first layer, 1 = layer 1 intermediates, …
  const layers = useMemo(() => {
    const m = new Map();
    for (const op of groups) {
      const L = typeof op.groupLayer === 'number' ? op.groupLayer : 0;
      if (!m.has(L)) m.set(L, []);
      m.get(L).push(op);
    }
    return Array.from(m.entries()).sort((a, b) => a[0] - b[0]);
  }, [groups]);

  return (
    <div
      data-testid="assembly-pipeline-panel"
      style={{
        width: 280,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--surface-2)',
        borderLeft: '1px solid var(--border-subtle)',
        fontSize: 11.5,
        overflow: 'hidden',
      }}
    >
      <div style={{
        padding: '8px 12px', borderBottom: '1px solid var(--border-subtle)',
        fontWeight: 600, fontSize: 12, background: 'var(--surface-1)',
      }}>
        Схема сборки
      </div>

      <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', gap: 6 }}>
        <button
          type="button"
          data-testid="assembly-pipeline-automode"
          onClick={onAutomode}
          title="Auto-сгруппировать оставшиеся куски (K10)"
          style={primaryBtn}
        >⚡ Auto-собрать</button>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 8 }}>
        {groups.length === 0 ? (
          <div data-testid="assembly-pipeline-empty" style={{ padding: 10, color: 'var(--text-tertiary)', fontSize: 11 }}>
            Группы пока не созданы. Выдели куски в strip и нажми «🔗 Сшить».
          </div>
        ) : (
          layers.map(([layerIdx, ops]) => (
            <div
              key={layerIdx}
              data-testid={`assembly-pipeline-layer-${layerIdx}`}
              style={{ marginBottom: 10 }}
            >
              <div style={{
                fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase',
                letterSpacing: 0.4, marginBottom: 4, padding: '0 2px',
              }}>
                Layer {layerIdx + 1} · {ops.length} групп(ы)
              </div>
              {ops.map((op) => {
                const name = op.params && op.params.groupName;
                return (
                  <div
                    key={op.id}
                    data-testid={`assembly-pipeline-card-${op.id}`}
                    style={{
                      padding: '6px 8px', marginBottom: 4,
                      border: '1px solid var(--border-subtle)', borderRadius: 4,
                      background: 'var(--surface-1)',
                    }}
                  >
                    <div style={{ fontWeight: 600, fontSize: 11.5 }}>
                      {KIND_LABEL[op.kind] || op.kind}
                      {name ? <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>{' · '}{name}</span> : null}
                    </div>
                    <div style={{ fontSize: 10.5, color: 'var(--text-secondary)', marginTop: 2 }}>
                      {(op.inputPieces || []).length} куск(ов)
                    </div>
                    <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                      <button
                        type="button"
                        data-testid={`assembly-pipeline-card-remove-${op.id}`}
                        onClick={() => actions.removeOpGroup(op.id)}
                        style={ghostBtn}
                      >Удалить</button>
                    </div>
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>

      <div data-testid="assembly-pipeline-dag" style={{
        padding: '8px 12px', borderTop: '1px solid var(--border-subtle)',
        background: 'var(--surface-1)', fontSize: 10.5, color: 'var(--text-tertiary)',
      }}>
        <div style={{ marginBottom: 4 }}>Mini DAG</div>
        <div style={{ minHeight: 40, border: '1px dashed var(--border-subtle)', borderRadius: 4, padding: 4, fontSize: 10, color: 'var(--text-tertiary)' }}>
          {/* K10+ wires the full preview */}
          {groups.length === 0 ? '—' : `${groups.length} групп · ${layers.length} слой(ёв)`}
        </div>
      </div>

      <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border-subtle)', background: 'var(--surface-2)' }}>
        <button
          type="button"
          data-testid="assembly-pipeline-realise"
          onClick={onRealise}
          style={{ ...primaryBtn, width: '100%' }}
        >Realise pipeline →</button>
      </div>
    </div>
  );
}

const primaryBtn = {
  fontSize: 11.5, padding: '5px 12px', background: 'var(--accent-500, #b85c3e)',
  color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600,
};
const ghostBtn = {
  fontSize: 10.5, padding: '3px 8px', background: 'transparent',
  border: '1px solid var(--border-subtle)', borderRadius: 3, cursor: 'pointer',
  color: 'var(--accent-500, #b85c3e)',
};
