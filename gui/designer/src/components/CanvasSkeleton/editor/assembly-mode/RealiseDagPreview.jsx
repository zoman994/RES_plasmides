/**
 * RealiseDagPreview — mini read-only SVG of the DAG that ASSEMBLY_REALISE
 * will create (DEC-CANVAS-ASM-REAL-11). Recomputes via the pure
 * `realiseAssembly` (no dispatch) and updates when methods change.
 */
import { useMemo } from 'react';
import { useSkeletonState } from '../../store/skeleton-context';
import { realiseAssembly } from '../../lib/assembly-realise';

export default function RealiseDagPreview({ draftId, perBoundaryMethods }) {
  const state = useSkeletonState();
  const result = useMemo(
    () => realiseAssembly(state, draftId, perBoundaryMethods, { revision: 1 }),
    [state, draftId, perBoundaryMethods],
  );

  if (!result.ok) {
    return (
      <div
        data-testid="realise-dag-preview"
        style={{ fontSize: 11, color: 'var(--accent-500,#b85c3e)', padding: 8 }}
      >
        ⚠ {result.error}
      </div>
    );
  }

  const { operations, junctions, containers } = result.diff;
  const W = 460;
  const H = 110;
  const n = Math.max(1, operations.length);
  const stepX = Math.min(140, (W - 60) / n);

  return (
    <svg
      data-testid="realise-dag-preview"
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      style={{ display: 'block', background: 'var(--surface-2)', borderRadius: 6 }}
    >
      {operations.map((op, i) => {
        const x = 36 + i * stepX;
        return (
          <g key={op.id}>
            <rect x={x - 22} y={14} width={44} height={16} rx={2} fill="var(--bio-primer,#9ebad9)" />
            <text x={x} y={26} fontSize={7} textAnchor="middle" fill="#1c1917">PCR {i + 1}</text>
            <path d={`M${x} 34 V46`} stroke="var(--ink-30,#999)" strokeWidth={1} />
            <rect x={x - 22} y={48} width={44} height={16} rx={2} fill="var(--bio-cds,#c8d570)" />
            <text x={x} y={60} fontSize={7} textAnchor="middle" fill="#1c1917">frag {i + 1}</text>
            {i < junctions.length && (
              <g>
                <path d={`M${x + 22} 56 H${x + stepX - 22}`} stroke="var(--accent-500,#b85c3e)" strokeWidth={1.5} strokeDasharray="3 2" />
                <text x={x + stepX / 2} y={52} fontSize={6.5} textAnchor="middle" fill="var(--text-secondary)">
                  {junctions[i].kind}
                </text>
              </g>
            )}
          </g>
        );
      })}
      <rect x={W - 70} y={80} width={56} height={18} rx={3} fill="var(--bio-reporter,#7cb49e)" />
      <text x={W - 42} y={92} fontSize={7} textAnchor="middle" fill="#1c1917">
        product
      </text>
      <text x={10} y={104} fontSize={7} fill="var(--text-tertiary)">
        {operations.length} ops · {junctions.length} junctions · {containers.length} containers
      </text>
    </svg>
  );
}
