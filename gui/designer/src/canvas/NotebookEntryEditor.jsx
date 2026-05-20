/**
 * NotebookEntryEditor — split-view textarea + live preview.
 *
 * Spec §5.1 / §6 / §7.
 *   - Textarea on the left, MarkdownView preview on the right.
 *   - 500 ms debounce on text propagation; Ctrl+S flushes immediately.
 *   - Scroll position synced by percent between textarea and preview.
 *   - Drag-drop image files → attach + insert markdown snippet at cursor.
 *   - Paste image from clipboard → same flow.
 *   - Ref-picker button → consumer-provided picker → snippet inserted.
 *
 * The host (NotebookTab in K16) is expected to wire onChange + provide
 * the attachments registry and the ref picker.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import MarkdownView from './MarkdownView';
import NotebookToolbar from './NotebookToolbar';
import { attachFileToNotebookEntry } from '../lib/bodge-attachments';

const DEBOUNCE_MS = 500;

export default function NotebookEntryEditor({
  entry,
  attachments,
  onChange,
  onAttachmentAdded,
  onRefPicker,
  onRefClick,
  testId = 'notebook-entry-editor',
}) {
  const [text, setText] = useState(entry?.text || '');
  const [title, setTitle] = useState(entry?.title || '');
  const [previewVisible, setPreviewVisible] = useState(true);
  const [scrollPercent, setScrollPercent] = useState(0);
  const textareaRef = useRef(null);
  const previewRef = useRef(null);
  const debounceTimer = useRef(null);

  // Sync local state when entry prop changes.
  useEffect(() => {
    setText(entry?.text || '');
    setTitle(entry?.title || '');
  }, [entry?.id]);

  // Debounced flush of text changes back to parent.
  const flushChange = useCallback((nextText, nextTitle) => {
    if (typeof onChange !== 'function') return;
    onChange({
      ...entry,
      text: nextText !== undefined ? nextText : text,
      title: nextTitle !== undefined ? nextTitle : title,
      updatedAt: new Date().toISOString(),
    });
  }, [entry, text, title, onChange]);

  const scheduleFlush = useCallback((nextText) => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => flushChange(nextText), DEBOUNCE_MS);
  }, [flushChange]);

  const handleTextChange = (e) => {
    const val = e.target.value;
    setText(val);
    scheduleFlush(val);
  };

  const handleTitleChange = (e) => {
    const val = e.target.value;
    setTitle(val);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => flushChange(undefined, val), DEBOUNCE_MS);
  };

  const handleBlur = () => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
      debounceTimer.current = null;
    }
    flushChange();
  };

  // Ctrl+S immediate flush.
  const handleKeyDown = (e) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
      e.preventDefault();
      handleBlur();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'b' || e.key === 'B')) {
      e.preventDefault();
      insertSnippet('**${sel}**');
      return;
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'i' || e.key === 'I')) {
      e.preventDefault();
      insertSnippet('_${sel}_');
    }
  };

  // Scroll sync (textarea → preview).
  const handleTextareaScroll = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    const denom = ta.scrollHeight - ta.clientHeight;
    if (denom <= 0) return;
    setScrollPercent(ta.scrollTop / denom);
  };

  useEffect(() => {
    if (!previewVisible) return;
    const pv = previewRef.current;
    if (!pv) return;
    const denom = pv.scrollHeight - pv.clientHeight;
    if (denom <= 0) return;
    pv.scrollTop = Math.round(scrollPercent * denom);
  }, [scrollPercent, previewVisible, text]);

  // Insert helper.
  const insertSnippet = useCallback((template, extra) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = ta.value.slice(start, end);
    const replacement = template.replace(/\$\{sel\}/g, selected);
    if (typeof ta.setRangeText === 'function') {
      ta.setRangeText(replacement, start, end, 'select');
    } else {
      // Fallback for environments without setRangeText.
      const before = ta.value.slice(0, start);
      const after = ta.value.slice(end);
      ta.value = `${before}${replacement}${after}`;
    }
    ta.focus();
    const newVal = ta.value;
    setText(newVal);
    scheduleFlush(newVal);
    if (extra && typeof extra === 'string') {
      // For markdown snippet inserts that include the cursor target.
      void extra;
    }
  }, [scheduleFlush]);

  // Drag-drop image flow.
  const handleDrop = async (e) => {
    if (!e.dataTransfer?.files?.length) return;
    const images = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    if (!images.length) return; // not image — don't intercept
    e.preventDefault();
    for (const file of images) {
      const { attId, markdownSnippet } = await attachFileToNotebookEntry(file, attachments || new Map());
      insertSnippet(`\n\n${markdownSnippet}\n`);
      if (typeof onAttachmentAdded === 'function') onAttachmentAdded({ attId });
    }
  };

  const handlePaste = async (e) => {
    const items = e.clipboardData?.items ? Array.from(e.clipboardData.items) : [];
    const imageItem = items.find(i => i.type?.startsWith('image/'));
    if (!imageItem) return;
    e.preventDefault();
    const file = imageItem.getAsFile?.();
    if (!file) return;
    const named = file.name ? file : new File([file], `pasted-${Date.now()}.png`, { type: file.type });
    const { attId, markdownSnippet } = await attachFileToNotebookEntry(named, attachments || new Map());
    insertSnippet(`\n\n${markdownSnippet}\n`);
    if (typeof onAttachmentAdded === 'function') onAttachmentAdded({ attId });
  };

  const handleAttachmentClick = useCallback(async () => {
    if (typeof onAttachmentAdded !== 'function') return;
    if (typeof document === 'undefined') return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,application/pdf,chemical/x-ab1,.ab1';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const { attId, markdownSnippet } = await attachFileToNotebookEntry(file, attachments || new Map());
      insertSnippet(`\n\n${markdownSnippet}\n`);
      onAttachmentAdded({ attId });
    };
    input.click();
  }, [attachments, insertSnippet, onAttachmentAdded]);

  const handleRefPickerClick = useCallback(async () => {
    if (typeof onRefPicker !== 'function') return;
    const picked = await onRefPicker();
    if (!picked?.kind || !picked?.id) return;
    insertSnippet(`@@ref:${picked.kind}:${picked.id}@@`);
  }, [onRefPicker, insertSnippet]);

  // Cleanup pending debounce on unmount.
  useEffect(() => () => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
  }, []);

  const attachmentsMap = useMemo(() => attachments || new Map(), [attachments]);

  return (
    <div data-testid={testId} style={styles.shell}>
      <input
        data-testid="notebook-title"
        value={title}
        onChange={handleTitleChange}
        onBlur={handleBlur}
        placeholder="Untitled entry"
        style={styles.title}
      />
      <NotebookToolbar
        onInsert={insertSnippet}
        onAttachmentClick={handleAttachmentClick}
        onRefPickerClick={handleRefPickerClick}
        onTogglePreview={() => setPreviewVisible(v => !v)}
        previewVisible={previewVisible}
      />
      <div style={styles.split}>
        <textarea
          ref={textareaRef}
          data-testid="notebook-textarea"
          value={text}
          onChange={handleTextChange}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          onScroll={handleTextareaScroll}
          onDrop={handleDrop}
          onPaste={handlePaste}
          onDragOver={(e) => e.preventDefault()}
          placeholder="Write markdown — drag-drop images, @@ref entities, $LaTeX$ formulas."
          style={{
            ...styles.textarea,
            flex: previewVisible ? '1 1 50%' : '1 1 100%',
          }}
        />
        {previewVisible && (
          <div ref={previewRef} style={styles.previewWrap}>
            <MarkdownView
              text={text}
              attachments={attachmentsMap}
              onRefClick={onRefClick}
              testId="notebook-preview"
              style={styles.preview}
            />
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  shell: {
    display: 'flex', flexDirection: 'column', height: '100%',
    background: 'var(--surface-1)', color: 'var(--text-primary)',
  },
  title: {
    padding: '10px 12px', fontSize: 16, fontWeight: 600,
    border: 'none', borderBottom: '1px solid var(--border-subtle)',
    background: 'var(--surface-1)', color: 'var(--text-primary)',
    outline: 'none', boxSizing: 'border-box', width: '100%',
  },
  split: { display: 'flex', flex: 1, minHeight: 0 },
  textarea: {
    border: 'none',
    borderRight: '1px solid var(--border-subtle)',
    padding: 12,
    fontFamily: 'var(--font-mono, monospace)',
    fontSize: 13,
    lineHeight: 1.5,
    resize: 'none',
    outline: 'none',
    background: 'var(--surface-1)',
    color: 'var(--text-primary)',
    boxSizing: 'border-box',
  },
  previewWrap: {
    flex: '1 1 50%',
    overflowY: 'auto',
    padding: 12,
    background: 'var(--surface-1)',
  },
  preview: {
    fontSize: 13.5,
    lineHeight: 1.6,
  },
};

export { DEBOUNCE_MS };
