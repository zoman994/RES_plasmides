/** SequenceMapView — SnapGene-like double-strand sequence with annotations. */
import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { getFragColor, isMarker } from '../theme';
import { CODON_TABLE } from '../codons';
import { calcTm as simpleTm, gcPercent } from '../tm-calculator';

const COMPLEMENT = { A: 'T', T: 'A', G: 'C', C: 'G', N: 'N' };
const comp = c => COMPLEMENT[c.toUpperCase()] || 'N';
const revComp = s => s.split('').reverse().map(c => comp(c)).join('');
const gcPct = s => gcPercent(s);

const LABEL_WIDTH = 8; // characters reserved for position label (left margin)

export default function SequenceMapView({ fragments, primers = [], circular, onAddCustomPrimer }) {
  const [selection, setSelection] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [toast, setToast] = useState('');
  const containerRef = useRef(null);
  const preRef = useRef(null);
  const [charsPerLine, setCharsPerLine] = useState(80);

  // Measure how many monospace characters fit in the container
  useEffect(() => {
    const measure = () => {
      const el = preRef.current || containerRef.current;
      if (!el) return;
      // Create a hidden span to measure 1ch in the actual font
      const probe = document.createElement('span');
      probe.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;font:inherit';
      probe.textContent = '0'.repeat(100);
      el.appendChild(probe);
      const chW = probe.getBoundingClientRect().width / 100;
      el.removeChild(probe);
      if (chW <= 0) return;
      const available = el.clientWidth - 24; // padding
      const fitChars = Math.floor(available / chW) - LABEL_WIDTH;
      const rounded = Math.floor(fitChars / 10) * 10; // round to nearest 10
      setCharsPerLine(Math.max(30, Math.min(200, rounded)));
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Build full construct sequence + feature map
  const { fullSeq, features } = useMemo(() => {
    let seq = '';
    const feats = [];
    fragments.forEach((f, i) => {
      const start = seq.length;
      seq += f.sequence || '';
      const end = seq.length;
      const color = f.customColor || (isMarker(f.name) ? '#F0E442' : getFragColor(f.type, i));
      feats.push({ id: f.id || i, name: f.name, type: f.type, start, end, color, strand: f.strand || 1 });
    });
    return { fullSeq: seq, features: feats };
  }, [fragments]);

  // Build primer positions on the full construct sequence
  const primerPositions = useMemo(() => {
    if (!primers.length || !fullSeq) return [];
    const positions = [];
    const seqUpper = fullSeq.toUpperCase();

    primers.forEach(p => {
      const bind = (p.bindingSequence || p.sequence || '').toUpperCase();
      if (!bind || bind.length < 10) return;

      if (p.direction === 'forward') {
        // Search forward primer binding on sense strand
        let idx = seqUpper.indexOf(bind);
        while (idx >= 0) {
          positions.push({ ...p, start: idx, end: idx + bind.length });
          idx = seqUpper.indexOf(bind, idx + 1);
        }
      } else {
        // Reverse primer binds to antisense — search its RC on sense strand
        const rc = revComp(bind);
        let idx = seqUpper.indexOf(rc);
        while (idx >= 0) {
          positions.push({ ...p, start: idx, end: idx + rc.length });
          idx = seqUpper.indexOf(rc, idx + 1);
        }
      }
    });

    // Deduplicate by name+start
    const seen = new Set();
    return positions.filter(p => {
      const key = `${p.name}_${p.start}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [fullSeq, primers]);

  const lines = useMemo(() => {
    const result = [];
    for (let i = 0; i < fullSeq.length; i += charsPerLine) {
      result.push({ start: i, seq: fullSeq.slice(i, i + charsPerLine) });
    }
    return result;
  }, [fullSeq, charsPerLine]);

  // Selection handlers
  const posFromEvent = useCallback((e, lineStart) => {
    const span = e.currentTarget;
    const rect = span.getBoundingClientRect();
    const charW = rect.width / span.textContent.length;
    const ci = Math.min(Math.floor((e.clientX - rect.left) / charW), span.textContent.length - 1);
    return lineStart + Math.max(0, ci);
  }, []);

  const onMouseDown = useCallback((e, lineStart) => {
    const pos = posFromEvent(e, lineStart);
    setSelection({ start: pos, end: pos });
    setDragging(true);
  }, [posFromEvent]);

  const onMouseMove = useCallback((e, lineStart) => {
    if (!dragging) return;
    const pos = posFromEvent(e, lineStart);
    setSelection(prev => prev ? { start: prev.start, end: pos } : null);
  }, [dragging, posFromEvent]);

  useEffect(() => {
    const up = () => setDragging(false);
    document.addEventListener('mouseup', up);
    return () => document.removeEventListener('mouseup', up);
  }, []);

  // Normalized selection (start <= end)
  const sel = selection ? { start: Math.min(selection.start, selection.end), end: Math.max(selection.start, selection.end) } : null;
  const selLen = sel ? sel.end - sel.start + 1 : 0;
  const selSeq = sel ? fullSeq.slice(sel.start, sel.end + 1) : '';

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const createPrimer = useCallback((direction) => {
    if (!sel || selLen < 15 || selLen > 60) { showToast(`Выделите 15-60 п.н. (сейчас ${selLen})`); return; }
    const seq = direction === 'forward' ? selSeq : revComp(selSeq);
    const primer = {
      name: `custom_${direction === 'forward' ? 'fwd' : 'rev'}_${Date.now().toString(36).slice(-4)}`,
      sequence: seq.toUpperCase(), bindingSequence: seq.toUpperCase(), tailSequence: '',
      direction, start: sel.start, end: sel.end, tmBinding: simpleTm(selSeq), isCustom: true,
    };
    onAddCustomPrimer?.(primer);
    showToast(`${direction === 'forward' ? '→' : '←'} ${primer.name} · Tm ${primer.tmBinding}°C`);
  }, [sel, selLen, selSeq, onAddCustomPrimer]);

  // Keyboard shortcuts
  const handleKeyDown = useCallback((e) => {
    if (e.key === '?' && !e.ctrlKey) { setShowShortcuts(v => !v); e.preventDefault(); return; }
    if (e.key === 'Escape') { setSelection(null); setShowShortcuts(false); return; }
    if (sel) {
      if ((e.key === 'p' || e.key === 'P' || e.key === 'з' || e.key === 'З') && !e.ctrlKey) { createPrimer('forward'); e.preventDefault(); }
      if ((e.key === 'r' || e.key === 'R' || e.key === 'к' || e.key === 'К') && !e.ctrlKey) { createPrimer('reverse'); e.preventDefault(); }
      if (e.ctrlKey && e.key === 'c') { navigator.clipboard.writeText(selSeq.toUpperCase()); showToast(`Скопировано ${selLen} п.н.`); }
    }
  }, [sel, selLen, selSeq, createPrimer]);

  if (!fullSeq) return <div className="text-gray-400 text-xs text-center py-8">Нет последовательности</div>;

  return (
    <div ref={containerRef} className="overflow-auto flex-1 outline-none" tabIndex={0} onKeyDown={handleKeyDown}>
      {/* All content in one pre — guarantees ch units match rendered characters */}
      <pre ref={preRef} className="p-3 font-mono text-[11px] leading-[1.4] m-0 whitespace-pre" style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' }}>
        {lines.map(line => {
          const lineEnd = line.start + line.seq.length;

          // Features on this line
          const lineFeats = features.filter(f => f.start < lineEnd && f.end > line.start);
          // Primers on this line
          const linePrimers = primerPositions.filter(p => p.start < lineEnd && p.end > line.start);

          return (
            <div key={line.start} className="mb-3">
              {/* Ruler — tick marks every 10bp */}
              <div className="text-[8px] text-gray-300 select-none" style={{ paddingLeft: `${LABEL_WIDTH}ch` }}>
                {Array.from({ length: Math.ceil(line.seq.length / 10) }, (_, gi) => {
                  const tickPos = line.start + gi * 10 + 10;
                  return (
                    <span key={gi} className="inline-block text-center" style={{ width: `${Math.min(10, line.seq.length - gi * 10)}ch` }}>
                      {tickPos <= line.start + line.seq.length ? tickPos : ''}
                    </span>
                  );
                })}
              </div>

              {/* Feature bars — ch-based positioning, aligned with sequence text */}
              {lineFeats.length > 0 && (
                <div className="relative h-4 mb-0.5" style={{ paddingLeft: `${LABEL_WIDTH}ch` }}>
                  {lineFeats.map(f => {
                    const left = Math.max(0, f.start - line.start);
                    const right = Math.min(line.seq.length, f.end - line.start);
                    return (
                      <div key={f.id} className="absolute h-3.5 rounded-sm text-[7px] text-white px-0.5 flex items-center truncate"
                        style={{ left: `${LABEL_WIDTH + left}ch`, width: `${right - left}ch`, backgroundColor: f.color, minWidth: 4 }}
                        title={`${f.name} (${f.type}) ${f.start + 1}..${f.end}`}>
                        {(right - left) > 5 ? f.name : ''}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Sense strand 5'→3' */}
              <div>
                <span className="inline-block text-right text-gray-400 select-none text-[9px]" style={{ width: `${LABEL_WIDTH}ch` }}>{line.start + 1}</span>
                <span className="select-none cursor-text"
                  onMouseDown={e => onMouseDown(e, line.start)}
                  onMouseMove={e => onMouseMove(e, line.start)}>
                  {line.seq.split('').map((nt, ci) => {
                    const pos = line.start + ci;
                    const inSel = sel && pos >= sel.start && pos <= sel.end;
                    const fwdP = linePrimers.find(p => p.direction === 'forward' && pos >= p.start && pos < p.end);
                    return (
                      <span key={ci} className={inSel ? 'bg-blue-300 text-white' : fwdP ? 'bg-blue-50' : ''}>
                        {nt}
                      </span>
                    );
                  })}
                </span>
              </div>

              {/* Antisense strand 3'→5' */}
              <div>
                <span className="inline-block" style={{ width: `${LABEL_WIDTH}ch` }} />
                <span className="text-gray-400 select-none cursor-text"
                  onMouseDown={e => onMouseDown(e, line.start)}
                  onMouseMove={e => onMouseMove(e, line.start)}>
                  {line.seq.split('').map((nt, ci) => {
                    const pos = line.start + ci;
                    const inSel = sel && pos >= sel.start && pos <= sel.end;
                    const revP = linePrimers.find(p => p.direction === 'reverse' && pos >= p.start && pos < p.end);
                    return (
                      <span key={ci} className={inSel ? 'bg-blue-200' : revP ? 'bg-red-50' : ''}>
                        {comp(nt)}
                      </span>
                    );
                  })}
                </span>
              </div>

              {/* Amino acid translation — under CDS regions */}
              {lineFeats.some(f => f.type === 'CDS' || f.type === 'gene') && (
                <div>
                  <span className="inline-block" style={{ width: `${LABEL_WIDTH}ch` }} />
                  <span className="select-none">
                    {line.seq.split('').map((_, ci) => {
                      const absPos = line.start + ci;
                      const cds = lineFeats.find(f => (f.type === 'CDS' || f.type === 'gene') && absPos >= f.start && absPos < f.end);
                      if (!cds) return <span key={ci} className="inline-block" style={{ width: '1ch' }}>{' '}</span>;
                      const posInCDS = absPos - cds.start;
                      if (posInCDS % 3 === 1) {
                        const codonStart = cds.start + posInCDS - 1;
                        const codon = fullSeq.slice(codonStart, codonStart + 3).toUpperCase();
                        const aa = CODON_TABLE[codon] || '';
                        const aaIdx = Math.floor(posInCDS / 3);
                        return (
                          <span key={ci}
                            className={`inline-block text-center text-[9px] font-medium
                              ${aa === 'M' && aaIdx === 0 ? 'text-green-600 font-bold' :
                                aa === '*' ? 'text-red-600 font-bold' :
                                'text-purple-400'}`}
                            style={{ width: '1ch' }}
                            title={`${aa} #${aaIdx + 1} (${codon})`}>
                            {aa}
                          </span>
                        );
                      }
                      return <span key={ci} className="inline-block" style={{ width: '1ch' }}>{' '}</span>;
                    })}
                  </span>
                </div>
              )}

              {/* Primer tracks — category-aware: assembly(blue/red), custom(green), verification(gray) */}
              {linePrimers.length > 0 && (() => {
                const sorted = [...linePrimers].sort((a, b) => {
                  const catOrder = { assembly: 0, custom: 1, verification: 2 };
                  return (catOrder[a.category] || 0) - (catOrder[b.category] || 0) || (a.direction === 'forward' ? -1 : 1);
                });
                return (
                  <div className="relative" style={{ height: sorted.length * 14 + 2, paddingLeft: `${LABEL_WIDTH}ch` }}>
                    {sorted.map((p, pi) => {
                      const barStart = Math.max(0, p.start - line.start);
                      const barEnd = Math.min(line.seq.length, p.end - line.start);
                      const cat = p.category || 'assembly';
                      const isFwd = p.direction === 'forward';
                      const color = cat === 'custom' ? '#16a34a' : cat === 'verification' ? '#6b7280'
                        : isFwd ? '#2563eb' : '#dc2626';
                      const dashed = cat === 'custom';
                      const label = (p.name || '').replace(/^[A-Z]{2}\d{3}_/, '');
                      return (
                        <div key={pi} className="absolute flex items-center" style={{ left: `${barStart}ch`, width: `${barEnd - barStart}ch`, top: pi * 14 }}>
                          {!isFwd && <div className="w-0 h-0 border-t-[3px] border-b-[3px] border-r-[5px] border-transparent" style={{ borderRightColor: color }} />}
                          <div className={`h-1.5 flex-1 ${isFwd ? 'rounded-l-full' : 'rounded-r-full'}`}
                            style={{ backgroundColor: color, backgroundImage: dashed ? `repeating-linear-gradient(90deg, ${color} 0 4px, transparent 4px 6px)` : 'none' }} />
                          {isFwd && <div className="w-0 h-0 border-t-[3px] border-b-[3px] border-l-[5px] border-transparent" style={{ borderLeftColor: color }} />}
                          <span className="text-[7px] ml-0.5 whitespace-nowrap truncate max-w-[120px]" style={{ color }}>
                            {label} {p.tmBinding || ''}°{cat === 'custom' ? ' ✎' : ''}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          );
        })}
      </pre>

      {/* Selection info bar */}
      {sel && selLen > 0 && (
        <div className="sticky bottom-0 bg-gray-900 text-white px-4 py-1.5 flex items-center gap-4 text-[10px] z-10 rounded-b-xl">
          <span>{sel.start + 1}..{sel.end + 1} ({selLen} п.н.)</span>
          <span>Tm: {simpleTm(selSeq)}°C</span>
          <span>GC: {gcPct(selSeq)}%</span>
          <div className="flex gap-1.5 ml-auto">
            <button onClick={() => createPrimer('forward')}
              className="bg-blue-600 px-2 py-0.5 rounded hover:bg-blue-700">{'→'} Прямой (P)</button>
            <button onClick={() => createPrimer('reverse')}
              className="bg-red-600 px-2 py-0.5 rounded hover:bg-red-700">{'←'} Обратный (R)</button>
            <button onClick={() => { navigator.clipboard.writeText(selSeq.toUpperCase()); showToast('Скопировано'); }}
              className="bg-gray-700 px-2 py-0.5 rounded hover:bg-gray-600">Копировать</button>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-12 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-xs px-4 py-2 rounded-lg shadow-lg z-50">
          {toast}
        </div>
      )}

      {/* Shortcuts help */}
      {showShortcuts && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center" onClick={() => setShowShortcuts(false)}>
          <div className="bg-white rounded-xl shadow-2xl p-5 max-w-sm" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-bold mb-3">Горячие клавиши</h3>
            <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11px]">
              {[
                ['P', '→ Прямой праймер из выделения'],
                ['R', '← Обратный праймер из выделения'],
                ['Ctrl+C', 'Копировать ДНК'],
                ['Esc', 'Снять выделение'],
                ['?', 'Эта справка'],
              ].map(([key, desc]) => (
                <><kbd key={key} className="bg-gray-100 rounded px-1.5 py-0.5 font-mono text-[10px] text-center">{key}</kbd>
                <span key={desc}>{desc}</span></>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
