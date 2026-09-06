import { describe, expect, it } from 'vitest';

import { reverseComplement } from '../../sequence-utils';
import { resolvePcrProduct } from '../pcr-amplicon';
import { projectPrimerPool } from '../primer-site-projection';

const FORWARD_CORE = 'ACGTCAGTACGATCGA';
const COMPLEMENTARY_EXTENSION = 'GATTACA';
const REVERSE_TOP = 'TGCATTCGAGTCCGTA';
const INTERIOR = 'CCGGAATTCCGGAA';
const LEFT_CONTEXT = 'AAAGGG';
const TEMPLATE = `${LEFT_CONTEXT}${COMPLEMENTARY_EXTENSION}${FORWARD_CORE}${INTERIOR}${REVERSE_TOP}TTTT`;
const FORWARD_START = LEFT_CONTEXT.length + COMPLEMENTARY_EXTENSION.length;
const REVERSE_START = FORWARD_START + FORWARD_CORE.length + INTERIOR.length;

function site(id, start, end, strand, annealedSequence) {
  return {
    id,
    target: { entryId: 'entry', resourceHash: 'hash', topology: 'linear' },
    location: { kind: 'single', segments: [{ start, end }] },
    strand,
    annealedSequence,
    tail: '',
  };
}

describe('PCR consumes the effective full-oligo landing', () => {
  it('uses a complementary tail suffix as binding and keeps only the true overhang in the product', () => {
    const forward = {
      id: 'forward', direction: 'forward', bindingModel: 'aligned-v1',
      tail: `CCC${COMPLEMENTARY_EXTENSION}`,
      bindingSequence: FORWARD_CORE,
      sequence: `CCC${COMPLEMENTARY_EXTENSION}${FORWARD_CORE}`,
      sites: [site(
        'forward-site', FORWARD_START, FORWARD_START + FORWARD_CORE.length, 1, FORWARD_CORE,
      )],
    };
    const reverseBinding = reverseComplement(REVERSE_TOP);
    const reverse = {
      id: 'reverse', direction: 'reverse', bindingModel: 'aligned-v1',
      tail: '', bindingSequence: reverseBinding, sequence: reverseBinding,
      sites: [site(
        'reverse-site', REVERSE_START, REVERSE_START + REVERSE_TOP.length, -1, reverseBinding,
      )],
    };
    const occurrences = projectPrimerPool([forward, reverse], {
      template: TEMPLATE,
      topology: 'linear',
      entryId: 'entry',
      documentHash: 'hash',
    });

    const result = resolvePcrProduct({
      template: TEMPLATE,
      topology: 'linear',
      entryId: 'entry',
      documentHash: 'hash',
      occurrences,
      primersById: { forward, reverse },
    });

    expect(result.ok).toBe(true);
    expect(result.product.sequence).toBe(
      `CCC${COMPLEMENTARY_EXTENSION}${FORWARD_CORE}${INTERIOR}${REVERSE_TOP}`,
    );
    expect(result.product.forward.bindingSequence)
      .toBe(`${COMPLEMENTARY_EXTENSION}${FORWARD_CORE}`);
    expect(result.product.forward.tail).toBe('CCC');
    expect(result.product.forward.start).toBe(LEFT_CONTEXT.length);
    expect(result.product.forward.alignment.editDistance).toBe(0);
  });

  it.each([
    [
      'tail plus binding when sequence is omitted',
      { tail: `CCC${COMPLEMENTARY_EXTENSION}`, bindingSequence: FORWARD_CORE },
    ],
    [
      'an implicit prefix stored in sequence',
      {
        tail: '',
        bindingSequence: FORWARD_CORE,
        sequence: `CCC${COMPLEMENTARY_EXTENSION}${FORWARD_CORE}`,
      },
    ],
  ])('keeps the same product for legacy helper shape: %s', (_label, shape) => {
    const forward = {
      id: 'forward', direction: 'forward',
      ...shape,
      sites: [site(
        'forward-site', FORWARD_START, FORWARD_START + FORWARD_CORE.length, 1, FORWARD_CORE,
      )],
    };
    const reverseBinding = reverseComplement(REVERSE_TOP);
    const reverse = {
      id: 'reverse', direction: 'reverse',
      tail: '', bindingSequence: reverseBinding, sequence: reverseBinding,
      sites: [site(
        'reverse-site', REVERSE_START, REVERSE_START + REVERSE_TOP.length, -1, reverseBinding,
      )],
    };
    const occurrences = projectPrimerPool([forward, reverse], {
      template: TEMPLATE,
      topology: 'linear',
      entryId: 'entry',
      documentHash: 'hash',
    });

    const result = resolvePcrProduct({
      template: TEMPLATE,
      topology: 'linear',
      occurrences,
      primersById: { forward, reverse },
    });

    expect(result.ok).toBe(true);
    expect(result.product.sequence).toBe(
      `CCC${COMPLEMENTARY_EXTENSION}${FORWARD_CORE}${INTERIOR}${REVERSE_TOP}`,
    );
    expect(result.product.forward).toMatchObject({
      fullSequence: `CCC${COMPLEMENTARY_EXTENSION}${FORWARD_CORE}`,
      bindingSequence: `${COMPLEMENTARY_EXTENSION}${FORWARD_CORE}`,
      tail: 'CCC',
      start: LEFT_CONTEXT.length,
    });
  });

  it.each([
    [
      'tail plus binding when sequence is omitted',
      (extension, binding) => ({ tail: `CCC${extension}`, bindingSequence: binding }),
    ],
    [
      'an implicit prefix stored in sequence',
      (extension, binding) => ({
        tail: '', bindingSequence: binding, sequence: `CCC${extension}${binding}`,
      }),
    ],
  ])('does the same for a reverse oligo: %s', (_label, shape) => {
    const reverseExtensionTop = 'TGTAATC';
    const reverseExtension = reverseComplement(reverseExtensionTop);
    const reverseBinding = reverseComplement(REVERSE_TOP);
    const reverseTemplate = `${LEFT_CONTEXT}${FORWARD_CORE}${INTERIOR}`
      + `${REVERSE_TOP}${reverseExtensionTop}TTTT`;
    const forwardStart = LEFT_CONTEXT.length;
    const reverseStart = forwardStart + FORWARD_CORE.length + INTERIOR.length;
    const forward = {
      id: 'forward', direction: 'forward',
      tail: '', bindingSequence: FORWARD_CORE, sequence: FORWARD_CORE,
      sites: [site(
        'forward-site', forwardStart, forwardStart + FORWARD_CORE.length, 1, FORWARD_CORE,
      )],
    };
    const reverse = {
      id: 'reverse', direction: 'reverse',
      ...shape(reverseExtension, reverseBinding),
      sites: [site(
        'reverse-site', reverseStart, reverseStart + REVERSE_TOP.length, -1, reverseBinding,
      )],
    };
    const occurrences = projectPrimerPool([forward, reverse], {
      template: reverseTemplate,
      topology: 'linear',
      entryId: 'entry',
      documentHash: 'hash',
    });

    const result = resolvePcrProduct({
      template: reverseTemplate,
      topology: 'linear',
      entryId: 'entry',
      documentHash: 'hash',
      occurrences,
      primersById: { forward, reverse },
    });

    expect(result.ok).toBe(true);
    expect(result.product.sequence).toBe(
      `${FORWARD_CORE}${INTERIOR}${REVERSE_TOP}${reverseExtensionTop}GGG`,
    );
    expect(result.product.reverse).toMatchObject({
      fullSequence: `CCC${reverseExtension}${reverseBinding}`,
      bindingSequence: `${reverseExtension}${reverseBinding}`,
      tail: 'CCC',
      start: reverseStart,
      end: reverseStart + REVERSE_TOP.length + reverseExtensionTop.length,
    });
    expect(result.product.reverse.alignment.editDistance).toBe(0);
  });
});
