import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { v7 as uuidv7 } from 'uuid';
import { useStore } from '../../store';
import { STRINGS } from '../../lib/strings';
import { useImporterState } from './lib/importer-state';
import { drainImporterFiles } from './lib/pending-files';
import { handleSimpleImport } from './lib/simple-import';
import { buildLibraryEntry } from './lib/build-library-entry';
import { computeResourceHash } from './lib/resource-hash';
import { enrichAnnotations } from '../../file-import';
import { exportGenBank } from '../../exports';
import { getRegions } from '../../annotation-model';
import AutonameModal from './modals/AutonameModal';
import PrimerWizardStepModal from './modals/PrimerWizardStepModal';
import CatalogColumn from './catalog/CatalogColumn';
import SingleInspector from './inspector/SingleInspector';
import MultiInspector from './inspector/MultiInspector';
import EmptyInspector from './inspector/EmptyInspector';
import MetaColumn from './inspector/MetaColumn';
import ActionsBar from './inspector/ActionsBar';
import SessionSummary from './inspector/SessionSummary';

const S = STRINGS.importer;

const SIMPLE_FLASH_MS = 1000;

/**
 * Importer fullscreen container (M-B.2 K1 single-screen rewrite).
 *
 * Mounts when canvas.activeFullscreen === 'importer'. Reads `target` from
 * the navStack payload (`'project' | 'library'`). Owns local importer state
 * via useImporterState; nothing persists until Confirm.
 *
 * Layout:
 *   [Header — title · mode toggle]
 *   [CatalogColumn 320px | Inspector flex | MetaColumn 200px]
 *   [SessionSummary + ActionsBar footer]
 *   [AutonameModal / PrimerWizardStepModal / SimpleFlashOverlay overlays]
 *
 * Step 1 → Step 2 flow is gone (M-B.1 spec said «two steps», review found
 * misalignment with v0.5 single-screen ref + V49 50-sec hang from default
 * heavy-tab mount). Расширенные виды живут табами внутри Inspector с lazy
 * mount (K4 SequenceTab + AnnotationsTab).
 */
export default function Importer({ flashMs = SIMPLE_FLASH_MS } = {}) {
  const navStack = useStore(s => s.canvas.navStack);
  const popFullscreen = useStore(s => s.popFullscreen);
  const importerMode = useStore(s => s.importerMode);
  const setImporterMode = useStore(s => s.setImporterMode);
  const showToast = useStore(s => s.showToast);

  const top = navStack[navStack.length - 1];
  const target = top?.payload?.target === 'library' ? 'library' : 'project';

  const state = useImporterState({ mode: importerMode });
  const [simpleBusy, setSimpleBusy] = useState(false);
  const [busyConfirm, setBusyConfirm] = useState(false);
  const [flashing, setFlashing] = useState(false);
  const flashTimerRef = useRef(null);
  const [autonamePrompt, setAutonamePrompt] = useState(null);
  const [primerWizard, setPrimerWizard] = useState(null);

  // Drain any files App-level drag-drop queued for us before routing here.
  useEffect(() => {
    const queued = drainImporterFiles();
    if (queued.length > 0) state.addFiles(queued);
    // state.addFiles is stable (useCallback) but we deliberately run once
    // per mount; opening the Importer again creates a new instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => {
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
  }, []);

  const onCancel = useCallback(() => {
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    state.reset();
    popFullscreen();
  }, [popFullscreen, state]);

  const runSimpleImport = useCallback(async () => {
    setSimpleBusy(true);
    try {
      const store = useStore.getState();
      const result = await handleSimpleImport({
        parsedItems: state.parsedItems,
        target,
        currentProjectId: store.currentProjectId,
        store,
      });
      const inProject = target === 'project' && !!store.currentProjectId;
      if (result.added.length === 1) {
        const a = result.added[0];
        if (a._wasCollision) {
          showToast(S.simpleAddedRenamedOne(a._baseName, a.name), 'success');
        } else if (inProject) {
          showToast(S.simpleAddedOneToProject(a.name), 'success');
        } else {
          showToast(S.simpleAddedOne(a.name), 'success');
        }
      } else if (result.added.length > 1) {
        showToast(
          inProject ? S.simpleAddedManyToProject(result.added.length) : S.simpleAddedMany(result.added.length),
          'success',
        );
      }
      if (result.skipped.length > 0) {
        showToast(S.simpleSkipped(result.skipped.length), 'warning');
      }
      setFlashing(true);
      flashTimerRef.current = setTimeout(() => {
        flashTimerRef.current = null;
        setFlashing(false);
        state.reset();
        popFullscreen();
      }, flashMs);
    } catch (err) {
      showToast(S.simpleFailed(err?.message || String(err)), 'error');
    } finally {
      setSimpleBusy(false);
    }
  }, [flashMs, popFullscreen, showToast, state, target]);

  const askAutoname = useCallback((info) => new Promise((resolve) => {
    setAutonamePrompt({
      ...info,
      resolve: (action) => { setAutonamePrompt(null); resolve(action); },
    });
  }), []);

  const askPrimerWizard = useCallback((info) => new Promise((resolve) => {
    setPrimerWizard({
      ...info,
      resolve: (selected) => { setPrimerWizard(null); resolve(selected); },
    });
  }), []);

  /**
   * Confirm flow (kept from M-B.1 K6, called from ActionsBar via target):
   *   for each parsed item:
   *     hash → checkLibraryDedup → if collision: AutonameModal
   *     buildLibraryEntry → addLibraryEntry
   *     if target=project: addContainerToCurrentProject
   *   then: aggregate _metadata.primers across items → PrimerWizardStepModal
   *   addPrimerToPool × selected
   *   toast + reset + popFullscreen
   */
  const runConfirm = useCallback(async (confirmTarget = target) => {
    setBusyConfirm(true);
    try {
      const store = useStore.getState();
      const items = state.parsedItems;
      const added = [];
      const skipped = [];
      let replaced = 0;

      for (const it of items) {
        if (!it || it._error || !it.sequence) {
          if (it) skipped.push({ fileName: it._fileName, reason: it._error || 'no-sequence' });
          continue;
        }
        const fn = it._fileName;
        const edits = state.perFileEdits[fn] || {};
        const flags = state.perFileFlags[fn] || {};
        const finalSeq = edits.editedSequence ?? it.sequence;
        const finalAnns = Array.isArray(edits.editedAnnotations)
          ? edits.editedAnnotations
          : (flags.autoAnnotate && Array.isArray(edits.enrichedCache))
            ? edits.enrichedCache
            : (it.annotations || []);
        const baseName = edits.editedName || it.name || (fn ? fn.replace(/\.[^.]+$/, '') : 'imported');
        let resourceHash = null;
        try {
          resourceHash = await computeResourceHash({
            sequence: finalSeq, topology: it.topology, ends: it.ends,
          });
        } catch { /* leave null */ }

        const collision = resourceHash ? await store.checkLibraryDedup(resourceHash) : null;
        let finalName = store.getSuggestedLibraryName(baseName);
        let replaceExisting = false;

        if (collision) {
          const action = await askAutoname({
            baseName,
            suggested: finalName,
            existing: collision,
          });
          if (!action || action.kind === 'skip') {
            skipped.push({ fileName: fn, reason: 'user-skip' });
            continue;
          }
          if (action.kind === 'replace') {
            replaceExisting = true;
            finalName = collision.name;
          } else {
            finalName = action.name || finalName;
          }
        }

        const itemForBuild = { ...it, sequence: finalSeq, annotations: finalAnns, _fileName: fn };
        const entry = buildLibraryEntry(
          itemForBuild,
          finalName,
          resourceHash,
          replaceExisting && collision ? { id: collision.id } : undefined,
        );
        await store.addLibraryEntry(entry);
        if (replaceExisting) replaced += 1;
        if (!replaceExisting && confirmTarget === 'project' && store.currentProjectId
            && typeof store.addContainerToCurrentProject === 'function') {
          store.addContainerToCurrentProject(entry.id);
        }
        added.push({ baseName, name: finalName, replaced: replaceExisting });
        // SessionSummary entry for biolog visibility (footer accumulator).
        state.appendAddedItem({
          name: finalName,
          action: confirmTarget === 'project' ? 'canvas' : 'library',
          miniMapData: {
            length: entry.payload.length,
            topology: entry.payload.topology,
            annotations: entry.payload.annotations,
          },
        });
      }

      // Aggregate primers from .dna metadata across all kept items.
      const primerCandidates = items
        .filter(it => it && !it._error && Array.isArray(it._metadata?.primers))
        .flatMap(it => it._metadata.primers
          .filter(p => p && p.sequence)
          .map(p => ({ ...p, sourceFile: it._fileName })));
      let primersAdded = 0;
      if (primerCandidates.length > 0) {
        const existingNames = new Set(
          Object.values(useStore.getState().primersById || {})
            .map(p => p.name).filter(Boolean),
        );
        const selected = await askPrimerWizard({
          primers: primerCandidates,
          existingNames,
          checkDupe: useStore.getState().checkPrimerDedup,
        });
        const storeNow = useStore.getState();
        const projectId = storeNow.currentProjectId || null;
        for (const p of selected || []) {
          await storeNow.addPrimerToPool({
            primer: { id: p.id || uuidv7(), ...p },
            projectId,
            status: 'imported',
            origin: { kind: 'file_import', sourceFile: p.sourceFile || null },
          });
          primersAdded += 1;
        }
      }

      const inProject = confirmTarget === 'project' && !!useStore.getState().currentProjectId;
      if (added.length === 1) {
        const a = added[0];
        if (a.replaced) showToast(S.confirmReplaced(a.name), 'success');
        else if (inProject) showToast(S.confirmAddedOneToProject(a.name), 'success');
        else showToast(S.confirmAddedOne(a.name), 'success');
      } else if (added.length > 1) {
        showToast(
          inProject ? S.confirmAddedManyToProject(added.length) : S.confirmAddedMany(added.length),
          'success',
        );
      }
      if (replaced > 0 && added.length > 1) {
        showToast(S.confirmReplaced(`${replaced}`), 'success');
      }
      if (primersAdded > 0) {
        showToast(S.confirmPrimersAdded(primersAdded), 'success');
      }
      if (skipped.length > 0) {
        showToast(S.simpleSkipped(skipped.length), 'warning');
      }

      // For multi-mode batch: keep biolog in the screen so they can see the
      // SessionSummary update; for single, close out.
      if (state.parsedItems.length === 1 && added.length > 0) {
        state.removeFile(state.parsedItems[0]._fileName);
      } else if (added.length > 0) {
        state.reset();
        popFullscreen();
      }
    } catch (err) {
      showToast(S.confirmFailed(err?.message || String(err)), 'error');
    } finally {
      setBusyConfirm(false);
    }
  }, [askAutoname, askPrimerWizard, popFullscreen, showToast, state, target]);

  const headerTitle = useMemo(() => (
    target === 'library' ? S.toLibraryTitle : S.toProjectTitle
  ), [target]);

  const items = state.parsedItems;
  const idx = Math.min(state.currentIdx, Math.max(0, items.length - 1));
  const currentItem = items[idx];
  const fileName = currentItem?._fileName || null;
  const flags = (fileName && state.perFileFlags[fileName]) || { autoAnnotate: true };
  const edits = (fileName && state.perFileEdits[fileName]) || {};

  // ActionsBar handler — single-mode actions; multi handled inside MultiInspector.
  const onAction = useCallback(async (actionId) => {
    if (importerMode === 'simple' && (actionId === 'canvas' || actionId === 'library')) {
      runSimpleImport();
      return;
    }
    if (actionId === 'canvas') {
      await runConfirm('project');
    } else if (actionId === 'library' || actionId === 'library-batch') {
      await runConfirm('library');
    } else if (actionId === 'annotate' && currentItem) {
      const before = getRegions(currentItem.annotations || []).length;
      try {
        const enriched = await enrichAnnotations(currentItem, { autoAnnotate: true });
        const after = getRegions(enriched.annotations || []).length;
        state.updateEdits(currentItem._fileName, {
          editedAnnotations: enriched.annotations || [],
          enrichedCache: enriched.annotations || [],
        });
        state.appendAddedItem({
          name: currentItem.name || currentItem._fileName,
          action: 'annotate',
          regionsAdded: Math.max(0, after - before),
        });
      } catch (err) {
        showToast(S.confirmFailed(err?.message || String(err)), 'error');
      }
    } else if (actionId === 'download-gb' && currentItem) {
      try {
        const ann = state.perFileEdits[currentItem._fileName]?.editedAnnotations
          ?? currentItem.annotations ?? [];
        const seq = state.perFileEdits[currentItem._fileName]?.editedSequence
          ?? currentItem.sequence ?? '';
        exportGenBank(
          [{
            id: currentItem._fileName || 'imported',
            name: currentItem.name || 'imported',
            type: currentItem.topology === 'circular' ? 'plasmid' : 'misc_feature',
            sequence: seq,
            length: seq.length,
            annotations: ann,
            topology: currentItem.topology || 'linear',
          }],
          currentItem.name || 'imported',
          currentItem.topology === 'circular',
        );
      } catch (err) {
        showToast(S.confirmFailed(err?.message || String(err)), 'error');
      }
    } else if (actionId === 'delete' && currentItem) {
      // eslint-disable-next-line no-alert
      if (typeof window !== 'undefined' && !window.confirm(S.deleteFromSessionConfirm)) return;
      state.removeFile(currentItem._fileName);
    } else if (actionId === 'replace-all') {
      state.reset();
    } else if (actionId === 'delete-all') {
      // eslint-disable-next-line no-alert
      if (typeof window !== 'undefined' && !window.confirm(S.deleteAllConfirm)) return;
      state.reset();
    }
  }, [currentItem, importerMode, runConfirm, runSimpleImport, showToast, state]);

  const onRenameCurrentItem = useCallback((nextName) => {
    if (!currentItem) return;
    state.updateEdits(currentItem._fileName, { editedName: nextName });
    // Also reflect locally on the parsedItem so subtitle/title pick it up
    // immediately. We patch through a state-private setter via a shim:
    // simplest stable path is to rewrite parsedItems via a custom op, but
    // we don't have that yet. Instead piggyback on updateEdits and let the
    // SingleInspector display fall back to edits.editedName when present.
  }, [currentItem, state]);

  const isMulti = items.length > 1;
  const hasAny = items.length > 0;

  return (
    <div
      data-testid="importer-fullscreen"
      data-target={target}
      data-mode={importerMode}
      data-active-tab={state.activeTab}
      style={{
        flex: 1,
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        background: 'var(--surface-base, #fafaf9)',
      }}
    >
      <ImporterHeader
        title={headerTitle}
        mode={importerMode}
        onModeChange={setImporterMode}
        filesCount={items.length}
      />

      {/* Single-screen body: Catalog | Inspector | Meta */}
      <div
        data-testid="importer-body"
        style={{
          flex: 1, display: 'flex', minHeight: 0,
          borderTop: '0.5px solid var(--border-subtle, #e7e5e4)',
        }}
      >
        <CatalogColumn
          activeSource={state.activeSource}
          onActiveSourceChange={state.setActiveSource}
          query={state.catalogQuery}
          onQueryChange={state.setCatalogQuery}
          onSelectItem={(it) => {
            if (isMulti && typeof window !== 'undefined') {
              if (!window.confirm(S.catalogReplaceModeConfirm)) return;
            }
            state.addCatalogItem(it);
          }}
          onFiles={state.addFiles}
          onPasteText={state.addPasteItem}
          busy={state.busy}
        />

        <div
          data-testid="importer-inspector-pane"
          style={{
            flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0,
            background: 'var(--surface-1, #fff)',
          }}
        >
          {!hasAny && <EmptyInspector />}
          {hasAny && !isMulti && currentItem && (
            <SingleInspector
              item={{ ...currentItem, name: edits.editedName ?? currentItem.name }}
              flags={flags}
              edits={edits}
              activeTab={state.activeTab}
              onActiveTabChange={state.setActiveTab}
              onUpdateFlags={(patch) => fileName && state.updateFlags(fileName, patch)}
              onUpdateEdits={(patch) => fileName && state.updateEdits(fileName, patch)}
              onAppendAdded={state.appendAddedItem}
              onRenameItem={onRenameCurrentItem}
            />
          )}
          {isMulti && (
            <MultiInspector
              items={items}
              currentIdx={idx}
              perFileFlags={state.perFileFlags}
              perFileEdits={state.perFileEdits}
              onSelect={state.setCurrentIdx}
              onUpdateFlags={state.updateFlags}
              onUpdateEdits={state.updateEdits}
              onRemove={state.removeFile}
              onAction={onAction}
            />
          )}
        </div>

        {hasAny && !isMulti && currentItem && (
          <MetaColumn
            item={currentItem}
            edits={edits}
            onUpdateEdits={(patch) => fileName && state.updateEdits(fileName, patch)}
          />
        )}
      </div>

      {/* Footer: SessionSummary + ActionsBar */}
      {hasAny && (
        <div
          data-testid="importer-footer"
          style={{
            display: 'flex', flexDirection: 'column',
            borderTop: '0.5px solid var(--border-subtle, #e7e5e4)',
            background: 'var(--surface-1, #fff)',
          }}
        >
          {state.addedItems.length > 0 && (
            <SessionSummary
              addedItems={state.addedItems}
              onOpenCanvas={() => {
                state.reset();
                popFullscreen();
              }}
            />
          )}
          {!isMulti && (
            <ActionsBar
              mode="single"
              onAction={onAction}
              hasParsedItem={!!currentItem?.sequence}
              libraryEnabled={
                currentItem?._source !== 'catalog'
                || !!edits.editedAnnotations
                || !!edits.editedSequence
              }
              busyConfirm={busyConfirm}
              target={target}
            />
          )}
        </div>
      )}

      {(simpleBusy || flashing) && (
        <SimpleFlashOverlay busy={simpleBusy && !flashing} />
      )}
      {autonamePrompt && (
        <AutonameModal
          baseName={autonamePrompt.baseName}
          suggested={autonamePrompt.suggested}
          existing={autonamePrompt.existing}
          onApply={(name) => autonamePrompt.resolve({ kind: 'apply', name })}
          onReplace={() => autonamePrompt.resolve({ kind: 'replace' })}
          onSkip={() => autonamePrompt.resolve({ kind: 'skip' })}
          onCancel={() => autonamePrompt.resolve({ kind: 'skip' })}
        />
      )}
      {primerWizard && (
        <PrimerWizardStepModal
          primers={primerWizard.primers}
          existingNames={primerWizard.existingNames}
          checkDupe={primerWizard.checkDupe}
          onAdd={(selected) => primerWizard.resolve(selected)}
          onSkip={() => primerWizard.resolve([])}
          onCancel={() => primerWizard.resolve([])}
        />
      )}

      {/* Cancel button hosted as a header action — tests need data-testid. */}
      <button
        type="button"
        data-testid="importer-cancel"
        onClick={onCancel}
        aria-label={S.closeAria}
        style={{
          position: 'absolute', top: 8, right: 8,
          width: 28, height: 28,
          border: '0.5px solid var(--border-default)',
          borderRadius: 'var(--radius-md)',
          background: 'var(--surface-1)',
          color: 'var(--text-tertiary)',
          fontSize: 14, lineHeight: 1, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >×</button>
    </div>
  );
}

function SimpleFlashOverlay({ busy }) {
  return (
    <div
      data-testid="importer-simple-flash"
      data-flash-state={busy ? 'busy' : 'done'}
      style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(255,255,255,0.92)',
        zIndex: 50,
      }}
    >
      <div
        style={{
          fontSize: 28, marginBottom: 8,
          color: busy ? 'var(--text-secondary)' : 'var(--accent-text, #92400e)',
        }}
      >{busy ? '⏳' : '✓'}</div>
      <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>
        {busy ? S.simpleBusy : S.simpleFlashTitle}
      </div>
      {!busy && (
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>
          {S.simpleFlashSubtitle}
        </div>
      )}
    </div>
  );
}

function ImporterHeader({ title, mode, onModeChange, filesCount }) {
  return (
    <div
      data-testid="importer-header"
      style={{
        display: 'flex', alignItems: 'center', gap: 16,
        padding: '12px 18px',
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

      {filesCount > 0 && (
        <div
          data-testid="importer-files-count"
          style={{ fontSize: 12, color: 'var(--text-tertiary, #78716c)' }}
        >{S.filesReady(filesCount)}</div>
      )}

      <div style={{ flex: 1 }} />

      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', maxWidth: 460 }}>
        {mode === 'advanced' ? S.modeAdvancedHint : S.modeSimpleHint}
      </div>
    </div>
  );
}
