/**
 * group-border-k8.test.jsx — M-CANVAS-WORKFLOW-UX K8 (SPEC §3 visual).
 *
 * draftFromZone projects piece.groupId / groupLayer onto segments;
 * SegmentList wraps consecutive same-group rows in a bordered «group
 * container» with a kind-label header (and an intermediate name when
 * op.params.groupName is set).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import SegmentList from '../editor/assembly-mode/SegmentList';
import { draftFromZone } from '../lib/zone-pieces-to-dag';
import { SkeletonProvider } from '../store/skeleton-context';

afterEach(cleanup);

const C = { id: 'cA', name: 'pUC', sequence: 'AAAACCCCGGGGTTTT' };

function makeState(pieces) {
  return { containers: [C], pieces, operations: [] };
}

const ZONE = { id: 'z1', name: 'Z' };

describe('K8 — draftFromZone projects groupId / groupLayer', () => {
  it('sourced segment carries piece.groupId + groupLayer', () => {
    const state = makeState([{
      id: 'p1', kind: 'sourced', zoneId: 'z1', createdAt: 1,
      ranges: [{ sourceId: 'cA', start: 0, end: 4, orientation: 'forward' }],
      groupId: 'op-1', groupLayer: 0,
    }]);
    const draft = draftFromZone(state, ZONE);
    expect(draft.segments[0].groupId).toBe('op-1');
    expect(draft.segments[0].groupLayer).toBe(0);
  });

  it('snippet segment carries groupId too', () => {
    const state = makeState([{
      id: 'p2', kind: 'snippet', zoneId: 'z1', createdAt: 2,
      sequence: 'CATCAT', name: '6xHis', groupId: 'op-1',
    }]);
    expect(draftFromZone(state, ZONE).segments[0].groupId).toBe('op-1');
  });
});

describe('K8 — SegmentList group container rendering', () => {
  const opA = {
    id: 'op-A', kind: 'overlap_pcr', isOpGroup: true, zoneId: 'z',
    inputPieces: ['s1', 's2'], params: { groupName: 'layer1' },
  };
  const opB = {
    id: 'op-B', kind: 'gibson', isOpGroup: true, zoneId: 'z',
    inputPieces: ['s3', 's4'], params: {},
  };
  const SEGS = [
    { id: 's1', source: { type: 'manual' }, sequence: 'A', length: 1, groupId: 'op-A' },
    { id: 's2', source: { type: 'manual' }, sequence: 'C', length: 1, groupId: 'op-A' },
    { id: 's3', source: { type: 'manual' }, sequence: 'G', length: 1, groupId: 'op-B' },
    { id: 's4', source: { type: 'manual' }, sequence: 'T', length: 1, groupId: 'op-B' },
    { id: 's5', source: { type: 'manual' }, sequence: 'N', length: 1, groupId: null },
  ];
  const BOUNDS = SEGS.map((s, i) => ({ segmentId: s.id, startOnAssembly: i, endOnAssembly: i + 1 }));
  const DRAFT = { id: 'd', name: 'd', segments: SEGS, topology: { circular: false } };

  it('wraps consecutive same-group rows in a group container with kind label', () => {
    render(
      <SkeletonProvider>
        <SegmentList
          draft={DRAFT}
          boundaries={BOUNDS}
          orphanIds={new Set()}
          onSelectSegment={() => {}}
          operations={[opA, opB]}
        />
      </SkeletonProvider>,
    );
    const a = screen.getByTestId('segment-group-container-op-A');
    expect(a.textContent).toMatch(/overlap_pcr|Overlap PCR/i);
    expect(a.textContent).toMatch(/layer1/); // intermediate name
    const b = screen.getByTestId('segment-group-container-op-B');
    expect(b.textContent).toMatch(/gibson/i);
  });

  it('group container has a header testid + groups separate containers', () => {
    render(
      <SkeletonProvider>
        <SegmentList
          draft={DRAFT}
          boundaries={BOUNDS}
          orphanIds={new Set()}
          onSelectSegment={() => {}}
          operations={[opA, opB]}
        />
      </SkeletonProvider>,
    );
    expect(screen.getByTestId('segment-group-header-op-A')).toBeTruthy();
    expect(screen.getByTestId('segment-group-header-op-B')).toBeTruthy();
    // The two containers are distinct DOM nodes.
    expect(screen.getByTestId('segment-group-container-op-A'))
      .not.toBe(screen.getByTestId('segment-group-container-op-B'));
  });

  it('ungrouped row sits outside any group container', () => {
    render(
      <SkeletonProvider>
        <SegmentList
          draft={DRAFT}
          boundaries={BOUNDS}
          orphanIds={new Set()}
          onSelectSegment={() => {}}
          operations={[opA, opB]}
        />
      </SkeletonProvider>,
    );
    const ungrouped = screen.getByText((_, node) => node && node.getAttribute('data-segment-id') === 's5')
      || document.querySelector('[data-segment-id="s5"]');
    expect(ungrouped).toBeTruthy();
    expect(ungrouped.closest('[data-testid^="segment-group-container-"]')).toBeNull();
  });

  it('falls back gracefully when operations prop is missing (back-compat)', () => {
    render(
      <SkeletonProvider>
        <SegmentList
          draft={DRAFT}
          boundaries={BOUNDS}
          orphanIds={new Set()}
          onSelectSegment={() => {}}
        />
      </SkeletonProvider>,
    );
    // All rows still render even without operations — group containers
    // collapse to a thin wrapper using only seg.groupId as the key.
    expect(screen.getAllByTestId('assembly-segment-row')).toHaveLength(5);
  });
});
