/**
 * OperationNode v2 — ромб operation (PCR / Cut / Gibson / Ligate / KLD
 * / Mutagenesis) с status-driven visual.
 *
 * Sprint M-CANVAS-OPS K5 (12.05.2026 — DEC-OPS-05). Принимает V2
 * Operation shape (см. DEC-OPS-03). Визуал зависит от status:
 *   - draft     → dashed grey ромб (kind ещё не выбран)
 *   - committed → solid kind-coloured (params editing stage)
 *   - executed  → filled green + ✓ badge
 *   - failed    → filled red + ! badge
 *
 * Interaction handlers are intentionally delegated to the caller. The live
 * assembly DAG uses onClick to open the operation editor drill-in; optional
 * context-menu behavior is also supplied by the host.
 *
 * Legacy V1 shim: если передан `commit` (старый V1 ProjectCommit shape)
 * вместо `operation`, рендерим в legacy-style с тем же визуалом draft
 * (на canvas commits=[]: путь почти мёртвый, оставлен для CanvasGraphView
 * back-compat).
 */
import { memo } from 'react';
import { OPERATION_NODE_W, OPERATION_NODE_H } from './canvas-layout';
import OpIcon from './op-icons';
import { operationColor, OP_NEUTRAL } from './op-colors';
import { Icon } from '../../icons/Icon';

// T15 (14.05.2026) — emoji icons заменены на SVG (OpIcon component).
// Map оставлен для legacy commit shim'а (V1 commits, mix→gibson).
const KIND_ICONS = {
  pcr:         '🧬',
  cut:         '🔪',
  gibson:      '🧪',
  golden_gate: '⛓',
  ligate:      '🪢',
  kld:         '🧫',
  mutagenesis: '⚗',
};

const KIND_LABELS = {
  pcr:         'PCR',
  cut:         'Cut',
  gibson:      'Gibson',
  golden_gate: 'Golden Gate',
  restriction: 'RE-клон',
  ligate:      'Ligate',
  kld:         'KLD',
  mutagenesis: 'Mutate',
};

// K5 — colours come from the single canon in op-colors.js (junction-styles
// for junction ops, own distinct colours for pcr/cut/mutagenesis, warm
// neutral — never grey — for unknown). No local palette here anymore.

/**
 * statusVisual — возвращает stroke / fill / strokeDasharray / badge
 * для текущего status + kind.
 */
function statusVisual(status, kind) {
  const palette = operationColor(kind);
  switch (status) {
    case 'draft':
      return {
        fill: OP_NEUTRAL.fill,
        stroke: OP_NEUTRAL.stroke,
        strokeWidth: 1.5,
        strokeDasharray: '4 3',
        textColor: 'var(--text-secondary, #57534e)',
        badge: null,
        badgeColor: null,
      };
    case 'committed':
      return {
        fill: palette.fill,
        stroke: palette.stroke,
        strokeWidth: 2,
        strokeDasharray: 'none',
        textColor: 'var(--text-primary, #1c1917)',
        badge: null,
        badgeColor: null,
      };
    case 'executed':
      return {
        fill: '#bbf7d0', // green-200
        stroke: '#16a34a',
        strokeWidth: 2,
        strokeDasharray: 'none',
        textColor: '#14532d',
        badge: 'check',
        badgeColor: '#16a34a',
      };
    case 'failed':
      return {
        fill: '#fecaca', // red-200
        stroke: '#dc2626',
        strokeWidth: 2,
        strokeDasharray: 'none',
        textColor: '#7f1d1d',
        badge: '!',
        badgeColor: '#dc2626',
      };
    default:
      return {
        fill: OP_NEUTRAL.fill,
        stroke: OP_NEUTRAL.stroke,
        strokeWidth: 1.5,
        strokeDasharray: 'none',
        textColor: 'var(--text-primary)',
        badge: null,
        badgeColor: null,
      };
  }
}

/**
 * Adapt a legacy V1 `commit` to a minimal V2-shaped operation so this
 * component can render uniformly. Mapping is intentionally lossy — only
 * id + kind heuristic + draft-style visuals.
 */
function legacyCommitToOperation(commit) {
  if (!commit) return null;
  const kindFromType = {
    amplify: 'pcr',
    digest_split: 'cut',
    mutate: 'mutagenesis',
    mix: 'gibson',
  }[commit.type] || null;
  return {
    id: commit.id,
    kind: kindFromType,
    status: 'committed',
    position: { x: 0, y: 0 },
    inputs: [],
    outputs: [],
    params: {},
    junctionRefs: [],
    createdAt: null,
    executedAt: null,
    error: null,
    _legacyLabel: commit.label || commit.type,
  };
}

function OperationNode({ operation, commit, highlighted, onClick, onContextMenu }) {
  const op = operation || legacyCommitToOperation(commit);
  if (!op) return null;

  const visual = statusVisual(op.status, op.kind);
  const useSvgIcon = !!op.kind;
  const fallbackIcon = op.kind ? (KIND_ICONS[op.kind] || 'settings') : '+';
  // L1 (audit) — overlap_pcr maps to the 'gibson' op kind (shared overlap-blue
  // colour), but a LINEAR overlap-extension join is not Gibson. Relabel by the
  // recorded method so the DAG node reads honestly.
  const label = op._legacyLabel
    || (op.kind === 'gibson' && op.params?.method === 'overlap_pcr' ? 'Overlap PCR'
      : (op.kind ? KIND_LABELS[op.kind] : 'Выбрать…'));

  const handleClick = (e) => {
    if (typeof onClick === 'function') onClick(op, e);
  };
  const handleContextMenu = (e) => {
    if (typeof onContextMenu === 'function') {
      e.preventDefault();
      onContextMenu(op, e);
    }
  };

  return (
    <div
      data-testid={`skeleton-op-node-${op.id}`}
      data-status={op.status}
      data-kind={op.kind || 'none'}
      data-highlighted={highlighted ? 'true' : 'false'}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      style={{
        width: OPERATION_NODE_W,
        height: OPERATION_NODE_H,
        position: 'relative',
        cursor: 'pointer',
        userSelect: 'none',
      }}
    >
      <svg
        width={OPERATION_NODE_W}
        height={OPERATION_NODE_H}
        style={{ position: 'absolute', inset: 0 }}
      >
        <polygon
          points={`${OPERATION_NODE_W / 2},2 ${OPERATION_NODE_W - 2},${OPERATION_NODE_H / 2} ${OPERATION_NODE_W / 2},${OPERATION_NODE_H - 2} 2,${OPERATION_NODE_H / 2}`}
          fill={visual.fill}
          stroke={highlighted ? 'var(--accent-500, #d97706)' : visual.stroke}
          strokeWidth={highlighted ? 3 : visual.strokeWidth}
          strokeDasharray={visual.strokeDasharray}
        />
      </svg>
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 11,
          color: visual.textColor,
          pointerEvents: 'none',
        }}
      >
        <span data-testid="skeleton-op-icon" style={{ fontSize: 14, display: 'inline-flex', alignItems: 'center' }}>
          {useSvgIcon ? <OpIcon kind={op.kind} size={14} /> : (fallbackIcon === '+' ? <Icon name="plus" size={14} /> : (fallbackIcon === 'settings' ? <Icon name="settings" size={14} /> : fallbackIcon))}
        </span>
        <span data-testid="skeleton-op-label" style={{ fontWeight: 500 }}>{label}</span>
      </div>
      {visual.badge && (
        <div
          data-testid="skeleton-op-status-badge"
          data-status={op.status}
          style={{
            position: 'absolute',
            top: -6,
            right: -6,
            width: 18,
            height: 18,
            borderRadius: '50%',
            background: visual.badgeColor,
            color: '#fff',
            fontSize: 11,
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
            boxShadow: '0 1px 2px rgba(0,0,0,0.18)',
          }}
        >{visual.badge === 'check' ? <Icon name="check" size={12} /> : visual.badge}</div>
      )}
    </div>
  );
}

export default memo(OperationNode);
