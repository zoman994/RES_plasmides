/**
 * PreImportModal — Sprint M-X.3 K1.
 *
 * Captures import metadata BEFORE the user lands in SingleInspector.
 * Sits between an Importer entry-point (paste / drop / catalog click)
 * and the existing inspector flow:
 *
 *   paste / drop / catalog click
 *        ↓
 *   useImporterState.pendingImport = { kind, parsedItem, … }
 *        ↓
 *   <PreImportModal /> ← (this component)
 *        ↓ Submit
 *   commitPendingImport(meta) → parsedItems[…+1]
 *        ↓
 *   SingleInspector  (or, if meta.annotateNow=true, Annotator first)
 *
 * Form fields:
 *   - Name (autofocus, defaulted from envelope.suggestedName)
 *   - Topology — Linear / Circular toggle
 *   - Folder — tree-style picker (K1: simple flat select; K2 expands
 *     to nested tree). Hidden when no folders exist.
 *   - Tags — chips via TagsEditor (existing component)
 *   - [☑] Annotate now (default ON)
 *   - (K2 only — when hasAnnotations=true) Keep existing / Discard radio
 *
 * Submit emits:
 *   onConfirm({ name, topology, tags, folderTag?, annotateNow,
 *              keepExistingAnnotations })
 *
 * The component is purely controlled: it owns FORM state internally,
 * but every kept-permanent change goes back through onConfirm. Cancel
 * (button / Escape / backdrop click) discards everything via onCancel.
 *
 * Why a separate modal vs editing in SingleInspector:
 *   1. Forces an explicit naming step (biolog «pasted» / «paste-1.txt»
 *      anti-pattern in the library).
 *   2. Locks the annotate-now decision early — saves a re-mount of
 *      the Annotator if the user wanted to skip prediction.
 *   3. Folder routing happens before any state is committed, so the
 *      catalog tree shows the new entry in the right slot immediately.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { STRINGS } from '../../lib/strings';
import TagsEditor from './inspector/TagsEditor';
import { readFolders } from './lib/folder-tree';

const S = STRINGS.importer;

export default function PreImportModal({
  pendingImport,
  onConfirm,
  onCancel,
}) {
  // FORM state — initialised from envelope on first mount + reset
  // each time the envelope changes identity. Keep these BEFORE the
  // early null-return so React's hook order stays stable.
  const [name, setName] = useState('');
  const [topology, setTopology] = useState('linear');
  const [tags, setTags] = useState([]);
  const [folderTag, setFolderTag] = useState('');
  const [newFolderInput, setNewFolderInput] = useState('');
  const [annotateNow, setAnnotateNow] = useState(true);
  const [keepExisting, setKeepExisting] = useState(true);
  // K2a — multi mode: per-file name overrides keyed by `_fileName`.
  // Single mode leaves this map empty and uses the shared `name`.
  const [perFileNames, setPerFileNames] = useState({});
  const nameInputRef = useRef(null);

  const isMulti = pendingImport?.kind === 'multi';

  // Re-seed the form whenever a fresh envelope opens. The
  // `pendingImport` reference doubles as our identity key — when it
  // flips from null → object (or object A → object B) we reset.
  const envelopeKey = pendingImport
    ? (isMulti
        ? `multi:${(pendingImport.parsedItems || []).map((p) => p._fileName).join('|')}`
        : (pendingImport.parsedItem?._fileName || 'pending'))
    : null;
  useEffect(() => {
    if (!pendingImport) return;
    if (isMulti) {
      setName('');
      const seed = {};
      for (const p of (pendingImport.parsedItems || [])) {
        seed[p._fileName] = p.name || p._fileName;
      }
      setPerFileNames(seed);
    } else {
      setName(pendingImport.suggestedName || pendingImport.parsedItem?.name || '');
      setPerFileNames({});
    }
    setTopology(pendingImport.defaultTopology || pendingImport.parsedItem?.topology || 'linear');
    setTags(Array.isArray(pendingImport.suggestedTags) ? pendingImport.suggestedTags : []);
    setFolderTag('');
    setNewFolderInput('');
    setAnnotateNow(true);
    setKeepExisting(true);
  }, [envelopeKey]); // eslint-disable-line react-hooks/exhaustive-deps -- envelopeKey IS the identity gate

  // Escape closes — same pattern as Annotator (effect bound only
  // while modal is open so other key handlers aren't fighting it).
  useEffect(() => {
    if (!pendingImport) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel?.();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pendingImport, onCancel]);

  // Autofocus name on open. Skip in multi mode (no single name input).
  useEffect(() => {
    if (pendingImport && !isMulti && nameInputRef.current) {
      nameInputRef.current.focus();
      nameInputRef.current.select();
    }
  }, [envelopeKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Read user-defined library folders once per envelope. Empty list
  // is fine — the folder card just hides.
  const folderTree = useMemo(() => {
    // K1 ships a flat select; K2 swaps in the recursive tree
    // renderer. The data comes from the same readFolders() call so
    // CatalogColumn + PreImportModal stay in sync.
    return readFolders('mine');
  }, [envelopeKey]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!pendingImport) return null;

  const handleSubmit = () => {
    const meta = {
      name: name.trim() || pendingImport.suggestedName || 'imported',
      topology,
      tags: [...tags],
      folderTag: folderTag || undefined,
      annotateNow,
      keepExistingAnnotations: keepExisting,
    };
    if (isMulti) {
      // In multi mode the shared name is meaningless; per-file names
      // own the rename. Drop the top-level `name` and pass the map.
      delete meta.name;
      meta.perFileNames = { ...perFileNames };
    }
    onConfirm?.(meta);
  };

  const handleNameKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  };

  const onAddNewFolder = () => {
    const v = newFolderInput.trim();
    if (!v) return;
    setFolderTag(v);
    setNewFolderInput('');
  };

  const seqLength = isMulti
    ? 0
    : (pendingImport.parsedItem?.length || pendingImport.parsedItem?.sequence?.length || 0);
  const hasAnns = !!pendingImport.hasAnnotations;
  const annCount = isMulti
    ? (pendingImport.parsedItems || []).reduce((s, p) => s + (p.annotations?.length || 0), 0)
    : (pendingImport.parsedItem?.annotations || []).length;
  const multiCount = isMulti ? (pendingImport.parsedItems || []).length : 0;

  return (
    <div
      data-testid="pre-import-modal-backdrop"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onCancel?.();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 220,
        background: 'rgba(0, 0, 0, 0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '6vh 4vw',
      }}
    >
      <div
        data-testid="pre-import-modal"
        onPointerDown={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 520,
          background: 'var(--surface-1, #fff)',
          color: 'var(--text-primary, #111)',
          border: '0.5px solid var(--border-default, #d4d4d4)',
          borderRadius: 'var(--radius-md, 6px)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.35)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex', alignItems: 'baseline', gap: 12,
            padding: '12px 16px',
            borderBottom: '0.5px solid var(--border-subtle, #e7e5e4)',
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 500 }}>{S.preImportTitle}</div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
            {isMulti ? `${multiCount} files` : S.preImportSubtitle(seqLength)}
          </div>
          <span style={{ flex: 1 }} />
          <SourceBadge source={pendingImport.source} parsedItem={pendingImport.parsedItem} />
        </div>

        {/* Body */}
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Name — single mode only. Multi mode shows the per-file
              list instead, since each file gets its own name. */}
          {isMulti ? (
            <Field label={`${S.preImportNameLabel} · ${multiCount}`}>
              <div
                data-testid="pre-import-multi-list"
                style={{
                  display: 'flex', flexDirection: 'column', gap: 4,
                  maxHeight: 180, overflowY: 'auto',
                  padding: '4px 6px',
                  background: 'var(--surface-2, #f5f5f4)',
                  borderRadius: 'var(--radius-sm, 3px)',
                }}
              >
                {(pendingImport.parsedItems || []).map((p) => (
                  <div
                    key={p._fileName}
                    data-testid="pre-import-multi-row"
                    style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}
                  >
                    <span style={{
                      fontFamily: 'var(--font-mono)', fontSize: 10,
                      color: 'var(--text-tertiary)',
                      flex: '0 0 auto', minWidth: 80,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>{p._fileName}</span>
                    <input
                      data-testid="pre-import-multi-name-input"
                      type="text"
                      value={perFileNames[p._fileName] || ''}
                      onChange={(e) => setPerFileNames((prev) => ({
                        ...prev, [p._fileName]: e.target.value,
                      }))}
                      placeholder={p.name || p._fileName}
                      style={{ ...inputStyle(), flex: 1 }}
                    />
                  </div>
                ))}
              </div>
            </Field>
          ) : (
            <Field label={S.preImportNameLabel}>
              <input
                ref={nameInputRef}
                data-testid="pre-import-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={handleNameKeyDown}
                placeholder={S.preImportNamePlaceholder}
                style={inputStyle()}
              />
            </Field>
          )}

          {/* Topology */}
          <Field label={S.preImportTopologyLabel}>
            <div style={{ display: 'flex', gap: 6 }}>
              <ToggleButton
                data-testid="pre-import-topology-linear"
                active={topology === 'linear'}
                onClick={() => setTopology('linear')}
              >
                <span style={{ marginRight: 6 }}>—</span>{S.preImportTopologyLinear}
              </ToggleButton>
              <ToggleButton
                data-testid="pre-import-topology-circular"
                active={topology === 'circular'}
                onClick={() => setTopology('circular')}
              >
                <span style={{ marginRight: 6 }}>◯</span>{S.preImportTopologyCircular}
              </ToggleButton>
            </div>
          </Field>

          {/* Folder picker (K1: simple select + new-folder input) */}
          <Field label={S.preImportFolderLabel}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <select
                data-testid="pre-import-folder"
                value={folderTag}
                onChange={(e) => setFolderTag(e.target.value)}
                style={{ ...inputStyle(), padding: '4px 6px' }}
              >
                <option value="">{S.preImportFolderRoot}</option>
                {folderTree.map((path) => (
                  <option key={path} value={path}>{path}</option>
                ))}
              </select>
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  data-testid="pre-import-new-folder-input"
                  type="text"
                  value={newFolderInput}
                  onChange={(e) => setNewFolderInput(e.target.value)}
                  placeholder={S.preImportNewFolderInput}
                  style={{ ...inputStyle(), flex: 1 }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); onAddNewFolder(); }
                  }}
                />
                <button
                  type="button"
                  data-testid="pre-import-new-folder-add"
                  onClick={onAddNewFolder}
                  style={{
                    fontSize: 11, padding: '4px 10px',
                    background: 'transparent',
                    color: 'var(--text-primary)',
                    border: '0.5px solid var(--border-default)',
                    borderRadius: 'var(--radius-sm, 3px)',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >{S.preImportNewFolderAdd}</button>
              </div>
            </div>
          </Field>

          {/* Tags chips */}
          <Field label={S.preImportTagsLabel}>
            <TagsEditor tags={tags} onChange={setTags} />
          </Field>

          {/* Existing annotations radio (K2 — only when relevant) */}
          {hasAnns && (
            <Field label={S.preImportExistingAnnsLabel}>
              <div
                data-testid="pre-import-existing-anns"
                style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}
              >
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="existing-anns"
                    data-testid="pre-import-existing-anns-keep"
                    checked={keepExisting}
                    onChange={() => setKeepExisting(true)}
                  />
                  {S.preImportExistingAnnsKeep(annCount)}
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="existing-anns"
                    data-testid="pre-import-existing-anns-discard"
                    checked={!keepExisting}
                    onChange={() => setKeepExisting(false)}
                  />
                  {S.preImportExistingAnnsDiscard}
                </label>
              </div>
            </Field>
          )}

          {/* Annotate-now */}
          <label
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              fontSize: 12, color: 'var(--text-primary)', cursor: 'pointer',
              padding: '6px 8px',
              background: 'var(--surface-2, #f5f5f4)',
              borderRadius: 'var(--radius-sm, 3px)',
            }}
          >
            <input
              type="checkbox"
              data-testid="pre-import-annotate-now"
              checked={annotateNow}
              onChange={(e) => setAnnotateNow(e.target.checked)}
              style={{ accentColor: 'var(--accent-500)' }}
            />
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontWeight: 500 }}>{S.preImportAnnotateNowLabel}</span>
              <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{S.preImportAnnotateNowHint}</span>
            </div>
          </label>
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex', gap: 8, justifyContent: 'flex-end',
            padding: '10px 16px',
            borderTop: '0.5px solid var(--border-subtle, #e7e5e4)',
            background: 'var(--surface-2, #f5f5f4)',
          }}
        >
          <button
            type="button"
            data-testid="pre-import-cancel"
            onClick={onCancel}
            style={{
              fontSize: 12, padding: '6px 14px',
              background: 'transparent',
              color: 'var(--text-primary)',
              border: '0.5px solid var(--border-default)',
              borderRadius: 'var(--radius-sm, 3px)',
              cursor: 'pointer',
            }}
          >{S.preImportCancel}</button>
          <button
            type="button"
            data-testid="pre-import-submit"
            onClick={handleSubmit}
            style={{
              fontSize: 12, padding: '6px 16px',
              background: 'var(--accent-500, #f97316)',
              color: '#fff',
              border: 'none',
              borderRadius: 'var(--radius-sm, 3px)',
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >{S.preImportSubmit}</button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{
        fontSize: 9, fontWeight: 600, letterSpacing: '0.06em',
        textTransform: 'uppercase', color: 'var(--text-secondary)',
      }}>{label}</span>
      {children}
    </div>
  );
}

function ToggleButton({ active, onClick, children, ...rest }) {
  return (
    <button
      type="button"
      data-active={active ? 'true' : 'false'}
      onClick={onClick}
      style={{
        flex: 1, fontSize: 12, padding: '6px 10px',
        background: active ? 'var(--accent-500, #f97316)' : 'transparent',
        color: active ? '#fff' : 'var(--text-primary)',
        border: '0.5px solid var(--border-default)',
        borderRadius: 'var(--radius-sm, 3px)',
        cursor: 'pointer',
        fontWeight: active ? 500 : 400,
      }}
      {...rest}
    >{children}</button>
  );
}

function SourceBadge({ source, parsedItem }) {
  // Catalog items skip the modal entirely (they're already named /
  // annotated). Two badges left: «Pasted» for raw text, «.EXT file»
  // (.GB / .DNA / .FASTA) for file drops.
  const ext = (parsedItem?._fileName || '').split('.').pop();
  const text = source === 'paste'
    ? S.preImportSourceBadgePaste
    : S.preImportSourceBadgeFile(ext);
  return (
    <span
      data-testid="pre-import-source-badge"
      style={{
        fontSize: 9, padding: '2px 6px',
        background: 'var(--surface-2, #f5f5f4)',
        color: 'var(--text-secondary)',
        borderRadius: 8,
        textTransform: 'uppercase', letterSpacing: '0.04em',
      }}
    >{text}</span>
  );
}

function inputStyle() {
  return {
    fontSize: 12,
    padding: '5px 8px',
    background: 'var(--surface-1, #fff)',
    color: 'var(--text-primary, #111)',
    border: '0.5px solid var(--border-default)',
    borderRadius: 'var(--radius-sm, 3px)',
    outline: 'none',
    width: '100%',
  };
}
