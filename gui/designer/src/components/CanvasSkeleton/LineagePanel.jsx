/**
 * LineagePanel — provenance / lineage tracking для highlighted контейнера.
 *
 * T14 (14.05.2026 — TIER-T). Когда контейнер highlighted и у него есть
 * origin (op_cut, op_pcr, op_gibson, fork, tree_*), показываем chain
 * назад через parentContainerId / operationId.
 *
 * Local-only — не использует tree data structure; walks state.containers
 * + state.operations.
 */
import { useMemo } from 'react';
import { useSkeletonState } from './store/skeleton-context';

function originLabel(origin) {
  if (!origin) return 'без происхождения';
  switch (origin.kind) {
    case 'tree_drag': return 'добавлено из дерева';
    case 'tree_pick': return 'выбрано из дерева';
    case 'fork': return `форк (из ${origin.sourceContainerId || '?'})`;
    case 'placeholder': return 'призрак (пустой)';
    case 'op_pcr': return `PCR (op ${origin.operationId?.slice(0, 8) || '?'})`;
    case 'op_cut': return `Cut ${origin.enzymes?.join('+') || ''}`.trim();
    case 'op_gibson': return 'Gibson assembly';
    case 'op_golden_gate': return `Golden Gate (${origin.enzyme || 'BsaI'})`;
    case 'op_ligate': return `Ligate (${origin.ends || 'blunt'})`;
    case 'op_kld': return 'KLD mutagenesis';
    case 'op_mutagenesis': return 'mutagenesis';
    default: return origin.kind || 'unknown';
  }
}

export default function LineagePanel() {
  const state = useSkeletonState();
  const id = state.highlightedContainerId;

  const lineage = useMemo(() => {
    if (!id) return [];
    const chain = [];
    let cursor = state.containers.find((c) => c.id === id);
    const seen = new Set();
    while (cursor && !seen.has(cursor.id) && chain.length < 12) {
      seen.add(cursor.id);
      // R6-7 (14.05.2026): для multi-input ops (Gibson/Ligate/GG с >1
      // фрагментом) показываем "+N more" чтобы биолог видел что эта
      // ветвь — не единственная.
      const inputIds = Array.isArray(cursor.origin?.inputIds) ? cursor.origin.inputIds : null;
      const extraInputs = inputIds && inputIds.length > 1 ? inputIds.length - 1 : 0;
      chain.push({
        id: cursor.id,
        name: cursor.name || cursor.id.slice(0, 8),
        origin: cursor.origin,
        label: originLabel(cursor.origin),
        extraInputs,
      });
      const parentId = cursor.origin?.parentContainerId
        || cursor.origin?.sourceContainerId
        || (inputIds ? inputIds[0] : null);
      if (!parentId) break;
      cursor = state.containers.find((c) => c.id === parentId);
    }
    return chain;
  }, [id, state.containers]);

  if (!id || lineage.length === 0) return null;

  return (
    <div
      data-testid="skeleton-lineage-panel"
      style={{
        position: 'absolute',
        // V144 (Игорь 12.06): in the two-level workspace the CanvasArea is fully
        // filled by the active assembly view, so the old bottom-left pin covered
        // the SegmentList «Источник» footer + the «+ Сегмент» / «Codon stats»
        // toolbar. Move to the top-right (over the empty tab-strip / header
        // gutter) and make it pointer-events:none — a purely informational
        // provenance chip that never obscures or blocks the editing surface.
        top: 12,
        right: 12,
        zIndex: 25,
        pointerEvents: 'none',
        background: 'var(--surface-1, #fff)',
        border: '1px solid var(--border-default, #d6d3d1)',
        borderRadius: 8,
        boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
        padding: '8px 12px',
        maxWidth: 260,
        fontSize: 11.5,
        color: 'var(--text-primary)',
      }}
    >
      <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 4 }}>
        Происхождение
      </div>
      {lineage.map((node, i) => (
        <div
          key={node.id}
          data-testid={`skeleton-lineage-node-${node.id}`}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '3px 0',
            opacity: 1 - i * 0.07,
          }}
        >
          <span style={{ fontSize: 9, color: 'var(--text-tertiary)', minWidth: 12 }}>
            {i === 0 ? '●' : '↑'}
          </span>
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: i === 0 ? 600 : 400 }}>
            {node.name}
            {node.extraInputs > 0 && (
              <span style={{ marginLeft: 4, fontSize: 9.5, color: 'var(--text-tertiary)' }}>
                (+{node.extraInputs} more)
              </span>
            )}
          </span>
          <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{node.label}</span>
        </div>
      ))}
    </div>
  );
}
