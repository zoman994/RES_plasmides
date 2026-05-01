import { useCallback, useEffect, useMemo } from 'react';
import { useStore } from '../../store';
import { STRINGS } from '../../lib/strings';
import { useImporterState } from './lib/importer-state';
import { drainImporterFiles } from './lib/pending-files';
import Step1Source from './steps/Step1Source';

const S = STRINGS.importer;

/**
 * Importer fullscreen container (M-B.1 K2).
 *
 * Mounts when canvas.activeFullscreen === 'importer'. Reads `target` from
 * the navStack payload (`'project' | 'library'`). Owns local importer state
 * via useImporterState; nothing persists until Confirm (K6).
 *
 * Step 2 (Combined view) is wired in K5; in K2 only Step 1 (Source) ships.
 * Simple-mode handler ships in K3; in K2 the Next button in Simple mode is
 * a no-op placeholder that surfaces a toast — covered by K3 in two days.
 */
export default function Importer() {
  const navStack = useStore(s => s.canvas.navStack);
  const popFullscreen = useStore(s => s.popFullscreen);
  const importerMode = useStore(s => s.importerMode);
  const setImporterMode = useStore(s => s.setImporterMode);
  const showToast = useStore(s => s.showToast);

  const top = navStack[navStack.length - 1];
  const target = top?.payload?.target === 'library' ? 'library' : 'project';

  const state = useImporterState({ mode: importerMode });

  // Drain any files App-level drag-drop queued for us before routing here.
  useEffect(() => {
    const queued = drainImporterFiles();
    if (queued.length > 0) state.addFiles(queued);
    // state.addFiles is stable (useCallback) but we deliberately run once
    // per mount; opening the Importer again creates a new instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onCancel = useCallback(() => {
    state.reset();
    popFullscreen();
  }, [popFullscreen, state]);

  const onNext = useCallback(() => {
    if (importerMode === 'simple') {
      // K3 wires the real handler; K2 just announces the path.
      showToast('Simple mode handler — K3', 'info');
      return;
    }
    state.goNext();
  }, [importerMode, showToast, state]);

  const headerTitle = useMemo(() => (
    target === 'library' ? S.toLibraryTitle : S.toProjectTitle
  ), [target]);

  return (
    <div
      data-testid="importer-fullscreen"
      data-target={target}
      data-mode={importerMode}
      data-step={state.step}
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        background: 'var(--surface-base, #fafaf9)',
      }}
    >
      <ImporterHeader
        title={headerTitle}
        mode={importerMode}
        step={state.step}
        onModeChange={setImporterMode}
      />
      {state.step === 1 && (
        <Step1Source
          parsedItems={state.parsedItems}
          busy={state.busy}
          error={state.error}
          mode={importerMode}
          target={target}
          onFilesSelected={state.addFiles}
          onNext={onNext}
          onCancel={onCancel}
        />
      )}
      {state.step === 2 && (
        <div
          data-testid="importer-step2-placeholder"
          style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--text-tertiary)', fontSize: 14,
          }}
        >
          Step 2 (Combined view) — K5
        </div>
      )}
    </div>
  );
}

function ImporterHeader({ title, mode, step, onModeChange }) {
  return (
    <div
      data-testid="importer-header"
      style={{
        display: 'flex', alignItems: 'center', gap: 16,
        padding: '12px 18px',
        borderBottom: '0.5px solid var(--border-subtle, #e7e5e4)',
        background: 'var(--surface-1, #fff)',
      }}
    >
      <div
        style={{
          fontSize: 14, fontWeight: 500, color: 'var(--text-primary, #1c1917)',
        }}
      >{title}</div>

      <div
        data-testid="importer-mode-toggle"
        role="tablist"
        style={{
          display: 'inline-flex', borderRadius: 'var(--radius-md, 6px)',
          border: '0.5px solid var(--border-default, #d6d3d1)',
          overflow: 'hidden',
        }}
      >
        {['advanced', 'simple'].map(m => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            data-testid={`importer-mode-${m}`}
            onClick={() => onModeChange(m)}
            style={{
              padding: '4px 12px',
              fontSize: 12,
              border: 'none',
              background: mode === m ? 'var(--accent-50, #fef3c7)' : 'transparent',
              color: mode === m ? 'var(--accent-text, #92400e)' : 'var(--text-secondary)',
              fontWeight: mode === m ? 500 : 400,
              cursor: 'pointer',
            }}
          >
            {m === 'advanced' ? S.modeAdvanced : S.modeSimple}
          </button>
        ))}
      </div>

      <div
        data-testid="importer-stepper"
        style={{
          fontSize: 12, color: 'var(--text-tertiary, #78716c)',
        }}
      >
        {mode === 'simple'
          ? `1/1 · ${S.step1Title}`
          : `${step}/2 · ${step === 1 ? S.step1Title : S.step2Title}`}
      </div>

      <div style={{ flex: 1 }} />

      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', maxWidth: 460 }}>
        {mode === 'advanced' ? S.modeAdvancedHint : S.modeSimpleHint}
      </div>
    </div>
  );
}
