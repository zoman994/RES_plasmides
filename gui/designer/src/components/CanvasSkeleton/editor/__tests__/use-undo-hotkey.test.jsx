import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import useUndoHotkey from '../useUndoHotkey';

function Harness(props) {
  useUndoHotkey(props);
  return <input data-testid="field" />;
}

afterEach(cleanup);

describe('useUndoHotkey — Ctrl+Z / Ctrl+Y for the canvas editor', () => {
  let onUndo; let onRedo;
  beforeEach(() => { onUndo = vi.fn(); onRedo = vi.fn(); });

  it('Ctrl+Z fires onUndo when canUndo', () => {
    render(<Harness onUndo={onUndo} onRedo={onRedo} canUndo canRedo />);
    fireEvent.keyDown(window, { code: 'KeyZ', ctrlKey: true });
    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  it('Ctrl+Y and Ctrl+Shift+Z fire onRedo when canRedo', () => {
    render(<Harness onUndo={onUndo} onRedo={onRedo} canUndo canRedo />);
    fireEvent.keyDown(window, { code: 'KeyY', ctrlKey: true });
    fireEvent.keyDown(window, { code: 'KeyZ', ctrlKey: true, shiftKey: true });
    expect(onRedo).toHaveBeenCalledTimes(2);
  });

  it('does nothing when the stack is empty', () => {
    render(<Harness onUndo={onUndo} onRedo={onRedo} canUndo={false} canRedo={false} />);
    fireEvent.keyDown(window, { code: 'KeyZ', ctrlKey: true });
    fireEvent.keyDown(window, { code: 'KeyY', ctrlKey: true });
    expect(onUndo).not.toHaveBeenCalled();
    expect(onRedo).not.toHaveBeenCalled();
  });

  it('ignores the chord while focus is in a text field', () => {
    const { getByTestId } = render(<Harness onUndo={onUndo} onRedo={onRedo} canUndo canRedo />);
    fireEvent.keyDown(getByTestId('field'), { code: 'KeyZ', ctrlKey: true });
    expect(onUndo).not.toHaveBeenCalled();
  });

  it('does not mutate hidden canvas history while a modal marker exists', () => {
    render(
      <>
        <Harness onUndo={onUndo} onRedo={onRedo} canUndo canRedo />
        <div data-modal-open="" data-block-global-hotkeys="true" />
      </>,
    );
    fireEvent.keyDown(window, { code: 'KeyZ', ctrlKey: true });
    fireEvent.keyDown(window, { code: 'KeyY', ctrlKey: true });
    expect(onUndo).not.toHaveBeenCalled();
    expect(onRedo).not.toHaveBeenCalled();
  });
});
