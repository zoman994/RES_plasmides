/**
 * bodge-manifest-v2 — manifest.json builder + validator for .bodge v2.
 *
 * Manifest is the catalog at the root of every v2 ZIP. It carries:
 *   - magic signature ("BODGE-V2") for quick detection.
 *   - fileFormatVersion (semver, "2.0.0").
 *   - exportType / exportProfile (writer-side metadata).
 *   - per-asset sha256 + size + displayName + kind.
 *   - refs map for quick UI lookup (containers / assemblies / primerPool / ...).
 *   - extensions map (bit-perfect vendor preserve, see K12).
 *
 * Pure data layer — no DOM, no zip IO. Validated against
 * schemas/bodge-manifest-v2.json (Ajv-compatible).
 */
import { sha256Hex } from './bodge-hash';

export const BODGE_V2_SIGNATURE = 'BODGE-V2';
export const BODGE_V2_FILE_FORMAT_VERSION = '2.0.0';

export const ASSET_KINDS = new Set([
  'container',
  'assembly',
  'primer-pool',
  'notebook-entries',
  'attachment-image',
  'attachment-sanger',
  'attachment-pdf',
  'attachment-other',
  'library',
  'ref',
  'extension',
  'readme',
  'recovery-index',
  'project-meta',
]);

export const EXPORT_TYPES = new Set(['project', 'assembly', 'container']);
export const EXPORT_PROFILES = new Set([
  'full',
  'public-supp',
  'containers-bundle',
  'single-assembly',
  'custom',
]);

const COMPRESSION_MODES = new Set(['deflate', 'store']);

/**
 * Build a fresh v2 manifest skeleton. No assets yet — caller adds them
 * via `addAsset(manifest, ...)` as content is written.
 */
export function buildManifest({
  appVersion,
  exportType = 'project',
  exportProfile = 'full',
  title = '',
  description = '',
  tags = [],
  author = { name: '', deviceId: '' },
  createdAt = null,
  updatedAt = null,
} = {}) {
  if (!appVersion || typeof appVersion !== 'string') {
    throw new Error('buildManifest: appVersion required');
  }
  if (!EXPORT_TYPES.has(exportType)) {
    throw new Error(`buildManifest: invalid exportType "${exportType}"`);
  }
  if (!EXPORT_PROFILES.has(exportProfile)) {
    throw new Error(`buildManifest: invalid exportProfile "${exportProfile}"`);
  }
  const now = new Date().toISOString();
  return {
    $schema: 'https://bodgegene.dev/schema/bodge-manifest-v2.json',
    signature: BODGE_V2_SIGNATURE,
    fileFormatVersion: BODGE_V2_FILE_FORMAT_VERSION,
    appVersion,
    exportType,
    exportProfile,
    metadata: {
      createdAt: createdAt || now,
      updatedAt: updatedAt || now,
      title,
      description,
      tags: Array.isArray(tags) ? [...tags] : [],
      author: {
        name: author?.name || '',
        deviceId: author?.deviceId || '',
      },
    },
    assets: {},
    refs: {
      containers: [],
      assemblies: [],
      primerPool: null,
      notebook: null,
      library: null,
      projectDag: null,
    },
    extensions: {},
  };
}

/**
 * Add an asset record to the manifest. Mutates manifest in place; also
 * returns it for chaining. `content` may be a Uint8Array or a string;
 * sha256 + size are computed.
 *
 * The manifest does NOT carry the asset bytes themselves — those live in
 * the ZIP next to manifest.json. This call only records the descriptor.
 */
export async function addAsset(manifest, {
  path,
  content,
  displayName = '',
  mimeType = '',
  kind,
  compression = 'deflate',
}) {
  if (!manifest || typeof manifest !== 'object') {
    throw new Error('addAsset: manifest required');
  }
  if (!path || typeof path !== 'string') {
    throw new Error('addAsset: path required');
  }
  if (!ASSET_KINDS.has(kind)) {
    throw new Error(`addAsset: unknown kind "${kind}"`);
  }
  if (!COMPRESSION_MODES.has(compression)) {
    throw new Error(`addAsset: invalid compression "${compression}"`);
  }
  const bytes = content instanceof Uint8Array
    ? content
    : new TextEncoder().encode(String(content ?? ''));
  const hash = await sha256Hex(bytes);
  manifest.assets[path] = {
    sha256: hash,
    size: bytes.byteLength,
    compression,
    displayName: displayName || pathDefaultDisplay(path),
    mimeType: mimeType || inferMimeType(path),
    kind,
  };
  // Cross-update refs map for convenience.
  if (kind === 'container') {
    const id = extractIdFromPath(path);
    if (id && !manifest.refs.containers.includes(id)) {
      manifest.refs.containers.push(id);
    }
  } else if (kind === 'assembly') {
    const id = extractIdFromPath(path);
    if (id && !manifest.refs.assemblies.includes(id)) {
      manifest.refs.assemblies.push(id);
    }
  } else if (kind === 'primer-pool') {
    manifest.refs.primerPool = path;
  } else if (kind === 'notebook-entries') {
    manifest.refs.notebook = path;
  } else if (kind === 'library') {
    manifest.refs.library = path;
  }
  return manifest;
}

function pathDefaultDisplay(path) {
  const last = path.split('/').pop() || path;
  return last.replace(/\.(gb|json|md|png|jpg|pdf|ab1)$/i, '');
}

function inferMimeType(path) {
  const lower = path.toLowerCase();
  if (lower.endsWith('.gb')) return 'chemical/seq-na-genbank';
  if (lower.endsWith('.json')) return 'application/json';
  if (lower.endsWith('.md')) return 'text/markdown';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.ab1')) return 'chemical/seq-na-chromatogram';
  return 'application/octet-stream';
}

function extractIdFromPath(path) {
  // containers/c01XYZ.gb → c01XYZ. assemblies/zn01ABC.json → zn01ABC.
  const last = path.split('/').pop() || '';
  return last.replace(/\.(gb|json)$/i, '');
}

/**
 * Validate a manifest object. Returns `{ok, errors}`. Light validator —
 * the JSON Schema file is the authoritative source for external consumers;
 * this helper is the inline gate used by reader/writer.
 */
export function validateManifest(manifest) {
  const errors = [];
  if (!manifest || typeof manifest !== 'object') {
    return { ok: false, errors: ['manifest is not an object'] };
  }
  if (manifest.signature !== BODGE_V2_SIGNATURE) {
    errors.push(`signature must be "${BODGE_V2_SIGNATURE}", got "${manifest.signature}"`);
  }
  if (typeof manifest.fileFormatVersion !== 'string'
      || !/^\d+\.\d+\.\d+$/.test(manifest.fileFormatVersion)) {
    errors.push('fileFormatVersion must be semver string');
  }
  if (typeof manifest.appVersion !== 'string' || !manifest.appVersion) {
    errors.push('appVersion required (string)');
  }
  if (!EXPORT_TYPES.has(manifest.exportType)) {
    errors.push(`exportType invalid: "${manifest.exportType}"`);
  }
  if (!EXPORT_PROFILES.has(manifest.exportProfile)) {
    errors.push(`exportProfile invalid: "${manifest.exportProfile}"`);
  }
  if (!manifest.metadata || typeof manifest.metadata !== 'object') {
    errors.push('metadata object required');
  } else {
    if (typeof manifest.metadata.createdAt !== 'string') errors.push('metadata.createdAt required');
    if (typeof manifest.metadata.updatedAt !== 'string') errors.push('metadata.updatedAt required');
    if (!Array.isArray(manifest.metadata.tags)) errors.push('metadata.tags must be array');
  }
  if (!manifest.assets || typeof manifest.assets !== 'object') {
    errors.push('assets map required');
  } else {
    for (const [path, asset] of Object.entries(manifest.assets)) {
      if (!asset || typeof asset !== 'object') {
        errors.push(`asset "${path}" not an object`);
        continue;
      }
      if (typeof asset.sha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(asset.sha256)) {
        errors.push(`asset "${path}" sha256 invalid`);
      }
      if (typeof asset.size !== 'number' || asset.size < 0) {
        errors.push(`asset "${path}" size invalid`);
      }
      if (!ASSET_KINDS.has(asset.kind)) {
        errors.push(`asset "${path}" kind invalid: "${asset.kind}"`);
      }
      if (!COMPRESSION_MODES.has(asset.compression)) {
        errors.push(`asset "${path}" compression invalid: "${asset.compression}"`);
      }
    }
  }
  if (!manifest.refs || typeof manifest.refs !== 'object') errors.push('refs map required');
  if (!manifest.extensions || typeof manifest.extensions !== 'object') {
    errors.push('extensions map required');
  }
  return { ok: errors.length === 0, errors };
}

/** Quick detection — is this a v2 manifest? */
export function isBodgeV2Manifest(manifest) {
  return manifest?.signature === BODGE_V2_SIGNATURE;
}

/** Strip metadata.author.deviceId for public-supp profile export. */
export function stripDeviceId(manifest) {
  if (manifest?.metadata?.author) {
    manifest.metadata.author.deviceId = '';
  }
  return manifest;
}
