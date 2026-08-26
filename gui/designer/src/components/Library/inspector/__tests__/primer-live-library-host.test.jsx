/**
 * primer-live-library-host — PRIMER-LIVE-1 correction, host wiring.
 *
 * The pure layers were right and the product was still wrong, because nothing
 * in the real UI was connected to them. This file holds the host to its side
 * of the contract:
 *
 *   * editing a primer EDITS IT — same record, same anchor, same tube;
 *   * a primer written in a container belongs to the open PROJECT;
 *   * «I have this one» produces an actual physical record;
 *   * reuse points at the existing tube instead of cloning it;
 *   * the main Library inspector actually hands the lab data to the viewer.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, render, screen, cleanup } from '@testing-library/react';

// The viewer is stood in for so this file tests the HOST's wiring, never the
// shared viewer's internals.
vi.mock('../tabs/SequenceTab', () => ({
  default: (props) => (
    <div
      data-testid="mock-sequence-tab"
      data-lab-count={String((props.labPrimers || []).length)}
      data-has-reuse={String(typeof props.onReuseLabPrimer === 'function')}
      data-has-pcr={String(typeof props.onCreatePcrProduct === 'function')}
      data-entry-id={String(props.entryId ?? '')}
      data-document-hash={String(props.documentHash ?? '')}
    />
  ),
}));

import { useStore } from '../../../../store';
import { resetDBForTests, listPrimers } from '../../../../db/dexie-schema';
import { useEntryPrimers } from '../hooks/useEntryPrimers';
import { PRIMER_SCOPE_GLOBAL, PRIMER_SCOPE_PROJECT } from '../../../../lib/primer-identity';

const TPL = 'GGGGAAAACCTTTTGGGGAACCCCTTTTGGAATTCCGGAA';

async function freshDB() {
  const db = resetDBForTests(`bodgegene-test-${Math.random().toString(36).slice(2)}`);
  await db.delete();
  await db.open();
  return db;
}

beforeEach(async () => {
  await freshDB();
  useStore.setState((state) => {
    state.primersById = {};
    // Already hydrated: that is the state the pool is in whenever a biolog is
    // actually looking at a sequence, and it keeps the hook's one-shot
    // hydrate from racing the writes under test.
    state._primersHydrated = true;
  });
});
afterEach(cleanup);

const item = { id: 'entry-1', name: 'pTest', sequence: TPL };

describe('a container primer belongs to the open project', () => {
  it('Ctrl+R in a container writes the CURRENT project, not null', async () => {
    const { result } = renderHook(() => useEntryPrimers(item, { projectId: 'proj-1' }));
    await act(async () => {
      await result.current.onWritePrimer({
        direction: 'forward', start: 4, end: 12,
        sequence: 'AAAACCTT', binding: 'AAAACCTT', tail: '',
      });
    });
    const rows = Object.values(useStore.getState().primersById);
    expect(rows).toHaveLength(1);
    expect(rows[0].projectId).toBe('proj-1');
    expect(rows[0].scope).toBe(PRIMER_SCOPE_PROJECT);
    // …and it is durable, so a Save/Open of the project can carry it.
    expect((await listPrimers())[0].projectId).toBe('proj-1');
  });
});

describe('E / double-click EDITS the primer, it does not clone it', () => {
  it('keeps the id, the anchor, the modifications and the reuse reference', async () => {
    const { result } = renderHook(() => useEntryPrimers(item, { projectId: 'proj-1' }));
    await act(async () => {
      await useStore.getState().addPrimerToPool({
        primer: {
          id: 'p-edit',
          name: 'original',
          sequence: 'GAATTCAAAACCTT',
          bindingSequence: 'AAAACCTT',
          tail: 'GAATTC',
          direction: 'forward',
          modifications: ['5-phos'],
          schemaVersion: 2,
          sites: [{
            id: 'p-edit-s0',
            target: { entryId: 'entry-1', resourceHash: 'h1', topology: 'circular' },
            location: { kind: 'single', segments: [{ start: 4, end: 12 }] },
            strand: 1,
            annealedSequence: 'AAAACCTT',
            tail: 'GAATTC',
          }],
          origin: { kind: 'selection', entryId: 'entry-1', reusesPrimerId: 'global:stock-1' },
        },
        projectId: 'proj-1',
        status: 'designed',
      });
    });

    await act(async () => {
      // The rename the biolog typed in the edit dialog — nothing else changed.
      await result.current.onWritePrimer({
        primerId: 'p-edit',
        name: 'renamed',
        direction: 'forward',
        sequence: 'GAATTCAAAACCTT',
        binding: 'AAAACCTT',
        tail: 'GAATTC',
      });
    });

    const rows = Object.values(useStore.getState().primersById);
    expect(rows).toHaveLength(1); // NOT a second record under a fresh uuid
    const rec = rows[0];
    expect(rec.id).toBe('p-edit');
    expect(rec.name).toBe('renamed');
    expect(rec.tail).toBe('GAATTC');
    expect(rec.bindingSequence).toBe('AAAACCTT');
    expect(rec.modifications).toEqual(['5-PHOS']);
    expect(rec.sites).toHaveLength(1);
    expect(rec.sites[0].target).toEqual({
      entryId: 'entry-1', resourceHash: 'h1', topology: 'circular',
    });
    expect(rec.origin.reusesPrimerId).toBe('global:stock-1');
  });

  it('a deliberate mismatch keeps its anchor instead of being re-derived away', async () => {
    const { result } = renderHook(() => useEntryPrimers(item, { projectId: 'proj-1' }));
    await act(async () => {
      await useStore.getState().addPrimerToPool({
        primer: {
          id: 'p-mm',
          name: 'mut',
          sequence: 'AATACCTT',
          bindingSequence: 'AATACCTT',
          tail: '',
          schemaVersion: 2,
          sites: [{
            id: 'p-mm-s0',
            target: { entryId: 'entry-1', resourceHash: 'h1', topology: 'circular' },
            location: { kind: 'single', segments: [{ start: 4, end: 12 }] },
            strand: 1,
            annealedSequence: 'AATACCTT',
            tail: '',
          }],
          origin: { kind: 'selection', entryId: 'entry-1' },
        },
        projectId: 'proj-1',
      });
    });
    await act(async () => {
      await result.current.onWritePrimer({
        primerId: 'p-mm', name: 'mut2', direction: 'forward',
        sequence: 'AATACCTT', binding: 'AATACCTT', tail: '',
      });
    });
    const rec = useStore.getState().primersById['p-mm'];
    // The oligo still disagrees with the template on purpose, and still says
    // exactly where it binds.
    expect(rec.sequence).toBe('AATACCTT');
    expect(rec.sites[0].location.segments).toEqual([{ start: 4, end: 12 }]);
  });
});

describe('«I have this one» and reuse', () => {
  it('marking received creates a real freezer record and keeps the project usage', async () => {
    const { result } = renderHook(() => useEntryPrimers(item, { projectId: 'proj-1' }));
    await act(async () => {
      await useStore.getState().addPrimerToPool({
        primer: { id: 'p1', name: 'fwd', sequence: 'GAATTCAAAACCTT' },
        projectId: 'proj-1',
        status: 'designed',
      });
    });
    await act(async () => { await result.current.onMarkReceived('p1'); });

    const stock = Object.values(useStore.getState().primersById)
      .filter((r) => r.scope === PRIMER_SCOPE_GLOBAL);
    expect(stock).toHaveLength(1);
    expect(stock[0].status).toBe('received');
    expect(stock[0].projectId).toBeNull();
    expect(useStore.getState().primersById.p1.projectId).toBe('proj-1');
  });

  it('reuse REFERENCES the freezer tube instead of cloning it', async () => {
    const { result } = renderHook(() => useEntryPrimers(item, { projectId: 'proj-1' }));
    await act(async () => {
      await useStore.getState().addPrimerToPool({
        primer: { id: 'tube', name: 'M13-fwd', sequence: 'AAAACCTT', bindingSequence: 'AAAACCTT', scope: PRIMER_SCOPE_GLOBAL },
        status: 'received',
      });
    });
    const tube = useStore.getState().primersById['global:tube'];

    await act(async () => {
      await result.current.onReuseLabPrimer(tube, {
        orientation: 'forward',
        selection: { start: 4, end: 12 },
        documentHash: 'h1',
      });
    });

    const stock = Object.values(useStore.getState().primersById)
      .filter((r) => r.scope === PRIMER_SCOPE_GLOBAL);
    // The freezer is untouched — no second tube was invented.
    expect(stock).toHaveLength(1);

    const usage = Object.values(useStore.getState().primersById)
      .find((r) => r.scope === PRIMER_SCOPE_PROJECT);
    expect(usage).toBeDefined();
    expect(usage.projectId).toBe('proj-1');
    expect(usage.sequence).toBe('AAAACCTT');
    // It points AT the tube rather than pretending to be one.
    expect(usage.origin.reusesPrimerId).toBe('global:tube');
    expect(usage.status).not.toBe('received');
    // And it is anchored to the molecule the user was looking at.
    expect(usage.sites[0].location.segments).toEqual([{ start: 4, end: 12 }]);
  });
});

describe('the main Library inspector hands the lab data to the viewer', () => {
  it('passes labPrimers and the reuse callback into the sequence UI', async () => {
    await act(async () => {
      await useStore.getState().addPrimerToPool({
        primer: { id: 'tube', name: 'M13', sequence: 'AAAACCTT', scope: PRIMER_SCOPE_GLOBAL },
        status: 'received',
      });
    });
    const { default: SingleInspector } = await import('../LibrarySingleInspector');
    render(
      <SingleInspector
        item={{ id: 'entry-1', name: 'pTest', kind: 'container', sequence: TPL, payload: { sequence: TPL, topology: 'circular' } }}
        activeTab="sequence"
      />,
    );
    const tab = screen.getAllByTestId('mock-sequence-tab')[0];
    expect(Number(tab.getAttribute('data-lab-count'))).toBeGreaterThan(0);
    expect(tab.getAttribute('data-has-reuse')).toBe('true');
    expect(tab.getAttribute('data-entry-id')).toBe('entry-1');
  });
});
