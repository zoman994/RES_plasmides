import { describe, expect, it } from 'vitest';
import { STRINGS } from '../strings';

describe('canvas string dictionary follows the live UI surface', () => {
  it('keeps the DAG namespace equal to the live container-window contract', () => {
    expect(Object.keys(STRINGS.dag).sort()).toEqual([
      'containerWindowBack',
      'containerWindowFallbackName',
      'containerWindowMessage',
    ]);
  });

  it('does not retain labels for retired piece and zone controls', () => {
    const pieces = STRINGS.canvasSkeleton.pieces;
    const zones = STRINGS.canvasSkeleton.zones;

    expect(pieces).not.toHaveProperty('pieceClonedSuffix');
    expect(pieces).not.toHaveProperty('autoNameTemplate');
    expect(pieces).not.toHaveProperty('variantGroup');
    expect(pieces).not.toHaveProperty('hint');
    expect(pieces.contextMenu).not.toHaveProperty('createFromFeature');
    expect(pieces.contextMenu).not.toHaveProperty('createFromNewPrimers');

    for (const retiredKey of [
      'defaultName',
      'openAssembly',
      'emptyZoneHint',
      'crossZoneWarning',
      'contextMenu',
      'headerCounter',
      'crossZoneTooltip',
      'collapsedHint',
      'confirmRemove',
      'moveSuccessToZone',
      'moveSuccessToLoose',
      'sequenceMode',
      'linkBadge',
      'highlighted',
      'lanes',
      'pin',
      'branching',
      'sanger',
    ]) {
      expect(zones).not.toHaveProperty(retiredKey);
    }
  });

  it('does not retain labels for retired popup and importer surfaces', () => {
    for (const retiredKey of [
      'viewLayout',
      'viewGraph',
      'treeTitle',
      'treeGoals',
      'treeMaterials',
      'treePrimers',
      'treeGoalsEmpty',
      'treeMaterialsEmpty',
      'treePrimersEmpty',
      'canvasEmpty',
      'editorEmpty',
      'pillViewOnly',
      'toggleToLinear',
      'toggleToPlasmidMap',
      'opPCR',
      'opRestriction',
      'opMutagenesis',
      'opGibson',
      'pcrPopupTitle',
      'pcrPopupNoSelection',
      'pcrPopupNoPrimers',
      'pcrPopupConfirm',
      'restrictionPopupTitle',
      'restrictionPopupHint',
      'restrictionPopupEnzymeLabel',
      'restrictionPopupPreview',
      'restrictionPopupConfirm',
      'mutagenesisPopupTitle',
      'mutagenesisPopupNoSelection',
      'mutagenesisPopupMethodLabel',
      'mutagenesisPopupReplacementLabel',
      'mutagenesisPopupPreview',
      'mutagenesisPopupConfirm',
      'gibsonPopupTitle',
      'gibsonPopupTooFew',
      'gibsonPopupClassLabel',
      'gibsonPopupOverlapHint',
      'gibsonPopupConfirm',
      'popupCancel',
      'devEntryLabel',
      'devEntryTip',
    ]) {
      expect(STRINGS.canvasSkeleton).not.toHaveProperty(retiredKey);
    }
    expect(STRINGS).not.toHaveProperty('appShell');
    expect(STRINGS).not.toHaveProperty('pwa');
    expect(STRINGS).not.toHaveProperty('library');
    expect(STRINGS).not.toHaveProperty('common');
    expect(STRINGS.placeholder).not.toHaveProperty('emptyProject');
  });
});
