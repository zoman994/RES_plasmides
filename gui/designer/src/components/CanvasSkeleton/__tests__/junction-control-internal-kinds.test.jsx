/**
 * junction-control-internal-kinds.test.jsx — audit JC-1/JC-3/JC-4. The per-
 * junction ромб is always an INTERNAL fuse boundary, so it must offer only the
 * internal-fuse methods (overlap / re_ligation) — not the closure-only / single-
 * fragment ones (gibson/kld/blunt/preformed). Re-picking the same kind is a no-op
 * (no gibson→overlap downgrade); switching snaps the new kind's overlap defaults.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import JunctionControl from '../canvas/JunctionControl';

afterEach(cleanup);

const mount = (config, onChange = vi.fn()) => {
  render(
    <JunctionControl
      pairKey="a__b" config={config} position={{ x: 0, y: 0 }}
      onChange={onChange} onClose={vi.fn()}
    />,
  );
  return onChange;
};

describe('JunctionControl — internal-fuse method filter (JC-1)', () => {
  it('offers only overlap + re_ligation; not gibson/kld/blunt/preformed', () => {
    mount({ method: 'overlap_pcr' });
    expect(screen.getByTestId('junction-popover-kind-overlap')).toBeTruthy();
    expect(screen.getByTestId('junction-popover-kind-re_ligation')).toBeTruthy();
    expect(screen.queryByTestId('junction-popover-kind-golden_gate')).toBeNull();
    expect(screen.queryByTestId('junction-popover-kind-kld')).toBeNull();
    expect(screen.queryByTestId('junction-popover-kind-ligation')).toBeNull();
    expect(screen.queryByTestId('junction-popover-kind-preformed')).toBeNull();
  });

  it('re-picking the displayed kind is a no-op (JC-3 — no silent downgrade)', () => {
    const onChange = mount({ method: 'overlap_pcr' }); // kind 'overlap'
    fireEvent.click(screen.getByTestId('junction-popover-kind-overlap'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('switching method snaps the new kind defaults (JC-4 — no stale overlapLength)', () => {
    const onChange = mount({ method: 'overlap_pcr', overlapLength: 30 });
    fireEvent.click(screen.getByTestId('junction-popover-kind-re_ligation'));
    expect(onChange).toHaveBeenCalledTimes(1);
    const patch = onChange.mock.calls[0][0];
    expect(patch.method).toBe('restriction');
    expect(Object.keys(patch).length).toBeGreaterThan(1); // params snapped, not just method
  });
});
