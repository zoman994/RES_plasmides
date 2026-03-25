import { useState, useMemo } from 'react';
import { getFragColor, NT_COLORS } from '../theme';
import { translateDNA } from '../codons';
import { DOMAIN_COLORS } from '../domain-detection';

export default function SequenceViewer({ fragments, circular, primers = [] }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState('all');
  const [viewMode, setViewMode] = useState('dna');

  const fullSeq = fragments.map(f => f.sequence || '').join('');
  const selFrag = typeof selected === 'number' ? fragments[selected] : null;
  const isCDS = selFrag?.type === 'CDS';
  const hasDomains = isCDS && selFrag?.domains?.length > 0;
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

  // Build primer regions with binding position search
  const primerRegions = useMemo(() => {
    if (!primers?.length) return [];
    // Build fragment offset + end map
    const fragInfo = []; let off = 0;
    fragments.forEach(f => {
      const len = (f.sequence || '').length;
      fragInfo.push({ name: f.name, offset: off, end: off + len });
      off += len;
    });

    return primers.map(p => {
      const fi = fragInfo.find(f => p.name.includes(f.name));
      if (!fi) return null;
      const bindLen = (p.bindingSequence || '').length;
      const tailLen = (p.tailSequence || '').length;
      if (!bindLen) return null;

      let bindStart, bindEnd;
      if (p.direction === 'forward') {
        // Fwd primer: binds at START of fragment, tail extends LEFT into prev fragment
        bindStart = fi.offset;
        bindEnd = fi.offset + bindLen;
      } else {
        // Rev primer: binds at END of fragment, tail extends RIGHT into next fragment
        bindEnd = fi.end;
        bindStart = fi.end - bindLen;
      }

      const totalStart = p.direction === 'forward'
        ? Math.max(0, bindStart - tailLen)
        : bindStart;
      const totalEnd = p.direction === 'forward'
        ? bindEnd
        : Math.min(fullSeq.length, bindEnd + tailLen);

      const label = p.name.match(/^[A-Za-z]+\d+/)?.[0] || p.name.slice(0, 8);

      return {
        name: p.name, label,
        start: totalStart, end: totalEnd,
        bindStart, bindEnd,
        direction: p.direction,
        tm: p.tmBinding,
      };
    }).filter(Boolean);
  }, [primers, fragments, fullSeq.length]);

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

          {/* Domain bar */}
          {effectiveMode === 'domains' && hasDomains && (
            <div className="mb-3">
              <div className="flex h-8 rounded overflow-hidden border">
                {selFrag.domains.map((d, i) => {
                  const totalAA = Math.ceil(displaySeq.length / 3);
                  const widthPct = Math.max(3, ((d.endAA - d.startAA + 1) / (totalAA || 1)) * 100);
                  return (
                    <div key={i} style={{ width: `${widthPct}%`, backgroundColor: d.color || DOMAIN_COLORS[d.type] }}
                      className="flex items-center justify-center text-[9px] text-white font-medium truncate px-1 border-r border-white/30 last:border-0"
                      title={`${d.name}: ${d.startAA}–${d.endAA} а.о.`}>
                      {widthPct > 8 ? `${d.name} (${d.endAA - d.startAA + 1})` : d.name}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Sequence display */}
          <div className="font-mono max-h-[400px] overflow-y-auto bg-gray-50 p-3 rounded">
            {lines.map(line => {
              const lineStart = line.pos - 1;
              const lineEnd = lineStart + line.seq.length;
              const linePrimers = selected === 'all' && effectiveMode === 'dna'
                ? primerRegions.filter(p => p.start < lineEnd && p.end > lineStart) : [];
              const fwdPrimers = linePrimers.filter(p => p.direction === 'forward');
              const revPrimers = linePrimers.filter(p => p.direction === 'reverse');

              const renderTrack = (p) => {
                const s = Math.max(p.start - lineStart, 0);
                const e = Math.min(p.end - lineStart, line.seq.length);
                if (e - s <= 0) return null;
                const bs = Math.max(p.bindStart - lineStart, s);
                const be = Math.min(p.bindEnd - lineStart, e);
                const isFwd = p.direction === 'forward';
                const c = isFwd ? '#2563eb' : '#dc2626';
                const tailBefore = isFwd ? bs - s : 0;
                const bindW = be - bs;
                const tailAfter = isFwd ? 0 : e - be;
                return (
                  <div key={p.name} className="relative h-5" title={p.name}>
                    <span className="absolute text-[8px] whitespace-nowrap font-medium" style={{ left: `${s}ch`, top: 0, color: c }}>
                      {isFwd ? '→' : '←'}{p.label} {p.tm}°
                    </span>
                    <div className="absolute bottom-0 flex items-center" style={{ left: `${s}ch` }}>
                      {!isFwd && <div className="w-0 h-0 mr-px" style={{ borderTop: '3px solid transparent', borderBottom: '3px solid transparent', borderRight: `4px solid ${c}` }} />}
                      {tailBefore > 0 && <div style={{ width: `${tailBefore}ch`, backgroundColor: c, opacity: 0.25 }} className="h-1.5 rounded-l-full" />}
                      {bindW > 0 && <div style={{ width: `${bindW}ch`, backgroundColor: c }} className="h-1.5" />}
                      {tailAfter > 0 && <div style={{ width: `${tailAfter}ch`, backgroundColor: c, opacity: 0.25 }} className="h-1.5 rounded-r-full" />}
                      {isFwd && <div className="w-0 h-0 ml-px" style={{ borderTop: '3px solid transparent', borderBottom: '3px solid transparent', borderLeft: `4px solid ${c}` }} />}
                    </div>
                  </div>
                );
              };

              return (
                <div key={line.pos} className={linePrimers.length > 0 ? 'mb-1' : ''}>
                  {fwdPrimers.length > 0 && <div className="ml-[52px]">{fwdPrimers.map(renderTrack)}</div>}

                  <div className="flex">
                    <span className="text-gray-400 w-[48px] text-right mr-1 select-none shrink-0 text-[11px]">{line.pos}</span>
                    <span className="text-[12px] tracking-[0.5px] text-[#1a1a1a] select-all break-all leading-5">
                      {effectiveMode === 'dna' && selected === 'all'
                        ? line.seq.split('').map((ch, ci) => {
                            const abs = lineStart + ci;
                            const isBoundary = boundaries.has(abs);
                            return (
                              <span key={ci}>
                                {isBoundary && <span className="border-l-2 border-amber-400 pl-px ml-px" />}
                                {ch}
                              </span>
                            );
                          })
                        : effectiveMode === 'dna'
                          ? line.seq.split('').map((ch, ci) => {
                              const aaIdx = Math.floor((lineStart + ci) / 3);
                              const dom = isCDS && selFrag?.domains?.find(d => aaIdx + 1 >= d.startAA && aaIdx + 1 <= d.endAA);
                              return (<span key={ci} style={{
                                borderBottom: dom ? `2px solid ${dom.color || DOMAIN_COLORS[dom.type]}` : 'none' }}>{ch}</span>);
                            })
                          : line.seq.split('').map((aa, ci) => {
                              const aaPos = lineStart + ci + 1;
                              const dom = selFrag?.domains?.find(d => aaPos >= d.startAA && aaPos <= d.endAA);
                              return (<span key={ci} style={{
                                backgroundColor: dom ? (dom.color || DOMAIN_COLORS[dom.type]) + '25' : 'transparent',
                                borderBottom: dom ? `2px solid ${dom.color || DOMAIN_COLORS[dom.type]}` : 'none' }}
                                title={dom ? `${dom.name} — ${aaPos}` : `${aaPos}`}>{aa}</span>);
                            })
                      }
                    </span>
                  </div>

                  {revPrimers.length > 0 && <div className="ml-[52px]">{revPrimers.map(renderTrack)}</div>}
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex items-center gap-5 text-[9px] text-gray-500 mt-2 pt-2 border-t flex-wrap">
            {effectiveMode === 'dna' && primerRegions.length > 0 && (
              <>
                <span className="flex items-center gap-1.5">
                  <span className="flex items-center">
                    <span className="w-2 h-1.5 bg-blue-600 opacity-25 rounded-l-full" />
                    <span className="w-3 h-1.5 bg-blue-600 rounded-r-full" />
                    <span className="w-0 h-0 ml-px" style={{ borderTop: '2px solid transparent', borderBottom: '2px solid transparent', borderLeft: '3px solid #2563eb' }} />
                  </span>
                  → прямой
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="flex items-center">
                    <span className="w-0 h-0 mr-px" style={{ borderTop: '2px solid transparent', borderBottom: '2px solid transparent', borderRight: '3px solid #dc2626' }} />
                    <span className="w-3 h-1.5 bg-red-600 rounded-l-full" />
                    <span className="w-2 h-1.5 bg-red-600 opacity-25 rounded-r-full" />
                  </span>
                  ← обратный
                </span>
                <span className="text-gray-400">сплошной = binding {'·'} полупрозрачный = хвост</span>
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
