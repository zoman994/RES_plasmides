import { useState, useMemo } from 'react';

const COLORS = {
  CDS: '#F5A623', promoter: '#B0B0B0', terminator: '#CC0000',
  rep_origin: '#FFD700', marker: '#31AF31', misc_feature: '#6699CC',
  regulatory: '#9B59B6',
};

export default function SequenceViewer({ fragments, circular }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState('all');

  const fullSeq = fragments.map(f => f.sequence || '').join('');

  const coloredRanges = useMemo(() => {
    let offset = 0;
    return fragments.map(f => {
      const start = offset;
      offset += (f.sequence || '').length;
      return { name: f.name, start, end: offset, color: COLORS[f.type] || '#6699CC' };
    });
  }, [fragments]);

  const displaySeq = selected === 'all'
    ? fullSeq
    : (fragments[selected]?.sequence || '');

  const lines = [];
  for (let i = 0; i < displaySeq.length; i += 60) {
    lines.push({ pos: i + 1, seq: displaySeq.slice(i, i + 60) });
  }

  if (fragments.length === 0) return null;

  return (
    <div className="border rounded-lg bg-white">
      <button onClick={() => setOpen(!open)}
        className="w-full text-left px-4 py-2 text-sm font-medium text-gray-700
                   hover:bg-gray-50 flex justify-between items-center">
        <span>Sequence ({(fullSeq.length / 1000).toFixed(1)} kb{circular ? ', circular' : ''})</span>
        <span className="text-gray-400">{open ? '\u25BC' : '\u25B6'}</span>
      </button>

      {open && (
        <div className="p-4 border-t">
          <div className="flex gap-1 mb-3 flex-wrap">
            <button onClick={() => setSelected('all')}
              className={`text-[10px] px-2 py-1 rounded transition ${
                selected === 'all' ? 'bg-gray-800 text-white' : 'bg-gray-100 hover:bg-gray-200'
              }`}>All ({fullSeq.length} bp)</button>
            {fragments.map((f, i) => (
              <button key={i} onClick={() => setSelected(i)}
                className={`text-[10px] px-2 py-1 rounded transition ${
                  selected === i ? 'text-white' : 'bg-gray-100 hover:bg-gray-200'
                }`}
                style={selected === i ? { background: COLORS[f.type] || '#6699CC' } : {}}>
                {f.name} ({(f.sequence || '').length})
              </button>
            ))}
          </div>

          <div className="font-mono text-[11px] leading-5 max-h-[300px]
                          overflow-y-auto bg-gray-50 p-3 rounded">
            {lines.map(line => (
              <div key={line.pos} className="flex">
                <span className="text-gray-400 w-12 text-right mr-3 select-none shrink-0">
                  {line.pos}
                </span>
                <span className="break-all">
                  {selected === 'all'
                    ? line.seq.split('').map((ch, ci) => {
                        const abs = line.pos - 1 + ci;
                        const r = coloredRanges.find(r => abs >= r.start && abs < r.end);
                        return <span key={ci} style={{ color: r?.color || '#333' }}>{ch}</span>;
                      })
                    : line.seq
                  }
                </span>
              </div>
            ))}
          </div>

          <button onClick={() => navigator.clipboard.writeText(displaySeq)}
            className="mt-2 text-xs px-3 py-1.5 bg-blue-50 text-blue-700 rounded
                       hover:bg-blue-100 transition">
            Copy {selected === 'all' ? 'full' : fragments[selected]?.name} sequence ({displaySeq.length} bp)
          </button>
        </div>
      )}
    </div>
  );
}
