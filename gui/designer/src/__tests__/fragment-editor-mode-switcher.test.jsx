/**
 * V12 — FragmentEditor mode switcher (Sprint 1.5).
 *
 * Two biologically distinct operations share the click gesture:
 *   mode='edit'        → bookkeeping fix of sequence record (no mutation tracking)
 *   mode='mutagenesis' → plan an experiment (strategy engine, primers, protocol)
 *
 * Mode lives above tabs; tabs stay for DNA view vs Regions/Protein.
 * Save button is routed by mode, not tab.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, screen, act } from '@testing-library/react';
import FragmentEditor from '../components/FragmentEditor';
import { useStore } from '../store';

// Minimal non-CDS fragment — avoids autoAnnotate async effects on CDS.
function makeFragment(overrides = {}) {
  return {
    id: 'f1',
    name: 'TestFrag',
    type: 'misc_feature',
    sequence: 'ATGCCCGGGAAATTT',
    length: 15,
    strand: 1,
    annotations: [],
    mutations: [],
    ...overrides,
  };
}

beforeEach(() => {
  // jsdom doesn't provide window.confirm — inject a mock that accepts by default.
  window.confirm = vi.fn(() => true);
});

describe('FragmentEditor — V12 mode switcher', () => {
  it('mounts in mode=edit by default; Save button is blue "💾 Сохранить"', () => {
    const onSave = vi.fn();
    render(<FragmentEditor fragment={makeFragment()} onSave={onSave} onClose={() => {}} />);
    // Edit mode save button is present
    expect(screen.queryByRole('button', { name: /💾 Сохранить/ })).not.toBeNull();
    // Mutagenesis-specific button is absent
    expect(screen.queryByRole('button', { name: /Применить мутагенез/ })).toBeNull();
  });

  it('mode=edit → Save → onSave called WITHOUT new mutations and with editHistory field', () => {
    const onSave = vi.fn();
    const frag = makeFragment();
    render(<FragmentEditor fragment={frag} onSave={onSave} onClose={() => {}} />);

    // Tab switches to edit view → DNA nucleotides are clickable. Click one nt to open DNA popup.
    // Use simpler path: invoke save directly (no seq change) — still should route to edit handler.
    fireEvent.click(screen.getByRole('button', { name: /💾 Сохранить/ }));

    expect(onSave).toHaveBeenCalledTimes(1);
    const payload = onSave.mock.calls[0][0];
    // Bookkeeping save does NOT include mutations
    // Bookkeeping save: mutations reference is unchanged from input (no new entry).
    // handleSaveFragment (useFragmentHandlers) uses identity check to bypass strategy engine.
    expect(payload.mutations === frag.mutations || (Array.isArray(payload.mutations) && payload.mutations.length === 0)).toBe(true);
    // editHistory field is present (array, possibly empty if no seq change)
    expect(Array.isArray(payload.editHistory)).toBe(true);
  });

  it('switching from edit to mutagenesis shows "Применить мутагенез" button (disabled when no mutations)', () => {
    const onSave = vi.fn();
    render(<FragmentEditor fragment={makeFragment()} onSave={onSave} onClose={() => {}} />);

    // Click Mutagenesis radio
    const radios = screen.getAllByRole('radio');
    const mutRadio = radios.find(r => /Мутагенез/.test(r.textContent));
    fireEvent.click(mutRadio);

    const mutBtn = screen.getByRole('button', { name: /Применить мутагенез/ });
    expect(mutBtn.disabled).toBe(true);
    expect(screen.queryByRole('button', { name: /💾 Сохранить/ })).toBeNull();
  });

  it('mode=mutagenesis: clicking a nucleotide opens DNA popup and tracks mutation via Git', () => {
    // Sprint X-fix K1: "Применить мутагенез" now routes through applyMutationGit
    // (store reducer) instead of onSave. Seed store so the reducer has a target.
    const frag = makeFragment();
    useStore.setState({
      editTarget: 0, parts: [], activeId: 'asm_mode_switch',
      assemblies: [{
        id: 'asm_mode_switch', name: 'x', fragments: [frag],
        junctions: [], primers: [], protocolSteps: [], apiWarnings: [], calculated: false,
      }],
    });
    const onSave = vi.fn();
    render(<FragmentEditor fragment={frag} onSave={onSave} onClose={() => {}} />);

    // Switch to mutagenesis mode
    const radios = screen.getAllByRole('radio');
    fireEvent.click(radios.find(r => /Мутагенез/.test(r.textContent)));

    // Click first nucleotide 'A' in the view.
    const ntSpans = Array.from(document.querySelectorAll('span.cursor-pointer'));
    expect(ntSpans.length).toBeGreaterThan(0);
    fireEvent.click(ntSpans[0]);

    // DNA popup opens — look for A/T/G/C buttons in popup ("Заменить" section)
    const buttonT = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'T');
    expect(buttonT).toBeDefined();
    act(() => { fireEvent.click(buttonT); });

    // Apply mutagenesis — Git reducer is called, onSave is NOT.
    act(() => { fireEvent.click(screen.getByRole('button', { name: /Применить мутагенез/ })); });

    expect(onSave).not.toHaveBeenCalled();
    const f = useStore.getState().assemblies[0].fragments[0];
    expect(Array.isArray(f.commits)).toBe(true);
    expect(f.commits.length).toBeGreaterThan(0);
    expect(f.commits[0].applied).toBe(true);
  });

  it('mode=edit: clicking a nucleotide opens popup but Save produces payload WITHOUT new mutations', () => {
    const onSave = vi.fn();
    const frag = makeFragment();
    render(<FragmentEditor fragment={frag} onSave={onSave} onClose={() => {}} />);

    // Default is edit mode — click nucleotide
    const ntSpans = Array.from(document.querySelectorAll('span.cursor-pointer'));
    fireEvent.click(ntSpans[0]);

    const buttonT = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'T');
    fireEvent.click(buttonT);

    // Save via edit
    fireEvent.click(screen.getByRole('button', { name: /💾 Сохранить/ }));
    expect(onSave).toHaveBeenCalledTimes(1);
    const payload = onSave.mock.calls[0][0];
    // Sequence DID change (seq[0] = 'T'), but mutations are NOT tracked in edit mode
    expect(payload.sequence[0]).toBe('T');
    // Bookkeeping save: mutations reference is unchanged from input (no new entry).
    // handleSaveFragment (useFragmentHandlers) uses identity check to bypass strategy engine.
    expect(payload.mutations === frag.mutations || (Array.isArray(payload.mutations) && payload.mutations.length === 0)).toBe(true);
    expect(Array.isArray(payload.editHistory)).toBe(true);
    // editHistory entry exists because seq changed
    expect(payload.editHistory.length).toBe(1);
    expect(payload.editHistory[0].oldSeq).toBe('ATGCCCGGGAAATTT');
    expect(payload.editHistory[0].newSeq).toBe('TTGCCCGGGAAATTT');
  });

  it('switching mode with accumulated mutations shows confirm and clears on accept', () => {
    const onSave = vi.fn();
    const frag = makeFragment();
    render(<FragmentEditor fragment={frag} onSave={onSave} onClose={() => {}} />);

    // Go to mutagenesis mode, add a mutation
    const radios = screen.getAllByRole('radio');
    fireEvent.click(radios.find(r => /Мутагенез/.test(r.textContent)));

    const ntSpans = Array.from(document.querySelectorAll('span.cursor-pointer'));
    fireEvent.click(ntSpans[0]);
    const buttonT = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'T');
    fireEvent.click(buttonT);

    // Now switch back to edit — should confirm + clear
    const radiosAfter = screen.getAllByRole('radio');
    fireEvent.click(radiosAfter.find(r => /Правка/.test(r.textContent)));
    expect(window.confirm).toHaveBeenCalled();

    // Save — no new mutations because they were cleared; seq also reverted on clear? No — seq stays.
    fireEvent.click(screen.getByRole('button', { name: /💾 Сохранить/ }));
    expect(onSave).toHaveBeenCalledTimes(1);
    const payload = onSave.mock.calls[0][0];
    // mutations ref unchanged (confirm-and-clear reset setMutations([]) — ref swap in state, but save passes fragment.mutations which never saw new entry)
    expect(payload.mutations === frag.mutations || (Array.isArray(payload.mutations) && payload.mutations.length === 0)).toBe(true);
  });
});

// ─── K5 Sprint 1.6 (updated for K10 Sprint 1.7 Unified Editor) ─────────────
// Protein tab removed → protein panel under collapsible. AA clicks in the
// panel are read-only in BOTH modes (primary AA-mutagenesis lives in the
// codon grid in the sequence view). Edit-mode "view-only" banner is replaced
// by a mode-specific hint under sequence view.
describe('FragmentEditor — K5/K10 protein panel read-only', () => {
  // CDS fragment: ATG GCT TGC TAA → M-A-C-* (12 nt, 4 codons incl. stop)
  const cdsFragment = () => ({
    id: 'cds1',
    name: 'TestCDS',
    type: 'CDS',
    sequence: 'ATGGCTTGCTAA',
    length: 12,
    strand: 1,
    annotations: [],
    mutations: [],
  });

  it('K10: mode=edit on CDS shows footer hint steering users to Мутагенез for AA clicks', () => {
    render(<FragmentEditor fragment={cdsFragment()} onSave={() => {}} onClose={() => {}} />);
    // Unified layout — no protein tab button exists anymore
    expect(screen.queryByRole('button', { name: /🧬 Белок\s*$/ })).toBeNull();
    // Instead, the sequence footer carries a mode-aware hint
    expect(screen.queryByText(/Для мутагенеза переключите режим выше/)).not.toBeNull();
  });

  it('K10: mode=mutagenesis on CDS replaces edit hint with AA-click guidance', () => {
    render(<FragmentEditor fragment={cdsFragment()} onSave={() => {}} onClose={() => {}} />);
    const radios = screen.getAllByRole('radio');
    fireEvent.click(radios.find(r => /Мутагенез/.test(r.textContent)));
    // Edit-mode hint is gone
    expect(screen.queryByText(/Для мутагенеза переключите режим выше/)).toBeNull();
    // Mutagenesis-specific hint visible
    expect(screen.queryByText(/Аминокислота → замена АК/)).not.toBeNull();
  });

  it('K10: Protein (обзор) panel exists for CDS and is collapsed by default', () => {
    render(<FragmentEditor fragment={cdsFragment()} onSave={() => {}} onClose={() => {}} />);
    const proteinPanelHeader = screen.getByRole('button', { name: /Белок \(обзор\)/ });
    expect(proteinPanelHeader).not.toBeNull();
    // Collapsed by default — sample AA spans should not be mounted yet
    const aaSpans = Array.from(document.querySelectorAll('span'))
      .filter(s => s.textContent?.length === 1 && /[MAC*]/.test(s.textContent) && s.getAttribute('title'));
    // Panel header only, protein content hidden
    expect(aaSpans.length).toBe(0);
  });

  it('K10: protein panel — AA spans render cursor:default in BOTH modes', () => {
    render(<FragmentEditor fragment={cdsFragment()} onSave={() => {}} onClose={() => {}} />);
    // Open protein panel (mode=edit)
    fireEvent.click(screen.getByRole('button', { name: /Белок \(обзор\)/ }));
    const editAAs = Array.from(document.querySelectorAll('span'))
      .filter(s => s.textContent?.length === 1 && /[MAC*]/.test(s.textContent) && s.getAttribute('title'));
    expect(editAAs.length).toBeGreaterThan(0);
    for (const sp of editAAs) expect(sp.style.cursor).toBe('default');

    // Switch to mutagenesis mode, protein panel still read-only
    const radios = screen.getAllByRole('radio');
    fireEvent.click(radios.find(r => /Мутагенез/.test(r.textContent)));
    const mutAAs = Array.from(document.querySelectorAll('span'))
      .filter(s => s.textContent?.length === 1 && /[MAC*]/.test(s.textContent) && s.getAttribute('title'));
    // Some AA spans belong to protein panel, some to sequence codon grid.
    // Protein panel AAs always have cursor:default; codon grid AAs have inline
    // onClick in mutagenesis. Filter by style presence — protein panel applies
    // cursor:default via inline style, codon grid uses class-based cursor.
    const panelAAs = mutAAs.filter(sp => sp.style.cursor === 'default');
    expect(panelAAs.length).toBeGreaterThan(0);
  });
});
