/**
 * assembly-primer-writing-tail.test.js — overlap-tail rendering fix (file 1).
 *
 * deriveAutoPrimers stores the overlap 5'-overhang in `tail`, but
 * useAssemblyPrimerWriting.viewerPrimers wasn't forwarding it → the tail never
 * reached PrimerTrack, so two internal overlap-PCR primers rendered butted at
 * the segment boundary. viewerPrimers now carries `tail`.
 */
import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useAssemblyPrimerWriting } from '../useAssemblyPrimerWriting';

describe('useAssemblyPrimerWriting — viewerPrimers forwards tail', () => {
  it('viewer-shaped primer carries the overlap tail from the stored record', () => {
    const state = {
      assemblyDraftPrimers: {
        d1: [{
          name: 'asm-fwd-2',
          sequence: 'GGGGGACGTACGTACGT',
          bindingSequence: 'ACGTACGTACGT',
          tail: 'GGGGG',
          direction: 'forward',
          tm: 60,
          crossesBoundaries: ['segA', 'segB'],
        }],
      },
    };
    const { result } = renderHook(() => useAssemblyPrimerWriting({
      draftId: 'd1', caretAnchor: 0, caretPos: 0, actions: {}, state,
    }));
    expect(result.current.primers[0].tail).toBe('GGGGG');
    // existing fields untouched
    expect(result.current.primers[0].bindingSequence).toBe('ACGTACGTACGT');
    expect(result.current.primers[0].direction).toBe('forward');
  });

  it('terminal primer with no tail → tail is undefined/empty (unchanged)', () => {
    const state = {
      assemblyDraftPrimers: {
        d1: [{
          name: 'asm-fwd-1', sequence: 'ACGTACGTACGT', bindingSequence: 'ACGTACGTACGT',
          tail: '', direction: 'forward', tm: 60, crossesBoundaries: [],
        }],
      },
    };
    const { result } = renderHook(() => useAssemblyPrimerWriting({
      draftId: 'd1', caretAnchor: 0, caretPos: 0, actions: {}, state,
    }));
    expect(result.current.primers[0].tail).toBe('');
  });
});
