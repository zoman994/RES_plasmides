/**
 * skeleton-bodge-bridge.test.js — audit A1/A2 (data loss on save/open). The
 * bridge maps the CanvasSkeleton snapshot ↔ the canonical .bodge v2 `state`.
 * Before the fix, Ctrl+S wrote only projectSlice meta (v1) and Open restored
 * only meta, so the whole assembly (topology / assemblyMethod / junctions /
 * pieces / primers) was silently dropped. This drives a FULL round-trip through
 * the real writeBodgeV2 + readBodge to prove the assembly survives.
 */
import { describe, it, expect } from 'vitest';
import { skeletonToCanonical, canonicalToSkeleton } from '../skeleton-bodge-bridge';
import { writeBodgeV2, readBodge } from '../../../../lib/bodge-zip';

function makeSnapshot() {
  return {
    view: 'layout',
    containers: [{
      id: 'src', name: 'pUC19', kind: 'molecule',
      sequence: 'ATGCATGCATGCATGCATGCATGCATGCATGCATGCATGC',
      topology: { circular: true }, annotations: [],
    }],
    zones: [{
      id: 'z1', name: 'Сборка 1', bounds: { x: 0, y: 0, width: 600, height: 400 },
      topology: { circular: true },
      assemblyMethod: 'golden_gate',
      assemblyEnzyme: 'BsmBI',
      junctions: { 'p1__p2': { method: 'golden_gate', enzyme: 'BsmBI', autoMode: 'manual' } },
    }],
    pieces: [
      { id: 'p1', name: 'p1', kind: 'sourced', zoneId: 'z1', createdAt: 1, ranges: [{ sourceId: 'src', start: 0, end: 20, orientation: 'forward' }] },
      { id: 'p2', name: 'p2', kind: 'sourced', zoneId: 'z1', createdAt: 2, ranges: [{ sourceId: 'src', start: 20, end: 40, orientation: 'forward' }] },
    ],
    operations: [],
    junctions: [],
    positions: { p1: { x: 10, y: 20 }, p2: { x: 30, y: 20 } },
    assemblyDraftPrimers: {
      z1: [{ id: 'pr1', draftId: 'z1', direction: 'forward', tail: 'CGTCTCA', bindingSequence: 'ATGCATGCATGCATGCATGC', sequence: 'CGTCTCAATGCATGCATGCATGCATGC', source: { kind: 'auto-group', pieceId: 'p1', side: 'fwd' } }],
    },
  };
}

describe('skeleton-bodge-bridge — full .bodge round-trip (A1/A2)', () => {
  it('the assembly survives skeleton → writeBodgeV2 → readBodge → skeleton', async () => {
    const snap = makeSnapshot();
    const canonical = skeletonToCanonical(snap, { id: 'proj1', name: 'My project' });
    const blob = await writeBodgeV2(canonical);
    const read = await readBodge(blob);
    const restored = canonicalToSkeleton(read.state);

    const z = restored.zones.find((x) => x.id === 'z1');
    expect(z).toBeTruthy();
    expect(z.topology.circular).toBe(true); // circularization survived
    expect(z.assemblyMethod).toBe('golden_gate'); // method survived
    expect(z.assemblyEnzyme).toBe('BsmBI'); // F enzyme survived
    expect(z.junctions['p1__p2'].enzyme).toBe('BsmBI'); // per-junction config survived
    expect(restored.pieces.map((p) => p.id).sort()).toEqual(['p1', 'p2']);
    expect(restored.containers.find((c) => c.id === 'src')).toBeTruthy();
    // Lossless: the derived + manual primers ride the extension snapshot.
    expect(restored.assemblyDraftPrimers.z1[0].tail).toBe('CGTCTCA');
    expect(restored.positions.p1).toEqual({ x: 10, y: 20 });
  });

  it('structured v2 also carries the assembly (interop, no extension dependency)', async () => {
    const snap = makeSnapshot();
    const canonical = skeletonToCanonical(snap, { id: 'proj1', name: 'P' });
    const read = await readBodge(await writeBodgeV2(canonical));
    // The structured assembly JSON (independent of our extension blob) carries it.
    const z = read.state.zones.find((x) => x.id === 'z1');
    expect(z.assemblyMethod).toBe('golden_gate');
    expect(z.topology.circular).toBe(true);
  });

  it('canonicalToSkeleton reconstructs from structured slices when no extension', async () => {
    const snap = makeSnapshot();
    const canonical = skeletonToCanonical(snap, { id: 'proj1', name: 'P' });
    delete canonical.extensions; // simulate an externally-authored file
    const read = await readBodge(await writeBodgeV2(canonical));
    const restored = canonicalToSkeleton(read.state);
    expect(restored.zones.find((x) => x.id === 'z1').assemblyMethod).toBe('golden_gate');
    expect(restored.pieces.length).toBe(2);
    // Primers re-derive on first edit for external files → empty here, not crash.
    expect(restored.assemblyDraftPrimers).toEqual({});
  });
});
