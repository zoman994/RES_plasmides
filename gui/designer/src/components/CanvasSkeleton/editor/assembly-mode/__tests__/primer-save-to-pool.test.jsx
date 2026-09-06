/**
 * primer-save-to-pool.test.jsx — PRIMER-LIVE-1: assembly primers are REAL.
 *
 * The old contract asked the biolog to promote each assembly draft into the
 * pool by hand («＋ в пул»). That is the promotion step the approved contract
 * removes: a calculated or manually written assembly primer exists in the
 * project the moment it exists at all, or the biolog is doing bookkeeping the
 * program should have done. So:
 *
 *   * every draft primer is synced to the canonical project pool, idempotently
 *     — recomputing the assembly must not spawn a second copy of each primer;
 *   * there is NO manual promotion button left to click;
 *   * «в наличии» means a TUBE. It counts only `global` + `received` lab stock,
 *     never an arbitrary project-pool row — telling a biolog they already have
 *     an oligo they merely once designed is how an experiment stalls at the
 *     bench.
 */
import 'fake-indexeddb/auto';
import React from 'react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  render, screen, cleanup, waitFor, renderHook, act,
} from '@testing-library/react';
import { PrimerRow } from '../AssemblyPrimersPanel';
import { useAssemblyPrimerWriting } from '../useAssemblyPrimerWriting';
import { useStore } from '../../../../../store';
import {
  getPrimer, listPrimers, resetDBForTests,
} from '../../../../../db/dexie-schema';
import { PRIMER_SCOPE_GLOBAL } from '../../../../../lib/primer-identity';

const actions = { updateAssemblyPrimer: () => {}, removeAssemblyPrimer: () => {} };
const draft = {
  id: 'p1', draftId: 'd1', name: 'asm-fwd', label: 'asm-fwd', direction: 'forward',
  sequence: 'ACGTACGTACGTACGTACGT', bindingSequence: 'ACGTACGTACGTACGTACGT',
  tail: '', tm: 60, gc: 50, autoMode: 'auto',
};
const row = (p = draft) => render(<PrimerRow p={p} actions={actions} draftId="d" onEdit={() => {}} />);

async function freshDB() {
  const name = `bodgegene-sp-${Math.random().toString(36).slice(2)}`;
  const db = resetDBForTests(name);
  await db.delete();
  await db.open();
}

beforeEach(async () => {
  await freshDB();
  useStore.setState((s) => {
    s.primersById = {};
    s.toasts = [];
    s.currentProjectId = 'proj-1';
    s._primersHydrated = true;
  });
});
afterEach(cleanup);

describe('no manual promotion step survives', () => {
  it('the row offers no «＋ в пул» button at all', () => {
    row();
    expect(screen.queryByTestId('assembly-primer-save-pool-p1')).toBeNull();
  });
});

describe('«в наличии» means a physical tube', () => {
  it('stays silent for a project-pool row that is merely a past design', async () => {
    await act(async () => {
      await useStore.getState().addPrimerToPool({
        primer: {
          id: 'pool1', name: 'old design', direction: 'forward',
          sequence: 'ACGTACGTACGTACGTACGT', bindingSequence: 'ACGTACGTACGTACGTACGT',
          tail: '', tm: 61,
        },
        projectId: 'proj-1',
        status: 'designed',
      });
    });
    row();
    expect(screen.queryByTestId('assembly-primer-reuse-p1')).toBeNull();
  });

  it('stays silent for an ORDERED tube that has not arrived', async () => {
    await act(async () => {
      await useStore.getState().addPrimerToPool({
        primer: {
          id: 'onorder', name: 'on order', direction: 'forward',
          sequence: 'ACGTACGTACGTACGTACGT', bindingSequence: 'ACGTACGTACGTACGTACGT',
          tail: '', tm: 61, scope: PRIMER_SCOPE_GLOBAL,
        },
        status: 'ordered',
      });
    });
    row();
    expect(screen.queryByTestId('assembly-primer-reuse-p1')).toBeNull();
  });

  it('shows «в наличии» for a received freezer tube', async () => {
    await act(async () => {
      await useStore.getState().addPrimerToPool({
        primer: {
          id: 'tube', name: 'real tube', direction: 'forward',
          sequence: 'ACGTACGTACGTACGTACGT', bindingSequence: 'ACGTACGTACGTACGTACGT',
          tail: '', tm: 61, scope: PRIMER_SCOPE_GLOBAL,
        },
        status: 'received',
      });
    });
    row();
    expect(screen.getByTestId('assembly-primer-reuse-p1')).toBeTruthy();
  });
});

describe('assembly primers persist themselves', () => {
  const hostState = (primers) => ({ assemblyDraftPrimers: { d1: primers } });

  it('a draft primer lands in the canonical project pool with no user action', async () => {
    renderHook(() => useAssemblyPrimerWriting({
      draftId: 'd1',
      caretAnchor: 0,
      caretPos: 0,
      actions,
      state: hostState([draft]),
    }));
    await waitFor(() => {
      expect(Object.keys(useStore.getState().primersById)).toHaveLength(1);
    });
    const saved = Object.values(useStore.getState().primersById)[0];
    expect(saved.bindingSequence).toBe('ACGTACGTACGTACGTACGT');
    expect(saved.projectId).toBe('proj-1');
    expect(saved.origin.kind).toBe('assembly-derived');
    // The draft it came from, so a recompute can recognise its own record.
    expect(saved.origin.draftPrimerId).toBe('p1');
    await waitFor(async () => {
      expect((await getPrimer(saved.id))?.origin?.draftPrimerId).toBe('p1');
    });
  });

  it('is idempotent — recomputing the assembly does not duplicate the pool', async () => {
    const { rerender } = renderHook(
      ({ primers }) => useAssemblyPrimerWriting({
        draftId: 'd1', caretAnchor: 0, caretPos: 0, actions, state: hostState(primers),
      }),
      { initialProps: { primers: [draft] } },
    );
    await waitFor(() => {
      expect(Object.keys(useStore.getState().primersById)).toHaveLength(1);
    });
    // The finalizer re-derives the same primer under the same draft id.
    rerender({ primers: [{ ...draft, tm: 60.5 }] });
    await new Promise((r) => { setTimeout(r, 0); });
    expect(Object.keys(useStore.getState().primersById)).toHaveLength(1);
    const savedId = Object.keys(useStore.getState().primersById)[0];
    await waitFor(async () => {
      expect((await getPrimer(savedId))?.origin?.draftPrimerId).toBe('p1');
    });
  });

  it('a second, genuinely different primer gets its own record', async () => {
    const other = {
      ...draft, id: 'p2', name: 'asm-rev', label: 'asm-rev', direction: 'reverse',
      sequence: 'TTTTGGGGCCCCAAAATTTT', bindingSequence: 'TTTTGGGGCCCCAAAATTTT',
    };
    renderHook(() => useAssemblyPrimerWriting({
      draftId: 'd1', caretAnchor: 0, caretPos: 0, actions, state: hostState([draft, other]),
    }));
    await waitFor(() => {
      expect(Object.keys(useStore.getState().primersById)).toHaveLength(2);
    });
    await waitFor(async () => {
      expect(await listPrimers()).toHaveLength(2);
    });
  });
});

describe('PRIMER-TAIL-SAVE-1 — editing an existing primer', () => {
  const hostState = (primers) => ({ assemblyDraftPrimers: { d1: primers } });

  it('Save on an existing primer forwards primerId + canonical split to the writer (an edit, not a create)', () => {
    const calls = [];
    const spy = {
      ...actions,
      showToast: () => {},
      writeAssemblyPrimer: (arg) => calls.push(arg),
    };
    const { result } = renderHook(() => useAssemblyPrimerWriting({
      draftId: 'd1', caretAnchor: 0, caretPos: 0, actions: spy, state: hostState([]),
    }));
    act(() => {
      result.current.onWritePrimer({
        primerId: 'asmprm-9',
        direction: 'forward',
        start: 0,
        end: 20,
        name: 'edited',
        tail: 'GGGG',
        binding: 'ACGTACGTACGTACGTACGT',
        sequence: 'GGGGACGTACGTACGTACGTACGT',
        bindingModel: 'aligned-v1',
      });
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].primerId).toBe('asmprm-9'); // routed as an EDIT, not dropped
    expect(calls[0].tail).toBe('GGGG'); // the 5′ tail is forwarded…
    expect(calls[0].binding).toBe('ACGTACGTACGTACGTACGT'); // …with its binding
    expect(calls[0].bindingModel).toBe('aligned-v1');
    expect(calls[0].sequence).toBe('GGGGACGTACGTACGTACGTACGT');
  });

  it('a physical edit updates the SAME canonical pool record in place (one row, new split)', async () => {
    const initial = {
      ...draft,
      id: 'p1',
      tail: '',
      sequence: 'ACGTACGTACGTACGTACGT',
      bindingSequence: 'ACGTACGTACGTACGTACGT',
    };
    const { rerender } = renderHook(
      ({ primers }) => useAssemblyPrimerWriting({
        draftId: 'd1', caretAnchor: 0, caretPos: 0, actions, state: hostState(primers),
      }),
      { initialProps: { primers: [initial] } },
    );
    await waitFor(() => {
      expect(Object.keys(useStore.getState().primersById)).toHaveLength(1);
    });
    const firstKey = Object.keys(useStore.getState().primersById)[0];

    // Re-open the primer, add a 5′ tail, Save. The edited draft primer keeps
    // its id (the reducer edits in place), so the pool row must update in place.
    const edited = {
      ...initial,
      sequence: 'GGGGACGTACGTACGTACGTACGT',
      tail: 'GGGG',
      bindingSequence: 'ACGTACGTACGTACGTACGT',
    };
    rerender({ primers: [edited] });
    await waitFor(() => {
      expect(Object.values(useStore.getState().primersById)[0].sequence)
        .toBe('GGGGACGTACGTACGTACGTACGT');
    });

    const rows = Object.values(useStore.getState().primersById);
    expect(rows).toHaveLength(1); // updated in place, not duplicated
    expect(Object.keys(useStore.getState().primersById)[0]).toBe(firstKey); // same row
    expect(rows[0].sequence).toBe('GGGGACGTACGTACGTACGTACGT'); // new full oligo
    expect(rows[0].tail).toBe('GGGG'); // the tail reached the canonical pool
    expect(rows[0].bindingSequence).toBe('ACGTACGTACGTACGTACGT');
    expect(rows[0].origin.draftPrimerId).toBe('p1');
    await waitFor(async () => {
      expect((await getPrimer(firstKey))?.sequence).toBe('GGGGACGTACGTACGTACGTACGT');
    });
  });
});

describe('PRIMER-TAIL-SAVE-1 CORRECTION — onWritePrimer transport', () => {
  // B — tm is forwarded through onWritePrimer → writeAssemblyPrimer dispatch.
  it('B: onWritePrimer forwards explicit tm (finite) to the action', () => {
    const calls = [];
    const spy = {
      ...actions,
      showToast: () => {},
      writeAssemblyPrimer: (arg) => calls.push(arg),
    };
    const { result } = renderHook(() => useAssemblyPrimerWriting({
      draftId: 'd1', caretAnchor: 0, caretPos: 0, actions: spy,
      state: { assemblyDraftPrimers: { d1: [] } },
    }));
    act(() => {
      result.current.onWritePrimer({
        primerId: 'p-tm-test',
        direction: 'forward',
        start: 0,
        end: 20,
        binding: 'ACGTACGTACGTACGTACGT',
        sequence: 'ACGTACGTACGTACGTACGT',
        tm: 62.1,
      });
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].tm).toBe(62.1);
  });

  it('B: onWritePrimer forwards explicit tm:null to the action', () => {
    const calls = [];
    const spy = {
      ...actions,
      showToast: () => {},
      writeAssemblyPrimer: (arg) => calls.push(arg),
    };
    const { result } = renderHook(() => useAssemblyPrimerWriting({
      draftId: 'd1', caretAnchor: 0, caretPos: 0, actions: spy,
      state: { assemblyDraftPrimers: { d1: [] } },
    }));
    act(() => {
      result.current.onWritePrimer({
        primerId: 'p-null-tm',
        direction: 'forward',
        start: 0,
        end: 20,
        binding: 'ACGTACGTACGTACGTACGT',
        sequence: 'ACGTACGTACGTACGTACGT',
        tm: null,
      });
    });
    expect(calls).toHaveLength(1);
    // null must be forwarded as null (not dropped or coerced to undefined)
    expect(calls[0].tm).toBeNull();
  });

  it('B: omitting tm from onWritePrimer forwards undefined (preserve semantics)', () => {
    const calls = [];
    const spy = {
      ...actions,
      showToast: () => {},
      writeAssemblyPrimer: (arg) => calls.push(arg),
    };
    const { result } = renderHook(() => useAssemblyPrimerWriting({
      draftId: 'd1', caretAnchor: 0, caretPos: 0, actions: spy,
      state: { assemblyDraftPrimers: { d1: [] } },
    }));
    act(() => {
      result.current.onWritePrimer({
        primerId: 'p-no-tm',
        direction: 'forward',
        start: 0,
        end: 20,
        binding: 'ACGTACGTACGTACGTACGT',
        sequence: 'ACGTACGTACGTACGTACGT',
        // tm intentionally omitted
      });
    });
    expect(calls).toHaveLength(1);
    // undefined means "omitted" — reducer will preserve existing tm
    expect(calls[0].tm).toBeUndefined();
  });
});

describe('pool sync serialization — race safety', () => {
  // Regression for the blocking race found in independent review:
  // the previous syncingRef / updateKey approach allowed two concurrent
  // addPrimerToPool calls for the same draft primer, so an older create
  // could resolve after a newer tail-edit upsert and overwrite the correct
  // row. The updateKey guard also dropped a newer edit with no retry when
  // the guard was still held.
  //
  // Fix contract (inflightRef + pendingRef + drain):
  //   1. At most one write in flight per draft primer id.
  //   2. While in flight, pendingRef holds the LATEST desired payload (replacing
  //      any earlier pending one — never dropping).
  //   3. After settlement, drain picks up pending and continues until idle.
  //
  // This test controls Promise resolution manually to observe ordering.
  it('prevents concurrent writes; drain delivers only the latest tail after the first write settles', async () => {
    const originalAddPrimerToPool = useStore.getState().addPrimerToPool;

    const writtenPayloads = []; // payloads in call order
    let resolveW1;              // call to settle the first (deferred) write
    let callIndex = 0;

    // Mock: W1 is deferred (simulates a slow Dexie write); later writes
    // resolve immediately and commit to the store so the final row is observable.
    const mock = (payload) => {
      const myIdx = callIndex++;
      // Deep-clone so signature captured at call time, not at assertion time.
      writtenPayloads.push(JSON.parse(JSON.stringify(payload)));
      if (myIdx === 0) {
        return new Promise((res) => { resolveW1 = res; });
      }
      useStore.setState((s) => {
        s.primersById[payload.primer.id] = {
          ...payload.primer,
          status: payload.status ?? 'designed',
          projectId: payload.projectId,
          origin: payload.origin,
        };
      });
      return Promise.resolve();
    };
    useStore.setState((s) => { s.addPrimerToPool = mock; });

    try {
      const SEQ = 'ACGTACGTACGTACGTACGT'; // 20 bp
      const initial = {
        id: 'p1', draftId: 'd1', name: 'asm-fwd', label: 'asm-fwd', direction: 'forward',
        sequence: SEQ, bindingSequence: SEQ, tail: '', tm: 60, gc: 50,
      };
      const withTailA = {
        ...initial, tail: 'AAAA', sequence: `AAAA${SEQ}`, bindingSequence: SEQ,
      };
      const withTailC = {
        ...initial, tail: 'CCCC', sequence: `CCCC${SEQ}`, bindingSequence: SEQ,
      };
      const hostState = (primers) => ({ assemblyDraftPrimers: { d1: primers } });

      // Wrap in StrictMode so setup→cleanup→setup is exercised; the unmount
      // effect must reset unmountedRef.current=false on each setup or drain
      // would treat the live second mount as unmounted and drop pending writes.
      const { rerender } = renderHook(
        ({ primers }) => useAssemblyPrimerWriting({
          draftId: 'd1', caretAnchor: 0, caretPos: 0, actions,
          state: hostState(primers),
        }),
        { initialProps: { primers: [initial] }, wrapper: React.StrictMode },
      );

      // Let the sync effect fire, starting W1 (still unresolved).
      await new Promise((r) => { setTimeout(r, 0); });
      expect(writtenPayloads).toHaveLength(1);           // exactly one write started
      expect(writtenPayloads[0].primer.tail).toBe('');   // the initial no-tail version

      // First edit: tail='AAAA'. W1 still in flight → queued in pendingRef, no second write.
      rerender({ primers: [withTailA] });
      await new Promise((r) => { setTimeout(r, 0); });
      expect(writtenPayloads).toHaveLength(1);           // still only one — no concurrent write

      // Second edit: tail='CCCC'. Replaces pending (AAAA payload discarded).
      rerender({ primers: [withTailC] });
      await new Promise((r) => { setTimeout(r, 0); });
      expect(writtenPayloads).toHaveLength(1);           // still exactly one in flight

      // Settle W1 → drain fires with the latest pending payload (CCCC, not AAAA).
      resolveW1();
      await waitFor(() => { expect(writtenPayloads).toHaveLength(2); });
      expect(writtenPayloads[1].primer.tail).toBe('CCCC');          // latest, not the dropped 'AAAA'
      expect(writtenPayloads[1].primer.sequence).toBe(`CCCC${SEQ}`);// full oligo matches latest

      // W2 committed to the store. Final pool row must reflect CCCC — the
      // older W1 payload (tail='') cannot have overwritten it because W1
      // resolved first and drain only issued W2 after W1 was done.
      const rows = Object.values(useStore.getState().primersById);
      expect(rows).toHaveLength(1);
      expect(rows[0].tail).toBe('CCCC');
      expect(rows[0].sequence).toBe(`CCCC${SEQ}`);
    } finally {
      // Always restore the live action so subsequent tests are not poisoned.
      useStore.setState((s) => { s.addPrimerToPool = originalAddPrimerToPool; });
    }
  });
});
