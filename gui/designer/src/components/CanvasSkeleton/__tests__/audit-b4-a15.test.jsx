/**
 * audit-b4-a15.test.jsx — MutationModal audit fixes.
 *  A15: MutationModal's Position is read-only so the frozen «Original base» can't
 *      desync from an edited position.
 */
import {
  describe, it, expect, afterEach, vi,
} from 'vitest';
import {
  render, screen, cleanup, fireEvent,
} from '@testing-library/react';
import MutationModal from '../editor/assembly-mode/MutationModal';

afterEach(cleanup);

describe('H2/M2 — MutationModal gates undeliverable / out-of-range positions', () => {
  const SEQ200 = 'ACGT'.repeat(50); // 200 nt

  it('an interior position (no terminal primer reach) shows a warning', () => {
    render(
      <MutationModal sourceName="frag" defaultPosition={100} fromBase="A" sequence={SEQ200} onConfirm={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(screen.getByTestId('mutation-interior-warn')).toBeTruthy();
    // still allowed (warned, not blocked) — the biolog may split later
    expect(screen.getByTestId('mutation-apply').disabled).toBe(false);
  });

  it('an out-of-range position blocks apply + shows an error', () => {
    const onConfirm = vi.fn();
    render(
      <MutationModal sourceName="frag" defaultPosition={250} fromBase="A" sequence={SEQ200} onConfirm={onConfirm} onCancel={vi.fn()} />,
    );
    expect(screen.getByTestId('mutation-error')).toBeTruthy();
    const apply = screen.getByTestId('mutation-apply');
    expect(apply.disabled).toBe(true);
    fireEvent.click(apply);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('a terminal position (in the binding window) is clean', () => {
    render(
      <MutationModal sourceName="frag" defaultPosition={5} fromBase="C" sequence={SEQ200} onConfirm={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(screen.queryByTestId('mutation-interior-warn')).toBeNull();
    expect(screen.queryByTestId('mutation-error')).toBeNull();
    expect(screen.getByTestId('mutation-apply').disabled).toBe(false);
  });

  // V197 (e2e-cloning-hunt) — a whole-plasmid KLD mutagenesis (circular, single
  // segment) places the mutagenic primers BACK-TO-BACK at the mutation, so an
  // interior position IS carried. The «олиги амплифицируют дикий тип» warning is a
  // FALSE alarm on the exact standalone-plasmid KLD workflow the tool supports.
  it('kldApplies → an interior position does NOT warn (KLD carries the mutation)', () => {
    render(
      <MutationModal sourceName="pRing" defaultPosition={100} fromBase="A" sequence={SEQ200} kldApplies onConfirm={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(screen.queryByTestId('mutation-interior-warn')).toBeNull();
    expect(screen.getByTestId('mutation-apply').disabled).toBe(false);
  });

  it('without kldApplies (linear / multi-segment fragment) the interior warning still fires', () => {
    render(
      <MutationModal sourceName="frag" defaultPosition={100} fromBase="A" sequence={SEQ200} onConfirm={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(screen.getByTestId('mutation-interior-warn')).toBeTruthy();
  });
});

describe('A15 — MutationModal Original base tracks the position (reactive)', () => {
  it('editing position re-derives «Original base» + the stored fromBase from the sequence', () => {
    const onConfirm = vi.fn();
    render(
      <MutationModal
        sourceName="frag"
        defaultPosition={0}
        fromBase="A"
        sequence="AACCGGTT"
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );
    // position 0 → base A
    expect(screen.getByTestId('mutation-frombase').textContent).toMatch(/A/);
    // move to position 4 → base G (was frozen at A before the fix)
    fireEvent.change(screen.getByTestId('mutation-position'), { target: { value: '4' } });
    expect(screen.getByTestId('mutation-frombase').textContent).toMatch(/G/);
    fireEvent.click(screen.getByTestId('mutation-apply'));
    expect(onConfirm.mock.calls[0][0]).toMatchObject({ position: 4, fromBase: 'G' });
  });
});
