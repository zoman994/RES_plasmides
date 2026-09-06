/**
 * PrimerTrack — primer binding overlay (Sprint M-B.3, K5).
 *
 * Search forward primers on top strand (indexOf bind), reverse primers
 * by reverse-complementing the binding sequence and indexOf'ing on top
 * strand. Deduplicate by (name, start) so a primer cannot get drawn
 * twice on the same line.
 *
 * Redesign 18.05.2026 (Игорь): «форвард и реверс по обе стороны от
 * цепи (обратный внизу); сам праймер — стрелка, последовательность
 * вписана». A primer hit is now drawn as a DIRECTED ARROW (pentagon:
 * 5′ flat tail → 3′ pointed head) with its binding bases inscribed
 * INSIDE the arrow body, grid-aligned to the char columns. Forward
 * arrows point right, reverse point left. `directionFilter` lets the
 * caller render only one strand's primers so SequenceLine can place
 * forward ABOVE the DNA and reverse BELOW it. Clickability /
 * selection model unchanged: `onPrimerClick(primerKey, hit)` +
 * `selectedKeys` are consumer-gated (absent ⇒ decorative,
 * pointer-events:none — full back-compat). The 2-primer flank
 * highlight stays owned by SequenceView (segment-zone overlay).
 */

import { memo, Fragment } from "react";
import { tf } from "../../../i18n";
import { projectPrimerPool } from "../../../lib/primer-site-projection";
import { evaluateStandardPcrAnnealing } from "../../../lib/primer-annealing-policy";
import { reverseComplement } from "../../../sequence-utils";
import {
  alignmentDisplay,
  alignmentDisplayForSegment,
} from "../lib/primer-alignment-glyphs";
import PrimerStepGlyph, {
  PRIMER_ARROW_HEAD as HEAD,
  PRIMER_GLYPH_HEIGHT as ARROW_H,
  PRIMER_LABEL_CHAR_WIDTH,
  PRIMER_STEP_OFFSET,
} from "./PrimerStepGlyph";
import {
  packPrimerTrackBands,
  primerBandSpans,
  primerTailOf,
  projectPrimerTail,
  resolvePrimerInsertionTiers,
} from "./primer-track-layout";

/**
 * Stable per-hit key (matches SequenceView's primer-selection model).
 *
 * ANN-0L C3 — the canonical OCCURRENCE key when the projection supplied one.
 * `name|direction|start` collided whenever two records shared a name and a
 * locus (the ordinary case for a re-ordered oligo), so selecting one selected
 * both; and an origin-crossing binding, drawn in two pieces, produced two
 * different keys for what is one logical site.
 */
export function primerHitKey(h) {
  if (h && h._occKey) return h._occKey;
  return `${h.name || ""}|${h.direction || ""}|${h.start}`;
}

/**
 * Every key a hit answers to for SELECTION.
 *
 * The canonical occurrence key is the identity, but a caller that stored the
 * older `name|direction|start` form must not silently lose its selection, so
 * both are accepted. Only the canonical key is ever handed out.
 */
function selectionKeys(h) {
  const legacy = `${h.name || ""}|${h.direction || ""}|${h.start}`;
  return h && h._occKey ? [h._occKey, legacy] : [legacy];
}

/**
 * Where each primer binds, via the ONE shared projection (ANN-0L).
 *
 * A source site always wins. Scanning the template with `indexOf` used to
 * invent extra hits on a repetitive molecule and, worse, silently disagreed
 * with the maps. The projection falls back to an exact search only when the
 * record has no source site for this molecule, and marks those `computed`.
 *
 * A record with no site at all yields no hit here — and still exists in the
 * primer list, which is where the user manages it.
 */
function findHits(primers, fullSeq, ctx = {}, projectedOccurrences = null) {
  if (!Array.isArray(primers) || primers.length === 0 || !fullSeq) return [];
  const occurrences = Array.isArray(projectedOccurrences)
    ? projectedOccurrences
    : projectPrimerPool(primers, { template: fullSeq, ...ctx });
  // Keyed by position, not by `p.id`: a legacy pool row may carry no id at all,
  // and two id-less primers must not collapse onto one another.
  const byId = new Map();
  (primers || []).forEach((p, i) => byId.set(p?.id ?? `#${i}`, p));

  // ANN-0L C3 — ONE ENTRY PER SEGMENT. Flattening an occurrence to a single
  // `{first.start, last.end}` pair painted straight through the gap between two
  // non-contiguous segments, and made an origin-crossing binding either vanish
  // or stretch across the whole molecule. Each segment is clipped on its own;
  // they remain ONE logical site because they share `_occKey`.
  return occurrences.flatMap((occ) => {
    const p = byId.get(occ.primerId) || {};
    // Only a SOURCE site overrides what the record itself says. A computed hit
    // is a location, not a new set of facts about the oligo: it must not
    // re-decide the strand or erase a tail the record already knows about.
    const fromSource = occ.evidence === 'source';
    const strandDir = occ.strand === -1 ? 'reverse' : (occ.strand === 1 ? 'forward' : null);
    const strandName = occ.strand === -1 ? 'reverse' : (occ.strand === 1 ? 'forward' : 'unknown');
    // The 5' end carries the overhang: the first segment for a forward primer,
    // the last for a reverse one. Drawing it on both would show an oligo
    // carrying its tail twice.
    const tailAt = occ.strand === -1 ? occ.segments.length - 1 : 0;
    const bindingTop = occ.oligoStatus === 'ok' && occ.annealedSequence
      ? (occ.strand === -1 ? reverseComplement(occ.annealedSequence) : occ.annealedSequence)
      : '';
    const aligned = alignmentDisplay(occ);
    const annealing = evaluateStandardPcrAnnealing(occ.alignment || {
      query: occ.oligoStatus === 'ok' ? String(occ.annealedSequence || '') : '',
      threePrimeMatchLength: occ.oligoStatus === 'ok'
        ? String(occ.annealedSequence || '').replace(/\s+/g, '').length
        : 0,
    });
    let bindingOffset = 0;

    return occ.segments.map((seg, i) => {
      const offset = bindingOffset;
      const segmentLength = seg.end - seg.start;
      bindingOffset += segmentLength;
      const segmentDisplay = alignmentDisplayForSegment(
        aligned, offset, segmentLength, i === occ.segments.length - 1,
      );
      return {
        ...p,
        // Genomic footprint of THIS segment — a 5' tail never lengthens it.
        start: seg.start,
        end: seg.end,
        _occKey: occ.key,
        _segIndex: i,
        _segCount: occ.segments.length,
        _evidence: occ.evidence,
        _visibility: occ.sourceVisibility,
        _strandName: strandName,
        _wraps: occ.wrapsOrigin,
        _oligoStatus: occ.oligoStatus,
        _bindingTop: bindingTop,
        _bindingOffset: offset,
        _alignmentGlyphs: segmentDisplay.glyphs,
        _alignmentInsertions: segmentDisplay.insertions,
        _annealingStatus: annealing.status,
        _threePrimeMatchLength: annealing.threePrimeMatchLength,
        tail: i === tailAt ? occ.tail : null,
        bindingSequence: occ.oligoStatus === 'ok' ? occ.annealedSequence : null,
        direction: fromSource ? (strandDir ?? p.direction ?? null) : (p.direction ?? strandDir),
      };
    });
  });
}

function intersects(a, b1, b2) {
  return a.start < b2 && a.end > b1;
}

/**
 * V102 §5.2 — clip a hit to a plasmid range [lo, hi) rendered starting at
 * render column `colBase`, tagging the segment. `_visStart`/`_visEnd` are
 * ABSOLUTE plasmid coords (for `upper.slice`); `_colStart` is the render
 * column. real segment: lo=lineStart, colBase=0 → _colStart = start −
 * lineStart (legacy). wrap segment: lo=0, colBase=wrapAt → _colStart =
 * wrapAt + start (start-of-plasmid shifted past the ▶1 divider).
 */
function clipHit(h, lo, hi, colBase, seg) {
  const visStart = Math.max(h.start, lo);
  const visEnd = Math.min(h.end, hi);
  return {
    ...h, _seg: seg, _visStart: visStart, _visEnd: visEnd, _colStart: colBase + (visStart - lo),
  };
}

/**
 * @param {object} props
 * @param {Array<{ name?, sequence?, bindingSequence?, direction, tmBinding? }>} props.primers
 * @param {string} props.fullSeq
 * @param {number} props.lineStart
 * @param {number} props.lineLen
 * @param {number} props.charPx
 * @param {number} props.labelChars
 * @param {'filled'|'outline'} props.primerStyle
 * @param {'forward'|'reverse'} [props.directionFilter] render one strand only
 * @param {(key:string, hit:object)=>void} [props.onPrimerClick] consumer-gated
 * @param {(hit:object)=>void} [props.onPrimerDoubleClick] consumer-gated
 * @param {string[]} [props.selectedPrimerKeys]
 * @param {string|null} [props.expandedPrimerKey]
 */
function PrimerTrack({
  primers,
  fullSeq,
  lineStart,
  lineLen,
  charPx,
  labelChars,
  projectedOccurrences = null,
  primerStyle,
  directionFilter,
  onPrimerClick,
  onPrimerDoubleClick,
  selectedPrimerKeys,
  expandedPrimerKey = null,
  // V102 §5.2 — wrap-bridge awareness. Defaults keep non-bridge rows
  // exactly as before; on a bridge row a primer binding at the start of
  // the plasmid (or crossing the origin) renders in the wrap-half.
  wrapsOrigin,
  wrapAt,
  seqLength,
  // Игорь 25.06 — on a CIRCULAR molecule a 5′-tail that runs off a sequence END
  // wraps to the other end (rendered on the wrap-bridge row across the origin),
  // so it must NOT dangle into the margin on the first/last line.
  circular,
  // ANN-0L C2 — which molecule, and which version of it, this view is showing.
  // Without them a source site declared elsewhere would be repeated here as if
  // it described the sequence on screen.
  entryId = null,
  documentHash = null,
  topology,
}) {
  if (!primers || primers.length === 0 || !lineLen || charPx <= 0) return null;

  const allHits = findHits(primers, fullSeq, {
    entryId,
    documentHash,
    topology: topology || (circular ? 'circular' : 'linear'),
  }, projectedOccurrences);
  const lineEnd = lineStart + lineLen;
  const seqLen = (fullSeq || "").length;
  const hasWrap = wrapsOrigin === true
    && Number.isFinite(wrapAt) && wrapAt > 0
    && Number.isFinite(seqLength) && seqLength > 0
    && wrapAt < lineLen;
  const wrapWidthChars = hasWrap ? lineLen - wrapAt : 0;
  const realEnd = hasWrap ? Math.min(lineEnd, seqLength) : lineEnd;
  let lineHits;
  if (hasWrap) {
    // Real end [lineStart, seqLength) in columns [0, wrapAt); plasmid
    // start [0, wrapWidthChars) in columns [wrapAt, lineLen). A primer
    // through the origin produces BOTH (two arrows — it «continues» past
    // the ▶1 divider, which is the point of wrap-tail).
    const real = allHits
      .filter((h) => intersects(h, lineStart, realEnd))
      .map((h) => clipHit(h, lineStart, realEnd, 0, "real"));
    const wrap = allHits
      .filter((h) => intersects(h, 0, wrapWidthChars))
      .map((h) => clipHit(h, 0, wrapWidthChars, wrapAt, "wrap"));
    lineHits = real.concat(wrap);
  } else {
    // V-tailwrap (24.05.2026) — a primer's 5′-tail occupies the columns just
    // 5′ of its binding; on a wrapped layout those columns can fall on the
    // ADJACENT line. Include a hit when its binding OR its on-sequence tail
    // span touches this line, so the tail can render on the line that holds
    // it (the binding clip below stays empty for a tail-only row → no arrow).
    lineHits = allHits
      .filter((h) => {
        const tl = primerTailOf(h).length;
        const fwd = h.direction !== "reverse";
        const lo = fwd ? Math.max(0, h.start - tl) : h.start;
        const hi = fwd ? h.end : Math.min(seqLen, h.end + tl);
        if (lo < lineEnd && hi > lineStart) return true;
        // Circular (Игорь 25.06) — a 5′-tail running off an end wraps to the OTHER
        // end. Keep the hit on whatever line renders those wrapped positions so the
        // tail draws there; its binding clip stays empty → no spurious arrow.
        if (circular && tl > 0 && seqLen > 0) {
          if (fwd && h.start - tl < 0) {
            const wStart = (((h.start - tl) % seqLen) + seqLen) % seqLen; // run [wStart, seqLen)
            if (wStart < lineEnd) return true;
          }
          if (!fwd && h.end + tl > seqLen) {
            const wEnd = h.end + tl - seqLen; // run [0, wEnd)
            if (wEnd > lineStart) return true;
          }
        }
        return false;
      })
      .map((h) => clipHit(h, lineStart, lineEnd, 0, "real"));
  }
  if (directionFilter === "forward" || directionFilter === "reverse") {
    lineHits = lineHits.filter((h) => (h.direction === "reverse" ? "reverse" : "forward") === directionFilter);
  }
  if (lineHits.length === 0) return null;

  const filled = primerStyle !== "outline";
  const widthPx = (labelChars + lineLen) * charPx;
  const hasClick = typeof onPrimerClick === "function";
  const hasDbl = typeof onPrimerDoubleClick === "function";
  const clickable = hasClick || hasDbl;
  const selSet = new Set(selectedPrimerKeys || []);
  // Per-base letters only when there's room (avoid clutter at tiny zoom).
  const showLetters = charPx >= 5;
  const baseFont = Math.min(11, Math.max(7, charPx * 0.82));
  const rawRenderHits = lineHits.map((hit, idx) => {
    const isFwd = hit.direction !== "reverse";
    const visStart = hit._visStart;
    const visEnd = hit._visEnd;
    const bindingVisible = visEnd > visStart;
    const xLeft = (labelChars + hit._colStart) * charPx;
    const W = Math.max(1, (visEnd - visStart) * charPx);
    const key = primerHitKey(hit);
    const selected = selectionKeys(hit).some((selectionKey) => selSet.has(selectionKey));
    const expanded = !hasClick
      || selectionKeys(hit).some((selectionKey) => selectionKey === expandedPrimerKey);
    const physicalHeadSegment = isFwd
      ? hit._segIndex === hit._segCount - 1
      : hit._segIndex === 0;
    const headHere = physicalHeadSegment
      && (isFwd ? hit._visEnd === hit.end : hit._visStart === hit.start);
    // Compact and expanded variants share one short label at the physical
    // 3′ head. The bases themselves belong inside the expanded glyph; putting
    // the full oligo into every line label made wrapped primers unreadable.
    const tmLabel = hit.tmBinding !== null && hit.tmBinding !== ''
      && Number.isFinite(Number(hit.tmBinding))
      ? `${hit.tmBinding}°`
      : '';
    const rawLabelText = `${hit.name || ''} ${tmLabel}`.trim();
    const baseOffset = (hit._bindingOffset || 0) + (visStart - hit.start);
    const clipOffset = visStart - hit.start;
    const alignmentGlyphs = hit._oligoStatus === 'ok' && Array.isArray(hit._alignmentGlyphs)
      ? hit._alignmentGlyphs.slice(clipOffset, clipOffset + (visEnd - visStart))
      : null;
    const fallbackBases = hit._oligoStatus === 'ok'
      ? (hit._bindingTop || '').slice(baseOffset, baseOffset + (visEnd - visStart))
      : '';
    const visibleInsertions = Array.isArray(hit._alignmentInsertions)
      ? hit._alignmentInsertions.filter((insertion) => (
        insertion.boundary >= clipOffset
        && (insertion.boundary < clipOffset + (visEnd - visStart)
          || (insertion.boundary === hit.end - hit.start && visEnd === hit.end))
      ))
      : [];
    const tail = hit._oligoStatus === 'ok' ? primerTailOf(hit) : "";
    const projectedTail = projectPrimerTail({
      hit, isFwd, tail, charPx, labelChars, lineStart, lineEnd, seqLen,
      bindingVisible, showLetters, hasWrap, wrapAt, wrapWidthChars, seqLength, circular,
    });
    const projectedSeparateTail = projectedTail.separateTail;
    const adjacentSeparateTail = bindingVisible && projectedSeparateTail && (
      isFwd
        ? Math.abs(projectedSeparateTail.x + projectedSeparateTail.w - xLeft) < 0.5
        : Math.abs(projectedSeparateTail.x - (xLeft + W)) < 0.5
    ) ? projectedSeparateTail : null;
    const inlineTail = projectedTail.inlineTail || Boolean(adjacentSeparateTail);
    const tailX = projectedTail.inlineTail
      ? (isFwd ? -projectedTail.tailWidth : W)
      : (adjacentSeparateTail ? adjacentSeparateTail.x - xLeft : null);
    const localTailWidth = projectedTail.inlineTail
      ? projectedTail.tailWidth
      : (adjacentSeparateTail?.w || 0);
    const tailProjection = {
      ...projectedTail,
      inlineTail,
      tailX,
      tailWidth: localTailWidth,
      tailBases: projectedTail.inlineTail ? tail : (adjacentSeparateTail?.bases || ''),
      promotedTail: adjacentSeparateTail,
      separateTail: adjacentSeparateTail ? null : projectedSeparateTail,
    };
    // The visible name/Tm is part of the painted footprint. Reserve it before
    // row packing so another primer cannot be drawn through the label.
    const maxLabelChars = headHere && rawLabelText
      ? Math.max(0, Math.floor((widthPx - 4) / PRIMER_LABEL_CHAR_WIDTH))
      : 0;
    const labelText = maxLabelChars > 0
      ? (rawLabelText.length > maxLabelChars
        ? `${rawLabelText.slice(0, Math.max(0, maxLabelChars - 1))}…`
        : rawLabelText)
      : '';
    const labelWidth = labelText.length * PRIMER_LABEL_CHAR_WIDTH;
    // The label identifies the annealing body. A long 5′ tail or a local
    // insertion must not pull the name away from that body.
    const desiredLabelX = xLeft + (W - labelWidth) / 2;
    const labelGlobalX = labelWidth > 0
      ? Math.max(2, Math.min(widthPx - 2 - labelWidth, desiredLabelX))
      : xLeft;
    const labelX = labelGlobalX - xLeft;
    const layoutKey = `hit-${idx}`;
    const layoutItem = primerBandSpans({
      key: layoutKey,
      rowKey: key,
      x: xLeft,
      width: bindingVisible ? W : 0,
      headHere,
      headWidth: HEAD,
      isFwd,
      detached: hit._annealingStatus === 'non-annealing',
      glyphs: alignmentGlyphs,
      insertions: visibleInsertions,
      clipOffset,
      charPx,
      inlineTail: tailProjection.inlineTail,
      tailWidth: tailProjection.tailWidth,
      tailX: tailProjection.tailX,
      separateTail: tailProjection.separateTail,
      labelX,
      labelWidth,
    });
    // The packed layout includes a wrapped/separate tail so it reserves the
    // correct outer band. The binding group's hit ownership must not include
    // that remote shape, however: the separate tail has its own interactive
    // group. Keeping this projection local also prevents a transparent target
    // from bridging the empty space between template and outer bands.
    const hitItem = primerBandSpans({
      key: layoutKey,
      rowKey: key,
      x: xLeft,
      width: bindingVisible ? W : 0,
      headHere,
      headWidth: HEAD,
      isFwd,
      detached: hit._annealingStatus === 'non-annealing',
      glyphs: alignmentGlyphs,
      insertions: visibleInsertions,
      clipOffset,
      charPx,
      inlineTail: tailProjection.inlineTail,
      tailWidth: tailProjection.tailWidth,
      tailX: tailProjection.tailX,
      separateTail: null,
    });
    return {
      hit, idx, isFwd, visStart, visEnd, bindingVisible, xLeft, W, key, selected, expanded,
      headHere, labelText, clipOffset, alignmentGlyphs, fallbackBases,
      visibleInsertions, tail, tailProjection, labelX, labelWidth,
      layoutKey, layoutItem, hitItem,
    };
  });
  const resolvedLayoutItems = resolvePrimerInsertionTiers(
    rawRenderHits.map(({ layoutItem }) => layoutItem),
  );
  const insertionTiersByKey = new Map(resolvedLayoutItems.flatMap((item) => (
    (item.insertionPlacements || []).map(({ key, tier }) => [key, tier])
  )));
  const resolvedHitItems = resolvePrimerInsertionTiers(
    rawRenderHits.map(({ hitItem }) => hitItem),
    insertionTiersByKey,
  );
  const renderHits = rawRenderHits.map((renderHit, index) => ({
    ...renderHit,
    layoutItem: resolvedLayoutItems[index],
    hitItem: resolvedHitItems[index],
  }));
  const layoutDirection = directionFilter === 'reverse'
    || (renderHits.length > 0 && renderHits.every(({ isFwd }) => !isFwd))
    ? 'reverse'
    : 'forward';
  const trackLayout = packPrimerTrackBands(
    renderHits.map(({ layoutItem }) => layoutItem),
    { direction: layoutDirection, glyphHeight: ARROW_H, stepOffset: PRIMER_STEP_OFFSET },
  );

  return (
    <svg
      data-testid="sequence-view-primers"
      data-line-start={lineStart}
      data-primer-style={filled ? "filled" : "outline"}
      data-primer-direction-filter={directionFilter || "all"}
      data-hit-count={lineHits.length}
      width={widthPx}
      height={Math.max(ARROW_H, trackLayout.height)}
      style={{
        display: "block",
        overflow: "visible",
        userSelect: "none",
        WebkitUserSelect: "none",
        // Decorative by default; only the clickable hits opt back in.
        pointerEvents: "none",
      }}
    >
      {renderHits.map((renderHit) => {
        const {
          hit, idx, isFwd, visStart, bindingVisible, xLeft, W, key, selected, expanded,
          headHere, labelText, clipOffset, alignmentGlyphs, fallbackBases,
          visibleInsertions, tailProjection, labelX, labelWidth, layoutKey, hitItem,
        } = renderHit;
        const placement = trackLayout.byKey[layoutKey];
        const templateY = placement.templateY;
        const tailY = placement.tailY;
        const outerY = placement.outerY;
        const labelY = placement.labelY;
        // V102 §5.2 — coords precomputed by clipHit: absolute clip for
        // base letters + render column for the segment (real or wrap).
        // A hit can be on this line for its TAIL alone (V-tailwrap filter) —
        // then the binding clip is empty and we draw NO arrow, only the tail.
        const color = isFwd ? 'var(--viz-primer-fwd)' : 'var(--viz-primer-rev)';
        const accessibleName = tf('primer.track.action', {
          name: hit.name || tf('primer.track.unnamed'),
          direction: tf(`primer.track.direction.${isFwd ? 'forward' : 'reverse'}`),
        });
        const activateByKeyboard = clickable ? (event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          event.stopPropagation();
          if (hasClick) onPrimerClick(key, hit, {
            additive: event.ctrlKey || event.metaKey,
            source: 'keyboard',
          });
          else if (hasDbl) onPrimerDoubleClick(hit);
        } : undefined;
        // Pentagon arrow: flat 5′ tail, pointed 3′ head. The head marks the
        // 3′-END — forward: hit.end; reverse: hit.start. When a binding is
        // split across a line-wrap (clipHit → two lineHits fragments), only
        // the fragment that actually CONTAINS the 3′-end gets the point; the
        // fragment at the wrap edge gets a blunt край, so the wrapped primer
        // reads as ONE continuous figure, not two arrows (Игорь 24.05.2026).
        // Unbroken binding → _visEnd===end && _visStart===start → head as
        // before. Absolute _visEnd/_visStart vs end/start is correct on
        // wrap-bridge (circular) rows too — no special case needed.
        // The HEAD footprint belongs only to the side that actually has the
        // point — on a blunt wrap-edge fragment it would otherwise stick ~6 px
        // past the край.
        const {
          inlineTail, separateTail: sepTail, tailWidth: tailW, tailX, tailBases,
        } = tailProjection;
        const insertionBands = (hitItem.insertionPlacements || []).map((entry, index) => ({
          lane: entry.tier === 1
            ? 'outer'
            : (entry.tier === 2 ? 'far-outer' : `outer-${entry.tier}`),
          y: placement.insertionYs[index],
          spans: [entry.span],
        }));
        const interactiveBands = [
          ...insertionBands,
          { lane: 'outer', y: outerY, spans: hitItem.outerBaseSpans || [] },
          { lane: 'tail', y: tailY, spans: hitItem.tailSpans },
          { lane: 'template', y: templateY, spans: hitItem.templateSpans },
        ].filter(({ y, spans }) => Number.isFinite(y) && spans.length > 0);

        return (
          <Fragment key={`${hit._occKey || hit.name || idx}-${hit._segIndex ?? 0}-${hit.start}-${hit._seg}`}>
            {bindingVisible && (
              <g
                data-testid="sequence-view-primer"
                data-primer-id={hit.id || ""}
                data-primer-evidence={hit._evidence || undefined}
                data-primer-visibility={hit._visibility || undefined}
                data-primer-name={hit.name || ""}
                data-primer-occurrence-key={hit._occKey || key}
                data-primer-strand={hit._strandName || undefined}
                data-primer-span={`${hit.start}-${hit.end}`}
                data-primer-wraps={hit._wraps ? "true" : undefined}
                data-primer-direction={hit.direction || ""}
                data-primer-oligo-status={hit._oligoStatus || undefined}
                data-primer-annealing-status={hit._annealingStatus || undefined}
                data-primer-three-prime-match={hit._threePrimeMatchLength}
                data-primer-detached={hit._annealingStatus === 'non-annealing' ? 'true' : undefined}
                data-primer-line-start={lineStart}
                data-primer-key={key}
                data-primer-interactive="true"
                data-selected={selected ? "true" : "false"}
                data-expanded={expanded ? "true" : "false"}
                transform={`translate(${xLeft}, 0)`}
                onClick={hasClick ? (e) => {
                  e.stopPropagation();
                  e.currentTarget.focus();
                  if (e.detail > 1) return;
                  onPrimerClick(key, hit, {
                    additive: e.ctrlKey || e.metaKey,
                    source: 'pointer',
                  });
                } : undefined}
                onDoubleClick={hasDbl ? (e) => {
                  e.stopPropagation();
                  e.currentTarget.focus();
                  onPrimerDoubleClick(hit);
                } : undefined}
                onKeyDown={activateByKeyboard}
                role={clickable ? 'button' : undefined}
                tabIndex={clickable ? 0 : undefined}
                aria-label={clickable ? accessibleName : undefined}
                aria-expanded={hasClick ? expanded : undefined}
                style={clickable ? { cursor: "pointer", pointerEvents: "auto" } : undefined}
              >
                {/* Outline shapes need a filled hit surface, but ownership is
                    lane-local: never bridge empty vertical space between an
                    outer tail/mismatch and a different primer's binding. */}
                {clickable && interactiveBands.flatMap(({ lane, y, spans }) => (
                  spans.map(([spanStart, spanEnd], spanIndex) => (
                    <rect
                      key={`${lane}-${spanIndex}-${spanStart}`}
                      data-primer-hit="true"
                      data-primer-hit-lane={lane}
                      data-primer-key={key}
                      data-primer-occurrence-key={hit._occKey || key}
                      x={spanStart - xLeft - 2}
                      y={y - 1}
                      width={spanEnd - spanStart + 4}
                      height={ARROW_H + 2}
                      fill="transparent"
                    />
                  ))
                ))}
                {tailProjection.promotedTail && (
                  <g
                    data-testid="sequence-view-primer-tail-wrap"
                    data-primer-projection-marker="promoted"
                    data-primer-key={key}
                    data-primer-occurrence-key={hit._occKey || key}
                    transform={`translate(${tailProjection.promotedTail.x}, ${tailY ?? 0})`}
                    aria-hidden="true"
                    style={{ pointerEvents: 'none' }}
                  />
                )}
                <PrimerStepGlyph
                  isFwd={isFwd}
                  filled={filled}
                  selected={selected}
                  expanded={expanded}
                  color={color}
                  width={W}
                  headHere={headHere}
                  baseFont={baseFont}
                  glyphs={alignmentGlyphs}
                  fallbackBases={fallbackBases}
                  visibleInsertions={visibleInsertions}
                  clipOffset={clipOffset}
                  charPx={charPx}
                  inlineTail={inlineTail}
                  tailWidth={tailW}
                  tailX={tailX}
                  tail={tailBases}
                  showLetters={showLetters}
                  labelX={labelX}
                  labelWidth={labelWidth}
                  labelText={labelText}
                  annealingStatus={hit._annealingStatus}
                  visStart={visStart}
                  templateY={templateY}
                  tailY={tailY}
                  outerY={outerY}
                  labelY={labelY}
                  insertionYs={placement.insertionYs}
                  insertionTiers={placement.insertionTiers}
                />
              </g>
            )}
            {/* Wrapped 5′-tail — the portion of the overhang whose columns
                fall on THIS line while the binding's 5′-end is elsewhere.
                Positioned at its own char columns so it reads continuous with
                the binding across the line break. */}
            {sepTail && (
              <g
                data-testid="sequence-view-primer-tail-wrap"
                data-primer-name={hit.name || ""}
                data-primer-direction={hit.direction || ""}
                data-primer-occurrence-key={hit._occKey || key}
                data-primer-line-start={lineStart}
                data-primer-key={key}
                data-primer-interactive="true"
                data-selected={selected ? "true" : "false"}
                data-expanded={expanded ? "true" : "false"}
                transform={`translate(${sepTail.x}, ${tailY ?? 0})`}
                onClick={hasClick ? (e) => {
                  e.stopPropagation();
                  e.currentTarget.focus();
                  if (e.detail > 1) return;
                  onPrimerClick(key, hit, {
                    additive: e.ctrlKey || e.metaKey,
                    source: 'pointer',
                  });
                } : undefined}
                onDoubleClick={hasDbl ? (e) => {
                  e.stopPropagation();
                  e.currentTarget.focus();
                  onPrimerDoubleClick(hit);
                } : undefined}
                onKeyDown={activateByKeyboard}
                role={clickable ? 'button' : undefined}
                tabIndex={clickable ? 0 : undefined}
                aria-label={clickable ? accessibleName : undefined}
                aria-expanded={hasClick ? expanded : undefined}
                style={clickable ? { cursor: "pointer", pointerEvents: "auto" } : undefined}
              >
                {expanded ? (
                  <rect
                    data-testid="sequence-view-primer-tail"
                    data-primer-tail-direction={isFwd ? "forward" : "reverse"}
                    data-primer-lane="tail"
                    data-primer-lane-y={tailY ?? 0}
                    data-primer-focus-perimeter="true"
                    x={0}
                    y={0}
                    width={sepTail.w}
                    height={ARROW_H}
                    fill={color}
                    fillOpacity={0.24}
                    stroke={color}
                    strokeWidth={1}
                  />
                ) : (
                  <line
                    data-testid="sequence-view-primer-tail"
                    data-primer-tail-direction={isFwd ? "forward" : "reverse"}
                    data-primer-lane="tail"
                    data-primer-lane-y={tailY ?? 0}
                    data-primer-focus-perimeter="true"
                    x1={0}
                    x2={sepTail.w}
                    y1={ARROW_H / 2}
                    y2={ARROW_H / 2}
                    stroke={color}
                    strokeWidth={2}
                    strokeOpacity={0.72}
                    strokeLinecap="round"
                  />
                )}
                {expanded && sepTail.bases && (
                  <text
                    data-testid="sequence-view-primer-tail-bases"
                    x={0}
                    y={ARROW_H / 2}
                    fontSize={baseFont}
                    fontWeight={600}
                    fill="var(--text-primary)"
                    textAnchor="start"
                    dominantBaseline="central"
                    style={{
                      fontFamily: "var(--font-mono, ui-monospace, monospace)",
                      letterSpacing: 0,
                    }}
                    textLength={sepTail.w}
                    lengthAdjust="spacingAndGlyphs"
                  >
                    {sepTail.bases}
                  </text>
                )}
              </g>
            )}
          </Fragment>
        );
      })}
    </svg>
  );
}

export default memo(PrimerTrack);
