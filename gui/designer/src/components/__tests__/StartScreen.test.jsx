import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, act, waitFor } from '@testing-library/react';
import { useStore } from '../../store';
import { clearAllAutosaveTimers } from '../../store/projectSlice';
import StartScreen from '../StartScreen';
import { formatRelativeTimeAgo } from '../StartScreen/RecentCard';
import { STRINGS } from '../../lib/strings';
import { APP_VERSION } from '../../lib/version.js';

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
    state.toasts = [];
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

  it('delete × shows toast with undo, project hidden from RecentList, no DB call yet', () => {
    useStore.setState((state) => {
      state.projects['p-1'] = {
        id: 'p-1', name: 'pUC19', tags: [], description: '',
        containerIds: [], updatedAt: new Date().toISOString(),
      };
      state._projectLifecycle['p-1'] = {};
      state.recentProjectIds = ['p-1'];
    });
    const removeSpy = vi.fn().mockResolvedValue(undefined);
    useStore.setState({ removeProjectFromIndexedDB: removeSpy });

    render(<StartScreen onOpenFile={() => {}} />);
    fireEvent.click(screen.getByTestId('ss-recent-card-delete'));

    const state = useStore.getState();
    expect(state.toasts.length).toBe(1);
    expect(state.toasts[0].kind).toBe('info');
    expect(state.toasts[0].msg).toMatch(/pUC19/);
    expect(typeof state.toasts[0].onUndo).toBe('function');
    expect(typeof state.toasts[0].onAutoDismiss).toBe('function');
    expect(state.toasts[0].autoDismissMs).toBe(5000);
    expect(state.projects['p-1']._pendingDelete).toBe(true);
    expect(screen.queryByTestId('ss-recent-card')).toBeNull();
    expect(removeSpy).not.toHaveBeenCalled();
  });

  it('soft-delete: undo callback restores the project to the RecentList', () => {
    useStore.setState((state) => {
      state.projects['p-1'] = {
        id: 'p-1', name: 'pUC19', tags: [], description: '',
        containerIds: [], updatedAt: new Date().toISOString(),
      };
      state._projectLifecycle['p-1'] = {};
      state.recentProjectIds = ['p-1'];
    });
    const removeSpy = vi.fn().mockResolvedValue(undefined);
    useStore.setState({ removeProjectFromIndexedDB: removeSpy });

    render(<StartScreen onOpenFile={() => {}} />);
    fireEvent.click(screen.getByTestId('ss-recent-card-delete'));
    expect(screen.queryByTestId('ss-recent-card')).toBeNull();

    const onUndo = useStore.getState().toasts[0].onUndo;
    act(() => { onUndo(); });

    expect(useStore.getState().projects['p-1']._pendingDelete).toBe(false);
    expect(screen.getByTestId('ss-recent-card')).toBeTruthy();
    expect(removeSpy).not.toHaveBeenCalled();
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

  it('Library click opens Importer pre-focused on «Моя библиотека» catalog source', () => {
    render(<StartScreen onOpenFile={() => {}} />);
    fireEvent.click(screen.getByTestId('ss-browse-library'));
    const top = useStore.getState().canvas.navStack[useStore.getState().canvas.navStack.length - 1];
    expect(top.fullscreen).toBe('importer');
    expect(top.payload.target).toBe('library');
    expect(top.payload.openCatalogSource).toEqual({ kind: 'mine', value: '__all__' });
  });

  it('Sidebar footer renders the BodgeGene version from lib/version.js', () => {
    render(<StartScreen onOpenFile={() => {}} />);
    const footer = screen.getByTestId('ss-version-footer');
    expect(footer.textContent).toBe(`BodgeGene v${APP_VERSION}`);
  });

  it('Group projects link is disabled with "soon" badge', () => {
    render(<StartScreen onOpenFile={() => {}} />);
    const btn = screen.getByTestId('ss-browse-group-projects');
    expect(btn.disabled).toBe(true);
    expect(btn.textContent).toContain('soon');
  });

  it('Export toggle adds checkboxes to cards and hides × delete buttons', () => {
    useStore.setState((state) => {
      state.projects['p-1'] = {
        id: 'p-1', name: 'A', tags: [], description: '', containerIds: [],
        updatedAt: new Date().toISOString(),
      };
      state.projects['p-2'] = {
        id: 'p-2', name: 'B', tags: [], description: '', containerIds: [],
        updatedAt: new Date().toISOString(),
      };
      state._projectLifecycle['p-1'] = {};
      state._projectLifecycle['p-2'] = {};
      state.recentProjectIds = ['p-1', 'p-2'];
    });
    render(<StartScreen onOpenFile={() => {}} />);
    expect(screen.queryAllByTestId('ss-recent-card-checkbox').length).toBe(0);
    expect(screen.queryAllByTestId('ss-recent-card-delete').length).toBe(2);

    fireEvent.click(screen.getByTestId('ss-export-toggle'));
    expect(screen.queryAllByTestId('ss-recent-card-checkbox').length).toBe(2);
    expect(screen.queryAllByTestId('ss-recent-card-delete').length).toBe(0);
    expect(screen.getByTestId('ss-export-confirm')).toBeTruthy();
    expect(screen.getByTestId('ss-export-confirm').disabled).toBe(true);
  });

  it('In export mode, clicking a card toggles selection (does not open project)', () => {
    useStore.setState((state) => {
      state.projects['p-1'] = {
        id: 'p-1', name: 'A', tags: [], description: '', containerIds: [],
        updatedAt: new Date().toISOString(),
      };
      state._projectLifecycle['p-1'] = {};
      state.recentProjectIds = ['p-1'];
    });
    const openSpy = vi.fn();
    useStore.setState({ openProjectFromIndexedDB: openSpy });
    render(<StartScreen onOpenFile={() => {}} />);
    fireEvent.click(screen.getByTestId('ss-export-toggle'));

    const card = screen.getByTestId('ss-recent-card');
    fireEvent.click(card);
    expect(screen.getByTestId('ss-recent-card-checkbox').dataset.selected).toBe('true');
    expect(openSpy).not.toHaveBeenCalled();
    expect(screen.getByTestId('ss-export-confirm').disabled).toBe(false);

    fireEvent.click(card);
    expect(screen.getByTestId('ss-recent-card-checkbox').dataset.selected).toBe('false');
  });

  it('Скачать выбранные → triggers downloadBlob once per selected project', async () => {
    useStore.setState((state) => {
      state.projects['p-1'] = {
        id: 'p-1', name: 'pUC19', tags: [], description: '', containerIds: [],
        updatedAt: new Date().toISOString(),
      };
      state.projects['p-2'] = {
        id: 'p-2', name: 'pET28a-GFP', tags: [], description: '', containerIds: [],
        updatedAt: new Date().toISOString(),
      };
      state._projectLifecycle['p-1'] = {};
      state._projectLifecycle['p-2'] = {};
      state.recentProjectIds = ['p-1', 'p-2'];
    });

    // count download attempts via anchor.click
    const clicks = [];
    const originalCreate = document.createElement.bind(document);
    const createSpy = vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      const el = originalCreate(tag);
      if (tag === 'a') {
        el.click = () => { clicks.push(el.download); };
      }
      return el;
    });
    const originalCreateUrl = URL.createObjectURL;
    URL.createObjectURL = () => 'blob:fake';
    const originalRevokeUrl = URL.revokeObjectURL;
    URL.revokeObjectURL = () => {};

    try {
      render(<StartScreen onOpenFile={() => {}} />);
      fireEvent.click(screen.getByTestId('ss-export-toggle'));
      const cards = screen.getAllByTestId('ss-recent-card');
      fireEvent.click(cards[0]);
      fireEvent.click(cards[1]);
      expect(screen.getByTestId('ss-export-confirm').disabled).toBe(false);

      await act(async () => {
        fireEvent.click(screen.getByTestId('ss-export-confirm'));
      });
      await waitFor(() => expect(clicks.length).toBe(2), { timeout: 1500 });

      expect(clicks).toEqual(expect.arrayContaining(['pUC19.bodge', 'pET28a-GFP.bodge']));
      // export mode resets after download
      await waitFor(() => {
        expect(screen.queryByTestId('ss-export-confirm')).toBeNull();
      }, { timeout: 1500 });
    } finally {
      createSpy.mockRestore();
      URL.createObjectURL = originalCreateUrl;
      URL.revokeObjectURL = originalRevokeUrl;
    }
  });

  it('handleNewProject calls createProject then openProjectInfo (in order)', () => {
    const calls = [];
    const createSpy = vi.fn((name) => {
      calls.push('createProject');
      const id = 'p-new';
      useStore.setState((state) => {
        state.projects[id] = {
          id, name: name || 'Untitled', tags: [], description: '',
          containerIds: [], updatedAt: new Date().toISOString(),
        };
        state.currentProjectId = id;
        state.canvas.activeFullscreen = 'dag';
      });
      return id;
    });
    const openInfoSpy = vi.fn(() => {
      calls.push('openProjectInfo');
      useStore.setState((state) => { state.modals.projectInfo = true; });
    });
    useStore.setState({ createProject: createSpy, openProjectInfo: openInfoSpy });
    render(<StartScreen onOpenFile={() => {}} />);
    fireEvent.click(screen.getByTestId('ss-new-project'));
    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(openInfoSpy).toHaveBeenCalledTimes(1);
    expect(calls).toEqual(['createProject', 'openProjectInfo']);
  });

  it('export toggle switches exportMode and updates header text', () => {
    useStore.setState((state) => {
      state.projects['p-1'] = {
        id: 'p-1', name: 'A', tags: [], description: '', containerIds: [],
        updatedAt: new Date().toISOString(),
      };
      state._projectLifecycle['p-1'] = {};
      state.recentProjectIds = ['p-1'];
    });
    render(<StartScreen onOpenFile={() => {}} />);
    expect(screen.getByText(STRINGS.startScreen.recentProjects)).toBeTruthy();
    fireEvent.click(screen.getByTestId('ss-export-toggle'));
    expect(screen.getByText(STRINGS.startScreen.exportHeader(0))).toBeTruthy();
    expect(screen.queryByText(STRINGS.startScreen.recentProjects)).toBeNull();
  });

  it('checkbox click updates selectedIds and counter in the header', () => {
    useStore.setState((state) => {
      state.projects['p-1'] = {
        id: 'p-1', name: 'A', tags: [], description: '', containerIds: [],
        updatedAt: new Date().toISOString(),
      };
      state.projects['p-2'] = {
        id: 'p-2', name: 'B', tags: [], description: '', containerIds: [],
        updatedAt: new Date().toISOString(),
      };
      state._projectLifecycle['p-1'] = {};
      state._projectLifecycle['p-2'] = {};
      state.recentProjectIds = ['p-1', 'p-2'];
    });
    render(<StartScreen onOpenFile={() => {}} />);
    fireEvent.click(screen.getByTestId('ss-export-toggle'));
    expect(screen.getByText(STRINGS.startScreen.exportHeader(0))).toBeTruthy();
    const cards = screen.getAllByTestId('ss-recent-card');
    fireEvent.click(cards[0]);
    expect(screen.getByText(STRINGS.startScreen.exportHeader(1))).toBeTruthy();
    fireEvent.click(cards[1]);
    expect(screen.getByText(STRINGS.startScreen.exportHeader(2))).toBeTruthy();
    fireEvent.click(cards[0]);
    expect(screen.getByText(STRINGS.startScreen.exportHeader(1))).toBeTruthy();
  });

  it('exportMode hides every Recent card × delete button', () => {
    useStore.setState((state) => {
      state.projects['p-1'] = {
        id: 'p-1', name: 'A', tags: [], description: '', containerIds: [],
        updatedAt: new Date().toISOString(),
      };
      state.projects['p-2'] = {
        id: 'p-2', name: 'B', tags: [], description: '', containerIds: [],
        updatedAt: new Date().toISOString(),
      };
      state._projectLifecycle['p-1'] = {};
      state._projectLifecycle['p-2'] = {};
      state.recentProjectIds = ['p-1', 'p-2'];
    });
    render(<StartScreen onOpenFile={() => {}} />);
    expect(screen.queryAllByTestId('ss-recent-card-delete').length).toBe(2);
    fireEvent.click(screen.getByTestId('ss-export-toggle'));
    expect(screen.queryAllByTestId('ss-recent-card-delete').length).toBe(0);
  });

  it('formatRelativeTimeAgo handles common ranges', () => {
    const now = new Date('2026-04-30T12:00:00Z').getTime();
    expect(formatRelativeTimeAgo(new Date(now - 30_000).toISOString(), now)).toBe(STRINGS.startScreen.timeAgo.justNow);
    expect(formatRelativeTimeAgo(new Date(now - 30 * 60_000).toISOString(), now)).toContain('min ago');
    expect(formatRelativeTimeAgo(new Date(now - 2 * 3600_000).toISOString(), now)).toContain('h ago');
    expect(formatRelativeTimeAgo(new Date(now - 36 * 3600_000).toISOString(), now)).toBe(STRINGS.startScreen.timeAgo.yesterday);
    expect(formatRelativeTimeAgo(new Date(now - 5 * 24 * 3600_000).toISOString(), now)).toContain('d ago');
    expect(formatRelativeTimeAgo(new Date(now - 14 * 24 * 3600_000).toISOString(), now)).toContain('w ago');
    expect(formatRelativeTimeAgo(new Date(now - 60 * 24 * 3600_000).toISOString(), now)).toContain('mo ago');
  });
});
