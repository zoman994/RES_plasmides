/**
 * assembly-primers.test.jsx — K8 primer writing on the assembly
 * sequence (G2 DEC-CANVAS-ASM-19/20). SequenceTab is mocked (mirrors
 * pcr-mode-selection.test.jsx) so the test exercises ONLY the
 * shell↔hook↔reducer wiring, never a hook inside the shared viewer.
 */
import 'fake-indexeddb/auto';
import {
  describe, it, expect, vi, afterEach, beforeEach,
} from 'vitest';
import {
  render, screen, cleanup, fireEvent, act, within,
} from '@testing-library/react';

vi.mock('../../Library/inspector/tabs/SequenceTab', () => ({
  default: (props) => (
    <div data-testid="mock-sequence-tab" data-primers={JSON.stringify(props.primers || [])}>
      <button
        type="button"
        data-testid="mock-select-span"
        onClick={() => props.onSelectRange && props.onSelectRange(10, 28, 'dna', 1)}
      >span</button>
      <button
        type="button"
        data-testid="mock-select-short"
        onClick={() => props.onSelectRange && props.onSelectRange(2, 8, 'dna', 1)}
      >short</button>
      <button
        type="button"
        data-testid="mock-ctx-fwd"
        onClick={() => props.onWritePrimer && props.onWritePrimer({ direction: 'forward', start: 0, end: 20 })}
      >ctx-fwd</button>
    </div>
  ),
}));

import EditorWindowShell from '../editor/EditorWindowShell';
import {
  SkeletonProvider, useSkeletonActions, useSkeletonState,
} from '../store/skeleton-context';
import { bootstrapStore } from '../../../store';
import { runHotkeyResolver, _clearHandlersForTests } from '../../../lib/hotkeys';

afterEach(() => { cleanup(); _clearHandlersForTests(); });
beforeEach(() => { try { bootstrapStore(); } catch { /* idempotent */ } });

function fireHotkey({ alt = false } = {}) {
  const ev = {
    ctrlKey: true, altKey: alt, shiftKey: false, metaKey: false,
    key: 'r', code: 'KeyR', target: document.body,
    defaultPrevented: false, preventDefault() { this.defaultPrevented = true; },
  };
  let ran;
  act(() => { ran = runHotkeyResolver(ev); });
  return ran;
}

let A = null;
let S = null;
function H() { A = useSkeletonActions(); S = useSkeletonState(); return null; }

function mountDraft() {
  render(<SkeletonProvider><H /><EditorWindowShell /></SkeletonProvider>);
  act(() => { A.createAssemblyDraft({ id: 'asm-p', name: 'P' }); });
  // seg0 = 20 bp, seg1 = 12 bp → [10,28) spans the 20-boundary.
  act(() => { A.insertManualSegment('asm-p', { sequence: 'AAAACCCCGGGGTTTTAAAA' }); });
  act(() => { A.insertManualSegment('asm-p', { sequence: 'CCCCGGGGTTTT' }); });
  act(() => { A.openEditorAssemblyTab('asm-p'); });
}
const primers = () => S.assemblyDraftPrimers['asm-p'] || [];

describe('K8 assembly primer writing', () => {
  it('select span + Ctrl+R writes a forward primer attached to the draft', () => {
    // span [10,28) crosses the boundary at 20 (seg0=20bp). Under A3
    // this is a JUNCTION primer: binding = left part [10,20) (10 bp),
    // ordered sequence = 5′ tail (right seg) + binding (longer).
    mountDraft();
    act(() => { fireEvent.click(screen.getByTestId('mock-select-span')); });
    fireHotkey();
    expect(primers()).toHaveLength(1);
    const p = primers()[0];
    expect(p.direction).toBe('forward');
    expect(p.source.kind).toBe('boundary');
    expect(p.bindingSequence.length).toBe(10);
    expect(p.sequence.length).toBeGreaterThan(p.bindingSequence.length);
  });

  it('Ctrl+Alt+R writes a reverse primer', () => {
    mountDraft();
    act(() => { fireEvent.click(screen.getByTestId('mock-select-span')); });
    fireHotkey({ alt: true });
    expect(primers()).toHaveLength(1);
    expect(primers()[0].direction).toBe('reverse');
  });

  it('right-click onWritePrimer path writes a primer', () => {
    mountDraft();
    act(() => { fireEvent.click(screen.getByTestId('mock-ctx-fwd')); });
    expect(primers()).toHaveLength(1);
    expect(primers()[0].range).toEqual({ start: 0, end: 20 });
  });

  it('cross-boundary primer is flagged (⚡) in the panel', () => {
    mountDraft();
    act(() => { fireEvent.click(screen.getByTestId('mock-select-span')); });
    fireHotkey();
    expect(primers()[0].crossesBoundaries.length).toBeGreaterThanOrEqual(2);
    const panel = screen.getByTestId('assembly-primers-panel');
    expect(within(panel).getByTestId('assembly-primer-cross')).toBeTruthy();
  });

  it('too-short selection (<18 bp) warns and writes nothing', () => {
    mountDraft();
    act(() => { fireEvent.click(screen.getByTestId('mock-select-short')); });
    fireHotkey();
    expect(primers()).toHaveLength(0);
  });

  it('delete in the panel removes the primer', () => {
    mountDraft();
    act(() => { fireEvent.click(screen.getByTestId('mock-select-span')); });
    fireHotkey();
    const panel = screen.getByTestId('assembly-primers-panel');
    act(() => { fireEvent.click(within(panel).getByTestId('assembly-primer-delete')); });
    expect(primers()).toHaveLength(0);
  });
});
