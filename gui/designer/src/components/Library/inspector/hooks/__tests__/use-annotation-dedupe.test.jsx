/**
 * use-annotation-dedupe.test.jsx — B1-ui shared dedupe hook.
 *
 * The «Убрать дубли» affordance is shared by the Library inspector and the
 * Container editor. It must:
 *   - detect scalar-dominated regions (a generic feature covered ~identically by
 *     a higher-priority one) via the existing scalar detector;
 *   - remove them through the CASCADE-aware core delete path, so a dominated
 *     parent takes its children with it and never orphans a link;
 *   - preserve the survivor's rich data;
 *   - skip any compound / origin-crossing candidate FAIL-CLOSED while the
 *     detector remains scalar (a JOIN feature is never silently removed).
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAnnotationDedupe } from '../useAnnotationDedupe';

describe('useAnnotationDedupe', () => {
  const dominant = {
    id: 'cds', name: 'AmpR', type: 'CDS', start: 0, end: 100, strand: 1, level: 'region',
    qualifiers: { gene: 'bla' }, provenance: 'snapgene:1',
  };
  const dominated = {
    id: 'dup', name: 'bla(M)', type: 'misc_feature', start: 0, end: 100, strand: 1, level: 'region',
  };
  const dominatedChild = {
    id: 'dup-child', name: 'sub', type: 'domain', start: 10, end: 20, strand: 1,
    level: 'detail', regionId: 'dup',
  };

  it('counts a scalar-dominated region and cascade-removes it + its children, preserving the survivor', () => {
    const applyOp = vi.fn();
    const annotations = [dominant, dominated, dominatedChild];
    const { result } = renderHook(() =>
      useAnnotationDedupe({ annotations, length: 100, topology: 'linear', applyOp }));

    expect(result.current.duplicateCount).toBe(1);

    act(() => { result.current.onRemoveDuplicates(); });
    expect(applyOp).toHaveBeenCalledTimes(1);
    const next = applyOp.mock.calls[0][0];
    // dominated region gone…
    expect(next.find((a) => a.id === 'dup')).toBeUndefined();
    // …and its child cascaded out (no orphan link left behind).
    expect(next.find((a) => a.id === 'dup-child')).toBeUndefined();
    // survivor + its rich data preserved.
    const s = next.find((a) => a.id === 'cds');
    expect(s).toBeTruthy();
    expect(s.qualifiers).toEqual({ gene: 'bla' });
    expect(s.provenance).toBe('snapgene:1');
  });

  it('no-ops when nothing is dominated', () => {
    const applyOp = vi.fn();
    const annotations = [
      { id: 'a', type: 'CDS', start: 0, end: 100, level: 'region' },
      { id: 'b', type: 'promoter', start: 200, end: 300, level: 'region' },
    ];
    const { result } = renderHook(() =>
      useAnnotationDedupe({ annotations, length: 400, topology: 'linear', applyOp }));
    expect(result.current.duplicateCount).toBe(0);
    act(() => { result.current.onRemoveDuplicates(); });
    expect(applyOp).not.toHaveBeenCalled();
  });

  it('skips a compound / origin-crossing candidate fail-closed (scalar detector must not remove it)', () => {
    const applyOp = vi.fn();
    const compoundDominated = {
      id: 'dupC', name: 'x', type: 'misc_feature', strand: 1, level: 'region',
      location: { kind: 'join', segments: [{ start: 0, end: 40 }, { start: 60, end: 100 }] },
      start: 0, end: 100,
    };
    const annotations = [dominant, compoundDominated];
    const { result } = renderHook(() =>
      useAnnotationDedupe({ annotations, length: 100, topology: 'linear', applyOp }));
    // Scalar span would look dominated, but the compound candidate is skipped.
    expect(result.current.duplicateCount).toBe(0);
    act(() => { result.current.onRemoveDuplicates(); });
    expect(applyOp).not.toHaveBeenCalled();
  });
});
