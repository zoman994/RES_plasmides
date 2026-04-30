import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  wipeLegacyV05Storage, _resetMigrationFlagForTests, V06_MIGRATION_FLAG,
} from '../v05-cleanup';
import {
  setItem, getItem, _setFallbackForTests, _resetMemoryStore,
} from '../storage';

describe('K10 — v05-cleanup helper', () => {
  beforeEach(() => {
    _setFallbackForTests(true);
    _resetMemoryStore();
  });
  afterEach(() => {
    _setFallbackForTests(false);
    _resetMemoryStore();
  });

  it('removes legacy pvcs_designer_state key on first run + sets migration flag', () => {
    setItem('pvcs_designer_state', '{"any":"data"}');
    expect(getItem('pvcs_designer_state')).not.toBeNull();
    const did = wipeLegacyV05Storage();
    expect(did).toBe(true);
    expect(getItem('pvcs_designer_state')).toBeNull();
    expect(getItem(V06_MIGRATION_FLAG)).toBe('true');
  });

  it('is a no-op on subsequent runs (returns false)', () => {
    _resetMigrationFlagForTests();
    setItem('pvcs_designer_state', 'x');
    expect(wipeLegacyV05Storage()).toBe(true);
    expect(wipeLegacyV05Storage()).toBe(false);
  });

  it('still sets the flag even if no legacy key was present', () => {
    expect(getItem('pvcs_designer_state')).toBeNull();
    expect(wipeLegacyV05Storage()).toBe(true);
    expect(getItem(V06_MIGRATION_FLAG)).toBe('true');
  });
});
