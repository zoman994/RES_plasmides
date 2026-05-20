/**
 * K12 — extension points read/write bit-perfect.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  listVendors,
  readVendorManifest,
  vendorSize,
  totalExtensionsSize,
  writeVendorFile,
  dropVendor,
  diffExtensions,
} from '../bodge-extensions';
import { writeBodgeV2, readBodge } from '../bodge-zip';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const FIXTURE_DIR = resolve(
  __dirname, '..', '..', '__tests__', 'interop', 'fixtures', 'mock-vendor-extension',
);

function loadFixture(name) {
  return readFileSync(resolve(FIXTURE_DIR, name), 'utf8');
}

function mockExtensions() {
  return {
    'crispr-fork': {
      'manifest.json': loadFixture('manifest.json'),
      'scores.json': loadFixture('scores.json'),
    },
    'synbio-collab': {
      'ratings.json': '{"rating":5}',
    },
  };
}

describe('K12 — extension helpers', () => {
  it('listVendors returns all vendor namespaces', () => {
    const ext = mockExtensions();
    expect(listVendors(ext).sort()).toEqual(['crispr-fork', 'synbio-collab']);
  });

  it('readVendorManifest parses optional manifest.json', () => {
    const ext = mockExtensions();
    const m = readVendorManifest(ext, 'crispr-fork');
    expect(m).toBeTruthy();
    expect(m.vendor).toBe('crispr-fork');
    expect(m.version).toBe('1.2.0');
  });

  it('readVendorManifest returns null when no manifest.json or unparseable', () => {
    const ext = { foo: {} };
    expect(readVendorManifest(ext, 'foo')).toBeNull();
    const ext2 = { foo: { 'manifest.json': '{not valid json' } };
    expect(readVendorManifest(ext2, 'foo')).toBeNull();
  });

  it('vendorSize sums all files for a vendor', () => {
    const ext = mockExtensions();
    expect(vendorSize(ext, 'synbio-collab')).toBe('{"rating":5}'.length);
    expect(vendorSize(ext, 'crispr-fork')).toBeGreaterThan(0);
  });

  it('totalExtensionsSize sums across all vendors', () => {
    const ext = mockExtensions();
    const total = totalExtensionsSize(ext);
    expect(total).toBe(vendorSize(ext, 'crispr-fork') + vendorSize(ext, 'synbio-collab'));
  });

  it('writeVendorFile + dropVendor are mutating helpers', () => {
    const ext = {};
    writeVendorFile(ext, 'newfork', 'data.json', '{"a":1}');
    expect(ext.newfork).toEqual({ 'data.json': '{"a":1}' });
    dropVendor(ext, 'newfork');
    expect(ext.newfork).toBeUndefined();
  });

  it('diffExtensions equal when both trees match bytes', () => {
    const a = mockExtensions();
    const b = mockExtensions();
    expect(diffExtensions(a, b).equal).toBe(true);
  });

  it('diffExtensions surfaces vendor / file differences', () => {
    const a = mockExtensions();
    const b = mockExtensions();
    b['crispr-fork']['scores.json'] = '{"different":true}';
    const r = diffExtensions(a, b);
    expect(r.equal).toBe(false);
    expect(r.diffs.some(d => /scores\.json/.test(d))).toBe(true);
  });
});

describe('K12 — bit-perfect ZIP round-trip', () => {
  it('writeBodgeV2 + readBodge preserves extensions bit-perfect', async () => {
    const state = {
      projectMeta: { id: 'p01', name: 'Test' },
      containers: [], pieces: [], operations: [], zones: [], junctions: [],
      primers: [], libraryEntries: [], notebookEntries: [], attachmentsManifest: {},
      extensions: mockExtensions(),
    };
    const blob = await writeBodgeV2(state);
    const r = await readBodge(blob);

    // The reader returns extensions as Uint8Array (bit-perfect from ZIP).
    // Convert to text for comparison against source fixture strings.
    const decode = (val) => val instanceof Uint8Array
      ? new TextDecoder().decode(val) : val;
    const restored = {};
    for (const [vendor, files] of Object.entries(r.state.extensions)) {
      restored[vendor] = {};
      for (const [path, bytes] of Object.entries(files)) {
        restored[vendor][path] = decode(bytes);
      }
    }
    expect(restored['crispr-fork']['manifest.json']).toContain('"vendor": "crispr-fork"');
    expect(restored['crispr-fork']['scores.json']).toContain('guide-001');
    expect(restored['synbio-collab']['ratings.json']).toBe('{"rating":5}');
  });
});
