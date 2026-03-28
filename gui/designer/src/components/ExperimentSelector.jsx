/** ProjectBar — project switcher + name editor. */
import { useState, useRef, useEffect } from 'react';
import { useStore } from '../store';

export default function ProjectBar() {
  // ═══ Store selectors (granular) ═══
  const projectName     = useStore(s => s.projectName);
  const projects        = useStore(s => s.projects);
  const activeProjectId = useStore(s => s.activeProjectId);

  // ═══ Store actions ═══
  const setProjectName = useStore(s => s.setProjectName);
  const switchProject  = useStore(s => s.switchProject);
  const addProject     = useStore(s => s.addProject);
  const removeProject  = useStore(s => s.removeProject);

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(projectName || 'Проект 1');
  const [open, setOpen] = useState(false);
  const dropRef = useRef(null);

  // Sync name when project switches
  useEffect(() => setName(projectName || 'Проект 1'), [projectName]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (dropRef.current && !dropRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const finish = () => { setEditing(false); if (name.trim()) setProjectName?.(name.trim()); };

  return (
    <div className="flex items-center gap-2 px-6 py-1 bg-gray-50 border-b shrink-0 relative" ref={dropRef}>
      <span className="text-xs text-gray-400 cursor-pointer" onClick={() => setOpen(v => !v)}>{'📁'}</span>
      {editing ? (
        <input value={name} onChange={e => setName(e.target.value)} onBlur={finish}
          onKeyDown={e => { if (e.key === 'Enter') finish(); if (e.key === 'Escape') setEditing(false); }}
          className="text-sm font-semibold bg-white border rounded px-2 py-0.5 outline-none focus:border-blue-400 w-64"
          autoFocus />
      ) : (
        <span className="text-sm font-semibold text-gray-800 cursor-pointer hover:text-blue-600"
          onClick={() => setOpen(v => !v)}
          onDoubleClick={() => setEditing(true)} title="Клик — проекты, двойной клик — переименовать">
          {projectName || 'Проект 1'}
        </span>
      )}
      <button onClick={() => setOpen(v => !v)}
        className={`text-[10px] text-gray-400 hover:text-gray-600 transition ${open ? 'rotate-180' : ''}`}>▼</button>

      {/* Dropdown */}
      {open && (
        <div className="absolute left-4 top-full mt-0.5 z-50 bg-white border border-gray-200 rounded-lg shadow-lg w-72 py-1">
          <div className="px-3 py-1.5 text-[9px] uppercase text-gray-400 font-semibold tracking-wider">Проекты</div>
          {(projects || []).map(p => (
            <div key={p.id}
              className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer text-xs ${p.id === activeProjectId ? 'bg-blue-50 text-blue-700 font-semibold' : 'hover:bg-gray-50'}`}
              onClick={() => { switchProject?.(p.id); setOpen(false); }}>
              <span className="text-gray-400">{'📁'}</span>
              <span className="flex-1 truncate">{p.name}</span>
              <span className="text-[9px] text-gray-400">{p.assemblies?.length || 0} сб.</span>
              {(projects || []).length > 1 && (
                <button onClick={e => { e.stopPropagation(); removeProject?.(p.id); }}
                  className="text-gray-300 hover:text-red-500 text-[10px]" title="Удалить проект">{'×'}</button>
              )}
            </div>
          ))}
          <div className="border-t border-gray-100 mt-1 pt-1 px-3 pb-1">
            <button onClick={() => { addProject?.(); setOpen(false); }}
              className="text-[11px] text-blue-600 hover:text-blue-800 w-full text-left py-1">
              + Новый проект
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
