export const BODGE_FILE_PICKER_TYPES = [
  {
    description: 'BodgeGene project',
    accept: { 'application/zip': ['.bodge'] },
  },
];

export function hasFileSystemAccess() {
  return typeof globalThis !== 'undefined'
    && typeof globalThis.showOpenFilePicker === 'function'
    && typeof globalThis.showSaveFilePicker === 'function';
}

export async function openBodgeFilePicker() {
  if (hasFileSystemAccess()) {
    let handles;
    try {
      handles = await globalThis.showOpenFilePicker({
        types: BODGE_FILE_PICKER_TYPES,
        multiple: false,
      });
    } catch (err) {
      if (err && err.name === 'AbortError') return null;
      throw err;
    }
    if (!handles || handles.length === 0) return null;
    const handle = handles[0];
    const file = await handle.getFile();
    return { handle, file, fileName: file.name, lastModified: file.lastModified };
  }
  return _legacyOpenViaInput();
}

function _legacyOpenViaInput() {
  if (typeof document === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.bodge,application/zip';
    input.style.display = 'none';
    input.addEventListener('change', () => {
      const file = input.files && input.files[0];
      document.body.removeChild(input);
      if (!file) return resolve(null);
      resolve({ handle: null, file, fileName: file.name, lastModified: file.lastModified });
    }, { once: true });
    document.body.appendChild(input);
    input.click();
  });
}

export async function pickSaveAs(suggestedName = 'project.bodge') {
  if (hasFileSystemAccess()) {
    try {
      const handle = await globalThis.showSaveFilePicker({
        suggestedName,
        types: BODGE_FILE_PICKER_TYPES,
      });
      return { handle, fileName: handle.name || suggestedName };
    } catch (err) {
      if (err && err.name === 'AbortError') return null;
      throw err;
    }
  }
  return { handle: null, fileName: suggestedName, _useDownloadFallback: true };
}

export async function saveBlobToHandle(handle, blob) {
  if (handle && typeof handle.createWritable === 'function') {
    const w = await handle.createWritable();
    await w.write(blob);
    await w.close();
    let lastModified = Date.now();
    try {
      const f = await handle.getFile();
      lastModified = f.lastModified;
    } catch { /* ignore */ }
    return { lastModified };
  }
  _downloadFallback(blob, 'project.bodge');
  return { lastModified: Date.now(), _viaDownloadFallback: true };
}

export async function downloadBlob(blob, fileName) {
  _downloadFallback(blob, fileName);
}

function _downloadFallback(blob, fileName) {
  if (typeof document === 'undefined' || typeof URL === 'undefined') return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName || 'project.bodge';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export async function queryHandlePermission(handle, mode = 'readwrite') {
  if (!handle || typeof handle.queryPermission !== 'function') return null;
  try {
    return await handle.queryPermission({ mode });
  } catch {
    return null;
  }
}

export async function requestHandlePermission(handle, mode = 'readwrite') {
  if (!handle || typeof handle.requestPermission !== 'function') return null;
  try {
    return await handle.requestPermission({ mode });
  } catch {
    return null;
  }
}
