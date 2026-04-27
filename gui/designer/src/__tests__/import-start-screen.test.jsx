/**
 * Sprint Import-Start-Screen K6 — multi-file flow integration tests.
 *
 * Covers: multi-mode action restrictions (canvas/restriction/mutagenesis disabled),
 * inline-rename via contenteditable blur, batch checkbox toggles.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import MultiFileList from '../components/ImportStartScreen/MultiFileList';
import ActionsBar from '../components/ImportStartScreen/ActionsBar';

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
  it('multi mode disables «На канвас» + Restriction/Мутагенез/Разобрать and surfaces tooltip', () => {
    const onAction = vi.fn();
    const { getByTestId, getByText } = render(
      <ActionsBar mode="multi" onAction={onAction} count={5} />
    );
    const canvasBtn = getByTestId('action-canvas-disabled');
    expect(canvasBtn.disabled).toBe(true);
    expect(canvasBtn.getAttribute('title')).toMatch(/одиночной/);
    // Library batch button shows the count.
    const libBtn = getByTestId('action-library-batch');
    expect(libBtn.textContent).toContain('5');
    // Open the secondary dropdown
    fireEvent.click(getByText('Действия ▾'));
    // All three secondary entries are disabled with «доступно для одиночной» tooltip.
    for (const label of ['Restriction', 'Мутагенез', 'Разобрать']) {
      const btn = getByText(label);
      expect(btn.disabled).toBe(true);
      expect(btn.getAttribute('title')).toMatch(/одиночной/);
    }
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

  it('batch toggles: «☑ всем» / «☐ никому» / per-row checkbox each invoke their callback', () => {
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
