/**
 * bodge-migrations/v1-to-v2 — convert a v1 .bodge blob to v2.
 *
 * K1 ships the skeleton: detect v1, pass through with a marker. K8 fills
 * in the real pipeline (§11.2):
 *   1. Read v1 manifest + project.json + library/entries.json.
 *   2. Split state into v2 sections (containers/.gb, assemblies/<id>.json,
 *      primers/pool.json, notebook/, library/, refs/).
 *   3. Build v2 manifest with per-asset sha256 + displayName + kind.
 *   4. Write v2 ZIP.
 *   5. Optional: caller does atomic rename + .v1-backup.
 *
 * The skeleton's contract is preserved across K1 → K8: same entry-point
 * signature, same idempotency rule (running on a v2 blob returns it
 * unchanged), same error shape on hard failure.
 */
import { unzipSync, strFromU8 } from 'fflate';
import { BODGE_V2_FILE_FORMAT_VERSION, isBodgeV2Manifest } from '../bodge-manifest-v2';

const V1_SIGNATURE = null; // v1 had no signature field — detected by `fileFormatVersion: 1`.

/**
 * Read a v1 .bodge blob and return the raw v1 state object
 * `{manifest, project, libraryEntries}`. Used by both K8 migrator and
 * K7 reader fallback. NOT a full v1 reader — only the legacy shape.
 */
export async function readV1Sections(blob) {
  if (!blob) throw new Error('readV1Sections: blob required');
  const buf = blob instanceof ArrayBuffer ? blob : await blob.arrayBuffer();
  const entries = unzipSync(new Uint8Array(buf));
  if (!entries['manifest.json']) {
    throw new Error('v1 .bodge: manifest.json missing');
  }
  if (!entries['project.json']) {
    throw new Error('v1 .bodge: project.json missing');
  }
  const manifest = JSON.parse(strFromU8(entries['manifest.json']));
  const project = JSON.parse(strFromU8(entries['project.json']));
  let libraryEntries = [];
  if (entries['library/entries.json']) {
    try {
      const parsed = JSON.parse(strFromU8(entries['library/entries.json']));
      if (Array.isArray(parsed)) libraryEntries = parsed;
    } catch {
      // Skip malformed library, K8 toast handles.
    }
  }
  return { manifest, project, libraryEntries };
}

/**
 * Detect file format version from a parsed manifest.
 * - v2: `signature: "BODGE-V2"`.
 * - v1: no signature, fileFormatVersion: 1 (legacy ManifestV1).
 */
export function detectFormatVersion(manifest) {
  if (!manifest || typeof manifest !== 'object') return 'unknown';
  if (isBodgeV2Manifest(manifest)) return BODGE_V2_FILE_FORMAT_VERSION;
  if (manifest.fileFormatVersion === 1) return '1.0.0';
  if (typeof manifest.fileFormatVersion === 'string') return manifest.fileFormatVersion;
  return 'unknown';
}

/**
 * v1 → v2 migration entry-point.
 *
 * K1 placeholder: returns the input blob unchanged with a flag noting
 * that K8 will fill in the real splitter. The flag is stored on the
 * function object so the registry can advertise readiness:
 *   migrateBodgeV1toV2.skeletonOnly === true
 *
 * K8 will replace the body to:
 *   1. readV1Sections(blob).
 *   2. Build v2 sections via lib/bodge-container-genbank,
 *      lib/bodge-assembly-json, lib/bodge-primers-json.
 *   3. Build v2 manifest via lib/bodge-manifest-v2.
 *   4. Pack via lib/bodge-zip.writeBodgeV2(...).
 *   5. Return the new Blob.
 */
export async function migrateBodgeV1toV2(blob) {
  if (!blob) throw new Error('migrateBodgeV1toV2: blob required');
  // K1 skeleton: stash the parsed v1 sections so a caller can probe the
  // migration is at least wired. Real splitter follows in K8.
  const sections = await readV1Sections(blob);
  // Idempotency probe: if input is already v2, no-op.
  if (detectFormatVersion(sections.manifest) === BODGE_V2_FILE_FORMAT_VERSION) {
    return blob;
  }
  // K8 will produce a real v2 blob here; for now expose the parsed
  // sections so tests / callers can verify the migration is reached.
  const result = blob;
  // eslint-disable-next-line no-underscore-dangle
  result._v1Sections = sections;
  return result;
}

// eslint-disable-next-line no-underscore-dangle
migrateBodgeV1toV2.skeletonOnly = true;
migrateBodgeV1toV2.targetVersion = BODGE_V2_FILE_FORMAT_VERSION;

export { V1_SIGNATURE };
