/**
 * primer-row-ux18.test.jsx — WT-UX-18.
 *
 * Auto-derived assembly primers are placeholders (deriveAutoPrimers uses a
 * fixed 20-nt binding, no Tm-tuning), but the panel rendered them like
 * finished primers. PrimerRow now (1) reads auto primers as «черновик»
 * (visible + explicit tooltip) and (2) flags a Tm below the working PCR
 * window (~55–65°) with a ⚠, mirroring the existing `status==='stale'` ⚠.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { PrimerRow } from '../AssemblyPrimersPanel';

afterEach(cleanup);

const actions = { updateAssemblyPrimer: () => {}, removeAssemblyPrimer: () => {} };
const base = {
  id: 'p1', name: 'asm-fwd-1', label: 'asm-fwd-1',
  direction: 'forward', sequence: 'ACGTACGTACGTACGTACGT', gc: 50,
};
const row = (p) => render(
  <PrimerRow p={{ ...base, ...p }} actions={actions} draftId="d" onEdit={() => {}} />,
);

describe('WT-UX-18 — auto = draft + low-Tm warning', () => {
  it('autoMode auto → badge carries draft semantics (visible text + tooltip + data-draft)', () => {
    row({ autoMode: 'auto', tm: 60 });
    const badge = screen.getByTestId('assembly-primer-automode-p1');
    expect(badge.getAttribute('data-draft')).toBe('true');
    expect(badge.textContent).toMatch(/черновик/);
    expect(badge.getAttribute('title')).toMatch(/[Чч]ерновик/);
  });

  it('manual → no draft semantics', () => {
    row({ autoMode: 'manual', tm: 60 });
    const badge = screen.getByTestId('assembly-primer-automode-p1');
    expect(badge.getAttribute('data-draft')).toBeNull();
    expect(badge.textContent).not.toMatch(/черновик/);
  });

  it('tm below the working minimum → ⚠ warning rendered', () => {
    row({ autoMode: 'auto', tm: 45 });
    expect(screen.getByTestId('assembly-primer-tm-warn-p1')).toBeTruthy();
  });

  it('tm within the working range → no ⚠', () => {
    row({ autoMode: 'auto', tm: 60 });
    expect(screen.queryByTestId('assembly-primer-tm-warn-p1')).toBeNull();
  });
});
