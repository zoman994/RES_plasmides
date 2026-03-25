import { useState, useMemo } from 'react';
import { getFragColor, NT_COLORS } from '../theme';
import { translateDNA } from '../codons';
import { DOMAIN_COLORS } from '../domain-detection';

export default function SequenceViewer({ fragments, circular, primers = [] }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState('all');
  const [viewMode, setViewMode] = useState('dna'); // 'dna' | 'protein' | 'domains'

  const fullSeq = fragments.map(f => f.sequence || '').join('');
  const selFrag = typeof selected === 'number' ? fragments[selected] : null;
  const isCDS = selFrag?.type === 'CDS';
  const hasDomains = isCDS && selFrag?.domains?.length > 0;

  // Auto-switch to domains mode for CDS with domains
  const effectiveMode = !isCDS ? 'dna' : viewMode;

  const { coloredRanges, boundaries } = useMemo(() => {
    let offset = 0;
    const ranges = [], bounds = new Set();
    fragments.forEach((f, i) => {
      const start = offset; offset += (f.sequence || '').length;
      ranges.push({ name: f.name, type: f.type, start, end: offset, color: getFragColor(f.type, i) });
      if (i > 0) bounds.add(start);
    });
    return { coloredRanges: ranges, boundaries: bounds };
  }, [fragments]);

  const primerRegions = useMemo(() => {
    if (!primers?.length) return [];
    // Build fragment offset map
    const offsets = {}; let off = 0;
    fragments.forEach(f => { offsets[f.name] = off; off += (f.sequence || '').length; });

    return primers.map(p => {
      // Find which fragment this primer belongs to by name match
      const frag = fragments.find(f => p.name.includes(f.name));
      if (!frag) return null;
      const fragOff = offsets[frag.name] || 0;
      const fragSeq = (frag.sequence || '').toUpperCase();
      const bind = (p.bindingSequence || '').toUpperCase();

      if (!bind) return null;

      // Find binding position within fragment
      let bindStart, bindEnd;
      if (p.direction === 'forward') {
        bindStart = fragSeq.indexOf(bind);
        bindEnd = bindStart >= 0 ? bindStart + bind.length : -1;
      } else {
        // Reverse primer: search for reverse complement of binding on sense strand
        const rc = bind.split('').reverse().map(c => ({A:'T',T:'A',G:'C',C:'G'}[c]||'N')).join('');
        bindStart = fragSeq.indexOf(rc);
        bindEnd = bindStart >= 0 ? bindStart + rc.length : -1;
      }

      if (bindStart < 0) return null;

      return {
        name: p.name, start: fragOff + bindStart, end: fragOff + bindEnd,
        direction: p.direction, color: p.direction === 'forward' ? '#3B82F6' : '#EF4444',
      };
    }).filter(Boolean);
  }, [primers, fragments]);

  // DNA or protein sequence for display
  const displaySeq = selected === 'all' ? fullSeq : (selFrag?.sequence || '');
  const protein = useMemo(() => isCDS && effectiveMode !== 'dna' ? translateDNA(displaySeq) : '', [displaySeq, isCDS, effectiveMode]);

  const COLS = effectiveMode === 'dna' ? 60 : 50;
  const seqToShow = effectiveMode === 'dna' ? displaySeq : protein;
  const lines = [];
  for (let i = 0; i < seqToShow.length; i += COLS) {
    lines.push({ pos: i + 1, seq: seqToShow.slice(i, i + COLS) });
  }

  if (!fragments.length) return null;

  return (
    <div className="border rounded-lg bg-white">
      <button onClick={() => setOpen(!open)}
        className="w-full text-left px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 flex justify-between items-center">
        <span>Последовательность ({fullSeq.length} п.н.{circular ? ', кольцевая' : ''})</span>
        <span className="text-gray-400">{open ? '▼' : '▶'}</span>
      </button>

      {open && (
        <div className="p-4 border-t">
          {/* Fragment selector + view mode */}
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <button onClick={() => { setSelected('all'); setViewMode('dna'); }}
              className={`text-[10px] px-2 py-1 rounded transition ${
                selected === 'all' ? 'bg-gray-800 text-white' : 'bg-gray-100 hover:bg-gray-200'
              }`}>Все ({fullSeq.length} п.н.)</button>
            {fragments.map((f, i) => (
              <button key={i} onClick={() => { setSelected(i); if (f.type === 'CDS' && f.domains?.length) setViewMode('domains'); }}
                className={`text-[10px] px-2 py-1 rounded transition ${
                  selected === i ? 'text-white' : 'bg-gray-100 hover:bg-gray-200'
                }`} style={selected === i ? { background: getFragColor(f.type, i) } : {}}>
                {f.name} ({(f.sequence || '').length})
              </button>
            ))}

            {/* View mode toggle (CDS only) */}
            {isCDS && (
              <div className="flex gap-0 rounded-lg overflow-hidden border ml-auto">
                {hasDomains && (
                  <button onClick={() => setViewMode('domains')}
                    className={`px-2 py-1 text-[9px] font-medium ${viewMode === 'domains' ? 'bg-blue-600 text-white' : 'hover:bg-gray-100'}`}>
                    {'📦'} Домены
                  </button>
                )}
                <button onClick={() => setViewMode('protein')}
                  className={`px-2 py-1 text-[9px] font-medium ${viewMode === 'protein' ? 'bg-blue-600 text-white' : 'hover:bg-gray-100'}`}>
                  {'🧬'} Белок
                </button>
                <button onClick={() => setViewMode('dna')}
                  className={`px-2 py-1 text-[9px] font-medium ${viewMode === 'dna' ? 'bg-blue-600 text-white' : 'hover:bg-gray-100'}`}>
                  {'🔤'} ДНК
                </button>
              </div>
            )}
          </div>

          {/* Domain bar (domains mode) */}
          {effectiveMode === 'domains' && hasDomains && (
            <div className="mb-3">
              <div className="flex h-8 rounded overflow-hidden border">
                {selFrag.domains.map((d, i) => {
                  const totalAA = Math.ceil(displaySeq.length / 3);
                  const widthPct = Math.max(3, ((d.endAA - d.startAA + 1) / (totalAA || 1)) * 100);
                  return (
                    <div key={i} style={{ width: `${widthPct}%`, backgroundColor: d.color || DOMAIN_COLORS[d.type] }}
                      className="flex items-center justify-center text-[9px] text-white font-medium truncate px-1 border-r border-white/30 last:border-0"
                      title={`${d.name}: ${d.startAA}–${d.endAA} а.о. (${d.type})`}>
                      {widthPct > 8 ? `${d.name} (${d.endAA - d.startAA + 1})` : d.name}
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-between text-[8px] text-gray-400 mt-0.5 px-1">
                <span>1</span><span>{Math.ceil(displaySeq.length / 3)} а.о.</span>
              </div>
            </div>
          )}

          {/* Sequence display */}
          <div className="font-mono text-[11px] leading-5 max-h-[400px] overflow-y-auto bg-gray-50 p-3 rounded">
            {lines.map(line => {
              const lineStart = line.pos - 1;
              const lineEnd = lineStart + line.seq.length;
              const linePrimers = selected === 'all' && effectiveMode === 'dna'
                ? primerRegions.filter(p => p.start < lineEnd && p.end > lineStart) : [];

              return (
                <div key={line.pos}>
                  <div className="flex">
                    <span className="text-gray-400 w-12 text-right mr-3 select-none shrink-0">
                      {line.pos}
                    </span>
                    <span className="break-all">
                      {effectiveMode === 'dna' && selected === 'all'
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
                                  textDecorationThickness: '2px', textUnderlineOffset: '2px',
                                }}>{ch}</span>
                              </span>
                            );
                          })
                        : effectiveMode === 'dna'
                          ? line.seq.split('').map((ch, ci) => {
                              // Single fragment DNA — color by domain if CDS
                              const aaIdx = Math.floor((lineStart + ci) / 3);
                              const dom = isCDS && selFrag?.domains?.find(d => aaIdx + 1 >= d.startAA && aaIdx + 1 <= d.endAA);
                              return (
                                <span key={ci} style={{
                                  color: NT_COLORS[ch.toUpperCase()] || '#333',
                                  borderBottom: dom ? `2px solid ${dom.color || DOMAIN_COLORS[dom.type]}` : 'none',
                                }}>{ch}</span>
                              );
                            })
                          : /* Protein mode */
                            line.seq.split('').map((aa, ci) => {
                              const aaPos = lineStart + ci + 1;
                              const dom = selFrag?.domains?.find(d => aaPos >= d.startAA && aaPos <= d.endAA);
                              return (
                                <span key={ci} style={{
                                  backgroundColor: dom ? (dom.color || DOMAIN_COLORS[dom.type]) + '25' : 'transparent',
                                  borderBottom: dom ? `2px solid ${dom.color || DOMAIN_COLORS[dom.type]}` : 'none',
                                }} title={dom ? `${dom.name} — позиция ${aaPos}` : `позиция ${aaPos}`}>{aa}</span>
                              );
                            })
                      }
                    </span>
                  </div>
                  {linePrimers.length > 0 && (
                    <div className="relative ml-[60px] h-3 font-mono">
                      {linePrimers.map((p, pi) => {
                        const pStart = Math.max(p.start - lineStart, 0);
                        const width = Math.min(p.end - lineStart, line.seq.length) - pStart;
                        if (width <= 0) return null;
                        return (
                          <span key={pi} className="absolute text-[7px] whitespace-nowrap leading-none"
                            style={{ left: `${pStart}ch`, color: p.color }}>
                            {p.direction === 'forward' ? '→' : '←'}{p.name}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div className="text-[9px] text-gray-500 mt-2 flex gap-3 flex-wrap">
            {effectiveMode === 'dna' && primerRegions.length > 0 && (
              <>
                <span><span className="text-blue-500">━</span> forward primer</span>
                <span><span className="text-red-500">━</span> reverse primer</span>
                <span className="text-red-400">|</span><span>граница фрагмента</span>
              </>
            )}
            {effectiveMode !== 'dna' && hasDomains && selFrag.domains.map((d, i) => (
              <span key={i}><span style={{ color: d.color }}>━</span> {d.name}</span>
            ))}
          </div>

          <button onClick={() => navigator.clipboard.writeText(effectiveMode === 'dna' ? displaySeq : protein)}
            className="mt-2 text-xs px-3 py-1.5 bg-blue-50 text-blue-700 rounded hover:bg-blue-100 transition">
            {'📋'} Скопировать {effectiveMode === 'dna' ? 'ДНК' : 'белок'} ({seqToShow.length} {effectiveMode === 'dna' ? 'п.н.' : 'а.о.'})
          </button>
        </div>
      )}
    </div>
  );
}
