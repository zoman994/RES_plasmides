/**
 * MethodPickerCard — one assembly boundary in the RealiseModal
 * (DEC-CANVAS-ASM-REAL-10). Radio group of the 5 A4 methods + the
 * auto-suggested hint.
 */
const METHODS = [
  ['overlap_pcr', 'Overlap-PCR'],
  ['gibson', 'Gibson'],
  ['golden_gate', 'Golden Gate'],
  ['restriction', 'Restriction'],
  ['direct_ligation', 'Direct ligation'],
];

export default function MethodPickerCard({
  index, leftName, rightName, suggested, value, onChange,
}) {
  return (
    <div
      data-testid="method-picker-card"
      data-boundary={index}
      style={{
        border: '1px solid var(--border-subtle)',
        borderRadius: 6,
        padding: 10,
        marginBottom: 8,
        background: 'var(--surface-2)',
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
        Граница {index + 1}: {leftName} → {rightName}
      </div>
      {suggested && (
        <div style={{ fontSize: 10.5, fontStyle: 'italic', color: 'var(--text-tertiary)', marginBottom: 6 }}>
          Рекомендуется: {suggested.method} ({suggested.confidence}) — {suggested.rationale}
        </div>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {METHODS.map(([id, label]) => (
          <label
            key={id}
            data-testid={`method-opt-${id}`}
            style={{
              display: 'flex', alignItems: 'center', gap: 4, fontSize: 11,
              padding: '4px 8px', borderRadius: 4, cursor: 'pointer',
              border: '1px solid ' + (value === id ? 'var(--accent-500,#b85c3e)' : 'var(--border-subtle)'),
              background: value === id ? 'var(--surface-3,rgba(184,92,62,0.10))' : 'var(--surface-1)',
            }}
          >
            <input
              type="radio"
              name={`boundary-${index}`}
              checked={value === id}
              onChange={() => onChange(id)}
            />
            {label}
          </label>
        ))}
      </div>
    </div>
  );
}
