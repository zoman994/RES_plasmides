/**
 * K16 — README.md writer.
 */
import { describe, it, expect } from 'vitest';
import { buildReadme, validateReadmeSafe } from '../bodge-readme-writer';
import { buildManifest } from '../bodge-manifest-v2';

const MANIFEST = buildManifest({
  appVersion: '0.9.0-alpha',
  title: 'pks4 knockout study',
  description: 'Gibson assembly of 4 fragments для pks4 knockout study.',
  tags: ['aspergillus', 'crispr', 'pks4'],
  author: { name: 'Igor', deviceId: '01XYZ-device-uuid' },
});
MANIFEST.refs.library = 'library/entries.json';

const CONTAINERS = [
  { id: 'c01XYZ', name: 'pET-28b(+)', sequence: 'a'.repeat(5369), topology: 'circular' },
  { id: 'c02DEF', name: 'pUC19', sequence: 'a'.repeat(2686), topology: 'circular' },
  { id: 'c10FIN', name: 'pks4-ko final', sequence: 'a'.repeat(8210), topology: 'circular' },
];

const ASSEMBLIES = new Map([
  ['zn01ABC', { id: 'zn01ABC', name: 'pks4-knockout', pieces: [1, 2, 3, 4], operations: [{ kind: 'gibson' }] }],
  ['zn02XYZ', { id: 'zn02XYZ', name: 'pks4-rescue', pieces: [1, 2], operations: [{ kind: 'pcr' }] }],
]);

const PRIMER_POOL = {
  primers: [
    { id: 'pp01', sequence: 'ATGC' },
    { id: 'pp02', sequence: 'GCTA' },
    { id: 'pp-pair', kind: 'pair', forwardId: 'pp01', reverseId: 'pp02' },
  ],
};

describe('K16 — buildReadme', () => {
  it('generates valid markdown with title + dates + author + app version', () => {
    const md = buildReadme({
      manifest: MANIFEST,
      containers: CONTAINERS,
      assembliesMap: ASSEMBLIES,
      primerPool: PRIMER_POOL,
      notebookEntries: [],
      attachmentsManifest: {},
    });
    expect(md).toMatch(/^# pks4 knockout study/);
    expect(md).toContain('BodgeGene v0.9.0-alpha');
    expect(md).toContain('File format: 2.0.0');
    expect(md).toContain('Author: Igor');
    expect(md).toContain('Tags: aspergillus, crispr, pks4');
    expect(md).toContain('Описание');
    expect(md).toContain('Gibson assembly of 4 fragments');
  });

  it('lists containers with bp + topology', () => {
    const md = buildReadme({ manifest: MANIFEST, containers: CONTAINERS, assembliesMap: ASSEMBLIES });
    expect(md).toContain('### Containers (3)');
    expect(md).toContain('`containers/c01XYZ.gb` — **pET-28b(+)**, 5369 bp circular');
    expect(md).toContain('`containers/c10FIN.gb` — **pks4-ko final**, 8210 bp circular');
  });

  it('lists assemblies with fragment count + op kinds', () => {
    const md = buildReadme({ manifest: MANIFEST, containers: CONTAINERS, assembliesMap: ASSEMBLIES });
    expect(md).toContain('### Assemblies (2)');
    expect(md).toContain('`assemblies/zn01ABC.json` — **pks4-knockout** (4 fragments, gibson)');
    expect(md).toContain('`assemblies/zn02XYZ.json` — **pks4-rescue** (2 fragments, pcr)');
  });

  it('emits primer count excluding pair records', () => {
    const md = buildReadme({ manifest: MANIFEST, containers: CONTAINERS,
      assembliesMap: ASSEMBLIES, primerPool: PRIMER_POOL });
    expect(md).toContain('`primers/pool.json` — 2 primers');
  });

  it('handles empty-project edge case', () => {
    const emptyMani = buildManifest({ appVersion: '0.9.0-alpha' });
    const md = buildReadme({ manifest: emptyMani });
    expect(md).toContain('### Containers (0)');
    expect(md).toContain('### Assemblies (0)');
    expect(md).toContain('(empty)');
  });

  it('throws on missing manifest', () => {
    expect(() => buildReadme({})).toThrow(/manifest/);
  });
});

describe('K16 — validateReadmeSafe (no sensitive data leak)', () => {
  it('passes a normal README', () => {
    const md = buildReadme({
      manifest: MANIFEST, containers: CONTAINERS, assembliesMap: ASSEMBLIES,
      primerPool: PRIMER_POOL,
    });
    // deviceId is in manifest, NOT in README.
    const r = validateReadmeSafe(md);
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it('flags sha256 leak', () => {
    const r = validateReadmeSafe(`# proj\n\nsha256: ${'a'.repeat(64)}`);
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/sha256/);
  });

  it('flags deviceId leak', () => {
    const r = validateReadmeSafe('# proj\n\ndeviceId: 01XYZ-foo');
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/deviceId/);
  });

  it('flags UUID-shaped strings as possible deviceId leak', () => {
    const r = validateReadmeSafe('# proj\n\nuser uuid: 12345678-abcd-1234-5678-1234567890ab');
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/UUID/);
  });
});
