/**
 * SiteDuplex — both strands + recognition site + cut positions + overhang.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import SiteDuplex from '../SiteDuplex';

afterEach(cleanup);

const topText = () => screen.getByTestId('rs-duplex-top').textContent;
const botText = () => screen.getByTestId('rs-duplex-bottom').textContent;

describe('SiteDuplex', () => {
  it('5′ overhang (EcoRI): both strands + overhang label', () => {
    render(<SiteDuplex site="GAATTC" cut={[1, 5]} />);
    expect(topText()).toContain('GAATTC'); // top strand
    expect(botText()).toContain('CTTAAG'); // bottom = complement
    expect(screen.getByTestId('rs-duplex-label').textContent).toBe(
      '5′-выступ AATT · разрез: верх после 1 нт · низ после 5 нт',
    );
    expect(screen.getByTestId('rs-duplex-label').style.fontSize).toBe('11px');
    const cutMark = screen.getByTestId('rs-duplex-top').querySelector('[aria-hidden="true"]');
    expect(cutMark.style.background).toBe('var(--text-primary)');
  });

  it('3′ overhang (PstI): label shows 3′-выступ TGCA', () => {
    render(<SiteDuplex site="CTGCAG" cut={[5, 1]} />);
    expect(screen.getByTestId('rs-duplex-label').textContent).toMatch(/3′-выступ TGCA/);
  });

  it('blunt (EcoRV): label says тупой', () => {
    render(<SiteDuplex site="GATATC" cut={[3, 3]} />);
    expect(screen.getByTestId('rs-duplex-label').textContent).toMatch(/тупой/);
  });

  it('renders nothing for a missing site / cut', () => {
    const { container } = render(<SiteDuplex site="" cut={[1, 5]} />);
    expect(container.querySelector('[data-testid="rs-site-duplex"]')).toBeNull();
  });

  it('fails closed when a cut boundary is outside the recognition site', () => {
    const { container } = render(<SiteDuplex site="GAATTC" cut={[1, 7]} />);
    expect(container.querySelector('[data-testid="rs-site-duplex"]')).toBeNull();
  });
});
