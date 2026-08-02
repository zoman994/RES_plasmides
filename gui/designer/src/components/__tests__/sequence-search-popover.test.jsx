/**
 * SequenceSearchPopover — Sprint M-X.9 K2 + K4, updated for the worker migration (U4).
 *
 * The popover now borrows the app-wide worker through the `popover` channel, so every render goes
 * through a real <SequenceSearchProvider>. The validation surface (alphabet / length / recent /
 * close) is unchanged and asserted here; the two search-dependent cases drive a fake worker exactly
 * as production would, since a search is no longer synchronous.
 *
 * Covers:
 *   • renders nothing when closed; mounts when opened
 *   • too-short query surfaces a min-length hint / toast
 *   • IUPAC degenerate codes surface a hint / toast and skip the search
 *   • a valid query, once the worker replies, produces hits + the count badge
 *   • Esc closes; recent searches persist; the flat overlay slice is published + cleared
 */
import 'fake-indexeddb/auto';
import {
  describe, it, expect, beforeEach, afterEach, vi,
} from 'vitest';
import {
  render, screen, fireEvent, cleanup, act,
} from '@testing-library/react';
import { useStore } from '../../store';
import { handleSearchMessage } from '../../lib/search-worker-core';
import SequenceSearchPopover from '../SequenceSearchPopover';
import SequenceSearchProvider from '../SequenceSearchProvider';
import { clearRecentSearches, getRecentSearches } from '../../lib/sequence-search-recent';

const TARGET = 'AAATTTGCATGCATGCATGCATGCATGCATGCATGCAAATTT';

// A worker whose reply the test flushes on demand, answering through the real core.
function makeFactory() {
  const workers = [];
  const factory = () => {
    const w = {
      onmessage: null, onerror: null, onmessageerror: null, posted: [], terminated: false,
      postMessage(msg) { w.posted.push(msg); },
      replyLast() { const m = w.posted[w.posted.length - 1]; if (m) w.onmessage?.({ data: handleSearchMessage(m) }); },
      terminate() { w.terminated = true; },
    };
    workers.push(w);
    return w;
  };
  factory.workers = workers;
  return factory;
}
let factory;
const wrap = (ui) => <SequenceSearchProvider workerFactory={factory}>{ui}</SequenceSearchProvider>;
const liveWorker = () => factory.workers[factory.workers.length - 1];
const settle = () => { act(() => { vi.advanceTimersByTime(300); }); };
const flush = async () => { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); };

beforeEach(() => {
  factory = makeFactory();
  useStore.setState((s) => { s.toasts = []; s.searchHits = { entryId: null, query: '', hits: [] }; });
  try { clearRecentSearches(); } catch { /* */ }
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('M-X.9 K2 — SequenceSearchPopover', () => {
  it('renders nothing when closed', () => {
    render(wrap(<SequenceSearchPopover open={false} targetSequence={TARGET} />));
    expect(screen.queryByTestId('sequence-search-popover')).toBeNull();
  });

  it('mounts dialog + input + threshold slider when open', () => {
    render(wrap(<SequenceSearchPopover open targetSequence={TARGET} targetName="t1" onClose={() => {}} />));
    expect(screen.getByTestId('sequence-search-popover')).toBeTruthy();
    expect(screen.getByTestId('sequence-search-input')).toBeTruthy();
    expect(screen.getByTestId('sequence-search-threshold')).toBeTruthy();
    expect(screen.getByTestId('sequence-search-target-name').textContent).toMatch(/t1/);
  });

  it('too-short query shows the min-length hint inline (no toast unless submitted)', () => {
    render(wrap(<SequenceSearchPopover open targetSequence={TARGET} onClose={() => {}} />));
    fireEvent.change(screen.getByTestId('sequence-search-input'), { target: { value: 'ACGT' } });
    expect(screen.getByTestId('sequence-search-results').textContent).toMatch(/Минимум 8 нт/);
  });

  it('clicking submit on too-short query fires the «for RE-sites» info toast', () => {
    render(wrap(<SequenceSearchPopover open targetSequence={TARGET} onClose={() => {}} />));
    fireEvent.change(screen.getByTestId('sequence-search-input'), { target: { value: 'ACGT' } });
    fireEvent.click(screen.getByTestId('sequence-search-submit'));
    const toasts = useStore.getState().toasts || [];
    expect(toasts.some((t) => /Минимум 8/.test(t.msg))).toBe(true);
  });

  it.each([
    ['a degenerate code', 'ACGTNCGT'],
    ['R', 'ACGTRCGT'],
    ['U (RNA)', 'ACGUACGU'],
    ['a single U', 'U'],
    ['a single N', 'N'],
    ['a short RNA paste', 'ACGU'],
    ['a gap run', '----'],
  ])('%s → inline hint + toast, both naming the A/C/G/T rule (K3.0 §2.5)', (_label, value) => {
    render(wrap(<SequenceSearchPopover open targetSequence={TARGET} onClose={() => {}} />));
    fireEvent.change(screen.getByTestId('sequence-search-input'), { target: { value } });
    const shown = screen.getByTestId('sequence-search-results').textContent;
    expect(shown).toMatch(/Только A, C, G, T/);
    expect(shown, 'alphabet errors must not masquerade as length errors').not.toMatch(/Минимум/);
    fireEvent.click(screen.getByTestId('sequence-search-submit'));
    const toasts = useStore.getState().toasts || [];
    expect(toasts.some((t) => /Только A, C, G, T/.test(t.msg))).toBe(true);
    expect(toasts.some((t) => /Минимум/.test(t.msg))).toBe(false);
  });

  it('a VALID but short A/C/G/T query still gets the length hint, not the alphabet one', () => {
    render(wrap(<SequenceSearchPopover open targetSequence={TARGET} onClose={() => {}} />));
    fireEvent.change(screen.getByTestId('sequence-search-input'), { target: { value: 'ACGT' } });
    const shown = screen.getByTestId('sequence-search-results').textContent;
    expect(shown).toMatch(/Минимум 8/);
    expect(shown).not.toMatch(/Только A, C, G, T/);
  });

  it('the invalid-alphabet hint is a warning token, not a hard-coded hex', () => {
    render(wrap(<SequenceSearchPopover open targetSequence={TARGET} onClose={() => {}} />));
    fireEvent.change(screen.getByTestId('sequence-search-input'), { target: { value: 'ACGUACGU' } });
    const hint = screen.getByTestId('sequence-search-invalid-dna');
    expect(hint.getAttribute('style')).toMatch(/var\(--warning-fg/);
  });

  it('valid ACGT query, once the worker replies, produces a hit count + at least one row', async () => {
    vi.useFakeTimers();
    render(wrap(<SequenceSearchPopover open targetSequence={TARGET} entryId="e1" onClose={() => {}} />));
    act(() => { fireEvent.change(screen.getByTestId('sequence-search-input'), { target: { value: 'GCATGCATGCATGC' } }); });
    settle();
    act(() => { liveWorker().replyLast(); });
    await flush();
    // The count is worded by the SHARED formatter (`formatLocationCount`) — the same one the global
    // dropdown's locus card uses. It used to be a hard-coded Russian header of its own, which is how
    // two surfaces ended up stating the same fact in two ways (U5-A).
    expect(screen.getByTestId('sequence-search-hit-count').textContent).toMatch(/^\d+ лок\.$/);
    expect(document.querySelectorAll('[data-testid^="search-hit-"]').length).toBeGreaterThan(0);
  });

  it('Esc closes the popover', () => {
    const onClose = vi.fn();
    render(wrap(<SequenceSearchPopover open targetSequence={TARGET} onClose={onClose} />));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('publishes the CANONICAL occurrences into uiSlice.searchHits when entryId + a reply land', async () => {
    vi.useFakeTimers();
    render(wrap(<SequenceSearchPopover open targetSequence={TARGET} entryId="e1" onClose={() => {}} />));
    act(() => { fireEvent.change(screen.getByTestId('sequence-search-input'), { target: { value: 'GCATGCATGCATGC' } }); });
    settle();
    act(() => { liveWorker().replyLast(); });
    await flush();
    const slot = useStore.getState().searchHits;
    expect(slot.entryId).toBe('e1');
    expect(slot.query).toBe('GCATGCATGCATGC');
    expect(slot.hits.length).toBeGreaterThan(0);
    // The Overlay reads canonical occurrences now — location.segments + metrics, not flat projections.
    expect(slot.hits.every((h) => h.location && Array.isArray(h.location.segments) && h.metrics)).toBe(true);
  });

  it('clears uiSlice.searchHits when the popover closes', async () => {
    useStore.setState((s) => {
      s.searchHits = { entryId: 'e1', query: 'PRIOR', hits: [{ targetStart: 0, targetEnd: 5 }] };
    });
    render(wrap(<SequenceSearchPopover open={false} targetSequence={TARGET} entryId="e1" onClose={() => {}} />));
    await flush();
    expect(useStore.getState().searchHits.hits.length).toBe(0);
  });

  it('successful submit pushes the query into the recent-searches list', () => {
    render(wrap(<SequenceSearchPopover open targetSequence={TARGET} onClose={() => {}} />));
    fireEvent.change(screen.getByTestId('sequence-search-input'), { target: { value: 'GCATGCATGCATGC' } });
    fireEvent.click(screen.getByTestId('sequence-search-submit'));
    expect(getRecentSearches()).toContain('GCATGCATGCATGC');
  });
});
