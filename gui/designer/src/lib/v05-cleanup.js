import { getItem, setItem, removeItem } from './storage';

const LEGACY_V05_KEY = 'pvcs_designer_state';
export const V06_MIGRATION_FLAG = 'bodgegene-v06-migration-done';

export function wipeLegacyV05Storage() {
  if (getItem(V06_MIGRATION_FLAG) === 'true') return false;
  if (getItem(LEGACY_V05_KEY) != null) removeItem(LEGACY_V05_KEY);
  setItem(V06_MIGRATION_FLAG, 'true');
  return true;
}

export function _resetMigrationFlagForTests() {
  removeItem(V06_MIGRATION_FLAG);
}
