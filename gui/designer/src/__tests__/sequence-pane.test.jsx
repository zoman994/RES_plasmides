import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import SequencePane from '../components/SequencePane';

// Minimal ResizeObserver mock: captures the most recent callback so tests can
// fire it synchronously. happy-dom has no layout, so offsetWidth defaults to 0
// unless tests define it explicitly.
beforeEach(() => {
  globalThis.__lastResizeObserverCb = null;
  globalThis.ResizeObserver = class {
    constructor(cb) { globalThis.__lastResizeObserverCb = cb; }
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

const SEQ = 'ATGGCTAGCAAATTTGGGCCCAAATAA'; // 27 nt, single line
const CDS_REGION = { id: 'r-cds', name: 'cds', type: 'CDS', level: 'region', start: 0, end: 27 };
const PROM_REGION = { id: 'r-prom', name: 'prom', type: 'promoter', level: 'region', start: 0, end: 27 };

describe('SequencePane — render', () => {
  it('renders empty-state message when no fragments', () => {
    const { getByText } = render(<SequencePane fragments={[]} selectedRegionId={null} onSelectRegion={() => {}} />);
    expect(getByText(/Пустая сборка/)).toBeTruthy();
  });

  it('renders totalBp in header for a single fragment', () => {
    const fragments = [{ id: 'f1', sequence: SEQ, annotations: [CDS_REGION] }];
    const { container } = render(
      <SequencePane fragments={fragments} selectedRegionId={null} onSelectRegion={() => {}} />
    );
    const header = container.querySelector('[data-testid="sequence-pane"]')?.querySelector('.uppercase');
    expect(header?.textContent).toMatch(/27/);
  });

  it('renders concatenated sequence across two fragments with region label', () => {
    const fragments = [
      { id: 'f1', sequence: 'AAAAAAAA', annotations: [CDS_REGION, ...[]] },
      { id: 'f2', sequence: 'GGGGGGGG', annotations: [{ ...PROM_REGION, start: 0, end: 8 }] },
    ];
    const { container, getByText } = render(
      <SequencePane fragments={fragments} selectedRegionId={null} onSelectRegion={() => {}} />
    );
    // Region labels render region name
    expect(getByText(/prom/)).toBeTruthy();
    // Data-line attribute on each rendered line
    const lines = container.querySelectorAll('[data-line]');
    expect(lines.length).toBeGreaterThanOrEqual(1);
  });

  it('calls onSelectRegion when clicking a nucleotide inside a region', () => {
    const onSelectRegion = vi.fn();
    const fragments = [{ id: 'f1', sequence: SEQ, annotations: [CDS_REGION] }];
    const { container } = render(
      <SequencePane fragments={fragments} selectedRegionId={null} onSelectRegion={onSelectRegion} />
    );
    // Find sense-strand nucleotide spans (inline-block w-[1ch] wrappers with single A/T/G/C text)
    const ntSpans = Array.from(container.querySelectorAll('span'))
      .filter(s => /^[ATGC]$/.test(s.textContent.trim()) && s.getAttribute('title'));
    expect(ntSpans.length).toBeGreaterThan(0);
    fireEvent.click(ntSpans[0]);
    expect(onSelectRegion).toHaveBeenCalledWith('r-cds');
  });

  it('keeps the default 80 charsPerLine when container has no measurable width (jsdom regression)', () => {
    const fragments = [{ id: 'f1', sequence: 'A'.repeat(200), annotations: [CDS_REGION] }];
    const { container } = render(
      <SequencePane fragments={fragments} selectedRegionId={null} onSelectRegion={() => {}} />
    );
    // 200 nt at default 80 chars/line = 3 lines (80 + 80 + 40).
    const lines = container.querySelectorAll('[data-line]');
    expect(lines.length).toBe(3);
  });

  it('recomputes charsPerLine on container resize (snaps to multiples of 10, clamped)', async () => {
    const fragments = [{ id: 'f1', sequence: 'A'.repeat(1000), annotations: [{ ...CDS_REGION, end: 1000 }] }];
    const { container, rerender } = render(
      <SequencePane fragments={fragments} selectedRegionId={null} onSelectRegion={() => {}} />
    );
    const scroller = container.querySelector('.overflow-y-auto');
    // offsetWidth = 0 in happy-dom by default → default 80 holds.
    Object.defineProperty(scroller, 'offsetWidth', { configurable: true, value: 900 });
    // Trigger the ResizeObserver callback manually via the mock installed in setup.
    if (globalThis.__lastResizeObserverCb) globalThis.__lastResizeObserverCb();
    rerender(
      <SequencePane fragments={fragments} selectedRegionId={null} onSelectRegion={() => {}} />
    );
    // available = 900 - 32 = 868 px; 868 / 7.3 ≈ 118; clamp 60-120 → 118;
    // snap-to-10 → 110. 1000 nt / 110 = 10 lines.
    const lines = container.querySelectorAll('[data-line]');
    expect(lines.length).toBeLessThanOrEqual(11);
    expect(lines.length).toBeGreaterThanOrEqual(9);
  });

  it('pushes a non-undefined id when the annotation has no id (K4.1 backfill + K4.2 guard)', () => {
    const onSelectRegion = vi.fn();
    const noIdRegion = { name: 'no-id', type: 'CDS', level: 'region', start: 0, end: 27 };
    const fragments = [{ id: 'f1', sequence: SEQ, annotations: [noIdRegion] }];
    const { container } = render(
      <SequencePane fragments={fragments} selectedRegionId={null} onSelectRegion={onSelectRegion} />
    );
    const ntSpans = Array.from(container.querySelectorAll('span'))
      .filter(s => /^[ATGC]$/.test(s.textContent.trim()) && s.getAttribute('title'));
    expect(ntSpans.length).toBeGreaterThan(0);
    fireEvent.click(ntSpans[0]);
    expect(onSelectRegion).toHaveBeenCalledTimes(1);
    const pushed = onSelectRegion.mock.calls[0][0];
    expect(pushed).not.toBeUndefined();
    expect(pushed).not.toBeNull();
    expect(typeof pushed).toBe('string');
  });

  it('toggles off when clicking the already selected region', () => {
    const onSelectRegion = vi.fn();
    const fragments = [{ id: 'f1', sequence: SEQ, annotations: [CDS_REGION] }];
    const { container } = render(
      <SequencePane fragments={fragments} selectedRegionId="r-cds" onSelectRegion={onSelectRegion} />
    );
    const ntSpans = Array.from(container.querySelectorAll('span'))
      .filter(s => /^[ATGC]$/.test(s.textContent.trim()) && s.getAttribute('title'));
    fireEvent.click(ntSpans[0]);
    expect(onSelectRegion).toHaveBeenCalledWith(null);
  });
});
