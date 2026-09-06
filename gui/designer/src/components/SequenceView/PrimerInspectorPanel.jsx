import { tf } from '../../i18n';
import { gcPercent } from '../../tm-calculator';
import { evaluatePrimerDuplexThermodynamics } from '../../lib/primer-duplex-thermodynamics';
import PrimerTmReadout from './popups/PrimerTmReadout';
import './PrimerInspectorPanel.css';

function countDifferences(alignment) {
  const out = { X: 0, I: 0, D: 0 };
  for (const run of alignment?.runs || []) {
    if (run.op === 'X') out.X += Math.max(0, run.queryEnd - run.queryStart);
    if (run.op === 'I') out.I += Math.max(0, run.queryEnd - run.queryStart);
    if (run.op === 'D') out.D += Math.max(0, run.targetEnd - run.targetStart);
  }
  return out;
}

function coordinatesOf(occurrence) {
  const segments = occurrence?.segments || [];
  if (!segments.length) return null;
  const first = segments[0];
  const last = segments[segments.length - 1];
  return occurrence.strand === -1
    ? { from: last.end, to: first.start + 1 }
    : { from: first.start + 1, to: last.end };
}

export default function PrimerInspectorPanel({
  selection,
  occurrence,
  primer,
  onEdit,
}) {
  const hit = selection?.hit || {};
  const direction = occurrence?.strand === -1
    ? 'reverse'
    : (occurrence?.strand === 1
      ? 'forward'
      : ((hit.direction || primer?.direction) === 'reverse' ? 'reverse' : 'forward'));
  const unresolved = occurrence?.oligoStatus === 'conflict'
    || occurrence?.oligoStatus === 'unsupported';
  const tail = unresolved
    ? ''
    : String(occurrence?.tail ?? hit.tail ?? primer?.tail ?? '');
  const sequence = String(primer?.sequence ?? hit.sequence ?? occurrence?.sequence ?? '');
  const binding = unresolved ? '' : String(
    occurrence?.alignment?.query
      ?? occurrence?.annealedSequence
      ?? hit.bindingSequence
      ?? primer?.bindingSequence
      ?? (sequence ? sequence.slice(tail.length) : null)
      ?? '',
  );
  const oligo = sequence || `${tail}${binding}`;
  const coordinates = coordinatesOf(occurrence);
  const differences = countDifferences(occurrence?.alignment);
  const thermodynamics = !unresolved && occurrence?.alignment
    ? evaluatePrimerDuplexThermodynamics({ alignment: occurrence.alignment })
    : null;
  const templateRow = String(occurrence?.alignment?.target || '');
  const hasDifferences = differences.X + differences.I + differences.D > 0;
  const gcIsExact = binding.length > 0 && /^[ACGT]+$/i.test(binding);

  return (
    <aside
      data-testid="primer-inspector"
      data-primer-disclosure-keepopen="true"
      data-primer-direction={direction}
      className="primer-inspector"
      aria-label={tf('primer.inspector.title')}
    >
      <header className="primer-inspector__header">
        <span className={`primer-inspector__direction primer-inspector__direction--${direction}`} />
        <div className="primer-inspector__heading">
          <strong>{primer?.name || hit.name || tf('primer.track.unnamed')}</strong>
          <span>{tf(`primer.track.direction.${direction}`)}</span>
        </div>
        {onEdit && (
          <button type="button" className="primer-inspector__edit" onClick={() => onEdit(hit)}>
            {tf('primer.inspector.edit')}
          </button>
        )}
      </header>

      <section className="primer-inspector__section">
        <span className="primer-inspector__label">{tf('primer.inspector.oligo')}</span>
        <code className="primer-inspector__sequence">
          {!unresolved && tail && <mark>{oligo.slice(0, tail.length)}</mark>}
          {unresolved ? oligo : oligo.slice(tail.length)}
        </code>
        <div className="primer-inspector__facts">
          <span>{unresolved
            ? tf('primer.inspector.tail-unknown')
            : tf('primer.modal.tail-length', { length: tail.length })}</span>
          <span>{gcIsExact
            ? tf('primer.inspector.gc', { value: gcPercent(binding) })
            : tf('primer.inspector.gc-unknown')}</span>
        </div>
      </section>

      {occurrence?.stale ? (
        <p className="primer-inspector__warning">{tf('primer.inspector.stale')}</p>
      ) : unresolved ? (
        <section className="primer-inspector__section">
          <div className="primer-inspector__facts">
            {coordinates && <span>{tf('primer.inspector.coordinates', coordinates)}</span>}
            <span>{tf('primer.inspector.tm-unknown')}</span>
            <span>{tf('primer.inspector.anchor-unknown')}</span>
          </div>
          <p className="primer-inspector__warning">{tf('primer.inspector.unresolved')}</p>
        </section>
      ) : (
        <>
          <section className="primer-inspector__section">
            <div className="primer-inspector__facts">
              {coordinates && (
                <span>{tf('primer.inspector.coordinates', coordinates)}</span>
              )}
              {occurrence?.wrapsOrigin && (
                <span>{tf('primer.modal.binding-preview-origin-note')}</span>
              )}
            </div>
            {templateRow && (
              <div className="primer-inspector__duplex">
                <span>{tf('primer.inspector.primer-row')}</span>
                <code>{occurrence.alignment.query}</code>
                <span>{tf('primer.inspector.template-row')}</span>
                <code>{templateRow}</code>
              </div>
            )}
            {hasDifferences && (
              <div className="primer-inspector__warning">
                {tf('primer.inspector.differences', differences)}
              </div>
            )}
          </section>
          {thermodynamics && <PrimerTmReadout result={thermodynamics} />}
        </>
      )}
    </aside>
  );
}
