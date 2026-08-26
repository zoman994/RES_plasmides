/**
 * pcr-amplicon — PRIMER-LIVE-1 root 4.
 *
 * The resolver is handed the TWO landings the user actually clicked. It never
 * re-guesses a landing with `indexOf`: on a repetitive plasmid that silently
 * answers about a different site than the one on screen.
 *
 * The product is what a polymerase would make: the forward oligo WHOLE, the
 * template between the landings, then the reverse-complement of the reverse
 * oligo WHOLE. So a 5' tail and a deliberately substituted base are part of the
 * product, because they are part of the primer.
 */
import { describe, it, expect } from 'vitest';
import { resolvePcrProduct } from '../pcr-amplicon';
import { alignPrimerBinding } from '../primer-binding-alignment';

//        0         1         2         3
//        0123456789012345678901234567890123456789
const TPL = 'GGGGAAAACCTTTTGGGGAACCCCTTTTGGAATTCCGGAA'; // 40 nt

const FWD_AT_4 = 'AAAACCTT'; // TPL[4..12)
const REV_AT_24 = 'TTCCAAAA'; // rc(TPL[24..32)) — the oligo itself

const occ = (over) => ({
  key: over.key || `${over.primerId}#s`,
  primerId: over.primerId,
  start: over.start,
  end: over.end,
  strand: over.strand,
  evidence: over.evidence || 'source',
  ...over,
});

const primer = (over) => ({
  id: over.id,
  name: over.name || over.id,
  sequence: over.sequence,
  bindingSequence: over.bindingSequence ?? over.sequence,
  tail: over.tail ?? '',
  direction: over.strand === -1 ? 'reverse' : 'forward',
  ...over,
});

describe('linear product', () => {
  const primersById = {
    f: primer({ id: 'f', sequence: FWD_AT_4, strand: 1 }),
    r: primer({ id: 'r', sequence: REV_AT_24, strand: -1 }),
  };
  const occurrences = [
    occ({ primerId: 'f', start: 4, end: 12, strand: 1 }),
    occ({ primerId: 'r', start: 24, end: 32, strand: -1 }),
  ];

  it('is the template between the two landings, inclusive of both', () => {
    const got = resolvePcrProduct({
      template: TPL, topology: 'linear', occurrences, primersById,
    });
    expect(got.ok).toBe(true);
    expect(got.product.sequence).toBe('AAAACCTTTTGGGGAACCCCTTTTGGAA');
    expect(got.product.length).toBe(28);
    expect(got.product.wrapsOrigin).toBe(false);
  });

  it('does not care in which order the two landings were clicked', () => {
    const flipped = resolvePcrProduct({
      template: TPL, topology: 'linear', occurrences: [occurrences[1], occurrences[0]], primersById,
    });
    expect(flipped.ok).toBe(true);
    expect(flipped.product.sequence).toBe('AAAACCTTTTGGGGAACCCCTTTTGGAA');
  });
});

describe('tails and deliberate substitutions travel into the product', () => {
  it('carries both 5-prime tails, the reverse one reverse-complemented', () => {
    const primersById = {
      f: primer({ id: 'f', sequence: `GAATTC${FWD_AT_4}`, bindingSequence: FWD_AT_4, tail: 'GAATTC', strand: 1 }),
      r: primer({ id: 'r', sequence: `AAAGGG${REV_AT_24}`, bindingSequence: REV_AT_24, tail: 'AAAGGG', strand: -1 }),
    };
    const got = resolvePcrProduct({
      template: TPL,
      topology: 'linear',
      occurrences: [
        occ({ primerId: 'f', start: 4, end: 12, strand: 1 }),
        occ({ primerId: 'r', start: 24, end: 32, strand: -1 }),
      ],
      primersById,
    });
    expect(got.ok).toBe(true);
    expect(got.product.sequence)
      .toBe('GAATTCAAAACCTTTTGGGGAACCCCTTTTGGAACCCTTT');
    expect(got.product.length).toBe(40);
  });

  it('uses the PRIMER base, not the template base, where the user changed one', () => {
    // forward oligo differs from TPL[4..12) at its index 2 (absolute 6)
    const mutated = 'AATACCTT';
    const primersById = {
      f: primer({ id: 'f', sequence: mutated, strand: 1 }),
      r: primer({ id: 'r', sequence: REV_AT_24, strand: -1 }),
    };
    const got = resolvePcrProduct({
      template: TPL,
      topology: 'linear',
      occurrences: [
        occ({ primerId: 'f', start: 4, end: 12, strand: 1 }),
        occ({ primerId: 'r', start: 24, end: 32, strand: -1 }),
      ],
      primersById,
    });
    expect(got.ok).toBe(true);
    expect(got.product.sequence.startsWith('AATACCTT')).toBe(true);
    const mm = got.warnings.find((w) => w.code === 'mismatch');
    expect(mm).toBeTruthy();
    expect(mm.blocking).toBe(false);
  });
});

describe('aligned-v1 indels travel into the product while footprints bound the interior', () => {
  const reverseRecord = primer({ id: 'r', sequence: REV_AT_24, strand: -1 });
  const reverseOccurrence = occ({ primerId: 'r', start: 24, end: 32, strand: -1 });

  it('inserts a query-only forward base and keeps the template interior at footprint end', () => {
    const body = `${FWD_AT_4.slice(0, 4)}G${FWD_AT_4.slice(4)}`;
    const got = resolvePcrProduct({
      template: TPL,
      topology: 'linear',
      occurrences: [
        occ({
          primerId: 'f', start: 4, end: 12, strand: 1,
          alignment: alignPrimerBinding(body, FWD_AT_4),
        }),
        reverseOccurrence,
      ],
      primersById: {
        f: primer({
          id: 'f', bindingModel: 'aligned-v1', sequence: body,
          bindingSequence: body, strand: 1,
        }),
        r: reverseRecord,
      },
    });
    expect(got.ok).toBe(true);
    expect(got.product.sequence).toBe(`${body}${TPL.slice(12, 24)}${revComp(REV_AT_24)}`);
    expect(got.warnings).toContainEqual(expect.objectContaining({ code: 'insertion', count: 1 }));
    expect(got.warnings).toContainEqual(expect.objectContaining({ code: 'gapped-tm-unknown', tm: null }));
  });

  it('deletes a target-only forward base without leaking it back from the template', () => {
    const body = `${FWD_AT_4.slice(0, 4)}${FWD_AT_4.slice(5)}`;
    const got = resolvePcrProduct({
      template: TPL,
      topology: 'linear',
      occurrences: [
        occ({
          primerId: 'f', start: 4, end: 12, strand: 1,
          alignment: alignPrimerBinding(body, FWD_AT_4),
        }),
        reverseOccurrence,
      ],
      primersById: {
        f: primer({
          id: 'f', bindingModel: 'aligned-v1', sequence: body,
          bindingSequence: body, strand: 1,
        }),
        r: reverseRecord,
      },
    });
    expect(got.ok).toBe(true);
    expect(got.product.sequence).toBe(`${body}${TPL.slice(12, 24)}${revComp(REV_AT_24)}`);
    expect(got.warnings).toContainEqual(expect.objectContaining({ code: 'deletion', count: 1 }));
  });

  it('carries a reverse-primer insertion through a circular origin-wrap product', () => {
    const fwd = 'AATTCCGG';
    const reverseAnchor = 'AAAAGGTT';
    const reverseBody = `${reverseAnchor.slice(0, 4)}G${reverseAnchor.slice(4)}`;
    const got = resolvePcrProduct({
      template: TPL,
      topology: 'circular',
      occurrences: [
        occ({ primerId: 'f', start: 30, end: 38, strand: 1 }),
        occ({
          primerId: 'r', start: 6, end: 14, strand: -1,
          alignment: alignPrimerBinding(reverseBody, reverseAnchor),
        }),
      ],
      primersById: {
        f: primer({ id: 'f', sequence: fwd, strand: 1 }),
        r: primer({
          id: 'r', bindingModel: 'aligned-v1', sequence: reverseBody,
          bindingSequence: reverseBody, strand: -1,
        }),
      },
    });
    expect(got.ok).toBe(true);
    expect(got.product.wrapsOrigin).toBe(true);
    expect(got.product.sequence.endsWith(revComp(reverseBody))).toBe(true);
    expect(got.product.length).toBe(25);
  });
});

describe('circular origin wrap', () => {
  it('produces the wrapped product and does not call it inverse PCR', () => {
    const fwd = 'AATTCCGG'; // TPL[30..38)
    const rev = 'AAAAGGTT'; // rc(TPL[6..14))
    const primersById = {
      f: primer({ id: 'f', sequence: fwd, strand: 1 }),
      r: primer({ id: 'r', sequence: rev, strand: -1 }),
    };
    const got = resolvePcrProduct({
      template: TPL,
      topology: 'circular',
      occurrences: [
        occ({ primerId: 'f', start: 30, end: 38, strand: 1 }),
        occ({ primerId: 'r', start: 6, end: 14, strand: -1 }),
      ],
      primersById,
    });
    expect(got.ok).toBe(true);
    expect(got.product.sequence).toBe('AATTCCGGAAGGGGAAAACCTTTT');
    expect(got.product.length).toBe(24);
    expect(got.product.wrapsOrigin).toBe(true);
    expect(got.product.method).not.toBe('inverse-pcr');
  });

  it('refuses the same wrapped geometry on a LINEAR molecule', () => {
    const primersById = {
      f: primer({ id: 'f', sequence: 'AATTCCGG', strand: 1 }),
      r: primer({ id: 'r', sequence: 'AAAAGGTT', strand: -1 }),
    };
    const got = resolvePcrProduct({
      template: TPL,
      topology: 'linear',
      occurrences: [
        occ({ primerId: 'f', start: 30, end: 38, strand: 1 }),
        occ({ primerId: 'r', start: 6, end: 14, strand: -1 }),
      ],
      primersById,
    });
    expect(got.ok).toBe(false);
    expect(got.reason).toBe('no-product');
  });
});

describe('the chosen landings are the answer — never indexOf', () => {
  // The forward binding occurs TWICE. A resolver that searched the template
  // would answer about whichever copy it found first.
  //          0..7      8..15     16..23    24..31    32..39
  const tpl = 'AAAACCTT' + 'GGGGTTTT' + 'AAAACCTT' + 'CCCCAAAA' + 'CCGGAATT';
  const revLanding = tpl.slice(32, 40); // 'CCGGAATT'

  it('uses the SECOND occurrence when the second occurrence was selected', () => {
    const primersById = {
      f: primer({ id: 'f', sequence: 'AAAACCTT', strand: 1 }),
      r: primer({ id: 'r', sequence: revComp(revLanding), strand: -1 }),
    };
    const first = resolvePcrProduct({
      template: tpl,
      topology: 'circular',
      occurrences: [
        occ({ key: 'f#a', primerId: 'f', start: 0, end: 8, strand: 1 }),
        occ({ key: 'r#a', primerId: 'r', start: 32, end: 40, strand: -1 }),
      ],
      primersById,
    });
    const second = resolvePcrProduct({
      template: tpl,
      topology: 'circular',
      occurrences: [
        occ({ key: 'f#b', primerId: 'f', start: 16, end: 24, strand: 1 }),
        occ({ key: 'r#a', primerId: 'r', start: 32, end: 40, strand: -1 }),
      ],
      primersById,
    });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(second.product.length).toBe(24);
    expect(first.product.length).toBe(40);
    expect(first.product.sequence).not.toBe(second.product.sequence);
    expect(second.product.forward.key).toBe('f#b');
  });
});

describe('blocking reasons fail closed', () => {
  const primersById = {
    f: primer({ id: 'f', sequence: FWD_AT_4, strand: 1 }),
    f2: primer({ id: 'f2', sequence: 'TTTTGGGG', strand: 1 }),
    r: primer({ id: 'r', sequence: REV_AT_24, strand: -1 }),
  };

  it('blocks two primers pointing the same way', () => {
    const got = resolvePcrProduct({
      template: TPL,
      topology: 'linear',
      occurrences: [
        occ({ primerId: 'f', start: 4, end: 12, strand: 1 }),
        occ({ primerId: 'f2', start: 24, end: 32, strand: 1 }),
      ],
      primersById,
    });
    expect(got.ok).toBe(false);
    expect(got.reason).toBe('same-direction');
  });

  it('blocks a stale landing rather than amplifying an old coordinate', () => {
    const got = resolvePcrProduct({
      template: TPL,
      topology: 'linear',
      occurrences: [
        occ({ primerId: 'f', start: 4, end: 12, strand: 1, stale: true }),
        occ({ primerId: 'r', start: 24, end: 32, strand: -1 }),
      ],
      primersById,
    });
    expect(got.ok).toBe(false);
    expect(got.reason).toBe('stale-site');
  });

  it('blocks when the full oligo is unknown — the product would be a guess', () => {
    const got = resolvePcrProduct({
      template: TPL,
      topology: 'linear',
      occurrences: [
        occ({ primerId: 'f', start: 4, end: 12, strand: 1 }),
        occ({ primerId: 'r', start: 24, end: 32, strand: -1 }),
      ],
      primersById: {
        ...primersById,
        r: primer({ id: 'r', sequence: null, bindingSequence: REV_AT_24, strand: -1 }),
      },
    });
    expect(got.ok).toBe(false);
    expect(got.reason).toBe('unknown-sequence');
  });

  it('blocks when the record contradicts itself: sequence != tail + binding', () => {
    const got = resolvePcrProduct({
      template: TPL,
      topology: 'linear',
      occurrences: [
        occ({ primerId: 'f', start: 4, end: 12, strand: 1 }),
        occ({ primerId: 'r', start: 24, end: 32, strand: -1 }),
      ],
      primersById: {
        ...primersById,
        f: primer({
          id: 'f', sequence: `GAATTC${FWD_AT_4}`, bindingSequence: FWD_AT_4, tail: 'TTTTTT', strand: 1,
        }),
      },
    });
    expect(got.ok).toBe(false);
    expect(got.reason).toBe('tail-binding-conflict');
  });

  it('blocks an indel landing — the footprint and the oligo disagree in length', () => {
    const got = resolvePcrProduct({
      template: TPL,
      topology: 'linear',
      occurrences: [
        occ({ primerId: 'f', start: 4, end: 11, strand: 1 }), // 7 bases vs an 8-mer
        occ({ primerId: 'r', start: 24, end: 32, strand: -1 }),
      ],
      primersById,
    });
    expect(got.ok).toBe(false);
    expect(got.reason).toBe('indel-unsupported');
  });

  it('needs exactly two landings', () => {
    const got = resolvePcrProduct({
      template: TPL,
      topology: 'linear',
      occurrences: [occ({ primerId: 'f', start: 4, end: 12, strand: 1 })],
      primersById,
    });
    expect(got.ok).toBe(false);
    expect(got.reason).toBe('need-two-occurrences');
  });
});

function revComp(s) {
  const M = { A: 'T', C: 'G', G: 'C', T: 'A' };
  return s.split('').reverse().map((c) => M[c] || c).join('');
}
