/** ProjectBar — shows current project name, editable. */
import { useState } from 'react';

export default function ProjectBar({ projectName, onRename }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(projectName || 'Проект 1');

  const finish = () => { setEditing(false); if (name.trim()) onRename?.(name.trim()); };

  return (
    <div className="flex items-center gap-2 px-6 py-1 bg-gray-50 border-b shrink-0">
      <span className="text-xs text-gray-400">{'📁'}</span>
      {editing ? (
        <input value={name} onChange={e => setName(e.target.value)} onBlur={finish}
          onKeyDown={e => { if (e.key === 'Enter') finish(); if (e.key === 'Escape') setEditing(false); }}
          className="text-sm font-semibold bg-white border rounded px-2 py-0.5 outline-none focus:border-blue-400 w-64"
          autoFocus />
      ) : (
        <span className="text-sm font-semibold text-gray-800 cursor-pointer hover:text-blue-600"
          onDoubleClick={() => setEditing(true)} title="Двойной клик для переименования">
          {projectName || 'Проект 1'}
        </span>
      )}
    </div>
  );
}
