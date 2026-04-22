/**
 * Sprint X K6 — ActionBar renders the self-closure mode badge when any primer
 * carries purpose: 'self-closure' (V24 single-circular fragment).
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ActionBar from '../components/ActionBar';

describe('ActionBar — self-closure badge', () => {
  it('renders self-closure badge when any primer has purpose=self-closure', () => {
    const primers = [
      { direction: 'forward', purpose: 'self-closure' },
      { direction: 'reverse', purpose: 'self-closure' },
    ];
    render(
      <ActionBar
        primerCount={1}
        primers={primers}
        onExportProtocol={() => {}}
        onExportGenBank={() => {}}
        onOrderOligos={() => {}}
        onComplete={() => {}}
        completed={false}
      />
    );
    const badge = screen.getByTestId('self-closure-badge');
    expect(badge.textContent).toMatch(/Self-closure/i);
    expect(badge.textContent).toMatch(/\+30 bp/);
  });

  it('does NOT render badge for regular overlap primers', () => {
    const primers = [
      { direction: 'forward', purpose: null },
      { direction: 'reverse', purpose: null },
    ];
    render(
      <ActionBar
        primerCount={1}
        primers={primers}
        onExportProtocol={() => {}}
        onExportGenBank={() => {}}
        onOrderOligos={() => {}}
        onComplete={() => {}}
        completed={false}
      />
    );
    expect(screen.queryByTestId('self-closure-badge')).toBeNull();
  });

  it('does NOT render badge when ActionBar is hidden (completed)', () => {
    const primers = [{ purpose: 'self-closure' }];
    const { container } = render(
      <ActionBar primerCount={1} primers={primers} completed={true}
        onExportProtocol={() => {}} onExportGenBank={() => {}}
        onOrderOligos={() => {}} onComplete={() => {}} />
    );
    expect(container.firstChild).toBeNull();
  });
});
