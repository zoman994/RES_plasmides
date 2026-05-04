/**
 * pre-import-modal.test.jsx — Sprint M-X.3 K1 coverage.
 *
 * Modal that sits between an Importer entry-point (paste / drop /
 * catalog click) and the Inspector. Captures name + topology + tags
 * + folder + annotate-now toggle, and (in K2) an existing-annotations
 * keep/discard radio. K1 covers the paste path only — single envelope
 * with `kind: 'paste'`, `hasAnnotations: false`.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import PreImportModal from '../PreImportModal';

afterEach(cleanup);

const PASTE_ENVELOPE = {
  kind: 'paste',
  parsedItem: {
    name: 'pasted',
    sequence: 'ATGC'.repeat(80),
    length: 320,
    topology: 'linear',
    annotations: [],
    _fileName: 'paste-1.txt',
    _source: 'paste',
  },
  suggestedName: 'pasted',
  defaultTopology: 'linear',
  hasAnnotations: false,
  source: 'paste',
};

describe('PreImportModal — K1 paste path', () => {
  it('renders nothing when pendingImport is null', () => {
    const { container } = render(
      <PreImportModal pendingImport={null} onConfirm={() => {}} onCancel={() => {}} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders modal with name input pre-filled and topology defaulted', () => {
    render(
      <PreImportModal pendingImport={PASTE_ENVELOPE} onConfirm={() => {}} onCancel={() => {}} />
    );
    expect(screen.getByTestId('pre-import-modal')).toBeTruthy();
    const nameInput = screen.getByTestId('pre-import-name');
    expect(nameInput.value).toBe('pasted');
    // Topology buttons reflect default 'linear'
    const linearBtn = screen.getByTestId('pre-import-topology-linear');
    expect(linearBtn.getAttribute('data-active')).toBe('true');
  });

  it('Enter in name input submits with current form values', () => {
    const onConfirm = vi.fn();
    render(
      <PreImportModal pendingImport={PASTE_ENVELOPE} onConfirm={onConfirm} onCancel={() => {}} />
    );
    const nameInput = screen.getByTestId('pre-import-name');
    fireEvent.change(nameInput, { target: { value: 'pTest' } });
    fireEvent.keyDown(nameInput, { key: 'Enter' });
    expect(onConfirm).toHaveBeenCalledTimes(1);
    const meta = onConfirm.mock.calls[0][0];
    expect(meta.name).toBe('pTest');
    expect(meta.topology).toBe('linear');
    expect(meta.annotateNow).toBe(true);
  });

  it('topology toggle switches active button and is reflected in submit meta', () => {
    const onConfirm = vi.fn();
    render(
      <PreImportModal pendingImport={PASTE_ENVELOPE} onConfirm={onConfirm} onCancel={() => {}} />
    );
    fireEvent.click(screen.getByTestId('pre-import-topology-circular'));
    expect(screen.getByTestId('pre-import-topology-circular').getAttribute('data-active')).toBe('true');
    fireEvent.click(screen.getByTestId('pre-import-submit'));
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ topology: 'circular' }));
  });

  it('annotate-now checkbox flips the annotateNow flag in submit meta', () => {
    const onConfirm = vi.fn();
    render(
      <PreImportModal pendingImport={PASTE_ENVELOPE} onConfirm={onConfirm} onCancel={() => {}} />
    );
    const cb = screen.getByTestId('pre-import-annotate-now');
    expect(cb.checked).toBe(true); // default ON
    fireEvent.click(cb);
    expect(cb.checked).toBe(false);
    fireEvent.click(screen.getByTestId('pre-import-submit'));
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ annotateNow: false }));
  });

  it('Cancel button calls onCancel; submit not fired', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <PreImportModal pendingImport={PASTE_ENVELOPE} onConfirm={onConfirm} onCancel={onCancel} />
    );
    fireEvent.click(screen.getByTestId('pre-import-cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('Escape key calls onCancel', () => {
    const onCancel = vi.fn();
    render(
      <PreImportModal pendingImport={PASTE_ENVELOPE} onConfirm={() => {}} onCancel={onCancel} />
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('does NOT show existing-annotations radio when hasAnnotations=false (K1 paste)', () => {
    render(
      <PreImportModal pendingImport={PASTE_ENVELOPE} onConfirm={() => {}} onCancel={() => {}} />
    );
    expect(screen.queryByTestId('pre-import-existing-anns')).toBeNull();
  });

  it('submit sends keepExistingAnnotations=true by default (no-op when hasAnnotations=false)', () => {
    const onConfirm = vi.fn();
    render(
      <PreImportModal pendingImport={PASTE_ENVELOPE} onConfirm={onConfirm} onCancel={() => {}} />
    );
    fireEvent.click(screen.getByTestId('pre-import-submit'));
    const meta = onConfirm.mock.calls[0][0];
    // K1 default: keep existing (only relevant when hasAnnotations=true,
    // but we still emit the flag so K2's commit path stays consistent).
    expect(meta.keepExistingAnnotations).toBe(true);
  });
});

// ─── Sprint M-X.3 K2 — file/catalog flows + existing-anns radio ──────
const FILE_ENVELOPE_WITH_ANNS = {
  kind: 'file',
  parsedItem: {
    name: 'pUC19',
    sequence: 'ATGC'.repeat(700),
    length: 2800,
    topology: 'circular',
    annotations: [
      { id: 'a1', name: 'AmpR', type: 'CDS', start: 10, end: 100, level: 'region' },
      { id: 'a2', name: 'lacZ', type: 'CDS', start: 200, end: 800, level: 'region' },
      { id: 'a3', name: 'ori', type: 'rep_origin', start: 900, end: 1500, level: 'region' },
    ],
    _fileName: 'pUC19.gb',
    _source: 'file',
  },
  suggestedName: 'pUC19',
  defaultTopology: 'circular',
  hasAnnotations: true,
  source: 'file',
};

describe('PreImportModal — K2 existing-annotations radio', () => {
  it('shows the radio when hasAnnotations=true; default keep', () => {
    render(
      <PreImportModal pendingImport={FILE_ENVELOPE_WITH_ANNS} onConfirm={() => {}} onCancel={() => {}} />
    );
    expect(screen.getByTestId('pre-import-existing-anns')).toBeTruthy();
    const keep = screen.getByTestId('pre-import-existing-anns-keep');
    expect(keep.checked).toBe(true);
    const discard = screen.getByTestId('pre-import-existing-anns-discard');
    expect(discard.checked).toBe(false);
  });

  it('keep variant submits keepExistingAnnotations=true', () => {
    const onConfirm = vi.fn();
    render(
      <PreImportModal pendingImport={FILE_ENVELOPE_WITH_ANNS} onConfirm={onConfirm} onCancel={() => {}} />
    );
    fireEvent.click(screen.getByTestId('pre-import-submit'));
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ keepExistingAnnotations: true }));
  });

  it('discard variant submits keepExistingAnnotations=false', () => {
    const onConfirm = vi.fn();
    render(
      <PreImportModal pendingImport={FILE_ENVELOPE_WITH_ANNS} onConfirm={onConfirm} onCancel={() => {}} />
    );
    fireEvent.click(screen.getByTestId('pre-import-existing-anns-discard'));
    expect(screen.getByTestId('pre-import-existing-anns-discard').checked).toBe(true);
    expect(screen.getByTestId('pre-import-existing-anns-keep').checked).toBe(false);
    fireEvent.click(screen.getByTestId('pre-import-submit'));
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ keepExistingAnnotations: false }));
  });

  it('shows the actual annotation count in the keep label', () => {
    render(
      <PreImportModal pendingImport={FILE_ENVELOPE_WITH_ANNS} onConfirm={() => {}} onCancel={() => {}} />
    );
    // Label is something like «Keep 3 existing» — we just need to
    // confirm 3 appears next to the keep radio.
    const keepRadio = screen.getByTestId('pre-import-existing-anns-keep');
    const label = keepRadio.parentElement;
    expect(label.textContent).toMatch(/3/);
  });

  it('source badge reflects file extension for file kind', () => {
    render(
      <PreImportModal pendingImport={FILE_ENVELOPE_WITH_ANNS} onConfirm={() => {}} onCancel={() => {}} />
    );
    // File envelope has _fileName 'pUC19.gb' → badge shows .GB FILE.
    expect(screen.getByTestId('pre-import-source-badge').textContent).toMatch(/file|gb/i);
  });

  it('FASTA file shows the .FASTA badge', () => {
    const fastaEnv = {
      ...FILE_ENVELOPE_WITH_ANNS,
      parsedItem: { ...FILE_ENVELOPE_WITH_ANNS.parsedItem, _fileName: 'p.fasta', annotations: [] },
      hasAnnotations: false,
    };
    render(
      <PreImportModal pendingImport={fastaEnv} onConfirm={() => {}} onCancel={() => {}} />
    );
    expect(screen.getByTestId('pre-import-source-badge').textContent).toMatch(/fasta/i);
    // No existing-annotations radio for FASTA (no anns to keep / discard).
    expect(screen.queryByTestId('pre-import-existing-anns')).toBeNull();
  });

  it('SnapGene .DNA file shows the .DNA badge', () => {
    const dnaEnv = {
      ...FILE_ENVELOPE_WITH_ANNS,
      parsedItem: { ...FILE_ENVELOPE_WITH_ANNS.parsedItem, _fileName: 'pUC19.dna' },
    };
    render(
      <PreImportModal pendingImport={dnaEnv} onConfirm={() => {}} onCancel={() => {}} />
    );
    expect(screen.getByTestId('pre-import-source-badge').textContent).toMatch(/dna/i);
  });

  it('initial topology reflects defaultTopology (circular for plasmid imports)', () => {
    render(
      <PreImportModal pendingImport={FILE_ENVELOPE_WITH_ANNS} onConfirm={() => {}} onCancel={() => {}} />
    );
    expect(screen.getByTestId('pre-import-topology-circular').getAttribute('data-active')).toBe('true');
    expect(screen.getByTestId('pre-import-topology-linear').getAttribute('data-active')).toBe('false');
  });

  it('suggestedTags pre-fill the chip list from envelope', () => {
    render(
      <PreImportModal
        pendingImport={{ ...FILE_ENVELOPE_WITH_ANNS, suggestedTags: ['vector', 'bacterial'] }}
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    );
    // TagsEditor renders chips with the literal tag text.
    expect(screen.getByTestId('pre-import-modal').textContent).toMatch(/vector/);
    expect(screen.getByTestId('pre-import-modal').textContent).toMatch(/bacterial/);
  });
});

// ─── Sprint M-X.3 K2a — multi-file mode ──────────────────────────────
const MULTI_ENVELOPE = {
  kind: 'multi',
  parsedItems: [
    {
      name: 'pUC19', sequence: 'A'.repeat(2700), length: 2700,
      topology: 'circular', annotations: [], _fileName: 'pUC19.gb', _source: 'file',
    },
    {
      name: 'pET28a', sequence: 'A'.repeat(5400), length: 5400,
      topology: 'circular', annotations: [], _fileName: 'pET28a.gb', _source: 'file',
    },
    {
      name: 'gfp', sequence: 'A'.repeat(720), length: 720,
      topology: 'linear', annotations: [], _fileName: 'gfp.fasta', _source: 'file',
    },
  ],
  suggestedName: '',
  defaultTopology: 'linear',
  hasAnnotations: false,
  source: 'file',
};

describe('PreImportModal — K2a multi-file mode', () => {
  it('shows a per-file name list instead of single name input', () => {
    render(
      <PreImportModal pendingImport={MULTI_ENVELOPE} onConfirm={() => {}} onCancel={() => {}} />
    );
    // Single name input is hidden in multi mode.
    expect(screen.queryByTestId('pre-import-name')).toBeNull();
    // Per-file rows render.
    expect(screen.getByTestId('pre-import-multi-list')).toBeTruthy();
    const rows = screen.getAllByTestId('pre-import-multi-row');
    expect(rows).toHaveLength(3);
    expect(rows[0].textContent).toMatch(/pUC19/);
    expect(rows[1].textContent).toMatch(/pET28a/);
    expect(rows[2].textContent).toMatch(/gfp/);
  });

  it('editing a per-file name flows through commit as perFileNames', () => {
    const onConfirm = vi.fn();
    render(
      <PreImportModal pendingImport={MULTI_ENVELOPE} onConfirm={onConfirm} onCancel={() => {}} />
    );
    const inputs = screen.getAllByTestId('pre-import-multi-name-input');
    fireEvent.change(inputs[0], { target: { value: 'pAlpha' } });
    fireEvent.click(screen.getByTestId('pre-import-submit'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    const meta = onConfirm.mock.calls[0][0];
    expect(meta.perFileNames).toEqual({
      'pUC19.gb': 'pAlpha',
      'pET28a.gb': 'pET28a',
      'gfp.fasta': 'gfp',
    });
  });

  it('shared topology / tags / annotateNow apply once for the whole batch', () => {
    const onConfirm = vi.fn();
    render(
      <PreImportModal pendingImport={MULTI_ENVELOPE} onConfirm={onConfirm} onCancel={() => {}} />
    );
    fireEvent.click(screen.getByTestId('pre-import-topology-circular'));
    fireEvent.click(screen.getByTestId('pre-import-annotate-now'));
    fireEvent.click(screen.getByTestId('pre-import-submit'));
    const meta = onConfirm.mock.calls[0][0];
    expect(meta.topology).toBe('circular');
    expect(meta.annotateNow).toBe(false);
  });

  it('header subtitle shows the count of files in batch', () => {
    render(
      <PreImportModal pendingImport={MULTI_ENVELOPE} onConfirm={() => {}} onCancel={() => {}} />
    );
    // Should mention "3" (file count) somewhere visible — typically
    // in the subtitle slot next to the title.
    expect(screen.getByTestId('pre-import-modal').textContent).toMatch(/3/);
  });
});
