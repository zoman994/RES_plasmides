/**
 * PrimerStatusControl — PRIMER-2 (Игорь /loop 28.06.2026). A status pill for a
 * pool primer plus the lifecycle actions: «advance» (entry → ordered → received
 * → archived) and an explicit «archive» from any non-terminal state. Pure
 * presentation; the parent owns the store mutation via onPromote(id, status).
 */
import { statusMeta, nextStatus, isTerminal, statusLabel } from '../lib/primer-status';

export default function PrimerStatusControl({ primer, onPromote }) {
  if (!primer) return null;
  const status = primer.status || 'imported';
  const meta = statusMeta(status);
  const next = nextStatus(status);
  const terminal = isTerminal(status);

  const promote = (s) => {
    if (s && typeof onPromote === 'function') onPromote(primer.id, s);
  };

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <span
        data-testid={`primer-status-pill-${primer.id}`}
        style={{
          fontSize: 10.5,
          padding: '1px 7px',
          borderRadius: 9,
          background: meta.bg,
          color: meta.color,
          border: `1px solid ${meta.color}33`,
          fontWeight: 600,
          whiteSpace: 'nowrap',
        }}
      >{meta.label}</span>

      {next && (
        <button
          type="button"
          data-testid={`primer-status-advance-${primer.id}`}
          onClick={() => promote(next)}
          title={`Перевести в «${statusLabel(next)}»`}
          style={btnStyle}
        >→ {statusLabel(next)}</button>
      )}

      {!terminal && next !== 'archived' && (
        <button
          type="button"
          data-testid={`primer-status-archive-${primer.id}`}
          onClick={() => promote('archived')}
          title="В архив"
          style={{ ...btnStyle, color: 'var(--text-tertiary, #a8a29e)' }}
        >в архив</button>
      )}

      {terminal && (
        <button
          type="button"
          data-testid={`primer-status-restore-${primer.id}`}
          onClick={() => promote('received')}
          title="Вернуть из архива"
          style={btnStyle}
        >вернуть</button>
      )}
    </span>
  );
}

const btnStyle = {
  fontSize: 10,
  padding: '1px 6px',
  borderRadius: 4,
  border: '1px solid var(--border-default, #d6d3d1)',
  background: 'var(--surface-1, #fff)',
  color: 'var(--accent-text, #b45309)',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  lineHeight: 1.4,
};
