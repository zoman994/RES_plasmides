/**
 * MiniPlasmidMap — мини-SVG-рендер плазмиды для container block на canvas.
 *
 * R10-1 (14.05.2026). Биолог хочет видеть на canvas не pill, а живую
 * картинку плазмиды:
 *   - circular → кольцо с feature arcs.
 *   - linear   → прямая полоса с feature blocks.
 *   - linearizedFromCircular → кольцо С РАЗРЫВОМ в позиции cut site.
 *   - excised   → лёгкое затемнение overlay (вырезанная часть).
 *   - frozen    → ghost overlay (использовано в op).
 *
 * Pure SVG, без зависимостей. Размеры controllable через width/height.
 * Перекраска features через feature-palette (consistency со старым
 * SequenceView миникартой).
 */
import { useMemo } from 'react';
import { featureColor } from '../../../feature-palette';
import { pickRegionsForLabels, truncateLabel } from '../../../lib/plasmid-label-utils';

const TWO_PI = Math.PI * 2;
const LABEL_FONT = 6.5;
const LABEL_LEAD = 5; // px leader past the ring / above the strip

// Halo so small labels read over arcs/backbone on any theme.
const LABEL_TEXT_STYLE = {
  paintOrder: 'stroke fill',
  stroke: 'var(--surface-1, #fff)',
  strokeWidth: 2,
  fill: 'var(--text-primary, #1c1917)',
  pointerEvents: 'none',
};

/**
 * polarToCart — угол + радиус → x,y относительно центра.
 *   theta=0 → top (12 o'clock), going clockwise.
 */
function polarToCart(cx, cy, r, theta) {
  return {
    x: cx + r * Math.sin(theta),
    y: cy - r * Math.cos(theta),
  };
}

/**
 * arcPath — SVG arc path string from theta0..theta1.
 */
function arcPath(cx, cy, rInner, rOuter, theta0, theta1) {
  const p0 = polarToCart(cx, cy, rOuter, theta0);
  const p1 = polarToCart(cx, cy, rOuter, theta1);
  const p2 = polarToCart(cx, cy, rInner, theta1);
  const p3 = polarToCart(cx, cy, rInner, theta0);
  const largeArc = (theta1 - theta0) > Math.PI ? 1 : 0;
  return [
    `M ${p0.x.toFixed(2)} ${p0.y.toFixed(2)}`,
    `A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`,
    `L ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`,
    `A ${rInner} ${rInner} 0 ${largeArc} 0 ${p3.x.toFixed(2)} ${p3.y.toFixed(2)}`,
    'Z',
  ].join(' ');
}

/**
 * MiniPlasmidMap props:
 *   - length      — sequence bp (Number, required).
 *   - annotations — array of {start, end, type?, name?} (optional).
 *   - circular    — bool (default false).
 *   - linearizedFromCircular — bool — render as circle WITH GAP at cut.
 *   - cutPosition — for linearizedFromCircular: где гэп (default 0).
 *   - excised     — bool — render dim overlay (excised fragment).
 *   - frozen      — bool — render ghost overlay (consumed by op).
 *   - width, height — px (default 90×70).
 *   - testId      — for testing.
 */
export default function MiniPlasmidMap({
  length,
  annotations = [],
  circular = false,
  linearizedFromCircular = false,
  cutPosition = 0,
  excised = false,
  frozen = false,
  // V75 — PCR overlay (off by default; passed only on the template
  // block when its PCR op is selected). primers: [{start,end,
  // direction:'forward'|'reverse',name}]; flank: {start,end}.
  primers = [],
  flank = null,
  width = 90,
  height = 70,
  testId,
  // V85 r2 (Игорь 22.05.2026) — на 32px thumbnail'ах leader-line
  // labels фич нечитаемы и обрезаются. showLabels=false → рендерим
  // только цветное кольцо/strip, имя+счётчик фич живут в тексте
  // строки рядом (как в SnapGene/Benchling списках).
  showLabels = true,
}) {
  const features = useMemo(
    () => (Array.isArray(annotations) ? annotations : []).filter(
      (a) => a && typeof a.start === 'number' && typeof a.end === 'number'
        && a.end > a.start
        && (a.level === 'region' || a.level === undefined),
    ),
    [annotations],
  );

  const L = Math.max(1, length || 0);

  // Use circle representation if circular OR linearized-from-circular.
  // Linear (true linear from PCR / primary linear) → strip.
  if (circular || linearizedFromCircular) {
    return (
      <CircularMap
        L={L}
        features={features}
        linearizedFromCircular={linearizedFromCircular}
        cutPosition={cutPosition}
        excised={excised}
        frozen={frozen}
        primers={primers}
        flank={flank}
        width={width}
        height={height}
        testId={testId}
        showLabels={showLabels}
      />
    );
  }
  return (
    <LinearMap
      L={L}
      features={features}
      excised={excised}
      frozen={frozen}
      primers={primers}
      flank={flank}
      width={width}
      height={height}
      testId={testId}
      showLabels={showLabels}
    />
  );
}

function CircularMap({ L, features, linearizedFromCircular, cutPosition, excised, frozen, primers = [], flank = null, width, height, testId, showLabels = true }) {
  const cx = width / 2;
  const cy = height / 2;
  const r = Math.min(width, height) / 2 - 6;
  const ringThickness = Math.max(4, r * 0.18);
  const rInner = r - ringThickness;

  // Gap для linearized: вырезаем сектор ~12° around cutPosition.
  const gapDeg = linearizedFromCircular ? 14 : 0;
  const gapTheta = (gapDeg * Math.PI) / 180;
  const cutTheta = ((cutPosition / L) * TWO_PI) % TWO_PI;
  const gapStart = cutTheta - gapTheta / 2;
  const gapEnd = cutTheta + gapTheta / 2;

  // Backbone ring: split into 2 arcs if gap present, else single full circle.
  const backbone = linearizedFromCircular
    ? [
        { from: gapEnd, to: gapStart + TWO_PI },
      ]
    : [{ from: 0, to: TWO_PI - 0.001 }]; // ~full circle, avoid singularity at 360°.

  // Features as arcs.
  const featureArcs = features.map((f, i) => {
    const theta0 = (f.start / L) * TWO_PI;
    const theta1 = (f.end / L) * TWO_PI;
    if (theta1 <= theta0) return null;
    const fillColor = featureColor(f.type, f.name);
    return {
      key: `f-${i}-${f.start}`,
      path: arcPath(cx, cy, rInner - 1, r + 1, theta0, theta1),
      color: fillColor,
      name: f.name || f.type || 'feature',
    };
  }).filter(Boolean);

  // V66 — feature labels (shared selection logic, MiniPlasmidMap's own
  // polar convention). Leader line out of the ring + text.
  // V85 r2 — skip entirely when showLabels=false (tiny thumbnails).
  const labels = (showLabels ? pickRegionsForLabels(features, L) : [])
    .map((rg) => {
      const theta = (((rg.start + rg.end) / 2) / L) * TWO_PI;
      const inner = polarToCart(cx, cy, r + 1, theta);
      const outer = polarToCart(cx, cy, r + 1 + LABEL_LEAD, theta);
      const rightSide = outer.x >= cx;
      return {
        key: `lbl-${rg.start}-${rg.end}`,
        text: truncateLabel(rg.name || rg.type || 'region'),
        color: featureColor(rg.type, rg.name),
        x1: inner.x, y1: inner.y, x2: outer.x, y2: outer.y,
        textX: outer.x + (rightSide ? 2 : -2),
        textY: outer.y + 2,
        anchor: rightSide ? 'start' : 'end',
        theta,
      };
    })
    .sort((a, b) => a.theta - b.theta);
  // Stagger labels that fall within ~14° of each other.
  for (let i = 1; i < labels.length; i += 1) {
    if (Math.abs(labels[i].theta - labels[i - 1].theta) < 0.24) {
      labels[i].textY = labels[i - 1].textY + LABEL_FONT + 1.5;
    }
  }

  return (
    <svg
      data-testid={testId}
      data-shape={linearizedFromCircular ? 'broken-circle' : 'circle'}
      data-excised={excised ? 'true' : 'false'}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ overflow: 'visible' }}
    >
      {/* Backbone ring (gray under-layer) */}
      {backbone.map((arc, i) => (
        <BackboneArc
          key={`bb-${i}`}
          cx={cx} cy={cy} rInner={rInner} rOuter={r}
          theta0={arc.from} theta1={arc.to}
          color={excised ? '#cbd5e1' : '#94a3b8'}
        />
      ))}
      {/* Feature arcs (colored) */}
      {featureArcs.map((arc) => (
        <path
          key={arc.key}
          d={arc.path}
          fill={arc.color}
          opacity={excised ? 0.4 : 0.85}
        >
          <title>{arc.name}</title>
        </path>
      ))}
      {/* V66 — feature labels (leader + text). */}
      {labels.map((l) => (
        <g key={l.key} data-testid="mini-plasmid-label" style={{ pointerEvents: 'none' }}>
          <line
            x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2}
            stroke={l.color} strokeWidth={0.75} opacity={excised ? 0.4 : 0.8}
          />
          <text
            x={l.textX} y={l.textY}
            fontSize={LABEL_FONT}
            fontFamily="system-ui, sans-serif"
            textAnchor={l.anchor}
            style={LABEL_TEXT_STYLE}
            opacity={excised ? 0.5 : 1}
          >{l.text}</text>
        </g>
      ))}
      {/* V75 — PCR flank band (region the primers amplify) + primer
          markers. Shown only when the template's PCR op is selected. */}
      {flank && Number.isFinite(flank.start) && Number.isFinite(flank.end)
        && flank.end > flank.start && (
        <path
          data-testid="mini-plasmid-flank"
          d={arcPath(cx, cy, r + 2, r + 5,
            (flank.start / L) * TWO_PI, (flank.end / L) * TWO_PI)}
          fill="var(--accent-500, #b85c3e)"
          opacity={excised ? 0.18 : 0.32}
        />
      )}
      {(primers || []).map((p, i) => {
        if (!p || !Number.isFinite(p.start)) return null;
        const theta = (p.start / L) * TWO_PI;
        const inner = polarToCart(cx, cy, r + 2, theta);
        const outer = polarToCart(cx, cy, r + 10, theta);
        const color = p.direction === 'reverse' ? '#dc2626' : '#3b82f6';
        return (
          <g
            key={`pcr-pr-${i}-${p.start}`}
            data-testid="mini-plasmid-primer"
            data-direction={p.direction === 'reverse' ? 'reverse' : 'forward'}
            style={{ pointerEvents: 'none' }}
          >
            <line x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y}
              stroke={color} strokeWidth={1.4} opacity={excised ? 0.5 : 1} />
            <circle cx={outer.x} cy={outer.y} r={1.7} fill={color}
              opacity={excised ? 0.5 : 1}>
              <title>{p.name || p.direction}</title>
            </circle>
          </g>
        );
      })}
      {/* Cut site markers для linearized: small "scissors" stub at gap. */}
      {linearizedFromCircular && (
        <CutMarker cx={cx} cy={cy} r={r} theta={cutTheta} />
      )}
      {/* Ghost overlay для frozen. */}
      {frozen && (
        <circle
          cx={cx} cy={cy} r={r + 2}
          fill="rgba(127, 29, 29, 0.04)"
          stroke="rgba(127, 29, 29, 0.25)"
          strokeWidth={1}
          strokeDasharray="3 3"
        />
      )}
    </svg>
  );
}

function BackboneArc({ cx, cy, rInner, rOuter, theta0, theta1, color }) {
  return (
    <path
      d={arcPath(cx, cy, rInner, rOuter, theta0, theta1)}
      fill={color}
      opacity={0.55}
    />
  );
}

function CutMarker({ cx, cy, r, theta }) {
  const p1 = polarToCart(cx, cy, r - 8, theta);
  const p2 = polarToCart(cx, cy, r + 6, theta);
  return (
    <g data-testid="cut-marker">
      <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
        stroke="#dc2626" strokeWidth={1.5} strokeLinecap="round" />
      <circle cx={p2.x} cy={p2.y} r={2.2} fill="#dc2626" />
    </g>
  );
}

function LinearMap({ L, features, excised, frozen, primers = [], flank = null, width, height, testId, showLabels = true }) {
  // Horizontal strip in middle of viewport.
  const padX = 4;
  const stripH = Math.max(10, Math.min(20, height * 0.35));
  const stripY = (height - stripH) / 2;
  const stripW = width - padX * 2;
  const xOf = (pos) => padX + (Math.max(0, Math.min(L, pos)) / L) * stripW;

  // V66 — feature labels (shared selection; placed above the strip).
  // V85 r2 — skip entirely when showLabels=false (tiny thumbnails).
  const labels = (showLabels ? pickRegionsForLabels(features, L) : [])
    .map((rg) => {
      const x = padX + (((rg.start + rg.end) / 2) / L) * stripW;
      return {
        key: `lbl-${rg.start}-${rg.end}`,
        text: truncateLabel(rg.name || rg.type || 'region'),
        color: featureColor(rg.type, rg.name),
        x,
        y1: stripY,
        y2: stripY - LABEL_LEAD,
        textY: stripY - LABEL_LEAD - 1.5,
      };
    })
    .sort((a, b) => a.x - b.x);
  for (let i = 1; i < labels.length; i += 1) {
    if (Math.abs(labels[i].x - labels[i - 1].x) < 34) {
      labels[i].y2 = labels[i - 1].y2 - (LABEL_FONT + 1.5);
      labels[i].textY = labels[i].y2 - 1.5;
    }
  }

  return (
    <svg
      data-testid={testId}
      data-shape="linear"
      data-excised={excised ? 'true' : 'false'}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ overflow: 'visible' }}
    >
      {/* Backbone strip */}
      <rect
        x={padX} y={stripY}
        width={stripW} height={stripH}
        rx={2} ry={2}
        fill={excised ? '#cbd5e1' : '#94a3b8'}
        opacity={excised ? 0.5 : 0.55}
      />
      {/* Feature blocks */}
      {features.map((f, i) => {
        const x = padX + (f.start / L) * stripW;
        const w = Math.max(1.5, ((f.end - f.start) / L) * stripW);
        const fillColor = featureColor(f.type, f.name);
        return (
          <rect
            key={`f-${i}-${f.start}`}
            x={x} y={stripY + 1}
            width={w} height={stripH - 2}
            rx={1.5} ry={1.5}
            fill={fillColor}
            opacity={excised ? 0.4 : 0.92}
          >
            <title>{f.name || f.type || 'feature'}</title>
          </rect>
        );
      })}
      {/* V66 — feature labels (leader + text above the strip). */}
      {labels.map((l) => (
        <g key={l.key} data-testid="mini-plasmid-label" style={{ pointerEvents: 'none' }}>
          <line
            x1={l.x} y1={l.y1} x2={l.x} y2={l.y2}
            stroke={l.color} strokeWidth={0.75} opacity={excised ? 0.4 : 0.8}
          />
          <text
            x={l.x} y={l.textY}
            fontSize={LABEL_FONT}
            fontFamily="system-ui, sans-serif"
            textAnchor="middle"
            style={LABEL_TEXT_STYLE}
            opacity={excised ? 0.5 : 1}
          >{l.text}</text>
        </g>
      ))}
      {/* V75 — PCR flank band + primer markers (template's PCR op selected). */}
      {flank && Number.isFinite(flank.start) && Number.isFinite(flank.end)
        && flank.end > flank.start && (
        <rect
          data-testid="mini-plasmid-flank"
          x={xOf(flank.start)} y={stripY - 2}
          width={Math.max(1, xOf(flank.end) - xOf(flank.start))}
          height={stripH + 4}
          rx={2} ry={2}
          fill="var(--accent-500, #b85c3e)"
          opacity={excised ? 0.18 : 0.3}
        />
      )}
      {(primers || []).map((p, i) => {
        if (!p || !Number.isFinite(p.start)) return null;
        const x = xOf(p.start);
        const color = p.direction === 'reverse' ? '#dc2626' : '#3b82f6';
        const yTip = stripY - 1;
        const yTop = stripY - 7;
        return (
          <g
            key={`pcr-pr-${i}-${p.start}`}
            data-testid="mini-plasmid-primer"
            data-direction={p.direction === 'reverse' ? 'reverse' : 'forward'}
            style={{ pointerEvents: 'none' }}
          >
            <polygon
              points={`${x - 3},${yTop} ${x + 3},${yTop} ${x},${yTip}`}
              fill={color}
              opacity={excised ? 0.5 : 1}
            >
              <title>{p.name || p.direction}</title>
            </polygon>
          </g>
        );
      })}
      {/* End markers (5'/3' caps) — small triangles */}
      <EndCap cx={padX} cy={stripY + stripH / 2} side="left" />
      <EndCap cx={padX + stripW} cy={stripY + stripH / 2} side="right" />
      {/* Ghost overlay для frozen */}
      {frozen && (
        <rect
          x={padX - 1} y={stripY - 1}
          width={stripW + 2} height={stripH + 2}
          rx={2} ry={2}
          fill="rgba(127, 29, 29, 0.04)"
          stroke="rgba(127, 29, 29, 0.25)"
          strokeWidth={1}
          strokeDasharray="3 3"
        />
      )}
    </svg>
  );
}

function EndCap({ cx, cy, side }) {
  const sign = side === 'left' ? -1 : 1;
  const p = [
    `${cx + sign * 4},${cy - 5}`,
    `${cx + sign * 4},${cy + 5}`,
    `${cx + sign * 0.5},${cy}`,
  ].join(' ');
  return (
    <polygon
      points={p}
      fill="#475569"
      opacity={0.7}
    />
  );
}
