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
  settings,
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
  // Sprint M-X.2 K5 — inline rename on double-click.
  onAnnotationDoubleClick,
}) {
  const annMap = useMemo(
    () => buildLineAnnMap(features, line.start, line.seq.length),
    [features, line.start, line.seq.length],
  );

  return (
    <div
      data-testid="sequence-view-line"
      data-line-start={line.start}
      data-tracks-ready={tracksReady ? "true" : "false"}
      style={{
        // Block hierarchy: each line = ruler + DNA + annotation + AA
        // is ONE logical unit. Inter-block separator (paddingBottom 14
        // + 1 px dashed divider + marginBottom 14 → ≈28 px gap) tells
        // the biolog where one DNA segment ends and the next begins.
        marginBottom: 14,
        paddingBottom: 14,
        borderBottom: "1px dashed var(--border-default, #c9c5c1)",
        // Browser-level paint isolation: scroll-induced repaints stay
        // inside this line's box, neighbours don't repaint.
        contain: "paint",
        // `content-visibility: auto` — skips layout + paint of
        // off-screen lines entirely. happy-dom bypasses this so
        // existing tests find the full DOM tree synchronously.
        contentVisibility: __IS_TEST_ENV__ ? "visible" : "auto",
        containIntrinsicSize: "auto 220px",
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
          primerStyle={settings.primerStyle}
        />
      ) : null}
      {tracksReady ? (
        <RestrictionTrack
          sites={reSites}
          lineStart={line.start}
          lineLen={line.seq.length}
          charPx={charPx}
          labelChars={LABEL_WIDTH}
          reOrientation={settings.reOrientation}
        />
      ) : null}
      <RulerTrack
        lineStart={line.start}
        lineLen={line.seq.length}
        charPx={charPx}
        labelChars={LABEL_WIDTH}
      />
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
        showBottomStrand={settings.showBottomStrand}
        which="top"
      />
      {settings.showBottomStrand && (
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
        />
      ) : null}
      {tracksReady ? (
        <AATrack
          fullSeq={fullSeq}
          lineStart={line.start}
          lineLen={line.seq.length}
          labelChars={LABEL_WIDTH}
          strategy={framesResolution.strategy}
          framesMode={settings.framesMode}
          orfRanges={orfRanges}
          dominantCDS={framesResolution.dominant}
          regions={features}
          strandFilter="forward"
          visibleFrames={settings.visibleFrames}
        />
      ) : null}
      {tracksReady && renderHybrid ? (
        <AATrack
          fullSeq={fullSeq}
          lineStart={line.start}
          lineLen={line.seq.length}
          labelChars={LABEL_WIDTH}
          strategy={framesResolution.strategy}
          framesMode={settings.framesMode}
          orfRanges={orfRanges}
          dominantCDS={framesResolution.dominant}
          regions={features}
          strandFilter="reverse"
          visibleFrames={settings.visibleFrames}
        />
      ) : null}
    </div>
  );
});

export default SequenceLine;
