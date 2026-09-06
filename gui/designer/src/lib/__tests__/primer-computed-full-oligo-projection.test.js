import { describe, expect, it } from 'vitest';

import { reverseComplement } from '../../sequence-utils';
import { DEFAULT_PRIMER_BINDING_MIN_LENGTH } from '../primer-binding-search';
import { projectPrimerSites } from '../primer-site-projection';

const CORE_TOP = 'ACGTCAGTACGATCGA';
const EXTENSION_TOP = 'GATTACA';
const TRUE_TAIL = 'CCC';
const LEFT = 'TTTT';

function computed(record, template) {
  return projectPrimerSites(
    { id: 'primer', sites: [], ...record },
    { template, topology: 'linear', entryId: 'entry', documentHash: 'hash' },
  )[0];
}

function expectCanonicalLanding(occurrence, { strand, binding, end }) {
  expect(occurrence).toMatchObject({
    segments: [{ start: LEFT.length, end }],
    strand,
    tail: TRUE_TAIL,
    annealedSequence: binding,
    unpairedPrefixLength: TRUE_TAIL.length,
    alignment: {
      query: binding,
      target: binding,
      editDistance: 0,
    },
    evidence: 'computed',
  });
}

describe('computed sites still align the full physical oligo', () => {
  it('derives one forward landing regardless of the helper tail/body boundary', () => {
    const binding = `${EXTENSION_TOP}${CORE_TOP}`;
    const sequence = `${TRUE_TAIL}${binding}`;
    const template = `${LEFT}${binding}GGGG`;
    const mixedHelper = computed({
      direction: 'forward',
      tail: `${TRUE_TAIL}${EXTENSION_TOP}`,
      bindingSequence: CORE_TOP,
      sequence,
    }, template);
    const actualBoundary = computed({
      direction: 'forward',
      tail: TRUE_TAIL,
      bindingSequence: binding,
      sequence,
    }, template);

    expectCanonicalLanding(mixedHelper, {
      strand: 1,
      binding,
      end: LEFT.length + binding.length,
    });
    expectCanonicalLanding(actualBoundary, {
      strand: 1,
      binding,
      end: LEFT.length + binding.length,
    });
    const extensionFromSeed = binding.length - DEFAULT_PRIMER_BINDING_MIN_LENGTH;
    expect(mixedHelper.confirmedFivePrimeSuffixLength).toBe(extensionFromSeed);
    expect(actualBoundary.confirmedFivePrimeSuffixLength).toBe(extensionFromSeed);
    expect(mixedHelper.key).toBe(actualBoundary.key);
  });

  it('derives the same helper-independent landing for a reverse oligo', () => {
    const core = reverseComplement(CORE_TOP);
    const extension = reverseComplement(EXTENSION_TOP);
    const binding = `${extension}${core}`;
    const sequence = `${TRUE_TAIL}${binding}`;
    const template = `${LEFT}${CORE_TOP}${EXTENSION_TOP}AAAA`;
    const mixedHelper = computed({
      direction: 'reverse',
      tail: `${TRUE_TAIL}${extension}`,
      bindingSequence: core,
      sequence,
    }, template);
    const actualBoundary = computed({
      direction: 'reverse',
      tail: TRUE_TAIL,
      bindingSequence: binding,
      sequence,
    }, template);

    expectCanonicalLanding(mixedHelper, {
      strand: -1,
      binding,
      end: LEFT.length + CORE_TOP.length + EXTENSION_TOP.length,
    });
    expectCanonicalLanding(actualBoundary, {
      strand: -1,
      binding,
      end: LEFT.length + CORE_TOP.length + EXTENSION_TOP.length,
    });
    const extensionFromSeed = binding.length - DEFAULT_PRIMER_BINDING_MIN_LENGTH;
    expect(mixedHelper.confirmedFivePrimeSuffixLength).toBe(extensionFromSeed);
    expect(actualBoundary.confirmedFivePrimeSuffixLength).toBe(extensionFromSeed);
    expect(mixedHelper.key).toBe(actualBoundary.key);
  });

  it('preserves an upstream complementary island across one internal insertion', () => {
    const inserted = 'G';
    const binding = `${EXTENSION_TOP}${inserted}${CORE_TOP}`;
    const sequence = `${TRUE_TAIL}${binding}`;
    const target = `${EXTENSION_TOP}${CORE_TOP}`;
    const occurrence = computed({
      direction: 'forward',
      tail: `${TRUE_TAIL}${EXTENSION_TOP}${inserted}`,
      bindingSequence: CORE_TOP,
      sequence,
    }, `${LEFT}${target}GGGG`);

    expect(occurrence).toMatchObject({
      segments: [{ start: LEFT.length, end: LEFT.length + target.length }],
      strand: 1,
      tail: TRUE_TAIL,
      unpairedPrefixLength: TRUE_TAIL.length,
      annealedSequence: binding,
      alignment: {
        query: binding,
        target,
        counts: { M: target.length, X: 0, I: 1, D: 0 },
        editDistance: 1,
      },
      evidence: 'computed',
    });
  });

  it('discovers the same candidate loci regardless of the helper boundary', () => {
    const binding = `${EXTENSION_TOP}${CORE_TOP}`;
    const sequence = `${TRUE_TAIL}${binding}`;
    const template = `${'T'.repeat(8)}${CORE_TOP}${'T'.repeat(8)}${binding}AAAA`;
    const project = (record) => projectPrimerSites(
      { id: 'primer', direction: 'forward', sequence, sites: [], ...record },
      { template, topology: 'linear', entryId: 'entry', documentHash: 'hash' },
    ).map((occurrence) => ({
      key: occurrence.key,
      segments: occurrence.segments,
      tail: occurrence.tail,
      annealedSequence: occurrence.annealedSequence,
      strand: occurrence.strand,
    }));

    const mixedHelper = project({
      tail: `${TRUE_TAIL}${EXTENSION_TOP}`,
      bindingSequence: CORE_TOP,
    });
    const actualBoundary = project({
      tail: TRUE_TAIL,
      bindingSequence: binding,
    });

    expect(mixedHelper).toHaveLength(2);
    expect(actualBoundary).toHaveLength(2);
    expect(mixedHelper).toEqual(actualBoundary);
  });

  it('does not reuse template bases for a computed landing longer than a short ring', () => {
    const ring = 'ACGTCAGT';
    const sequence = `${ring}ACGT`;
    expect(projectPrimerSites(
      {
        id: 'primer', direction: 'forward',
        tail: '', bindingSequence: sequence, sequence, sites: [],
      },
      { template: ring, topology: 'circular', entryId: 'entry', documentHash: 'hash' },
    )).toEqual([]);
  });

  it('does not call a noncanonical string equality a complementary computed seed', () => {
    const sequence = 'ACGTACGTACGN';
    expect(projectPrimerSites(
      {
        id: 'primer', direction: 'forward',
        tail: '', bindingSequence: sequence, sequence, sites: [],
      },
      {
        template: `TT${sequence}AA`,
        topology: 'linear',
        entryId: 'entry',
        documentHash: 'hash',
      },
    )).toEqual([]);
  });
});
