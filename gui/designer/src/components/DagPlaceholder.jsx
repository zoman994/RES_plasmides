// K4 stub. Full DAG placeholder lands in K6.
export default function DagPlaceholder() {
  return (
    <div
      data-testid="dag-placeholder"
      style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--surface-2, #f5f5f4)',
        color: 'var(--text-tertiary, #78716c)', fontSize: 14, padding: 24, textAlign: 'center',
      }}
    >
      Empty project. Push containers from Importer (coming in M-B).
    </div>
  );
}
