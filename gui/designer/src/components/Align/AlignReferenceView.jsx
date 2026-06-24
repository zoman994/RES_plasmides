/**
 * AlignReferenceView — «align to reference» rendered by REUSING the shared
 * SequenceView. The reference is drawn natively with its annotations; the
 * aligned read(s) + Sanger trace ride along as opt-in tracks. Two modes:
 *   • pairwise   — a single `result` → one read track (+ chromatogram);
 *   • multi-read — a prebuilt `alignmentReads` array (consensus row + N reads
 *     with double-peak markers) → a read pile-up (P6).
 *
 * A pinned linear AlignMiniMap on top gives click + draggable-carriage
 * navigation. Visible-range tracking reads the rendered line rects, so the core
 * SequenceView needs no change.
 */
import {
  useMemo, useRef, useState, useEffect, useCallback,
} from 'react';
import SequenceView from '../SequenceView';
import { findScrollingAncestor } from '../SequenceView/lib/scroll-handle';
import { buildAlignToReference } from '../../lib/alignment/align-to-reference';
import AlignMiniMap from './AlignMiniMap';
import { buildAAEffects } from './aa-effect';

export default function AlignReferenceView({
  result, referenceFragment, chromatogram, readName, colorMode = 'plain',
  showAnnotations = true, showAATrack = true,
  // Multi-read (P6): prebuilt rows (consensus + reads) + covered span for the minimap.
  alignmentReads = null, coverageSpan = null, readCount = 0,
  // P3 — «accept read base» (pairwise only): onAcceptBase(refPos, readBase).
  onAcceptBase = null,
  // P9.2 — full in-place editing: onSequenceEdit(op) applies an insert/delete/
  // replace to the working copy and returns the new caret position.
  onSequenceEdit = null,
  // Splice marking in alignment (Игорь — «наложить cDNA/экзон и отметить как
  // интрон»): onAnnotationEdit({kind,payload}) adds the intron to the working
  // reference's annotations → the AA track re-renders the spliced protein.
  onAnnotationEdit = null,
}) {
  const isMulti = !!(alignmentReads && alignmentReads.length);
  const seqLen = referenceFragment?.sequence?.length || 0;
  const editable = !!onSequenceEdit;

  // Controlled caret/selection for the editor (standard SequenceView contract).
  const [caretPos, setCaretPos] = useState(null);
  const [caretAnchor, setCaretAnchor] = useState(null);
  const [selectionMode, setSelectionMode] = useState(null);
  const [selectionStrand, setSelectionStrand] = useState(1);

  const onCaretChange = useCallback((pos, opts = {}) => {
    setCaretPos(pos);
    setCaretAnchor((prev) => {
      if (opts.extendSelection) return prev == null ? (Number.isFinite(opts.anchorIfNull) ? opts.anchorIfNull : pos) : prev;
      return pos; // collapse
    });
    if (!opts.extendSelection) setSelectionMode(null);
  }, []);

  const onSelectRange = useCallback((start, end, mode, strand) => {
    setCaretAnchor(start);
    setCaretPos(end);
    setSelectionMode(mode || 'dna');
    setSelectionStrand(strand || 1);
  }, []);

  const onSeqEdit = useCallback((op) => {
    const caretAfter = onSequenceEdit ? onSequenceEdit(op) : null;
    if (Number.isFinite(caretAfter)) { setCaretPos(caretAfter); setCaretAnchor(caretAfter); setSelectionMode(null); }
  }, [onSequenceEdit]);

  // Stable single-element fragments array for SequenceView. A fresh `[referenceFragment]`
  // literal on every render would re-key SequenceView's buildFeatureMap → rebuild
  // fullSeq+features → rebuild linesJsx → re-render EVERY line on each caret move,
  // making a selection drag stutter («выделение дерганное»). Caret/selection live
  // in local state here, so this memo holds across drag steps (referenceFragment
  // changes only on a real reference edit).
  const fragments = useMemo(() => [referenceFragment], [referenceFragment]);

  const singleRead = useMemo(
    () => (isMulti ? null : buildAlignToReference(result)),
    [isMulti, result],
  );

  // Protein consequence of each CDS-internal mismatch → read-track badges
  // (pairwise only; in multi mode the consensus row carries its own aaEffects).
  // Tied to the AA-track toggle so the badges are an «AA layer» the user controls.
  const aaEffects = useMemo(
    () => ((isMulti || !showAATrack) ? undefined : buildAAEffects(
      referenceFragment?.sequence,
      referenceFragment?.annotations,
      singleRead.mismatchRefPositions,
      singleRead.readByRefPos,
    )),
    [isMulti, showAATrack, referenceFragment, singleRead],
  );

  const span = isMulti ? coverageSpan : (singleRead ? singleRead.span : null);

  const sequenceViewRef = useRef(null);
  const wrapRef = useRef(null);
  const [visibleRange, setVisibleRange] = useState(null);

  const chromatogramMaxVal = useMemo(() => {
    if (!chromatogram) return 1;
    let m = 1;
    ['A', 'C', 'G', 'T'].forEach((ch) => { const a = chromatogram.traces[ch] || []; for (let i = 0; i < a.length; i++) if (a[i] > m) m = a[i]; });
    return m;
  }, [chromatogram]);

  const searchHits = useMemo(() => {
    if (!span || span.end < span.start) return [];
    return [{
      targetStart: span.start,
      targetEnd: span.end + 1,
      queryIdentity: (isMulti ? 1 : (result?.identity || 0) / 100),
      mismatchPositions: [], // no red boxes on the reference (Игорь)
      strand: 1,
    }];
  }, [span, isMulti, result]);

  // Which reference window is on screen → carriage position.
  const computeVisible = useCallback(() => {
    const wrap = wrapRef.current;
    const root = wrap && wrap.querySelector('[data-testid="sequence-view-root"]');
    if (!root) return;
    const cpl = parseInt(root.getAttribute('data-chars-per-line') || '0', 10) || 0;
    const scroller = (root.scrollHeight > root.clientHeight + 1) ? root : findScrollingAncestor(root);
    let sRect;
    try {
      sRect = (scroller && scroller.getBoundingClientRect && scroller !== document.documentElement && scroller !== document.body)
        ? scroller.getBoundingClientRect()
        : { top: 0, bottom: window.innerHeight || 0 };
    } catch { sRect = { top: 0, bottom: window.innerHeight || 0 }; }
    const lines = root.querySelectorAll('[data-testid="sequence-view-line"]');
    let minStart = null; let maxStart = null;
    for (const el of lines) {
      const k = el.getAttribute('data-wraptail-kind');
      if (k && k !== 'main') continue;
      const start = parseInt(el.dataset.lineStart || '', 10);
      if (Number.isNaN(start)) continue;
      let r; try { r = el.getBoundingClientRect(); } catch { continue; }
      if (r.height > 0 && r.bottom > sRect.top && r.top < sRect.bottom) {
        if (minStart === null || start < minStart) minStart = start;
        if (maxStart === null || start > maxStart) maxStart = start;
      }
    }
    if (minStart === null) return;
    setVisibleRange({ start: minStart, end: Math.min(seqLen, maxStart + (cpl || 1)) });
  }, [seqLen]);

  useEffect(() => {
    let raf1; let raf2;
    raf1 = requestAnimationFrame(() => { computeVisible(); raf2 = requestAnimationFrame(computeVisible); });
    const wrap = wrapRef.current;
    const root = wrap && wrap.querySelector('[data-testid="sequence-view-root"]');
    const scroller = root ? ((root.scrollHeight > root.clientHeight + 1) ? root : findScrollingAncestor(root)) : null;
    const target = (scroller && scroller !== document.documentElement && scroller !== document.body) ? scroller : window;
    let pending = false;
    const onScroll = () => { if (pending) return; pending = true; requestAnimationFrame(() => { pending = false; computeVisible(); }); };
    target.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      cancelAnimationFrame(raf1); cancelAnimationFrame(raf2);
      target.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
    // Keyed on computeVisible (→ seqLen) only. Dropping singleRead/alignmentReads
    // stops the scroll/resize listeners from being torn down + re-attached and the
    // 2×RAF getBoundingClientRect reflow from firing on every keystroke / re-align
    // (those change per edit but don't change the reference layout); scroll still
    // keeps the carriage live, and a length change (indel) re-runs via computeVisible.
  }, [computeVisible]);

  const onScrubTo = useCallback((pos) => {
    sequenceViewRef.current?.scrollToPosition?.(pos, { behavior: 'auto', force: true });
    requestAnimationFrame(computeVisible);
  }, [computeVisible]);

  const dotStyle = (color) => ({ width: 8, height: 8, borderRadius: 2, background: color, display: 'inline-block', flex: '0 0 8px' });
  const rowStyle = { display: 'flex', alignItems: 'center', gap: 6 };

  return (
    <div ref={wrapRef} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div
        data-testid="align-ref-header"
        style={{
          display: 'flex', flexWrap: 'wrap', gap: '4px 16px', fontSize: 12,
          color: 'var(--text-secondary, #57534e)',
          padding: '6px 8px', borderRadius: 6, background: 'var(--surface-sunken, #f5f5f4)',
        }}
      >
        <span style={rowStyle}>
          <span style={dotStyle('var(--text-primary, #1c1917)')} />
          Сверху — референс:&nbsp;<strong style={{ fontWeight: 600, color: 'var(--text-primary, #1c1917)' }}>{referenceFragment?.name || 'реф'}</strong>
        </span>
        <span style={rowStyle}>
          <span style={dotStyle('#E24B4A')} />
          {isMulti
            ? <>Снизу — {readCount} чтени{readCount === 1 ? 'е' : (readCount < 5 ? 'я' : 'й')} + <strong style={{ fontWeight: 600, color: 'var(--accent-700, #b45309)' }}>консенсус</strong> (нижняя строка) · красным — несовпадения, фиолетовым — двойные пики</>
            : <>Снизу — чтение:&nbsp;<strong style={{ fontWeight: 600, color: 'var(--text-primary, #1c1917)' }}>{readName || 'чтение'}</strong><span style={{ color: 'var(--text-tertiary, #78716c)' }}>· красным — несовпадения</span></>}
        </span>
      </div>

      {/* Pinned for navigation while the sequence scrolls under it. */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 5,
        background: 'var(--surface-1, #fff)',
        paddingBottom: 4, borderBottom: '0.5px solid var(--border-subtle, #e7e5e4)',
      }}>
        <AlignMiniMap
          seqLen={seqLen}
          annotations={referenceFragment?.annotations || []}
          readSpan={span ? { ...span, strand: result?.strand === 'reverse' ? -1 : 1 } : null}
          visibleRange={visibleRange}
          onScrubTo={onScrubTo}
        />
      </div>

      <SequenceView
        ref={sequenceViewRef}
        fragments={fragments}
        editable={editable}
        caretPos={caretPos}
        caretAnchor={caretAnchor}
        selectionMode={selectionMode}
        selectionStrand={selectionStrand}
        onCaretChange={onCaretChange}
        onSelectRange={onSelectRange}
        onSequenceEdit={onSeqEdit}
        onAnnotationEdit={onAnnotationEdit}
        alignmentRead={isMulti ? null : singleRead}
        alignmentReads={isMulti ? alignmentReads : null}
        chromatogram={isMulti ? null : chromatogram}
        chromatogramMaxVal={chromatogramMaxVal}
        searchHits={searchHits}
        showBottomStrand={false}
        alignmentColorMode={colorMode}
        alignmentReferenceName={referenceFragment?.name || 'реф'}
        alignmentReadName={readName || 'чтение'}
        aaEffects={aaEffects}
        onAcceptBase={isMulti ? null : onAcceptBase}
        showAnnotations={showAnnotations}
        showAATrack={showAATrack}
      />
    </div>
  );
}
