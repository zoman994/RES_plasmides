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
  // Subscribe to `parts` once and look up locally so the selector
  // returns a stable primitive on most state changes — instead of
  // re-running .find() over the whole library on every store
  // dispatch (one of the audit's high-severity hot paths).
  const parts = useStore(s => s.parts);
  const part = parts.find(p => p.id === data.templatePartId);
  const addFlowAssembly = useStore(s => s.addFlowAssembly);
  const addFlowCheckpoint = useStore(s => s.addFlowCheckpoint);

  const updateFlowNodeData = useStore(s => s.updateFlowNodeData);
  const templateName = part?.name || data.templatePartId || '?';
  const productLen = data.productLength ? `${data.productLength} bp` : '?';
  const [editing, setEditing] = useState(false);

  const handleDoubleClick = (e) => {
    e.stopPropagation();
    setEditing(true);
  };

  const handleSaveEdit = (field, value) => {
    if (value !== null && value !== undefined) {
      updateFlowNodeData(id, { [field]: value });
    }
  };

  return (
    <div
      className={`rounded-lg border-2 border-teal-400 bg-teal-50 shadow-sm
        hover:shadow-md transition-shadow cursor-pointer
        ${expanded ? 'min-w-[200px]' : 'min-w-[160px]'}`}
      onClick={() => { if (!editing) setExpanded(v => !v); }}
      onDoubleClick={handleDoubleClick}
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

      {/* Edit mode */}
      {editing && (
        <div className="px-3 pb-2 text-[10px] border-t border-teal-200 pt-1.5 space-y-1"
          onClick={e => e.stopPropagation()}>
          <div className="font-semibold text-teal-700 mb-1">Редактирование</div>
          <label className="block">
            <span className="text-gray-500">Продукт:</span>
            <input className="w-full border rounded px-1 py-0.5 text-[10px]" defaultValue={data.productName}
              onBlur={e => handleSaveEdit('productName', e.target.value)} />
          </label>
          <label className="block">
            <span className="text-gray-500">Fwd primer:</span>
            <input className="w-full border rounded px-1 py-0.5 text-[10px] font-mono" defaultValue={data.primerFwd}
              onBlur={e => handleSaveEdit('primerFwd', e.target.value)} />
          </label>
          <label className="block">
            <span className="text-gray-500">Rev primer:</span>
            <input className="w-full border rounded px-1 py-0.5 text-[10px] font-mono" defaultValue={data.primerRev}
              onBlur={e => handleSaveEdit('primerRev', e.target.value)} />
          </label>
          <div className="flex gap-2">
            <label className="block flex-1">
              <span className="text-gray-500">Tm fwd:</span>
              <input type="number" className="w-full border rounded px-1 py-0.5 text-[10px]" defaultValue={data.tmFwd || ''}
                onBlur={e => handleSaveEdit('tmFwd', e.target.value ? +e.target.value : null)} />
            </label>
            <label className="block flex-1">
              <span className="text-gray-500">Tm rev:</span>
              <input type="number" className="w-full border rounded px-1 py-0.5 text-[10px]" defaultValue={data.tmRev || ''}
                onBlur={e => handleSaveEdit('tmRev', e.target.value ? +e.target.value : null)} />
            </label>
          </div>
          <button onClick={() => setEditing(false)}
            className="text-[9px] px-2 py-0.5 bg-teal-500 text-white rounded mt-1">Готово</button>
        </div>
      )}

      {/* Expanded details */}
      {expanded && !editing && (
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
            <div className="px-3 py-1.5 text-xs hover:bg-orange-50 cursor-pointer"
              onClick={() => { addFlowAssembly(id, 're_ligation'); setShowDropdown(false); setShowMenu(false); }}>
              ✂️ RE Лигирование
            </div>
            <div className="px-3 py-1.5 text-xs hover:bg-purple-50 cursor-pointer"
              onClick={() => { addFlowAssembly(id, 'kld'); setShowDropdown(false); setShowMenu(false); }}>
              🔄 KLD
            </div>
            <div className="px-3 py-1.5 text-xs hover:bg-yellow-50 cursor-pointer"
              onClick={() => { addFlowAssembly(id, 'ligation'); setShowDropdown(false); setShowMenu(false); }}>
              🔗 Лигирование
            </div>
            <div className="border-t my-0.5" />
            <div className="px-3 py-1.5 text-xs hover:bg-red-50 cursor-pointer"
              onClick={() => {
                const srcNode = useStore.getState().flowNodes.find(n => n.id === id);
                const pos = srcNode ? { x: srcNode.position.x + 250, y: srcNode.position.y + 100 } : undefined;
                addFlowCheckpoint('transformation', pos); setShowDropdown(false); setShowMenu(false);
              }}>
              🧫 Трансформация
            </div>
            <div className="px-3 py-1.5 text-xs hover:bg-emerald-50 cursor-pointer"
              onClick={() => {
                const srcNode = useStore.getState().flowNodes.find(n => n.id === id);
                const pos = srcNode ? { x: srcNode.position.x + 250, y: srcNode.position.y + 120 } : undefined;
                addFlowCheckpoint('sequencing', pos); setShowDropdown(false); setShowMenu(false);
              }}>
              ✓ Секвенирование
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(PCRNodeInner);
