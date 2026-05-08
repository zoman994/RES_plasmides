/**
 * ContainerWindowPlaceholder — drill-in stub for M-C.1 K4 (DEC-MC1-05).
 *
 * Mounts when `canvas.activeFullscreen === 'containerWindow'`. Reads
 * the targeted entry through `libraryEntries[containerId]` and renders
 * a back chevron + container name + central «M-C.2 — В разработке»
 * message.
 *
 * Real Container Window fullscreen lands in M-C.2. The placeholder
 * exists so M-C.1 can validate stack navigation (push + ← Назад both
 * work) without having to imitate the future UI.
 */
import { useStore } from '../../store';
import { STRINGS } from '../../lib/strings';

const S = STRINGS.dag;

export default function ContainerWindowPlaceholder({ containerId }) {
  const entry = useStore(s => (containerId ? s.libraryEntries?.[containerId] : null));
  const popFullscreen = useStore(s => s.popFullscreen);
  const name = entry?.name
    || (containerId
      ? S.containerWindowFallbackName(containerId.slice(0, 6))
      : S.containerWindowFallbackName(''));

  return (
    <div
      data-testid="container-window-placeholder"
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--surface-base, #fafaf9)',
        minHeight: 0,
      }}
    >
      <div
        style={{
          padding: '10px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          borderBottom: '0.5px solid var(--border-subtle, #e7e5e4)',
          background: 'var(--surface-1, #ffffff)',
        }}
      >
        <button
          type="button"
          data-testid="container-window-placeholder-back"
          onClick={() => popFullscreen()}
          aria-label={S.containerWindowBack}
          title={S.containerWindowBack}
          style={{
            padding: '4px 10px',
            fontSize: 13,
            border: '0.5px solid var(--border-default, #d6d3d1)',
            borderRadius: 'var(--radius-md, 8px)',
            background: 'var(--surface-1, #ffffff)',
            color: 'var(--text-primary, #1c1917)',
            cursor: 'pointer',
          }}
        >{S.containerWindowBack}</button>
        <div
          data-testid="container-window-placeholder-name"
          style={{
            fontSize: 14,
            fontWeight: 500,
            color: 'var(--text-primary, #1c1917)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >{name}</div>
      </div>
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-tertiary, #78716c)',
          fontSize: 14,
          padding: 24,
          textAlign: 'center',
        }}
      >
        <p
          data-testid="container-window-placeholder-msg"
          style={{ margin: 0, maxWidth: 480 }}
        >
          {S.containerWindowMessage}
        </p>
      </div>
    </div>
  );
}
