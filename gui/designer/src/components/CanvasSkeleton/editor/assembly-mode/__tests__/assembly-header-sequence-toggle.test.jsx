/**
 * AV-K10 — AssemblyHeader «↩ S» toggle returns to canvas sequence view.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import AssemblyHeader from '../AssemblyHeader';

const DRAFT = {
  id: 'd1',
  name: 'Сборка 1',
  segments: [],
  topology: { circular: false },
};

describe('AV-K10 — AssemblyHeader sequence view toggle', () => {
  it('button hidden when onToggleSequenceView not provided', () => {
    render(
      <AssemblyHeader
        draft={DRAFT} length={0} segmentCount={0}
        canRealise={false}
        onRename={vi.fn()} onToggleTopology={vi.fn()} onRealise={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('assembly-toggle-sequence-view')).toBeNull();
  });

  it('button visible when onToggleSequenceView wired', () => {
    render(
      <AssemblyHeader
        draft={DRAFT} length={0} segmentCount={0}
        canRealise={false}
        onRename={vi.fn()} onToggleTopology={vi.fn()} onRealise={vi.fn()}
        onToggleSequenceView={vi.fn()}
      />,
    );
    expect(screen.getByTestId('assembly-toggle-sequence-view')).toBeTruthy();
  });

  it('clicking the button calls onToggleSequenceView', () => {
    const onToggle = vi.fn();
    render(
      <AssemblyHeader
        draft={DRAFT} length={0} segmentCount={0}
        canRealise={false}
        onRename={vi.fn()} onToggleTopology={vi.fn()} onRealise={vi.fn()}
        onToggleSequenceView={onToggle}
      />,
    );
    fireEvent.click(screen.getByTestId('assembly-toggle-sequence-view'));
    expect(onToggle).toHaveBeenCalled();
  });
});
