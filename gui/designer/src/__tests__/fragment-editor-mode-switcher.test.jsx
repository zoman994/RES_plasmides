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
import { render, fireEvent, screen } from '@testing-library/react';
import FragmentEditor from '../components/FragmentEditor';

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

  it('mode=mutagenesis: clicking a nucleotide opens DNA popup and tracks mutation', () => {
    const onSave = vi.fn();
    render(<FragmentEditor fragment={makeFragment()} onSave={onSave} onClose={() => {}} />);

    // Switch to mutagenesis mode
    const radios = screen.getAllByRole('radio');
    fireEvent.click(radios.find(r => /Мутагенез/.test(r.textContent)));

    // Click first nucleotide 'A' in the view (there are many — grab one with class matching cursor-pointer text)
    // All nucleotides are rendered as spans with text content A/T/G/C and class cursor-pointer.
    const ntSpans = Array.from(document.querySelectorAll('span.cursor-pointer'));
    expect(ntSpans.length).toBeGreaterThan(0);
    fireEvent.click(ntSpans[0]);

    // DNA popup opens — look for A/T/G/C buttons in popup ("Заменить" section)
    // Popup contains nt substitution buttons labeled 'A' 'T' 'G' 'C'
    const buttonT = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'T');
    expect(buttonT).toBeDefined();
    fireEvent.click(buttonT);

    // Save as mutagenesis
    fireEvent.click(screen.getByRole('button', { name: /Применить мутагенез/ }));

    expect(onSave).toHaveBeenCalledTimes(1);
    const payload = onSave.mock.calls[0][0];
    expect(Array.isArray(payload.mutations)).toBe(true);
    expect(payload.mutations.length).toBeGreaterThan(0);
    // editHistory is NOT written on mutagenesis save
    expect(payload.editHistory).toBeUndefined();
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
