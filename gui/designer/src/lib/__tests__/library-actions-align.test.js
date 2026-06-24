import { describe, it, expect, vi } from 'vitest';
import { getActionsFor } from '../library-actions';

describe('library «Выровнять» action', () => {
  it('loose container exposes an enabled align action wired to ctx.alignEntry', () => {
    const alignEntry = vi.fn();
    const actions = getActionsFor({ id: 'e1', kind: 'container' }, 'loose', { alignEntry });
    const a = actions.find((x) => x.id === 'align');
    expect(a).toBeTruthy();
    expect(a.disabled).toBe(false);
    a.onClick();
    expect(alignEntry).toHaveBeenCalledWith('e1');
  });

  it('active container also exposes the align action', () => {
    const actions = getActionsFor({ id: 'e2', kind: 'container' }, 'active_bodge', { alignEntry: () => {} });
    expect(actions.some((x) => x.id === 'align')).toBe(true);
  });

  it('disables align when no handler is wired', () => {
    const a = getActionsFor({ id: 'e1', kind: 'container' }, 'loose', {}).find((x) => x.id === 'align');
    expect(a.disabled).toBe(true);
  });

  it('does not add align to primers', () => {
    const actions = getActionsFor({ id: 'p1', kind: 'primer' }, 'loose', { alignEntry: () => {} });
    expect(actions.some((x) => x.id === 'align')).toBe(false);
  });
});
