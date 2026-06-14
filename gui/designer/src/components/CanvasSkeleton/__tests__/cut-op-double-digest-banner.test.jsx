/**
 * cut-op-double-digest-banner.test.jsx — audit RC-2/RC-6. The CutOpPopup
 * double-digest warning was dead code: it read compat.compatible/reason/
 * recommendation, but checkDoubleDigest returns { simultaneous, buffer, temp,
 * warnings[] } — so incompatible/methylation-blocked digests passed silently.
 * Now the banner renders the real warnings array.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import CutOpPopup from '../canvas/operations/CutOpPopup';

afterEach(cleanup);

const tmpl = { id: 'c1', kind: 'molecule', name: 'pUC', sequence: 'GAATTCAAATCTAGAAAAGGATCCAAA'.repeat(2), annotations: [] };
const mount = (enzymes) => render(
  <CutOpPopup
    operation={{ params: { templateId: 'c1', enzymes } }}
    position={{ x: 0, y: 0 }}
    containers={[tmpl]}
    onCancel={vi.fn()}
    onExecute={vi.fn()}
  />,
);

describe('CutOpPopup — double-digest warning surfaces real warnings (RC-2/RC-6)', () => {
  it('shows the banner for a Dam-sensitive pair (EcoRI + XbaI)', () => {
    mount(['EcoRI', 'XbaI']); // XbaI is Dam-sensitive → warnings non-empty
    expect(screen.getByTestId('cut-op-warn-double-digest')).toBeTruthy();
    expect(screen.getByTestId('cut-op-warn-double-digest').textContent).toMatch(/Dam/i);
  });

  it('no banner for a clean compatible pair (EcoRI + BamHI, same buffer/temp, no methylation)', () => {
    mount(['EcoRI', 'BamHI']);
    expect(screen.queryByTestId('cut-op-warn-double-digest')).toBeNull();
  });
});
