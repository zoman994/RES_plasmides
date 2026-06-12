/**
 * AssemblyTabStrip — M-WORKSPACE top-level tabs, one per assembly (zone), in a
 * browser-tab style (Концепт A): active tab raised + bottom-connected, trailing
 * «+» creates a new assembly, per-tab «×» deletes the zone (confirm). Pure:
 * zones + activeId + callbacks.
 */
export default function AssemblyTabStrip({
  zones = [], activeId, onSelect, onCreate, onClose,
}) {
  return (
    <div
      data-testid="assembly-tab-strip"
      role="tablist"
      style={{
        display: 'flex', alignItems: 'stretch', gap: 3,
        padding: '6px 8px 0', flexShrink: 0,
        background: 'var(--surface-2)',
        borderBottom: '0.5px solid var(--border-subtle)',
      }}
    >
      {zones.map((z) => {
        const on = z.id === activeId;
        return (
          <div
            key={z.id}
            role="tab"
            aria-selected={on}
            data-testid={`assembly-tab-${z.id}`}
            data-active={on ? 'true' : 'false'}
            onClick={() => onSelect && onSelect(z.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 12px',
              fontSize: 13, fontWeight: on ? 600 : 400,
              color: on ? 'var(--text-primary)' : 'var(--text-secondary)',
              cursor: 'pointer',
              borderRadius: '8px 8px 0 0',
              border: on ? '0.5px solid var(--border-subtle)' : '0.5px solid transparent',
              borderBottom: 'none',
              background: on ? 'var(--surface-1)' : 'transparent',
              position: 'relative',
              top: on ? '0.5px' : 0,
              maxWidth: 200,
            }}
          >
            <span aria-hidden style={{ fontSize: 14, lineHeight: 1, color: 'var(--bio-primer, #378ADD)' }}>🧬</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {z.name || 'Сборка'}
            </span>
            <button
              type="button"
              data-testid={`assembly-tab-close-${z.id}`}
              aria-label="Удалить сборку"
              onClick={(e) => { e.stopPropagation(); onClose && onClose(z.id); }}
              style={{
                marginLeft: 2, padding: 0, width: 16, height: 16, lineHeight: '14px',
                border: 'none', background: 'transparent', cursor: 'pointer',
                color: 'var(--text-tertiary)', fontSize: 12, borderRadius: 3,
              }}
            >✕</button>
          </div>
        );
      })}
      <button
        type="button"
        data-testid="assembly-tab-add"
        aria-label="Новая сборка"
        title="Новая сборка"
        onClick={() => onCreate && onCreate()}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '0 11px', border: 'none', background: 'transparent',
          color: 'var(--text-tertiary)', fontSize: 16, cursor: 'pointer',
        }}
      >+</button>
    </div>
  );
}
