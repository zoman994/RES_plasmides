import {
  useLayoutEffect, useMemo, useRef, useState,
} from "react";
import { tf } from "../../i18n";
import SequenceLine from "./SequenceLine";
import {
  clampCharsPerLine, linesFromSeq, measureCharPx,
} from "./lib/grid";
import { buildWrapBridgeLine } from "./lib/wrap-tail";
import { resolveFramesMode } from "./lib/frames-mode";
import { detectORFRanges } from "./lib/orf-ranges";
import { LABEL_WIDTH } from "./constants";
import { restrictionSiteKey } from "../../lib/restriction-occurrence.js";
import "./popups/PrimerBindingInspector.css";

const DEFAULT_CHAR_PX = 7.2;
const DEFAULT_CHARS_PER_LINE = 80;
const CONTEXT_BP = 8;
const EMPTY = Object.freeze([]);
const DEFAULT_VISIBLE_FRAMES = Object.freeze({
  "+1": true, "+2": true, "+3": true,
  "-1": true, "-2": true, "-3": true,
});

function segmentCoveredByBridge(segment, bridge, length) {
  if (!bridge) return false;
  const wrappedEnd = bridge.seq.length - bridge.wrapAt;
  return (segment.start >= bridge.start && segment.end <= length)
    || (segment.start >= 0 && segment.end <= wrappedEnd);
}

function syntheticOriginBridge(sequence, charsPerLine) {
  const length = sequence.length;
  if (!length) return null;
  const leftLength = Math.min(length, Math.max(1, Math.floor(charsPerLine / 2)));
  const rightLength = Math.min(length, Math.max(1, charsPerLine - leftLength));
  const start = length - leftLength;
  return {
    start,
    seq: sequence.slice(start) + sequence.slice(0, rightLength),
    wrapAt: leftLength,
    kind: "main",
    wrapsOrigin: true,
  };
}

/**
 * Pick only the real Sequence Viewer rows needed to read one landing. Absolute
 * molecule coordinates are retained; nothing is sliced/rebased into a second
 * coordinate system. Circular tail/landing crossings use the viewer's own
 * inline origin bridge.
 */
export function landingPreviewLines(
  template,
  occurrence,
  tailLength = 0,
  charsPerLine = DEFAULT_CHARS_PER_LINE,
) {
  const sequence = typeof template === "string" ? template : "";
  const length = sequence.length;
  const segments = Array.isArray(occurrence?.segments) ? occurrence.segments : [];
  if (!length || !segments.length) return [];
  const cpl = Math.max(1, Math.floor(charsPerLine || DEFAULT_CHARS_PER_LINE));

  const circular = occurrence?.topology === "circular"
    || occurrence?.target?.topology === "circular"
    || occurrence?.wrapsOrigin === true;
  const strand = occurrence?.strand === -1 ? -1 : 1;
  const first = segments[0];
  const last = segments[segments.length - 1];
  const tailCrossesOrigin = circular && (strand === 1
    ? first.start - tailLength < 0
    : last.end + tailLength > length);
  const needsBridge = circular && (occurrence?.wrapsOrigin === true || tailCrossesOrigin);
  const bridge = needsBridge
    ? (buildWrapBridgeLine({ fullSeq: sequence, cpl, circular: true })
      || syntheticOriginBridge(sequence, cpl))
    : null;
  const allLines = linesFromSeq(sequence, cpl);
  const indexes = new Set();

  const addLinearRange = (rawStart, rawEnd) => {
    const start = Math.max(0, Math.floor(rawStart));
    const end = Math.min(length, Math.ceil(rawEnd));
    if (end <= start) return;
    if (bridge) {
      const wrappedEnd = bridge.seq.length - bridge.wrapAt;
      const covered = (start >= bridge.start && end <= length)
        || (start >= 0 && end <= wrappedEnd);
      if (covered) return;
    }
    const firstIndex = Math.floor(start / cpl);
    const lastIndex = Math.floor((end - 1) / cpl);
    for (let index = firstIndex; index <= lastIndex; index += 1) indexes.add(index);
  };

  const addRange = (start, end) => {
    if (!circular) {
      addLinearRange(start, end);
      return;
    }
    const span = Math.max(0, end - start);
    if (!span) return;
    if (span >= length) {
      addLinearRange(0, length);
      return;
    }
    const normalizedStart = ((Math.floor(start) % length) + length) % length;
    const normalizedEnd = normalizedStart + span;
    if (normalizedEnd <= length) {
      addLinearRange(normalizedStart, normalizedEnd);
      return;
    }
    addLinearRange(normalizedStart, length);
    addLinearRange(0, normalizedEnd - length);
  };

  for (const segment of segments) {
    if (bridge && segmentCoveredByBridge(segment, bridge, length)) continue;
    addRange(segment.start, segment.end);
  }
  if (strand === 1) {
    addRange(first.start - tailLength - CONTEXT_BP, first.start);
    addRange(last.end, last.end + CONTEXT_BP);
  } else {
    addRange(first.start - CONTEXT_BP, first.start);
    addRange(last.end, last.end + tailLength + CONTEXT_BP);
  }

  const picked = [...indexes]
    .sort((a, b) => a - b)
    .map((index) => allLines[index])
    .filter(Boolean);
  if (!bridge) return picked;

  // Read a circular landing in physical order: the row containing the first
  // visible base, then the origin bridge, then the low-coordinate rows. A
  // numeric sort cannot express that order (880, bridge, 0, 80).
  const rawViewStart = strand === 1
    ? first.start - tailLength - CONTEXT_BP
    : first.start - CONTEXT_BP;
  const viewStart = ((Math.floor(rawViewStart) % length) + length) % length;
  const wrappedEnd = bridge.seq.length - bridge.wrapAt;
  const distanceFromViewStart = (line) => {
    const containsStart = line.wrapsOrigin
      ? (viewStart >= line.start || viewStart < wrappedEnd)
      : (viewStart >= line.start && viewStart < line.start + line.seq.length);
    if (containsStart) return 0;
    return (line.start - viewStart + length) % length;
  };
  return [bridge, ...picked.filter((line) => line.start !== bridge.start)]
    .sort((a, b) => distanceFromViewStart(a) - distanceFromViewStart(b));
}

function SharedTrackRows({
  testId, lines, fullSeq, features, primers, reSites,
  topology, entryId, documentHash, viewSettings, frameContext, charPx,
}) {
  const [highlightedRestriction, setHighlightedRestriction] = useState(null);
  const [hoveredRestriction, setHoveredRestriction] = useState(null);
  const circular = topology === "circular";
  return (
    <div data-testid={testId} className="primer-binding-inspector__shared-rows">
      {lines.map((line, index) => (
        <SequenceLine
          key={`${line.start}:${line.wrapsOrigin ? "wrap" : "main"}`}
          line={line}
          kind="main"
          nextKind="main"
          seqLength={fullSeq.length}
          circular={circular}
          topology={topology}
          entryId={entryId}
          documentHash={documentHash}
          fullSeq={fullSeq}
          features={features}
          primers={primers}
          selectedPrimerKeys={EMPTY}
          reSites={reSites}
          charPx={charPx}
          showBottomStrand={viewSettings.showBottomStrand !== false}
          primerStyle={viewSettings.primerStyle || "filled"}
          reOrientation={viewSettings.reOrientation || "horizontal"}
          tracksReady
          showAnnotations={features.length > 0}
          showAATrack={frameContext.showAATrack}
          framesMode={frameContext.framesMode}
          visibleFrames={frameContext.visibleFrames}
          framesResolution={frameContext.framesResolution}
          orfRanges={frameContext.orfRanges}
          renderHybrid={frameContext.renderHybrid}
          onRestrictionClick={(site) => setHighlightedRestriction(
            restrictionSiteKey(site),
          )}
          restrictionHighlightKey={highlightedRestriction}
          hoveredRestrictionKey={hoveredRestriction}
          onRestrictionHover={setHoveredRestriction}
          lineIndex={index}
        />
      ))}
    </div>
  );
}

export default function SequenceLandingPreview({
  template = "", occurrence = null, primer = null, features = [],
  templateReSites = [], productSequence = "", productReSites = [],
  topology = "linear", entryId = null, documentHash = null,
  viewSettings = {},
}) {
  const viewportRef = useRef(null);
  const [charPx, setCharPx] = useState(DEFAULT_CHAR_PX);
  const [charsPerLine, setCharsPerLine] = useState(DEFAULT_CHARS_PER_LINE);
  const frameContext = useMemo(() => {
    const orfRanges = Array.isArray(viewSettings.orfRanges)
      ? viewSettings.orfRanges
      : detectORFRanges(template, 20);
    const overrideFrame = viewSettings.overrideFrame;
    const hasOverride = overrideFrame === 0 || overrideFrame === 1 || overrideFrame === 2;
    const framesMode = hasOverride ? "all" : (viewSettings.framesMode || "single");
    const framesResolution = viewSettings.framesResolution || resolveFramesMode(
      framesMode,
      viewSettings.autoThreshold,
      features,
      template.length,
      orfRanges,
    );
    return {
      showAATrack: viewSettings.showAATrack !== false,
      framesMode,
      framesResolution,
      orfRanges,
      renderHybrid: hasOverride ? true : (
        viewSettings.renderHybrid ?? framesResolution.strategy === "hybrid"
      ),
      visibleFrames: hasOverride
        ? {
          "+1": overrideFrame === 0, "+2": overrideFrame === 1, "+3": overrideFrame === 2,
          "-1": false, "-2": false, "-3": false,
        }
        : (viewSettings.visibleFrames || DEFAULT_VISIBLE_FRAMES),
    };
  }, [features, template, viewSettings]);

  useLayoutEffect(() => {
    const host = viewportRef.current;
    if (!host) return undefined;
    const remeasure = () => {
      const measuredCharPx = measureCharPx(host);
      const available = host.clientWidth;
      if (!measuredCharPx || available <= 0) return;
      const fitChars = Math.floor(available / measuredCharPx) - LABEL_WIDTH;
      const nextCharsPerLine = clampCharsPerLine(fitChars);
      setCharPx((current) => (current === measuredCharPx ? current : measuredCharPx));
      setCharsPerLine((current) => (
        current === nextCharsPerLine ? current : nextCharsPerLine
      ));
    };
    remeasure();
    if (typeof ResizeObserver !== "function") return undefined;
    const observer = new ResizeObserver(remeasure);
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  const templateLines = landingPreviewLines(
    template,
    occurrence ? { ...occurrence, topology } : null,
    occurrence?.unpairedPrefixLength
      ?? String(occurrence?.tail ?? primer?.tail ?? "").length,
    charsPerLine,
  );
  if (!templateLines.length) return null;
  const productLines = productReSites.length
    ? linesFromSeq(productSequence, charsPerLine)
    : [];

  return (
    <figure
      data-testid="primer-binding-preview"
      data-chars-per-line={charsPerLine}
      data-char-px={charPx}
      className="primer-binding-inspector__preview"
      aria-label={tf("primer.modal.binding-preview-title")}
    >
      <figcaption className="primer-binding-inspector__preview-header">
        <strong>{tf("primer.modal.binding-preview-title")}</strong>
      </figcaption>
      <div ref={viewportRef} className="primer-binding-inspector__viewport">
        <SharedTrackRows
          testId="primer-binding-template-preview"
          lines={templateLines}
          fullSeq={template}
          features={features}
          primers={primer ? [primer] : EMPTY}
          reSites={templateReSites}
          topology={topology}
          entryId={entryId}
          documentHash={documentHash}
          viewSettings={viewSettings}
          frameContext={frameContext}
          charPx={charPx}
        />
        {productLines.length > 0 && (
          <section className="primer-binding-inspector__product">
            <strong className="primer-binding-inspector__product-title">
              {tf("primer.modal.binding-preview-pcr-sites")}
            </strong>
            <SharedTrackRows
              testId="primer-binding-product-preview"
              lines={productLines}
              fullSeq={productSequence}
              features={EMPTY}
              primers={EMPTY}
              reSites={productReSites}
              topology="linear"
              entryId={null}
              documentHash={null}
              viewSettings={viewSettings}
              frameContext={{
                showAATrack: false,
                framesMode: "single",
                visibleFrames: DEFAULT_VISIBLE_FRAMES,
                framesResolution: { strategy: "single", dominant: null, coverage: 0 },
                orfRanges: EMPTY,
                renderHybrid: false,
              }}
              charPx={charPx}
            />
          </section>
        )}
      </div>
    </figure>
  );
}
