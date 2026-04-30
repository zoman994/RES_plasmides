// K4 stub. Full implementation lands in K6.
export default function UnderConstruction({ payload }) {
  const milestone = payload?.milestone || 'TBD';
  const name = payload?.name || 'Раздел';
  return (
    <div
      data-testid="under-construction"
      style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: 6, padding: 32, textAlign: 'center',
      }}
    >
      <p style={{ fontSize: 16, fontWeight: 500, margin: 0, color: 'var(--text-primary, #1c1917)' }}>
        {name} — В разработке
      </p>
      <p style={{ fontSize: 13, color: 'var(--text-secondary, #57534e)', margin: 0 }}>
        Скоро в {milestone}.
      </p>
    </div>
  );
}
