/**
 * strip-icons-k6.test.jsx — M-CANVAS-WORKFLOW-UX K6.
 *
 * Strip rendering for snippet / synthesis / mutation pieces (SPEC §5.3
 * iconography) + draftFromZone projection of inline-sequence pieces.
 */
import 'fake-indexeddb/auto';
import {
  describe, it, expect, afterEach,
} from 'vitest';
import {
  render, screen, cleanup,
} from '@testing-library/react';
import SegmentList from '../editor/assembly-mode/SegmentList';
import { draftFromZone } from '../lib/zone-pieces-to-dag';
import { SkeletonProvider } from '../store/skeleton-context';

afterEach(cleanup);

const SEGS = [
  { id: 's1', source: { type: 'container', containerId: 'cA', sourceContainerName: 'pUC19' }, sequence: 'AAAA', length: 4, pieceKind: 'sourced', mutations: [] },
  { id: 's2', source: { type: 'manual' }, sequence: 'CATCATCATCATCATCAT', length: 18, pieceKind: 'snippet', label: '6xHis' },
  { id: 's3', source: { type: 'manual' }, sequence: 'GGGG', length: 4, pieceKind: 'synthesis', label: 'Hyg' },
  { id: 's4', source: { type: 'manual' }, sequence: '', length: 30, gapKind: 'unknown' },
  { id: 's5', source: { type: 'container', containerId: 'cB', sourceContainerName: 'pET' }, sequence: 'TTTT', length: 4, pieceKind: 'sourced', mutations: [{ position: 2, fromBase: 'C', toBase: 'T' }] },
];
const BOUNDS = SEGS.map((s, i) => ({ segmentId: s.id, startOnAssembly: i * 10, endOnAssembly: i * 10 + (s.length || 0) }));
const DRAFT = { id: 'd', name: 'd', segments: SEGS, topology: { circular: false } };

function withProvider(node) {
  return render(<SkeletonProvider>{node}</SkeletonProvider>);
}

describe('K6 — SegmentList kind icons', () => {
  it('renders 🧬 for sourced, ✦ for snippet, 🧪 for synthesis, ◊ for gap', () => {
    withProvider(<SegmentList draft={DRAFT} boundaries={BOUNDS} orphanIds={new Set()} onSelectSegment={() => {}} />);
    const rows = screen.getAllByTestId('assembly-segment-row');
    expect(rows[0].querySelector('[data-testid="segment-kind-icon"]').textContent).toBe('🧬');
    expect(rows[1].querySelector('[data-testid="segment-kind-icon"]').textContent).toBe('✦');
    expect(rows[2].querySelector('[data-testid="segment-kind-icon"]').textContent).toBe('🧪');
    expect(rows[3].querySelector('[data-testid="segment-kind-icon"]').textContent).toBe('◊');
  });

  it('💎 mutation badge appears only when piece.mutations is non-empty', () => {
    withProvider(<SegmentList draft={DRAFT} boundaries={BOUNDS} orphanIds={new Set()} onSelectSegment={() => {}} />);
    const rows = screen.getAllByTestId('assembly-segment-row');
    expect(rows[0].querySelector('[data-testid="segment-mutation-badge"]')).toBeNull();
    expect(rows[4].querySelector('[data-testid="segment-mutation-badge"]')).toBeTruthy();
  });
});
describe('K6 — draftFromZone projects snippet / synthesis pieces', () => {
  it('snippet piece → segment with sequence + pieceKind=snippet, source.manual', () => {
    const state = {
      containers: [],
      pieces: [{
        id: 'p1', kind: 'snippet', zoneId: 'z1', createdAt: 1,
        sequence: 'CATCATCATCATCATCAT', name: '6xHis',
        snippetType: '6xHis', embedsInPrimer: true,
      }],
    };
    const draft = draftFromZone(state, { id: 'z1', name: 'Z' });
    expect(draft.segments).toHaveLength(1);
    const seg = draft.segments[0];
    expect(seg.pieceKind).toBe('snippet');
    expect(seg.sequence).toBe('CATCATCATCATCATCAT');
    expect(seg.length).toBe(18);
    expect(seg.source.type).toBe('manual');
  });

  it('synthesis piece → segment with sequence + pieceKind=synthesis', () => {
    const state = {
      containers: [],
      pieces: [{
        id: 'p2', kind: 'synthesis', zoneId: 'z1', createdAt: 2,
        sequence: 'ATGAAA', name: 'Hyg',
      }],
    };
    const draft = draftFromZone(state, { id: 'z1', name: 'Z' });
    expect(draft.segments[0].pieceKind).toBe('synthesis');
    expect(draft.segments[0].sequence).toBe('ATGAAA');
  });

  it('mutations are passed through for sourced pieces', () => {
    const state = {
      containers: [{ id: 'c', name: 'X', sequence: 'AAAACCCCGGGGTTTT' }],
      pieces: [{
        id: 'p3', kind: 'sourced', zoneId: 'z1', createdAt: 3,
        ranges: [{ sourceId: 'c', start: 0, end: 4, orientation: 'forward' }],
        mutations: [{ position: 2, fromBase: 'C', toBase: 'T' }],
      }],
    };
    const draft = draftFromZone(state, { id: 'z1', name: 'Z' });
    expect(draft.segments[0].mutations).toEqual([{ position: 2, fromBase: 'C', toBase: 'T' }]);
  });
});
