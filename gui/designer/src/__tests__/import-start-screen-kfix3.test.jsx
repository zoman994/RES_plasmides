/**
 * Kfix-3 — F-E ActionsBar multi-mode + F-I single-file MetaColumn persistent.
 *
 * F-E: «Аннотировать → в библиотеку» button removed; only «На канвас»
 *      (disabled) + «В библиотеку (N)» remain. Per-row checkbox controls
 *      annotation per item.
 * F-I: MetaColumn renders status text in info-card after canvas/library/
 *      annotate (does not unmount).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import ActionsBar from '../components/ImportStartScreen/ActionsBar';
import MetaColumn from '../components/ImportStartScreen/MetaColumn';

describe('F-E ActionsBar multi-mode — Аннотировать button removed', () => {
  it('multi mode renders only canvas-disabled + library-batch (no annotate-batch)', () => {
    const { queryByTestId, getByTestId } = render(
      <ActionsBar mode="multi" onAction={vi.fn()} count={3} />
    );
    expect(getByTestId('action-canvas-disabled')).toBeTruthy();
    expect(getByTestId('action-library-batch')).toBeTruthy();
    expect(queryByTestId('action-annotate-batch')).toBeNull();
  });
});

describe('F-I MetaColumn lastActionStatus', () => {
  const baseProps = {
    length: 2686,
    topology: 'circular',
    onTopologyChange: vi.fn(),
    originOffset: 1,
    onOriginOffsetChange: vi.fn(),
    onApplyOrigin: vi.fn(),
    name: 'pUC19',
    onNameChange: vi.fn(),
    annotations: [],
  };

  it('renders «✓ Добавлено на канвас» when status.type=canvas', () => {
    const { getByTestId } = render(
      <MetaColumn {...baseProps} lastActionStatus={{ type: 'canvas' }} />
    );
    expect(getByTestId('meta-last-action-status').textContent).toMatch(/Добавлено на канвас/);
  });

  it('renders «✓ В библиотеке» when status.type=library', () => {
    const { getByTestId } = render(
      <MetaColumn {...baseProps} lastActionStatus={{ type: 'library' }} />
    );
    expect(getByTestId('meta-last-action-status').textContent).toMatch(/В библиотеке/);
  });

  it('renders annotate delta when status.type=annotate', () => {
    const { getByTestId } = render(
      <MetaColumn
        {...baseProps}
        lastActionStatus={{ type: 'annotate', regionsBefore: 5, regionsAfter: 12 }}
      />
    );
    const text = getByTestId('meta-last-action-status').textContent;
    expect(text).toMatch(/\+7 регионов/);
    expect(text).toMatch(/5 → 12/);
  });

  it('omits status row when lastActionStatus is null', () => {
    const { queryByTestId } = render(
      <MetaColumn {...baseProps} lastActionStatus={null} />
    );
    expect(queryByTestId('meta-last-action-status')).toBeNull();
  });
});

// Quick smoke that the legacy 3-button assertion no longer applies — the
// removed test from the spec stayed inside import-start-screen.test.jsx as
// a passing test using getByText('Действия ▾'). Confirm here the button
// «Аннотировать → в библиотеку» genuinely does not appear in the rendered
// markup (helps any downstream visual grep).
describe('F-E negative assertion', () => {
  it('multi-mode footer text does not contain «Аннотировать → в библиотеку»', () => {
    const { container } = render(
      <ActionsBar mode="multi" onAction={vi.fn()} count={2} />
    );
    expect(container.textContent).not.toMatch(/Аннотировать → в библиотеку/);
  });
});
