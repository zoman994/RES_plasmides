/**
 * PromptModal — in-app `window.prompt` replacement (BUGS V191/V192).
 */
import React from 'react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { useStore } from '../../store';
import PromptModal from '../PromptModal';

beforeEach(() => { useStore.setState((s) => { s.prompt = null; }); });
afterEach(cleanup);

describe('PromptModal', () => {
  it('renders nothing when no prompt is pending', () => {
    render(<PromptModal />);
    expect(screen.queryByTestId('prompt-modal')).toBeNull();
  });

  it('shows the title and seeds the input with defaultValue', () => {
    render(<PromptModal />);
    act(() => { useStore.getState().requestPrompt({ title: 'Переименовать', defaultValue: 'old' }); });
    expect(screen.getByTestId('prompt-modal')).toBeTruthy();
    expect(screen.getByText('Переименовать')).toBeTruthy();
    expect(screen.getByTestId('prompt-modal-input').value).toBe('old');
  });

  it('Enter confirms with the typed value', async () => {
    render(<PromptModal />);
    let p;
    act(() => { p = useStore.getState().requestPrompt({ title: 'T', defaultValue: 'old' }); });
    const input = screen.getByTestId('prompt-modal-input');
    fireEvent.change(input, { target: { value: 'new' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await expect(p).resolves.toBe('new');
    // modal closed
    expect(screen.queryByTestId('prompt-modal')).toBeNull();
  });

  it('Escape cancels (resolves null)', async () => {
    render(<PromptModal />);
    let p;
    act(() => { p = useStore.getState().requestPrompt({ title: 'T' }); });
    fireEvent.keyDown(screen.getByTestId('prompt-modal-input'), { key: 'Escape' });
    await expect(p).resolves.toBeNull();
  });

  it('Отмена button cancels', async () => {
    render(<PromptModal />);
    let p;
    act(() => { p = useStore.getState().requestPrompt({ title: 'T', defaultValue: 'x' }); });
    fireEvent.click(screen.getByTestId('prompt-modal-cancel'));
    await expect(p).resolves.toBeNull();
  });

  it('multiline mode renders a textarea (Enter inserts newline, does not confirm)', async () => {
    render(<PromptModal />);
    act(() => { useStore.getState().requestPrompt({ title: 'Заметки', multiline: true, defaultValue: 'a' }); });
    const field = screen.getByTestId('prompt-modal-input');
    expect(field.tagName).toBe('TEXTAREA');
    // plain Enter should NOT close a multiline prompt
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(screen.getByTestId('prompt-modal')).toBeTruthy();
  });
});
