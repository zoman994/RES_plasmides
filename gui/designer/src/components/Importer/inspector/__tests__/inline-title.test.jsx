/**
 * Sprint M-B.2 K3 — InlineEditableTitle behaviour unit tests.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import InlineEditableTitle from '../InlineEditableTitle';

afterEach(cleanup);

describe('M-B.2 K3 — InlineEditableTitle', () => {
  it('1) Click → input shows; Enter commits the new value', () => {
    const onCommit = vi.fn();
    render(<InlineEditableTitle value="pUC19" onCommit={onCommit} />);
    fireEvent.click(screen.getByTestId('importer-inline-title'));
    const input = screen.getByTestId('importer-inline-title-input');
    fireEvent.change(input, { target: { value: 'pUC19-edited' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCommit).toHaveBeenCalledWith('pUC19-edited');
  });

  it('2) Escape cancels — onCommit not called, draft restored', () => {
    const onCommit = vi.fn();
    render(<InlineEditableTitle value="pUC19" onCommit={onCommit} />);
    fireEvent.click(screen.getByTestId('importer-inline-title'));
    const input = screen.getByTestId('importer-inline-title-input');
    fireEvent.change(input, { target: { value: 'changed' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('3) Blur commits when value differs', () => {
    const onCommit = vi.fn();
    render(<InlineEditableTitle value="pUC19" onCommit={onCommit} />);
    fireEvent.click(screen.getByTestId('importer-inline-title'));
    const input = screen.getByTestId('importer-inline-title-input');
    fireEvent.change(input, { target: { value: 'blur-commit' } });
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledWith('blur-commit');
  });

  it('4) Empty value renders placeholder (default S.untitledItem)', () => {
    render(<InlineEditableTitle value="" onCommit={() => {}} />);
    const button = screen.getByTestId('importer-inline-title');
    expect(button.textContent).toContain('(untitled)');
  });
});
