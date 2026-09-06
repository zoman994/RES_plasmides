import React from 'react';
import {
  afterEach, describe, expect, it, vi,
} from 'vitest';
import {
  cleanup, fireEvent, render, screen,
} from '@testing-library/react';
import useModalKeyboardBoundary from '../useModalKeyboardBoundary';

afterEach(cleanup);

function Modal({ name, onClose, active = true, children }) {
  const boundary = useModalKeyboardBoundary(onClose, { active });
  if (!active) return null;
  return (
    <div data-testid={`modal-${name}`} {...boundary}>
      {children}
    </div>
  );
}

describe('useModalKeyboardBoundary', () => {
  it('marks a live modal as a document-wide blocking boundary', () => {
    render(<Modal name="one" onClose={() => {}} />);
    const root = screen.getByTestId('modal-one');
    expect(root.getAttribute('data-modal-open')).toBe('');
    expect(root.getAttribute('data-block-global-hotkeys')).toBe('true');
  });

  it('Escape with focus outside closes only the last mounted modal', () => {
    const closeA = vi.fn();
    const closeB = vi.fn();
    const openerKeyDown = vi.fn();
    render(
      <>
        <button type="button" data-testid="opener" onKeyDown={openerKeyDown}>opener</button>
        <Modal name="a" onClose={closeA} />
        <Modal name="b" onClose={closeB} />
      </>,
    );

    fireEvent.keyDown(screen.getByTestId('opener'), { key: 'Escape' });
    expect(closeB).toHaveBeenCalledTimes(1);
    expect(closeA).not.toHaveBeenCalled();
    expect(openerKeyDown).not.toHaveBeenCalled();
  });

  it('removing a non-top registration leaves the top modal in control', () => {
    const closeA = vi.fn();
    const closeB = vi.fn();
    const { rerender } = render(
      <>
        <Modal name="a" onClose={closeA} />
        <Modal name="b" onClose={closeB} />
      </>,
    );
    rerender(
      <>
        <Modal name="a" onClose={closeA} active={false} />
        <Modal name="b" onClose={closeB} />
      </>,
    );

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(closeB).toHaveBeenCalledTimes(1);
    expect(closeA).not.toHaveBeenCalled();
  });

  it('lets the target process a key, then stops it before a React parent', () => {
    const targetKeyDown = vi.fn();
    const parentKeyDown = vi.fn();
    render(
      <div onKeyDown={parentKeyDown}>
        <Modal name="one" onClose={() => {}}>
          <button type="button" data-testid="inside" onKeyDown={targetKeyDown}>inside</button>
        </Modal>
      </div>,
    );

    fireEvent.keyDown(screen.getByTestId('inside'), { key: 'e' });
    expect(targetKeyDown).toHaveBeenCalledTimes(1);
    expect(parentKeyDown).not.toHaveBeenCalled();
  });

  it('respects an inner control that already consumed Escape', () => {
    const onClose = vi.fn();
    render(
      <Modal name="one" onClose={onClose}>
        <button
          type="button"
          data-testid="inside"
          onKeyDown={(event) => event.preventDefault()}
        >inside</button>
      </Modal>,
    );

    fireEvent.keyDown(screen.getByTestId('inside'), { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('ignores repeated Escape so one held key cannot peel another layer', () => {
    const onClose = vi.fn();
    render(<Modal name="one" onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape', repeat: true });
    expect(onClose).not.toHaveBeenCalled();
  });
});
