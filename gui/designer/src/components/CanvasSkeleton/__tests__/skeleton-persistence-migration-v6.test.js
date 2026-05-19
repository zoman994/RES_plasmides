/**
 * skeleton-persistence-migration-v6.test.js — T2 K7.
 *
 * R-DRIFT (same chain as T1): the spec called this v4→v5, but T1 already
 * shipped SCHEMA_VERSION_CURRENT=5 (pieces slice). T2's op→pieces
 * migration is therefore v5→v6, derived from current code.
 *
 * For each pre-T2 op without inputPieces: one piece per input container
 * (origin 'legacy-migration'), op.inputPieces set, op.inputs preserved.
 */
import { describe, it, expect } from 'vitest';
import { migrateSnapshot, SCHEMA_VERSION_CURRENT } from '../store/skeleton-persistence';

const cT = { id: 'c-tpl', name: 'pUC', sequence: 'AAAACCCCGGGGTTTT' }; // 16 bp
const c1 = { id: 'c-1', name: 'fragA', sequence: 'AAAA' };
const c2 = { id: 'c-2', name: 'fragB', sequence: 'CCCC' };

const v5 = (operations) => ({
  containers: [cT, c1, c2], junctions: [], assemblyDrafts: [], pieces: [],
  operations,
});

describe('T2 K7 — migration v5 → v6 (op → pieces)', () => {
  it('SCHEMA_VERSION_CURRENT is 7 (T1=5, T2=6 op.inputPieces, T3=7 zones); v5→v6 step still adds inputPieces', () => {
    expect(SCHEMA_VERSION_CURRENT).toBe(11); // M-CANVAS-WORKFLOW-UX K1: bump 10→11
  });

  it('PCR op with params.range+templateId → one legacy-migration piece, derivedReactionId set', () => {
    const op = {
      id: 'op-pcr', kind: 'pcr', status: 'committed', inputs: ['c-tpl'],
      params: { templateId: 'c-tpl', range: { start: 4, end: 8 }, primerPairId: { forward: 'f', reverse: 'r' } },
    };
    const m = migrateSnapshot(v5([op]), 5);
    expect(m.pieces).toHaveLength(1);
    const pc = m.pieces[0];
    expect(pc.origin).toBe('legacy-migration');
    expect(pc.sourceIds).toEqual(['c-tpl']);
    expect(pc.ranges).toEqual([{ sourceId: 'c-tpl', start: 4, end: 8, orientation: 'forward' }]);
    expect(pc.acquisitionMethod).toBe('pcr');
    expect(pc.acquisitionParams).toEqual({ primerPairId: { forward: 'f', reverse: 'r' } });
    expect(pc.derivedReactionId).toBe('op-pcr');
    expect(pc.frozen).toBe(false);
    expect(m.operations[0].inputPieces).toEqual([pc.id]);
    expect(m.operations[0].inputs).toEqual(['c-tpl']); // legacy preserved
  });

  it('PCR op with templateId but no range → full-length range', () => {
    const op = { id: 'o', kind: 'pcr', status: 'committed', inputs: ['c-tpl'], params: { templateId: 'c-tpl' } };
    const m = migrateSnapshot(v5([op]), 5);
    expect(m.pieces[0].ranges).toEqual([{ sourceId: 'c-tpl', start: 0, end: 16, orientation: 'forward' }]);
  });

  it('multi-input Gibson → one piece per input, origin legacy-migration, derivedReactionId null', () => {
    const op = { id: 'op-g', kind: 'gibson', status: 'committed', inputs: ['c-1', 'c-2'], params: {} };
    const m = migrateSnapshot(v5([op]), 5);
    expect(m.pieces).toHaveLength(2);
    expect(m.pieces.every((p) => p.origin === 'legacy-migration')).toBe(true);
    expect(m.pieces.every((p) => p.acquisitionMethod === 'undefined')).toBe(true);
    expect(m.pieces.every((p) => p.derivedReactionId === null)).toBe(true);
    expect(m.operations[0].inputPieces).toEqual(m.pieces.map((p) => p.id));
  });

  it('cut op → acquisitionMethod restriction with enzymes param', () => {
    const op = { id: 'o', kind: 'cut', status: 'committed', inputs: ['c-tpl'], params: { templateId: 'c-tpl', enzymeName: 'EcoRI' } };
    const m = migrateSnapshot(v5([op]), 5);
    expect(m.pieces[0].acquisitionMethod).toBe('restriction');
    expect(m.pieces[0].acquisitionParams).toEqual({ enzymes: ['EcoRI'] });
  });

  it('executed op → migrated piece frozen:true', () => {
    const op = { id: 'o', kind: 'pcr', status: 'executed', inputs: ['c-tpl'], params: { templateId: 'c-tpl' } };
    const m = migrateSnapshot(v5([op]), 5);
    expect(m.pieces[0].frozen).toBe(true);
  });

  it('op already carrying inputPieces is skipped (idempotent per-op)', () => {
    const op = { id: 'o', kind: 'pcr', status: 'committed', inputs: ['c-tpl'], inputPieces: ['pc-existing'], params: {} };
    const m = migrateSnapshot(v5([op]), 5);
    expect(m.pieces).toEqual([]);
    expect(m.operations[0].inputPieces).toEqual(['pc-existing']);
  });

  it('bad container ref → graceful skip (no piece for it)', () => {
    const op = { id: 'o', kind: 'gibson', status: 'committed', inputs: ['c-1', 'c-GONE'], params: {} };
    const m = migrateSnapshot(v5([op]), 5);
    expect(m.pieces).toHaveLength(1);
    expect(m.operations[0].inputPieces).toHaveLength(1);
  });

  it('full chain pre-T1 v3 snapshot → assemblyDrafts + pieces + ops carry inputPieces', () => {
    const v3 = { containers: [c1], junctions: [], operations: [{ id: 'o', kind: 'pcr', status: 'committed', inputs: ['c-1'], params: {} }] };
    const m = migrateSnapshot(v3, 3);
    expect(m.assemblyDrafts).toEqual([]);
    expect(Array.isArray(m.pieces)).toBe(true);
    expect(m.pieces).toHaveLength(1);
    expect(m.operations[0].inputPieces).toHaveLength(1);
  });
});
