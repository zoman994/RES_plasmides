import { describe, expect, it } from 'vitest';

import { reverseComplement } from '../../sequence-utils';
import { projectPrimerSites } from '../primer-site-projection';

const CORE = 'ACGTCAGTACGATCGA';
const EXTENSION = 'GATTACA';
const LEFT_CONTEXT = 'AAAGGG';
const TEMPLATE = `${LEFT_CONTEXT}${EXTENSION}${CORE}TTTTTT`;
const CORE_START = LEFT_CONTEXT.length + EXTENSION.length;

function sourceSite({
  id = 'site', start = CORE_START, end = CORE_START + CORE.length, strand = 1,
  annealedSequence = CORE,
} = {}) {
  return {
    id,
    target: { entryId: 'entry', resourceHash: 'hash', topology: 'linear' },
    location: { kind: 'single', segments: [{ start, end }] },
    strand,
    annealedSequence,
    tail: '',
  };
}

function record({
  id = 'primer', direction = 'forward', tail = '', binding = CORE,
  site = sourceSite(),
} = {}) {
  return {
    id,
    name: id,
    direction,
    bindingModel: 'aligned-v1',
    tail,
    bindingSequence: binding,
    sequence: `${tail}${binding}`,
    sites: [site],
  };
}

const context = {
  template: TEMPLATE,
  topology: 'linear',
  entryId: 'entry',
  documentHash: 'hash',
};

describe('full-oligo 5-prime projection around a confirmed landing', () => {
  it('treats the tail field as an authoring hint and anneals its contiguous complementary suffix', () => {
    const [occurrence] = projectPrimerSites(record({ tail: `CCC${EXTENSION}` }), context);

    expect(occurrence.tail).toBe('CCC');
    expect(occurrence.unpairedPrefixLength).toBe(3);
    expect(occurrence.annealedSequence).toBe(`${EXTENSION}${CORE}`);
    expect(occurrence.segments).toEqual([{
      start: LEFT_CONTEXT.length,
      end: CORE_START + CORE.length,
    }]);
    expect(occurrence.alignment.counts).toEqual({
      M: EXTENSION.length + CORE.length, X: 0, I: 0, D: 0,
    });
  });

  it('reclassifies a complementary 5-prime prefix typed into the binding field instead of showing it as I', () => {
    const [occurrence] = projectPrimerSites(record({
      tail: '',
      binding: `${EXTENSION}${CORE}`,
    }), context);

    expect(occurrence.tail).toBeNull();
    expect(occurrence.unpairedPrefixLength).toBe(0);
    expect(occurrence.annealedSequence).toBe(`${EXTENSION}${CORE}`);
    expect(occurrence.segments[0].start).toBe(LEFT_CONTEXT.length);
    expect(occurrence.alignment.counts.I).toBe(0);
    expect(occurrence.alignment.editDistance).toBe(0);
  });

  it('derives identical biology for the same oligo regardless of the helper-field boundary', () => {
    const fullPrefix = `CCC${EXTENSION}`;
    const [allInAdditions] = projectPrimerSites(record({
      tail: fullPrefix,
      binding: CORE,
    }), context);
    const [complementarySuffixInBody] = projectPrimerSites(record({
      tail: 'CCC',
      binding: `${EXTENSION}${CORE}`,
    }), context);

    const biologicalProjection = (occurrence) => ({
      sequence: occurrence.sequence,
      tail: occurrence.tail,
      annealedSequence: occurrence.annealedSequence,
      segments: occurrence.segments,
      alignment: occurrence.alignment,
    });
    expect(biologicalProjection(allInAdditions))
      .toEqual(biologicalProjection(complementarySuffixInBody));
  });

  it('derives identical biology for legacy/imported records regardless of the helper-field boundary', () => {
    const fullPrefix = `CCC${EXTENSION}`;
    const asLegacy = (tail, binding) => ({
      ...record({ tail, binding }),
      bindingModel: undefined,
    });
    const [allInAdditions] = projectPrimerSites(asLegacy(fullPrefix, CORE), context);
    const [complementarySuffixInBody] = projectPrimerSites(
      asLegacy('CCC', `${EXTENSION}${CORE}`),
      context,
    );

    expect(complementarySuffixInBody).toBeTruthy();
    expect({
      tail: complementarySuffixInBody.tail,
      annealedSequence: complementarySuffixInBody.annealedSequence,
      segments: complementarySuffixInBody.segments,
    }).toEqual({
      tail: allInAdditions.tail,
      annealedSequence: allInAdditions.annealedSequence,
      segments: allInAdditions.segments,
    });

    const [implicitTail] = projectPrimerSites({
      ...record({ tail: '', binding: CORE }),
      bindingModel: undefined,
      sequence: `${fullPrefix}${CORE}`,
    }, context);
    expect({
      tail: implicitTail.tail,
      annealedSequence: implicitTail.annealedSequence,
      segments: implicitTail.segments,
    }).toEqual({
      tail: allInAdditions.tail,
      annealedSequence: allInAdditions.annealedSequence,
      segments: allInAdditions.segments,
    });
  });

  it.each([
    ['forward', 1, false],
    ['reverse', -1, true],
  ])('shrinks an equal-length nonmatching 5′ prefix at a confirmed %s site', (
    direction,
    strand,
    reverse,
  ) => {
    const historical = `ACA${CORE}`;
    const top = reverse ? reverseComplement(historical) : historical;
    const localTemplate = `AAA${top}TTT`;
    const start = 3;
    const end = start + historical.length;
    const site = sourceSite({ start, end, strand, annealedSequence: historical });
    const [occurrence] = projectPrimerSites(record({
      direction,
      tail: 'GGG',
      binding: CORE,
      site,
    }), { ...context, template: localTemplate });

    expect(occurrence.tail).toBe('GGG');
    expect(occurrence.annealedSequence).toBe(CORE);
    expect(occurrence.segments).toEqual([reverse
      ? { start, end: end - 3 }
      : { start: start + 3, end }]);
    expect(occurrence.alignment.counts).toEqual({ M: CORE.length, X: 0, I: 0, D: 0 });
  });

  it('keeps an upstream complementary island across one internal substitution', () => {
    const partlyMatching = 'GACTACA';
    const [occurrence] = projectPrimerSites(record({
      tail: `CCC${partlyMatching}`,
    }), context);

    expect(occurrence.tail).toBe('CCC');
    expect(occurrence.annealedSequence).toBe(`${partlyMatching}${CORE}`);
    expect(occurrence.segments[0].start).toBe(LEFT_CONTEXT.length);
    expect(occurrence.alignment.counts).toEqual({
      M: EXTENSION.length + CORE.length - 1, X: 1, I: 0, D: 0,
    });
    expect(occurrence.alignment.editDistance).toBe(1);
  });

  it('keeps complementary 5′ bases upstream of one internal primer insertion', () => {
    const inserted = 'G';
    const fullBinding = `${EXTENSION}${inserted}${CORE}`;
    const [occurrence] = projectPrimerSites(record({
      tail: `CCC${EXTENSION}${inserted}`,
    }), context);

    expect(occurrence.tail).toBe('CCC');
    expect(occurrence.unpairedPrefixLength).toBe(3);
    expect(occurrence.annealedSequence).toBe(fullBinding);
    expect(occurrence.segments).toEqual([{
      start: LEFT_CONTEXT.length,
      end: CORE_START + CORE.length,
    }]);
    expect(occurrence.alignment.query).toBe(fullBinding);
    expect(occurrence.alignment.target).toBe(`${EXTENSION}${CORE}`);
    expect(occurrence.alignment.runs).toEqual([
      { op: 'M', queryStart: 0, queryEnd: 7, targetStart: 0, targetEnd: 7 },
      { op: 'I', queryStart: 7, queryEnd: 8, targetStart: 7, targetEnd: 7 },
      { op: 'M', queryStart: 8, queryEnd: 24, targetStart: 7, targetEnd: 23 },
    ]);
    expect(occurrence.alignment.counts).toEqual({ M: 23, X: 0, I: 1, D: 0 });
  });

  it.each(['forward', 'reverse'])(
    'keeps a template-only base at the recovered-prefix/core seam as internal D (%s)',
    (direction) => {
      const reverse = direction === 'reverse';
      const extraTemplateBase = 'G';
      const recoveredTarget = `${EXTENSION}${extraTemplateBase}`;
      const topCore = reverse ? reverseComplement(CORE) : CORE;
      const topRecovered = reverse
        ? `${reverseComplement(extraTemplateBase)}${reverseComplement(EXTENSION)}`
        : recoveredTarget;
      const template = reverse
        ? `${LEFT_CONTEXT}${topCore}${topRecovered}TTTTTT`
        : `${LEFT_CONTEXT}${topRecovered}${topCore}TTTTTT`;
      const coreStart = reverse
        ? LEFT_CONTEXT.length
        : LEFT_CONTEXT.length + recoveredTarget.length;
      const site = sourceSite({
        start: coreStart,
        end: coreStart + CORE.length,
        strand: reverse ? -1 : 1,
        annealedSequence: CORE,
      });
      const [occurrence] = projectPrimerSites(record({
        direction,
        tail: `CCC${EXTENSION}`,
        site,
      }), { ...context, template });

      expect(occurrence.tail).toBe('CCC');
      expect(occurrence.annealedSequence).toBe(`${EXTENSION}${CORE}`);
      expect(occurrence.segments).toEqual([{
        start: LEFT_CONTEXT.length,
        end: LEFT_CONTEXT.length + recoveredTarget.length + CORE.length,
      }]);
      expect(occurrence.alignment.query).toBe(`${EXTENSION}${CORE}`);
      expect(occurrence.alignment.target).toBe(`${recoveredTarget}${CORE}`);
      expect(occurrence.alignment.runs).toEqual([
        { op: 'M', queryStart: 0, queryEnd: 7, targetStart: 0, targetEnd: 7 },
        { op: 'D', queryStart: 7, queryEnd: 7, targetStart: 7, targetEnd: 8 },
        { op: 'M', queryStart: 7, queryEnd: 23, targetStart: 8, targetEnd: 24 },
      ]);
      expect(occurrence.alignment.counts).toEqual({ M: 23, X: 0, I: 0, D: 1 });
      expect(occurrence.alignment.threePrimeMatchLength).toBe(CORE.length);
    },
  );

  it.each(['forward', 'reverse'])(
    'keeps a positive-scoring complementary island across a long internal D run (%s)',
    (direction) => {
      const reverse = direction === 'reverse';
      const upstreamIsland = 'AGTAGTAGTAGT';
      const recoveredQuery = `${upstreamIsland}A`;
      const recoveredTarget = `${upstreamIsland}${'C'.repeat(17)}A`;
      const topCore = reverse ? reverseComplement(CORE) : CORE;
      const topRecovered = reverse ? reverseComplement(recoveredTarget) : recoveredTarget;
      const template = reverse
        ? `${topCore}${topRecovered}TTTT`
        : `${topRecovered}${topCore}TTTT`;
      const coreStart = reverse ? 0 : recoveredTarget.length;
      const site = sourceSite({
        start: coreStart,
        end: coreStart + CORE.length,
        strand: reverse ? -1 : 1,
        annealedSequence: CORE,
      });
      const [occurrence] = projectPrimerSites(record({
        direction,
        tail: recoveredQuery,
        site,
      }), { ...context, template });

      expect(occurrence.tail).toBeNull();
      expect(occurrence.annealedSequence).toBe(`${recoveredQuery}${CORE}`);
      expect(occurrence.segments).toEqual([{
        start: 0,
        end: recoveredTarget.length + CORE.length,
      }]);
      expect(occurrence.alignment.target).toBe(`${recoveredTarget}${CORE}`);
      expect(occurrence.alignment.runs).toEqual([
        { op: 'M', queryStart: 0, queryEnd: 12, targetStart: 0, targetEnd: 12 },
        { op: 'D', queryStart: 12, queryEnd: 12, targetStart: 12, targetEnd: 29 },
        { op: 'M', queryStart: 12, queryEnd: 29, targetStart: 29, targetEnd: 46 },
      ]);
      expect(occurrence.alignment.counts).toEqual({ M: 29, X: 0, I: 0, D: 17 });
    },
  );

  it('derives the same internal insertion regardless of the helper-field boundary', () => {
    const inserted = 'G';
    const sequence = `CCC${EXTENSION}${inserted}${CORE}`;
    const project = (tail, binding, extra = {}) => projectPrimerSites({
      ...record({ tail, binding }),
      sequence,
      ...extra,
    }, context)[0];
    const asTail = project(`CCC${EXTENSION}${inserted}`, CORE);
    const asBody = project('CCC', `${EXTENSION}${inserted}${CORE}`);
    const implicitLegacy = project('', CORE, { bindingModel: undefined });
    const biology = (occurrence) => ({
      tail: occurrence.tail,
      annealedSequence: occurrence.annealedSequence,
      segments: occurrence.segments,
      alignment: occurrence.alignment,
    });

    expect(biology(asBody)).toEqual(biology(asTail));
    expect(biology(implicitLegacy)).toEqual(biology(asTail));
  });

  it('keeps multiple complementary islands separated by X and I runs', () => {
    const upstream = 'GATTACAGTTGGCAG';
    const targetUpstream = 'GATTACACTTGGCA';
    const localTemplate = `${LEFT_CONTEXT}${targetUpstream}${CORE}GGGG`;
    const coreStart = LEFT_CONTEXT.length + targetUpstream.length;
    const [occurrence] = projectPrimerSites(record({
      tail: `CCC${upstream}`,
      site: sourceSite({ start: coreStart, end: coreStart + CORE.length }),
    }), { ...context, template: localTemplate });

    expect(occurrence.tail).toBe('CCC');
    expect(occurrence.annealedSequence).toBe(`${upstream}${CORE}`);
    expect(occurrence.segments).toEqual([{
      start: LEFT_CONTEXT.length,
      end: coreStart + CORE.length,
    }]);
    expect(occurrence.alignment.runs).toEqual([
      { op: 'M', queryStart: 0, queryEnd: 7, targetStart: 0, targetEnd: 7 },
      { op: 'X', queryStart: 7, queryEnd: 8, targetStart: 7, targetEnd: 8 },
      { op: 'M', queryStart: 8, queryEnd: 14, targetStart: 8, targetEnd: 14 },
      { op: 'I', queryStart: 14, queryEnd: 15, targetStart: 14, targetEnd: 14 },
      { op: 'M', queryStart: 15, queryEnd: 31, targetStart: 14, targetEnd: 30 },
    ]);
  });

  it('does not pull a distant coincidental match across a non-complementary 5-prime run', () => {
    const prefix = 'ATTTT';
    const localTemplate = `ACCCC${CORE}GGGG`;
    const localContext = {
      ...context,
      template: localTemplate,
    };
    const [occurrence] = projectPrimerSites(record({
      tail: prefix,
      site: sourceSite({ start: 5, end: 5 + CORE.length }),
    }), localContext);

    expect(occurrence.tail).toBe(prefix);
    expect(occurrence.annealedSequence).toBe(CORE);
    expect(occurrence.segments).toEqual([{ start: 5, end: 5 + CORE.length }]);
  });

  it('keeps the confirmed 3-prime endpoint when an aligned oligo is shortened', () => {
    const shortened = CORE.slice(-8);
    const [occurrence] = projectPrimerSites(record({
      tail: '',
      binding: shortened,
    }), context);

    expect(occurrence.annealedSequence).toBe(shortened);
    expect(occurrence.segments).toEqual([{
      start: CORE_START + CORE.length - shortened.length,
      end: CORE_START + CORE.length,
    }]);
    expect(occurrence.alignment.target).toBe(shortened);
  });

  it('uses the same 5-prime rule on a reverse landing', () => {
    const topCore = reverseComplement(CORE);
    const downstreamTop = reverseComplement(EXTENSION);
    const prefix = 'TTTTT';
    const reverseTemplate = `${prefix}${topCore}${downstreamTop}AAAA`;
    const start = prefix.length;
    const reverseSite = sourceSite({
      start,
      end: start + topCore.length,
      strand: -1,
      annealedSequence: CORE,
    });
    reverseSite.target = {
      entryId: 'entry', resourceHash: 'hash', topology: 'linear',
    };
    const [occurrence] = projectPrimerSites(record({
      direction: 'reverse',
      tail: `CCC${EXTENSION}`,
      site: reverseSite,
    }), { ...context, template: reverseTemplate });

    expect(occurrence.tail).toBe('CCC');
    expect(occurrence.annealedSequence).toBe(`${EXTENSION}${CORE}`);
    expect(occurrence.segments).toEqual([{
      start,
      end: start + topCore.length + downstreamTop.length,
    }]);
    expect(occurrence.alignment.editDistance).toBe(0);
  });

  it('keeps an upstream reverse-strand island across one internal insertion', () => {
    const inserted = 'G';
    const topCore = reverseComplement(CORE);
    const downstreamTop = reverseComplement(EXTENSION);
    const prefix = 'TTTTT';
    const reverseTemplate = `${prefix}${topCore}${downstreamTop}AAAA`;
    const start = prefix.length;
    const reverseSite = sourceSite({
      start,
      end: start + topCore.length,
      strand: -1,
      annealedSequence: CORE,
    });
    const [occurrence] = projectPrimerSites(record({
      direction: 'reverse',
      tail: `CCC${EXTENSION}${inserted}`,
      site: reverseSite,
    }), { ...context, template: reverseTemplate });

    expect(occurrence.tail).toBe('CCC');
    expect(occurrence.annealedSequence).toBe(`${EXTENSION}${inserted}${CORE}`);
    expect(occurrence.segments).toEqual([{
      start,
      end: start + topCore.length + downstreamTop.length,
    }]);
    expect(occurrence.alignment.counts).toEqual({ M: 23, X: 0, I: 1, D: 0 });
  });

  it('extends a forward landing through the origin without taking a second lap', () => {
    const circularTemplate = `${EXTENSION.slice(-2)}${CORE}AAAAA${EXTENSION.slice(0, -2)}`;
    const circularSite = sourceSite({ start: 2, end: 2 + CORE.length });
    circularSite.target = {
      entryId: 'entry', resourceHash: 'hash', topology: 'circular',
    };
    const [occurrence] = projectPrimerSites(record({
      tail: EXTENSION,
      site: circularSite,
    }), {
      template: circularTemplate,
      topology: 'circular',
      entryId: 'entry',
      documentHash: 'hash',
    });

    expect(occurrence.tail).toBeNull();
    expect(occurrence.annealedSequence).toBe(`${EXTENSION}${CORE}`);
    expect(occurrence.segments).toEqual([
      { start: circularTemplate.length - 5, end: circularTemplate.length },
      { start: 0, end: 2 + CORE.length },
    ]);
    expect(occurrence.wrapsOrigin).toBe(true);
  });

  it('keeps an internal insertion while extending through a circular origin', () => {
    const inserted = 'G';
    const circularTemplate = `${EXTENSION.slice(-2)}${CORE}AAAAA${EXTENSION.slice(0, -2)}`;
    const circularSite = sourceSite({ start: 2, end: 2 + CORE.length });
    circularSite.target = {
      entryId: 'entry', resourceHash: 'hash', topology: 'circular',
    };
    const [occurrence] = projectPrimerSites(record({
      tail: `CCC${EXTENSION}${inserted}`,
      site: circularSite,
    }), {
      template: circularTemplate,
      topology: 'circular',
      entryId: 'entry',
      documentHash: 'hash',
    });

    expect(occurrence.tail).toBe('CCC');
    expect(occurrence.annealedSequence).toBe(`${EXTENSION}${inserted}${CORE}`);
    expect(occurrence.segments).toEqual([
      { start: circularTemplate.length - 5, end: circularTemplate.length },
      { start: 0, end: 2 + CORE.length },
    ]);
    expect(occurrence.alignment.counts).toEqual({ M: 23, X: 0, I: 1, D: 0 });
    expect(occurrence.wrapsOrigin).toBe(true);
  });

  it('keeps the same circular insertion geometry on the reverse strand', () => {
    const inserted = 'G';
    const topCore = reverseComplement(CORE);
    const topExtension = reverseComplement(EXTENSION);
    const circularTemplate = `${topExtension}AAAAA${topCore}`;
    const start = topExtension.length + 5;
    const circularSite = sourceSite({
      start, end: circularTemplate.length, strand: -1, annealedSequence: CORE,
    });
    circularSite.target = {
      entryId: 'entry', resourceHash: 'hash', topology: 'circular',
    };
    const [occurrence] = projectPrimerSites(record({
      direction: 'reverse',
      tail: `CCC${EXTENSION}${inserted}`,
      site: circularSite,
    }), {
      template: circularTemplate,
      topology: 'circular',
      entryId: 'entry',
      documentHash: 'hash',
    });

    expect(occurrence.tail).toBe('CCC');
    expect(occurrence.annealedSequence).toBe(`${EXTENSION}${inserted}${CORE}`);
    expect(occurrence.segments).toEqual([
      { start, end: circularTemplate.length },
      { start: 0, end: topExtension.length },
    ]);
    expect(occurrence.alignment.target).toBe(`${EXTENSION}${CORE}`);
    expect(occurrence.alignment.counts).toEqual({ M: 23, X: 0, I: 1, D: 0 });
    expect(occurrence.wrapsOrigin).toBe(true);
  });

  it('never reuses template bases for a second circular lap', () => {
    const reusedPrefix = CORE.slice(-4);
    const circularSite = sourceSite({ start: 0, end: CORE.length });
    circularSite.target = {
      entryId: 'entry', resourceHash: 'hash', topology: 'circular',
    };
    const [occurrence] = projectPrimerSites(record({
      tail: reusedPrefix,
      site: circularSite,
    }), {
      template: CORE,
      topology: 'circular',
      entryId: 'entry',
      documentHash: 'hash',
    });

    expect(occurrence.tail).toBe(reusedPrefix);
    expect(occurrence.annealedSequence).toBe(CORE);
    expect(occurrence.segments).toEqual([{ start: 0, end: CORE.length }]);
    expect(occurrence.alignment.counts).toEqual({ M: CORE.length, X: 0, I: 0, D: 0 });
  });
});
