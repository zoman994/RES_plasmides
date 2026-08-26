/**
 * SequenceLine — single line of the sequence view (one DNA chunk plus
 * all its track overlays). Wrapped in `React.memo` so a line whose
 * inputs don't change between renders skips its sub-tree entirely.
 *
 * Why this exists (perf review 04.05.2026 evening): on a typical 8.8 kb
 * plasmid at 150 chars / line we render ~60 lines × 8 tracks × ~150
 * inline-block spans ≈ 70 000 DOM nodes. Without memo, ANY parent
 * state change (settings popover open / close, theme toggle, an
 * unrelated zustand subscription elsewhere) re-renders all 70 000
 * nodes. With memo + the orchestrator passing stable refs (primers /
 * reSites / features / orfRanges / settings via useMemo + zustand
 * slice subscription), unchanged lines bail at the React level — only
 * the lines whose props actually shifted (rare) re-render.
 *
 * Also: each line div now has `contain: paint` so the browser can
 * paint each line in its own layer and skip re-painting siblings on
 * scroll (which is the dominant cost on long plasmids).
 *
 * `annMap` (per-position annotation lookup for the strand tint) is
 * memoized inside the line so it's recomputed only when (features,
 * line.start, line.seq.length) shift.
 *
 * Extracted from `SequenceView/index.jsx` in Sprint M-X.2 K1
 * decomposition.
 */

import { memo, useMemo } from "react";
import { LABEL_WIDTH, __IS_TEST_ENV__ } from "./constants.js";
import { buildLineAnnMap } from "./lib/feature-map.js";
import { sequenceLineEqual } from "./lib/sequence-line-equal.js";
import { RE_ENZYMES } from "../../restriction-db.js";
import RulerTrack from "./tracks/RulerTrack.jsx";
import StrandsTrack from "./tracks/StrandsTrack.jsx";
import AnnotationTrack from "./tracks/AnnotationTrack.jsx";
import AATrack from "./tracks/AATrack.jsx";
import PrimerTrack from "./tracks/PrimerTrack.jsx";
import RestrictionTrack from "./tracks/RestrictionTrack.jsx";
import AlignmentReadTrack from "./tracks/AlignmentReadTrack.jsx";
import AlignmentChromatogramTrack from "./tracks/AlignmentChromatogramTrack.jsx";

const SequenceLine = memo(function SequenceLine({
  line,
  fullSeq,
  features,
  primers,
  // 18.05.2026 — primer click/selection (Игорь redesign). Stable refs
  // from SequenceView so React.memo only re-renders on actual change.
  onPrimerClick,
  onPrimerDoubleClick,
  selectedPrimerKeys,
  reSites,
  charPx,
  // PERF-4 — settings split into scalars so memo bails per-field.
  // The orchestrator destructures the slice once; SequenceLine just
  // sees primitives that React.memo's shallow-equal handles cleanly.
  showBottomStrand,
  framesMode,
  primerStyle,
  reOrientation,
  visibleFrames,
  framesResolution,
  orfRanges,
  renderHybrid,
  onAnnotationClick,
  selectedRegionId,
  tracksReady,
  // Sprint M-X.2 K4 — drag-handles for region edges.
  onAnnotationEdgePointerDown,
  draggedAnnotationId,
  draggedEdge,
  draggedCurrentCoord,
  // Sprint M-X.2 K5 — inline rename on double-click of the LABEL.
  onAnnotationDoubleClick,
  // Bug-rush #3 — double-click on the FEATURE BAR opens Annotator.
  onAnnotationFeatureDoubleClick,
  // Sprint M-X.3 K2 — wrap-tail kind. 'main' is the default; the
  // value 'leading-wrap' (last N lines of plasmid rendered before
  // line 0) and 'trailing-wrap' (first N lines rendered after the
  // last line) flag a context-only line that's dimmed and inert.
  // CaretOverlay + useSelectionState filter by data-wraptail-kind
  // so caret/click never lands on a context line. Default 'main'
  // keeps the shape backwards-compatible with linear consumers.
  kind = 'main',
  // Round-9 (06.05.2026): nextKind tells the wrapper if this line
  // is the LAST one before a wrap-tail / main boundary. When the
  // next line is a different kind, we drop the divider (border-bottom
  // + paddingBottom + marginBottom) so the origin marker is the only
  // visible separator across the boundary — biolog: «внизу с новой
  // строки идёт призрачная часть» fix.
  nextKind = 'main',
  // Round-10 (06.05.2026): wrap-bridge metadata. When `line.wrapsOrigin`
  // is true, the row covers [line.start..seqLength) ∪ [0..wrapAt-...]
  // — the LAST main row extended to a full cpl by appending wrap
  // chars from the plasmid start. RulerTrack splits its labels at
  // wrapAt; an inline vertical divider goes there too.
  seqLength = 0,
  // Topology — circular primers' off-end 5′-tails wrap across the origin (rendered
  // on the wrap-bridge row), so PrimerTrack must not dangle them into the margin.
  circular = false,
  // ANN-0L C2 — which molecule, and which version of it, is on screen.
  entryId = null,
  documentHash = null,
  topology,
  // Terminal sticky-end staircase (Игорь 22.06): { left, right } from
  // terminalStagger(segment). Gated to the FIRST line (left end) / LAST line
  // (right end) below. Null → no staircase (every existing consumer).
  terminalStagger = null,
  // RC-SEP-SEAM (Игорь 26.06 «просто буквы убрать») — absolute (pos,strand) blanks for
  // incompatible restriction overhangs; forwarded to BOTH strands so the recessed base is
  // rendered blank (single-stranded staircase). Null → no blanks (every existing consumer).
  recessBlanks = null,
  // 12.05.2026 — Игорь: «сайты рестрикции должны быть кликабельны».
  // Optional callbacks forwarded в RestrictionTrack. Library/Importer
  // don't pass them — track stays display-only as before.
  onRestrictionClick,
  restrictionHighlightKey,
  // 13.05.2026 — hover-only strand cut overlay. Parent владеет
  // hoveredRestrictionKey + onRestrictionHover; SequenceLine
  // фильтрует reCutLayout по нему.
  hoveredRestrictionKey,
  onRestrictionHover,
  // «Align to reference» (opt-in). When `alignmentRead` is present, the read is
  // drawn as a track beneath the reference; with `chromatogram` too, the Sanger
  // trace sits below the read. Both default undefined → existing consumers and
  // their tests render exactly as before.
  alignmentRead,
  // Multi-read stack (P6): array of {readByRefPos, insertions, name, aaEffects?,
  // doublePeaks?, isConsensus?}. When present it supersedes the single read.
  alignmentReads,
  chromatogram,
  chromatogramMaxVal,
  // 'plain' (black, default) | 'nucleotide' — colours the aligned read bases.
  alignmentColorMode = 'plain',
  // Per-line align labels: reference name (top-strand gutter) + read name
  // (read-track gutter). Undefined for non-align consumers.
  referenceGutterLabel,
  alignmentReadName,
  // AA-effect badges per ref position {pos -> {effect}} (align CDS mismatches).
  aaEffects,
  // P3 — «accept read base» on the single (pairwise) read track.
  onAcceptBase,
  // Layer toggles (opt-in; default visible → no change for other consumers).
  showAnnotations = true,
  showAATrack = true,
  onAAClick,
  // Virtualization (perf, 19.06.2026). `active` defaults true → eager render
  // (unchanged for every existing consumer). When the orchestrator windows a
  // large sequence it passes active={false} for off-screen line indices: the
  // line renders as a fixed-height placeholder that keeps the same wrapper +
  // data-attributes (so overlays / scrollToPosition / computeVisible still
  // find the slot) but drops the heavy track subtrees. `lineIndex` lets the
  // scroll driver read which index a rendered line is; `placeholderHeight`
  // (≈ measured main-line height) keeps the scroll height ~stable.
  active = true,
  lineIndex,
  placeholderHeight,
}) {
  const annMap = useMemo(
    () => buildLineAnnMap(features, line.start, line.seq.length),
    [features, line.start, line.seq.length],
  );

  // Per-line cut bar + overhang layout — derived from reSites + RE_ENZYMES.
  // For each site whose recognition spans into this line, compute the
  // strand-specific cut positions (top cut = site.position + cut[0],
  // bottom cut = site.position + cut[1]) and the sticky-end overhang
  // range between them. Filter & pass to each StrandsTrack so the cut
  // visualization is duplicated INSIDE the recognition site on the
  // actual DNA strands (Игорь 12.05.2026).
  const reCutLayout = useMemo(() => {
    const empty = { topCuts: [], botCuts: [], overhangs: [], bindingHighlights: [] };
    if (!Array.isArray(reSites) || reSites.length === 0) return empty;

    // 13.05.2026 — Strand cut bars + overhang shown ТОЛЬКО для
    // hovered site (hoveredRestrictionKey) и/или clicked site
    // (restrictionHighlightKey). Все-сайты-всегда было визуальным
    // шумом — Игорь UX-pass.
    const activeKeys = new Set();
    if (hoveredRestrictionKey) activeKeys.add(hoveredRestrictionKey);
    if (restrictionHighlightKey) activeKeys.add(restrictionHighlightKey);
    if (activeKeys.size === 0) return empty;

    const topCuts = [];
    const botCuts = [];
    const overhangs = [];
    const bindingHighlights = [];

    const parseKey = (key) => {
      const lastDash = key.lastIndexOf('-');
      if (lastDash <= 0) return null;
      return { enzyme: key.slice(0, lastDash), position: Number(key.slice(lastDash + 1)) };
    };

    for (const k of activeKeys) {
      const parsed = parseKey(k);
      if (!parsed) continue;
      const s = reSites.find(
        (x) => x.enzyme === parsed.enzyme && x.position === parsed.position,
      );
      if (!s) continue;
      const enz = RE_ENZYMES[s.enzyme];
      if (!enz) continue;
      // V155 — `s.position` is ALREADY the top-strand cut (flattenSites adds
      // cut[0]). The bottom cut sits `cut[1]-cut[0]` away; the recognition site
      // starts `cut[0]` BEFORE the top cut. (Was double-offset before.)
      const tAbs = s.position;
      const bAbs = s.position + (enz.cut[1] - enz.cut[0]);
      const recogStart = s.position - enz.cut[0];
      const baseKey = `${s.enzyme}-${s.position}`;
      topCuts.push({ key: `${baseKey}-top`, pos: tAbs });
      botCuts.push({ key: `${baseKey}-bot`, pos: bAbs });
      if (enz.end !== 'blunt' && tAbs !== bAbs) {
        const lo = Math.min(tAbs, bAbs);
        const hi = Math.max(tAbs, bAbs);
        overhangs.push({ key: `${baseKey}-ov`, startPos: lo, endPos: hi });
      }
      // Recognition-site (binding) box — ТОЛЬКО при наведении на НАЗВАНИЕ
      // рестриктазы (Игорь 22.06: «выделение сайта связывания только при
      // наведении на название рестриктазы»). A click selects the cut (cuts +
      // overhang stay) but must NOT paint the whole binding zone — that was the
      // visual noise. So binding is gated to the hovered key alone.
      if (k === hoveredRestrictionKey) {
        bindingHighlights.push({
          key: `${baseKey}-bind`,
          startPos: recogStart,
          endPos: recogStart + enz.site.length,
        });
      }
    }
    return { topCuts, botCuts, overhangs, bindingHighlights };
  }, [reSites, restrictionHighlightKey, hoveredRestrictionKey]);

  // Virtualization placeholder: off-screen line index. Keep the SAME outer
  // <div> with every data-attribute the DOM-measuring machinery relies on
  // (data-testid / data-line-start / data-wraptail-kind / wrap-origin) so
  // SelectionOverlay, CaretOverlay, scrollToPosition and computeVisible keep
  // finding the slot — only the heavy track subtree is dropped. The
  // hooks above run unconditionally (they're cheap and React's rules of
  // hooks require it); the early return is below them. `contain: strict`
  // lets the browser skip layout/paint of the empty box entirely.
  if (active === false) {
    return (
      <div
        data-testid="sequence-view-line"
        data-line-start={line.start}
        data-line-idx={Number.isFinite(lineIndex) ? lineIndex : undefined}
        data-wraptail-kind={kind}
        data-wraps-origin={line.wrapsOrigin ? "true" : undefined}
        data-wrap-at={line.wrapsOrigin ? String(line.wrapAt) : undefined}
        data-tracks-ready={tracksReady ? "true" : "false"}
        data-placeholder="true"
        aria-hidden="true"
        style={{
          position: "relative",
          height: Number.isFinite(placeholderHeight) && placeholderHeight > 0 ? placeholderHeight : 120,
          marginBottom: kind !== nextKind ? 6 : 14,
          contain: "strict",
        }}
      />
    );
  }

  const isWrapTail = kind !== 'main';

  return (
    <div
      data-testid="sequence-view-line"
      data-line-start={line.start}
      data-line-idx={Number.isFinite(lineIndex) ? lineIndex : undefined}
      data-wraptail-kind={kind}
      data-wraps-origin={line.wrapsOrigin ? "true" : undefined}
      data-wrap-at={line.wrapsOrigin ? String(line.wrapAt) : undefined}
      data-tracks-ready={tracksReady ? "true" : "false"}
      style={{
        // Wrap-tail lines render dimmed so they read as «context»;
        // pointer-events stay live during a drag so biolog can
        // extend a selection across the origin (round-8). The
        // useSelectionState resolver gates wrap-tail engagement by
        // its `extending` flag — pointermove during a drag accepts,
        // a plain click bails.
        position: 'relative',
        opacity: isWrapTail ? 0.6 : undefined,
        // Round-15c (06.05.2026 «рамка выделения сдвинута»): accent
        // stripe was border-left:3px + padding-left:4px. That 7 px
        // push shifted the row's CONTENT BOX 7 px right of
        // el.offsetLeft, but SelectionOverlay / CaretOverlay measure
        // from el.offsetLeft directly → selection rects landed 7 px
        // LEFT of the actual chars on wrap-tail rows. Switched to an
        // INSET box-shadow (paint-only, zero layout cost) so wrap-tail
        // rows share the exact char-grid origin with main rows.
        boxShadow: isWrapTail ? 'inset 3px 0 0 var(--accent-500, #f97316)' : undefined,
        background: isWrapTail ? 'color-mix(in oklab, var(--accent-500, #f97316) 4%, transparent)' : undefined,
        // Block hierarchy: each line = ruler + DNA + annotation + AA
        // is ONE logical unit. Inter-block separator (paddingBottom 14
        // + 1 px dashed divider + marginBottom 14 → ≈28 px gap) tells
        // the biolog where one DNA segment ends and the next begins.
        // Round-9: SUPPRESS the divider on a wrap-tail / main
        // boundary — origin marker takes over as the visual cue.
        // boundaryAhead is true when this row precedes a different-
        // kind row (last main before trailing-wrap, last leading-wrap
        // before main). Tighten the gap to a few px for the marker
        // to sit in.
        marginBottom: kind !== nextKind ? 6 : 14,
        paddingBottom: kind !== nextKind ? 4 : 14,
        borderBottom: kind !== nextKind ? 'none' : "1px dashed var(--border-default, #c9c5c1)",
        // Browser-level paint isolation: scroll-induced repaints stay
        // inside this line's box, neighbours don't repaint.
        contain: "paint",
        // `content-visibility: auto` was removed 2026-05-06 (round 2)
        // — biolog: «как будто 60 Hz а хочется 90-120». auto-mode
        // realises off-screen lines as they enter the viewport, which
        // costs ~16-32 ms per realisation pass and breaks the
        // 11-ms frame budget for high-refresh displays. Eager paint
        // keeps every line pre-rendered, so scroll is a paint-only
        // pass within the contain:paint box.
        // PERF-5 (06.05.2026 round 3): translateZ(0) + backfaceVisibility
        // hidden was DROPPED. On weak integrated GPUs, ~60 forced
        // layers per plasmid generated more compositor work than the
        // contain:paint isolation already provides. contain:paint
        // alone keeps repaints localised; we skip the layer
        // promotion to reduce GPU memory + composite cost.
      }}
    >
      {/*
        * Two-phase render. First paint shows only the cheap,
        * orientation-critical tracks (ruler + DNA strands). Heavier
        * tracks render after `tracksReady` flips via
        * requestIdleCallback at the parent.
        */}
      {tracksReady ? (
        <RestrictionTrack
          sites={reSites}
          lineStart={line.start}
          lineLen={line.seq.length}
          charPx={charPx}
          labelChars={LABEL_WIDTH}
          reOrientation={reOrientation}
          onSiteClick={onRestrictionClick}
          highlightedKey={restrictionHighlightKey}
          hoveredKey={hoveredRestrictionKey}
          onHoverChange={onRestrictionHover}
          wrapsOrigin={line.wrapsOrigin === true}
          wrapAt={line.wrapsOrigin ? line.wrapAt : undefined}
          seqLength={line.wrapsOrigin ? seqLength : undefined}
        />
      ) : null}
      <RulerTrack
        lineStart={line.start}
        lineLen={line.seq.length}
        charPx={charPx}
        labelChars={LABEL_WIDTH}
        wrapAt={line.wrapsOrigin ? line.wrapAt : undefined}
        seqLength={line.wrapsOrigin ? seqLength : undefined}
      />
      {/* Round-10 inline origin divider: vertical bar + label INSIDE
          the line at column `wrapAt`. Biolog «просто поставить
          вертикальный разделитель и все. но новой строки быть не
          должно». */}
      {line.wrapsOrigin && line.wrapAt > 0 && (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            left: (LABEL_WIDTH + line.wrapAt) * charPx - 1,
            top: 0,
            bottom: 0,
            width: 2,
            background: 'var(--accent-500, #f97316)',
            pointerEvents: 'none',
            zIndex: 3,
          }}
        >
          <span
            style={{
              position: 'absolute',
              left: -28,
              top: -2,
              fontSize: 9,
              fontWeight: 600,
              color: '#fff',
              background: 'var(--accent-500, #f97316)',
              padding: '1px 5px',
              borderRadius: 3,
              fontFamily: 'var(--font-mono, monospace)',
              letterSpacing: '0.04em',
              whiteSpace: 'nowrap',
              boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
            }}
          >▶ 1</span>
        </div>
      )}
      {/* V102 (23.05.2026) — затенить wrap-половину bridge-строки
          (псевдоначало после разделителя ▶1). Bridge-строка имеет
          kind:'main', поэтому row-level opacity её не затеняет; overlay-
          вуаль перекрывает [wrapAt, конец) разом — без per-char правок в
          треках. Тот же приём, что у inline origin-divider выше, но
          zIndex:2 (под чертой ▶1, над треками). pointerEvents:none —
          чтобы drag-выделение по псевдоначалу не блокировалось. */}
      {line.wrapsOrigin && line.wrapAt < line.seq.length && (
        <div
          aria-hidden
          data-testid="wrap-bridge-veil"
          style={{
            position: 'absolute',
            left: (LABEL_WIDTH + line.wrapAt) * charPx,
            width: (line.seq.length - line.wrapAt) * charPx,
            top: 0,
            bottom: 0,
            // Theme-aware translucent surface — washes the wrap-half to
            // the same muted read as the `opacity:0.6` trailing-wrap rows
            // below it (не хардкодим белый). Точный тон — на приёмке.
            background: 'var(--surface-1, #ffffff)',
            opacity: 0.5,
            pointerEvents: 'none',
            zIndex: 2,
          }}
        />
      )}
      {/*
        * DNA-first layout (03.05.2026): both DNA strands render
        * IMMEDIATELY after the ruler so the biolog's eye lands on
        * nucleotide letters first. Annotations + AA render BELOW.
        */}
      {/* Forward primers sit ABOVE the top strand, arrows → (Игорь
          18.05.2026 — «по обе стороны от цепи»). */}
      {tracksReady ? (
        <PrimerTrack
          primers={primers}
          entryId={entryId}
          documentHash={documentHash}
          topology={topology}
          fullSeq={fullSeq}
          lineStart={line.start}
          lineLen={line.seq.length}
          charPx={charPx}
          labelChars={LABEL_WIDTH}
          primerStyle={primerStyle}
          directionFilter="forward"
          onPrimerClick={onPrimerClick}
          onPrimerDoubleClick={onPrimerDoubleClick}
          selectedPrimerKeys={selectedPrimerKeys}
          wrapsOrigin={line.wrapsOrigin === true}
          wrapAt={line.wrapsOrigin ? line.wrapAt : undefined}
          seqLength={line.wrapsOrigin ? seqLength : undefined}
          circular={circular}
        />
      ) : null}
      <StrandsTrack
        lineStart={line.start}
        seq={line.seq}
        annMap={annMap}
        labelChars={LABEL_WIDTH}
        showBottomStrand={showBottomStrand}
        which="top"
        charPx={charPx}
        cutPositions={reCutLayout.topCuts}
        overhangs={reCutLayout.overhangs}
        bindingHighlights={reCutLayout.bindingHighlights}
        gutterLabel={referenceGutterLabel}
        blankRanges={recessBlanks}
      />
      {showBottomStrand && (
        <StrandsTrack
          lineStart={line.start}
          seq={line.seq}
          annMap={annMap}
          labelChars={LABEL_WIDTH}
          showBottomStrand
          which="bottom"
          charPx={charPx}
          cutPositions={reCutLayout.botCuts}
          overhangs={reCutLayout.overhangs}
          bindingHighlights={reCutLayout.bindingHighlights}
          terminalLeft={terminalStagger && line.start === 0 ? terminalStagger.left : null}
          terminalRight={terminalStagger && (line.start + line.seq.length === seqLength) ? terminalStagger.right : null}
          blankRanges={recessBlanks}
        />
      )}
      {/* Reverse primers sit BELOW the strand, arrows ← (Игорь
          18.05.2026 — «обратный внизу»). */}
      {tracksReady ? (
        <PrimerTrack
          primers={primers}
          entryId={entryId}
          documentHash={documentHash}
          topology={topology}
          fullSeq={fullSeq}
          lineStart={line.start}
          lineLen={line.seq.length}
          charPx={charPx}
          labelChars={LABEL_WIDTH}
          primerStyle={primerStyle}
          directionFilter="reverse"
          onPrimerClick={onPrimerClick}
          onPrimerDoubleClick={onPrimerDoubleClick}
          selectedPrimerKeys={selectedPrimerKeys}
          wrapsOrigin={line.wrapsOrigin === true}
          wrapAt={line.wrapsOrigin ? line.wrapAt : undefined}
          seqLength={line.wrapsOrigin ? seqLength : undefined}
          circular={circular}
        />
      ) : null}
      {tracksReady && showAnnotations ? (
        <AnnotationTrack
          regions={features}
          lineStart={line.start}
          lineLen={line.seq.length}
          charPx={charPx}
          labelChars={LABEL_WIDTH}
          onAnnotationClick={onAnnotationClick}
          selectedRegionId={selectedRegionId}
          onPointerDownEdge={onAnnotationEdgePointerDown}
          draggedAnnotationId={draggedAnnotationId}
          draggedEdge={draggedEdge}
          draggedCurrentCoord={draggedCurrentCoord}
          onAnnotationDoubleClick={onAnnotationDoubleClick}
          onAnnotationFeatureDoubleClick={onAnnotationFeatureDoubleClick}
          // M-X.5 hotfix (07.05.2026) — bridge-line wrap awareness.
          // Passes through `line.wrapsOrigin` / `line.wrapAt` /
          // `seqLength` so AnnotationTrack can paint a paired rect
          // for annotations that span the orange origin divider.
          // For non-bridge rows these props are undefined / false
          // and AnnotationTrack falls through to its legacy
          // single-rect render path.
          wrapsOrigin={line.wrapsOrigin === true}
          wrapAt={line.wrapsOrigin ? line.wrapAt : undefined}
          seqLength={line.wrapsOrigin ? seqLength : undefined}
        />
      ) : null}
      {tracksReady && (alignmentReads && alignmentReads.length
        ? alignmentReads
        : (alignmentRead ? [{ readByRefPos: alignmentRead.readByRefPos, insertions: alignmentRead.insertions, name: alignmentReadName, aaEffects, onAcceptBase }] : [])
      ).map((rd, i) => (
        <AlignmentReadTrack
          key={`read-${i}`}
          lineStart={line.start}
          lineLen={line.seq.length}
          charPx={charPx}
          labelChars={LABEL_WIDTH}
          alignmentRead={rd}
          colorMode={alignmentColorMode}
          readName={rd.name}
          aaEffects={rd.aaEffects}
          doublePeaks={rd.doublePeaks}
          isConsensus={rd.isConsensus}
          onAcceptBase={rd.onAcceptBase}
        />
      ))}
      {tracksReady && !(alignmentReads && alignmentReads.length) && alignmentRead && chromatogram ? (
        <AlignmentChromatogramTrack
          lineStart={line.start}
          lineLen={line.seq.length}
          charPx={charPx}
          labelChars={LABEL_WIDTH}
          alignmentRead={alignmentRead}
          chromatogram={chromatogram}
          maxVal={chromatogramMaxVal}
        />
      ) : null}
      {tracksReady && showAATrack ? (
        <AATrack
          fullSeq={fullSeq}
          lineStart={line.start}
          lineLen={line.seq.length}
          labelChars={LABEL_WIDTH}
          strategy={framesResolution.strategy}
          framesMode={framesMode}
          orfRanges={orfRanges}
          dominantCDS={framesResolution.dominant}
          regions={features}
          strandFilter="forward"
          visibleFrames={visibleFrames}
          terminalCut={terminalStagger ? { left: !!terminalStagger.left, right: !!terminalStagger.right } : null}
          onAAClick={onAAClick}
        />
      ) : null}
      {tracksReady && showAATrack && renderHybrid ? (
        <AATrack
          fullSeq={fullSeq}
          lineStart={line.start}
          lineLen={line.seq.length}
          labelChars={LABEL_WIDTH}
          strategy={framesResolution.strategy}
          framesMode={framesMode}
          orfRanges={orfRanges}
          dominantCDS={framesResolution.dominant}
          regions={features}
          strandFilter="reverse"
          visibleFrames={visibleFrames}
          onAAClick={onAAClick}
        />
      ) : null}
    </div>
  );
}, sequenceLineEqual);

export default SequenceLine;
