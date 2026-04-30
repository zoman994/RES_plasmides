import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  hasFileSystemAccess,
  openBodgeFilePicker,
  pickSaveAs,
  saveBlobToHandle,
  queryHandlePermission,
} from '../file-system';

describe('K3 — file-system wrapper', () => {
  let originalShowOpen;
  let originalShowSave;
  beforeEach(() => {
    originalShowOpen = globalThis.showOpenFilePicker;
    originalShowSave = globalThis.showSaveFilePicker;
  });
  afterEach(() => {
    if (originalShowOpen) globalThis.showOpenFilePicker = originalShowOpen;
    else delete globalThis.showOpenFilePicker;
    if (originalShowSave) globalThis.showSaveFilePicker = originalShowSave;
    else delete globalThis.showSaveFilePicker;
  });

  it('detects File System Access support', () => {
    delete globalThis.showOpenFilePicker;
    delete globalThis.showSaveFilePicker;
    expect(hasFileSystemAccess()).toBe(false);
    globalThis.showOpenFilePicker = () => {};
    globalThis.showSaveFilePicker = () => {};
    expect(hasFileSystemAccess()).toBe(true);
  });

  it('openBodgeFilePicker uses showOpenFilePicker when available', async () => {
    const fakeFile = new Blob(['x'], { type: 'application/zip' });
    fakeFile.name = 'demo.bodge';
    fakeFile.lastModified = 12345;
    const fakeHandle = { getFile: vi.fn().mockResolvedValue(fakeFile) };
    globalThis.showOpenFilePicker = vi.fn().mockResolvedValue([fakeHandle]);
    globalThis.showSaveFilePicker = vi.fn();
    const result = await openBodgeFilePicker();
    expect(result.handle).toBe(fakeHandle);
    expect(result.fileName).toBe('demo.bodge');
    expect(result.lastModified).toBe(12345);
  });

  it('openBodgeFilePicker returns null when user aborts', async () => {
    const err = new Error('aborted');
    err.name = 'AbortError';
    globalThis.showOpenFilePicker = vi.fn().mockRejectedValue(err);
    globalThis.showSaveFilePicker = vi.fn();
    expect(await openBodgeFilePicker()).toBeNull();
  });

  it('pickSaveAs returns handle with filename via showSaveFilePicker', async () => {
    globalThis.showOpenFilePicker = vi.fn();
    globalThis.showSaveFilePicker = vi.fn().mockResolvedValue({ name: 'project.bodge' });
    const result = await pickSaveAs('project.bodge');
    expect(result).toMatchObject({ fileName: 'project.bodge' });
  });

  it('saveBlobToHandle writes via createWritable', async () => {
    const writes = [];
    const handle = {
      createWritable: vi.fn().mockResolvedValue({
        write: async (b) => writes.push(b),
        close: async () => {},
      }),
      getFile: vi.fn().mockResolvedValue({ lastModified: 999 }),
    };
    const blob = new Blob(['x']);
    const res = await saveBlobToHandle(handle, blob);
    expect(writes.length).toBe(1);
    expect(res.lastModified).toBe(999);
  });

  it('saveBlobToHandle falls back to download when handle is null', async () => {
    const blob = new Blob(['x']);
    const res = await saveBlobToHandle(null, blob);
    expect(res._viaDownloadFallback).toBe(true);
  });

  it('queryHandlePermission returns null for handles without permission API', async () => {
    expect(await queryHandlePermission(null)).toBeNull();
    expect(await queryHandlePermission({})).toBeNull();
  });
});
