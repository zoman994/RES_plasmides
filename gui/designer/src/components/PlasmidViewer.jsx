/**
 * PlasmidViewer — modal for viewing a plasmid Part.
 *
 * Three sections:
 *   1. Top: LinearFeatureBar — «колбаса» strip across the full sequence,
 *      same component the Importer's SingleInspector mounts. Shown only
 *      when the part actually has annotations (otherwise the strip
 *      reduces to an empty rectangle and adds visual noise).
 *   2. Left: SVG circular map (reuses PlasmidMap) + annotation table
 *      (AnnotationEditor, EDITABLE — biolog needs to delete features
 *      after a linearisation/save round-trip).
 *   3. Bottom: Colored sequence with region backgrounds + AA translation
 *      under CDS regions.
 *
 * Bug-rush #25 (04.05.2026 evening): biolog «после линеаризации
 * плазмиды и сохранения в библиотеку, при открытии фрагмента у него
 * нет колбасы аннотации и фичи не удаляются и в целом как то
 * неполноценно все». Pre-fix the annotation pane was hard-coded
 * `readOnly` and there was no LinearFeatureBar at all — for a
 * linearised backbone (where the circular PlasmidMap is the WRONG
 * visualisation) that left the user with no usable feature view and
 * no way to delete a wrongly-saved annotation. Now the bar surfaces
 * features at a glance and the editor accepts edits / deletes via the
 * `onAnnotationsChange` prop (ModalStack persists via store.updatePart).
 */
import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import PlasmidMap from './PlasmidMap';
import AnnotationEditor from './AnnotationEditor';
import { Icon } from './icons/Icon';
import LinearFeatureBar from './Library/inspector/tabs/LinearFeatureBar';
import { getRegions } from '../annotation-model';
import { ANNOTATION_COLORS } from '../auto-annotate';
import { FEATURE_COLORS } from '../theme';
import { translateDNA, CODON_TABLE } from '../codons';
import { exportGenBank } from '../exports';
import { validateCDS } from '../cds-validation';
import { getCDNA } from '../intron-utils';
import { scanAllSites } from '../restriction-db';
import { useStore } from '../store';

const CHARS_PER_LINE = 80;
const COMPLEMENT = { A: 'T', T: 'A', G: 'C', C: 'G', N: 'N' };

/**
 * @param {Object} props
 * @param {Object} props.part — Part object with sequence, annotations, etc.
 * @param {Function} props.onClose
 * @param {Function} [props.onOpenWizard] — opens PlasmidUseWizard
 * @param {Function} [props.onAnnotationsChange] — `(nextAnnotations) =>
 *   void` writeback for AnnotationEditor edits + deletes. Wired in
 *   ModalStack to `useStore.getState().updatePart(part.id, {
 *   annotations })` so the change persists. Without it the editor
 *   falls back to read-only (legacy behaviour).
 */
export default function PlasmidViewer({ part, onClose, onOpenWizard, onAnnotationsChange }) {
  const [selectedRegionId, setSelectedRegionId] = useState(null);
  const seqContainerRef = useRef(null);

  // Scroll sequence into view when region is selected from annotation table
  useEffect(() => {
    if (!selectedRegionId || !seqContainerRef.current) return;
    const region = regions.find(r => r.id === selectedRegionId);
    if (!region) return;
    const targetLine = Math.floor(region.start / CHARS_PER_LINE);
    const lineEl = seqContainerRef.current.querySelector(`[data-line="${targetLine}"]`);
    if (lineEl) lineEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selectedRegionId]);

  const seq = (part.sequence || '').toUpperCase();
  const regions = useMemo(() => getRegions(part.annotations), [part.annotations]);
  const totalBp = seq.length;

  // CDS validation warnings
  const cdsWarnings = useMemo(() => {
    const warnings = [];
    for (const r of regions) {
      if (r.type !== 'CDS' && r.type !== 'gene') continue;
      const rSeq = seq.slice(r.start, r.end);
      const rw = validateCDS(rSeq);
      if (rw.length > 0) warnings.push({ region: r.name, warnings: rw });
    }
    return warnings;
  }, [regions, seq]);

  // B3: RE cut sites for sequence view markers
  const reCutMap = useMemo(() => {
    if (!seq || seq.length > 50000) return new Map();
    const sites = scanAllSites(seq);
    const map = new Map(); // position → [{ enzyme, strand }]
    for (const s of sites) {
      if (s.cutCount > 2) continue; // only unique/double cutters
      for (const p of s.positions) {
        const pos = p.position;
        if (!map.has(pos)) map.set(pos, []);
        map.get(pos).push({ enzyme: s.enzyme, strand: p.strand });
      }
    }
    return map;
  }, [seq]);

  // Build fragments array for PlasmidMap — ALWAYS one fragment = whole plasmid.
  // PlasmidMap draws sub-arcs from annotations. Avoids overlapping region chaos.
  const mapFragments = useMemo(() => [{
    id: part.id || 'viewer',
    name: part.name,
    type: part.type || 'plasmid',
    sequence: seq,
    length: totalBp,
    strand: 1,
    annotations: part.annotations || [],
  }], [part, seq, totalBp]);

  // Region at a given nucleotide position
  const regionAt = (pos) => regions.find(r => pos >= r.start && pos < r.end);

  // Intron annotations (detail with type=intron)
  const introns = useMemo(() =>
    (part.annotations || []).filter(a => a.type === 'intron' && a.level === 'detail'),
  [part.annotations]);
  const isIntron = (pos) => introns.some(intr => pos >= intr.start && pos < intr.end);

  // Handle region selection from PlasmidMap
  const handleMapSelect = (idx) => {
    if (regions.length > 0 && regions[idx]) {
      setSelectedRegionId(regions[idx].id === selectedRegionId ? null : regions[idx].id);
    }
  };

  // Export
  const handleExport = () => {
    exportGenBank(mapFragments, part.name, part.topology === 'circular');
  };

  // Get cDNA — splice out introns, create new Part
  const handleGetCDNA = () => {
    if (!introns.length) return;
    const cdnaSeq = getCDNA(part.sequence, introns);

    // Recalculate annotations: keep non-intron annotations, adjust coordinates
    const newAnnotations = [];
    for (const ann of (part.annotations || [])) {
      if (ann.type === 'intron') continue;
      // Compute new position by subtracting lengths of introns before this annotation
      const intronsBefore = introns
        .filter(intr => intr.end <= ann.start)
        .reduce((sum, intr) => sum + (intr.end - intr.start), 0);
      const intronsOverlap = introns.some(intr => ann.start < intr.end && ann.end > intr.start);
      if (intronsOverlap && ann.level === 'detail') continue; // skip annotations inside introns
      newAnnotations.push({
        ...ann,
        start: ann.start - intronsBefore,
        end: ann.end - intronsBefore,
      });
    }

    useStore.getState().addPart({
      name: `${part.name}_cDNA`,
      type: part.type || 'CDS',
      sequence: cdnaSeq,
      organism: part.organism,
      parentId: part.id,
      derivation: { type: 'intron_removal' },
      annotations: newAnnotations,
    });
  };

  // ── Sequence lines ──
  const seqLines = useMemo(() => {
    const lines = [];
    for (let i = 0; i < seq.length; i += CHARS_PER_LINE) {
      lines.push({ start: i, seq: seq.slice(i, i + CHARS_PER_LINE) });
    }
    return lines;
  }, [seq]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-4 bg-black/40" onClick={onClose}>
      <div className="w-[950px] max-h-[92vh] bg-white rounded-xl shadow-2xl border overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b shrink-0">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-bold text-gray-700">
              <Icon name="dna" size={14} style={{ display: 'inline-block', verticalAlign: '-2px' }} /> {part.name}
              <span className="text-gray-400 font-normal ml-2">
                {totalBp.toLocaleString()} п.н., {part.topology === 'circular' ? 'circular' : 'linear'}
              </span>
            </h3>
            {part.organism && <span className="text-[10px] text-gray-400 bg-gray-50 rounded px-1.5 py-0.5">{part.organism}</span>}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 inline-flex items-center"><Icon name="close" size={16} /></button>
        </div>

        {/* CDS Warnings */}
        {cdsWarnings.length > 0 && (
          <div className="px-5 py-2 bg-red-50 border-b border-red-200 shrink-0">
            {cdsWarnings.map((cw, i) => (
              <div key={i} className="text-[11px]">
                {cw.warnings.map((w, wi) => (
                  <div key={wi} className={`flex items-center gap-1 ${w.level === 'error' ? 'text-red-700' : 'text-amber-700'}`}>
                    <span>{w.message}</span>
                    <span className="text-gray-400">({cw.region})</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {/* Bug-rush #25: «колбаса» strip across the full sequence,
            same component the Importer's SingleInspector mounts. Sits
            BELOW the header and ABOVE the map/annotations split so a
            linearised backbone — where the circular map on the left is
            useless — still has a usable feature visualisation at a
            glance. Hidden when the part has zero annotations. */}
        {(part.annotations || []).length > 0 && totalBp > 0 && (
          <div
            style={{
              padding: '4px 14px 6px',
              borderBottom: '0.5px solid var(--border-subtle, #e7e5e4)',
              background: 'var(--surface-1, #fff)',
              flexShrink: 0,
            }}
          >
            <LinearFeatureBar
              annotations={part.annotations || []}
              seqLength={totalBp}
              onSelect={(pos) => {
                // Reuse the existing «sequence-scroll on selection» effect:
                // selecting a region in the bar lands on its first nt,
                // selectedRegionId then drives the seqContainerRef scroll.
                const r = regions.find(reg => pos >= reg.start && pos < reg.end);
                if (r) setSelectedRegionId(r.id === selectedRegionId ? null : r.id);
              }}
            />
          </div>
        )}

        {/* Main: map + annotations */}
        <div className="flex flex-1 overflow-hidden min-h-0">
          {/* Left: circular map (or linear info for very short sequences) */}
          <div className="w-[400px] shrink-0 p-3 flex items-center justify-center border-r">
            {totalBp >= 100 ? (
              <PlasmidMap
                fragments={mapFragments}
                constructName={part.name}
                totalBp={totalBp}
                onSelectFragment={handleMapSelect}
              />
            ) : (
              <div className="text-center text-gray-400 text-sm">
                <div className="text-2xl mb-2">📏</div>
                <div className="font-medium">{part.name}</div>
                <div className="text-[10px]">{totalBp} п.н., linear</div>
                <div className="font-mono text-[10px] mt-3 bg-gray-50 rounded p-2 break-all max-w-[300px]">{seq}</div>
              </div>
            )}
          </div>

          {/* Right: annotations */}
          <div className="flex-1 overflow-y-auto p-4">
            <div className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider mb-2">
              Аннотации ({(part.annotations || []).length})
            </div>
            <AnnotationEditor
              annotations={part.annotations || []}
              seqLength={totalBp}
              /* Bug-rush #25: editable when the parent (ModalStack)
                 wires `onAnnotationsChange`. Without that callback we
                 can't persist the change anywhere — fall back to read-
                 only so the user doesn't see edits silently swallowed. */
              readOnly={typeof onAnnotationsChange !== 'function'}
              onChange={onAnnotationsChange}
              onSelect={(ann) => {
                if (ann.level === 'region') {
                  setSelectedRegionId(ann.id === selectedRegionId ? null : ann.id);
                } else {
                  const parent = regions.find(r => ann.start >= r.start && ann.end <= r.end);
                  if (parent) setSelectedRegionId(parent.id === selectedRegionId ? null : parent.id);
                }
              }}
              selectedAnnotation={regions.find(r => r.id === selectedRegionId) || null}
            />

            {/* Metadata */}
            {part.description && (
              <div className="mt-3 text-[11px] text-gray-500 bg-gray-50 rounded p-2">
                {part.description}
              </div>
            )}
          </div>
        </div>

        {/* Bottom: colored sequence */}
        <div className="border-t max-h-[35vh] overflow-y-auto" ref={seqContainerRef}>
          <div className="px-5 py-2 text-[10px] text-gray-500 font-semibold uppercase tracking-wider border-b bg-gray-50 sticky top-0 z-10">
            Последовательность ({totalBp.toLocaleString()} п.н.)
          </div>
          <div className="px-5 py-3 font-mono text-[11px] leading-[18px]">
            {seqLines.map((line, lineIdx) => {
              const lineEnd = line.start + line.seq.length;

              // Check if any CDS region overlaps this line (for AA row)
              const lineCDS = regions.filter(r =>
                (r.type === 'CDS' || r.type === 'gene') && r.start < lineEnd && r.end > line.start
              );

              // B5: Region labels at boundaries
              const lineRegions = regions.filter(r => r.start >= line.start && r.start < lineEnd);

              return (
                <div key={line.start} className="mb-2" data-line={lineIdx}>
                  {/* Region labels */}
                  {lineRegions.map(r => (
                    <div key={r.id} className="text-[9px] font-sans font-medium mt-1 mb-0.5 flex items-center gap-1"
                      style={{ color: ANNOTATION_COLORS[r.type] || FEATURE_COLORS[r.type] || '#666' }}>
                      <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: ANNOTATION_COLORS[r.type] || FEATURE_COLORS[r.type] || '#999' }} />
                      {r.name} <span className="text-gray-300 font-normal">({r.end - r.start} п.н.)</span>
                    </div>
                  ))}
                  {/* Position number */}
                  <div className="text-[9px] text-gray-300 select-none mb-px">{line.start + 1}</div>

                  {/* Sense strand — colored by region */}
                  <div className="whitespace-pre">
                    {line.seq.split('').map((nt, ci) => {
                      const absPos = line.start + ci;
                      const region = regionAt(absPos);
                      const isIntr = isIntron(absPos);
                      const isSel = region && region.id === selectedRegionId;
                      const regionColor = region ? (ANNOTATION_COLORS[region.type] || FEATURE_COLORS[region.type] || '#999') : null;

                      let bg = 'transparent';
                      let style = {};
                      if (isIntr && regionColor) {
                        // Intron: hatching pattern
                        bg = 'transparent';
                        style = {
                          background: `repeating-linear-gradient(45deg, ${regionColor}08 0px, ${regionColor}08 2px, transparent 2px, transparent 6px)`,
                        };
                      } else if (regionColor) {
                        bg = regionColor + (isSel ? '58' : '26'); // opacity 0.35 / 0.15
                      }

                      return (
                        <span key={ci}
                          className="inline-block w-[1ch] text-center cursor-default"
                          style={{ backgroundColor: bg, ...style }}
                          title={`${absPos + 1}${region ? ` (${region.name})` : ''}${isIntr ? ' [intron]' : ''}`}
                          onClick={() => region && setSelectedRegionId(region.id === selectedRegionId ? null : region.id)}>
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
                      const regionColor = region ? (ANNOTATION_COLORS[region.type] || FEATURE_COLORS[region.type] || '#999') : null;
                      const bg = regionColor && !isIntr ? regionColor + (isSel ? '30' : '12') : 'transparent';
                      const comp = COMPLEMENT[nt] || 'N';
                      return (
                        <span key={ci} className="inline-block w-[1ch] text-center"
                          style={{ backgroundColor: bg }}>
                          {isIntr ? comp.toLowerCase() : comp}
                        </span>
                      );
                    })}
                  </div>

                  {/* B3: RE cut markers */}
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

                  {/* AA translation — only under CDS regions, exon-aware */}
                  {lineCDS.length > 0 && (() => {
                    // Build exon-only codon map so AA translation skips introns
                    const aaMap = new Array(line.seq.length).fill(null);
                    lineCDS.forEach(cds => {
                      const exonBases = [];
                      for (let p = cds.start; p < Math.min(cds.end, lineEnd); p++) {
                        if (!isIntron(p)) exonBases.push(p);
                      }
                      exonBases.forEach((p, exonIdx) => {
                        if (p < line.start || p >= lineEnd) return;
                        const ci = p - line.start;
                        if (exonIdx % 3 !== 1) return; // middle of codon
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

        {/* Footer buttons */}
        <div className="flex items-center justify-between px-5 py-3 border-t shrink-0 bg-gray-50">
          <div className="flex gap-2">
            <button onClick={onClose}
              className="text-xs px-3 py-1.5 border rounded hover:bg-gray-100">Закрыть</button>
            {onOpenWizard && part.topology === 'circular' && (
              <div className="flex gap-1.5">
                <button onClick={() => { useStore.getState().setWizardPresetMode('restriction_cloning'); onClose(); onOpenWizard(part); }}
                  className="text-xs px-2.5 py-1.5 bg-red-50 text-red-700 border border-red-200 rounded hover:bg-red-100">
                  <Icon name="restriction" size={13} style={{ display: 'inline-block', verticalAlign: '-2px' }} /> Клонировать
                </button>
                <button onClick={() => { useStore.getState().setWizardPresetMode('use_whole'); onClose(); onOpenWizard(part); }}
                  className="text-xs px-2.5 py-1.5 bg-blue-50 text-blue-700 border border-blue-200 rounded hover:bg-blue-100">
                  <Icon name="mix" size={13} style={{ display: 'inline-block', verticalAlign: '-2px' }} /> Как backbone
                </button>
                <button onClick={() => { useStore.getState().setWizardPresetMode('mutate'); onClose(); onOpenWizard(part); }}
                  className="text-xs px-2.5 py-1.5 bg-purple-50 text-purple-700 border border-purple-200 rounded hover:bg-purple-100">
                  <Icon name="mutagenesis" size={13} style={{ display: 'inline-block', verticalAlign: '-2px' }} /> Мутагенез
                </button>
              </div>
            )}
            {onOpenWizard && part.topology !== 'circular' && (
              <button onClick={() => { onClose(); onOpenWizard(part); }}
                className="text-xs px-3 py-1.5 bg-blue-50 text-blue-700 border border-blue-200 rounded hover:bg-blue-100">
                <Icon name="swap" size={13} style={{ display: 'inline-block', verticalAlign: '-2px' }} /> Операции
              </button>
            )}
            {(part.children?.length > 0 || part.parentId) && (
              <button onClick={() => { onClose(); useStore.getState().setVersionTreePartId(part.id); }}
                className="text-xs px-3 py-1.5 bg-purple-50 text-purple-700 border border-purple-200 rounded hover:bg-purple-100">
                {'🌳'} Версии
              </button>
            )}
          </div>
          <div className="flex gap-2">
            {introns.length > 0 && (
              <button onClick={handleGetCDNA}
                className="text-xs px-3 py-1.5 bg-teal-50 text-teal-700 border border-teal-200 rounded hover:bg-teal-100">
                {'\uD83E\uDDEC'} cDNA
              </button>
            )}
            <button onClick={handleExport}
              className="text-xs px-3 py-1.5 bg-green-50 text-green-700 border border-green-200 rounded hover:bg-green-100">
              {'\uD83D\uDCE5'} Экспорт GenBank
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
