/**
 * K9 — atomic write + recovery.
 */
import { describe, it, expect } from 'vitest';
import {
  safeWriteBodge,
  detectConcurrentWrite,
  createMemoryFs,
  TMP_SUFFIX_RE,
  BAK_SUFFIX,
} from '../bodge-atomic-write';
import {
  verifyBodgeIntegrity,
  recoverCorruptBodge,
} from '../bodge-recovery';
import { writeBodgeV2 } from '../bodge-zip';

function CANONICAL_STATE() {
  return {
    projectMeta: { id: 'p01', name: 'Test', createdAt: '2026-04-01' },
    containers: [
      {
        id: 'c01', name: 'pET',
        sequence: 'ATGCATATGAAGCTTTAATA',
        topology: 'linear',
        annotations: [{ id: 'a01', name: 'feat', type: 'CDS', start: 0, end: 10, strand: 1 }],
      },
    ],
    pieces: [],
    operations: [],
    zones: [],
    junctions: [],
    primers: [],
    libraryEntries: [],
  };
}

describe('K9 — safeWriteBodge 5-step pattern', () => {
  it('writes a tmp first, verifies, renames to final path', async () => {
    const fs = createMemoryFs();
    const blob = await writeBodgeV2(CANONICAL_STATE());
    const r = await safeWriteBodge('project.bodge', blob, { fs });
    expect(r.ok).toBe(true);
    expect(await fs.exists('project.bodge')).toBe(true);
    // No leftover tmp.
    const tmps = (await fs.list('')).filter(p => TMP_SUFFIX_RE.test(p));
    expect(tmps).toHaveLength(0);
  });

  it('creates .bak when target file already exists', async () => {
    const fs = createMemoryFs();
    const blob = await writeBodgeV2(CANONICAL_STATE());
    await safeWriteBodge('project.bodge', blob, { fs });
    // Second write — should create .bak.
    const blob2 = await writeBodgeV2(CANONICAL_STATE());
    const r2 = await safeWriteBodge('project.bodge', blob2, { fs });
    expect(r2.backupPath).toBe(`project.bodge${BAK_SUFFIX}`);
    expect(await fs.exists(`project.bodge${BAK_SUFFIX}`)).toBe(true);
  });

  it('removes prior .bak before creating new one', async () => {
    const fs = createMemoryFs();
    const blob = await writeBodgeV2(CANONICAL_STATE());
    await safeWriteBodge('project.bodge', blob, { fs });
    await safeWriteBodge('project.bodge', await writeBodgeV2(CANONICAL_STATE()), { fs });
    await safeWriteBodge('project.bodge', await writeBodgeV2(CANONICAL_STATE()), { fs });
    // .bak should still exist (latest) but only one of them.
    const baks = (await fs.list('')).filter(p => p.endsWith(BAK_SUFFIX));
    expect(baks).toHaveLength(1);
  });

  it('fails if integrity check fails (broken manifest sha256)', async () => {
    const fs = createMemoryFs();
    // Inject a "broken" blob via integrity-skip then verify safeWriteBodge
    // throws on a known-bad input.
    const badBlob = new Blob([new Uint8Array([0, 1, 2, 3])]);
    await expect(safeWriteBodge('project.bodge', badBlob, { fs })).rejects.toThrow(/integrity/);
    // No tmp residue.
    const tmps = (await fs.list('')).filter(p => TMP_SUFFIX_RE.test(p));
    expect(tmps).toHaveLength(0);
  });
});

describe('K9 — detectConcurrentWrite', () => {
  it('reports activeWriteInProgress on fresh .writing-*.tmp', async () => {
    const fs = createMemoryFs();
    await fs.write('project.bodge.writing-abc-123.tmp', new Blob(['x']));
    const r = await detectConcurrentWrite('project.bodge', { fs });
    expect(r.activeWriteInProgress).toBe(true);
    expect(r.abandonedTmpFiles).toHaveLength(0);
  });

  it('reports abandonedTmpFiles on stale tmp (>60s old)', async () => {
    const fs = createMemoryFs();
    await fs.write('project.bodge.writing-stale-1.tmp', new Blob(['x']));
    // Mutate mtime backward to make it look stale.
    fs._internalStore.get('project.bodge.writing-stale-1.tmp').mtime = Date.now() - 120_000;
    const r = await detectConcurrentWrite('project.bodge', { fs });
    expect(r.activeWriteInProgress).toBe(false);
    expect(r.abandonedTmpFiles).toContain('project.bodge.writing-stale-1.tmp');
  });

  it('reports backupAvailable on .bak file', async () => {
    const fs = createMemoryFs();
    await fs.write('project.bodge.bak', new Blob(['x']));
    const r = await detectConcurrentWrite('project.bodge', { fs });
    expect(r.backupAvailable).toBe(true);
  });
});

describe('K9 — verifyBodgeIntegrity', () => {
  it('confirms a freshly written v2 blob (all sha256s match)', async () => {
    const blob = await writeBodgeV2(CANONICAL_STATE());
    const r = await verifyBodgeIntegrity(blob);
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it('flags corrupt unzip', async () => {
    const blob = new Blob([new Uint8Array([0, 1, 2, 3, 4])]);
    const r = await verifyBodgeIntegrity(blob);
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/unzip/);
  });

  it('flags missing asset listed in manifest', async () => {
    const blob = await writeBodgeV2(CANONICAL_STATE());
    const { zipSync: zip, unzipSync, strToU8 } = await import('fflate');
    const buf = await blob.arrayBuffer();
    const entries = unzipSync(new Uint8Array(buf));
    // Drop a referenced asset.
    delete entries['containers/c01.gb'];
    const broken = new Blob([zip(entries)]);
    const r = await verifyBodgeIntegrity(broken);
    expect(r.ok).toBe(false);
    expect(r.errors.some(e => /missing from ZIP/.test(e))).toBe(true);
    // Suppress lint unused.
    void strToU8;
  });
});

describe('K9 — recoverCorruptBodge', () => {
  it('returns all files via standard path when ZIP is healthy', async () => {
    const blob = await writeBodgeV2(CANONICAL_STATE());
    const r = await recoverCorruptBodge(blob);
    expect(r.ok).toBe(true);
    expect(r.method).toBe('standard');
    expect(r.recoveredFiles.has('manifest.json')).toBe(true);
  });

  it('falls back to byte-walk when central directory broken', async () => {
    const blob = await writeBodgeV2(CANONICAL_STATE());
    const buf = await blob.arrayBuffer();
    // Truncate the central directory (last ~22 bytes are end-of-central-dir).
    const truncated = new Uint8Array(buf).slice(0, buf.byteLength - 100);
    const broken = new Blob([truncated]);
    const r = await recoverCorruptBodge(broken);
    // Byte-walk attempts to recover what it can.
    expect(r.method).toBe('byte-walk');
    // Even if files end up unparseable, we should at least find SOME
    // local headers in a fresh blob (the data is intact, only central
    // dir was clipped).
    expect(r.recoveredFiles.size).toBeGreaterThan(0);
  });
});
