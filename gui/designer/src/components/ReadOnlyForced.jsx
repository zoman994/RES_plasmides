// K4 stub. Full read-only banner lands in K9.
export default function ReadOnlyForced() {
  return (
    <div
      data-testid="read-only-forced"
      style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: 8, padding: 32, textAlign: 'center',
      }}
    >
      <p style={{ fontSize: 16, fontWeight: 500, margin: 0 }}>Read-only mode</p>
      <p style={{ fontSize: 13, color: 'var(--text-secondary, #57534e)', margin: 0 }}>
        Контроль над проектом перешёл к другой вкладке.
      </p>
    </div>
  );
}
