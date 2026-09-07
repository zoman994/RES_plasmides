/**
 * RestrictionSitePopover — popover для restriction-site click.
 *
 * 12.05.2026 — Игорь: «сайты рестрикции должны быть кликабельны и
 * подсвечивать зону разреза и визуализировать липкие либо тупые
 * концы». Referenced UX: SnapGene cut visualization.
 *
 * Содержание:
 *   - Имя фермента + recognition site sequence.
 *   - Позиция в плазмиде + позиция cuts (top/bottom strand).
 *   - ASCII-style визуализация cut zone:
 *       5'-overhang (sticky):  5'...G   AATTC...3'
 *                              3'...CTTAA   G...5'
 *       3'-overhang:           5'...CTGCA   G...3'
 *                              3'...G   ACGTC...5'
 *       blunt:                 5'...GAT|ATC...3'
 *                              3'...CTA|TAG...5'
 *   - Кнопка «Разрезать здесь» → диспатчит CUT_CONTAINER_AT_CURSOR
 *     в позиции cut top strand (тот же reducer что toolbar Cut).
 *   - Кнопка «Отмена» / ESC / × → закрыть.
 */
import { useEffect } from 'react';
import { effectiveEnzymes } from '../../../restriction-db';
import { iupacComplement } from '../../../lib/iupac';
import { Icon } from '../../icons/Icon';

function complement(seq) {
  return (seq || '').split('').map(iupacComplement).join('');
}

/**
 * Build ASCII cut visualization (JSX, monospace).
 *
 * For 5'-overhang (cut top < cut bot): top strand cut leaves staircase
 * going down-right; bottom strand cut leaves staircase up-right.
 *
 *  Recognition: GAATTC
 *  EcoRI cuts at [1, 5] (top, bot from start of site).
 *
 *  Top:    5' - G    AATTC - 3'
 *  Bot:    3' - CTTAA    G - 5'
 *
 * For blunt (cut top == cut bot): one straight cut between the two.
 *
 *  Top:    5' - GAT | ATC - 3'
 *  Bot:    3' - CTA | TAG - 5'
 */
function buildCutVisual(info, occurrence) {
  const pattern = occurrence?.recognition?.pattern || info?.site || '';
  const site = occurrence?.recognition?.matchedTop || pattern;
  const bottom = complement(site);
  const cutTop = Number.isFinite(occurrence?.topCutOffset)
    ? occurrence.topCutOffset
    : info.cut[0];
  const cutBot = Number.isFinite(occurrence?.bottomCutOffset)
    ? occurrence.bottomCutOffset
    : info.cut[1];
  const endType = occurrence?.overhang?.type || info?.end;

  // Pre-split top + bottom strand at cuts.
  const topLeft = site.slice(0, cutTop);
  const topRight = site.slice(cutTop);
  // Bottom strand is displayed 3'→5' left-to-right, so it is the direct
  // complement of the displayed top strand, not its reverse complement.
  const botLeft = bottom.slice(0, cutBot);
  const botRight = bottom.slice(cutBot);

  const isBlunt = endType === 'blunt' || cutTop === cutBot;

  // SnapGene visualization: pad shorter strand with spaces so overhang
  // is visualized as a staircase.
  if (isBlunt) {
    return {
      kind: 'blunt',
      lines: [
        { label: "5'", left: topLeft, mark: '│', right: topRight, suffix: "3'" },
        { label: "3'", left: botLeft, mark: '│', right: botRight, suffix: "5'" },
      ],
      overhangLen: 0,
      overhangText: '',
      pattern,
      matchedTop: site,
      cutTop,
      cutBot,
    };
  }

  // Sticky end — figure out who has the overhang.
  // cutTop < cutBot → 5' overhang (top strand cut earlier; bottom
  // strand cut later → 4 nt single-strand 5' on each end).
  // cutTop > cutBot → 3' overhang.
  const is5prime = cutTop < cutBot;
  const overhangLen = Math.abs(cutBot - cutTop);
  const pad = ' '.repeat(overhangLen);

  if (is5prime) {
    // 5' overhang. After cut, left fragment has TOP recessed +
    // bottom protruding 5'. Visualize:
    //   5' ...topLeft    topRight...    3'
    //   3' ...botLeft+pad botRight    5'   (NO — let me think again)
    //
    // For EcoRI: site GAATTC, cut [1,5].
    // Top: G | AATTC
    // Bot rev (CTTAAG): CTTAA | G
    // Result two fragments — left: top=G, bot=CTTAA (5' overhang on bot)
    //                       right: top=AATTC, bot=G (5' overhang on top)
    //
    // Display in popover (SnapGene-style — both ends shown horizontally
    // with stagger):
    //   5' - G       AATTC - 3'
    //   3' - CTTAA       G - 5'
    //
    // Format: padding the shorter side at the cut boundary so the
    // recessed strand has visible gap.
    return {
      kind: '5overhang',
      lines: [
        { label: "5'", left: topLeft + pad, mark: ' ', right: topRight, suffix: "3'" },
        { label: "3'", left: botLeft, mark: ' ', right: pad + botRight, suffix: "5'" },
      ],
      overhangLen,
      overhangText: occurrence?.overhang?.seq || site.slice(cutTop, cutBot),
      pattern,
      matchedTop: site,
      cutTop,
      cutBot,
    };
  }
  // 3' overhang (PstI-style — site CTGCAG, cut [5,1]).
  // Top: CTGCA | G
  // Bot rev (GACGTC): G | ACGTC
  // Result left: top=CTGCA, bot=G (3' overhang on top recessing bot)
  //        right: top=G, bot=ACGTC (3' overhang on bot recessing top)
  // Display:
  //   5' - CTGCA       G - 3'
  //   3' -     G   ACGTC - 5'
  return {
    kind: '3overhang',
    lines: [
      { label: "5'", left: topLeft, mark: ' ', right: pad + topRight, suffix: "3'" },
      { label: "3'", left: pad + botLeft, mark: ' ', right: botRight, suffix: "5'" },
    ],
    overhangLen,
    overhangText: occurrence?.overhang?.seq || site.slice(cutBot, cutTop),
    pattern,
    matchedTop: site,
    cutTop,
    cutBot,
  };
}

export default function RestrictionSitePopover({
  site,
  position,
  onCut,
  onCancel,
}) {
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel?.();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  if (!site) return null;
  const occurrence = site.occurrence;
  const info = effectiveEnzymes()[site.enzyme];
  if (!occurrence && !info) return null;

  const visual = buildCutVisual(info, occurrence);
  // Canonical scan/flatten paths carry the physical cuts. Keep the raw
  // recognition-start fallback only for legacy direct component callers.
  const cutTopAbs = Number.isFinite(site.occurrence?.topCut)
    ? site.occurrence.topCut
    : site.position + info.cut[0];
  const cutBotAbs = Number.isFinite(site.occurrence?.bottomCut)
    ? site.occurrence.bottomCut
    : site.position + info.cut[1];

  // Position anchored near click event; clamp into viewport.
  const left = Math.max(8, Math.min(position?.x ?? 200, (typeof window !== 'undefined' ? window.innerWidth : 1200) - 360));
  const top = Math.max(8, position?.y ?? 200);

  const kindLabel = visual.kind === 'blunt'
    ? 'Тупые концы (blunt)'
    : visual.kind === '5overhang'
      ? `5'-липкие концы (${visual.overhangLen} nt)`
      : `3'-липкие концы (${visual.overhangLen} nt)`;
  const kindColor = visual.kind === 'blunt' ? '#6b7280' : '#d97706';

  return (
    <div
      data-testid="skeleton-re-popover-backdrop"
      onClick={onCancel}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 240,
      }}
    >
      <div
        data-testid="skeleton-re-popover"
        data-kind={visual.kind}
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'absolute',
          left,
          top,
          transform: 'translate(-50%, 12px)',
          width: 340,
          background: 'var(--surface-1, #fff)',
          border: '1px solid var(--border-default, #d6d3d1)',
          borderRadius: 8,
          boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            padding: '10px 14px',
            borderBottom: '1px solid var(--border-subtle, #e7e5e4)',
            background: 'var(--surface-2, #f5f5f4)',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#dc2626' }}>
              {site.enzyme}
            </div>
            <div
              data-testid="skeleton-re-popover-kind"
              style={{ fontSize: 11, color: kindColor, fontWeight: 500 }}
            >
              {kindLabel}
            </div>
          </div>
          <button
            type="button"
            data-testid="skeleton-re-popover-close"
            onClick={onCancel}
            title="Закрыть (Esc)"
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: 16,
              cursor: 'pointer',
              color: 'var(--text-secondary, #57534e)',
              padding: '0 4px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          ><Icon name="close" size={14} /></button>
        </header>

        <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div
            data-testid="skeleton-re-popover-cuts"
            style={{ fontSize: 11, color: 'var(--text-secondary, #57534e)' }}
          >
            Recognition: <code style={{ fontFamily: 'var(--font-mono, monospace)', color: 'var(--text-primary, #1c1917)' }}>{visual.pattern}</code>
            {visual.matchedTop !== visual.pattern && (
              <> → <code style={{ fontFamily: 'var(--font-mono, monospace)', color: 'var(--text-primary, #1c1917)' }}>{visual.matchedTop}</code></>
            )}
            <br />
            Cut (top strand): позиция <strong>{cutTopAbs + 1}</strong>
            {visual.cutTop !== visual.cutBot && (
              <>
                {' '}· (bottom): <strong>{cutBotAbs + 1}</strong>
              </>
            )}
            {(Number.isFinite(info?.temp) || info?.buffer) && <br />}
            {Number.isFinite(info?.temp) && <>T° {info.temp}°C</>}
            {Number.isFinite(info?.temp) && info?.buffer && <> · </>}
            {info?.buffer && <>Buffer: {info.buffer}</>}
            {visual.overhangText && (
              <>
                {' '}· Overhang: <code style={{ fontFamily: 'var(--font-mono, monospace)' }}>{visual.overhangText}</code>
              </>
            )}
          </div>

          <pre
            data-testid="skeleton-re-popover-visual"
            data-top-cut-offset={visual.cutTop}
            data-bottom-cut-offset={visual.cutBot}
            style={{
              margin: 0,
              padding: '8px 10px',
              background: 'var(--surface-2, #f5f5f4)',
              border: '1px solid var(--border-subtle, #e7e5e4)',
              borderRadius: 4,
              fontFamily: 'var(--font-mono, monospace)',
              fontSize: 12,
              lineHeight: 1.5,
              color: 'var(--text-primary, #1c1917)',
              whiteSpace: 'pre',
              overflowX: 'auto',
            }}
          >
{visual.lines.map((ln, i) => (
  `${ln.label}— ${ln.left}${ln.mark}${ln.right} —${ln.suffix}`
)).join('\n')}
          </pre>
        </div>

        <footer
          style={{
            display: 'flex',
            gap: 8,
            justifyContent: 'flex-end',
            padding: '8px 14px',
            borderTop: '1px solid var(--border-subtle, #e7e5e4)',
            background: 'var(--surface-2, #f5f5f4)',
          }}
        >
          <button
            type="button"
            data-testid="skeleton-re-popover-cancel"
            onClick={onCancel}
            style={{
              padding: '5px 12px',
              fontSize: 12,
              background: 'transparent',
              color: 'var(--text-primary, #1c1917)',
              border: '1px solid var(--border-default, #d6d3d1)',
              borderRadius: 4,
              cursor: 'pointer',
            }}
          >Отмена</button>
          <button
            type="button"
            data-testid="skeleton-re-popover-cut"
            onClick={() => onCut?.(cutTopAbs)}
            style={{
              padding: '5px 14px',
              fontSize: 12,
              background: '#dc2626',
              color: '#fff',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
              fontWeight: 500,
            }}
          ><Icon name="digest" size={13} style={{ display: 'inline-block', verticalAlign: '-2px' }} /> Разрезать здесь</button>
        </footer>
      </div>
    </div>
  );
}
