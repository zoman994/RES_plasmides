/**
 * LinearMapV2 — the LINEAR fragment/plasmid map («колбаска»). The sibling of the
 * circular PlasmidMapV2 for the case Игорь meant by «линейная форма»: when the
 * source fragment is itself linear (a circle would misrepresent it), and as an
 * opt-in second view for circular sources. Feature arrows on lanes + clickable RE
 * sites on a horizontal axis. Geometry — pure lib/linear-map (+ shared scan/filter
 * with the circular map, so RE visibility is byte-identical).
 *
 * Scans circular:false for a linear topology → no phantom origin-spanning site.
 */
import { useMemo } from 'react';
import { getRegions, getAllDetails, getPoints } from '../annotation-model';
import { scanAllSites } from '../restriction-db';
import { filterReSites } from '../lib/re-site-filter';
import { featureColorShaded, FEATURE_STROKE } from '../feature-palette';
import { isFragmentFeature } from '../lib/feature-fragment';
import { useStore, selectActiveSetEnzymes, selectMergedREEnzymes } from '../store';
import { buildReMarkers, featuresFromFragments } from '../lib/plasmid-map-v2';
import { lanePack, laneCount, linearTicks, bpToX } from '../lib/linear-map';
import { getSegments, locationLength, formatUiRange } from '../lib/annotation-location';
import PrimerSiteOverlay from './PrimerSiteOverlay';

const W = 920;
const PAD = 46;
const X0 = PAD; const X1 = W - PAD;
const RE_LABEL_H = 16;
const FEAT_LANE_H = 22;

function arrowPath(x0, x1, y, h, strand) {
  const head = Math.max(0, Math.min(8, (x1 - x0) / 2));
  if (strand < 0) {
    return `M${x1},${y} L${x0 + head},${y} L${x0},${y + h / 2} L${x0 + head},${y + h} L${x1},${y + h} Z`;
  }
  return `M${x0},${y} L${x1 - head},${y} L${x1},${y + h / 2} L${x1 - head},${y + h} L${x0},${y + h} Z`;
}

function trunc(s, n = 16) { return (s || '').length > n ? `${s.slice(0, n - 1)}…` : (s || ''); }

export default function LinearMapV2({
  fragments, annotations, length, constructName, totalBp, topology = 'linear',
  onFeatureClick, selectedRegionId = null, onSelectRegion, onSelectFragment,
  reEnzymesFilter = null, onReSiteClick = null,
  // ANN-0L — canonical primer records; their known source sites are drawn by
  // the shared overlay so every surface agrees on where a primer binds.
  // ANN-0M root D — `renderContext` is the ONE description of the molecule on
  // screen. Assembling a partial variant here is how two surfaces ended up
  // disagreeing about whether a primer binds at all.
  primers = null, renderContext = null, onSelectPrimerSite = null,
}) {
  const showReSites = useStore((s) => s.showReSites);
  const reFilter = useStore((s) => s.reFilter);
  const reMinSiteLen = useStore((s) => s.reMinSiteLen);
  const setShowReSites = useStore((s) => s.setShowReSites);
  const setReFilter = useStore((s) => s.setReFilter);
  const activeSetEnzymes = useStore(selectActiveSetEnzymes);
  const mergedREEnzymes = useStore(selectMergedREEnzymes);

  const total = totalBp || length || 0;
  const fullSeq = useMemo(() => (fragments || []).map((f) => f.sequence || '').join(''), [fragments]);
  const hasSequence = !!fullSeq;
  const centerName = constructName || '';

  const features = useMemo(() => {
    const feats = annotations
      ? getRegions(annotations).map((r) => ({
        id: r.id, name: r.name || r.type || '—', type: r.type || 'misc',
        // ANN-0A — carry canonical segments through the reshape.
        segments: getSegments(r),
        start: r.start, end: r.end, strand: Number.isFinite(r.strand) ? r.strand : 1,
        // UX-4 — fragment-ness from the full region before this lossy reshape.
        isFragment: isFragmentFeature(r),
      }))
      : featuresFromFragments(fragments, getRegions).map((f) => ({ ...f, isFragment: isFragmentFeature(f) }));
    return feats
      .filter((f) => Number.isFinite(f.start) && Number.isFinite(f.end))
      .map((f, i) => ({ ...f, i, fill: featureColorShaded(f.type, f.name) || 'var(--feature-misc, #EEE7D5)' }));
  }, [fragments, annotations]);

  // UX-1 / V-FEAT-3 — sub-features (detail) + points are drawn nested in the
  // parent region's lane so a gene's introns/domains (and mutations/RE marks)
  // are visible on the map, not only in the sequence track. Only on the
  // `annotations` path (single molecule) — fragments-mode coords are offset.
  const details = useMemo(() => (annotations
    ? getAllDetails(annotations)
      .filter((d) => Number.isFinite(d.start) && Number.isFinite(d.end))
      .map((d) => ({ ...d, fill: featureColorShaded(d.type, d.name) || 'var(--feature-misc, #EEE7D5)', isFragment: isFragmentFeature(d) }))
    : []), [annotations]);
  const points = useMemo(() => (annotations
    ? getPoints(annotations)
      .filter((p) => Number.isFinite(p.start))
      .map((p) => ({ ...p, fill: featureColorShaded(p.type, p.name) || 'var(--viz-junction, #94a3b8)' }))
    : []), [annotations]);

  // RE sites — the SAME scan + shared filter as the circular map (RS-B1). A digest
  // enzyme-list overrides the global cut-count filter; otherwise the global mode.
  // circular:false for a linear topology — no origin-spanning site.
  const reEnzKey = Array.isArray(reEnzymesFilter) && reEnzymesFilter.length
    ? [...reEnzymesFilter].sort().join('|') : null;
  const reSites = useMemo(() => {
    const effShow = reEnzKey != null ? true : showReSites;
    if (!effShow || !total || !hasSequence) return [];
    const all = scanAllSites(fullSeq, {
      circular: topology === 'circular',
      minSiteLen: reMinSiteLen,
      enzymes: mergedREEnzymes,
    });
    const filtered = reEnzKey != null
      ? filterReSites(all, { enzymes: reEnzKey.split('|') })
      : filterReSites(all, { mode: reFilter, enzymes: activeSetEnzymes });
    return filtered.flatMap((s) => (s.positions || [])
      .map((p) => {
        const occurrence = p && typeof p === 'object' ? p.occurrence : null;
        return {
          enzyme: s.enzyme,
          pos: Number.isFinite(occurrence?.topCut)
            ? occurrence.topCut
            : typeof p === 'number' ? p : p?.position,
          occurrence,
        };
      })
      .filter((re) => Number.isFinite(re.pos)));
  }, [fullSeq, showReSites, reFilter, reMinSiteLen, total, hasSequence, reEnzKey, activeSetEnzymes, topology, mergedREEnzymes]);

  const reMarkers = useMemo(() => buildReMarkers(reSites, total || 1, {}), [reSites, total]);

  // Pixel extents of every real part of a feature — a compound feature occupies
  // only its segments, not the bounding span between them.
  const featPartsPx = useMemo(() => features.map((f) => getSegments(f).map((s) => {
    const a = bpToX(s.start, total, X0, X1);
    const b = bpToX(s.end, total, X0, X1);
    return { start: a, end: Math.max(b, a + 3) };
  })), [features, total]);

  // Feature lanes. ANN-0A — packing tests every real part, so the empty gap of a
  // spliced gene (or the middle of an origin-crossing one) stays available to
  // other features instead of being reserved by a phantom bounding span. One
  // lane per feature, so its parts always read as one row.
  const featLanes = useMemo(() => {
    const occupiedByLane = [];
    return featPartsPx.map((partsPx) => {
      const probe = partsPx.length
        ? partsPx
        : [{ start: bpToX(0, total, X0, X1), end: bpToX(0, total, X0, X1) + 8 }];
      for (let lane = 0; ; lane++) {
        const occupied = occupiedByLane[lane] || (occupiedByLane[lane] = []);
        const collides = probe.some((p) => occupied.some((o) => p.start < o.end && o.start < p.end));
        if (!collides) {
          occupied.push(...probe);
          return lane;
        }
      }
    });
  }, [featPartsPx, total]);
  const nFeatLanes = featLanes.length ? Math.max(...featLanes) + 1 : 0;

  // region.id → lane, so a detail/point draws on its parent's band (inset).
  const regionLaneById = useMemo(() => {
    const m = new Map();
    features.forEach((f) => { if (f.id != null) m.set(f.id, featLanes[f.i]); });
    return m;
  }, [features, featLanes]);

  // RE label lanes (by label-text pixel extent around the cut x).
  const reLabelExtents = reMarkers.map((m) => {
    const xc = bpToX(m.positions[0], total, X0, X1);
    const text = m.count > 1 ? `${m.enzyme} ×${m.count}` : `${m.enzyme}·${m.positions[0] + 1}`;
    const w = text.length * 6.1 + 8;
    return { start: xc - w / 2, end: xc + w / 2, xc, text };
  });
  const reLabelLanes = useMemo(() => lanePack(reLabelExtents), [reMarkers, total]);
  const nReLanes = reMarkers.length ? laneCount(reLabelLanes) : 0;

  const topPad = nReLanes * RE_LABEL_H + 12;
  const featTop = topPad;
  const axisY = featTop + nFeatLanes * FEAT_LANE_H + 6;
  const H = axisY + 34;

  const { majors } = total ? linearTicks(total) : { majors: [] };

  const clickFeature = (f) => {
    if (onSelectRegion && f.id != null) onSelectRegion(f.id === selectedRegionId ? null : f.id);
    onSelectFragment?.(f.i);
    onFeatureClick?.(f);
  };
  // Sub-feature / point click — select by id (no fragment index).
  const clickAnn = (a) => {
    if (onSelectRegion && a.id != null) onSelectRegion(a.id === selectedRegionId ? null : a.id);
    onFeatureClick?.(a);
  };

  return (
    <div className="relative w-full h-full overflow-hidden flex flex-col items-center justify-center min-h-0" data-testid="linear-map-v2">
      {hasSequence && reEnzKey == null && (
        <div className="absolute top-2 right-2 flex items-center gap-1 z-10 rounded-lg px-2 py-1"
          style={{ background: 'var(--surface-1, #fff)', border: '0.5px solid var(--border-subtle, #e7e5e4)' }}>
          <button data-testid="linear-v2-re-toggle" onClick={() => setShowReSites(!showReSites)}
            className="text-[10px] px-2 py-1 rounded border"
            style={showReSites
              ? { background: 'var(--accent-50, #fffbeb)', color: 'var(--accent-700, #b45309)', borderColor: 'var(--accent-500, #f59e0b)' }
              : { color: 'var(--text-secondary)', borderColor: 'var(--border-subtle, #e7e5e4)' }}>RE sites</button>
          {showReSites && (
            <div className="flex gap-1 ml-1">
              {['unique', 'double', 'all'].map((f) => (
                <button key={f} onClick={() => setReFilter(f)} className="text-[9px] px-1.5 py-0.5 rounded"
                  style={reFilter === f ? { background: 'var(--surface-3, #e7e5e4)', fontWeight: 500 } : { color: 'var(--text-tertiary)' }}>
                  {f === 'unique' ? '1x' : f === 'double' ? '≤2x' : 'All'}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" style={{ width: '100%', height: '100%' }}
        role="img" aria-label={`Linear map of ${centerName}, ${total} bp`}>
        {/* backbone axis */}
        <line x1={X0} y1={axisY} x2={X1} y2={axisY} stroke="var(--viz-backbone, #e5e7eb)" strokeWidth={2.5} strokeLinecap="round" />
        {/* End caps only for a genuinely LINEAR molecule (free ends). A circular
            source shown linearly («развёрнуто») gets ↺ hints instead — its ends join. */}
        {topology === 'linear' ? (
          <>
            <line x1={X0} y1={axisY - 7} x2={X0} y2={axisY + 7} stroke="var(--viz-backbone, #e5e7eb)" strokeWidth={2.5} />
            <line x1={X1} y1={axisY - 7} x2={X1} y2={axisY + 7} stroke="var(--viz-backbone, #e5e7eb)" strokeWidth={2.5} />
          </>
        ) : (
          <>
            <text x={X0 - 5} y={axisY + 3} textAnchor="end" fontSize={12} fill="var(--text-tertiary)">↺</text>
            <text x={X1 + 5} y={axisY + 3} textAnchor="start" fontSize={12} fill="var(--text-tertiary)">↺</text>
          </>
        )}

        {/* ruler majors below the axis */}
        {majors.map((bp, k) => {
          const x = bpToX(bp, total, X0, X1);
          return (
            <g key={`mj${k}`} style={{ pointerEvents: 'none' }}>
              <line x1={x} y1={axisY} x2={x} y2={axisY + 6} stroke="var(--viz-junction, #94a3b8)" strokeWidth={1} />
              <text x={x} y={axisY + 18} textAnchor="middle" fontSize={9.5} fill="var(--text-tertiary)" style={{ fontFamily: 'var(--font-mono, monospace)' }}>{bp}</text>
            </g>
          );
        })}

        {/* features */}
        {features.map((f) => {
          // ANN-0A — one <g> per LOGICAL feature, one path per real part. A
          // compound or origin-crossing feature therefore draws two bars (and
          // for a wrap they sit at opposite ends) under one id and one click
          // contract, instead of a single bar spanning the gap.
          const partsPx = featPartsPx[f.i] || [];
          const y = featTop + featLanes[f.i] * FEAT_LANE_H; const h = FEAT_LANE_H - 7;
          const sel = f.id != null && f.id === selectedRegionId;
          // Only the widest part carries the label — one name per feature.
          let widest = 0;
          partsPx.forEach((p, k) => {
            if (p.end - p.start > partsPx[widest].end - partsPx[widest].start) widest = k;
          });
          const lastIdx = f.strand === -1 ? 0 : partsPx.length - 1;
          return (
            <g key={f.i} data-testid={`linear-map-v2-feature-${f.i}`}
              data-region-id={f.id || ''}
              data-part-count={partsPx.length}
              data-fragment={f.isFragment ? 'true' : undefined}
              style={{ cursor: 'pointer' }} onClick={() => clickFeature(f)}>
              {partsPx.map((p, k) => {
                const x0 = p.start; const x1 = Math.max(p.end, x0 + 3);
                const wide = x1 - x0 > 34;
                return (
                  <g key={k} data-region-id={f.id || ''} data-part-index={k}>
                    <path
                      d={k === lastIdx
                        ? arrowPath(x0, x1, y, h, f.strand)
                        : arrowPath(x0, x1, y, h, 0)}
                      fill={f.isFragment ? 'var(--surface-1, #ffffff)' : f.fill}
                      stroke={sel ? FEATURE_STROKE : (f.isFragment ? f.fill : '#ffffff')}
                      strokeWidth={sel ? 1.4 : (f.isFragment ? 1.1 : 0.6)} />
                    {wide && k === widest && (
                      <text x={(x0 + x1) / 2} y={y + h / 2} dominantBaseline="central" textAnchor="middle" fontSize={11}
                        fontWeight={sel ? 600 : 500} fill="var(--text-primary)" style={{ fontFamily: 'var(--font-ui, inherit)', pointerEvents: 'none' }}>
                        {trunc(f.name, Math.floor((x1 - x0) / 7))}
                      </text>
                    )}
                  </g>
                );
              })}
              <title>{`${f.name} · ${formatUiRange(f)} (${locationLength(f)} bp)`}</title>
            </g>
          );
        })}

        <PrimerSiteOverlay
          primers={primers}
          context={renderContext}
          onSelectSite={onSelectPrimerSite}
          toX={(bp) => bpToX(bp, total, X0, X1)}
          y={featTop + nFeatLanes * FEAT_LANE_H + 2}
          height={5}
        />

        {/* sub-features (detail) — inset bars nested in the parent region's lane */}
        {details.map((d, k) => {
          const x0 = bpToX(d.start, total, X0, X1);
          const x1 = Math.max(bpToX(d.end, total, X0, X1), x0 + 2);
          const lane = regionLaneById.has(d.regionId) ? regionLaneById.get(d.regionId) : 0;
          const bandY = featTop + lane * FEAT_LANE_H; const bh = FEAT_LANE_H - 7;
          const dh = Math.max(4, bh * 0.5); const y = bandY + (bh - dh) / 2;
          const sel = d.id != null && d.id === selectedRegionId;
          return (
            <g key={`d${k}`} data-testid={`linear-map-v2-detail-${k}`} data-fragment={d.isFragment ? 'true' : undefined} style={{ cursor: 'pointer' }} onClick={() => clickAnn(d)}>
              <rect x={x0} y={y} width={x1 - x0} height={dh} rx={1.5}
                fill={d.isFragment ? 'var(--surface-1, #ffffff)' : d.fill}
                stroke={sel ? FEATURE_STROKE : (d.isFragment ? d.fill : 'var(--surface-1, #fff)')}
                strokeWidth={sel ? 1.2 : (d.isFragment ? 1 : 0.5)} opacity={0.92} />
              <title>{`${d.name || d.type} (саб-фича) · ${formatUiRange(d)} (${locationLength(d)} bp)`}</title>
            </g>
          );
        })}

        {/* points (mutation / start-stop / RE mark) — small triangle markers */}
        {points.map((p, k) => {
          const x = bpToX(p.start, total, X0, X1);
          const lane = regionLaneById.has(p.regionId) ? regionLaneById.get(p.regionId) : 0;
          const y = featTop + lane * FEAT_LANE_H - 1;
          const sel = p.id != null && p.id === selectedRegionId;
          return (
            <g key={`pt${k}`} data-testid={`linear-map-v2-point-${k}`} style={{ cursor: 'pointer' }} onClick={() => clickAnn(p)}>
              <path d={`M${x - 3},${y - 6} L${x + 3},${y - 6} L${x},${y} Z`}
                fill={p.fill} stroke={sel ? FEATURE_STROKE : 'var(--surface-1, #fff)'} strokeWidth={sel ? 1 : 0.5} />
              <title>{`${p.name || p.type} · ${formatUiRange(p)}`}</title>
            </g>
          );
        })}

        {/* RE cut ticks (cross the feature band + axis) */}
        {reSites.map((re, k) => {
          const x = bpToX(re.pos, total, X0, X1);
          const siteKey = re.occurrence?.occurrenceKey || `${re.enzyme}:${re.pos}:${k}`;
          return (
            <line key={siteKey} data-testid="linear-map-v2-re-site" x1={x} y1={featTop - 4} x2={x} y2={axisY + 5}
              stroke="var(--viz-re-unique, #E24B4A)" strokeWidth={1.1} strokeLinecap="round" opacity={0.9} pointerEvents="none" />
          );
        })}

        {/* RE labels (clickable when onReSiteClick) — de-collided in lanes above */}
        {reMarkers.map((m, k) => {
          const ext = reLabelExtents[k]; const lane = reLabelLanes[k];
          const labelY = 10 + (nReLanes - 1 - lane) * RE_LABEL_H;
          const tickX = bpToX(m.positions[0], total, X0, X1);
          const clickable = !!onReSiteClick && m.count === 1;
          const w = ext.text.length * 6.1 + 8;
          return (
            <g key={m.markerKey} data-testid={`linear-map-v2-re-label-${k}`} data-cluster={m.count > 1} data-clickable={clickable}
              style={{ pointerEvents: clickable ? 'auto' : 'none', cursor: clickable ? 'pointer' : 'default' }}
              onClick={clickable ? (e) => { e.stopPropagation(); onReSiteClick(m); } : undefined}>
              <line x1={tickX} y1={labelY + 7} x2={tickX} y2={featTop - 4} stroke="var(--viz-re-unique, #E24B4A)" strokeWidth={0.6} opacity={0.55} />
              {clickable && <rect x={ext.xc - w / 2} y={labelY - 8} width={w} height={16} fill="transparent" />}
              {m.count > 1 && <rect x={ext.xc - w / 2} y={labelY - 8} width={w} height={16} rx={8} fill="var(--viz-re-unique, #E24B4A)" opacity={0.12} />}
              <text x={ext.xc} y={labelY} dominantBaseline="central" textAnchor="middle" fontSize={11} fontWeight={500}
                fill="var(--viz-re-unique, #E24B4A)" style={{ fontFamily: 'var(--font-mono, monospace)' }}>{ext.text}</text>
              <title>{m.count > 1 ? `${m.enzyme} · ${m.count} sites: ${m.positions.map((p) => p + 1).join(', ')}` : `${m.enzyme} · ${m.positions[0] + 1}`}</title>
            </g>
          );
        })}

        {/* center caption */}
        <text x={W / 2} y={H - 4} textAnchor="middle" fontSize={11} fill="var(--text-tertiary)" style={{ fontFamily: 'var(--font-mono, monospace)' }}>
          {trunc(centerName, 28)}{centerName ? ' · ' : ''}{total.toLocaleString()} bp · {topology === 'circular' ? 'кольцевой (развёрнуто)' : 'линейный'}
        </text>
      </svg>
    </div>
  );
}
