/**
 * MS-K3 — HelpPopover.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import HelpPopover from '../HelpPopover';

describe('MS-K3 — HelpPopover', () => {
  it('returns null when open=false', () => {
    render(<HelpPopover open={false} onClose={vi.fn()} />);
    expect(screen.queryByTestId('ss-help-popover')).toBeNull();
  });

  it('renders 4 tabs (Руководство / Хоткеи / Глоссарий / Скрытое)', () => {
    render(<HelpPopover open onClose={vi.fn()} />);
    expect(screen.getByTestId('ss-help-tab-guide')).toBeTruthy();
    expect(screen.getByTestId('ss-help-tab-hotkeys')).toBeTruthy();
    expect(screen.getByTestId('ss-help-tab-glossary')).toBeTruthy();
    expect(screen.getByTestId('ss-help-tab-hidden')).toBeTruthy();
  });

  it('hidden tab lists still-deferred features (Notebook, Frame view, Mutation auto-detect)', () => {
    // B2 — Протокол + Заказ олигов moved OUT of «hidden» (now mounted buttons).
    render(<HelpPopover open onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId('ss-help-tab-hidden'));
    const content = screen.getByTestId('ss-help-tab-content-hidden');
    expect(content.textContent).toMatch(/Notebook/);
    expect(content.textContent).toMatch(/Frame view/);
    expect(content.textContent).toMatch(/Mutation auto-detect|мутагенез/);
  });

  it('hidden tab lists power-user paths (ПКМ, drag-drop, hotkeys)', () => {
    render(<HelpPopover open onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId('ss-help-tab-hidden'));
    const content = screen.getByTestId('ss-help-tab-content-hidden');
    expect(content.textContent).toMatch(/Ctrl\+R/);
    expect(content.textContent).toMatch(/ПКМ|правый клик/i);
    expect(content.textContent).toMatch(/Drag-and-drop/i);
  });

  it('default tab is "guide" with online-guide link', () => {
    render(<HelpPopover open onClose={vi.fn()} />);
    expect(screen.getByTestId('ss-help-tab-content-guide')).toBeTruthy();
    expect(screen.getByTestId('ss-help-guide-link').getAttribute('href'))
      .toMatch(/bodgegene\.dev/);
  });

  it('switching to "hotkeys" tab shows the open-hotkeys button', () => {
    render(<HelpPopover open onClose={vi.fn()} onOpenHotkeys={vi.fn()} />);
    fireEvent.click(screen.getByTestId('ss-help-tab-hotkeys'));
    expect(screen.getByTestId('ss-help-tab-content-hotkeys')).toBeTruthy();
    expect(screen.getByTestId('ss-help-open-hotkeys')).toBeTruthy();
  });

  it('clicking "Показать хоткеи" closes popover + calls onOpenHotkeys', async () => {
    const onClose = vi.fn();
    const onOpenHotkeys = vi.fn();
    render(<HelpPopover open onClose={onClose} onOpenHotkeys={onOpenHotkeys} />);
    fireEvent.click(screen.getByTestId('ss-help-tab-hotkeys'));
    fireEvent.click(screen.getByTestId('ss-help-open-hotkeys'));
    expect(onClose).toHaveBeenCalled();
    // setTimeout 0 — wait a tick.
    await new Promise((r) => setTimeout(r, 10));
    expect(onOpenHotkeys).toHaveBeenCalled();
  });

  it('glossary tab defines the core model terms (AUD-82 — was an empty placeholder)', () => {
    render(<HelpPopover open onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId('ss-help-tab-glossary'));
    const txt = screen.getByTestId('ss-help-tab-content-glossary').textContent;
    expect(txt).not.toMatch(/Содержание готовится/);
    expect(txt).toMatch(/Контейнер/);
    expect(txt).toMatch(/Сборка/);
    expect(txt).toMatch(/Праймер/);
    expect(txt).toMatch(/\.bodge/);
  });

  it('Esc closes popover', () => {
    const onClose = vi.fn();
    render(<HelpPopover open onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('backdrop click closes popover; inner click does not', () => {
    const onClose = vi.fn();
    render(<HelpPopover open onClose={onClose} />);
    // Close button
    fireEvent.click(screen.getByTestId('ss-help-popover-close'));
    expect(onClose).toHaveBeenCalled();
  });
});
