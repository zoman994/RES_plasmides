/**
 * PlasmidMap — circular plasmid overview with zoom/pan.
 * Clean view: feature arcs + labels + junction markers.
 * Primers shown in linear view / Primer Panel (not here).
 */
import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { getFragColor, isMarker, FEATURE_COLORS } from '../theme';
import { DOMAIN_COLORS } from '../domain-detection';
import { getRegions, getDetails } from '../annotation-model';
import { scanAllSites, detectMCS, getCompatible, RE_ENZYMES } from '../restriction-db';
import { featureColor, FEATURE_STROKE } from '../feature-palette';
import { useStore } from '../store';

const TAU = 2 * Math.PI;
function polar(cx, cy, r, a) { return { x: cx + r * Math.cos(a - Math.PI / 2), y: cy + r * Math.sin(a - Math.PI / 2) }; }

// Assign sub-tracks to overlapping sub-arcs within a single fragment
function assignSubTracks(subs) {
  const sorted = [...subs].sort((a, b) => a.startBp - b.startBp);
  const tracks = [];
  for (const s of sorted) {
    let placed = false;
    for (let t = 0; t < tracks.length; t++) {
      if (s.startBp >= tracks[t]) {
        tracks[t] = s.endBp;
        s._subTrack = t;
        placed = true;
        break;
      }
    }
    if (!placed) {
      s._subTrack = Math.min(tracks.length, 3);
      tracks.push(s.endBp);
    }
  }
  return { sorted, maxTrack: Math.min(Math.max(tracks.length - 1, 0), 3) };
}

// B2: assign tracks to overlapping arcs so they don't collide visually
function assignTracks(arcs) {
  const tracks = []; // each track stores the end angle of the last arc placed
  for (const arc of arcs) {
    let placed = false;
    for (let t = 0; t < tracks.length; t++) {
      if (arc.startAngle >= tracks[t] - 0.01) {
        tracks[t] = arc.endAngle;
        arc._track = t;
        placed = true;
        break;
      }
    }
    if (!placed) {
      arc._track = Math.min(tracks.length, 3); // max 4 tracks (0-3)
      tracks.push(arc.endAngle);
    }
  }
}
function sectorPath(cx, cy, oR, iR, s, e) {
  const os = polar(cx, cy, oR, s), oe = polar(cx, cy, oR, e);
  const is_ = polar(cx, cy, iR, s), ie = polar(cx, cy, iR, e);
  const lg = e - s > Math.PI ? 1 : 0;
  return `M ${os.x} ${os.y} A ${oR} ${oR} 0 ${lg} 1 ${oe.x} ${oe.y} L ${ie.x} ${ie.y} A ${iR} ${iR} 0 ${lg} 0 ${is_.x} ${is_.y} Z`;
}

export default function PlasmidMap({ fragments, constructName, totalBp, junctions = [], primers = [],
  onSelectFragment, onRemove, onFlip, onSplitSignal, onEditFragment,
  selectedRegionId = null, onSelectRegion }) {
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
  const [reHover, setReHover] = useState(null);
  const [rePopup, setRePopup] = useState(null);

  // RE site visualization state from store
  const showReSites = useStore(s => s.showReSites);
  const reFilter = useStore(s => s.reFilter);
  const reMinSiteLen = useStore(s => s.reMinSiteLen);
  const reHighlightEnzyme = useStore(s => s.reHighlightEnzyme);
  const setShowReSites = useStore(s => s.setShowReSites);
  const setReFilter = useStore(s => s.setReFilter);

  const SIZE = 600;
  const cx = SIZE / 2, cy = SIZE / 2;
  const outerR = 140, innerR = 118, backboneR = (outerR + innerR) / 2;
  const labelR = outerR + 16;
  // Primer tracks — fwd OUTSIDE backbone, rev INSIDE
  const fwdPrimerOuterR = outerR + 10, fwdPrimerInnerR = outerR + 4;
  const revPrimerOuterR = innerR - 4, revPrimerInnerR = innerR - 10;

  // Wheel zoom — must use native listener with { passive: false }
  // React's onWheel is passive by default, so preventDefault() is ignored
  const svgRef = useRef(null);
  const onWheel = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setZoom(z => Math.max(0.5, Math.min(4, z + (e.deltaY > 0 ? -0.1 : 0.1))));
  }, []);
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [onWheel]);
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
  assignTracks(arcs);
  const trackH = 6; // px per track level

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

  // RE site computation
  const reSites = useMemo(() => {
    if (!showReSites) return [];
    const fullSeq = fragments.map(f => f.sequence || '').join('');
    if (!fullSeq) return [];
    const all = scanAllSites(fullSeq, { circular: true, minSiteLen: reMinSiteLen });
    if (reFilter === 'unique') return all.filter(s => s.isUnique);
    if (reFilter === 'double') return all.filter(s => s.cutCount <= 2);
    return all;
  }, [fragments, showReSites, reFilter, reMinSiteLen]);

  const mcsRegion = useMemo(() => {
    if (!showReSites || !reSites.length) return null;
    const fullSeq = fragments.map(f => f.sequence || '').join('');
    return detectMCS(reSites, fullSeq.length);
  }, [reSites, showReSites, fragments]);

  // Center label — short construct name, not all fragments joined
  const centerName = constructName || (fragments.length <= 3 ? fragments.map(f => f.name).join('+') : `${fragments.length} фрагм.`);

  const vw = SIZE / zoom, vx = -pan.x + cx - vw / 2, vy = -pan.y + cy - vw / 2;

  return (
    <div className="relative w-full h-full overflow-hidden flex flex-col items-center min-h-0">
      {/* Zoom controls + RE toggle */}
      <div className="absolute top-2 right-2 flex items-center gap-1 z-10 bg-white/80 rounded-lg px-2 py-1 shadow-sm border">
        <button onClick={() => setShowReSites(!showReSites)}
          className={`text-[10px] px-2 py-1 rounded transition ${
            showReSites ? 'bg-red-50 text-red-600 border-red-200' : 'text-gray-500 hover:bg-gray-100'} border`}>
          {showReSites ? 'RE sites' : 'RE sites'}
        </button>
        {showReSites && (
          <div className="flex gap-1 ml-1">
            {['unique', 'double', 'all'].map(f => (
              <button key={f} onClick={() => setReFilter(f)}
                className={`text-[9px] px-1.5 py-0.5 rounded ${reFilter === f ? 'bg-gray-200 font-medium' : 'text-gray-400 hover:bg-gray-100'}`}>
                {f === 'unique' ? '1x' : f === 'double' ? '≤2x' : 'All'}
              </button>
            ))}
          </div>
        )}
        <span className="text-gray-300 mx-0.5">|</span>
        <button onClick={() => setZoom(z => Math.max(0.5, z - 0.2))} className="w-5 h-5 text-[11px] rounded hover:bg-gray-100 flex items-center justify-center">−</button>
        <span className="text-[10px] font-mono w-10 text-center">{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom(z => Math.min(4, z + 0.2))} className="w-5 h-5 text-[11px] rounded hover:bg-gray-100 flex items-center justify-center">+</button>
        <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} className="text-[9px] px-1.5 rounded hover:bg-gray-100 text-gray-500 ml-1">Сброс</button>
      </div>

      <svg ref={svgRef} viewBox={`${vx} ${vy} ${vw} ${vw}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ width: '100%', height: '100%', cursor: dragging.current ? 'grabbing' : 'grab' }}
        onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}>

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
              {/* Visible arc — with region/domain sub-arcs inside a colored frame */}
              {(() => {
                // Try region-based annotations first, fall back to legacy domains
                // P3 fix: dedup regions by start-end-type to prevent annotation stacking
                const allRegions = getRegions(a.annotations);
                const seen = new Set();
                const regions = allRegions.filter(r => {
                  const key = `${r.start}-${r.end}-${r.type}`;
                  if (seen.has(key)) return false;
                  seen.add(key);
                  return true;
                });
                const subArcs = regions.length > 0 ? regions : null;
                const legacyDoms = !subArcs && a.domains?.length > 0 ? a.domains : null;
                const hasSubs = subArcs || legacyDoms;
                const tOff = (a._track || 0) * trackH;
                const oRBase = (isSel ? outerR + 5 : isH ? outerR + 3 : outerR) - tOff;
                const iRBase = (isSel ? innerR - 2 : innerR) - tOff;
                if (!hasSubs) {
                  // Single solid arc (no domains/regions)
                  return (
                    <path d={sectorPath(cx, cy, oRBase, iRBase, a.startAngle + gap, a.endAngle - gap)}
                      fill={a.color} stroke={isSel ? '#000' : '#fff'} strokeWidth={isSel ? 2 : 1} opacity={isH ? 0.85 : 1}
                      style={{ transition: 'all 100ms' }}
                      onClick={() => { setSelected(isSel ? null : i); onSelectFragment?.(i); }} />
                  );
                }
                const fragLen = a.len || 1;

                // Build unified sub-arc list: { id, ftype, startBp, endBp, color, name, label }
                const rawSubs = subArcs
                  ? subArcs.map(r => ({ id: r.id, ftype: r.type, startBp: r.start, endBp: r.end, color: featureColor(r.type, r.name), name: r.name, label: r.name }))
                  : legacyDoms.map(dom => {
                      const isCDS = a.type === 'CDS' || a.type === 'gene';
                      return { id: null, ftype: dom.type, startBp: isCDS ? (dom.startAA - 1) * 3 : dom.startAA - 1, endBp: isCDS ? dom.endAA * 3 : dom.endAA, color: dom.color || DOMAIN_COLORS[dom.type] || a.color, name: dom.name, label: dom.name };
                    });
                const { sorted: subs, maxTrack } = assignSubTracks(rawSubs);
                const bandH = (oRBase - iRBase) / (maxTrack + 1);

                return (<>
                  {/* Backbone frame */}
                  <path d={sectorPath(cx, cy, oRBase, iRBase, a.startAngle + gap, a.endAngle - gap)}
                    fill="none" stroke="#e5e7eb" strokeWidth={1} opacity={0.5}
                    onClick={() => { setSelected(isSel ? null : i); onSelectFragment?.(i); }} />
                  {/* Sub-arc fills — each on its own track */}
                  {subs.map((sub, si) => {
                    const dsFrac = sub.startBp / fragLen;
                    const deFrac = Math.min(1, sub.endBp / fragLen);
                    const dsA = a.startAngle + (a.endAngle - a.startAngle) * dsFrac + gap;
                    const deA = a.startAngle + (a.endAngle - a.startAngle) * deFrac - gap * 0.2;
                    const subOR = oRBase - (sub._subTrack || 0) * bandH;
                    const subIR = subOR - bandH + 1;
                    const isRegSel = selectedRegionId != null && sub.id != null && sub.id === selectedRegionId;
                    const onSubClick = (e) => {
                      e.stopPropagation();
                      if (onSelectRegion && sub.id != null) {
                        onSelectRegion(isRegSel ? null : sub.id);
                      } else {
                        setSelected(isSel ? null : i);
                        onSelectFragment?.(i);
                      }
                    };
                    return (
                      <path key={`s${si}`}
                        data-testid={sub.id != null ? `sub-arc-${sub.id}` : undefined}
                        d={sectorPath(cx, cy, subOR, subIR, dsA, deA)}
                        fill={sub.color}
                        stroke={isRegSel ? FEATURE_STROKE : '#fff'}
                        strokeWidth={isRegSel ? 1.5 : 0.3}
                        opacity={isRegSel ? 1 : (isH ? 0.85 : 1)}
                        style={{
                          transition: 'all 100ms',
                          ...(isRegSel ? { filter: 'drop-shadow(0 0 1.5px rgba(58,47,31,0.35))' } : {}),
                        }}
                        onClick={onSubClick}>
                        <title>{sub.name} ({sub.startBp}–{sub.endBp})</title>
                      </path>
                    );
                  })}
                  {/* Sub-arc labels via textPath */}
                  {subs.map((sub, si) => {
                    const dsFrac = sub.startBp / fragLen;
                    const deFrac = Math.min(1, sub.endBp / fragLen);
                    const dsA = a.startAngle + (a.endAngle - a.startAngle) * dsFrac;
                    const deA = a.startAngle + (a.endAngle - a.startAngle) * deFrac;
                    const arcSpan = deA - dsA;
                    const subOR = oRBase - (sub._subTrack || 0) * bandH;
                    const subIR = subOR - bandH + 1;
                    const midR = (subOR + subIR) / 2;
                    const arcLen = arcSpan * midR;
                    if (arcLen < 25) return null;
                    const midA = (dsA + deA) / 2;
                    const isBottom = midA > Math.PI / 2 && midA < Math.PI * 1.5;
                    const [from, to] = isBottom ? [deA, dsA] : [dsA, deA];
                    const s = polar(cx, cy, midR, from), e = polar(cx, cy, midR, to);
                    const lg = arcSpan > Math.PI ? 1 : 0;
                    const pathId = `sub-tp-${i}-${si}`;
                    return (
                      <g key={`sl${si}`}>
                        <defs><path id={pathId} d={`M ${s.x} ${s.y} A ${midR} ${midR} 0 ${lg} ${isBottom ? 0 : 1} ${e.x} ${e.y}`} fill="none" /></defs>
                        <text className="pointer-events-none select-none"
                          style={{ fontSize: arcLen < 40 ? '5px' : '7px', fill: '#fff', fontWeight: 500 }}>
                          <textPath href={`#${pathId}`} startOffset="50%" textAnchor="middle">{sub.label}</textPath>
                        </text>
                      </g>
                    );
                  })}
                </>);
              })()}
              {/* Direction arrow */}
              {a.endAngle - a.startAngle > 0.15 && (() => {
                const aA = a.strand === -1 ? a.startAngle + 0.05 : a.endAngle - 0.05;
                const t = polar(cx, cy, backboneR, aA);
                const d = a.strand === -1 ? -1 : 1;
                const pA = aA - Math.PI / 2;
                return <polygon points={`${t.x},${t.y} ${t.x-4*Math.cos(pA)+3*d*Math.sin(pA)},${t.y-4*Math.sin(pA)-3*d*Math.cos(pA)} ${t.x+4*Math.cos(pA)+3*d*Math.sin(pA)},${t.y+4*Math.sin(pA)-3*d*Math.cos(pA)}`}
                  fill="#fff" opacity={0.5} />;
              })()}
              {/* Action buttons — shown on CLICK (selected) */}
              {isSel && (
                <foreignObject x={btnP.x - 48} y={btnP.y - 12} width={96} height={28}
                  style={{ overflow: 'visible', pointerEvents: 'none' }}>
                  <div style={{ pointerEvents: 'auto' }}
                    className="flex gap-0.5 bg-white rounded-full shadow-md border px-1 py-0.5 w-fit">
                    {onFlip && <button onClick={(e) => { e.stopPropagation(); onFlip(i); }}
                      className="w-5 h-5 rounded-full text-[10px] flex items-center justify-center hover:bg-indigo-100 text-indigo-600" title="Перевернуть">↻</button>}
                    {onSplitSignal && <button onClick={(e) => { e.stopPropagation(); onSplitSignal(i); }}
                      className="w-5 h-5 rounded-full text-[10px] flex items-center justify-center hover:bg-orange-100 text-orange-600" title="Разделить">✂</button>}
                    {onEditFragment && <button onClick={(e) => { e.stopPropagation(); onEditFragment(i); }}
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

        {/* Primer rings — fwd OUTSIDE (blue), rev INSIDE (red) */}
        <circle cx={cx} cy={cy} r={(fwdPrimerOuterR + fwdPrimerInnerR) / 2} fill="none" stroke="#eff6ff" strokeWidth={fwdPrimerOuterR - fwdPrimerInnerR} opacity={0.5} />
        <circle cx={cx} cy={cy} r={(revPrimerOuterR + revPrimerInnerR) / 2} fill="none" stroke="#fef2f2" strokeWidth={revPrimerOuterR - revPrimerInnerR} opacity={0.5} />
        {primerArcs.map((p, i) => {
          const c = p.isFwd ? '#2563eb' : '#dc2626';
          const pOuter = p.isFwd ? fwdPrimerOuterR : revPrimerOuterR;
          const pInner = p.isFwd ? fwdPrimerInnerR : revPrimerInnerR;
          const isHP = hovPrimer === i;
          const arrowAngle = p.isFwd ? p.bindE : p.bindS;
          const tipR = (pOuter + pInner) / 2;
          const tip = polar(cx, cy, tipR, arrowAngle + (p.isFwd ? 0.012 : -0.012));
          const b1 = polar(cx, cy, pOuter, arrowAngle);
          const b2 = polar(cx, cy, pInner, arrowAngle);
          const tp = polar(cx, cy, p.isFwd ? fwdPrimerOuterR + 10 : revPrimerInnerR - 10, p.midAngle);
          return (
            <g key={`pa-${i}`} style={{ cursor: 'pointer' }}
              onMouseEnter={() => setHovPrimer(i)} onMouseLeave={() => setHovPrimer(null)}>
              {Math.abs(p.tailE - p.tailS) > 0.002 && (
                <path d={sectorPath(cx, cy, pOuter, pInner, Math.min(p.tailS, p.tailE), Math.max(p.tailS, p.tailE))}
                  fill={c} opacity={0.2} stroke="none" />
              )}
              <path d={sectorPath(cx, cy, pOuter, pInner, p.bindS, p.bindE)}
                fill={c} opacity={isHP ? 0.9 : 0.6} stroke="#fff" strokeWidth={0.5}
                style={{ transition: 'opacity 100ms' }} />
              <polygon points={`${tip.x},${tip.y} ${b1.x},${b1.y} ${b2.x},${b2.y}`} fill={c} opacity={0.8} />
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

        {/* RE site tick marks */}
        {showReSites && reSites.flatMap(re => re.positions.map((pos, pi) => {
          const angle = (pos.position / totalBp) * TAU;
          const isHighlighted = reHighlightEnzyme === re.enzyme;
          const tickLen = re.isUnique ? 14 : re.cutCount <= 2 ? 10 : 6;
          const color = re.isUnique ? '#E24B4A' : re.cutCount <= 2 ? '#EF9F27' : '#888780';
          const innerP = polar(cx, cy, outerR + 2, angle);
          const outerP = polar(cx, cy, outerR + 2 + tickLen, angle);

          return (
            <g key={`re-${re.enzyme}-${pi}`}
              style={{ cursor: 'pointer' }}
              onMouseEnter={() => setReHover({ enzyme: re.enzyme, pos: pos.position, ...re, angle })}
              onMouseLeave={() => setReHover(null)}
              onClick={(e) => {
                e.stopPropagation();
                setRePopup({ enzyme: re.enzyme, pos: pos.position, ...re, x: e.clientX, y: e.clientY });
              }}>
              <line x1={innerP.x} y1={innerP.y} x2={outerP.x} y2={outerP.y}
                stroke={isHighlighted ? '#7F77DD' : color}
                strokeWidth={re.isUnique ? 1.5 : 1}
                strokeLinecap="round"
                opacity={isHighlighted ? 1 : 0.8} />
              {/* Label for unique cutters */}
              {re.isUnique && (() => {
                const labelP = polar(cx, cy, outerR + tickLen + 10, angle);
                const labelAngle = (angle * 180 / Math.PI) - 90;
                const flip = labelAngle > 90 && labelAngle < 270;
                return (
                  <text x={labelP.x} y={labelP.y} fontSize={8} fill={color}
                    textAnchor={flip ? 'end' : 'start'}
                    transform={`rotate(${flip ? labelAngle + 180 : labelAngle}, ${labelP.x}, ${labelP.y})`}
                    style={{ pointerEvents: 'none' }}>
                    {re.enzyme}
                  </text>
                );
              })()}
            </g>
          );
        }))}

        {/* MCS highlight arc */}
        {mcsRegion && showReSites && (() => {
          const startAngle = (mcsRegion.start / totalBp) * TAU;
          const endAngle = (mcsRegion.end / totalBp) * TAU;
          const mcsR = outerR + 22;
          return (
            <path d={`M ${polar(cx, cy, mcsR, startAngle).x} ${polar(cx, cy, mcsR, startAngle).y}
              A ${mcsR} ${mcsR} 0 ${endAngle - startAngle > Math.PI ? 1 : 0} 1
              ${polar(cx, cy, mcsR, endAngle).x} ${polar(cx, cy, mcsR, endAngle).y}`}
              fill="none" stroke="#7F77DD" strokeWidth={3} opacity={0.3} strokeLinecap="round" />
          );
        })()}

        {/* RE hover tooltip */}
        {reHover && (() => {
          const tp = polar(cx, cy, outerR + 30, reHover.angle);
          return (
            <g>
              <rect x={tp.x - 60} y={tp.y - 28} width={120} height={56} rx={6}
                fill="rgba(0,0,0,0.85)" />
              <text x={tp.x} y={tp.y - 14} textAnchor="middle" fontSize={10} fontWeight={600} fill="#fff">
                {reHover.enzyme}
              </text>
              <text x={tp.x} y={tp.y} textAnchor="middle" fontSize={8} fill="#ccc">
                pos {reHover.pos + 1} · {reHover.site}
              </text>
              <text x={tp.x} y={tp.y + 14} textAnchor="middle" fontSize={8} fill="#ccc">
                {reHover.end === 'blunt' ? 'blunt' : `${reHover.end === '5prime' ? "5'" : "3'"} ${reHover.overhang}`}
                {' · '}{reHover.buffer}
              </text>
            </g>
          );
        })()}

        {/* Feature labels — INSIDE the arcs via textPath */}
        <defs>
          {arcs.map((a, i) => {
            const r = backboneR;
            // Flip text for bottom half of circle so it reads left-to-right
            // midAngle: 0=12 o'clock, π/2=3, π=6, 3π/2=9
            // Bottom half: 3 o'clock → 9 o'clock (through 6) = midAngle ∈ (π/2, 3π/2)
            const isBottom = a.midAngle > Math.PI / 2 && a.midAngle < Math.PI * 1.5;
            // Flip arc direction for bottom half so text reads left-to-right
            const [from, to] = isBottom ? [a.endAngle, a.startAngle] : [a.startAngle, a.endAngle];
            const s = polar(cx, cy, r, from), e = polar(cx, cy, r, to);
            const large = Math.abs(a.endAngle - a.startAngle) > Math.PI ? 1 : 0;
            const sweep = isBottom ? 0 : 1;
            return <path key={`tp-${i}`} id={`arc-text-${i}`} d={`M ${s.x} ${s.y} A ${r} ${r} 0 ${large} ${sweep} ${e.x} ${e.y}`} fill="none" />;
          })}
        </defs>
        {arcs.map((a, i) => {
          const pct = ((a.endAngle - a.startAngle) / TAU) * 100;
          if (pct < 4) return null;
          const label = pct > 12 ? `${a.name} (${a.len})` : a.name;
          return (
            <text key={`l-${i}`} fontSize={pct > 15 ? 10 : 8} fill="#fff" fontWeight={600}
              style={{ pointerEvents: 'none', textShadow: '0 0 3px rgba(0,0,0,0.3)' }}>
              <textPath href={`#arc-text-${i}`} startOffset="50%" textAnchor="middle">
                {label}
              </textPath>
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

      {/* RE click popup (portal) */}
      {rePopup && createPortal(
        <div className="fixed z-50 bg-white rounded-xl shadow-xl border p-3 w-64"
          style={{ left: Math.min(rePopup.x + 10, window.innerWidth - 280),
                   top: Math.min(rePopup.y - 10, window.innerHeight - 300) }}>
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-bold">{rePopup.enzyme}</span>
            <button onClick={() => setRePopup(null)} className="text-gray-400 hover:text-gray-600">✕</button>
          </div>
          <div className="text-[10px] text-gray-600 space-y-1">
            <div>Позиция: <b>{rePopup.pos + 1}</b></div>
            <div>Сайт: <span className="font-mono">{rePopup.site}</span></div>
            <div>Концы: {rePopup.end === 'blunt' ? 'тупые' :
              `${rePopup.end === '5prime' ? "5'" : "3'"} overhang ${rePopup.overhang} (${rePopup.overhang?.length || 0} nt)`}</div>
            <div>Буфер: {rePopup.buffer}, {rePopup.temp}°C</div>
            {rePopup.isUnique && <div className="text-green-600 font-medium">✓ Unique cutter</div>}
            {!rePopup.isUnique && <div className="text-gray-400">Cuts {rePopup.cutCount}×</div>}
            {rePopup.damSensitive && <div className="text-amber-600">⚠ Dam-чувствителен</div>}
            {rePopup.dcmSensitive && <div className="text-amber-600">⚠ Dcm-чувствителен</div>}
            {(() => {
              const compat = getCompatible(rePopup.enzyme);
              return compat.length > 0 && (
                <div className="text-[9px] text-gray-400 mt-1">
                  Compatible: {compat.join(', ')}
                </div>
              );
            })()}
          </div>
          <div className="border-t mt-2 pt-2 flex gap-2">
            <button disabled className="text-[10px] px-2 py-1 rounded border text-gray-300 cursor-not-allowed"
              title="Будет в следующем обновлении">Разрезать</button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
