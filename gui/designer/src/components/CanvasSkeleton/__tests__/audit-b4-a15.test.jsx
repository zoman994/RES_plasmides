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
