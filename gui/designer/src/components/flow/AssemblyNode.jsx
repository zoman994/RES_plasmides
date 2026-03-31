/**
 * AssemblyNode — Assembly reaction node for Project Flow Canvas.
 *
 * Receives fragments (left handle) → produces construct (right handle).
 * Color varies by assembly method. Double-click navigates to assembly view.
 */
import { memo, useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import { useStore } from '../../store';

const METHOD_STYLES = {
  gibson:      { border: 'border-blue-400',   bg: 'bg-blue-50',   accent: 'bg-blue-400',   text: 'text-blue-800',   icon: '⚗️' },
  golden_gate: { border: 'border-green-400',  bg: 'bg-green-50',  accent: 'bg-green-400',  text: 'text-green-800',  icon: '🔶' },
  overlap:     { border: 'border-blue-300',   bg: 'bg-blue-50',   accent: 'bg-blue-300',   text: 'text-blue-700',   icon: '↔' },
  kld:         { border: 'border-purple-400', bg: 'bg-purple-50', accent: 'bg-purple-400', text: 'text-purple-800', icon: '🔄' },
};

const METHOD_LABELS = {
  gibson: 'Gibson',
  golden_gate: 'Golden Gate',
  overlap: 'Overlap',
  kld: 'KLD',
};

function AssemblyNodeInner({ id, data }) {
  const [expanded, setExpanded] = useState(false);
  const switchAssembly = useStore(s => s.switchAssembly);
  const setProjectView = useStore(s => s.setProjectView);

  const method = data.method || 'gibson';
  const style = METHOD_STYLES[method] || METHOD_STYLES.gibson;

  const handleDoubleClick = (e) => {
    e.stopPropagation();
    if (data.assemblyId) {
      switchAssembly(data.assemblyId);
      setProjectView('construct');
    }
  };

  return (
    <div
      className={`rounded-lg border-2 ${style.border} ${style.bg} shadow-sm
        hover:shadow-md transition-shadow cursor-pointer
        ${expanded ? 'min-w-[200px]' : 'min-w-[160px]'}`}
      onClick={() => setExpanded(v => !v)}
      onDoubleClick={handleDoubleClick}
    >
      {/* Left accent bar */}
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${style.accent} rounded-l-lg`} />

      {/* Header */}
      <div className={`px-3 py-1.5 text-xs font-semibold ${style.text} flex items-center gap-1.5`}>
        <span>{style.icon}</span>
        <span className="truncate">{data.label || `${METHOD_LABELS[method]} Assembly`}</span>
      </div>

      {/* Info */}
      <div className="px-3 pb-1.5 text-[10px] text-gray-600">
        <div>Method: {METHOD_LABELS[method]}</div>
        <div>Fragments: {data.fragmentCount ?? '?'}</div>
        {data.expectedSize && <div>Size: {(data.expectedSize / 1000).toFixed(1)} kb</div>}
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="px-3 pb-2 text-[10px] text-gray-500 border-t border-gray-200 pt-1.5 space-y-0.5">
          {data.protocol && <div>Protocol: {data.protocol}</div>}
          {data.assemblyId && (
            <div className="text-blue-600 cursor-pointer hover:underline"
              onClick={(e) => { e.stopPropagation(); handleDoubleClick(e); }}>
              → Open construct view
            </div>
          )}
        </div>
      )}

      {/* Handles */}
      <Handle
        type="target"
        position={Position.Left}
        id="fragment"
        className={`!w-2.5 !h-2.5 !${style.accent.replace('bg-', 'bg-')} !border-white !border-2`}
        style={{ backgroundColor: method === 'golden_gate' ? '#4ade80' : '#60a5fa' }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="product"
        className={`!w-2.5 !h-2.5 !border-white !border-2`}
        style={{ backgroundColor: method === 'golden_gate' ? '#4ade80' : '#60a5fa' }}
      />
    </div>
  );
}

export default memo(AssemblyNodeInner);
