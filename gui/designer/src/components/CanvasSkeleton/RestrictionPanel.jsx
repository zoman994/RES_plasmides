/**
 * RestrictionPanel — sidebar секция «Рестриктазы» в skeleton editor.
 *
 * 13.05.2026 — Игорь: «надо сделать кнопку отключения видимости сайтов
 * рестрикции и отдельно в сайдбаре слева 'Рестриктазы'». Панель живёт
 * под LibraryTreeRoot в LibraryTreeHost (skeleton-only).
 *
 * Управляет глобальными store-полями `showReSites`, `reFilter`,
 * `reMinSiteLen` (legacy v0.5 paradigma, см. PlasmidMap.jsx). Direct
 * setState — методы `setShowReSites/setReFilter` в v0.6 store
 * отсутствуют, но запись через `useStore.setState` работает.
 */
import { useStore } from '../../store';

const FILTERS = [
  { id: 'all',    label: 'Все',         desc: 'Все сайты' },
  { id: 'unique', label: 'Уникальные',  desc: 'Сайты с 1 разрезом' },
  { id: 'double', label: '≤ 2 разрезов', desc: 'Сайты с 1-2 разрезами' },
];

const MIN_LEN_OPTIONS = [4, 5, 6, 7, 8];

export default function RestrictionPanel() {
  const showReSites = useStore((s) => s.showReSites);
  const reFilter = useStore((s) => s.reFilter) || 'all';
  const reMinSiteLen = useStore((s) => s.reMinSiteLen) || 6;

  const onToggleVisible = () => {
    useStore.setState({ showReSites: !showReSites });
  };
  const onSetFilter = (id) => useStore.setState({ reFilter: id });
  const onSetMinLen = (n) => useStore.setState({ reMinSiteLen: n });

  return (
    <div
      data-testid="skeleton-restriction-panel"
      style={{
        flexShrink: 0,
        borderTop: '1px solid var(--border-subtle, #e7e5e4)',
        padding: '10px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        fontSize: 12,
        background: 'var(--surface-2, #f5f5f4)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
          🔪 Рестриктазы
        </span>
        <button
          type="button"
          data-testid="skeleton-restriction-toggle"
          aria-pressed={!!showReSites}
          onClick={onToggleVisible}
          title={showReSites ? 'Скрыть сайты рестрикции' : 'Показать сайты рестрикции'}
          style={{
            border: '1px solid ' + (showReSites ? 'var(--accent-500, #d97706)' : 'var(--border-default, #d6d3d1)'),
            background: showReSites ? 'var(--accent-500, #d97706)' : 'var(--surface-1, #fff)',
            color: showReSites ? '#fff' : 'var(--text-secondary, #57534e)',
            borderRadius: 12,
            padding: '2px 10px',
            fontSize: 11,
            fontWeight: 500,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <span style={{ fontSize: 10 }}>{showReSites ? '●' : '○'}</span>
          {showReSites ? 'Показаны' : 'Скрыты'}
        </button>
      </div>

      {showReSites && (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Фильтр</span>
            <div style={{ display: 'flex', gap: 4 }}>
              {FILTERS.map((f) => {
                const active = reFilter === f.id;
                return (
                  <button
                    key={f.id}
                    type="button"
                    data-testid={`skeleton-restriction-filter-${f.id}`}
                    aria-pressed={active}
                    onClick={() => onSetFilter(f.id)}
                    title={f.desc}
                    style={{
                      flex: 1,
                      padding: '4px 6px',
                      border: '1px solid ' + (active ? 'var(--accent-500, #d97706)' : 'var(--border-default, #d6d3d1)'),
                      borderRadius: 4,
                      background: active ? 'var(--accent-100, #fef3c7)' : 'var(--surface-1, #fff)',
                      color: active ? 'var(--accent-700, #b45309)' : 'var(--text-secondary, #57534e)',
                      cursor: 'pointer',
                      fontSize: 10.5,
                      fontWeight: active ? 600 : 400,
                    }}
                  >{f.label}</button>
                );
              })}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Мин. длина сайта</span>
            <div style={{ display: 'flex', gap: 4 }}>
              {MIN_LEN_OPTIONS.map((n) => {
                const active = reMinSiteLen === n;
                return (
                  <button
                    key={n}
                    type="button"
                    data-testid={`skeleton-restriction-minlen-${n}`}
                    aria-pressed={active}
                    onClick={() => onSetMinLen(n)}
                    title={`Минимум ${n} нт`}
                    style={{
                      flex: 1,
                      padding: '3px 0',
                      border: '1px solid ' + (active ? 'var(--accent-500, #d97706)' : 'var(--border-default, #d6d3d1)'),
                      borderRadius: 4,
                      background: active ? 'var(--accent-100, #fef3c7)' : 'var(--surface-1, #fff)',
                      color: active ? 'var(--accent-700, #b45309)' : 'var(--text-secondary, #57534e)',
                      cursor: 'pointer',
                      fontSize: 10.5,
                      fontFamily: 'monospace',
                      fontWeight: active ? 600 : 400,
                    }}
                  >{n}</button>
                );
              })}
            </div>
          </div>

          <div
            style={{
              fontSize: 10,
              color: 'var(--text-tertiary, #a8a29e)',
              lineHeight: 1.4,
              marginTop: 2,
            }}
          >
            Сайты видны в Editor → вкладка «Sequence».
            Клик по подписи → фиксирует выделение области связывания + разреза.
          </div>
        </>
      )}
    </div>
  );
}
