/**
 * AlignResultView — right panel: metric chips + verdict, then «align to
 * reference» via SequenceView (AlignReferenceView). Two modes:
 *   • pairwise   — one read aligned to the reference (+ chromatogram);
 *   • multi-read — N reads → consensus pile-up with double-peak markers (P6).
 */
import { useMemo, useState, useCallback } from 'react';
import { useStore } from '../../store';
import { applySequenceEditToEntry } from '../Library/lib/library-sequence-edit';
import { applyAnnotationEdit, generateAnnotationId } from '../../lib/annotation-edit';
import { buildAlignToReference } from '../../lib/alignment/align-to-reference';
import { intronsFromAlignment } from '../../lib/alignment/introns-from-alignment';
import { TRANSLATABLE_TYPES } from '../SequenceView/constants';
import AlignReferenceView from './AlignReferenceView';
import SaveCorrectedVersionModal from './SaveCorrectedVersionModal';
import { NUCLEOTIDE_COLORS } from './align-geometry';
import { reverseComplementChromatogram } from '../../lib/alignment/chromatogram-model';
import { buildAAEffects } from './aa-effect';
import { detectDoublePeaks, doublePeaksByRefPos } from '../../lib/alignment/double-peaks';
import { enrichEditDescriptor } from '../../lib/alignment/describe-edit';
import { assessAlignmentQuality, alignmentVerdict } from '../../lib/alignment/alignment-quality';
import { useAlignUndoRedo } from './hooks/useAlignUndoRedo';
import { Icon } from '../icons/Icon';

function Metric({ label, value, testid }) {
  return (
    <div style={{ background: 'var(--surface-sunken, #f5f5f4)', borderRadius: 6, padding: '6px 10px', minWidth: 78 }}>
      <div style={{ fontSize: 11, color: 'var(--text-tertiary, #78716c)' }}>{label}</div>
      <div data-testid={testid} style={{ fontSize: 16, fontWeight: 500, color: 'var(--text-primary, #1c1917)' }}>{value}</div>
    </div>
  );
}

function Swatch({ color, label }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <span style={{ width: 11, height: 11, borderRadius: 3, background: color, display: 'inline-block' }} />{label}
    </span>
  );
}


export default function AlignResultView() {
  const result = useStore((s) => s.align?.result || null);
  const multi = useStore((s) => s.align?.multi || null);
  const inputs = useStore((s) => s.align?.inputs || []);
  const colorNucleotides = useStore((s) => s.align?.view?.colorNucleotides || false);
  const showAnnotations = useStore((s) => s.align?.view?.showAnnotations !== false);
  const showAATrack = useStore((s) => s.align?.view?.showAATrack !== false);
  // P3 — transient reference edit + actions.
  const workingReference = useStore((s) => s.align?.workingReference || null);
  const acceptReadBaseAt = useStore((s) => s.acceptReadBaseAt);
  const revertWorkingReference = useStore((s) => s.revertWorkingReference);
  const saveCorrectedReference = useStore((s) => s.saveCorrectedReference);
  const commitWorkingEdit = useStore((s) => s.commitWorkingEdit);
  const [saveOpen, setSaveOpen] = useState(false);
  // Ctrl+Z / Ctrl+Y for the working-copy edits (active while align is shown).
  useAlignUndoRedo();

  // Full in-place reference editing (Игорь — «как у нас реализовано»): the
  // SequenceView emits an insert/delete/replace op; we apply it (shared
  // applySequenceEditToEntry) to the CURRENT working copy and commit. Returns
  // the new caret position for the editor to advance to.
  const onSequenceEdit = useCallback((op) => {
    const al = useStore.getState().align;
    const ref = al.inputs.find((x) => x.id === al.refId);
    if (!ref) return null;
    const wr = al.workingReference;
    const base = (wr && wr.sourceId === ref.id)
      ? { sequence: wr.sequence, annotations: wr.annotations }
      : { sequence: ref.sequence, annotations: ref.annotations || [] };
    const res = applySequenceEditToEntry({ payload: base }, op);
    if (!res.ok) return null;
    // Log WHAT changed «было → стало»: capture the original bases from the
    // pre-edit sequence so the save summary isn't just «→ X» (Игорь).
    commitWorkingEdit(res.sequence, res.annotations, enrichEditDescriptor(op, base.sequence));
    return res.caretAfter;
  }, [commitWorkingEdit]);

  // «Отметить как интрон» from the selection context menu (same gesture as the
  // Library editor) → add the detail intron to the working reference's
  // annotations (sequence untouched). The AA track then renders the spliced
  // protein on the reference. Transient until «Сохранить версию», like a base
  // edit; descriptor is null (this is an annotation, not a base correction).
  const onAnnotationEdit = useCallback((edit) => {
    const al = useStore.getState().align;
    const ref = al.inputs.find((x) => x.id === al.refId);
    if (!ref) return;
    const wr = al.workingReference;
    const base = (wr && wr.sourceId === ref.id)
      ? { sequence: wr.sequence, annotations: wr.annotations }
      : { sequence: ref.sequence, annotations: ref.annotations || [] };
    const result = applyAnnotationEdit(base.annotations || [], edit, base.sequence.length);
    const next = Array.isArray(result) ? result : result?.next;
    if (!Array.isArray(next) || next === base.annotations) return;
    commitWorkingEdit(base.sequence, next, null);
  }, [commitWorkingEdit]);

  // «Интроны из зазоров» (Игорь — наложил cDNA/мРНК на геном → пропуски чтения =
  // вырезанные интроны). Build the read↔ref map, call intronsFromAlignment, and
  // create each gap as an intron — linked to a CDS/gene it sits inside (so the AA
  // track splices) or as a standalone region otherwise. Rides onAnnotationEdit.
  const onIntronsFromGaps = useCallback(() => {
    // Settle any debounced typing re-align FIRST — the gap→intron coordinates are
    // read from al.result.columns and must match the post-edit reference (an indel
    // edit shifts coords; a stale result would place introns at the wrong start/end).
    useStore.getState().flushAlignment();
    const al = useStore.getState().align;
    const ref = al.inputs.find((x) => x.id === al.refId);
    const res = al.result;
    if (!ref || !res?.columns?.length) return;
    const wr = al.workingReference;
    const editing = wr && wr.sourceId === ref.id;
    const refSeq = editing ? wr.sequence : ref.sequence;
    const anns = editing ? wr.annotations : (ref.annotations || []);
    const gaps = intronsFromAlignment(buildAlignToReference(res), refSeq);
    if (!gaps.length) return;
    const cdsOf = (g) => anns.find(
      (a) => a && a.level === 'region' && TRANSLATABLE_TYPES.has(a.type) &&
        a.start <= g.start && a.end >= g.end,
    );
    gaps.forEach((g, i) => {
      const cds = cdsOf(g);
      const payload = cds
        ? { type: 'intron', level: 'detail', regionId: cds.id || generateAnnotationId(cds), start: g.start, end: g.end, strand: cds.strand === -1 ? -1 : 1, name: `интрон ${i + 1}` }
        : { type: 'intron', level: 'region', start: g.start, end: g.end, strand: 1, name: `интрон ${i + 1}` };
      onAnnotationEdit({ kind: 'create', payload });
    });
  }, [onAnnotationEdit]);

  // Double-peak detection is keyed on the IMMUTABLE chromatograms (source inputs),
  // not the working copy — so editing the reference doesn't re-scan every trace on
  // every keystroke (multiData below rebuilds per edit; this expensive O(peaks) scan
  // stays cached across the burst). Only the cheap ref-coord remap runs per rebuild.
  const doublePeaksByReadId = useMemo(() => {
    const m = {};
    for (const inp of inputs) {
      if (inp.kind === 'trace' && inp.chromatogram) m[inp.id] = detectDoublePeaks(inp.chromatogram);
    }
    return m;
  }, [inputs]);

  // ── multi-read: build the consensus + read pile-up + covered span ──
  const multiData = useMemo(() => {
    if (!multi) return null;
    const refInput = inputs.find((x) => x.id === multi.refId);
    // Show the WORKING COPY of the reference if one is in progress (so edits +
    // re-aligned reads stay consistent), else the source.
    const editingRef = workingReference && workingReference.sourceId === multi.refId;
    const referenceFragment = editingRef
      ? { id: multi.refId, name: `${workingReference.name} · правка`, sequence: workingReference.sequence, annotations: workingReference.annotations, type: 'reference', circular: !!refInput?.circular }
      : {
        id: refInput?.id || 'ref', name: refInput?.name || 'Реф',
        sequence: refInput?.sequence || '', annotations: refInput?.annotations || [], type: 'reference',
        circular: !!refInput?.circular, // V188 — circular ref → RestrictionTrack scans origin-straddling sites
      };
    const cons = multi.consensus;
    const consMismatches = Object.keys(cons.byRefPos).filter((p) => cons.byRefPos[p].status === 'mismatch').map(Number);
    const consAA = showAATrack
      ? buildAAEffects(referenceFragment.sequence, referenceFragment.annotations, consMismatches, cons.byRefPos)
      : undefined;
    // Individual reads first, the CONSENSUS as the BOTTOM row (Игорь). Every
    // row's mismatch is a click-target to correct the (working-copy) reference.
    const reads = [
      ...multi.perRead.map((pr) => {
        const dpBi = doublePeaksByReadId[pr.id] || null;
        const doublePeaks = dpBi ? doublePeaksByRefPos(dpBi, pr.alignToRef.readByRefPos) : null;
        return { readByRefPos: pr.alignToRef.readByRefPos, insertions: pr.alignToRef.insertions, name: pr.name, doublePeaks, onAcceptBase: acceptReadBaseAt };
      }),
      { readByRefPos: cons.byRefPos, insertions: [], name: `консенсус · ${multi.stats.reads} чт.`, isConsensus: true, aaEffects: consAA, onAcceptBase: acceptReadBaseAt },
    ];
    const cols = Object.keys(cons.byRefPos).map(Number);
    const coverageSpan = cols.length ? { start: Math.min(...cols), end: Math.max(...cols) } : null;
    return { referenceFragment, reads, coverageSpan };
  }, [multi, inputs, showAATrack, acceptReadBaseAt, workingReference, doublePeaksByReadId]);

  const bInput = useMemo(
    () => (result?.alignedPair ? inputs.find((x) => x.id === result.alignedPair.bId) : null),
    [result, inputs],
  );
  const chromatogram = useMemo(() => {
    if (!bInput || bInput.kind !== 'trace' || !bInput.chromatogram) return null;
    return result.strand === 'reverse'
      ? reverseComplementChromatogram(bInput.chromatogram)
      : bInput.chromatogram;
  }, [bInput, result]);

  // Shared editing affordance (works in both pairwise + multi): hint + (when
  // there are edits) corrections count / save-version / revert + the modal.
  const corrections = workingReference?.corrections || [];
  const editBar = (
    <div data-testid="align-edit-bar" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10, fontSize: 12, color: 'var(--text-secondary, #57534e)' }}>
      <span style={{ color: 'var(--text-tertiary, #78716c)' }}>Правка референса: выдели и впечатай / удали, либо кликни несовпадение → принять базу чтения. Ctrl+Z — отменить.</span>
      {corrections.length > 0 && (
        <>
          <span data-testid="align-corrections-count" style={{ fontWeight: 600, color: 'var(--accent-700, #b45309)' }}>правок: {corrections.length}</span>
          <button type="button" data-testid="align-save-version-open" onClick={() => setSaveOpen(true)}
            style={{ padding: '5px 12px', fontSize: 12, fontWeight: 500, borderRadius: 6, cursor: 'pointer', border: '1px solid var(--accent-700, #b45309)', background: 'var(--accent-500, #f59e0b)', color: '#fff' }}>
            Сохранить исправленную версию
          </button>
          <button type="button" data-testid="align-revert" onClick={() => revertWorkingReference?.()}
            style={{ padding: '5px 10px', fontSize: 12, borderRadius: 6, cursor: 'pointer', border: '1px solid var(--border-default, #d6d3d1)', background: 'var(--surface-1, #fff)', color: 'var(--text-secondary, #57534e)' }}>
            Сбросить
          </button>
        </>
      )}
    </div>
  );
  const saveModal = saveOpen ? (
    <SaveCorrectedVersionModal
      workingReference={workingReference}
      onSave={(reason, name) => saveCorrectedReference(reason, name)}
      onClose={() => setSaveOpen(false)}
    />
  ) : null;

  // ── multi-read view ──
  if (multi && multiData) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div data-testid="align-metrics" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          <Metric label="Чтений" value={multi.stats.reads} testid="align-metric-reads" />
          <Metric label="Покрытие консенсуса" value={`${Math.round(multi.stats.coverage)}%`} testid="align-metric-coverage" />
          <Metric label="Несовпадений (конс.)" value={multi.stats.consensusMismatches} testid="align-metric-mismatches" />
          <Metric label="Макс. глубина" value={multi.stats.maxDepth} testid="align-metric-depth" />
        </div>
        {editBar}
        <AlignReferenceView
          referenceFragment={multiData.referenceFragment}
          alignmentReads={multiData.reads}
          coverageSpan={multiData.coverageSpan}
          readCount={multi.stats.reads}
          colorMode={colorNucleotides ? 'nucleotide' : 'plain'}
          showAnnotations={showAnnotations}
          showAATrack={showAATrack}
          onSequenceEdit={onSequenceEdit}
          onAnnotationEdit={onAnnotationEdit}
        />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, fontSize: 12, color: 'var(--text-secondary, #57534e)' }}>
          <span style={{ color: 'var(--accent-700, #b45309)', fontWeight: 600 }}>нижняя строка — консенсус</span>
          <span style={{ color: 'var(--danger-fg, #b91c1c)', fontWeight: 600 }}>красным — несовпадения</span>
          <span style={{ color: '#8B5CF6', fontWeight: 600 }}>фиолетовым — двойные пики (гетерозиготы)</span>
        </div>
        {saveModal}
      </div>
    );
  }

  if (!result || !result.columns?.length) {
    return (
      <div data-testid="align-no-result" style={{ fontSize: 13, color: 'var(--text-tertiary, #78716c)' }}>
        Выберите референс и хотя бы одно «выровнять» слева — выравнивание построится автоматически.
      </div>
    );
  }

  const aInput = result.alignedPair ? inputs.find((x) => x.id === result.alignedPair.aId) : null;
  const editing = !!(workingReference && workingReference.sourceId === aInput?.id);
  const referenceFragment = editing
    ? { id: aInput?.id || 'ref', name: `${workingReference.name} · правка`, sequence: workingReference.sequence, annotations: workingReference.annotations, type: 'reference', circular: !!aInput?.circular }
    : { id: aInput?.id || 'ref', name: aInput?.name || 'Реф', sequence: aInput?.sequence || '', annotations: aInput?.annotations || [], type: 'reference', circular: !!aInput?.circular };
  // cDNA/mRNA-vs-genomic: the read's gaps on the reference are candidate introns.
  const gapIntrons = result?.columns?.length
    ? intronsFromAlignment(buildAlignToReference(result), referenceFragment.sequence)
    : [];
  const quality = assessAlignmentQuality(result);
  const v = alignmentVerdict(result.identity, result.coverageB, quality);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div data-testid="align-metrics" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
        <Metric label="Совпадение" value={`${result.identity.toFixed(1)}%`} testid="align-metric-identity" />
        <span style={{ fontSize: 12, padding: '4px 10px', borderRadius: 999, background: v.bg, color: v.fg }}>{v.text}</span>
        <Metric label="Покрытие референса" value={`${Math.round(result.coverageA)}%`} testid="align-metric-coverage-ref" />
        <Metric label="Покрытие чтения" value={`${Math.round(result.coverageB)}%`} testid="align-metric-coverage" />
        <Metric label="Несовпадения" value={result.mismatches} testid="align-metric-mismatches" />
        <Metric label="Гэпы" value={result.gaps} testid="align-metric-gaps" />
        <Metric label="Длина" value={`${result.alignedLength} bp`} testid="align-metric-length" />
        <Metric label="Цепь" value={result.strand === 'reverse' ? 'обратная' : 'прямая'} testid="align-metric-strand" />
      </div>

      {editBar}

      {gapIntrons.length > 0 && (
        <div data-testid="align-introns-from-gaps-bar" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, fontSize: 12 }}>
          <button
            type="button"
            data-testid="align-introns-from-gaps"
            onClick={onIntronsFromGaps}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px', fontSize: 12, fontWeight: 500, borderRadius: 6, cursor: 'pointer', border: '1px solid var(--accent-700, #b45309)', background: 'var(--surface-1, #fff)', color: 'var(--accent-700, #b45309)' }}
          >
            <Icon name="dna" size={14} /> Разметить интроны из зазоров ({gapIntrons.length})
          </button>
          <span style={{ color: 'var(--text-tertiary, #78716c)' }}>пропуски чтения на референсе = вырезанные интроны</span>
        </div>
      )}

      {quality.warnings.length > 0 && (
        <div data-testid="align-quality-warnings" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, fontSize: 12, color: 'var(--warning-text, #92400e)' }}>
          {quality.warnings.map((w, i) => (
            <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 6, background: 'var(--warning-bg, #FEF3C7)', border: '1px solid var(--warning-border, #FDE68A)' }}><Icon name="warning" size={13} /> {w}</span>
          ))}
        </div>
      )}

      {result.warnings?.length > 0 && (
        <div style={{ fontSize: 12, color: 'var(--warning-text, #92400e)' }}>{result.warnings.join('; ')}</div>
      )}

      <AlignReferenceView
        result={result}
        referenceFragment={referenceFragment}
        chromatogram={chromatogram}
        readName={bInput?.name}
        colorMode={colorNucleotides ? 'nucleotide' : 'plain'}
        showAnnotations={showAnnotations}
        showAATrack={showAATrack}
        onAcceptBase={acceptReadBaseAt}
        onSequenceEdit={onSequenceEdit}
        onAnnotationEdit={onAnnotationEdit}
      />

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, fontSize: 12, color: 'var(--text-secondary, #57534e)' }}>
        <span style={{ color: 'var(--text-tertiary, #78716c)' }}>каналы трассы:</span>
        {['A', 'C', 'G', 'T'].map((ch) => <Swatch key={ch} color={NUCLEOTIDE_COLORS[ch]} label={ch} />)}
        <span style={{ fontFamily: 'var(--font-mono, monospace)' }}><span style={{ color: 'var(--text-tertiary, #78716c)' }}>–</span>&nbsp;гэп</span>
        <span style={{ color: 'var(--danger-fg, #b91c1c)', fontWeight: 600 }}>несовпадение&nbsp;—&nbsp;красная буква в строке чтения</span>
      </div>

      {saveModal}
    </div>
  );
}
