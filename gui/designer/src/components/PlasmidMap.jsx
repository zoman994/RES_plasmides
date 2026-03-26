/**
 * PlasmidMap — circular plasmid visualization using pure SVG.
 * No D3 dependency — math done inline.
 */
import { useState } from 'react';
import { getFragColor, isMarker } from '../theme';
import { SBOLIcon } from '../sbol-glyphs';

const TAU = 2 * Math.PI;

function polar(cx, cy, r, angle) {
  return { x: cx + r * Math.cos(angle - Math.PI / 2), y: cy + r * Math.sin(angle - Math.PI / 2) };
}

function arcPath(cx, cy, r, startAngle, endAngle) {
  const s = polar(cx, cy, r, startAngle);
  const e = polar(cx, cy, r, endAngle);
  const large = endAngle - startAngle > Math.PI ? 1 : 0;
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y}`;
}

function sectorPath(cx, cy, outerR, innerR, startAngle, endAngle) {
  const os = polar(cx, cy, outerR, startAngle);
  const oe = polar(cx, cy, outerR, endAngle);
  const is_ = polar(cx, cy, innerR, startAngle);
  const ie = polar(cx, cy, innerR, endAngle);
  const large = endAngle - startAngle > Math.PI ? 1 : 0;
  return [
    `M ${os.x} ${os.y}`,
    `A ${outerR} ${outerR} 0 ${large} 1 ${oe.x} ${oe.y}`,
    `L ${ie.x} ${ie.y}`,
    `A ${innerR} ${innerR} 0 ${large} 0 ${is_.x} ${is_.y}`,
    'Z',
  ].join(' ');
}

export default function PlasmidMap({ fragments, name, totalBp, primers = [], onSelectFragment }) {
  const [hovered, setHovered] = useState(null);
  const size = 400;
  const cx = size / 2, cy = size / 2;
  const outerR = 155, innerR = 130, backboneR = (outerR + innerR) / 2;
  const labelR = outerR + 20;

  if (!fragments?.length || !totalBp) return null;

  // Build arcs from fragments
  let offset = 0;
  const arcs = fragments.map((f, i) => {
    const len = (f.sequence || '').length || f.length || 0;
    const startBp = offset;
    offset += len;
    const endBp = offset;
    const startAngle = (startBp / totalBp) * TAU;
    const endAngle = (endBp / totalBp) * TAU;
    const midAngle = (startAngle + endAngle) / 2;
    const color = isMarker(f.name) ? '#F0E442' : getFragColor(f.type, i);
    return { ...f, index: i, startBp, endBp, startAngle, endAngle, midAngle, color, len };
  });

  // Primer arcs on inner ring
  const primerArcs = primers.map(p => {
    const frag = fragments.find(f => p.name.includes(f.name));
    if (!frag) return null;
    const fi = fragments.indexOf(frag);
    const arc = arcs[fi];
    if (!arc) return null;
    const bindLen = (p.bindingSequence || '').length;
    const tailLen = (p.tailSequence || '').length;
    const totalLen = bindLen + tailLen;
    if (!totalLen) return null;
    const isFwd = p.direction === 'forward';
    const bpPerRad = (arc.endAngle - arc.startAngle) / arc.len;
    let bindStart, bindEnd, tailStart, tailEnd;
    if (isFwd) {
      bindStart = arc.startAngle;
      bindEnd = arc.startAngle + bindLen * bpPerRad;
      tailStart = bindStart - tailLen * bpPerRad;
      tailEnd = bindStart;
    } else {
      bindEnd = arc.endAngle;
      bindStart = arc.endAngle - bindLen * bpPerRad;
      tailStart = arc.endAngle;
      tailEnd = arc.endAngle + tailLen * bpPerRad;
    }
    return { name: p.name, direction: p.direction, bindStart, bindEnd, tailStart, tailEnd, isFwd };
  }).filter(Boolean);

  return (
    <div className="flex justify-center">
      <svg viewBox={`0 0 ${size} ${size}`} style={{ width: '100%', maxWidth: size, aspectRatio: '1' }}>
        {/* Backbone circle */}
        <circle cx={cx} cy={cy} r={backboneR} fill="none" stroke="#e5e7eb" strokeWidth={outerR - innerR} />

        {/* Feature arcs */}
        {arcs.map((a, i) => {
          const isHov = hovered === i;
          const oR = isHov ? outerR + 5 : outerR;
          const gap = 0.005; // tiny gap between arcs
          return (
            <g key={i}>
              <path
                d={sectorPath(cx, cy, oR, innerR, a.startAngle + gap, a.endAngle - gap)}
                fill={a.color}
                stroke="#fff" strokeWidth={1}
                opacity={isHov ? 0.9 : 1}
                style={{ cursor: 'pointer', transition: 'all 120ms ease' }}
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => onSelectFragment?.(i)}
              />
              {/* Direction arrow on arc */}
              {a.endAngle - a.startAngle > 0.15 && (() => {
                const arrowAngle = a.strand === -1 ? a.startAngle + 0.05 : a.endAngle - 0.05;
                const tip = polar(cx, cy, (outerR + innerR) / 2, arrowAngle);
                const dir = a.strand === -1 ? -1 : 1;
                const perpAngle = arrowAngle - Math.PI / 2;
                return (
                  <polygon
                    points={`${tip.x},${tip.y} ${tip.x - 5 * Math.cos(perpAngle) + 4 * dir * Math.sin(perpAngle)},${tip.y - 5 * Math.sin(perpAngle) - 4 * dir * Math.cos(perpAngle)} ${tip.x + 5 * Math.cos(perpAngle) + 4 * dir * Math.sin(perpAngle)},${tip.y + 5 * Math.sin(perpAngle) - 4 * dir * Math.cos(perpAngle)}`}
                    fill="#fff" opacity={0.6}
                  />
                );
              })()}
            </g>
          );
        })}

        {/* Feature labels */}
        {arcs.map((a, i) => {
          const mid = a.midAngle;
          const midDeg = (mid * 180) / Math.PI - 90;
          const isRight = midDeg >= -90 && midDeg < 90;
          const lp = polar(cx, cy, labelR, mid);
          const pctWidth = ((a.endAngle - a.startAngle) / TAU) * 100;
          if (pctWidth < 5) return null; // skip tiny arcs
          return (
            <text key={`lbl-${i}`}
              x={lp.x} y={lp.y}
              textAnchor={isRight ? 'start' : 'end'}
              dominantBaseline="central"
              fontSize={pctWidth > 15 ? 11 : 9}
              fill={hovered === i ? a.color : '#555'}
              fontWeight={hovered === i ? 700 : 400}
              style={{ cursor: 'pointer', transition: 'all 120ms ease' }}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}>
              {a.name} ({a.len} п.н.)
            </text>
          );
        })}

        {/* Primer arcs on inner ring */}
        {primerArcs.map((p, i) => {
          const c = p.isFwd ? '#2563eb' : '#dc2626';
          const pR = p.isFwd ? innerR - 6 : innerR - 14;
          return (
            <g key={`pr-${i}`}>
              {/* Tail arc (semi-transparent) */}
              {p.tailEnd - p.tailStart > 0.001 && (
                <path d={arcPath(cx, cy, pR, Math.min(p.tailStart, p.tailEnd), Math.max(p.tailStart, p.tailEnd))}
                  fill="none" stroke={c} strokeWidth={3} opacity={0.25} strokeLinecap="round" />
              )}
              {/* Binding arc (solid) */}
              <path d={arcPath(cx, cy, pR, p.bindStart, p.bindEnd)}
                fill="none" stroke={c} strokeWidth={3} opacity={0.7} strokeLinecap="round" />
              {/* Arrow tip */}
              {(() => {
                const tipAngle = p.isFwd ? p.bindEnd : p.bindStart;
                const tip = polar(cx, cy, pR, tipAngle);
                return <circle cx={tip.x} cy={tip.y} r={2.5} fill={c} opacity={0.8} />;
              })()}
            </g>
          );
        })}

        {/* Center: plasmid name + size */}
        <text x={cx} y={cy - 10} textAnchor="middle" fontSize={15} fontWeight={700} fill="#1a1a1a">
          {name || 'Плазмида'}
        </text>
        <text x={cx} y={cy + 10} textAnchor="middle" fontSize={12} fill="#888">
          {totalBp} п.н.
        </text>
        <text x={cx} y={cy + 26} textAnchor="middle" fontSize={10} fill="#bbb">
          {fragments.length} фрагм.
        </text>

        {/* Hover tooltip */}
        {hovered !== null && (() => {
          const a = arcs[hovered];
          const tp = polar(cx, cy, innerR - 20, a.midAngle);
          return (
            <g>
              <rect x={tp.x - 50} y={tp.y - 12} width={100} height={24} rx={4}
                fill="rgba(0,0,0,0.8)" />
              <text x={tp.x} y={tp.y + 4} textAnchor="middle" fontSize={10} fill="#fff">
                {a.name} · {a.len} п.н.
              </text>
            </g>
          );
        })()}
      </svg>
    </div>
  );
}
