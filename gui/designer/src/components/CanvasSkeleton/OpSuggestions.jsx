/**
 * OpSuggestions — non-modal panel «возможные операции» в правом нижнем
 * углу canvas. Эвристика над state.containers + state.selectedContainerIds.
 *
 * B7 (14.05.2026 — TIER-B). Эвристики:
 *   - ≥2 linear molecule containers selected → suggest Gibson assembly.
 *   - ≥2 linear containers с sticky ends в selection → suggest Ligate.
 *   - 1 circular container с MCS / multiple RE-sites → suggest Cut.
 *   - 1 oligonucleotide-container + 1 molecule → suggest PCR.
 *
 * Suggestion панель появляется когда есть match'и; click on suggestion
 * → создаёт draft op с prefilled inputs.
 */
import { useMemo } from 'react';
import { useSkeletonState, useSkeletonActions } from './store/skeleton-context';
import { isPlaceholderContainer } from './fixture-canvas-skeleton';

function isLinearMol(c) {
  return c && c.kind === 'molecule' && c.sequence && !c.topology?.circular && !isPlaceholderContainer(c);
}
function isCircularMol(c) {
  return c && c.kind === 'molecule' && c.sequence && c.topology?.circular;
}
function isOligo(c) {
  return c && c.kind === 'oligonucleotide';
}

export default function OpSuggestions() {
  const state = useSkeletonState();
  const actions = useSkeletonActions();
  const selectedIds = state.selectedContainerIds || [];

  const suggestions = useMemo(() => {
    const out = [];
    const selected = state.containers.filter((c) => selectedIds.includes(c.id));
    const linearSel = selected.filter(isLinearMol);
    const oligoSel = selected.filter(isOligo);
    const moleculeSel = selected.filter((c) => c.kind === 'molecule' && c.sequence);
    const circularSel = selected.filter(isCircularMol);

    if (linearSel.length >= 2) {
      out.push({
        kind: 'gibson',
        label: `Gibson ${linearSel.length} линейных`,
        inputs: linearSel.map((c) => c.id),
        emoji: '🧪',
      });
      out.push({
        kind: 'golden_gate',
        label: `Golden Gate ${linearSel.length} линейных`,
        inputs: linearSel.map((c) => c.id),
        emoji: '⛓',
      });
      out.push({
        kind: 'ligate',
        label: `Ligate ${linearSel.length} линейных`,
        inputs: linearSel.map((c) => c.id),
        emoji: '🪢',
      });
    }
    if (circularSel.length === 1 && selected.length === 1) {
      out.push({
        kind: 'cut',
        label: `Cut ${circularSel[0].name || 'circular'}`,
        inputs: [circularSel[0].id],
        emoji: '🔪',
      });
    }
    if (oligoSel.length >= 1 && moleculeSel.length >= 1 && (oligoSel.length + moleculeSel.length) <= 3) {
      out.push({
        kind: 'pcr',
        label: 'PCR с выбранными primers',
        inputs: [...moleculeSel.map((c) => c.id), ...oligoSel.map((c) => c.id)],
        emoji: '🧬',
      });
    }
    return out;
  }, [state.containers, selectedIds]);

  if (suggestions.length === 0) return null;

  const onPick = (sug) => {
    const count = state.operations?.length || 0;
    const baseX = 320 + (count % 6) * 28;
    const baseY = 200 + Math.floor(count / 6) * 60 + (count % 6) * 14;
    // FIX-2: atomic create + commit.
    actions.opAdd({
      position: { x: baseX, y: baseY },
      kind: sug.kind,
      inputs: sug.inputs.slice(),
      commit: true,
    });
    actions.clearSelection();
  };

  return (
    <div
      data-testid="skeleton-op-suggestions"
      style={{
        position: 'absolute',
        bottom: 76,
        right: 24,
        zIndex: 25,
        background: 'var(--surface-1, #fff)',
        border: '1px solid var(--accent-500, #d97706)',
        borderRadius: 8,
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        padding: '8px 10px',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        minWidth: 200,
        maxWidth: 260,
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: 0.3, textTransform: 'uppercase' }}>
        Предложения
      </div>
      {suggestions.map((sug) => (
        <button
          key={`${sug.kind}-${sug.inputs.join(',')}`}
          type="button"
          data-testid={`skeleton-op-suggestion-${sug.kind}`}
          onClick={() => onPick(sug)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 8px',
            background: 'var(--surface-2)',
            border: '1px solid var(--border-default)',
            borderRadius: 4,
            cursor: 'pointer',
            fontSize: 12,
            color: 'var(--text-primary)',
            textAlign: 'left',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--accent-50, #fef3c7)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--surface-2)'; }}
        >
          <span style={{ fontSize: 14 }}>{sug.emoji}</span>
          <span style={{ flex: 1 }}>{sug.label}</span>
        </button>
      ))}
    </div>
  );
}
