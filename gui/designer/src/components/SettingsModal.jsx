import { useState } from 'react';
import { useStore } from '../store';
import { clearAll } from '../db/dexie-schema';
import { formatHotkey } from '../lib/hotkeys';

const TABS = [
  { id: 'display', label: 'Display' },
  { id: 'identity', label: 'Identity' },
  { id: 'advanced', label: 'Advanced' },
];

export default function SettingsModal() {
  const closeSettings = useStore(s => s.closeSettings);
  const theme = useStore(s => s.theme);
  const setTheme = useStore(s => s.setTheme);
  const agent = useStore(s => s.agent);
  const setAgent = useStore(s => s.setAgent);
  const showToast = useStore(s => s.showToast);

  const [tab, setTab] = useState('display');
  const [name, setName] = useState(agent?.name || '');
  const [email, setEmail] = useState(agent?.email || '');
  const [confirmReset, setConfirmReset] = useState(false);

  function saveIdentity() {
    setAgent({ name: name.trim(), email: email.trim() });
    showToast('Identity сохранён', 'success');
  }

  async function doReset() {
    try {
      await clearAll();
      try { localStorage.clear(); } catch { /* ignore */ }
      window.location.reload();
    } catch (e) {
      showToast(`Reset failed: ${e.message || e}`, 'error');
    }
  }

  return (
    <div
      data-testid="settings-modal-backdrop"
      role="dialog"
      onClick={closeSettings}
      style={{
        position: 'fixed', inset: 0, zIndex: 1200,
        background: 'rgba(0, 0, 0, 0.32)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        data-testid="settings-modal"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--surface-1, #ffffff)',
          color: 'var(--text-primary, #1c1917)',
          padding: 0,
          borderRadius: 'var(--radius-lg, 8px)',
          minWidth: 480,
          maxWidth: 560,
          boxShadow: 'var(--shadow-xl)',
          border: '0.5px solid var(--border-default, #d6d3d1)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 18px',
            borderBottom: '0.5px solid var(--border-subtle, #e7e5e4)',
          }}
        >
          <h2 style={{ fontSize: 16, fontWeight: 500, margin: 0 }}>Настройки</h2>
          <button
            type="button"
            onClick={closeSettings}
            data-testid="settings-close"
            title={`Закрыть ⋅ ${formatHotkey('escape')}`}
            style={{ background: 'transparent', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--text-secondary)' }}
            aria-label="close"
          >×</button>
        </div>

        <div style={{ display: 'flex', borderBottom: '0.5px solid var(--border-subtle)' }}>
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              data-testid={`settings-tab-${t.id}`}
              onClick={() => setTab(t.id)}
              style={{
                flex: 'none',
                padding: '10px 16px',
                fontSize: 13,
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: tab === t.id ? 'var(--text-primary)' : 'var(--text-secondary)',
                borderBottom: tab === t.id ? '2px solid var(--accent-500)' : '2px solid transparent',
              }}
            >{t.label}</button>
          ))}
        </div>

        <div style={{ padding: 18 }}>
          {tab === 'display' && (
            <div data-testid="settings-tab-content-display">
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 8px' }}>
                Тема оформления
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  data-testid="settings-toggle-light"
                  onClick={() => setTheme('light')}
                  style={{
                    padding: '6px 14px', fontSize: 13,
                    border: theme === 'light' ? '0.5px solid var(--accent-500)' : '0.5px solid var(--border-default)',
                    borderRadius: 'var(--radius-md)',
                    background: theme === 'light' ? 'var(--accent-50)' : 'var(--surface-1)',
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                  }}
                >Light</button>
                <button
                  type="button"
                  data-testid="settings-toggle-dark"
                  onClick={() => setTheme('dark')}
                  style={{
                    padding: '6px 14px', fontSize: 13,
                    border: theme === 'dark' ? '0.5px solid var(--accent-500)' : '0.5px solid var(--border-default)',
                    borderRadius: 'var(--radius-md)',
                    background: theme === 'dark' ? 'var(--accent-50)' : 'var(--surface-1)',
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                  }}
                >Dark</button>
              </div>
            </div>
          )}

          {tab === 'identity' && (
            <div data-testid="settings-tab-content-identity">
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 8px' }}>
                Identity = label для commit attribution. Не аккаунт.
              </p>
              <label style={{ display: 'block', fontSize: 12, marginBottom: 4, color: 'var(--text-secondary)' }}>
                Имя
              </label>
              <input
                data-testid="settings-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={{
                  width: '100%', padding: '6px 10px', fontSize: 13,
                  border: '0.5px solid var(--border-default)', borderRadius: 'var(--radius-md)',
                  marginBottom: 12, background: 'var(--surface-2)', color: 'var(--text-primary)',
                }}
              />
              <label style={{ display: 'block', fontSize: 12, marginBottom: 4, color: 'var(--text-secondary)' }}>
                Email
              </label>
              <input
                data-testid="settings-email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{
                  width: '100%', padding: '6px 10px', fontSize: 13,
                  border: '0.5px solid var(--border-default)', borderRadius: 'var(--radius-md)',
                  marginBottom: 12, background: 'var(--surface-2)', color: 'var(--text-primary)',
                }}
              />
              <button
                type="button"
                data-testid="settings-save-identity"
                onClick={saveIdentity}
                style={{
                  padding: '6px 14px', fontSize: 13,
                  border: '0.5px solid var(--accent-500)',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--accent-50)',
                  color: 'var(--accent-text)',
                  fontWeight: 500, cursor: 'pointer',
                }}
              >Сохранить</button>
            </div>
          )}

          {tab === 'advanced' && (
            <div data-testid="settings-tab-content-advanced">
              <p style={{ fontSize: 13, color: 'var(--danger-fg, #b91c1c)', margin: '0 0 8px' }}>
                Reset очистит IndexedDB и localStorage. Все локальные проекты будут удалены.
              </p>
              {!confirmReset ? (
                <button
                  type="button"
                  data-testid="settings-reset"
                  onClick={() => setConfirmReset(true)}
                  style={{
                    padding: '6px 14px', fontSize: 13,
                    border: '0.5px solid var(--danger-fg, #b91c1c)',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--danger-bg, #fee2e2)',
                    color: 'var(--danger-fg, #b91c1c)',
                    cursor: 'pointer',
                  }}
                >Reset (clear IndexedDB)</button>
              ) : (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    data-testid="settings-reset-confirm"
                    onClick={doReset}
                    style={{
                      padding: '6px 14px', fontSize: 13,
                      border: '0.5px solid var(--danger-fg, #b91c1c)',
                      borderRadius: 'var(--radius-md)',
                      background: 'var(--danger-fg, #b91c1c)',
                      color: '#fff', cursor: 'pointer',
                    }}
                  >Подтвердить очистку</button>
                  <button
                    type="button"
                    onClick={() => setConfirmReset(false)}
                    style={{
                      padding: '6px 14px', fontSize: 13,
                      border: '0.5px solid var(--border-default)',
                      borderRadius: 'var(--radius-md)',
                      background: 'transparent', cursor: 'pointer',
                      color: 'var(--text-primary)',
                    }}
                  >Отмена</button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
