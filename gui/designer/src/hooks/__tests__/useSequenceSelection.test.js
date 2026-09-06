/**
 * useSequenceSelection — unit tests (SPEC_VIEWER_UNIFICATION).
 * Base mechanics + 3 RE-strategies + drag-grace.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSequenceSelection } from '../useSequenceSelection';

// Minimal RE map for pair-select cut math.
const RE = {
  EcoRI: { site: 'GAATTC', cut: [1, 5] },
  BamHI: { site: 'GGATCC', cut: [1, 5] },
  ScaI: { site: 'AGTACT', cut: [3, 3] },
};

describe('useSequenceSelection — base', () => {
  it('initial caret null by default; 0 when initialCaret=0', () => {
    const a = renderHook(() => useSequenceSelection());
    expect(a.result.current.caretPos).toBeNull();
    expect(a.result.current.caretAnchor).toBeNull();
    const b = renderHook(() => useSequenceSelection({ initialCaret: 0 }));
    expect(b.result.current.caretPos).toBe(0);
  });

  it('onSelectRange sets anchor/pos/mode/strand + derived selStart/selEnd', () => {
    const { result } = renderHook(() => useSequenceSelection({ initialCaret: 0 }));
    act(() => { result.current.onSelectRange(10, 30, 'dna', 1); });
    expect(result.current.caretAnchor).toBe(10);
    expect(result.current.caretPos).toBe(30);
    expect(result.current.selStart).toBe(10);
    expect(result.current.selEnd).toBe(30);
    expect(result.current.hasSelection).toBe(true);
  });

  it('onSelectRange ignores zero/negative span', () => {
    const { result } = renderHook(() => useSequenceSelection({ initialCaret: 0 }));
    act(() => { result.current.onSelectRange(30, 10); });
    // Unchanged from initial.
    expect(result.current.caretPos).toBe(0);
  });

  it('onSelectRange with aa mode + reverse strand', () => {
    const { result } = renderHook(() => useSequenceSelection({ initialCaret: 0 }));
    act(() => { result.current.onSelectRange(3, 9, 'aa', -1); });
    expect(result.current.selectionMode).toBe('aa');
    expect(result.current.selectionStrand).toBe(-1);
  });

  it('onCaretChange collapse: plain click sets anchor=pos', () => {
    const { result } = renderHook(() => useSequenceSelection({ initialCaret: 0 }));
    act(() => { result.current.onSelectRange(10, 30); });
    act(() => { result.current.onCaretChange(50, { extendSelection: false }); });
    expect(result.current.caretAnchor).toBe(50);
    expect(result.current.caretPos).toBe(50);
    expect(result.current.hasSelection).toBe(false);
  });

  it('onCaretChange extend: keeps anchor, moves pos', () => {
    const { result } = renderHook(() => useSequenceSelection({ initialCaret: 0 }));
    act(() => { result.current.onCaretChange(10, { extendSelection: false }); });
    act(() => { result.current.onCaretChange(40, { extendSelection: true }); });
    expect(result.current.caretAnchor).toBe(10);
    expect(result.current.caretPos).toBe(40);
  });

  it('resetKey change resets caret to initialCaret', () => {
    let key = 'a';
    const { result, rerender } = renderHook(
      ({ k }) => useSequenceSelection({ initialCaret: null, resetKey: k }),
      { initialProps: { k: key } },
    );
    act(() => { result.current.onSelectRange(5, 15); });
    expect(result.current.caretPos).toBe(15);
    key = 'b';
    rerender({ k: key });
    expect(result.current.caretPos).toBeNull();
    expect(result.current.caretAnchor).toBeNull();
  });
});

describe('useSequenceSelection — drag-grace', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('non-extend click within 250ms of extend is ignored (selection survives)', () => {
    const { result } = renderHook(() => useSequenceSelection({ initialCaret: 0 }));
    act(() => { result.current.onCaretChange(10, { extendSelection: false }); }); // anchor=10
    act(() => { result.current.onCaretChange(40, { extendSelection: true }); }); // extend → pos=40
    // Synthetic trailing click right after drag — should be ignored.
    act(() => { result.current.onCaretChange(40, { extendSelection: false }); });
    expect(result.current.caretAnchor).toBe(10);
    expect(result.current.caretPos).toBe(40);
    expect(result.current.hasSelection).toBe(true);
  });

  it('forceAnchor commits a pending wrap-row drag anchor during the grace window', () => {
    const { result } = renderHook(() => useSequenceSelection({ initialCaret: 0 }));
    act(() => { result.current.onCaretChange(10, { extendSelection: false }); });
    act(() => { result.current.onCaretChange(40, { extendSelection: true }); });

    // A new drag may start in the duplicated leading row while the previous
    // synthetic-click grace timer is still active. This is an explicit pointer
    // anchor, not that trailing click, so it must replace the old selection.
    act(() => {
      result.current.onCaretChange(-20, {
        extendSelection: false,
        forceAnchor: true,
      });
    });
    expect(result.current.caretAnchor).toBe(-20);
    expect(result.current.caretPos).toBe(-20);
  });

  it('non-extend click after grace window collapses normally', () => {
    const { result } = renderHook(() => useSequenceSelection({ initialCaret: 0 }));
    act(() => { result.current.onCaretChange(10, { extendSelection: false }); });
    act(() => { result.current.onCaretChange(40, { extendSelection: true }); });
    act(() => { vi.advanceTimersByTime(300); });
    act(() => { result.current.onCaretChange(60, { extendSelection: false }); });
    expect(result.current.caretAnchor).toBe(60);
    expect(result.current.caretPos).toBe(60);
  });
});

describe('useSequenceSelection — RE strategy: pair-select', () => {
  it('two clicks on different RE sites → [cutA,cutB] + acquisitionMethod=restriction', () => {
    const onPairCommit = vi.fn();
    const { result } = renderHook(() => useSequenceSelection({
      initialCaret: 0, reBehavior: 'pair-select', reEnzymes: RE, onPairCommit,
    }));
    // First click marks the CUT (firstRESite) WITHOUT selecting the recognition
    // range (Игорь 21.06 — clicking an RE shows the cut, it is NOT a sequence
    // selection). caret stays where it was; the fragment comes from the 2nd click.
    act(() => { result.current.onRestrictionClick({ enzyme: 'EcoRI', position: 101 }); });
    expect(result.current.caretAnchor).toBe(0); // unchanged (initialCaret)
    expect(result.current.caretPos).toBe(0);
    expect(result.current.firstRESite).toMatchObject({ enzyme: 'EcoRI', position: 101 });
    expect(result.current.acquisitionMethod).toBe('restriction');
    // Second click BamHI cut at 201 → fragment between the two cuts [101, 201]
    // (V155 — no double `+cut[0]`; the cuts ARE the boundaries).
    act(() => { result.current.onRestrictionClick({ enzyme: 'BamHI', position: 201 }); });
    expect(result.current.caretAnchor).toBe(101);
    expect(result.current.caretPos).toBe(201);
    expect(result.current.acquisitionMethod).toBe('restriction');
    expect(result.current.firstRESite).toBeNull();
    expect(onPairCommit).toHaveBeenCalledWith(expect.objectContaining({ start: 101, end: 201 }));
  });

  it('clearFirstRESite cancels a pending first-RE click (A30)', () => {
    const { result } = renderHook(() => useSequenceSelection({
      initialCaret: 0, reBehavior: 'pair-select', reEnzymes: RE,
    }));
    act(() => { result.current.onRestrictionClick({ enzyme: 'EcoRI', position: 100 }); });
    expect(result.current.firstRESite).toMatchObject({ enzyme: 'EcoRI', position: 100 });
    act(() => { result.current.clearFirstRESite(); });
    expect(result.current.firstRESite).toBeNull();
  });

  it('clicking the same site twice does not pair (re-stores as first)', () => {
    const { result } = renderHook(() => useSequenceSelection({
      initialCaret: 0, reBehavior: 'pair-select', reEnzymes: RE,
    }));
    act(() => { result.current.onRestrictionClick({ enzyme: 'EcoRI', position: 100 }); });
    act(() => { result.current.onRestrictionClick({ enzyme: 'EcoRI', position: 100 }); });
    // Still first-click snap (no pairing); firstRESite remains set.
    expect(result.current.firstRESite).toMatchObject({ position: 100 });
  });

  it('cursor select clears pending firstRESite', () => {
    const { result } = renderHook(() => useSequenceSelection({
      initialCaret: 0, reBehavior: 'pair-select', reEnzymes: RE,
    }));
    act(() => { result.current.onRestrictionClick({ enzyme: 'EcoRI', position: 100 }); });
    expect(result.current.firstRESite).not.toBeNull();
    act(() => { result.current.onSelectRange(5, 20); });
    expect(result.current.firstRESite).toBeNull();
    expect(result.current.acquisitionMethod).toBe('cursor');
  });
});

describe('useSequenceSelection — RE strategy: cut', () => {
  it('RE click fires onCutHere, does not change caret', () => {
    const onCutHere = vi.fn();
    const { result } = renderHook(() => useSequenceSelection({
      initialCaret: 0, reBehavior: 'cut', onCutHere,
    }));
    const site = { enzyme: 'ScaI', position: 50 };
    const evt = { clientX: 10, clientY: 20 };
    act(() => { result.current.onRestrictionClick(site, evt); });
    expect(onCutHere).toHaveBeenCalledWith(site, evt);
    expect(result.current.caretPos).toBe(0); // unchanged
  });
});

describe('useSequenceSelection — RE strategy: off', () => {
  it('RE click is a no-op (display-only)', () => {
    const onPairCommit = vi.fn();
    const onCutHere = vi.fn();
    const { result } = renderHook(() => useSequenceSelection({
      initialCaret: 0, reBehavior: 'off', reEnzymes: RE, onPairCommit, onCutHere,
    }));
    act(() => { result.current.onRestrictionClick({ enzyme: 'EcoRI', position: 100 }); });
    expect(onPairCommit).not.toHaveBeenCalled();
    expect(onCutHere).not.toHaveBeenCalled();
    expect(result.current.caretPos).toBe(0);
    expect(result.current.firstRESite).toBeNull();
  });
});

describe('useSequenceSelection — side-effect hooks', () => {
  it('onAfterCaret / onAfterSelect fire with payload', () => {
    const onAfterCaret = vi.fn();
    const onAfterSelect = vi.fn();
    const { result } = renderHook(() => useSequenceSelection({
      initialCaret: 0, onAfterCaret, onAfterSelect,
    }));
    act(() => { result.current.onCaretChange(12, { needsScroll: true }); });
    expect(onAfterCaret).toHaveBeenCalledWith(12, { needsScroll: true });
    act(() => { result.current.onSelectRange(4, 16, 'dna', 1); });
    expect(onAfterSelect).toHaveBeenCalledWith(expect.objectContaining({ start: 4, end: 16 }));
  });
});
