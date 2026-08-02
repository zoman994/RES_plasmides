/**
 * U6-C — one activity indicator, on both search surfaces, and nowhere else.
 *
 * WHAT THIS IS FOR. A 1 Mb approximate search is hundreds of milliseconds of silence. The wording
 * already says «checking», but a line of static text is indistinguishable from a frozen panel, and a
 * biologist who cannot tell the difference clicks again. A moving stripe answers the only question
 * they have — is it working — without answering one nobody can answer honestly: how long.
 *
 * SO IT IS AN ACTIVITY INDICATOR, NOT A PROGRESS BAR. The engine cannot know how far through a sweep
 * it is (the corpus is walked document by document, and a hit can end it early), so any percentage
 * would be invented. That is why these contracts assert the ABSENCE of `aria-valuenow` and of a
 * second live region as firmly as they assert the presence of the stripe: an indicator that claims
 * to be a measurement is worse than no indicator.
 *
 * THE HARD PART IS WHERE IT MUST NOT APPEAR. A stripe left running after the answer arrived says the
 * search is still going when it is not — so every terminal state is checked by name.
 */
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import 'fake-indexeddb/auto';
import { useStore } from '../../../store';
import { handleSearchMessage } from '../../../lib/search-worker-core';
import SearchStatusContent from '../../Library/SearchStatusContent';
import SequenceSearchPopover from '../../SequenceSearchPopover';
import SequenceSearchProvider from '../../SequenceSearchProvider';
import SearchProgressTrack from '../SearchProgressTrack';

const TRACK = 'search-progress-track';
const TARGET = 'AAATTTGCATGCATGCATGCATGCATGCATGCATGCAAATTTGGCCAATTCCGGAATTCCAA';

afterEach(cleanup);

describe('U6-C · the component itself', () => {
  it('renders a stripe that is invisible to assistive tech and claims no value', () => {
    const { container } = render(<SearchProgressTrack />);
    const track = screen.getByTestId(TRACK);
    expect(track).toBeTruthy();
    // aria-hidden: the existing role=status line is the ONE announcement; a second one would make a
    // screen reader read the same state twice.
    expect(track.getAttribute('aria-hidden')).toBe('true');
    // Not a measurement — no progressbar semantics of any kind.
    expect(track.getAttribute('role')).toBeNull();
    expect(container.querySelector('[aria-valuenow]')).toBeNull();
    expect(container.querySelector('[role="progressbar"]')).toBeNull();
    expect(container.querySelector('[aria-live]')).toBeNull();
    expect(container.querySelector('[role="status"]')).toBeNull();
  });

  it('is driven by CSS, not by a React timer', () => {
    // A timer would keep the component re-rendering for the whole search — main-thread work spent to
    // say «still working», which is exactly backwards. The moving part is a class.
    vi.useFakeTimers();
    const { container } = render(<SearchProgressTrack />);
    const before = container.innerHTML;
    act(() => { vi.advanceTimersByTime(5000); });
    expect(container.innerHTML, 'no re-render is scheduled').toBe(before);
    vi.useRealTimers();
    expect(container.querySelector('.search-progress-track-fill')).toBeTruthy();
  });

  it('uses only design tokens — no literal colours', () => {
    const { container } = render(<SearchProgressTrack />);
    const html = container.innerHTML;
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(html).not.toMatch(/\brgba?\(/);
    expect(html).toMatch(/var\(--/);
  });
});

describe('U6-C · global search — only while loading', () => {
  const renderKind = (statusKind, props = {}) => render(
    <SearchStatusContent statusKind={statusKind} onCancel={() => {}} onResume={() => {}} {...props} />,
  );

  it('loading shows the track, and keeps the wording and the cancel action', () => {
    renderKind('loading');
    expect(screen.getByTestId(TRACK)).toBeTruthy();
    expect(screen.getByTestId('search-cancel-action')).toBeTruthy();
  });

  for (const [kind, props] of [
    ['cancelled', {}],
    ['blocked', { blockingText: 'bad query' }],
    ['incomplete', { incompleteText: 'the DNA check did not run' }],
    ['requires-alignment', { maxApproxLength: 100 }],
    ['empty', {}],
    ['none', {}],
  ]) {
    it(`${kind} shows NO track — a stripe here would claim a search that has finished`, () => {
      renderKind(kind, props);
      expect(screen.queryByTestId(TRACK)).toBeNull();
    });
  }
});

describe('U6-C · Ctrl+F popover — only while pending', () => {
  function makeFactory() {
    const workers = [];
    const factory = () => {
      const w = {
        onmessage: null, onerror: null, onmessageerror: null, posted: [], terminated: false,
        postMessage(m) { w.posted.push(m); },
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
  const live = () => factory.workers[factory.workers.length - 1];
  const settle = () => { act(() => { vi.advanceTimersByTime(300); }); };
  const flush = async () => { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); };
  const type = (v) => act(() => { fireEvent.change(screen.getByTestId('sequence-search-input'), { target: { value: v } }); });

  beforeEach(() => {
    factory = makeFactory();
    useStore.setState((s) => { s.toasts = []; s.searchHits = { entryId: null, query: '', hits: [] }; });
  });
  afterEach(() => { vi.useRealTimers(); });

  it('pending shows the SAME component the global surface uses', async () => {
    vi.useFakeTimers();
    render(wrap(<SequenceSearchPopover open targetSequence={TARGET} onClose={() => {}} />));
    type('GGCCAATTCCGG');
    settle();
    await flush();
    // Still pending — the fake thread has not answered yet.
    expect(screen.getByTestId('sequence-search-checking')).toBeTruthy();
    expect(screen.getByTestId(TRACK)).toBeTruthy();
  });

  it('the track disappears the moment results arrive', async () => {
    vi.useFakeTimers();
    render(wrap(<SequenceSearchPopover open targetSequence={TARGET} onClose={() => {}} />));
    type('GGCCAATTCCGG');
    settle();
    await flush();
    expect(screen.getByTestId(TRACK)).toBeTruthy();
    act(() => { live().replyLast(); });
    await flush();
    expect(screen.queryByTestId('sequence-search-checking')).toBeNull();
    expect(screen.queryByTestId(TRACK), 'a stripe after the answer claims work that is over').toBeNull();
  });

  it('an honest empty shows no track', async () => {
    vi.useFakeTimers();
    render(wrap(<SequenceSearchPopover open targetSequence={TARGET} onClose={() => {}} />));
    type('TTTTTTTTTTTTTTTTTTTT');
    settle();
    await flush();
    act(() => { live().replyLast(); });
    await flush();
    expect(screen.queryByTestId(TRACK)).toBeNull();
  });

  for (const [name, value] of [['too short', 'ACGT'], ['degenerate alphabet', 'ACGTNCGT']]) {
    it(`a query rejected before any search (${name}) shows no track`, () => {
      render(wrap(<SequenceSearchPopover open targetSequence={TARGET} onClose={() => {}} />));
      type(value);
      expect(screen.queryByTestId(TRACK)).toBeNull();
    });
  }

  it('an empty query — the closed state of the panel — shows no track', () => {
    render(wrap(<SequenceSearchPopover open targetSequence={TARGET} onClose={() => {}} />));
    expect(screen.queryByTestId(TRACK)).toBeNull();
  });

  it('the pending line remains the only live region — the stripe adds none', async () => {
    vi.useFakeTimers();
    render(wrap(<SequenceSearchPopover open targetSequence={TARGET} onClose={() => {}} />));
    type('GGCCAATTCCGG');
    settle();
    await flush();
    // The popover renders through a portal, so the query has to be against the document rather than
    // the render container — otherwise this passes by finding nothing at all.
    const popover = screen.getByTestId('sequence-search-popover');
    const live = popover.querySelectorAll('[aria-live]');
    // Exactly the one that existed before this package: the «checking» line.
    expect(live).toHaveLength(1);
    expect(live[0].getAttribute('data-testid')).toBe('sequence-search-checking');
    expect(popover.querySelector('[aria-valuenow]')).toBeNull();
    expect(popover.querySelector('[role="progressbar"]')).toBeNull();
  });
});

describe('U6-C · one implementation, not two', () => {
  it('both surfaces render the same element with the same animation class', async () => {
    const globalRender = render(<SearchStatusContent statusKind="loading" onCancel={() => {}} />);
    const globalTrack = screen.getByTestId(TRACK);
    const globalClass = globalTrack.querySelector('.search-progress-track-fill');
    expect(globalClass, 'the global surface uses the shared class').toBeTruthy();
    cleanup();

    const { container } = render(<SearchProgressTrack />);
    const direct = container.querySelector('.search-progress-track-fill');
    expect(direct).toBeTruthy();
    // Same markup shape from both entry points — one component, one stylesheet rule.
    expect(direct.className).toBe(globalClass.className);
    globalRender.unmount?.();
  });

  it('the animation is declared ONCE in the stylesheet', async () => {
    const { readFileSync } = await import('node:fs');
    const css = readFileSync(new URL('../../../index.css', import.meta.url).pathname.replace(/^\//, ''), 'utf8');
    const keyframes = css.match(/@keyframes\s+search-progress-slide/g) || [];
    expect(keyframes, 'one keyframes block, so the two surfaces cannot drift').toHaveLength(1);
    // TWO rules for the class, and exactly two: the base animation and the reduced-motion override.
    // A third would mean somebody started a second stripe.
    const rules = css.match(/\.search-progress-track-fill\s*\{[^}]*\}/g) || [];
    expect(rules, 'base rule + reduced-motion override').toHaveLength(2);
    expect(rules[0], 'the base rule animates').toMatch(/animation:\s*search-progress-slide/);
    const reduced = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)', css.indexOf('search-progress-track-fill')));
    expect(reduced, 'reduced motion turns the animation off').toMatch(/search-progress-track-fill[\s\S]*animation:\s*none/);
  });

  it('no second implementation lives in either surface file', async () => {
    const { readFileSync } = await import('node:fs');
    const read = (rel) => readFileSync(new URL(rel, import.meta.url).pathname.replace(/^\//, ''), 'utf8');
    for (const rel of ['../../Library/SearchStatusContent.jsx', '../../SequenceSearchPopover.jsx']) {
      const src = read(rel);
      expect(src, `${rel} must not declare its own animation`).not.toMatch(/@keyframes|animation:/);
      expect(src, `${rel} renders the shared component`).toMatch(/SearchProgressTrack/);
    }
  });
});
