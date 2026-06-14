/**
 * cut-op-viability-a12.test.jsx — audit A12. The cut preview promised N
 * fragments and kept Execute enabled for ANY cut count, but digest() rejects a
 * single enzyme that cuts >2× (and two enzymes unless each cuts exactly once),
 * so the op failed with zero output. The popup now mirrors that contract: an
 * unviable combo shows ⛔ and disables Execute.
 */
import {
  describe, it, expect, afterEach, vi,
} from 'vitest';
import {
  render, screen, cleanup,
} from '@testing-library/react';
import CutOpPopup from '../canvas/operations/CutOpPopup';

afterEach(cleanup);

const SPACER = 'AAAAAAAAAACCCCCCCCCC';
const threeSiteSeq = `GAATTC${SPACER}GAATTC${SPACER}GAATTC${SPACER}`; // 3× EcoRI
const oneSiteSeq = `GAATTC${SPACER}${SPACER}${SPACER}`; // 1× EcoRI

function renderCut(seq, enzymes, circular = true) {
  const containers = [{
    id: 'c1', name: 'tpl', kind: 'molecule', sequence: seq, topology: { circular },
  }];
  return render(
    <CutOpPopup
      operation={{ id: 'op1', params: { templateId: 'c1', enzymes } }}
      position={{ x: 0, y: 0 }}
      containers={containers}
      onCancel={vi.fn()}
      onExecute={vi.fn()}
    />,
  );
}

describe('CutOpPopup — digest viability gate (A12)', () => {
  it('single enzyme cutting 3× → ⛔ unviable + Execute disabled', () => {
    renderCut(threeSiteSeq, ['EcoRI']);
    expect(screen.getByTestId('cut-op-warn-unviable')).toBeTruthy();
    expect(screen.getByTestId('op-popup-execute').disabled).toBe(true);
  });

  it('single enzyme cutting 1× → viable, no ⛔, Execute enabled', () => {
    renderCut(oneSiteSeq, ['EcoRI']);
    expect(screen.queryByTestId('cut-op-warn-unviable')).toBeNull();
    expect(screen.getByTestId('op-popup-execute').disabled).toBe(false);
  });

  it('L12 — a LINEAR template with 3 cuts is viable (N cuts → N+1 fragments)', () => {
    renderCut(threeSiteSeq, ['EcoRI'], false); // linear
    expect(screen.queryByTestId('cut-op-warn-unviable')).toBeNull();
    expect(screen.getByTestId('op-popup-execute').disabled).toBe(false);
  });
});
