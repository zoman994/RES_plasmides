/**
 * V127 — сборщик показывает координаты фич/сегментов 1-based (⚓ DEC-ANN-10).
 * Хранение остаётся 0-based half-open; дисплей конвертит через toUiCoords.
 */
import 'fake-indexeddb/auto';
import {
  describe, it, expect, afterEach, beforeEach,
} from 'vitest';
import {
  render, screen, cleanup, within,
} from '@testing-library/react';
import RangePickerModal from '../RangePickerModal';
import SegmentList from '../SegmentList';
import { SkeletonProvider } from '../../../store/skeleton-context';
import { bootstrapStore } from '../../../../../store';

afterEach(cleanup);
beforeEach(() => { try { bootstrapStore(); } catch { /* idempotent */ } });

const SRC = {
  name: 'pUC19', sequence: 'AAAACCCCGGGGTTTT', circular: true,
  annotations: [{ start: 4, end: 12, label: 'ori' }],
};

describe('V127 — RangePickerModal 1-based display', () => {
  it('feature dropdown shows 1-based coords (start+1..end)', () => {
    render(<RangePickerModal source={SRC} onConfirm={() => {}} onCancel={() => {}} />);
    // annotation {start:4,end:12} → биолог читает «ori (5-12)»
    expect(
      within(screen.getByTestId('range-picker-feature')).getByText(/ori \(5-12\)/),
    ).toBeTruthy();
  });

  it('default start input is 1-based (1, not 0)', () => {
    render(<RangePickerModal source={SRC} onConfirm={() => {}} onCancel={() => {}} />);
    expect(screen.getByTestId('range-picker-start').value).toBe('1');
    expect(screen.getByTestId('range-picker-end').value).toBe('16');
  });
});

describe('V127 — SegmentList 1-based source-range label', () => {
  const draft = {
    id: 'd1',
    segments: [{
      id: 's1',
      source: { type: 'container', sourceContainerName: 'pUC' },
      start: 0, end: 8, color: '#cccccc',
    }],
  };

  it('container segment row shows [start+1:end]', () => {
    render(
      <SkeletonProvider>
        <SegmentList
          draft={draft}
          boundaries={[]}
          orphanIds={new Set()}
          selectedSegmentId={null}
          onSelectSegment={() => {}}
        />
      </SkeletonProvider>,
    );
    // stored [0,8) → displayed [1:8]
    const row = screen.getByTestId('assembly-segment-row');
    expect(within(row).getByText(/\[1:8\]/)).toBeTruthy();
  });

  // V129 — RC orientation explicit in the label; numbers stay ascending
  // (source span, GenBank complement convention — not reversed to 8:1).
  it('RC segment shows an explicit reverse marker, numbers stay ascending', () => {
    const rcDraft = {
      id: 'd2',
      segments: [{
        id: 's2',
        source: { type: 'container', sourceContainerName: 'pUC' },
        start: 0, end: 8, color: '#cccccc',
        reverseComplement: true,
      }],
    };
    render(
      <SkeletonProvider>
        <SegmentList
          draft={rcDraft}
          boundaries={[]}
          orphanIds={new Set()}
          selectedSegmentId={null}
          onSelectSegment={() => {}}
        />
      </SkeletonProvider>,
    );
    const row = screen.getByTestId('assembly-segment-row');
    expect(within(row).getByText(/\[1:8\] ←RC/)).toBeTruthy();
  });

  it('non-RC segment has no reverse marker', () => {
    render(
      <SkeletonProvider>
        <SegmentList
          draft={draft}
          boundaries={[]}
          orphanIds={new Set()}
          selectedSegmentId={null}
          onSelectSegment={() => {}}
        />
      </SkeletonProvider>,
    );
    const row = screen.getByTestId('assembly-segment-row');
    expect(within(row).queryByText(/←RC/)).toBeNull();
  });
});
