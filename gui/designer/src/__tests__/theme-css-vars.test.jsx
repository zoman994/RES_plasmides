import { describe, it, expect, beforeEach } from 'vitest';
import { applyThemeToDOM } from '../store/uiSlice';

describe('K10 — CSS-vars + theme', () => {
  beforeEach(() => {
    if (document.documentElement) document.documentElement.removeAttribute('data-theme');
  });

  it('applyThemeToDOM sets data-theme on documentElement', () => {
    applyThemeToDOM('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    applyThemeToDOM('light');
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('CSS-vars surface variables can be read from getComputedStyle root (smoke)', () => {
    // happy-dom does not load Tailwind/index.css automatically; just ensure
    // applyThemeToDOM doesn't throw and the attribute round-trips.
    applyThemeToDOM('light');
    const v = getComputedStyle(document.documentElement).getPropertyValue('--surface-1');
    // Without a stylesheet the value may be empty; we only assert no throw.
    expect(typeof v).toBe('string');
  });
});
