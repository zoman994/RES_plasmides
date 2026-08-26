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
import { projectPrimerPool } from "../../../lib/primer-site-projection";
import { reverseComplement } from "../../../sequence-utils";
import {
  alignmentDisplay,
  alignmentDisplayForSegment,
} from "../lib/primer-alignment-glyphs";

const ARROW_H = 14; // arrow body height (fits inscribed mono bases)
const HEAD = 6; // arrowhead tip, extends BEYOND the footprint so the
// inscribed sequence stays exactly grid-aligned over its base columns.
const ROW_STRIDE = ARROW_H + 6; // vertical gap between stacked hits
const FORWARD_COLOR = "#3b82f6";
const REVERSE_COLOR = "#dc2626";

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

// PRIMER-AUDIT (V174) — two ecosystems name the 5'-overhang differently:
// assembly/SequenceView use `tail`, PCR-mode/local-primer-design use `tailSequence`.
// Read both so a PCR-mode primer's overhang renders here too (cross-ecosystem
// friendship). Accepts a hit/primer object, returns the overhang string ('' if none).
function tailOf(p) {
  if (!p) return "";
  if (typeof p.tail === "string") return p.tail;
  if (typeof p.tailSequence === "string") return p.tailSequence;
  return "";
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
function findHits(primers, fullSeq, ctx = {}) {
  if (!Array.isArray(primers) || primers.length === 0 || !fullSeq) return [];
  const occurrences = projectPrimerPool(primers, { template: fullSeq, ...ctx });
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
 */
function PrimerTrack({
  primers,
  fullSeq,
  lineStart,
  lineLen,
  charPx,
  labelChars,
  primerStyle,
  directionFilter,
  onPrimerClick,
  onPrimerDoubleClick,
  selectedPrimerKeys,
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
  });
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
        const tl = tailOf(h).length;
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
  const upper = (fullSeq || "").toUpperCase();
  const baseFont = Math.min(11, Math.max(7, charPx * 0.82));

  return (
    <svg
      data-testid="sequence-view-primers"
      data-line-start={lineStart}
      data-primer-style={filled ? "filled" : "outline"}
      data-primer-direction-filter={directionFilter || "all"}
      data-hit-count={lineHits.length}
      width={widthPx}
      height={lineHits.length * ROW_STRIDE}
      style={{
        display: "block",
        overflow: "visible",
        userSelect: "none",
        WebkitUserSelect: "none",
        // Decorative by default; only the clickable hits opt back in.
        pointerEvents: "none",
      }}
    >
      {lineHits.map((hit, idx) => {
        const isFwd = hit.direction !== "reverse";
        // V102 §5.2 — coords precomputed by clipHit: absolute clip for
        // base letters + render column for the segment (real or wrap).
        const visStart = hit._visStart;
        const visEnd = hit._visEnd;
        // A hit can be on this line for its TAIL alone (V-tailwrap filter) —
        // then the binding clip is empty and we draw NO arrow, only the tail.
        const bindingVisible = visEnd > visStart;
        const xLeft = (labelChars + hit._colStart) * charPx;
        const W = Math.max(1, (visEnd - visStart) * charPx);
        const yTop = idx * ROW_STRIDE;
        const color = isFwd ? FORWARD_COLOR : REVERSE_COLOR;
        const key = primerHitKey(hit);
        const selected = selectionKeys(hit).some((k) => selSet.has(k));
        // Pentagon arrow: flat 5′ tail, pointed 3′ head. The head marks the
        // 3′-END — forward: hit.end; reverse: hit.start. When a binding is
        // split across a line-wrap (clipHit → two lineHits fragments), only
        // the fragment that actually CONTAINS the 3′-end gets the point; the
        // fragment at the wrap edge gets a blunt край, so the wrapped primer
        // reads as ONE continuous figure, not two arrows (Игорь 24.05.2026).
        // Unbroken binding → _visEnd===end && _visStart===start → head as
        // before. Absolute _visEnd/_visStart vs end/start is correct on
        // wrap-bridge (circular) rows too — no special case needed.
        const headHere = isFwd ? hit._visEnd === hit.end : hit._visStart === hit.start;
        // The HEAD overhang (hit-target / selection-halo) belongs only to the
        // side that actually has the point — on a blunt wrap-edge fragment it
        // would otherwise stick ~6 px past the край. 5′/tail side and
        // groupTailW are untouched (they're not about the head).
        const headExt = headHere ? HEAD : 0;
        const arrowPath = headHere
          ? (isFwd
            ? `M0,0 L${W},0 L${W + HEAD},${ARROW_H / 2} L${W},${ARROW_H} L0,${ARROW_H} Z`
            : `M${W},0 L0,0 L${-HEAD},${ARROW_H / 2} L0,${ARROW_H} L${W},${ARROW_H} Z`)
          : `M0,0 L${W},0 L${W},${ARROW_H} L0,${ARROW_H} Z`;
        const fill = filled ? color : "none";
        const labelText = filled
          ? `${hit.name || ""} ${hit.tmBinding ? hit.tmBinding + "°" : ""}`.trim()
          : (hit._oligoStatus === 'ok' && hit.bindingSequence
            ? `${hit.name || ""} (${hit.bindingSequence.toUpperCase()})`
            : (hit.name || ""));
        const baseOffset = (hit._bindingOffset || 0) + (visStart - hit.start);
        const clipOffset = visStart - hit.start;
        const baseGlyphs = showLetters && hit._oligoStatus === 'ok'
          ? (Array.isArray(hit._alignmentGlyphs)
            ? hit._alignmentGlyphs.slice(clipOffset, clipOffset + (visEnd - visStart))
            : [...(hit._bindingTop || '').slice(baseOffset, baseOffset + (visEnd - visStart))]
              .map((base) => ({ base, op: null })))
          : [];
        const bases = baseGlyphs.map((glyph) => glyph?.base || '').join('');
        const visibleInsertions = showLetters && Array.isArray(hit._alignmentInsertions)
          ? hit._alignmentInsertions.filter((insertion) => (
            insertion.boundary >= clipOffset
            && (insertion.boundary < clipOffset + (visEnd - visStart)
              || (insertion.boundary === hit.end - hit.start && visEnd === hit.end))
          ))
          : [];
        // Overlap 5'-overhang. When present, drawn as a semi-transparent
        // segment that occupies the `tail.length` char columns immediately
        // 5′ of the binding (forward: left; reverse: right) so two internal
        // overlap-PCR primers visibly cross the boundary. Empty/absent →
        // nothing extra, identical to the prior render.
        const tail = hit._oligoStatus === 'ok' ? tailOf(hit) : "";
        const tailLen = tail.length;
        const hasTail = tailLen > 0;
        const tailW = tailLen * charPx;
        // V-tailwrap (24.05.2026, Игорь «хвосты праймеров не переносятся на
        // другую строку») — those tail columns can land on a NEIGHBOURING
        // wrapped line. Draw the tail INLINE (glued to the binding arrow, as
        // before) only when it fits wholly on the binding's own line, or
        // sticks past an absolute plasmid end into the margin. Otherwise emit
        // a SEPARATE, per-line-clipped tail segment (`sepTail`) on whichever
        // line actually holds its columns. On a circular wrap-bridge row we
        // keep the original draw-at-the-5′-fragment behaviour untouched.
        let inlineTail;
        let sepTail = null;
        // On a CIRCULAR molecule a 5′-tail can run off a sequence END and wrap to
        // the OTHER end (Игорь 25.06 «праймеры кольцевания должны показывать как
        // хвосты ложатся на цепь»). `fullSeq` is the whole molecule, so `seqLen`
        // is the wrap modulus. Detect it so the tail is drawn at its wrapped
        // positions across the origin — not dangled into the static side margin.
        const tailWrapsOrigin = circular && hasTail && seqLen > 0
          && (isFwd ? (hit.start - tailLen < 0) : (hit.end + tailLen > seqLen));
        if (hasWrap) {
          // Wrap-bridge row: a closure / self-closure primer binds near the start
          // (its tail lies just BEFORE the ▶1 divider — the END of the molecule) or
          // near the end (tail just AFTER the divider). Map each tail base to its real
          // render column through the wrap-bridge coord system so the tail LANDS on
          // the strand across the origin, instead of the static off-edge stub (Игорь
          // 25.06 «хвосты уходят в сторону»). Never the inline stub here.
          inlineTail = false;
          const holds5p = isFwd ? hit._visStart === hit.start : hit._visEnd === hit.end;
          if (hasTail && holds5p && seqLength > 0) {
            const colForPos = (pp) => {
              if (pp >= lineStart && pp < seqLength) return pp - lineStart; // real half (colBase 0)
              if (pp >= 0 && pp < wrapWidthChars) return wrapAt + pp; // wrap half (past ▶1)
              return null; // off this line
            };
            const vis = [];
            for (let j = 0; j < tailLen; j += 1) {
              const raw = isFwd ? (hit.start - tailLen + j) : (hit.end + j);
              const pp = (((raw % seqLength) + seqLength) % seqLength);
              const c = colForPos(pp);
              if (c != null) vis.push({ c, ch: tail[j] });
            }
            if (vis.length > 0) {
              let lo = vis[0].c;
              let hi = vis[0].c;
              for (const v of vis) { if (v.c < lo) lo = v.c; if (v.c > hi) hi = v.c; }
              sepTail = {
                x: (labelChars + lo) * charPx,
                w: (hi - lo + 1) * charPx,
                bases: showLetters ? vis.map((v) => v.ch).join("") : "",
              };
            }
          }
        } else if (tailWrapsOrigin) {
          // Wrapped closure tail on a normal / wrap-context row: map each tail base
          // to its real position (mod molecule length) and draw the run that lands
          // on THIS line, so the tail reads continuous across the ▶1 origin — the
          // forward closure tail surfaces at the molecule END (shown on the leading
          // wrap-context row), the reverse one at the START (line 0).
          inlineTail = false;
          const vis = [];
          for (let j = 0; j < tailLen; j += 1) {
            const raw = isFwd ? (hit.start - tailLen + j) : (hit.end + j);
            const pp = (((raw % seqLen) + seqLen) % seqLen);
            if (pp >= lineStart && pp < lineEnd) vis.push({ c: pp - lineStart, ch: tail[j] });
          }
          if (vis.length > 0) {
            vis.sort((a, b) => a.c - b.c);
            const lo = vis[0].c;
            const hi = vis[vis.length - 1].c;
            sepTail = {
              x: (labelChars + lo) * charPx,
              w: (hi - lo + 1) * charPx,
              bases: showLetters ? vis.map((v) => v.ch).join("") : "",
            };
          }
        } else {
          const fivePrimeOnLine = isFwd
            ? (hit.start >= lineStart && hit.start < lineEnd)
            : (hit.end > lineStart && hit.end <= lineEnd);
          // A tail running off a sequence END belongs in the margin for a LINEAR
          // molecule (a real 5′ overhang sticking out). Circular off-end tails are
          // handled by the `tailWrapsOrigin` branch above, so this stays as before.
          const tailFits = isFwd
            ? ((hit.start - tailLen) >= lineStart || lineStart === 0)
            : ((hit.end + tailLen) <= lineEnd || lineEnd === seqLen);
          inlineTail = hasTail && bindingVisible && fivePrimeOnLine && tailFits;
          if (hasTail && !inlineTail) {
            const tLo = isFwd ? Math.max(0, hit.start - tailLen) : hit.end;
            const tHi = isFwd ? hit.start : Math.min(seqLen, hit.end + tailLen);
            const vLo = Math.max(tLo, lineStart);
            const vHi = Math.min(tHi, lineEnd);
            if (vHi > vLo) {
              // tail char i sits at column (start − tailLen + i) forward /
              // (end + i) reverse → slice the bases visible on THIS line.
              const from = isFwd ? vLo - (hit.start - tailLen) : vLo - hit.end;
              const to = isFwd ? vHi - (hit.start - tailLen) : vHi - hit.end;
              sepTail = {
                x: (labelChars + (vLo - lineStart)) * charPx,
                w: (vHi - vLo) * charPx,
                bases: showLetters ? tail.slice(from, to) : "",
              };
            }
          }
        }
        // Only widen the binding's hit-target / halo by the tail when the
        // tail is actually drawn INSIDE this binding group.
        const groupTailW = inlineTail ? tailW : 0;
        // Name label sits at the far end on the RIGHT. Forward: right of the
        // arrowhead (its tail is on the LEFT, no clash). Reverse: an inline
        // 5'-tail sits on the RIGHT [W, W+tailW] — so the label must clear it.
        const labelX = isFwd
          ? W + HEAD + 4
          : (inlineTail ? W + tailW + 4 : W + 4);

        return (
          <Fragment key={`${hit._occKey || hit.name || idx}-${hit._segIndex ?? 0}-${hit.start}-${hit._seg}`}>
            {bindingVisible && (
              <g
                data-testid="sequence-view-primer"
                data-primer-id={hit.id || ""}
                data-primer-evidence={hit._evidence || undefined}
                data-primer-visibility={hit._visibility || undefined}
                data-primer-name={hit.name || ""}
                data-primer-occurrence-key={hit._occKey || undefined}
                data-primer-strand={hit._strandName || undefined}
                data-primer-span={`${hit.start}-${hit.end}`}
                data-primer-wraps={hit._wraps ? "true" : undefined}
                data-primer-direction={hit.direction || ""}
                data-primer-oligo-status={hit._oligoStatus || undefined}
                data-primer-line-start={lineStart}
                data-primer-key={key}
                data-selected={selected ? "true" : "false"}
                transform={`translate(${xLeft}, ${yTop})`}
                onClick={hasClick ? (e) => { e.stopPropagation(); onPrimerClick(key, hit); } : undefined}
                onDoubleClick={hasDbl ? (e) => { e.stopPropagation(); onPrimerDoubleClick(hit); } : undefined}
                style={clickable ? { cursor: "pointer", pointerEvents: "auto" } : undefined}
              >
                {/* Invisible full-area hit target (Игорь 18.05.2026 «клики
                    на праймерах не работают»): an arrow <path fill="none">
                    in OUTLINE style only hit-tests on its hairline stroke,
                    and the inscribed bases text shouldn't swallow clicks —
                    a transparent rect (fill:transparent IS hit-tested,
                    unlike fill:none) makes the whole primer box clickable
                    for both single- and double-click, any primerStyle. */}
                {clickable && (
                  <rect
                    data-primer-hit="true"
                    x={isFwd ? -HEAD - 2 - groupTailW : -headExt - 2}
                    y={-2}
                    width={W + HEAD + headExt + 4 + groupTailW}
                    height={ARROW_H + 4}
                    fill="transparent"
                  />
                )}
                {/* Selected: a soft colour halo + a bold ring so a clicked
                    primer reads UNMISTAKABLY (Игорь 18.05.2026 — «при
                    клике должен явно выделяться»). */}
                {selected && (
                  <>
                    <rect
                      data-primer-selection-halo="true"
                      x={isFwd ? -HEAD - 4 - groupTailW : -headExt - 4}
                      y={-4}
                      width={W + HEAD + headExt + 8 + groupTailW}
                      height={ARROW_H + 8}
                      rx={5}
                      fill={color}
                      opacity={0.18}
                    />
                    <rect
                      x={isFwd ? -HEAD - 2 - groupTailW : -headExt - 2}
                      y={-2}
                      width={W + HEAD + headExt + 4 + groupTailW}
                      height={ARROW_H + 4}
                      rx={4}
                      fill="none"
                      stroke={color}
                      strokeWidth={2.5}
                      opacity={1}
                    />
                  </>
                )}
                <path
                  data-primer-arrow={isFwd ? "forward" : "reverse"}
                  d={arrowPath}
                  fill={fill}
                  stroke={color}
                  strokeWidth={filled ? (selected ? 1.5 : 0.5) : (selected ? 2 : 1)}
                  opacity={filled ? (selected ? 1 : 0.95) : 1}
                />
                {visibleInsertions.map((insertion, insertionIndex) => {
                  const insertionWidth = Math.max(charPx, insertion.bases.length * charPx);
                  const boundaryX = (insertion.boundary - clipOffset) * charPx;
                  return (
                    <g
                      key={`${insertion.boundary}-${insertionIndex}`}
                      data-testid="sequence-view-primer-insertion"
                      data-primer-alignment-op="I"
                      data-primer-insertion-count={insertion.bases.length}
                      transform={`translate(${boundaryX}, 0)`}
                      style={{ pointerEvents: "none" }}
                    >
                      <rect
                        x={-insertionWidth / 2}
                        y={-baseFont - 5}
                        width={insertionWidth}
                        height={baseFont + 3}
                        rx={2}
                        fill="var(--surface-1)"
                        stroke="var(--warning-fg)"
                        strokeWidth={1}
                      />
                      <text
                        x={0}
                        y={-4}
                        fontSize={baseFont}
                        fontWeight={700}
                        fill="var(--warning-fg)"
                        textAnchor="middle"
                        style={{ fontFamily: "var(--font-mono, ui-monospace, monospace)" }}
                      >
                        {insertion.bases}
                      </text>
                    </g>
                  );
                })}
                {/* Inline overlap-tail — not on the template, so styled apart
                    from the solid binding arrow: same colour, low fill-opacity
                    + a thin outline, no arrowhead. Forward: left of binding
                    (5′); reverse: right of binding (5′). */}
                {inlineTail && (
                  <rect
                    data-testid="sequence-view-primer-tail"
                    data-primer-tail="true"
                    data-primer-tail-direction={isFwd ? "forward" : "reverse"}
                    x={isFwd ? -tailW : W}
                    y={0}
                    width={tailW}
                    height={ARROW_H}
                    fill={color}
                    fillOpacity={0.35}
                    stroke={color}
                    strokeWidth={0.5}
                  />
                )}
                {inlineTail && showLetters && (
                  <text
                    data-testid="sequence-view-primer-tail-bases"
                    x={isFwd ? -tailW : W}
                    y={ARROW_H / 2}
                    fontSize={baseFont}
                    fontWeight={600}
                    fill={color}
                    textAnchor="start"
                    dominantBaseline="central"
                    style={{
                      fontFamily: "var(--font-mono, ui-monospace, monospace)",
                      letterSpacing: 0,
                    }}
                    textLength={tailW}
                    lengthAdjust="spacingAndGlyphs"
                  >
                    {tail}
                  </text>
                )}
                {/* binding bases inscribed INSIDE the arrow, grid-aligned
                    to the char columns (Игорь 18.05 — «последовательность
                    должна быть вписана»). */}
                {bases && (
                  <text
                    data-testid="sequence-view-primer-bases"
                    x={0}
                    y={ARROW_H / 2}
                    fontSize={baseFont}
                    fontWeight={600}
                    fill={filled ? "#fff" : color}
                    textAnchor="start"
                    dominantBaseline="central"
                    style={{
                      fontFamily: "var(--font-mono, ui-monospace, monospace)",
                      letterSpacing: 0,
                    }}
                    textLength={W}
                    lengthAdjust="spacingAndGlyphs"
                  >
                    {baseGlyphs.map((glyph, baseIndex) => {
                      const base = glyph?.base || '';
                      const coord = visStart + baseIndex;
                      const deletion = glyph?.op === 'D';
                      const mismatch = glyph?.op === 'X'
                        || (!deletion && base !== upper[coord]);
                      return (
                        <tspan
                          key={`${coord}-${baseIndex}`}
                          data-testid={deletion
                            ? "sequence-view-primer-base-deletion"
                            : (mismatch ? "sequence-view-primer-base-mismatch" : undefined)}
                          data-primer-base-mismatch={mismatch ? "true" : undefined}
                          data-primer-alignment-op={glyph?.op || undefined}
                          data-primer-template-coordinate={coord}
                          fill={mismatch || deletion ? "var(--warning-fg)" : undefined}
                        >{base}</tspan>
                      );
                    })}
                  </text>
                )}
                <text
                  data-testid="sequence-view-primer-label"
                  x={labelX}
                  y={ARROW_H / 2}
                  fontSize={8}
                  fill={color}
                  dominantBaseline="central"
                  style={{ fontFamily: "inherit" }}
                >
                  {labelText}
                </text>
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
                data-primer-line-start={lineStart}
                data-primer-key={key}
                transform={`translate(${sepTail.x}, ${yTop})`}
                onClick={hasClick ? (e) => { e.stopPropagation(); onPrimerClick(key, hit); } : undefined}
                onDoubleClick={hasDbl ? (e) => { e.stopPropagation(); onPrimerDoubleClick(hit); } : undefined}
                style={clickable ? { cursor: "pointer", pointerEvents: "auto" } : undefined}
              >
                {selected && (
                  <rect
                    x={-2}
                    y={-2}
                    width={sepTail.w + 4}
                    height={ARROW_H + 4}
                    rx={4}
                    fill="none"
                    stroke={color}
                    strokeWidth={2.5}
                  />
                )}
                <rect
                  data-testid="sequence-view-primer-tail"
                  data-primer-tail-direction={isFwd ? "forward" : "reverse"}
                  x={0}
                  y={0}
                  width={sepTail.w}
                  height={ARROW_H}
                  fill={color}
                  fillOpacity={0.35}
                  stroke={color}
                  strokeWidth={0.5}
                />
                {sepTail.bases && (
                  <text
                    data-testid="sequence-view-primer-tail-bases"
                    x={0}
                    y={ARROW_H / 2}
                    fontSize={baseFont}
                    fontWeight={600}
                    fill={color}
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
