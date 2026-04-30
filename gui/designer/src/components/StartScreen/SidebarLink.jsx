export default function SidebarLink({ children, badge, disabled, onClick, dataTestId }) {
  if (disabled) {
    return (
      <button
        type="button"
        className="ss-sb-link-disabled"
        disabled
        data-testid={dataTestId}
      >
        <span>{children}</span>
        {badge && (
          <span
            style={{
              fontSize: 11, padding: '2px 7px',
              borderRadius: 'var(--border-radius-md)',
              background: 'var(--ss-bg-tertiary)',
              color: 'var(--ss-text-tertiary)',
            }}
          >{badge}</span>
        )}
      </button>
    );
  }
  return (
    <button
      type="button"
      className="ss-sb-link"
      onClick={onClick}
      data-testid={dataTestId}
    >
      {children}
    </button>
  );
}
