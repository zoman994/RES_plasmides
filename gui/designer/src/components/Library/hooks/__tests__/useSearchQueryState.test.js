/**
 * useSearchQueryState — REV#2 Stage 3 K4.1. The headless controller that owns the canonical
 * globalSearchState (§9.4) and wires the pure K3 sync engine to UI events: it holds the state,
 * turns input events into commit-tail decisions, and exposes the derived canonical query,
 * runnable gate, and the selector / chip view-models. No mount, no store — renderHook-testable.
 */
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSearchQueryState } from '../useSearchQueryState';

const CAPS = { providers: ['metadata', 'protein'], entityScope: ['entry', 'project', 'primer'] };
const setup = (opts = {}) => renderHook(() => useSearchQueryState({ capabilities: CAPS, resolveLabel: (k) => `«${k}»`, resolveRemoveLabel: (c) => `remove ${c}`, ...opts }));

describe('useSearchQueryState — initial + derived', () => {
  it('starts at the default library state with an empty, non-runnable query', () => {
    const { result } = setup();
    expect(result.current.state.mode).toBe('lib');
    expect(result.current.canonicalQuery).toBe('');
    expect(result.current.runnable).toBe(false);
    expect(result.current.modeSelectorModel.selectedModeId).toBe('lib');
    expect(result.current.chips).toEqual([]);
  });
});

describe('useSearchQueryState — commit-tail heuristic on the input', () => {
  it('a trailing space commits the tail (mode lifts); typing without it does not', () => {
    const { result } = setup();
    act(() => result.current.onDraftChange('aa:HHHH')); // still typing — no trailing space
    expect(result.current.state.mode).toBe('lib'); // not yet lifted
    act(() => result.current.onDraftChange('aa:HHHH ')); // space commits
    expect(result.current.state.mode).toBe('aa');
    expect(result.current.state.draft).toBe('HHHH');
    expect(result.current.canonicalQuery).toBe('aa:HHHH');
    expect(result.current.runnable).toBe(true);
  });

  it('a filter does NOT chip mid-typing; onCommitDraft (Enter/blur) commits it', () => {
    const { result } = setup();
    act(() => result.current.onDraftChange('tag:cloning'));
    expect(result.current.chips).toEqual([]);
    act(() => result.current.onCommitDraft());
    expect(result.current.chips).toHaveLength(1);
    expect(result.current.chips[0].label).toContain('cloning');
  });
});

describe('useSearchQueryState — mode / filter / clear handlers', () => {
  it('onSelectMode switches the selected mode; onClearAll resets', () => {
    const { result } = setup();
    act(() => result.current.onSelectMode('aa'));
    expect(result.current.modeSelectorModel.selectedModeId).toBe('aa');
    act(() => result.current.onClearAll());
    expect(result.current.state.mode).toBe('lib');
  });

  it('onAddFilter adds a chip; onRemoveFilter removes it by id', () => {
    const { result } = setup();
    act(() => result.current.onAddFilter({ canonical: 'type' }, 'circular'));
    expect(result.current.chips).toHaveLength(1);
    const id = result.current.state.filters[0].id;
    act(() => result.current.onRemoveFilter(id));
    expect(result.current.chips).toEqual([]);
  });

  it('onBackspaceEmpty clears the mode only when the draft is empty', () => {
    const { result } = setup();
    act(() => result.current.onSelectMode('aa'));
    act(() => result.current.onBackspaceEmpty());
    expect(result.current.state.mode).toBe('lib'); // empty draft -> cleared
  });
});

describe('useSearchQueryState — typed entity resolution (§617)', () => {
  it('resolveEntities resolves a unique in: name to a projectId; ambiguous raises a blocking diagnostic', () => {
    const unique = setup({ resolveProjectName: (n) => (n === 'Gla' ? [{ projectId: 'p7', label: 'Gla' }] : []) });
    act(() => unique.result.current.onDraftChange('in:Gla '));
    act(() => unique.result.current.resolveEntities());
    expect(unique.result.current.state.filters[0].value).toMatchObject({ projectId: 'p7', label: 'Gla' });

    const ambiguous = setup({ resolveProjectName: () => [{ projectId: 'a', label: 'X' }, { projectId: 'b', label: 'X' }] });
    act(() => ambiguous.result.current.onDraftChange('in:X '));
    act(() => ambiguous.result.current.resolveEntities());
    expect(ambiguous.result.current.state.filters[0].value).toMatchObject({ unresolved: true });
    expect(ambiguous.result.current.state.diagnostics.some((d) => d.severity === 'error')).toBe(true);
  });
});

describe('useSearchQueryState — K4.1-P1-1: runnable is gated by blocking diagnostics + unresolved entities', () => {
  it('in: is never runnable (parse-only, fail-closed) whether unique or ambiguous; an executable filter runs', () => {
    // in: auto-resolves on commit (correctness) but stays blocked — no end-to-end consumer yet (§ inv 2).
    const unique = setup({ resolveProjectName: (n) => (n === 'Gla' ? [{ projectId: 'p7', label: 'Gla' }] : []) });
    act(() => unique.result.current.onDraftChange('in:Gla '));
    expect(unique.result.current.canonicalQuery).toBe('in:p7'); // resolved
    expect(unique.result.current.runnable).toBe(false); // but not executable

    const amb = setup({ resolveProjectName: () => [{ projectId: 'a', label: 'X' }, { projectId: 'b', label: 'X' }] });
    act(() => amb.result.current.onDraftChange('in:X '));
    expect(amb.result.current.runnable).toBe(false); // ambiguous -> blocking

    const exec = setup();
    act(() => exec.result.current.onDraftChange('tag:x '));
    expect(exec.result.current.runnable).toBe(true); // an executable filter DOES run
  });

  it('a provider conflict is not runnable', () => {
    const { result } = setup();
    act(() => result.current.onDraftChange('aa:HHHH seq:ATGC '));
    expect(result.current.runnable).toBe(false); // multiple-provider-intents blocks the run
  });
});

describe('useSearchQueryState — K4.1-P1-2: IME composition + paste metadata', () => {
  it('mid-composition (isComposing) updates only the visible buffer — no mode/chip/canonical change', () => {
    const { result } = setup();
    act(() => result.current.onDraftChange('aa:HHHH ', { isComposing: true }));
    expect(result.current.state.mode).toBe('lib'); // NOT parsed while composing
    expect(result.current.canonicalQuery).toBe('');
    expect(result.current.draftValue).toBe('aa:HHHH '); // the raw buffer is shown
    // composition ends -> the final value is parsed once
    act(() => result.current.onDraftChange('aa:HHHH ', { isComposing: false }));
    expect(result.current.state.mode).toBe('aa');
    expect(result.current.draftValue).toBe('HHHH'); // now the parsed residual
  });

  it('a paste commits the inserted value in the SAME change (inputType=insertFromPaste)', () => {
    const paste = setup();
    act(() => paste.result.current.onDraftChange('type:circular', { inputType: 'insertFromPaste' }));
    expect(paste.result.current.chips).toHaveLength(1); // committed immediately, no trailing space needed

    const typing = setup();
    act(() => typing.result.current.onDraftChange('type:circular'));
    expect(typing.result.current.chips).toEqual([]); // ordinary typing -> pending, no chip
  });
});

describe('useSearchQueryState — K5: seedGlobalQuery is a REPLACE, never a merge', () => {
  it('a stale global aa: + chips is cleared when seeded with a tree pUC (-> clean lib + pUC)', () => {
    const { result } = setup();
    act(() => result.current.onDraftChange('aa:HHHH ')); // mode aa
    act(() => result.current.onAddFilter({ canonical: 'type' }, 'circular')); // a chip
    act(() => result.current.seedGlobalQuery('pUC'));
    expect(result.current.state.mode).toBe('lib'); // NOT aa
    expect(result.current.state.filters).toEqual([]); // chip dropped
    expect(result.current.state.draft).toBe('pUC');
    expect(result.current.canonicalQuery).toBe('pUC');
  });

  it('a stale enz: is replaced by a seeded seq:GAATTC (-> clean seq, no old chips)', () => {
    const { result } = setup();
    act(() => result.current.onDraftChange('enz:BsaI '));
    act(() => result.current.onAddFilter({ canonical: 'tag' }, 'x'));
    act(() => result.current.seedGlobalQuery('seq:GAATTC'));
    expect(result.current.state.mode).toBe('seq');
    expect(result.current.state.filters).toEqual([]);
    expect(result.current.state.draft).toBe('GAATTC');
  });

  it('an empty tree seed resets to the full DEFAULT_QUERY_STATE', () => {
    const { result } = setup();
    act(() => result.current.onDraftChange('aa:HHHH '));
    act(() => result.current.seedGlobalQuery(''));
    expect(result.current.state.mode).toBe('lib');
    expect(result.current.state.filters).toEqual([]);
    expect(result.current.state.draft).toBe('');
    expect(result.current.runnable).toBe(false);
  });
});

describe('useSearchQueryState — ch1 invariant 1: a typed/seeded in: is auto-resolved via the injected resolver', () => {
  it('seedGlobalQuery resolves a unique in: name to its projectId in the same update', () => {
    const { result } = setup({ resolveProjectName: (n) => (n === 'Gla' ? [{ projectId: 'p7', label: 'Gla' }] : []) });
    act(() => result.current.seedGlobalQuery('in:Gla'));
    expect(result.current.state.filters[0].value).toMatchObject({ projectId: 'p7', label: 'Gla' });
  });

  it('an ambiguous seeded in: stays unresolved with a blocking diagnostic and is not runnable', () => {
    const { result } = setup({ resolveProjectName: () => [{ projectId: 'a', label: 'X' }, { projectId: 'b', label: 'X' }] });
    act(() => result.current.seedGlobalQuery('in:X'));
    expect(result.current.state.filters[0].value).toMatchObject({ unresolved: true });
    expect(result.current.runnable).toBe(false);
  });
});

describe('useSearchQueryState — ch1 invariant 2: a not-yet-executable filter fails CLOSED', () => {
  it('a parse-only filter (name/feature/in) blocks the run with a filter-not-available diagnostic', () => {
    const { result } = setup();
    act(() => result.current.onDraftChange('name:foo ')); // name is parse-only in the registry
    expect(result.current.runnable).toBe(false);
    expect(result.current.diagnostics.some((d) => d.code === 'filter-not-available' && d.severity === 'error')).toBe(true);
  });

  it('an executable filter (tag/type/status) does NOT block the run', () => {
    const { result } = setup();
    act(() => result.current.onDraftChange('tag:cloning '));
    expect(result.current.runnable).toBe(true);
    expect(result.current.diagnostics.some((d) => d.code === 'filter-not-available')).toBe(false);
  });

  it('even a RESOLVED in: stays blocked while there is no end-to-end consumer (in is parse-only)', () => {
    const { result } = setup({ resolveProjectName: () => [{ projectId: 'p1', label: 'Alpha' }] });
    act(() => result.current.seedGlobalQuery('in:Alpha'));
    expect(result.current.state.filters[0].value).toMatchObject({ projectId: 'p1' }); // resolved (correctness)
    expect(result.current.runnable).toBe(false); // but not executable -> fail-closed
    expect(result.current.diagnostics.some((d) => d.code === 'filter-not-available')).toBe(true);
  });
});

describe('useSearchQueryState — PRE-1: removing an ambiguous in: chip unblocks the remaining valid query', () => {
  it('after dropping the ambiguous in: chip, the leftover executable tag: query becomes runnable', () => {
    const { result } = setup({ resolveProjectName: () => [{ projectId: 'a', label: 'X' }, { projectId: 'b', label: 'X' }] });
    act(() => result.current.onDraftChange('tag:cloning ')); // executable filter — runnable on its own
    act(() => result.current.onDraftChange('in:X '));         // ambiguous in: -> blocks the run
    expect(result.current.runnable).toBe(false);
    const inId = result.current.state.filters.find((f) => f.canonical === 'in').id;
    act(() => result.current.onRemoveFilter(inId));
    expect(result.current.state.filters.some((f) => f.canonical === 'in')).toBe(false);
    expect(result.current.runnable).toBe(true); // stale ambiguous-project diagnostic cleared with the chip
  });

  it('removing an incompatible status chip clears parser errors and restores runnable', () => {
    const { result } = setup();
    act(() => result.current.seedGlobalQuery('primer:pUC status:release'));
    expect(result.current.runnable).toBe(false);
    expect(result.current.diagnostics.some((d) => d.code === 'incompatible-scope-status')).toBe(true);

    const statusId = result.current.state.filters.find((f) => f.canonical === 'status').id;
    act(() => result.current.onRemoveFilter(statusId));
    expect(result.current.diagnostics.some((d) => d.code === 'incompatible-scope-status')).toBe(false);
    expect(result.current.runnable).toBe(true);
  });
});

describe('useSearchQueryState — PRE-2: IME composition exposes a suppress-results signal', () => {
  it('composing is true mid-composition (popup/selection must be gated) and false once committed', () => {
    const { result } = setup();
    act(() => result.current.onDraftChange('aa:HHHH ', { isComposing: true }));
    expect(result.current.composing).toBe(true);        // the mount gates open + selection on !composing
    expect(result.current.canonicalQuery).toBe('');     // committed state untouched — no stale search runs
    act(() => result.current.onDraftChange('aa:HHHH ', { isComposing: false }));
    expect(result.current.composing).toBe(false);
  });

  it('clear-all during composition clears the raw buffer and ends the composition session', () => {
    const { result } = setup();
    act(() => result.current.onDraftChange('seq:GAATTC', { isComposing: true }));
    expect(result.current.draftValue).toBe('seq:GAATTC');

    act(() => result.current.onClearAll());

    expect(result.current.composing).toBe(false);
    expect(result.current.draftValue).toBe('');
    expect(result.current.canonicalQuery).toBe('');
    expect(result.current.runnable).toBe(false);
  });
});

describe('useSearchQueryState — a lifecycle edit keeps a conflict visible', () => {
  it('aa:HHHH seq:ATGC then a keystroke keeps the mode and the blocking conflict', () => {
    const { result } = setup();
    act(() => result.current.onDraftChange('aa:HHHH seq:ATGC ')); // paste-ish, commits
    expect(result.current.state.mode).toBe('aa');
    act(() => result.current.onDraftChange(`${result.current.state.draft} pUC`));
    expect(result.current.state.mode).toBe('aa'); // did not drift to seq
    expect(result.current.state.diagnostics.some((d) => d.code === 'multiple-provider-intents')).toBe(true);
  });
});
