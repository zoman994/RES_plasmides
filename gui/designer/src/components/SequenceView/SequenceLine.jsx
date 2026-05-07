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
import RulerTrack from "./tracks/RulerTrack.jsx";
import StrandsTrack from "./tracks/StrandsTrack.jsx";
import AnnotationTrack from "./tracks/AnnotationTrack.jsx";
import AATrack from "./tracks/AATrack.jsx";
import PrimerTrack from "./tracks/PrimerTrack.jsx";
import RestrictionTrack from "./tracks/RestrictionTrack.jsx";

const SequenceLine = memo(function SequenceLine({
  line,
  fullSeq,
  features,
  primers,
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
}) {
  const annMap = useMemo(
    () => buildLineAnnMap(features, line.start, line.seq.length),
    [features, line.start, line.seq.length],
  );

  const isWrapTail = kind !== 'main';

  return (
    <div
      data-testid="sequence-view-line"
      data-line-start={line.start}
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
        <PrimerTrack
          primers={primers}
          fullSeq={fullSeq}
          lineStart={line.start}
          lineLen={line.seq.length}
          charPx={charPx}
          labelChars={LABEL_WIDTH}
          primerStyle={primerStyle}
        />
      ) : null}
      {tracksReady ? (
        <RestrictionTrack
          sites={reSites}
          lineStart={line.start}
          lineLen={line.seq.length}
          charPx={charPx}
          labelChars={LABEL_WIDTH}
          reOrientation={reOrientation}
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
      {/*
        * DNA-first layout (03.05.2026): both DNA strands render
        * IMMEDIATELY after the ruler so the biolog's eye lands on
        * nucleotide letters first. Annotations + AA render BELOW.
        */}
      <StrandsTrack
        lineStart={line.start}
        seq={line.seq}
        annMap={annMap}
        labelChars={LABEL_WIDTH}
        showBottomStrand={showBottomStrand}
        which="top"
      />
      {showBottomStrand && (
        <StrandsTrack
          lineStart={line.start}
          seq={line.seq}
          annMap={annMap}
          labelChars={LABEL_WIDTH}
          showBottomStrand
          which="bottom"
        />
      )}
      {tracksReady ? (
        <AnnotationTrack
          regions={features}
          lineStart={line.start}
          lineLen={line.seq.length}
          charPx={charPx}
          labelChars={LABEL_WIDTH}
          onAnnotationClick={onAnnotationClick}
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
      {tracksReady ? (
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
        />
      ) : null}
      {tracksReady && renderHybrid ? (
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
        />
      ) : null}
    </div>
  );
});

export default SequenceLine;
