import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { useStore } from '../../store';
import { clearAllAutosaveTimers, setAutosaveDelay, DEFAULT_AUTOSAVE_DELAY_MS, clearAllLocks } from '../../store/projectSlice';
import { clearAll } from '../../db/dexie-schema';
import ProjectInfoModal from '../ProjectInfoModal';

async function reset() {
  clearAllAutosaveTimers();
  clearAllLocks();
  setAutosaveDelay(DEFAULT_AUTOSAVE_DELAY_MS);
  await clearAll();
  useStore.setState((state) => {
    state.projects = {};
    state.currentProjectId = null;
    state.recentProjectIds = [];
    state._projectLifecycle = {};
    state.canvas.activeFullscreen = 'start';
    state.canvas.navStack = [{ fullscreen: 'start', payload: null }];
    state.modals = { settings: false, projectInfo: true };
    state.toast = null;
    state.theme = 'light';
  });
}

function seedProject(extra = {}) {
  const id = useStore.getState().createProject('My plasmid');
  useStore.setState((state) => {
    Object.assign(state.projects[id], extra);
  });
  return id;
}

describe('M-A-fix-2 — ProjectInfoModal', () => {
  beforeEach(async () => {
    await reset();
    cleanup();
  });

  it('1) renders with pre-populated name / description / tags from current project', () => {
    seedProject({ description: 'plant binary vector', tags: ['bacterial', 'gfp'] });
    render(<ProjectInfoModal />);
    expect(screen.getByTestId('project-info-name').value).toBe('My plasmid');
    expect(screen.getByTestId('project-info-description').value).toBe('plant binary vector');
    expect(screen.getByTestId('project-info-tag-bacterial')).toBeTruthy();
    expect(screen.getByTestId('project-info-tag-gfp')).toBeTruthy();
  });

  it('2) edit name → Save → renameProject called with trimmed value', () => {
    const id = seedProject();
    render(<ProjectInfoModal />);
    fireEvent.change(screen.getByTestId('project-info-name'), { target: { value: '  pUC19 v2  ' } });
    fireEvent.click(screen.getByTestId('project-info-save'));
    expect(useStore.getState().projects[id].name).toBe('pUC19 v2');
  });

  it('3) empty name → Save → falls back to "Untitled"', () => {
    const id = seedProject();
    render(<ProjectInfoModal />);
    fireEvent.change(screen.getByTestId('project-info-name'), { target: { value: '   ' } });
    fireEvent.click(screen.getByTestId('project-info-save'));
    expect(useStore.getState().projects[id].name).toBe('Untitled');
  });

  it('4) edit description → Save → updateDescription writes to project', () => {
    const id = seedProject();
    render(<ProjectInfoModal />);
    fireEvent.change(screen.getByTestId('project-info-description'), {
      target: { value: 'GFP under T7 promoter, sanger-verified' },
    });
    fireEvent.click(screen.getByTestId('project-info-save'));
    expect(useStore.getState().projects[id].description).toBe('GFP under T7 promoter, sanger-verified');
  });

  it('5) add tag via Enter → Save → tag stored lowercase + trimmed', () => {
    const id = seedProject();
    render(<ProjectInfoModal />);
    const input = screen.getByTestId('project-info-tag-input');
    fireEvent.change(input, { target: { value: '  pET-28a ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.click(screen.getByTestId('project-info-save'));
    expect(useStore.getState().projects[id].tags).toContain('pet-28a');
  });

  it('6) remove tag chip via × → Save → tag dropped from project', () => {
    const id = seedProject({ tags: ['bacterial', 'gfp'] });
    render(<ProjectInfoModal />);
    fireEvent.click(screen.getByTestId('project-info-tag-remove-bacterial'));
    fireEvent.click(screen.getByTestId('project-info-save'));
    expect(useStore.getState().projects[id].tags).toEqual(['gfp']);
  });

  it('7) Cancel closes the modal without applying changes', () => {
    const id = seedProject({ description: 'old' });
    render(<ProjectInfoModal />);
    fireEvent.change(screen.getByTestId('project-info-name'), { target: { value: 'changed' } });
    fireEvent.change(screen.getByTestId('project-info-description'), { target: { value: 'changed desc' } });
    fireEvent.click(screen.getByTestId('project-info-cancel'));
    expect(useStore.getState().modals.projectInfo).toBe(false);
    expect(useStore.getState().projects[id].name).toBe('My plasmid');
    expect(useStore.getState().projects[id].description).toBe('old');
  });

  it('renders nothing if there is no current project (defensive)', () => {
    useStore.setState((state) => {
      state.currentProjectId = null;
      state.modals.projectInfo = true;
    });
    const { container } = render(<ProjectInfoModal />);
    expect(container.querySelector('[data-testid="project-info-modal"]')).toBeNull();
  });
});
