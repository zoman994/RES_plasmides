/**
 * PRIMER-9 (V175) — executePCR with a tailed (Gibson) primer-pair oligo.
 *
 * Bug: the primerPairId branch searched the FULL primer (homology+anneal) on the
 * template via indexOf → the homology arm is NOT on the template → «primer не
 * найден», PCR failed. Fix: search by bindingSequence (anneal) and build the
 * amplicon WITH the homology overhangs (fwdTail + templated + RC(revTail)) — the
 * whole point of Gibson tails. Tailless oligos stay byte-identical.
 */
import { describe, it, expect } from 'vitest';
import { executePCR } from '../pcr';
import { reverseComplement } from '../../../../../../sequence-utils';
import { alignPrimerBinding } from '../../../../../../lib/primer-binding-alignment';

// template: AAAA | fwdbind(4..16) | CCCCC | revregion(21..33) | TTTT
const FWD_BIND = 'ACGTACGTACGT';
const REV_REGION = 'ATGCATGCATGC';          // on top strand, near 3' end
const REV_BIND = reverseComplement(REV_REGION); // 'GCATGCATGCAT' — primer's own 5'→3'
const TEMPLATE = `AAAA${FWD_BIND}CCCCC${REV_REGION}TTTT`;
const FWD_TAIL = 'GGGGGG';
const REV_TAIL = 'TTTTTT';

function ctxWith(sequences) {
  return {
    containers: {
      tpl1: { id: 'tpl1', name: 'frag', sequence: TEMPLATE },
      oligo1: { id: 'oligo1', kind: 'oligonucleotide', payload: { sequences } },
    },
  };
}
const op = { id: 'op1', params: { primerPairId: 'oligo1', autoDesign: false, templateId: 'tpl1' } };

describe('executePCR — Gibson/tailed primer-pair (V175)', () => {
  it('searches by bindingSequence (homology arm not on template) and keeps the overhangs', () => {
    const ctx = ctxWith([
      { name: 'fwd', sequence: FWD_TAIL + FWD_BIND, bindingSequence: FWD_BIND, tail: FWD_TAIL },
      { name: 'rev', sequence: REV_TAIL + REV_BIND, bindingSequence: REV_BIND, tail: REV_TAIL },
    ]);
    const r = executePCR(op, ctx);
    expect(r.error).toBeUndefined();
    const templatedMiddle = TEMPLATE.slice(4, 33); // fwd binding start .. rev binding end
    expect(r.outputs[0].sequence).toBe(FWD_TAIL + templatedMiddle + reverseComplement(REV_TAIL));
  });

  it('without the fix the full primer would not be found — binding search succeeds', () => {
    const ctx = ctxWith([
      { name: 'fwd', sequence: FWD_TAIL + FWD_BIND, bindingSequence: FWD_BIND, tail: FWD_TAIL },
      { name: 'rev', sequence: REV_TAIL + REV_BIND, bindingSequence: REV_BIND, tail: REV_TAIL },
    ]);
    const r = executePCR(op, ctx);
    expect(r.outputs).toBeTruthy();
    expect(r.outputs[0].sequence.startsWith(FWD_TAIL)).toBe(true);
  });

  it('tailless oligo (sequence only) → amplicon is the templated region, byte-identical to before', () => {
    const ctx = ctxWith([
      { name: 'fwd', sequence: FWD_BIND },
      { name: 'rev', sequence: REV_BIND },
    ]);
    const r = executePCR(op, ctx);
    expect(r.error).toBeUndefined();
    expect(r.outputs[0].sequence).toBe(TEMPLATE.slice(4, 33));
  });
});

describe('P7 — every legacy explicit PCR route enforces the 10-nt physical 3-prime anchor', () => {
  const shortForward = FWD_BIND.slice(0, 9);
  const shortOligo = [
    { name: 'fwd', sequence: shortForward, bindingSequence: shortForward },
    { name: 'rev', sequence: REV_BIND, bindingSequence: REV_BIND },
  ];

  it('fails closed for a single-template primerPairId instead of amplifying an exact 9-mer', () => {
    const result = executePCR(op, ctxWith(shortOligo));

    expect(result.error).toMatch(/меньше 10/i);
    expect(result.error).not.toContain('short-three-prime-anchor');
    expect(result.outputs).toBeUndefined();
  });

  it('fails closed for viewer-authored userPrimers instead of falling through to indexOf', () => {
    const result = executePCR({
      id: 'op-user-short',
      params: {
        templateId: 'tpl1', autoDesign: false,
        userPrimers: [{ forward: shortForward, reverse: REV_BIND }],
      },
    }, ctxWith([]));

    expect(result.error).toMatch(/меньше 10/i);
    expect(result.error).not.toContain('short-three-prime-anchor');
    expect(result.outputs).toBeUndefined();
  });

  it('fails closed for a multi-template explicit pair before producing partial amplicons', () => {
    const ctx = ctxWith(shortOligo);
    ctx.containers.tpl2 = { id: 'tpl2', name: 'frag-2', sequence: TEMPLATE };
    const result = executePCR({
      id: 'op-multi-short',
      params: {
        primerPairId: 'oligo1', autoDesign: false, templateIds: ['tpl1', 'tpl2'],
      },
    }, ctx);

    expect(result.error).toMatch(/меньше 10/i);
    expect(result.error).not.toContain('short-three-prime-anchor');
    expect(result.outputs).toBeUndefined();
  });

  it.each([
    ['primerPairId', (emptyForward) => ({ operation: op, ctx: ctxWith(emptyForward) })],
    ['userPrimers', (emptyForward) => ({
      operation: {
        id: 'op-user-empty',
        params: {
          templateId: 'tpl1', autoDesign: false,
          userPrimers: [{
            forward: FWD_BIND, fwdBinding: '', reverse: REV_BIND, revBinding: REV_BIND,
          }],
        },
      },
      ctx: ctxWith([]),
    })],
    ['multi-template', (emptyForward) => {
      const ctx = ctxWith(emptyForward);
      ctx.containers.tpl2 = { id: 'tpl2', name: 'frag-2', sequence: TEMPLATE };
      return {
        operation: {
          id: 'op-multi-empty',
          params: {
            primerPairId: 'oligo1', autoDesign: false, templateIds: ['tpl1', 'tpl2'],
          },
        },
        ctx,
      };
    }],
  ])('fails closed for an explicitly empty binding through %s', (_route, arrange) => {
    const emptyForward = [
      { name: 'fwd', sequence: FWD_BIND, bindingSequence: '', tail: FWD_BIND },
      { name: 'rev', sequence: REV_BIND, bindingSequence: REV_BIND },
    ];
    const { operation, ctx } = arrange(emptyForward);
    const result = executePCR(operation, ctx);

    expect(result.error).toMatch(/нет посадочной части/i);
    expect(result.outputs).toBeUndefined();
  });

  it('refuses a noncanonical base inside the physical 3-prime anchor with human text', () => {
    const binding = 'ACGNACGTACGT';
    const ctx = ctxWith([
      { name: 'fwd', sequence: binding, bindingSequence: binding },
      { name: 'rev', sequence: REV_BIND, bindingSequence: REV_BIND },
    ]);
    ctx.containers.tpl1.sequence = `AAAA${binding}CCCCC${REV_REGION}TTTT`;
    const result = executePCR(op, ctx);

    expect(result.error).toMatch(/неканоничес/i);
    expect(result.error).not.toContain('noncanonical-three-prime-anchor');
    expect(result.outputs).toBeUndefined();
  });

  it('refuses auto-designed primers from a template shorter than 10 nt', () => {
    const result = executePCR({
      id: 'op-auto-short', params: { templateId: 'short', autoDesign: true },
    }, { containers: { short: { id: 'short', name: 'short', sequence: 'ACGTACGTA' } } });

    expect(result.error).toMatch(/меньше 10/i);
    expect(result.outputs).toBeUndefined();
  });
});

describe('P5 — executePCR replays frozen occurrence evidence', () => {
  const anchor = 'ACGTGACCTAGCTTGA';
  const reverseBinding = 'AAAATTTTGGCC';
  const template = `TT${anchor}${'C'.repeat(8)}${reverseComplement(reverseBinding)}GG`;

  const replayOperation = (binding) => ({
    id: 'op-replay', inputs: ['tpl-replay'],
    params: {
      templateId: 'tpl-replay', occurrenceKeys: ['f#replay', 'r#replay'],
      primerSnapshots: {
        forward: {
          id: 'f', sequence: binding, bindingSequence: binding,
          bindingModel: 'aligned-v1', tail: '', direction: 'forward',
          occurrenceKey: 'f#replay', start: 2, end: 18,
          segments: [{ start: 2, end: 18 }],
          alignment: alignPrimerBinding(binding, anchor),
        },
        reverse: {
          id: 'r', sequence: reverseBinding, bindingSequence: reverseBinding,
          bindingModel: 'aligned-v1', tail: '', direction: 'reverse',
          occurrenceKey: 'r#replay', start: 26, end: 38,
          segments: [{ start: 26, end: 38 }],
          alignment: alignPrimerBinding(reverseBinding, reverseBinding),
        },
      },
    },
  });

  it.each([
    ['D', `${anchor.slice(0, 3)}${anchor.slice(4)}`],
    ['I', `${anchor.slice(0, 3)}G${anchor.slice(3)}`],
  ])('executes an internal %s from snapshot evidence', (opCode, binding) => {
    const result = executePCR(replayOperation(binding), {
      containers: { 'tpl-replay': { id: 'tpl-replay', name: 'replay', sequence: template } },
    });
    expect(result.error).toBeUndefined();
    expect(result.outputs[0].sequence.startsWith(binding)).toBe(true);
    expect(result.outputs[0].origin.primerSnapshots.forward.alignment.counts[opCode]).toBe(1);
  });

  it('preserves a split origin-crossing landing through execution replay', () => {
    const circularTemplate = 'AAAACCCCGGGGTTTTACGTAAAACCCCGGGGTTTTACGT';
    const forwardBinding = `${circularTemplate.slice(34)}${circularTemplate.slice(0, 6)}`;
    const reverse = reverseComplement(circularTemplate.slice(16, 28));
    const operation = {
      id: 'op-origin', inputs: ['tpl-origin'],
      params: {
        templateId: 'tpl-origin', occurrenceKeys: ['f#origin', 'r#origin'],
        primerSnapshots: {
          forward: {
            id: 'f', sequence: forwardBinding, bindingSequence: forwardBinding,
            bindingModel: 'aligned-v1', tail: '', direction: 'forward',
            occurrenceKey: 'f#origin', start: 34, end: 6,
            segments: [{ start: 34, end: 40 }, { start: 0, end: 6 }],
            alignment: alignPrimerBinding(forwardBinding, forwardBinding),
          },
          reverse: {
            id: 'r', sequence: reverse, bindingSequence: reverse,
            bindingModel: 'aligned-v1', tail: '', direction: 'reverse',
            occurrenceKey: 'r#origin', start: 16, end: 28,
            segments: [{ start: 16, end: 28 }],
            alignment: alignPrimerBinding(reverse, reverse),
          },
        },
      },
    };
    const result = executePCR(operation, {
      containers: {
        'tpl-origin': {
          id: 'tpl-origin', name: 'origin', sequence: circularTemplate, circular: true,
        },
      },
    });
    expect(result.error).toBeUndefined();
    expect(result.outputs[0].sequence).toBe(`${forwardBinding}${circularTemplate.slice(6, 28)}`);
    expect(result.outputs[0].origin.primerSnapshots.forward.segments).toEqual([
      { start: 34, end: 40 }, { start: 0, end: 6 },
    ]);
    expect(result.outputs[0].origin.wrapsOrigin).toBe(true);
  });
});
