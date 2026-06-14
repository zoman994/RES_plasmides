/**
 * enzyme-threading-f.test.jsx — audit finding F (RC-1/RC-3/GG-4/enz-sep AM-5/
 * AM-2/AM-3). Golden Gate / RE-лигирование used to be OFFERED with no enzyme
 * picker, so the chosen enzyme never reached the chemistry: GG primers shipped a
 * hardcoded BsaI recognition + 'AAAA' placeholder overhang, RE tails had an empty
 * site, realise op params lost the enzyme, validateClosure hardcoded BsaI. F
 * threads ONE enzyme per junction end-to-end:
 *   • config — JUNCTION_CONFIG_FIELDS carries `enzyme`; SET_ASSEMBLY_METHOD stores
 *     zone.assemblyEnzyme + writes it to tentative junctions; seedJunction defaults
 *     (GG→BsaI, RE→EcoRI); draftFromZone carries assemblyEnzyme.
 *   • primers — the tail's recognition (GG) / site (RE) comes from the junction
 *     enzyme; a GG overhang with no explicit piece value is the seamless real
 *     junction bases (left piece's last N), not 'AAAA'.
 *   • realise — the assembly op params carry the enzyme.
 *   • protocol — Golden Gate / лигирование steps name the chosen enzyme.
 */
import { describe, it, expect } from 'vitest';
import {
  seedJunction, defaultEnzymeForMethod, pairKeyFor,
} from '../lib/junction-derive';
import { deriveAutoPrimers, enzymeTailParams } from '../lib/primer-derive';
import { realiseAssembly } from '../lib/zone-pieces-to-dag';
import { skeletonReducer, buildInitialState } from '../store/skeleton-state';
import { buildProtocol } from '../canvas/operations/protocol-export';

// ─── F1 — config layer ────────────────────────────────────────────────────
describe('F1 — junction config carries an enzyme', () => {
  it('defaultEnzymeForMethod: GG→BsaI, RE→EcoRI, overlap→null', () => {
    expect(defaultEnzymeForMethod('golden_gate')).toBe('BsaI');
    expect(defaultEnzymeForMethod('restriction')).toBe('EcoRI');
    expect(defaultEnzymeForMethod('overlap_pcr')).toBe(null);
    expect(defaultEnzymeForMethod('kld')).toBe(null);
  });

  it('seedJunction defaults the enzyme only for enzyme methods', () => {
    expect(seedJunction('golden_gate').enzyme).toBe('BsaI');
    expect(seedJunction('restriction').enzyme).toBe('EcoRI');
    expect(seedJunction('overlap_pcr').enzyme).toBeUndefined();
    expect(seedJunction()).not.toHaveProperty('enzyme'); // overlap default unchanged
  });

  it('seedJunction honours an explicit enzyme', () => {
    expect(seedJunction('golden_gate', 'BsmBI').enzyme).toBe('BsmBI');
  });
});

// ─── F1 — reducer ─────────────────────────────────────────────────────────
const SEQ = 'AAAACCCCGGGGTTTTACGTACGTACTTGCATGCATGCAT'.repeat(2);
const SRC = {
  id: 'src', kind: 'molecule', name: 'src', sequence: SEQ,
  annotations: [], topology: { circular: false }, pinned: true,
};
const piece = (id, start, end, order) => ({
  id, kind: 'sourced', name: id, sourceIds: ['src'],
  ranges: [{ sourceId: 'src', start, end, orientation: 'forward' }],
  origin: 'selection', acquisitionMethod: 'undefined', zoneId: 'z', createdAt: order, updatedAt: order,
});
function twoPieceZone() {
  const s = buildInitialState();
  return {
    ...s,
    containers: [...s.containers, SRC],
    zones: [{ id: 'z', name: 'Z', viewMode: 'sequence', bounds: { x: 0, y: 0, width: 600, height: 400 } }],
    pieces: [piece('p1', 0, 30, 1), piece('p2', 30, 60, 2)],
  };
}
const zoneOf = (s) => s.zones.find((z) => z.id === 'z');

describe('F1 — SET_ASSEMBLY_METHOD / SET_BOUNDARY_OVERLAP thread the enzyme', () => {
  it('SET_ASSEMBLY_METHOD(golden_gate, BsmBI) stores assemblyEnzyme + writes it to junctions', () => {
    const s = skeletonReducer(twoPieceZone(), {
      type: 'SET_ASSEMBLY_METHOD', zoneId: 'z', method: 'golden_gate', enzyme: 'BsmBI',
    });
    const z = zoneOf(s);
    expect(z.assemblyEnzyme).toBe('BsmBI');
    const jk = pairKeyFor('p1', 'p2');
    expect(z.junctions[jk].method).toBe('golden_gate');
    expect(z.junctions[jk].enzyme).toBe('BsmBI');
  });

  it('switching the method to overlap clears the stale enzyme', () => {
    let s = skeletonReducer(twoPieceZone(), {
      type: 'SET_ASSEMBLY_METHOD', zoneId: 'z', method: 'golden_gate', enzyme: 'BsmBI',
    });
    s = skeletonReducer(s, { type: 'SET_ASSEMBLY_METHOD', zoneId: 'z', method: 'overlap_pcr' });
    const z = zoneOf(s);
    expect(z.assemblyEnzyme).toBeFalsy();
    expect(z.junctions[pairKeyFor('p1', 'p2')].enzyme).toBeUndefined();
  });

  it('SET_BOUNDARY_OVERLAP persists a per-junction enzyme', () => {
    const s = skeletonReducer(twoPieceZone(), {
      type: 'SET_BOUNDARY_OVERLAP', zoneId: 'z', pairKey: pairKeyFor('p1', 'p2'),
      method: 'restriction', enzyme: 'BamHI', autoMode: 'manual',
    });
    expect(zoneOf(s).junctions[pairKeyFor('p1', 'p2')].enzyme).toBe('BamHI');
  });
});

// ─── F2 — primer engine ───────────────────────────────────────────────────
describe('F2 — enzymeTailParams resolves the enzyme → tail chemistry', () => {
  it('GG enzyme → its recognition + spacer + overhang length', () => {
    expect(enzymeTailParams('golden_gate', 'BsmBI')).toMatchObject({ recognition: 'CGTCTC', spacer: 'A', overhangLength: 4 });
    expect(enzymeTailParams('golden_gate', 'SapI')).toMatchObject({ recognition: 'GCTCTTC', overhangLength: 3 });
  });
  it('RE enzyme → its recognition site', () => {
    expect(enzymeTailParams('restriction', 'BamHI')).toEqual({ reSite: 'GGATCC' });
    expect(enzymeTailParams('restriction', 'HindIII')).toEqual({ reSite: 'AAGCTT' });
  });
  it('unknown / missing enzyme → safe default (no broken tail)', () => {
    expect(enzymeTailParams('golden_gate').recognition).toBe('GGTCTC'); // BsaI
    expect(enzymeTailParams('restriction').reSite).toBe('GAATTC'); // EcoRI
  });
});

const I = (id, sequence) => ({ id, kind: 'intermediate', sequence });
function deriveWithJunction(method, enzyme) {
  const p1 = I('p1', 'ATGCGTACGGATCCTTAGCACTGACATGGTCAGTACCGATTACGGCATTGCAACG');
  const p2 = I('p2', 'TTGACATCCGTAAGCTTGGCCAATTGCCATGAGTCTAGACCGGTATCAAGCTTGA');
  const zone = { id: 'z', name: 'z', junctions: { [pairKeyFor('p1', 'p2')]: { method, enzyme } } };
  const state = { pieces: [p1, p2], zones: [zone] };
  const opGroup = { id: 'og', kind: method, inputPieces: ['p1', 'p2'], zoneId: 'z' };
  return { primers: deriveAutoPrimers(opGroup, state), p1, p2 };
}
const primerFor = (ps, pid, side) => ps.find((p) => p.source.pieceId === pid && p.source.side === side);

describe('F2 — deriveAutoPrimers threads the junction enzyme into the tail', () => {
  it('golden_gate(BsmBI) → tails use the BsmBI recognition, not the hardcoded BsaI', () => {
    const { primers } = deriveWithJunction('golden_gate', 'BsmBI');
    const fwd = primerFor(primers, 'p2', 'fwd'); // downstream piece carries the junction
    const rev = primerFor(primers, 'p1', 'rev'); // upstream piece's downstream end
    expect(fwd.tail.startsWith('CGTCTC')).toBe(true);
    expect(rev.tail.startsWith('CGTCTC')).toBe(true);
    expect(fwd.tail.startsWith('GGTCTC')).toBe(false); // not BsaI
  });

  it('golden_gate with no explicit piece overhang → seamless real junction bases (not AAAA)', () => {
    const { primers, p1 } = deriveWithJunction('golden_gate', 'BsaI');
    const fwd = primerFor(primers, 'p2', 'fwd');
    // tail = recognition(6) + spacer(1) + overhang(4); overhang = left piece's last 4 nt.
    expect(fwd.tail).toBe(`GGTCTCA${p1.sequence.slice(-4)}`);
    expect(fwd.tail.includes('AAAA')).toBe(p1.sequence.slice(-4) === 'AAAA');
  });

  it('restriction(BamHI) → the BamHI site is in the tail', () => {
    const { primers } = deriveWithJunction('restriction', 'BamHI');
    const fwd = primerFor(primers, 'p2', 'fwd');
    expect(fwd.tail.includes('GGATCC')).toBe(true);
  });
});

// ─── F3 — realise + protocol ──────────────────────────────────────────────
describe('F3 — realise carries the enzyme into the assembly op + protocol', () => {
  it('the realised assembly op params carry the chosen enzyme', () => {
    const container = { id: 'cA', name: 'src', sequence: SEQ, annotations: [] };
    const pieces = [
      { id: 'p1', kind: 'sourced', zoneId: 'z1', createdAt: 1, ranges: [{ sourceId: 'cA', start: 0, end: 30, orientation: 'forward' }] },
      { id: 'p2', kind: 'sourced', zoneId: 'z1', createdAt: 2, ranges: [{ sourceId: 'cA', start: 30, end: 60, orientation: 'forward' }] },
    ];
    const zone = {
      id: 'z1', name: 'asm', topology: { circular: false },
      assemblyMethod: 'golden_gate', assemblyEnzyme: 'BsmBI',
    };
    const state = { containers: [container], pieces, zones: [zone], positions: {} };
    const result = realiseAssembly(state, 'z1', ['golden_gate']);
    expect(result.ok).toBe(true);
    const asmOp = result.diff.operations.find((o) => o.origin && o.origin.kind === 'realised-assembly');
    expect(asmOp).toBeTruthy();
    expect(asmOp.params.enzyme).toBe('BsmBI');
  });

  it('protocol names the chosen Golden Gate + RE enzymes', () => {
    const ts = '2026-06-14T00:00:00.000Z';
    const ops = [
      {
        id: 'o1', kind: 'golden_gate', status: 'executed', executedAt: ts,
        inputs: ['a', 'b'], outputs: ['c'], params: { enzyme: 'BsmBI' },
      },
      {
        id: 'o2', kind: 'ligate', status: 'executed', executedAt: ts,
        inputs: ['c', 'd'], outputs: ['e'], params: { enzyme: 'BamHI', ends: 'sticky' },
      },
    ];
    const { text } = buildProtocol(ops, []);
    expect(text).toContain('BsmBI');
    expect(text).toContain('BamHI');
  });
});
