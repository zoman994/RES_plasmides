import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { useStore } from '../../store';
import { clearAllAutosaveTimers } from '../../store/projectSlice';
import StartScreen from '../StartScreen';
import { formatRelativeTimeAgo } from '../StartScreen/RecentCard';

function reset() {
  clearAllAutosaveTimers();
  useStore.setState((state) => {
    state.projects = {};
    state.currentProjectId = null;
    state.recentProjectIds = [];
    state._projectLifecycle = {};
    state.canvas.activeFullscreen = 'start';
    state.canvas.navStack = [{ fullscreen: 'start', payload: null }];
    state.modals = { settings: false, projectInfo: false };
    state.toast = null;
    state.theme = 'light';
  });
}

describe('K5 — StartScreen wireframe v7', () => {
  beforeEach(() => {
    reset();
    cleanup();
  });

  it('shows empty state when no Recent projects', () => {
    render(<StartScreen onOpenFile={() => {}} />);
    expect(screen.getByTestId('ss-recent-empty')).toBeTruthy();
  });

  it('renders 3 RecentCards with different statuses (saved, unsaved, untitled)', () => {
    useStore.setState((state) => {
      state.projects['p-1'] = {
        id: 'p-1', name: 'pUC19-derivative', tags: ['bacterial', 'gfp'],
        description: 'Меняем lac promoter на T7.', containerIds: [1, 2, 3, 4],
        updatedAt: new Date().toISOString(),
      };
      state.projects['p-2'] = {
        id: 'p-2', name: 'Untitled', tags: [], description: '',
        containerIds: [], updatedAt: new Date().toISOString(),
      };
      state.projects['p-3'] = {
        id: 'p-3', name: 'pBR322-cmR-test', tags: ['bacterial'],
        description: 'Тест замены ampR на cmR.', containerIds: [1, 2],
        updatedAt: new Date().toISOString(),
      };
      state._projectLifecycle['p-1'] = { lastSavedToFileAt: '2026-04-30T00:00:00Z', fileName: 'pUC19-derivative.bodge' };
      state._projectLifecycle['p-2'] = { lastSavedToFileAt: null, fileName: null };
      state._projectLifecycle['p-3'] = { lastSavedToFileAt: '2026-04-29T12:00:00Z', fileName: 'pBR322.bodge' };
      state.recentProjectIds = ['p-1', 'p-2', 'p-3'];
    });
    render(<StartScreen onOpenFile={() => {}} />);
    const cards = screen.getAllByTestId('ss-recent-card');
    expect(cards.length).toBe(3);
    expect(cards[0].textContent).toContain('pUC19-derivative');
    expect(cards[1].textContent).toContain('Untitled');
    expect(cards[2].textContent).toContain('pBR322-cmR-test');
  });

  it('Untitled project shows italic placeholders for path / tags / description', () => {
    useStore.setState((state) => {
      state.projects['p-2'] = {
        id: 'p-2', name: 'Untitled', tags: [], description: '',
        containerIds: [], updatedAt: new Date().toISOString(),
      };
      state._projectLifecycle['p-2'] = { lastSavedToFileAt: null, fileName: null };
      state.recentProjectIds = ['p-2'];
    });
    render(<StartScreen onOpenFile={() => {}} />);
    const card = screen.getByTestId('ss-recent-card');
    expect(card.textContent).toContain('no file location yet');
    expect(card.textContent).toContain('no tags yet');
    expect(card.textContent).toContain('no description yet');
  });

  it('renders tags chips for projects with tags', () => {
    useStore.setState((state) => {
      state.projects['p-1'] = {
        id: 'p-1', name: 'pUC19', tags: ['bacterial', 'gfp', 'antibiotic-marker'],
        description: 'd', containerIds: [], updatedAt: new Date().toISOString(),
      };
      state._projectLifecycle['p-1'] = {};
      state.recentProjectIds = ['p-1'];
    });
    render(<StartScreen onOpenFile={() => {}} />);
    expect(screen.getByText('bacterial')).toBeTruthy();
    expect(screen.getByText('gfp')).toBeTruthy();
    expect(screen.getByText('antibiotic-marker')).toBeTruthy();
  });

  it('clicking a Recent card calls openProjectFromIndexedDB', () => {
    useStore.setState((state) => {
      state.projects['p-1'] = {
        id: 'p-1', name: 'P', tags: [], description: '',
        containerIds: [], updatedAt: new Date().toISOString(),
      };
      state._projectLifecycle['p-1'] = {};
      state.recentProjectIds = ['p-1'];
    });
    const spy = vi.fn().mockResolvedValue(undefined);
    useStore.setState({ openProjectFromIndexedDB: spy });
    render(<StartScreen onOpenFile={() => {}} />);
    fireEvent.click(screen.getByTestId('ss-recent-card'));
    expect(spy).toHaveBeenCalledWith('p-1');
  });

  it('Recent card × button → confirm OK → removeProjectFromIndexedDB(id)', () => {
    useStore.setState((state) => {
      state.projects['p-1'] = {
        id: 'p-1', name: 'pUC19', tags: [], description: '',
        containerIds: [], updatedAt: new Date().toISOString(),
      };
      state._projectLifecycle['p-1'] = {};
      state.recentProjectIds = ['p-1'];
    });
    const removeSpy = vi.fn().mockResolvedValue(undefined);
    const openSpy = vi.fn();
    useStore.setState({ removeProjectFromIndexedDB: removeSpy, openProjectFromIndexedDB: openSpy });
    const confirmStub = vi.fn(() => true);
    const originalConfirm = window.confirm;
    window.confirm = confirmStub;

    try {
      render(<StartScreen onOpenFile={() => {}} />);
      fireEvent.click(screen.getByTestId('ss-recent-card-delete'));

      expect(confirmStub).toHaveBeenCalledTimes(1);
      expect(confirmStub.mock.calls[0][0]).toMatch(/pUC19/);
      expect(removeSpy).toHaveBeenCalledWith('p-1');
      expect(openSpy).not.toHaveBeenCalled(); // delete must not bubble to card click
    } finally {
      window.confirm = originalConfirm;
    }
  });

  it('Recent card × button → confirm Cancel → no reducer call', () => {
    useStore.setState((state) => {
      state.projects['p-1'] = {
        id: 'p-1', name: 'P', tags: [], description: '',
        containerIds: [], updatedAt: new Date().toISOString(),
      };
      state._projectLifecycle['p-1'] = {};
      state.recentProjectIds = ['p-1'];
    });
    const removeSpy = vi.fn();
    useStore.setState({ removeProjectFromIndexedDB: removeSpy });
    const confirmStub = vi.fn(() => false);
    const originalConfirm = window.confirm;
    window.confirm = confirmStub;

    try {
      render(<StartScreen onOpenFile={() => {}} />);
      fireEvent.click(screen.getByTestId('ss-recent-card-delete'));

      expect(confirmStub).toHaveBeenCalled();
      expect(removeSpy).not.toHaveBeenCalled();
    } finally {
      window.confirm = originalConfirm;
    }
  });

  it('+ New project triggers createProject and switches activeFullscreen to dag', () => {
    render(<StartScreen onOpenFile={() => {}} />);
    fireEvent.click(screen.getByTestId('ss-new-project'));
    expect(useStore.getState().currentProjectId).not.toBeNull();
    expect(useStore.getState().canvas.activeFullscreen).toBe('dag');
  });

  it('+ New project also opens ProjectInfoModal so user can rename right away', () => {
    render(<StartScreen onOpenFile={() => {}} />);
    expect(useStore.getState().modals.projectInfo).toBe(false);
    fireEvent.click(screen.getByTestId('ss-new-project'));
    expect(useStore.getState().modals.projectInfo).toBe(true);
  });

  it('↓ Import sequence is disabled (no-op click)', () => {
    render(<StartScreen onOpenFile={() => {}} />);
    const btn = screen.getByTestId('ss-import-sequence');
    expect(btn.disabled).toBe(true);
  });

  it('Library click pushes underConstruction with milestone M-H', () => {
    render(<StartScreen onOpenFile={() => {}} />);
    fireEvent.click(screen.getByTestId('ss-browse-library'));
    const top = useStore.getState().canvas.navStack[useStore.getState().canvas.navStack.length - 1];
    expect(top.fullscreen).toBe('underConstruction');
    expect(top.payload.milestone).toBe('M-H');
    expect(top.payload.name).toBe('Library');
  });

  it('Group projects link is disabled with "soon" badge', () => {
    render(<StartScreen onOpenFile={() => {}} />);
    const btn = screen.getByTestId('ss-browse-group-projects');
    expect(btn.disabled).toBe(true);
    expect(btn.textContent).toContain('soon');
  });

  it('formatRelativeTimeAgo handles common ranges', () => {
    const now = new Date('2026-04-30T12:00:00Z').getTime();
    expect(formatRelativeTimeAgo(new Date(now - 30_000).toISOString(), now)).toBe('только что');
    expect(formatRelativeTimeAgo(new Date(now - 30 * 60_000).toISOString(), now)).toContain('мин назад');
    expect(formatRelativeTimeAgo(new Date(now - 2 * 3600_000).toISOString(), now)).toContain('ч назад');
    expect(formatRelativeTimeAgo(new Date(now - 36 * 3600_000).toISOString(), now)).toBe('вчера');
    expect(formatRelativeTimeAgo(new Date(now - 5 * 24 * 3600_000).toISOString(), now)).toContain('дн назад');
    expect(formatRelativeTimeAgo(new Date(now - 14 * 24 * 3600_000).toISOString(), now)).toContain('нед назад');
    expect(formatRelativeTimeAgo(new Date(now - 60 * 24 * 3600_000).toISOString(), now)).toContain('мес назад');
  });
});
