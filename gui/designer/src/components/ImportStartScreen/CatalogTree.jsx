import { useEffect, useState, useMemo, useRef } from 'react';
import { useStore } from '../../store';
import PlasmidMiniMap from '../PlasmidMiniMap';
import { getRegions } from '../../annotation-model';

/**
 * CatalogTree — left tree (240 px) + right grid of cards.
 *
 * Sections:
 *   - Учебные / demo (curated subset of SnapGene index)
 *   - Моя библиотека (parts[] from store, grouped by type)
 *   - Каталог SnapGene (19 categories from /plasmids-index.json)
 *
 * Lazy-load: index fetched once and cached in module scope; per-category
 * payloads loaded on first expansion and cached. Pattern lifted from
 * components/CatalogPanel.jsx (which is removed in K8).
 */

let _indexCache = null;
const _categoryCache = {};

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
  const data = await res.json();
  _categoryCache[slug] = data;
  return data;
}

const PART_GROUPS = [
  { key: 'promoter', label: 'Промоторы', match: (p) => p.type === 'promoter' },
  { key: 'cds', label: 'CDS', match: (p) => p.type === 'CDS' || p.type === 'gene' },
  { key: 'terminator', label: 'Терминаторы', match: (p) => p.type === 'terminator' },
  { key: 'reporter', label: 'Репортёры', match: (p) => /gfp|mcherry|luc|lacz/i.test(p.name) },
  { key: 'tag', label: 'Теги и сигналы', match: (p) => /tag|6.?his|flag|ha\b/i.test(p.name) },
];

export default function CatalogTree({ onSelectItem, query = '', onQueryChange }) {
  const parts = useStore((s) => s.parts);
  const [index, setIndex] = useState(_indexCache);
  const [activeNode, setActiveNode] = useState(null); // { kind: 'snapgene'|'mine'|'demo', value }
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const localQueryRef = useRef('');

  useEffect(() => {
    let alive = true;
    fetchIndex().then((idx) => { if (alive) setIndex(idx); }).catch((err) => alive && setError(err.message));
    return () => { alive = false; };
  }, []);

  const myGroups = useMemo(() => {
    const out = [];
    for (const g of PART_GROUPS) {
      const list = parts.filter((p) => g.match(p));
      if (list.length) out.push({ ...g, list });
    }
    return out;
  }, [parts]);

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
      // Use the index — pick first 12 from 'basic_cloning_vectors' as demo seeds.
      setLoading(true);
      try {
        const cat = await fetchCategory('basic_cloning_vectors');
        setItems((cat.plasmids || []).slice(0, 12).map((p) => ({
          ...p,
          _badge: 'demo',
        })));
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
      return;
    }
    if (node.kind === 'snapgene') {
      setLoading(true);
      try {
        const cat = await fetchCategory(node.value);
        setItems((cat.plasmids || []).map((p) => ({ ...p, _badge: cat.name || node.value })));
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
  };

  const filtered = useMemo(() => {
    const q = (query || '').trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) =>
      (it.name || '').toLowerCase().includes(q) ||
      (it.description || '').toLowerCase().includes(q)
    );
  }, [items, query]);

  return (
    <div className="grid grid-cols-[240px_1fr] gap-3 h-[420px]" data-testid="catalog-tree">
      <div className="border border-gray-200 rounded bg-amber-50/40 overflow-y-auto">
        <div className="px-2 py-1.5 border-b border-gray-200">
          <input
            type="text"
            value={query}
            onChange={(e) => onQueryChange?.(e.target.value)}
            placeholder="Поиск по имени, длине, типу…"
            className="w-full text-xs px-2 py-1 rounded border border-gray-200 outline-none focus:border-emerald-600"
          />
        </div>
        <div className="py-1.5">
          <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
            Учебные / demo
          </div>
          <button
            onClick={() => handleSelectNode({ kind: 'demo', value: 'demo' })}
            className={`w-full text-left text-xs px-3 py-1 hover:bg-gray-100 ${activeNode?.kind === 'demo' ? 'bg-emerald-50 text-emerald-700' : 'text-gray-700'}`}
          >
            Базовые плазмиды
          </button>
          <div className="px-3 py-1 mt-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
            Моя библиотека
          </div>
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
          <div className="px-3 py-1 mt-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
            Каталог SnapGene
          </div>
          {!index && <div className="px-3 py-1 text-[11px] text-gray-400 italic">загрузка…</div>}
          {index?.categories?.map((c) => (
            <button
              key={c.slug}
              onClick={() => handleSelectNode({ kind: 'snapgene', value: c.slug })}
              className={`w-full text-left text-xs px-3 py-1 hover:bg-gray-100 flex justify-between ${activeNode?.kind === 'snapgene' && activeNode.value === c.slug ? 'bg-emerald-50 text-emerald-700' : 'text-gray-700'}`}
            >
              <span className="truncate flex-1">{c.name}</span>
              <span className="text-[10px] text-gray-400 ml-2 shrink-0">{c.count}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="border border-gray-200 rounded bg-white overflow-y-auto p-3">
        {error && (
          <div className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1.5">
            Ошибка: {error}
          </div>
        )}
        {loading && (
          <div className="text-xs text-gray-400 py-6 text-center">Загрузка…</div>
        )}
        {!loading && !error && !activeNode && (
          <div className="text-xs text-gray-400 py-12 text-center">Выберите категорию слева</div>
        )}
        {!loading && !error && activeNode && filtered.length === 0 && (
          <div className="text-xs text-gray-400 py-6 text-center">
            {query ? 'Ничего не найдено' : 'Категория пуста'}
          </div>
        )}
        {!loading && !error && filtered.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
            {filtered.slice(0, 60).map((it) => (
              <button
                key={it.id || it.name}
                onClick={() => onSelectItem?.(it)}
                className="flex items-start gap-3 px-3 py-2 rounded border border-gray-200 bg-white hover:border-emerald-600 hover:shadow-sm transition text-left"
                data-testid={`catalog-card-${it.name}`}
              >
                <PlasmidMiniMap
                  length={it.length || it.sequence?.length || 0}
                  topology={it.topology || 'circular'}
                  annotations={it.annotations || []}
                  size={64}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-gray-800 truncate">{it.name}</div>
                  <div className="text-[10px] text-gray-500 truncate">{(it.description || '').replace(/<[^>]*>/g, '').trim() || it._badge}</div>
                  <div className="flex items-center gap-2 mt-1 text-[10px] text-gray-400">
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
          <div className="text-[10px] text-gray-400 text-center mt-3">
            Показаны первые 60 из {filtered.length}. Уточните поиск.
          </div>
        )}
      </div>
    </div>
  );
}
