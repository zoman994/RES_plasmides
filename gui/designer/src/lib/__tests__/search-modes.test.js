/**
 * K2.0 — search-modes: the user-facing mode options (§9.2) and `+ Фильтр` defs
 * (§9.3), DERIVED from the single PREFIX_REGISTRY (no duplication/drift), plus a
 * capability gate whose contract is `{ providers, entityScope }` — the same
 * shape a real SearchProfile carries. The gate is FAIL-CLOSED: missing or
 * malformed capabilities show only the guaranteed `lib`/`mol`. Tests assert the
 * end-to-end contract against real profiles, not a synthetic capability array.
 */
import { describe, it, expect } from 'vitest';
import {
  SEARCH_MODES, SEARCH_MODE_GROUPS, SEARCH_FILTER_DEFS, visibleModeGroups,
} from '../search-modes';
import { prefixEntry, allCanonicalKeys } from '../search-prefix-registry';
import { SEARCH_PROFILES } from '../search-profiles';

describe('SEARCH_MODES — derived from the registry (§9.2)', () => {
  it('covers the eight modes and derives every field from the registry (no duplication)', () => {
    expect(Object.keys(SEARCH_MODES).sort()).toEqual(['aa', 'cut', 'enz', 'lib', 'mol', 'primer', 'project', 'seq'].sort());
    for (const m of Object.values(SEARCH_MODES)) {
      const e = prefixEntry(m.canonical);
      expect(e).not.toBeNull(); // canonical is a real registry key
      expect(m.labelKey).toBe(e.labelKey); // label KEY comes from the registry, not a local copy
      expect(m.providerIntent).toBe(e.providerIntent);
      expect(m.includeKinds).toEqual(e.includeKinds);
      expect(['userData', 'bio', 'reference']).toContain(m.group);
      expect(m.labelKey).toMatch(/^search\./); // an i18n key, never a literal
    }
  });

  it('groups are ordered userData → bio → reference', () => {
    expect(SEARCH_MODE_GROUPS.map((g) => g.id)).toEqual(['userData', 'bio', 'reference']);
  });
});

describe('visibleModeGroups — fail-CLOSED capability gate (providers + entityScope)', () => {
  const total = (groups) => groups.reduce((n, g) => n + g.modes.length, 0);
  const idsOf = (groups, gid) => (groups.find((g) => g.id === gid)?.modes || []).map((m) => m.id);

  it('the REAL globalLibrary profile enables all eight modes', () => {
    const groups = visibleModeGroups(SEARCH_PROFILES.globalLibrary);
    expect(groups.map((g) => g.id)).toEqual(['userData', 'bio', 'reference']);
    expect(total(groups)).toBe(8);
  });

  it('null / malformed capabilities show ONLY the guaranteed lib + mol (fail-closed, not fail-open)', () => {
    for (const caps of [null, undefined, {}, { providers: 'oops' }, { entityScope: ['entry'] }]) {
      const groups = visibleModeGroups(caps);
      expect(groups.map((g) => g.id)).toEqual(['userData']);
      expect(idsOf(groups, 'userData')).toEqual(['lib', 'mol']);
    }
  });

  it('a metadata-only, entry-only capability still shows only lib + mol (primer/project kinds absent)', () => {
    const groups = visibleModeGroups({ providers: ['metadata'], entityScope: ['entry'] });
    expect(idsOf(groups, 'userData')).toEqual(['lib', 'mol']);
    expect(groups.map((g) => g.id)).toEqual(['userData']); // bio + reference gated out
  });

  it('a PARTIALLY malformed object fails closed ENTIRELY — one bad axis invalidates the valid one', () => {
    // valid providers but malformed entityScope → must NOT open ДНК (bio gated out too)
    let groups = visibleModeGroups({ providers: ['sequence'], entityScope: 'oops' });
    expect(groups.map((g) => g.id)).toEqual(['userData']);
    expect(idsOf(groups, 'userData')).toEqual(['lib', 'mol']);
    // malformed providers but valid entityScope → must NOT open Праймеры
    groups = visibleModeGroups({ providers: 'oops', entityScope: ['primer'] });
    expect(groups.map((g) => g.id)).toEqual(['userData']);
    expect(idsOf(groups, 'userData')).toEqual(['lib', 'mol']);
  });

  it('the REAL primerPool profile shows lib/mol/primer + seq (its providers + entityScope)', () => {
    const groups = visibleModeGroups(SEARCH_PROFILES.primerPool); // providers metadata+sequence, kinds ['primer']
    expect(idsOf(groups, 'userData')).toEqual(['lib', 'mol', 'primer']); // project kind absent
    expect(idsOf(groups, 'bio')).toEqual(['seq']); // sequence yes; protein/restrictionSites no
    expect(groups.find((g) => g.id === 'reference')).toBeUndefined(); // enzymeCatalog not a provider
  });
});

describe('SEARCH_FILTER_DEFS — §9.3 items; project is an ENTITY picker, not text', () => {
  it('name/annotation/tag are text, type/status enum, project is entity(project)', () => {
    const byId = Object.fromEntries(SEARCH_FILTER_DEFS.map((d) => [d.id, d]));
    expect(byId.name.inputType).toBe('text');
    expect(byId.feature.inputType).toBe('text'); // «Аннотация» → feature
    expect(byId.tag.inputType).toBe('text');
    expect(byId.type.inputType).toBe('enum');
    expect(byId.status.inputType).toBe('enum');
    // «Проект» resolves a STABLE identity, not a typed name → entity picker (spec §617)
    expect(byId.project.inputType).toBe('entity');
    expect(byId.project.entityKind).toBe('project');
    expect(byId.project.canonical).toBe('in');
  });

  it('every filter def carries an i18n label key and a canonical registry key', () => {
    const keys = new Set(allCanonicalKeys());
    for (const d of SEARCH_FILTER_DEFS) {
      expect(d.labelKey).toMatch(/^search\./);
      expect(keys.has(d.canonical)).toBe(true);
    }
  });
});
