/**
 * Sprint X K5 — EditorPanels Mutations panel Git-aware UX.
 * Toggle ✕/✓, archive 🗑 with confirm, inline message edit, legacy lock,
 * group-by-codon, diff-view toggle integration.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, screen, act } from '@testing-library/react';
import EditorPanels from '../components/FragmentEditor/EditorPanels';
import FragmentEditor from '../components/FragmentEditor';
import { useStore } from '../store';
import { createCommit } from '../lib/plasmid-git';

function makeCommit(type, parentPos, payload, label, applied = true, t = Date.now()) {
  const c = createCommit(type, parentPos, payload, label, undefined, t);
  return { ...c, applied };
}

const panelProps = (overrides = {}) => ({
  fragment: { id: 'f1', name: 'F', type: 'CDS', sequence: 'ATGGCTAAAGAGTTT', annotations: [], domains: [] },
  seq: 'ATGGCTAAAGAGTTT',
  isCDS: true,
  totalAA: 5,
  protein: 'MAKEF',
  fullViewActive: false,
  annotations: [],
  setAnnotations: () => {},
  mutations: [],
  setMutations: () => {},
  mutationHighlight: new Map(),
  panelsOpen: { annotations: false, mutations: true, protein: false },
  togglePanel: () => {},
  addForm: null,
  setAddForm: () => {},
  onAddDomain: () => {},
  commits: [],
  onToggleCommit: () => {},
  onArchiveCommit: () => {},
  onSetMessage: () => {},
  ...overrides,
});

describe('Sprint X K5 — EditorPanels Git Mutations UX', () => {
  beforeEach(() => { window.confirm = vi.fn(() => true); });

  it('commit active → ✕ toggle → onToggleCommit(id) called', () => {
    const onToggleCommit = vi.fn();
    const c = makeCommit('substitution', 3, { newCodon: 'GAA' }, 'A2E', true, 100);
    render(<EditorPanels {...panelProps({ commits: [c], onToggleCommit })} />);
    const toggleBtn = screen.getByTitle(/Отключить мутацию/);
    fireEvent.click(toggleBtn);
    expect(onToggleCommit).toHaveBeenCalledWith(c.id);
  });

  it('commit disabled → ✓ toggle → onToggleCommit called', () => {
    const onToggleCommit = vi.fn();
    const c = makeCommit('substitution', 3, { newCodon: 'GAA' }, 'A2E', false, 100);
    render(<EditorPanels {...panelProps({ commits: [c], onToggleCommit })} />);
    const toggleBtn = screen.getByTitle(/Вернуть мутацию/);
    fireEvent.click(toggleBtn);
    expect(onToggleCommit).toHaveBeenCalledWith(c.id);
  });

  it('archive 🗑 → confirm OK → onArchiveCommit called; Cancel → no-op', () => {
    const onArchiveCommit = vi.fn();
    const c = makeCommit('substitution', 3, { newCodon: 'GAA' }, 'A2E', true, 100);

    // Confirm returns true
    window.confirm = vi.fn(() => true);
    const { unmount } = render(<EditorPanels {...panelProps({ commits: [c], onArchiveCommit })} />);
    fireEvent.click(screen.getByTitle('Удалить мутацию навсегда'));
    expect(onArchiveCommit).toHaveBeenCalledWith(c.id);
    unmount();

    // Confirm returns false → no call
    window.confirm = vi.fn(() => false);
    onArchiveCommit.mockClear();
    render(<EditorPanels {...panelProps({ commits: [c], onArchiveCommit })} />);
    fireEvent.click(screen.getByTitle('Удалить мутацию навсегда'));
    expect(onArchiveCommit).not.toHaveBeenCalled();
  });

  it('inline edit message via pencil → Enter → onSetMessage(id, value)', () => {
    const onSetMessage = vi.fn();
    const c = makeCommit('substitution', 3, { newCodon: 'GAA' }, 'A2E', true, 100);
    render(<EditorPanels {...panelProps({ commits: [c], onSetMessage })} />);
    fireEvent.click(screen.getByTitle('Редактировать заметку'));
    const input = screen.getByPlaceholderText(/заметк/);
    fireEvent.change(input, { target: { value: 'rational' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSetMessage).toHaveBeenCalledWith(c.id, 'rational');
  });

  it('legacy mutation (no commit.id) → 🔒 rendered, buttons disabled via pointer-events:none', () => {
    const legacyMuts = [{ label: 'G26A', codonStart: 75 }];
    const onToggleCommit = vi.fn();
    render(<EditorPanels {...panelProps({ mutations: legacyMuts, commits: [], onToggleCommit })} />);
    const legacyBlock = screen.getByTestId('legacy-mutations');
    expect(legacyBlock.textContent).toContain('🔒');
    expect(legacyBlock.textContent).toContain('G26A');
    // pointer-events:none means the inner rows aren't reachable as buttons
    const inner = legacyBlock.querySelector('div[style*="pointer-events"]');
    expect(inner).not.toBeNull();
    expect(inner.getAttribute('style')).toMatch(/pointer-events:\s*none/);
  });

  it('group-by-codon: three substitutions on same codon → one group with three items', () => {
    const c1 = makeCommit('substitution', 3, { newCodon: 'GCA' }, 'A2A_syn', false, 100);
    const c2 = makeCommit('substitution', 3, { newCodon: 'GAA' }, 'A2E', false, 200);
    const c3 = makeCommit('substitution', 3, { newCodon: 'GTT' }, 'A2V', true, 300);
    render(<EditorPanels {...panelProps({ commits: [c1, c2, c3] })} />);
    // codon 2 (parentPos 3 → 3/3+1 = 2)
    const group = screen.getByTestId('commit-group-C2');
    expect(group).not.toBeNull();
    expect(group.textContent).toContain('A2A_syn');
    expect(group.textContent).toContain('A2E');
    expect(group.textContent).toContain('A2V');
  });
});

// ── Integration test: diff view toggle ──
describe('Sprint X K5 — FragmentEditor diff view toggle', () => {
  beforeEach(() => {
    useStore.setState({
      editTarget: null, parts: [], activeId: 'asmX',
      assemblies: [{
        id: 'asmX', name: 'x', fragments: [], junctions: [], primers: [], apiWarnings: [], calculated: false,
      }],
    });
    window.confirm = vi.fn(() => true);
  });

  it('diff-view toggle disabled when no commits, enabled after commit, toggles banner', () => {
    const frag = {
      id: 'fX', name: 'X', type: 'CDS',
      sequence: 'ATGGCTAAAGAGTTT', length: 15, strand: 1,
      annotations: [], mutations: [],
    };
    // Seed fragment into store
    act(() => {
      useStore.setState(s => ({
        ...s,
        assemblies: [{ ...s.assemblies[0], fragments: [frag] }],
      }));
    });

    const { rerender } = render(<FragmentEditor fragment={frag} onSave={() => {}} onClose={() => {}} />);

    // No commits → toggle disabled
    const toggle = screen.getByTestId('diff-view-toggle');
    expect(toggle.disabled).toBe(true);

    // Inject commits via store reducer
    act(() => {
      useStore.getState().applyMutationGit(0, {
        type: 'substitution', dnaPosition: 3, newCodon: 'GAA', label: 'A2E',
      });
    });

    rerender(<FragmentEditor fragment={frag} onSave={() => {}} onClose={() => {}} />);

    const toggle2 = screen.getByTestId('diff-view-toggle');
    expect(toggle2.disabled).toBe(false);

    // Click to activate
    fireEvent.click(toggle2);
    expect(screen.queryByText(/Показан baseline/)).not.toBeNull();
    // Close diff
    fireEvent.click(screen.getByTestId('diff-view-toggle'));
    expect(screen.queryByText(/Показан baseline/)).toBeNull();
  });
});
