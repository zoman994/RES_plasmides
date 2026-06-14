/**
 * editor-bar-caret-a3.test.jsx — audit A3. LinearFeatureBar's settle/scrub
 * handlers in ContainerEditorSkeleton called setCursorPos/setCursorAnchor/
 * setCursorSelectionMode, which never existed (the selection hook exposes
 * setCaretPos/setCaretAnchor/setSelectionMode) → a ReferenceError on ANY strip
 * click. jsdom returns a 0-width rect (pos → NaN → guarded), so we mock the
 * strip svg's rect to drive a finite settle and assert it no longer throws.
 */
import 'fake-indexeddb/auto';
import {
  describe, it, expect, afterEach, beforeEach, vi,
} from 'vitest';
import {
  render, screen, cleanup, fireEvent, act,
} from '@testing-library/react';
import { useEffect } from 'react';
import {
  SkeletonProvider, useSkeletonActions,
} from '../store/skeleton-context';
import EditorWindowShell from '../editor/EditorWindowShell';
import { bootstrapStore } from '../../../store';

afterEach(cleanup);
beforeEach(() => { try { bootstrapStore(); } catch { /* idempotent */ } });

const FILL = {
  id: 'lib-a3', kind: 'container', name: 'pUC19',
  payload: {
    sequence: 'ATGCATGCATGCATGCATGCATGCATGCATGCATGCATGCATGC',
    length: 44, topology: 'circular',
    annotations: [{ id: 'a', name: 'f', type: 'CDS', start: 0, end: 12, strand: 1 }],
    ends: null,
  },
};

function HOpen({ id }) {
  const a = useSkeletonActions();
  useEffect(() => { a.fillPlaceholder(id, FILL); a.openEditorViewOnly(id); }, [a, id]);
  return null;
}

describe('ContainerEditorSkeleton — LinearFeatureBar caret (A3)', () => {
  it('clicking the feature strip settles the caret without throwing', () => {
    render(
      <SkeletonProvider>
        <HOpen id="c-placeholder-1" />
        <EditorWindowShell />
      </SkeletonProvider>,
    );
    const strip = screen.getByTestId('skeleton-editor-feature-strip');
    const svg = strip.tagName.toLowerCase() === 'svg' ? strip : strip.querySelector('svg');
    expect(svg).toBeTruthy();
    // Finite rect so computePosFromClientX yields a real position.
    svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 440, height: 40, right: 440, bottom: 40 });
    // React 19 routes event-handler errors to console.error rather than
    // rethrowing through fireEvent — capture both channels.
    const errs = [];
    const spy = vi.spyOn(console, 'error').mockImplementation((...a) => errs.push(a.map(String).join(' ')));
    try {
      act(() => {
        fireEvent.pointerDown(svg, { clientX: 220, button: 0, pointerId: 1 });
        fireEvent.pointerUp(svg, { clientX: 220, pointerId: 1 });
      });
    } catch (e) { errs.push(String(e)); } finally { spy.mockRestore(); }
    expect(errs.join('\n')).not.toMatch(/setCursor|is not defined|ReferenceError/);
  });
});
