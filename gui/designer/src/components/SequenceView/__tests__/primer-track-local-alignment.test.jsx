import {
  afterEach, describe, expect, it,
} from 'vitest';
import {
  cleanup, render, screen, within,
} from '@testing-library/react';

import { reverseComplement } from '../../../sequence-utils';
import PrimerTrack from '../tracks/PrimerTrack';
import { PRIMER_GLYPH_HEIGHT } from '../tracks/PrimerStepGlyph';
import {
  PRIMER_LABEL_GAP,
  PRIMER_LABEL_HEIGHT,
  PRIMER_STEP_OFFSET,
} from '../tracks/primer-track-layout';

afterEach(cleanup);

const ENTRY = 'local-alignment-entry';
const DOCUMENT = 'sha256:local-alignment';
const TRUE_TAIL = 'CCC';
const CORE = 'ACGTCAGTACGATCGA';
const QUERY_UPSTREAM = 'GATTACAGTTGGCAG';
const TARGET_UPSTREAM = 'GATTACACTTGGCA';
const MULTI_TARGET_UPSTREAM = 'GCTAACGTTAGCACCTGATCGTACGATGCA';
const MULTI_QUERY_UPSTREAM = `${MULTI_TARGET_UPSTREAM.slice(0, 12)}TTTT${
  MULTI_TARGET_UPSTREAM.slice(12, 15)}GGGG${MULTI_TARGET_UPSTREAM.slice(15)}`;
const LEFT = 'TTTT';
function fixture(direction, targetUpstream = TARGET_UPSTREAM) {
  const reverse = direction === 'reverse';
  const template = reverse
    ? `${LEFT}${reverseComplement(CORE)}${reverseComplement(targetUpstream)}AAAA`
    : `${LEFT}${targetUpstream}${CORE}GGGG`;
  const coreStart = reverse ? LEFT.length : LEFT.length + targetUpstream.length;
  return { reverse, template, coreStart };
}

function primer(direction, coreStart, {
  id = 'local-islands-primer', queryUpstream = QUERY_UPSTREAM,
} = {}) {
  const reverse = direction === 'reverse';
  return {
    id: `${id}-${direction}`,
    name: `${id}-${direction}`,
    direction,
    bindingModel: 'aligned-v1',
    tail: `${TRUE_TAIL}${queryUpstream}`,
    bindingSequence: CORE,
    sequence: `${TRUE_TAIL}${queryUpstream}${CORE}`,
    sites: [{
      id: `${id}-site`,
      target: { entryId: ENTRY, resourceHash: DOCUMENT, topology: 'linear' },
      location: {
        kind: 'single',
        segments: [{ start: coreStart, end: coreStart + CORE.length }],
      },
      strand: reverse ? -1 : 1,
      annealedSequence: CORE,
      tail: '',
    }],
  };
}

function props(direction, options = {}) {
  const { targetUpstream = TARGET_UPSTREAM } = options;
  const { template, coreStart } = fixture(direction, targetUpstream);
  return {
    fullSeq: template,
    lineStart: 0,
    lineLen: template.length,
    labelChars: 8,
    primerStyle: 'filled',
    charPx: 7.2,
    entryId: ENTRY,
    documentHash: DOCUMENT,
    topology: 'linear',
    primers: [primer(direction, coreStart, options)],
    onPrimerClick: () => {},
  };
}

function expectInsertionConnectorsBehindCallouts(primerNode) {
  const children = [...primerNode.children];
  const connectors = [...primerNode.querySelectorAll(
    '[data-primer-step-source="insertion"]',
  )];
  const callouts = [...primerNode.querySelectorAll(
    '[data-testid="sequence-view-primer-insertion"]',
  )];
  const connectorIndexes = connectors.map((node) => children.indexOf(node));
  const calloutIndexes = callouts.map((node) => children.indexOf(node));

  expect(connectors.length).toBeGreaterThan(1);
  expect(callouts.length).toBeGreaterThan(1);
  expect(connectorIndexes.every((index) => index >= 0)).toBe(true);
  expect(calloutIndexes.every((index) => index >= 0)).toBe(true);
  expect(Math.max(...connectorIndexes)).toBeLessThan(Math.min(...calloutIndexes));
}

describe('PrimerTrack anchored-local projection', () => {
  it.each(['forward', 'reverse'])(
    'renders true tail + M-X-M-I-M cleanly in compact and expanded %s mode',
    (direction) => {
      const primerProps = props(direction);
      const { rerender } = render(<PrimerTrack {...primerProps} />);
      const compact = screen.getByTestId('sequence-view-primer');
      const key = compact.dataset.primerKey;

      expect(compact.dataset.primerSpan)
        .toBe(`${LEFT.length}-${LEFT.length + TARGET_UPSTREAM.length + CORE.length}`);
      expect(within(compact).getAllByTestId('sequence-view-primer-compact-run'))
        .toHaveLength(1);
      expect(within(compact).getAllByTestId('sequence-view-primer-compact-mismatch'))
        .toHaveLength(1);
      expect(within(compact).getByTestId('sequence-view-primer-insertion')
        .dataset.primerInsertionCount).toBe('1');
      expect(within(compact).getByTestId('sequence-view-primer-tail')).toBeTruthy();

      rerender(
        <PrimerTrack {...primerProps} selectedPrimerKeys={[key]} expandedPrimerKey={key} />,
      );

      const expanded = screen.getByTestId('sequence-view-primer');
      const insertion = within(expanded).getByTestId('sequence-view-primer-insertion');
      const mismatches = expanded.querySelectorAll(
        'tspan[data-primer-alignment-op="X"]',
      );
      expect(within(expanded).getByTestId('sequence-view-primer-tail-bases').textContent)
        .toBe(TRUE_TAIL);
      expect(insertion.dataset.primerInsertionCount).toBe('1');
      expect(insertion.textContent).toBe(direction === 'forward' ? 'G' : 'C');
      expect(mismatches).toHaveLength(1);

      const label = within(expanded).getByTestId('sequence-view-primer-label');
      const bodyY = Number(within(expanded).getAllByTestId('sequence-view-primer-run')[0]
        .getAttribute('data-primer-lane-y'));
      if (direction === 'reverse') {
        expect(Number(label.dataset.primerLabelY)
          + PRIMER_LABEL_HEIGHT + PRIMER_LABEL_GAP).toBe(bodyY);
      } else {
        expect(Number(label.dataset.primerLabelY))
          .toBe(bodyY + PRIMER_GLYPH_HEIGHT + PRIMER_LABEL_GAP);
      }
    },
  );

  it.each(['forward', 'reverse'])(
    'stacks two nearby biological insertions without losing their centered anchors (%s)',
    (direction) => {
      const primerProps = props(direction, {
        id: 'nearby-insertions-primer',
        queryUpstream: MULTI_QUERY_UPSTREAM,
        targetUpstream: MULTI_TARGET_UPSTREAM,
      });
      const { rerender } = render(<PrimerTrack {...primerProps} />);
      const compact = screen.getByTestId('sequence-view-primer');
      const key = compact.dataset.primerKey;

      expectInsertionConnectorsBehindCallouts(compact);

      rerender(
        <PrimerTrack {...primerProps} selectedPrimerKeys={[key]} expandedPrimerKey={key} />,
      );

      const expanded = screen.getByTestId('sequence-view-primer');
      const insertions = within(expanded).getAllByTestId('sequence-view-primer-insertion');
      const tiers = insertions.map((node) => Number(node.dataset.primerInsertionTier));
      const ys = insertions.map((node) => Number(node.dataset.primerLaneY));
      const templateY = Number(expanded.querySelector('[data-primer-lane="template"]')
        .getAttribute('data-primer-lane-y'));

      expect(insertions).toHaveLength(2);
      expect(tiers.sort((a, b) => a - b)).toEqual([1, 2]);
      expect(new Set(ys).size).toBe(2);
      expect(Math.abs(ys[0] - ys[1])).toBe(PRIMER_STEP_OFFSET);
      expect(ys.every((y) => (direction === 'forward' ? y < templateY : y > templateY)))
        .toBe(true);
      insertions.forEach((node) => {
        const rect = node.querySelector('rect');
        const text = node.querySelector('text');
        expect(Number(rect.getAttribute('x')))
          .toBeCloseTo(-Number(rect.getAttribute('width')) / 2, 6);
        expect(Number(text.getAttribute('x'))).toBe(0);
      });
      expect(expanded.querySelectorAll('[data-primer-step-source="insertion"]'))
        .toHaveLength(2);
      expectInsertionConnectorsBehindCallouts(expanded);
      expect(expanded.querySelectorAll('[data-primer-selection-bracket]')).toHaveLength(2);
    },
  );
});
