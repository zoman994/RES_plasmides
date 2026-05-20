/**
 * K2 — manifest schema v2 + validators.
 */
import { describe, it, expect } from 'vitest';
import {
  buildManifest,
  addAsset,
  validateManifest,
  isBodgeV2Manifest,
  stripDeviceId,
  BODGE_V2_SIGNATURE,
  BODGE_V2_FILE_FORMAT_VERSION,
  ASSET_KINDS,
  EXPORT_TYPES,
  EXPORT_PROFILES,
} from '../bodge-manifest-v2';
import { sha256Hex } from '../bodge-hash';

describe('K2 — buildManifest', () => {
  it('produces a v2 manifest with signature + format version + defaults', () => {
    const m = buildManifest({ appVersion: '0.9.0-alpha' });
    expect(m.signature).toBe(BODGE_V2_SIGNATURE);
    expect(m.fileFormatVersion).toBe(BODGE_V2_FILE_FORMAT_VERSION);
    expect(m.appVersion).toBe('0.9.0-alpha');
    expect(m.exportType).toBe('project');
    expect(m.exportProfile).toBe('full');
    expect(m.assets).toEqual({});
    expect(m.refs.containers).toEqual([]);
    expect(m.refs.assemblies).toEqual([]);
    expect(m.extensions).toEqual({});
  });

  it('accepts metadata fields + tags', () => {
    const m = buildManifest({
      appVersion: '0.9.0-alpha',
      title: 'pks4 knockout',
      description: 'Gibson, 4 fragments',
      tags: ['aspergillus', 'crispr'],
      author: { name: 'Igor', deviceId: '01XYZ' },
    });
    expect(m.metadata.title).toBe('pks4 knockout');
    expect(m.metadata.tags).toEqual(['aspergillus', 'crispr']);
    expect(m.metadata.author.deviceId).toBe('01XYZ');
  });

  it('throws on missing appVersion', () => {
    expect(() => buildManifest({})).toThrow(/appVersion/);
  });

  it('throws on invalid exportType / exportProfile', () => {
    expect(() => buildManifest({ appVersion: '0.9', exportType: 'nope' }))
      .toThrow(/exportType/);
    expect(() => buildManifest({ appVersion: '0.9', exportProfile: 'nope' }))
      .toThrow(/exportProfile/);
  });
});

describe('K2 — addAsset', () => {
  it('computes sha256 + size for string content, registers under path', async () => {
    const m = buildManifest({ appVersion: '0.9.0-alpha' });
    await addAsset(m, {
      path: 'containers/c01XYZ.gb',
      content: 'LOCUS test 1 bp\n//\n',
      kind: 'container',
      displayName: 'pET-28b',
    });
    const a = m.assets['containers/c01XYZ.gb'];
    expect(a).toBeTruthy();
    expect(a.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(a.size).toBe(19);
    expect(a.kind).toBe('container');
    expect(a.displayName).toBe('pET-28b');
    expect(a.compression).toBe('deflate');
    // Cross-update refs.containers.
    expect(m.refs.containers).toContain('c01XYZ');
  });

  it('default compression is deflate; accepts store for binaries', async () => {
    const m = buildManifest({ appVersion: '0.9.0-alpha' });
    const bytes = new Uint8Array([1, 2, 3, 4, 5]);
    await addAsset(m, {
      path: 'notebook/attachments/att01.png',
      content: bytes,
      kind: 'attachment-image',
      compression: 'store',
    });
    expect(m.assets['notebook/attachments/att01.png'].compression).toBe('store');
    expect(m.assets['notebook/attachments/att01.png'].size).toBe(5);
  });

  it('rejects unknown kind', async () => {
    const m = buildManifest({ appVersion: '0.9.0-alpha' });
    await expect(addAsset(m, {
      path: 'foo.bin', content: 'x', kind: 'mystery-kind',
    })).rejects.toThrow(/kind/);
  });

  it('cross-updates refs for primer-pool / notebook / library kinds', async () => {
    const m = buildManifest({ appVersion: '0.9.0-alpha' });
    await addAsset(m, { path: 'primers/pool.json', content: '{}', kind: 'primer-pool' });
    await addAsset(m, { path: 'notebook/entries.json', content: '{}', kind: 'notebook-entries' });
    await addAsset(m, { path: 'library/entries.json', content: '[]', kind: 'library' });
    expect(m.refs.primerPool).toBe('primers/pool.json');
    expect(m.refs.notebook).toBe('notebook/entries.json');
    expect(m.refs.library).toBe('library/entries.json');
  });

  it('does not duplicate ids in refs.containers / refs.assemblies', async () => {
    const m = buildManifest({ appVersion: '0.9.0-alpha' });
    await addAsset(m, { path: 'containers/c01.gb', content: 'a', kind: 'container' });
    await addAsset(m, { path: 'containers/c01.gb', content: 'b', kind: 'container' });
    expect(m.refs.containers).toEqual(['c01']);
  });
});

describe('K2 — validateManifest', () => {
  it('passes a freshly built manifest', () => {
    const m = buildManifest({ appVersion: '0.9.0-alpha' });
    expect(validateManifest(m)).toEqual({ ok: true, errors: [] });
  });

  it('rejects wrong signature', () => {
    const m = buildManifest({ appVersion: '0.9.0-alpha' });
    m.signature = 'NOT-BODGE';
    const r = validateManifest(m);
    expect(r.ok).toBe(false);
    expect(r.errors.some(e => /signature/.test(e))).toBe(true);
  });

  it('rejects malformed fileFormatVersion', () => {
    const m = buildManifest({ appVersion: '0.9.0-alpha' });
    m.fileFormatVersion = 'bad-version';
    const r = validateManifest(m);
    expect(r.ok).toBe(false);
    expect(r.errors.some(e => /fileFormatVersion/.test(e))).toBe(true);
  });

  it('rejects invalid asset sha256', async () => {
    const m = buildManifest({ appVersion: '0.9.0-alpha' });
    await addAsset(m, { path: 'containers/c01.gb', content: 'x', kind: 'container' });
    m.assets['containers/c01.gb'].sha256 = 'not-a-hash';
    const r = validateManifest(m);
    expect(r.ok).toBe(false);
    expect(r.errors.some(e => /sha256/.test(e))).toBe(true);
  });

  it('rejects negative asset size', async () => {
    const m = buildManifest({ appVersion: '0.9.0-alpha' });
    await addAsset(m, { path: 'x.gb', content: 'x', kind: 'container' });
    m.assets['x.gb'].size = -1;
    const r = validateManifest(m);
    expect(r.ok).toBe(false);
    expect(r.errors.some(e => /size/.test(e))).toBe(true);
  });

  it('rejects unknown asset kind', () => {
    const m = buildManifest({ appVersion: '0.9.0-alpha' });
    m.assets['x.gb'] = { sha256: 'a'.repeat(64), size: 1, compression: 'deflate', kind: 'bogus' };
    const r = validateManifest(m);
    expect(r.ok).toBe(false);
    expect(r.errors.some(e => /kind/.test(e))).toBe(true);
  });
});

describe('K2 — isBodgeV2Manifest + stripDeviceId', () => {
  it('isBodgeV2Manifest detects v2 signature', () => {
    expect(isBodgeV2Manifest({ signature: 'BODGE-V2' })).toBe(true);
    expect(isBodgeV2Manifest({ signature: 'BODGE-V1' })).toBe(false);
    expect(isBodgeV2Manifest(null)).toBe(false);
  });

  it('stripDeviceId clears the deviceId for public-supp profile', () => {
    const m = buildManifest({
      appVersion: '0.9.0-alpha',
      author: { name: 'Igor', deviceId: '01XYZ' },
    });
    stripDeviceId(m);
    expect(m.metadata.author.deviceId).toBe('');
    expect(m.metadata.author.name).toBe('Igor');
  });
});

describe('K2 — sha256Hex sanity', () => {
  it('matches a known fixture (empty string sha256)', async () => {
    const h = await sha256Hex('');
    expect(h).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });
});
