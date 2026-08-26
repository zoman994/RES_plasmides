import { useEffect, useRef, useState } from 'react';
import { t, tf } from '../../../i18n';
import { useStore } from '../../../store';
import { Icon } from '../../icons/Icon';
import {
  filterSnapGeneIndex,
  loadSelectedSnapGeneEntries,
  loadSnapGeneIndex,
} from './snapgene-catalog';

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[href]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function isAbortError(error) {
  return error?.name === 'AbortError';
}

function containTabFocus(event, dialog) {
  if (event.key !== 'Tab' || event.defaultPrevented || !dialog) return false;
  const focusable = [...dialog.querySelectorAll(FOCUSABLE_SELECTOR)];
  if (focusable.length === 0) {
    event.preventDefault();
    dialog.focus();
    return true;
  }

  const first = focusable[0];
  const last = focusable.at(-1);
  const activeIndex = focusable.indexOf(document.activeElement);
  if (activeIndex < 0) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
    return true;
  }
  if (event.shiftKey && activeIndex === 0) {
    event.preventDefault();
    last.focus();
    return true;
  }
  if (!event.shiftKey && activeIndex === focusable.length - 1) {
    event.preventDefault();
    first.focus();
    return true;
  }
  return false;
}

function errorCopy(stage) {
  if (stage === 'data') {
    return {
      title: 'catalog.error.dataTitle',
      body: 'catalog.error.dataBody',
    };
  }
  if (stage === 'save') {
    return {
      title: 'catalog.error.saveTitle',
      body: 'catalog.error.saveBody',
    };
  }
  return {
    title: 'catalog.error.indexTitle',
    body: 'catalog.error.indexBody',
  };
}

export default function SnapGeneCatalogPicker({ target, onClose, onImported }) {
  const [index, setIndex] = useState(null);
  const [phase, setPhase] = useState('loading-index');
  const [failureStage, setFailureStage] = useState(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const dialogRef = useRef(null);
  const closeRef = useRef(null);
  const searchRef = useRef(null);
  const retryRef = useRef(null);
  const mountedRef = useRef(true);
  const requestRef = useRef(null);
  const requestSerialRef = useRef(0);
  const commitLockedRef = useRef(false);
  const pendingEntriesRef = useRef(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestSerialRef.current += 1;
      requestRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    const onKeyDownCapture = (event) => {
      const dialog = dialogRef.current;
      if (event.key !== 'Tab'
        || event.defaultPrevented
        || !dialog
        || dialog.contains(event.target)) return;
      containTabFocus(event, dialog);
    };
    document.addEventListener('keydown', onKeyDownCapture, true);
    return () => document.removeEventListener('keydown', onKeyDownCapture, true);
  }, []);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setPhase('loading-index');
    setFailureStage(null);
    setIndex(null);
    loadSnapGeneIndex(globalThis.fetch, controller.signal)
      .then((loaded) => {
        if (!active || !mountedRef.current) return;
        setIndex(loaded);
        setPhase('ready');
      })
      .catch((error) => {
        if (!active
          || !mountedRef.current
          || controller.signal.aborted
          || isAbortError(error)) return;
        setIndex(null);
        setFailureStage('index');
        setPhase('error');
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [loadAttempt]);

  useEffect(() => {
    if (phase === 'ready') searchRef.current?.focus();
    else if (phase === 'error') retryRef.current?.focus();
    else dialogRef.current?.focus();
  }, [phase]);

  const result = filterSnapGeneIndex(index, { category, query });
  const busy = phase === 'loading-index'
    || phase === 'loading-data'
    || phase === 'committing';
  const commitLocked = phase === 'committing';

  const requestClose = () => {
    if (commitLockedRef.current) return;
    requestSerialRef.current += 1;
    requestRef.current?.abort();
    requestRef.current = null;
    onClose?.();
  };

  const toggleSelected = (id) => {
    if (phase !== 'ready') return;
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const commitEntries = async (entries, token) => {
    if (!mountedRef.current || token !== requestSerialRef.current) return;
    commitLockedRef.current = true;
    setFailureStage(null);
    setPhase('committing');

    let committed;
    try {
      committed = await useStore.getState().addLibraryEntriesBulk(entries);
      if (!Array.isArray(committed) || committed.length !== entries.length) {
        throw new Error('Incomplete durable catalog receipt');
      }
    } catch {
      commitLockedRef.current = false;
      if (!mountedRef.current || token !== requestSerialRef.current) return;
      setFailureStage('save');
      setPhase('error');
      return;
    }

    commitLockedRef.current = false;
    if (!mountedRef.current || token !== requestSerialRef.current) return;
    pendingEntriesRef.current = null;
    useStore.getState().showToast(
      tf('catalog.imported', { count: committed.length }),
      'success',
    );
    onImported?.(committed);
  };

  const importSelected = async () => {
    if (!index || selectedIds.size === 0 || phase === 'committing') return;
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    const token = requestSerialRef.current + 1;
    requestSerialRef.current = token;
    pendingEntriesRef.current = null;
    setFailureStage(null);
    setPhase('loading-data');

    try {
      const entries = await loadSelectedSnapGeneEntries({
        index,
        selectedIds,
        target,
        signal: controller.signal,
      });
      if (!mountedRef.current
        || controller.signal.aborted
        || token !== requestSerialRef.current) return;
      requestRef.current = null;
      pendingEntriesRef.current = entries;
      await commitEntries(entries, token);
    } catch (error) {
      if (!mountedRef.current
        || controller.signal.aborted
        || isAbortError(error)
        || token !== requestSerialRef.current) return;
      requestRef.current = null;
      pendingEntriesRef.current = null;
      setFailureStage('data');
      setPhase('error');
    }
  };

  const retry = () => {
    if (failureStage === 'index') {
      setLoadAttempt((value) => value + 1);
      return;
    }
    if (failureStage === 'save' && pendingEntriesRef.current) {
      const token = requestSerialRef.current + 1;
      requestSerialRef.current = token;
      commitEntries(pendingEntriesRef.current, token);
      return;
    }
    importSelected();
  };

  const onDialogKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      requestClose();
      return;
    }
    if (event.key === 'Tab') {
      containTabFocus(event, dialogRef.current);
    }
    event.stopPropagation();
  };

  const copy = errorCopy(failureStage);

  return (
    <div
      data-testid="snapgene-catalog-backdrop"
      data-block-global-hotkeys="true"
      onPointerDown={(event) => {
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
        data-testid="snapgene-catalog-picker"
        role="dialog"
        aria-modal="true"
        aria-labelledby="snapgene-catalog-title"
        aria-busy={busy}
        tabIndex={-1}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={onDialogKeyDown}
        style={{
          width: 'min(720px, 100%)', maxHeight: '100%',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          background: 'var(--surface-1)', color: 'var(--text-primary)',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-md, 6px)',
          boxShadow: 'var(--shadow-xl)',
        }}
      >
        <header style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '14px 16px', borderBottom: '1px solid var(--border-subtle)',
          flexShrink: 0,
        }}>
          <Icon name="library" size={18} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2
              id="snapgene-catalog-title"
              style={{ margin: 0, fontSize: 15, fontWeight: 600 }}
            >
              {t('catalog.title')}
            </h2>
            <div style={{ fontSize: 10.5, color: 'var(--text-tertiary)', marginTop: 2 }}>
              {t('catalog.subtitle')}
            </div>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={requestClose}
            disabled={commitLocked}
            aria-label={t('catalog.closeAria')}
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              padding: 6, background: 'transparent', color: 'var(--text-secondary)',
              border: '1px solid transparent', borderRadius: 'var(--radius-sm, 4px)',
              cursor: commitLocked ? 'not-allowed' : 'pointer',
              opacity: commitLocked ? 0.55 : 1,
            }}
          >
            <Icon name="close" size={15} />
          </button>
        </header>

        {index && (
          <div style={{
            display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(180px, .55fr)',
            gap: 8, padding: '12px 16px', borderBottom: '1px solid var(--border-subtle)',
            flexShrink: 0,
          }}>
            <label style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '0 10px', background: 'var(--surface-2)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-sm, 4px)',
            }}>
              <Icon name="search" size={14} />
              <input
                ref={searchRef}
                data-testid="snapgene-catalog-search"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                disabled={phase !== 'ready'}
                placeholder={t('catalog.searchPlaceholder')}
                aria-label={t('catalog.searchAria')}
                style={{
                  width: '100%', minWidth: 0, padding: '7px 0',
                  background: 'transparent', color: 'var(--text-primary)',
                  border: 'none', fontSize: 12,
                }}
              />
            </label>
            <label style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '0 8px', background: 'var(--surface-2)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-sm, 4px)',
            }}>
              <Icon name="filter" size={14} />
              <select
                data-testid="snapgene-catalog-category"
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                disabled={phase !== 'ready'}
                aria-label={t('catalog.categoryAria')}
                style={{
                  width: '100%', minWidth: 0, padding: '7px 0',
                  background: 'transparent', color: 'var(--text-primary)',
                  border: 'none', fontSize: 12,
                }}
              >
                <option value="all">{t('catalog.allCategories')}</option>
                {index.categories.map((item) => (
                  <option key={item.slug} value={item.slug}>
                    {item.name} ({item.count})
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        <div style={{
          flex: 1, minHeight: 220, overflowY: 'auto',
          padding: '10px 16px', background: 'var(--surface-base)',
        }}>
          {phase === 'loading-index' && (
            <div
              data-testid="snapgene-catalog-loading"
              role="status"
              aria-live="polite"
              style={statusStyle}
            >
              <Icon name="hourglass" size={18} />
              <span>{t('catalog.loading')}</span>
            </div>
          )}

          {(phase === 'loading-data' || phase === 'committing') && (
            <div role="status" aria-live="polite" style={statusStyle}>
              <Icon name="hourglass" size={18} />
              <span>{phase === 'committing' ? t('catalog.saving') : t('catalog.loadingSelected')}</span>
            </div>
          )}

          {phase === 'error' && (
            <div
              data-testid="snapgene-catalog-error"
              role="alert"
              style={{
                ...statusStyle,
                alignItems: 'flex-start',
                color: 'var(--danger-fg)',
                background: 'var(--danger-bg)',
                border: '1px solid var(--danger-fg)',
                borderRadius: 'var(--radius-sm, 4px)',
                padding: 12,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon name="warning" size={16} />
                <strong data-testid="snapgene-catalog-error-title">{t(copy.title)}</strong>
              </div>
              <span style={{ fontSize: 11 }}>{t(copy.body)}</span>
              <button
                ref={retryRef}
                type="button"
                data-testid="snapgene-catalog-retry"
                onClick={retry}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '6px 10px', background: 'var(--surface-1)',
                  color: 'var(--text-primary)', border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-sm, 4px)', cursor: 'pointer',
                }}
              >
                <Icon name="history" size={14} />
                {t('catalog.retry')}
              </button>
            </div>
          )}

          {phase === 'ready' && result.total === 0 && (
            <div data-testid="snapgene-catalog-empty" style={statusStyle}>
              <Icon name="search" size={18} />
              <span>{t('catalog.empty')}</span>
            </div>
          )}

          {phase === 'ready' && result.total > 0 && (
            <>
              <div style={{
                display: 'flex', justifyContent: 'space-between', gap: 8,
                color: 'var(--text-tertiary)', fontSize: 10.5, marginBottom: 8,
              }}>
                <span>{tf('catalog.results', {
                  shown: result.items.length,
                  total: result.total,
                })}</span>
                {result.truncated && <span>{t('catalog.refineSearch')}</span>}
              </div>
              <div role="list" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {result.items.map((plasmid) => {
                  const checked = selectedIds.has(plasmid.id);
                  return (
                    <label
                      key={plasmid.id}
                      role="listitem"
                      style={{
                        display: 'grid', gridTemplateColumns: '20px minmax(0, 1fr) auto',
                        alignItems: 'center', gap: 8, padding: '8px 10px',
                        cursor: 'pointer',
                        background: checked ? 'var(--accent-50)' : 'var(--surface-1)',
                        border: checked
                          ? '1px solid var(--accent-500)'
                          : '1px solid var(--border-subtle)',
                        borderRadius: 'var(--radius-sm, 4px)',
                      }}
                    >
                      <input
                        data-testid={`snapgene-catalog-select-${plasmid.id}`}
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleSelected(plasmid.id)}
                        style={{ margin: 0 }}
                      />
                      <span style={{ minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: 12, fontWeight: 600 }}>
                          {plasmid.name}
                        </span>
                        <span style={{
                          display: 'block', marginTop: 2, fontSize: 10.5,
                          color: 'var(--text-tertiary)', overflow: 'hidden',
                          textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {[plasmid.organism, ...(plasmid.features || []).slice(0, 3)]
                            .filter(Boolean).join(' · ')}
                        </span>
                      </span>
                      <span style={{
                        fontFamily: 'var(--font-mono)', fontSize: 10.5,
                        color: 'var(--text-secondary)', whiteSpace: 'nowrap',
                      }}>
                        {tf('catalog.basePairs', { length: plasmid.length })}
                      </span>
                    </label>
                  );
                })}
              </div>
            </>
          )}
        </div>

        <footer style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '12px 16px', borderTop: '1px solid var(--border-subtle)',
          background: 'var(--surface-2)', flexShrink: 0,
        }}>
          <span style={{ flex: 1, color: 'var(--text-secondary)', fontSize: 11 }}>
            {tf('catalog.selected', { count: selectedIds.size })}
          </span>
          <button
            type="button"
            onClick={requestClose}
            disabled={commitLocked}
            style={{
              padding: '6px 12px', background: 'transparent',
              color: 'var(--text-primary)', border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-sm, 4px)',
              cursor: commitLocked ? 'not-allowed' : 'pointer',
              opacity: commitLocked ? 0.55 : 1,
              fontSize: 12,
            }}
          >
            {t('catalog.cancel')}
          </button>
          <button
            type="button"
            data-testid="snapgene-catalog-import"
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
            {phase === 'loading-data' || phase === 'committing'
              ? t('catalog.importing')
              : t('catalog.import')}
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
