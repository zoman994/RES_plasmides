/**
 * NB-K7 — attachment lifecycle + image compression whitelist.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  loadAttachments,
  revokeAttachments,
  attachFileToNotebookEntry,
  attachmentFilename,
} from '../bodge-attachments';
import { shouldCompressMimeType, compressImage } from '../image-compress';

function makeFile(bytes, name, type) {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return new File([arr], name, { type });
}

describe('NB-K7 — loadAttachments', () => {
  it('builds runtime map from manifest + ZIP bytes', () => {
    const section = {
      attachmentsManifest: {
        att01: { displayName: 'gel', mimeType: 'image/png', size: 4, uploadedAt: 'x', compressed: false },
      },
    };
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const map = loadAttachments(section, {
      'notebook/attachments/att01.png': bytes,
    });
    expect(map.size).toBe(1);
    expect(map.get('att01').blob).toBeInstanceOf(Blob);
    expect(map.get('att01').manifest.displayName).toBe('gel');
  });

  it('skips missing files silently (UI shows placeholder)', () => {
    const section = {
      attachmentsManifest: {
        att01: { mimeType: 'image/png' },
        attMISSING: { mimeType: 'image/png' },
      },
    };
    const map = loadAttachments(section, {
      'notebook/attachments/att01.png': new Uint8Array([1]),
    });
    expect(map.has('att01')).toBe(true);
    expect(map.has('attMISSING')).toBe(false);
  });

  it('accepts Map as blob source as well as plain object', () => {
    const section = {
      attachmentsManifest: { att01: { mimeType: 'image/png' } },
    };
    const blobs = new Map([
      ['notebook/attachments/att01.png', new Uint8Array([1, 2, 3])],
    ]);
    const map = loadAttachments(section, blobs);
    expect(map.has('att01')).toBe(true);
  });

  it('returns empty map when section has no attachmentsManifest', () => {
    expect(loadAttachments({}).size).toBe(0);
    expect(loadAttachments(null).size).toBe(0);
  });
});

describe('NB-K7 — revokeAttachments', () => {
  it('clears the map and calls URL.revokeObjectURL for each blobUrl', () => {
    const revoke = vi.fn();
    const originalURL = globalThis.URL;
    globalThis.URL = { ...originalURL, revokeObjectURL: revoke };
    try {
      const map = new Map();
      map.set('att01', { blobUrl: 'blob:1', blob: new Blob([]), manifest: {} });
      map.set('att02', { blobUrl: 'blob:2', blob: new Blob([]), manifest: {} });
      revokeAttachments(map);
      expect(revoke).toHaveBeenCalledTimes(2);
      expect(map.size).toBe(0);
    } finally {
      globalThis.URL = originalURL;
    }
  });
});

describe('NB-K7 — shouldCompressMimeType (whitelist gate)', () => {
  it('PNG / JPEG allowed', () => {
    expect(shouldCompressMimeType('image/png')).toBe(true);
    expect(shouldCompressMimeType('image/jpeg')).toBe(true);
    expect(shouldCompressMimeType('image/jpg')).toBe(true);
  });

  it('AB1 / PDF / chemical / video / unknown — blacklist', () => {
    expect(shouldCompressMimeType('chemical/x-ab1')).toBe(false);
    expect(shouldCompressMimeType('application/pdf')).toBe(false);
    expect(shouldCompressMimeType('chemical/seq-na-genbank')).toBe(false);
    expect(shouldCompressMimeType('video/mp4')).toBe(false);
    expect(shouldCompressMimeType('audio/wav')).toBe(false);
    expect(shouldCompressMimeType('')).toBe(false);
  });
});

describe('NB-K7 — compressImage (test-env fallback)', () => {
  it('returns original blob unchanged in environments without canvas', async () => {
    const file = makeFile([1, 2, 3, 4], 'gel.png', 'image/png');
    const r = await compressImage(file);
    // happy-dom typically lacks canvas.toBlob → fallback path.
    expect(r.blob).toBe(file);
    expect(r.compressed).toBe(false);
  });
});

describe('NB-K7 — attachFileToNotebookEntry', () => {
  it('AB1 file preserved bit-perfect (blacklist skips compression)', async () => {
    const file = makeFile([1, 2, 3], 'clone-1.ab1', 'chemical/x-ab1');
    const map = new Map();
    const { attId, markdownSnippet } = await attachFileToNotebookEntry(file, map);
    expect(map.get(attId).blob).toBe(file);
    expect(map.get(attId).manifest.compressed).toBe(false);
    expect(markdownSnippet).toMatch(/\.ab1\)$/);
  });

  it('PNG file: in test env compression falls back, manifest stamped accordingly', async () => {
    const file = makeFile([1, 2, 3, 4, 5], 'gel.png', 'image/png');
    const map = new Map();
    const { attId } = await attachFileToNotebookEntry(file, map);
    expect(map.get(attId).manifest.mimeType).toBe('image/png'); // fallback preserves original mime
    expect(map.get(attId).manifest.compressed).toBe(false);
  });

  it('generates markdown snippet with displayName + ext', async () => {
    const file = makeFile([1, 2], 'PCR gel 14.05.png', 'image/png');
    const map = new Map();
    const { markdownSnippet } = await attachFileToNotebookEntry(file, map, { displayName: 'PCR gel 14.05' });
    expect(markdownSnippet.startsWith('![PCR gel 14.05](att')).toBe(true);
  });

  it('throws on missing file', async () => {
    await expect(attachFileToNotebookEntry(null, new Map())).rejects.toThrow(/file required/);
  });
});

describe('NB-K7 — attachmentFilename helper', () => {
  it('maps mime types to canonical extensions', () => {
    expect(attachmentFilename('att01', 'image/png')).toBe('att01.png');
    expect(attachmentFilename('att02', 'image/jpeg')).toBe('att02.jpg');
    expect(attachmentFilename('att03', 'chemical/x-ab1')).toBe('att03.ab1');
    expect(attachmentFilename('att04', 'application/pdf')).toBe('att04.pdf');
    expect(attachmentFilename('att05', undefined)).toBe('att05.bin');
  });
});
