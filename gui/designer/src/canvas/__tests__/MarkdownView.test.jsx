/**
 * NB-K6 — MarkdownView React component.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import MarkdownView from '../MarkdownView';
import { setRefDisplayLabelResolver } from '../../lib/markdown-ref-plugin';

describe('NB-K6 — MarkdownView', () => {
  it('renders markdown to HTML asynchronously', async () => {
    render(<MarkdownView text="**bold**" />);
    await waitFor(() => {
      expect(screen.getByTestId('markdown-view').innerHTML).toContain('<strong>bold</strong>');
    });
  });

  it('updates HTML when text prop changes', async () => {
    const { rerender } = render(<MarkdownView text="first" />);
    await waitFor(() => expect(screen.getByTestId('markdown-view').textContent).toContain('first'));
    rerender(<MarkdownView text="second" />);
    await waitFor(() => expect(screen.getByTestId('markdown-view').textContent).toContain('second'));
  });

  it('routes @@ref@@ clicks through onRefClick', async () => {
    const onRefClick = vi.fn();
    setRefDisplayLabelResolver(() => 'My zone');
    render(<MarkdownView text="See @@ref:zone:zn01@@." onRefClick={onRefClick} />);
    let btn;
    await waitFor(() => {
      btn = screen.getByTestId('markdown-view').querySelector('.md-ref');
      expect(btn).toBeTruthy();
    });
    fireEvent.click(btn);
    expect(onRefClick).toHaveBeenCalledWith({ kind: 'zone', id: 'zn01' });
  });

  it('does not crash if onRefClick is missing (click is a no-op)', async () => {
    render(<MarkdownView text="@@ref:zone:zn01@@" />);
    let btn;
    await waitFor(() => {
      btn = screen.getByTestId('markdown-view').querySelector('.md-ref');
      expect(btn).toBeTruthy();
    });
    expect(() => fireEvent.click(btn)).not.toThrow();
  });

  it('renders missing-attachment placeholder when attachment not in map', async () => {
    render(<MarkdownView text="![gel](attMISSING.png)" attachments={new Map()} />);
    await waitFor(() => {
      const img = screen.getByTestId('markdown-view').querySelector('img');
      expect(img?.getAttribute('data-att-missing')).toBe('true');
    });
  });
});
