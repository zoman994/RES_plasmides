export default function PrimerPanel({ primers, warnings, orderSheet, primerQuality = [] }) {
  if (!primers || primers.length === 0) return null;

  const copyToClipboard = () => {
    if (orderSheet) navigator.clipboard.writeText(orderSheet);
  };

  return (
    <div className="border rounded-lg p-4 bg-white">
      <h3 className="text-sm font-bold text-gray-700 mb-3">
        Primers ({primers.length})
      </h3>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-400 uppercase tracking-wider text-[10px]">
              <th className="text-left p-2">Name</th>
              <th className="text-left p-2">Sequence</th>
              <th className="text-right p-2">Tm bind</th>
              <th className="text-right p-2">Tm full</th>
              <th className="text-right p-2">GC%</th>
              <th className="text-right p-2">Len</th>
              <th className="text-left p-2">Tail</th>
            </tr>
          </thead>
          <tbody>
            {primers.map((p, i) => {
              const tmOk = p.tmBinding >= 58 && p.tmBinding <= 64;
              return (
                <tr key={i} className="border-t hover:bg-gray-50">
                  <td className="p-2 font-semibold whitespace-nowrap">{p.name}</td>
                  <td className="p-2 font-mono text-[10px] max-w-xs break-all">
                    <span className="text-teal-500">
                      {(p.tailSequence || '').toLowerCase()}
                    </span>
                    <span className="text-gray-900 font-bold">
                      {(p.bindingSequence || '').toUpperCase()}
                    </span>
                  </td>
                  <td className={`p-2 text-right font-semibold ${tmOk ? 'text-green-600' : 'text-amber-500'}`}>
                    {p.tmBinding}&deg;C
                  </td>
                  <td className="p-2 text-right text-gray-400">{p.tmFull}&deg;C</td>
                  <td className="p-2 text-right">{p.gcPercent}%</td>
                  <td className="p-2 text-right">{p.length}</td>
                  <td className="p-2 text-[10px] text-gray-500 max-w-[140px] truncate">
                    {p.tailPurpose || '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="text-[10px] text-gray-500 mt-2 flex gap-4">
        <span><span className="text-teal-500">&bull;</span> tail (overlap/RE)</span>
        <span><span className="text-gray-900 font-bold">&bull;</span> BINDING (template)</span>
        <span>Tm bind = PCR annealing temp</span>
      </div>

      {/* Primer quality warnings */}
      {primerQuality.length > 0 && (
        <div className="mt-2 space-y-1">
          {primerQuality.map((pq, i) => (
            <div key={i} className="text-[10px] text-orange-600 bg-orange-50 px-2 py-1 rounded">
              <strong>{pq.name}:</strong> {pq.warnings.join(', ')}
            </div>
          ))}
        </div>
      )}

      {/* API Warnings */}
      {warnings && warnings.length > 0 && (
        <div className="mt-3 space-y-1">
          {warnings.map((w, i) => (
            <div key={i} className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded">
              &#9888; {w}
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 mt-3">
        <button onClick={copyToClipboard}
          className="text-xs px-3 py-1.5 bg-blue-50 text-blue-700 rounded
                     hover:bg-blue-100 transition">
          Copy for ordering (TSV)
        </button>
      </div>
    </div>
  );
}
