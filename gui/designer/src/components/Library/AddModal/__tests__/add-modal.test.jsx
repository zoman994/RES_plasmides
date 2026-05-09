/**
 * AddModal + SourceTiles + CrossProjectStub — Sprint M-X.7a v2 K6
 * component tests.
 *
 * Covers:
 *   1. AddModal opens on +Add button click in LibraryWorkspace
 *   2. SourceTiles renders 4 tiles with right testids
 *   3. Cross-project tile click → CrossProjectStub modal appears
 *   4. Esc / backdrop click closes the modal
 *   5. Target radio selection updates state
 *   6. Submit dispatches onLaunchPreImport with {source, target}
 */
import 'fake-indexeddb/auto';
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { useStore } from '../../../../store';
import { resetDBForTests } from '../../../../db/dexie-schema';
import AddModal from '../AddModal';
import SourceTiles from '../SourceTiles';
import CrossProjectStub from '../CrossProjectStub';
import LibraryWorkspace from '../../LibraryWorkspace';

vi.mock('../../inspector/LibrarySingleInspector', () => ({
  default: () => <div data-testid="single-inspector-stub">inspector</div>,
}));
vi.mock('../../onboarding/OnboardingNudge', () => ({
  default: () => <div data-testid="onboarding-nudge">onboarding</div>,
}));

async function freshDB() {
  const name = `bodgegene-addmodal-${Math.random().toString(36).slice(2)}`;
  const db = resetDBForTests(name);
  await db.delete();
  await db.open();
}

beforeEach(async () => {
  await freshDB();
  useStore.setState((s) => {
    s.libraryEntries = {};
    s.looseFolders = [];
    s.workspace = { active: 'library', history: [], context: {} };
    s.currentProjectId = null;
  });
});
afterEach(cleanup);

describe('M-X.7a v2 K6 — SourceTiles', () => {
  it('renders 4 tiles with stable testids', () => {
    const onPick = vi.fn();
    render(<SourceTiles onPick={onPick} />);
    expect(screen.getByTestId('add-modal-source-file')).toBeTruthy();
    expect(screen.getByTestId('add-modal-source-paste')).toBeTruthy();
    expect(screen.getByTestId('add-modal-source-catalog')).toBeTruthy();
    expect(screen.getByTestId('add-modal-source-cross-project')).toBeTruthy();
  });

  it('cross-project tile flagged data-stub=true', () => {
    render(<SourceTiles onPick={() => {}} />);
    expect(screen.getByTestId('add-modal-source-cross-project').getAttribute('data-stub')).toBe('true');
    expect(screen.getByTestId('add-modal-source-file').getAttribute('data-stub')).toBe('false');
  });

  it('clicking a tile calls onPick with the tile id', () => {
    const onPick = vi.fn();
    render(<SourceTiles onPick={onPick} />);
    fireEvent.click(screen.getByTestId('add-modal-source-paste'));
    expect(onPick).toHaveBeenCalledWith('paste');
  });

  it('picked tile surfaces data-picked=true', () => {
    render(<SourceTiles onPick={() => {}} picked="catalog" />);
    expect(screen.getByTestId('add-modal-source-catalog').getAttribute('data-picked')).toBe('true');
    expect(screen.getByTestId('add-modal-source-file').getAttribute('data-picked')).toBe('false');
  });
});

describe('M-X.7a v2 K6 — CrossProjectStub', () => {
  it('renders dialog and closes via OK button', () => {
    const onClose = vi.fn();
    render(<CrossProjectStub onClose={onClose} />);
    expect(screen.getByTestId('cross-project-stub')).toBeTruthy();
    fireEvent.click(screen.getByTestId('cross-project-stub-close'));
    expect(onClose).toHaveBeenCalled();
  });
});

describe('M-X.7a v2 K6 — AddModal', () => {
  it('does not render when open=false', () => {
    render(<AddModal open={false} onClose={() => {}} />);
    expect(screen.queryByTestId('add-modal')).toBeNull();
  });

  it('renders when open=true with all controls', () => {
    render(<AddModal open onClose={() => {}} />);
    expect(screen.getByTestId('add-modal')).toBeTruthy();
    expect(screen.getByTestId('add-modal-source-tiles')).toBeTruthy();
    expect(screen.getByTestId('add-modal-target')).toBeTruthy();
    expect(screen.getByTestId('add-modal-submit')).toBeTruthy();
    expect(screen.getByTestId('add-modal-cancel')).toBeTruthy();
  });

  it('submit disabled until a non-stub source is picked', () => {
    render(<AddModal open onClose={() => {}} />);
    expect(screen.getByTestId('add-modal-submit').disabled).toBe(true);
    fireEvent.click(screen.getByTestId('add-modal-source-file'));
    expect(screen.getByTestId('add-modal-submit').disabled).toBe(false);
  });

  it('cross-project source opens CrossProjectStub instead of submitting', () => {
    render(<AddModal open onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('add-modal-source-cross-project'));
    expect(screen.getByTestId('cross-project-stub')).toBeTruthy();
    // Submit stays disabled (cross-project never resolves to PreImport).
    expect(screen.getByTestId('add-modal-submit').disabled).toBe(true);
  });

  it('Cancel button closes the modal', () => {
    const onClose = vi.fn();
    render(<AddModal open onClose={onClose} />);
    fireEvent.click(screen.getByTestId('add-modal-cancel'));
    expect(onClose).toHaveBeenCalled();
  });

  it('submit dispatches onLaunchPreImport with picked source + target', () => {
    const onLaunch = vi.fn();
    const onClose = vi.fn();
    render(<AddModal open onClose={onClose} onLaunchPreImport={onLaunch} />);
    fireEvent.click(screen.getByTestId('add-modal-source-paste'));
    fireEvent.click(screen.getByTestId('add-modal-target-active').querySelector('input'));
    fireEvent.click(screen.getByTestId('add-modal-submit'));
    expect(onLaunch).toHaveBeenCalledWith({ source: 'paste', target: 'active' });
    // Modal closes after launch handoff.
    expect(onClose).toHaveBeenCalled();
  });
});

describe('M-X.7a v2 K6 — LibraryWorkspace +Add wiring', () => {
  it('+Add in tree-head opens AddModal', () => {
    render(<LibraryWorkspace />);
    expect(screen.queryByTestId('add-modal')).toBeNull();
    fireEvent.click(screen.getByTestId('tree-add-btn'));
    expect(screen.getByTestId('add-modal')).toBeTruthy();
  });

  it('Empty-state +Add CTA also opens the modal', () => {
    render(<LibraryWorkspace />);
    fireEvent.click(screen.getByTestId('library-workspace-empty-add'));
    expect(screen.getByTestId('add-modal')).toBeTruthy();
  });
});
