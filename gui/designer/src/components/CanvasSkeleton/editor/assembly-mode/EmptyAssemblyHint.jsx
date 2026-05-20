/**
 * EmptyAssemblyHint — onboarding hint shown when `draft.segments.length
 * === 0`. Replaces the scatter of empty-state messages with one focused
 * hint in the centre (SPEC_ASSEMBLY_EDITOR_CLEANUP §5.7).
 *
 * Stateless. Placement = main split area in AssemblyShellBody.
 */

export default function EmptyAssemblyHint() {
  return (
    <div
      data-testid="assembly-empty-hint"
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: 16,
        padding: 40,
        color: 'var(--text-secondary)',
      }}
    >
      <div style={{ fontSize: 32 }} aria-hidden>📦</div>
      <h3 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Скелет сборки пуст</h3>
      <ul
        style={{
          listStyle: 'none',
          padding: 0,
          margin: 0,
          lineHeight: 1.8,
          fontSize: 12,
          maxWidth: 480,
        }}
      >
        <li>
          📚 Перетащите плазмиду из библиотеки <em>или</em> нажмите{' '}
          <strong>+ Плазмида</strong> внизу.
        </li>
        <li>
          ✦ <strong>+ Обвес</strong> — tag / linker / restriction site (встроится в primer).
        </li>
        <li>
          🧪 <strong>+ Синтез</strong> — длинный кусок ПСО (≥100 bp).
        </li>
        <li>
          ◊ <strong>+ Gap</strong> — placeholder без последовательности.
        </li>
      </ul>
      <p
        style={{
          fontSize: 11.5,
          color: 'var(--text-tertiary)',
          margin: 0,
          textAlign: 'center',
        }}
      >
        Когда соберёте 2+ куска — кнопка{' '}
        <strong>🪄 Realise as DAG</strong> вверху справа.
      </p>
    </div>
  );
}
