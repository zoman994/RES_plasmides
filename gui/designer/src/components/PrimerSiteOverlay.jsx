/**
 * PrimerSiteOverlay — draws projected primer binding sites on a map (ANN-0L/0M).
 *
 * Lives outside PlasmidMapV2/LinearMapV2 on purpose: both are already in the
 * `.jsx` soft zone, and primer geometry is a separable responsibility.
 *
 * Contract it renders:
 *   * one occurrence = one glyph, tagged with its primer id and site key;
 *   * a primer with several source sites is drawn once per site;
 *   * an origin-crossing site is TWO drawn segments under ONE site key, so it
 *     stays one logical binding, with one label and one selection;
 *   * a hidden source site renders muted/dashed rather than disappearing;
 *   * forward, reverse and UNKNOWN strands are visually distinct — an unknown
 *     strand is the file declining to say, and painting it in the forward
 *     colour turns that silence into a claim;
 *   * a proven 5' tail is drawn as its own glyph, outside the genomic span,
 *     anchored at the site start for a forward primer and the site end for a
 *     reverse one — a tail does not lengthen the genomic footprint;
 *   * a glyph is either a real control (focusable, click and Enter/Space doing
 *     the same one thing) or explicitly decorative. Never a button the
 *     keyboard cannot reach.
 */

import { projectPrimerPool, buildRenderContext } from '../lib/primer-site-projection';
import { tailBox, tailSpans } from '../lib/primer-site-geometry';
import { t, tf } from '../i18n';

const TAIL_PX = 6;

const STRAND_NAME = { 1: 'forward', '-1': 'reverse' };

function strandOf(occ) {
  return STRAND_NAME[occ.strand] || 'unknown';
}

/** Fill token per strand. Unknown gets its own token, never the forward one. */
function fillToken(occ) {
  const s = strandOf(occ);
  if (s === 'forward') return 'var(--viz-primer-fwd)';
  if (s === 'reverse') return 'var(--viz-primer-rev)';
  return 'var(--viz-primer-unknown)';
}

/** What this glyph is, in the interface language. */
function describe(occ) {
  const parts = [t(`primer.strand.${strandOf(occ)}`)];
  if (occ.annealedSequence) parts.push(occ.annealedSequence);
  if (occ.tail) parts.push(tf('primer.tailOf', { bases: occ.tail }));
  parts.push(occ.evidence === 'computed' ? t('primer.siteComputed') : t('primer.siteSource'));
  if (occ.sourceVisibility === 'hidden') parts.push(t('primer.siteHidden'));
  return parts.join(' · ');
}

/**
 * @param {object} props
 * @param {Array} props.primers        canonical primer records
 * @param {object} props.context       the ONE render context (ANN-0M root D)
 * @param {(bp:number)=>number} [props.toX]  bp → x (linear host)
 * @param {(seg:{start:number,end:number})=>string} [props.segmentPath]
 *        bp span → SVG path `d` (circular host). Geometry stays in the host
 *        map, which already owns its coordinate system.
 * @param {(key:string, occ:object)=>void} [props.onSelectSite]
 *        When given, each glyph becomes a control. When absent, glyphs are
 *        decorative and say so.
 * @param {string} [props.selectedKey]
 * @param {number} props.y             lane top
 * @param {number} props.height        lane height
 */
export default function PrimerSiteOverlay({
  primers,
  context,
  toX,
  segmentPath,
  onSelectSite = null,
  selectedKey = null,
  y = 0,
  height = 6,
}) {
  const linear = typeof toX === 'function';
  const arced = typeof segmentPath === 'function';
  if (!Array.isArray(primers) || primers.length === 0 || (!linear && !arced)) {
    return null;
  }
  // A host that failed to build the context gets an empty one, which fails
  // closed for every targeted site rather than guessing at the document.
  const ctx = context || buildRenderContext({});
  const occurrences = projectPrimerPool(primers, ctx);
  if (occurrences.length === 0) return null;

  const interactive = typeof onSelectSite === 'function';

  return (
    <g data-testid="primer-site-overlay">
      {occurrences.map((occ) => {
        const muted = occ.sourceVisibility === 'hidden';
        const computed = occ.evidence === 'computed';
        const fill = fillToken(occ);
        const label = describe(occ);
        const activate = interactive ? () => onSelectSite(occ.key, occ) : undefined;
        return (
          <g
            key={occ.key}
            data-testid="primer-site"
            data-primer-id={occ.primerId}
            data-primer-site-key={occ.key}
            data-primer-evidence={occ.evidence}
            data-primer-visibility={occ.sourceVisibility}
            data-primer-strand={strandOf(occ)}
            data-primer-wraps={occ.wrapsOrigin ? 'true' : undefined}
            data-selected={selectedKey === occ.key ? 'true' : undefined}
            className={interactive ? 'primer-site-glyph' : undefined}
            role={interactive ? 'button' : undefined}
            tabIndex={interactive ? 0 : undefined}
            aria-label={interactive ? label : undefined}
            aria-hidden={interactive ? undefined : 'true'}
            onClick={activate}
            onKeyDown={interactive ? (e) => {
              // One action, two ways in. A control the mouse can reach and the
              // keyboard cannot is not a control.
              if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
                e.preventDefault();
                activate();
              }
            } : undefined}
            opacity={muted ? 0.45 : 1}
          >
            {/* One shape per SEGMENT: a wrap draws twice under one key. */}
            {occ.segments.map((seg, i) => {
              const stroke = muted || computed ? 'var(--text-tertiary)' : 'none';
              const dash = muted || computed ? '2 2' : undefined;
              const sw = muted || computed ? 0.8 : 0;
              if (arced) {
                return (
                  <path
                    key={i}
                    data-testid="primer-site-segment"
                    data-primer-id={occ.primerId}
                    d={segmentPath(seg)}
                    fill={fill}
                    stroke={stroke}
                    strokeDasharray={dash}
                    strokeWidth={sw}
                  />
                );
              }
              const x0 = toX(seg.start);
              const x1 = Math.max(toX(seg.end), x0 + 1);
              return (
                <rect
                  key={i}
                  data-testid="primer-site-segment"
                  data-primer-id={occ.primerId}
                  x={x0}
                  y={y}
                  width={x1 - x0}
                  height={height}
                  rx={1}
                  fill={fill}
                  stroke={stroke}
                  strokeDasharray={dash}
                  strokeWidth={sw}
                />
              );
            })}

            {/* A proven tail is NOT part of the genomic span — it hangs off the
                5' anchor so a track never searches the template for it. */}
            {linear ? (() => {
              const box = tailBox(occ, toX, TAIL_PX);
              if (!box) return null;
              return (
                <rect
                  data-testid="primer-site-tail"
                  data-primer-tail="true"
                  data-primer-id={occ.primerId}
                  x={box.x}
                  y={y + height * 0.25}
                  width={box.width}
                  height={height * 0.5}
                  fill="var(--viz-primer-tail)"
                />
              );
            })() : null}

            {/* The same overhang on the ring, adjacent to the binding and in
                its own colour — never merged into the genomic span. */}
            {arced ? tailSpans(occ, ctx.length, ctx.topology === 'circular').map((sp, i) => (
              <path
                key={`tail-${i}`}
                data-testid="primer-site-tail"
                data-primer-tail="true"
                data-primer-id={occ.primerId}
                d={segmentPath(sp)}
                fill="var(--viz-primer-tail)"
                opacity={0.9}
              />
            )) : null}

            <title>{label}</title>
          </g>
        );
      })}
    </g>
  );
}
