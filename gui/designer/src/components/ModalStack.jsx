/**
 * ModalStack.jsx — All 14 root-level modals/wizards/overlays for App.
 *
 * Extracted from App.jsx (Sprint App-Decomp K1, 28.04.2026).
 * Reads modal trigger states directly from store; receives App-local handlers
 * (from useFragmentHandlers + derived `circular`) via props.
 */
import { useStore, useFragments } from '../store/index';

import AddFragmentModal from './AddFragmentModal';
import MutagenesisWizard from './MutagenesisWizard';
import ReplacePicker from './ReplacePicker';
import TagFusionPicker from './TagFusionPicker';
import FragmentSplitter from './FragmentSplitter';
import FragmentEditor from './FragmentEditor';
import PartsLibrary from './PartsLibrary';
import PlasmidViewer from './PlasmidViewer';
import PlasmidUseWizard from './PlasmidUseWizard';
import ImportStartScreen from './ImportStartScreen';
import PlasmidVersionTree from './PlasmidVersionTree';
import OligoManager from './OligoManager';
import DataManager from './DataManager';

export default function ModalStack({
  addCustomFragment,
  handleFragmentSplit,
  handleSaveFragment,
  handleSaveAsVariant,
  handleMutagenesis,
  handleCreateMutagenesisAssembly,
  circular,
}) {
  // ═══ Store state needed by modals ═══
  const fragments = useFragments();
  const parts = useStore(s => s.parts);
  const projectName = useStore(s => s.projectName);
  const assemblies = useStore(s => s.assemblies);
  const modalMode = useStore(s => s.modalMode);
  const splitTarget = useStore(s => s.splitTarget);
  const showMutagenesis = useStore(s => s.showMutagenesis);
  const mutagenesisTarget = useStore(s => s.mutagenesisTarget);
  const replacingFragment = useStore(s => s.replacingFragment);
  const tagFusionTarget = useStore(s => s.tagFusionTarget);
  const showOligos = useStore(s => s.showOligos);
  const importStartOpen = useStore(s => s.importStartOpen);
  const importStartFiles = useStore(s => s.importStartFiles);
  const importStartCatalogMode = useStore(s => s.importStartCatalogMode);
  const showPartsLib = useStore(s => s.showPartsLib);
  const partsLibPartId = useStore(s => s.partsLibPartId);
  const viewerPart = useStore(s => s.viewerPart);
  const wizardPlasmid = useStore(s => s.wizardPlasmid);
  const wizardPresetMode = useStore(s => s.wizardPresetMode);
  const mutagenesisInitialPlasmid = useStore(s => s.mutagenesisInitialPlasmid);
  const versionTreePartId = useStore(s => s.versionTreePartId);
  const globalCDSPart = useStore(s => s.globalCDSPart);
  const editTarget = useStore(s => s.editTarget);
  const showDataMgr = useStore(s => s.showDataMgr);

  // ═══ Store actions/setters used by modals ═══
  const {
    addFragment, updateActive, updatePart,
    setModalMode, setShowMutagenesis, setShowOligos, setShowPartsLib,
    setShowDataMgr, setGlobalCDSPart, setEditTarget, setSplitTarget,
  } = useStore.getState();

  return (
    <>
      {modalMode && (
        <AddFragmentModal mode={modalMode} onAdd={addCustomFragment} onClose={() => setModalMode(null)} />
      )}
      {(showMutagenesis || mutagenesisTarget !== null) && (
        <MutagenesisWizard
          template={mutagenesisTarget !== null ? fragments[mutagenesisTarget] : undefined}
          initialTemplateSeq={mutagenesisInitialPlasmid?.sequence}
          initialTemplateName={mutagenesisInitialPlasmid?.name}
          initialOrganism={mutagenesisInitialPlasmid?.organism}
          initialCdsStart={mutagenesisInitialPlasmid ? 0 : undefined}
          initialCdsEnd={mutagenesisInitialPlasmid ? (mutagenesisInitialPlasmid.sequence?.length || 0) : undefined}
          onComplete={handleMutagenesis}
          onClose={() => {
            setShowMutagenesis(false);
            useStore.getState().setMutagenesisTarget(null);
            useStore.getState().setMutagenesisInitialPlasmid(null);
          }}
        />
      )}
      {replacingFragment && (
        <ReplacePicker
          fragmentIndex={replacingFragment.index}
          fragmentType={replacingFragment.type}
          onClose={() => useStore.getState().setReplacingFragment(null)}
        />
      )}
      {tagFusionTarget !== null && fragments[tagFusionTarget] && (
        <TagFusionPicker
          fragmentIndex={tagFusionTarget}
          fragment={fragments[tagFusionTarget]}
          onClose={() => useStore.getState().setTagFusionTarget(null)}
        />
      )}
      {splitTarget !== null && fragments[splitTarget] && (
        <FragmentSplitter fragment={fragments[splitTarget]} onSplit={handleFragmentSplit}
          onClose={() => setSplitTarget(null)} partsLibrary={parts} />
      )}
      {editTarget !== null && fragments[editTarget] && (
        <FragmentEditor
          fragment={fragments[editTarget]}
          onSave={handleSaveFragment}
          onClose={() => setEditTarget(null)}
          onColorChange={(color) => {
            updateActive({
              fragments: fragments.map((f, i) => i === editTarget ? { ...f, customColor: color } : f),
            });
          }}
          onSavePart={handleSaveAsVariant}
          onCreateAssembly={(idx) => handleCreateMutagenesisAssembly(idx)}
          assemblyCircular={circular}
        />
      )}
      {showPartsLib && (
        <PartsLibrary parts={parts} onClose={() => { setShowPartsLib(false); useStore.getState().setPartsLibPartId(null); }}
          onOpenCDSEditor={(part) => { setGlobalCDSPart(part); setShowPartsLib(false); }}
          onAddToCanvas={(part) => addFragment(part)}
          onUpdatePart={(id, data) => updatePart(id, data)}
          preSelectPartId={partsLibPartId} />
      )}
      {viewerPart && (
        <PlasmidViewer part={viewerPart}
          onClose={() => useStore.getState().setViewerPart(null)}
          onOpenWizard={(part) => {
            useStore.getState().setViewerPart(null);
            useStore.getState().setWizardPlasmid(part);
          }}
          /* Bug-rush #25: persist annotation edits/deletes from inside
             the viewer back into the parts library. Re-seed
             `viewerPart` with the new annotations so the modal updates
             without remount (ann list / map / sequence colours all
             refresh) and the rest of the app — palette, canvas, etc.
             — sees the canonical part via the store. */
          onAnnotationsChange={(next) => {
            updatePart(viewerPart.id, { annotations: next });
            useStore.getState().setViewerPart({ ...viewerPart, annotations: next });
          }}
        />
      )}
      {wizardPlasmid && (
        <PlasmidUseWizard plasmid={wizardPlasmid} presetMode={wizardPresetMode}
          onClose={() => { useStore.getState().setWizardPlasmid(null); useStore.getState().setWizardPresetMode(null); }} />
      )}
      <ImportStartScreen
        open={importStartOpen}
        onClose={() => useStore.getState().closeImportStartScreen()}
        presetFiles={importStartFiles || undefined}
        catalogExpandedInitial={importStartCatalogMode}
      />
      {versionTreePartId && (
        <PlasmidVersionTree partId={versionTreePartId}
          onClose={() => useStore.getState().setVersionTreePartId(null)}
          onViewPart={(p) => { useStore.getState().setVersionTreePartId(null); useStore.getState().setViewerPart(p); }} />
      )}
      {globalCDSPart && (
        <FragmentEditor
          fragment={globalCDSPart}
          onSave={(updated) => {
            updatePart(globalCDSPart.id, updated);
            const idx = fragments.findIndex(f => f.id === globalCDSPart.id || f.name === globalCDSPart.name);
            if (idx >= 0) updateActive({ fragments: fragments.map((f, i) => i === idx ? updated : f), calculated: false, primers: [] });
            setGlobalCDSPart(null);
          }}
          onClose={() => setGlobalCDSPart(null)}
          onColorChange={(color) => {
            const idx = fragments.findIndex(f => f.id === globalCDSPart.id || f.name === globalCDSPart.name);
            if (idx >= 0) updateActive({ fragments: fragments.map((f, i) => i === idx ? { ...f, customColor: color } : f) });
          }}
          assemblyCircular={globalCDSPart.topology === 'circular'}
        />
      )}
      {showDataMgr && (
        <DataManager onClose={() => setShowDataMgr(false)} parts={parts} projectName={projectName} />
      )}
      {showOligos && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-12 bg-black/30"
          onClick={() => setShowOligos(false)}>
          <div className="w-[900px] max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <OligoManager assemblies={assemblies} onClose={() => setShowOligos(false)} />
          </div>
        </div>
      )}
    </>
  );
}
