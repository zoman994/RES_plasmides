/**
 * StickyEndFragment — VERT-3 Variant C + «нуклеотиды выходят из карточки» (Игорь 27.06:
 * «карточка должна содержать фичную часть НО нуклеотиды должны как бы выходить из
 * карточки — мы потом будем их физически сцеплять»).
 *
 * The card box wraps the FEATURE part (the thin feature duplex bar + labels); the
 * sticky-end NUCLEOTIDE windows PROTRUDE past the box left/right edges (absolute,
 * right:100% / left:100%) so the strands run continuously OUT of the box — ready to be
 * physically mated to a neighbour's overhang. Everything reused: ends = SequenceView
 * `StrandsTrack` (literal letters + terminalStagger staircase, blanked recess, feature
 * tint), body = two thin feature-coloured strand lines that meet the protruding windows
 * edge-to-edge.
 *
 * End render is GENERIC over the junction kind (Игорь «у нас ещё будут варианты слияния
 * не через РЕ — оверлап и пр., предусмотри»): kind 'overhang' (RE/GG) → staircase;
 * 'blunt' (KLD) → flush; 'overlap' (Gibson/OV-PCR) → homology band. `ends={{left,right}}`
 * overrides; else derived from `stagger`.
 *
 * Pure presentational; charPx + the box width are measured so the StrandsTrack overlays
 * land on the bases. The host (FilledBlock map row) must allow overflow so the ends show
 * outside the box.
 */
import {
  useRef, useState, useLayoutEffect, useMemo,
} from 'react';
import StrandsTrack from '../../SequenceView/tracks/StrandsTrack';
import { measureCharPx, SEQUENCE_FONT_FAMILY } from '../../SequenceView/lib/grid';
import { buildFeatureMap, buildLineAnnMap } from '../../SequenceView/lib/feature-map';

const WIN = 6; // duplex bases shown per terminus window
const FONT_PX = 11; // matches the SequenceView strand rows
const ROW = 16; // StrandsTrack ROW_HEIGHT_STRAND (top + bottom = 2*ROW)
const NO_NUMBER = ' '; // truthy gutterLabel → StrandsTrack blanks the line-number
const STRAND = '#475569';
// Push the protruding ends OUT past the card's padding(10) + border(2) so the box border
// line never crosses the nucleotide letters; the body strand lines extend by the same
// amount to meet the letters AT the border (Игорь 27.06 «аккуратно с границами»).
const INSET = 14;

function trim(s) {
  const t = String(s || '');
  return t.length > 14 ? `${t.slice(0, 13)}…` : t;
}

function endDesc(ends, stagger, side) {
  if (ends && ends[side] !== undefined && ends[side] !== null) return ends[side];
  const s = stagger && stagger[side];
  return s ? { kind: 'overhang', stagger: s } : { kind: 'blunt' };
}

export default function StickyEndFragment({
  stagger = null,
  ends = null,
  sequence = '',
  annotations = null,
  name = '',
  width = 210,
  testId = 'sticky-end-fragment',
  // Ф4.3 — на СОМКНУТОМ стыке обращённое окно концов подавляется: его нуклеотиды
  // переезжают в общий меш-шов (ZoneGraphContent), иначе два полных окна налезают
  // друг на друга. Тело-дуплекс всё равно дотягивается до края коробки.
  hideLeftEnd = false,
  hideRightEnd = false,
}) {
  const ref = useRef(null);
  const [charPx, setCharPx] = useState(7.2);
  const [boxW, setBoxW] = useState(width);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = measureCharPx(el, SEQUENCE_FONT_FAMILY);
    const cw = el.clientWidth || 0;
    if (w > 0 && Math.abs(w - charPx) > 0.05) setCharPx(w);
    if (cw > 0 && Math.abs(cw - boxW) > 1) setBoxW(cw);
  }, [charPx, boxW]);

  const seq = String(sequence || '').toUpperCase();
  const leftEnd = endDesc(ends, stagger, 'left');
  const rightEnd = endDesc(ends, stagger, 'right');
  const sticky = leftEnd.kind !== 'blunt' || rightEnd.kind !== 'blunt';

  const features = useMemo(() => {
    if (!Array.isArray(annotations) || annotations.length === 0) return [];
    return buildFeatureMap([{
      id: 'frag', sequence: seq, annotations, name,
    }]).features;
  }, [seq, annotations, name]);

  const single = seq.length > 0 && seq.length <= WIN * 2;
  const leftSeq = single ? seq : seq.slice(0, WIN);
  const rightSeq = single ? '' : seq.slice(Math.max(0, seq.length - WIN));
  const leftAnn = useMemo(() => buildLineAnnMap(features, 0, leftSeq.length), [features, leftSeq.length]);
  const rightStart = seq.length - rightSeq.length;
  const rightAnn = useMemo(
    () => (rightSeq ? buildLineAnnMap(features, rightStart, rightSeq.length) : null),
    [features, rightStart, rightSeq.length, rightSeq],
  );

  const regions = features.filter((f) => f.level === 'region' || f.level === undefined);
  const hasBody = !single && !!seq;
  const labelH = hasBody && regions.some((f) => f.name) ? 12 : 0;
  const containerH = labelH + ROW * 2;

  const lOh = leftEnd.kind === 'overhang' ? leftEnd.stagger : null;
  const leftPad = lOh && lOh.protruding === 'bottom' && lOh.len ? lOh.len : 1;

  // A StrandsTrack window — staircase for overhang ends, homology band for overlap, flush
  // for blunt; the recessed strand is BLANKED (not white-boxed) so it blends on the card.
  const winEl = (s, annMap, descL, descR, labelChars) => {
    const winLen = s.length;
    const tLeft = descL && descL.kind === 'overhang' ? descL.stagger : null;
    const tRight = descR && descR.kind === 'overhang' ? descR.stagger : null;
    const bands = [];
    if (descL && descL.kind === 'overlap' && descL.len) {
      bands.push({ key: 'ovl-l', startPos: 0, endPos: Math.min(winLen, descL.len) });
    }
    if (descR && descR.kind === 'overlap' && descR.len) {
      bands.push({ key: 'ovl-r', startPos: Math.max(0, winLen - descR.len), endPos: winLen });
    }
    const blanks = [];
    if (descL && descL.kind === 'overhang' && descL.stagger.protruding === 'top') {
      const st = descL.stagger;
      blanks.push({ pos0: 0, pos1: st.len, strand: st.recessed });
    }
    if (descR && descR.kind === 'overhang' && descR.stagger.protruding === 'top') {
      const st = descR.stagger;
      blanks.push({ pos0: Math.max(0, winLen - st.len), pos1: winLen, strand: st.recessed });
    }
    return (
      <StrandsTrack
        lineStart={0}
        seq={s}
        annMap={annMap}
        labelChars={labelChars}
        charPx={charPx}
        showBottomStrand
        gutterLabel={NO_NUMBER}
        terminalLeft={tLeft}
        terminalRight={tRight}
        overhangs={bands.length ? bands : null}
        blankRanges={blanks.length ? blanks : null}
        recessFill="transparent"
      />
    );
  };

  // Short fragment: one in-flow window, no protruding ends / body.
  if (single) {
    return (
      <div
        ref={ref}
        data-testid={testId}
        data-sticky={sticky ? 'true' : 'false'}
        style={{
          width: '100%', display: 'flex', justifyContent: 'center',
          fontFamily: SEQUENCE_FONT_FAMILY, fontSize: FONT_PX, lineHeight: `${ROW}px`,
        }}
      >
        {seq ? winEl(leftSeq, leftAnn, leftEnd, rightEnd, leftPad) : null}
      </div>
    );
  }

  // Body strands span the full box; xOf maps the fragment's MIDDLE onto the box width.
  const xOf = (p) => {
    const span = seq.length - 2 * WIN;
    if (span <= 0) return 0;
    return Math.max(0, Math.min(1, (p - WIN) / span)) * boxW;
  };
  const lineTopY = labelH + ROW / 2;
  const lineBotY = labelH + ROW + ROW / 2;

  return (
    <div
      ref={ref}
      data-testid={testId}
      data-sticky={sticky ? 'true' : 'false'}
      data-protrude="true"
      style={{
        position: 'relative',
        width: '100%',
        height: containerH,
        fontFamily: SEQUENCE_FONT_FAMILY,
        fontSize: FONT_PX,
        lineHeight: `${ROW}px`,
      }}
    >
      {/* BODY — the feature part, INSIDE the card box. */}
      <svg
        data-testid={`${testId}-body`}
        data-shape="duplex"
        width="100%"
        height={containerH}
        viewBox={`0 0 ${boxW} ${containerH}`}
        preserveAspectRatio="none"
        style={{ overflow: 'visible', display: 'block' }}
      >
        <line x1={-INSET} y1={lineTopY} x2={boxW + INSET} y2={lineTopY} stroke={STRAND} strokeWidth="1.4" />
        <line x1={-INSET} y1={lineBotY} x2={boxW + INSET} y2={lineBotY} stroke={STRAND} strokeWidth="1.4" />
        {features.map((f, i) => {
          const x = xOf(f.start);
          const w = Math.max(2, xOf(f.end) - x);
          return (
            // eslint-disable-next-line react/no-array-index-key
            <rect key={`f${i}`} x={x} y={lineTopY - 4} width={w} height={ROW + 8} rx="3" fill={f.color} opacity="0.92">
              <title>{f.name || f.type || 'feature'}</title>
            </rect>
          );
        })}
        {labelH > 0 && regions.map((f, i) => (
          // eslint-disable-next-line react/no-array-index-key
          <text
            key={`l${i}`}
            x={(xOf(f.start) + xOf(f.end)) / 2}
            y={labelH - 3}
            textAnchor="middle"
            fontSize="9"
            fontFamily="system-ui, sans-serif"
            fill="var(--text-secondary, #57534e)"
          >
            {trim(f.name || f.type)}
          </text>
        ))}
      </svg>

      {/* LEFT end nucleotides — PROTRUDE past the box's left edge (right:100%).
          Suppressed on a mated seam (Ф4.3) — the overhang moves to the shared mesh. */}
      {!hideLeftEnd && (
        <div
          data-testid={`${testId}-end-left`}
          style={{
            position: 'absolute', top: labelH, right: `calc(100% + ${INSET}px)`, whiteSpace: 'nowrap',
          }}
        >
          {winEl(leftSeq, leftAnn, leftEnd, null, leftPad)}
        </div>
      )}
      {/* RIGHT end nucleotides — PROTRUDE past the box's right edge (left:100%). */}
      {!hideRightEnd && (
        <div
          data-testid={`${testId}-end-right`}
          style={{
            position: 'absolute', top: labelH, left: `calc(100% + ${INSET}px)`, whiteSpace: 'nowrap',
          }}
        >
          {winEl(rightSeq, rightAnn, null, rightEnd, 0)}
        </div>
      )}
    </div>
  );
}
