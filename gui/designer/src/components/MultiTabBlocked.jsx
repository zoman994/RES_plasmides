// K4 stub. Full force-release flow lands in K9.
export default function MultiTabBlocked() {
  return (
    <div
      data-testid="multi-tab-blocked"
      style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: 8, padding: 32, textAlign: 'center',
      }}
    >
      <p style={{ fontSize: 16, fontWeight: 500, margin: 0 }}>Проект уже открыт в другой вкладке</p>
      <p style={{ fontSize: 13, color: 'var(--text-secondary, #57534e)', margin: 0 }}>
        Кнопка «Перенять контроль» — K9.
      </p>
    </div>
  );
}
