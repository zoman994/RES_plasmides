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
import { projectPrimerPool } from '../primer-site-projection';
import { selectedOccurrencesFor } from '../primer-live-workflow';

//        0         1         2         3
//        0123456789012345678901234567890123456789
const TPL = 'GGGGAAAACCTTTTGGGGAACCCCTTTTGGAATTCCGGAA'; // 40 nt

const FWD_AT_4 = 'AAAACCTTTTGG'; // TPL[4..16)
const REV_AT_24 = 'GGAATTCCAAAA'; // rc(TPL[24..36)) — the oligo itself

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
    occ({ primerId: 'f', start: 4, end: 16, strand: 1 }),
    occ({ primerId: 'r', start: 24, end: 36, strand: -1 }),
  ];

  it('is the template between the two landings, inclusive of both', () => {
    const got = resolvePcrProduct({
      template: TPL, topology: 'linear', occurrences, primersById,
    });
    expect(got.ok).toBe(true);
    expect(got.product.sequence).toBe(`${FWD_AT_4}${TPL.slice(16, 24)}${revComp(REV_AT_24)}`);
    expect(got.product.length).toBe(32);
    expect(got.product.wrapsOrigin).toBe(false);
  });

  it('does not care in which order the two landings were clicked', () => {
    const flipped = resolvePcrProduct({
      template: TPL, topology: 'linear', occurrences: [occurrences[1], occurrences[0]], primersById,
    });
    expect(flipped.ok).toBe(true);
    expect(flipped.product.sequence).toBe(`${FWD_AT_4}${TPL.slice(16, 24)}${revComp(REV_AT_24)}`);
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
        occ({ primerId: 'f', start: 4, end: 16, strand: 1 }),
        occ({ primerId: 'r', start: 24, end: 36, strand: -1 }),
      ],
      primersById,
    });
    expect(got.ok).toBe(true);
    expect(got.product.sequence)
      .toBe(`GAATTC${FWD_AT_4}${TPL.slice(16, 24)}${revComp(REV_AT_24)}CCCTTT`);
    expect(got.product.length).toBe(44);
  });

  it('uses the PRIMER base, not the template base, where the user changed one', () => {
    // The mismatch is internal, with ten canonical bases still anchoring the physical 3' end.
    const mutated = `${FWD_AT_4[0]}T${FWD_AT_4.slice(2)}`;
    const primersById = {
      f: primer({ id: 'f', sequence: mutated, strand: 1 }),
      r: primer({ id: 'r', sequence: REV_AT_24, strand: -1 }),
    };
    const got = resolvePcrProduct({
      template: TPL,
      topology: 'linear',
      occurrences: [
        occ({ primerId: 'f', start: 4, end: 16, strand: 1 }),
        occ({ primerId: 'r', start: 24, end: 36, strand: -1 }),
      ],
      primersById,
    });
    expect(got.ok).toBe(true);
    expect(got.product.sequence.startsWith(mutated)).toBe(true);
    const mm = got.warnings.find((w) => w.code === 'mismatch');
    expect(mm).toBeTruthy();
    expect(mm.blocking).toBe(false);
  });
});

describe('aligned-v1 indels travel into the product while footprints bound the interior', () => {
  const reverseRecord = primer({ id: 'r', sequence: REV_AT_24, strand: -1 });
  const reverseOccurrence = occ({ primerId: 'r', start: 24, end: 36, strand: -1 });

  it('inserts a query-only forward base and keeps the template interior at footprint end', () => {
    const body = `${FWD_AT_4[0]}G${FWD_AT_4.slice(1)}`;
    const got = resolvePcrProduct({
      template: TPL,
      topology: 'linear',
      occurrences: [
        occ({
          primerId: 'f', start: 4, end: 16, strand: 1,
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
    expect(got.product.sequence).toBe(`${body}${TPL.slice(16, 24)}${revComp(REV_AT_24)}`);
    expect(got.warnings).toContainEqual(expect.objectContaining({ code: 'insertion', count: 1 }));
    expect(got.warnings).toContainEqual(expect.objectContaining({ code: 'gapped-tm-unknown', tm: null }));
  });

  it('deletes a target-only forward base without leaking it back from the template', () => {
    // The old AAAACCTT fixture had an equal-cost mismatch/clip answer after
    // semiglobal P5 alignment. Distinct flanks make this an unambiguous
    // INTERNAL deletion: ACG[A]GTAC -> ACGGTAC.
    const anchor = 'ACGTGACCTAGCTTGA';
    const body = `${anchor.slice(0, 3)}${anchor.slice(4)}`;
    const reverseBinding = 'AAAATTTTGGCC';
    const template = `TT${anchor}${'C'.repeat(8)}${revComp(reverseBinding)}GG`;
    const forwardSegments = [{ start: 2, end: 18 }];
    const forwardAlignment = alignPrimerBinding(body, anchor);
    const got = resolvePcrProduct({
      template,
      topology: 'linear',
      occurrences: [
        occ({
          primerId: 'f', start: 2, end: 18, strand: 1,
          segments: forwardSegments,
          alignment: forwardAlignment,
        }),
        occ({ primerId: 'r', start: 26, end: 38, strand: -1 }),
      ],
      primersById: {
        f: primer({
          id: 'f', bindingModel: 'aligned-v1', sequence: body,
          bindingSequence: body, strand: 1,
        }),
        r: primer({ id: 'r', sequence: reverseBinding, strand: -1 }),
      },
    });
    expect(got.ok).toBe(true);
    expect(got.product.sequence)
      .toBe(`${body}${template.slice(18, 26)}${revComp(reverseBinding)}`);
    expect(got.warnings).toContainEqual(expect.objectContaining({ code: 'deletion', count: 1 }));
    expect(got.product.forward).toMatchObject({
      bindingModel: 'aligned-v1',
      segments: [{ start: 2, end: 18 }],
      alignment: expect.objectContaining({ editDistance: 1 }),
    });
    expect(got.product.forward.segments).not.toBe(forwardSegments);
    expect(got.product.forward.alignment).not.toBe(forwardAlignment);
    expect(got.product.forward.alignment.runs).not.toBe(forwardAlignment.runs);
  });

  it('carries a reverse-primer insertion through a circular origin-wrap product', () => {
    const fwd = TPL.slice(28, 40);
    const reverseAnchor = revComp(TPL.slice(4, 16));
    const reverseBody = `${reverseAnchor[0]}G${reverseAnchor.slice(1)}`;
    const got = resolvePcrProduct({
      template: TPL,
      topology: 'circular',
      occurrences: [
        occ({ primerId: 'f', start: 28, end: 40, strand: 1 }),
        occ({
          primerId: 'r', start: 4, end: 16, strand: -1,
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
    expect(got.product.length).toBe(29);
  });
});

describe('circular origin wrap', () => {
  it('produces the wrapped product and does not call it inverse PCR', () => {
    const fwd = TPL.slice(28, 40);
    const rev = revComp(TPL.slice(4, 16));
    const primersById = {
      f: primer({ id: 'f', sequence: fwd, strand: 1 }),
      r: primer({ id: 'r', sequence: rev, strand: -1 }),
    };
    const got = resolvePcrProduct({
      template: TPL,
      topology: 'circular',
      occurrences: [
        occ({ primerId: 'f', start: 28, end: 40, strand: 1 }),
        occ({ primerId: 'r', start: 4, end: 16, strand: -1 }),
      ],
      primersById,
    });
    expect(got.ok).toBe(true);
    expect(got.product.sequence).toBe(`${fwd}${TPL.slice(0, 16)}`);
    expect(got.product.length).toBe(28);
    expect(got.product.wrapsOrigin).toBe(true);
    expect(got.product.method).not.toBe('inverse-pcr');
  });

  it('refuses the same wrapped geometry on a LINEAR molecule', () => {
    const fwd = TPL.slice(28, 40);
    const rev = revComp(TPL.slice(4, 16));
    const primersById = {
      f: primer({ id: 'f', sequence: fwd, strand: 1 }),
      r: primer({ id: 'r', sequence: rev, strand: -1 }),
    };
    const got = resolvePcrProduct({
      template: TPL,
      topology: 'linear',
      occurrences: [
        occ({ primerId: 'f', start: 28, end: 40, strand: 1 }),
        occ({ primerId: 'r', start: 4, end: 16, strand: -1 }),
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
  const landing = 'AAAACCTTGGAA';
  const tpl = landing + 'GGGGTTTT' + landing + 'CCCCAAAA' + 'CCGGAATTGGCC';
  const revLanding = tpl.slice(40, 52);

  it('uses the SECOND occurrence when the second occurrence was selected', () => {
    const primersById = {
      f: primer({ id: 'f', sequence: landing, strand: 1 }),
      r: primer({ id: 'r', sequence: revComp(revLanding), strand: -1 }),
    };
    const first = resolvePcrProduct({
      template: tpl,
      topology: 'circular',
      occurrences: [
        occ({ key: 'f#a', primerId: 'f', start: 0, end: 12, strand: 1 }),
        occ({ key: 'r#a', primerId: 'r', start: 40, end: 52, strand: -1 }),
      ],
      primersById,
    });
    const second = resolvePcrProduct({
      template: tpl,
      topology: 'circular',
      occurrences: [
        occ({ key: 'f#b', primerId: 'f', start: 20, end: 32, strand: 1 }),
        occ({ key: 'r#a', primerId: 'r', start: 40, end: 52, strand: -1 }),
      ],
      primersById,
    });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(second.product.length).toBe(32);
    expect(first.product.length).toBe(52);
    expect(first.product.sequence).not.toBe(second.product.sequence);
    expect(second.product.forward.key).toBe('f#b');
  });
});

describe('blocking reasons fail closed', () => {
  const primersById = {
    f: primer({ id: 'f', sequence: FWD_AT_4, strand: 1 }),
    f2: primer({ id: 'f2', sequence: TPL.slice(24, 36), strand: 1 }),
    r: primer({ id: 'r', sequence: REV_AT_24, strand: -1 }),
  };

  it('blocks two primers pointing the same way', () => {
    const got = resolvePcrProduct({
      template: TPL,
      topology: 'linear',
      occurrences: [
        occ({ primerId: 'f', start: 4, end: 16, strand: 1 }),
        occ({ primerId: 'f2', start: 24, end: 36, strand: 1 }),
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
        occ({ primerId: 'f', start: 4, end: 16, strand: 1, stale: true }),
        occ({ primerId: 'r', start: 24, end: 36, strand: -1 }),
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
        occ({ primerId: 'f', start: 4, end: 16, strand: 1 }),
        occ({ primerId: 'r', start: 24, end: 36, strand: -1 }),
      ],
      primersById: {
        ...primersById,
        r: primer({ id: 'r', sequence: null, bindingSequence: null, strand: -1 }),
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
        occ({ primerId: 'f', start: 4, end: 16, strand: 1 }),
        occ({ primerId: 'r', start: 24, end: 36, strand: -1 }),
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

  it('keeps an explicitly empty binding empty even when the full oligo is a 12-nt tail', () => {
    const got = resolvePcrProduct({
      template: TPL,
      topology: 'linear',
      occurrences: [
        occ({ primerId: 'f', start: 4, end: 16, strand: 1 }),
        occ({ primerId: 'r', start: 24, end: 36, strand: -1 }),
      ],
      primersById: {
        f: primer({
          id: 'f', sequence: FWD_AT_4, bindingSequence: '', tail: FWD_AT_4, strand: 1,
        }),
        r: primersById.r,
      },
    });

    expect(got).toMatchObject({
      ok: false, reason: 'no-three-prime-anchor', primerId: 'f',
    });
  });

  it('blocks an indel landing — the footprint and the oligo disagree in length', () => {
    const got = resolvePcrProduct({
      template: TPL,
      topology: 'linear',
      occurrences: [
        occ({ primerId: 'f', start: 4, end: 15, strand: 1 }), // 11 bases vs a 12-mer
        occ({ primerId: 'r', start: 24, end: 36, strand: -1 }),
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
      occurrences: [occ({ primerId: 'f', start: 4, end: 16, strand: 1 })],
      primersById,
    });
    expect(got.ok).toBe(false);
    expect(got.reason).toBe('need-two-occurrences');
  });
});

describe('P5 — effective landing geometry reaches the PCR product', () => {
  const DOC = 'sha256:p5-pcr';

  function sourcePrimer({ id, binding, anchor, start, end, strand }) {
    return primer({
      id, bindingModel: 'aligned-v1', sequence: binding,
      bindingSequence: binding, strand,
      sites: [{
        id: `${id}-site`,
        target: { entryId: 'E5', resourceHash: DOC, topology: 'linear' },
        location: { kind: 'single', segments: [{ start, end }] },
        strand, annealedSequence: anchor, tail: '',
      }],
    });
  }

  function projectedPair(records) {
    const context = {
      template: TPL, topology: 'linear', entryId: 'E5', documentHash: DOC,
    };
    const keys = projectPrimerPool(records, context).map((item) => item.key);
    return selectedOccurrencesFor(
      keys.map((key) => ({ hit: { _occKey: key } })), records, context,
    );
  }

  function legacySourcePrimer({ id, binding, snapshot = binding, start, end, strand }) {
    return primer({
      id, sequence: binding, bindingSequence: binding, strand,
      sites: [{
        id: `${id}-site`,
        target: { entryId: 'E5', resourceHash: DOC, topology: 'linear' },
        location: { kind: 'single', segments: [{ start, end }] },
        strand, annealedSequence: snapshot, tail: '',
      }],
    });
  }

  it('shortens the forward 5-prime edge while preserving its 3-prime endpoint', () => {
    const shortForward = FWD_AT_4.slice(-10);
    const records = [
      sourcePrimer({
        id: 'f', binding: shortForward, anchor: FWD_AT_4,
        start: 4, end: 16, strand: 1,
      }),
      sourcePrimer({
        id: 'r', binding: REV_AT_24, anchor: REV_AT_24,
        start: 24, end: 36, strand: -1,
      }),
    ];
    const got = resolvePcrProduct({
      template: TPL, topology: 'linear', occurrences: projectedPair(records),
      primersById: Object.fromEntries(records.map((record) => [record.id, record])),
    });
    expect(got.ok).toBe(true);
    expect(got.product.forward).toMatchObject({ start: 6, end: 16 });
    expect(got.product.sequence)
      .toBe(`${shortForward}${TPL.slice(16, 24)}${revComp(REV_AT_24)}`);
  });

  it('shortens the reverse 5-prime edge while preserving its 3-prime endpoint', () => {
    const shortReverse = REV_AT_24.slice(-10);
    const records = [
      sourcePrimer({
        id: 'f', binding: FWD_AT_4, anchor: FWD_AT_4,
        start: 4, end: 16, strand: 1,
      }),
      sourcePrimer({
        id: 'r', binding: shortReverse, anchor: REV_AT_24,
        start: 24, end: 36, strand: -1,
      }),
    ];
    const got = resolvePcrProduct({
      template: TPL, topology: 'linear', occurrences: projectedPair(records),
      primersById: Object.fromEntries(records.map((record) => [record.id, record])),
    });
    expect(got.ok).toBe(true);
    expect(got.product.reverse).toMatchObject({ start: 24, end: 34 });
    expect(got.product.sequence)
      .toBe(`${FWD_AT_4}${TPL.slice(16, 24)}${revComp(shortReverse)}`);
  });

  it('fails standard PCR with the exact no-3-prime-anchor reason', () => {
    const dead = `${FWD_AT_4.slice(0, -1)}A`;
    const got = resolvePcrProduct({
      template: TPL,
      topology: 'linear',
      occurrences: [
        occ({
          primerId: 'f', start: 4, end: 16, strand: 1,
          alignment: alignPrimerBinding(dead, FWD_AT_4),
        }),
        occ({ primerId: 'r', start: 24, end: 36, strand: -1 }),
      ],
      primersById: {
        f: primer({
          id: 'f', bindingModel: 'aligned-v1', sequence: dead,
          bindingSequence: dead, strand: 1,
        }),
        r: primer({ id: 'r', sequence: REV_AT_24, strand: -1 }),
      },
    });
    expect(got).toMatchObject({
      ok: false, reason: 'no-three-prime-anchor', primerId: 'f',
    });
  });

  it.each([
    [9, false, 'short-three-prime-anchor'],
    [10, true, null],
  ])('uses the canonical %i-nt physical 3-prime boundary', (length, ok, reason) => {
    const forwardBinding = 'ACGTACGTAA'.slice(0, length);
    const reverseBinding = 'GCGTACGTAA';
    const reverseTop = revComp(reverseBinding);
    const template = `TT${forwardBinding}${'C'.repeat(8)}${reverseTop}GG`;
    const reverseStart = 2 + forwardBinding.length + 8;
    const got = resolvePcrProduct({
      template,
      topology: 'linear',
      occurrences: [
        occ({ primerId: 'f', start: 2, end: 2 + forwardBinding.length, strand: 1 }),
        occ({
          primerId: 'r', start: reverseStart, end: reverseStart + reverseTop.length, strand: -1,
        }),
      ],
      primersById: {
        f: primer({ id: 'f', sequence: forwardBinding, strand: 1 }),
        r: primer({ id: 'r', sequence: reverseBinding, strand: -1 }),
      },
    });

    expect(got.ok).toBe(ok);
    if (reason) expect(got).toMatchObject({ reason, primerId: 'f' });
  });

  it('fails legacy PCR when the CURRENT template leaves no 3-prime anchor', () => {
    const terminal = `${FWD_AT_4.slice(0, -1)}A`;
    const records = [
      legacySourcePrimer({
        id: 'f', binding: terminal, snapshot: terminal,
        start: 4, end: 16, strand: 1,
      }),
      sourcePrimer({
        id: 'r', binding: REV_AT_24, anchor: REV_AT_24,
        start: 24, end: 36, strand: -1,
      }),
    ];
    const got = resolvePcrProduct({
      template: TPL, topology: 'linear', occurrences: projectedPair(records),
      primersById: Object.fromEntries(records.map((record) => [record.id, record])),
    });
    expect(got).toMatchObject({
      ok: false, reason: 'no-three-prime-anchor', primerId: 'f',
    });
  });

  it('withholds scalar Tm for an internal legacy mismatch on the CURRENT template', () => {
    const internal = `${FWD_AT_4[0]}T${FWD_AT_4.slice(2)}`;
    const records = [
      legacySourcePrimer({
        id: 'f', binding: internal, snapshot: internal,
        start: 4, end: 16, strand: 1,
      }),
      sourcePrimer({
        id: 'r', binding: REV_AT_24, anchor: REV_AT_24,
        start: 24, end: 36, strand: -1,
      }),
    ];
    const got = resolvePcrProduct({
      template: TPL, topology: 'linear', occurrences: projectedPair(records),
      primersById: Object.fromEntries(records.map((record) => [record.id, record])),
    });
    expect(got.ok).toBe(true);
    expect(got.warnings).toContainEqual(expect.objectContaining({
      code: 'gapped-tm-unknown', tm: null,
    }));
    expect(got.warnings.filter((w) => w.code === 'low-tm' || w.code === 'delta-tm'))
      .toEqual([]);
  });

  it('P6a carries current structured thermodynamics and drops a saved mismatch scalar', () => {
    const internal = `${FWD_AT_4[0]}T${FWD_AT_4.slice(2)}`;
    const records = [
      {
        ...legacySourcePrimer({
          id: 'f', binding: internal, snapshot: internal,
          start: 4, end: 16, strand: 1,
        }),
        tm: 63.2,
        tmBinding: 63.2,
      },
      sourcePrimer({
        id: 'r', binding: REV_AT_24, anchor: REV_AT_24,
        start: 24, end: 36, strand: -1,
      }),
    ];
    const got = resolvePcrProduct({
      template: TPL, topology: 'linear', occurrences: projectedPair(records),
      primersById: Object.fromEntries(records.map((record) => [record.id, record])),
    });

    expect(got.ok).toBe(true);
    expect(got.product.forward.thermodynamics).toMatchObject({
      fullDuplex: {
        status: 'not-calculated', tmC: null, reason: 'imperfect-duplex',
      },
      pcr: { status: 'warning' },
    });
    expect(JSON.stringify(got.product.forward.thermodynamics)).not.toContain('63.2');
    expect(got.product.reverse.thermodynamics.fullDuplex.status).toBe('calculated');
  });

  it('rejects occurrence alignment evidence that contradicts the CURRENT template', () => {
    const badAlignment = alignPrimerBinding(FWD_AT_4, 'TTTTTTTTTTTT');
    const got = resolvePcrProduct({
      template: TPL,
      topology: 'linear',
      occurrences: [
        occ({
          primerId: 'f', start: 4, end: 16, strand: 1,
          alignment: badAlignment,
        }),
        occ({ primerId: 'r', start: 24, end: 36, strand: -1 }),
      ],
      primersById: {
        f: primer({
          id: 'f', bindingModel: 'aligned-v1', sequence: FWD_AT_4,
          bindingSequence: FWD_AT_4, strand: 1,
        }),
        r: primer({ id: 'r', sequence: REV_AT_24, strand: -1 }),
      },
    });
    expect(got).toMatchObject({ ok: false, reason: 'indel-unsupported' });
  });
});

function revComp(s) {
  const M = { A: 'T', C: 'G', G: 'C', T: 'A' };
  return s.split('').reverse().map((c) => M[c] || c).join('');
}
