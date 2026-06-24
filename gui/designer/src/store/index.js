import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { createProjectSlice, selectIsDirty } from './projectSlice';
import { createCanvasSlice } from './canvasSlice';
import { createUiSlice, applyThemeToDOM } from './uiSlice';
import { createLibrarySlice, selectVisibleLibraryEntries, selectAllLibraryTags } from './librarySlice';
import { createPrimerSlice, selectPrimerPool } from './primerSlice';
import { createWorkspaceSlice, selectActiveWorkspace, selectIsInLibrary, selectCanGoBack } from './workspaceSlice';
import { createCommonFeaturesSlice, selectMergedCommonFeatures } from './commonFeaturesSlice';
import {
  createCustomEnzymesSlice,
  selectMergedREEnzymes,
  selectAllEnzymeSets,
  selectCustomEnzymes,
} from './customEnzymesSlice';
import { createRestrictionViewSlice, selectActiveSetEnzymes } from './restrictionViewSlice';
import { createAlignmentSlice, selectAlignment } from './alignmentSlice';
import { createProjectAssembliesSlice, selectActiveProjectAssemblies } from './projectAssembliesSlice';
import { wipeLegacyV05Storage } from '../lib/v05-cleanup';

export { wipeLegacyV05Storage };
export { selectVisibleLibraryEntries, selectAllLibraryTags };
export { selectPrimerPool };
export { selectActiveWorkspace, selectIsInLibrary, selectCanGoBack };
export { selectMergedCommonFeatures };
export { selectMergedREEnzymes, selectAllEnzymeSets, selectCustomEnzymes };
export { selectActiveSetEnzymes };
export { selectAlignment };
export { selectActiveProjectAssemblies };

const stateCreator = (set, get) => ({
  ...createProjectSlice(set, get),
  ...createCanvasSlice(set, get),
  ...createUiSlice(set, get),
  ...createLibrarySlice(set, get),
  ...createPrimerSlice(set, get),
  ...createWorkspaceSlice(set, get),
  ...createCommonFeaturesSlice(set, get),
  ...createCustomEnzymesSlice(set, get),
  ...createRestrictionViewSlice(set, get),
  ...createAlignmentSlice(set, get),
  ...createProjectAssembliesSlice(set, get),
});

export const useStore = create(immer(stateCreator));

export { selectIsDirty, applyThemeToDOM };

export function bootstrapStore({ wipe = true } = {}) {
  if (wipe) wipeLegacyV05Storage();
  applyThemeToDOM(useStore.getState().theme);
}
