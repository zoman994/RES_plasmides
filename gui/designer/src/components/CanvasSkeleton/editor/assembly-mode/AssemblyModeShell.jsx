/**
 * AssemblyModeShell — assembly-draft editor content inside the F1
 * editor window (A2 / G2 DEC-CANVAS-ASM-13). Thin orchestrator over the
 * SHARED Library SequenceTab (same reuse philosophy as PcrModeShell
 * after V71): coloured segment zones + drag-insert + segment list +
 * selection-driven primer writing — no bespoke viewer.
 *
 * K2: skeleton mount + draft resolution + "removed" guard.
 * K3+: header / sidebar / segment list / primers fill in.
 */
import AssemblyShellBody from './AssemblyShellBody';
import { useAssemblyTarget } from '../../store/skeleton-context';

export default function AssemblyModeShell({ draftId }) {
  // T6 K7 — `draftId` is now a target id: a zone id resolves to a
  // pieces-shaped draft-like (zoneMode); a legacy assemblyDrafts id
  // still resolves during the transition window (R-T6-4).
  const { draft, zoneMode } = useAssemblyTarget(draftId);

  if (!draft) {
    return (
      <div
        data-testid="assembly-mode-shell"
        data-draft-id={draftId || ''}
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-secondary)',
          fontSize: 13,
          background: 'var(--surface-1)',
        }}
      >
        Сборка удалена
      </div>
    );
  }

  return <AssemblyShellBody draft={draft} zoneMode={zoneMode} />;
}
