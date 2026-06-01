import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { createProjectSlice, selectIsDirty } from './projectSlice';
import { createCanvasSlice } from './canvasSlice';
import { createUiSlice, applyThemeToDOM } from './uiSlice';
import { createLibrarySlice, selectVisibleLibraryEntries, selectAllLibraryTags } from './librarySlice';
import { createPrimerSlice, selectPrimerPool } from './primerSlice';
import { createWorkspaceSlice, selectActiveWorkspace, selectIsInLibrary, selectCanGoBack } from './workspaceSlice';
import { createCommonFeaturesSlice, selectMergedCommonFeatures } from './commonFeaturesSlice';
import { wipeLegacyV05Storage } from '../lib/v05-cleanup';

export { wipeLegacyV05Storage };
export { selectVisibleLibraryEntries, selectAllLibraryTags };
export { selectPrimerPool };
export { selectActiveWorkspace, selectIsInLibrary, selectCanGoBack };
export { selectMergedCommonFeatures };

const stateCreator = (set, get) => ({
  ...createProjectSlice(set, get),
  ...createCanvasSlice(set, get),
  ...createUiSlice(set, get),
  ...createLibrarySlice(set, get),
  ...createPrimerSlice(set, get),
  ...createWorkspaceSlice(set, get),
  ...createCommonFeaturesSlice(set, get),
});

export const useStore = create(immer(stateCreator));

export { selectIsDirty, applyThemeToDOM };

export function bootstrapStore({ wipe = true } = {}) {
  if (wipe) wipeLegacyV05Storage();
  applyThemeToDOM(useStore.getState().theme);
}
