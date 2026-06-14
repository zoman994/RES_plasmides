/**
 * audit-b4-a15.test.jsx — two small audit fixes.
 *  B4: CutOpPopup shows a methylation caution for ANY selected Dam/Dcm-sensitive
 *      enzyme (was gated to exactly 2 enzymes).
 *  A15: MutationModal's Position is read-only so the frozen «Original base» can't
 *      desync from an edited position.
 */
import {
  describe, it, expect, afterEach, vi,
} from 'vitest';
import {
  render, screen, cleanup, fireEvent,
} from '@testing-library/react';
import CutOpPopup from '../canvas/operations/CutOpPopup';
import MutationModal from '../editor/assembly-mode/MutationModal';

afterEach(cleanup);

const SPACER = 'AAAAAAAAAACCCCCCCCCC';

describe('B4 — CutOpPopup methylation caution for a single sensitive enzyme', () => {
  function renderCut(seq, enzymes) {
    return render(
      <CutOpPopup
        operation={{ id: 'op1', params: { templateId: 'c1', enzymes } }}
        position={{ x: 0, y: 0 }}
        containers={[{ id: 'c1', name: 't', kind: 'molecule', sequence: seq, topology: { circular: true } }]}
        onCancel={vi.fn()}
        onExecute={vi.fn()}
      />,
    );
  }
  it('a single Dam-sensitive enzyme (XbaI) surfaces the caution', () => {
    // one XbaI site (TCTAGA) → viable single cut + Dam caution.
    renderCut(`TCTAGA${SPACER}${SPACER}${SPACER}`, ['XbaI']);
    const warn = screen.getByTestId('cut-op-warn-methylation');
    expect(warn).toBeTruthy();
    expect(warn.textContent).toMatch(/XbaI/);
    expect(warn.textContent).toMatch(/Dam/);
  });
  it('a non-sensitive enzyme (EcoRI) shows no methylation caution', () => {
    renderCut(`GAATTC${SPACER}${SPACER}${SPACER}`, ['EcoRI']);
    expect(screen.queryByTestId('cut-op-warn-methylation')).toBeNull();
  });
});

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
