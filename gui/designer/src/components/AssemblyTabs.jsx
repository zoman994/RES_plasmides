import { useState } from 'react';

export default function AssemblyTabs({ assemblies, activeId, onSelect, onAdd, onRemove, onRename }) {
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');

  const startRename = (id, name) => { setEditingId(id); setEditName(name); };
  const finishRename = () => {
    if (editingId && editName.trim()) onRename(editingId, editName.trim());
    setEditingId(null);
  };

  return (
    <div className="flex items-center border-b bg-gray-50 px-4 shrink-0">
      {assemblies.map((asm, i) => {
        const hasDep = i > 0 && asm.fragments?.some(
          f => f.sourceAssemblyId === assemblies[i - 1]?.id
        );
        return (
          <div key={asm.id} className="flex items-center">
            {/* Dependency arrow */}
            {i > 0 && (
              <span className={`text-sm mx-0.5 select-none ${hasDep ? 'text-green-500 font-bold' : 'text-gray-300'}`}>
                {'\u2192'}
              </span>
            )}
            <button
              onClick={() => onSelect(asm.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium
                border-b-2 transition-colors relative group
                ${asm.id === activeId
                  ? 'border-blue-500 text-blue-700 bg-white'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                }`}
            >
              {/* Status dot */}
              <span className={`w-2 h-2 rounded-full shrink-0 ${
                asm.completed ? 'bg-green-500' :
                asm.calculated ? 'bg-blue-500' :
                asm.fragments?.length > 0 ? 'bg-amber-500' : 'bg-gray-300'
              }`} />

              {/* Name or inline editor */}
              {editingId === asm.id ? (
                <input
                  autoFocus
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  onBlur={finishRename}
                  onKeyDown={e => {
                    if (e.key === 'Enter') finishRename();
                    if (e.key === 'Escape') setEditingId(null);
                  }}
                  className="w-28 text-xs border rounded px-1 py-0.5"
                  onClick={e => e.stopPropagation()}
                />
              ) : (
                <span
                  onDoubleClick={e => { e.stopPropagation(); startRename(asm.id, asm.name); }}
                  title="Двойной клик для переименования"
                >
                  {asm.name}
                </span>
              )}

              {/* Fragment count */}
              <span className="text-[10px] text-gray-400">
                ({asm.fragments?.length || 0})
              </span>

              {/* Close button */}
              {assemblies.length > 1 && (
                <span
                  onClick={e => { e.stopPropagation(); onRemove(asm.id); }}
                  className="hidden group-hover:inline-block text-gray-400 hover:text-red-500
                             ml-1 cursor-pointer text-sm leading-none"
                >{'\u00D7'}</span>
              )}
            </button>
          </div>
        );
      })}

      {/* Add new assembly */}
      <button onClick={onAdd}
        className="px-3 py-2 text-xs text-gray-400 hover:text-blue-600 transition ml-1">
        + Новая сборка
      </button>
    </div>
  );
}
