/**
 * SequencePane — read-only double-strand sequence view for an assembly.
 *
 * Rendered as the bottom pane of <PlasmidWorkspace>. Given an assembly's
 * `fragments` array it builds the concatenated plasmid sequence via
 * `buildPlasmidSequence`, then renders:
 *   - colored sense/antisense strands with region backgrounds
 *   - region header labels above their start line
 *   - RE cut markers (▼) under the strands for unique/double cutters
 *   - AA translation purple strip under CDS/gene regions (exon-aware)
 *
 * Synced cursor: when `selectedRegionId` changes the pane scrolls the matching
 * line into view; clicks on a nucleotide toggle `onSelectRegion(region.id)`.
 *
 * READ-ONLY in Map-WS-1. No mutation popups, no text-selection keyboards.
 * Inline mutations land in Map-WS-2.
 */
import { useMemo, useRef, useEffect } from 'react';
import { getRegions } from '../annotation-model';
import { featureColor, FEATURE_STROKE } from '../feature-palette';
import { CODON_TABLE } from '../codons';
import { scanAllSites } from '../restriction-db';
import { buildPlasmidSequence } from '../plasmid-sequence';

const CHARS_PER_LINE = 80;
const COMPLEMENT = { A: 'T', T: 'A', G: 'C', C: 'G', N: 'N' };

/**
 * @param {Object} props
 * @param {Array} props.fragments — assembly fragments
 * @param {Array} [props.primers] — reserved for Map-WS-2 primer overlays
 * @param {string|null} props.selectedRegionId
 * @param {Function} props.onSelectRegion — (regionId|null) => void
 */
export default function SequencePane({ fragments, primers: _primers, selectedRegionId, onSelectRegion }) {
  const containerRef = useRef(null);

  const { sequence: seq, annotations } = useMemo(
    () => buildPlasmidSequence(fragments || []),
    [fragments],
  );
  const totalBp = seq.length;

  const regions = useMemo(() => getRegions(annotations), [annotations]);

  // Intron annotations for hatched rendering + AA skip.
  const introns = useMemo(
    () => (annotations || []).filter(a => a.type === 'intron' && a.level === 'detail'),
    [annotations],
  );
  const isIntron = (pos) => introns.some(intr => pos >= intr.start && pos < intr.end);
  const regionAt = (pos) => regions.find(r => pos >= r.start && pos < r.end);

  // RE cut sites for markers (skip on large sequences to stay snappy).
  const reCutMap = useMemo(() => {
    if (!seq || seq.length > 50000) return new Map();
    const sites = scanAllSites(seq);
    const map = new Map();
    for (const s of sites) {
      if (s.cutCount > 2) continue; // only unique / double cutters
      for (const p of s.positions) {
        const pos = p.position;
        if (!map.has(pos)) map.set(pos, []);
        map.get(pos).push({ enzyme: s.enzyme, strand: p.strand });
      }
    }
    return map;
  }, [seq]);

  // Split sequence into 80-char lines.
  const seqLines = useMemo(() => {
    const lines = [];
    for (let i = 0; i < seq.length; i += CHARS_PER_LINE) {
      lines.push({ start: i, seq: seq.slice(i, i + CHARS_PER_LINE) });
    }
    return lines;
  }, [seq]);

  // Synced cursor: scroll the line for the selected region into view.
  useEffect(() => {
    if (!selectedRegionId || !containerRef.current) return;
    const region = regions.find(r => r.id === selectedRegionId);
    if (!region) return;
    const targetLine = Math.floor(region.start / CHARS_PER_LINE);
    const lineEl = containerRef.current.querySelector(`[data-line="${targetLine}"]`);
    if (lineEl) lineEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selectedRegionId, regions]);

  const handleNucleotideClick = (region) => {
    if (!region || !onSelectRegion) return;
    onSelectRegion(region.id === selectedRegionId ? null : region.id);
  };

  if (totalBp === 0) {
    return (
      <div className="h-full flex items-center justify-center text-[11px] text-gray-400 bg-white">
        Пустая сборка — добавьте фрагменты для просмотра последовательности
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white overflow-hidden" data-testid="sequence-pane">
      <div className="px-4 py-1.5 text-[10px] text-gray-500 font-semibold uppercase tracking-wider border-b bg-gray-50 shrink-0">
        Последовательность ({totalBp.toLocaleString()} п.н.)
      </div>
      <div className="flex-1 overflow-y-auto" ref={containerRef}>
        <div className="px-4 py-3 font-mono text-[11px] leading-[18px]">
          {seqLines.map((line, lineIdx) => {
            const lineEnd = line.start + line.seq.length;

            // Region header labels that start on this line.
            const lineRegions = regions.filter(r => r.start >= line.start && r.start < lineEnd);

            // CDS/gene regions overlapping this line for AA row.
            const lineCDS = regions.filter(r =>
              (r.type === 'CDS' || r.type === 'gene') && r.start < lineEnd && r.end > line.start
            );

            return (
              <div key={line.start} className="mb-2" data-line={lineIdx}>
                {lineRegions.map(r => {
                  const rColor = featureColor(r.type, r.name);
                  return (
                    <div key={r.id} className="text-[9px] font-sans font-medium mt-1 mb-0.5 flex items-center gap-1"
                      style={{ color: FEATURE_STROKE }}>
                      <span className="w-2 h-2 rounded-full inline-block"
                        style={{ backgroundColor: rColor, boxShadow: `inset 0 0 0 1px ${FEATURE_STROKE}` }} />
                      {r.name} <span className="text-gray-400 font-normal">({r.end - r.start} п.н.)</span>
                    </div>
                  );
                })}

                <div className="text-[9px] text-gray-300 select-none mb-px">{line.start + 1}</div>

                {/* Sense strand */}
                <div className="whitespace-pre">
                  {line.seq.split('').map((nt, ci) => {
                    const absPos = line.start + ci;
                    const region = regionAt(absPos);
                    const isIntr = isIntron(absPos);
                    const isSel = region && region.id === selectedRegionId;
                    const regionColor = region ? featureColor(region.type, region.name) : null;

                    let bg = 'transparent';
                    let style = {};
                    if (isIntr && regionColor) {
                      style = {
                        background: `repeating-linear-gradient(45deg, ${regionColor}08 0px, ${regionColor}08 2px, transparent 2px, transparent 6px)`,
                      };
                    } else if (regionColor) {
                      bg = regionColor + (isSel ? '58' : '26');
                    }

                    return (
                      <span key={ci}
                        className="inline-block w-[1ch] text-center cursor-default"
                        style={{ backgroundColor: bg, ...style }}
                        title={`${absPos + 1}${region ? ` (${region.name})` : ''}${isIntr ? ' [intron]' : ''}`}
                        onClick={() => handleNucleotideClick(region)}>
                        {isIntr ? nt.toLowerCase() : nt}
                      </span>
                    );
                  })}
                </div>

                {/* Antisense strand */}
                <div className="whitespace-pre text-gray-400">
                  {line.seq.split('').map((nt, ci) => {
                    const absPos = line.start + ci;
                    const region = regionAt(absPos);
                    const isIntr = isIntron(absPos);
                    const isSel = region && region.id === selectedRegionId;
                    const regionColor = region ? featureColor(region.type, region.name) : null;
                    const bg = regionColor && !isIntr ? regionColor + (isSel ? '30' : '12') : 'transparent';
                    const compNt = COMPLEMENT[nt] || 'N';
                    return (
                      <span key={ci} className="inline-block w-[1ch] text-center"
                        style={{ backgroundColor: bg }}>
                        {isIntr ? compNt.toLowerCase() : compNt}
                      </span>
                    );
                  })}
                </div>

                {/* RE cut markers */}
                {reCutMap.size > 0 && (() => {
                  const hasAnyCut = line.seq.split('').some((_, ci) => reCutMap.has(line.start + ci));
                  if (!hasAnyCut) return null;
                  return (
                    <div className="whitespace-pre text-[9px] leading-3">
                      {line.seq.split('').map((_, ci) => {
                        const absPos = line.start + ci;
                        const cuts = reCutMap.get(absPos);
                        if (cuts) {
                          const label = cuts.map(c => c.enzyme).join(', ');
                          return (
                            <span key={ci} className="inline-block w-[1ch] text-center text-red-500 font-bold"
                              title={`${label} @ ${absPos + 1}`}>{'▼'}</span>
                          );
                        }
                        return <span key={ci} className="inline-block w-[1ch]">{' '}</span>;
                      })}
                    </div>
                  );
                })()}

                {/* AA translation under CDS/gene regions (exon-aware). */}
                {lineCDS.length > 0 && (() => {
                  const aaMap = new Array(line.seq.length).fill(null);
                  lineCDS.forEach(cds => {
                    const exonBases = [];
                    for (let p = cds.start; p < Math.min(cds.end, lineEnd); p++) {
                      if (!isIntron(p)) exonBases.push(p);
                    }
                    exonBases.forEach((p, exonIdx) => {
                      if (p < line.start || p >= lineEnd) return;
                      const ci = p - line.start;
                      if (exonIdx % 3 !== 1) return;
                      const codonPositions = exonBases.slice(exonIdx - 1, exonIdx + 2);
                      if (codonPositions.length < 3) return;
                      const codon = codonPositions.map(cp => seq[cp]).join('');
                      const aa = CODON_TABLE[codon] || '?';
                      const aaIdx = Math.floor(exonIdx / 3);
                      aaMap[ci] = { aa, aaIdx, codon };
                    });
                  });
                  return (
                    <div className="whitespace-pre text-purple-400 text-[10px]">
                      {line.seq.split('').map((_, ci) => {
                        const absPos = line.start + ci;
                        if (isIntron(absPos)) return <span key={ci} className="inline-block w-[1ch]">{' '}</span>;
                        const entry = aaMap[ci];
                        if (!entry) return <span key={ci} className="inline-block w-[1ch]">{' '}</span>;
                        const { aa, aaIdx, codon } = entry;
                        return (
                          <span key={ci}
                            className={`inline-block w-[1ch] text-center font-medium ${
                              aa === 'M' && aaIdx === 0 ? 'text-green-600' :
                              aa === '*' ? 'text-red-600' : ''
                            }`}
                            title={`${aa} #${aaIdx + 1} (${codon})`}>
                            {aa}
                          </span>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
