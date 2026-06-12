/**
 * AssemblyViewTabStrip — M-WORKSPACE second-level view tabs (segmented control,
 * Концепт B). Pure/presentational: the active view key + an onSelect callback.
 */
export const ASSEMBLY_VIEWS = [
  { key: 'sequence', label: 'Sequence' },
  { key: 'dag', label: 'DAG' },
  { key: 'primers', label: 'Праймеры' },
  { key: 'pipeline', label: 'Pipeline' },
];

export default function AssemblyViewTabStrip({ active = 'sequence', onSelect }) {
  return (
    <div
      data-testid="assembly-view-tab-strip"
      role="tablist"
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 14px 0', flexShrink: 0,
      }}
    >
      <div
        style={{
          display: 'inline-flex', border: '0.5px solid var(--border-subtle)',
          borderRadius: 'var(--radius-md, 8px)', overflow: 'hidden', fontSize: 12.5,
        }}
      >
        {ASSEMBLY_VIEWS.map((v, i) => {
          const on = v.key === active;
          return (
            <button
              key={v.key}
              type="button"
              role="tab"
              aria-selected={on}
              data-testid={`assembly-view-tab-${v.key}`}
              data-active={on ? 'true' : 'false'}
              onClick={() => onSelect && onSelect(v.key)}
              style={{
                padding: '6px 14px',
                border: 'none',
                borderLeft: i === 0 ? 'none' : '0.5px solid var(--border-subtle)',
                background: on ? 'var(--accent-50, rgba(184,92,62,0.10))' : 'transparent',
                color: on ? 'var(--accent-600, #99452c)' : 'var(--text-secondary)',
                fontWeight: on ? 600 : 400,
                cursor: 'pointer',
              }}
            >
              {v.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
