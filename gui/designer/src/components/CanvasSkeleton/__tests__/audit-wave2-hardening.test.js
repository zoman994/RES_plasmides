/**
 * audit-wave2-hardening.test.js — real-case verification follow-ups.
 *   H1: createDebouncedSaver.flush() persists the latest pending state at once.
 *   M1: the realise op resolves the RE/GG enzyme from the per-junction config
 *       (closure-only config sets it there, not zone.assemblyEnzyme).
 *   L7: a realised RE-лигирование op carries params.ends='sticky'.
 *   L2: buildProtocol relabels an overlap_pcr 'gibson'-kind op as Overlap-extension.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { createDebouncedSaver, loadSnapshot } from '../store/skeleton-persistence';
import { realiseAssembly } from '../lib/zone-pieces-to-dag';
import { pairKeyFor } from '../lib/junction-derive';
import { buildProtocol } from '../canvas/operations/protocol-export';

const SEQ = 'AAAACCCCGGGGTTTTACGTACGTACTTGCATGCATGCAT'.repeat(2);

describe('H1 — debounced saver flush persists the latest state immediately', () => {
  it('flush() writes the pending snapshot before the debounce fires', async () => {
    const saver = createDebouncedSaver(10_000); // long delay so only flush can fire
    const pid = 'proj-h1';
    saver({ zones: [{ id: 'z', name: 'flushed' }], pieces: [], containers: [] }, pid);
    await saver.flush();
    const snap = await loadSnapshot(pid);
    expect(snap).toBeTruthy();
    expect(snap.zones[0].name).toBe('flushed');
  });
  it('flush() with nothing pending resolves false', async () => {
    const saver = createDebouncedSaver(10_000);
    expect(await saver.flush()).toBe(false);
  });
});

describe('M1/L7 — realise op enzyme from the per-junction config + sticky ends', () => {
  function reZoneState() {
    const container = { id: 'cA', name: 'src', sequence: SEQ, annotations: [] };
    const pieces = [
      { id: 'p1', kind: 'sourced', zoneId: 'z1', createdAt: 1, ranges: [{ sourceId: 'cA', start: 0, end: 30, orientation: 'forward' }] },
      { id: 'p2', kind: 'sourced', zoneId: 'z1', createdAt: 2, ranges: [{ sourceId: 'cA', start: 30, end: 60, orientation: 'forward' }] },
    ];
    // closure-only config: enzyme lives on the junction, NOT zone.assemblyEnzyme.
    const zone = {
      id: 'z1', name: 'asm', topology: { circular: false }, assemblyMethod: 'restriction',
      junctions: { [pairKeyFor('p1', 'p2')]: { method: 'restriction', enzyme: 'BamHI' } },
    };
    return { containers: [container], pieces, zones: [zone], positions: {} };
  }
  it('the realised ligate op carries the junction enzyme (BamHI) + ends:sticky', () => {
    const res = realiseAssembly(reZoneState(), 'z1', ['restriction']);
    expect(res.ok).toBe(true);
    const op = res.diff.operations.find((o) => o.origin && o.origin.kind === 'realised-assembly');
    expect(op.params.enzyme).toBe('BamHI'); // M1 — not the default EcoRI
    expect(op.params.ends).toBe('sticky'); // L7
  });
});

describe('L2 — overlap_pcr step is not mislabelled Gibson', () => {
  it('an overlap_pcr op (gibson kind) titles «Overlap-extension PCR»', () => {
    const ts = '2026-06-14T00:00:00.000Z';
    const { text } = buildProtocol([
      { id: 'o1', kind: 'gibson', status: 'executed', executedAt: ts, inputs: ['a', 'b'], outputs: ['c'], params: { method: 'overlap_pcr' } },
    ], []);
    expect(text).toContain('Overlap-extension PCR');
    expect(text).not.toContain('Gibson Assembly');
  });
});
