import 'fake-indexeddb/auto';
import {
  act, cleanup, fireEvent, render, screen,
} from '@testing-library/react';
import {
  afterEach, beforeEach, describe, expect, it, vi,
} from 'vitest';

vi.mock('../../Library/inspector/tabs/SequenceTab', () => ({
  default: (props) => (
    <div data-testid="mock-seq-tab">
      <button
        type="button"
        data-testid="fire-aa-click"
        onClick={() => props.onAAClick?.({
          aa: 'K', codon: 'AAA', aaIndex: 101, strand: 1, frame: 0,
          regionId: 'cds-1', genomicPositions: [300, 301, 302], displayAnchor: 301,
        })}
      >AA K101</button>
      <button
        type="button"
        data-testid="fire-aa-far-splice"
        onClick={() => props.onAAClick?.({
          aa: 'K', codon: 'AAA', aaIndex: 2, strand: 1, frame: 0,
          regionId: 'cds-splice', genomicPositions: [3, 53, 54], displayAnchor: 53,
        })}
      >AA splice K2</button>
    </div>
  ),
}));

import EditorWindowShell from '../editor/EditorWindowShell';
import {
  SkeletonProvider, useSkeletonActions, useSkeletonState,
} from '../store/skeleton-context';
import { bootstrapStore } from '../../../store';

const TEMPLATE = `ATG${'ACG'.repeat(99)}AAA${'TGC'.repeat(99)}TAA`;
const FAR_SPLICE_TEMPLATE = (() => {
  const bases = Array.from({ length: 120 }, () => 'C');
  for (const position of [3, 53, 54]) bases[position] = 'A';
  return bases.join('');
})();

let actions;
let liveState;

function Harness() {
  actions = useSkeletonActions();
  liveState = useSkeletonState();
  return <EditorWindowShell />;
}

function mount({ circular = true, sequence = TEMPLATE } = {}) {
  render(<SkeletonProvider><Harness /></SkeletonProvider>);
  act(() => {
    actions.addContainer({
      id: 'aa-parent-container', kind: 'molecule', name: 'AA parent',
      sequence, annotations: [], topology: { circular: true },
    });
  });
  act(() => {
    actions.zoneDispatch({
      type: 'CREATE_ZONE',
      zone: { name: 'AA zone', bounds: { x: 0, y: 0, width: 600, height: 400 } },
    });
  });
  const zoneId = liveState.zones[liveState.zones.length - 1].id;
  act(() => {
    actions.zoneDispatch({ type: 'SET_ZONE_TOPOLOGY', zoneId, circular });
    actions.insertSegment(zoneId, 'aa-parent-container', 0, sequence.length, false);
    actions.openEditorAssemblyTab(zoneId);
  });
  return zoneId;
}

afterEach(() => {
  cleanup();
  actions = null;
  liveState = null;
});
beforeEach(() => { try { bootstrapStore(); } catch { /* idempotent */ } });

describe('AA mutation dialog in the assembly shell', () => {
  it('shows codon intent and one Apply commits exactly one complete transaction, then closes', () => {
    const zoneId = mount();
    const parent = liveState.pieces.find((piece) => piece.zoneId === zoneId);
    const parentSnapshot = structuredClone(parent);

    fireEvent.click(screen.getByTestId('fire-aa-click'));
    expect(screen.getByTestId('aa-mutation-dialog')).toBeTruthy();
    expect(screen.getByTestId('aa-mutation-source').textContent).toContain('K101');
    expect(screen.getByTestId('aa-mutation-source').textContent).toContain('AAA');
    fireEvent.change(screen.getByTestId('aa-mutation-target-aa'), { target: { value: 'E' } });
    expect(screen.getByTestId('aa-mutation-target-codon').value).toBe('GAA');
    expect(screen.getByTestId('aa-mutation-change-count').textContent).toContain('1');

    fireEvent.click(screen.getByTestId('aa-mutation-apply'));
    expect(screen.queryByTestId('aa-mutation-dialog')).toBeNull();
    expect(liveState.pieces.find((piece) => piece.id === parent.id)).toEqual(parentSnapshot);
    expect(liveState.pieces.filter((piece) => piece.variantOf === parent.id)).toHaveLength(1);
    const reactions = liveState.operations.filter((op) => op.kind === 'mutagenesis');
    expect(reactions).toHaveLength(1);
    // Inserting a sourced piece may already have placed its ordinary assembly
    // pair in the pool. The AA transaction itself must contribute exactly one
    // new pair, identified by its reaction id.
    const primers = liveState.assemblyDraftPrimers[zoneId]
      .filter((primer) => primer.reactionId === reactions[0].id);
    expect(primers).toHaveLength(2);
    expect(primers.every((primer) => primer.bindingModel === 'aligned-v1')).toBe(true);
  });

  it('Cancel and Escape close without changing pieces, reactions or primers', () => {
    const zoneId = mount();
    const counts = () => ({
      pieces: liveState.pieces.length,
      operations: liveState.operations.length,
      primers: (liveState.assemblyDraftPrimers[zoneId] || []).length,
    });
    const before = counts();

    fireEvent.click(screen.getByTestId('fire-aa-click'));
    fireEvent.click(screen.getByTestId('aa-mutation-cancel'));
    expect(screen.queryByTestId('aa-mutation-dialog')).toBeNull();
    expect(counts()).toEqual(before);

    fireEvent.click(screen.getByTestId('fire-aa-click'));
    fireEvent.keyDown(screen.getByTestId('aa-mutation-dialog'), { key: 'Escape' });
    expect(screen.queryByTestId('aa-mutation-dialog')).toBeNull();
    expect(counts()).toEqual(before);
  });

  it('keeps a far-splice two-edit dialog open because one KLD pair does not encode every nucleotide edit', () => {
    const zoneId = mount({ sequence: FAR_SPLICE_TEMPLATE });
    const before = {
      pieces: liveState.pieces.length,
      operations: liveState.operations.length,
      primers: (liveState.assemblyDraftPrimers[zoneId] || []).length,
    };

    fireEvent.click(screen.getByTestId('fire-aa-far-splice'));
    fireEvent.change(screen.getByTestId('aa-mutation-target-aa'), { target: { value: 'D' } });
    fireEvent.click(screen.getByTestId('aa-mutation-apply'));

    expect(screen.getByTestId('aa-mutation-dialog')).toBeTruthy();
    expect(screen.getByTestId('aa-mutation-error').textContent).toMatch(/праймер|primer/i);
    expect({
      pieces: liveState.pieces.length,
      operations: liveState.operations.length,
      primers: (liveState.assemblyDraftPrimers[zoneId] || []).length,
    }).toEqual(before);
  });

  it('keeps the dialog open and reports an honest blocker when no physical pair exists', () => {
    const zoneId = mount({ circular: false });
    const before = {
      pieces: liveState.pieces.length,
      operations: liveState.operations.length,
      primers: (liveState.assemblyDraftPrimers[zoneId] || []).length,
    };
    fireEvent.click(screen.getByTestId('fire-aa-click'));
    fireEvent.change(screen.getByTestId('aa-mutation-target-aa'), { target: { value: 'E' } });
    fireEvent.click(screen.getByTestId('aa-mutation-apply'));

    expect(screen.getByTestId('aa-mutation-dialog')).toBeTruthy();
    expect(screen.getByTestId('aa-mutation-error').textContent).toMatch(/праймер|primer/i);
    expect({
      pieces: liveState.pieces.length,
      operations: liveState.operations.length,
      primers: (liveState.assemblyDraftPrimers[zoneId] || []).length,
    }).toEqual(before);
    const errorStyle = screen.getByTestId('aa-mutation-error').getAttribute('style');
    expect(errorStyle).toContain('color: var(--danger-fg)');
    expect(errorStyle).toContain('background: var(--danger-bg)');
    expect(errorStyle).not.toContain('var(--danger-surface)');
  });
});
