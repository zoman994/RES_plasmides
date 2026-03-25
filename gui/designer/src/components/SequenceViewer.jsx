import { useState, useMemo } from 'react';
import { getFragColor, NT_COLORS } from '../theme';
import { t } from '../i18n';

export default function SequenceViewer({ fragments, circular, primers = [] }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState('all');

  const fullSeq = fragments.map(f => f.sequence || '').join('');

  // Build color ranges with alternating shades + boundary positions
  const { coloredRanges, boundaries } = useMemo(() => {
    let offset = 0;
    const ranges = [];
    const bounds = new Set();
    fragments.forEach((f, i) => {
      const start = offset;
      offset += (f.sequence || '').length;
      ranges.push({
        name: f.name, type: f.type, start, end: offset,
        color: getFragColor(f.type, i),
      });
      if (i > 0) bounds.add(start); // boundary between fragments
    });
    return { coloredRanges: ranges, boundaries: bounds };
  }, [fragments]);

  // Build primer region lookup for annotations
  const primerRegions = useMemo(() => {
    if (!primers || primers.length === 0) return [];
    // Accumulate fragment offsets to map primer positions to full sequence
    const offsets = [];
    let off = 0;
    fragments.forEach(f => { offsets.push(off); off += (f.sequence || '').length; });

    return primers.map((p, pi) => {
      const fragIdx = Math.floor(pi / 2);
      const fragOff = offsets[fragIdx] || 0;
      const start = fragOff + (p.bindingStart || 1) - 1;
      const end = fragOff + (p.bindingEnd || p.bindingStart || 1);
      return {
        name: p.name,
        start, end,
        direction: p.direction,
        color: p.direction === 'forward' ? '#3B82F6' : '#EF4444',
      };
    });
  }, [primers, fragments]);

  const displaySeq = selected === 'all' ? fullSeq : (fragments[selected]?.sequence || '');
  const COLS = 60;
  const lines = [];
  for (let i = 0; i < displaySeq.length; i += COLS) {
    lines.push({ pos: i + 1, seq: displaySeq.slice(i, i + COLS) });
  }

  if (fragments.length === 0) return null;

  return (
    <div className="border rounded-lg bg-white">
      <button onClick={() => setOpen(!open)}
        className="w-full text-left px-4 py-2 text-sm font-medium text-gray-700
                   hover:bg-gray-50 flex justify-between items-center">
        <span>Sequence ({(fullSeq.length / 1000).toFixed(1)} kb{circular ? ', circular' : ''})</span>
        <span className="text-gray-400">{open ? '▼' : '▶'}</span>
      </button>

      {open && (
        <div className="p-4 border-t">
          {/* Fragment selector tabs */}
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
                style={selected === i ? { background: getFragColor(f.type, i) } : {}}>
                {f.name} ({(f.sequence || '').length})
              </button>
            ))}
          </div>

          {/* Sequence display */}
          <div className="font-mono text-[11px] leading-5 max-h-[400px]
                          overflow-y-auto bg-gray-50 p-3 rounded">
            {lines.map(line => {
              // Find primers that overlap this line
              const lineStart = line.pos - 1;
              const lineEnd = lineStart + line.seq.length;
              const linePrimers = selected === 'all'
                ? primerRegions.filter(p => p.start < lineEnd && p.end > lineStart)
                : [];

              return (
                <div key={line.pos}>
                  <div className="flex">
                    <span className="text-gray-400 w-12 text-right mr-3 select-none shrink-0">
                      {line.pos}
                    </span>
                    <span className="break-all">
                      {selected === 'all'
                        ? line.seq.split('').map((ch, ci) => {
                            const abs = lineStart + ci;
                            const isBoundary = boundaries.has(abs);
                            const r = coloredRanges.find(r => abs >= r.start && abs < r.end);
                            const underPrimer = linePrimers.find(p => abs >= p.start && abs < p.end);
                            return (
                              <span key={ci}>
                                {isBoundary && <span className="text-red-400 select-none">|</span>}
                                <span style={{
                                  color: r?.color || '#333',
                                  textDecoration: underPrimer ? 'underline' : 'none',
                                  textDecorationColor: underPrimer?.color,
                                  textDecorationThickness: '2px',
                                  textUnderlineOffset: '2px',
                                }}>{ch}</span>
                              </span>
                            );
                          })
                        : line.seq.split('').map((ch, ci) => (
                            <span key={ci} style={{ color: NT_COLORS[ch.toUpperCase()] || '#333' }}>{ch}</span>
                          ))
                      }
                    </span>
                  </div>
                  {/* Primer annotations below the sequence line */}
                  {linePrimers.length > 0 && (
                    <div className="flex ml-[60px] h-3">
                      {linePrimers.map((p, pi) => {
                        const pStart = Math.max(p.start - lineStart, 0);
                        const pEnd = Math.min(p.end - lineStart, line.seq.length);
                        const width = pEnd - pStart;
                        if (width <= 0) return null;
                        return (
                          <div key={pi} className="absolute text-[7px] whitespace-nowrap"
                            style={{
                              marginLeft: `${pStart * 6.6}px`,
                              color: p.color,
                            }}>
                            {p.direction === 'forward' ? '→' : '←'}{p.name}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Legend */}
          {primerRegions.length > 0 && (
            <div className="text-[9px] text-gray-500 mt-2 flex gap-3">
              <span><span className="text-blue-500">━</span> forward primer binding</span>
              <span><span className="text-red-500">━</span> reverse primer binding</span>
              <span className="text-red-400">|</span> fragment boundary
            </div>
          )}

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
