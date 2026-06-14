/**
 * library-actions-wip-a5.test.js — audit A5. The docstring promised
 * «disabled-on-missing-handler» but it was never implemented: action-row CTAs
 * backed by an unwired ctx handler rendered as enabled buttons whose click did
 * nothing (openContainerWindow / cloneEntry / copyToLoose / usePrimerInDag /
 * createManualEditBranch / editPrimer / editPrimerNotes). Now getActionsFor
 * disables them with a tooltip when the handler is absent.
 */
import { describe, it, expect, vi } from 'vitest';
import { getActionsFor } from '../library-actions';

const find = (list, id) => list.find((a) => a.id === id);

describe('getActionsFor — disabled-on-missing-handler (A5)', () => {
  it('active container: containerWindow + clone are DISABLED when their handlers are absent', () => {
    const list = getActionsFor({ kind: 'container', id: 'e1' }, 'active_bodge', { hasActiveProject: true });
    expect(find(list, 'containerWindow').disabled).toBe(true);
    expect(find(list, 'containerWindow').tooltip).toBeTruthy();
    expect(find(list, 'clone').disabled).toBe(true);
    // a backed action (extractToLoose / delete) stays enabled even without those handlers
    expect(find(list, 'extractToLoose').disabled).toBe(false);
  });

  it('the same CTAs are ENABLED once their handlers are wired', () => {
    const ctx = {
      hasActiveProject: true,
      openContainerWindow: vi.fn(),
      cloneEntry: vi.fn(),
    };
    const list = getActionsFor({ kind: 'container', id: 'e1' }, 'active_bodge', ctx);
    expect(find(list, 'containerWindow').disabled).toBe(false);
    expect(find(list, 'clone').disabled).toBe(false);
  });

  it('loose primer: editPrimer disabled without a handler; active primer: useInDag disabled', () => {
    const loose = getActionsFor({ kind: 'primer', id: 'p1' }, 'loose', { hasActiveProject: true });
    expect(find(loose, 'editPrimer').disabled).toBe(true);
    const active = getActionsFor({ kind: 'primer', id: 'p1' }, 'active_bodge', {});
    expect(find(active, 'useInDag').disabled).toBe(true);
  });
});
