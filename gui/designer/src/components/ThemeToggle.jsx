import { useStore } from '../store';
import { STRINGS } from '../lib/strings';
import { Icon } from './icons/Icon';

export default function ThemeToggle() {
  const theme = useStore(s => s.theme);
  const setTheme = useStore(s => s.setTheme);
  const next = theme === 'dark' ? 'light' : 'dark';
  // Design-system §1.2/§6: no emoji in chrome — use the purpose-drawn Icon glyphs.
  const iconName = theme === 'dark' ? 'sun' : 'moon';
  const label = theme === 'dark' ? STRINGS.topbar.themeToggle.toLight : STRINGS.topbar.themeToggle.toDark;
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
      <Icon name={iconName} size={16} />
    </button>
  );
}
