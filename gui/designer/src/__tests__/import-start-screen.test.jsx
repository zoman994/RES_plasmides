/**
 * Sprint Import-Start-Screen K6 — multi-file flow integration tests.
 *
 * Covers: multi-mode action restrictions (canvas/restriction/mutagenesis disabled),
 * inline-rename via contenteditable blur, batch checkbox toggles.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/react';
import MultiFileList from '../components/ImportStartScreen/MultiFileList';
import ActionsBar from '../components/ImportStartScreen/ActionsBar';
import CatalogTree from '../components/ImportStartScreen/CatalogTree';
import { useStore } from '../store';

function makeItem(name, opts = {}) {
  return {
    name,
    sequence: opts.sequence || 'ATGCATGCATGC',
    length: (opts.sequence || 'ATGCATGCATGC').length,
    topology: opts.topology || 'linear',
    annotations: opts.annotations || [],
    _fileName: opts.fileName || `${name}.gb`,
  };
}

describe('ActionsBar — multi mode restrictions', () => {
  it('multi mode disables «На канвас», fires library-batch, and the ⋯ dropdown no longer shows Restriction/Мутагенез/Разобрать (Polish §6)', () => {
    const onAction = vi.fn();
    const { getByTestId, queryByText, container } = render(
      <ActionsBar mode="multi" onAction={onAction} count={5} hasParsedItem />
    );
    const canvasBtn = getByTestId('action-canvas-disabled');
    expect(canvasBtn.disabled).toBe(true);
    expect(canvasBtn.getAttribute('title')).toMatch(/одиночной/);
    // Library batch button shows the count.
    const libBtn = getByTestId('action-library-batch');
    expect(libBtn.textContent).toContain('5');
    // Polish §6: open the secondary dropdown via ⋯ and verify legacy
    // Restriction/Мутагенез/Разобрать entries are gone.
    fireEvent.click(getByTestId('action-secondary-toggle'));
    expect(queryByText('Restriction')).toBeNull();
    expect(queryByText('Мутагенез')).toBeNull();
    expect(queryByText('Разобрать')).toBeNull();
    // Container text should also not contain those labels (defensive).
    expect(container.textContent).not.toMatch(/Restriction|Мутагенез|Разобрать/);
    // Action callback fires for batch options only.
    fireEvent.click(libBtn);
    expect(onAction).toHaveBeenCalledWith('library-batch');
  });
});

describe('MultiFileList — inline rename + batch toggle', () => {
  it('renders one row per item with mini-map, name and meta', () => {
    const items = [
      makeItem('pUC19', { annotations: [{ id: 'r1', start: 100, end: 460, level: 'region', type: 'CDS', name: 'lacZα' }] }),
      makeItem('linear_insert', { topology: 'linear' }),
      makeItem('pTRC99a'),
    ];
    const { container } = render(
      <MultiFileList
        items={items}
        annotateSet={new Set(['pUC19', 'linear_insert', 'pTRC99a'])}
        onRename={() => {}}
        onAnnotateToggle={() => {}}
        onAllAnnotate={() => {}}
        onNoneAnnotate={() => {}}
      />
    );
    expect(container.querySelectorAll('[data-testid^="multi-name-"]').length).toBe(3);
    expect(container.querySelectorAll('svg').length).toBe(3);
  });

  it('inline-rename: blur on contenteditable name fires onRename with trimmed new value', () => {
    const items = [makeItem('pUC19')];
    const onRename = vi.fn();
    const { getByTestId } = render(
      <MultiFileList
        items={items}
        annotateSet={new Set()}
        onRename={onRename}
        onAnnotateToggle={() => {}}
        onAllAnnotate={() => {}}
        onNoneAnnotate={() => {}}
      />
    );
    const node = getByTestId('multi-name-pUC19');
    node.textContent = '  pUC19_renamed  ';
    fireEvent.blur(node);
    expect(onRename).toHaveBeenCalledTimes(1);
    expect(onRename.mock.calls[0][1]).toBe('pUC19_renamed');
  });

  it('batch toggles: per-row checkbox + «☑ всем» / «☐ никому» each fire their handler', () => {
    const items = [makeItem('pUC19'), makeItem('pET28a')];
    const onAll = vi.fn();
    const onNone = vi.fn();
    const onToggle = vi.fn();
    const { getByTestId } = render(
      <MultiFileList
        items={items}
        annotateSet={new Set()}
        onRename={() => {}}
        onAnnotateToggle={onToggle}
        onAllAnnotate={onAll}
        onNoneAnnotate={onNone}
      />
    );
    fireEvent.click(getByTestId('multi-all-annotate'));
    fireEvent.click(getByTestId('multi-none-annotate'));
    fireEvent.click(getByTestId('multi-annot-pUC19'));
    expect(onAll).toHaveBeenCalledTimes(1);
    expect(onNone).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith('pUC19');
  });
});

describe('CatalogTree — lazy-load + select', () => {
  it('loads index, expands category, click on card invokes onSelectItem with full record', async () => {
    // Mock fetch for /plasmids-index.json + /plasmids-data/<slug>.json.
    const fakeIndex = {
      version: '1.0', total: 2, categories: [
        { slug: 'basic_cloning_vectors', name: 'Basic Cloning Vectors', count: 1, organism: 'E. coli' },
      ],
    };
    const fakeCategory = {
      plasmids: [{
        id: 'sg_test1',
        name: 'pUC19',
        sequence: 'ATGCATGC',
        length: 8,
        topology: 'circular',
        annotations: [{ id: 'r1', start: 1, end: 5, level: 'region', type: 'CDS', name: 'lacZα' }],
        description: '<html>desc</html>',
      }],
    };
    const origFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (url) => {
      if (String(url).endsWith('plasmids-index.json')) {
        return { ok: true, json: async () => fakeIndex };
      }
      if (String(url).endsWith('basic_cloning_vectors.json')) {
        return { ok: true, json: async () => fakeCategory };
      }
      return { ok: false, status: 404 };
    });
    // Reset module-level cache so re-runs see fresh fetch (cache lives in CatalogTree.jsx).
    // Quick hack: import the component and reach into its module — instead, just
    // accept the cache: this is the first run of the suite for that module, so it’s clean.
    useStore.setState({ parts: [] });
    const onSelect = vi.fn();
    const { findByText, getByTestId } = render(
      <CatalogTree onSelectItem={onSelect} query="" onQueryChange={() => {}} />
    );
    // Index loaded → category appears in tree.
    const catBtn = await findByText('Basic Cloning Vectors');
    fireEvent.click(catBtn);
    // After click, fetchCategory promise resolves → card renders.
    const card = await waitFor(() => getByTestId('catalog-card-pUC19'));
    fireEvent.click(card);
    expect(onSelect).toHaveBeenCalledTimes(1);
    const arg = onSelect.mock.calls[0][0];
    expect(arg.name).toBe('pUC19');
    expect(arg.sequence).toBe('ATGCATGC');
    expect(arg.topology).toBe('circular');
    expect(arg.annotations).toHaveLength(1);
    globalThis.fetch = origFetch;
  });
});
