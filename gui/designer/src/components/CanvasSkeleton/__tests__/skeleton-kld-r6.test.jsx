/**
 * skeleton-kld-r6.test.jsx — Real KLD bio-fidelity tests.
 *
 * R6-1 (14.05.2026). Biologist использует KLD для site-directed
 * mutagenesis (point / insertion / deletion). Эти тесты проверяют:
 *   - Back-to-back primer annealing detection.
 *   - Insertion via fwd 5'-tail.
 *   - Deletion via gap между rev anneal end и fwd anneal start.
 *   - Reject non-back-to-back primers (regular PCR mode).
 *   - Reject non-annealing primers.
 *   - Annotation preservation внутри interior region.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { executeKLD } from '../canvas/operations/lib-adapters';

const COMPLEMENT = { A: 'T', T: 'A', G: 'C', C: 'G' };
const rcomp = (s) => s.toUpperCase().split('').reverse().map((c) => COMPLEMENT[c] || c).join('');

function makeTemplate(seq, annotations = []) {
  return {
    id: 't',
    kind: 'molecule',
    name: 'pTest',
    sequence: seq,
    topology: { circular: true },
    annotations,
    length: seq.length,
  };
}

function makeOligo(fwd, rev) {
  return {
    id: 'p',
    kind: 'oligonucleotide',
    payload: {
      sequences: [
        { name: 'fwd', sequence: fwd },
        { name: 'rev', sequence: rev },
      ],
    },
  };
}

describe('R6-1 — executeKLD real bio-fidelity', () => {
  it('back-to-back primers без mutations: mutant == template (rotated)', () => {
    // tpl 30 bp; fwd anneals top[10..19], rev anneals top[0..9].
    // gap = 10 - (0 + 10) = 0 → back-to-back perfect.
    const tpl = 'AAAATTTTGGGGCCCCGGGGATCGATCGAT'; // 30 bp
    const fwdSeq = tpl.slice(10, 20); // 'GGGGCCCCGG' = anneal к top[10..19]
    const revAnneal = tpl.slice(0, 10); // top[0..9] = AAAATTTTGG
    const revSeq = rcomp(revAnneal);    // CCAAAATTTT
    const template = makeTemplate(tpl);
    const oligo = makeOligo(fwdSeq, revSeq);
    const op = {
      id: 'op-kld', kind: 'kld',
      params: { templateId: 't', primerPairId: 'p' },
    };
    const result = executeKLD(op, { containers: { t: template, p: oligo } });
    expect(result.error).toBeUndefined();
    const mutant = result.outputs[0];
    expect(mutant.topology.circular).toBe(true);
    // Mutant = fwd + interior + revRc.
    // interior = top[20..29] + top[0..-1=empty] = 'GATCGATCGAT'? no wait,
    // tpl[20..29] = 'ATCGATCGAT' (10 bp). Actually need recount.
    // tpl: A(0)A(1)A(2)A(3)T(4)T(5)T(6)T(7)G(8)G(9)G(10)G(11)C(12)C(13)C(14)C(15)G(16)G(17)G(18)G(19)A(20)T(21)C(22)G(23)A(24)T(25)C(26)G(27)A(28)T(29)
    // fwd = tpl[10..19] = 'GGCCCCGGGG'
    // revAnneal = tpl[0..9] = 'AAAATTTTGG'
    // revRc = revAnneal = 'AAAATTTTGG'
    // interior wraps: tpl[20..29] + tpl[0..-1] = 'ATCGATCGAT' + ''
    // mutant = 'GGCCCCGGGG' + 'ATCGATCGAT' + 'AAAATTTTGG'
    //        = 'GGCCCCGGGGATCGATCGATAAAATTTTGG' (30 bp = rotation of tpl).
    expect(mutant.length).toBe(tpl.length);
    // It should be the original template rotated to start at fwd anneal:
    const rotated = tpl.slice(10) + tpl.slice(0, 10);
    expect(mutant.sequence).toBe(rotated);
  });

  it('insertion mutation via fwd 5\'-tail добавляет bp', () => {
    const tpl = 'AAAATTTTGGGGCCCCGGGGATCGATCGAT'; // 30 bp
    const fwdAnneal = tpl.slice(10, 20); // 'GGCCCCGGGG'
    // 'CAC' tail не продлевает natural 10-bp anneal — tpl[9]='G' не равно 'C'
    // (the last char of tail), а tpl[10]='G' уже в anneal.
    const fwdTail = 'CAC'; // 3 bp insertion
    const fwdSeq = fwdTail + fwdAnneal;
    const revSeq = rcomp(tpl.slice(0, 10));
    const template = makeTemplate(tpl);
    const oligo = makeOligo(fwdSeq, revSeq);
    const op = {
      id: 'op-kld', kind: 'kld',
      params: { templateId: 't', primerPairId: 'p' },
    };
    const result = executeKLD(op, { containers: { t: template, p: oligo } });
    expect(result.error).toBeUndefined();
    const mutant = result.outputs[0];
    expect(mutant.length).toBe(tpl.length + 3); // +3 bp insertion
    expect(mutant.sequence.startsWith('CAC')).toBe(true);
    expect(mutant.origin.insertionSize).toBe(3);
    expect(mutant.origin.deletionSize).toBe(0);
  });

  it('deletion mutation via gap между primers', () => {
    const tpl = 'AAAATTTTGGGGCCCCGGGGATCGATCGAT'; // 30 bp
    // fwd anneal at top[13..22] (10 bp).
    // rev anneal at top[0..9]. Gap = 13 - (0+10) = 3 → 3 bp deletion.
    const fwdSeq = tpl.slice(13, 23);
    const revSeq = rcomp(tpl.slice(0, 10));
    const template = makeTemplate(tpl);
    const oligo = makeOligo(fwdSeq, revSeq);
    const op = {
      id: 'op-kld', kind: 'kld',
      params: { templateId: 't', primerPairId: 'p' },
    };
    const result = executeKLD(op, { containers: { t: template, p: oligo } });
    expect(result.error).toBeUndefined();
    expect(result.outputs[0].length).toBe(tpl.length - 3);
    expect(result.outputs[0].origin.deletionSize).toBe(3);
  });

  it('rejects primers that не аннелируют', () => {
    const tpl = 'AAAATTTTGGGGCCCCGGGGATCGATCGAT';
    const fwdSeq = 'XYXYXYXYXYXYXY'; // bogus
    const revSeq = 'ZZZZZZZZZZZZZZ';
    const template = makeTemplate(tpl);
    const oligo = makeOligo(fwdSeq, revSeq);
    const op = {
      id: 'op-kld', kind: 'kld',
      params: { templateId: 't', primerPairId: 'p' },
    };
    const result = executeKLD(op, { containers: { t: template, p: oligo } });
    expect(result.error).toMatch(/не аннелирует/);
  });

  it('rejects primers facing each other (regular PCR mode, not KLD)', () => {
    // 200 bp plasmid; fwd at top[0..9], rev at top[100..109].
    // Primers face each other; gap = 0 - (100+10) = -110 → +200 = 90 (>50).
    const tpl = 'A'.repeat(50) + 'GCATGCATGC' + 'T'.repeat(40) + 'CGTACGTACG' + 'A'.repeat(50)
      + 'CCCAAATTTG' + 'A'.repeat(40);
    // Actually let me build a tpl where positions are known:
    const tpl2 = 'AAAAAAAAAA' // 0..9
      + 'CCCCCCCCCC' // 10..19
      + 'GGGGGGGGGG' // 20..29
      + 'TTTTTTTTTT' // 30..39
      + 'ATCGATCGAT' // 40..49
      + 'GCATGCATGC' // 50..59
      + 'AAAAATTTTT' // 60..69
      + 'GGGGGCCCCC' // 70..79
      + 'TATATATATA' // 80..89
      + 'CGCGCGCGCG'; // 90..99 (total 100 bp)
    // fwd anneal at top[10..19] = 'CCCCCCCCCC'
    // rev anneal at top[60..69] = 'AAAAATTTTT', revRc = rcomp = 'AAAAATTTTT' (palindromic-ish)
    // Wait, rcomp('AAAAATTTTT') = rcomp = reverse then complement = 'TTTTTAAAAA' → 'AAAAATTTTT'. Coincidence palindromic.
    // Pick non-palindromic anneal: 'GCATGCATGC' at top[50..59].
    // fwd = 'CCCCCCCCCC' (top[10..19])
    // rev anneal in top = 'GCATGCATGC' (top[50..59]); rev = rcomp = 'GCATGCATGC'... also palindromic. Hmm.
    // Use 'TATATATATA' at top[80..89]; rcomp('TATATATATA') = 'TATATATATA'... also palindrome.
    // Use 'CGCGCGCGCG' at top[90..99]; rcomp = 'CGCGCGCGCG'... palindrome.
    // Let me just pick a unique non-palindromic chunk: 'ATCGATCGAT' at top[40..49]; rcomp = 'ATCGATCGAT'... wait
    // rcomp('ATCGATCGAT'): reverse = 'TAGCTAGCTA', complement = 'ATCGATCGAT'. Palindrome.
    // Use 'AAAGGGCCC' at some position. Let me rebuild tpl with non-palindromic chunks.
    const tplGood = 'AAAAAAAAAA' // 0..9
      + 'CCCAAATTTG' // 10..19 (non-palindrome)
      + 'GGGGGGGGGG' // 20..29
      + 'TTTTTTTTTT' // 30..39
      + 'GCTAGCAATC' // 40..49 (non-palindrome)
      + 'GCATGCATGC' // 50..59
      + 'AAAAATTTTT' // 60..69
      + 'GGGGGCCCCC' // 70..79
      + 'TATATATATA' // 80..89
      + 'AGAGAGAGAG'; // 90..99 (non-palindrome)
    const fwdSeq = tplGood.slice(10, 20); // 'CCCAAATTTG' at top[10..19]
    const revAnneal = tplGood.slice(50, 60); // 'GCATGCATGC' at top[50..59]
    const revSeq = rcomp(revAnneal);
    const template = makeTemplate(tplGood);
    const oligo = makeOligo(fwdSeq, revSeq);
    const op = {
      id: 'op-kld', kind: 'kld',
      params: { templateId: 't', primerPairId: 'p' },
    };
    const result = executeKLD(op, { containers: { t: template, p: oligo } });
    expect(result.error).toMatch(/не back-to-back/);
  });

  it('annotation внутри interior preserved with shift', () => {
    const tpl = 'AAAATTTTGGGGCCCCGGGGATCGATCGAT'; // 30 bp
    // fwd at top[10..19], rev at top[0..9], gap=0.
    // Interior = tpl[20..29] = 'ATCGATCGAT' (no wrap because revAnnealStart=0 < fwdAnnealEnd=20).
    // Wait, in my code: if (revA.annealStart >= fwdAnnealEnd) → no wrap.
    // Here revA.annealStart=0, fwdAnnealEnd=20. 0 >= 20? No. So wrap.
    // Wrap: interior = tpl[20..29] + tpl[0..-1=''] = 'ATCGATCGAT' + ''.
    // Annotations: ann at start=22, end=27 → in tpl[22..27]. That's в первой части interior wrap.
    // first part [fwdAnnealEnd..L) = [20..30) → ann[22..27] fits.
    // New coords: fwd.length + (ann.start - fwdAnnealEnd) = 10 + (22 - 20) = 12; end = 10 + 27 - 20 = 17.
    const template = makeTemplate(tpl, [
      { id: 'a1', name: 'feat1', start: 22, end: 27 }, // tpl[22..27] в interior
      { id: 'a2', name: 'feat2', start: 5, end: 8 },   // tpl[5..8] в primer region — должен dropped
    ]);
    const fwdSeq = tpl.slice(10, 20);
    const revSeq = rcomp(tpl.slice(0, 10));
    const oligo = makeOligo(fwdSeq, revSeq);
    const op = {
      id: 'op-kld', kind: 'kld',
      params: { templateId: 't', primerPairId: 'p' },
    };
    const result = executeKLD(op, { containers: { t: template, p: oligo } });
    expect(result.error).toBeUndefined();
    const anns = result.outputs[0].annotations;
    const featA = anns.find((a) => a.id === 'a1');
    expect(featA).toEqual(expect.objectContaining({ start: 12, end: 17 }));
    // feat2 крест primer region — должен dropped (либо в primer области, либо out of interior).
    const featB = anns.find((a) => a.id === 'a2');
    expect(featB).toBeUndefined();
  });

  it('error if circular template отсутствует', () => {
    const tpl = { id: 't', kind: 'molecule', sequence: 'AAAA', topology: { circular: false } };
    const op = { id: 'op', kind: 'kld', params: { templateId: 't', primerPairId: 'p' } };
    const result = executeKLD(op, { containers: { t: tpl } });
    expect(result.error).toMatch(/circular/);
  });

  it('error if primer pair отсутствует', () => {
    const tpl = makeTemplate('AAAATTTTGGGGCCCCGGGGATCGATCGAT');
    const op = { id: 'op', kind: 'kld', params: { templateId: 't' } };
    const result = executeKLD(op, { containers: { t: tpl } });
    expect(result.error).toMatch(/праймер-пар|primer/i);
  });
});
