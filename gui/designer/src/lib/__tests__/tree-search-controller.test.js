/**
 * tree-search-controller — REV#2 Stage 3 K5 (ch2). The thin controller that runs the TREE's fast
 * quick-filter under the EXISTING `libraryQuick` profile — never a second profile, never a
 * duplicated array. Per the contract: classify once, apply capabilityDiagnostics + the
 * consumed-clause ledger (planRequiresFullSearch), block parser errors / parse-only dead ends,
 * escalate executable heavy providers with EMPTY matching-sets, else run one kind-aware
 * metadata-only session scoped to the profile's owned kinds.
 */
import { describe, it, expect } from 'vitest';
import {
  collectTreeSearchDocuments,
  runTreeSearch,
  treeEntryEntityKey,
} from '../tree-search-controller';

const ENTRIES = {
  e1: {
    id: 'e1', kind: 'container', name: 'pUC19', tags: ['cloning'],
    payload: { topology: 'circular', sequence: 'ATGC' },
  },
  e2: {
    id: 'e2', kind: 'container', name: 'gfp reporter', tags: [], projectId: 'p1',
    payload: { topology: 'linear', sequence: 'ATGC' },
  },
  pr1: {
    id: 'pr1', kind: 'primer', name: 'T7 forward', tags: ['sequencing'], projectId: 'p1',
    origin: { status: 'archived' }, payload: { sequence: 'TAATACGACTCACTATAGGG' },
  },
};

const PROJECTS = {
  p1: { id: 'p1', name: 'Alpha', description: 'reporter constructs', containerIds: ['e2', 'pr1'] },
};

const DOCS = collectTreeSearchDocuments(ENTRIES, PROJECTS);

describe('tree-search-controller — runTreeSearch', () => {
  it('an empty query is NOT an active filter (the tree shows everything)', () => {
    const r = runTreeSearch('', DOCS);
    expect(r.active).toBe(false);
    expect(r.requiresFullSearch).toBe(false);
    expect(r.blocked).toBe(false);
    expect(r.matchingEntryIds.size).toBe(0);
  });

  it('a metadata query filters by name and bubbles a matched doc up to its project', () => {
    const r = runTreeSearch('gfp', DOCS);
    expect(r.active).toBe(true);
    expect(r.requiresFullSearch).toBe(false);
    expect(r.matchingEntryIds.has('e2')).toBe(true);
    expect(r.matchingEntryIds.has('e1')).toBe(false);
    expect(r.matchingProjectIds.has('p1')).toBe(true); // parent project bubbled up
    expect(r.matchingEntityKeys.has('entry:e2')).toBe(true);
    expect(r.matchInfoByEntityKey.has('entry:e2')).toBe(true); // row highlights available
  });

  it.each([
    ['primer:T7', 'primer:pr1'],
    ['type:primer', 'primer:pr1'],
    ['status:archived', 'primer:pr1'],
    ['project:Alpha', 'project:p1'],
  ])('collects real kind-aware documents: %s -> %s', (query, entityKey) => {
    const r = runTreeSearch(query, DOCS);
    expect(r.active).toBe(true);
    expect(r.blocked).toBe(false);
    expect(r.matchingEntityKeys).toContain(entityKey);
    expect(r.matchInfoByEntityKey.has(entityKey)).toBe(true);
  });

  it('uses primer identity for legacy primer rows, not the entry namespace', () => {
    expect(treeEntryEntityKey(ENTRIES.pr1)).toBe('primer:pr1');
    expect(treeEntryEntityKey(ENTRIES.e1)).toBe('entry:e1');
    const r = runTreeSearch('primer:T7', DOCS);
    expect(r.matchingEntityKeys.has('primer:pr1')).toBe(true);
    expect(r.matchingEntityKeys.has('entry:pr1')).toBe(false);
  });

  it('an explicit seq:/aa:/cut: escalates (REQUIRES_FULL_SEARCH) with EMPTY sets — never a heavy run', () => {
    for (const q of ['seq:GAATTC', 'aa:HXHH', 'cut:EcoRI', 're:EcoRI']) {
      const r = runTreeSearch(q, DOCS);
      expect(r.requiresFullSearch).toBe(true);
      expect(r.active).toBe(false);
      expect(r.matchingEntryIds.size).toBe(0);
    }
  });

  it('a parse-only prefix is blocked as unsupported locally — never offers a dead full-search action', () => {
    for (const q of ['name:pUC', 'feature:glaA', 'in:Alpha']) {
      const r = runTreeSearch(q, DOCS);
      expect(r.requiresFullSearch).toBe(false);
      expect(r.blocked).toBe(true);
      expect(r.unsupported).toBe(true);
      expect(r.diagnostics.some((d) => d.code === 'prefix-parse-only')).toBe(true);
      expect(r.matchingEntryIds.size).toBe(0);
    }
  });

  it('blocks a severity:error plan before the metadata engine can return a misleading session', () => {
    const r = runTreeSearch('primer:foo status:release', DOCS);
    expect(r.active).toBe(false);
    expect(r.blocked).toBe(true);
    expect(r.requiresFullSearch).toBe(false);
    expect(r.diagnostics.some((d) => d.severity === 'error')).toBe(true);
    expect(r.matchingEntityKeys.size).toBe(0);
  });

  it('an executable query that matches nothing is still an ACTIVE filter (not "show all")', () => {
    const r = runTreeSearch('zzznope', DOCS);
    expect(r.active).toBe(true);
    expect(r.requiresFullSearch).toBe(false);
    expect(r.matchingEntryIds.size).toBe(0);
  });

  it('keeps per-row match info for EVERY match — the tree session is not clipped by the 200-result cap', () => {
    const many = Array.from({ length: 250 }, (_, i) => ({ ref: { kind: 'entry', id: `m${i}` }, title: `puc${i}`, textFields: { name: `puc${i}` } }));
    const r = runTreeSearch('puc', many);
    expect(r.matchingEntryIds.size).toBe(250); // visibility is the full set
    expect(r.matchInfoByEntityKey.size).toBe(250); // …and so is the per-row explanation (not capped at 200)
  });

  it('a scope prefix narrows to the profile-owned kinds (mol: -> only entries searched)', () => {
    // mol: scopes to entries; a project doc named to match must NOT come back as a project hit.
    const r = runTreeSearch('mol:Alpha', DOCS);
    expect(r.requiresFullSearch).toBe(false);
    expect(r.matchingProjectIds.has('p1')).toBe(false); // project kind excluded by mol scope
  });
});
