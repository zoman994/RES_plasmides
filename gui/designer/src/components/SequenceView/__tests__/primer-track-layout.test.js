import { describe, expect, it } from 'vitest';

import {
  packPrimerTrackBands,
  primerBandSpans,
  resolvePrimerInsertionTiers,
} from '../tracks/primer-track-layout.js';
import { PRIMER_STEP_OFFSET } from '../tracks/PrimerStepGlyph.jsx';

const bandItem = (key, template, outer, rowKey, label, farOuter) => ({
  key,
  ...(rowKey ? { rowKey } : {}),
  templateSpans: template || [],
  outerSpans: outer || [],
  farOuterSpans: farOuter || [],
  labelSpans: label || [],
});

describe('PrimerTrack semantic band packing', () => {
  it.each([
    ['forward', true, [0, 40]],
    ['reverse', false, [0, 40]],
  ])('centers a %s insertion callout on its alignment boundary', (
    _direction,
    isFwd,
    expectedSpan,
  ) => {
    const spans = primerBandSpans({
      key: 'directional-insertion',
      x: 20,
      width: 40,
      headHere: false,
      headWidth: 6,
      isFwd,
      detached: false,
      glyphs: Array.from({ length: 4 }, () => ({ op: 'M' })),
      insertions: [{ boundary: 0, bases: 'AAAA' }],
      clipOffset: 0,
      charPx: 10,
      inlineTail: false,
      tailWidth: 0,
      separateTail: null,
    });

    expect(spans.insertionSpans).toEqual([expectedSpan]);
    expect(spans.outerSpans).toEqual([expectedSpan]);
  });

  it('keeps the insertion footprint zoom-scaled when letters are hidden', () => {
    const spans = primerBandSpans({
      key: 'zoomed-out-insertion',
      x: 20,
      width: 8,
      headHere: false,
      headWidth: 6,
      isFwd: true,
      detached: false,
      glyphs: Array.from({ length: 4 }, () => ({ op: 'M' })),
      insertions: [{ boundary: 0, bases: 'AAAA' }],
      clipOffset: 0,
      charPx: 2,
      inlineTail: false,
      tailWidth: 0,
      separateTail: null,
    });

    expect(spans.insertionSpans).toEqual([[16, 24]]);
  });

  it.each(['forward', 'reverse'])(
    'keeps the %s label on the template-facing side of a mixed primer',
    (direction) => {
      const layout = packPrimerTrackBands([{
        key: 'mixed-primer',
        templateSpans: [[20, 80]],
        tailSpans: [[0, 20]],
        outerSpans: [[35, 45]],
        farOuterSpans: [],
        labelSpans: [[20, 65]],
      }], { direction, glyphHeight: 14 });
      const placed = layout.byKey['mixed-primer'];
      const sign = direction === 'forward' ? 1 : -1;

      expect((placed.templateY - placed.tailY) * sign).toBe(7);
      expect((placed.templateY - placed.outerY) * sign).toBe(14);
      expect(placed.labelY).toBeGreaterThanOrEqual(0);
      if (direction === 'forward') {
        expect(placed.labelY).toBe(placed.templateY + 14 + 1);
      } else {
        expect(placed.labelY + 10 + 1).toBe(placed.templateY);
      }
    },
  );

  it('keeps true tail occupancy distinct while still using it to promote an overlapping insertion', () => {
    const spans = primerBandSpans({
      key: 'mixed', rowKey: 'mixed', x: 20, width: 40,
      headHere: false, headWidth: 6, isFwd: true, detached: false,
      glyphs: Array.from({ length: 4 }, () => ({ op: 'M' })),
      insertions: [{ boundary: 0, bases: 'AAAA' }], clipOffset: 0, charPx: 10,
      inlineTail: true, tailWidth: 20, tailX: -20, separateTail: null,
      labelX: 0, labelWidth: 25,
    });

    expect(spans.tailSpans).toEqual([[0, 20]]);
    expect(spans.outerSpans).toEqual([]);
    expect(spans.promotedInsertions).toBe(true);
    expect(spans.farOuterSpans).toEqual([[0, 40]]);
  });

  it('stacks only overlapping insertion callouts and reuses the nearest tier', () => {
    const spans = primerBandSpans({
      key: 'nearby-insertions', rowKey: 'nearby-insertions', x: 0, width: 120,
      headHere: false, headWidth: 6, isFwd: true, detached: false,
      glyphs: Array.from({ length: 12 }, () => ({ op: 'M' })),
      insertions: [
        { boundary: 2, bases: 'AAAA' },
        { boundary: 3, bases: 'CCCC' },
        { boundary: 9, bases: 'GG' },
      ],
      clipOffset: 0, charPx: 10,
      inlineTail: false, tailWidth: 0, separateTail: null,
    });
    const [resolved] = resolvePrimerInsertionTiers([spans]);

    expect(resolved.insertionPlacements.map(({ span, tier }) => ({ span, tier })))
      .toEqual([
        { span: [0, 40], tier: 1 },
        { span: [10, 50], tier: 2 },
        { span: [80, 100], tier: 1 },
      ]);
    expect(resolved.outerSpans).toEqual([[0, 40], [80, 100]]);
    expect(resolved.farOuterSpans).toEqual([[10, 50]]);
  });

  it('keeps the two-pixel hit perimeters of nearby insertion callouts apart', () => {
    const spans = primerBandSpans({
      key: 'hit-padding', rowKey: 'hit-padding', x: 0, width: 36,
      headHere: false, headWidth: 6, isFwd: true, detached: false,
      glyphs: Array.from({ length: 12 }, () => ({ op: 'M' })),
      insertions: [
        { boundary: 4, bases: 'AAAA' },
        { boundary: 9, bases: 'CCCC' },
      ],
      clipOffset: 0, charPx: 3,
      inlineTail: false, tailWidth: 0, separateTail: null,
    });
    const [resolved] = resolvePrimerInsertionTiers([spans]);

    expect(resolved.insertionSpans).toEqual([[6, 18], [21, 33]]);
    expect(resolved.insertionPlacements.map(({ tier }) => tier)).toEqual([1, 2]);
  });

  it.each(['forward', 'reverse'])(
    'reserves a dynamic third insertion tier beyond an overlapping tail (%s)',
    (direction) => {
      const spans = primerBandSpans({
        key: 'three-tiers', rowKey: 'three-tiers', x: 0, width: 80,
        headHere: false, headWidth: 6, isFwd: direction === 'forward', detached: false,
        glyphs: Array.from({ length: 8 }, () => ({ op: 'M' })),
        insertions: [
          { boundary: 2, bases: 'AAAA' },
          { boundary: 3, bases: 'CCCC' },
        ],
        clipOffset: 0, charPx: 10,
        inlineTail: true, tailWidth: 50, tailX: 0, separateTail: null,
      });
      const [resolved] = resolvePrimerInsertionTiers([spans]);
      const layout = packPrimerTrackBands([resolved], { direction, glyphHeight: 14 });
      const placed = layout.byKey['three-tiers'];
      const sign = direction === 'forward' ? -1 : 1;

      expect(resolved.insertionPlacements.map(({ tier }) => tier)).toEqual([2, 3]);
      expect(placed.insertionYs).toHaveLength(2);
      expect(placed.insertionYs[0] - placed.templateY).toBe(2 * sign * PRIMER_STEP_OFFSET);
      expect(placed.insertionYs[1] - placed.templateY).toBe(3 * sign * PRIMER_STEP_OFFSET);
      expect(layout.height).toBe(56);
    },
  );

  it('packs horizontal overlaps into lanes while reusing a lane for disjoint spans', () => {
    const layout = packPrimerTrackBands([
      bandItem('a', [[10, 40]], []),
      bandItem('b', [[25, 55]], []),
      bandItem('c', [[60, 80]], []),
    ], { direction: 'forward', glyphHeight: 14 });

    expect(layout.byKey.a.templateLane).toBe(0);
    expect(layout.byKey.b.templateLane).toBe(1);
    expect(layout.byKey.c.templateLane).toBe(0);
  });

  it.each(['forward', 'reverse'])(
    'keeps adjacent labelled %s primer rows at the compact safe interval',
    (direction) => {
      const layout = packPrimerTrackBands([
        bandItem('first', [[0, 40]], [], null, [[0, 25]]),
        bandItem('second', [[0, 40]], [], null, [[0, 25]]),
      ], { direction, glyphHeight: 14 });

      expect(Math.abs(layout.byKey.first.templateY - layout.byKey.second.templateY)).toBe(26);
    },
  );

  it.each(['forward', 'reverse'])(
    'anchors a detached %s label to its own body when sharing a row with a normal primer',
    (direction) => {
      const layout = packPrimerTrackBands([{
        key: 'detached',
        templateSpans: [],
        tailSpans: [[0, 12]],
        outerSpans: [[20, 50]],
        farOuterSpans: [],
        insertionSpans: [],
        labelSpans: [[20, 50]],
        detachedBinding: true,
      }, {
        key: 'normal',
        templateSpans: [[80, 120]],
        tailSpans: [],
        outerSpans: [],
        farOuterSpans: [],
        insertionSpans: [],
        labelSpans: [[85, 115]],
      }], { direction, glyphHeight: 14 });
      const detached = layout.byKey.detached;
      const normal = layout.byKey.normal;

      expect(detached.row).toBe(normal.row);
      if (direction === 'forward') {
        expect(detached.labelY).toBe(detached.outerY + 14 + 1);
        expect(normal.labelY).toBe(normal.templateY + 14 + 1);
      } else {
        expect(detached.labelY + 10 + 1).toBe(detached.outerY);
        expect(normal.labelY + 10 + 1).toBe(normal.templateY);
      }
    },
  );

  it('keeps a long reverse tail one compact step from its own binding', () => {
    const layout = packPrimerTrackBands([
      bandItem('reverse-a', [[20, 60]], []),
      bandItem('reverse-b', [[24, 64]], []),
      bandItem('reverse-with-tail', [[28, 68]], [[0, 58]]),
    ], { direction: 'reverse', glyphHeight: 14 });
    const placed = layout.byKey['reverse-with-tail'];

    expect(Number.isInteger(placed.row)).toBe(true);
    expect(placed.outerY - placed.templateY).toBe(PRIMER_STEP_OFFSET);
  });

  it('splits rows when one primer tail would cover another primer binding', () => {
    const layout = packPrimerTrackBands([
      bandItem('tail-owner', [[20, 40]], [[0, 18]]),
      bandItem('binding-under-tail', [[0, 18]], []),
      bandItem('binding-conflict', [[30, 50]], []),
      bandItem('outer-conflict', [[55, 65]], [[8, 14]]),
      bandItem('disjoint', [[70, 80]], [[82, 90]]),
    ], { direction: 'forward', glyphHeight: 14 });
    const { byKey } = layout;

    expect(Number.isInteger(byKey['tail-owner'].row)).toBe(true);
    expect(byKey['binding-under-tail'].row).not.toBe(byKey['tail-owner'].row);
    expect(byKey['binding-conflict'].row).not.toBe(byKey['tail-owner'].row);
    expect(byKey['outer-conflict'].row).not.toBe(byKey['tail-owner'].row);
    expect(byKey.disjoint.row).toBe(byKey['tail-owner'].row);
  });

  it('reserves the visible label footprint instead of painting it over another primer', () => {
    const layout = packPrimerTrackBands([
      bandItem('label-owner', [[0, 20]], [], null, [[26, 54]]),
      bandItem('under-label', [[40, 70]], []),
    ], { direction: 'forward', glyphHeight: 14 });

    expect(layout.byKey['under-label'].row).not.toBe(layout.byKey['label-owner'].row);
  });

  it('reserves the two-pixel interactive perimeter around different primers', () => {
    const layout = packPrimerTrackBands([
      bandItem('left', [[0, 18]], []),
      bandItem('right', [[20, 38]], []),
    ], { direction: 'forward', glyphHeight: 14 });

    expect(layout.byKey.right.row).not.toBe(layout.byKey.left.row);
  });

  it('does not reserve an empty template row for a tail-only line', () => {
    const layout = packPrimerTrackBands([
      bandItem('tail-only', [], [[12, 30]]),
    ], { direction: 'reverse', glyphHeight: 14 });

    expect(layout.byKey['tail-only'].templateY).toBeNull();
    expect(layout.byKey['tail-only'].outerY).toBe(0);
    expect(layout.height).toBe(14);
  });

  it('uses compact per-row heights for three binding rows plus one composite row', () => {
    const layout = packPrimerTrackBands([
      bandItem('tailed', [[0, 40]], [[0, 18]]),
      bandItem('binding-2', [[0, 40]], []),
      bandItem('binding-3', [[0, 40]], []),
      bandItem('binding-4', [[0, 40]], []),
    ], { direction: 'forward', glyphHeight: 14 });

    expect(layout.height).toBe(73);
    expect(layout.byKey.tailed.templateY - layout.byKey.tailed.outerY)
      .toBe(PRIMER_STEP_OFFSET);
  });

  it('keeps every component of an occurrence on one row before packing a collision', () => {
    const layout = packPrimerTrackBands([
      bandItem('same-tail', [], [[0, 10]], 'same-occurrence'),
      bandItem('other-binding', [[0, 20]], []),
      bandItem('same-binding', [[5, 15]], [], 'same-occurrence'),
    ], { direction: 'reverse', glyphHeight: 14 });

    expect(layout.byKey['same-tail'].row).toBe(layout.byKey['same-binding'].row);
    expect(layout.byKey['other-binding'].row).not.toBe(layout.byKey['same-binding'].row);
  });

  it.each(['forward', 'reverse'])(
    'reserves three ordered %s tiers when a promoted insertion overlaps its tail',
    (direction) => {
      const layout = packPrimerTrackBands([
        bandItem('promoted', [[20, 60]], [[0, 20]], null, [], [[-30, 50]]),
        bandItem('conflict', [[45, 75]], []),
      ], { direction, glyphHeight: 14 });
      const placed = layout.byKey.promoted;

      expect(layout.byKey.conflict.row).not.toBe(placed.row);
      expect(layout.height).toBe(57);
      const ordered = direction === 'forward'
        ? [placed.farOuterY, placed.outerY, placed.templateY]
        : [placed.templateY, placed.outerY, placed.farOuterY];
      expect(ordered[0]).toBeGreaterThanOrEqual(0);
      expect([ordered[1] - ordered[0], ordered[2] - ordered[1]])
        .toEqual([PRIMER_STEP_OFFSET, PRIMER_STEP_OFFSET]);
    },
  );

  it.each(['forward', 'reverse'])(
    'keeps the DNA-side gap for a detached %s binding with a promoted insertion',
    (direction) => {
      const detached = {
        ...bandItem('detached', [], [[20, 60]], null, [], [[10, 70]]),
        detachedBinding: true,
      };
      const layout = packPrimerTrackBands([detached], {
        direction,
        glyphHeight: 14,
        bandGap: 6,
      });
      const placed = layout.byKey.detached;

      expect(layout.height).toBe(34);
      if (direction === 'forward') {
        expect(placed.outerY - placed.farOuterY).toBe(PRIMER_STEP_OFFSET);
        expect(layout.height - (placed.outerY + 14)).toBe(6);
      } else {
        expect(placed.outerY).toBe(6);
        expect(placed.farOuterY - placed.outerY).toBe(PRIMER_STEP_OFFSET);
      }
    },
  );

  it('promotes an insertion that overlaps a tail on another piece of the same occurrence', () => {
    const insertionPiece = primerBandSpans({
      key: 'insertion-piece',
      rowKey: 'wrapped-occurrence',
      x: 0,
      width: 20,
      headHere: false,
      headWidth: 6,
      isFwd: true,
      detached: false,
      glyphs: [{ op: 'M' }, { op: 'M' }],
      insertions: [{ boundary: 1, bases: 'AAAAAAAA' }],
      clipOffset: 0,
      charPx: 10,
      inlineTail: false,
      tailWidth: 0,
      separateTail: null,
    });
    const tailPiece = primerBandSpans({
      key: 'tail-piece',
      rowKey: 'wrapped-occurrence',
      x: 0,
      width: 0,
      headHere: false,
      headWidth: 6,
      isFwd: true,
      detached: false,
      glyphs: [],
      insertions: [],
      clipOffset: 0,
      charPx: 10,
      inlineTail: false,
      tailWidth: 0,
      separateTail: { x: 40, w: 20 },
    });

    expect(insertionPiece.promotedInsertions).toBe(false);
    const [resolvedInsertion, resolvedTail] = resolvePrimerInsertionTiers([
      insertionPiece,
      tailPiece,
    ]);

    expect(resolvedInsertion.promotedInsertions).toBe(true);
    expect(resolvedInsertion.outerSpans).toEqual([]);
    expect(resolvedInsertion.farOuterSpans).toEqual([[-30, 50]]);
    expect(resolvedTail.outerSpans).toEqual([]);
    expect(resolvedTail.tailSpans).toEqual([[40, 60]]);
  });
});
