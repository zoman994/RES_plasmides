/**
 * EnzymeCard — the minimal card an enzyme pick opens (REV #2 §10.5). The cut-site scan is a
 * SEPARATE, explicit action (a button ON the card), never an implicit re: query rewrite.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import EnzymeCard from '../EnzymeCard';

afterEach(cleanup);

describe('EnzymeCard', () => {
  it('renders the enzyme name + its recognition site', () => {
    render(<EnzymeCard enzymeId="EcoRI" onScanSites={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByTestId('enzyme-card').textContent).toContain('EcoRI');
    expect(screen.getByTestId('enzyme-card-site').textContent).toContain('GAATTC');
  });
  it('the «Найти сайты» button is a SEPARATE action → onScanSites (not a query rewrite)', () => {
    const onScan = vi.fn();
    render(<EnzymeCard enzymeId="EcoRI" onScanSites={onScan} onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId('enzyme-card-scan'));
    expect(onScan).toHaveBeenCalledTimes(1);
  });
  it('close fires onClose', () => {
    const onClose = vi.fn();
    render(<EnzymeCard enzymeId="EcoRI" onScanSites={vi.fn()} onClose={onClose} />);
    fireEvent.click(screen.getByTestId('enzyme-card-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
  it('renders nothing when no enzyme is selected', () => {
    render(<EnzymeCard enzymeId={null} onScanSites={vi.fn()} onClose={vi.fn()} />);
    expect(screen.queryByTestId('enzyme-card')).toBeNull();
  });
  it('is a non-modal region that focuses itself on open (not a focus-trapping dialog)', () => {
    render(<EnzymeCard enzymeId="EcoRI" onScanSites={vi.fn()} onClose={vi.fn()} />);
    const card = screen.getByTestId('enzyme-card');
    expect(card.getAttribute('role')).toBe('region');
    expect(document.activeElement).toBe(card);
  });
  it('Escape closes the card', () => {
    const onClose = vi.fn();
    render(<EnzymeCard enzymeId="EcoRI" onScanSites={vi.fn()} onClose={onClose} />);
    fireEvent.keyDown(screen.getByTestId('enzyme-card'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
  it('does NOT suppress the focus ring — no inline outline:none (the card takes focus on open, K6-P2b)', () => {
    render(<EnzymeCard enzymeId="EcoRI" onScanSites={vi.fn()} onClose={vi.fn()} />);
    // outline:none would hide the global :focus-visible ring from keyboard users. happy-dom
    // expands the `outline` shorthand into longhands, so the `outline-style` longhand is the
    // honest signal — 'none' when suppressed, '' when absent (element.style.outline itself
    // reconstructs to a misleading 'none none' and is NOT reliable).
    expect(screen.getByTestId('enzyme-card').style.outlineStyle).not.toBe('none');
  });
});
