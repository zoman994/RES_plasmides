/**
 * VirtualOutputBadge — small status badge + tooltip for a virtual
 * product container. F4 M-CANVAS-PRODUCT (DEC-CANVAS-PROD-04).
 */
import { Icon } from '../../icons/Icon';

const ICON = { incomplete: 'hourglass', disconnected: 'warning', valid: 'check' };

export default function VirtualOutputBadge({ virtualState, warnings = [] }) {
  if (!virtualState) return null;
  const tip = warnings.length > 0
    ? warnings.join(' · ')
    : (virtualState === 'valid' ? 'Предпросмотр продукта (до OP_EXECUTE)' : '');
  return (
    <div
      data-testid="virtual-output-badge"
      data-virtual-state={virtualState}
      title={tip}
      style={{
        position: 'absolute',
        top: -10,
        right: -10,
        minWidth: 18,
        height: 18,
        padding: '0 4px',
        borderRadius: 9,
        background: virtualState === 'disconnected'
          ? 'var(--accent-500, #b85c3e)'
          : 'var(--surface-1)',
        color: virtualState === 'disconnected' ? '#fff' : 'var(--text-secondary)',
        border: '1px solid var(--border-subtle)',
        fontSize: 11,
        lineHeight: '16px',
        textAlign: 'center',
        boxShadow: '0 1px 3px rgba(28,25,23,0.18)',
        zIndex: 6,
        pointerEvents: 'auto',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {ICON[virtualState]
        ? <Icon name={ICON[virtualState]} size={13} aria-hidden="true" />
        : '•'}
    </div>
  );
}
