/**
 * Icon — BodgeGene icon library (adopted from the design-system package).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { Icon, ICON_GROUPS } from '../Icon';

afterEach(cleanup);

describe('Icon', () => {
  it('renders a 24-grid SVG for a known chrome glyph', () => {
    const { container } = render(<Icon name="home" />);
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
    expect(svg.getAttribute('viewBox')).toBe('0 0 24 24');
    expect(svg.getAttribute('width')).toBe('16'); // default size
    expect(svg.querySelectorAll('path').length).toBeGreaterThan(0);
  });

  it('inherits colour via currentColor (stroke) and is presentational by default', () => {
    const { container } = render(<Icon name="library" />);
    const svg = container.querySelector('svg');
    expect(svg.getAttribute('stroke')).toBe('currentColor');
    expect(svg.getAttribute('fill')).toBe('none');
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.getAttribute('role')).toBe('presentation');
  });

  it('renders nothing for an unknown name (no broken glyph)', () => {
    const { container } = render(<Icon name="totally-not-an-icon" />);
    expect(container.querySelector('svg')).toBeNull();
  });

  it('filled variant uses fill=currentColor, stroke=none', () => {
    const { container } = render(<Icon name="home" filled />);
    const svg = container.querySelector('svg');
    expect(svg.getAttribute('fill')).toBe('currentColor');
    expect(svg.getAttribute('stroke')).toBe('none');
  });

  it('filled falls back to the outline glyph when no filled variant exists', () => {
    // `dna` has no filled silhouette → still renders (outline).
    const { container } = render(<Icon name="dna" filled />);
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
    expect(svg.getAttribute('stroke')).toBe('currentColor'); // outline fallback
  });

  it('title makes it an accessible image with a label', () => {
    const { container } = render(<Icon name="settings" title="Настройки" />);
    const svg = container.querySelector('svg');
    expect(svg.getAttribute('role')).toBe('img');
    expect(svg.getAttribute('aria-label')).toBe('Настройки');
    expect(svg.querySelector('title').textContent).toBe('Настройки');
  });

  it('respects custom size + strokeWidth', () => {
    const { container } = render(<Icon name="plus" size={24} strokeWidth={2} />);
    const svg = container.querySelector('svg');
    expect(svg.getAttribute('width')).toBe('24');
    expect(svg.getAttribute('height')).toBe('24');
    expect(svg.getAttribute('stroke-width')).toBe('2');
  });

  it('INVARIANT: every name in ICON_GROUPS resolves to a real glyph (no null)', () => {
    const names = [...ICON_GROUPS.chrome, ...ICON_GROUPS.domain];
    const missing = names.filter((name) => {
      const { container } = render(<Icon name={name} />);
      const ok = !!container.querySelector('svg');
      cleanup();
      return !ok;
    });
    expect(missing).toEqual([]);
  });
});
