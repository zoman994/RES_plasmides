/**
 * NB-K8 + K10 + K11 — NotebookEntryEditor: text edit propagate,
 * debounce, manual save, preview update, ref click route, drag-drop +
 * paste image, scroll sync.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import NotebookEntryEditor from '../NotebookEntryEditor';

function makeEntry(overrides = {}) {
  return {
    id: 'nb01',
    kind: 'free-text',
    title: 'Test',
    text: 'hello **world**',
    createdAt: 'x',
    updatedAt: 'x',
    ...overrides,
  };
}

function makeImageFile(name = 'gel.png') {
  return new File([new Uint8Array([137, 80, 78, 71])], name, { type: 'image/png' });
}

describe('NB-K8 — NotebookEntryEditor text edit propagation', () => {
  it('initial render shows entry text + title', () => {
    render(<NotebookEntryEditor entry={makeEntry()} onChange={vi.fn()} />);
    expect(screen.getByTestId('notebook-textarea').value).toBe('hello **world**');
    expect(screen.getByTestId('notebook-title').value).toBe('Test');
  });

  it('typing flushes onChange after 500ms debounce', async () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    render(<NotebookEntryEditor entry={makeEntry()} onChange={onChange} />);
    fireEvent.change(screen.getByTestId('notebook-textarea'), { target: { value: 'edited' } });
    expect(onChange).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(500); });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ text: 'edited' }));
    vi.useRealTimers();
  });

  it('Ctrl+S flushes immediately (no debounce wait)', () => {
    const onChange = vi.fn();
    render(<NotebookEntryEditor entry={makeEntry()} onChange={onChange} />);
    const ta = screen.getByTestId('notebook-textarea');
    fireEvent.change(ta, { target: { value: 'urgent' } });
    fireEvent.keyDown(ta, { key: 's', ctrlKey: true });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ text: 'urgent' }));
  });

  it('blur flushes immediately', () => {
    const onChange = vi.fn();
    render(<NotebookEntryEditor entry={makeEntry()} onChange={onChange} />);
    fireEvent.change(screen.getByTestId('notebook-textarea'), { target: { value: 'before-blur' } });
    fireEvent.blur(screen.getByTestId('notebook-textarea'));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ text: 'before-blur' }));
  });

  it('preview updates with new text', async () => {
    const { rerender } = render(<NotebookEntryEditor entry={makeEntry()} onChange={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByTestId('notebook-preview').innerHTML).toContain('<strong>world</strong>');
    });
    rerender(<NotebookEntryEditor entry={makeEntry({ id: 'nb02', text: '## Updated' })} onChange={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByTestId('notebook-preview').innerHTML).toContain('<h2>');
    });
  });

  it('ref click in preview routes to onRefClick', async () => {
    const onRefClick = vi.fn();
    render(
      <NotebookEntryEditor
        entry={makeEntry({ text: 'See @@ref:zone:zn01@@.' })}
        onChange={vi.fn()}
        onRefClick={onRefClick}
      />,
    );
    let btn;
    await waitFor(() => {
      btn = screen.getByTestId('notebook-preview').querySelector('.md-ref');
      expect(btn).toBeTruthy();
    });
    fireEvent.click(btn);
    expect(onRefClick).toHaveBeenCalledWith({ kind: 'zone', id: 'zn01' });
  });
});

describe('NB-K10 — preview toggle hides/shows preview pane', () => {
  it('starts visible, toggles via 👁 button', () => {
    render(<NotebookEntryEditor entry={makeEntry()} onChange={vi.fn()} />);
    expect(screen.queryByTestId('notebook-preview')).toBeTruthy();
    fireEvent.click(screen.getByTestId('nb-tb-preview'));
    expect(screen.queryByTestId('notebook-preview')).toBeFalsy();
    fireEvent.click(screen.getByTestId('nb-tb-preview'));
    expect(screen.queryByTestId('notebook-preview')).toBeTruthy();
  });
});

describe('NB-K11 — drag-drop + paste image', () => {
  it('drop image file → attachFile + insertSnippet', async () => {
    const onChange = vi.fn();
    const onAttachmentAdded = vi.fn();
    const attachments = new Map();
    render(
      <NotebookEntryEditor
        entry={makeEntry({ text: '' })}
        attachments={attachments}
        onChange={onChange}
        onAttachmentAdded={onAttachmentAdded}
      />,
    );
    const ta = screen.getByTestId('notebook-textarea');
    const file = makeImageFile();
    await act(async () => {
      fireEvent.drop(ta, { dataTransfer: { files: [file] } });
      await new Promise(r => setTimeout(r, 400));
    });
    expect(onAttachmentAdded).toHaveBeenCalled();
    expect(ta.value).toMatch(/!\[.*\]\(att[A-Za-z0-9_-]+\./);
  });

  it('drop non-image file is ignored (default OS behavior)', async () => {
    const onAttachmentAdded = vi.fn();
    const attachments = new Map();
    render(
      <NotebookEntryEditor
        entry={makeEntry({ text: '' })}
        attachments={attachments}
        onChange={vi.fn()}
        onAttachmentAdded={onAttachmentAdded}
      />,
    );
    const ta = screen.getByTestId('notebook-textarea');
    const file = new File(['plain'], 'doc.txt', { type: 'text/plain' });
    fireEvent.drop(ta, { dataTransfer: { files: [file] } });
    await new Promise(r => setTimeout(r, 50));
    expect(onAttachmentAdded).not.toHaveBeenCalled();
  });

  it('paste image from clipboard → attach + insert', async () => {
    const onAttachmentAdded = vi.fn();
    const attachments = new Map();
    render(
      <NotebookEntryEditor
        entry={makeEntry({ text: '' })}
        attachments={attachments}
        onChange={vi.fn()}
        onAttachmentAdded={onAttachmentAdded}
      />,
    );
    const ta = screen.getByTestId('notebook-textarea');
    const file = makeImageFile('pasted.png');
    const clipboardEvent = {
      clipboardData: {
        items: [{
          type: 'image/png',
          getAsFile: () => file,
        }],
      },
    };
    await act(async () => {
      fireEvent.paste(ta, clipboardEvent);
      await new Promise(r => setTimeout(r, 400));
    });
    expect(onAttachmentAdded).toHaveBeenCalled();
  });
});

describe('NB-K11 — ref picker integration', () => {
  it('clicking @@ button calls onRefPicker, picked value inserted as snippet', async () => {
    const onRefPicker = vi.fn().mockResolvedValue({ kind: 'zone', id: 'zn-picked' });
    render(
      <NotebookEntryEditor
        entry={makeEntry({ text: '' })}
        onChange={vi.fn()}
        onRefPicker={onRefPicker}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId('nb-tb-ref'));
      await new Promise(r => setTimeout(r, 400));
    });
    expect(onRefPicker).toHaveBeenCalled();
    expect(screen.getByTestId('notebook-textarea').value).toContain('@@ref:zone:zn-picked@@');
  });

  it('onRefPicker returning null does not insert anything', async () => {
    const onRefPicker = vi.fn().mockResolvedValue(null);
    render(
      <NotebookEntryEditor
        entry={makeEntry({ text: 'start' })}
        onChange={vi.fn()}
        onRefPicker={onRefPicker}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId('nb-tb-ref'));
      await new Promise(r => setTimeout(r, 400));
    });
    expect(screen.getByTestId('notebook-textarea').value).toBe('start');
  });
});
