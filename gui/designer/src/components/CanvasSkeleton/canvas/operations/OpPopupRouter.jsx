/**
 * OpPopupRouter — dispatch на kind-specific popup component.
 *
 * R12-1 (15.05.2026): switch-statement убран, используется
 * `getPopupComponent(kind)` из централного registry.
 */
import { useCallback } from 'react';
import OpPopup from './OpPopup';
import { getPopupComponent } from './op-kinds-registry';
import { Icon } from '../../../icons/Icon';

export default function OpPopupRouter({
  operation,
  position,
  containers = [],
  onCancel,
  onExecute,
}) {
  const handleExecute = useCallback((paramsPatch) => {
    onExecute?.(operation.id, paramsPatch);
  }, [onExecute, operation]);

  const PopupComp = getPopupComponent(operation?.kind);

  const common = {
    operation,
    position,
    containers,
    onCancel,
    onExecute: handleExecute,
  };

  if (PopupComp) {
    return <PopupComp {...common} />;
  }

  return (
    <OpPopup
      operation={operation}
      position={position}
      title={operation?.kind || 'Операция'}
      icon={<Icon name="settings" size={16} />}
      onCancel={onCancel}
      onExecute={() => handleExecute({})}
      executeDisabled
    >
      <div style={{ color: 'var(--text-secondary)' }}>
        Popup для kind <code>{operation?.kind}</code> ещё не реализован.
      </div>
    </OpPopup>
  );
}
