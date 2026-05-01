import { useStore } from '../store';
import { STRINGS } from '../lib/strings';

export default function ReadOnlyForced() {
  const closeProject = useStore(s => s.closeProject);
  return (
    <div
      data-testid="read-only-forced"
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        padding: 32,
        textAlign: 'center',
        background: 'var(--surface-base, #fafaf9)',
        color: 'var(--text-primary, #1c1917)',
      }}
    >
      <p style={{ fontSize: 18, fontWeight: 500, margin: 0 }}>
        {STRINGS.multiTabLock.forcedReadOnlyTitle}
      </p>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0, maxWidth: 480 }}>
        {STRINGS.multiTabLock.forcedReadOnlyDescription}
      </p>
      <button
        type="button"
        onClick={closeProject}
        style={{
          padding: '8px 16px', fontSize: 14,
          border: '0.5px solid var(--border-default)',
          borderRadius: 'var(--radius-md)',
          background: 'var(--surface-1)',
          color: 'var(--text-primary)', cursor: 'pointer',
        }}
      >{STRINGS.multiTabLock.closeProjectButton}</button>
    </div>
  );
}
