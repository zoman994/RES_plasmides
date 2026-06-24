/**
 * HoverOpIconRow — quick op-creation icons revealed on container hover
 * (F3 DEC-CANVAS-PCR-03 #2). Only PCR is live in F3; the rest are
 * visible-but-disabled with a "следующий sprint" tooltip.
 */
import { Icon } from '../../icons/Icon';

const ICONS = [
  { kind: 'pcr', icon: 'pcr', label: 'PCR', enabled: true },
  { kind: 'cut', icon: 'digest', label: 'Cut', enabled: false },
  { kind: 'gibson', icon: 'mix', label: 'Gibson', enabled: false },
  { kind: 'mutagenesis', icon: 'mutagenesis', label: 'Mutate', enabled: false },
  { kind: 'ligate', icon: 'ligate', label: 'Ligate', enabled: false },
];

export default function HoverOpIconRow({ container, onPickKind }) {
  if (!container) return null;
  return (
    <div
      data-testid={`hover-op-icons-${container.id}`}
      style={{
        position: 'absolute',
        top: -34,
        left: 0,
        display: 'flex',
        gap: 4,
        padding: '3px 5px',
        background: 'var(--surface-1)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 6,
        boxShadow: '0 2px 6px rgba(28,25,23,0.12)',
        zIndex: 20,
      }}
    >
      {ICONS.map((it) => (
        <button
          key={it.kind}
          type="button"
          data-testid={`hover-op-icon-${it.kind}-${container.id}`}
          disabled={!it.enabled}
          title={it.enabled ? it.label : `${it.label} — следующий sprint`}
          onClick={(e) => {
            e.stopPropagation();
            if (it.enabled) onPickKind?.(it.kind);
          }}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '2px 6px',
            borderRadius: 4,
            border: '1px solid var(--border-subtle)',
            background: 'transparent',
            cursor: it.enabled ? 'pointer' : 'not-allowed',
            opacity: it.enabled ? 1 : 0.4,
          }}
        ><Icon name={it.icon} size={14} /></button>
      ))}
    </div>
  );
}
