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

  it('renders only the current guide, hotkeys and glossary tabs', () => {
    render(<HelpPopover open onClose={vi.fn()} />);
    expect(screen.getAllByRole('tab')).toHaveLength(3);
    expect(screen.getByTestId('ss-help-tab-guide')).toBeTruthy();
    expect(screen.getByTestId('ss-help-tab-hotkeys')).toBeTruthy();
    expect(screen.getByTestId('ss-help-tab-glossary')).toBeTruthy();
    expect(screen.queryByTestId('ss-help-tab-hidden')).toBeNull();
  });

  it('does not expose the stale hidden-feature backlog', () => {
    render(<HelpPopover open onClose={vi.fn()} />);
    expect(screen.getByTestId('ss-help-popover').textContent)
      .not.toMatch(/AddPiecePopover|OpPopup|Frame view|Готово,\s*жд[её]т|жд[её]т UI-mount/i);
  });

  it('default guide is current, built in and has no external placeholder link', () => {
    render(<HelpPopover open onClose={vi.fn()} />);
    const guide = screen.getByTestId('ss-help-tab-content-guide');
    expect(guide.textContent).toMatch(/библиотек|молекул|сборк/i);
    expect(screen.queryByTestId('ss-help-guide-link')).toBeNull();
    expect(document.querySelector('a[href="https://bodgegene.dev/guide"]')).toBeNull();
    expect(screen.getByTestId('ss-help-tab-guide').getAttribute('style'))
      .not.toMatch(/#eed2c1/i);
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
    fireEvent.click(screen.getByTestId('ss-help-tab-content-guide'));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('ss-help-popover'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
