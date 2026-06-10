/**
 * MethodPickerCard — one assembly boundary in the RealiseModal
 * (DEC-CANVAS-ASM-REAL-10). JUNCTION step-2 FIX (J9): READ-ONLY now — the
 * assembly method is owned by the junction on the strip (click → JunctionControl),
 * so this card no longer offers radio choices; it reflects the method that will
 * go into the reaction, plus the auto-suggest hint.
 */
const METHOD_LABELS = {
  overlap_pcr: 'Overlap-PCR',
  gibson: 'Gibson',
  golden_gate: 'Golden Gate',
  restriction: 'Restriction',
  direct_ligation: 'Direct ligation',
  kld: 'KLD',
};

export default function MethodPickerCard({
  index, leftName, rightName, suggested, method,
}) {
  const label = METHOD_LABELS[method] || method || '—';
  return (
    <div
      data-testid="method-picker-card"
      data-boundary={index}
      data-method={method || ''}
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
      <div
        data-testid="method-picker-method"
        style={{
          display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5,
          padding: '4px 8px', borderRadius: 4,
          border: '1px solid var(--accent-500,#b85c3e)',
          background: 'var(--surface-3,rgba(184,92,62,0.10))',
        }}
      >
        Метод: <strong>{label}</strong>
        {METHOD_LABELS[method] ? (
          <span style={{ color: 'var(--text-tertiary)' }}>({method})</span>
        ) : null}
      </div>
      <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 4 }}>
        Метод задаётся кликом по стыку в сборке.
      </div>
    </div>
  );
}
