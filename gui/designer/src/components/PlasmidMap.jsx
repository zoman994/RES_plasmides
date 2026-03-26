/**
 * PlasmidMap — circular plasmid visualization with zoom.
 * Forward primers outside, reverse primers inside.
 */
import { useState, useRef, useCallback } from 'react';
import { getFragColor, isMarker } from '../theme';

const TAU = 2 * Math.PI;
function polar(cx, cy, r, a) { return { x: cx + r * Math.cos(a - Math.PI / 2), y: cy + r * Math.sin(a - Math.PI / 2) }; }
function arcPath(cx, cy, r, s, e) {
  const sp = polar(cx, cy, r, s), ep = polar(cx, cy, r, e);
  return `M ${sp.x} ${sp.y} A ${r} ${r} 0 ${e - s > Math.PI ? 1 : 0} 1 ${ep.x} ${ep.y}`;
}
function sectorPath(cx, cy, oR, iR, s, e) {
  const os = polar(cx, cy, oR, s), oe = polar(cx, cy, oR, e);
  const is_ = polar(cx, cy, iR, s), ie = polar(cx, cy, iR, e);
  const lg = e - s > Math.PI ? 1 : 0;
  return `M ${os.x} ${os.y} A ${oR} ${oR} 0 ${lg} 1 ${oe.x} ${oe.y} L ${ie.x} ${ie.y} A ${iR} ${iR} 0 ${lg} 0 ${is_.x} ${is_.y} Z`;
}

export default function PlasmidMap({ fragments, name, totalBp, primers = [], onSelectFragment }) {
  const [hovered, setHovered] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0, px: 0, py: 0 });

  const SIZE = 500;
  const cx = SIZE / 2, cy = SIZE / 2;
  const outerR = 170, innerR = 145, backboneR = (outerR + innerR) / 2;
  const labelR = outerR + 22;
  const fwdPrimerR = outerR + 8;   // forward primers OUTSIDE
  const revPrimerR = innerR - 8;   // reverse primers INSIDE

  // Wheel zoom
  const onWheel = useCallback((e) => {
    e.preventDefault();
    setZoom(z => Math.max(0.5, Math.min(4, z + (e.deltaY > 0 ? -0.1 : 0.1))));
  }, []);

  // Pan
  const onMouseDown = (e) => {
    if (e.button !== 0) return;
    dragging.current = true;
    dragStart.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
  };
  const onMouseMove = (e) => {
    if (!dragging.current) return;
    setPan({ x: dragStart.current.px + (e.clientX - dragStart.current.x) / zoom, y: dragStart.current.py + (e.clientY - dragStart.current.y) / zoom });
  };
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

  // Primer arcs
  const primerArcs = primers.map(p => {
    const frag = fragments.find(f => p.name.includes(f.name));
    if (!frag) return null;
    const arc = arcs[fragments.indexOf(frag)];
    if (!arc) return null;
    const bL = (p.bindingSequence || '').length, tL = (p.tailSequence || '').length;
    if (!bL) return null;
    const bpR = (arc.endAngle - arc.startAngle) / arc.len;
    const isFwd = p.direction === 'forward';
    const bS = isFwd ? arc.startAngle : arc.endAngle - bL * bpR;
    const bE = isFwd ? arc.startAngle + bL * bpR : arc.endAngle;
    const tS = isFwd ? bS - tL * bpR : bE;
    const tE = isFwd ? bS : bE + tL * bpR;
    return { name: p.name, isFwd, bS, bE, tS, tE, tm: p.tmBinding };
  }).filter(Boolean);

  const vb = `${-pan.x + SIZE / 2 - SIZE / 2 / zoom} ${-pan.y + SIZE / 2 - SIZE / 2 / zoom} ${SIZE / zoom} ${SIZE / zoom}`;

  return (
    <div className="relative flex flex-col items-center">
      {/* Zoom controls */}
      <div className="absolute top-2 right-2 flex items-center gap-1 z-10 bg-white/80 rounded-lg px-2 py-1 shadow-sm border">
        <button onClick={() => setZoom(z => Math.max(0.5, z - 0.2))} className="w-5 h-5 text-[11px] rounded hover:bg-gray-100 flex items-center justify-center">−</button>
        <span className="text-[10px] font-mono w-10 text-center">{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom(z => Math.min(4, z + 0.2))} className="w-5 h-5 text-[11px] rounded hover:bg-gray-100 flex items-center justify-center">+</button>
        <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} className="text-[9px] px-1.5 rounded hover:bg-gray-100 text-gray-500 ml-1">Сброс</button>
      </div>

      <svg viewBox={vb} style={{ width: '100%', maxWidth: SIZE, aspectRatio: '1', cursor: dragging.current ? 'grabbing' : 'grab' }}
        onWheel={onWheel} onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}>

        {/* Backbone */}
        <circle cx={cx} cy={cy} r={backboneR} fill="none" stroke="#e5e7eb" strokeWidth={outerR - innerR} />

        {/* Feature arcs */}
        {arcs.map((a, i) => {
          const isH = hovered === i;
          return (
            <g key={i}>
              <path d={sectorPath(cx, cy, isH ? outerR + 4 : outerR, innerR, a.startAngle + 0.005, a.endAngle - 0.005)}
                fill={a.color} stroke="#fff" strokeWidth={1} opacity={isH ? 0.85 : 1}
                style={{ cursor: 'pointer', transition: 'all 100ms' }}
                onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)}
                onClick={() => onSelectFragment?.(i)} />
              {/* Direction arrow */}
              {a.endAngle - a.startAngle > 0.12 && (() => {
                const aA = a.strand === -1 ? a.startAngle + 0.04 : a.endAngle - 0.04;
                const t = polar(cx, cy, backboneR, aA);
                const d = a.strand === -1 ? -1 : 1;
                const pA = aA - Math.PI / 2;
                return <polygon points={`${t.x},${t.y} ${t.x - 4*Math.cos(pA)+3*d*Math.sin(pA)},${t.y - 4*Math.sin(pA)-3*d*Math.cos(pA)} ${t.x + 4*Math.cos(pA)+3*d*Math.sin(pA)},${t.y + 4*Math.sin(pA)-3*d*Math.cos(pA)}`}
                  fill="#fff" opacity={0.5} />;
              })()}
            </g>
          );
        })}

        {/* Forward primers — OUTSIDE the ring */}
        {primerArcs.filter(p => p.isFwd).map((p, i) => (
          <g key={`fwd-${i}`}>
            {Math.abs(p.tE - p.tS) > 0.001 && (
              <path d={arcPath(cx, cy, fwdPrimerR, Math.min(p.tS, p.tE), Math.max(p.tS, p.tE))}
                fill="none" stroke="#2563eb" strokeWidth={2.5} opacity={0.2} strokeLinecap="round" />
            )}
            <path d={arcPath(cx, cy, fwdPrimerR, p.bS, p.bE)}
              fill="none" stroke="#2563eb" strokeWidth={2.5} opacity={0.7} strokeLinecap="round" />
            <circle {...polar(cx, cy, fwdPrimerR, p.bE)} r={2} fill="#2563eb" opacity={0.8} />
          </g>
        ))}

        {/* Reverse primers — INSIDE the ring */}
        {primerArcs.filter(p => !p.isFwd).map((p, i) => (
          <g key={`rev-${i}`}>
            {Math.abs(p.tE - p.tS) > 0.001 && (
              <path d={arcPath(cx, cy, revPrimerR, Math.min(p.tS, p.tE), Math.max(p.tS, p.tE))}
                fill="none" stroke="#dc2626" strokeWidth={2.5} opacity={0.2} strokeLinecap="round" />
            )}
            <path d={arcPath(cx, cy, revPrimerR, p.bS, p.bE)}
              fill="none" stroke="#dc2626" strokeWidth={2.5} opacity={0.7} strokeLinecap="round" />
            <circle {...polar(cx, cy, revPrimerR, p.bS)} r={2} fill="#dc2626" opacity={0.8} />
          </g>
        ))}

        {/* Labels */}
        {arcs.map((a, i) => {
          const pct = ((a.endAngle - a.startAngle) / TAU) * 100;
          if (pct < 4) return null;
          const mid = a.midAngle, midD = (mid * 180) / Math.PI - 90;
          const isR = midD >= -90 && midD < 90;
          const lp = polar(cx, cy, labelR + 12, mid);
          return (
            <text key={`l-${i}`} x={lp.x} y={lp.y} textAnchor={isR ? 'start' : 'end'}
              dominantBaseline="central" fontSize={pct > 12 ? 11 : 9}
              fill={hovered === i ? a.color : '#555'} fontWeight={hovered === i ? 700 : 400}
              style={{ cursor: 'pointer' }}
              onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)}>
              {a.name} ({a.len})
            </text>
          );
        })}

        {/* Center */}
        <text x={cx} y={cy - 8} textAnchor="middle" fontSize={13} fontWeight={700} fill="#1a1a1a">
          {name || 'Плазмида'}
        </text>
        <text x={cx} y={cy + 8} textAnchor="middle" fontSize={11} fill="#888">{totalBp} п.н.</text>

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
