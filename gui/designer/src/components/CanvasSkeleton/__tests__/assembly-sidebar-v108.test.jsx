/**
 * assembly-sidebar-v108.test.jsx — V108 (walkthrough WT-B-6).
 *
 * The header showed «Контейнеры · N» where N = the count of skeleton
 * containers in the GLOBAL `state.containers` pool (non-empty sequence) — a
 * pool that grows on every segment insert (+1) and on realise (+3), so it
 * never matched what the biolog reads as «the assembly». The number can't be
 * made to «add up»; V108 drops it (the body already shows the flat list).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import AssemblySidebar from '../editor/assembly-mode/AssemblySidebar';

afterEach(cleanup);

describe('V108 — AssemblySidebar header has no misleading count', () => {
  it('header reads «Контейнеры» without a · N number', () => {
    const containers = [
      { id: 'c1', name: 'alpha', sequence: 'ACGTACGT' },
      { id: 'c2', name: 'beta', sequence: 'TTTTAAAA' },
    ];
    render(<AssemblySidebar containers={containers} onClose={() => {}} />);
    const sb = screen.getByTestId('assembly-sidebar');
    expect(sb.textContent).toContain('Контейнеры');
    // No «Контейнеры · 2» (or any digit) — the count is gone.
    expect(sb.textContent).not.toMatch(/Контейнеры\s*·\s*\d/);
  });
});
