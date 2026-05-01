import { STRINGS } from '../lib/strings';

export default function DagPlaceholder() {
  return (
    <div
      data-testid="dag-placeholder"
      style={{
        flex: 1,
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--surface-2, #f5f5f4)',
        backgroundImage:
          'radial-gradient(circle, var(--border-subtle, #e7e5e4) 1px, transparent 1px)',
        backgroundSize: '20px 20px',
        color: 'var(--text-tertiary, #78716c)',
        fontSize: 14,
        padding: 24,
        textAlign: 'center',
      }}
    >
      <p style={{ margin: 0, maxWidth: 480 }}>
        {STRINGS.placeholder.emptyProject}
      </p>
    </div>
  );
}
