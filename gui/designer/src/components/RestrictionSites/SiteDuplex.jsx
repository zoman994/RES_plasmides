/**
 * SiteDuplex — textbook-style restriction-site diagram (Игорь 22.06: «нормальная
 * визуализация сайта — обе цепи, место распознавания и место разреза»).
 *
 * Renders the recognition site as a DNA duplex (top 5′→3' + bottom 3′→5'
 * complement) with a red cut bar on each strand at its cut position, and the
 * single-stranded overhang region (between the two cuts) highlighted. E.g. EcoRI
 * GAATTC cut [1,5]:
 *
 *   5′ G│A A T T C 3′
 *   3′ C T T A A│G 5′      → 5′-overhang AATT
 *
 * cut = [fwd, rev]: 0-based positions from the 5′ end where each strand is cut
 * (fwd = top, rev = bottom). fwd<rev → 5′ overhang, fwd>rev → 3′, equal → blunt.
 */
import { complement } from '../../sequence-utils';

const CELL = 13;

export default function SiteDuplex({ site, cut }) {
  if (!site || !Array.isArray(cut) || cut.length < 2) return null;
  const top = String(site).toUpperCase().split('');
  const len = top.length;
  const bottom = top.map((b) => complement(b));
  const cf = Math.max(0, Math.min(len, cut[0] | 0));
  const cr = Math.max(0, Math.min(len, cut[1] | 0));
  const lo = Math.min(cf, cr);
  const hi = Math.max(cf, cr);
  const blunt = cf === cr;

  const renderStrand = (bases, cutAt, l5, l3, testid) => (
    <div data-testid={testid} style={{ display: 'flex', alignItems: 'center', fontFamily: 'var(--font-mono, monospace)', fontSize: 13, lineHeight: '20px' }}>
      <span style={{ width: 16, color: 'var(--text-tertiary)', fontSize: 9 }}>{l5}</span>
      <div style={{ display: 'flex' }}>
        {bases.map((b, i) => (
          // eslint-disable-next-line react/no-array-index-key
          <span key={i} style={{ position: 'relative', display: 'inline-flex' }}>
            {i === cutAt && <span aria-hidden style={cutBar} />}
            <span style={{
              width: CELL, textAlign: 'center',
              background: (!blunt && i >= lo && i < hi) ? 'var(--accent-100, #fef3c7)' : 'transparent',
            }}>{b}</span>
          </span>
        ))}
        {cutAt === len && <span aria-hidden style={cutBar} />}
      </div>
      <span style={{ width: 16, color: 'var(--text-tertiary)', fontSize: 9, textAlign: 'right' }}>{l3}</span>
    </div>
  );

  return (
    <div data-testid="rs-site-duplex" style={{ margin: '4px 0', userSelect: 'none', display: 'inline-block' }}>
      {renderStrand(top, cf, '5′', '3′', 'rs-duplex-top')}
      {renderStrand(bottom, cr, '3′', '5′', 'rs-duplex-bottom')}
      <div data-testid="rs-duplex-label" style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2 }}>
        {blunt ? 'тупой конец (blunt)' : `${cf < cr ? '5′' : '3′'}-выступ ${site.slice(lo, hi)}`} · разрез после {cut[0]} / {cut[1]} нт
      </div>
    </div>
  );
}

const cutBar = {
  position: 'absolute', left: -1, top: -2, width: 2, height: 24,
  background: '#dc2626', zIndex: 1, borderRadius: 1,
};
