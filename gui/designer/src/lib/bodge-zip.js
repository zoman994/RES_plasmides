/**
 * bodge-zip — ZIP IO for .bodge files (v1 + v2 dispatch).
 *
 * Entry points (signatures preserved across v1 → v2 to keep call-sites
 * unchanged per SPEC_BODGE_FORMAT_V2_CORE §0.1):
 *
 *   writeBodge(input, options)   → Blob
 *   readBodge(blob)              → { manifest, project|state, libraryEntries,
 *                                     warnings, formatVersion }
 *
 * Dispatch:
 *   - `input` has a `.containers` array → canonical v2 state → write v2.
 *   - `input` has `.containerIds` / `.projectCommitIds` (Plasmid-Git
 *     projectSlice shape) → write v1 (unchanged from v0.8.3-alpha).
 *   - readBodge inspects manifest.signature → 'BODGE-V2' → v2 reader;
 *     otherwise v1 reader.
 *
 * v2 reader returns `state` (canonical four-tier) + `project` alias
 * for forward-compat call sites. v1 reader keeps `{project}` shape so
 * existing tests (bodge-roundtrip.integration.test.js, bodge-zip.test.js)
 * continue to pass.
 */
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import {
  buildManifest as buildManifestV2,
  addAsset as addAssetV2,
  validateManifest as validateManifestV2,
  isBodgeV2Manifest,
  stripDeviceId,
  BODGE_V2_FILE_FORMAT_VERSION,
} from './bodge-manifest-v2';
import { sha256Hex } from './bodge-hash';
import { writeContainerToGenBank, readContainerFromGenBank } from './bodge-container-genbank';
import { writeAssemblyJson, readAssemblyJson, checkAssemblyOrphans } from './bodge-assembly-json';
import { writePrimerPool, readPrimerPool } from './bodge-primers-json';
import { buildReadme } from './bodge-readme-writer';
import { attachmentFilename } from './bodge-attachments';
import { APP_VERSION as CURRENT_APP_VERSION } from './version';

// ---- v1 constants (unchanged signatures for back-compat) -------------------

export const FILE_FORMAT_VERSION = 1;
export const SCHEMA_VERSION = 1;
export const APP_VERSION = '0.6.0-dev'; // legacy manifest stamp for v1 path

// ---- v2 constants ----------------------------------------------------------

export { BODGE_V2_FILE_FORMAT_VERSION };

// ---- v1 writer (unchanged behavior) ----------------------------------------

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

function writeBodgeV1(project, opts = {}) {
  if (!project || typeof project !== 'object') {
    throw new Error('writeBodge: project is required');
  }
  const manifest = buildManifest(project);
  const files = {
    'manifest.json': strToU8(JSON.stringify(manifest, null, 2)),
    'project.json': strToU8(JSON.stringify(project, null, 2)),
  };
  const libraryEntries = Array.isArray(opts.libraryEntries) ? opts.libraryEntries : [];
  if (libraryEntries.length > 0) {
    files['library/entries.json'] = strToU8(JSON.stringify(libraryEntries, null, 2));
  }
  const zipped = zipSync(files);
  return new Blob([zipped], { type: 'application/zip' });
}

// ---- v2 writer -------------------------------------------------------------

/**
 * Write a canonical v2 .bodge.
 *
 * @param {object} state — canonical four-tier state shape:
 *   {
 *     projectMeta: {id, name, createdAt, updatedAt, focusedZoneId,
 *                    description, tags, author, ui, labels},
 *     containers: [...],
 *     pieces: [...],
 *     operations: [...],
 *     zones: [...],
 *     junctions: [...],
 *     primers: [...],
 *     libraryEntries: [...],
 *     notebookEntries: [...],
 *     attachmentsManifest: {},
 *     externalRefs: [],
 *     extensions: {},
 *     positions: {},
 *   }
 * @param {object} [options]
 * @param {'project'|'assembly'|'container'} [options.exportType='project']
 * @param {'full'|'public-supp'|'containers-bundle'|'single-assembly'|'custom'} [options.exportProfile='full']
 * @param {string} [options.singleAssemblyZoneId] — restrict to this zone.
 * @param {string} [options.appVersion]
 */
export async function writeBodgeV2(state, options = {}) {
  if (!state || typeof state !== 'object') {
    throw new Error('writeBodgeV2: state required');
  }
  const exportType = options.exportType || 'project';
  const exportProfile = options.exportProfile || 'full';
  const appVersion = options.appVersion || state.projectMeta?.appVersion || CURRENT_APP_VERSION;
  const projectMeta = state.projectMeta || {};
  const manifest = buildManifestV2({
    appVersion,
    exportType,
    exportProfile,
    title: projectMeta.name || '',
    description: projectMeta.description || '',
    tags: projectMeta.tags || [],
    author: projectMeta.author || { name: '', deviceId: '' },
    createdAt: projectMeta.createdAt,
    updatedAt: new Date().toISOString(),
  });

  const files = {};
  // Filtering for single-assembly export (K11 uses this path).
  const zoneFilter = exportType === 'assembly' && options.singleAssemblyZoneId
    ? new Set([options.singleAssemblyZoneId])
    : null;

  // 1. Containers — each as containers/<id>.gb.
  const containers = Array.isArray(state.containers) ? state.containers : [];
  for (const c of containers) {
    if (!c?.id) continue;
    const gb = writeContainerToGenBank(c);
    const path = `containers/${c.id}.gb`;
    files[path] = [strToU8(gb), { level: 6 }];
    await addAssetV2(manifest, {
      path,
      content: gb,
      kind: 'container',
      displayName: c.name || c.id,
      compression: 'deflate',
    });
  }

  // 2. Assemblies — one per zone.
  const zones = Array.isArray(state.zones) ? state.zones : [];
  const pieces = Array.isArray(state.pieces) ? state.pieces : [];
  const operations = Array.isArray(state.operations) ? state.operations : [];
  const junctions = Array.isArray(state.junctions) ? state.junctions : [];
  const positionsMap = state.positions || {};
  const assembliesMap = new Map();
  for (const z of zones) {
    if (!z?.id) continue;
    if (zoneFilter && !zoneFilter.has(z.id)) continue;
    const zonePieces = pieces.filter(p => p.zoneId === z.id);
    const zoneOps = operations.filter(o => o.zoneId === z.id);
    const zoneJunctions = junctions.filter(j => {
      const left = pieces.find(p => p.id === j.leftPieceId);
      const right = pieces.find(p => p.id === j.rightPieceId);
      return (left && left.zoneId === z.id) || (right && right.zoneId === z.id);
    });
    const zonePositions = {};
    for (const [k, v] of Object.entries(positionsMap[z.id] || {})) {
      zonePositions[k] = v;
    }
    const json = writeAssemblyJson({
      zone: z,
      pieces: zonePieces,
      operations: zoneOps,
      junctions: zoneJunctions,
      positions: zonePositions,
    });
    const path = `assemblies/${z.id}.json`;
    files[path] = [strToU8(json), { level: 6 }];
    await addAssetV2(manifest, {
      path, content: json, kind: 'assembly', displayName: z.name || z.id,
    });
    assembliesMap.set(z.id, JSON.parse(json));
  }

  // 3. Primer pool.
  const primers = Array.isArray(state.primers) ? state.primers : [];
  if (primers.length || projectMeta.id) {
    const poolJson = writePrimerPool(primers, projectMeta.id || 'unknown');
    const path = 'primers/pool.json';
    files[path] = [strToU8(poolJson), { level: 6 }];
    await addAssetV2(manifest, { path, content: poolJson, kind: 'primer-pool' });
  }

  // 4. Library entries.
  const libraryEntries = Array.isArray(state.libraryEntries) ? state.libraryEntries : [];
  if (libraryEntries.length) {
    const libJson = JSON.stringify(libraryEntries, null, 2);
    const path = 'library/entries.json';
    files[path] = [strToU8(libJson), { level: 6 }];
    await addAssetV2(manifest, { path, content: libJson, kind: 'library' });
  }

  // 5. Notebook entries + attachments (M-FORMAT-V2-NOTEBOOK K17 fills
  // the attachments side; CORE already wrote the entries.json shell).
  const notebookEntries = Array.isArray(state.notebookEntries) ? state.notebookEntries : [];
  const attachmentsManifest = state.attachmentsManifest || {};
  const runtimeAttachments = state.attachments; // Map<attId, {blob, manifest}>
  if (notebookEntries.length || Object.keys(attachmentsManifest).length || (runtimeAttachments?.size > 0)) {
    // Merge runtime attachment manifests into attachmentsManifest (some
    // attachments may only exist runtime-only when biolog has uploaded
    // them mid-session without yet saving). Shallow-merge so persistent
    // manifest fields aren't clobbered by minimal runtime stubs.
    const mergedManifest = { ...attachmentsManifest };
    if (runtimeAttachments?.forEach) {
      runtimeAttachments.forEach((att, attId) => {
        if (att?.manifest) {
          mergedManifest[attId] = { ...(mergedManifest[attId] || {}), ...att.manifest };
        } else if (!mergedManifest[attId]) {
          mergedManifest[attId] = {};
        }
      });
    }
    const nbJson = JSON.stringify({
      entries: notebookEntries,
      attachmentsManifest: mergedManifest,
    }, null, 2);
    const path = 'notebook/entries.json';
    files[path] = [strToU8(nbJson), { level: 6 }];
    await addAssetV2(manifest, { path, content: nbJson, kind: 'notebook-entries' });

    // Write each attachment's bytes to notebook/attachments/<attId>.<ext>.
    // STORE compression for already-compressed binaries (PNG/JPEG/AB1/PDF),
    // DEFLATE for raw bytes (rare).
    for (const [attId, meta] of Object.entries(mergedManifest)) {
      const ext = filenameFromMime(meta.mimeType);
      const attPath = `notebook/attachments/${attId}.${ext}`;
      const bytes = await resolveAttachmentBytes(attId, state);
      if (!bytes) continue; // missing — manifest has metadata only
      const compression = isAlreadyCompressedMime(meta.mimeType) ? 'store' : 'deflate';
      files[attPath] = [bytes, { level: compression === 'store' ? 0 : 6 }];
      await addAssetV2(manifest, {
        path: attPath,
        content: bytes,
        kind: kindFromMime(meta.mimeType),
        displayName: meta.displayName || attId,
        mimeType: meta.mimeType,
        compression,
      });
    }
  }

  // 6. External refs (refs/external.json).
  const externalRefs = Array.isArray(state.externalRefs) ? state.externalRefs : [];
  if (externalRefs.length) {
    const refsJson = JSON.stringify({
      $schema: 'https://bodgegene.dev/schema/bodge-external-refs-v2.json',
      refs: externalRefs,
    }, null, 2);
    const path = 'refs/external.json';
    files[path] = [strToU8(refsJson), { level: 6 }];
    await addAssetV2(manifest, { path, content: refsJson, kind: 'ref' });
  }

  // 7. Extensions — bit-perfect preserve.
  const extensions = state.extensions || {};
  for (const [vendor, vendorFiles] of Object.entries(extensions)) {
    if (!vendorFiles || typeof vendorFiles !== 'object') continue;
    for (const [relPath, blob] of Object.entries(vendorFiles)) {
      if (blob == null) continue;
      const path = `extensions/${vendor}/${relPath}`;
      const bytes = typeof blob === 'string' ? strToU8(blob) : new Uint8Array(blob);
      files[path] = [bytes, { level: 6 }];
      await addAssetV2(manifest, { path, content: bytes, kind: 'extension' });
    }
    // Track vendor in manifest.extensions map.
    manifest.extensions[vendor] = manifest.extensions[vendor] || { version: '1.0.0', files: [] };
    manifest.extensions[vendor].files = Object.keys(vendorFiles).map(p => `extensions/${vendor}/${p}`);
  }

  // 8. project.json — lightweight metadata.
  const projectJsonObj = {
    $schema: 'https://bodgegene.dev/schema/bodge-project-v2.json',
    id: projectMeta.id || '',
    name: projectMeta.name || '',
    createdAt: projectMeta.createdAt || manifest.metadata.createdAt,
    updatedAt: manifest.metadata.updatedAt,
    focusedZoneId: projectMeta.focusedZoneId || null,
    labels: projectMeta.labels || {},
    ui: projectMeta.ui || {},
  };
  const projectJsonStr = JSON.stringify(projectJsonObj, null, 2);
  files['project.json'] = [strToU8(projectJsonStr), { level: 6 }];
  await addAssetV2(manifest, {
    path: 'project.json', content: projectJsonStr, kind: 'project-meta',
  });

  // 9. README.md — generated last so it sees the full manifest.
  const readme = buildReadme({
    manifest,
    projectMeta,
    assembliesMap,
    containers,
    primerPool: { primers },
    notebookEntries,
    attachmentsManifest,
  });
  files['README.md'] = [strToU8(readme), { level: 6 }];
  await addAssetV2(manifest, { path: 'README.md', content: readme, kind: 'readme' });

  // 10. public-supp profile: strip telemetry.
  if (exportProfile === 'public-supp') {
    stripDeviceId(manifest);
  }

  // 11. manifest.json — sha256s already populated.
  const manifestJsonStr = JSON.stringify(manifest, null, 2);
  files['manifest.json'] = [strToU8(manifestJsonStr), { level: 6 }];

  // 12. _recovery.json — parallel index of (path, sha256, size).
  const recoveryIndex = {
    version: BODGE_V2_FILE_FORMAT_VERSION,
    files: [
      { path: 'manifest.json', sha256: await sha256Hex(manifestJsonStr), size: manifestJsonStr.length },
      ...Object.entries(manifest.assets).map(([path, a]) => ({ path, sha256: a.sha256, size: a.size })),
    ],
  };
  const recoveryStr = JSON.stringify(recoveryIndex, null, 2);
  files['_recovery.json'] = [strToU8(recoveryStr), { level: 6 }];

  const zipped = zipSync(files);
  return new Blob([zipped], { type: 'application/zip' });
}

// ---- writeBodge dispatcher -------------------------------------------------

export function writeBodge(input, opts = {}) {
  if (!input || typeof input !== 'object') {
    throw new Error('writeBodge: input is required');
  }
  // Canonical v2 state shape — distinguished by presence of `containers`
  // as an array. (v1 projectSlice uses `containerIds: string[]` instead.)
  if (Array.isArray(input.containers)) {
    return writeBodgeV2(input, opts);
  }
  return writeBodgeV1(input, opts);
}

// ---- writeBodgeV2 helpers --------------------------------------------------

function filenameFromMime(mimeType) {
  // Delegates to bodge-attachments.attachmentFilename for canonical mapping
  // (PNG → .png, JPEG → .jpg, AB1 → .ab1, etc.).
  const fn = attachmentFilename('att', mimeType || '');
  const m = /\.([a-z0-9]+)$/i.exec(fn);
  return m ? m[1] : 'bin';
}

function isAlreadyCompressedMime(mimeType) {
  if (!mimeType) return false;
  const m = mimeType.toLowerCase();
  return (
    m.startsWith('image/')
    || m === 'application/pdf'
    || m === 'chemical/x-ab1'
    || m.startsWith('audio/')
    || m.startsWith('video/')
    || m === 'application/zip'
  );
}

function kindFromMime(mimeType) {
  if (!mimeType) return 'attachment-other';
  const m = mimeType.toLowerCase();
  if (m.startsWith('image/')) return 'attachment-image';
  if (m === 'chemical/x-ab1') return 'attachment-sanger';
  if (m === 'application/pdf') return 'attachment-pdf';
  return 'attachment-other';
}

async function resolveAttachmentBytes(attId, state) {
  // Prefer runtime blob from state.attachments map (Map<attId, {blob, manifest}>).
  if (state?.attachments?.get) {
    const att = state.attachments.get(attId);
    if (att?.blob) {
      const buf = await att.blob.arrayBuffer();
      return new Uint8Array(buf);
    }
    if (att?.bytes instanceof Uint8Array) return att.bytes;
  }
  // Fallback to attachmentsBlobs Map provided directly by caller (e.g.
  // when round-tripping without runtime blob URLs in test env).
  if (state?.attachmentsBlobs?.get) {
    const bytes = state.attachmentsBlobs.get(attId);
    if (bytes instanceof Uint8Array) return bytes;
  }
  return null;
}

// ---- v1 reader (unchanged behavior) ----------------------------------------

async function readBodgeV1(entries) {
  let manifest;
  let project;
  try {
    manifest = JSON.parse(strFromU8(entries['manifest.json']));
  } catch (e) {
    throw new Error(`manifest.json не парсится как JSON: ${e.message}`);
  }
  if (!entries['project.json']) {
    throw new Error('Не удалось прочитать .bodge: отсутствует project.json');
  }
  try {
    project = JSON.parse(strFromU8(entries['project.json']));
  } catch (e) {
    throw new Error(`project.json не парсится как JSON: ${e.message}`);
  }
  const warnings = [];
  let libraryEntries = [];
  if (entries['library/entries.json']) {
    try {
      const parsed = JSON.parse(strFromU8(entries['library/entries.json']));
      if (Array.isArray(parsed)) {
        libraryEntries = parsed;
      } else {
        warnings.push('library/entries.json: ожидался массив, получено не-массив — раздел проигнорирован.');
      }
    } catch (e) {
      warnings.push(`library/entries.json не парсится как JSON: ${e.message}`);
    }
  }
  for (const path of Object.keys(entries)) {
    if (path === 'manifest.json' || path === 'project.json') continue;
    if (path === 'library/entries.json') continue;
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
  return { manifest, project, libraryEntries, warnings, formatVersion: '1.0.0' };
}

// ---- v2 reader -------------------------------------------------------------

export async function readBodgeV2(entries) {
  let manifest;
  try {
    manifest = JSON.parse(strFromU8(entries['manifest.json']));
  } catch (e) {
    throw new Error(`manifest.json не парсится как JSON: ${e.message}`);
  }
  const mv = validateManifestV2(manifest);
  if (!mv.ok) {
    throw new Error(`manifest validation failed: ${mv.errors.join(', ')}`);
  }
  const warnings = [];

  // 1. Containers (containers/*.gb).
  const containers = [];
  for (const path of Object.keys(entries)) {
    if (!path.startsWith('containers/') || !path.endsWith('.gb')) continue;
    try {
      const gbStr = strFromU8(entries[path]);
      const c = readContainerFromGenBank(gbStr);
      containers.push(c);
    } catch (e) {
      warnings.push(`container "${path}" parse failed: ${e.message}`);
    }
  }

  // 2. Assemblies (assemblies/*.json).
  const assemblies = [];
  for (const path of Object.keys(entries)) {
    if (!path.startsWith('assemblies/') || !path.endsWith('.json')) continue;
    try {
      const a = readAssemblyJson(strFromU8(entries[path]));
      assemblies.push(a);
    } catch (e) {
      warnings.push(`assembly "${path}" parse failed: ${e.message}`);
    }
  }
  // Cross-ref check — soft (warnings).
  const containerIds = new Set(containers.map(c => c.id));
  const allPieceIds = new Set();
  for (const a of assemblies) for (const p of a.pieces) allPieceIds.add(p.id);
  for (const a of assemblies) {
    const w = checkAssemblyOrphans(a, { containerIds, pieceIds: allPieceIds });
    for (const m of w) warnings.push(`assembly ${a.id}: ${m}`);
  }

  // 3. Primer pool.
  let primers = [];
  if (entries['primers/pool.json']) {
    try {
      const poolStr = strFromU8(entries['primers/pool.json']);
      const r = await readPrimerPool(poolStr, []);
      primers = r.pool;
      for (const w of r.warnings) warnings.push(`primers: ${w}`);
    } catch (e) {
      warnings.push(`primers/pool.json parse failed: ${e.message}`);
    }
  }

  // 4. Library entries.
  let libraryEntries = [];
  if (entries['library/entries.json']) {
    try {
      const parsed = JSON.parse(strFromU8(entries['library/entries.json']));
      if (Array.isArray(parsed)) libraryEntries = parsed;
      else warnings.push('library/entries.json: expected array');
    } catch (e) {
      warnings.push(`library/entries.json: ${e.message}`);
    }
  }

  // 5. Notebook entries + attachment raw bytes.
  let notebookEntries = [];
  let attachmentsManifest = {};
  let attachmentsBlobs = new Map(); // Map<attId, Uint8Array>
  if (entries['notebook/entries.json']) {
    try {
      const parsed = JSON.parse(strFromU8(entries['notebook/entries.json']));
      notebookEntries = Array.isArray(parsed.entries) ? parsed.entries : [];
      attachmentsManifest = parsed.attachmentsManifest || {};
    } catch (e) {
      warnings.push(`notebook/entries.json: ${e.message}`);
    }
  }
  // Collect raw bytes for every notebook/attachments/* entry. Runtime
  // layer (bodge-attachments.loadAttachments) turns these into blob URLs.
  for (const path of Object.keys(entries)) {
    if (!path.startsWith('notebook/attachments/')) continue;
    const filename = path.slice('notebook/attachments/'.length);
    const attId = filename.replace(/\.[a-zA-Z0-9]+$/, '');
    attachmentsBlobs.set(attId, entries[path]);
    // Detect orphan attachment: bytes present but manifest entry missing.
    if (!attachmentsManifest[attId]) {
      warnings.push(`notebook attachment "${path}" present but missing from attachmentsManifest`);
    }
  }
  // Detect orphan manifest: manifest entry present but bytes missing.
  for (const attId of Object.keys(attachmentsManifest)) {
    if (!attachmentsBlobs.has(attId)) {
      warnings.push(`notebook attachment "${attId}" listed in manifest but bytes missing from ZIP`);
    }
  }

  // 6. External refs.
  let externalRefs = [];
  if (entries['refs/external.json']) {
    try {
      const parsed = JSON.parse(strFromU8(entries['refs/external.json']));
      externalRefs = Array.isArray(parsed.refs) ? parsed.refs : [];
    } catch (e) {
      warnings.push(`refs/external.json: ${e.message}`);
    }
  }

  // 7. Extensions.
  const extensions = {};
  for (const path of Object.keys(entries)) {
    if (!path.startsWith('extensions/')) continue;
    const rest = path.slice('extensions/'.length);
    const slashIdx = rest.indexOf('/');
    if (slashIdx < 0) continue;
    const vendor = rest.slice(0, slashIdx);
    const relPath = rest.slice(slashIdx + 1);
    if (!extensions[vendor]) extensions[vendor] = {};
    // Preserve bit-perfect — keep raw bytes.
    extensions[vendor][relPath] = entries[path];
  }

  // 8. project.json metadata.
  let projectMeta = {};
  if (entries['project.json']) {
    try {
      projectMeta = JSON.parse(strFromU8(entries['project.json']));
    } catch (e) {
      warnings.push(`project.json: ${e.message}`);
    }
  }

  // Reconstruct the canonical state aggregating per-assembly slices.
  const piecesAcc = [];
  const operationsAcc = [];
  const junctionsAcc = [];
  const zonesAcc = [];
  const positionsAcc = {};
  for (const a of assemblies) {
    zonesAcc.push(a.zone);
    for (const p of a.pieces) piecesAcc.push(p);
    for (const o of a.operations) operationsAcc.push(o);
    for (const j of a.junctions) junctionsAcc.push(j);
    if (a.positions) positionsAcc[a.id] = a.positions;
  }

  const state = {
    projectMeta,
    containers,
    pieces: piecesAcc,
    operations: operationsAcc,
    zones: zonesAcc,
    junctions: junctionsAcc,
    // A2 — positions were accumulated but never returned (layout lost on read of
    // externally-authored files; our own files restore the flat map losslessly
    // from the embedded skeleton snapshot).
    positions: positionsAcc,
    primers,
    libraryEntries,
    notebookEntries,
    attachmentsManifest,
    attachmentsBlobs, // raw bytes; runtime layer wraps into blob URLs
    externalRefs,
    extensions,
  };

  return {
    manifest,
    state,
    project: projectMeta, // back-compat alias
    libraryEntries,
    warnings,
    formatVersion: BODGE_V2_FILE_FORMAT_VERSION,
  };
}

// ---- readBodge dispatcher --------------------------------------------------

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
  // Peek manifest to dispatch.
  let manifest;
  try {
    manifest = JSON.parse(strFromU8(entries['manifest.json']));
  } catch (e) {
    throw new Error(`manifest.json не парсится как JSON: ${e.message}`);
  }
  if (isBodgeV2Manifest(manifest)) {
    return readBodgeV2(entries);
  }
  return readBodgeV1(entries);
}
