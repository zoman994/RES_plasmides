/**
 * K11 (Sprint 1.7) — virtual full-view grid for split-group sub-fragments.
 * Read-only render of the entire parent gene sequence with the current
 * sub-fragment region highlighted and mutations marked.
 */
export default function FullViewGrid({ fragment, fullViewHighlight, mutationHighlight }) {
  const fullSeq = fragment.splitGroupFullSequence || '';
  const regionStart = fragment.templateStart || 0;
  const regionEnd = regionStart + (fragment.length || 0);
  const PER_LINE = 60;
  const lines = [];
  for (let i = 0; i < fullSeq.length; i += PER_LINE) {
    lines.push({ start: i, slice: fullSeq.slice(i, i + PER_LINE) });
  }
  return (
    <div className="bg-gray-50 rounded-lg p-3 max-h-[240px] overflow-y-auto mb-3 font-mono text-[11px]"
      data-testid="fragment-editor-full-view">
      {lines.map(line => (
        <div key={line.start} className="flex items-start mb-0.5">
          <span className="text-gray-400 w-10 text-right mr-2 shrink-0 text-[9px] pt-0.5 select-none">{line.start + 1}</span>
          <span>
            {line.slice.split('').map((nt, ci) => {
              const pos = line.start + ci;
              const inRegion = pos >= regionStart && pos < regionEnd;
              const mh = fullViewHighlight.get(pos);
              const gap = ci > 0 && ci % 10 === 0;
              return (
                <span key={ci}
                  className={`rounded ${gap ? 'ml-1' : ''} ${inRegion ? 'bg-purple-100' : 'text-gray-500'}`}
                  style={{ cursor: 'default',
                    backgroundColor: mh === 'nonsilent' ? 'rgba(239,68,68,0.35)'
                      : mh === 'silent' ? 'rgba(234,179,8,0.35)'
                      : (inRegion ? 'rgba(168,85,247,0.18)' : undefined),
                    borderBottom: mh ? `2px solid ${mh === 'nonsilent' ? '#ef4444' : '#eab308'}` : 'none',
                  }}
                  title={`${nt} · ${pos + 1}${inRegion ? ' · текущий фрагмент' : ''}${mh ? ' · мутация' : ''}`}>
                  {nt}
                </span>
              );
            })}
          </span>
        </div>
      ))}
      <div className="text-[9px] text-gray-400 text-center mt-1">
        Обзор полной split-группы (read-only). Область текущего sub-фрагмента подсвечена.
      </div>
    </div>
  );
}
