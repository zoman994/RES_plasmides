/**
 * op-group-picker-kld-gate.test.jsx — audit kld AM-1/AM-3. The op-group picker
 * only ever opens on ≥2 selected pieces, and KLD is a single-template
 * self-closure reaction — so KLD must NOT be offered here (it stays only in
 * CircularizeModal, gated to a single fragment). The other join methods remain.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import OpGroupPicker from '../OpGroupPicker';

afterEach(cleanup);

describe('OpGroupPicker — KLD not offered (single-template only)', () => {
  const mount = (topology = 'circular') => render(
    <OpGroupPicker pieceIds={['a', 'b']} zoneFinalTopology={topology} onConfirm={vi.fn()} onCancel={vi.fn()} />,
  );

  it('does not offer KLD', () => {
    mount();
    expect(screen.queryByTestId('op-group-kind-kld')).toBeNull();
  });

  it('still offers the multi-fragment join methods', () => {
    mount();
    expect(screen.getByTestId('op-group-kind-overlap_pcr')).toBeTruthy();
    expect(screen.getByTestId('op-group-kind-gibson')).toBeTruthy();
    expect(screen.getByTestId('op-group-kind-golden_gate')).toBeTruthy();
    expect(screen.getByTestId('op-group-kind-restriction')).toBeTruthy();
  });
});
