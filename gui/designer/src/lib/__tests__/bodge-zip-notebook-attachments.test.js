/**
 * NB-K17 — bodge-zip writer/reader handles notebook/attachments/*
 * binaries end-to-end.
 */
import { describe, it, expect } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { writeBodgeV2, readBodge } from '../bodge-zip';

const PNG_BYTES = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]); // PNG magic
const AB1_BYTES = new Uint8Array([0x41, 0x42, 0x49, 0x46]); // ABIF magic

function stateWithAttachment(attId, mimeType, bytes, manifestExtras = {}) {
  return {
    projectMeta: { id: 'p01', name: 'NB-K17 test' },
    containers: [], pieces: [], operations: [], zones: [], junctions: [],
    primers: [], libraryEntries: [],
    notebookEntries: [
      { id: 'nb01', kind: 'free-text', title: 't', text: 'see image', tags: [], createdAt: 'x', updatedAt: 'x', attachments: [attId] },
    ],
    attachmentsManifest: {
      [attId]: {
        displayName: 'attachment',
        mimeType,
        size: bytes.byteLength,
        uploadedAt: 'x',
        compressed: false,
        ...manifestExtras,
      },
    },
    attachments: new Map([
      [attId, { blob: new Blob([bytes], { type: mimeType }), manifest: {} }],
    ]),
  };
}

describe('NB-K17 — writer emits notebook/attachments/<id>.<ext>', () => {
  it('writes PNG attachment under notebook/attachments/<attId>.png', async () => {
    const blob = await writeBodgeV2(stateWithAttachment('att01ABC', 'image/png', PNG_BYTES));
    const entries = unzipSync(new Uint8Array(await blob.arrayBuffer()));
    expect(entries['notebook/attachments/att01ABC.png']).toBeTruthy();
    expect(Array.from(entries['notebook/attachments/att01ABC.png'])).toEqual(Array.from(PNG_BYTES));
  });

  it('AB1 attachment bit-perfect with .ab1 extension', async () => {
    const blob = await writeBodgeV2(stateWithAttachment('att02SAN', 'chemical/x-ab1', AB1_BYTES));
    const entries = unzipSync(new Uint8Array(await blob.arrayBuffer()));
    expect(entries['notebook/attachments/att02SAN.ab1']).toBeTruthy();
    expect(Array.from(entries['notebook/attachments/att02SAN.ab1'])).toEqual(Array.from(AB1_BYTES));
  });

  it('manifest.assets includes sha256 of each attachment', async () => {
    const blob = await writeBodgeV2(stateWithAttachment('att03', 'image/png', PNG_BYTES));
    const entries = unzipSync(new Uint8Array(await blob.arrayBuffer()));
    const manifest = JSON.parse(strFromU8(entries['manifest.json']));
    const asset = manifest.assets['notebook/attachments/att03.png'];
    expect(asset).toBeTruthy();
    expect(asset.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(asset.kind).toBe('attachment-image');
    expect(asset.compression).toBe('store'); // PNG already-compressed
  });

  it('PDF attachment routed to attachment-pdf kind + store compression', async () => {
    const blob = await writeBodgeV2(stateWithAttachment('att04', 'application/pdf',
      new Uint8Array([37, 80, 68, 70])));
    const entries = unzipSync(new Uint8Array(await blob.arrayBuffer()));
    const manifest = JSON.parse(strFromU8(entries['manifest.json']));
    const asset = manifest.assets['notebook/attachments/att04.pdf'];
    expect(asset.kind).toBe('attachment-pdf');
    expect(asset.compression).toBe('store');
  });
});

describe('NB-K17 — reader returns raw bytes via attachmentsBlobs', () => {
  it('round-trips PNG bytes (Uint8Array equality)', async () => {
    const state = stateWithAttachment('att01', 'image/png', PNG_BYTES);
    const blob = await writeBodgeV2(state);
    const r = await readBodge(blob);
    expect(r.state.attachmentsBlobs).toBeInstanceOf(Map);
    expect(r.state.attachmentsBlobs.has('att01')).toBe(true);
    const restored = r.state.attachmentsBlobs.get('att01');
    expect(Array.from(restored)).toEqual(Array.from(PNG_BYTES));
  });

  it('round-trips AB1 bit-perfect', async () => {
    const state = stateWithAttachment('att02', 'chemical/x-ab1', AB1_BYTES);
    const blob = await writeBodgeV2(state);
    const r = await readBodge(blob);
    const restored = r.state.attachmentsBlobs.get('att02');
    expect(Array.from(restored)).toEqual(Array.from(AB1_BYTES));
  });

  it('attachmentsManifest survives write→read', async () => {
    const state = stateWithAttachment('att01', 'image/png', PNG_BYTES, { displayName: 'PCR gel' });
    const blob = await writeBodgeV2(state);
    const r = await readBodge(blob);
    expect(r.state.attachmentsManifest.att01.displayName).toBe('PCR gel');
  });
});

describe('NB-K17 — orphan warnings', () => {
  it('warns when manifest references attachment with no bytes', async () => {
    const state = stateWithAttachment('att01', 'image/png', PNG_BYTES);
    // Drop the runtime blob so writer can't emit bytes — manifest still
    // references the attachment.
    state.attachments = new Map();
    const blob = await writeBodgeV2(state);
    const r = await readBodge(blob);
    expect(r.warnings.some(w => /bytes missing from ZIP/.test(w))).toBe(true);
  });

  it('empty notebook + no attachments → no warnings, no notebook section emitted unless entries exist', async () => {
    const state = {
      projectMeta: { id: 'p01', name: 'empty' },
      containers: [], pieces: [], operations: [], zones: [], junctions: [],
      primers: [], libraryEntries: [],
      notebookEntries: [], attachmentsManifest: {}, attachments: new Map(),
    };
    const blob = await writeBodgeV2(state);
    const r = await readBodge(blob);
    expect(r.warnings.filter(w => /attachment/.test(w))).toEqual([]);
    expect(r.state.notebookEntries).toEqual([]);
  });
});
