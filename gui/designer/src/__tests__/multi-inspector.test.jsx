/**
 * Sprint IS-Final K2 — MultiInspector replaces MultiFileList in primary role.
 *
 * Closes V35 (master tristate checkbox).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import MultiInspector from '../components/ImportStartScreen/MultiInspector';

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

describe('MultiInspector — header + footer', () => {
  it('renders header «Загружено N файлов» + ↻ replace-all link', () => {
    const items = [makeItem('a'), makeItem('b'), makeItem('c')];
    const { getByTestId, getByText } = render(
      <MultiInspector
        items={items}
        annotateSet={new Set()}
        onRename={vi.fn()} onAnnotateToggle={vi.fn()}
        onAnnotateMaster={vi.fn()} onRemoveItem={vi.fn()} onAction={vi.fn()}
      />
    );
    expect(getByTestId('multi-inspector-header').textContent).toMatch(/3 файл/);
    expect(getByText(/↻ заменить все/i)).toBeTruthy();
  });

  it('footer count «В библиотеку (N)» reflects items.length', () => {
    const items = [makeItem('a'), makeItem('b'), makeItem('c'), makeItem('d')];
    const { getByTestId } = render(
      <MultiInspector
        items={items} annotateSet={new Set()}
        onRename={vi.fn()} onAnnotateToggle={vi.fn()}
        onAnnotateMaster={vi.fn()} onRemoveItem={vi.fn()} onAction={vi.fn()}
      />
    );
    expect(getByTestId('action-library-batch').textContent).toMatch(/4/);
  });

  it('«На канвас» disabled with tooltip', () => {
    const { getByTestId } = render(
      <MultiInspector
        items={[makeItem('a'), makeItem('b')]} annotateSet={new Set()}
        onRename={vi.fn()} onAnnotateToggle={vi.fn()}
        onAnnotateMaster={vi.fn()} onRemoveItem={vi.fn()} onAction={vi.fn()}
      />
    );
    const btn = getByTestId('action-canvas-disabled');
    expect(btn.disabled).toBe(true);
    expect(btn.getAttribute('title')).toMatch(/одиноч/);
  });
});

describe('MultiInspector — master-checkbox tristate (V35)', () => {
  it('master is unchecked + indeterminate=false when annotateSet empty', () => {
    const items = [makeItem('a'), makeItem('b')];
    const { getByTestId } = render(
      <MultiInspector
        items={items} annotateSet={new Set()}
        onRename={vi.fn()} onAnnotateToggle={vi.fn()}
        onAnnotateMaster={vi.fn()} onRemoveItem={vi.fn()} onAction={vi.fn()}
      />
    );
    const master = getByTestId('multi-master-checkbox');
    expect(master.checked).toBe(false);
    expect(master.indeterminate).toBe(false);
  });

  it('master is checked + indeterminate=false when all items annotated', () => {
    const items = [makeItem('a'), makeItem('b')];
    const { getByTestId } = render(
      <MultiInspector
        items={items} annotateSet={new Set(['a', 'b'])}
        onRename={vi.fn()} onAnnotateToggle={vi.fn()}
        onAnnotateMaster={vi.fn()} onRemoveItem={vi.fn()} onAction={vi.fn()}
      />
    );
    const master = getByTestId('multi-master-checkbox');
    expect(master.checked).toBe(true);
    expect(master.indeterminate).toBe(false);
  });

  it('master indeterminate=true when partial state', () => {
    const items = [makeItem('a'), makeItem('b'), makeItem('c')];
    const { getByTestId } = render(
      <MultiInspector
        items={items} annotateSet={new Set(['a'])}
        onRename={vi.fn()} onAnnotateToggle={vi.fn()}
        onAnnotateMaster={vi.fn()} onRemoveItem={vi.fn()} onAction={vi.fn()}
      />
    );
    const master = getByTestId('multi-master-checkbox');
    expect(master.indeterminate).toBe(true);
  });

  it('master cycle: none → all', () => {
    const onMaster = vi.fn();
    const items = [makeItem('a'), makeItem('b')];
    const { getByTestId } = render(
      <MultiInspector
        items={items} annotateSet={new Set()}
        onRename={vi.fn()} onAnnotateToggle={vi.fn()}
        onAnnotateMaster={onMaster} onRemoveItem={vi.fn()} onAction={vi.fn()}
      />
    );
    fireEvent.click(getByTestId('multi-master-checkbox'));
    expect(onMaster).toHaveBeenCalledWith('all');
  });

  it('master cycle: all → none', () => {
    const onMaster = vi.fn();
    const items = [makeItem('a'), makeItem('b')];
    const { getByTestId } = render(
      <MultiInspector
        items={items} annotateSet={new Set(['a', 'b'])}
        onRename={vi.fn()} onAnnotateToggle={vi.fn()}
        onAnnotateMaster={onMaster} onRemoveItem={vi.fn()} onAction={vi.fn()}
      />
    );
    fireEvent.click(getByTestId('multi-master-checkbox'));
    expect(onMaster).toHaveBeenCalledWith('none');
  });

  it('master cycle: some → all', () => {
    const onMaster = vi.fn();
    const items = [makeItem('a'), makeItem('b'), makeItem('c')];
    const { getByTestId } = render(
      <MultiInspector
        items={items} annotateSet={new Set(['a'])}
        onRename={vi.fn()} onAnnotateToggle={vi.fn()}
        onAnnotateMaster={onMaster} onRemoveItem={vi.fn()} onAction={vi.fn()}
      />
    );
    fireEvent.click(getByTestId('multi-master-checkbox'));
    expect(onMaster).toHaveBeenCalledWith('all');
  });
});

describe('MultiInspector — row interactions', () => {
  it('per-row checkbox invokes onAnnotateToggle with row name', () => {
    const onToggle = vi.fn();
    const items = [makeItem('pUC19'), makeItem('pET28a')];
    const { getByTestId } = render(
      <MultiInspector
        items={items} annotateSet={new Set()}
        onRename={vi.fn()} onAnnotateToggle={onToggle}
        onAnnotateMaster={vi.fn()} onRemoveItem={vi.fn()} onAction={vi.fn()}
      />
    );
    fireEvent.click(getByTestId('multi-annot-pUC19'));
    expect(onToggle).toHaveBeenCalledWith('pUC19');
  });

  it('row remove ✕ invokes onRemoveItem with item', () => {
    const onRemove = vi.fn();
    const items = [makeItem('a'), makeItem('b')];
    const { getByTestId } = render(
      <MultiInspector
        items={items} annotateSet={new Set()}
        onRename={vi.fn()} onAnnotateToggle={vi.fn()}
        onAnnotateMaster={vi.fn()} onRemoveItem={onRemove} onAction={vi.fn()}
      />
    );
    fireEvent.click(getByTestId('multi-remove-a'));
    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(onRemove.mock.calls[0][0].name).toBe('a');
  });
});

describe('MultiInspector — ⋯ dropdown (replace + delete-all with confirm)', () => {
  it('dropdown shows replace + delete-all entries', () => {
    const items = [makeItem('a'), makeItem('b')];
    const { getByTestId } = render(
      <MultiInspector
        items={items} annotateSet={new Set()}
        onRename={vi.fn()} onAnnotateToggle={vi.fn()}
        onAnnotateMaster={vi.fn()} onRemoveItem={vi.fn()} onAction={vi.fn()}
      />
    );
    fireEvent.click(getByTestId('multi-secondary-toggle'));
    expect(getByTestId('multi-action-replace-all').textContent).toMatch(/Заменить весь batch/);
    expect(getByTestId('multi-action-delete-all').textContent).toMatch(/Удалить весь batch/);
  });

  it('delete-all asks window.confirm and only fires onAction on OK', () => {
    const items = [makeItem('a'), makeItem('b')];
    const onAction = vi.fn();
    const origConfirm = window.confirm;
    window.confirm = vi.fn(() => false);
    const { getByTestId } = render(
      <MultiInspector
        items={items} annotateSet={new Set()}
        onRename={vi.fn()} onAnnotateToggle={vi.fn()}
        onAnnotateMaster={vi.fn()} onRemoveItem={vi.fn()} onAction={onAction}
      />
    );
    fireEvent.click(getByTestId('multi-secondary-toggle'));
    fireEvent.click(getByTestId('multi-action-delete-all'));
    expect(window.confirm).toHaveBeenCalled();
    expect(onAction).not.toHaveBeenCalledWith('delete-all');
    window.confirm = vi.fn(() => true);
    fireEvent.click(getByTestId('multi-secondary-toggle'));
    fireEvent.click(getByTestId('multi-action-delete-all'));
    expect(onAction).toHaveBeenCalledWith('delete-all');
    window.confirm = origConfirm;
  });
});
