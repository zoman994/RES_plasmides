/**
 * K10 — export profile filters.
 */
import { describe, it, expect } from 'vitest';
import {
  EXPORT_PROFILES_REGISTRY,
  getProfileSpec,
  applyProfile,
  getCustomProfileFromUI,
} from '../bodge-export-profiles';

function FULL_STATE() {
  return {
    projectMeta: { id: 'p01', name: 'Test', author: { name: 'Igor', deviceId: '01XYZ' } },
    containers: [
      {
        id: 'c01', name: 'pET',
        sequence: 'ATGC',
        topology: 'linear',
        annotations: [],
        provenance: { commits: [
          { id: 'cmt01', kind: 'import_baseline' },
          { id: 'cmt02', kind: 'annotation_edit' },
          { id: 'cmt03', kind: 'annotation_edit' },
        ] },
      },
      {
        id: 'c02', name: 'pUC',
        sequence: 'GCTA',
        topology: 'circular',
        annotations: [],
      },
    ],
    pieces: [
      { id: 'pc01', kind: 'sourced', sourceIds: ['c01'], ranges: [], zoneId: 'zn01' },
      { id: 'pc02', kind: 'sourced', sourceIds: ['c02'], ranges: [], zoneId: 'zn02' },
    ],
    operations: [
      { id: 'op01', kind: 'pcr', inputs: ['c01'], outputs: [], params: { primerPairId: 'pp01' }, zoneId: 'zn01',
        materializedClones: [
          { cloneId: 'c11', label: 'clone-1', sangerVerified: 'verified', notes: 'OK!' },
        ] },
      { id: 'op02', kind: 'gibson', inputs: ['c02'], outputs: [], zoneId: 'zn02' },
    ],
    zones: [
      { id: 'zn01', name: 'pks4-ko', bounds: { x: 0, y: 0, width: 100, height: 100 }, viewMode: 'graph' },
      { id: 'zn02', name: 'rescue', bounds: { x: 100, y: 100, width: 100, height: 100 }, viewMode: 'graph' },
    ],
    junctions: [
      { id: 'jn01', kind: 'gibson', leftPieceId: 'pc01', rightPieceId: 'pc02', overlapLength: 20 },
    ],
    primers: [
      { id: 'pp01', sequence: 'ATGC', name: 'fwd',
        origin: { kind: 'library-selection', projectId: 'p01' },
        boundContainers: [{ containerId: 'c01', bindStart: 0, bindEnd: 4, strand: 1 }] },
      { id: 'pp02', sequence: 'GCTA', name: 'rev',
        origin: { kind: 'library-selection', projectId: 'p01' },
        boundContainers: [] },
    ],
    libraryEntries: [
      { id: 'le01', kind: 'container', containerId: 'c01', name: 'pET' },
      { id: 'le02', kind: 'container', containerId: 'c02', name: 'pUC' },
    ],
    notebookEntries: [
      { id: 'nb01', body: 'cloning step', zoneRef: 'zn01' },
      { id: 'nb02', body: 'rescue cloning', zoneRef: 'zn02' },
    ],
    attachmentsManifest: {
      'notebook/attachments/att01.png': { entryRef: 'nb01' },
      'notebook/attachments/att02.png': { entryRef: 'nb02' },
    },
  };
}

describe('K10 — registry + spec lookup', () => {
  it('registers all 5 named profiles', () => {
    const names = Object.keys(EXPORT_PROFILES_REGISTRY);
    expect(names.sort()).toEqual(['containers-bundle', 'custom', 'full', 'public-supp', 'single-assembly']);
  });

  it('getProfileSpec returns null on unknown', () => {
    expect(getProfileSpec('mystery')).toBeNull();
  });
});

describe('K10 — applyProfile', () => {
  it('full: passes everything through', () => {
    const out = applyProfile('full', FULL_STATE());
    expect(out.containers).toHaveLength(2);
    expect(out.zones).toHaveLength(2);
    expect(out.primers).toHaveLength(2);
    expect(out.libraryEntries).toHaveLength(2);
    expect(out.notebookEntries).toHaveLength(2);
    expect(Object.keys(out.attachmentsManifest)).toHaveLength(2);
  });

  it('public-supp: drops attachments + Sanger details, strips deviceId', () => {
    const out = applyProfile('public-supp', FULL_STATE());
    expect(out.containers).toHaveLength(2); // kept
    expect(Object.keys(out.attachmentsManifest)).toHaveLength(0); // dropped
    expect(out.notebookEntries).toHaveLength(2); // text kept
    // Sanger details cleared on clones.
    const op = out.operations.find(o => o.id === 'op01');
    expect(op.materializedClones[0].sangerVerified).toBe('pending');
    expect(op.materializedClones[0].notes).toBe('');
    // deviceId stripped.
    expect(out.projectMeta.author.deviceId).toBe('');
    expect(out.projectMeta.author.name).toBe('Igor');
  });

  it('containers-bundle: drops assemblies + notebook, keeps binding primers only', () => {
    const out = applyProfile('containers-bundle', FULL_STATE());
    expect(out.containers).toHaveLength(2);
    expect(out.zones).toEqual([]);
    expect(out.pieces).toEqual([]);
    expect(out.notebookEntries).toEqual([]);
    expect(Object.keys(out.attachmentsManifest)).toHaveLength(0);
    // pp01 has bound containers; pp02 doesn't.
    expect(out.primers).toHaveLength(1);
    expect(out.primers[0].id).toBe('pp01');
  });

  it('single-assembly: keeps only chosen zone + referenced containers + primers', () => {
    const out = applyProfile('single-assembly', FULL_STATE(),
      { singleAssemblyZoneId: 'zn01' });
    expect(out.zones).toHaveLength(1);
    expect(out.zones[0].id).toBe('zn01');
    expect(out.pieces).toHaveLength(1);
    expect(out.pieces[0].id).toBe('pc01');
    expect(out.operations.map(o => o.id)).toEqual(['op01']);
    // Only c01 referenced by zn01.
    expect(out.containers.map(c => c.id)).toEqual(['c01']);
    // Only pp01 referenced (op01.params.primerPairId === 'pp01').
    expect(out.primers.map(p => p.id)).toEqual(['pp01']);
    // Only nb01 (zoneRef === 'zn01').
    expect(out.notebookEntries.map(e => e.id)).toEqual(['nb01']);
    // Only att01 (entryRef === 'nb01').
    expect(Object.keys(out.attachmentsManifest)).toEqual(['notebook/attachments/att01.png']);
  });

  it('containerHistory excluded → only last commit retained', () => {
    const out = applyProfile('public-supp', FULL_STATE()); // public-supp uses full history actually
    const c = out.containers.find(c => c.id === 'c01');
    expect(c.provenance.commits).toHaveLength(3); // public-supp: containerHistory: 'full'
    // Now test with containers-bundle which keeps 'full' history too.
    // To test filtered, use custom:
    const custom = getCustomProfileFromUI({
      containers: true, containerHistory: false, assemblies: true,
      primers: true, library: true,
    });
    const out2 = applyProfile(custom, FULL_STATE());
    const c2 = out2.containers.find(c => c.id === 'c01');
    expect(c2.provenance.commits).toHaveLength(1); // excluded → last only
  });

  it('throws on unknown profile name', () => {
    expect(() => applyProfile('mystery', FULL_STATE())).toThrow(/unknown profile/);
  });
});

describe('K10 — getCustomProfileFromUI', () => {
  it('checkbox state → "full"/"excluded" sections', () => {
    const profile = getCustomProfileFromUI({
      containers: true, containerHistory: true, assemblies: false,
      primers: true, notebookEntries: false, notebookAttachments: false,
      sangerDetails: false, library: true,
    });
    expect(profile.name).toBe('custom');
    expect(profile.sections.containers).toBe('full');
    expect(profile.sections.assemblies).toBe('excluded');
    expect(profile.sections.notebookAttachments).toBe('excluded');
    expect(profile.sections.library).toBe('full');
  });

  it('passes through stripTelemetry flag', () => {
    const p1 = getCustomProfileFromUI({ stripTelemetry: true });
    const p2 = getCustomProfileFromUI({});
    expect(p1.stripTelemetry).toBe(true);
    expect(p2.stripTelemetry).toBe(false);
  });

  it('applied custom profile actually strips deviceId when stripTelemetry true', () => {
    const profile = getCustomProfileFromUI({
      containers: true, assemblies: true, primers: true, library: true,
      stripTelemetry: true,
    });
    const out = applyProfile(profile, FULL_STATE());
    expect(out.projectMeta.author.deviceId).toBe('');
  });
});
