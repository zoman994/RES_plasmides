import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../../../store';
import { STRINGS } from '../../../lib/strings';
import { ACCEPT_STRING } from '../../../file-import';
import PlasmidMiniMap from '../../PlasmidMiniMap';
import { useCatalogSources } from '../hooks/useLibrarySources';
import { applyCatalogFilter } from './length-pattern';

const S = STRINGS.importer;

/**
 * CatalogColumn — single sticky-search header + 4 sources (Этот проект /
 * Учебные / Моя библиотека / Каталог SnapGene) + drop zone footer with
 * paste textarea (M-B.2 K2; DEC-IMP-14).
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
 */
const GROUP_KEYS = ['canvas', 'demo', 'mine', 'snapgene'];

// Depth-based indent: every nesting level shifts text 12 px right.
// Capped at 5 levels so ultra-deep folders still fit the 320 px column.
const INDENT_STEP = 12;
const INDENT_BASE = 12;
const MAX_INDENT_DEPTH = 5;
// Chevron(10px) + flex gap(6px) — group/sub-group rows put their text
// 16 px past padding-left because the chevron span sits in front of it.
// Items (no chevron) need to add this offset to align UNDER the parent's
// text column instead of UNDER the parent's chevron.
const CHEVRON_GUTTER = 16;
function indentForDepth(depth) {
  const d = Math.min(MAX_INDENT_DEPTH, Math.max(0, depth));
  return INDENT_BASE + d * INDENT_STEP;
}
// Per-depth background tint — translucent accent band so deeply-nested
// content reads as «inside» its parent without relying on indent alone.
// Stops cleanly at depth 0 (no tint for top-level group rows).
function depthBackground(depth) {
  if (depth <= 0) return 'transparent';
  const d = Math.min(MAX_INDENT_DEPTH, depth);
  const pct = Math.min(8, 2.5 * d); // 2.5% per level, capped at 8%
  return `color-mix(in srgb, var(--accent-500) ${pct}%, transparent)`;
}

/** Parse a flat list of slash-separated paths into a forest.
 *  ['Vectors', 'Vectors/CRISPR', 'Promoters'] →
 *  [{name:'Vectors', path:'Vectors', children:[{name:'CRISPR', path:'Vectors/CRISPR', children:[]}]},
 *   {name:'Promoters', path:'Promoters', children:[]}] */
function buildFolderTree(paths) {
  const roots = [];
  const byPath = new Map();
  // Sort so parents always materialise before children.
  const sorted = [...paths].sort();
  for (const p of sorted) {
    if (!p) continue;
    const slash = p.lastIndexOf('/');
    const parentPath = slash >= 0 ? p.slice(0, slash) : '';
    const name = slash >= 0 ? p.slice(slash + 1) : p;
    const node = { name, path: p, children: [] };
    byPath.set(p, node);
    if (parentPath && byPath.has(parentPath)) {
      byPath.get(parentPath).children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

function readGroupState(key, fallback) {
  try {
    const v = localStorage.getItem(`pvcs-catalog-group-${key}`);
    if (v === 'open') return true;
    if (v === 'closed') return false;
  } catch { /* private mode / jsdom */ }
  return fallback;
}
function writeGroupState(key, open) {
  try { localStorage.setItem(`pvcs-catalog-group-${key}`, open ? 'open' : 'closed'); } catch { /* */ }
}
function readSet(suffix) {
  try {
    const raw = localStorage.getItem(`pvcs-catalog-set-${suffix}`);
    if (raw) return new Set(JSON.parse(raw));
  } catch { /* */ }
  return new Set();
}
function writeSet(suffix, s) {
  try { localStorage.setItem(`pvcs-catalog-set-${suffix}`, JSON.stringify([...s])); } catch { /* */ }
}

export default function CatalogColumn({
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
        <NestedSubGroup
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
        </NestedSubGroup>
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
            <GroupHeader
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
                return <EmptyHint label={S.catalogEmptyGroup} testId="catalog-mine-empty" depth={1} />;
              }
              return (
                <>
                  {renderFolderNodes(tree, 'mine', 1, itemsByPath)}
                  {topLevelItems.length > 0 && (
                    <InlineItemList
                      items={topLevelItems}
                      onSelectItem={onSelectItem}
                      depth={1}
                    />
                  )}
                </>
              );
            })()}

            <GroupHeader
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

            <GroupHeader
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

            <GroupHeader
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

/** Top-level group header. Optional `onAddChild` / `onAddFile` / `onFolderDrop`
 *  let the user create a folder, import a file, or drag-drop files directly
 *  onto the section root — replaces the visible «+ Новая папка» row that
 *  used to live at the bottom of each group. */
function GroupHeader({
  groupKey, label, count, open, onToggle,
  onAddChild, addChildTitle, addChildTestId,
  onAddFile, addFileTitle, addFileTestId,
  onFolderDrop, folderDropHint,
  onItemDrop, // internal item drag → ungroup (move out of any folder)
}) {
  const [dragOver, setDragOver] = useState(false);
  // Same enter/leave depth-counter pattern as NestedSubGroup so the row
  // highlight doesn't flicker when the cursor crosses inner buttons
  // (chevron, ＋, ⤓).
  const dragDepth = useRef(0);
  const fileDropEnabled = typeof onFolderDrop === 'function';
  const itemDropEnabled = typeof onItemDrop === 'function';
  const dropEnabled = fileDropEnabled || itemDropEnabled;
  const acceptsTypes = (e) => {
    const types = Array.from(e.dataTransfer?.types || []);
    return (fileDropEnabled && types.includes('Files'))
      || (itemDropEnabled && types.includes('application/x-bodgegene-item-id'));
  };
  return (
    <div
      className="importer-catalog-group-header"
      data-folder-drop-hover={dragOver ? 'true' : undefined}
      title={dropEnabled && dragOver ? folderDropHint : undefined}
      onDragEnter={dropEnabled ? (e) => {
        if (!acceptsTypes(e)) return;
        e.preventDefault();
        dragDepth.current += 1;
        if (dragDepth.current === 1) setDragOver(true);
      } : undefined}
      onDragOver={dropEnabled ? (e) => {
        if (!acceptsTypes(e)) return;
        e.preventDefault();
        const types = Array.from(e.dataTransfer?.types || []);
        if (e.dataTransfer) {
          e.dataTransfer.dropEffect = types.includes('application/x-bodgegene-item-id') ? 'move' : 'copy';
        }
      } : undefined}
      onDragLeave={dropEnabled ? () => {
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setDragOver(false);
      } : undefined}
      onDrop={dropEnabled ? (e) => {
        if (!acceptsTypes(e)) return;
        e.preventDefault();
        e.stopPropagation();
        dragDepth.current = 0;
        setDragOver(false);
        const types = Array.from(e.dataTransfer?.types || []);
        if (itemDropEnabled && types.includes('application/x-bodgegene-item-id')) {
          const itemId = e.dataTransfer.getData('application/x-bodgegene-item-id');
          const sourceFolder = e.dataTransfer.getData('application/x-bodgegene-source-folder') || '';
          if (itemId) onItemDrop(itemId, sourceFolder);
          return;
        }
        if (fileDropEnabled && types.includes('Files')) {
          const files = Array.from(e.dataTransfer.files || []);
          if (files.length > 0) onFolderDrop(files);
        }
      } : undefined}
      style={{
        display: 'flex', alignItems: 'stretch',
        background: dragOver
          ? 'color-mix(in srgb, var(--accent-500) 18%, transparent)'
          : 'var(--surface-2, #f5f5f4)',
        borderBottom: '0.5px solid var(--border-subtle)',
        outline: dragOver ? '1px dashed var(--accent-500)' : 'none',
        outlineOffset: '-1px',
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        data-testid={`importer-catalog-group-${groupKey}`}
        aria-expanded={open}
        // UX-008 — without an aria-label the group header just announces
        // «expanded button»; this gives the SR user the actual group
        // name + item count + state. Matches the visual sighted users see.
        aria-label={`${label}, ${count ?? 0} items, ${open ? 'expanded' : 'collapsed'}`}
        style={{
          flex: 1,
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '6px 12px',
          fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.4,
          color: 'var(--text-secondary)',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
          fontWeight: 500,
        }}
      >
        <span
          aria-hidden="true"
          className="importer-catalog-chevron"
          data-open={open ? 'true' : 'false'}
          style={{
            width: 10, color: 'var(--text-tertiary)',
            display: 'inline-block',
            transition: 'transform 140ms ease-out',
            transform: open ? 'rotate(0deg)' : 'rotate(-90deg)',
          }}
        >▾</span>
        <span style={{ flex: 1 }}>{label}</span>
        {typeof count === 'number' && (
          <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{count}</span>
        )}
      </button>
      {onAddFile && (
        <button
          type="button"
          className="importer-catalog-add-file"
          data-testid={addFileTestId}
          onClick={(e) => { e.stopPropagation(); onAddFile(); }}
          title={addFileTitle}
          aria-label={addFileTitle}
          style={{
            padding: '0 6px',
            background: 'transparent',
            border: 'none',
            color: 'var(--text-tertiary)',
            fontSize: 12, lineHeight: 1,
            cursor: 'pointer',
          }}
        >⤓</button>
      )}
      {onAddChild && (
        <button
          type="button"
          className="importer-catalog-add-child"
          data-testid={addChildTestId}
          onClick={(e) => { e.stopPropagation(); onAddChild(); }}
          title={addChildTitle}
          aria-label={addChildTitle}
          style={{
            padding: '0 10px',
            background: 'transparent',
            border: 'none',
            color: 'var(--text-tertiary)',
            fontSize: 14, lineHeight: 1,
            cursor: 'pointer',
          }}
        >＋</button>
      )}
    </div>
  );
}

/** Sub-group: nested collapsible row inside Mine (per-folder/tag) and
 *  SnapGene (per-category). `depth` (1-based) drives the indent step.
 *  Optional `onAddChild` adds a hover-revealed «＋» button on the right
 *  of the header — clicking it opens a child-folder input WITHOUT making
 *  the parent toggle. This pattern (file-manager style) keeps the visible
 *  «+ Новая папка» count down to one-per-section while still allowing
 *  folder-in-folder creation. */
function NestedSubGroup({
  testId, label, count, open, onToggle, children, depth = 1,
  onAddChild, addChildTitle, addChildTestId,
  onAddFile, addFileTitle, addFileTestId,
  onFolderDrop, folderDropHint,
  onItemDrop, // (itemId, sourceFolder) — internal drag of a library entry
  onDelete, deleteTitle, deleteTestId,
}) {
  const [dragOver, setDragOver] = useState(false);
  // dragenter/leave fire for every nested child element (chevron, label,
  // ＋ icon, ⤓ icon, …). Without depth counting, leave→child looks like
  // leave→row and the highlight flickers off. Track enter/leave depth so
  // dragOver stays true the entire time the cursor is anywhere inside the
  // row's bounding box.
  const dragDepth = useRef(0);
  const fileDropEnabled = typeof onFolderDrop === 'function';
  const itemDropEnabled = typeof onItemDrop === 'function';
  const dropEnabled = fileDropEnabled || itemDropEnabled;
  const acceptsTypes = (e) => {
    const types = Array.from(e.dataTransfer?.types || []);
    return (fileDropEnabled && types.includes('Files'))
      || (itemDropEnabled && types.includes('application/x-bodgegene-item-id'));
  };
  return (
    <>
      <div
        className="importer-catalog-nested-row"
        data-folder-drop-hover={dragOver ? 'true' : undefined}
        title={dropEnabled && dragOver ? folderDropHint : undefined}
        onDragEnter={dropEnabled ? (e) => {
          if (!acceptsTypes(e)) return;
          e.preventDefault();
          dragDepth.current += 1;
          if (dragDepth.current === 1) setDragOver(true);
        } : undefined}
        onDragOver={dropEnabled ? (e) => {
          if (!acceptsTypes(e)) return;
          e.preventDefault();
          const types = Array.from(e.dataTransfer?.types || []);
          if (e.dataTransfer) {
            e.dataTransfer.dropEffect = types.includes('application/x-bodgegene-item-id') ? 'move' : 'copy';
          }
        } : undefined}
        onDragLeave={dropEnabled ? () => {
          dragDepth.current = Math.max(0, dragDepth.current - 1);
          if (dragDepth.current === 0) setDragOver(false);
        } : undefined}
        onDrop={dropEnabled ? (e) => {
          if (!acceptsTypes(e)) return;
          e.preventDefault();
          e.stopPropagation();
          dragDepth.current = 0;
          setDragOver(false);
          const types = Array.from(e.dataTransfer?.types || []);
          if (itemDropEnabled && types.includes('application/x-bodgegene-item-id')) {
            const itemId = e.dataTransfer.getData('application/x-bodgegene-item-id');
            const sourceFolder = e.dataTransfer.getData('application/x-bodgegene-source-folder') || '';
            if (itemId) onItemDrop(itemId, sourceFolder);
            return;
          }
          if (fileDropEnabled && types.includes('Files')) {
            const files = Array.from(e.dataTransfer.files || []);
            if (files.length > 0) onFolderDrop(files);
          }
        } : undefined}
        style={{
          display: 'flex', alignItems: 'stretch',
          background: dragOver
            ? 'var(--accent-50, color-mix(in srgb, var(--accent-500) 18%, transparent))'
            : depthBackground(depth),
          outline: dragOver ? '1px dashed var(--accent-500)' : 'none',
          outlineOffset: '-1px',
        }}
      >
        <button
          type="button"
          onClick={onToggle}
          data-testid={testId}
          aria-expanded={open}
          aria-label={`${label} folder, ${count ?? 0} items, ${open ? 'expanded' : 'collapsed'}`}
          style={{
            flex: 1,
            display: 'flex', alignItems: 'center', gap: 6,
            padding: `4px 10px 4px ${indentForDepth(depth)}px`,
            fontSize: 12,
            background: 'transparent',
            border: 'none',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          <span style={{ width: 10, color: 'var(--text-tertiary)' }} aria-hidden="true">{open ? '▾' : '▸'}</span>
          <span style={{ flex: 1, textAlign: 'left' }}>{label}</span>
          {typeof count === 'number' && (
            <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{count}</span>
          )}
        </button>
        {onAddFile && (
          <button
            type="button"
            className="importer-catalog-add-file"
            data-testid={addFileTestId}
            onClick={(e) => { e.stopPropagation(); onAddFile(); }}
            title={addFileTitle}
            aria-label={addFileTitle}
            style={{
              padding: '0 6px',
              background: 'transparent',
              border: 'none',
              color: 'var(--text-tertiary)',
              fontSize: 12, lineHeight: 1,
              cursor: 'pointer',
            }}
          >⤓</button>
        )}
        {onAddChild && (
          <button
            type="button"
            className="importer-catalog-add-child"
            data-testid={addChildTestId}
            onClick={(e) => { e.stopPropagation(); onAddChild(); }}
            title={addChildTitle}
            aria-label={addChildTitle}
            style={{
              padding: '0 10px',
              background: 'transparent',
              border: 'none',
              color: 'var(--text-tertiary)',
              fontSize: 14, lineHeight: 1,
              cursor: 'pointer',
            }}
          >＋</button>
        )}
        {onDelete && (
          <button
            type="button"
            className="importer-catalog-delete"
            data-testid={deleteTestId}
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            title={deleteTitle}
            aria-label={deleteTitle}
            style={{
              padding: '0 8px',
              background: 'transparent',
              border: 'none',
              color: 'var(--text-tertiary)',
              fontSize: 12, lineHeight: 1,
              cursor: 'pointer',
            }}
          >×</button>
        )}
      </div>
      {open && children}
    </>
  );
}

/** Inline item list — renders the WHOLE list when its parent group is
 *  expanded (no «Показать все/меньше» toggle). `depth` (1-based) controls
 *  the per-item left indent via indentForDepth(). While items are still
 *  fetching we render nothing — biolog asked for «загрузка…» to be removed
 *  because it appeared at column-zero indent and looked like a misplaced
 *  section header rather than a child of the just-opened sub-group. */
// Single SnapGene category row with **debounced** hover-prefetch.
//
// Why debounce: a flat onMouseEnter prefetch caused the «first clicks
// feel ignored» symptom — when biolog ran the cursor through 30
// categories quickly, 30 fetch calls fired and each `response.json()`
// parse blocked main thread for a few hundred ms. Now we only kick
// the prefetch if the cursor actually lingers ≥250 ms.
function SnapgeneCategoryRow({
  category, open, items, isLoading, onToggle, onPrefetch, onSelectItem,
}) {
  const hoverTimer = useRef(null);
  const cancelHoverPrefetch = () => {
    if (hoverTimer.current) {
      clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
  };
  const armHoverPrefetch = () => {
    if (!onPrefetch || items !== undefined) return;
    cancelHoverPrefetch();
    hoverTimer.current = setTimeout(() => {
      onPrefetch(category.slug);
      hoverTimer.current = null;
    }, 250);
  };
  useEffect(() => () => cancelHoverPrefetch(), []);

  return (
    <div onMouseEnter={armHoverPrefetch} onMouseLeave={cancelHoverPrefetch} onFocus={armHoverPrefetch}>
      <NestedSubGroup
        testId={`importer-catalog-snapgene-${category.slug}`}
        label={category.name}
        count={category.count}
        open={open}
        onToggle={onToggle}
        depth={1}
      >
        <InlineItemList
          items={items || []}
          loading={isLoading}
          emptyLabel={S.catalogEmptyGroup}
          loadingTestId={`catalog-snapgene-loading-${category.slug}`}
          onSelectItem={onSelectItem}
          depth={2}
        />
      </NestedSubGroup>
    </div>
  );
}

function InlineItemList({
  items, loading, emptyLabel, emptyTestId,
  loadingTestId, // eslint-disable-line no-unused-vars -- legacy callers still pass it
  onSelectItem, depth = 1,
  onDeleteItem, // optional — only Mine entries get «×» delete handler
  draggableItems = false, // Mine only — items can be dragged to other folders
  sourceFolder = '',     // path of the parent folder these items live in
}) {
  // Reverted 2026-05-06 — earlier in this session I tried surfacing 4
  // pulsing skeleton rows during loading as «click-ack feedback». User
  // pushed back («зачем ты сделал визуализацию загрузки?»): the
  // skeletons look like fake/empty rows rather than a load signal,
  // and they show longer than the actual fetch (so they read as «the
  // app is broken» more than «items are coming»). Going back to a
  // silent null while loading.
  if (loading) return null;
  if (!items || items.length === 0) {
    return emptyLabel
      ? <EmptyHint label={emptyLabel} testId={emptyTestId} depth={depth} />
      : null;
  }
  return (
    <>
      {items.map((it) => (
        <ItemRow
          key={it.id || `${it._slug || it._source}:${it.name}`}
          item={it}
          onClick={() => onSelectItem?.(it)}
          depth={depth}
          onDelete={onDeleteItem ? () => onDeleteItem(it) : null}
          deleteTitle={onDeleteItem ? S.catalogDeleteContainer(it.name || it.id) : undefined}
          draggable={draggableItems}
          sourceFolder={sourceFolder}
        />
      ))}
    </>
  );
}

/** Individual item row inside a (possibly nested) collapsible group.
 *  Visual rules — items must NOT look like section headers:
 *    - lighter weight + secondary text colour
 *    - deeper indent than its parent group/sub-group header (one INDENT_STEP)
 *    - no inter-row dividers; hover bg signals interactivity.
 *  `depth` is 1-based — 1 = direct child of a top-level group, 2 = inside a
 *  nested sub-group, …, capped at MAX_INDENT_DEPTH.
 *  Optional `onDelete` shows a hover-revealed «×» on the right (used for
 *  Mine entries only — catalog items from Demo/SnapGene are read-only). */
const ItemRow = memo(function ItemRow({ item, onClick, depth = 1, onDelete, deleteTitle, draggable = false, sourceFolder = '' }) {
  // Pad: when there's a drag handle on the left, the click button starts a
  // bit deeper so handle + content don't overlap. Without handle the row
  // pads from indentForDepth + CHEVRON_GUTTER as before.
  const HANDLE_W = 14;
  const dragEnabled = draggable && !!item.id;
  const padLeft = indentForDepth(depth) + CHEVRON_GUTTER + (dragEnabled ? HANDLE_W : 0);
  const length = item.length || item.sequence?.length || 0;
  return (
    <div
      className="importer-catalog-item-row"
      style={{
        '--depth-bg': depthBackground(depth),
        display: 'flex', alignItems: 'stretch',
        position: 'relative',
        // Per-row scroll perf: each ItemRow carries an SVG mini-map +
        // labels + buttons; with ~700 SnapGene catalog entries open
        // simultaneously, the cumulative paint cost causes scroll
        // micro-jitter (биолог 03.05.2026 evening: «как ускорить
        // скролл левой панели в библиотеке, там тоже подлагивает,
        // хочу плавность»). `content-visibility: auto` lets the
        // browser skip layout + paint of off-screen rows entirely;
        // `contain: paint` localises the paint area for visible
        // ones; `contain-intrinsic-size: auto 28px` keeps scroll
        // height accurate before realisation.
        contentVisibility: 'auto',
        containIntrinsicSize: 'auto 28px',
        contain: 'paint',
      }}
    >
      {dragEnabled && (
        // Dedicated drag handle — Chrome/Vivaldi often refuse to start
        // an HTML5 drag from inside a <button> (mousedown gets captured
        // for the click). A separate draggable element with grip icon
        // gives biolog a clear «hold here to move» affordance.
        <span
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData('application/x-bodgegene-item-id', item.id);
            e.dataTransfer.setData('application/x-bodgegene-source-folder', sourceFolder || '');
            e.dataTransfer.effectAllowed = 'move';
          }}
          className="importer-catalog-drag-handle"
          data-testid={`importer-catalog-drag-${item.id}`}
          aria-label={S.catalogDragHandleAria}
          title={S.catalogDragHandleAria}
          style={{
            position: 'absolute',
            left: indentForDepth(depth) + CHEVRON_GUTTER - 2,
            top: 0, bottom: 0,
            width: HANDLE_W,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--text-tertiary)',
            cursor: 'grab',
            userSelect: 'none',
            fontSize: 10, lineHeight: 1,
          }}
        >⋮⋮</span>
      )}
      <button
        type="button"
        data-testid={`importer-catalog-item-${item.id || item.name}`}
        onClick={onClick}
        className="importer-catalog-item"
        // UX-008 — screen reader friendliness. Without an aria-label the
        // catalog button just announces «button» — useless when there
        // are 700+ rows in the SnapGene tree. The label assembles the
        // visible text bits the sighted user reads off the row.
        aria-label={`${item.name || 'unnamed'}, ${length} bp, ${item.topology || 'circular'}`}
        style={{
          flex: 1,
          display: 'flex', alignItems: 'center', gap: 8,
          padding: `3px 10px 3px ${padLeft}px`,
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <PlasmidMiniMap
          length={length}
          topology={item.topology || 'circular'}
          annotations={item.annotations || []}
          size={20}
          mode="inline"
        />
        <span style={{
          flex: 1, fontSize: 11.5, fontWeight: 400,
          color: 'var(--text-secondary)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {item.name}
        </span>
        <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
          {length.toLocaleString()}
        </span>
      </button>
      {onDelete && (
        <button
          type="button"
          className="importer-catalog-delete"
          data-testid={`importer-catalog-delete-item-${item.id || item.name}`}
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          title={deleteTitle}
          aria-label={deleteTitle}
          style={{
            padding: '0 8px',
            background: 'transparent',
            border: 'none',
            color: 'var(--text-tertiary)',
            fontSize: 12, lineHeight: 1,
            cursor: 'pointer',
          }}
        >×</button>
      )}
    </div>
  );
}, (prev, next) => (
  // Skip re-render for unchanged catalog items — onClick / onDelete arrows
  // are recreated each parent render but the item object + flags don't
  // shift unless the underlying entry changes. Big perf win for 400-item
  // SnapGene categories where parent state churn (drag highlights, hover
  // bridges) used to bubble through every row.
  prev.item === next.item
  && prev.depth === next.depth
  && prev.draggable === next.draggable
  && prev.sourceFolder === next.sourceFolder
  && (prev.onDelete == null) === (next.onDelete == null)
  && prev.deleteTitle === next.deleteTitle
));

function CatalogCard({ item, onClick }) {
  const length = item.length || item.sequence?.length || 0;
  return (
    <button
      type="button"
      data-testid={`importer-catalog-card-${item.id || item.name}`}
      onClick={onClick}
      style={{
        width: '100%',
        display: 'flex', alignItems: 'flex-start', gap: 8,
        padding: '6px 8px', marginBottom: 4,
        background: 'var(--surface-1)',
        border: '0.5px solid var(--border-subtle)',
        borderRadius: 'var(--radius-md)',
        cursor: 'pointer',
        textAlign: 'left',
      }}
    >
      <PlasmidMiniMap
        length={length}
        topology={item.topology || 'circular'}
        annotations={item.annotations || []}
        size={40}
        mode="inline"
        name={item.name}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {item.name}
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {(item.description || '').replace(/<[^>]*>/g, '').trim() || item._badge}
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-tertiary)', display: 'flex', gap: 8, marginTop: 2 }}>
          <span style={{ fontFamily: 'var(--font-mono)' }}>{length.toLocaleString()} bp</span>
          {item._badge && (
            <span style={{ padding: '0 6px', borderRadius: 'var(--radius-sm)', background: 'var(--surface-2)' }}>{item._badge}</span>
          )}
        </div>
      </div>
    </button>
  );
}

function EmptyHint({ label, testId, depth = 0 }) {
  // Match ItemRow's CHEVRON_GUTTER offset when used inside a list, so the
  // hint sits under the parent's text column rather than its chevron.
  const padLeft = depth > 0 ? indentForDepth(depth) + CHEVRON_GUTTER : indentForDepth(depth);
  return (
    <div
      data-testid={testId}
      style={{
        padding: `4px 10px 4px ${padLeft}px`,
        background: depthBackground(depth),
        fontSize: 11, color: 'var(--text-tertiary)', fontStyle: 'italic',
      }}
    >{label}</div>
  );
}

const newFolderInputStyle = {
  width: 'calc(100% - 24px)',
  margin: '4px 10px 4px 24px',
  padding: '3px 8px',
  fontSize: 12,
  color: 'var(--text-primary)',
  background: 'var(--surface-1)',
  border: '0.5px solid var(--accent-500)',
  borderRadius: 'var(--radius-md)',
  outline: 'none',
};

export const __test__ = { GROUP_KEYS };
