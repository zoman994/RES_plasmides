/**
 * SequencePreview — unified sequence + annotation + amino acid viewer.
 *
 * All rows inherit font-size from <pre> (10px mono). 1ch = same width everywhere.
 * Region/detail bars use height + overflow:hidden to appear smaller visually.
 */
import { useEffect, useRef, useState } from 'react';
import { ANNOTATION_COLORS } from '../auto-annotate';
import { CODON_TABLE } from '../codons';
import ContextMenu from './ContextMenu';

const LINE_WIDTH = 60;
const LABEL_W = 7;
const CDS_TYPES = new Set(['CDS', 'gene', 'marker']);

// 1ch grid cell — inherits font-size from <pre>, so width is consistent
const CH = { display: 'inline-block', width: '1ch', textAlign: 'center' };
const LABEL_STYLE = { display: 'inline-block', width: LABEL_W + 'ch', textAlign: 'right', marginRight: '1ch' };

export default function SequencePreview({
  sequence = '',
  annotations = [],
  onAnnotationClick,
  selectedAnnotation,
  maxHeight = '200px',
}) {
  const containerRef = useRef(null);
  const selectedRef = useRef(null);
  const [ctxMenu, setCtxMenu] = useState(null);

  useEffect(() => {
    if (selectedRef.current) {
      selectedRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [selectedAnnotation]);

  if (!sequence || sequence.length < 3) return null;

  const seq = sequence.toUpperCase();
  const regions = annotations.filter(a => a.level === 'region');
  const details = annotations.filter(a => a.level === 'detail');
  const points = annotations.filter(a => a.level === 'point');

  // Intron positions — lowercase + hatching, skip AA translation
  const introns = annotations.filter(a => a.type === 'intron' && a.level === 'detail');
  const isIntron = (pos) => introns.some(intr => pos >= intr.start && pos < intr.end);

  const lines = [];
  for (let i = 0; i < seq.length; i += LINE_WIDTH) {
    lines.push({ start: i, seq: seq.slice(i, i + LINE_WIDTH) });
  }

  return (
    <pre ref={containerRef}
      className="border rounded bg-white overflow-y-auto font-mono text-[10px] leading-[14px] mb-3 m-0 p-1"
      style={{ maxHeight, whiteSpace: 'pre' }}
      onContextMenu={e => {
        e.preventDefault();
        const sel = window.getSelection()?.toString() || '';
        setCtxMenu({ x: e.clientX, y: e.clientY, selection: sel });
      }}>
      {lines.map(line => {
        const lineEnd = line.start + line.seq.length;
        const lineLen = line.seq.length;

        const lineRegions = regions.filter(r => r.start < lineEnd && r.end > line.start);
        const lineDetailsSpan = details.filter(d => d.start < lineEnd && d.end > line.start);
        const linePoints = points.filter(p => p.start >= line.start && p.start < lineEnd);

        const regMap = new Array(lineLen).fill(null);
        lineRegions.forEach(r => {
          const from = Math.max(0, r.start - line.start);
          const to = Math.min(lineLen, r.end - line.start);
          for (let k = from; k < to; k++) regMap[k] = r;
        });

        const selStartsHere = selectedAnnotation &&
          selectedAnnotation.start >= line.start && selectedAnnotation.start < lineEnd;

        const hasCDS = lineRegions.some(r => CDS_TYPES.has(r.type));

        // Border on every 10th position (for ruler alignment)
        const grid10 = (pos) => ((pos + 1) % 10 === 0) ? { borderRight: '1px solid #E5E7EB' } : undefined;

        return (
          <div key={line.start} className="mb-2" ref={selStartsHere ? selectedRef : undefined}>
            {/* ── Ruler ── */}
            <div style={{ height: '10px', lineHeight: '10px', color: '#9CA3AF', marginBottom: '4px' }} className="select-none">
              <span style={LABEL_STYLE}>{'\u00A0'}</span>
              {line.seq.split('').map((_, ci) => {
                const pos = line.start + ci + 1; // 1-based
                const isTen = pos % 10 === 0;
                const isFive = pos % 5 === 0 && !isTen;
                return (
                  <span key={ci} style={{ ...CH, position: 'relative', overflow: 'visible' }}>
                    {isTen && (
                      <span style={{
                        position: 'absolute', bottom: '0', left: '50%', transform: 'translateX(-50%)',
                        whiteSpace: 'nowrap', fontSize: '8px', lineHeight: '1',
                      }}>{pos}</span>
                    )}
                    {isFive && '\u00B7'}
                  </span>
                );
              })}
            </div>

            {/* ── Region label (text, not filled bar) ── */}
            {lineRegions.length > 0 && (
              <div style={{ height: '12px', lineHeight: '12px' }} className="select-none">
                <span style={LABEL_STYLE}>{'\u00A0'}</span>
                {(() => {
                  const labels = [];
                  let lastEnd = 0;
                  lineRegions.forEach(r => {
                    const from = Math.max(0, r.start - line.start);
                    const to = Math.min(lineLen, r.end - line.start);
                    if (from > lastEnd) {
                      labels.push(<span key={`sp-${from}`} style={{ display: 'inline-block', width: `${from - lastEnd}ch` }} />);
                    }
                    const span = to - from;
                    const color = ANNOTATION_COLORS[r.type] || '#999';
                    const isSel = selectedAnnotation && r === selectedAnnotation;
                    const label = span > 16 ? `${r.name} (${r.end - r.start})`
                      : span > 6 ? r.name
                      : span > 3 ? r.name.slice(0, span - 1)
                      : '';
                    labels.push(
                      <span key={r.name + from}
                        style={{
                          display: 'inline-block', width: `${span}ch`,
                          color, fontSize: '9px',
                          fontWeight: isSel ? 'bold' : '500',
                          textDecoration: isSel ? 'underline' : 'none',
                          cursor: 'pointer', overflow: 'hidden', whiteSpace: 'nowrap',
                        }}
                        onClick={() => onAnnotationClick?.(r)}
                        title={`${r.name} (${r.type}) ${r.start + 1}..${r.end}`}>
                        {label}
                      </span>
                    );
                    lastEnd = to;
                  });
                  return labels;
                })()}
              </div>
            )}

            {/* ── Color strip (thin 3px bar per region + ▼ point markers) ── */}
            {lineRegions.length > 0 && (
              <div style={{ height: '4px', lineHeight: '4px', marginBottom: '1px' }}>
                <span style={LABEL_STYLE}>{'\u00A0'}</span>
                {line.seq.split('').map((_, ci) => {
                  const pos = line.start + ci;
                  const ann = regMap[ci];
                  const prev = ci > 0 ? regMap[ci - 1] : null;
                  const next = ci < lineLen - 1 ? regMap[ci + 1] : null;
                  const isStart = ann && (!prev || prev !== ann);
                  const isEnd = ann && (!next || next !== ann);
                  const isSel = ann && selectedAnnotation && ann === selectedAnnotation;
                  const color = ann ? (ANNOTATION_COLORS[ann.type] || '#999') : 'transparent';
                  const pointHere = linePoints.find(p => p.start === pos);
                  return (
                    <span key={ci} style={{
                      ...CH,
                      height: isSel ? '5px' : '3px',
                      backgroundColor: ann ? color : 'transparent',
                      borderRadius: `${isStart ? '1.5px' : '0'} ${isEnd ? '1.5px' : '0'} ${isEnd ? '1.5px' : '0'} ${isStart ? '1.5px' : '0'}`,
                      cursor: ann ? 'pointer' : 'default',
                      position: 'relative',
                    }}
                    onClick={() => ann && onAnnotationClick?.(ann)}
                    title={ann ? `${ann.name} (${ann.type}) ${ann.start + 1}..${ann.end}` : undefined}>
                      {pointHere && (
                        <span style={{
                          position: 'absolute', top: '-3px', left: '50%', transform: 'translateX(-50%)',
                          fontSize: '6px', color: ANNOTATION_COLORS[pointHere.type] || '#333',
                          lineHeight: '1', pointerEvents: 'none',
                        }}>&#x25BC;</span>
                      )}
                    </span>
                  );
                })}
              </div>
            )}

            {/* ── Sense strand ── */}
            <div>
              <span className="text-gray-400 select-none" style={LABEL_STYLE}>
                {String(line.start + 1)}
              </span>
              {line.seq.split('').map((nt, ci) => {
                const pos = line.start + ci;
                const ann = regMap[ci];
                const isIntr = isIntron(pos);
                const isSel = ann && selectedAnnotation && ann === selectedAnnotation;
                const bgColor = ann ? (ANNOTATION_COLORS[ann.type] || '#999') : null;

                // Detail annotation at this position (signal_peptide, tag, etc.)
                const det = lineDetailsSpan.find(d => pos >= d.start && pos < d.end);
                const detColor = det ? (ANNOTATION_COLORS[det.type] || null) : null;

                let style = { ...CH, ...grid10(pos) };
                if (isIntr && bgColor) {
                  style.background = `repeating-linear-gradient(45deg, ${bgColor}08 0px, ${bgColor}08 2px, transparent 2px, transparent 6px)`;
                } else if (detColor) {
                  style.backgroundColor = detColor + '26';
                } else if (bgColor) {
                  style.backgroundColor = bgColor + (isSel ? '30' : '10');
                }

                return (
                  <span key={ci} style={style}>
                    {isIntr ? nt.toLowerCase() : nt}
                  </span>
                );
              })}
            </div>

            {/* ── Amino acids (CDS only, exon bases only) ── */}
            {hasCDS && (() => {
              // Build exon-only codon map for each CDS region on this line
              // so that AA translation ignores introns
              const aaMap = new Array(lineLen).fill(null);
              lineRegions.filter(r => CDS_TYPES.has(r.type)).forEach(region => {
                // Collect exon bases in this region up to lineEnd
                const exonBases = [];
                for (let p = region.start; p < Math.min(region.end, lineEnd); p++) {
                  if (!isIntron(p)) exonBases.push(p);
                }
                // For each exon base on this line, compute AA from exon-only codon index
                exonBases.forEach((p, exonIdx) => {
                  if (p < line.start || p >= lineEnd) return;
                  const ci = p - line.start;
                  if (exonIdx % 3 !== 1) return; // middle of codon
                  // Codon = 3 consecutive exon bases
                  const codonPositions = exonBases.slice(exonIdx - 1, exonIdx + 2);
                  if (codonPositions.length < 3) return;
                  const codon = codonPositions.map(cp => seq[cp]).join('');
                  const aa = CODON_TABLE[codon] || '?';
                  const aaIdx = Math.floor(exonIdx / 3);
                  const totalExonBases = (() => {
                    let count = 0;
                    for (let p2 = region.start; p2 < region.end; p2++) {
                      if (!isIntron(p2)) count++;
                    }
                    return count;
                  })();
                  const totalCodons = Math.floor(totalExonBases / 3);
                  const isStop = aa === '*';
                  const isPremature = isStop && aaIdx < totalCodons - 1;
                  aaMap[ci] = { aa, aaIdx, isStop, isPremature, codon };
                });
              });

              return (
                <div>
                  <span style={LABEL_STYLE} className="select-none">{'\u00A0'}</span>
                  {line.seq.split('').map((_, ci) => {
                    const pos = line.start + ci;
                    const region = regMap[ci];

                    // Intron positions → blank
                    if (isIntron(pos)) return <span key={ci} style={CH}>{'\u00A0'}</span>;
                    if (!region || !CDS_TYPES.has(region.type)) return <span key={ci} style={CH}>{'\u00A0'}</span>;

                    const entry = aaMap[ci];
                    if (!entry) return <span key={ci} style={CH}>{'\u00A0'}</span>;

                    const { aa, aaIdx, isStop, isPremature, codon } = entry;
                    const color = isPremature ? '#dc2626' :
                      isStop ? '#ef4444' :
                      aa === 'M' && aaIdx === 0 ? '#16a34a' :
                      '#a855f6';
                    const bg = isPremature ? '#fee2e2' : undefined;
                    const bold = isPremature || isStop || (aa === 'M' && aaIdx === 0);

                    return (
                      <span key={ci}
                        style={{ ...CH, color, fontWeight: bold ? 'bold' : undefined, backgroundColor: bg }}
                        title={`${aa} #${aaIdx + 1} (${codon})`}>
                        {aa}
                      </span>
                    );
                  })}
                </div>
              );
            })()}

            {/* ── AA numbering (CDS only, exon-aware) ── */}
            {hasCDS && (
              <div className="select-none" style={{ color: '#9ca3af' }}>
                <span style={LABEL_STYLE}>{'\u00A0'}</span>
                {line.seq.split('').map((_, ci) => {
                  const pos = line.start + ci;
                  const region = regMap[ci];

                  if (isIntron(pos)) return <span key={ci} style={CH}>{'\u00A0'}</span>;
                  if (!region || !CDS_TYPES.has(region.type)) {
                    return <span key={ci} style={CH}>{'\u00A0'}</span>;
                  }

                  // Count exon bases before this position to get correct AA number
                  let exonCount = 0;
                  for (let p = region.start; p < pos; p++) {
                    if (!isIntron(p)) exonCount++;
                  }
                  if (exonCount % 3 !== 1) return <span key={ci} style={CH}>{'\u00A0'}</span>;

                  const aaIdx = Math.floor(exonCount / 3) + 1;
                  const show = aaIdx === 1 || aaIdx % 5 === 0;
                  return <span key={ci} style={CH}>{show ? aaIdx : '\u00A0'}</span>;
                })}
              </div>
            )}
          </div>
        );
      })}
      {ctxMenu && (
        <ContextMenu
          position={{ x: ctxMenu.x, y: ctxMenu.y }}
          onClose={() => setCtxMenu(null)}
          items={[
            { icon: '\uD83D\uDCCB', label: 'Копировать выделенное',
              disabled: !ctxMenu.selection,
              onClick: () => navigator.clipboard.writeText(ctxMenu.selection) },
            { icon: '\uD83D\uDCCB', label: 'Копировать всю последовательность',
              onClick: () => navigator.clipboard.writeText(seq) },
          ]}
        />
      )}
    </pre>
  );
}
