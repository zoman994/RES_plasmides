import { useState } from 'react';
import { buildOrderSheet } from '../primer-reuse';

export default function PrimerPanel({
  primers, warnings, orderSheet, primerQuality = [],
  primerMatches = {}, onReusePrimer,
}) {
  const [showMatches, setShowMatches] = useState({});

  if (!primers || primers.length === 0) return null;

  // Determine which primers are reused
  const reusedNames = new Set(primers.filter(p => p.reused).map(p => p.name));
  const newCount = primers.length - reusedNames.size;
  const reuseCount = reusedNames.size;

  const effectiveOrderSheet = reuseCount > 0
    ? buildOrderSheet(primers, reusedNames)
    : orderSheet;

  const copyToClipboard = () => {
    if (effectiveOrderSheet) navigator.clipboard.writeText(effectiveOrderSheet);
  };

  const toggleMatch = (name) => {
    setShowMatches(prev => ({ ...prev, [name]: !prev[name] }));
  };

  return (
    <div className="border rounded-lg p-4 bg-white">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-gray-700">
          Primers ({primers.length})
          {reuseCount > 0 && (
            <span className="text-green-600 font-normal ml-2 text-[11px]">
              {reuseCount} в наличии, {newCount} к заказу
            </span>
          )}
        </h3>
      </div>

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
              const matches = primerMatches[p.name] || [];
              const hasMatches = matches.length > 0 && !p.reused;
              const expanded = showMatches[p.name];

              return (
                <tr key={i} className={`border-t hover:bg-gray-50 ${p.reused ? 'bg-green-50' : ''}`}>
                  <td className="p-2 font-semibold whitespace-nowrap">
                    <div className="flex items-center gap-1">
                      {p.reused && <span className="text-green-600 text-[10px]">{'✓'}</span>}
                      <span className={p.reused ? 'text-green-700' : ''}>{p.name}</span>
                    </div>
                    {p.reused && (
                      <div className="text-[9px] text-green-600 mt-0.5">
                        {'♻'} {p.reusedFrom}
                      </div>
                    )}
                    {/* Reuse suggestion */}
                    {hasMatches && (
                      <button onClick={() => toggleMatch(p.name)}
                        className="text-[9px] text-blue-600 hover:text-blue-800 mt-0.5 block">
                        {'💡'} {matches.length} совместим{matches.length > 1 ? 'ых' : 'ый'} в наличии
                        {expanded ? ' ▲' : ' ▼'}
                      </button>
                    )}
                  </td>
                  <td className="p-2 font-mono text-[10px] max-w-xs break-all">
                    <span className="text-teal-500">
                      {(p.tailSequence || '').toLowerCase()}
                    </span>
                    <span className="text-gray-900 font-bold">
                      {(p.bindingSequence || '').toUpperCase()}
                    </span>
                    {/* Expandable match details */}
                    {hasMatches && expanded && (
                      <div className="mt-2 space-y-1.5">
                        {matches.map((m, mi) => (
                          <div key={mi} className="bg-blue-50 border border-blue-200 rounded p-2 text-[10px]">
                            <div className="font-semibold text-blue-800 mb-1">
                              {m.existing.name}
                              {m.existing.addedAt && (
                                <span className="font-normal text-blue-500 ml-1">
                                  ({new Date(m.existing.addedAt).toLocaleDateString()})
                                </span>
                              )}
                            </div>
                            <div className="text-blue-700">{m.reason}</div>
                            <div className="text-blue-600">
                              Binding: идентичный
                              {m.tmDiff > 0 && ` · ΔTm ${m.tmDiff}°C`}
                            </div>
                            <div className="flex gap-2 mt-1.5">
                              <button onClick={() => onReusePrimer?.(p.name, m.existing)}
                                className="text-[10px] px-2 py-0.5 bg-green-600 text-white rounded hover:bg-green-700">
                                Использовать {m.existing.name}
                              </button>
                              <button onClick={() => toggleMatch(p.name)}
                                className="text-[10px] px-2 py-0.5 bg-gray-100 text-gray-600 rounded hover:bg-gray-200">
                                Заказать новый
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
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
          className="text-xs px-3 py-1.5 bg-blue-50 text-blue-700 rounded hover:bg-blue-100 transition">
          {reuseCount > 0
            ? `Скопировать заказ (${newCount} новых)`
            : 'Copy for ordering (TSV)'}
        </button>
      </div>
    </div>
  );
}
