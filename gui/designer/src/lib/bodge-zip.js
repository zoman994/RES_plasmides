import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';

export const FILE_FORMAT_VERSION = 1;
export const SCHEMA_VERSION = 1;
export const APP_VERSION = '0.6.0-dev';

export function buildManifest(project) {
  const ts = new Date().toISOString();
  return {
    fileFormatVersion: FILE_FORMAT_VERSION,
    schemaVersion: SCHEMA_VERSION,
    appVersion: APP_VERSION,
    createdAt: project?.createdAt || ts,
    updatedAt: ts,
  };
}

export function writeBodge(project) {
  if (!project || typeof project !== 'object') {
    throw new Error('writeBodge: project is required');
  }
  const manifest = buildManifest(project);
  const files = {
    'manifest.json': strToU8(JSON.stringify(manifest, null, 2)),
    'project.json': strToU8(JSON.stringify(project, null, 2)),
  };
  const zipped = zipSync(files);
  return new Blob([zipped], { type: 'application/zip' });
}

export async function readBodge(blob) {
  if (!blob) throw new Error('readBodge: blob is required');
  const buf = blob instanceof ArrayBuffer ? blob : await blob.arrayBuffer();
  let entries;
  try {
    entries = unzipSync(new Uint8Array(buf));
  } catch (e) {
    throw new Error(`Не удалось прочитать .bodge: архив повреждён (${e.message || 'unzip failed'})`);
  }
  if (!entries['manifest.json']) {
    throw new Error('Не удалось прочитать .bodge: отсутствует manifest.json');
  }
  if (!entries['project.json']) {
    throw new Error('Не удалось прочитать .bodge: отсутствует project.json');
  }
  let manifest;
  let project;
  try {
    manifest = JSON.parse(strFromU8(entries['manifest.json']));
  } catch (e) {
    throw new Error(`manifest.json не парсится как JSON: ${e.message}`);
  }
  try {
    project = JSON.parse(strFromU8(entries['project.json']));
  } catch (e) {
    throw new Error(`project.json не парсится как JSON: ${e.message}`);
  }
  const warnings = [];
  for (const path of Object.keys(entries)) {
    if (path === 'manifest.json' || path === 'project.json') continue;
    if (path.startsWith('containers/') || path.startsWith('containerCommits/')
        || path.startsWith('projectCommits/') || path.startsWith('primers/')
        || path.startsWith('library/') || path.startsWith('refs/')
        || path.startsWith('renders/')) {
      warnings.push(`Игнорирован раздел "${path.split('/')[0]}/" — поддержка появится в M-B+.`);
    }
  }
  if (manifest.fileFormatVersion && manifest.fileFormatVersion > FILE_FORMAT_VERSION) {
    warnings.push(`Файл создан в более новой версии формата (${manifest.fileFormatVersion}) — некоторые поля могут быть пропущены.`);
  }
  return { manifest, project, warnings };
}
