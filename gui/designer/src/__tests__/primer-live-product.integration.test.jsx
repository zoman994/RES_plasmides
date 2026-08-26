/**
 * primer-live-product — PRIMER-LIVE-1 roots 2 and 5, product level.
 *
 * Everything here runs through a real path. The hotkey goes through the real
 * registry and the real hook; the piece is authored through the SAME
 * PieceCreate → CREATE_PIECE → derived-reaction chain the canvas already owns;
 * and the round-trip uses the real `.bodge` writer and reader.
 *
 * What is being defended:
 *   * Ctrl+R makes the primer NOW — no wizard, no promotion step;
 *   * a primer remembers which molecule and which version it was made against;
 *   * two chosen landings produce a product through the existing piece path,
 *     never through a second parallel reaction model;
 *   * a reopened project can still say what the reaction was primed with,
 *     without reaching into the user's personal freezer inventory.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';

import { runHotkeyResolver, _clearHandlersForTests } from '../lib/hotkeys';
import { usePrimerHotkeys } from '../components/SequenceView/hooks/usePrimerHotkeys';
import {
  buildPrimerFromSelection, documentIdentityOf, selectedOccurrencesFor,
} from '../lib/primer-live-workflow';
import { resolvePcrProduct } from '../lib/pcr-amplicon';
import { flankedSpan } from '../components/SequenceView/lib/primer-flank';
import { buildPieceFromPcrProduct } from '../components/CanvasSkeleton/lib/piece-authoring';
import { applyAutoReactions } from '../components/CanvasSkeleton/lib/auto-reaction-builder';
import { skeletonReducer, buildInitialState } from '../components/CanvasSkeleton/store/skeleton-state';
import { executePCR } from '../components/CanvasSkeleton/canvas/operations/adapters/pcr';
import { primersForProject } from '../lib/project-bodge-state';
import { writePrimerPool, readPrimerPool } from '../lib/bodge-primers-json';
import { PRIMER_SCOPE_GLOBAL, PRIMER_SCOPE_PROJECT } from '../lib/primer-identity';

afterEach(() => { cleanup(); _clearHandlersForTests(); });

//        0         1         2         3
//        0123456789012345678901234567890123456789
const TPL = 'GGGGAAAACCTTTTGGGGAACCCCTTTTGGAATTCCGGAA';

const press = (key, { alt = false } = {}) => {
  const ev = {
    ctrlKey: true, altKey: alt, shiftKey: false, metaKey: false,
    key, code: `Key${key.toUpperCase()}`,
    target: document.body,
    defaultPrevented: false,
    preventDefault() { this.defaultPrevented = true; },
  };
  act(() => { runHotkeyResolver(ev); });
};

function HotkeyHost(props) {
  usePrimerHotkeys(props);
  return null;
}

describe('root 2 — the primer exists immediately', () => {
  it('Ctrl+R writes a forward primer straight from the selection', () => {
    const onWritePrimer = vi.fn();
    const requestWritePrimer = vi.fn();
    render(
      <HotkeyHost
        onWritePrimer={onWritePrimer}
        requestWritePrimer={requestWritePrimer}
        caretAnchor={4}
        caretPos={12}
      />,
    );
    press('r');
    expect(onWritePrimer).toHaveBeenCalledTimes(1);
    expect(onWritePrimer.mock.calls[0][0]).toMatchObject({
      direction: 'forward', start: 4, end: 12,
    });
    // No modal step: the hotkey must not route through the review dialog.
    expect(requestWritePrimer).not.toHaveBeenCalled();
  });

  it('Ctrl+Alt+R writes a reverse primer straight from the selection', () => {
    const onWritePrimer = vi.fn();
    render(
      <HotkeyHost
        onWritePrimer={onWritePrimer}
        requestWritePrimer={vi.fn()}
        caretAnchor={12}
        caretPos={4}
      />,
    );
    press('r', { alt: true });
    expect(onWritePrimer).toHaveBeenCalledTimes(1);
    expect(onWritePrimer.mock.calls[0][0]).toMatchObject({
      direction: 'reverse', start: 4, end: 12,
    });
  });

  it('does nothing without a selection', () => {
    const onWritePrimer = vi.fn();
    render(
      <HotkeyHost
        onWritePrimer={onWritePrimer}
        requestWritePrimer={vi.fn()}
        caretAnchor={7}
        caretPos={7}
      />,
    );
    press('r');
    expect(onWritePrimer).not.toHaveBeenCalled();
  });

  it('the written primer is anchored to this molecule and this version', () => {
    const rec = buildPrimerFromSelection({
      template: TPL, topology: 'circular', start: 4, end: 12,
      direction: 'forward', id: 'p-f', entryId: 'e1', documentHash: 'h1',
    });
    expect(rec.sites[0].target).toEqual({
      entryId: 'e1', resourceHash: 'h1', topology: 'circular',
    });
  });
});

describe('root 5 — two landings become a piece through the existing path', () => {
  const primersById = {
    f: {
      id: 'f', name: 'fwd', sequence: 'GAATTCAAAACCTT', bindingSequence: 'AAAACCTT',
      tail: 'GAATTC', direction: 'forward', scope: PRIMER_SCOPE_PROJECT,
    },
    r: {
      id: 'r', name: 'rev', sequence: 'TTCCAAAA', bindingSequence: 'TTCCAAAA',
      tail: '', direction: 'reverse', scope: PRIMER_SCOPE_PROJECT,
    },
  };
  const occurrences = [
    { key: 'f#1', primerId: 'f', start: 4, end: 12, strand: 1, evidence: 'source' },
    { key: 'r#1', primerId: 'r', start: 24, end: 32, strand: -1, evidence: 'source' },
  ];

  const container = { id: 'c1', name: 'pTest', sequence: TPL, circular: true };

  it('authors a PCR piece from the resolved product, not from an indexOf guess', () => {
    const resolved = resolvePcrProduct({
      template: TPL, topology: 'circular', occurrences, primersById,
    });
    expect(resolved.ok).toBe(true);

    const piece = buildPieceFromPcrProduct(container, resolved);
    expect(piece.origin).toBe('pcr-occurrences');
    expect(piece.acquisitionMethod).toBe('pcr');
    expect(piece.ranges[0]).toMatchObject({ sourceId: 'c1', start: 4, end: 32 });
    expect(piece.sourceIds).toEqual(['c1']);
    // The chosen landings travel with the piece so a later reader is not left
    // re-guessing which of several identical sites was meant.
    expect(piece.acquisitionParams.occurrenceKeys).toEqual(['f#1', 'r#1']);
    // The resolved product itself, so nothing downstream re-slices the template
    // and quietly drops the tail.
    expect(piece.acquisitionParams.productSequence)
      .toBe('GAATTCAAAACCTTTTGGGGAACCCCTTTTGGAA');
  });

  it('carries projected aligned-v1 indels through selection into PCR', () => {
    const template = 'AAAACCCCGGGGTTTTAAAACCCC';
    const records = [
      {
        id: 'fi', name: 'inserted-fwd', direction: 'forward', bindingModel: 'aligned-v1',
        tail: '', bindingSequence: 'CCCCAGGGG', sequence: 'CCCCAGGGG',
        sites: [{
          id: 'sf',
          target: { entryId: 'e-indel', resourceHash: 'h-indel', topology: 'linear' },
          location: { kind: 'single', segments: [{ start: 4, end: 12 }] },
          strand: 1, annealedSequence: 'CCCCGGGG', tail: '',
        }],
      },
      {
        id: 'rx', name: 'exact-rev', direction: 'reverse', bindingModel: 'aligned-v1',
        tail: '', bindingSequence: 'GGGGTTTT', sequence: 'GGGGTTTT',
        sites: [{
          id: 'sr',
          target: { entryId: 'e-indel', resourceHash: 'h-indel', topology: 'linear' },
          location: { kind: 'single', segments: [{ start: 16, end: 24 }] },
          strand: -1, annealedSequence: 'GGGGTTTT', tail: '',
        }],
      },
    ];
    const ctx = {
      template, topology: 'linear', entryId: 'e-indel', documentHash: 'h-indel',
    };
    const selected = selectedOccurrencesFor([
      { key: 'fi#sf' }, { key: 'rx#sr' },
    ], records, ctx);
    expect(selected[0].alignment).toMatchObject({ hasGap: true });

    const resolved = resolvePcrProduct({
      template, topology: 'linear', occurrences: selected,
      primersById: Object.fromEntries(records.map((record) => [record.id, record])),
    });
    expect(resolved.ok).toBe(true);
    expect(resolved.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'insertion', count: 1 }),
    ]));
  });

  it('is accepted by the REAL reducer and drives a real derived op', () => {
    const resolved = resolvePcrProduct({
      template: TPL, topology: 'circular', occurrences, primersById,
    });
    const st = {
      ...buildInitialState(),
      containers: [{ id: 'c1', name: 'pTest', sequence: TPL, annotations: [] }],
      zones: [{ id: 'zn-1', name: 'A' }],
    };
    const created = skeletonReducer(st, {
      type: 'CREATE_PIECE',
      piece: { ...buildPieceFromPcrProduct(container, resolved), zoneId: 'zn-1' },
    });
    expect(created.pieces).toHaveLength(1);
    const withOps = applyAutoReactions(created);
    const op = withOps.operations.find(
      (o) => o.id === withOps.pieces[0].derivedReactionId,
    );
    expect(op.kind).toBe('pcr');
    const out = executePCR({ ...op, inputPieces: [] }, { containers: { c1: container } });
    expect(out.error).toBeUndefined();
    expect(out.outputs[0].sequence).toBe(resolved.product.sequence);
  });

  it('carries a PORTABLE primer snapshot, not a bare pool id', () => {
    const resolved = resolvePcrProduct({
      template: TPL, topology: 'circular', occurrences, primersById,
    });
    const piece = buildPieceFromPcrProduct(container, resolved);
    const snap = piece.acquisitionParams.primerSnapshots;
    expect(snap.forward).toMatchObject({
      id: 'f', sequence: 'GAATTCAAAACCTT', bindingSequence: 'AAAACCTT', tail: 'GAATTC',
    });
    expect(snap.reverse).toMatchObject({ id: 'r', sequence: 'TTCCAAAA' });
    // A snapshot is immutable evidence — mutating the pool afterwards must not
    // rewrite what the reaction was primed with.
    primersById.f.sequence = 'MUTATED';
    expect(snap.forward.sequence).toBe('GAATTCAAAACCTT');
    primersById.f.sequence = 'GAATTCAAAACCTT';
  });

  it('the piece drives the EXISTING derived-reaction builder', () => {
    const resolved = resolvePcrProduct({
      template: TPL, topology: 'circular', occurrences, primersById,
    });
    const piece = { id: 'pc-1', zoneId: 'z1', ...buildPieceFromPcrProduct(container, resolved) };
    const next = applyAutoReactions({
      pieces: [piece], operations: [], positions: {}, containers: [container],
    });
    const op = next.operations.find((o) => o.id === next.pieces[0].derivedReactionId);
    expect(op).toBeTruthy();
    expect(op.kind).toBe('pcr');
    expect(op.params.templateId).toBe('c1');
    expect(op.params.range).toEqual({ start: 4, end: 32 });
  });

  it('the reaction carries the snapshots, and executing it rebuilds the SAME product', () => {
    const resolved = resolvePcrProduct({
      template: TPL, topology: 'circular', occurrences, primersById,
    });
    const piece = { id: 'pc-2', zoneId: 'z1', ...buildPieceFromPcrProduct(container, resolved) };
    const next = applyAutoReactions({
      pieces: [piece], operations: [], positions: {}, containers: [container],
    });
    const op = next.operations.find((o) => o.id === next.pieces[0].derivedReactionId);
    expect(op.params.occurrenceKeys).toEqual(['f#1', 'r#1']);
    expect(op.params.primerSnapshots.forward.sequence).toBe('GAATTCAAAACCTT');

    // Execution must not re-locate anything: the amplicon the biolog approved
    // in the preview is the amplicon that comes out.
    const out = executePCR(
      { ...op, inputPieces: [] },
      { containers: { c1: container } },
    );
    expect(out.error).toBeUndefined();
    expect(out.outputs[0].sequence).toBe(resolved.product.sequence);
  });

  it('supports an origin-wrapping product without inventing a new operation kind', () => {
    const wrapPrimers = {
      f: { id: 'wf', name: 'wf', sequence: 'AATTCCGG', bindingSequence: 'AATTCCGG', tail: '', direction: 'forward' },
      r: { id: 'wr', name: 'wr', sequence: 'AAAAGGTT', bindingSequence: 'AAAAGGTT', tail: '', direction: 'reverse' },
    };
    const resolved = resolvePcrProduct({
      template: TPL,
      topology: 'circular',
      occurrences: [
        { key: 'wf#1', primerId: 'f', start: 30, end: 38, strand: 1, evidence: 'source' },
        { key: 'wr#1', primerId: 'r', start: 6, end: 14, strand: -1, evidence: 'source' },
      ],
      primersById: wrapPrimers,
    });
    expect(resolved.ok).toBe(true);
    expect(resolved.product.wrapsOrigin).toBe(true);
    const piece = buildPieceFromPcrProduct(container, resolved);
    expect(piece.acquisitionMethod).toBe('pcr');
    // A ring cannot be one `start > end` range — the piece invariant forbids it.
    // The wrap is two real spans on the SAME source, and sourceIds stays parallel.
    expect(piece.ranges).toHaveLength(2);
    expect(piece.ranges[0]).toMatchObject({ sourceId: 'c1', start: 30, end: 40 });
    expect(piece.ranges[1]).toMatchObject({ sourceId: 'c1', start: 0, end: 14 });
    expect(piece.sourceIds).toEqual(['c1', 'c1']);

    const st = {
      ...buildInitialState(),
      containers: [{ id: 'c1', name: 'pTest', sequence: TPL, annotations: [] }],
      zones: [{ id: 'zn-1', name: 'A' }],
    };
    const created = skeletonReducer(st, {
      type: 'CREATE_PIECE', piece: { ...piece, zoneId: 'zn-1' },
    });
    expect(created.pieces).toHaveLength(1);
  });
});

describe('trust travels with the product, and fails closed', () => {
  const primersById = {
    f: { id: 'f', name: 'fwd', sequence: 'AAAACCTT', bindingSequence: 'AAAACCTT', tail: '', direction: 'forward' },
    r: { id: 'r', name: 'rev', sequence: 'TTCCAAAA', bindingSequence: 'TTCCAAAA', tail: '', direction: 'reverse' },
  };
  const occurrences = [
    { key: 'f#1', primerId: 'f', start: 4, end: 12, strand: 1, evidence: 'source' },
    { key: 'r#1', primerId: 'r', start: 24, end: 32, strand: -1, evidence: 'source' },
  ];
  const container = { id: 'c1', name: 'pTest', sequence: TPL, circular: true };

  it('fingerprints a document without storing its sequence', () => {
    const id = documentIdentityOf({ sequence: TPL, topology: 'circular' });
    expect(typeof id).toBe('string');
    expect(id.length).toBeLessThan(80);
    expect(id).not.toContain(TPL);
    // Deterministic for the same molecule…
    expect(documentIdentityOf({ sequence: TPL, topology: 'circular' })).toBe(id);
    // …and a different answer once the molecule is edited or re-topologised.
    expect(documentIdentityOf({ sequence: `${TPL}A`, topology: 'circular' })).not.toBe(id);
    expect(documentIdentityOf({ sequence: TPL, topology: 'linear' })).not.toBe(id);
  });

  it('prefers an existing resource hash when the host has one', () => {
    expect(documentIdentityOf({ sequence: TPL, topology: 'circular', resourceHash: 'rh-1' }))
      .toBe('rh-1');
  });

  it('carries the document identity into the product and the piece', () => {
    const documentIdentity = documentIdentityOf({ sequence: TPL, topology: 'circular' });
    const resolved = resolvePcrProduct({
      template: TPL, topology: 'circular', occurrences, primersById, documentIdentity,
    });
    expect(resolved.product.documentIdentity).toBe(documentIdentity);
    const piece = buildPieceFromPcrProduct(container, resolved);
    expect(piece.acquisitionParams.documentIdentity).toBe(documentIdentity);
  });

  it('refuses to execute against a molecule that is no longer the one resolved', () => {
    const resolved = resolvePcrProduct({
      template: TPL,
      topology: 'circular',
      occurrences,
      primersById,
      documentIdentity: documentIdentityOf({ sequence: TPL, topology: 'circular' }),
    });
    const piece = { id: 'pc-x', zoneId: 'z1', ...buildPieceFromPcrProduct(container, resolved) };
    const next = applyAutoReactions({
      pieces: [piece], operations: [], positions: {}, containers: [container],
    });
    const op = next.operations.find((o) => o.id === next.pieces[0].derivedReactionId);

    // The template has been edited since. Coordinates still "fit" — that is
    // exactly the trap: they would silently amplify a different molecule.
    const edited = { ...container, sequence: `A${TPL.slice(1)}` };
    const out = executePCR({ ...op, inputPieces: [] }, { containers: { c1: edited } });
    expect(out.error).toBeTruthy();
    expect(out.error).toMatch(/stale|устарел/i);
    expect(out.outputs).toBeUndefined();
  });

  it('still executes against the very molecule it was resolved on', () => {
    const resolved = resolvePcrProduct({
      template: TPL,
      topology: 'circular',
      occurrences,
      primersById,
      documentIdentity: documentIdentityOf({ sequence: TPL, topology: 'circular' }),
    });
    const piece = { id: 'pc-y', zoneId: 'z1', ...buildPieceFromPcrProduct(container, resolved) };
    const next = applyAutoReactions({
      pieces: [piece], operations: [], positions: {}, containers: [container],
    });
    const op = next.operations.find((o) => o.id === next.pieces[0].derivedReactionId);
    const out = executePCR({ ...op, inputPieces: [] }, { containers: { c1: container } });
    expect(out.error).toBeUndefined();
    expect(out.outputs[0].sequence).toBe(resolved.product.sequence);
  });
});

/**
 * PRIMER-LIVE-1 correction — the flank highlight on a ring.
 *
 * `min(start)..max(end)` is the WRONG arc whenever the pair brackets the
 * origin: it paints the entire rest of the plasmid — everything the product is
 * NOT — and leaves the actual amplicon unhighlighted.
 */
describe('circular flank overlay', () => {
  const hit = (start, end, direction) => ({ start, end, direction });

  it('keeps the linear two-argument answer exactly as it was', () => {
    expect(flankedSpan(hit(10, 30, 'forward'), hit(200, 224, 'reverse')))
      .toEqual({ start: 10, end: 224 });
  });

  it('walks forward across the origin instead of painting the complement', () => {
    // fwd at 30..38, rev at 6..14 on a 40 nt ring → the product runs 30→14.
    const span = flankedSpan(
      hit(30, 38, 'forward'),
      hit(6, 14, 'reverse'),
      { circular: true, seqLength: 40 },
    );
    expect(span.wrapsOrigin).toBe(true);
    expect(span.segments).toEqual([{ start: 30, end: 40 }, { start: 0, end: 14 }]);
    // NOT the naive bracket, which would be the 8..38 complement.
    expect(span.start).toBe(30);
    expect(span.end).toBe(14);
  });

  it('does not invent a wrap when the pair does not cross the origin', () => {
    const span = flankedSpan(
      hit(4, 12, 'forward'),
      hit(24, 32, 'reverse'),
      { circular: true, seqLength: 40 },
    );
    expect(span.wrapsOrigin).toBe(false);
    expect(span.segments).toEqual([{ start: 4, end: 32 }]);
  });
});

describe('root 5 — Save/Open keeps the reaction primers, not the freezer', () => {
  it('exports the project records and leaves personal inventory behind', () => {
    const primersById = {
      p1: {
        id: 'p1', name: 'project fwd', sequence: 'GAATTCAAAACCTT',
        scope: PRIMER_SCOPE_PROJECT, projectId: 'proj-1', addedAt: '2026-01-01',
      },
      'global:g1': {
        id: 'g1', name: 'freezer tube', sequence: 'TTTTTTTTTTTT',
        scope: PRIMER_SCOPE_GLOBAL, projectId: null, status: 'received',
        addedAt: '2026-01-02',
      },
    };
    const out = primersForProject(primersById, 'proj-1');
    expect(out.map((p) => p.id)).toEqual(['p1']);
  });

  it('a reopened project still knows what the reaction was primed with', async () => {
    const snapshot = {
      id: 'f', name: 'fwd', sequence: 'GAATTCAAAACCTT', bindingSequence: 'AAAACCTT',
      tail: 'GAATTC', direction: 'forward', scope: PRIMER_SCOPE_PROJECT,
      projectId: 'proj-1', addedAt: '2026-01-01',
    };
    const json = writePrimerPool([snapshot], 'proj-1');
    const { pool } = await readPrimerPool(json, []);
    expect(pool).toHaveLength(1);
    expect(pool[0]).toMatchObject({
      id: 'f', sequence: 'GAATTCAAAACCTT', bindingSequence: 'AAAACCTT', tail: 'GAATTC',
    });
    // A donor file must not be able to claim a tube exists in this lab.
    expect(pool[0].scope).toBe(PRIMER_SCOPE_PROJECT);
  });

  it('refuses to import a donor record as personal freezer inventory', async () => {
    const donor = {
      id: 'x', name: 'claims to be stock', sequence: 'ACGTACGTAC',
      scope: PRIMER_SCOPE_GLOBAL, status: 'received', addedAt: '2026-01-01',
    };
    const json = writePrimerPool([donor], 'proj-1');
    const { pool } = await readPrimerPool(json, []);
    expect(pool[0].scope).toBe(PRIMER_SCOPE_PROJECT);
  });
});

beforeEach(() => { _clearHandlersForTests(); });
