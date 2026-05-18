/**
 * variant-ui.test.jsx — T9 K9/K10/K11.
 * VariantGroupBadge, MaterializeCloneModal, BranchingVisual (3 kinds).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  render, screen, cleanup, fireEvent, within,
} from '@testing-library/react';
import VariantGroupBadge from '../canvas/VariantGroupBadge';
import MaterializeCloneModal from '../canvas/MaterializeCloneModal';
import BranchingVisual from '../canvas/zone-sequence-mode/BranchingVisual';

afterEach(cleanup);

describe('T9 K9 — VariantGroupBadge', () => {
  const state = {
    pieces: [
      { id: 'p1', variantGroupId: 'vg', createdAt: 1 },
      { id: 'p2', variantGroupId: 'vg', createdAt: 2 },
    ],
  };

  it('renders nothing when piece has no variantGroupId', () => {
    const { container } = render(
      <VariantGroupBadge piece={{ id: 'x', variantGroupId: null }} state={state} dispatch={vi.fn()} />,
    );
    expect(container.querySelector('[data-testid="variant-group-badge"]')).toBeNull();
  });

  it('shows «Вариант N из M» and click dispatches HIGHLIGHT_VARIANT_GROUP', () => {
    const dispatch = vi.fn();
    render(
      <VariantGroupBadge piece={state.pieces[0]} state={state} dispatch={dispatch} />,
    );
    const b = screen.getByTestId('variant-group-badge');
    expect(b.getAttribute('title')).toMatch(/Вариант 1 из 2/);
    fireEvent.click(b);
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'HIGHLIGHT_VARIANT_GROUP', variantGroupId: 'vg' }),
    );
  });
});

describe('T9 K10 — MaterializeCloneModal', () => {
  const op = { id: 'op1', kind: 'gibson' };
  const original = { id: 'prod', name: 'gibson-product' };

  it('default 1 clone; confirm passes clones array', () => {
    const onConfirm = vi.fn();
    render(
      <MaterializeCloneModal
        operation={op}
        originalContainer={original}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );
    const m = screen.getByTestId('materialize-clone-modal');
    fireEvent.click(within(m).getByTestId('materialize-confirm'));
    expect(onConfirm).toHaveBeenCalledWith({ clones: [{ label: expect.any(String) }] });
  });

  it('count change to 4 → 4 label fields; confirm 4 clones', () => {
    const onConfirm = vi.fn();
    render(
      <MaterializeCloneModal
        operation={op}
        originalContainer={original}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );
    const m = screen.getByTestId('materialize-clone-modal');
    fireEvent.change(within(m).getByTestId('materialize-count'), { target: { value: '4' } });
    expect(within(m).getAllByTestId('materialize-label')).toHaveLength(4);
    fireEvent.click(within(m).getByTestId('materialize-confirm'));
    expect(onConfirm.mock.calls[0][0].clones).toHaveLength(4);
  });

  it('count clamps to 1..96', () => {
    render(
      <MaterializeCloneModal operation={op} originalContainer={original} onConfirm={vi.fn()} onCancel={vi.fn()} />,
    );
    const input = within(screen.getByTestId('materialize-clone-modal')).getByTestId('materialize-count');
    fireEvent.change(input, { target: { value: '999' } });
    expect(screen.getAllByTestId('materialize-label')).toHaveLength(96);
    fireEvent.change(input, { target: { value: '0' } });
    expect(screen.getAllByTestId('materialize-label')).toHaveLength(1);
  });

  it('Esc + backdrop + Cancel all close (ui-interactions)', () => {
    const onCancel = vi.fn();
    render(
      <MaterializeCloneModal operation={op} originalContainer={original} onConfirm={vi.fn()} onCancel={onCancel} />,
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId('materialize-clone-modal')); // backdrop
    expect(onCancel).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByTestId('materialize-cancel'));
    expect(onCancel).toHaveBeenCalledTimes(3);
  });
});

describe('T9 K11 — BranchingVisual 3 kinds', () => {
  const zone = { id: 'z1' };
  const fin = (id) => ({ id, kind: 'molecule', zoneId: 'z1', topology: { circular: false } });

  it('clones kind → vertical stack + «{n} клонов»', () => {
    const state = {
      zones: [zone],
      containers: [fin('f1'), fin('f2'), fin('f3')],
      operations: [{
        id: 'op', outputs: ['f1'], inputPieces: [],
        materializedClones: [{ cloneId: 'f1' }, { cloneId: 'f2' }, { cloneId: 'f3' }],
      }],
      junctions: [], pieces: [],
    };
    render(<BranchingVisual finals={state.containers} state={state} zoneId="z1" />);
    const root = screen.getByTestId('zone-seq-branching');
    expect(root.getAttribute('data-kind')).toBe('clones');
    expect(root.textContent).toMatch(/3 клонов/);
    expect(screen.getAllByTestId('zone-seq-branch')).toHaveLength(3);
  });

  it('design-variants kind → Y-fork + «{n} вариантов»', () => {
    const state = {
      zones: [zone],
      containers: [fin('f1'), fin('f2')],
      pieces: [{ id: 'p1', variantGroupId: 'vg' }, { id: 'p2', variantGroupId: 'vg' }],
      operations: [
        { id: 'o1', outputs: ['f1'], inputPieces: ['p1'], materializedClones: null },
        { id: 'o2', outputs: ['f2'], inputPieces: ['p2'], materializedClones: null },
      ],
      junctions: [],
    };
    render(<BranchingVisual finals={state.containers} state={state} zoneId="z1" />);
    const root = screen.getByTestId('zone-seq-branching');
    expect(root.getAttribute('data-kind')).toBe('design-variants');
    expect(root.textContent).toMatch(/2 вариантов/);
  });

  it('independent kind → side-by-side + «{n} финалов» (T7 back-compat)', () => {
    const state = {
      zones: [zone],
      containers: [fin('f1'), fin('f2')],
      pieces: [], operations: [], junctions: [],
    };
    render(<BranchingVisual finals={state.containers} state={state} zoneId="z1" />);
    const root = screen.getByTestId('zone-seq-branching');
    expect(root.getAttribute('data-kind')).toBe('independent');
    expect(screen.getAllByTestId('zone-seq-branch')).toHaveLength(2);
  });

  it('≤1 final → renders nothing', () => {
    const { container } = render(
      <BranchingVisual finals={[{ id: 'f1' }]} state={{ zones: [], containers: [], pieces: [], operations: [], junctions: [] }} zoneId="z1" />,
    );
    expect(container.querySelector('[data-testid="zone-seq-branching"]')).toBeNull();
  });
});
