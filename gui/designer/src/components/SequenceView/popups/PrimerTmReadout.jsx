import { tf } from '../../../i18n';

function reasonText(reason) {
  return tf(`primer.tm.reason.${reason || 'alignment-required'}`);
}

function pcrText(result) {
  const summary = tf(`primer.tm.pcr.${result.pcr.status}`);
  if (result.pcr.status !== 'refused') return summary;
  const refusal = (result.pcr.reasons || []).find((reason) => [
    'no-three-prime-anchor',
    'short-three-prime-anchor',
    'noncanonical-three-prime-anchor',
    'invalid-three-prime-anchor-evidence',
  ].includes(reason)) || 'short-three-prime-anchor';
  return `${summary} · ${reasonText(refusal)}`;
}

export function primerTmReadoutText(result) {
  if (!result) return '';
  const lowTm = result.fullDuplex.status === 'calculated'
    && result.fullDuplex.tmC < 50;
  const full = result.fullDuplex.status === 'calculated'
    ? tf('primer.tm.full-value', { tm: result.fullDuplex.tmC })
    : (result.fullDuplex.reason === 'imperfect-duplex'
      ? ''
      : tf('primer.tm.full-unknown', { reason: reasonText(result.fullDuplex.reason) }));
  const anchor = result.threePrimeAnchor.status === 'calculated'
    ? tf('primer.tm.anchor-value', {
      length: result.threePrimeAnchor.length,
      tm: result.threePrimeAnchor.tmC,
    })
    : tf('primer.tm.anchor-unknown', { length: result.threePrimeAnchor.length });
  const pcr = pcrText(result);
  return [full, lowTm ? tf('primer.tm.low') : '', anchor, pcr]
    .filter(Boolean)
    .join(' · ');
}

function toneOf(result) {
  if (result.pcr.status === 'refused') return 'danger';
  if (result.pcr.status === 'warning') return 'warning';
  if (result.fullDuplex.status === 'calculated' && result.fullDuplex.tmC < 50) {
    return 'warning';
  }
  return 'success';
}

export default function PrimerTmReadout({ result }) {
  if (!result) return null;
  const tone = toneOf(result);
  const fullCalculated = result.fullDuplex.status === 'calculated';
  const showFull = fullCalculated || result.fullDuplex.reason !== 'imperfect-duplex';
  const anchorCalculated = result.threePrimeAnchor.status === 'calculated';
  const lowTm = fullCalculated && result.fullDuplex.tmC < 50;

  return (
    <section
      data-testid="primer-modal-annealing-status"
      data-tone={tone}
      aria-label={primerTmReadoutText(result)}
      style={{
        display: 'grid', gap: 4, padding: '7px 8px', borderRadius: 6,
        border: '1px solid var(--border-default)',
        background: `var(--${tone}-bg)`, color: `var(--${tone}-fg)`,
        fontSize: 10.5,
      }}
    >
      {showFull && (
        <div data-testid="primer-modal-tm-full">
          {fullCalculated
            ? tf('primer.tm.full-value', { tm: result.fullDuplex.tmC })
            : tf('primer.tm.full-unknown', { reason: reasonText(result.fullDuplex.reason) })}
          {lowTm ? ` · ${tf('primer.tm.low')}` : ''}
        </div>
      )}
      <div data-testid="primer-modal-tm-anchor">
        {anchorCalculated
          ? tf('primer.tm.anchor-value', {
            length: result.threePrimeAnchor.length,
            tm: result.threePrimeAnchor.tmC,
          })
          : tf('primer.tm.anchor-unknown', { length: result.threePrimeAnchor.length })}
      </div>
      <div data-testid="primer-modal-tm-pcr">
        {pcrText(result)}
      </div>
    </section>
  );
}
