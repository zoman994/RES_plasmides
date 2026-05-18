/**
 * skeleton-auto-annotate-r9.test.jsx — Post-assembly annotation enrichment.
 *
 * R9-4 (14.05.2026). Verifies:
 *   - enrichAssemblyAnnotations detects RE sites в новой sequence.
 *   - Preserves existing annotations.
 *   - De-duplicates same-name same-coord entries.
 *   - OP_EXECUTE applies enrichment for assembly outputs.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { enrichAssemblyAnnotations } from '../canvas/operations/auto-annotate-assembly';
import { skeletonReducer, buildInitialState } from '../store/skeleton-state';

describe('R9-4 — enrichAssemblyAnnotations', () => {
  it('Detects RE sites в новой sequence', () => {
    const c = {
      sequence: 'AAAAGAATTCGGGGCCCC', // contains EcoRI site GAATTC
      annotations: [],
      name: 'test',
    };
    const result = enrichAssemblyAnnotations(c);
    // autoAnnotate finds GAATTC, returns annotation.
    expect(result.length).toBeGreaterThan(0);
    const reAnn = result.find((a) => a.name?.includes('EcoRI') || a.type === 'restriction_site');
    expect(reAnn).toBeTruthy();
  });

  it('Preserves existing annotations', () => {
    const c = {
      sequence: 'AAAAAAAAAAAAAAAA',
      annotations: [{ id: 'p1', name: 'origin', type: 'rep_origin', start: 0, end: 10 }],
      name: 'plasmid',
    };
    const result = enrichAssemblyAnnotations(c);
    const origin = result.find((a) => a.id === 'p1');
    expect(origin).toBeTruthy();
  });

  it('Handles missing sequence gracefully', () => {
    expect(enrichAssemblyAnnotations(null)).toEqual([]);
    expect(enrichAssemblyAnnotations({})).toEqual([]);
  });

  it('De-dupes same-name same-coord entries', () => {
    const c = {
      sequence: 'AAAAGAATTCCCCC',
      annotations: [],
      name: 'test',
    };
    const r1 = enrichAssemblyAnnotations(c);
    const r2 = enrichAssemblyAnnotations({ ...c, annotations: r1 });
    // After second call existing annotations не должны удвоиться.
    const ecoSites1 = r1.filter((a) => /EcoRI/.test(a.name || ''));
    const ecoSites2 = r2.filter((a) => /EcoRI/.test(a.name || ''));
    expect(ecoSites2.length).toBe(ecoSites1.length);
  });
});

describe('R9-4 — OP_EXECUTE enriches assembly outputs', () => {
  it('Gibson output получает auto-detected RE sites', () => {
    // 2 fragments with overlap; assembled product contains EcoRI site.
    const f1 = {
      id: 'f1', kind: 'molecule', name: 'A',
      sequence: 'AAAATTTTGGGGCCCCAAAA' + 'TTTTGAATTCAAAA', // 20 bp + 14 bp; second part contains GAATTC.
      topology: { circular: false },
      annotations: [],
      parentCommitId: null,
      origin: { kind: 'tree_drag' },
    };
    const f2 = {
      id: 'f2', kind: 'molecule', name: 'B',
      sequence: 'TTTTGAATTCAAAA' + 'CCCCGGGGAAAATTTT', // 14 bp overlap + 16 bp tail.
      topology: { circular: false },
      annotations: [],
      parentCommitId: null,
      origin: { kind: 'tree_drag' },
    };
    const state = {
      ...buildInitialState(),
      containers: [f1, f2],
      operations: [{
        id: 'op-g', kind: 'gibson', status: 'committed',
        inputs: ['f1', 'f2'],
        params: { fragmentIds: ['f1', 'f2'], circular: false },
        position: { x: 100, y: 100 },
      }],
    };
    const next = skeletonReducer(state, { type: 'OP_EXECUTE', operationId: 'op-g' });
    const assembly = next.containers.find((c) => c.name?.includes('gibson'));
    expect(assembly).toBeDefined();
    // Annotations may include EcoRI site из auto-annotate.
    const hasEcoRI = (assembly.annotations || []).some((a) => /EcoRI/.test(a.name || ''));
    expect(hasEcoRI).toBe(true);
  });
});
