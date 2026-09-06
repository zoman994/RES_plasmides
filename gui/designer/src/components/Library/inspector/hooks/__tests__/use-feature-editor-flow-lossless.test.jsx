/**
 * use-feature-editor-flow-lossless.test.jsx — ANN-INTEGRITY seam BG-032
 * (observable point 5). Saving a feature's sub-feature roster must overlay the
 * modal's edited fields onto EXISTING detail/point children, preserving unknown
 * fields, qualifiers, source / description / coverage / provenance and identity.
 *
 * Negative control: the pre-fix flow rebuilt every sub-feature from a bare
 * {name,type,start,end,strand,color,id}, dropping all rich metadata — so the
 * preservation assertions below fail. That is the RED for this seam.
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFeatureEditorFlow } from '../useFeatureEditorFlow';

const parent = { id: 'p1', name: 'gene', type: 'CDS', start: 0, end: 100, strand: 1, level: 'region' };
const richChild = {
  id: 'c1', name: 'dom', type: 'domain', start: 10, end: 30, strand: 1, level: 'detail',
  regionId: 'p1',
  qualifiers: { gene: 'lacZ', db_xref: ['taxon:562', 'GI:1'] },
  source: 'import',
  description: 'catalytic domain',
  coverage: 0.87,
  provenance: 'snapgene:addgene-1',
  identity: 0.95,
  weirdUnknownField: 'keep-me',
};

function setup() {
  const applyOp = vi.fn();
  const dispatchEdit = vi.fn();
  const item = { sequence: 'A'.repeat(100), annotations: [parent, richChild] };
  const edits = { editedAnnotations: [parent, richChild] };
  const { result } = renderHook(() =>
    useFeatureEditorFlow({ item, edits, applyOp, dispatchEdit }));
  return { result, applyOp };
}

describe('useFeatureEditorFlow — lossless sub-feature overlay', () => {
  it('preserves rich metadata of an existing detail while applying the coord edit', () => {
    const { result, applyOp } = setup();
    act(() => { result.current.openFeatureEditor(parent); });
    act(() => {
      result.current.onFeatureSave({
        patch: { name: 'gene-renamed' },
        // modal roster carries only editable fields for the existing child c1
        subFeatures: [{ id: 'c1', name: 'dom', type: 'domain', start: 12, end: 32, strand: 1 }],
      });
    });

    expect(applyOp).toHaveBeenCalledTimes(1);
    const composite = applyOp.mock.calls[0][0];
    const child = composite.find((a) => a.id === 'c1');
    expect(child).toBeTruthy();
    // edited coords applied
    expect(child.start).toBe(12);
    expect(child.end).toBe(32);
    // identity preserved
    expect(child.id).toBe('c1');
    // rich metadata preserved (the whole point of the overlay)
    expect(child.qualifiers).toEqual({ gene: 'lacZ', db_xref: ['taxon:562', 'GI:1'] });
    expect(child.source).toBe('import');
    expect(child.description).toBe('catalytic domain');
    expect(child.coverage).toBe(0.87);
    expect(child.provenance).toBe('snapgene:addgene-1');
    expect(child.identity).toBe(0.95);
    expect(child.weirdUnknownField).toBe('keep-me');
    // parent kept its stable id across the rename
    const p = composite.find((a) => a.id === 'p1');
    expect(p.name).toBe('gene-renamed');
  });

  it('a genuinely new sub-feature (no matching id) is created fresh with an opaque id', () => {
    const { result, applyOp } = setup();
    act(() => { result.current.openFeatureEditor(parent); });
    act(() => {
      result.current.onFeatureSave({
        patch: {},
        subFeatures: [{ name: 'newdom', type: 'domain', start: 40, end: 55, strand: -1 }],
      });
    });
    const composite = applyOp.mock.calls[0][0];
    const created = composite.find((a) => a.name === 'newdom');
    expect(created).toBeTruthy();
    expect(created.regionId).toBe('p1');
    expect(created.start).toBe(40);
    expect(created.end).toBe(55);
    expect(created.id).toBeTruthy();
    expect(created.id).not.toMatch(/^region:/);
  });
});

describe('useFeatureEditorFlow — fail-closed compound merge', () => {
  it('returns failure without throwing or mutating when core rejects a compound neighbour', () => {
    const compoundNeighbour = {
      id: 'joined', name: 'joined', type: 'CDS', level: 'region', strand: 1,
      start: 100, end: 200,
      location: { kind: 'join', segments: [{ start: 100, end: 140 }, { start: 160, end: 200 }] },
    };
    const applyOp = vi.fn();
    const item = {
      sequence: 'A'.repeat(200), length: 200, topology: 'linear',
      annotations: [parent, compoundNeighbour],
    };
    const { result } = renderHook(() => useFeatureEditorFlow({
      item, edits: null, applyOp, dispatchEdit: vi.fn(),
    }));
    act(() => { result.current.openFeatureEditor(parent); });
    let accepted;
    expect(() => {
      act(() => { accepted = result.current.onFeatureMerge('joined'); });
    }).not.toThrow();
    expect(accepted).toBe(false);
    expect(applyOp).not.toHaveBeenCalled();
  });
});

// ── B1-ui — compound parent + compound detail survive through the core paths ──
// Editing a compound parent (metadata-only) must keep its canonical JOIN, and an
// existing compound DETAIL child must NOT be flattened to a bounding span while
// the roster overlays only its editable fields. Dropped children go through the
// cascade-safe core delete; new children through the collision-safe core create.
describe('useFeatureEditorFlow — compound parent/detail through core ops', () => {
  const compoundParent = {
    id: 'p1', name: 'gene', type: 'CDS', level: 'region', strand: 1,
    location: { kind: 'join', segments: [{ start: 0, end: 50 }, { start: 100, end: 150 }] },
    start: 0, end: 150,
    qualifiers: { locus_tag: 'b0001' }, provenance: 'genbank',
  };
  const compoundChildA = {
    id: 'cc1', name: 'dom', type: 'domain', level: 'detail', regionId: 'p1', strand: 1,
    location: { kind: 'join', segments: [{ start: 10, end: 30 }, { start: 110, end: 130 }] },
    start: 10, end: 130,
    qualifiers: { note: 'two-part domain' }, provenance: 'import', weirdUnknownField: 'keep-me',
  };
  const compoundChildB = {
    id: 'cc2', name: 'dom2', type: 'domain', level: 'detail', regionId: 'p1', strand: 1,
    location: { kind: 'join', segments: [{ start: 12, end: 20 }, { start: 112, end: 120 }] },
    start: 12, end: 120,
  };

  function setupCompound(annotations) {
    const applyOp = vi.fn();
    const dispatchEdit = vi.fn();
    const item = { sequence: 'A'.repeat(200), length: 200, topology: 'linear', annotations };
    const { result } = renderHook(() =>
      useFeatureEditorFlow({ item, edits: { editedAnnotations: annotations }, applyOp, dispatchEdit }));
    return { result, applyOp };
  }

  it('metadata-only parent rename keeps parent JOIN and preserves the compound child verbatim', () => {
    const { result, applyOp } = setupCompound([compoundParent, compoundChildA]);
    act(() => { result.current.openFeatureEditor(compoundParent); });
    act(() => {
      result.current.onFeatureSave({
        patch: { name: 'gene-renamed', type: 'CDS', strand: 1 }, // NO coords, NO location
        // roster carries the compound child's scalar projection (unchanged).
        subFeatures: [{ id: 'cc1', name: 'dom', type: 'domain', start: 10, end: 130, strand: 1 }],
      });
    });
    expect(applyOp).toHaveBeenCalledTimes(1);
    const composite = applyOp.mock.calls[0][0];
    const p = composite.find((a) => a.id === 'p1');
    expect(p.name).toBe('gene-renamed');
    expect(p.location).toEqual({ kind: 'join', segments: [{ start: 0, end: 50 }, { start: 100, end: 150 }] });
    const c = composite.find((a) => a.id === 'cc1');
    // The compound child's canonical JOIN is NOT flattened.
    expect(c.location).toEqual({ kind: 'join', segments: [{ start: 10, end: 30 }, { start: 110, end: 130 }] });
    expect(c.qualifiers).toEqual({ note: 'two-part domain' });
    expect(c.provenance).toBe('import');
    expect(c.weirdUnknownField).toBe('keep-me');
    expect(c.regionId).toBe('p1');
  });

  it('dropping one compound child removes it while the surviving compound child keeps its JOIN', () => {
    const { result, applyOp } = setupCompound([compoundParent, compoundChildA, compoundChildB]);
    act(() => { result.current.openFeatureEditor(compoundParent); });
    act(() => {
      result.current.onFeatureSave({
        patch: { name: 'gene', type: 'CDS', strand: 1 },
        // cc2 omitted → removed; cc1 kept.
        subFeatures: [{ id: 'cc1', name: 'dom', type: 'domain', start: 10, end: 130, strand: 1 }],
      });
    });
    const composite = applyOp.mock.calls[0][0];
    expect(composite.find((a) => a.id === 'cc2')).toBeFalsy();
    const c1 = composite.find((a) => a.id === 'cc1');
    expect(c1).toBeTruthy();
    expect(c1.location).toEqual({ kind: 'join', segments: [{ start: 10, end: 30 }, { start: 110, end: 130 }] });
  });
});

// ── B1-ui — compound parent + compound detail, children through core paths ────
// A compound (JOIN) parent and a compound (JOIN) child must survive a
// metadata-only save with every segment, qualifier, provenance and unknown
// field intact. Removed/new children travel through the collision/cascade-safe
// core delete/create policy instead of a hand-rolled array rebuild that flattens
// rich objects.
describe('useFeatureEditorFlow — compound parent + compound detail', () => {
  const compoundParent = {
    id: 'cp', name: 'gene', type: 'CDS', strand: 1, level: 'region',
    location: { kind: 'join', segments: [{ start: 0, end: 40 }, { start: 60, end: 100 }] },
    start: 0, end: 100,
  };
  const compoundChild = {
    id: 'cc', name: 'dom', type: 'domain', strand: 1, level: 'detail', regionId: 'cp',
    location: { kind: 'join', segments: [{ start: 5, end: 15 }, { start: 70, end: 80 }] },
    start: 5, end: 80,
    qualifiers: { gene: 'lacZ', db_xref: ['taxon:562'] },
    provenance: 'snapgene:addgene-9',
    weirdUnknownField: 'keep-me',
  };

  function setupCompound() {
    const applyOp = vi.fn();
    const dispatchEdit = vi.fn();
    const item = {
      sequence: 'A'.repeat(100), length: 100, topology: 'linear',
      annotations: [compoundParent, compoundChild],
    };
    const { result } = renderHook(() =>
      useFeatureEditorFlow({ item, edits: null, applyOp, dispatchEdit }));
    return { result, applyOp };
  }

  it('a metadata-only parent save preserves BOTH the compound parent and compound child JOIN geometry + rich fields', () => {
    const { result, applyOp } = setupCompound();
    act(() => { result.current.openFeatureEditor(compoundParent); });
    act(() => {
      result.current.onFeatureSave({
        // rename only — no scalar coords, no location patch
        patch: { name: 'gene-renamed' },
        // existing child echoed back with its unchanged scalar projection
        subFeatures: [{ id: 'cc', name: 'dom', type: 'domain', start: 5, end: 80, strand: 1 }],
      });
    });
    expect(applyOp).toHaveBeenCalledTimes(1);
    const composite = applyOp.mock.calls[0][0];
    const p = composite.find((a) => a.id === 'cp');
    expect(p.name).toBe('gene-renamed');
    // Parent JOIN geometry preserved — never flattened to one span.
    expect(p.location).toEqual({ kind: 'join', segments: [{ start: 0, end: 40 }, { start: 60, end: 100 }] });
    const c = composite.find((a) => a.id === 'cc');
    expect(c).toBeTruthy();
    // Child JOIN geometry preserved (the pre-fix rebuild deleted det.location).
    expect(c.location).toEqual({ kind: 'join', segments: [{ start: 5, end: 15 }, { start: 70, end: 80 }] });
    expect(c.qualifiers).toEqual({ gene: 'lacZ', db_xref: ['taxon:562'] });
    expect(c.provenance).toBe('snapgene:addgene-9');
    expect(c.weirdUnknownField).toBe('keep-me');
    expect(c.regionId).toBe('cp');
  });

  it('a removed child is deleted through the core path and two new children get distinct opaque ids', () => {
    const { result, applyOp } = setupCompound();
    act(() => { result.current.openFeatureEditor(compoundParent); });
    act(() => {
      result.current.onFeatureSave({
        patch: {},
        subFeatures: [
          { name: 'a', type: 'domain', start: 20, end: 30, strand: 1 },
          { name: 'b', type: 'domain', start: 35, end: 45, strand: 1 },
        ],
      });
    });
    const composite = applyOp.mock.calls[0][0];
    // Old compound child removed.
    expect(composite.find((a) => a.id === 'cc')).toBeUndefined();
    const created = composite.filter((a) => a.level === 'detail');
    expect(created).toHaveLength(2);
    const ids = created.map((a) => a.id);
    expect(new Set(ids).size).toBe(2); // collision-safe: distinct
    created.forEach((a) => {
      expect(a.id).not.toMatch(/^region:/);
      expect(a.regionId).toBe('cp');
    });
  });

  it('metadata-only parent save preserves an origin-crossing compound detail exactly', () => {
    const originParent = {
      id: 'op', name: 'origin-parent', type: 'CDS', strand: 1, level: 'region',
      start: 850, end: 100,
      location: {
        kind: 'join',
        segments: [{ start: 850, end: 1000 }, { start: 0, end: 100 }],
      },
    };
    const originChild = {
      id: 'oc', name: 'origin-domain', type: 'domain', strand: 1,
      level: 'detail', regionId: 'op', start: 900, end: 50,
      location: {
        kind: 'join',
        segments: [{ start: 900, end: 1000 }, { start: 0, end: 50 }],
      },
      qualifiers: { note: ['crosses origin'] },
      provenance: { source: 'snapgene', record: 'oc-1' },
      unknownRichField: { keep: true },
    };
    const applyOp = vi.fn();
    const { result } = renderHook(() => useFeatureEditorFlow({
      item: {
        sequence: 'A'.repeat(1000), length: 1000, topology: 'circular',
        annotations: [originParent, originChild],
      },
      edits: null,
      applyOp,
      dispatchEdit: vi.fn(),
    }));

    act(() => { result.current.openFeatureEditor(originParent); });
    act(() => {
      result.current.onFeatureSave({
        patch: { name: 'origin-parent-renamed' },
        // The modal exposes the compatibility projection for this existing child.
        subFeatures: [{
          id: 'oc', name: 'origin-domain', type: 'domain',
          start: 900, end: 50, strand: 1,
        }],
      });
    });

    expect(applyOp).toHaveBeenCalledTimes(1);
    const child = applyOp.mock.calls[0][0].find((a) => a.id === 'oc');
    expect(child).toEqual(originChild);
  });
});
