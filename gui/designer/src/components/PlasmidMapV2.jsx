/**
 * PlasmidMapV2 — redesigned circular plasmid map (Claude Designer «BodgeGene
 * Design System (1)», принят Игорем 20.06.2026). Feature-centric: strand-pointed
 * ARROWS + внешние подписи с лидер-линиями (две колонки, мелкие фичи читаемы) +
 * радиальные RE-подписи (не лезут на дуги/лидеры) + hover-тултип + линейка +
 * GC-кольцо. Геометрия — чистый lib/plasmid-map-v2 (юнит-тест).
 *
 * Два входа:
 *   • `fragments` (сборочный/вьюер-shape) → featuresFromFragments + RE из sequence;
 *   • `annotations` + `length` (минимапа: OverviewTab) → getRegions напрямую, без RE.
 * `rotationDeg` («ноль сверху, вращается плазмида» — OverviewTab): контент крутится,
 * верхняя засечка-ноль + центр зафиксированы. Гейт — FEATURE_FLAGS.plasmidMapV2.
 */
import { useState, useMemo } from 'react';
import { getRegions, getAllDetails, getPoints } from '../annotation-model';
import { scanAllSites } from '../restriction-db';
import { filterReSites } from '../lib/re-site-filter';
import { featureColorShaded, FEATURE_STROKE } from '../feature-palette';
import { isFragmentFeature } from '../lib/feature-fragment';
import { useStore, selectActiveSetEnzymes } from '../store';
import {
  TAU, polar, featureArrow, smallMarker, layoutLabels, rulerStep, buildReMarkers,
  featuresFromFragments, wrapLabel, arcBand, arcStrokePath, collectIntronsByParent,
} from '../lib/plasmid-map-v2';
import { exonSegments } from './SequenceView/tracks/gene-exon-spans';

const SZ = 600;
const cx = SZ / 2; const cy = SZ / 2;
const R = 152; // backbone
const fOut = 166; const fIn = 138; const fMid = (fOut + fIn) / 2;
// Columns pulled in to 176 (was 222): the SVG viewBox clips at 600, so font-13
// 12-char labels at the old column would be cut off (worst case ~8.5px/char for
// all-caps names → right edge 594 < 600, left edge 6 > 0). ANCHOR_R sits just
// outside the feature ring so leaders start on the arc.
const COL_X = 176; const ANCHOR_R = fOut + 3;
const LABEL_FONT = 13; const LABEL_LINE_H = 15; const LABEL_MAX_CHARS = 12;

function trunc(s, n = 14) { return (s || '').length > n ? `${s.slice(0, n - 1)}…` : (s || ''); }

export default function PlasmidMapV2({
  fragments, annotations, length, constructName, totalBp, topology = 'circular',
  rotationDeg = 0, centerLabel, onFeatureClick,
  selectedRegionId = null, onSelectRegion, onSelectFragment,
  // Digest «gel» mode (opt-in): restrict RE markers to the digest enzyme(s) so
  // the map isn't buried under all 60 enzymes, and draw the resulting fragments
  // as selectable arc «bands» (Игорь 21.06: «сайты накладываются + не вижу трёх
  // фрагментов»). All default to off → existing callers unchanged.
  reEnzymesFilter = null, bands = null, selectedBandIndex = null, onSelectBand,
  // Clickable RE sites (Игорь 22.06): a click on a cut label emits the marker
  // { enzyme, positions, count }. Off → labels stay display-only (pointer-events none).
  onReSiteClick = null,
}) {
  const [hovered, setHovered] = useState(null);
  const showReSites = useStore((s) => s.showReSites);
  const reFilter = useStore((s) => s.reFilter);
  const reMinSiteLen = useStore((s) => s.reMinSiteLen);
  const setShowReSites = useStore((s) => s.setShowReSites);
  // RS-C4 — «active set» enzyme allow-list (null = none). Ignored when a digest
  // enzyme-list (reEnzymesFilter) is in force.
  const activeSetEnzymes = useStore(selectActiveSetEnzymes);
  const setReFilter = useStore((s) => s.setReFilter);

  const total = totalBp || length || 0;
  const hasSequence = (fragments || []).some((f) => f && f.sequence);
  const centerName = (centerLabel && centerLabel.name) || constructName || '';

  const arcs = useMemo(() => {
    const intronsByParent = annotations ? collectIntronsByParent(annotations) : null;
    const feats = annotations
      ? getRegions(annotations).map((r) => ({
        id: r.id, name: r.name || r.type || '—', type: r.type || 'misc',
        start: r.start, end: r.end, strand: Number.isFinite(r.strand) ? r.strand : 1,
        introns: (intronsByParent.get(r.id) || []),
        // UX-4 — compute fragment-ness from the FULL region (flags/coverage/name)
        // before the lossy reshape above drops fragment/partial/coverage.
        isFragment: isFragmentFeature(r),
      }))
      : featuresFromFragments(fragments, getRegions).map((f) => ({ ...f, isFragment: isFragmentFeature(f) }));
    return feats.filter((f) => Number.isFinite(f.start) && Number.isFinite(f.end)).map((f, i) => {
      const sA = (f.start / total) * TAU; const eA = (f.end / total) * TAU;
      // Spliced gene → split into exon spans so introns show as visible gaps.
      const introns = Array.isArray(f.introns) ? f.introns : [];
      const exons = introns.length ? exonSegments(f.start, f.end, introns) : null;
      return {
        ...f, i, introns, exons, startAngle: sA, endAngle: eA, midAngle: (sA + eA) / 2,
        fill: featureColorShaded(f.type, f.name) || 'var(--feature-misc, #EEE7D5)',
      };
    });
  }, [fragments, annotations, total]);

  // UX-1 / V-FEAT-3 (circular) — introns already render as exon-split gaps in
  // the arc above. This adds the still-missing layers on the `annotations` path:
  // non-intron sub-features (domains/tags) as thin nested arcs at the inner edge
  // of the gene ring, and points (mutations/RE/start-stop) as small diamonds.
  const subFeatures = useMemo(() => (annotations
    ? getAllDetails(annotations)
      // Skip introns that are exon-split into gene gaps above (V182: grouped by
      // `regionId` — the model standard — OR legacy `parentId`). Drawing them again
      // as a detail arc would double-paint. A truly orphan intron (no gene link)
      // still surfaces here so it isn't invisible.
      .filter((d) => Number.isFinite(d.start) && Number.isFinite(d.end)
        && !((d.type || '').toLowerCase() === 'intron' && (d.regionId != null || d.parentId != null)))
      .map((d, k) => ({ ...d, k, fill: featureColorShaded(d.type, d.name) || 'var(--feature-misc, #EEE7D5)', isFragment: isFragmentFeature(d) }))
    : []), [annotations]);
  const pointMarks = useMemo(() => (annotations
    ? getPoints(annotations)
      .filter((p) => Number.isFinite(p.start))
      .map((p, k) => ({ ...p, k, fill: featureColorShaded(p.type, p.name) || 'var(--viz-junction, #94a3b8)' }))
    : []), [annotations]);

  // «При вращении динамически перестраивать подписи» (Игорь): the label layout
  // (column side + vertical stacking) is computed from the ROTATED angles, and
  // the labels render in screen space (outside the rotating <g>), so they hold
  // stable left/right columns while their leader lines follow the spun feature.
  const rotRad = (rotationDeg * Math.PI) / 180;
  const rotatedArcs = useMemo(
    () => arcs.map((a) => {
      const lines = wrapLabel(a.name, LABEL_MAX_CHARS, 2);
      return { ...a, midAngle: a.midAngle + rotRad, lines, lineCount: lines.length };
    }),
    [arcs, rotRad],
  );

  // Digest mode: a stable key so the memo doesn't churn on the prop array identity.
  const reEnzKey = Array.isArray(reEnzymesFilter) && reEnzymesFilter.length
    ? [...reEnzymesFilter].sort().join('|') : null;
  const reSites = useMemo(() => {
    // In digest mode the markers are the cut context — always show them, ignore
    // the global toggle/filter and keep ONLY the digest enzyme(s).
    const effShow = reEnzKey != null ? true : showReSites;
    if (!effShow || !total || !hasSequence) return [];
    const fullSeq = (fragments || []).map((f) => f.sequence || '').join('');
    if (!fullSeq) return [];
    const all = scanAllSites(fullSeq, { circular: true, minSiteLen: reMinSiteLen });
    // RS-B1 — shared filter (the SAME helper the linear SequenceView uses). A
    // digest enzyme-list (reEnzymesFilter) overrides the global cut-count filter;
    // otherwise apply the global `reFilter` mode.
    const filtered = reEnzKey != null
      ? filterReSites(all, { enzymes: reEnzKey.split('|') })
      : filterReSites(all, { mode: reFilter, enzymes: activeSetEnzymes });
    // scanAllSites returns `positions` as an array of site OBJECTS ({position,…}),
    // not bare numbers (see restriction-db detectMCS). Read `.position` — mapping
    // the object straight to `re.pos` made `pos/total` NaN → markers off-canvas
    // («на карте не видны сайты», Игорь 21.06). Finite-guard so it can't resurface.
    return filtered.flatMap((s) => (s.positions || [])
      .map((p) => ({ enzyme: s.enzyme, pos: typeof p === 'number' ? p : (p && p.position) }))
      .filter((re) => Number.isFinite(re.pos)));
  }, [fragments, showReSites, reFilter, reMinSiteLen, total, hasSequence, reEnzKey, activeSetEnzymes]);

  // RE markers (cluster-collapsed) → external de-collided labels in the SAME two
  // side columns as features, so an RE label can never overlap a feature label
  // (one combined layout). Ноль RE → byte-identical to the feature-only layout.
  const reMarkers = useMemo(() => buildReMarkers(reSites, total, {}), [reSites, total]);
  const reLabelItems = useMemo(
    () => reMarkers.map((m, k) => {
      const text = m.count > 1 ? `${m.enzyme} ×${m.count}` : `${m.enzyme} · ${m.positions[0] + 1}`;
      return {
        isRe: true, reKey: k, marker: m, midAngle: m.angle + rotRad,
        name: text, lines: [text], lineCount: 1,
      };
    }),
    [reMarkers, rotRad],
  );
  const labels = useMemo(
    () => layoutLabels([...rotatedArcs, ...reLabelItems], cx, cy, ANCHOR_R, COL_X, 24, SZ - 24, 8, LABEL_LINE_H),
    [rotatedArcs, reLabelItems],
  );

  if (!arcs.length && !total) return null;

  const step = rulerStep(total); const minor = step / 5;
  const majors = []; const minors = [];
  for (let bp = 0; bp < total; bp += minor) {
    const a = (bp / total) * TAU;
    if (Math.abs(bp % step) < 1e-6) majors.push({ bp, a }); else minors.push({ a });
  }

  const gcPath = (() => {
    const r0 = 104; const amp = 6; const N = 200; const seed = (total % 97) * 0.13; let d = '';
    for (let k = 0; k <= N; k++) {
      const a = (k / N) * TAU;
      const v = Math.sin(a * 6 + seed) * 0.55 + Math.sin(a * 13 + seed * 1.7) * 0.32 + Math.sin(a * 3 + seed * 0.5) * 0.13;
      const p = polar(cx, cy, r0 + v * amp, a);
      d += `${k === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)} `;
    }
    return `${d}Z`;
  })();

  const clickFeature = (f) => {
    if (onSelectRegion && f.id != null) onSelectRegion(f.id === selectedRegionId ? null : f.id);
    onSelectFragment?.(f.i);
    onFeatureClick?.(f);
  };
  const isSel = (f) => f.id != null && f.id === selectedRegionId;
  // Sub-feature / point click — select by id (no fragment index).
  const clickAnn = (a) => {
    if (onSelectRegion && a.id != null) onSelectRegion(a.id === selectedRegionId ? null : a.id);
    onFeatureClick?.(a);
  };
  const rotXf = rotationDeg ? `rotate(${rotationDeg} ${cx} ${cy})` : undefined;

  return (
    <div className="relative w-full h-full overflow-hidden flex flex-col items-center min-h-0" data-testid="plasmid-map-v2">
      {/* Toolbar — RE toggle + filter (only when we have a sequence to scan and
          are NOT in fixed digest mode, where the enzyme set is pinned). */}
      {hasSequence && reEnzKey == null && (
        <div className="absolute top-2 right-2 flex items-center gap-1 z-10 rounded-lg px-2 py-1"
          style={{ background: 'var(--surface-1, #fff)', border: '0.5px solid var(--border-subtle, #e7e5e4)' }}>
          <button
            data-testid="plasmid-v2-re-toggle"
            onClick={() => setShowReSites(!showReSites)}
            className="text-[10px] px-2 py-1 rounded border"
            style={showReSites
              ? { background: 'var(--accent-50, #fffbeb)', color: 'var(--accent-700, #b45309)', borderColor: 'var(--accent-500, #f59e0b)' }
              : { color: 'var(--text-secondary)', borderColor: 'var(--border-subtle, #e7e5e4)' }}
          >RE sites</button>
          {showReSites && (
            <div className="flex gap-1 ml-1">
              {['unique', 'double', 'all'].map((f) => (
                <button key={f} onClick={() => setReFilter(f)}
                  className="text-[9px] px-1.5 py-0.5 rounded"
                  style={reFilter === f ? { background: 'var(--surface-3, #e7e5e4)', fontWeight: 500 } : { color: 'var(--text-tertiary)' }}>
                  {f === 'unique' ? '1x' : f === 'double' ? '≤2x' : 'All'}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <svg viewBox={`0 0 ${SZ} ${SZ}`} preserveAspectRatio="xMidYMid meet" style={{ width: '100%', height: '100%' }}
        role="img" aria-label={`Circular plasmid map of ${centerName}, ${total} bp`}>
        {/* backbone (rotation-invariant) */}
        <circle cx={cx} cy={cy} r={R} fill="none" stroke="var(--viz-backbone, #e5e7eb)" strokeWidth={2.5} />

        {/* rotating content: ruler + GC + RE + features (labels + zero notch are
            rendered AFTER this group, in screen space, so they don't spin) */}
        <g transform={rotXf}>
          {minors.map((t, k) => {
            const p1 = polar(cx, cy, R + 10, t.a); const p2 = polar(cx, cy, R + 15, t.a);
            return <line key={`mi${k}`} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="var(--viz-junction, #94a3b8)" strokeWidth={0.75} opacity={0.55} />;
          })}
          {majors.map((t, k) => {
            const p1 = polar(cx, cy, R + 10, t.a); const p2 = polar(cx, cy, R + 18, t.a); const np = polar(cx, cy, R + 28, t.a);
            return (
              <g key={`ma${k}`}>
                <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="var(--viz-junction, #94a3b8)" strokeWidth={1.1} />
                <text x={np.x} y={np.y} textAnchor="middle" dominantBaseline="central" fontSize={9.5} fill="var(--text-tertiary)" transform={rotationDeg ? `rotate(${-rotationDeg} ${np.x} ${np.y})` : undefined} style={{ fontFamily: 'var(--font-mono, monospace)' }}>{t.bp}</text>
              </g>
            );
          })}

          <g style={{ pointerEvents: 'none' }}>
            <circle cx={cx} cy={cy} r={104} fill="none" stroke="var(--viz-junction, #94a3b8)" strokeWidth={0.5} strokeDasharray="2 3" opacity={0.22} />
            <path d={gcPath} fill="none" stroke="var(--accent-500, #f59e0b)" strokeWidth={0.9} opacity={0.25} />
          </g>

          {/* Digest «bands»: each fragment between cuts drawn as a selectable arc on
              an inner ring (the cut marks below sit at the boundaries). The selected
              band is opaque + slightly wider; click picks it (synced with the list). */}
          {Array.isArray(bands) && total > 0 && bands.map((b) => {
            const isBandSel = b.index === selectedBandIndex;
            const oR = isBandSel ? 132 : 130; const iR = isBandSel ? 116 : 119;
            const ang = (bp) => (bp / total) * TAU;
            const segs = (b.wraps || b.end <= b.start)
              ? [...(b.start < total ? [[ang(b.start), TAU]] : []), ...(b.end > 0 ? [[0, ang(b.end)]] : [])]
              : [[ang(b.start), ang(b.end)]];
            return (
              <g key={`band${b.index}`} data-testid={`plasmid-v2-band-${b.index}`}
                style={{ cursor: 'pointer' }} onClick={() => onSelectBand && onSelectBand(b.index)}>
                {segs.map(([s0, e0], k) => (
                  <path key={k} d={arcBand(cx, cy, s0 + 0.004, Math.max(s0 + 0.006, e0 - 0.004), oR, iR)}
                    fill={b.color || 'var(--feature-misc, #EEE7D5)'} opacity={isBandSel ? 1 : 0.45}
                    stroke="#ffffff" strokeWidth={isBandSel ? 1.2 : 0.6} />
                ))}
              </g>
            );
          })}

          {/* RE cut marks: a short red tick crossing the ring at each cut. The
              NAME is no longer drawn radially here (it overlapped when cuts
              clustered) — it now lives in the de-collided external label below. */}
          {reSites.map((re, k) => {
            const a = (re.pos / total) * TAU;
            const o = polar(cx, cy, fIn - 4, a); const inn = polar(cx, cy, fOut + 4, a);
            return (
              <line key={`re${k}`} data-testid="plasmid-v2-re-site" x1={o.x} y1={o.y} x2={inn.x} y2={inn.y}
                stroke="var(--viz-re-unique, #E24B4A)" strokeWidth={1.1} strokeLinecap="round" opacity={0.9} pointerEvents="none" />
            );
          })}

          {arcs.map((a) => {
            const sel = isSel(a); const h = hovered === a.i;
            const oR = sel || h ? fOut + 4 : fOut; const iR = sel || h ? fIn - 2 : fIn;
            const spliced = a.exons && a.exons.length > 1;
            const title = `${a.name} · ${a.start + 1}–${a.end} (${a.end - a.start} bp)${spliced ? ` · ${a.exons.length} exons` : ''}`;
            const evt = {
              onMouseEnter: () => setHovered(a.i), onMouseLeave: () => setHovered(null), onClick: () => clickFeature(a),
            };

            // Spliced gene → exon BLOCKS with the introns left as visible gaps,
            // bridged by a thin dashed connector so the blocks still read as one
            // gene (same «вариант A» as the linear track). The strand arrowhead
            // sits on the terminal exon.
            if (spliced) {
              const ang = (bp) => (bp / total) * TAU;
              const termIdx = a.strand < 0 ? 0 : a.exons.length - 1;
              return (
                <g key={a.i} data-testid={`plasmid-v2-feature-${a.i}`} data-spliced="true"
                  style={{ cursor: 'pointer' }} {...evt}>
                  {a.introns.map(([is, ie], k) => (
                    <path key={`cn${k}`} d={arcStrokePath(cx, cy, ang(is), ang(ie), fMid)}
                      fill="none" stroke="var(--text-tertiary, #9ca3af)" strokeWidth={1} strokeDasharray="3 2"
                      opacity={0.85} pointerEvents="none" data-testid={`plasmid-v2-intron-${a.i}-${k}`} />
                  ))}
                  {a.exons.map(([s, e], k) => {
                    const a0 = ang(s) + 0.004; const a1 = ang(e) - 0.004;
                    const d = k === termIdx
                      ? featureArrow(cx, cy, a0, a1, a.strand, oR, iR)
                      : arcBand(cx, cy, a0, a1, oR, iR);
                    return (
                      <path key={`ex${k}`} d={d}
                        fill={a.isFragment ? 'var(--surface-1, #ffffff)' : a.fill}
                        stroke={sel ? FEATURE_STROKE : (a.isFragment ? a.fill : '#ffffff')}
                        strokeWidth={sel ? 1.4 : (a.isFragment ? 1.1 : 0.6)}
                        opacity={h && !sel ? 0.88 : 1} data-testid="plasmid-v2-exon"
                        data-fragment={a.isFragment ? 'true' : undefined} />
                    );
                  })}
                  <title>{title}</title>
                </g>
              );
            }

            const span = a.endAngle - a.startAngle; const arcLen = span * fMid;
            const d = arcLen < 14 ? smallMarker(cx, cy, a.midAngle, a.strand, oR, iR) : featureArrow(cx, cy, a.startAngle + 0.004, a.endAngle - 0.004, a.strand, oR, iR);
            return (
              <path key={a.i} d={d}
                fill={a.isFragment ? 'var(--surface-1, #ffffff)' : a.fill}
                stroke={sel ? FEATURE_STROKE : (a.isFragment ? a.fill : '#ffffff')}
                strokeWidth={sel ? 1.4 : (a.isFragment ? 1.1 : 0.6)}
                opacity={h && !sel ? 0.88 : 1} style={{ cursor: 'pointer', transition: 'opacity 100ms' }}
                data-testid={`plasmid-v2-feature-${a.i}`} data-fragment={a.isFragment ? 'true' : undefined} {...evt}>
                <title>{title}</title>
              </path>
            );
          })}

          {/* sub-features (detail, non-intron) — thin nested arc at the inner edge
              of the gene ring so domains/tags read as «inside» the feature. */}
          {subFeatures.map((d) => {
            const s0 = (d.start / total) * TAU + 0.004;
            const e0 = Math.max(s0 + 0.006, (d.end / total) * TAU - 0.004);
            const sel = isSel(d);
            return (
              <path key={`sf${d.k}`} data-testid={`plasmid-v2-detail-${d.k}`}
                data-fragment={d.isFragment ? 'true' : undefined}
                d={arcBand(cx, cy, s0, e0, fIn + 6, fIn + 1)}
                fill={d.isFragment ? 'var(--surface-1, #ffffff)' : d.fill}
                stroke={sel ? FEATURE_STROKE : (d.isFragment ? d.fill : '#ffffff')}
                strokeWidth={sel ? 1.2 : (d.isFragment ? 1 : 0.5)} opacity={0.92}
                style={{ cursor: 'pointer' }} onClick={() => clickAnn(d)}>
                <title>{`${d.name || d.type} (саб-фича) · ${d.start + 1}–${d.end} (${d.end - d.start} bp)`}</title>
              </path>
            );
          })}

          {/* points (mutation / RE / start-stop) — small diamond on the feature ring */}
          {pointMarks.map((p) => {
            const a = (p.start / total) * TAU; const pt = polar(cx, cy, fMid, a);
            const sel = isSel(p); const r = 3.2;
            return (
              <g key={`pm${p.k}`} data-testid={`plasmid-v2-point-${p.k}`} style={{ cursor: 'pointer' }} onClick={() => clickAnn(p)}>
                <path d={`M${pt.x},${pt.y - r} L${pt.x + r},${pt.y} L${pt.x},${pt.y + r} L${pt.x - r},${pt.y} Z`}
                  fill={p.fill} stroke={sel ? FEATURE_STROKE : '#ffffff'} strokeWidth={sel ? 1 : 0.5} />
                <title>{`${p.name || p.type} · ${p.start + 1}`}</title>
              </g>
            );
          })}

        </g>

        {/* Feature labels — SCREEN SPACE (outside the rotating group). Layout is
            computed from rotated angles, so columns/stacking rebuild live as the
            plasmid spins; the leader anchor sits on the rotated feature. Names
            wrap to up to 2 lines (font 13) instead of single-line ellipsis. */}
        {labels.map((l) => {
          // RE markers: red mono label with a leader from the cut tick (outside the
          // ring), de-collided in the same columns as features. Clusters («×k») get
          // a subtle pill; the tooltip lists every cut position.
          if (l.isRe) {
            const m = l.marker;
            const start = polar(cx, cy, fOut + 4, l.a);
            const reElbow = { x: l.labelX - l.side * 12, y: l.labelY };
            const textX = l.labelX + l.side * 4;
            const label = m.count > 1 ? `${m.enzyme} ×${m.count}` : `${m.enzyme} · ${m.positions[0] + 1}`;
            const title = m.count > 1
              ? `${m.enzyme} · ${m.count} sites: ${m.positions.map((p) => p + 1).join(', ')}`
              : `${m.enzyme} · ${m.positions[0] + 1}`;
            const w = label.length * 6.3 + 10;
            const pillX = l.side === 1 ? textX - 4 : textX - w + 4;
            const reClickable = !!onReSiteClick;
            return (
              <g key={`rl${l.reKey}`} data-testid={`plasmid-v2-re-label-${l.reKey}`} data-cluster={m.count > 1}
                style={{ pointerEvents: reClickable ? 'auto' : 'none', cursor: reClickable ? 'pointer' : 'default' }}
                onClick={reClickable ? (e) => { e.stopPropagation(); onReSiteClick(m); } : undefined}>
                {/* Wider invisible hit-area so the thin text/leader is easy to click. */}
                {reClickable && (
                  <rect x={l.side === 1 ? textX - 4 : textX - w} y={l.labelY - 9} width={w + 8} height={18}
                    fill="transparent" />
                )}
                <polyline points={`${start.x},${start.y} ${reElbow.x},${reElbow.y} ${l.labelX},${l.labelY}`}
                  fill="none" stroke="var(--viz-re-unique, #E24B4A)" strokeWidth={0.7} opacity={0.65} />
                {m.count > 1 && (
                  <rect x={pillX} y={l.labelY - 8} width={w} height={16} rx={8}
                    fill="var(--viz-re-unique, #E24B4A)" opacity={0.12} />
                )}
                <text x={textX} y={l.labelY} dominantBaseline="central" textAnchor={l.side === 1 ? 'start' : 'end'}
                  fontSize={11} fontWeight={500} fill="var(--viz-re-unique, #E24B4A)" style={{ fontFamily: 'var(--font-mono, monospace)' }}>
                  {label}
                </text>
                <title>{title}</title>
              </g>
            );
          }
          const sel = isSel(l); const h = hovered === l.i;
          const elbow = { x: l.labelX - l.side * 12, y: l.labelY };
          const chipX = l.labelX + l.side * 4; const textX = chipX + l.side * 12;
          const lines = l.lines && l.lines.length ? l.lines : [l.name];
          const n = lines.length;
          return (
            <g key={`lb${l.i}`} style={{ cursor: 'pointer' }} data-testid={`plasmid-v2-label-${l.i}`}
              onMouseEnter={() => setHovered(l.i)} onMouseLeave={() => setHovered(null)} onClick={() => clickFeature(l)}>
              <polyline points={`${l.anchor.x},${l.anchor.y} ${elbow.x},${elbow.y} ${l.labelX},${l.labelY}`}
                fill="none" stroke={sel || h ? 'var(--accent-500, #f59e0b)' : 'var(--viz-junction, #94a3b8)'}
                strokeWidth={sel || h ? 1.1 : 0.7} opacity={sel || h ? 1 : 0.7} />
              <rect x={chipX - (l.side === 1 ? 0 : 8)} y={l.labelY - 4} width={8} height={8} rx={1.5} fill={l.fill} stroke={FEATURE_STROKE} strokeWidth={0.5} />
              <text x={textX} y={l.labelY} dominantBaseline="central" textAnchor={l.side === 1 ? 'start' : 'end'}
                fontSize={LABEL_FONT} fontWeight={sel ? 600 : 500}
                fill={sel || h ? 'var(--text-primary)' : 'var(--text-secondary)'} style={{ fontFamily: 'var(--font-ui, inherit)' }}>
                {lines.map((ln, k) => (
                  <tspan key={k} x={textX} dy={k === 0 ? -((n - 1) / 2) * LABEL_LINE_H : LABEL_LINE_H}>{ln}</tspan>
                ))}
              </text>
            </g>
          );
        })}

        {/* Fixed top «zero» notch — rotation-invariant, drawn ON TOP and pushed
            OUTSIDE the feature ring (was hidden behind a 12-o'clock feature):
            white halo for contrast, accent wedge pointing at the origin. */}
        {(() => {
          const tip = polar(cx, cy, fOut + 2, 0);
          const b1 = polar(cx, cy, fOut + 11, 0.05); const b2 = polar(cx, cy, fOut + 11, -0.05);
          const pts = `${tip.x},${tip.y} ${b1.x},${b1.y} ${b2.x},${b2.y}`;
          return (
            <g data-testid="plasmid-v2-origin">
              <polygon points={pts} fill="none" stroke="var(--surface-1, #ffffff)" strokeWidth={3.4} strokeLinejoin="round" />
              <polygon points={pts} fill="var(--accent-600, #d97706)" stroke="var(--surface-1, #ffffff)" strokeWidth={0.8} strokeLinejoin="round" />
            </g>
          );
        })()}

        {/* center label (fixed) */}
        <text x={cx} y={cy - 5} textAnchor="middle" fontSize={15} fontWeight={600} fill="var(--text-primary)" style={{ fontFamily: 'var(--font-ui, inherit)' }}>{trunc(centerName, 22)}</text>
        <text x={cx} y={cy + 15} textAnchor="middle" fontSize={12} fill="var(--text-tertiary)" style={{ fontFamily: 'var(--font-mono, monospace)' }}>{total.toLocaleString()} bp · {topology}</text>

        {/* hover tooltip (fixed, angle offset by rotation) */}
        {hovered != null && arcs[hovered] && (() => {
          const f = arcs[hovered]; const pt = polar(cx, cy, fMid, f.midAngle + rotRad);
          const bw = 176; const bh = 60; const ma = ((f.midAngle + rotRad) % TAU + TAU) % TAU; const side = (ma > 0 && ma < Math.PI) ? 1 : -1;
          let bx = side === 1 ? pt.x + 10 : pt.x - 10 - bw; let by = pt.y - bh / 2;
          bx = Math.max(6, Math.min(SZ - bw - 6, bx)); by = Math.max(6, Math.min(SZ - bh - 6, by));
          const stTxt = f.strand === 1 ? 'forward (+)' : f.strand === -1 ? 'reverse (−)' : 'no strand';
          return (
            <g style={{ pointerEvents: 'none' }} data-testid="plasmid-v2-tooltip">
              <rect x={bx} y={by} width={bw} height={bh} rx={6} fill="var(--surface-1, #fff)" stroke="var(--border-default, #d6d3d1)" strokeWidth={1} style={{ filter: 'drop-shadow(0 4px 10px rgba(28,25,23,0.18))' }} />
              <rect x={bx} y={by} width={4} height={bh} rx={2} fill={f.fill} />
              <text x={bx + 14} y={by + 17} fontSize={12.5} fontWeight={600} fill="var(--text-primary)" style={{ fontFamily: 'var(--font-ui, inherit)' }}>{trunc(f.name, 20)}</text>
              <text x={bx + 14} y={by + 33} fontSize={10.5} fill="var(--text-secondary)" style={{ fontFamily: 'var(--font-mono, monospace)' }}>{f.type} · {stTxt}</text>
              <text x={bx + 14} y={by + 48} fontSize={10.5} fill="var(--text-tertiary)" style={{ fontFamily: 'var(--font-mono, monospace)' }}>{(f.start + 1).toLocaleString()}–{f.end.toLocaleString()} · {(f.end - f.start).toLocaleString()} bp</text>
            </g>
          );
        })()}
      </svg>
    </div>
  );
}
