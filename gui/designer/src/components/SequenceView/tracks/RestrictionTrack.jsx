/**
 * RestrictionTrack — restriction-site labels above the ruler (Sprint
 * M-B.3, K5).
 *
 * Reads RE state from store: `showReSites`, `reFilter`, `reMinSiteLen`
 * are inherited from v0.5 PlasmidMap UI; on v0.6 the keys are absent
 * and `useStore(s => s.showReSites)` returns undefined → track silently
 * collapses. Caller does NOT need to gate the mount.
 *
 * Two visual orientations, picked by uiSlice.sequenceView.reOrientation:
 *   - 'vertical'  (default): label text rotated 90° (matches SnapGene).
 *   - 'horizontal':           label text horizontal.
 *
 * Display-only — no click handlers in M-B.3 (biolog: "решим потом когда
 * я увижу контейнер на канвасе" → M-C Container Window kickoff).
 *
 * The track expects scanAllSites() output PRE-COMPUTED at the orchestrator
 * level so the work is done once per fullSeq instead of once per line.
 */

import { memo } from "react";

const ROW_HEIGHT_RE = 18;
const CUT_BAR_HEIGHT = 6;
const VERTICAL_LABEL_HEIGHT = 30;

/**
 * @param {object} props
 * @param {Array<{ enzyme: string, position: number, label?: string }>} props.sites
 * @param {number} props.lineStart
 * @param {number} props.lineLen
 * @param {number} props.charPx
 * @param {number} props.labelChars
 * @param {'vertical'|'horizontal'} props.reOrientation
 */
function RestrictionTrack({
  sites,
  lineStart,
  lineLen,
  charPx,
  labelChars,
  reOrientation,
}) {
  if (!Array.isArray(sites) || sites.length === 0 || !lineLen || charPx <= 0) {
    return null;
  }

  const lineEnd = lineStart + lineLen;
  const lineSites = sites.filter(
    (s) => s.position >= lineStart && s.position < lineEnd,
  );
  if (lineSites.length === 0) return null;

  const isVertical = reOrientation !== "horizontal";
  const widthPx = (labelChars + lineLen) * charPx;
  const totalHeight = isVertical ? VERTICAL_LABEL_HEIGHT + ROW_HEIGHT_RE : ROW_HEIGHT_RE * 2;

  return (
    <svg
      data-testid="sequence-view-restriction"
      data-line-start={lineStart}
      data-orientation={isVertical ? "vertical" : "horizontal"}
      data-site-count={lineSites.length}
      width={widthPx}
      height={totalHeight}
      // Decorative — RE-site markers + enzyme names never user-selectable.
      style={{ display: "block", overflow: "visible", userSelect: "none", WebkitUserSelect: "none" }}
    >
      {lineSites.map((s) => {
        const ci = s.position - lineStart;
        const x = (labelChars + ci + 0.5) * charPx;
        const labelY = isVertical ? VERTICAL_LABEL_HEIGHT - 2 : ROW_HEIGHT_RE - 4;
        const cutY = isVertical ? VERTICAL_LABEL_HEIGHT : ROW_HEIGHT_RE;
        return (
          <g
            key={`${s.enzyme}-${s.position}`}
            data-testid="sequence-view-re-site"
            data-enzyme={s.enzyme}
            data-position={s.position}
          >
            <text
              x={x}
              y={labelY}
              fontSize={9}
              fill="#dc2626"
              textAnchor={isVertical ? "start" : "middle"}
              transform={isVertical ? `rotate(-90 ${x} ${labelY})` : undefined}
              style={{ fontFamily: "inherit", userSelect: "none" }}
            >
              {s.enzyme}
            </text>
            {/* cut indicator: short vertical tick */}
            <line
              x1={x}
              x2={x}
              y1={cutY}
              y2={cutY + CUT_BAR_HEIGHT}
              stroke="#dc2626"
              strokeWidth={1}
            />
          </g>
        );
      })}
    </svg>
  );
}

export default memo(RestrictionTrack);
