import { useStore } from '../store';

export default function ThemeToggle() {
  const theme = useStore(s => s.theme);
  const setTheme = useStore(s => s.setTheme);
  const next = theme === 'dark' ? 'light' : 'dark';
  const icon = theme === 'dark' ? '☀' : '🌙';
  const label = theme === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему';
  return (
    <button
      type="button"
      data-testid="theme-toggle"
      onClick={() => setTheme(next)}
      aria-label={label}
      title={label}
      style={{
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        padding: '4px 8px',
        fontSize: 16,
        lineHeight: 1,
        color: 'var(--text-secondary, #57534e)',
        borderRadius: 'var(--radius-md, 6px)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <span aria-hidden="true">{icon}</span>
    </button>
  );
}
