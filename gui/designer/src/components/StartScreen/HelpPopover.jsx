/**
 * HelpPopover — single ? entry-point in the main header.
 *
 * SPEC_MAIN_SCREEN_CLEANUP §3.4. 3 tabs:
 *   - Руководство — link to the online guide (placeholder until
 *     proper content lands).
 *   - Хоткеи — re-uses existing HotkeyCheatsheet content via
 *     onOpenHotkeys callback (which already lives in App-level state).
 *   - Глоссарий — placeholder for the upcoming biology-glossary
 *     content round.
 *
 * Stateless. Caller manages open/closed via `open` + `onClose`.
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
                  ? 'var(--accent-100, #eed2c1)'
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
                Полное руководство пользователя готовится. Пока — краткие
                подсказки в каждом окне приложения и комбинации клавиш на
                соседней вкладке.
              </p>
              <a
                href="https://bodgegene.dev/guide"
                target="_blank"
                rel="noopener noreferrer"
                data-testid="ss-help-guide-link"
                style={styles.link}
              >
                Открыть онлайн-руководство ↗
              </a>
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
                  // Defer to next tick so the popover closes before the
                  // hotkey modal mounts (avoids two backdrops stacked).
                  setTimeout(() => onOpenHotkeys?.(), 0);
                }}
                style={styles.primaryBtn}
              >
                Показать хоткеи
              </button>
            </div>
          )}
          {activeTab === 'glossary' && (
            <div data-testid="ss-help-tab-content-glossary">
              <p style={styles.bodyText}>
                Содержание готовится. Скоро будут пояснения терминов:
                контейнер, сборка, кусок, праймер, операция, зона,
                .bodge, .bodgeassembly, и других.
              </p>
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
    width: 440, maxHeight: '70vh',
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
  link: {
    display: 'inline-block', padding: '6px 12px',
    background: 'var(--surface-2)', color: 'var(--accent-500, #b85c3e)',
    border: '1px solid var(--border-subtle)', borderRadius: 4,
    textDecoration: 'none', fontSize: 12, fontWeight: 500,
  },
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
