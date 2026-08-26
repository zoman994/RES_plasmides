/**
 * BG-023 — «>100 nt → alignment» must be a ROUTE, not a drawn-on door.
 *
 * §4.2.0 makes a long query a route rather than a miss, and the notice already said so. But the
 * action next to it renders only `if (onOpenAlignment)`, and the sole mounting parent never passed
 * that prop — so a biologist who pasted their 400 nt insert got the sentence and a dead end.
 *
 * That is a WIRING defect, and wiring is what this file pins. It deliberately does NOT drive the
 * search engine: mocking the bar lets the exact broken link — parent supplies a working handler —
 * be tested directly, in milliseconds, without a 400 nt pass through the worker.
 *
 * The biology being asserted: the pasted query lands in the alignment workspace as an INPUT, and
 * the workspace opens. Non-destructively — if the user already had a reference loaded, the query
 * joins it as a read (which is exactly «where does my insert sit in this plasmid»), instead of
 * wiping their session.
 */
import 'fake-indexeddb/auto';
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { useStore } from '../../../store';
import { t, tf } from '../../../i18n';
import { MAX_ALIGN_INPUTS } from '../../../store/alignmentSlice';

// Capture what LibraryWorkspace hands the search bar, without rendering the real one.
// `vi.hoisted` because the mock factory is lifted above the imports — a plain `const` declared
// here would still be in its temporal dead zone when the factory is registered.
const barProps = vi.hoisted(() => ({ current: null }));
vi.mock('../LibrarySmartSearchBar', () => ({
  default: (props) => { barProps.current = props; return null; },
}));

import LibraryWorkspace from '../LibraryWorkspace';

const QUERY = 'ACGT'.repeat(103); // 412 nt — over MAX_APPROX_QUERY_LEN

beforeEach(() => {
  barProps.current = null;
  useStore.setState((s) => {
    s.libraryEntries = {};
    s.projects = {};
    s.currentProjectId = null;
    s.align = { ...s.align, inputs: [], refId: null, readIds: [] };
    s.toasts = []; // the route's feedback is asserted below; a leaked toast would fake it
  });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('BG-023 — the alignment route reaches the alignment workspace', () => {
  it('the parent supplies the handler at all (this is what was missing)', () => {
    render(<LibraryWorkspace />);
    expect(typeof barProps.current?.onOpenAlignment).toBe('function');
  });

  it('the pasted query becomes an alignment input and the workspace opens', () => {
    render(<LibraryWorkspace />);
    act(() => { barProps.current.onOpenAlignment(QUERY); });

    const { align, workspace } = useStore.getState();
    expect(align.inputs).toHaveLength(1);
    expect(align.inputs[0].sequence).toBe(QUERY);
    expect(workspace.active).toBe('align');
  });

  it('the input is named so its origin is obvious, and carries its length', () => {
    render(<LibraryWorkspace />);
    act(() => { barProps.current.onOpenAlignment(QUERY); });
    const [input] = useStore.getState().align.inputs;
    expect(input.name).toBe(tf('search.requiresAlignment.inputName', { len: 412 }));
    expect(input.name).toMatch(/412/); // the length is what tells two pasted sequences apart
  });

  it('does NOT wipe an alignment already in progress — the query joins it', () => {
    render(<LibraryWorkspace />);
    act(() => {
      useStore.getState().addAlignInput({ name: 'pUC19', sequence: 'GGGGCCCCAAAATTTT' });
    });
    act(() => { barProps.current.onOpenAlignment(QUERY); });

    const { align } = useStore.getState();
    expect(align.inputs).toHaveLength(2);
    // The molecule already loaded stays the reference; the pasted insert becomes the read —
    // which is the biologically right direction for «where does my insert sit in this plasmid».
    expect(align.inputs[0].name).toBe('pUC19');
    expect(align.readIds).toContain(align.inputs[1].id);
  });

  it('an empty or blank query opens nothing at all, and does not navigate', () => {
    render(<LibraryWorkspace />);
    // Park the user somewhere that is NOT align, with a real history and context behind them.
    // Without a concrete starting workspace «did not navigate» is unprovable: landing on align
    // from align looks identical to never moving.
    act(() => {
      useStore.setState((s) => { s.workspace = { active: 'startup', history: [], context: {} }; });
      useStore.getState().setActiveWorkspace('library', { projectId: 'p1' });
    });
    const before = structuredClone(useStore.getState().workspace);
    expect(before).toStrictEqual({ active: 'library', history: ['startup'], context: { projectId: 'p1' } });

    act(() => { barProps.current.onOpenAlignment('   '); });

    expect(useStore.getState().align.inputs).toHaveLength(0);
    expect(useStore.getState().toasts).toEqual([]); // a no-op has nothing to report
    // All three fields intact. setActiveWorkspace('align') would have moved every one of them:
    // active → 'align', history → [...,'library'], context → {}.
    expect(structuredClone(useStore.getState().workspace)).toStrictEqual(before);
  });

  // BG-024 — the route can also fail to add, and silence was the bug: the workspace opened,
  // the pasted query was nowhere in it, and nothing said why. These pin the two ways a
  // legitimate add gets refused, both through the real store and the real toast queue.
  it('a re-pasted query adds nothing, says so, and still opens alignment', () => {
    render(<LibraryWorkspace />);
    act(() => { barProps.current.onOpenAlignment(QUERY); });
    act(() => { barProps.current.onOpenAlignment(QUERY); });

    const { align, toasts, workspace } = useStore.getState();
    expect(align.inputs).toHaveLength(1); // the duplicate did not land
    expect(workspace.active).toBe('align'); // but the user still gets to the sequence
    expect(toasts).toHaveLength(1);
    expect(toasts[0].kind).toBe('info'); // already there is not a failure
    expect(toasts[0].msg).toBe(t('search.requiresAlignment.duplicate'));
  });

  it('a full alignment warns with the real limit instead of dropping the query silently', () => {
    render(<LibraryWorkspace />);
    act(() => {
      for (let i = 0; i < MAX_ALIGN_INPUTS; i += 1) {
        useStore.getState().addAlignInput({ name: `s${i}`, sequence: `ACGTACGT${i}` });
      }
    });
    act(() => { barProps.current.onOpenAlignment(QUERY); });

    const { align, toasts, workspace } = useStore.getState();
    expect(align.inputs).toHaveLength(MAX_ALIGN_INPUTS); // nothing was evicted to make room
    expect(workspace.active).toBe('align');
    expect(toasts).toHaveLength(1);
    expect(toasts[0].kind).toBe('warning'); // the query is lost unless the user acts
    expect(toasts[0].msg).toBe(tf('search.requiresAlignment.capacity', { max: MAX_ALIGN_INPUTS }));
    expect(toasts[0].msg).toContain(String(MAX_ALIGN_INPUTS)); // the real cap, not a literal
  });

  it('a successful add stays quiet — the input itself is the feedback', () => {
    render(<LibraryWorkspace />);
    act(() => { barProps.current.onOpenAlignment(QUERY); });
    expect(useStore.getState().align.inputs).toHaveLength(1);
    expect(useStore.getState().toasts).toEqual([]);
  });
});
