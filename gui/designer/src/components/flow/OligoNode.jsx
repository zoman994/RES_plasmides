/**
 * OligoNode — Synthetic oligonucleotide node for Project Flow Canvas.
 *
 * Compact node for gRNA, adapter, linker, primer, or custom oligo.
 * Source handle on right (output to assembly/PCR).
 */
import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';

const TYPE_COLORS = {
  gRNA:    { border: 'border-green-400',  bg: 'bg-green-50',  text: 'text-green-800' },
  adapter: { border: 'border-amber-400',  bg: 'bg-amber-50',  text: 'text-amber-800' },
  linker:  { border: 'border-amber-400',  bg: 'bg-amber-50',  text: 'text-amber-800' },
  primer:  { border: 'border-orange-400', bg: 'bg-orange-50', text: 'text-orange-800' },
  custom:  { border: 'border-amber-400',  bg: 'bg-amber-50',  text: 'text-amber-800' },
};

function OligoNodeInner({ id, data }) {
  const oligoType = data.type || 'custom';
  const style = TYPE_COLORS[oligoType] || TYPE_COLORS.custom;
  const seqPreview = data.sequence ? data.sequence.slice(0, 20) : '';

  return (
    <div
      className={`rounded-lg border-2 ${style.border} ${style.bg} shadow-sm
        hover:shadow-md transition-shadow min-w-[130px]`}
    >
      {/* Header */}
      <div className={`px-2.5 py-1 text-xs font-semibold ${style.text} flex items-center gap-1`}>
        <span>🧬</span>
        <span className="truncate">{data.label || oligoType}</span>
      </div>

      {/* Info */}
      <div className="px-2.5 pb-1.5 text-[10px] text-gray-600">
        {data.length > 0 && <div>{data.length} bp</div>}
        {seqPreview && (
          <div className="font-mono truncate text-[9px] text-gray-400">
            5'-{seqPreview}{data.sequence?.length > 20 ? '...' : ''}
          </div>
        )}
      </div>

      {/* Source handle only */}
      <Handle
        type="source"
        position={Position.Right}
        className="!w-2 !h-2 !bg-amber-400 !border-white !border-2"
      />
    </div>
  );
}

export default memo(OligoNodeInner);
