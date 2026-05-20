/**
 * bodge-migrations — registry of v→v migration steps for .bodge files.
 *
 * Each migration is `{ from, to, migrate(blob, manifest) → migratedBlob }`.
 * The runner picks the chain from the file's current version up to
 * BODGE_V2_FILE_FORMAT_VERSION ("2.0.0") and runs them in order.
 *
 * Currently registers v1 → v2 only. Future minor bumps (2.0.0 → 2.1.0,
 * etc.) hook in here without touching the reader/writer.
 *
 * The actual v1→v2 implementation lives in `./v1-to-v2.js`; this index
 * is the lookup table + chain runner so K1 can ship a skeleton before
 * K8 fills in the full pipeline.
 */
import { migrateBodgeV1toV2 } from './v1-to-v2';
import { BODGE_V2_FILE_FORMAT_VERSION } from '../bodge-manifest-v2';

const REGISTRY = [
  {
    from: '1.0.0',
    to: '2.0.0',
    migrate: migrateBodgeV1toV2,
    description: 'v1 single-blob → v2 split sections (containers/.gb + assemblies/.json)',
  },
];

/**
 * Pick the migration chain needed to bring `from` up to `target`.
 * Returns array of registry entries (possibly empty). Throws if no
 * path exists.
 */
export function pickMigrationChain(from, target = BODGE_V2_FILE_FORMAT_VERSION) {
  if (from === target) return [];
  const chain = [];
  let cur = from;
  // Linear walk for now — only one hop registered.
  while (cur !== target) {
    const step = REGISTRY.find(r => r.from === cur);
    if (!step) {
      throw new Error(`No migration path from "${cur}" to "${target}"`);
    }
    chain.push(step);
    cur = step.to;
    if (chain.length > 10) {
      throw new Error('Migration chain too long — possible cycle in registry');
    }
  }
  return chain;
}

/**
 * Run a full migration chain. `blob` is the source bytes; `fromVersion`
 * is detected by the caller (reader). Returns the migrated bytes (Blob).
 */
export async function runMigrationChain(blob, fromVersion, target = BODGE_V2_FILE_FORMAT_VERSION) {
  const chain = pickMigrationChain(fromVersion, target);
  if (chain.length === 0) return blob;
  let current = blob;
  for (const step of chain) {
    current = await step.migrate(current);
  }
  return current;
}

export { REGISTRY as MIGRATION_REGISTRY };
