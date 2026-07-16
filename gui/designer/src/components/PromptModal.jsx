/**
 * PromptModal — in-app replacement for the native `window.prompt`, which is a
 * no-op in the packaged Electron build (BUGS V191/V192). Driven by the ui-slice
 * `prompt` state: `requestPrompt({title, defaultValue, multiline, …})` opens it
 * and resolves with the entered string (Enter / OK) or null (Escape / Отмена /
 * overlay click). Mounted once at the App root so it overlays every surface
 * (tree, inspector, canvas).
 */
import { useState, useEffect, useRef } from 'react';
import { useStore } from '../store';

export default function PromptModal() {
  const prompt = useStore((s) => s.prompt);
  const resolvePrompt = useStore((s) => s.resolvePrompt);
  const [value, setValue] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (!prompt) return undefined;
    setValue(prompt.defaultValue || '');
    const id = setTimeout(() => {
      const el = inputRef.current;
      if (el) { el.focus(); try { el.select?.(); } catch { /* noop */ } }
    }, 0);
    return () => clearTimeout(id);
  }, [prompt]);

  if (!prompt) return null;

  const confirm = () => resolvePrompt(value);
  const cancel = () => resolvePrompt(null);

  const onKeyDown = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); cancel(); return; }
    if (e.key === 'Enter') {
      // single-line: Enter confirms; multiline: only Ctrl/Cmd+Enter confirms
      if (!prompt.multiline || e.ctrlKey || e.metaKey) { e.preventDefault(); confirm(); }
    }
  };

  const fieldStyle = {
    width: '100%', boxSizing: 'border-box', fontSize: 13,
    padding: '6px 8px', borderRadius: 4,
    border: '1px solid var(--accent-500)', background: 'var(--surface-2)',
    color: 'var(--text-primary)', outline: 'none',
  };

  return (
    <div
      data-testid="prompt-modal"
      onMouseDown={(e) => { if (e.target === e.currentTarget) cancel(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 4000,
        background: 'rgba(0,0,0,0.35)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          width: 'min(420px, 90vw)', background: 'var(--surface-1)',
          border: '1px solid var(--border-subtle)', borderRadius: 8,
          boxShadow: '0 8px 32px rgba(0,0,0,0.3)', padding: 16,
          font: 'var(--font-ui)',
        }}
      >
        {prompt.title && (
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: prompt.message ? 4 : 10 }}>{prompt.title}</div>
        )}
        {prompt.message && (
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10 }}>{prompt.message}</div>
        )}
        {prompt.multiline ? (
          <textarea
            ref={inputRef}
            data-testid="prompt-modal-input"
            value={value}
            placeholder={prompt.placeholder}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={onKeyDown}
            rows={4}
            style={{ ...fieldStyle, border: '1px solid var(--border-subtle)', resize: 'vertical' }}
          />
        ) : (
          <input
            ref={inputRef}
            type="text"
            data-testid="prompt-modal-input"
            value={value}
            placeholder={prompt.placeholder}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={onKeyDown}
            style={fieldStyle}
          />
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
          <button
            type="button"
            data-testid="prompt-modal-cancel"
            onClick={cancel}
            style={{ fontSize: 12, padding: '4px 12px', borderRadius: 4, border: '1px solid var(--border-subtle)', background: 'var(--surface-2)', color: 'var(--text-secondary)', cursor: 'pointer' }}
          >{prompt.cancelLabel || 'Отмена'}</button>
          <button
            type="button"
            data-testid="prompt-modal-confirm"
            onClick={confirm}
            style={{ fontSize: 12, padding: '4px 12px', borderRadius: 4, border: '1px solid var(--accent-500)', background: 'var(--accent-500)', color: 'var(--on-accent, #fff)', cursor: 'pointer', fontWeight: 500 }}
          >{prompt.confirmLabel || 'OK'}</button>
        </div>
      </div>
    </div>
  );
}
