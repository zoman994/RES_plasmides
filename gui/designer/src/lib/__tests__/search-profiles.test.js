/**
 * search-profiles — declarative per-surface profiles (REV #2 §1A.3). One shell, many
 * profiles: each search surface names a profile, and the profile (not React branches)
 * decides allowed prefixes / providers / scope. `libraryQuick` in particular must NOT
 * silently swallow a bio-provider prefix — it escalates (REQUIRES_FULL_SEARCH).
 */
import { describe, it, expect } from 'vitest';
import {
  SEARCH_PROFILES, getProfile, isPrefixAllowed, profileAllowsProviderIntent, capabilityDiagnostics,
} from '../search-profiles';
import { allCanonicalKeys } from '../search-prefix-registry';
import { classifyQuery } from '../query-classify';

describe('SEARCH_PROFILES — shape + coverage', () => {
  it('defines every obligatory profile (§1A.3)', () => {
    for (const id of [
      'globalLibrary', 'libraryQuick', 'libraryPicker', 'primerPool', 'sequenceWithinEntry',
      'enzymeCatalog', 'featureCatalog', 'simpleNameFilter', 'notebook', 'homology',
    ]) expect(getProfile(id)).toBeTruthy();
  });
  it('every allowedPrefixKey references a real registry canonical', () => {
    const keys = new Set(allCanonicalKeys());
    for (const p of Object.values(SEARCH_PROFILES)) {
      for (const k of p.allowedPrefixKeys) expect(keys.has(k)).toBe(true);
    }
  });
  it('each profile has a uiKind and a selectionMode', () => {
    for (const p of Object.values(SEARCH_PROFILES)) {
      expect(['full', 'scoped', 'fixed', 'local']).toContain(p.uiKind);
      expect(['single', 'multi']).toContain(p.selectionMode);
    }
  });
});

describe('capability — globalLibrary allows everything', () => {
  it('allows every prefix and every provider intent', () => {
    for (const k of allCanonicalKeys()) expect(isPrefixAllowed('globalLibrary', k)).toBe(true);
    for (const intent of ['metadata', 'sequence', 'protein', 'enzymeCatalog', 'restrictionSites']) {
      expect(profileAllowsProviderIntent('globalLibrary', intent)).toBe(true);
    }
  });
});

describe('capability — libraryQuick is metadata-only (§1A.3)', () => {
  it('allows metadata prefixes, rejects bio-provider prefixes', () => {
    for (const k of ['name', 'tag', 'feature', 'type', 'status', 'in', 'mol']) {
      expect(isPrefixAllowed('libraryQuick', k)).toBe(true);
    }
    for (const k of ['seq', 'aa', 'enz', 'cut']) expect(isPrefixAllowed('libraryQuick', k)).toBe(false);
  });
  it('does not allow non-metadata provider intents', () => {
    expect(profileAllowsProviderIntent('libraryQuick', 'metadata')).toBe(true);
    for (const intent of ['sequence', 'protein', 'enzymeCatalog', 'restrictionSites']) {
      expect(profileAllowsProviderIntent('libraryQuick', intent)).toBe(false);
    }
  });
  it('a seq:/aa:/cut: plan under libraryQuick → REQUIRES_FULL_SEARCH diagnostic (never match-all)', () => {
    for (const q of ['seq:GAATTC', 'aa:HXHH', 'cut:EcoRI', 're:EcoRI']) {
      const diags = capabilityDiagnostics(classifyQuery(q), 'libraryQuick');
      expect(diags.some((d) => d.code === 'REQUIRES_FULL_SEARCH')).toBe(true);
    }
  });
  it('a plain metadata plan under libraryQuick has NO capability diagnostic', () => {
    expect(capabilityDiagnostics(classifyQuery('pUC19'), 'libraryQuick')).toEqual([]);
    expect(capabilityDiagnostics(classifyQuery('tag:gfp'), 'libraryQuick')).toEqual([]);
  });
});

describe('capability — fixed-domain profiles do not require typing a prefix', () => {
  it('sequenceWithinEntry / enzymeCatalog carry a fixedIntent and no mode selector', () => {
    expect(getProfile('sequenceWithinEntry').fixedIntent).toBe('sequence');
    expect(getProfile('enzymeCatalog').fixedIntent).toBe('enzymeCatalog');
    expect(getProfile('sequenceWithinEntry').showModeSelector).toBe(false);
    expect(getProfile('enzymeCatalog').showModeSelector).toBe(false);
  });
});

describe('capability — allowedPrefixKeys is ENFORCED, not just providerIntent (§1A.3)', () => {
  it('a prefix outside the profile → REQUIRES_FULL_SEARCH even when its intent is metadata', () => {
    // project:/feature: are metadata, but the picker does not own those entities.
    expect(isPrefixAllowed('libraryPicker', 'project')).toBe(false);
    expect(capabilityDiagnostics(classifyQuery('project:Alpha'), 'libraryPicker')
      .some((d) => d.code === 'REQUIRES_FULL_SEARCH')).toBe(true);
    expect(isPrefixAllowed('primerPool', 'feature')).toBe(false);
    expect(capabilityDiagnostics(classifyQuery('feature:glaA'), 'primerPool')
      .some((d) => d.code === 'REQUIRES_FULL_SEARCH')).toBe(true);
  });
  it('a prefix the profile owns passes', () => {
    expect(capabilityDiagnostics(classifyQuery('name:pUC'), 'libraryPicker')).toEqual([]);
    expect(capabilityDiagnostics(classifyQuery('tag:kan'), 'primerPool')).toEqual([]);
  });
  it('an INFERRED DNA intent does not escalate under a metadata profile (only explicit seq: does)', () => {
    expect(capabilityDiagnostics(classifyQuery('GAATTCGG'), 'libraryQuick')).toEqual([]); // auto-DNA → metadata part
    expect(capabilityDiagnostics(classifyQuery('seq:GAATTCGG'), 'libraryQuick')
      .some((d) => d.code === 'REQUIRES_FULL_SEARCH')).toBe(true); // explicit → escalate
  });
});

describe('capability — unknown profile is FAIL-CLOSED (§1A.3)', () => {
  it('an unknown profileId returns an error diagnostic, never []', () => {
    const diags = capabilityDiagnostics(classifyQuery('pUC19'), 'no-such-profile');
    expect(diags).toHaveLength(1);
    expect(diags[0]).toMatchObject({ code: 'unknown-profile', severity: 'error' });
  });
});
