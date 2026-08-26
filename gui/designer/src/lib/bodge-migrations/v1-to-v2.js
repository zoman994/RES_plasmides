/**
 * bodge-migrations/v1-to-v2 — convert a v1 .bodge blob to v2.
 *
 * Spec §11 — atomic, idempotent, lossless-where-possible, lossy points
 * documented inline.
 *
 * v1 .bodge format (as shipped through v0.8.3-alpha) contained ONLY:
 *   - manifest.json (legacy shape)
 *   - project.json (full state-blob)
 *   - library/entries.json (optional)
 * The promised v1 sections (containers/, primers/, refs/) were never
 * implemented — readBodgeV1 emits warnings on them but the writer never
 * produced them. Migration therefore:
 *   - Marshals projectSlice metadata → v2 projectMeta.
 *   - Preserves libraryEntries verbatim.
 *   - Emits empty containers/pieces/operations/zones unless the v1 file
 *     happened to carry them (lossy: §11.4 "loose containers" toast).
 *   - Calls writeBodgeV2 to produce the new blob.
 */
import { unzipSync, strFromU8 } from 'fflate';
import { BODGE_V2_FILE_FORMAT_VERSION, isBodgeV2Manifest } from '../bodge-manifest-v2';
import { writeBodgeV2 } from '../bodge-zip';
import { APP_VERSION as CURRENT_APP_VERSION } from '../version';

const V1_SIGNATURE = null;

/**
 * Read a v1 .bodge blob and return the raw v1 state object
 * `{manifest, project, libraryEntries}`. Used by both K8 migrator and
 * K7 reader fallback.
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
 */
export function detectFormatVersion(manifest) {
  if (!manifest || typeof manifest !== 'object') return 'unknown';
  if (isBodgeV2Manifest(manifest)) return BODGE_V2_FILE_FORMAT_VERSION;
  if (manifest.fileFormatVersion === 1) return '1.0.0';
  if (typeof manifest.fileFormatVersion === 'string') return manifest.fileFormatVersion;
  return 'unknown';
}

function normalizeLegacyContainerTopology(container) {
  if (!container || typeof container !== 'object') return container;
  const topology = container.topology;
  if (!topology || typeof topology !== 'object'
      || typeof topology.circular !== 'boolean') return container;
  return {
    ...container,
    topology: topology.circular ? 'circular' : 'linear',
  };
}

/**
 * Marshal a v1 projectSlice into the canonical v2 state shape.
 * Containers/pieces/operations/zones may be present if the v1 file
 * carried them inline (post-T3-revert v0.8.x); otherwise empty arrays
 * (§11.4 loose-containers toast).
 */
export function marshalV1ProjectToCanonicalState(v1Project, libraryEntries) {
  const projectMeta = {
    id: v1Project.id || '',
    name: v1Project.name || 'Migrated project',
    description: v1Project.description || '',
    createdAt: v1Project.createdAt || new Date().toISOString(),
    updatedAt: v1Project.updatedAt || new Date().toISOString(),
    focusedZoneId: v1Project.focusedZoneId || null,
    tags: Array.isArray(v1Project.tags) ? [...v1Project.tags] : [],
    author: {
      name: v1Project.agent?.name || '',
      deviceId: v1Project.agent?.deviceId || '',
    },
    labels: v1Project.labels || {},
    ui: v1Project.ui || {},
  };

  // Pull containers / pieces / operations / zones / junctions / primers
  // if the v1 file happened to carry them inline (some v0.8.x exports
  // embedded skeleton-state into project.json under the same keys).
  const containers = Array.isArray(v1Project.containers)
    ? v1Project.containers.map(normalizeLegacyContainerTopology)
    : [];
  const pieces = Array.isArray(v1Project.pieces) ? v1Project.pieces : [];
  const operations = Array.isArray(v1Project.operations) ? v1Project.operations : [];
  const zones = Array.isArray(v1Project.zones) ? v1Project.zones : [];
  const junctions = Array.isArray(v1Project.junctions) ? v1Project.junctions : [];
  const primers = Array.isArray(v1Project.primers) ? v1Project.primers : [];

  return {
    projectMeta,
    containers,
    pieces,
    operations,
    zones,
    junctions,
    primers,
    libraryEntries: Array.isArray(libraryEntries) ? libraryEntries : [],
    notebookEntries: [],
    attachmentsManifest: {},
    externalRefs: [],
    extensions: {},
    positions: v1Project.positions || {},
  };
}

/**
 * Inspect a v1 state and report whether migration is lossy and why.
 * Used by UI toast in §11.5 ("Файл создан без сборок..." etc.).
 */
export function analyzeMigrationLoss(v1Project) {
  const losses = [];
  const hasZones = Array.isArray(v1Project.zones) && v1Project.zones.length > 0;
  const hasContainers = Array.isArray(v1Project.containers) && v1Project.containers.length > 0;
  if (!hasZones && hasContainers) {
    losses.push({
      kind: 'loose-containers',
      message: 'Файл создан без сборок. Добавьте «+ Сборка» для группировки.',
    });
  }
  if (!hasZones && !hasContainers) {
    losses.push({
      kind: 'empty-project',
      message: 'Проект v1 пустой — только метаданные перенесены в v2.',
    });
  }
  if (Array.isArray(v1Project.projectCommitIds) && v1Project.projectCommitIds.length > 0) {
    losses.push({
      kind: 'plasmid-git-history-missing',
      message: 'История plasmid-git в v1 не хранилась на диске — commits[] будет содержать только import_baseline.',
    });
  }
  return losses;
}

/**
 * v1 → v2 migration entry-point.
 *
 * @param {Blob} blob — v1 .bodge bytes.
 * @param {object} [opts]
 * @param {string} [opts.appVersion] — stamp on the v2 manifest.
 * @returns {Blob} v2 .bodge bytes.
 *
 * Idempotent: re-running on a v2 blob returns it unchanged.
 */
export async function migrateBodgeV1toV2(blob, opts = {}) {
  if (!blob) throw new Error('migrateBodgeV1toV2: blob required');
  const sections = await readV1Sections(blob);
  // Idempotency probe — already v2.
  if (detectFormatVersion(sections.manifest) === BODGE_V2_FILE_FORMAT_VERSION) {
    return blob;
  }
  const state = marshalV1ProjectToCanonicalState(sections.project, sections.libraryEntries);
  const v2Blob = await writeBodgeV2(state, {
    appVersion: opts.appVersion || CURRENT_APP_VERSION,
    exportType: 'project',
    exportProfile: 'full',
  });
  // Stamp migration trace + loss report on the output for UI consumption.
  v2Blob._migrationFrom = '1.0.0';
  v2Blob._migrationLosses = analyzeMigrationLoss(sections.project);
  return v2Blob;
}

migrateBodgeV1toV2.targetVersion = BODGE_V2_FILE_FORMAT_VERSION;

export { V1_SIGNATURE };
