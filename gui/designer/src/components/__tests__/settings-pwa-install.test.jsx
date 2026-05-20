/**
 * MS-K6 — PWA install section in SettingsModal.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import SettingsModal from '../SettingsModal';
import { useStore, bootstrapStore } from '../../store';

beforeEach(() => { try { bootstrapStore(); } catch { /* idempotent */ } });
afterEach(() => {
  cleanup();
  try { useStore.setState({ canInstallPwa: false, toasts: [] }); } catch { /* */ }
});

function openSettingsAdvanced() {
  render(<SettingsModal />);
  fireEvent.click(screen.getByTestId('settings-tab-advanced'));
}

describe('MS-K6 — SettingsModal PWA install section', () => {
  it('hidden when canInstallPwa=false (default)', () => {
    useStore.setState((s) => { s.canInstallPwa = false; });
    openSettingsAdvanced();
    expect(screen.queryByTestId('settings-pwa-install-section')).toBeNull();
  });

  it('visible when canInstallPwa=true and not installed', () => {
    useStore.setState((s) => { s.canInstallPwa = true; });
    openSettingsAdvanced();
    expect(screen.getByTestId('settings-pwa-install-section')).toBeTruthy();
    expect(screen.getByTestId('settings-pwa-install')).toBeTruthy();
  });

  it('hidden when canInstallPwa flips to false', () => {
    useStore.setState((s) => { s.canInstallPwa = true; });
    openSettingsAdvanced();
    expect(screen.getByTestId('settings-pwa-install-section')).toBeTruthy();
    act(() => { useStore.setState((s) => { s.canInstallPwa = false; }); });
    expect(screen.queryByTestId('settings-pwa-install-section')).toBeNull();
  });

  it('install button click → promptInstall fires', async () => {
    useStore.setState((s) => { s.canInstallPwa = true; });
    // Arm the deferred prompt.
    const promptSpy = vi.fn().mockResolvedValue();
    const evt = new Event('beforeinstallprompt');
    evt.prompt = promptSpy;
    evt.userChoice = Promise.resolve({ outcome: 'accepted' });
    const { setupBeforeInstallPromptListener } = await import('../../lib/pwa-install');
    const detach = setupBeforeInstallPromptListener(() => {});
    window.dispatchEvent(evt);
    openSettingsAdvanced();
    await act(async () => {
      fireEvent.click(screen.getByTestId('settings-pwa-install'));
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(promptSpy).toHaveBeenCalled();
    detach();
  });
});
