import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../../store';
import PlasmidMiniMap from '../PlasmidMiniMap';
import { getRegions } from '../../annotation-model';

/**
 * CatalogPanel — always-visible left column for ImportStartScreen.
 *
 * Replaces CatalogTree (Sprint IS-Final K3). Layout:
 *   [sticky search input]
 *   [▾ Учебные / demo]
 *   [▾ Моя библиотека]
 *   [▸ Каталог SnapGene]   (collapsed by default)
 *   ─────────────────
 *   [drop-zone footer (auto-height): file picker / drag-drop + paste-textarea]
 *
 * Cross-category search: on the first keystroke we Promise.all all
 * `index.categories[].slug` JSONs into a flat cache, then filter by
 * name / description / length-pattern (>5kb / <2k / 2k-3k).
 *
 * Drop-zone footer hosts file picker (V36) + drag-drop + Ctrl+V на пустой
 * области (≥50 chars) + a 2-row paste-textarea с кнопкой «Загрузить»
 * (Игорь 28.04.2026, follow-up FIX-2). Parent div's onPaste фиксирует
 * keyboard Ctrl+V; textarea вызывает stopPropagation на собственный paste
 * чтобы её содержимое было видно перед коммитом. Plus batch-parse progress
 * overlay.
 */

// F5' (Sprint Catalog Polish FIX 28.04.2026): fold catalog SnapGene plasmids
// to ≤20 kb. Bigger entries (Coronavirus genome ~30 kb, large viral expression
// vectors etc.) are reference-material, not cloning subjects — they crowd the
// catalog AND blow up leader-labels. If Игорь wants them back, raise this
// constant or add a UI toggle in Sprint UX-1.
// TODO(UX-1): consider a "show oversized catalog entries" Settings toggle.
const MAX_CATALOG_LENGTH = 20000;

let _indexCache = null;
const _categoryCache = {};
let _flatCache = null; // { items: [{...plasmid, _badge, _slug}], builtAt }

export function __resetCachesForTest() {
  _indexCache = null;
  for (const k of Object.keys(_categoryCache)) delete _categoryCache[k];
  _flatCache = null;
}

async function fetchIndex() {
  if (_indexCache) return _indexCache;
  const res = await fetch('/plasmids-index.json');
  if (!res.ok) throw new Error(`index fetch ${res.status}`);
  _indexCache = await res.json();
  return _indexCache;
}

async function fetchCategory(slug) {
  if (_categoryCache[slug]) return _categoryCache[slug];
  const res = await fetch(`/plasmids-data/${slug}.json`);
  if (!res.ok) throw new Error(`category fetch ${slug}`);
  const raw = await res.json();
  const filtered = (raw.plasmids || []).filter(
    (p) => (p.length || p.sequence?.length || 0) <= MAX_CATALOG_LENGTH,
  );
  const data = { ...raw, plasmids: filtered };
  _categoryCache[slug] = data;
  return data;
}

async function prefetchAllCategories(index) {
  if (_flatCache) return _flatCache;
  const cats = index?.categories || [];
  const results = await Promise.all(cats.map(async (c) => {
    try {
      const data = await fetchCategory(c.slug);
      return (data.plasmids || []).map((p) => ({ ...p, _badge: c.name || c.slug, _slug: c.slug }));
    } catch {
      return [];
    }
  }));
  _flatCache = { items: results.flat(), builtAt: Date.now() };
  return _flatCache;
}

const PART_GROUPS = [
  { key: 'promoter', label: 'Промоторы', match: (p) => p.type === 'promoter' },
  { key: 'cds', label: 'CDS', match: (p) => p.type === 'CDS' || p.type === 'gene' },
  { key: 'terminator', label: 'Терминаторы', match: (p) => p.type === 'terminator' },
  { key: 'reporter', label: 'Репортёры', match: (p) => /gfp|mcherry|luc|lacz/i.test(p.name) },
  { key: 'tag', label: 'Теги и сигналы', match: (p) => /tag|6.?his|flag|ha\b/i.test(p.name) },
];

const LENGTH_RE_GT = /^>\s*(\d+)\s*(k|kb|кб)?$/i;
const LENGTH_RE_LT = /^<\s*(\d+)\s*(k|kb|кб)?$/i;
const LENGTH_RE_RANGE = /^\s*(\d+)\s*(k|kb|кб)?\s*[-–]\s*(\d+)\s*(k|kb|кб)?\s*$/i;

export function parseLengthPattern(query) {
  if (!query) return null;
  const q = query.trim();
  let m = q.match(LENGTH_RE_GT);
  if (m) return { min: Number(m[1]) * (m[2] ? 1000 : 1) };
  m = q.match(LENGTH_RE_LT);
  if (m) return { max: Number(m[1]) * (m[2] ? 1000 : 1) };
  m = q.match(LENGTH_RE_RANGE);
  if (m) return {
    min: Number(m[1]) * (m[2] ? 1000 : 1),
    max: Number(m[3]) * (m[4] ? 1000 : 1),
  };
  return null;
}

export function applyCatalogFilter(items, query) {
  const q = (query || '').trim().toLowerCase();
  if (!q) return items;
  const lp = parseLengthPattern(query);
  if (lp) {
    return items.filter((it) => {
      const len = it.length || it.sequence?.length || 0;
      if (lp.min != null && len < lp.min) return false;
      if (lp.max != null && len > lp.max) return false;
      return true;
    });
  }
  return items.filter((it) =>
    (it.name || '').toLowerCase().includes(q) ||
    (it.description || '').toLowerCase().includes(q),
  );
}

function readGroupState(key, fallback) {
  try {
    const v = localStorage.getItem(`pvcs-catalog-group-${key}`);
    if (v === 'open') return true;
    if (v === 'closed') return false;
  } catch { /* jsdom or privacy mode */ }
  return fallback;
}
function writeGroupState(key, open) {
  try { localStorage.setItem(`pvcs-catalog-group-${key}`, open ? 'open' : 'closed'); } catch { /* */ }
}

function GroupHeader({ groupKey, label, count, open, onToggle, testId }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="w-full flex items-center justify-between px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500 hover:bg-gray-100"
      data-testid={testId || `catalog-group-${groupKey}-toggle`}
    >
      <span className="flex items-center gap-1.5">
        <span className="text-gray-400 w-3 inline-block">{open ? '▾' : '▸'}</span>
        <span>{label}</span>
      </span>
      {typeof count === 'number' && (
        <span className="text-[10px] text-gray-400">{count}</span>
      )}
    </button>
  );
}

export default function CatalogPanel({
  onSelectItem,
  onFiles,
  onPasteText,
  progress = null,
}) {
  const parts = useStore((s) => s.parts);
  const [index, setIndex] = useState(_indexCache);
  const [activeNode, setActiveNode] = useState(null); // { kind: 'snapgene'|'mine'|'demo', value }
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [flatItems, setFlatItems] = useState(_flatCache?.items || null);
  const [openLearn, setOpenLearn] = useState(() => readGroupState('learn', true));
  const [openMine, setOpenMine] = useState(() => readGroupState('mine', true));
  const [openSnap, setOpenSnap] = useState(() => readGroupState('snapgene', false));
  const [isOver, setIsOver] = useState(false);
  // F5' (Catalog Polish FIX): post-filter counts per slug after the ≤20 kb cull.
  // Static index counts are pre-filter — we need real numbers to skip categories
  // that fully fall under the threshold (e.g. coronavirus_resources: 4 → 0).
  const [filteredCounts, setFilteredCounts] = useState(null);
  const [pasteText, setPasteText] = useState('');
  const fileInputRef = useRef(null);
  const dropzoneRef = useRef(null);

  useEffect(() => {
    let alive = true;
    fetchIndex().then((idx) => { if (alive) setIndex(idx); }).catch((err) => alive && setError(err.message));
    return () => { alive = false; };
  }, []);

  useEffect(() => { writeGroupState('learn', openLearn); }, [openLearn]);
  useEffect(() => { writeGroupState('mine', openMine); }, [openMine]);
  useEffect(() => { writeGroupState('snapgene', openSnap); }, [openSnap]);

  // F5' lazy prefetch: as soon as the user EXPANDS the SnapGene tree, load
  // every category in the background to derive post-filter counts. We don't
  // prefetch on mount because (a) catalog isn't visible to most users on
  // first launch, (b) gating cleanly avoids cross-test bleed where pending
  // async prefetches from prior tests resolve after caches were reset.
  useEffect(() => {
    if (!index) return;
    if (!openSnap) return;
    let alive = true;
    prefetchAllCategories(index)
      .then((c) => {
        if (!alive) return;
        const counts = new Map();
        for (const it of c.items) {
          counts.set(it._slug, (counts.get(it._slug) || 0) + 1);
        }
        setFilteredCounts(counts);
        if (!flatItems) setFlatItems(c.items);
      })
      .catch(() => { /* catalog stays usable without prefetch — handleSelectNode still fetches per-category */ });
    return () => { alive = false; };
  }, [index, openSnap]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cross-category prefetch: fired by first non-empty keystroke if cache empty.
  useEffect(() => {
    if (!query.trim()) return;
    if (flatItems) return;
    if (!index) return;
    let alive = true;
    setSearchLoading(true);
    prefetchAllCategories(index)
      .then((c) => { if (alive) setFlatItems(c.items); })
      .catch((err) => alive && setError(err.message))
      .finally(() => alive && setSearchLoading(false));
    return () => { alive = false; };
  }, [query, flatItems, index]);

  const myGroups = useMemo(() => {
    const out = [];
    for (const g of PART_GROUPS) {
      const list = parts.filter((p) => g.match(p));
      if (list.length) out.push({ ...g, list });
    }
    return out;
  }, [parts]);

  const myFlat = useMemo(() => parts.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description || '',
    length: p.length || p.sequence?.length || 0,
    topology: p.topology || 'linear',
    annotations: p.annotations || [],
    sequence: p.sequence,
    _badge: 'моё',
  })), [parts]);

  const handleSelectNode = async (node) => {
    setActiveNode(node);
    setError(null);
    if (node.kind === 'mine') {
      const grp = myGroups.find((g) => g.key === node.value);
      setItems((grp?.list || []).map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description || '',
        length: p.length || p.sequence?.length || 0,
        topology: p.topology || 'linear',
        annotations: p.annotations || [],
        sequence: p.sequence,
        _badge: 'моё',
      })));
      return;
    }
    if (node.kind === 'demo') {
      setLoading(true);
      try {
        const cat = await fetchCategory('basic_cloning_vectors');
        setItems((cat.plasmids || []).slice(0, 12).map((p) => ({ ...p, _badge: 'demo' })));
      } catch (err) {
        setError(err.message);
      } finally { setLoading(false); }
      return;
    }
    if (node.kind === 'snapgene') {
      setLoading(true);
      try {
        const cat = await fetchCategory(node.value);
        setItems((cat.plasmids || []).map((p) => ({ ...p, _badge: cat.name || node.value })));
      } catch (err) {
        setError(err.message);
      } finally { setLoading(false); }
    }
  };

  // Right-panel results: search-driven (cross-category) OR activeNode items.
  const searchActive = !!query.trim();
  const filtered = useMemo(() => {
    if (!searchActive) return items;
    const pool = [...myFlat, ...(flatItems || [])];
    return applyCatalogFilter(pool, query);
  }, [searchActive, query, items, flatItems, myFlat]);

  // V44 replace-mode: when activeNode is set (no search), tree is hidden and
  // category items take over the scroll area. Header label resolves per-kind.
  const replaceMode = !searchActive && !!activeNode;
  const replaceModeLabel = useMemo(() => {
    if (!activeNode) return '';
    if (activeNode.kind === 'demo') return 'Базовые плазмиды';
    if (activeNode.kind === 'mine') {
      return myGroups.find((g) => g.key === activeNode.value)?.label || activeNode.value;
    }
    if (activeNode.kind === 'snapgene') {
      return index?.categories?.find((c) => c.slug === activeNode.value)?.name || activeNode.value;
    }
    return '';
  }, [activeNode, myGroups, index]);
  const replaceModeCount = loading ? '…' : items.length;

  // Drop-zone handlers (Ctrl+V handler moved here from InputZone in K3).
  const handlePickFiles = (e) => {
    const picked = Array.from(e.target.files || []);
    if (picked.length && typeof onFiles === 'function') onFiles(picked);
    e.target.value = '';
  };
  const handleDragEnter = (e) => {
    if (!e.dataTransfer?.types?.includes?.('Files')) return;
    e.preventDefault();
    setIsOver(true);
  };
  const handleDragOver = (e) => {
    if (!e.dataTransfer?.types?.includes?.('Files')) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  };
  const handleDragLeave = () => setIsOver(false);
  const handleDrop = (e) => {
    if (!e.dataTransfer?.types?.includes?.('Files')) return;
    e.preventDefault();
    setIsOver(false);
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length && typeof onFiles === 'function') onFiles(files);
  };
  const handlePaste = (e) => {
    const text = e.clipboardData?.getData('text') || '';
    if (text.length > 50 && typeof onPasteText === 'function') {
      e.preventDefault();
      onPasteText(text);
    }
  };
  const submitPasteText = () => {
    const text = pasteText.trim();
    if (!text || typeof onPasteText !== 'function') return;
    onPasteText(text);
    setPasteText('');
  };

  const dzBorder = isOver
    ? 'border-emerald-600 bg-emerald-50'
    : 'border-gray-300 bg-amber-50/40';

  return (
    <div className="flex flex-col h-full" data-testid="catalog-panel">
      {/* sticky search header */}
      <div className="px-2 py-1.5 border-b border-gray-200 bg-white sticky top-0 z-10">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск (имя, описание, >5kb, <2k, 2k-3k)…"
          className="w-full text-xs px-2 py-1 rounded border border-gray-200 outline-none focus:border-emerald-600"
          data-testid="catalog-search-input"
        />
      </div>

      {/* tree (scrolls) */}
      <div className="flex-1 overflow-y-auto bg-amber-50/40">
        {error && (
          <div className="m-2 text-[11px] text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1.5">
            Ошибка: {error}
          </div>
        )}

        {searchActive && (
          <div className="px-3 py-2 text-[11px] text-emerald-700 bg-emerald-50 border-b border-emerald-100">
            {searchLoading
              ? 'Поиск во всех категориях…'
              : `Найдено: ${filtered.length}`}
          </div>
        )}

        {replaceMode && (
          <button
            type="button"
            onClick={() => setActiveNode(null)}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border-b border-emerald-100 transition"
            data-testid="catalog-replace-mode-back"
          >
            <span aria-hidden>←</span>
            <span className="flex-1 text-left truncate">Назад · {replaceModeLabel}</span>
            <span className="text-[10px] text-emerald-600/80 font-mono">({replaceModeCount})</span>
          </button>
        )}

        {!searchActive && !replaceMode && (
          <>
            <GroupHeader
              groupKey="learn" label="Учебные / demo"
              open={openLearn} onToggle={() => setOpenLearn((v) => !v)}
            />
            {openLearn && (
              <button
                onClick={() => handleSelectNode({ kind: 'demo', value: 'demo' })}
                className={`w-full text-left text-xs px-3 py-1 hover:bg-gray-100 ${activeNode?.kind === 'demo' ? 'bg-emerald-50 text-emerald-700' : 'text-gray-700'}`}
              >
                Базовые плазмиды
              </button>
            )}
            <GroupHeader
              groupKey="mine" label="Моя библиотека" count={myGroups.reduce((s, g) => s + g.list.length, 0)}
              open={openMine} onToggle={() => setOpenMine((v) => !v)}
            />
            {openMine && (
              <>
                {myGroups.length === 0 && (
                  <div className="px-3 py-1 text-[11px] text-gray-400 italic">пусто</div>
                )}
                {myGroups.map((g) => (
                  <button
                    key={g.key}
                    onClick={() => handleSelectNode({ kind: 'mine', value: g.key })}
                    className={`w-full text-left text-xs px-3 py-1 hover:bg-gray-100 flex justify-between ${activeNode?.kind === 'mine' && activeNode.value === g.key ? 'bg-emerald-50 text-emerald-700' : 'text-gray-700'}`}
                  >
                    <span>{g.label}</span>
                    <span className="text-[10px] text-gray-400">{g.list.length}</span>
                  </button>
                ))}
              </>
            )}
            <GroupHeader
              groupKey="snapgene" label="Каталог SnapGene"
              count={filteredCounts ? [...filteredCounts.values()].reduce((s, n) => s + n, 0) : index?.total}
              open={openSnap} onToggle={() => setOpenSnap((v) => !v)}
            />
            {openSnap && (
              <>
                {!index && <div className="px-3 py-1 text-[11px] text-gray-400 italic">загрузка…</div>}
                {index?.categories?.map((c) => {
                  // F5' skip categories whose post-filter count is 0
                  // (e.g. coronavirus_resources: 4 of 4 plasmids are >20 kb).
                  // Until prefetch resolves, fall back to static c.count so the
                  // tree isn't temporarily empty.
                  const filteredCount = filteredCounts?.get(c.slug);
                  if (filteredCounts && (!filteredCount || filteredCount === 0)) return null;
                  const displayCount = filteredCount ?? c.count;
                  return (
                    <button
                      key={c.slug}
                      onClick={() => handleSelectNode({ kind: 'snapgene', value: c.slug })}
                      className={`w-full text-left text-xs px-3 py-1 hover:bg-gray-100 flex justify-between ${activeNode?.kind === 'snapgene' && activeNode.value === c.slug ? 'bg-emerald-50 text-emerald-700' : 'text-gray-700'}`}
                    >
                      <span className="truncate flex-1">{c.name}</span>
                      <span className="text-[10px] text-gray-400 ml-2 shrink-0">{displayCount}</span>
                    </button>
                  );
                })}
              </>
            )}
          </>
        )}

        {/* Right-panel-style result list rendered inline: search results OR activeNode items */}
        {(searchActive || activeNode) && (
          <div className="px-2 py-2">
            {loading && <div className="text-xs text-gray-400 py-3 text-center">Загрузка…</div>}
            {!loading && filtered.length === 0 && (
              <div className="text-xs text-gray-400 py-3 text-center">
                {searchActive ? 'Ничего не найдено' : 'Категория пуста'}
              </div>
            )}
            {!loading && filtered.length > 0 && (
              <div className="grid grid-cols-1 gap-1.5">
                {filtered.slice(0, 60).map((it) => (
                  <button
                    key={it.id || it.name}
                    onClick={() => onSelectItem?.(it)}
                    className="flex items-start gap-2 px-2 py-1.5 rounded border border-gray-200 bg-white hover:border-emerald-600 hover:shadow-sm transition text-left"
                    data-testid={`catalog-card-${it.name}`}
                  >
                    <PlasmidMiniMap
                      length={it.length || it.sequence?.length || 0}
                      topology={it.topology || 'circular'}
                      annotations={it.annotations || []}
                      size={48}
                      mode="inline"
                      name={it.name}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-gray-800 truncate">{it.name}</div>
                      <div className="text-[10px] text-gray-500 truncate">{(it.description || '').replace(/<[^>]*>/g, '').trim() || it._badge}</div>
                      <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-gray-400">
                        <span className="font-mono">{(it.length || it.sequence?.length || 0).toLocaleString()} bp</span>
                        <span className="font-mono">{getRegions(it.annotations || []).length} рег</span>
                        {it._badge && (
                          <span className={`px-1.5 py-0.5 rounded text-[9px] ${it._badge === 'моё' ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'}`}>
                            {it._badge}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
            {filtered.length > 60 && (
              <div className="text-[10px] text-gray-400 text-center mt-2">
                Показаны первые 60 из {filtered.length}.
              </div>
            )}
          </div>
        )}
      </div>

      {/* drop-zone footer — split: (top) file picker + drag-drop, (bottom)
          paste-textarea + «Загрузить» button. Игорь 28.04.2026: «Добавь
          текстовое окно для вставки текста, дроппад не убирай чтобы Ctrl+V
          работал нормально». Parent div keeps onPaste so Ctrl+V на пустой
          части drop-zone (или вне textarea) даёт прежний behaviour; textarea
          сама перехватывает paste через stopPropagation, чтобы её содержимое
          можно было увидеть/отредактировать перед коммитом. */}
      <div
        ref={dropzoneRef}
        className={`relative shrink-0 border-t-2 border-dashed transition-colors ${dzBorder}`}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onPaste={handlePaste}
        data-testid="catalog-dropzone"
      >
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="w-full flex flex-col items-center justify-center gap-0.5 px-2 pt-2 pb-1 text-center text-gray-600 cursor-pointer outline-none hover:bg-black/[0.02]"
          aria-label="Выберите файл или перетащите сюда"
          data-testid="catalog-dropzone-clickable"
        >
          <div className="text-xl opacity-40 leading-none">⬇</div>
          <div className="text-[11px] font-medium text-gray-700">Перетащите или выберите файл</div>
          <div className="text-[10px] text-gray-400">
            .dna · .gb · .gbk · .fasta · или Ctrl+V <span className="px-1 py-0.5 rounded bg-gray-100 border border-gray-200 font-mono">текст</span>
          </div>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          hidden
          multiple
          accept=".dna,.gb,.gbk,.genbank,.fasta,.fa,.fna"
          onChange={handlePickFiles}
          data-testid="catalog-file-picker"
        />
        <div className="px-2 pb-2 pt-1 flex items-stretch gap-1.5">
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            onPaste={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                submitPasteText();
              }
            }}
            placeholder="или вставьте/наберите последовательность…"
            rows={2}
            className="flex-1 min-w-0 text-[11px] font-mono px-2 py-1 border border-gray-200 rounded resize-none bg-white outline-none focus:border-emerald-600"
            data-testid="catalog-paste-textarea"
            spellCheck={false}
          />
          <button
            type="button"
            onClick={submitPasteText}
            disabled={!pasteText.trim()}
            className="shrink-0 text-[11px] px-2 rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed"
            data-testid="catalog-paste-submit"
            title="Загрузить текст (Ctrl+Enter)"
          >
            Загрузить
          </button>
        </div>
        {progress && progress.total > 1 && (
          <div
            className="absolute inset-0 bg-white/90 flex flex-col items-center justify-center px-3"
            data-testid="catalog-import-progress"
          >
            <div className="text-[11px] text-emerald-800 mb-1">
              Обрабатываем {progress.total} файлов: {progress.current} из {progress.total}
            </div>
            <div className="w-full h-1 bg-emerald-100 rounded overflow-hidden">
              <div
                className="h-full bg-emerald-600 transition-all"
                style={{ width: `${(progress.current / progress.total) * 100}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
