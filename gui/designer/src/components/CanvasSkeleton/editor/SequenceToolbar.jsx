/**
 * SequenceToolbar — правая панель инструментов sequence viewer'а
 * внутри container editor'а.
 *
 * 12.05.2026 — Игорь: «добавляем в сиквенс вивер ... панель
 * инструментов → 1) Разрезать 2) Заменить 3) Удалить».
 *
 * Layout: вертикальный rail 52px шириной с header + 3 tool buttons.
 *
 * Поведение:
 *  - Cut (✂): разрез в позиции cursorPos — circular → линеаризация,
 *    linear → slice [0..cursorPos]. Реализовано через
 *    `onCut(containerId, cursorPos)` callback (диспатчит
 *    CUT_CONTAINER_AT_CURSOR в reducer).
 *  - Replace (↻) / Delete (🗑) — stub: toast «в разработке».
 *
 * Cut button disabled когда:
 *  - containerId отсутствует (placeholder editor),
 *  - cursorPos null / undefined / 0 / length (на границах нет смысла).
 */
import { useStore } from '../../../store';

const TOOLS = [
  { id: 'cut',     icon: '✂',  label: 'Разрезать' },
  { id: 'replace', icon: '↻',  label: 'Заменить' },
  { id: 'delete',  icon: '🗑',  label: 'Удалить' },
];

// 13.05.2026 — toggle для видимости сайтов рестрикции прямо в вивере.
// Дублирует pill в RestrictionPanel (левый sidebar) — биолог хочет
// быстрый доступ из обоих контекстов.
const TOGGLE_TOOL = { id: 're-toggle', icon: '🔪', label: 'Сайты рестрикции' };

export default function SequenceToolbar({
  tab = 'sequence',
  containerId = null,
  cursorPos = null,
  containerLength = 0,
  onCut,
}) {
  const showToast = useStore((s) => s.showToast);
  const showReSites = useStore((s) => s.showReSites);
  const onToggleReSites = () => {
    useStore.setState({ showReSites: !showReSites });
  };

  const hasCursor = Number.isFinite(cursorPos)
    && cursorPos > 0
    && cursorPos < containerLength;
  const cutDisabled = !containerId || !hasCursor;

  const onToolClick = (tool) => {
    if (tool.id === 'cut') {
      if (cutDisabled) {
        showToast?.('Поставьте курсор внутри последовательности (не на границе)', 'info');
        return;
      }
      onCut?.(containerId, cursorPos);
      return;
    }
    // replace / delete пока stub.
    showToast?.(`${tool.label} — в разработке`, 'info');
  };

  return (
    <aside
      data-testid="skeleton-editor-toolbar"
      data-tab={tab}
      style={{
        width: 52,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        borderLeft: '1px solid var(--border-subtle, #e7e5e4)',
        background: 'var(--surface-2, #f5f5f4)',
        minHeight: 0,
        overflowY: 'auto',
      }}
    >
      <header
        data-testid="skeleton-editor-toolbar-header"
        style={{
          padding: '8px 4px',
          borderBottom: '1px solid var(--border-subtle, #e7e5e4)',
          fontSize: 9,
          fontWeight: 600,
          letterSpacing: 0.3,
          textAlign: 'center',
          textTransform: 'uppercase',
          color: 'var(--text-tertiary, #a8a29e)',
          background: 'var(--surface-1, #fff)',
          flexShrink: 0,
        }}
        title="Инструменты"
      >
        Инст
      </header>

      <div
        data-testid="skeleton-editor-toolbar-slot"
        data-slot={tab}
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          padding: '6px 4px',
        }}
      >
        {TOOLS.map((tool) => {
          const isDisabled = tool.id === 'cut' && cutDisabled;
          const tip = tool.id === 'cut'
            ? (hasCursor
              ? `Разрезать в позиции ${cursorPos + 1}`
              : 'Поставьте курсор внутри последовательности (не на границе)')
            : `${tool.label} (в разработке)`;
          return (
            <button
              key={tool.id}
              type="button"
              data-testid={`skeleton-editor-tool-${tool.id}`}
              data-tab={tab}
              data-disabled={isDisabled ? 'true' : 'false'}
              title={tip}
              aria-label={tool.label}
              onClick={() => onToolClick(tool)}
              style={{
                width: 44,
                height: 44,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 0,
                background: 'var(--surface-1, #fff)',
                border: '1px solid var(--border-subtle, #e7e5e4)',
                borderRadius: 6,
                cursor: isDisabled ? 'not-allowed' : 'pointer',
                opacity: isDisabled ? 0.45 : 1,
                fontSize: 18,
                color: 'var(--text-primary, #1c1917)',
                transition: 'background 80ms ease, border-color 80ms ease',
              }}
              onMouseEnter={(e) => {
                if (isDisabled) return;
                e.currentTarget.style.background = 'var(--accent-50, #fef3c7)';
                e.currentTarget.style.borderColor = 'var(--accent-300, #fcd34d)';
              }}
              onMouseLeave={(e) => {
                if (isDisabled) return;
                e.currentTarget.style.background = 'var(--surface-1, #fff)';
                e.currentTarget.style.borderColor = 'var(--border-subtle, #e7e5e4)';
              }}
            >
              <span aria-hidden style={{ lineHeight: 1 }}>{tool.icon}</span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
