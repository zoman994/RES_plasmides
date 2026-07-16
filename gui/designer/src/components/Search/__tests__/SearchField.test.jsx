/**
 * K1.1 — SearchField: the UI-only field shell (§1A.2). It owns no data; it
 * renders an <input> plus optional slots (leading/mode/chips) and a clear
 * control, and exposes the combobox ARIA channel ON THE INPUT (not the
 * wrapper). Assertions are raw (no jest-dom setup in this repo).
 */
import React, { createRef } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import SearchField from '../SearchField';

afterEach(cleanup);

const INPUT = 'search-field-input';

describe('SearchField — input + value', () => {
  it('renders the input with value, aria-label and placeholder', () => {
    render(<SearchField value="pBG" ariaLabel="Поиск" placeholder="Искать…" />);
    const input = screen.getByTestId(INPUT);
    expect(input.value).toBe('pBG');
    expect(input.getAttribute('aria-label')).toBe('Поиск');
    expect(input.getAttribute('placeholder')).toBe('Искать…');
  });

  it('typing calls onValueChange with the new value + composition metadata', () => {
    const onValueChange = vi.fn();
    render(<SearchField value="" onValueChange={onValueChange} ariaLabel="Поиск" />);
    fireEvent.change(screen.getByTestId(INPUT), { target: { value: 'ab' } });
    expect(onValueChange).toHaveBeenCalledWith('ab', { isComposing: false });
  });

  it('surfaces the native inputType so a paste is distinguishable from typing', () => {
    const onValueChange = vi.fn();
    render(<SearchField value="" onValueChange={onValueChange} ariaLabel="a" />);
    const input = screen.getByTestId(INPUT);
    fireEvent.input(input, { target: { value: 'pUC' }, inputType: 'insertFromPaste' });
    expect(onValueChange).toHaveBeenLastCalledWith('pUC', expect.objectContaining({ inputType: 'insertFromPaste' }));
  });
});

describe('SearchField — composition metadata (IME safety for the controller/parser)', () => {
  it('marks onValueChange isComposing=true while composing, false after compositionend', () => {
    const onValueChange = vi.fn();
    const onCompositionStart = vi.fn();
    const onCompositionEnd = vi.fn();
    render(
      <SearchField
        value="" onValueChange={onValueChange} ariaLabel="a"
        onCompositionStart={onCompositionStart} onCompositionEnd={onCompositionEnd}
      />,
    );
    const input = screen.getByTestId(INPUT);
    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: 'п' } });
    expect(onValueChange).toHaveBeenLastCalledWith('п', { isComposing: true }); // parser must NOT parse ':' yet
    fireEvent.compositionEnd(input);
    fireEvent.change(input, { target: { value: 'пр' } });
    expect(onValueChange).toHaveBeenLastCalledWith('пр', { isComposing: false });
    // the caller's own composition handlers still fire
    expect(onCompositionStart).toHaveBeenCalled();
    expect(onCompositionEnd).toHaveBeenCalled();
  });

  it('emits a commit on compositionEnd (isComposing:false) even when NO change follows', () => {
    // Browsers do not guarantee a `change` after compositionend; without a commit
    // signal the controller would stay stuck at isComposing:true and never parse.
    const onValueChange = vi.fn();
    render(<SearchField value="пр" onValueChange={onValueChange} ariaLabel="a" />);
    const input = screen.getByTestId(INPUT);
    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: 'пр' } }); // isComposing:true
    fireEvent.compositionEnd(input, { target: { value: 'пр' } }); // NO change after this
    expect(onValueChange).toHaveBeenLastCalledWith('пр', { isComposing: false });
  });

  it('does NOT double-commit when the browser DOES fire a change after compositionEnd (dedup)', () => {
    const onValueChange = vi.fn();
    render(<SearchField value="пр" onValueChange={onValueChange} ariaLabel="a" />);
    const input = screen.getByTestId(INPUT);
    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: 'пр' } }); // (пр, composing:true)
    fireEvent.compositionEnd(input, { target: { value: 'пр' } }); // commit (пр, false)
    fireEvent.change(input, { target: { value: 'пр' } }); // browser's post-compose change, same value
    const finalCommits = onValueChange.mock.calls.filter(([v, m]) => v === 'пр' && m.isComposing === false);
    expect(finalCommits.length).toBe(1); // exactly one final commit, not two
  });

  it('deduplicates the post-composition event even when the controller canonicalizes the value', () => {
    const onValueChange = vi.fn();
    const common = { onValueChange, ariaLabel: 'a' };
    const { rerender } = render(<SearchField {...common} value="aa:HHHH " />);
    const input = screen.getByTestId(INPUT);

    fireEvent.compositionStart(input);
    fireEvent.compositionEnd(input, { target: { value: 'aa:HHHH ' } });
    // The structured controller lifts aa: into the mode selector, leaving only
    // the residual peptide visible before the browser's trailing input event.
    rerender(<SearchField {...common} value="HHHH" />);
    fireEvent.input(input, { target: { value: 'aa:HHHH ' }, inputType: 'insertText' });

    const finalCommits = onValueChange.mock.calls.filter(([, meta]) => meta.isComposing === false);
    expect(finalCommits).toHaveLength(1);
  });
});

describe('SearchField — clear control', () => {
  it('shows a clear button only when value + onClear + clearAriaLabel all present', () => {
    const { rerender } = render(<SearchField value="" onClear={vi.fn()} clearAriaLabel="C" ariaLabel="a" />);
    expect(screen.queryByTestId('search-field-clear')).toBeNull(); // empty value
    rerender(<SearchField value="x" clearAriaLabel="C" ariaLabel="a" />);
    expect(screen.queryByTestId('search-field-clear')).toBeNull(); // no onClear
    rerender(<SearchField value="x" onClear={vi.fn()} clearAriaLabel="Очистить" ariaLabel="a" />);
    expect(screen.getByTestId('search-field-clear')).toBeTruthy();
  });

  it('the clear button is type=button with the localized accessible name from props', () => {
    render(<SearchField value="x" onClear={vi.fn()} clearAriaLabel="Очистить поиск" ariaLabel="a" />);
    const btn = screen.getByTestId('search-field-clear');
    expect(btn.getAttribute('type')).toBe('button');
    expect(btn.getAttribute('aria-label')).toBe('Очистить поиск');
  });

  it('fail-closed: without clearAriaLabel the clear control is NOT rendered (never an unnamed button)', () => {
    render(<SearchField value="x" onClear={vi.fn()} ariaLabel="a" />); // no clearAriaLabel
    expect(screen.queryByTestId('search-field-clear')).toBeNull();
  });

  it('fail-closed: a whitespace-only clearAriaLabel does NOT render the clear control', () => {
    render(<SearchField value="x" onClear={vi.fn()} clearAriaLabel="   " ariaLabel="a" />);
    expect(screen.queryByTestId('search-field-clear')).toBeNull();
  });

  it('clicking clear calls onClear and returns focus to the input', () => {
    const onClear = vi.fn();
    render(<SearchField value="x" onClear={onClear} clearAriaLabel="C" ariaLabel="a" />);
    fireEvent.click(screen.getByTestId('search-field-clear'));
    expect(onClear).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(screen.getByTestId(INPUT));
  });

  it('does not swallow the same pasted value after a controlled clear', () => {
    const onValueChange = vi.fn();
    const common = { onValueChange, ariaLabel: 'a' };
    const { rerender } = render(<SearchField {...common} value="" />);
    const input = screen.getByTestId(INPUT);

    fireEvent.change(input, { target: { value: 'tag:cloning' } });
    rerender(<SearchField {...common} value="tag:cloning" />); // parent accepts the first value
    rerender(<SearchField {...common} value="" />); // parent/controller cleared the controlled field
    fireEvent.input(input, { target: { value: 'tag:cloning' }, inputType: 'insertFromPaste' });

    expect(onValueChange).toHaveBeenCalledTimes(2);
    expect(onValueChange).toHaveBeenLastCalledWith(
      'tag:cloning',
      expect.objectContaining({ isComposing: false, inputType: 'insertFromPaste' }),
    );
  });

  it('does not swallow the same one-character input after composition and the field clear action', () => {
    const onValueChange = vi.fn();
    const onClear = vi.fn();
    const common = { onValueChange, onClear, clearAriaLabel: 'Clear', ariaLabel: 'a' };
    const { rerender } = render(<SearchField {...common} value="x" />);
    const input = screen.getByTestId(INPUT);

    fireEvent.compositionStart(input);
    fireEvent.compositionEnd(input, { target: { value: 'x' } });
    fireEvent.click(screen.getByTestId('search-field-clear'));
    rerender(<SearchField {...common} value="" />);
    fireEvent.input(input, { target: { value: 'x' }, inputType: 'insertText' });

    const committed = onValueChange.mock.calls.filter(([v, meta]) => v === 'x' && meta.isComposing === false);
    expect(committed).toHaveLength(2);
  });

  it('does not set outline:none on the clear button (a keyboard user must see focus)', () => {
    render(<SearchField value="x" onClear={vi.fn()} clearAriaLabel="C" ariaLabel="a" />);
    expect(screen.getByTestId('search-field-clear').style.outlineStyle).not.toBe('none');
  });

  it('hides the clear button when disabled even with a value', () => {
    render(<SearchField value="x" onClear={vi.fn()} clearAriaLabel="C" disabled ariaLabel="a" />);
    expect(screen.queryByTestId('search-field-clear')).toBeNull();
  });
});

describe('SearchField — state flags', () => {
  it('disabled disables the input', () => {
    render(<SearchField value="x" disabled ariaLabel="a" />);
    expect(screen.getByTestId(INPUT).disabled).toBe(true);
  });

  it('invalid sets aria-invalid on the input', () => {
    render(<SearchField value="x" invalid ariaLabel="a" />);
    expect(screen.getByTestId(INPUT).getAttribute('aria-invalid')).toBe('true');
  });

  it('busy sets aria-busy on the input', () => {
    render(<SearchField value="x" busy ariaLabel="a" />);
    expect(screen.getByTestId(INPUT).getAttribute('aria-busy')).toBe('true');
  });

  it('renders a finite resultCount WITH an accessible, live announcement (not just a silent number)', () => {
    render(<SearchField value="x" resultCount={7} resultCountLabel="7 результатов" ariaLabel="a" />);
    expect(screen.getByTestId('search-field-count').textContent).toMatch(/7/);
    const live = screen.getByTestId('search-field-count-live');
    expect(live.getAttribute('aria-live')).toBe('polite');
    expect(live.getAttribute('aria-hidden')).toBeNull(); // announced, not hidden
    expect(live.textContent).toMatch(/7 результатов/);
  });

  it('fail-closed: a finite resultCount WITHOUT resultCountLabel shows no counter (never a silent number)', () => {
    render(<SearchField value="x" resultCount={7} ariaLabel="a" />);
    expect(screen.queryByTestId('search-field-count')).toBeNull();
  });

  it('no counter when resultCount is not a finite number', () => {
    render(<SearchField value="x" resultCount={null} resultCountLabel="0" ariaLabel="a" />);
    expect(screen.queryByTestId('search-field-count')).toBeNull();
  });
});

describe('SearchField — slots', () => {
  it('renders leading, mode and filter-chip slots', () => {
    render(
      <SearchField
        value="x"
        ariaLabel="a"
        leadingSlot={<span data-testid="slot-lead">L</span>}
        modeSlot={<span data-testid="slot-mode">M</span>}
        filterChips={<span data-testid="slot-chips">C</span>}
      />,
    );
    expect(screen.getByTestId('slot-lead')).toBeTruthy();
    expect(screen.getByTestId('slot-mode')).toBeTruthy();
    expect(screen.getByTestId('slot-chips')).toBeTruthy();
  });
});

describe('SearchField — combobox ARIA channel (on the input, not the wrapper)', () => {
  it('applies role / aria-autocomplete / aria-expanded / aria-controls / aria-activedescendant / aria-describedby to the input', () => {
    render(
      <SearchField
        value="x"
        ariaLabel="a"
        role="combobox"
        ariaAutoComplete="list"
        ariaExpanded
        controlsId="lb1"
        activeDescendantId="lb1-opt-2"
        ariaDescribedBy="desc1"
      />,
    );
    const input = screen.getByTestId(INPUT);
    expect(input.getAttribute('role')).toBe('combobox');
    expect(input.getAttribute('aria-autocomplete')).toBe('list');
    expect(input.getAttribute('aria-expanded')).toBe('true');
    expect(input.getAttribute('aria-controls')).toBe('lb1');
    expect(input.getAttribute('aria-activedescendant')).toBe('lb1-opt-2');
    expect(input.getAttribute('aria-describedby')).toBe('desc1');
    // the combobox role lives on the input, NOT on the field wrapper
    expect(screen.getByTestId('search-field').getAttribute('role')).toBeNull();
  });

  it('omits aria-activedescendant when none is given (no dangling attr)', () => {
    render(<SearchField value="x" ariaLabel="a" role="combobox" />);
    expect(screen.getByTestId(INPUT).getAttribute('aria-activedescendant')).toBeNull();
  });
});

describe('SearchField — event passthrough + ref', () => {
  it('forwards onKeyDown, onFocus, onBlur, onCompositionStart, onCompositionEnd', () => {
    const onKeyDown = vi.fn();
    const onFocus = vi.fn();
    const onBlur = vi.fn();
    const onCompositionStart = vi.fn();
    const onCompositionEnd = vi.fn();
    render(
      <SearchField
        value="x"
        ariaLabel="a"
        onKeyDown={onKeyDown}
        onFocus={onFocus}
        onBlur={onBlur}
        onCompositionStart={onCompositionStart}
        onCompositionEnd={onCompositionEnd}
      />,
    );
    const input = screen.getByTestId(INPUT);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.focus(input);
    fireEvent.blur(input);
    fireEvent.compositionStart(input);
    fireEvent.compositionEnd(input);
    expect(onKeyDown).toHaveBeenCalled();
    expect(onFocus).toHaveBeenCalled();
    expect(onBlur).toHaveBeenCalled();
    expect(onCompositionStart).toHaveBeenCalled();
    expect(onCompositionEnd).toHaveBeenCalled();
  });

  it('forwards inputRef to the input element', () => {
    const ref = createRef();
    render(<SearchField value="x" ariaLabel="a" inputRef={ref} />);
    expect(ref.current).toBe(screen.getByTestId(INPUT));
    expect(ref.current.tagName).toBe('INPUT');
  });
});
