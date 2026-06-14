/**
 * gg-internal-site-guard.test.jsx — audit GG-1/GG-2. A Type IIS (Golden Gate)
 * assembly fails if any fragment carries an INTERNAL recognition site — the
 * enzyme cuts the fragment internally. The adapter never checked this (it joined
 * by Gibson-style homology and accepted internal-site fragments); the popup
 * offered no warning. Now the adapter blocks it and the popup warns + suggests
 * an alternative enzyme.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { executeGoldenGate } from '../canvas/operations/adapters/golden-gate';
import GoldenGateOpPopup from '../canvas/operations/GoldenGateOpPopup';

afterEach(cleanup);

// f1 carries an internal BsaI site (GGTCTC) but no other Type IIS site; f2 clean.
const F1 = { id: 'f1', name: 'frag1', sequence: 'AAAGGTCTCAAATTTCCCGGGAAA', topology: { circular: false }, annotations: [] };
const F2 = { id: 'f2', name: 'frag2', sequence: 'TTTAAACCCGGGTTTAAACCCGGG', topology: { circular: false }, annotations: [] };

describe('executeGoldenGate — internal-site guard (GG-1)', () => {
  it('blocks assembly when a fragment has an internal BsaI site, suggesting an alternative', () => {
    const ctx = { containers: { f1: F1, f2: F2 } };
    const r = executeGoldenGate({ id: 'op', params: { fragmentIds: ['f1', 'f2'], enzyme: 'BsaI', circular: true } }, ctx);
    expect(r.error).toBeTruthy();
    expect(r.error).toMatch(/BsaI/);
    expect(r.error).toMatch(/попробуйте/); // suggested alternative enzyme
  });

  it('proceeds for a clean enzyme with no internal sites', () => {
    const ctx = { containers: { f1: F1, f2: F2 } };
    // BpiI recognition (GAAGAC) is absent from both → assembly proceeds.
    const r = executeGoldenGate({ id: 'op', params: { fragmentIds: ['f1', 'f2'], enzyme: 'BpiI', circular: true } }, ctx);
    expect(r.error).toBeUndefined();
    expect(r.outputs).toHaveLength(1);
  });
});

describe('GoldenGateOpPopup — internal-site warning + enzyme switch (GG-2)', () => {
  it('warns about internal sites and switching to the suggested enzyme clears it', () => {
    render(
      <GoldenGateOpPopup
        operation={{ params: { fragmentIds: ['f1', 'f2'], enzyme: 'BsaI', circular: true } }}
        position={{ x: 0, y: 0 }}
        containers={[F1, F2]}
        onCancel={vi.fn()}
        onExecute={vi.fn()}
      />,
    );
    expect(screen.getByTestId('gg-op-warn-internal-site')).toBeTruthy();
    fireEvent.click(screen.getByTestId('gg-op-switch-enzyme')); // → alternative enzyme
    expect(screen.queryByTestId('gg-op-warn-internal-site')).toBeNull();
  });
});
