/**
 * K8 (Sprint 1.6) — mutation highlighting in FragmentEditor.
 *
 * computeMutationHighlights(fragment, parent) returns a Map<ntPos, 'silent'|'nonsilent'>
 * used by FragmentEditor to paint DNA and protein views red/yellow where mutations
 * differ from the parent-part sequence.
 *
 * Primary source: sequenceDiff(parent.sequence, fragment.sequence, cdsRegions)
 * Fallback (no parent): conservative — mark positions from fragment.mutations as nonsilent
 */
import { describe, it, expect } from 'vitest';
import { computeMutationHighlights } from '../components/FragmentEditor';

describe('computeMutationHighlights', () => {
  it('no parent, no mutations → empty map', () => {
    const m = computeMutationHighlights({ sequence: 'ATGGCCTAA' }, null);
    expect(m.size).toBe(0);
  });

  it('single SILENT substitution (A→C within same AA codon) marks position as silent', () => {
    // Parent GCC → child GCG: both encode Ala. Position 5 changed (C→G).
    const parent = { sequence: 'ATGGCCTAA' }; // M-A-*
    const fragment = {
      sequence: 'ATGGCGTAA',
      annotations: [{ level: 'region', type: 'CDS', start: 0, end: 9 }],
    };
    const m = computeMutationHighlights(fragment, parent);
    expect(m.size).toBe(1);
    expect(m.get(5)).toBe('silent');
  });

  it('single NONSILENT substitution is marked nonsilent', () => {
    // GCC (Ala) → ACC (Thr) → position 3 changed (G→A), non-silent.
    const parent = { sequence: 'ATGGCCTAA' };
    const fragment = {
      sequence: 'ATGACCTAA',
      annotations: [{ level: 'region', type: 'CDS', start: 0, end: 9 }],
    };
    const m = computeMutationHighlights(fragment, parent);
    expect(m.get(3)).toBe('nonsilent');
  });

  it('fallback to fragment.mutations when no parent: marks 3 nt of substitution as nonsilent', () => {
    const fragment = {
      sequence: 'ATGGCGTAA',
      mutations: [{ type: 'substitution', codonStart: 3 }],
    };
    const m = computeMutationHighlights(fragment, null);
    expect(m.get(3)).toBe('nonsilent');
    expect(m.get(4)).toBe('nonsilent');
    expect(m.get(5)).toBe('nonsilent');
  });

  it('fallback: insertion marks insertSequence.length nt starting at position', () => {
    const fragment = {
      sequence: 'ATGCATCATGCC',
      mutations: [{ type: 'insertion', position: 3, insertSequence: 'CATCAT' }],
    };
    const m = computeMutationHighlights(fragment, null);
    // 6 positions starting at 3
    for (let i = 3; i < 9; i++) expect(m.get(i)).toBe('nonsilent');
    expect(m.size).toBe(6);
  });

  it('fallback: deletion marks deletedBp nt at position', () => {
    const fragment = {
      sequence: 'ATGTAA',
      mutations: [{ type: 'deletion', position: 3, deletedBp: 3 }],
    };
    const m = computeMutationHighlights(fragment, null);
    for (let i = 3; i < 6; i++) expect(m.get(i)).toBe('nonsilent');
  });

  it('diff outside any CDS region: marked as nonsilent (conservative, no AA context)', () => {
    const parent   = { sequence: 'ATGGCCTAA' };
    const fragment = {
      sequence: 'ATGGCCTAC',
      annotations: [], // no CDS
    };
    const m = computeMutationHighlights(fragment, parent);
    expect(m.get(8)).toBe('nonsilent');
  });

  it('both parent and mutations fallback are absent → empty map', () => {
    expect(computeMutationHighlights({ sequence: 'ATG' }, null).size).toBe(0);
    expect(computeMutationHighlights({ sequence: 'ATG', mutations: [] }, null).size).toBe(0);
  });

  it('K9/V16: honors templateStart when diffing against parent', () => {
    // Parent 51 bp: 42 A's, then ATGGCCTAA (M-A-*).
    // Sub-fragment carries only the CDS window (templateStart=42, length=9).
    const parent = { sequence: 'A'.repeat(42) + 'ATGGCCTAA' };
    const fragment = {
      sequence: 'ATGACCTAA',           // M-T-* — nt 3 mutated relative to parent[42..51]
      templateStart: 42,
      annotations: [{ level: 'region', type: 'CDS', start: 0, end: 9 }],
    };
    const m = computeMutationHighlights(fragment, parent);
    // Only the one real sub in fragment-local coords (pos 3) is flagged.
    expect(m.size).toBe(1);
    expect(m.get(3)).toBe('nonsilent');
  });

  it('K9/V16: templateStart=0 (regular fragment) matches old behavior', () => {
    const parent = { sequence: 'ATGGCCTAA' };
    const fragment = {
      sequence: 'ATGACCTAA',
      templateStart: 0,
      annotations: [{ level: 'region', type: 'CDS', start: 0, end: 9 }],
    };
    const m = computeMutationHighlights(fragment, parent);
    expect(m.get(3)).toBe('nonsilent');
  });
});

// ───────────────────────────────────────────────────────────
// Sprint X K4 — replay-aware highlights, closes V22.
// Priority order: commits+baseSnapshot  >  parent  >  mutations-list.
// ───────────────────────────────────────────────────────────

import { createCommit } from '../lib/plasmid-git';

function makeCommit(type, parentPos, payload, label, t) {
  const c = createCommit(type, parentPos, payload, label, undefined, t);
  return c;
}

describe('Sprint X K4 — computeMutationHighlights via Plasmid-Git replay', () => {
  it('Git-path: fragment with baseSnapshot + 1 substitution commit → Map size 3, nonsilent', () => {
    const baseSnapshot = {
      sequence: 'ATGGCCTAA',
      annotations: [{ id: 'r', start: 0, end: 9, level: 'region', type: 'CDS' }],
    };
    const commits = [makeCommit('substitution', 3, { newCodon: 'ACC' }, 'A2T', 1)];
    const fragment = {
      sequence: 'ATGACCTAA', // replay result
      baseSnapshot,
      commits,
      annotations: baseSnapshot.annotations,
    };
    const m = computeMutationHighlights(fragment, null);
    expect(m.size).toBe(3);
    expect(m.get(3)).toBe('nonsilent');
    expect(m.get(4)).toBe('nonsilent');
    expect(m.get(5)).toBe('nonsilent');
  });

  it('V22 regression direct: baseSnapshot + deletion + substitution → highlights only substitution HEAD coord, no tail', () => {
    // Baseline: ATG GCT AAA GAG TTT  (M A K E F)
    // Delete codon 1 (parentPos=3, len=3) → ATG AAA GAG TTT
    // Substitute codon 3 of baseline (parentPos=9, GAG→CAG) → remapped to 6 in HEAD
    const baseSnapshot = {
      sequence: 'ATGGCTAAAGAGTTT',
      annotations: [{ id: 'r', start: 0, end: 15, level: 'region', type: 'CDS' }],
    };
    const commits = [
      makeCommit('deletion', 3, { deleteLength: 3 }, 'ΔA2', 1),
      makeCommit('substitution', 9, { newCodon: 'CAG' }, 'E4Q', 2),
    ];
    const fragment = {
      sequence: 'ATGAAACAGTTT',
      baseSnapshot,
      commits,
      annotations: [{ start: 0, end: 12, level: 'region', type: 'CDS' }],
    };
    const m = computeMutationHighlights(fragment, null);
    // Only substitution HEAD coords (6,7,8) — NO red tail after deletion.
    expect([...m.keys()].sort((a, b) => a - b)).toEqual([6, 7, 8]);
    for (const v of m.values()) expect(v).toBe('nonsilent');
  });

  it('V22 split-sub closed: split sub-fragment with baseSnapshot + commits → replayDiff honored (no tail after indel)', () => {
    // Simulate HygroR_2-style sub: templateStart offset exists on the fragment
    // but Git-path ignores it — it works off baseSnapshot relative coords.
    const baseSnapshot = {
      sequence: 'ATGGCTAAAGAGTTT',
      annotations: [],
    };
    const commits = [
      makeCommit('deletion', 3, { deleteLength: 1 }, 'Δ1nt', 1),      // frame-shift indel
      makeCommit('substitution', 6, { newCodon: 'TTT' }, 'K3F', 2),
    ];
    const fragment = {
      sequence: 'ATGCTAATAGAGTTT',           // placeholder, K4 doesn't use HEAD sequence
      baseSnapshot,
      commits,
      templateStart: 42, // proves Git-path ignores templateStart (V22 closed for split-sub)
      annotations: [],
    };
    const m = computeMutationHighlights(fragment, null);
    // Deletion (1 nt) skipped, substitution at HEAD = 6 + (-1) = 5
    // Only 3 consecutive positions, no tail.
    const keys = [...m.keys()].sort((a, b) => a - b);
    expect(keys.length).toBe(3);
    expect(keys[2] - keys[0]).toBe(2); // contiguous triplet
  });

  it('legacy parent-diff path preserved for fragments without commits[]', () => {
    // Fragment has no baseSnapshot/commits → falls through to parent-sequenceDiff.
    const parent = { sequence: 'ATGGCCTAA' };
    const fragment = {
      sequence: 'ATGACCTAA',
      annotations: [{ level: 'region', type: 'CDS', start: 0, end: 9 }],
      // no commits, no baseSnapshot
    };
    const m = computeMutationHighlights(fragment, parent);
    expect(m.get(3)).toBe('nonsilent');
  });
});
