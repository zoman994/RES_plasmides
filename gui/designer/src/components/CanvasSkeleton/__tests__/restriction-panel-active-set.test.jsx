/**
 * RS-C4 — RestrictionPanel «Активный набор» dropdown: pick an enzyme set
 * (presets + user sets) to restrict which enzymes' sites are visible everywhere
 * (the allow-list applied at both chokepoints via selectActiveSetEnzymes).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import RestrictionPanel from '../RestrictionPanel';
import { useStore, selectActiveSetEnzymes } from '../../../store';

beforeEach(() => {
  useStore.setState((s) => {
    s.showReSites = true; s.reFilter = 'all'; s.reActiveSet = null;
    s.customEnzymes.sets = {};
  });
});
afterEach(cleanup);

describe('RestrictionPanel — active set (RS-C4)', () => {
  it('renders the active-set dropdown with preset options', () => {
    render(<RestrictionPanel />);
    const sel = screen.getByTestId('skeleton-restriction-active-set');
    const opts = [...sel.querySelectorAll('option')].map((o) => o.textContent);
    expect(opts).toContain('— все ферменты —');
    expect(opts.some((t) => /Частые рестриктазы/.test(t))).toBe(true);
  });

  it('choosing a preset set stores it as the active set (allow-list resolves)', () => {
    render(<RestrictionPanel />);
    fireEvent.change(screen.getByTestId('skeleton-restriction-active-set'), { target: { value: 'preset:frequent' } });
    expect(useStore.getState().reActiveSet.id).toBe('preset:frequent');
    const allow = selectActiveSetEnzymes(useStore.getState());
    expect(allow).toContain('EcoRI');
    expect(allow).toContain('BamHI');
  });

  it('choosing «— все —» clears the active set', () => {
    useStore.getState().setReActiveSet({ id: 'preset:frequent', name: 'X', enzymes: ['EcoRI'] });
    render(<RestrictionPanel />);
    fireEvent.change(screen.getByTestId('skeleton-restriction-active-set'), { target: { value: '' } });
    expect(useStore.getState().reActiveSet).toBeNull();
    expect(selectActiveSetEnzymes(useStore.getState())).toBeNull();
  });

  it('a user set appears in the dropdown', () => {
    useStore.setState((s) => { s.customEnzymes.sets = { u1: { id: 'u1', name: 'Мой', enzymes: ['NotI'] } }; });
    render(<RestrictionPanel />);
    const opts = [...screen.getByTestId('skeleton-restriction-active-set').querySelectorAll('option')].map((o) => o.textContent);
    expect(opts.some((t) => /Мой \(свой\)/.test(t))).toBe(true);
  });
});
