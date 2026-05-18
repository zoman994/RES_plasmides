/**
 * zone-link-badge.test.jsx — T8 K7 (§5.5, DEC-T8-08/10).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import ZoneLinkBadge from '../canvas/ZoneLinkBadge';

afterEach(cleanup);

describe('T8 K7 — ZoneLinkBadge', () => {
  it('shows ← {zone} label + click fires onClick', () => {
    const onClick = vi.fn();
    render(<ZoneLinkBadge sourceZoneName="Зона B" pieceCount={1} onClick={onClick} />);
    const b = screen.getByTestId('zone-link-badge');
    expect(b.textContent).toMatch(/Зона B/);
    expect(b.textContent).toMatch(/←/);
    fireEvent.click(b);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('shows the count chip only when pieceCount > 1', () => {
    const { rerender } = render(
      <ZoneLinkBadge sourceZoneName="B" pieceCount={1} onClick={() => {}} />,
    );
    expect(screen.queryByTestId('zone-link-badge-count')).toBeNull();
    rerender(<ZoneLinkBadge sourceZoneName="B" pieceCount={3} onClick={() => {}} />);
    expect(screen.getByTestId('zone-link-badge-count').textContent).toBe('3');
  });

  it('tooltip mentions the zone + count', () => {
    render(<ZoneLinkBadge sourceZoneName="Зона C" pieceCount={2} onClick={() => {}} />);
    const t = screen.getByTestId('zone-link-badge').getAttribute('title');
    expect(t).toMatch(/Зона C/);
    expect(t).toMatch(/2/);
  });

  it('click does not bubble (stopPropagation — header drag guard)', () => {
    const onClick = vi.fn();
    const parentClick = vi.fn();
    render(
      <div onClick={parentClick}>
        <ZoneLinkBadge sourceZoneName="B" pieceCount={1} onClick={onClick} />
      </div>,
    );
    fireEvent.click(screen.getByTestId('zone-link-badge'));
    expect(onClick).toHaveBeenCalled();
    expect(parentClick).not.toHaveBeenCalled();
  });
});
