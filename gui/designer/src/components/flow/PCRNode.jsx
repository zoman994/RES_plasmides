/**
 * PCRNode — PCR reaction node for Project Flow Canvas.
 *
 * Receives template DNA (left handle) → produces PCR product (right handle).
 * Collapsed: label + product length. Expanded: full primer/Tm/polymerase info.
 */
import { memo, useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import { useStore } from '../../store';

function PCRNodeInner({ id, data }) {
  const [expanded, setExpanded] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const part = useStore(s => s.parts.find(p => p.id === data.templatePartId));
  const addFlowAssembly = useStore(s => s.addFlowAssembly);
  const addFlowCheckpoint = useStore(s => s.addFlowCheckpoint);

  const templateName = part?.name || data.templatePartId || '?';
  const productLen = data.productLength ? `${data.productLength} bp` : '?';

  return (
    <div
      className={`rounded-lg border-2 border-teal-400 bg-teal-50 shadow-sm
        hover:shadow-md transition-shadow cursor-pointer
        ${expanded ? 'min-w-[200px]' : 'min-w-[160px]'}`}
      onClick={() => setExpanded(v => !v)}
    >
      {/* Left accent bar */}
      <div className="absolute left-0 top-0 bottom-0 w-1 bg-teal-400 rounded-l-lg" />

      {/* Header */}
      <div className="px-3 py-1.5 text-xs font-semibold text-teal-800 flex items-center gap-1.5">
        <span>🧪</span>
        <span className="truncate">{data.label || 'PCR'}</span>
      </div>

      {/* Collapsed info */}
      <div className="px-3 pb-1.5 text-[10px] text-gray-600">
        <div>Template: {templateName}</div>
        <div>Product: {productLen}</div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="px-3 pb-2 text-[10px] text-gray-500 border-t border-teal-200 pt-1.5 space-y-0.5">
          {data.productName && <div>Name: {data.productName}</div>}
          {data.primerFwd && (
            <div className="font-mono truncate" title={data.primerFwd}>
              Fwd: {data.primerFwd.slice(0, 20)}...
            </div>
          )}
          {data.primerRev && (
            <div className="font-mono truncate" title={data.primerRev}>
              Rev: {data.primerRev.slice(0, 20)}...
            </div>
          )}
          {(data.tmFwd || data.tmRev) && (
            <div>Tm: {data.tmFwd ?? '?'}°C / {data.tmRev ?? '?'}°C</div>
          )}
          <div>Polymerase: {data.polymerase || 'Q5'}</div>
          {data.elongationTime && <div>Elongation: {data.elongationTime}</div>}
        </div>
      )}

      {/* Handles */}
      <Handle
        type="target"
        position={Position.Left}
        id="template"
        className="!w-2.5 !h-2.5 !bg-teal-400 !border-white !border-2"
      />
      {/* MIRO+ source handle with dropdown */}
      <div className="absolute -right-3 top-1/2 -translate-y-1/2 z-20"
        onMouseEnter={() => setShowMenu(true)}
        onMouseLeave={() => { setShowMenu(false); setShowDropdown(false); }}>
        <Handle
          type="source"
          position={Position.Right}
          id="product"
          className="!w-2.5 !h-2.5 !bg-teal-400 !border-white !border-2"
        />
        {/* Invisible bridge to prevent gap between handle and menu */}
        {showMenu && <div className="absolute left-full top-0 w-2 h-full" />}

        {showMenu && !showDropdown && (
          <div className="absolute left-full ml-1 top-1/2 -translate-y-1/2
            w-4 h-4 rounded-full bg-teal-500 text-white text-[10px]
            flex items-center justify-center cursor-pointer shadow"
            onClick={(e) => { e.stopPropagation(); setShowDropdown(true); }}>
            +
          </div>
        )}

        {showDropdown && (
          <div className="absolute left-full ml-1 top-1/2 -translate-y-1/2
            bg-white border rounded-lg shadow-lg py-1 min-w-[190px] z-50"
            onClick={(e) => e.stopPropagation()}>
            <div className="px-3 py-1.5 text-xs hover:bg-blue-50 cursor-pointer"
              onClick={() => { addFlowAssembly(id, 'gibson'); setShowDropdown(false); setShowMenu(false); }}>
              ⚗️ Gibson Assembly
            </div>
            <div className="px-3 py-1.5 text-xs hover:bg-green-50 cursor-pointer"
              onClick={() => { addFlowAssembly(id, 'golden_gate'); setShowDropdown(false); setShowMenu(false); }}>
              🔶 Golden Gate Assembly
            </div>
            <div className="px-3 py-1.5 text-xs hover:bg-emerald-50 cursor-pointer"
              onClick={() => {
                const srcNode = useStore.getState().flowNodes.find(n => n.id === id);
                const pos = srcNode ? { x: srcNode.position.x + 250, y: srcNode.position.y + 120 } : undefined;
                addFlowCheckpoint('sequencing', pos); setShowDropdown(false); setShowMenu(false);
              }}>
              ✓ Checkpoint (Sequencing)
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(PCRNodeInner);
