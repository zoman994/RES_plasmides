import 'fake-indexeddb/auto';
import React from 'react';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { getLibraryEntry, resetDBForTests } from '../../../../db/dexie-schema';
import { setLang } from '../../../../i18n';
import { useStore } from '../../../../store';
import AddModal from '../AddModal';
import {
  SNAPGENE_EXPECTED_CATEGORIES,
  SNAPGENE_EXPECTED_TOTAL,
  loadSelectedSnapGeneEntries,
  loadSnapGeneIndex,
} from '../snapgene-catalog';

const SECONDARY_CATEGORY_TOTAL = SNAPGENE_EXPECTED_TOTAL - 2;
const SECONDARY_CATEGORY_COUNT = SNAPGENE_EXPECTED_CATEGORIES - 1;
const SECONDARY_BASE_SIZE = Math.floor(SECONDARY_CATEGORY_TOTAL / SECONDARY_CATEGORY_COUNT);
const SECONDARY_REMAINDER = SECONDARY_CATEGORY_TOTAL % SECONDARY_CATEGORY_COUNT;

const CATEGORIES = Array.from({ length: SNAPGENE_EXPECTED_CATEGORIES }, (_, index) => ({
  slug: `category-${index}`,
  name: `Category ${index}`,
  count: index === 0
    ? 2
    : SECONDARY_BASE_SIZE + (index <= SECONDARY_REMAINDER ? 1 : 0),
  organism: index === 0 ? 'E. coli' : 'Multi',
}));

const INDEX = {
  version: '1.0',
  total: SNAPGENE_EXPECTED_TOTAL,
  categories: CATEGORIES,
  plasmids: [
    {
      id: 'sg_wrap',
      name: 'Wrap vector',
      length: 80,
      topology: 'circular',
      organism: 'E. coli',
      category: 'category-0',
      features: ['wrap promoter'],
      description: 'Circular contract fixture',
    },
    {
      id: 'sg_other',
      name: 'Other vector',
      length: 12,
      topology: 'linear',
      organism: 'E. coli',
      category: 'category-0',
      features: [],
      description: 'Must stay unselected',
    },
    ...CATEGORIES.slice(1).flatMap((category, index) => (
      Array.from({ length: category.count }, (_, plasmidIndex) => ({
        id: plasmidIndex === 0
          ? `sg_category_${index + 1}`
          : `sg_category_${index + 1}_${plasmidIndex}`,
        name: plasmidIndex === 0
          ? `Category fixture ${index + 1}`
          : `Category fixture ${index + 1}.${plasmidIndex}`,
        length: 12,
        topology: 'linear',
        organism: 'Multi',
        category: category.slug,
        features: [],
        description: 'Index-only metadata fixture',
      }))
    )),
  ],
};

const CATEGORY_PAYLOAD = {
  plasmids: [
    {
      id: 'sg_wrap',
      name: 'Wrap vector',
      sequence: 'ACGT'.repeat(20),
      length: 80,
      topology: 'circular',
      organism: 'E. coli',
      annotations: [
        {
          name: 'wrap promoter',
          type: 'promoter',
          start: 70,
          end: 5,
          strand: 1,
          level: 'region',
          qualifiers: { note: ['nested qualifier'] },
          segments: [{ start: 70, end: 80 }, { start: 0, end: 5 }],
        },
        {
          name: 'detail feature',
          type: 'misc_feature',
          start: 8,
          end: 12,
          strand: -1,
          level: 'detail',
        },
      ],
      description: 'Circular contract fixture',
    },
    {
      id: 'sg_other',
      name: 'Other vector',
      sequence: 'ACGTACGTACGT',
      length: 12,
      topology: 'linear',
      organism: 'E. coli',
      annotations: [],
    },
  ],
};

function response(json, { ok = true, status = 200 } = {}) {
  return { ok, status, json: vi.fn(async () => json) };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

const REAL_BULK_ADD = useStore.getState().addLibraryEntriesBulk;
const REAL_SHOW_TOAST = useStore.getState().showToast;

function renderCatalog({ onClose = vi.fn() } = {}) {
  render(<AddModal open onClose={onClose} onLaunchPreImport={vi.fn()} />);
  fireEvent.click(screen.getByTestId('add-modal-source-catalog'));
  fireEvent.click(screen.getByTestId('add-modal-submit'));
  return { onClose };
}

beforeEach(async () => {
  setLang('ru');
  const db = resetDBForTests(`bodgegene-snapgene-${Math.random().toString(36).slice(2)}`);
  await db.delete();
  await db.open();
  useStore.setState((state) => {
    state.libraryEntries = {};
    state.projects = {
      projectA: {
        id: 'projectA',
        name: 'Project A',
        containerIds: [],
        createdAt: 1,
      },
    };
    state.pinnedProjectIds = ['projectA'];
    state.currentProjectId = 'projectA';
    state.toasts = [];
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  useStore.setState({
    addLibraryEntriesBulk: REAL_BULK_ADD,
    showToast: REAL_SHOW_TOAST,
  });
});

describe('LIB-SRC-1 — live SnapGene catalog source', () => {
  it('loads on demand, filters all categories and commits one selected plasmid durably', async () => {
    const fetchMock = vi.fn(async (url) => {
      if (url === '/plasmids-index.json') return response(INDEX);
      if (url === '/plasmids-data/category-0.json') return response(CATEGORY_PAYLOAD);
      return response({}, { ok: false, status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const onClose = vi.fn();
    render(<AddModal open onClose={onClose} onLaunchPreImport={vi.fn()} />);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByTestId('add-modal-source-catalog').textContent).not.toMatch(/в разработке/i);
    expect(screen.getByTestId('add-modal-source-catalog').textContent)
      .toContain(String(SNAPGENE_EXPECTED_TOTAL));

    fireEvent.click(screen.getByTestId('add-modal-source-catalog'));
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('add-modal-submit'));

    expect(await screen.findByTestId('snapgene-catalog-picker')).toBeTruthy();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/plasmids-index.json', expect.objectContaining({ signal: expect.any(Object) }),
    ));
    const category = await screen.findByTestId('snapgene-catalog-category');
    expect(category.querySelectorAll('option')).toHaveLength(20);
    fireEvent.change(category, { target: { value: 'category-0' } });
    fireEvent.change(screen.getByTestId('snapgene-catalog-search'), {
      target: { value: 'Wrap' },
    });

    fireEvent.click(await screen.findByTestId('snapgene-catalog-select-sg_wrap'));
    fireEvent.click(screen.getByTestId('snapgene-catalog-import'));

    await waitFor(() => {
      expect(Object.keys(useStore.getState().libraryEntries)).toHaveLength(1);
    });
    const [entry] = Object.values(useStore.getState().libraryEntries);
    expect(entry.id).not.toBe('sg_wrap');
    expect(typeof entry.id).toBe('string');
    expect(entry.kind).toBe('container');
    expect(entry.projectId).toBe('projectA');
    expect(entry.zone).toBe('active_bodge');
    expect(entry.origin).toMatchObject({
      kind: 'catalog',
      sourceCatalog: 'snapgene-public',
      sourcePlasmidId: 'sg_wrap',
      categorySlug: 'category-0',
    });
    expect(entry.payload.resourceHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(entry.payload.annotations).toHaveLength(2);
    expect(entry.payload.annotations.every((annotation) => (
      typeof annotation.id === 'string' && annotation.id.length > 0
    ))).toBe(true);
    expect(entry.payload.annotations[0]).toMatchObject({
      level: 'region', start: 70, end: 5,
    });
    expect(entry.payload.annotations[1]).toMatchObject({ level: 'detail' });
    expect(await getLibraryEntry(entry.id)).toEqual(entry);
    expect(fetchMock).toHaveBeenCalledWith(
      '/plasmids-data/category-0.json', expect.objectContaining({ signal: expect.any(Object) }),
    );
    expect(fetchMock.mock.calls.some(([url]) => /category-[1-9]/.test(String(url)))).toBe(false);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(useStore.getState().toasts.at(-1)).toMatchObject({ kind: 'success' });
  });

  it('keeps a failed index distinct from an empty catalog and supports retry', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({}, { ok: false, status: 503 }))
      .mockResolvedValueOnce(response(INDEX));
    vi.stubGlobal('fetch', fetchMock);

    renderCatalog();
    expect(await screen.findByTestId('snapgene-catalog-error')).toBeTruthy();
    expect(screen.getByTestId('snapgene-catalog-error-title').textContent)
      .toBe('Не удалось открыть каталог');
    expect(screen.getByTestId('snapgene-catalog-error').textContent)
      .not.toMatch(/SnapGene catalog|returned|503/i);
    expect(screen.getByTestId('snapgene-catalog-picker').contains(document.activeElement)).toBe(true);
    expect(screen.queryByTestId('snapgene-catalog-empty')).toBeNull();
    fireEvent.click(screen.getByTestId('snapgene-catalog-retry'));
    expect(await screen.findByTestId('snapgene-catalog-category')).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('fails closed when the selected category payload is missing the requested record', async () => {
    const fetchMock = vi.fn(async (url) => {
      if (url === '/plasmids-index.json') return response(INDEX);
      return response({ plasmids: [] });
    });
    vi.stubGlobal('fetch', fetchMock);

    renderCatalog();
    fireEvent.click(await screen.findByTestId('snapgene-catalog-select-sg_wrap'));
    fireEvent.click(screen.getByTestId('snapgene-catalog-import'));
    expect(await screen.findByTestId('snapgene-catalog-error')).toBeTruthy();
    expect(screen.getByTestId('snapgene-catalog-error-title').textContent)
      .toBe('Не удалось загрузить выбранные плазмиды');
    expect(screen.getByTestId('snapgene-catalog-error').textContent)
      .not.toMatch(/selected plasmid|missing/i);
    expect(useStore.getState().libraryEntries).toEqual({});
  });
});

describe('LIB-SRC-1 correction — fail-closed data and modal ownership', () => {
  it.each([
    ['total mismatch', { ...INDEX, total: INDEX.total + 1 }],
    ['category count mismatch', {
      ...INDEX,
      categories: INDEX.categories.map((item, index) => (
        index === 0 ? { ...item, count: item.count + 1 } : item
      )),
    }],
    ['empty but HTTP-200 index', { version: '1.0', total: 0, categories: [], plasmids: [] }],
  ])('rejects an inconsistent HTTP-200 index: %s', async (_label, payload) => {
    const fetchImpl = vi.fn(async () => response(payload));
    await expect(loadSnapGeneIndex(fetchImpl)).rejects.toThrow();
  });

  it.each([
    ['duplicate IDs', {
      plasmids: [CATEGORY_PAYLOAD.plasmids[0], cloneJson(CATEGORY_PAYLOAD.plasmids[0])],
    }],
    ['stale selected metadata', {
      plasmids: [
        { ...CATEGORY_PAYLOAD.plasmids[0], name: 'Stale renamed vector' },
        CATEGORY_PAYLOAD.plasmids[1],
      ],
    }],
    ['wrong-category extra ID', {
      plasmids: [
        ...CATEGORY_PAYLOAD.plasmids,
        {
          ...CATEGORY_PAYLOAD.plasmids[1],
          id: 'sg_category_1',
          name: 'Category fixture 1',
        },
      ],
    }],
  ])('rejects an ambiguously bound category payload: %s', async (_label, payload) => {
    const fetchImpl = vi.fn(async () => response(payload));
    await expect(loadSelectedSnapGeneEntries({
      index: INDEX,
      selectedIds: new Set(['sg_wrap']),
      target: 'project:projectA',
      fetchImpl,
    })).rejects.toThrow();
    expect(useStore.getState().libraryEntries).toEqual({});
  });

  it('deep-clones nested annotation JSON and rejects impossible linear coordinates', async () => {
    const fetchImpl = vi.fn(async () => response(CATEGORY_PAYLOAD));
    const [entry] = await loadSelectedSnapGeneEntries({
      index: INDEX,
      selectedIds: new Set(['sg_wrap']),
      target: 'project:projectA',
      fetchImpl,
    });
    const source = CATEGORY_PAYLOAD.plasmids[0].annotations[0];
    const cloned = entry.payload.annotations[0];
    expect(cloned).not.toBe(source);
    expect(cloned.qualifiers).not.toBe(source.qualifiers);
    expect(cloned.qualifiers.note).not.toBe(source.qualifiers.note);
    expect(cloned.segments).not.toBe(source.segments);
    expect(cloned.segments[0]).not.toBe(source.segments[0]);

    const invalid = cloneJson(CATEGORY_PAYLOAD);
    invalid.plasmids[1].annotations = [{
      name: 'linear wrap', type: 'misc_feature', level: 'region',
      start: 10, end: 2, strand: 1,
    }];
    await expect(loadSelectedSnapGeneEntries({
      index: INDEX,
      selectedIds: new Set(['sg_other']),
      target: 'loose',
      fetchImpl: vi.fn(async () => response(invalid)),
    })).rejects.toThrow();
  });

  it('cancel during category fetch aborts/stale-drops with no row, toast or outer close', async () => {
    const categoryGate = deferred();
    let categorySignal = null;
    const fetchMock = vi.fn(async (url, options) => {
      if (url === '/plasmids-index.json') return response(INDEX);
      categorySignal = options?.signal || null;
      if (categorySignal) {
        categorySignal.addEventListener('abort', () => {
          const abortError = new Error('aborted');
          abortError.name = 'AbortError';
          categoryGate.reject(abortError);
        }, { once: true });
      }
      return categoryGate.promise;
    });
    vi.stubGlobal('fetch', fetchMock);
    const onClose = vi.fn();

    renderCatalog({ onClose });
    fireEvent.click(await screen.findByTestId('snapgene-catalog-select-sg_wrap'));
    fireEvent.click(screen.getByTestId('snapgene-catalog-import'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/plasmids-data/category-0.json', expect.any(Object),
    ));
    fireEvent.click(screen.getByLabelText('Закрыть каталог SnapGene'));
    await act(async () => {
      categoryGate.resolve(response(CATEGORY_PAYLOAD));
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(categorySignal?.aborted).toBe(true);
    expect(useStore.getState().libraryEntries).toEqual({});
    expect(useStore.getState().toasts).toEqual([]);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('locks close at durable commit start and labels a save failure without raw exception text', async () => {
    const commitGate = deferred();
    const bulkAdd = vi.fn(() => commitGate.promise);
    useStore.setState({ addLibraryEntriesBulk: bulkAdd });
    vi.stubGlobal('fetch', vi.fn(async (url) => (
      url === '/plasmids-index.json' ? response(INDEX) : response(CATEGORY_PAYLOAD)
    )));
    const onClose = vi.fn();

    renderCatalog({ onClose });
    fireEvent.click(await screen.findByTestId('snapgene-catalog-select-sg_wrap'));
    fireEvent.click(screen.getByTestId('snapgene-catalog-import'));
    await waitFor(() => expect(bulkAdd).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByLabelText('Закрыть каталог SnapGene'));
    fireEvent.pointerDown(screen.getByTestId('snapgene-catalog-backdrop'));
    fireEvent.keyDown(screen.getByTestId('snapgene-catalog-picker'), { key: 'Escape' });
    expect(screen.getByTestId('snapgene-catalog-picker')).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();

    await act(async () => { commitGate.reject(new Error('QuotaExceededError raw detail')); });
    expect(await screen.findByTestId('snapgene-catalog-error')).toBeTruthy();
    expect(screen.getByTestId('snapgene-catalog-error-title').textContent)
      .toBe('Не удалось сохранить плазмиды');
    expect(screen.getByTestId('snapgene-catalog-error').textContent)
      .not.toMatch(/QuotaExceeded|raw detail/i);
  });

  it('owns external and internal Tab without stealing other keys or leaking after close', async () => {
    const indexGate = deferred();
    vi.stubGlobal('fetch', vi.fn((url) => (
      url === '/plasmids-index.json'
        ? indexGate.promise
        : Promise.resolve(response(CATEGORY_PAYLOAD))
    )));
    const onClose = vi.fn();
    render(<AddModal open onClose={onClose} onLaunchPreImport={vi.fn()} />);
    fireEvent.click(screen.getByTestId('add-modal-source-catalog'));
    const opener = screen.getByTestId('add-modal-submit');
    opener.focus();
    fireEvent.click(opener);
    const picker = screen.getByTestId('snapgene-catalog-picker');
    expect(picker.contains(document.activeElement)).toBe(true);

    await act(async () => { indexGate.resolve(response(INDEX)); });
    await screen.findByTestId('snapgene-catalog-search');
    const focusable = [...picker.querySelectorAll(
      'button:not([disabled]), input:not([disabled]), select:not([disabled])',
    )];
    const first = focusable[0];
    const last = focusable.at(-1);

    opener.focus();
    const letter = new KeyboardEvent('keydown', {
      key: 'a', bubbles: true, cancelable: true,
    });
    fireEvent(opener, letter);
    expect(letter.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(opener);

    opener.focus();
    const externalTab = new KeyboardEvent('keydown', {
      key: 'Tab', bubbles: true, cancelable: true,
    });
    fireEvent(opener, externalTab);
    expect(externalTab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(first);

    opener.focus();
    const externalShiftTab = new KeyboardEvent('keydown', {
      key: 'Tab', shiftKey: true, bubbles: true, cancelable: true,
    });
    fireEvent(opener, externalShiftTab);
    expect(externalShiftTab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(last);

    last.focus();
    fireEvent.keyDown(last, { key: 'Tab' });
    expect(document.activeElement).toBe(first);
    first.focus();
    fireEvent.keyDown(first, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);

    fireEvent.keyDown(last, { key: 'Escape' });
    expect(screen.queryByTestId('snapgene-catalog-picker')).toBeNull();
    expect(screen.getByTestId('add-modal')).toBeTruthy();
    expect(document.activeElement).toBe(opener);
    expect(onClose).not.toHaveBeenCalled();

    const closedTab = new KeyboardEvent('keydown', {
      key: 'Tab', bubbles: true, cancelable: true,
    });
    fireEvent(opener, closedTab);
    expect(closedTab.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(opener);
  });

  it('creates collision-safe independent loose entries from the same source', async () => {
    const fetchImpl = vi.fn(async () => response(CATEGORY_PAYLOAD));
    const first = await loadSelectedSnapGeneEntries({
      index: INDEX, selectedIds: new Set(['sg_wrap']), target: 'loose', fetchImpl,
    });
    const second = await loadSelectedSnapGeneEntries({
      index: INDEX, selectedIds: new Set(['sg_wrap']), target: 'loose', fetchImpl,
    });
    const committed = await REAL_BULK_ADD([...first, ...second]);
    expect(committed).toHaveLength(2);
    expect(new Set(committed.map((entry) => entry.id)).size).toBe(2);
    expect(committed.every((entry) => entry.id !== 'sg_wrap')).toBe(true);
    expect(committed.every((entry) => entry.zone === 'loose' && entry.projectId === null)).toBe(true);
    expect(new Set(committed.flatMap((entry) => (
      entry.payload.annotations.map((annotation) => annotation.id)
    ))).size).toBe(4);
  });
});

describe('LIB-SRC-1R — StrictMode live acceptance', () => {
  it('accepts the second StrictMode index lifecycle and stale-drops a late first response', async () => {
    const firstIndex = deferred();
    const indexOptions = [];
    const fetchMock = vi.fn((url, options) => {
      if (url !== '/plasmids-index.json') return Promise.resolve(response(CATEGORY_PAYLOAD));
      indexOptions.push(options);
      return indexOptions.length === 1
        ? firstIndex.promise
        : Promise.resolve(response(INDEX));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <React.StrictMode>
        <AddModal open onClose={vi.fn()} onLaunchPreImport={vi.fn()} />
      </React.StrictMode>,
    );
    fireEvent.click(screen.getByTestId('add-modal-source-catalog'));
    fireEvent.click(screen.getByTestId('add-modal-submit'));
    const picker = screen.getByTestId('snapgene-catalog-picker');
    const loading = screen.getByTestId('snapgene-catalog-loading');
    const initialFocusWasMeaningful = document.activeElement === picker
      || loading.contains(document.activeElement);

    await waitFor(() => expect(indexOptions).toHaveLength(2));
    expect(await screen.findByTestId('snapgene-catalog-category')).toBeTruthy();
    expect(initialFocusWasMeaningful).toBe(true);
    expect(indexOptions[0]?.signal?.aborted).toBe(true);
    expect(indexOptions[1]?.signal?.aborted).toBe(false);

    await act(async () => {
      firstIndex.resolve(response({}, { ok: false, status: 503 }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(screen.getByTestId('snapgene-catalog-category')).toBeTruthy();
    expect(screen.queryByTestId('snapgene-catalog-error')).toBeNull();
  });

  it('rejects an internally coherent truncated package identity', async () => {
    const truncatedIndex = {
      version: '1.0',
      total: 1,
      categories: [{
        slug: 'category-0', name: 'Category 0', count: 1, organism: 'E. coli',
      }],
      plasmids: [INDEX.plasmids[0]],
    };
    await expect(loadSnapGeneIndex(vi.fn(async () => response(truncatedIndex))))
      .rejects.toThrow();
  });

  it('keeps Tab and Shift+Tab inside the dialog when commit disables every control', async () => {
    const commitGate = deferred();
    const bulkAdd = vi.fn(() => commitGate.promise);
    useStore.setState({ addLibraryEntriesBulk: bulkAdd });
    vi.stubGlobal('fetch', vi.fn(async (url) => (
      url === '/plasmids-index.json' ? response(INDEX) : response(CATEGORY_PAYLOAD)
    )));

    renderCatalog();
    fireEvent.click(await screen.findByTestId('snapgene-catalog-select-sg_wrap'));
    fireEvent.click(screen.getByTestId('snapgene-catalog-import'));
    await waitFor(() => expect(bulkAdd).toHaveBeenCalledTimes(1));
    const picker = screen.getByTestId('snapgene-catalog-picker');
    expect(picker.querySelectorAll(
      'button:not([disabled]), input:not([disabled]), select:not([disabled])',
    )).toHaveLength(0);
    const outside = screen.getByTestId('add-modal-submit');

    outside.focus();
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    fireEvent(outside, tab);
    expect(tab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(picker);

    outside.focus();
    const shiftTab = new KeyboardEvent('keydown', {
      key: 'Tab', shiftKey: true, bubbles: true, cancelable: true,
    });
    fireEvent(outside, shiftTab);
    expect(shiftTab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(picker);

    await act(async () => { commitGate.resolve([{}]); });
  });
});
