import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { v7 as uuidv7 } from 'uuid';
import { useStore } from '../../store';
import { STRINGS } from '../../lib/strings';
import { useImporterState } from './lib/importer-state';
import { drainImporterFiles } from './lib/pending-files';
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
export default function Importer() {
  const navStack = useStore(s => s.canvas.navStack);
  const popFullscreen = useStore(s => s.popFullscreen);
  const showToast = useStore(s => s.showToast);

  const top = navStack[navStack.length - 1];
  const target = top?.payload?.target === 'library' ? 'library' : 'project';

  // Importer is always in advanced mode now (M-B.2 follow-up: Игорь dropped
  // simple/advanced toggle — single-screen with catalog/inspector/meta is
  // the canonical flow; «не делать аннотацию» сохраняется через autoAnnotate
  // checkbox в overflow-menu).
  const state = useImporterState({ mode: 'advanced' });
  const [busyConfirm, setBusyConfirm] = useState(false);
  const [autonamePrompt, setAutonamePrompt] = useState(null);
  const [primerWizard, setPrimerWizard] = useState(null);

  // Drain any files App-level drag-drop queued for us before routing here.
  useEffect(() => {
    const queued = drainImporterFiles();
    if (queued.length > 0) state.addFiles(queued);
    // navStack payload may carry an openCatalogSource hint (e.g. the
    // StartScreen «Library» link drops biolog straight into «Моя
    // библиотека» drilldown). Apply once on mount so the catalog tree
    // shows the requested group expanded by default.
    const initialSrc = top?.payload?.openCatalogSource;
    if (initialSrc && initialSrc.kind) state.setActiveSource(initialSrc);
    // state.addFiles / setActiveSource are stable (useCallback) but we
    // deliberately run once per mount; opening the Importer again
    // creates a new instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onCancel = useCallback(() => {
    state.reset();
    popFullscreen();
  }, [popFullscreen, state]);

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
        const finalTags = Array.isArray(edits.editedTags) ? edits.editedTags : [];
        const buildOpts = { tags: finalTags };
        if (replaceExisting && collision) buildOpts.id = collision.id;
        const entry = buildLibraryEntry(itemForBuild, finalName, resourceHash, buildOpts);
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
        showToast(S.confirmSkipped(skipped.length), 'warning');
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
  }, [currentItem, runConfirm, showToast, state]);

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
      data-mode="advanced"
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
        filesCount={items.length}
        onCancel={onCancel}
      />

      {/* Single-screen body: Catalog | Inspector | Meta */}
      <div
        data-testid="importer-body"
        style={{
          flex: 1, display: 'flex', minHeight: 0,
          // overflow: hidden bounds child columns (CatalogColumn /
          // Inspector / MetaColumn) so each can host its own scroll
          // region. Without it, scrolling the catalog drags the right
          // panes upward with the body.
          overflow: 'hidden',
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
            flex: 1, display: 'flex', flexDirection: 'column',
            minWidth: 0, minHeight: 0,
            // Same anchor as catalog: tab content scrolls inside the
            // pane, not against the body.
            overflow: 'hidden',
            background: 'var(--surface-1, #fff)',
          }}
        >
          {!hasAny && (
            <EmptyInspector
              target={target}
              libraryEmpty={target === 'library' && Object.values(useStore.getState().libraryEntries || {}).filter(e => e && e.kind === 'container' && e._pendingDelete !== true).length === 0}
            />
          )}
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
              isCatalogSource={currentItem?._source === 'catalog'}
              hasCurrentProject={!!useStore.getState().currentProjectId}
              busyConfirm={busyConfirm}
              target={target}
              autoAnnotate={flags.autoAnnotate !== false}
              onToggleAutoAnnotate={(next) => fileName && state.updateFlags(fileName, { autoAnnotate: next })}
            />
          )}
        </div>
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

    </div>
  );
}

function ImporterHeader({ title, filesCount, onCancel }) {
  return (
    <div
      data-testid="importer-header"
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '10px 16px',
        background: 'var(--surface-1, #fff)',
      }}
    >
      <button
        type="button"
        data-testid="importer-cancel"
        onClick={onCancel}
        aria-label={S.backButtonAria}
        title={S.backButtonAria}
        style={{
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          padding: '4px 10px',
          fontSize: 18, lineHeight: 1,
          color: 'var(--text-primary, #1c1917)',
          borderRadius: 'var(--radius-md, 6px)',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-2, #f5f5f4)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
      >‹</button>
      <div
        style={{
          fontSize: 14, fontWeight: 500, color: 'var(--text-primary, #1c1917)',
        }}
      >{title}</div>

      {filesCount > 0 && (
        <div
          data-testid="importer-files-count"
          style={{ fontSize: 12, color: 'var(--text-tertiary, #78716c)' }}
        >{S.filesReady(filesCount)}</div>
      )}

      <div style={{ flex: 1 }} />
    </div>
  );
}
