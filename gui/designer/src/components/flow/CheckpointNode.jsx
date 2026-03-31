/**
 * CheckpointNode — Verification checkpoint for Project Flow Canvas.
 *
 * Types: sequencing, colony_pcr, restriction_digest, custom.
 * Status: pending (○), done (✓), failed (✗).
 * Target handle only (receives constructs for verification).
 */
import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';

const STATUS_ICONS = {
  pending: '○',
  done: '✓',
  failed: '✗',
};

const STATUS_COLORS = {
  pending: 'text-gray-500',
  done: 'text-emerald-600',
  failed: 'text-red-600',
};

const CHECK_LABELS = {
  sequencing: 'Секвенирование',
  colony_pcr: 'Colony PCR',
  restriction_digest: 'Рестрикция',
  custom: 'Проверка',
};

function CheckpointNodeInner({ id, data }) {
  const checkType = data.checkType || 'custom';
  const status = data.status || 'pending';
  const statusIcon = STATUS_ICONS[status];
  const statusColor = STATUS_COLORS[status];

  return (
    <div
      className={`rounded-lg border-2 border-emerald-400 bg-emerald-50 shadow-sm
        hover:shadow-md transition-shadow min-w-[160px]`}
    >
      {/* Header */}
      <div className="px-3 py-1.5 text-xs font-semibold text-emerald-800 flex items-center gap-1.5">
        <span className={`text-sm ${statusColor}`}>{statusIcon}</span>
        <span className="truncate">{data.label || CHECK_LABELS[checkType]}</span>
      </div>

      {/* Info */}
      <div className="px-3 pb-1.5 text-[10px] text-gray-600">
        <div>Type: {CHECK_LABELS[checkType]}</div>
        <div className={statusColor}>Status: {status}</div>
        {data.notes && <div className="text-gray-400 truncate">{data.notes}</div>}
      </div>

      {/* Target handle only */}
      <Handle
        type="target"
        position={Position.Left}
        className="!w-2.5 !h-2.5 !bg-emerald-400 !border-white !border-2"
      />
    </div>
  );
}

export default memo(CheckpointNodeInner);
