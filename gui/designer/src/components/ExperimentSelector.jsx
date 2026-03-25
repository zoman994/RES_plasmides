export default function ExperimentSelector({ experiments, activeExpId, onSelect, onCreate }) {
  return (
    <div className="flex items-center gap-2 px-6 py-1.5 bg-gray-50 border-b shrink-0">
      <span className="text-xs text-gray-400">{'📁'}</span>
      <select value={activeExpId} onChange={e => onSelect(e.target.value)}
        className="text-sm font-semibold bg-transparent border-none cursor-pointer outline-none text-gray-800 max-w-[300px]">
        {experiments.map(exp => (
          <option key={exp.id} value={exp.id}>{exp.name}</option>
        ))}
      </select>
      <button onClick={onCreate}
        className="text-xs text-blue-600 hover:text-blue-800 transition">
        + Новый
      </button>
      <span className="ml-auto text-[10px] text-gray-400">
        {experiments.length} {experiments.length === 1 ? 'эксперимент' : 'экспериментов'}
      </span>
    </div>
  );
}
