/**
 * HighlightedText — renders <mark> around matched spans using React children
 * (auto-escaped — never dangerouslySetInnerHTML, so a feature/name containing HTML
 * can't inject markup). Accepts explicit spans or a simple query-substring fallback.
 */
import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import HighlightedText from '../HighlightedText';

afterEach(cleanup);

describe('HighlightedText', () => {
  it('renders plain text with no spans / query', () => {
    render(<HighlightedText text="pUC19" testId="ht" />);
    expect(screen.getByTestId('ht').textContent).toBe('pUC19');
    expect(screen.getByTestId('ht').querySelector('mark')).toBeNull();
  });

  it('marks an explicit span', () => {
    render(<HighlightedText text="pBG-104" spans={[{ start: 0, end: 3 }]} testId="ht" />);
    const mark = screen.getByTestId('ht').querySelector('mark');
    expect(mark.textContent).toBe('pBG');
    expect(screen.getByTestId('ht').textContent).toBe('pBG-104'); // full text preserved
  });

  it('marks a query substring (case-insensitive, original case kept)', () => {
    render(<HighlightedText text="pUC19" query="uc" testId="ht" />);
    expect(screen.getByTestId('ht').querySelector('mark').textContent).toBe('UC');
  });

  it('merges overlapping / adjacent spans', () => {
    render(<HighlightedText text="ABCDEF" spans={[{ start: 0, end: 2 }, { start: 1, end: 4 }]} testId="ht" />);
    const marks = screen.getByTestId('ht').querySelectorAll('mark');
    expect(marks).toHaveLength(1);
    expect(marks[0].textContent).toBe('ABCD');
  });

  it('escapes HTML in the text (no injection)', () => {
    render(<HighlightedText text={'<img src=x onerror=1>'} query="img" testId="ht" />);
    const host = screen.getByTestId('ht');
    expect(host.querySelector('img')).toBeNull(); // rendered as text, not an element
    expect(host.textContent).toBe('<img src=x onerror=1>');
  });
});
