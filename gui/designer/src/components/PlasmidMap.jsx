/**
 * PlasmidMap — circular plasmid overview with zoom/pan.
 * Clean view: feature arcs + labels + junction markers.
 * Primers shown in linear view / Primer Panel (not here).
 */
import { useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { getFragColor, isMarker } from '../theme';

const TAU = 2 * Math.PI;
function polar(cx, cy, r, a) { return { x: cx + r * Math.cos(a - Math.PI / 2), y: cy + r * Math.sin(a - Math.PI / 2) }; }
function sectorPath(cx, cy, oR, iR, s, e) {
  const os = polar(cx, cy, oR, s), oe = polar(cx, cy, oR, e);
  const is_ = polar(cx, cy, iR, s), ie = polar(cx, cy, iR, e);
  const lg = e - s > Math.PI ? 1 : 0;
  return `M ${os.x} ${os.y} A ${oR} ${oR} 0 ${lg} 1 ${oe.x} ${oe.y} L ${ie.x} ${ie.y} A ${iR} ${iR} 0 ${lg} 0 ${is_.x} ${is_.y} Z`;
}

export default function PlasmidMap({ fragments, constructName, totalBp, junctions = [], onSelectFragment, onJunctionClick }) {
  const [hovered, setHovered] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0, px: 0, py: 0 });

  const SIZE = 600;
  const cx = SIZE / 2, cy = SIZE / 2;
  const outerR = 140, innerR = 118, backboneR = (outerR + innerR) / 2;
  const labelR = outerR + 16;

  const onWheel = useCallback((e) => {
    e.preventDefault();
    setZoom(z => Math.max(0.5, Math.min(4, z + (e.deltaY > 0 ? -0.1 : 0.1))));
  }, []);
  const onMouseDown = (e) => { if (e.button !== 0) return; dragging.current = true; dragStart.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y }; };
  const onMouseMove = (e) => { if (!dragging.current) return; setPan({ x: dragStart.current.px + (e.clientX - dragStart.current.x) / zoom, y: dragStart.current.py + (e.clientY - dragStart.current.y) / zoom }); };
  const onMouseUp = () => { dragging.current = false; };

  if (!fragments?.length || !totalBp) return null;

  // Build arcs
  let offset = 0;
  const arcs = fragments.map((f, i) => {
    const len = (f.sequence || '').length || f.length || 0;
    const startBp = offset; offset += len;
    const sA = (startBp / totalBp) * TAU, eA = (offset / totalBp) * TAU;
    const color = isMarker(f.name) ? '#F0E442' : getFragColor(f.type, i);
    return { ...f, index: i, startAngle: sA, endAngle: eA, midAngle: (sA + eA) / 2, color, len };
  });

  // Center label — short construct name, not all fragments joined
  const centerName = constructName || (fragments.length <= 3 ? fragments.map(f => f.name).join('+') : `${fragments.length} фрагм.`);

  const vw = SIZE / zoom, vx = -pan.x + cx - vw / 2, vy = -pan.y + cy - vw / 2;

  return (
    <div className="relative w-full h-full flex flex-col items-center">
      {/* Zoom controls */}
      <div className="absolute top-2 right-2 flex items-center gap-1 z-10 bg-white/80 rounded-lg px-2 py-1 shadow-sm border">
        <button onClick={() => setZoom(z => Math.max(0.5, z - 0.2))} className="w-5 h-5 text-[11px] rounded hover:bg-gray-100 flex items-center justify-center">−</button>
        <span className="text-[10px] font-mono w-10 text-center">{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom(z => Math.min(4, z + 0.2))} className="w-5 h-5 text-[11px] rounded hover:bg-gray-100 flex items-center justify-center">+</button>
        <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} className="text-[9px] px-1.5 rounded hover:bg-gray-100 text-gray-500 ml-1">Сброс</button>
      </div>

      <svg viewBox={`${vx} ${vy} ${vw} ${vw}`}
        style={{ width: '100%', height: '100%', cursor: dragging.current ? 'grabbing' : 'grab' }}
        onWheel={onWheel} onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}>

        {/* Backbone ring */}
        <circle cx={cx} cy={cy} r={backboneR} fill="none" stroke="#e5e7eb" strokeWidth={outerR - innerR} />

        {/* Feature arcs */}
        {arcs.map((a, i) => {
          const isH = hovered === i;
          const gap = 0.008;
          return (
            <g key={i}>
              <path d={sectorPath(cx, cy, isH ? outerR + 4 : outerR, innerR, a.startAngle + gap, a.endAngle - gap)}
                fill={a.color} stroke="#fff" strokeWidth={1} opacity={isH ? 0.85 : 1}
                style={{ cursor: 'pointer', transition: 'all 100ms' }}
                onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)}
                onClick={() => onSelectFragment?.(i)} />
              {/* Direction arrow */}
              {a.endAngle - a.startAngle > 0.15 && (() => {
                const aA = a.strand === -1 ? a.startAngle + 0.05 : a.endAngle - 0.05;
                const t = polar(cx, cy, backboneR, aA);
                const d = a.strand === -1 ? -1 : 1;
                const pA = aA - Math.PI / 2;
                return <polygon points={`${t.x},${t.y} ${t.x-4*Math.cos(pA)+3*d*Math.sin(pA)},${t.y-4*Math.sin(pA)-3*d*Math.cos(pA)} ${t.x+4*Math.cos(pA)+3*d*Math.sin(pA)},${t.y+4*Math.sin(pA)-3*d*Math.cos(pA)}`}
                  fill="#fff" opacity={0.5} />;
              })()}
            </g>
          );
        })}

        {/* Junction markers (thin dashed ticks at boundaries) */}
        {arcs.map((a, i) => {
          if (i === 0) return null; // no junction before first
          const angle = a.startAngle;
          const inner = polar(cx, cy, innerR - 4, angle);
          const outer = polar(cx, cy, outerR + 4, angle);
          return (
            <line key={`jm-${i}`} x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y}
              stroke="#94a3b8" strokeWidth={1} strokeDasharray="3 2" opacity={0.5}
              style={{ cursor: 'pointer' }}
              onClick={(e) => { e.stopPropagation(); onJunctionClick?.(i - 1, e); }} />
          );
        })}
        {/* Closing junction (last → first) */}
        {fragments.length > 1 && (() => {
          const angle = arcs[0].startAngle; // = 0, top of circle
          const inner = polar(cx, cy, innerR - 4, angle);
          const outer = polar(cx, cy, outerR + 4, angle);
          return (
            <line x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y}
              stroke="#3b82f6" strokeWidth={1.5} strokeDasharray="3 2" opacity={0.6}
              style={{ cursor: 'pointer' }}
              onClick={(e) => { e.stopPropagation(); onJunctionClick?.(fragments.length - 1, e); }} />
          );
        })()}

        {/* Feature labels */}
        {arcs.map((a, i) => {
          const pct = ((a.endAngle - a.startAngle) / TAU) * 100;
          if (pct < 3) return null;
          const mid = a.midAngle, midD = (mid * 180) / Math.PI - 90;
          const isR = midD >= -90 && midD < 90;
          const lp = polar(cx, cy, labelR + 10, mid);
          return (
            <text key={`l-${i}`} x={lp.x} y={lp.y} textAnchor={isR ? 'start' : 'end'}
              dominantBaseline="central" fontSize={pct > 10 ? 11 : 9}
              fill={hovered === i ? a.color : '#555'} fontWeight={hovered === i ? 700 : 400}
              style={{ cursor: 'pointer' }}
              onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)}>
              {a.name} ({a.len})
            </text>
          );
        })}

        {/* Center: construct name + size */}
        <text x={cx} y={cy - 6} textAnchor="middle" fontSize={12} fontWeight={700} fill="#1a1a1a">
          {centerName.length > 20 ? centerName.slice(0, 18) + '…' : centerName}
        </text>
        <text x={cx} y={cy + 10} textAnchor="middle" fontSize={11} fill="#888">{totalBp} п.н.</text>

        {/* Hover tooltip */}
        {hovered !== null && (() => {
          const a = arcs[hovered], tp = polar(cx, cy, backboneR, a.midAngle);
          return (
            <g>
              <rect x={tp.x - 45} y={tp.y - 10} width={90} height={20} rx={4} fill="rgba(0,0,0,0.75)" />
              <text x={tp.x} y={tp.y + 3} textAnchor="middle" fontSize={9} fill="#fff">{a.name} · {a.len} п.н.</text>
            </g>
          );
        })()}
      </svg>
    </div>
  );
}
