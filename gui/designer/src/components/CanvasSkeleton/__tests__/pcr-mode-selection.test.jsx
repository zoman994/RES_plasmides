/**
 * pcr-mode-selection.test.jsx — V71 wiring: a region selected in the
 * shared Library SequenceView (onSelectRange) is turned into user
 * primers (recomputeFromSelection → opSetUserPrimers, source 'edited').
 *
 * SequenceTab is mocked here so the test exercises ONLY PcrModeShell's
 * selection→primer wiring — never a test hook inside the shared viewer.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';

// Mock the shared Library SequenceTab: expose a button that fires the
// real onSelectRange(start,end,mode,strand) contract PcrModeShell wires.
vi.mock('../../Library/inspector/tabs/SequenceTab', () => ({
  default: (props) => (
    <div
      data-testid="mock-sequence-tab"
      data-primers={JSON.stringify(props.primers || [])}
      data-show-tm={String(!!props.showSelectionTm)}
      data-caret-anchor={String(props.caretAnchor)}
      data-caret-pos={String(props.caretPos)}
    >
      <button
        type="button"
        data-testid="mock-select-range"
        onClick={() => props.onSelectRange && props.onSelectRange(10, 130, 'dna', 1)}
      >select</button>
      {/* V80 — plain caret click (no extendSelection) must collapse the
          anchor onto it; otherwise drag-select runs from nucleotide 0. */}
      <button
        type="button"
        data-testid="mock-caret-click"
        onClick={() => props.onCaretChange && props.onCaretChange(50)}
      >caret50</button>
      <button
        type="button"
        data-testid="mock-caret-extend"
        onClick={() => props.onCaretChange && props.onCaretChange(80, { extendSelection: true })}
      >extend80</button>
      {/* Stand-ins for the right-click context-menu items the shared
          SequenceView builds when onWritePrimer is wired. */}
      <button
        type="button"
        data-testid="mock-ctx-fwd"
        onClick={() => props.onWritePrimer && props.onWritePrimer({ direction: 'forward', start: 5, end: 140 })}
      >ctx-fwd</button>
      <button
        type="button"
        data-testid="mock-ctx-rev"
        onClick={() => props.onWritePrimer && props.onWritePrimer({ direction: 'reverse', start: 5, end: 140 })}
      >ctx-rev</button>
    </div>
  ),
}));

import PcrModeShell from '../editor/operation-modes/PcrModeShell';
import { selectPcrPrimers, selectPcrSpans } from '../store/selectors-pcr';
import { executePCR } from '../canvas/operations/adapters/pcr';
import {
  SkeletonProvider,
  useSkeletonActions,
  useSkeletonState,
} from '../store/skeleton-context';
import { bootstrapStore } from '../../../store';
import { runHotkeyResolver, _clearHandlersForTests } from '../../../lib/hotkeys';
import { alignPrimerBinding } from '../../../lib/primer-binding-alignment';

afterEach(() => { cleanup(); _clearHandlersForTests(); });
beforeEach(() => { try { bootstrapStore(); } catch { /* idempotent */ } });

// Synthetic keydown the global resolver understands (App.jsx normally
// feeds real events into runHotkeyResolver; here we drive it directly).
function fireHotkey({ alt = false, shift = false } = {}) {
  const ev = {
    ctrlKey: true, altKey: alt, shiftKey: shift, metaKey: false,
    key: 'r', code: 'KeyR',
    target: document.body,
    defaultPrevented: false,
    preventDefault() { this.defaultPrevented = true; },
  };
  let ran;
  act(() => { ran = runHotkeyResolver(ev); });
  return ran;
}

// ~300 bp so recomputeFromSelection has a real sub-region to design on.
const SEQ = ('ATGCGTACGTTAGCCTAGGATCCGGAATTCAAGCTTGCATGCCTGCAGGTCGACTCTAGAGGATCCCCGGGTACCGAGCTCGAATTCACTGGCCGTCGTTTTACAACGTCGTGACTGGGAAAACCCTGGCGTTACCCAACTTAATCGCCTTGCAGCACATCCCCCTTTCGCCAGCTGGCGTAATAGCGAAGAGGCCCGCACCGATCGCCCTTCCCAACAGTTGCGCAGCCTGAATGGCGAATGGCGCCTGATGCGGTATTTTCTCCTTACGCATCTGTGCGGTATTTCACACCGCATA');

let A = null;
let S = null;
function H() { A = useSkeletonActions(); S = useSkeletonState(); return null; }

function mountWithOp() {
  render(<SkeletonProvider><H /><Sink /></SkeletonProvider>);
  act(() => {
    A.addContainer({
      id: 'c-tpl', kind: 'molecule', name: 'pET28a',
      sequence: SEQ, topology: { circular: true }, annotations: [],
    });
  });
  act(() => { A.opAdd({ position: { x: 5, y: 5 }, kind: 'pcr', inputs: ['c-tpl'], commit: true }); });
  return S.operations[0];
}

// Sink renders PcrModeShell for the (single) current op.
function Sink() {
  const st = useSkeletonState();
  const op = st.operations[0];
  if (!op) return null;
  return <PcrModeShell op={op} />;
}

describe('V71 — PCR primer-writing wired into the shared viewer', () => {
  it('passes the auto-designed pair into the shared viewer `primers` prop', () => {
    mountWithOp();
    const tab = screen.getByTestId('mock-sequence-tab');
    const primers = JSON.parse(tab.getAttribute('data-primers'));
    expect(Array.isArray(primers)).toBe(true);
    expect(primers.length).toBeGreaterThanOrEqual(1);
    const dirs = primers.map((p) => p.direction);
    expect(dirs).toContain('forward');
    // Binding sequence is carried through so PrimerTrack can place it.
    expect(primers[0].bindingSequence).toBeTruthy();
  });

  // V72 — selection is decoupled from writing: selecting a region
  // no longer auto-writes a pair. Primer is written ONLY on the
  // explicit hotkey, and per strand.
  it('selecting a region alone does NOT write primers (V72 decouple)', () => {
    const op0 = mountWithOp();
    fireEvent.click(screen.getByTestId('mock-select-range'));
    const op = S.operations.find((o) => o.id === op0.id);
    const up = op.params.userPrimers;
    expect(up == null || up.length === 0).toBe(true);
  });

  it('Ctrl+R writes a FORWARD-only primer from the selection (V72)', () => {
    const op0 = mountWithOp();
    fireEvent.click(screen.getByTestId('mock-select-range')); // select 10..130
    expect(fireHotkey()).toBe(true); // Ctrl+R
    const op = S.operations.find((o) => o.id === op0.id);
    const p = op.params.userPrimers[0];
    expect(p.source).toBe('edited');
    expect(p.forward).toBeTruthy();
    expect(p.reverse == null || p.reverse === '').toBe(true);
  });

  it('Ctrl+Alt+R writes a REVERSE-only primer from the selection (V72)', () => {
    const op0 = mountWithOp();
    fireEvent.click(screen.getByTestId('mock-select-range'));
    expect(fireHotkey({ alt: true })).toBe(true); // Ctrl+Alt+R
    const op = S.operations.find((o) => o.id === op0.id);
    const p = op.params.userPrimers[0];
    expect(p.source).toBe('edited');
    expect(p.reverse).toBeTruthy();
    expect(p.forward == null || p.forward === '').toBe(true);
  });

  it('forward then reverse accumulate into one pair (V72)', () => {
    const op0 = mountWithOp();
    fireEvent.click(screen.getByTestId('mock-select-range'));
    fireHotkey();             // Ctrl+R  → forward
    fireHotkey({ alt: true }); // Ctrl+Alt+R → reverse
    const op = S.operations.find((o) => o.id === op0.id);
    const p = op.params.userPrimers[0];
    expect(p.forward).toBeTruthy();
    expect(p.reverse).toBeTruthy();
  });

  it('Ctrl+R with no selection does not write (no-op, no crash) (V72)', () => {
    const op0 = mountWithOp();
    fireHotkey(); // no prior selection
    const op = S.operations.find((o) => o.id === op0.id);
    const up = op.params.userPrimers;
    expect(up == null || up.length === 0).toBe(true);
  });

  // V74 — right-click menu item routes through onWritePrimer({direction,
  // start,end}); PcrModeShell writes that strand for the GIVEN range
  // (independent of caret state — no prior hotkey selection needed).
  it('context-menu forward item writes forward primer for its range (V74)', () => {
    const op0 = mountWithOp();
    fireEvent.click(screen.getByTestId('mock-ctx-fwd')); // onWritePrimer fwd 5..140
    const op = S.operations.find((o) => o.id === op0.id);
    const p = op.params.userPrimers[0];
    expect(p.source).toBe('edited');
    expect(p.forward).toBeTruthy();
    expect(p.reverse == null || p.reverse === '').toBe(true);
  });

  it('PcrModeShell enables the near-cursor Tm readout on the viewer (V76)', () => {
    mountWithOp();
    expect(screen.getByTestId('mock-sequence-tab').getAttribute('data-show-tm')).toBe('true');
  });

  it('context-menu reverse item writes reverse primer for its range (V74)', () => {
    const op0 = mountWithOp();
    fireEvent.click(screen.getByTestId('mock-ctx-rev'));
    const op = S.operations.find((o) => o.id === op0.id);
    const p = op.params.userPrimers[0];
    expect(p.source).toBe('edited');
    expect(p.reverse).toBeTruthy();
    expect(p.forward == null || p.forward === '').toBe(true);
  });

  // V80 — plain caret click collapses the selection anchor onto it.
  // Before: onCaretChange only set caretPos, caretAnchor stayed at its
  // initial 0, so EVERY drag-select ran from nucleotide 0 («выделяется
  // всё с первого нуклеотида»). Mirrors ContainerEditorSkeleton.
  it('plain caret click collapses caretAnchor onto the click (V80)', () => {
    mountWithOp();
    const tab = () => screen.getByTestId('mock-sequence-tab');
    expect(tab().getAttribute('data-caret-anchor')).toBe('0');
    fireEvent.click(screen.getByTestId('mock-caret-click')); // onCaretChange(50)
    expect(tab().getAttribute('data-caret-anchor')).toBe('50');
    expect(tab().getAttribute('data-caret-pos')).toBe('50');
  });

  it('caret change with extendSelection does NOT collapse the anchor (V80)', () => {
    mountWithOp();
    fireEvent.click(screen.getByTestId('mock-caret-click'));   // anchor→50, pos→50
    fireEvent.click(screen.getByTestId('mock-caret-extend'));   // pos→80, anchor stays 50
    const tab = screen.getByTestId('mock-sequence-tab');
    expect(tab.getAttribute('data-caret-anchor')).toBe('50');
    expect(tab.getAttribute('data-caret-pos')).toBe('80');
  });
});

/**
 * PRIMER-LIVE-1 — an op authored from two chosen landings already knows its pair.
 *
 * Auto-designing a *different* pair for such an op means the viewer shows one
 * thing, the biolog edits that, and execution runs something else. And locating
 * the pair again with a first-match `indexOf` answers about whichever copy of a
 * repeated site comes first — not the one that was clicked.
 */
describe('PRIMER-LIVE-1 — occurrence PCR shows the pair it will execute', () => {
  //             0         1         2         3
  //             0123456789012345678901234567890123456789
  const TPLSEQ = 'GGGGAAAACCTTTTGGGCGCGCGCTTTTGGAATTCCTTTT';
  const snapshots = {
    forward: {
      id: 'f', name: 'fwd', sequence: 'GAATTCAAAACCTTTTGG', bindingSequence: 'AAAACCTTTTGG',
      tail: 'GAATTC', direction: 'forward', occurrenceKey: 'f#1', start: 4, end: 16,
    },
    reverse: {
      id: 'r', name: 'rev', sequence: 'GGAATTCCAAAA', bindingSequence: 'GGAATTCCAAAA',
      tail: '', direction: 'reverse', occurrenceKey: 'r#1', start: 24, end: 36,
    },
  };
  const stateWith = () => ({
    containers: [{ id: 'c-1', name: 'pTest', sequence: TPLSEQ, circular: true }],
    operations: [{
      id: 'op-1',
      kind: 'pcr',
      inputs: ['c-1'],
      params: {
        templateId: 'c-1',
        occurrenceKeys: ['f#1', 'r#1'],
        primerSnapshots: snapshots,
        productSequence: 'GAATTCAAAACCTTTTGGGCGCGCGCTTTTGGAATTCC',
      },
    }],
    junctions: [],
  });

  it('returns the CHOSEN pair, not an auto-designed one', () => {
    const { pairs, status } = selectPcrPrimers(stateWith(), 'op-1');
    expect(status).toBe('ready');
    expect(pairs).toHaveLength(1);
    expect(pairs[0].forward).toBe('GAATTCAAAACCTTTTGG');
    expect(pairs[0].reverse).toBe('GGAATTCCAAAA');
    expect(pairs[0].fwdBinding).toBe('AAAACCTTTTGG');
    expect(pairs[0].source).toBe('occurrences');
  });

  it('spans come from the chosen landings, never a first-match search', () => {
    const spans = selectPcrSpans(stateWith(), 'op-1');
    expect(spans.primers[0]).toMatchObject({ start: 4, end: 16, direction: 'forward' });
    expect(spans.primers[1]).toMatchObject({ start: 24, end: 36, direction: 'reverse' });
    expect(spans.product.sequence).toBe('GAATTCAAAACCTTTTGGGCGCGCGCTTTTGGAATTCC');
  });

  it('the displayed pair IS the executed pair', () => {
    const st = stateWith();
    const { pairs } = selectPcrPrimers(st, 'op-1');
    const out = executePCR(
      { ...st.operations[0], inputPieces: [] },
      { containers: { 'c-1': st.containers[0] } },
    );
    expect(out.error).toBeUndefined();
    expect(out.outputs[0].sequence.startsWith(pairs[0].forward)).toBe(true);
  });

  it.each([
    ['D', 'ACGTACCTAGCTTGA'],
    ['I', 'ACGTAGACCTAGCTTGA'],
  ])('replays an internal %s from snapshot evidence without inventing scalar Tm', (opCode, binding) => {
    const anchor = 'ACGTGACCTAGCTTGA';
    const reverseBinding = 'GGAATTCCAAAA';
    const reverseTop = 'TTTTGGAATTCC';
    const template = `TT${anchor}${'C'.repeat(8)}${reverseTop}GG`;
    const state = {
      containers: [{ id: 'c-aligned', sequence: template, circular: false }],
      operations: [{
        id: 'op-aligned', kind: 'pcr', inputs: ['c-aligned'],
        params: {
          occurrenceKeys: ['f#aligned', 'r#aligned'],
          primerSnapshots: {
            forward: {
              id: 'f', name: 'fwd', sequence: binding, bindingSequence: binding,
              bindingModel: 'aligned-v1', tail: '', direction: 'forward',
              occurrenceKey: 'f#aligned', start: 2, end: 18,
              segments: [{ start: 2, end: 18 }],
              alignment: alignPrimerBinding(binding, anchor),
            },
            reverse: {
              id: 'r', name: 'rev', sequence: reverseBinding,
              bindingSequence: reverseBinding, bindingModel: 'aligned-v1', tail: '',
              direction: 'reverse', occurrenceKey: 'r#aligned', start: 26, end: 38,
              segments: [{ start: 26, end: 38 }],
              alignment: alignPrimerBinding(reverseBinding, reverseBinding),
            },
          },
        },
      }],
      junctions: [],
    };
    const spans = selectPcrSpans(state, 'op-aligned');
    expect(spans).toBeTruthy();
    expect(spans.product.forward.alignment.counts[opCode]).toBe(1);
    expect(spans.warnings).toContainEqual(expect.objectContaining({
      code: 'gapped-tm-unknown', tm: null,
    }));
    expect(spans.warnings.filter((warning) => warning.code === 'low-tm'
      || warning.code === 'delta-tm')).toEqual([]);
  });
});
