/**
 * K1 — migration registry skeleton + reference v1 fixture.
 *
 * Full v1→v2 chain test lives in K8 (after K6/K7 ZIP IO is ready).
 * Here we verify:
 *   - Registry is wired (v1 → v2 entry exists).
 *   - pickMigrationChain returns the right hops or fails clearly.
 *   - Reference fixtures load + report version 1.0.0.
 *   - K8-targeted contract holds: `migrateBodgeV1toV2` skeleton runs without
 *     throwing on each reference fixture and stamps `._v1Sections` so a
 *     caller can probe parsed v1 sections before K8 fills in the splitter.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  pickMigrationChain,
  runMigrationChain,
  MIGRATION_REGISTRY,
} from '../bodge-migrations';
import {
  migrateBodgeV1toV2,
  detectFormatVersion,
  readV1Sections,
} from '../bodge-migrations/v1-to-v2';
import { BODGE_V2_FILE_FORMAT_VERSION } from '../bodge-manifest-v2';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const FIXTURE_DIR = resolve(
  __dirname, '..', '..', '__tests__', 'interop', 'fixtures', 'bodge-v1',
);

function loadFixture(name) {
  return readFileSync(resolve(FIXTURE_DIR, name));
}

function bufferToBlob(buf) {
  return new Blob([buf], { type: 'application/zip' });
}

describe('K1 — migration registry', () => {
  it('registers v1 → v2 hop', () => {
    expect(MIGRATION_REGISTRY).toHaveLength(1);
    const [first] = MIGRATION_REGISTRY;
    expect(first.from).toBe('1.0.0');
    expect(first.to).toBe('2.0.0');
    expect(typeof first.migrate).toBe('function');
  });

  it('pickMigrationChain returns [] when already at target', () => {
    expect(pickMigrationChain('2.0.0')).toEqual([]);
  });

  it('pickMigrationChain returns the v1→v2 hop', () => {
    const chain = pickMigrationChain('1.0.0');
    expect(chain).toHaveLength(1);
    expect(chain[0].from).toBe('1.0.0');
    expect(chain[0].to).toBe('2.0.0');
  });

  it('pickMigrationChain throws clearly when no path exists', () => {
    expect(() => pickMigrationChain('0.5.0')).toThrow(/No migration path/);
  });
});

describe('K1 — reference v1 fixtures', () => {
  it('v1-empty.bodge parses + reports version 1.0.0', async () => {
    const buf = loadFixture('v1-empty.bodge');
    const sections = await readV1Sections(bufferToBlob(buf));
    expect(sections.manifest.fileFormatVersion).toBe(1);
    expect(sections.project.name).toBe('Empty v1 project');
    expect(sections.libraryEntries).toEqual([]);
    expect(detectFormatVersion(sections.manifest)).toBe('1.0.0');
  });

  it('v1-with-library.bodge surfaces the library entries', async () => {
    const buf = loadFixture('v1-with-library.bodge');
    const sections = await readV1Sections(bufferToBlob(buf));
    expect(sections.libraryEntries).toHaveLength(1);
    expect(sections.libraryEntries[0].name).toBe('pUC19');
  });
});

describe('K1 — registry hook for v1→v2 (full pipeline in K8 / bodge-migration-v1-to-v2.test)', () => {
  it('migrateBodgeV1toV2.targetVersion === 2.0.0', () => {
    expect(migrateBodgeV1toV2.targetVersion).toBe(BODGE_V2_FILE_FORMAT_VERSION);
  });

  it('migrateBodgeV1toV2 stamps migrationFrom + losses on output (K8 contract)', async () => {
    const buf = loadFixture('v1-with-library.bodge');
    const out = await migrateBodgeV1toV2(bufferToBlob(buf));
    expect(out._migrationFrom).toBe('1.0.0');
    expect(Array.isArray(out._migrationLosses)).toBe(true);
  });

  it('runMigrationChain v1 → v2 returns a blob', async () => {
    const buf = loadFixture('v1-empty.bodge');
    const out = await runMigrationChain(bufferToBlob(buf), '1.0.0');
    expect(out).toBeTruthy();
  });
});
