const ICON_COLOR = {
  success: '#22c55e',
  error: '#ef4444',
  warning: '#f59e0b',
  info: '#a3a3a3',
};

export default function ToastIcon({ kind = 'info' }) {
  const color = ICON_COLOR[kind] || ICON_COLOR.info;
  const testId = `toast-icon-${kind}`;

  if (kind === 'success') {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" data-testid={testId} aria-hidden="true">
        <path d="M3 8.5l3 3 6.5-7" stroke={color} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (kind === 'error') {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" data-testid={testId} aria-hidden="true">
        <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke={color} strokeWidth="2" fill="none" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === 'warning') {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" data-testid={testId} aria-hidden="true">
        <path d="M8 1.5L15 14H1L8 1.5z" fill={color} />
        <path d="M8 6v4M8 11.5v0.5" stroke="#1a1a1a" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" data-testid={testId} aria-hidden="true">
      <circle cx="8" cy="8" r="7" stroke={color} strokeWidth="1.5" fill="none" />
      <path d="M8 7v4.5M8 4.5v0.5" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
