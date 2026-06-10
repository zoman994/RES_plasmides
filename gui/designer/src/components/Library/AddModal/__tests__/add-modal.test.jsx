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
    // Isolation — reset project maps so a test that seeds projects (e.g. the
    // WT-UX-4 distinguishing-detail case) can't leak into the next test.
    s.projects = {};
    s.pinnedProjectIds = [];
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

  it('submit dispatches onLaunchPreImport with picked source + project:<id> target (post 11.05.2026: dynamic targets)', () => {
    useStore.setState((s) => {
      s.projects = {
        pa: { id: 'pa', name: 'Active', containerIds: [] },
        pb: { id: 'pb', name: 'Pinned', containerIds: [] },
      };
      s.pinnedProjectIds = ['pb'];
      s.currentProjectId = 'pa';
    });
    const onLaunch = vi.fn();
    const onClose = vi.fn();
    render(<AddModal open onClose={onClose} onLaunchPreImport={onLaunch} />);
    // Source = file (no paste textarea path).
    fireEvent.click(screen.getByTestId('add-modal-source-file'));
    // Default target = current project (pa).
    expect(screen.getByTestId('add-modal-target-project:pa')).toBeTruthy();
    expect(screen.getByTestId('add-modal-target-project:pb')).toBeTruthy();
    // Switch to pb.
    fireEvent.click(screen.getByTestId('add-modal-target-project:pb').querySelector('input'));
    fireEvent.click(screen.getByTestId('add-modal-submit'));
    // WT-D-2 — preset now carries the autoAnnotate flag (default on).
    expect(onLaunch).toHaveBeenCalledWith({ source: 'file', target: 'project:pb', autoAnnotate: true });
    expect(onClose).toHaveBeenCalled();
  });

  it('paste source surfaces a textarea; submit emits {source:paste, target, text}', () => {
    useStore.setState((s) => {
      s.projects = {};
      s.pinnedProjectIds = [];
      s.currentProjectId = null;
    });
    const onLaunch = vi.fn();
    render(<AddModal open onClose={() => {}} onLaunchPreImport={onLaunch} />);
    fireEvent.click(screen.getByTestId('add-modal-source-paste'));
    const ta = screen.getByTestId('add-modal-paste-textarea');
    expect(ta).toBeTruthy();
    // Empty textarea → submit is disabled.
    expect(screen.getByTestId('add-modal-submit').disabled).toBe(true);
    fireEvent.change(ta, { target: { value: '>my\nATGCATGCATGC' } });
    fireEvent.click(screen.getByTestId('add-modal-submit'));
    expect(onLaunch).toHaveBeenCalledWith({
      source: 'paste',
      target: 'loose',
      text: '>my\nATGCATGCATGC',
      autoAnnotate: true,
      name: '',
      topology: 'linear',
    });
  });

  it('WT-D-2 — auto-annotate toggle defaults on; unchecking flows into the preset', () => {
    useStore.setState((s) => {
      s.projects = {};
      s.pinnedProjectIds = [];
      s.currentProjectId = null;
    });
    const onLaunch = vi.fn();
    render(<AddModal open onClose={() => {}} onLaunchPreImport={onLaunch} />);
    const toggle = screen.getByTestId('add-modal-auto-annotate');
    expect(toggle.checked).toBe(true); // default on
    fireEvent.click(screen.getByTestId('add-modal-source-file'));
    fireEvent.click(toggle); // turn off
    fireEvent.click(screen.getByTestId('add-modal-submit'));
    expect(onLaunch).toHaveBeenCalledWith({ source: 'file', target: 'loose', autoAnnotate: false });
  });

  it('targets list contains «Без проекта» + every pinned + current (deduped)', () => {
    useStore.setState((s) => {
      s.projects = {
        a: { id: 'a', name: 'Alpha', containerIds: [] },
        b: { id: 'b', name: 'Beta', containerIds: [] },
        c: { id: 'c', name: 'Gamma', containerIds: [] },
      };
      s.pinnedProjectIds = ['a', 'b'];
      s.currentProjectId = 'c';
    });
    render(<AddModal open onClose={() => {}} onLaunchPreImport={() => {}} />);
    expect(screen.getByTestId('add-modal-target-loose')).toBeTruthy();
    expect(screen.getByTestId('add-modal-target-project:a')).toBeTruthy();
    expect(screen.getByTestId('add-modal-target-project:b')).toBeTruthy();
    // Current (c) not in pinned → appended.
    expect(screen.getByTestId('add-modal-target-project:c')).toBeTruthy();
  });

  it('only «Без проекта» when there are no pinned and no current', () => {
    useStore.setState((s) => {
      s.projects = {};
      s.pinnedProjectIds = [];
      s.currentProjectId = null;
    });
    render(<AddModal open onClose={() => {}} onLaunchPreImport={() => {}} />);
    expect(screen.getByTestId('add-modal-target-loose')).toBeTruthy();
    expect(screen.queryByTestId('add-modal-target-active')).toBeNull();
  });
});

describe('AddModal UX batch — WT-UX-9 / 8 / 7 / 4', () => {
  it('WT-UX-9 — header reflects the selected target (project name vs loose)', () => {
    useStore.setState((s) => {
      s.projects = { pa: { id: 'pa', name: 'MyProj', containerIds: [], createdAt: 1000 } };
      s.pinnedProjectIds = ['pa'];
      s.currentProjectId = 'pa';
    });
    render(<AddModal open onClose={() => {}} onLaunchPreImport={() => {}} />);
    // Default target is the current project → header names it.
    expect(screen.getByTestId('add-modal-title').textContent).toContain('MyProj');
    // Switch to «Без проекта» → header says free desk.
    fireEvent.click(screen.getByTestId('add-modal-target-loose').querySelector('input'));
    expect(screen.getByTestId('add-modal-title').textContent.toLowerCase()).toContain('стол');
  });

  it('WT-UX-8/7 — paste section has a name input + topology toggle; preset carries them', () => {
    useStore.setState((s) => {
      s.projects = {}; s.pinnedProjectIds = []; s.currentProjectId = null;
    });
    const onLaunch = vi.fn();
    render(<AddModal open onClose={() => {}} onLaunchPreImport={onLaunch} />);
    fireEvent.click(screen.getByTestId('add-modal-source-paste'));
    expect(screen.getByTestId('add-modal-paste-name')).toBeTruthy();
    expect(screen.getByTestId('add-modal-topology-linear')).toBeTruthy();
    expect(screen.getByTestId('add-modal-topology-circular')).toBeTruthy();
    fireEvent.change(screen.getByTestId('add-modal-paste-textarea'), { target: { value: 'ACGTACGT' } });
    fireEvent.change(screen.getByTestId('add-modal-paste-name'), { target: { value: 'pLAB1' } });
    fireEvent.click(screen.getByTestId('add-modal-topology-circular'));
    fireEvent.click(screen.getByTestId('add-modal-submit'));
    expect(onLaunch).toHaveBeenCalledWith({
      source: 'paste', target: 'loose', text: 'ACGTACGT',
      name: 'pLAB1', topology: 'circular', autoAnnotate: true,
    });
  });

  it('WT-UX-4 — two same-named projects render a distinguishing detail', () => {
    useStore.setState((s) => {
      s.projects = {
        p1: { id: 'p1', name: 'Новый проект', containerIds: [], createdAt: 1000 },
        p2: { id: 'p2', name: 'Новый проект', containerIds: [], createdAt: 99999999 },
      };
      s.pinnedProjectIds = ['p1', 'p2'];
      s.currentProjectId = null;
    });
    render(<AddModal open onClose={() => {}} onLaunchPreImport={() => {}} />);
    const rowA = screen.getByTestId('add-modal-target-project:p1');
    const rowB = screen.getByTestId('add-modal-target-project:p2');
    // Same name, but the rows are not textually identical (distinguishing detail).
    expect(rowA.textContent).not.toBe(rowB.textContent);
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

// V117 (26.05.2026): tall content (paste fields + many target projects) must
// not push the footer off-screen. The modal is height-capped, the middle
// content scrolls, and header/footer stay pinned so the buttons are always
// reachable. happy-dom has no layout engine — assert the structural intent.
describe('V117 — AddModal stays within the viewport (footer reachable)', () => {
  it('modal is height-capped, body scrolls, footer is pinned', () => {
    render(<AddModal open onClose={() => {}} onLaunchPreImport={() => {}} />);
    const modal = screen.getByTestId('add-modal');
    expect(modal.style.maxHeight).toBeTruthy();

    const body = screen.getByTestId('add-modal-body');
    expect(body.style.overflowY).toBe('auto');
    expect(body.style.minHeight).toMatch(/^0(px)?$/); // happy-dom serializes 0 as '0'
    expect(body.style.flexGrow).toBe('1');

    const footer = screen.getByTestId('add-modal-submit').closest('footer');
    expect(footer).toBeTruthy();
    expect(footer.style.flexShrink).toBe('0');
  });
});

// 26.05.2026 (Игорь): в режиме «Вставить» галка авто-аннотации должна стоять
// прямо под полем ввода текста, а не внизу окна. В остальных режимах (файл и
// т.п.) строка остаётся на прежнем месте — ровно один инстанс в любом случае.
describe('AddModal — auto-annotate placement under the paste textarea', () => {
  const FOLLOWING = 4; // Node.DOCUMENT_POSITION_FOLLOWING

  it('paste mode: auto-annotate row sits directly under the textarea (above ИМЯ), single instance', () => {
    render(<AddModal open onClose={() => {}} onLaunchPreImport={() => {}} />);
    fireEvent.click(screen.getByTestId('add-modal-source-paste'));
    expect(screen.getAllByTestId('add-modal-auto-annotate')).toHaveLength(1);
    const textarea = screen.getByTestId('add-modal-paste-textarea');
    const autoRow = screen.getByTestId('add-modal-auto-annotate-row');
    const nameInput = screen.getByTestId('add-modal-paste-name');
    // order in the DOM: textarea → auto-annotate → ИМЯ
    expect(textarea.compareDocumentPosition(autoRow) & FOLLOWING).toBeTruthy();
    expect(autoRow.compareDocumentPosition(nameInput) & FOLLOWING).toBeTruthy();
  });

  it('file mode: auto-annotate row still present (single instance, no duplicate)', () => {
    render(<AddModal open onClose={() => {}} onLaunchPreImport={() => {}} />);
    fireEvent.click(screen.getByTestId('add-modal-source-file'));
    expect(screen.getAllByTestId('add-modal-auto-annotate')).toHaveLength(1);
  });
});
