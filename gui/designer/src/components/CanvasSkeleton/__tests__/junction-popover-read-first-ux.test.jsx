/**
 * junction-popover-read-first-ux.test.jsx — UX slice 2: the popover opens
 * READ-FIRST. Most opens are "let me check this is right", not "let me
 * reconfigure" — so a compact summary (method + decided/default + изменить)
 * leads, and the full 6-method grid + params collapse behind изменить.
 * Smart default: a TENTATIVE junction (you clicked the one flagged "проверь")
 * opens ready-to-edit; a DECIDED junction opens as the summary.
 * The method grid stays MOUNTED (CSS-collapsed) so every existing affordance/
 * test keeps working.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import JunctionPopover from '../canvas/JunctionPopover';

afterEach(cleanup);

function J(over = {}) {
  return {
    kind: 'overlap', overlapTarget: 'right', overlapLength: 30, overlapTm: null, status: 'auto', ...over,
  };
}
function renderPopover(over) {
  return render(
    <JunctionPopover
      junction={J(over)}
      position={{ x: 100, y: 100 }}
      warnings={[]}
      onPick={() => {}}
      onSetParams={() => {}}
      onResetAuto={() => {}}
      onCancel={() => {}}
    />,
  );
}

describe('UX slice 2 — read-first popover', () => {
  it('always renders a compact summary with the method + decided/default state', () => {
    renderPopover({ kind: 'overlap', status: 'manual' });
    const summary = screen.getByTestId('junction-popover-summary');
    expect(summary).toBeTruthy();
    expect(summary.textContent.toLowerCase()).toMatch(/выбран/);
  });

  it('a DECIDED junction opens collapsed (summary only); изменить expands the grid', () => {
    renderPopover({ kind: 'overlap', status: 'manual' });
    const edit = screen.getByTestId('junction-popover-edit');
    expect(edit.getAttribute('data-editing')).toBe('false');
    fireEvent.click(screen.getByTestId('junction-popover-edit-toggle'));
    expect(screen.getByTestId('junction-popover-edit').getAttribute('data-editing')).toBe('true');
  });

  it('a TENTATIVE junction opens ready-to-edit (grid expanded)', () => {
    renderPopover({ kind: 'overlap', status: 'auto' });
    expect(screen.getByTestId('junction-popover-edit').getAttribute('data-editing')).toBe('true');
    // summary still says "по умолчанию"
    expect(screen.getByTestId('junction-popover-summary').textContent.toLowerCase()).toMatch(/умолчан/);
  });

  it('the method grid stays in the DOM even when collapsed (back-compat)', () => {
    renderPopover({ kind: 'overlap', status: 'manual' }); // collapsed
    // every kind button remains queryable + clickable (existing tests rely on this)
    expect(screen.getByTestId('junction-popover-kind-golden_gate')).toBeTruthy();
    expect(screen.getByTestId('junction-popover-kinds')).toBeTruthy();
  });
});
