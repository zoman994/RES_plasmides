/**
 * PlasmidMap — circular plasmid overview with zoom/pan.
 * Clean view: feature arcs + labels + junction markers.
 * Primers shown in linear view / Primer Panel (not here).
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import { getFragColor, isMarker } from '../theme';

const TAU = 2 * Math.PI;
function polar(cx, cy, r, a) { return { x: cx + r * Math.cos(a - Math.PI / 2), y: cy + r * Math.sin(a - Math.PI / 2) }; }
function sectorPath(cx, cy, oR, iR, s, e) {
  const os = polar(cx, cy, oR, s), oe = polar(cx, cy, oR, e);
  const is_ = polar(cx, cy, iR, s), ie = polar(cx, cy, iR, e);
  const lg = e - s > Math.PI ? 1 : 0;
  return `M ${os.x} ${os.y} A ${oR} ${oR} 0 ${lg} 1 ${oe.x} ${oe.y} L ${ie.x} ${ie.y} A ${iR} ${iR} 0 ${lg} 0 ${is_.x} ${is_.y} Z`;
}

export default function PlasmidMap({ fragments, constructName, totalBp, junctions = [], primers = [],
  onSelectFragment, onRemove, onFlip, onSplitSignal, onEditSequence }) {
  const [hovered, setHovered] = useState(null);
  const [selected, setSelected] = useState(null);
  const [hovJunc, setHovJunc] = useState(null);
  const [selJunc, setSelJunc] = useState(null);
  const [popupPos, setPopupPos] = useState(null);
  const popupRef = useRef(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0, px: 0, py: 0 });

  const [hovPrimer, setHovPrimer] = useState(null);

  const SIZE = 600;
  const cx = SIZE / 2, cy = SIZE / 2;
  const outerR = 140, innerR = 118, backboneR = (outerR + innerR) / 2;
  const labelR = outerR + 16;
  // Primer track ring — inside the backbone
  const primerOuterR = innerR - 4, primerInnerR = innerR - 16;

  const onWheel = useCallback((e) => {
    e.preventDefault();
    setZoom(z => Math.max(0.5, Math.min(4, z + (e.deltaY > 0 ? -0.1 : 0.1))));
  }, []);
  const onMouseDown = (e) => { if (e.button !== 0) return; dragging.current = true; dragStart.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y }; };
  const onMouseMove = (e) => { if (!dragging.current) return; setPan({ x: dragStart.current.px + (e.clientX - dragStart.current.x) / zoom, y: dragStart.current.py + (e.clientY - dragStart.current.y) / zoom }); };
  const onMouseUp = () => { dragging.current = false; };

  // Close popup on click outside
  useEffect(() => {
    if (selJunc === null) return;
    const h = (e) => { if (popupRef.current && !popupRef.current.contains(e.target)) setSelJunc(null); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [selJunc]);

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

  // Primer arcs for inner ring
  const primerArcs = primers.map((p, pi) => {
    const frag = fragments.find(f => p.name.includes(f.name));
    if (!frag) return null;
    const arc = arcs[fragments.indexOf(frag)];
    if (!arc) return null;
    const bL = (p.bindingSequence || '').length, tL = (p.tailSequence || '').length;
    if (!bL) return null;
    const bpR = arc.len > 0 ? (arc.endAngle - arc.startAngle) / arc.len : 0;
    const isFwd = p.direction === 'forward';
    // Binding at fragment edge, tail extends into neighbor
    const MIN_ANG = 0.03; // minimum visible angle (~2°)
    const bAng = Math.max(bL * bpR, MIN_ANG);
    const tAng = tL > 0 ? Math.max(tL * bpR, MIN_ANG * 0.5) : 0;
    const bindS = isFwd ? arc.startAngle : arc.endAngle - bAng;
    const bindE = isFwd ? arc.startAngle + bAng : arc.endAngle;
    const tailS = isFwd ? bindS - tAng : bindE;
    const tailE = isFwd ? bindS : bindE + tAng;
    const fullS = Math.min(bindS, tailS), fullE = Math.max(bindE, tailE);
    return { ...p, pi, isFwd, bindS, bindE, tailS, tailE, fullS, fullE, midAngle: (fullS + fullE) / 2 };
  }).filter(Boolean);

  // Center label — short construct name, not all fragments joined
  const centerName = constructName || (fragments.length <= 3 ? fragments.map(f => f.name).join('+') : `${fragments.length} фрагм.`);

  const vw = SIZE / zoom, vx = -pan.x + cx - vw / 2, vy = -pan.y + cy - vw / 2;

  return (
    <div className="relative w-full h-full overflow-hidden flex flex-col items-center min-h-0">
      {/* Zoom controls */}
      <div className="absolute top-2 right-2 flex items-center gap-1 z-10 bg-white/80 rounded-lg px-2 py-1 shadow-sm border">
        <button onClick={() => setZoom(z => Math.max(0.5, z - 0.2))} className="w-5 h-5 text-[11px] rounded hover:bg-gray-100 flex items-center justify-center">−</button>
        <span className="text-[10px] font-mono w-10 text-center">{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom(z => Math.min(4, z + 0.2))} className="w-5 h-5 text-[11px] rounded hover:bg-gray-100 flex items-center justify-center">+</button>
        <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} className="text-[9px] px-1.5 rounded hover:bg-gray-100 text-gray-500 ml-1">Сброс</button>
      </div>

      <svg viewBox={`${vx} ${vy} ${vw} ${vw}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ width: '100%', height: '100%', cursor: dragging.current ? 'grabbing' : 'grab' }}
        onWheel={onWheel} onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}>

        {/* Backbone ring */}
        <circle cx={cx} cy={cy} r={backboneR} fill="none" stroke="#e5e7eb" strokeWidth={outerR - innerR} />

        {/* Feature arcs */}
        {arcs.map((a, i) => {
          const isH = hovered === i;
          const isSel = selected === i;
          const gap = 0.008;
          const btnP = polar(cx, cy, outerR + 28, a.midAngle);
          return (
            <g key={i}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
              style={{ cursor: 'pointer' }}>
              {/* Invisible wider hit area */}
              <path d={sectorPath(cx, cy, outerR + 20, innerR - 8, a.startAngle, a.endAngle)}
                fill="transparent" stroke="none" />
              {/* Visible arc */}
              <path d={sectorPath(cx, cy, isSel ? outerR + 5 : isH ? outerR + 3 : outerR, isSel ? innerR - 2 : innerR, a.startAngle + gap, a.endAngle - gap)}
                fill={a.color} stroke={isSel ? '#000' : '#fff'} strokeWidth={isSel ? 2 : 1} opacity={isH ? 0.85 : 1}
                style={{ transition: 'all 100ms' }}
                onClick={() => { setSelected(isSel ? null : i); onSelectFragment?.(i); }} />
              {/* Direction arrow */}
              {a.endAngle - a.startAngle > 0.15 && (() => {
                const aA = a.strand === -1 ? a.startAngle + 0.05 : a.endAngle - 0.05;
                const t = polar(cx, cy, backboneR, aA);
                const d = a.strand === -1 ? -1 : 1;
                const pA = aA - Math.PI / 2;
                return <polygon points={`${t.x},${t.y} ${t.x-4*Math.cos(pA)+3*d*Math.sin(pA)},${t.y-4*Math.sin(pA)-3*d*Math.cos(pA)} ${t.x+4*Math.cos(pA)+3*d*Math.sin(pA)},${t.y+4*Math.sin(pA)-3*d*Math.cos(pA)}`}
                  fill="#fff" opacity={0.5} />;
              })()}
              {/* Action buttons — inside <g> so hover persists */}
              {isH && (
                <foreignObject x={btnP.x - 48} y={btnP.y - 12} width={96} height={28}
                  style={{ overflow: 'visible', pointerEvents: 'none' }}>
                  <div style={{ pointerEvents: 'auto' }}
                    className="flex gap-0.5 bg-white rounded-full shadow-md border px-1 py-0.5 w-fit">
                    {onFlip && <button onClick={(e) => { e.stopPropagation(); onFlip(i); }}
                      className="w-5 h-5 rounded-full text-[10px] flex items-center justify-center hover:bg-indigo-100 text-indigo-600" title="Перевернуть">↻</button>}
                    {onSplitSignal && <button onClick={(e) => { e.stopPropagation(); onSplitSignal(i); }}
                      className="w-5 h-5 rounded-full text-[10px] flex items-center justify-center hover:bg-orange-100 text-orange-600" title="Разделить">✂</button>}
                    {onEditSequence && <button onClick={(e) => { e.stopPropagation(); onEditSequence(i); }}
                      className="w-5 h-5 rounded-full text-[10px] flex items-center justify-center hover:bg-blue-100 text-blue-600" title="Редактировать">✏️</button>}
                    {onRemove && <button onClick={(e) => { e.stopPropagation(); onRemove(i); }}
                      className="w-5 h-5 rounded-full text-[10px] flex items-center justify-center hover:bg-red-100 text-red-500" title="Удалить">×</button>}
                  </div>
                </foreignObject>
              )}
            </g>
          );
        })}

        {/* Junction zones — interactive ticks with hover + click */}
        {junctions.map((j, ji) => {
          const angle = arcs[ji + 1]?.startAngle ?? arcs[0].startAngle;
          const isClosing = ji === junctions.length - 1 && fragments.length > 1;
          const isHJ = hovJunc === ji;
          const inner = polar(cx, cy, innerR - 6, angle);
          const outer = polar(cx, cy, outerR + 6, angle);
          const mid = polar(cx, cy, outerR + 14, angle);
          const oLen = j.overlapSequence?.length || j.overlapLength || 30;
          return (
            <g key={`jz-${ji}`}>
              {/* Wide invisible click target */}
              <line x1={polar(cx, cy, innerR - 15, angle).x} y1={polar(cx, cy, innerR - 15, angle).y}
                x2={polar(cx, cy, outerR + 15, angle).x} y2={polar(cx, cy, outerR + 15, angle).y}
                stroke="transparent" strokeWidth={12} style={{ cursor: 'pointer' }}
                onMouseEnter={() => setHovJunc(ji)} onMouseLeave={() => setHovJunc(null)}
                onClick={(e) => { e.stopPropagation(); setSelJunc(ji); setPopupPos({ x: e.clientX, y: e.clientY }); }} />
              {/* Visible tick */}
              <line x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y}
                stroke={isHJ ? '#3b82f6' : (isClosing ? '#3b82f6' : '#94a3b8')}
                strokeWidth={isHJ ? 2 : 1} strokeDasharray={isHJ ? 'none' : '3 2'}
                opacity={isHJ ? 0.8 : 0.5} />
              {/* Hover label */}
              {isHJ && (
                <text x={mid.x} y={mid.y} textAnchor="middle" dominantBaseline="central"
                  fontSize={8} fill="#3b82f6" fontWeight={600}>
                  {'◀▶'}{oLen}
                </text>
              )}
            </g>
          );
        })}

        {/* Primer ring — SnapGene-style arrow arcs inside backbone */}
        <circle cx={cx} cy={cy} r={(primerOuterR + primerInnerR) / 2} fill="none" stroke="#f1f5f9" strokeWidth={primerOuterR - primerInnerR} />
        {primerArcs.map((p, i) => {
          const c = p.isFwd ? '#2563eb' : '#dc2626';
          const isHP = hovPrimer === i;
          // Arrowhead at 3' end
          const arrowAngle = p.isFwd ? p.bindE : p.bindS;
          const tipR = (primerOuterR + primerInnerR) / 2;
          const tip = polar(cx, cy, tipR, arrowAngle + (p.isFwd ? 0.012 : -0.012));
          const b1 = polar(cx, cy, primerOuterR, arrowAngle);
          const b2 = polar(cx, cy, primerInnerR, arrowAngle);
          // Tooltip position
          const tp = polar(cx, cy, primerInnerR - 10, p.midAngle);
          return (
            <g key={`pa-${i}`} style={{ cursor: 'pointer' }}
              onMouseEnter={() => setHovPrimer(i)} onMouseLeave={() => setHovPrimer(null)}>
              {/* Tail arc (transparent) */}
              {Math.abs(p.tailE - p.tailS) > 0.002 && (
                <path d={sectorPath(cx, cy, primerOuterR, primerInnerR, Math.min(p.tailS, p.tailE), Math.max(p.tailS, p.tailE))}
                  fill={c} opacity={0.2} stroke="none" />
              )}
              {/* Binding arc (solid) */}
              <path d={sectorPath(cx, cy, primerOuterR, primerInnerR, p.bindS, p.bindE)}
                fill={c} opacity={isHP ? 0.9 : 0.6} stroke="#fff" strokeWidth={0.5}
                style={{ transition: 'opacity 100ms' }} />
              {/* Arrowhead */}
              <polygon points={`${tip.x},${tip.y} ${b1.x},${b1.y} ${b2.x},${b2.y}`} fill={c} opacity={0.8} />
              {/* Hover tooltip */}
              {isHP && (
                <g>
                  <rect x={tp.x - 50} y={tp.y - 8} width={100} height={16} rx={3}
                    fill="white" stroke={c} strokeWidth={0.5} />
                  <text x={tp.x} y={tp.y + 3} textAnchor="middle" fontSize={7} fill="#333">
                    {p.name.match(/^[A-Za-z]+\d+/)?.[0] || p.name.slice(0, 10)} · Tm {p.tmBinding}°
                  </text>
                </g>
              )}
            </g>
          );
        })}

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

      {/* Junction detail popup */}
      {selJunc !== null && popupPos && junctions[selJunc] && (
        <div ref={popupRef} className="fixed z-50 bg-white rounded-xl shadow-xl border p-4 max-w-sm"
          style={{ left: Math.min(popupPos.x + 10, window.innerWidth - 380), top: Math.min(popupPos.y - 10, window.innerHeight - 300) }}>
          <div className="flex justify-between items-center mb-2">
            <span className="text-[11px] font-semibold text-gray-700">
              {fragments[selJunc]?.name} {'↔'} {fragments[(selJunc + 1) % fragments.length]?.name}
            </span>
            <button onClick={() => setSelJunc(null)} className="text-gray-400 hover:text-gray-600 text-sm">{'✕'}</button>
          </div>
          <div className="text-[10px] text-gray-500 space-y-1">
            <div>Overlap: <strong>{junctions[selJunc].overlapSequence?.length || junctions[selJunc].overlapLength || 30} п.н.</strong></div>
            {junctions[selJunc].overlapTm && <div>Tm: <strong>{junctions[selJunc].overlapTm}°C</strong></div>}
            <div>Режим: {junctions[selJunc].overlapMode === 'left_only' ? '◀ на левом' : junctions[selJunc].overlapMode === 'right_only' ? '▶ на правом' : '◀▶ split'}</div>
            {/* Primers for this junction */}
            {(() => {
              const leftName = fragments[selJunc]?.name || '';
              const rightName = fragments[(selJunc + 1) % fragments.length]?.name || '';
              const revP = primers.find(p => p.direction === 'reverse' && p.name.includes(leftName));
              const fwdP = primers.find(p => p.direction === 'forward' && p.name.includes(rightName));
              return (
                <>
                  {revP && (
                    <div className="bg-gray-50 rounded p-1.5 mt-1">
                      <div className="text-[9px] text-gray-500">{revP.name} ←</div>
                      <div className="font-mono text-[10px] overflow-x-auto whitespace-nowrap" style={{ fontWeight: 400 }}>
                        <span className="text-gray-400 text-[8px]">5'─</span>
                        <span className="text-teal-600">{(revP.tailSequence || '').toLowerCase()}</span>
                        <span className="text-gray-800">{(revP.bindingSequence || '').toUpperCase()}</span>
                        <span className="text-gray-400 text-[8px]">─3'</span>
                      </div>
                    </div>
                  )}
                  {fwdP && (
                    <div className="bg-gray-50 rounded p-1.5 mt-1">
                      <div className="text-[9px] text-gray-500">→ {fwdP.name}</div>
                      <div className="font-mono text-[10px] overflow-x-auto whitespace-nowrap" style={{ fontWeight: 400 }}>
                        <span className="text-gray-400 text-[8px]">5'─</span>
                        <span className="text-teal-600">{(fwdP.tailSequence || '').toLowerCase()}</span>
                        <span className="text-gray-800">{(fwdP.bindingSequence || '').toUpperCase()}</span>
                        <span className="text-gray-400 text-[8px]">─3'</span>
                      </div>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
