/**
 * Node B (DEC-V0.8.3-CANVAS-FINAL-MODEL) — clicking a library entry in the
 * canvas search bar routes INTO an assembly zone, it no longer drops a loose
 * container onto the canvas.
 *
 * This supersedes the V99 behaviour (click → loose container, no editor):
 * the loose-container paradigm is retired (§6). With no focused zone, a click
 * creates a fresh assembly zone and opens its editor; loading the molecule AS
 * a source-piece (range picker) is deferred to SPEC_ASSEMBLY_WORKFLOW_UX K5.
 */
import 'fake-indexeddb/auto';
import {
  describe, it, expect, afterEach, beforeEach,
} from 'vitest';
import {
  render, screen, cleanup, fireEvent, act,
} from '@testing-library/react';
import CanvasSkeleton from '../index';
import { useStore, bootstrapStore } from '../../../store';

const mkEntry = (id, name, seq) => ({
  id,
  kind: 'container',
  name,
  projectId: null, // → «Коллекция» section, expanded by default
  payload: {
    sequence: seq, length: seq.length, topology: 'circular', annotations: [], ends: null,
  },
});

afterEach(() => {
  cleanup();
  try { useStore.setState({ libraryEntries: {} }); } catch { /* */ }
});
beforeEach(() => {
  try { bootstrapStore(); } catch { /* idempotent */ }
});

describe('Node B §6 — library-entry click routes into an assembly zone', () => {
  it('no focused zone → creates a zone + opens the editor; NO loose container node', async () => {
    const e = mkEntry('lib-nb', 'nbplasmid', 'ATGCATGCATGCATGC');
    act(() => {
      useStore.setState((s) => ({
        ...s, libraryEntries: { ...(s.libraryEntries || {}), [e.id]: e },
      }));
    });
    render(<CanvasSkeleton />);
    fireEvent.focus(screen.getByTestId('canvas-library-search-bar-input'));
    fireEvent.click(screen.getByTestId('canvas-library-search-bar-section-loose-item-lib-nb'));
    await act(async () => { await new Promise((r) => { setTimeout(r, 0); }); });

    // §5 — the loose-container node paradigm is gone: no block-wrap on canvas.
    expect(screen.queryByTestId(/^skeleton-block-wrap-/)).toBeNull();
    // §6 — clicking a molecule opened the assembly editor (zone created).
    expect(screen.queryByTestId('editor-window-shell')).toBeTruthy();
  });
});
