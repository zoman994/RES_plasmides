// K4 stub. Full Display/Identity/Advanced lands in K6.
import { useStore } from '../store';

export default function SettingsModal() {
  const closeSettings = useStore(s => s.closeSettings);
  const theme = useStore(s => s.theme);
  const setTheme = useStore(s => s.setTheme);
  return (
    <div
      data-testid="settings-modal-backdrop"
      role="dialog"
      onClick={closeSettings}
      style={{
        position: 'fixed', inset: 0, zIndex: 1200,
        background: 'rgba(0,0,0,0.32)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        data-testid="settings-modal"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--surface-1, #ffffff)', color: 'var(--text-primary, #1c1917)',
          padding: 20, borderRadius: 8, minWidth: 320,
          boxShadow: '0 16px 32px rgba(0,0,0,0.12)',
        }}
      >
        <h2 style={{ fontSize: 16, fontWeight: 500, margin: 0 }}>Настройки</h2>
        <p style={{ fontSize: 13, color: 'var(--text-secondary, #57534e)', marginTop: 8 }}>
          Тема: {theme}
        </p>
        <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
          <button
            type="button"
            data-testid="settings-toggle-light"
            onClick={() => setTheme('light')}
          >Light</button>
          <button
            type="button"
            data-testid="settings-toggle-dark"
            onClick={() => setTheme('dark')}
          >Dark</button>
        </div>
        <div style={{ marginTop: 16, textAlign: 'right' }}>
          <button type="button" onClick={closeSettings}>Закрыть</button>
        </div>
      </div>
    </div>
  );
}
