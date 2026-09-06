import React from 'react';
import {
  afterEach, beforeEach, describe, expect, it, vi,
} from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import useTabHotkey from '../useTabHotkey';

function Harness({ onNext, onPrev, modal = false }) {
  useTabHotkey({ onNext, onPrev });
  return (
    <>
      <input data-testid="field" />
      {modal && <div data-modal-open="" data-block-global-hotkeys="true" />}
    </>
  );
}

afterEach(cleanup);

describe('useTabHotkey — editor tab switching', () => {
  let onNext;
  let onPrev;

  beforeEach(() => {
    onNext = vi.fn();
    onPrev = vi.fn();
  });

  it('Tab and Shift+Tab move through editor tabs when no modal owns the key', () => {
    render(<Harness onNext={onNext} onPrev={onPrev} />);
    fireEvent.keyDown(window, { key: 'Tab' });
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
    expect(onNext).toHaveBeenCalledTimes(1);
    expect(onPrev).toHaveBeenCalledTimes(1);
  });

  it('leaves native Tab behavior alone inside an input', () => {
    const { getByTestId } = render(<Harness onNext={onNext} onPrev={onPrev} />);
    fireEvent.keyDown(getByTestId('field'), { key: 'Tab' });
    expect(onNext).not.toHaveBeenCalled();
    expect(onPrev).not.toHaveBeenCalled();
  });

  it('does not switch hidden editor tabs while a modal marker exists', () => {
    render(<Harness onNext={onNext} onPrev={onPrev} modal />);
    fireEvent.keyDown(window, { key: 'Tab' });
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
    expect(onNext).not.toHaveBeenCalled();
    expect(onPrev).not.toHaveBeenCalled();
  });
});
