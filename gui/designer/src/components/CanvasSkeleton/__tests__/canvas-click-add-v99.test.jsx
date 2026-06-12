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
  // RETIRED by M-WORKSPACE — the canvas-top LibrarySearchBar lived in
  // CanvasLayoutView, which is no longer mounted in the project view. Adding a
  // library molecule to an assembly now goes through the Sequence view tab's
  // inline picker (AssemblyShellBody empty-state / «+ Сегмент»). A workspace-
  // level quick-add search is a possible later re-add.
  it.skip('no focused zone → creates a zone + opens the editor — retired', () => {});
});
