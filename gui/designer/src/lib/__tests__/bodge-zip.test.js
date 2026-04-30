import { describe, it, expect } from 'vitest';
import { writeBodge, readBodge, FILE_FORMAT_VERSION } from '../bodge-zip';
import { zipSync, strToU8 } from 'fflate';

const sampleProject = {
  id: '01900000-7000-7000-8000-000000000001',
  schemaVer: 1,
  name: 'Demo',
  description: '',
  tags: ['bacterial'],
  createdAt: '2026-04-30T00:00:00Z',
  updatedAt: '2026-04-30T01:00:00Z',
  agent: { name: '', email: '' },
  containerIds: [],
  projectCommitIds: [],
  primerIds: [],
  settings: {},
  ext: {},
};

describe('K3 — bodge-zip writeBodge / readBodge', () => {
  it('round-trips a project identity', async () => {
    const blob = writeBodge(sampleProject);
    expect(blob).toBeInstanceOf(Blob);
    const { manifest, project, warnings } = await readBodge(blob);
    expect(manifest.fileFormatVersion).toBe(FILE_FORMAT_VERSION);
    expect(manifest.appVersion).toBe('0.6.0-dev');
    expect(project).toEqual(sampleProject);
    expect(warnings).toEqual([]);
  });

  it('returns a warning when archive contains M-B+ sections (containers/)', async () => {
    const zipped = zipSync({
      'manifest.json': strToU8(JSON.stringify({
        fileFormatVersion: FILE_FORMAT_VERSION, schemaVersion: 1, appVersion: '0.6.0-dev',
        createdAt: 'x', updatedAt: 'x',
      })),
      'project.json': strToU8(JSON.stringify(sampleProject)),
      'containers/abc.json': strToU8('{}'),
      'primers/primers.json': strToU8('{}'),
    });
    const blob = new Blob([zipped]);
    const { warnings } = await readBodge(blob);
    expect(warnings.length).toBeGreaterThanOrEqual(2);
    expect(warnings.some(w => w.includes('containers'))).toBe(true);
    expect(warnings.some(w => w.includes('primers'))).toBe(true);
  });

  it('throws a clear message when archive is corrupt', async () => {
    const blob = new Blob([new Uint8Array([0, 1, 2, 3, 4])]);
    await expect(readBodge(blob)).rejects.toThrow(/повреждён|unzip/i);
  });

  it('throws when manifest.json is missing', async () => {
    const zipped = zipSync({
      'project.json': strToU8(JSON.stringify(sampleProject)),
    });
    await expect(readBodge(new Blob([zipped]))).rejects.toThrow(/manifest\.json/);
  });

  it('throws when project.json is missing', async () => {
    const zipped = zipSync({
      'manifest.json': strToU8(JSON.stringify({ fileFormatVersion: 1, schemaVersion: 1, appVersion: 'x', createdAt: 'x', updatedAt: 'x' })),
    });
    await expect(readBodge(new Blob([zipped]))).rejects.toThrow(/project\.json/);
  });
});
