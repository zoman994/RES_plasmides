/**
 * PrimerSuggestionsPanel — right column of PcrModeShell. Pure
 * presentation (F3 DEC-CANVAS-PCR-05). Pairs come from selectPcrPrimers
 * via the shell; actions bubble up.
 */
import PrimerReusePicker from './PrimerReusePicker';

function clip(seq, n = 28) {
  if (!seq) return '';
  return seq.length <= n ? seq : `${seq.slice(0, n - 3)}…`;
}

export default function PrimerSuggestionsPanel({
  pairs = [], level = 'default', onReuse, onRemove,
}) {
  const showReuse = level === 'pro';
  return (
    <div
      data-testid="pcr-suggestions-panel"
      style={{
        width: 320,
        flexShrink: 0,
        borderLeft: '1px solid var(--border-subtle)',
        background: 'var(--surface-2)',
        display: 'flex',
        flexDirection: 'column',
        overflowY: 'auto',
      }}
    >
      <div style={{ padding: '8px 12px', fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', borderBottom: '1px solid var(--border-subtle)' }}>
        Праймеры ({pairs.length})
      </div>
      {showReuse && (
        <div style={{ borderBottom: '1px solid var(--border-subtle)', padding: 8 }}>
          <PrimerReusePicker onPick={(p) => onReuse?.(p)} />
        </div>
      )}
      {pairs.length === 0 && (
        <div style={{ padding: 12, fontSize: 12, color: 'var(--text-tertiary)' }}>
          Не удалось рассчитать пару — проверьте шаблон.
        </div>
      )}
      {pairs.map((p, i) => (
        <div
          key={i}
          data-testid="pcr-primer-pair"
          style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: 4 }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5 }}>
            <span style={{ color: 'var(--text-tertiary)' }}>пара {i + 1}</span>
            <span
              data-testid="pcr-primer-source"
              style={{
                padding: '0 6px', borderRadius: 8, fontSize: 9.5, fontWeight: 700,
                background: 'var(--surface-1)', border: '1px solid var(--border-subtle)',
                color: 'var(--text-secondary)',
              }}
            >{p.source || 'auto'}</span>
          </div>
          <div style={{ fontFamily: 'var(--mono, monospace)', fontSize: 11 }}>
            F: {clip(p.forward)} · Tm {Math.round(p.fwdTm)}°C
          </div>
          <div style={{ fontFamily: 'var(--mono, monospace)', fontSize: 11 }}>
            R: {clip(p.reverse)} · Tm {Math.round(p.revTm)}°C
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
            <button
              type="button"
              data-testid="pcr-primer-reuse"
              onClick={() => onReuse?.(p)}
              style={{ fontSize: 10.5, padding: '2px 8px', borderRadius: 4, border: '1px solid var(--border-subtle)', background: 'transparent', cursor: 'pointer', color: 'var(--text-secondary)' }}
            >↺ Reuse</button>
            <button
              type="button"
              data-testid="pcr-primer-remove"
              onClick={() => onRemove?.(i)}
              style={{ fontSize: 10.5, padding: '2px 8px', borderRadius: 4, border: '1px solid var(--border-subtle)', background: 'transparent', cursor: 'pointer', color: 'var(--text-secondary)' }}
            >✕</button>
          </div>
        </div>
      ))}
    </div>
  );
}
