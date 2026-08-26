import { useEffect, useRef, useState } from 'react';
import { t, tf } from '../../../i18n';
import { openBodgeFilePicker } from '../../../lib/file-system';
import { useStore } from '../../../store';
import { Icon } from '../../icons/Icon';
import {
  loadPortableBodgeContainers,
  materializeCrossProjectEntries,
} from './cross-project-bodge-import';

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[href]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function containTabFocus(event, dialog) {
  if (event.key !== 'Tab' || event.defaultPrevented || !dialog) return;
  const focusable = [...dialog.querySelectorAll(FOCUSABLE_SELECTOR)];
  if (focusable.length === 0) {
    event.preventDefault();
    dialog.focus();
    return;
  }
  const first = focusable[0];
  const last = focusable.at(-1);
  const active = document.activeElement;
  if (event.shiftKey && (active === first || !dialog.contains(active))) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
    event.preventDefault();
    first.focus();
  }
}

function hasExactReceipt(requested, committed) {
  if (!Array.isArray(requested) || !Array.isArray(committed)
    || requested.length === 0 || requested.length !== committed.length) return false;
  const requestedIds = requested.map((entry) => entry?.id);
  const committedIds = committed.map((entry) => entry?.id);
  if (requestedIds.some((id) => typeof id !== 'string' || !id)
    || committedIds.some((id) => typeof id !== 'string' || !id)) return false;
  const requestedSet = new Set(requestedIds);
  const committedSet = new Set(committedIds);
  return requestedSet.size === requestedIds.length
    && committedSet.size === committedIds.length
    && requestedSet.size === committedSet.size
    && requestedIds.every((id) => committedSet.has(id));
}

export default function CrossProjectStub({ target, onClose, onImported }) {
  const [attempt, setAttempt] = useState(0);
  const [phase, setPhase] = useState('picking');
  const [model, setModel] = useState(null);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [failureStage, setFailureStage] = useState(null);
  const dialogRef = useRef(null);
  const closeRef = useRef(null);
  const firstEntryRef = useRef(null);
  const retryRef = useRef(null);
  const mountedRef = useRef(true);
  const commitLockedRef = useRef(false);
  const pickerRequestRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const requestClose = () => {
    if (!commitLockedRef.current) onCloseRef.current?.();
  };

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    let active = true;
    let request = pickerRequestRef.current;
    if (!request || request.attempt !== attempt) {
      let pickerPromise;
      try {
        pickerPromise = Promise.resolve(openBodgeFilePicker());
      } catch (error) {
        pickerPromise = Promise.reject(error);
      }
      request = {
        attempt,
        promise: pickerPromise.then(async (pick) => (
          pick ? { model: await loadPortableBodgeContainers(pick) } : { cancelled: true }
        )),
      };
      pickerRequestRef.current = request;
    }
    request.promise
      .then((pick) => {
        if (!active || !mountedRef.current) return;
        if (pick.cancelled) {
          onCloseRef.current?.();
          return;
        }
        setModel(pick.model);
        setPhase('ready');
      })
      .catch(() => {
        if (!active || !mountedRef.current) return;
        setFailureStage('read');
        setPhase('error');
      });
    return () => { active = false; };
  }, [attempt]);

  useEffect(() => {
    if (phase === 'ready' && model?.containers.length) firstEntryRef.current?.focus();
    else if (phase === 'error') retryRef.current?.focus();
    else dialogRef.current?.focus();
  }, [phase, model]);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        if (!commitLockedRef.current) onCloseRef.current?.();
      } else if (event.key === 'Tab') {
        containTabFocus(event, dialogRef.current);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  const toggleSelected = (id) => {
    if (phase !== 'ready') return;
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const importSelected = async () => {
    if (!model || selectedIds.size === 0 || commitLockedRef.current) return;
    commitLockedRef.current = true;
    setFailureStage(null);
    setPhase('committing');
    try {
      const entries = await materializeCrossProjectEntries({
        ...model, selectedIds, target,
      });
      const committed = await useStore.getState().addLibraryEntriesBulk(entries);
      if (!hasExactReceipt(entries, committed)) {
        throw new Error('Incomplete durable cross-project receipt');
      }
      commitLockedRef.current = false;
      if (!mountedRef.current) return;
      useStore.getState().showToast(
        tf('crossProject.imported', { count: committed.length }),
        'success',
      );
      onImported?.(committed);
    } catch {
      commitLockedRef.current = false;
      if (!mountedRef.current) return;
      setFailureStage('save');
      setPhase('error');
    }
  };

  const onDialogKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      requestClose();
      return;
    }
    if (event.key === 'Tab') containTabFocus(event, dialogRef.current);
    event.stopPropagation();
  };

  const commitLocked = phase === 'committing';
  const empty = phase === 'ready' && model?.containers.length === 0;

  return (
    <div
      data-testid="cross-project-backdrop"
      data-block-global-hotkeys="true"
      onPointerDown={(event) => {
        event.stopPropagation();
        if (event.target === event.currentTarget) requestClose();
      }}
      onClick={(event) => {
        event.stopPropagation();
        if (event.target === event.currentTarget) requestClose();
      }}
      style={{
        position: 'fixed', inset: 0, zIndex: 240,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '5vh 4vw',
        background: 'color-mix(in srgb, var(--text-primary) 45%, transparent)',
      }}
    >
      <section
        ref={dialogRef}
        data-testid="cross-project-dialog"
        data-block-global-hotkeys="true"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cross-project-title"
        aria-busy={phase === 'picking' || commitLocked}
        tabIndex={-1}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={onDialogKeyDown}
        style={{
          width: 'min(620px, 100%)', maxHeight: '100%',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          background: 'var(--surface-1)', color: 'var(--text-primary)',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-md, 6px)', boxShadow: 'var(--shadow-xl)',
        }}
      >
        <header style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '14px 16px', borderBottom: '1px solid var(--border-subtle)',
          flexShrink: 0,
        }}>
          <Icon name="link" size={18} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 id="cross-project-title" style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>
              {t('crossProject.title')}
            </h2>
            <div style={{ marginTop: 2, fontSize: 10.5, color: 'var(--text-tertiary)' }}>
              {model?.sourceFileName || t('crossProject.subtitle')}
            </div>
          </div>
          <button
            ref={closeRef}
            type="button"
            data-testid="cross-project-close"
            aria-label={t('crossProject.closeAria')}
            onClick={requestClose}
            disabled={commitLocked}
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              padding: 6, background: 'transparent', color: 'var(--text-secondary)',
              border: '1px solid transparent', borderRadius: 'var(--radius-sm, 4px)',
              cursor: commitLocked ? 'not-allowed' : 'pointer', opacity: commitLocked ? 0.55 : 1,
            }}
          >
            <Icon name="close" size={15} />
          </button>
        </header>

        <div style={{
          flex: 1, minHeight: 220, overflowY: 'auto',
          padding: '10px 16px', background: 'var(--surface-base)',
        }}>
          {phase === 'picking' && (
            <div role="status" aria-live="polite" style={statusStyle}>
              <Icon name="hourglass" size={18} />
              <span>{t('crossProject.reading')}</span>
            </div>
          )}
          {phase === 'committing' && (
            <div role="status" aria-live="polite" style={statusStyle}>
              <Icon name="hourglass" size={18} />
              <span>{t('crossProject.saving')}</span>
            </div>
          )}
          {phase === 'error' && (
            <div
              data-testid="cross-project-error"
              role="alert"
              style={{
                ...statusStyle, minHeight: 180, alignItems: 'flex-start', padding: 12,
                color: 'var(--danger-fg)', background: 'var(--danger-bg)',
                border: '1px solid var(--danger-fg)', borderRadius: 'var(--radius-sm, 4px)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon name="warning" size={16} />
                <strong>{t(failureStage === 'save'
                  ? 'crossProject.error.saveTitle'
                  : 'crossProject.error.readTitle')}</strong>
              </div>
              <span style={{ fontSize: 11 }}>{t(failureStage === 'save'
                ? 'crossProject.error.saveBody'
                : 'crossProject.error.readBody')}</span>
              <button
                ref={retryRef}
                type="button"
                data-testid="cross-project-retry"
                onClick={() => {
                  if (failureStage === 'read') {
                    pickerRequestRef.current = null;
                    setModel(null);
                    setSelectedIds(new Set());
                    setFailureStage(null);
                    setPhase('picking');
                    setAttempt((value) => value + 1);
                  } else setPhase('ready');
                }}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '6px 10px', background: 'var(--surface-1)',
                  color: 'var(--text-primary)', border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-sm, 4px)', cursor: 'pointer',
                }}
              >
                <Icon name="history" size={14} />
                {t(failureStage === 'read' ? 'crossProject.chooseAgain' : 'crossProject.back')}
              </button>
            </div>
          )}
          {empty && (
            <div data-testid="cross-project-empty" style={statusStyle}>
              <Icon name="library" size={18} />
              <span>{t('crossProject.empty')}</span>
            </div>
          )}
          {phase === 'ready' && !empty && (
            <div role="list" style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {model.containers.map((container, index) => {
                const checked = selectedIds.has(container.donorId);
                return (
                  <label
                    key={container.donorId}
                    data-testid={`cross-project-entry-${container.donorId}`}
                    role="listitem"
                    style={{
                      display: 'grid', gridTemplateColumns: '20px minmax(0, 1fr) auto',
                      alignItems: 'center', gap: 8, padding: '9px 10px', cursor: 'pointer',
                      background: checked ? 'var(--accent-50)' : 'var(--surface-1)',
                      border: checked ? '1px solid var(--accent-500)' : '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-sm, 4px)',
                    }}
                  >
                    <input
                      ref={index === 0 ? firstEntryRef : null}
                      data-testid={`cross-project-select-${container.donorId}`}
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleSelected(container.donorId)}
                      style={{ margin: 0 }}
                    />
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 12, fontWeight: 600 }}>
                        {container.name}
                      </span>
                      <span style={{ display: 'block', marginTop: 2, fontSize: 10.5, color: 'var(--text-tertiary)' }}>
                        {container.topology === 'circular'
                          ? t('crossProject.circular')
                          : t('crossProject.linear')}
                      </span>
                    </span>
                    <span style={{
                      fontFamily: 'var(--font-mono)', fontSize: 10.5,
                      color: 'var(--text-secondary)', whiteSpace: 'nowrap',
                    }}>
                      {tf('crossProject.basePairs', { length: container.length })}
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        <footer style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '12px 16px', borderTop: '1px solid var(--border-subtle)',
          background: 'var(--surface-2)', flexShrink: 0,
        }}>
          <span style={{ flex: 1, color: 'var(--text-secondary)', fontSize: 11 }}>
            {tf('crossProject.selected', { count: selectedIds.size })}
          </span>
          <button
            type="button"
            onClick={requestClose}
            disabled={commitLocked}
            style={{
              padding: '6px 12px', background: 'transparent', color: 'var(--text-primary)',
              border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm, 4px)',
              cursor: commitLocked ? 'not-allowed' : 'pointer', opacity: commitLocked ? 0.55 : 1,
              fontSize: 12,
            }}
          >
            {t('crossProject.cancel')}
          </button>
          <button
            type="button"
            data-testid="cross-project-import"
            onClick={importSelected}
            disabled={selectedIds.size === 0 || phase !== 'ready'}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '6px 12px', background: 'var(--accent-500)',
              color: 'var(--accent-text)', border: 'none',
              borderRadius: 'var(--radius-sm, 4px)', fontSize: 12,
              cursor: selectedIds.size === 0 || phase !== 'ready' ? 'not-allowed' : 'pointer',
              opacity: selectedIds.size === 0 || phase !== 'ready' ? 0.55 : 1,
            }}
          >
            <Icon name="import" size={14} />
            {commitLocked ? t('crossProject.importing') : t('crossProject.import')}
          </button>
        </footer>
      </section>
    </div>
  );
}

const statusStyle = {
  minHeight: 180,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  color: 'var(--text-secondary)',
  fontSize: 12,
};
