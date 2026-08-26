/**
 * library-workspace-paste-autoannotate.test.jsx — Звено 25.05.2026.
 *
 * Bug: AddModal's «Авто-аннотация» checkbox was decorative on the LIVE import
 * host (LibraryWorkspace). `onLaunchPreImport` dropped `preset.autoAnnotate`
 * (and name/topology), and `importFiles(files, projectId)` never ran
 * `enrichAnnotations`. So a pasted sequence landed with zero features.
 *
 * Fix: importFiles(files, projectId, opts) runs enrichAnnotations when
 * autoAnnotate !== false, and applies name/topology overrides;
 * onLaunchPreImport forwards the preset to both file & paste branches.
 *
 * Pattern mirrors library-tree-host-import-v104 (the sibling host), adapted:
 * LibraryWorkspace calls buildLibraryEntry POSITIONALLY (parsed, name, null),
 * and also imports extractItemName. The heavy children are stubbed; AddModal
 * is real (it produces the preset); file-import + build-library-entry are
 * mocked so we assert the resulting entry handed to the store.
 *
 * ANN-0I migration: LibraryWorkspace no longer calls `addLibraryEntry` once per
 * file. It delegates to the canonical ingress, which hands
 * `addLibraryEntriesBulk` an ARRAY of shaped entries and reports success only
 * from the rows the store returns. The auto-annotation, toast-action and
 * selection assertions below are unchanged — only the store call they observe
 * moved from the singular action to the awaited bulk receipt.
 */
import 'fake-indexeddb/auto';
import React from 'react';
import {
  describe, it, expect, beforeEach, afterEach, vi,
} from 'vitest';
import {
  render, screen, fireEvent, cleanup, waitFor, act,
} from '@testing-library/react';
import { useStore } from '../../../store';

// Heavy children stubbed — LibraryTreeRoot exposes the +Add entry point.
vi.mock('../LibraryTopBar', () => ({ default: () => null }));
vi.mock('../tree/LibraryTreeRoot', () => ({
  default: ({ onAddClick }) => (
    <button type="button" data-testid="stub-add-click" onClick={onAddClick}>add</button>
  ),
}));
// Stub exposes activeTab so the Звено-2 «Продолжить аннотацию» toast action
// (onUndo → select entry + open Annotations tab) is observable.
vi.mock('../inspector/LibrarySingleInspector', () => ({
  default: ({ activeTab }) => <div data-testid="ls-inspector" data-active-tab={activeTab || ''} />,
}));
vi.mock('../inspector/LibraryActionRow', () => ({ default: () => null }));
vi.mock('../onboarding/OnboardingNudge', () => ({ default: () => null }));
vi.mock('../../SequenceSearchPopover', () => ({ default: () => null }));

// file-import: parseFile yields a headerless ACGT item with NO annotations;
// enrichAnnotations adds one (homology hit) only when autoAnnotate !== false.
vi.mock('../../../file-import', () => ({
  ACCEPT_STRING: '.fasta',
  parseFile: vi.fn(async () => ({
    name: 'F', sequence: 'ACGTACGTACGT', length: 12, topology: 'linear', annotations: [],
  })),
  extractItemName: vi.fn(() => 'F'),
  enrichAnnotations: vi.fn(async (item, opts) => (
    opts && opts.autoAnnotate === false
      ? item
      : { ...item, annotations: [{ name: 'kanR', type: 'CDS', start: 0, end: 100, strand: 1 }] }
  )),
}));
// buildLibraryEntry is called POSITIONALLY in LibraryWorkspace: (parsed, name, null).
vi.mock('../lib/build-library-entry', () => ({
  buildLibraryEntry: vi.fn((parsed, name) => ({
    id: 'e1',
    name: name || parsed.name,
    payload: { annotations: parsed.annotations || [], topology: parsed.topology, length: parsed.length },
  })),
}));

import LibraryWorkspace from '../LibraryWorkspace';
import { parseFile, enrichAnnotations } from '../../../file-import';
import { buildLibraryEntry } from '../lib/build-library-entry';

let added;
beforeEach(() => {
  added = [];
  useStore.setState((s) => {
    // The real slice takes an ARRAY and returns the committed rows; the ingress
    // reads success from that receipt, so the stub must behave the same way.
    s.addLibraryEntriesBulk = vi.fn(async (entries) => {
      const rows = (Array.isArray(entries) ? entries : []).filter((e) => e && e.id);
      added.push(...rows);
      // Mirror the real slice: committed rows become visible in the store.
      useStore.setState((st) => {
        for (const r of rows) st.libraryEntries[r.id] = r;
      });
      return rows;
    });
    s.addPrimerToPool = vi.fn(async (x) => x);
    s.showToast = vi.fn();
    s.currentProjectId = null;
    s.pinnedProjectIds = [];
    s.projects = {};
    s.libraryEntries = {};
  });
  parseFile.mockClear();
  enrichAnnotations.mockClear();
  buildLibraryEntry.mockClear();
});
afterEach(cleanup);

function openPasteAndType(text) {
  fireEvent.click(screen.getByTestId('stub-add-click'));
  fireEvent.click(screen.getByTestId('add-modal-source-paste'));
  fireEvent.change(screen.getByTestId('add-modal-paste-textarea'), { target: { value: text } });
}

describe('LibraryWorkspace paste import — «Авто-аннотация» actually enriches', () => {
  it('autoAnnotate ON (default) → enrichAnnotations runs, entry carries features', async () => {
    render(<LibraryWorkspace />);
    openPasteAndType('ACGTACGTACGT');
    fireEvent.click(screen.getByTestId('add-modal-submit'));

    await waitFor(() => expect(useStore.getState().addLibraryEntriesBulk).toHaveBeenCalledTimes(1));
    expect(enrichAnnotations).toHaveBeenCalledTimes(1);
    expect(enrichAnnotations.mock.calls[0][1]).toEqual({ autoAnnotate: true });
    // the created entry has the enriched feature, not the bare empty list
    expect(added[0].payload.annotations.length).toBeGreaterThan(0);
  });

  it('autoAnnotate OFF → enrichAnnotations is skipped, entry has no features', async () => {
    render(<LibraryWorkspace />);
    openPasteAndType('ACGTACGTACGT');
    fireEvent.click(screen.getByTestId('add-modal-auto-annotate')); // toggle off
    fireEvent.click(screen.getByTestId('add-modal-submit'));

    await waitFor(() => expect(useStore.getState().addLibraryEntriesBulk).toHaveBeenCalledTimes(1));
    expect(enrichAnnotations).not.toHaveBeenCalled();
    expect(added[0].payload.annotations.length).toBe(0);
  });

  it('paste name + circular topology overrides land on the entry', async () => {
    render(<LibraryWorkspace />);
    openPasteAndType('ACGTACGTACGT');
    fireEvent.change(screen.getByTestId('add-modal-paste-name'), { target: { value: 'pKanR' } });
    fireEvent.click(screen.getByTestId('add-modal-topology-circular'));
    fireEvent.click(screen.getByTestId('add-modal-submit'));

    await waitFor(() => expect(useStore.getState().addLibraryEntriesBulk).toHaveBeenCalledTimes(1));
    expect(added[0].name).toBe('pKanR');
    expect(added[0].payload.topology).toBe('circular');
  });

  it('regression: default paste (no name) keeps parseFile name + still creates the entry', async () => {
    render(<LibraryWorkspace />);
    openPasteAndType('ACGTACGTACGT');
    fireEvent.click(screen.getByTestId('add-modal-submit'));

    await waitFor(() => expect(useStore.getState().addLibraryEntriesBulk).toHaveBeenCalledTimes(1));
    expect(added[0].name).toBe('F');
    expect(buildLibraryEntry).toHaveBeenCalledTimes(1);
  });
});

// Звено 1/2 (25.05.2026): тост сообщает, сколько нашла авто-аннотация —
// раздельно гены по гомологии (source==='common_db') и RE-сайты
// (detector==='re_scan'). Звено 2 (ссылка «Продолжить аннотацию») — отдельно.
describe('LibraryWorkspace paste import — авто-аннотация: счётчик найденного в тосте', () => {
  function pasteImportWithAnnotations(annotations) {
    enrichAnnotations.mockResolvedValueOnce({
      name: 'F', sequence: 'ACGTACGTACGT', length: 12, topology: 'linear', annotations,
    });
    render(<LibraryWorkspace />);
    openPasteAndType('ACGTACGTACGT');
    fireEvent.click(screen.getByTestId('add-modal-submit'));
  }

  it('autoAnnotate ON, 2 гена (common_db) + 5 RE-сайтов (re_scan) → тост со счётчиком «2 … 5», autoDismissMs 9000', async () => {
    pasteImportWithAnnotations([
      { source: 'common_db' }, { source: 'common_db' },
      { detector: 're_scan' }, { detector: 're_scan' }, { detector: 're_scan' },
      { detector: 're_scan' }, { detector: 're_scan' },
    ]);
    await waitFor(() => expect(useStore.getState().addLibraryEntriesBulk).toHaveBeenCalledTimes(1));
    const { showToast } = useStore.getState();
    expect(showToast).toHaveBeenCalledWith(
      expect.stringMatching(/Авто-аннотация:\s*2\s+ген\S*.*5\s+сайт\S* рестрикции/),
      'success',
      expect.objectContaining({ autoDismissMs: 9000 }),
    );
  });

  it('autoAnnotate ON, 0 генов → info-тост «Гомологичных элементов не найдено» (9000) + базовый тост', async () => {
    pasteImportWithAnnotations([{ detector: 're_scan' }, { detector: 're_scan' }]);
    await waitFor(() => expect(useStore.getState().addLibraryEntriesBulk).toHaveBeenCalledTimes(1));
    const { showToast } = useStore.getState();
    expect(showToast).toHaveBeenCalledWith(
      'Гомологичных элементов не найдено', 'info',
      expect.objectContaining({ autoDismissMs: 9000 }),
    );
    expect(showToast).toHaveBeenCalledWith(expect.stringMatching(/^Добавлено: 1 файл/), 'success');
  });

  it('autoAnnotate OFF → тост только «Добавлено: N файл(ов)», без счётчика фич', async () => {
    render(<LibraryWorkspace />);
    openPasteAndType('ACGTACGTACGT');
    fireEvent.click(screen.getByTestId('add-modal-auto-annotate')); // toggle off
    fireEvent.click(screen.getByTestId('add-modal-submit'));
    await waitFor(() => expect(useStore.getState().addLibraryEntriesBulk).toHaveBeenCalledTimes(1));
    const { showToast } = useStore.getState();
    expect(enrichAnnotations).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith(expect.stringMatching(/^Добавлено: 1 файл/), 'success');
    const msgs = showToast.mock.calls.map((c) => String(c[0]));
    expect(msgs.some((m) => /Авто-аннотация|Гомологичных/.test(m))).toBe(false);
  });

  it('плюрализация генов в тосте: 1 → «ген», 2 → «гена», 5 → «генов»', async () => {
    const cases = [
      { n: 1, form: /1 ген(?![аеиов])/ },
      { n: 2, form: /2 гена/ },
      { n: 5, form: /5 генов/ },
    ];
    for (const { n, form } of cases) {
      cleanup();
      useStore.setState((s) => {
        s.showToast = vi.fn();
        s.addLibraryEntriesBulk = vi.fn(async (entries) => {
          const rows = (Array.isArray(entries) ? entries : []).filter((e) => e && e.id);
          added.push(...rows);
          useStore.setState((st) => {
            for (const r of rows) st.libraryEntries[r.id] = r;
          });
          return rows;
        });
      });
      enrichAnnotations.mockClear();
      pasteImportWithAnnotations(Array.from({ length: n }, () => ({ source: 'common_db' })));
      // eslint-disable-next-line no-await-in-loop
      await waitFor(() => expect(useStore.getState().addLibraryEntriesBulk).toHaveBeenCalledTimes(1));
      const { showToast } = useStore.getState();
      const hit = showToast.mock.calls.some((c) => form.test(String(c[0])));
      expect(hit, `genes=${n}`).toBe(true);
    }
  });
});

// Звено 2 (25.05.2026): the gene-count success toast carries a clickable
// «Продолжить аннотацию» action (actionLabel + onUndo). onUndo selects the
// last imported entry and opens its Annotations tab in the inspector.
describe('LibraryWorkspace paste import — тост со ссылкой «Продолжить аннотацию»', () => {
  it('autoAnnotate ON + ≥1 ген → success-тост несёт actionLabel + onUndo; onUndo выбирает запись и вкладку «Аннотации»', async () => {
    // addLibraryEntry must land the entry in the store so onUndo's
    // setSelectedId resolves a real item → the inspector renders.
    useStore.setState((s) => {
      s.addLibraryEntry = vi.fn(async (entry) => {
        added.push(entry);
        useStore.setState((st) => { st.libraryEntries[entry.id] = entry; });
      });
    });
    enrichAnnotations.mockResolvedValueOnce({
      name: 'F', sequence: 'ACGTACGTACGT', length: 12, topology: 'linear',
      annotations: [{ source: 'common_db' }],
    });
    render(<LibraryWorkspace />);
    openPasteAndType('ACGTACGTACGT');
    fireEvent.click(screen.getByTestId('add-modal-submit'));
    await waitFor(() => expect(useStore.getState().addLibraryEntriesBulk).toHaveBeenCalledTimes(1));

    const { showToast } = useStore.getState();
    const successCall = showToast.mock.calls.find((c) => c[1] === 'success' && c[2] && c[2].actionLabel);
    expect(successCall).toBeTruthy();
    expect(successCall[2].actionLabel).toBe('Продолжить аннотацию');
    expect(typeof successCall[2].onUndo).toBe('function');

    act(() => { successCall[2].onUndo(); });
    await waitFor(() => {
      expect(screen.getByTestId('ls-inspector').getAttribute('data-active-tab')).toBe('annotations');
    });
  });

  it('autoAnnotate ON, 0 генов → тост без actionLabel (ссылки нет)', async () => {
    enrichAnnotations.mockResolvedValueOnce({
      name: 'F', sequence: 'ACGTACGTACGT', length: 12, topology: 'linear',
      annotations: [{ detector: 're_scan' }],
    });
    render(<LibraryWorkspace />);
    openPasteAndType('ACGTACGTACGT');
    fireEvent.click(screen.getByTestId('add-modal-submit'));
    await waitFor(() => expect(useStore.getState().addLibraryEntriesBulk).toHaveBeenCalledTimes(1));
    const { showToast } = useStore.getState();
    const withLabel = showToast.mock.calls.find((c) => c[2] && c[2].actionLabel);
    expect(withLabel).toBeUndefined();
  });
});
