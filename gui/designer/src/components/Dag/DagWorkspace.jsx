/**
 * DagWorkspace — composition root for the DAG fullscreen (M-C.1 K4).
 *
 * Hosts the three K2/K3 pieces in a horizontal split:
 *
 *   ┌─────────────┬─────────────┬───────────────────────────┐
 *   │ DagPalette  │  Preview    │   DagCanvas (ReactFlow)   │
 *   │ 280 px      │  Drawer     │   1fr                     │
 *   │             │  340 px     │                           │
 *   │             │  (when      │                           │
 *   │             │   open)     │                           │
 *   └─────────────┴─────────────┴───────────────────────────┘
 *
 * State machine:
 *   • Click on a palette row → setPreviewEntry(entry).
 *   • Esc / drawer «Закрыть» / drag-start in palette → setPreviewEntry(null).
 *   • Drawer «Добавить на canvas» → addContainerToCurrentProject(id, viewportCentre)
 *     + setPreviewEntry(null). Spec §9 Q2 — viewport centre fallback when
 *     biolog uses the drawer button instead of dragging.
 */
import { useCallback, useState } from 'react';
import { useStore } from '../../store';
import DagCanvas from './DagCanvas';
import DagPalette from './Palette/DagPalette';
import PreviewDrawer from './PreviewDrawer';

export default function DagWorkspace() {
  const [previewEntry, setPreviewEntry] = useState(null);
  const addContainerToCurrentProject = useStore(s => s.addContainerToCurrentProject);
  const showToast = useStore(s => s.showToast);

  const onPreview = useCallback((entry) => setPreviewEntry(entry), []);
  const onClosePreview = useCallback(() => setPreviewEntry(null), []);

  // «Добавить на canvas» from the drawer — drop in the centre of the
  // current viewport. We can't read ReactFlow's viewport here without
  // its provider context, so just pass a null position; the slice
  // accepts a missing position and the auto-layout button can tidy
  // afterwards. M-D follow-up could thread an imperative handle from
  // DagCanvas up to here for the precise viewport centre.
  const onAddToCanvas = useCallback((entry) => {
    if (!entry?.id) return;
    const projectId = useStore.getState().currentProjectId;
    const proj = projectId ? useStore.getState().projects[projectId] : null;
    const alreadyOn = proj?.containerIds?.includes(entry.id);
    if (alreadyOn) {
      showToast?.('Уже добавлено', 'info');
      setPreviewEntry(null);
      return;
    }
    addContainerToCurrentProject(entry.id);
    setPreviewEntry(null);
  }, [addContainerToCurrentProject, showToast]);

  return (
    <div
      data-testid="dag-workspace"
      style={{
        flex: 1,
        display: 'flex',
        minHeight: 0,
      }}
    >
      <DagPalette onPreview={onPreview} />
      {previewEntry && (
        <PreviewDrawer
          entry={previewEntry}
          onClose={onClosePreview}
          onAddToCanvas={onAddToCanvas}
        />
      )}
      <DagCanvas />
    </div>
  );
}
