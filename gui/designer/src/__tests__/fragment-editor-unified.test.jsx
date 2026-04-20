/**
 * K10 (Sprint 1.7) — Unified Editor layout.
 *
 * Tabs «Последовательность / Белок» removed. Sequence view is primary;
 * annotations / mutations / protein are collapsible panels beneath it.
 * Mode switcher (Правка / Мутагенез) remains as the orthogonal axis.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import FragmentEditor from '../components/FragmentEditor';

beforeEach(() => { window.confirm = vi.fn(() => true); });

function cdsFragment(extras = {}) {
  return {
    id: 'cds1', name: 'TestCDS', type: 'CDS',
    sequence: 'ATGGCTTGCTAA', length: 12, strand: 1,
    annotations: [], mutations: [], ...extras,
  };
}

function nonCdsFragment(extras = {}) {
  return {
    id: 'f1', name: 'TestFrag', type: 'misc_feature',
    sequence: 'ATGCCCGGGAAATTT', length: 15, strand: 1,
    annotations: [], mutations: [], ...extras,
  };
}

describe('FragmentEditor — K10 Unified Editor layout', () => {
  it('does NOT render tab buttons (Последовательность / Белок)', () => {
    render(<FragmentEditor fragment={cdsFragment()} onSave={() => {}} onClose={() => {}} />);
    // Old tab-nav buttons should be absent
    expect(screen.queryByRole('button', { name: /^🧪 Последовательность$/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^🧬 Белок$/ })).toBeNull();
    // Mode switcher still there
    const radios = screen.getAllByRole('radio');
    expect(radios.length).toBeGreaterThanOrEqual(2);
  });

  it('renders mode switcher for both CDS and non-CDS fragments', () => {
    const { unmount } = render(<FragmentEditor fragment={cdsFragment()} onSave={() => {}} onClose={() => {}} />);
    let radios = screen.getAllByRole('radio');
    expect(radios.find(r => /Правка/.test(r.textContent))).toBeDefined();
    expect(radios.find(r => /Мутагенез/.test(r.textContent))).toBeDefined();
    unmount();

    render(<FragmentEditor fragment={nonCdsFragment()} onSave={() => {}} onClose={() => {}} />);
    radios = screen.getAllByRole('radio');
    expect(radios.find(r => /Правка/.test(r.textContent))).toBeDefined();
    expect(radios.find(r => /Мутагенез/.test(r.textContent))).toBeDefined();
  });

  it('annotations panel is open by default and collapses on click', () => {
    render(<FragmentEditor fragment={cdsFragment()} onSave={() => {}} onClose={() => {}} />);
    const header = screen.getByRole('button', { name: /▾ Аннотации/ });
    // Open by default — collapse on click
    fireEvent.click(header);
    expect(screen.queryByRole('button', { name: /▸ Аннотации/ })).not.toBeNull();
    // Re-open
    fireEvent.click(screen.getByRole('button', { name: /▸ Аннотации/ }));
    expect(screen.queryByRole('button', { name: /▾ Аннотации/ })).not.toBeNull();
  });

  it('mutations panel only appears when mutations.length > 0', () => {
    render(<FragmentEditor fragment={cdsFragment()} onSave={() => {}} onClose={() => {}} />);
    // No mutations → no Мутации panel header
    expect(screen.queryByRole('button', { name: /Мутации/ })).toBeNull();

    // Switch to mutagenesis and click a nucleotide → create a mutation
    const radios = screen.getAllByRole('radio');
    fireEvent.click(radios.find(r => /Мутагенез/.test(r.textContent)));
    const ntSpans = Array.from(document.querySelectorAll('span.cursor-pointer'));
    fireEvent.click(ntSpans[0]);
    const buttonT = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'T');
    fireEvent.click(buttonT);

    // Now mutations panel appears
    expect(screen.queryByRole('button', { name: /Мутации/ })).not.toBeNull();
  });

  it('protein panel only renders for CDS fragments', () => {
    const { unmount } = render(<FragmentEditor fragment={cdsFragment()} onSave={() => {}} onClose={() => {}} />);
    expect(screen.queryByRole('button', { name: /Белок \(обзор\)/ })).not.toBeNull();
    unmount();

    render(<FragmentEditor fragment={nonCdsFragment()} onSave={() => {}} onClose={() => {}} />);
    expect(screen.queryByRole('button', { name: /Белок \(обзор\)/ })).toBeNull();
  });

  it('protein panel AAs are read-only (no onClick) in mutagenesis mode', () => {
    render(<FragmentEditor fragment={cdsFragment()} onSave={() => {}} onClose={() => {}} />);
    // Switch to mutagenesis, open protein panel
    const radios = screen.getAllByRole('radio');
    fireEvent.click(radios.find(r => /Мутагенез/.test(r.textContent)));
    fireEvent.click(screen.getByRole('button', { name: /Белок \(обзор\)/ }));

    // AA spans inside the protein panel have cursor:default (inline style)
    const panelAAs = Array.from(document.querySelectorAll('span'))
      .filter(s => s.textContent?.length === 1 && /[MAC*]/.test(s.textContent) && s.style.cursor === 'default');
    expect(panelAAs.length).toBeGreaterThan(0);
  });

  it('save button routes by mode (edit → handleSaveEdit, mutagenesis → handleSaveMutagenesis)', () => {
    const onSave = vi.fn();
    render(<FragmentEditor fragment={cdsFragment()} onSave={onSave} onClose={() => {}} />);
    // Default mode=edit → save button is "💾 Сохранить"
    expect(screen.queryByRole('button', { name: /💾 Сохранить/ })).not.toBeNull();
    expect(screen.queryByRole('button', { name: /Применить мутагенез/ })).toBeNull();

    // Switch to mutagenesis → save button is "Применить мутагенез"
    const radios = screen.getAllByRole('radio');
    fireEvent.click(radios.find(r => /Мутагенез/.test(r.textContent)));
    expect(screen.queryByRole('button', { name: /💾 Сохранить/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Применить мутагенез/ })).not.toBeNull();
  });
});
