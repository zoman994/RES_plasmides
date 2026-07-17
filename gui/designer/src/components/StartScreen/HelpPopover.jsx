/**
 * HelpPopover — single ? entry-point in the main header.
 *
 * SPEC_MAIN_SCREEN_CLEANUP §3.4. 3 tabs:
 *   - Руководство — concise built-in workflow guidance.
 *   - Хоткеи — re-uses existing HotkeyCheatsheet content via
 *     onOpenHotkeys callback (which already lives in App-level state).
 *   - Глоссарий — core biology and project-model terms.
 *
 * Caller manages open/closed via `open` + `onClose`; the active tab is local.
 * Esc / outside-click → onClose.
 */
import { useEffect, useState } from 'react';

export default function HelpPopover({ open, onClose, onOpenHotkeys }) {
  const [activeTab, setActiveTab] = useState('guide');

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const tabs = [
    { id: 'guide', label: 'Руководство' },
    { id: 'hotkeys', label: 'Хоткеи' },
    { id: 'glossary', label: 'Глоссарий' },
  ];

  return (
    <div
      role="dialog"
      data-testid="ss-help-popover"
      onClick={onClose}
      style={styles.backdrop}
    >
      <div onClick={(e) => e.stopPropagation()} style={styles.shell}>
        <div style={styles.header}>
          <strong style={{ fontSize: 13, flex: 1 }}>Помощь</strong>
          <button
            type="button"
            data-testid="ss-help-popover-close"
            onClick={onClose}
            style={styles.ghostBtn}
          >
            ✕
          </button>
        </div>
        <div style={styles.tabs} role="tablist">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={activeTab === t.id ? 'true' : 'false'}
              data-testid={`ss-help-tab-${t.id}`}
              onClick={() => setActiveTab(t.id)}
              style={{
                ...styles.tab,
                background: activeTab === t.id
                  ? 'var(--accent-100)'
                  : 'transparent',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div style={styles.body}>
          {activeTab === 'guide' && (
            <div data-testid="ss-help-tab-content-guide">
              <p style={styles.bodyText}>
                Начните с библиотеки: найдите или импортируйте молекулу, затем
                откройте её и проверьте последовательность и аннотации.
              </p>
              <p style={{ ...styles.bodyText, marginBottom: 0 }}>
                Для сборки создайте сборку в проекте, добавьте фрагменты и
                проверьте стыки, праймеры и итоговую последовательность.
              </p>
            </div>
          )}
          {activeTab === 'hotkeys' && (
            <div data-testid="ss-help-tab-content-hotkeys">
              <p style={styles.bodyText}>
                Открыть полный список горячих клавиш в отдельном окне.
              </p>
              <button
                type="button"
                data-testid="ss-help-open-hotkeys"
                onClick={() => {
                  onClose?.();
                  setTimeout(() => onOpenHotkeys?.(), 0);
                }}
                style={styles.primaryBtn}
              >
                Показать хоткеи
              </button>
            </div>
          )}
          {activeTab === 'glossary' && (
            <div data-testid="ss-help-tab-content-glossary" style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {[
                ['Проект', 'Рабочее пространство: набор молекул (контейнеров) и рецептов их сборки. Файл — .bodge.'],
                ['Контейнер', 'ДНК-сущность — конкретная молекула (плазмида или фрагмент) с последовательностью, топологией (кольцо/линия), концами и фичами.'],
                ['Сборка', 'Рецепт: как из кусков получить новую молекулу — фрагменты + стыки + операции + праймеры. Файл — .bodgeassembly.'],
                ['Кусок / фрагмент', 'Участок ДНК на канвасе сборки: из палитры, после разреза рестриктазой или как продукт ПЦР.'],
                ['Операция', 'Реакция в пайплайне: ПЦР, разрез рестриктазой, лигирование, Gibson, Golden Gate, затупление концов.'],
                ['Стык (junction)', 'Соединение двух соседних кусков. Задаёт метод: overlap-ПЦР / Gibson / Golden Gate / рестрикционное лигирование / тупой конец.'],
                ['Праймер', 'Олигонуклеотид для ПЦР. Живёт в пуле, имеет статус: спроектирован → заказан → получен → архив.'],
                ['.bodge', 'Файл проекта: молекулы + метаданные.'],
                ['.bodgeassembly', 'Файл одной сборки (рецепт), отдельно от проекта.'],
              ].map(([term, def]) => (
                <div key={term}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)' }}>{term}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.45 }}>{def}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const styles = {
  backdrop: {
    position: 'fixed', inset: 0, zIndex: 80,
    background: 'rgba(28,25,23,0.24)',
    display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end',
    paddingTop: 60, paddingRight: 24,
  },
  shell: {
    width: 560, maxHeight: '78vh',
    display: 'flex', flexDirection: 'column',
    background: 'var(--surface-1)', color: 'var(--text-primary)',
    border: '1px solid var(--border-subtle)', borderRadius: 8,
    boxShadow: '0 8px 28px rgba(28,25,23,0.24)', overflow: 'hidden',
  },
  header: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '10px 12px',
    background: 'var(--surface-2)', borderBottom: '1px solid var(--border-subtle)',
  },
  tabs: {
    display: 'flex', gap: 4, padding: '6px 8px',
    borderBottom: '1px solid var(--border-subtle)',
  },
  tab: {
    padding: '5px 12px', fontSize: 12,
    background: 'transparent', color: 'var(--text-primary)',
    border: '1px solid var(--border-subtle)', borderRadius: 4,
    cursor: 'pointer',
  },
  body: { padding: 14, flex: 1, overflowY: 'auto', fontSize: 12.5, lineHeight: 1.5 },
  bodyText: { margin: '0 0 12px 0', color: 'var(--text-secondary)' },
  primaryBtn: {
    padding: '6px 14px', fontSize: 12.5, fontWeight: 600,
    background: 'var(--accent-500, #b85c3e)', color: '#fff',
    border: 'none', borderRadius: 4, cursor: 'pointer',
  },
  ghostBtn: {
    padding: '4px 10px', fontSize: 12,
    background: 'transparent', color: 'var(--text-secondary)',
    border: '1px solid transparent', borderRadius: 4, cursor: 'pointer',
  },
};
