import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../../../store';
import { STRINGS } from '../../../lib/strings';
import { ACCEPT_STRING } from '../../../file-import';
import { useCatalogSources } from '../hooks/useLibrarySources';
import { applyCatalogFilter } from '../lib/length-pattern';
import {
  GROUP_KEYS,
  MAX_INDENT_DEPTH,
  indentForDepth,
  buildFolderTree,
  readGroupState, writeGroupState,
  readSet, writeSet,
} from './library-folder-tree';
import { LibraryGroupHeader } from './LibraryGroupHeader';
import { LibraryNestedSubGroup, InlineItemList, SnapgeneCategoryRow } from './LibraryNestedSubGroup';
import { LibraryItemRow, CatalogCard, EmptyHint, newFolderInputStyle } from './LibraryItemRow';
import OnboardingNudge from '../onboarding/OnboardingNudge';

const S = STRINGS.importer;

/**
 * LibraryTree — single sticky-search header + 4 sources (Этот проект /
 * Учебные / Моя библиотека / Каталог SnapGene) + drop zone footer with
 * paste textarea (M-B.2 K2; DEC-IMP-14). Decomposed in M-X.5 K3 from
 * the 64 KB CatalogColumn.jsx into:
 *   • this file (orchestration + sticky search + flat-search overlay
 *     + Mine folder rendering + DropZone footer);
 *   • LibraryGroupHeader / LibraryNestedSubGroup / SnapgeneCategoryRow
 *     / InlineItemList / LibraryItemRow / CatalogCard / EmptyHint;
 *   • library-folder-tree.js helpers.
 *
 * Two viewing modes:
 *   - tree mode (default): collapsible group headers with persistent state
 *     in localStorage (`pvcs-catalog-group-{key}`). Click an inner node →
 *     replace mode renders matching items as cards.
 *   - flat search mode (catalogQuery non-empty): text + length-pattern
 *     filter overlays the entire pool (this project + demo + mine + every
 *     loaded SnapGene plasmid).
 *
 * Item click: catalog item → onSelectItem(item) (single-mode auto replace,
 * multi-mode replace-batch confirm at parent index.jsx). Drop file →
 * onFiles(files). Paste textarea Ctrl+Enter → onPasteText(text).
 *
 * The default export keeps the legacy `CatalogColumn` symbol for
 * backward-compatible callers while file-system-level the file is
 * `LibraryTree.jsx` (to be the canonical name in M-X.5 Этап 2 once
 * Library/index.jsx switches to the new symbol).
 */

export default function LibraryTree({
  query = '',
  onQueryChange,
  activeSource,
  onActiveSourceChange,
  onSelectItem,
  onFiles,
  onPasteText,
  busy = false,
  // Optional `{ [libraryEntryId]: annotations[] }` map. When the
  // user is editing a library-sourced parsed item in the inspector,
  // this carries the LIVE editedAnnotations so the catalog mini-map
  // icon stays in sync without persisting to the source library
  // entry on every keystroke (the explicit «To library» click is
  // still the only way to update the saved entry).
  liveAnnotationsByLibId,
  // M-X.5 K8 — Quick-add icon (DEC-LIB-QUICKADD-01). When provided
  // (Library/index.jsx passes a callback only when there is an active
  // project), Mine items render a hover-revealed `➤` button that
  // fires `onQuickAdd(item)` to drop the entry into the current
  // project's containerIds + close the Library workspace.
  onQuickAdd,
  quickAddTitle,
}) {
  const projectName = useStore((s) => {
    const p = s.currentProjectId ? s.projects[s.currentProjectId] : null;
    return p?.name || '';
  });
  const sources = useCatalogSources();

  // Apply live-edit overrides (passed from Importer/index.jsx) to
  // the library-sourced item lists. The override flips ONLY the
  // matched item's reference, so ItemRow's `prev.item === next.item`
  // memo gate still bails for the other 99 % of rows.
  const hasLive = !!liveAnnotationsByLibId
    && Object.keys(liveAnnotationsByLibId).length > 0;
  const overrideAnns = (it) => {
    if (!hasLive || !it) return it;
    const live = liveAnnotationsByLibId[it.id];
    return live ? { ...it, annotations: live } : it;
  };
  const liveMine = useMemo(
    () => (hasLive ? sources.mine.map(overrideAnns) : sources.mine),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sources.mine, liveAnnotationsByLibId, hasLive],
  );
  const liveThisProject = useMemo(
    () => (hasLive ? sources.thisProject.map(overrideAnns) : sources.thisProject),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sources.thisProject, liveAnnotationsByLibId, hasLive],
  );
  const liveMineGroups = useMemo(() => {
    if (!hasLive) return sources.mineGroups;
    return sources.mineGroups.map((g) => ({
      ...g,
      items: g.items.map(overrideAnns),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sources.mineGroups, liveAnnotationsByLibId, hasLive]);

  const fileInputRef = useRef(null);
  // Shared file picker for per-folder imports — `pendingFolderTag` carries
  // the target folder's path so the onChange handler can forward it to
  // onFiles({targetFolderPath}). Avoids a separate <input> per folder.
  const folderFileInputRef = useRef(null);
  const pendingFolderTag = useRef(null);
  const [pasteDraft, setPasteDraft] = useState('');
  const [hover, setHover] = useState(false);
  const [openCanvas, setOpenCanvas] = useState(() => readGroupState('canvas', true));
  const [openDemo, setOpenDemo] = useState(() => readGroupState('demo', true));
  const [openMine, setOpenMine] = useState(() => readGroupState('mine', true));
  const [openSnap, setOpenSnap] = useState(() => readGroupState('snapgene', false));
  // Nested inline-expansion state. Persisted so the user's last-opened
  // SnapGene categories / Mine tag groups stay open across navigation.
  const [openTags, setOpenTags] = useState(() => readSet('tags'));
  const [openCats, setOpenCats] = useState(() => readSet('cats'));

  // User-defined folders, scoped per top-level group. Persisted in
  // localStorage as `{canvas: [...], demo: [...], mine: [...], snapgene: [...]}`.
  // For Mine they merge with the auto-tag groups (any library entry whose
  // tags include a folder name lands inside it); for the other sections
  // folders sit alongside items as empty containers until drag-drop lands.
  // Folder-in-folder creation is intentionally NOT supported yet.
  const [userFoldersByGroup, setUserFoldersByGroup] = useState(() => {
    const empty = { canvas: [], demo: [], mine: [], snapgene: [] };
    try {
      const raw = localStorage.getItem('pvcs-catalog-user-folders-by-group');
      if (raw) {
        const parsed = JSON.parse(raw);
        return { ...empty, ...parsed };
      }
      // Migrate legacy single-array key (folders used to live only in Mine).
      const legacy = localStorage.getItem('pvcs-catalog-user-folders');
      if (legacy) {
        const arr = JSON.parse(legacy);
        if (Array.isArray(arr)) return { ...empty, mine: arr };
      }
    } catch { /* */ }
    return empty;
  });

  const toggleTag = useCallback((tag) => {
    setOpenTags((s) => {
      const next = new Set(s);
      next.has(tag) ? next.delete(tag) : next.add(tag);
      writeSet('tags', next);
      return next;
    });
  }, []);

  // Inline folder-create state. `folderDraftKey` is `${groupKey}|${parentPath}`
  // — empty parentPath means «top of this group», non-empty means «inside an
  // existing folder». `folderDraft` is the typed value. Only one input is
  // open at a time across the whole column.
  const [folderDraftKey, setFolderDraftKey] = useState(null);
  const [folderDraft, setFolderDraft] = useState('');

  const startNewFolder = useCallback((groupKey, parentPath = '') => {
    if (groupKey === 'canvas') { setOpenCanvas(true); writeGroupState('canvas', true); }
    if (groupKey === 'demo') { setOpenDemo(true); writeGroupState('demo', true); }
    if (groupKey === 'mine') { setOpenMine(true); writeGroupState('mine', true); }
    if (groupKey === 'snapgene') { setOpenSnap(true); writeGroupState('snapgene', true); }
    // If we're creating inside an existing folder, ensure the parent stays open.
    if (parentPath) {
      setOpenTags((s) => {
        const n = new Set(s);
        n.add(parentPath);
        writeSet('tags', n);
        return n;
      });
    }
    setFolderDraftKey(`${groupKey}|${parentPath}`);
    setFolderDraft('');
  }, []);
  const commitNewFolder = useCallback(() => {
    setFolderDraftKey((currentKey) => {
      if (!currentKey) return null;
      const sep = currentKey.indexOf('|');
      const groupKey = sep >= 0 ? currentKey.slice(0, sep) : currentKey;
      const parentPath = sep >= 0 ? currentKey.slice(sep + 1) : '';
      const name = folderDraft.trim();
      if (!name || name.includes('/')) return null;
      const fullPath = parentPath ? `${parentPath}/${name}` : name;
      setUserFoldersByGroup((prev) => {
        const list = prev[groupKey] || [];
        if (list.includes(fullPath)) return prev;
        const next = { ...prev, [groupKey]: [...list, fullPath] };
        try { localStorage.setItem('pvcs-catalog-user-folders-by-group', JSON.stringify(next)); } catch { /* */ }
        return next;
      });
      // Auto-open the brand-new folder so its empty state is visible.
      setOpenTags((s) => {
        const n = new Set(s);
        n.add(fullPath);
        writeSet('tags', n);
        return n;
      });
      setFolderDraft('');
      return null;
    });
  }, [folderDraft]);
  const cancelNewFolder = useCallback(() => {
    setFolderDraftKey(null);
    setFolderDraft('');
  }, []);

  const toggleCat = useCallback((slug) => {
    setOpenCats((s) => {
      const next = new Set(s);
      if (next.has(slug)) {
        next.delete(slug);
      } else {
        next.add(slug);
        // Lazy-load this SnapGene category on first open.
        sources.loadSnapgeneCategory(slug);
      }
      writeSet('cats', next);
      return next;
    });
  }, [sources]);

  const flatActive = !!query.trim();

  // Touch SnapGene flat cache lazily on first non-empty query. Done in
  // an effect (not the render body) so React 19 strict-mode + concurrent
  // rendering can't trip over a state mutation observed mid-render.
  useEffect(() => {
    if (flatActive) sources.ensureSnapgeneFlat();
  }, [flatActive, sources]);

  const onToggleSnap = useCallback(() => {
    setOpenSnap((v) => {
      const next = !v;
      writeGroupState('snapgene', next);
      return next;
    });
  }, []);

  const onPick = useCallback((e) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0 && onFiles) onFiles(files);
    e.target.value = '';
  }, [onFiles]);

  const triggerFolderImport = useCallback((folderPath) => {
    pendingFolderTag.current = folderPath;
    folderFileInputRef.current?.click();
  }, []);
  const onFolderImportPick = useCallback((e) => {
    const files = Array.from(e.target.files || []);
    const tag = pendingFolderTag.current;
    if (files.length > 0 && onFiles) {
      onFiles(files, tag ? { targetFolderPath: tag } : undefined);
    }
    pendingFolderTag.current = null;
    e.target.value = '';
  }, [onFiles]);
  const onFolderDropFiles = useCallback((folderPath, files) => {
    if (files.length > 0 && onFiles) {
      onFiles(files, { targetFolderPath: folderPath });
    }
  }, [onFiles]);

  // Folder deletion: removes the folder + any sub-folders from
  // userFoldersByGroup, AND untags any library entries currently tagged with
  // those paths (the items themselves stay in Library — only their tag is
  // dropped). Containers must be deleted separately (см. deleteContainer)
  // because they may be referenced by projects.
  const deleteFolder = useCallback((groupKey, folderPath) => {
    if (!folderPath) return;
    const prefix = `${folderPath}/`;
    let affectedCount = 0;
    if (groupKey === 'mine') {
      affectedCount = sources.mine.filter((it) => {
        const p = typeof it._folderPath === 'string' ? it._folderPath : '';
        return p === folderPath || p.startsWith(prefix);
      }).length;
    }
    // eslint-disable-next-line no-alert
    if (typeof window !== 'undefined' && !window.confirm(
      S.catalogDeleteFolderConfirm(folderPath, affectedCount),
    )) return;
    setUserFoldersByGroup((prev) => {
      const list = prev[groupKey] || [];
      const next = {
        ...prev,
        [groupKey]: list.filter((p) => p !== folderPath && !p.startsWith(prefix)),
      };
      try { localStorage.setItem('pvcs-catalog-user-folders-by-group', JSON.stringify(next)); } catch { /* */ }
      return next;
    });
    // Move affected entries up to the top of «Mine» (folderPath = '')
    // so they don't disappear with the deleted folder.
    if (groupKey === 'mine' && affectedCount > 0) {
      const updatePath = useStore.getState().updateLibraryEntryFolderPath;
      if (typeof updatePath === 'function') {
        for (const it of sources.mine) {
          const p = typeof it._folderPath === 'string' ? it._folderPath : '';
          if (p === folderPath || p.startsWith(prefix)) {
            updatePath(it.id, '').catch(() => { /* */ });
          }
        }
      }
    }
    setOpenTags((s) => {
      const n = new Set([...s].filter((p) => p !== folderPath && !p.startsWith(prefix)));
      writeSet('tags', n);
      return n;
    });
  }, [sources.mine]);

  // Internal drag: dragging a library entry between folders writes the
  // entry's `folderPath` field — tags stay untouched. Both source and
  // target are slash-paths ('' = top of Mine).
  const moveItemToFolder = useCallback((itemId, sourceFolder, targetFolder) => {
    if (!itemId) return;
    if (sourceFolder === targetFolder) return;
    const store = useStore.getState();
    const entry = store.libraryEntries?.[itemId];
    if (!entry) return;
    const realTarget = targetFolder === '__untagged__' ? '' : targetFolder;
    if (typeof store.updateLibraryEntryFolderPath === 'function') {
      store.updateLibraryEntryFolderPath(itemId, realTarget).catch(() => { /* */ });
    }
  }, []);

  // Container deletion: only valid for Mine items (other groups are read-only).
  // Routes through the existing soft-delete: mark + commit. Confirm dialog
  // warns biolog that containers may be referenced by projects.
  const deleteContainer = useCallback((item) => {
    if (!item || !item.id) return;
    // eslint-disable-next-line no-alert
    if (typeof window !== 'undefined' && !window.confirm(
      S.catalogDeleteContainerConfirm(item.name || item.id),
    )) return;
    const state = useStore.getState();
    if (typeof state.markLibraryEntryPendingDelete === 'function') {
      state.markLibraryEntryPendingDelete(item.id);
    }
    if (typeof state.commitLibraryEntryPendingDelete === 'function') {
      state.commitLibraryEntryPendingDelete(item.id).catch(() => { /* */ });
    }
  }, []);

  const onDrop = useCallback((e) => {
    if (!Array.from(e.dataTransfer?.types || []).includes('Files')) return;
    e.preventDefault();
    setHover(false);
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length > 0 && onFiles) onFiles(files);
  }, [onFiles]);

  const submitPaste = useCallback(() => {
    const text = pasteDraft.trim();
    if (!text || !onPasteText) return;
    onPasteText(text);
    setPasteDraft('');
  }, [pasteDraft, onPasteText]);

  // Flat search pool — every loaded item across all sources.
  //
  // Performance: SnapGene's catalog has ~2800 plasmids. The previous
  // fallback `Object.values(snapgeneCategoryItems).flat()` allocated a
  // fresh 2800-element array on every render where `snapgeneCategoryItems`
  // changed reference (which happens whenever any category lazy-loads).
  // Combined with the `liveMine` / `liveThisProject` deps, every keystroke
  // in the search box rebuilt the whole pool from scratch.
  //
  // Now: `ensureSnapgeneFlat()` is fired in an effect on first non-empty
  // query, so `sources.snapgeneFlat` becomes the canonical pool reference
  // shortly after the user starts typing. Before it's ready we fall back
  // to `categoryItems` ONCE per render, but only depend on the keys-set
  // identity rather than the object reference itself, so partial loads
  // don't trash the memo. `liveMine` / `liveThisProject` references stay
  // stable across keystrokes (the parent useMemo's deps don't include
  // `query`).
  const flatPool = useMemo(() => {
    if (!flatActive) return [];
    const snapgene = sources.snapgeneFlat
      || (sources.snapgeneCategoryItems
        ? Object.values(sources.snapgeneCategoryItems).flat()
        : []);
    const out = new Array(liveThisProject.length + sources.demo.length + liveMine.length + snapgene.length);
    let i = 0;
    for (const x of liveThisProject) out[i++] = x;
    for (const x of sources.demo) out[i++] = x;
    for (const x of liveMine) out[i++] = x;
    for (const x of snapgene) out[i++] = x;
    return out;
  }, [flatActive, liveThisProject, sources.demo, liveMine, sources.snapgeneFlat, sources.snapgeneCategoryItems]);
  const flatResults = useMemo(
    () => flatActive ? applyCatalogFilter(flatPool, query) : [],
    [flatActive, flatPool, query],
  );

  // Drill-down mode (back button + replaced view) is gone — every group is
  // now an inline-collapsible dropdown. activeSource stays in the props
  // signature for backward compat, but the UI no longer reads it.

  // Recursive folder renderer. `itemsByPath` maps a folder's full path to
  // the items belonging to it (only Mine populates this — by tag match).
  // Sub-folders deeper than MAX_INDENT_DEPTH won't get their own «+ Новая
  // папка» row but can still display existing children.
  const renderFolderNodes = useCallback((nodes, groupKey, depth, itemsByPath) => (
    nodes.map((node) => {
      const folderItems = itemsByPath?.get(node.path) || [];
      const open = openTags.has(node.path);
      const childDepth = Math.min(MAX_INDENT_DEPTH, depth + 1);
      const isAtMaxDepth = depth >= MAX_INDENT_DEPTH;
      const displayLabel = node.name === '__untagged__' ? S.catalogUntaggedTag : node.name;
      const childDraftKey = `${groupKey}|${node.path}`;
      const isCreatingChild = folderDraftKey === childDraftKey;
      // Folder/file creation + drag-drop + tag-based moves are ONLY meaningful
      // for the user's own Library (Mine). Demo / SnapGene / Canvas are
      // read-only or driven by separate flows — biolog asked: «запрети
      // создавать папки и файлы внутри снапген демо и прочих кроме
      // билиотеки». __untagged__ is a virtual bucket inside Mine — no
      // sub-folder creation, no delete, no rename.
      const isMine = groupKey === 'mine';
      const isUntagged = node.name === '__untagged__';
      const allowCreate = isMine && !isUntagged && !isAtMaxDepth;
      const allowImport = isMine && !isUntagged;
      const allowDelete = isMine && !isUntagged;
      return (
        <LibraryNestedSubGroup
          key={node.path}
          testId={`importer-catalog-${groupKey}-folder-${node.path}`}
          label={displayLabel}
          count={folderItems.length || node.children.length || 0}
          open={open}
          onToggle={() => toggleTag(node.path)}
          depth={depth}
          onAddChild={allowCreate ? () => startNewFolder(groupKey, node.path) : null}
          addChildTitle={S.catalogNewFolder}
          addChildTestId={`importer-catalog-add-child-${groupKey}-${node.path}`}
          onAddFile={allowImport ? () => triggerFolderImport(node.path) : null}
          addFileTitle={S.catalogAddFileToFolder(displayLabel)}
          addFileTestId={`importer-catalog-add-file-${groupKey}-${node.path}`}
          onFolderDrop={allowImport ? (files) => onFolderDropFiles(node.path, files) : null}
          onItemDrop={isMine ? (itemId, sourceFolder) => moveItemToFolder(itemId, sourceFolder, node.path) : null}
          folderDropHint={S.catalogFolderDropHint(displayLabel)}
          onDelete={allowDelete ? () => deleteFolder(groupKey, node.path) : null}
          deleteTitle={S.catalogDeleteFolder(displayLabel)}
          deleteTestId={`importer-catalog-delete-folder-${groupKey}-${node.path}`}
        >
          {renderFolderNodes(node.children, groupKey, childDepth, itemsByPath)}
          {folderItems.length > 0 && (
            <InlineItemList
              items={folderItems}
              onSelectItem={onSelectItem}
              depth={childDepth}
              onDeleteItem={groupKey === 'mine' ? deleteContainer : null}
              draggableItems={groupKey === 'mine'}
              sourceFolder={node.path}
              onQuickAdd={groupKey === 'mine' ? onQuickAdd : undefined}
              quickAddTitle={quickAddTitle}
            />
          )}
          {/* Inline input for «новая папка внутри папки» — appears only when
              biolog clicked the hover-revealed «＋» on this folder header. */}
          {isCreatingChild && (
            <input
              type="text"
              autoFocus
              data-testid={`importer-catalog-new-folder-input-${groupKey}-${node.path}`}
              placeholder={S.catalogNewFolderPrompt}
              value={folderDraft}
              onChange={(e) => setFolderDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); commitNewFolder(); }
                else if (e.key === 'Escape') { e.preventDefault(); cancelNewFolder(); }
              }}
              onBlur={commitNewFolder}
              style={{
                ...newFolderInputStyle,
                marginLeft: indentForDepth(childDepth),
                width: `calc(100% - ${indentForDepth(childDepth) + 10}px)`,
              }}
            />
          )}
          {/* Empty-folder «пусто» hint deliberately removed — biolog: после
              удаления папки оно появлялось лишним шумом. The folder header
              already shows count=0 (or just no number); the absence of
              children speaks for itself. */}
        </LibraryNestedSubGroup>
      );
    })
  ), [openTags, toggleTag, onSelectItem, folderDraftKey, folderDraft, startNewFolder, commitNewFolder, cancelNewFolder, triggerFolderImport, onFolderDropFiles, deleteFolder, deleteContainer, moveItemToFolder]);

  return (
    <aside
      data-testid="importer-catalog-column"
      style={{
        width: 320, flexShrink: 0,
        display: 'flex', flexDirection: 'column',
        borderRight: '0.5px solid var(--border-subtle, #e7e5e4)',
        background: 'var(--surface-1, #fff)',
        minHeight: 0,
        // overflow: hidden anchors the catalog tree's overflowY:auto inside
        // the column itself — without it the drop-zone footer + the
        // right-side Inspector / MetaColumn drift up with body scroll when
        // the tree gets long.
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '8px 10px',
          borderBottom: '0.5px solid var(--border-subtle)',
          background: 'var(--surface-1)',
          position: 'sticky', top: 0, zIndex: 1,
        }}
      >
        <input
          type="text"
          value={query}
          onChange={(e) => onQueryChange?.(e.target.value)}
          placeholder={S.catalogSearchPlaceholder}
          data-testid="importer-catalog-search"
          style={{
            width: '100%', fontSize: 12,
            padding: '6px 10px',
            border: '0.5px solid var(--border-default)',
            borderRadius: 'var(--radius-md)',
            outline: 'none',
          }}
        />
      </div>

      <div
        data-testid="importer-catalog-tree"
        style={{
          flex: 1,
          overflowY: 'auto',
          // overflow-anchor: none — disables Chromium's scroll-anchoring
          // computation (no-op for this read-only catalog tree where
          // content doesn't reflow during scroll). Pairs with
          // content-visibility on individual rows for smooth scroll.
          overflowAnchor: 'none',
        }}
      >
        {flatActive && (
          <div
            data-testid="importer-catalog-flat-banner"
            style={{
              padding: '6px 12px', fontSize: 11,
              color: 'var(--text-secondary)',
              background: 'var(--accent-50)',
              borderBottom: '0.5px solid var(--border-subtle)',
            }}
          >{S.catalogFlatFound(flatResults.length)}</div>
        )}

        {!flatActive && (
          <div data-testid="importer-catalog-tree-groups">
            {/* Order per biolog request: Моя библиотека первой, далее проекты,
                затем демо и каталог SnapGene. Each section gets its own
                folder tree (recursive — folder-in-folder up to MAX_INDENT_DEPTH)
                and «+ Новая папка» rows at every level past depth 1. */}
            <LibraryGroupHeader
              groupKey="mine"
              label={S.catalogGroupMine}
              count={sources.mine.length}
              open={openMine}
              onToggle={() => {
                setOpenMine((v) => { writeGroupState('mine', !v); return !v; });
              }}
              onAddChild={() => startNewFolder('mine', '')}
              addChildTitle={S.catalogNewFolder}
              addChildTestId="importer-catalog-add-child-mine-root"
              onAddFile={() => triggerFolderImport('')}
              addFileTitle={S.catalogAddFileToFolder(S.catalogGroupMine)}
              addFileTestId="importer-catalog-add-file-mine-root"
              onFolderDrop={(files) => onFolderDropFiles('', files)}
              onItemDrop={(itemId, sourceFolder) => moveItemToFolder(itemId, sourceFolder, '')}
              folderDropHint={S.catalogFolderDropHint(S.catalogGroupMine)}
            />
            {openMine && folderDraftKey === 'mine|' && (
              <input
                type="text"
                autoFocus
                data-testid="importer-catalog-new-folder-input-mine"
                placeholder={S.catalogNewFolderPrompt}
                value={folderDraft}
                onChange={(e) => setFolderDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); commitNewFolder(); }
                  else if (e.key === 'Escape') { e.preventDefault(); cancelNewFolder(); }
                }}
                onBlur={commitNewFolder}
                style={{ ...newFolderInputStyle, marginLeft: indentForDepth(1), width: `calc(100% - ${indentForDepth(1) + 10}px)` }}
              />
            )}
            {openMine && (() => {
              // «Mine» groups library entries by `_folderPath` (separate
              // from tags since the folder/tag decoupling, 3482400). An
              // entry with an empty folderPath sits at the TOP of «Mine»,
              // outside any folder — biolog: «такги просто атрибут который
              // мы можем использовать потом для поиска но папки с
              // названиями тагов не создавать». Sub-folder buckets feed
              // the folder tree; top-level items render directly inside
              // the Mine group via InlineItemList.
              //
              // 2026-05-06 fix: previously the `''`-keyed bucket was
              // passed to `buildFolderTree` which dropped empty strings,
              // so freshly-imported untagged entries showed a counter but
              // never rendered. Now: peel the `''` bucket off and feed
              // its items into InlineItemList; pass the rest to the tree.
              const folderGroups = liveMineGroups.filter((g) => g.tag && g.tag !== '');
              const topLevelItems = (() => {
                const empty = liveMineGroups.find((g) => g.tag === '' || g.tag === '__untagged__');
                if (empty && Array.isArray(empty.items)) return empty.items;
                // Legacy fallback: if no '' bucket but there's flat liveMine
                // (e.g. the catalog hasn't grouped yet), treat the whole
                // pool as top-level. Without this, very early renders
                // before mineGroups settles would flash empty.
                if (folderGroups.length === 0 && liveMine.length > 0) return liveMine;
                return [];
              })();
              const allPaths = new Set([
                ...(userFoldersByGroup.mine || []),
                ...folderGroups.map((g) => g.tag),
              ]);
              const tree = buildFolderTree([...allPaths]);
              const itemsByPath = new Map(folderGroups.map((g) => [g.tag, g.items]));
              if (tree.length === 0 && topLevelItems.length === 0 && folderDraftKey !== 'mine|') {
                // M-X.5 K5 — non-blocking onboarding nudge surfaces inside
                // the empty Mine group (DEC-LIB-17 ⚓). Click → category
                // picker → bulk-load demo plasmids.
                return (
                  <>
                    <OnboardingNudge />
                    <EmptyHint label={S.catalogEmptyGroup} testId="catalog-mine-empty" depth={1} />
                  </>
                );
              }
              return (
                <>
                  {renderFolderNodes(tree, 'mine', 1, itemsByPath)}
                  {topLevelItems.length > 0 && (
                    <InlineItemList
                      items={topLevelItems}
                      onSelectItem={onSelectItem}
                      depth={1}
                      onQuickAdd={onQuickAdd}
                      quickAddTitle={quickAddTitle}
                    />
                  )}
                </>
              );
            })()}

            <LibraryGroupHeader
              groupKey="canvas"
              label={S.catalogGroupCanvas(projectName)}
              count={sources.thisProject.length}
              open={openCanvas}
              onToggle={() => {
                setOpenCanvas((v) => { writeGroupState('canvas', !v); return !v; });
              }}
            />
            {openCanvas && (() => {
              const tree = buildFolderTree(userFoldersByGroup.canvas || []);
              return (
                <>
                  {renderFolderNodes(tree, 'canvas', 1, null)}
                  <InlineItemList
                    items={liveThisProject}
                    emptyLabel={tree.length === 0 ? S.catalogEmptyProject : null}
                    emptyTestId="catalog-canvas-empty"
                    onSelectItem={onSelectItem}
                    depth={1}
                  />
                </>
              );
            })()}

            <LibraryGroupHeader
              groupKey="demo"
              label={S.catalogGroupDemo}
              count={sources.demo.length}
              open={openDemo}
              onToggle={() => {
                setOpenDemo((v) => { writeGroupState('demo', !v); return !v; });
              }}
            />
            {openDemo && (() => {
              const tree = buildFolderTree(userFoldersByGroup.demo || []);
              return (
                <>
                  {renderFolderNodes(tree, 'demo', 1, null)}
                  <InlineItemList
                    items={sources.demo}
                    loading={sources.demoLoading && sources.demo.length === 0}
                    emptyLabel={S.catalogEmptyGroup}
                    emptyTestId="catalog-demo-empty"
                    loadingTestId="catalog-demo-loading"
                    onSelectItem={onSelectItem}
                    depth={1}
                  />
                </>
              );
            })()}

            <LibraryGroupHeader
              groupKey="snapgene"
              label={S.catalogGroupSnapgene}
              count={sources.snapgeneCategories.reduce((s, c) => s + (c.count || 0), 0)}
              open={openSnap}
              onToggle={onToggleSnap}
            />
            {openSnap && !sources.indexReady && (
              <EmptyHint label={S.catalogLoading} testId="catalog-snapgene-loading" />
            )}
            {openSnap && (() => {
              const tree = buildFolderTree(userFoldersByGroup.snapgene || []);
              return (
                <>
                  {renderFolderNodes(tree, 'snapgene', 1, null)}
                  {sources.snapgeneCategories.map((c) => {
                    const catOpen = openCats.has(c.slug);
                    const items = sources.snapgeneCategoryItems[c.slug];
                    const isLoading = catOpen && items === undefined;
                    return (
                      <SnapgeneCategoryRow
                        key={c.slug}
                        category={c}
                        open={catOpen}
                        items={items}
                        isLoading={isLoading}
                        onToggle={() => toggleCat(c.slug)}
                        onPrefetch={sources.prefetchSnapgeneCategory}
                        onSelectItem={onSelectItem}
                      />
                    );
                  })}
                </>
              );
            })()}
          </div>
        )}

        {flatActive && flatResults.length === 0 && (
          <EmptyHint label={S.catalogFlatEmpty} testId="catalog-flat-empty" />
        )}
        {flatActive && flatResults.length > 0 && (
          <div data-testid="importer-catalog-flat-results" style={{ padding: '6px 8px' }}>
            {flatResults.slice(0, 60).map((it) => (
              <CatalogCard key={it.id || `${it._slug || it._source}:${it.name}`} item={it} onClick={() => onSelectItem?.(it)} />
            ))}
            {flatResults.length > 60 && (
              <div style={{ fontSize: 10, color: 'var(--text-tertiary)', textAlign: 'center', padding: '4px 0' }}>
                {S.catalogFlatTruncated(flatResults.length)}
              </div>
            )}
          </div>
        )}
      </div>

      <div
        data-testid="importer-catalog-dropzone"
        data-hover={hover ? 'true' : 'false'}
        onDragEnter={(e) => {
          if (!Array.from(e.dataTransfer?.types || []).includes('Files')) return;
          e.preventDefault();
          setHover(true);
        }}
        onDragOver={(e) => {
          if (!Array.from(e.dataTransfer?.types || []).includes('Files')) return;
          e.preventDefault();
          if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
        }}
        onDragLeave={() => setHover(false)}
        onDrop={onDrop}
        style={{
          flexShrink: 0,
          borderTop: '2px dashed var(--border-default)',
          background: hover ? 'var(--accent-50)' : 'var(--surface-2)',
          padding: '10px',
        }}
      >
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          data-testid="importer-catalog-pick-files"
          style={{
            width: '100%',
            padding: '6px 8px',
            background: 'transparent',
            border: 'none',
            color: 'var(--text-secondary)',
            fontSize: 12, fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          {hover ? S.dropzoneHover : S.catalogDropzoneIdle}
        </button>
        <div style={{ fontSize: 10, color: 'var(--text-tertiary)', textAlign: 'center', marginBottom: 4 }}>
          {S.catalogDropzoneAccepts}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ACCEPT_STRING}
          onChange={onPick}
          hidden
          data-testid="importer-catalog-file-input"
        />
        {/* Shared per-folder file picker — `pendingFolderTag` ref is set by
            triggerFolderImport(folderPath), forwarded as `targetFolderPath`
            so confirm flow lands the entry directly inside that folder. */}
        <input
          ref={folderFileInputRef}
          type="file"
          multiple
          accept={ACCEPT_STRING}
          onChange={onFolderImportPick}
          hidden
          data-testid="importer-catalog-folder-file-input"
        />
        <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
          <textarea
            value={pasteDraft}
            onChange={(e) => setPasteDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                submitPaste();
              }
            }}
            placeholder={S.catalogPastePlaceholder}
            rows={2}
            data-testid="importer-catalog-paste"
            style={{
              flex: 1, fontSize: 11,
              fontFamily: 'var(--font-mono, monospace)',
              padding: '4px 6px',
              border: '0.5px solid var(--border-default)',
              borderRadius: 'var(--radius-md)',
              resize: 'none', outline: 'none',
            }}
            spellCheck={false}
          />
          <button
            type="button"
            onClick={submitPaste}
            disabled={!pasteDraft.trim()}
            data-testid="importer-catalog-paste-submit"
            style={{
              fontSize: 11,
              padding: '0 10px',
              background: 'var(--accent-500)',
              color: 'var(--surface-1)',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              cursor: pasteDraft.trim() ? 'pointer' : 'not-allowed',
              opacity: pasteDraft.trim() ? 1 : 0.4,
            }}
          >{S.catalogPasteSubmit}</button>
        </div>
        {busy && (
          <div
            data-testid="importer-catalog-busy"
            style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}
          >{S.busyParsing}</div>
        )}
      </div>
    </aside>
  );
}

// K3 test hook — keep the legacy `__test__` export so existing tests
// (`library-tree.test.jsx`) can assert on the group ordering. GROUP_KEYS
// itself now lives in `library-folder-tree.js` but the value is the same
// constant.
export const __test__ = { GROUP_KEYS };
