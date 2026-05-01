import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { useStore } from '../../store';
import { ToastStack } from '../Toast';

function reset() {
  useStore.setState((state) => {
    state.toasts = [];
  });
}

describe('M-A.1 K5 — Toast Notion-style queue', () => {
  beforeEach(() => {
    reset();
    cleanup();
  });

  afterEach(() => {
    cleanup();
    reset();
  });

  it('shows a single toast with the given message', () => {
    act(() => {
      useStore.getState().showToast('hello world');
    });
    render(<ToastStack />);
    expect(screen.getByText('hello world')).toBeTruthy();
    expect(screen.getAllByTestId('toast').length).toBe(1);
  });

  it('renders the right icon for each kind', () => {
    act(() => {
      useStore.getState().showToast('a', 'success');
      useStore.getState().showToast('b', 'error');
      useStore.getState().showToast('c', 'warning');
    });
    render(<ToastStack />);
    expect(screen.getByTestId('toast-icon-success')).toBeTruthy();
    expect(screen.getByTestId('toast-icon-error')).toBeTruthy();
    expect(screen.getByTestId('toast-icon-warning')).toBeTruthy();

    cleanup();
    reset();
    act(() => { useStore.getState().showToast('d', 'info'); });
    render(<ToastStack />);
    expect(screen.getByTestId('toast-icon-info')).toBeTruthy();
  });

  it('stacks multiple toasts in the bottom-left corner', () => {
    act(() => {
      useStore.getState().showToast('one');
      useStore.getState().showToast('two');
      useStore.getState().showToast('three');
    });
    render(<ToastStack />);
    const stack = screen.getByTestId('toast-stack');
    const style = stack.style;
    expect(style.left).toBe('24px');
    expect(style.bottom).toBe('24px');
    expect(style.flexDirection).toBe('column');
    const toasts = screen.getAllByTestId('toast');
    expect(toasts.length).toBe(3);
    expect(toasts[0].textContent).toContain('one');
    expect(toasts[1].textContent).toContain('two');
    expect(toasts[2].textContent).toContain('three');
  });

  it('queue caps at 3 (FIFO drop of the oldest entry)', () => {
    act(() => {
      useStore.getState().showToast('one');
      useStore.getState().showToast('two');
      useStore.getState().showToast('three');
      useStore.getState().showToast('four');
    });
    render(<ToastStack />);
    const toasts = screen.getAllByTestId('toast');
    expect(toasts.length).toBe(3);
    const labels = toasts.map(t => t.textContent);
    expect(labels.some(l => l.includes('one'))).toBe(false);
    expect(labels.some(l => l.includes('two'))).toBe(true);
    expect(labels.some(l => l.includes('four'))).toBe(true);
  });

  it('auto-dismisses after the default 3500 ms', () => {
    vi.useFakeTimers();
    try {
      act(() => { useStore.getState().showToast('vanish'); });
      render(<ToastStack />);
      expect(screen.getAllByTestId('toast').length).toBe(1);
      act(() => { vi.advanceTimersByTime(3499); });
      expect(useStore.getState().toasts.length).toBe(1);
      act(() => { vi.advanceTimersByTime(2); });
      expect(useStore.getState().toasts.length).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('respects a custom autoDismissMs', () => {
    vi.useFakeTimers();
    try {
      act(() => { useStore.getState().showToast('slow', 'info', { autoDismissMs: 5000 }); });
      render(<ToastStack />);
      act(() => { vi.advanceTimersByTime(4999); });
      expect(useStore.getState().toasts.length).toBe(1);
      act(() => { vi.advanceTimersByTime(2); });
      expect(useStore.getState().toasts.length).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('manual close × removes the toast and skips onAutoDismiss', () => {
    vi.useFakeTimers();
    try {
      const onAutoDismiss = vi.fn();
      act(() => { useStore.getState().showToast('byebye', 'info', { onAutoDismiss, autoDismissMs: 5000 }); });
      render(<ToastStack />);
      fireEvent.click(screen.getByTestId('toast-close'));
      expect(useStore.getState().toasts.length).toBe(0);
      act(() => { vi.advanceTimersByTime(10000); });
      expect(onAutoDismiss).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('undo button calls onUndo and dismisses, skipping onAutoDismiss', () => {
    vi.useFakeTimers();
    try {
      const onUndo = vi.fn();
      const onAutoDismiss = vi.fn();
      act(() => {
        useStore.getState().showToast('undo me', 'info', {
          onUndo, onAutoDismiss, autoDismissMs: 5000,
        });
      });
      render(<ToastStack />);
      fireEvent.click(screen.getByTestId('toast-undo'));
      expect(onUndo).toHaveBeenCalledTimes(1);
      expect(useStore.getState().toasts.length).toBe(0);
      act(() => { vi.advanceTimersByTime(10000); });
      expect(onAutoDismiss).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
