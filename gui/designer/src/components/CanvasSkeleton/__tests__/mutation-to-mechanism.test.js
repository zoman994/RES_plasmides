/**
 * mutation-to-mechanism — derive the molecular MECHANISM (KLD vs
 * overlap-extension) from an in-editor sequence edit, reusing the
 * mutagenesis strategy engine. Pure; output feeds the canvas op-graph
 * (Кирпич 1 of the edit-driven mutagenesis chain).
 */
import { describe, it, expect } from 'vitest';
import {
  deriveMutationMechanism, normalizeEditorMutations, mechanismLabel,
} from '../lib/mutation-to-mechanism';
import { deriveAssemblyPrimerRecords } from '../lib/derived-primer-records';

const TEMPLATE = `ATG${'GCC'.repeat(300)}TAA`; // 906 bp; index 300 = 'G'
const BIG = `ATG${'GCC'.repeat(600)}TAA`; // 1806 bp

describe('normalizeEditorMutations', () => {
  it('maps a single editor mutation {position,fromBase,toBase} → engine substitution', () => {
    const norm = normalizeEditorMutations([{ position: 300, fromBase: 'G', toBase: 'T' }]);
    expect(norm).toHaveLength(1);
    expect(norm[0]).toMatchObject({ type: 'substitution', dnaPosition: 300, newCodon: 'T' });
  });

  it('coalesces a run of adjacent substitutions into ONE codon mutation', () => {
    const editor = [
      { position: 300, fromBase: 'G', toBase: 'C' },
      { position: 301, fromBase: 'C', toBase: 'A' },
      { position: 302, fromBase: 'C', toBase: 'G' },
    ];
    const norm = normalizeEditorMutations(editor);
    expect(norm).toHaveLength(1);
    expect(norm[0].dnaPosition).toBe(300);
    expect(norm[0].newCodon).toBe('CAG');
  });

  it('does NOT coalesce non-adjacent substitutions', () => {
    const norm = normalizeEditorMutations([
      { position: 300, fromBase: 'G', toBase: 'T' },
      { position: 600, fromBase: 'G', toBase: 'T' },
    ]);
    expect(norm).toHaveLength(2);
  });

  it('passes through already engine-shaped mutations (insertion/deletion)', () => {
    const norm = normalizeEditorMutations([{ type: 'insertion', dnaPosition: 50, insertSequence: 'AAA' }]);
    expect(norm[0]).toMatchObject({ type: 'insertion', dnaPosition: 50, insertSequence: 'AAA' });
  });

  it('handles empty / null input', () => {
    expect(normalizeEditorMutations([])).toEqual([]);
    expect(normalizeEditorMutations(null)).toEqual([]);
  });
});

describe('deriveMutationMechanism — mechanism selection', () => {
  it('keeps circular KLD primers full-length and exposes exact wrapped canonical sites at both origin edges', () => {
    const template = 'ACGT'.repeat(20);
    const deriveAt = (position, toBase) => {
      const result = deriveMutationMechanism({
        templateSequence: template,
        editorMutations: [{ position, fromBase: template[position], toBase }],
        fragmentContext: { topology: 'circular', isStandalone: true },
      });
      const records = deriveAssemblyPrimerRecords(result.plan.primers, {
        draftId: 'draft-origin',
        anchorPos: position,
        templateSequence: template,
        target: { entryId: 'draft-origin', resourceHash: 'sha256:origin', topology: 'circular' },
        idGen: (() => { let serial = 0; return () => `origin-${serial += 1}`; })(),
      });
      return { result, records };
    };

    const nearStart = deriveAt(3, template[3] === 'A' ? 'G' : 'A');
    const nearEnd = deriveAt(template.length - 3, template.at(-3) === 'A' ? 'G' : 'A');
    const startForward = nearStart.records.find((primer) => primer.direction === 'forward');
    const startReverse = nearStart.records.find((primer) => primer.direction === 'reverse');
    const endForward = nearEnd.records.find((primer) => primer.direction === 'forward');
    const endReverse = nearEnd.records.find((primer) => primer.direction === 'reverse');

    expect({
      nearStartLengths: nearStart.result.plan.primers.map((primer) => primer.sequence.length),
      nearStartReverseSite: startReverse.sites[0].location,
      nearStartForwardSpan: startForward.sites[0].alignment.target.length,
      nearEndLengths: nearEnd.result.plan.primers.map((primer) => primer.sequence.length),
      nearEndForwardSite: endForward.sites[0].location,
      nearEndReverseSpan: endReverse.sites[0].alignment.target.length,
    }).toEqual({
      nearStartLengths: [21, 20],
      nearStartReverseSite: {
        kind: 'join', segments: [{ start: 63, end: 80 }, { start: 0, end: 3 }],
      },
      nearStartForwardSpan: 21,
      nearEndLengths: [21, 20],
      nearEndForwardSite: {
        kind: 'join', segments: [{ start: 77, end: 80 }, { start: 0, end: 18 }],
      },
      nearEndReverseSpan: 20,
    });
  });

  it('single-base edit on circular standalone → KLD, 1 base changed, primers present', () => {
    const r = deriveMutationMechanism({
      templateSequence: TEMPLATE,
      editorMutations: [{ position: 300, fromBase: 'G', toBase: 'T' }],
      fragmentContext: { topology: 'circular', isStandalone: true },
    });
    expect(r.mechanism).toBe('kld');
    expect(r.mutantSequence).toHaveLength(TEMPLATE.length);
    expect(r.mutantSequence[300]).toBe('T');
    expect(r.plan.primers).toHaveLength(2);
    expect(r.blockers).toHaveLength(0);
  });

  it('codon edit (3 adjacent) → coalesced, KLD, mutant codon applied', () => {
    const r = deriveMutationMechanism({
      templateSequence: TEMPLATE,
      editorMutations: [
        { position: 300, fromBase: 'G', toBase: 'C' },
        { position: 301, fromBase: 'C', toBase: 'A' },
        { position: 302, fromBase: 'C', toBase: 'G' },
      ],
      fragmentContext: { topology: 'circular', isStandalone: true },
    });
    expect(r.mechanism).toBe('kld');
    expect(r.mutantSequence.slice(300, 303)).toBe('CAG');
  });

  it('spread mutations → overlap-extension (two_fragment) with mutant overlap junction', () => {
    const r = deriveMutationMechanism({
      templateSequence: BIG,
      editorMutations: [
        { position: 300, fromBase: 'G', toBase: 'T' },
        { position: 1500, fromBase: 'G', toBase: 'T' },
      ],
      fragmentContext: { topology: 'circular', isStandalone: true },
    });
    expect(r.mechanism).toBe('two_fragment');
    expect(r.plan.fragments.length).toBeGreaterThan(1);
    expect(r.plan.junctions.some((j) => j.containsMutation)).toBe(true);
  });

  it('linear context → overlap-extension even for a single mutation (not KLD)', () => {
    const r = deriveMutationMechanism({
      templateSequence: TEMPLATE,
      editorMutations: [{ position: 300, fromBase: 'G', toBase: 'T' }],
      fragmentContext: { topology: 'linear', isStandalone: true },
    });
    expect(r.mechanism).toBe('two_fragment');
  });

  it('empty edit → no mechanism, no throw', () => {
    const r = deriveMutationMechanism({ templateSequence: '', editorMutations: [] });
    expect(r.mechanism).toBeNull();
    expect(r.plan).toBeNull();
  });
});

describe('deriveMutationMechanism — ⚓ No-PCR viability gate', () => {
  it('fragment mechanism + needsAmplification:false → blocker (cannot PCR a no-PCR fragment)', () => {
    const r = deriveMutationMechanism({
      templateSequence: TEMPLATE,
      editorMutations: [{ position: 300, fromBase: 'G', toBase: 'T' }],
      fragmentContext: { topology: 'linear', isStandalone: true, needsAmplification: false },
    });
    expect(r.mechanism).toBe('two_fragment');
    expect(r.blockers.some((b) => b.kind === 'no-pcr-fragment')).toBe(true);
  });

  it('KLD + needsAmplification:false → NO blocker (whole-plasmid reverse PCR is valid)', () => {
    const r = deriveMutationMechanism({
      templateSequence: TEMPLATE,
      editorMutations: [{ position: 300, fromBase: 'G', toBase: 'T' }],
      fragmentContext: { topology: 'circular', isStandalone: true, needsAmplification: false },
    });
    expect(r.mechanism).toBe('kld');
    expect(r.blockers).toHaveLength(0);
  });
});

describe('mechanismLabel', () => {
  it('gives Russian labels for KLD and overlap-extension', () => {
    expect(mechanismLabel('kld').full).toMatch(/KLD/);
    expect(mechanismLabel('two_fragment').full).toMatch(/overlap/i);
    expect(mechanismLabel('multi_fragment').short).toBeTruthy();
  });
});
