import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { createProjectSlice, selectIsDirty } from './projectSlice';
import { createCanvasSlice } from './canvasSlice';
import { createUiSlice, applyThemeToDOM } from './uiSlice';
import { removeItem as lsRemove, getItem as lsGet, setItem as lsSet } from '../lib/storage';

const LEGACY_V05_KEY = 'pvcs_designer_state';
const V06_MIGRATION_FLAG = 'bodgegene-v06-migration-done';

export function wipeLegacyV05Storage() {
  if (lsGet(V06_MIGRATION_FLAG) === 'true') return false;
  if (lsGet(LEGACY_V05_KEY) != null) lsRemove(LEGACY_V05_KEY);
  lsSet(V06_MIGRATION_FLAG, 'true');
  return true;
}

const stateCreator = (set, get) => ({
  ...createProjectSlice(set, get),
  ...createCanvasSlice(set, get),
  ...createUiSlice(set, get),
});

export const useStore = create(immer(stateCreator));

export { selectIsDirty, applyThemeToDOM };

export function bootstrapStore({ wipe = true } = {}) {
  if (wipe) wipeLegacyV05Storage();
  applyThemeToDOM(useStore.getState().theme);
}
