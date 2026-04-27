import { useDrag } from 'react-dnd';
import { useState, useMemo, useRef, useEffect } from 'react';
import { FEATURE_COLORS, getColor } from '../theme';
import { t } from '../i18n';
import { getPCRProducts, getVerifiedPlasmids } from '../inventory';
import { getPartDescription } from '../part-descriptions';
import { SBOLIcon } from '../sbol-glyphs';
import { getCollections, createCollection, addToCollection, removeFromCollection } from '../collections';
import { useStore } from '../store';
import { CATEGORY_ORDER, CATEGORY_LABELS, CATEGORY_ICONS, STUDENT_CATEGORIES, groupByCategory } from '../part-categories';
import { getRegions } from '../annotation-model';
import { ANNOTATION_COLORS } from '../auto-annotate';
import { exportGenBank } from '../exports';
import { ACCEPT_STRING } from '../file-import';
import { groupByLifecycle } from '../parts-grouping';
import ContextMenu from './ContextMenu';

/** Wrapper that makes children draggable as a PART to canvas. */
function DraggableHandle({ part, children }) {
  const [{ isDragging }, drag] = useDrag({
    type: 'PART', item: { part },
    collect: m => ({ isDragging: m.isDragging() }),
  });
  return (
    <span ref={drag} style={{ opacity: isDragging ? 0.4 : 1 }} className="cursor-grab">
      {children}
    </span>
  );
}


const DERIV_ICONS = { mutation: '\uD83E\uDDEC', split: '\u2702\uFE0F', fusion: '\uD83D\uDD17' };

export default function PartsPalette() {
  // ═══ Store selectors (granular) ═══
  const parts            = useStore(s => s.parts);
  const expertMode       = useStore(s => s.expertMode);
  const assemblies       = useStore(s => s.assemblies);
  const inventoryVersion = useStore(s => s.inventoryVersion);
  const activeProjectId  = useStore(s => s.activeProjectId);

  // ═══ Store actions ═══
  const setModalMode     = useStore(s => s.setModalMode);
  const setShowPartsLib  = useStore(s => s.setShowPartsLib);
  const toggleExpertMode = useStore(s => s.toggleExpertMode);
  const addFragment      = useStore(s => s.addFragment);
  const setGlobalCDSPart  = useStore(s => s.setGlobalCDSPart);
  const setViewerPart     = useStore(s => s.setViewerPart);
  const setPartsLibPartId = useStore(s => s.setPartsLibPartId);
  const highlightedPartId = useStore(s => s.highlightedPartId);
  const setHighlightedPartId = useStore(s => s.setHighlightedPartId);

  const removePart       = useStore(s => s.removePart);
  const initialized      = useStore(s => s.initialized);
  const updatePartStatus = useStore(s => s.updatePartStatus);
  const archivePart      = useStore(s => s.archivePart);
  const restorePart      = useStore(s => s.restorePart);

  const fileInputRef = useRef(null);
  const partRefs = useRef({});
  const [search, setSearch] = useState('');
  const [activeCollId, setActiveCollId] = useState(null);
  const [collVer, setCollVer] = useState(0);
  const [expandedId, setExpandedId] = useState(null);
  const [ctxMenu, setCtxMenu] = useState(null); // { part, x, y }
  const [statusFilter, setStatusFilter] = useState('default');
  const [invOpen, setInvOpen] = useState(false);
  const [otherProjOpen, setOtherProjOpen] = useState(false);
  const [collapsedCats, setCollapsedCats] = useState({}); // { [category]: true }

  const collections = useMemo(() => getCollections(), [collVer]);

  // ═══ Flat filtered list (for non-default filters) ═══
  const filtered = useMemo(() => {
    let list = parts;

    if (statusFilter === 'default') {
      list = list.filter(p => p.status !== 'archived');
    } else if (statusFilter === 'verified') {
      list = list.filter(p => p.status === 'verified' || !p.status);
    } else if (statusFilter === 'project') {
      list = list.filter(p => p.origin?.projectId === activeProjectId);
    } else if (statusFilter === 'archived') {
      list = list.filter(p => p.status === 'archived');
    }
    // 'all' = no status filter

    if (activeCollId) {
      const coll = collections.find(c => c.id === activeCollId);
      if (coll) list = list.filter(p => coll.partIds.includes(p.id));
    }
    if (search) list = list.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));
    return list;
  }, [parts, activeCollId, collections, search, statusFilter, activeProjectId]);

  // ═══ Lifecycle groups (for default mode) ═══
  const lifecycle = useMemo(() => {
    if (statusFilter !== 'default') return null;
    let base = parts.filter(p => p.status !== 'archived');
    if (activeCollId) {
      const coll = collections.find(c => c.id === activeCollId);
      if (coll) base = base.filter(p => coll.partIds.includes(p.id));
    }
    if (search) base = base.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));
    return groupByLifecycle(base, activeProjectId);
  }, [parts, activeProjectId, activeCollId, collections, search, statusFilter]);

  const isPlasmid = (p) => p.topology === 'circular' && getRegions(p.annotations).length >= 2;

  const pcrProducts = useMemo(() => getPCRProducts(), [inventoryVersion]);
  const plasmids = useMemo(() => getVerifiedPlasmids(), [inventoryVersion]);

  // Auto-scroll to highlighted part when canvas selection changes
  useEffect(() => {
    if (highlightedPartId && partRefs.current[highlightedPartId]) {
      partRefs.current[highlightedPartId].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [highlightedPartId]);

  // ═══ EARLY RETURN — only AFTER all hooks ═══
  if (!initialized) {
    return (
      <div className="p-4 text-center text-gray-400 text-sm">
        Загрузка библиотеки...
      </div>
    );
  }

  const handleCreateColl = () => {
    const name = prompt('Название коллекции:', `Проект ${collections.length + 1}`);
    if (!name) return;
    const c = createCollection(name);
    setActiveCollId(c.id);
    setCollVer(v => v + 1);
  };

  const handleAddToColl = (partId) => {
    if (!activeCollId) return;
    addToCollection(activeCollId, partId);
    setCollVer(v => v + 1);
  };

  const handleRemoveFromColl = (collId, partId) => {
    removeFromCollection(collId, partId);
    setCollVer(v => v + 1);
  };

  const onFileSelect = (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    useStore.getState().openImportStartScreen({ files });
    e.target.value = '';
  };

  // ═══ Status badge helper ═══
  const StatusBadge = ({ p, showVerified }) => (
    <>
      {p.status === 'draft' && <span className="text-[7px] px-1 rounded bg-amber-100 text-amber-700 shrink-0">Запл.</span>}
      {p.status === 'archived' && <span className="text-[7px] px-1 rounded bg-gray-100 text-gray-500 shrink-0">Арх.</span>}
      {showVerified && p.status === 'verified' && <span className="text-[7px] px-1 rounded bg-green-100 text-green-700 shrink-0">Получ.</span>}
    </>
  );

  // ═══ Plasmid row renderer ═══
  const renderPlasmidRow = (p, showVerifiedBadge) => {
    const regions = getRegions(p.annotations);
    const isExpanded = expandedId === p.id;
    return (
      <div key={p.id}>
        <div className="flex items-center gap-1.5 px-2 py-1.5 mb-0.5 rounded cursor-pointer
          bg-white border border-gray-100 hover:border-purple-300 hover:shadow-sm transition group/item"
          onClick={() => setExpandedId(isExpanded ? null : p.id)}
          onDoubleClick={e => { e.stopPropagation(); setViewerPart(p); }}
          onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setCtxMenu({ part: p, x: e.clientX, y: e.clientY }); }}>
          <DraggableHandle part={p}>
            <SBOLIcon type="plasmid" size={14} color="#A855F7" />
          </DraggableHandle>
          <span className="text-xs font-medium truncate flex-1">{p.name}</span>
          <StatusBadge p={p} showVerified={showVerifiedBadge} />
          <span className="text-[10px] text-gray-400">{p.length?.toLocaleString()}</span>
          <span className="text-[9px] text-purple-400">{regions.length} рег</span>
          <span className={`text-[9px] text-gray-300 transition-transform ${isExpanded ? 'rotate-90' : ''}`}>{'▶'}</span>
        </div>

        {isExpanded && (
          <div className="ml-3 mb-2 bg-purple-50/50 rounded-lg border border-purple-100 p-2">
            {regions.map((r, ri) => {
              const color = ANNOTATION_COLORS[r.type] || '#999';
              return (
                <div key={r.id || ri} className="flex items-center gap-1 py-0.5 text-[10px]">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                  <SBOLIcon type={r.type} size={10} color={color} />
                  <span className="truncate flex-1 text-gray-600">{r.name}</span>
                  <span className="text-gray-400 shrink-0">{r.type}</span>
                  <span className="text-gray-300 shrink-0">{r.end - r.start} п.н.</span>
                </div>
              );
            })}
            <div className="flex gap-1 pt-1.5 mt-1.5 border-t border-purple-200">
              <button onClick={e => { e.stopPropagation(); setViewerPart(p); }}
                className="text-[9px] border border-gray-300 px-2 py-0.5 rounded hover:bg-gray-100">{'👁'} Вид</button>
              <button onClick={e => { e.stopPropagation(); addFragment(p); }}
                className="text-[9px] bg-blue-500 text-white px-2 py-0.5 rounded hover:bg-blue-600">{'⚙'} Wizard</button>
              <button onClick={e => { e.stopPropagation(); exportGenBank([{
                name: p.name, type: 'source', sequence: p.sequence, strand: 1,
                annotations: p.annotations || [],
              }], p.name, true); }}
                className="text-[9px] border border-gray-300 px-2 py-0.5 rounded hover:bg-gray-100">{'💾'} .gb</button>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ═══ Part row renderer ═══
  const renderPartRow = (p, showVerifiedBadge) => {
    const children = parts.filter(c =>
      c.parentId === p.id || (c.parentIds && c.parentIds.includes(p.id))
    );
    const usedIn = assemblies.filter(a => (a.fragments || []).some(f => f.name === p.name || f.partId === p.id));
    const isExpanded = expandedId === p.id;
    const color = getColor(p);
    return (
      <div key={p.id}>
        <div ref={el => { if (el) partRefs.current[p.id] = el; }}
          className={`flex items-center gap-1.5 px-2 py-1.5 mb-0.5 rounded cursor-pointer
          bg-white border ${p.id === highlightedPartId ? 'border-blue-400 ring-2 ring-blue-200' : 'border-gray-100'}
          hover:border-gray-300 hover:shadow-sm transition group/item`}
          onClick={(e) => { e.stopPropagation(); setExpandedId(isExpanded ? null : p.id); setHighlightedPartId(p.id === highlightedPartId ? null : p.id); }}
          onDoubleClick={e => { e.stopPropagation(); setViewerPart(p); }}
          onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setCtxMenu({ part: p, x: e.clientX, y: e.clientY }); }}>
          <DraggableHandle part={p}>
            <SBOLIcon type={p.type} size={14} color={color} />
          </DraggableHandle>
          <span className="text-xs font-medium truncate flex-1">{p.name}</span>
          <StatusBadge p={p} showVerified={showVerifiedBadge} />
          <span className="text-[10px] text-gray-400">{p.length}</span>
          {children.length > 0 && (
            <span className="w-4 h-4 rounded-full bg-purple-100 text-purple-700 text-[8px] font-bold flex items-center justify-center">{children.length}</span>
          )}
          {usedIn.length > 0 && (
            <span className="w-2 h-2 rounded-full bg-blue-400" title={`В ${usedIn.length} сборках`} />
          )}
          <span className={`text-[9px] text-gray-300 transition-transform ${isExpanded ? 'rotate-90' : ''}`}>{'▶'}</span>
        </div>

        {isExpanded && (
          <div className="mb-2">
            {children.length > 0 && (
              <div style={{ marginLeft: 16 }}>
                {children.map((ch, ci) => {
                  const isLast = ci === children.length - 1;
                  const icon = DERIV_ICONS[ch.derivation?.type] || '';
                  return (
                    <DraggableHandle key={ch.id} part={ch}>
                      <div className="flex items-center gap-1 py-0.5 text-xs hover:bg-gray-50 rounded cursor-pointer"
                        onClick={e => { e.stopPropagation(); addFragment?.(ch); }}>
                        <span className="text-gray-300 font-mono text-[10px] w-6 shrink-0 select-none">{isLast ? '└──' : '├──'}</span>
                        {icon && <span className="text-[11px] shrink-0">{icon}</span>}
                        <span className="truncate flex-1">{ch.name}</span>
                        <span className="text-[10px] text-gray-400 shrink-0">{ch.length}</span>
                      </div>
                    </DraggableHandle>
                  );
                })}
              </div>
            )}

            <div className="ml-1 mr-0.5 mt-1 bg-gray-50 rounded-lg border border-gray-100 p-2 text-[10px]">
              <div className="text-gray-500 mb-1.5">
                {p.type} · {p.length} п.н.{p.organism ? ` · ${p.organism}` : ''}
              </div>

              {usedIn.length > 0 && (
                <div className="mb-2">
                  <div className="text-[9px] font-semibold text-blue-600 mb-0.5 uppercase tracking-wider">Используется ({usedIn.length})</div>
                  {usedIn.map(asm => (
                    <div key={asm.id} className="flex items-center justify-between py-0.5 pl-2 border-l-2 border-blue-200 text-gray-600">
                      <span className="truncate">{asm.name} <span className="text-gray-400">{(asm.fragments || []).length} фр.</span></span>
                      <span className={`text-[8px] px-1 rounded-full ${asm.completed ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {asm.completed ? '✓' : '⏳'}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex gap-1 pt-1 border-t border-gray-200">
                <button onClick={e => { e.stopPropagation(); addFragment?.(p); }}
                  className="text-[9px] bg-blue-500 text-white px-2 py-0.5 rounded hover:bg-blue-600">+ Canvas</button>
                <button onClick={e => { e.stopPropagation(); setGlobalCDSPart(p); }}
                  className="text-[9px] border border-gray-300 px-2 py-0.5 rounded hover:bg-gray-100">{'✏️'}</button>
                <button onClick={e => { e.stopPropagation(); setPartsLibPartId(p.id); setShowPartsLib(true); }}
                  className="text-[9px] border border-gray-300 px-2 py-0.5 rounded hover:bg-gray-100"
                  title="Аннотации">{'📝'}</button>
                {(p.children?.length > 0 || p.parentId) && (
                  <button onClick={e => { e.stopPropagation(); useStore.getState().setVersionTreePartId(p.id); }}
                    className="text-[9px] border border-gray-300 px-2 py-0.5 rounded hover:bg-gray-100"
                    title="История версий">{'🌳'}</button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ═══ Render a list of parts (plasmids first, then others) ═══
  const renderPartsList = (partsList, showVerifiedBadge) => {
    const plasmidItems = partsList.filter(isPlasmid);
    const nonPlasmidItems = partsList.filter(p => !isPlasmid(p));
    const roots = nonPlasmidItems.filter(p => !p.parentId && (!p.parentIds || p.parentIds.length === 0));
    return (
      <>
        {plasmidItems.map(p => renderPlasmidRow(p, showVerifiedBadge))}
        {roots.map(p => renderPartRow(p, showVerifiedBadge))}
      </>
    );
  };

  // ═══ Render category-grouped parts (for Library section) ═══
  const renderCategoryGrouped = (partsList) => {
    const plasmidItems = partsList.filter(isPlasmid);
    const nonPlasmidItems = partsList.filter(p => !isPlasmid(p));
    const grouped = groupByCategory(nonPlasmidItems);
    return (
      <>
        {plasmidItems.length > 0 && (
          <div className="mb-2">
            <div className="text-[10px] text-purple-500 uppercase tracking-wider mb-1 font-semibold flex items-center gap-1">
              <span>○</span>
              <span>Плазмиды</span>
              <span className="text-gray-300">({plasmidItems.length})</span>
            </div>
            {plasmidItems.map(p => renderPlasmidRow(p, false))}
          </div>
        )}
        {CATEGORY_ORDER.filter(cat => grouped[cat]?.length > 0).filter(cat => expertMode || STUDENT_CATEGORIES.has(cat)).map(cat => (
          <div key={cat}>
            <div className="text-[10px] text-gray-400 uppercase tracking-wider mt-3 mb-1 font-semibold flex items-center gap-1
              cursor-pointer select-none hover:text-gray-600 transition"
              onClick={() => setCollapsedCats(prev => ({ ...prev, [cat]: !prev[cat] }))}>
              <span className={`text-[8px] transition-transform ${collapsedCats[cat] ? '' : 'rotate-90'}`}>{'▶'}</span>
              <span>{CATEGORY_ICONS[cat]}</span>
              <span>{CATEGORY_LABELS[cat]}</span>
              <span className="text-gray-300">({grouped[cat].length})</span>
            </div>
            {!collapsedCats[cat] && grouped[cat].filter(p => !p.parentId && (!p.parentIds || p.parentIds.length === 0)).map(p =>
              renderPartRow(p, false)
            )}
          </div>
        ))}
        {!expertMode && CATEGORY_ORDER.some(cat => grouped[cat]?.length > 0 && !STUDENT_CATEGORIES.has(cat)) && (
          <div className="text-[9px] text-gray-400 mt-3 px-1 py-2 bg-gray-50 rounded">
            {'🎓'} Базовые элементы.{' '}
            <button onClick={toggleExpertMode} className="text-purple-500 hover:underline">
              Показать все →
            </button>
          </div>
        )}
      </>
    );
  };

  // ═══ Section header ═══
  const SectionHeader = ({ icon, label, count, color, open, onToggle }) => (
    <div
      className={`text-[10px] uppercase tracking-wider font-semibold mt-3 mb-1 flex items-center gap-1 ${color} ${onToggle ? 'cursor-pointer select-none' : ''}`}
      onClick={onToggle}
    >
      {onToggle && (
        <span className={`text-[8px] transition-transform ${open ? 'rotate-90' : ''}`}>{'▶'}</span>
      )}
      <span>{icon}</span>
      <span>{label}</span>
      <span className="text-gray-300">({count})</span>
    </div>
  );

  return (
    <div className="w-52 border-r border-gray-200 p-3 overflow-y-auto shrink-0 flex flex-col" style={{ backgroundColor: '#fdfdfe' }}>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-bold text-gray-700">{t('Parts Library')}</h3>
        <div className="flex items-center gap-1">
          <button onClick={() => fileInputRef.current?.click()}
            className="w-6 h-6 rounded bg-green-50 text-green-600 hover:bg-green-100 text-sm flex items-center justify-center"
            title="Импорт .gb / .dna / .fasta">{'📂'}</button>
          <input ref={fileInputRef} type="file" accept={ACCEPT_STRING} multiple
            onChange={onFileSelect} className="hidden" />
          <button onClick={() => setModalMode('library')}
            className="w-6 h-6 rounded bg-blue-50 text-blue-600 hover:bg-blue-100 text-sm font-bold flex items-center justify-center"
            title="Добавить Part в библиотеку">+</button>
        </div>
      </div>

      {/* Collection selector */}
      <div className="flex items-center gap-1 mb-2">
        <select value={activeCollId || ''} onChange={e => setActiveCollId(e.target.value || null)}
          className="flex-1 text-[10px] border rounded px-1.5 py-1 bg-white">
          <option value="">Все запчасти</option>
          {collections.map(c => <option key={c.id} value={c.id}>{'📁'} {c.name} ({c.partIds.length})</option>)}
        </select>
        <button onClick={handleCreateColl} className="text-[10px] px-1.5 py-1 bg-blue-50 text-blue-600 rounded hover:bg-blue-100" title="Новая коллекция">+</button>
      </div>

      <input type="text" placeholder={t('Search...')} value={search}
        onChange={e => setSearch(e.target.value)}
        className="w-full text-xs p-1.5 border rounded mb-2 outline-none focus:border-blue-400" />

      {/* Status filter */}
      <div className="flex gap-1 mb-2 flex-wrap">
        {[
          { val: 'default', label: 'Актуальные' },
          { val: 'all', label: 'Все' },
          { val: 'verified', label: 'Получен.' },
          { val: 'project', label: 'Проект' },
          { val: 'archived', label: 'Архив' },
        ].map(f => (
          <button key={f.val} onClick={() => setStatusFilter(f.val)}
            className={`text-[9px] px-2 py-0.5 rounded-full transition ${
              statusFilter === f.val ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}>{f.label}</button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* ═══ DEFAULT MODE: 4 lifecycle sections ═══ */}
        {statusFilter === 'default' && lifecycle && (
          <>
            {/* ── ЭТОТ ПРОЕКТ ── */}
            {lifecycle.thisProject.length > 0 && (
              <div className="mb-2">
                <SectionHeader icon={'📐'} label="Этот проект" count={lifecycle.thisProject.length} color="text-amber-600" />
                {renderPartsList(lifecycle.thisProject, true)}
              </div>
            )}

            {/* ── БИБЛИОТЕКА ── */}
            {lifecycle.library.length > 0 && (
              <div className="mb-2">
                <SectionHeader icon={'📚'} label="Библиотека" count={lifecycle.library.length} color="text-green-600" />
                {renderCategoryGrouped(lifecycle.library)}
              </div>
            )}

            {/* ── ДРУГИЕ ПРОЕКТЫ ── */}
            {lifecycle.otherProjects.length > 0 && (
              <div className="mb-2">
                <SectionHeader icon={'📂'} label="Другие проекты" count={lifecycle.otherProjects.length}
                  color="text-gray-500" open={otherProjOpen} onToggle={() => setOtherProjOpen(!otherProjOpen)} />
                {otherProjOpen && renderPartsList(lifecycle.otherProjects, true)}
              </div>
            )}

            {lifecycle.thisProject.length === 0 && lifecycle.library.length === 0 && lifecycle.otherProjects.length === 0 && (
              <div className="text-xs text-gray-400 text-center mt-6">
                {activeCollId ? 'Коллекция пуста — добавьте запчасти' : 'Ничего не найдено'}
              </div>
            )}
          </>
        )}

        {/* ═══ FLAT MODE: non-default filters ═══ */}
        {statusFilter !== 'default' && (
          <>
            {(() => {
              const plasmidItems = filtered.filter(isPlasmid);
              const nonPlasmidItems = filtered.filter(p => !isPlasmid(p));
              const grouped = groupByCategory(nonPlasmidItems);
              return (
                <>
                  {plasmidItems.length > 0 && (
                    <div className="mb-2">
                      <div className="text-[10px] text-purple-500 uppercase tracking-wider mb-1 font-semibold flex items-center gap-1">
                        <span>○</span>
                        <span>Плазмиды</span>
                        <span className="text-gray-300">({plasmidItems.length})</span>
                      </div>
                      {plasmidItems.map(p => renderPlasmidRow(p, true))}
                    </div>
                  )}
                  {CATEGORY_ORDER.filter(cat => grouped[cat]?.length > 0).filter(cat => expertMode || STUDENT_CATEGORIES.has(cat)).map(cat => (
                    <div key={cat}>
                      <div className="text-[10px] text-gray-400 uppercase tracking-wider mt-3 mb-1 font-semibold flex items-center gap-1
                        cursor-pointer select-none hover:text-gray-600 transition"
                        onClick={() => setCollapsedCats(prev => ({ ...prev, [cat]: !prev[cat] }))}>
                        <span className={`text-[8px] transition-transform ${collapsedCats[cat] ? '' : 'rotate-90'}`}>{'▶'}</span>
                        <span>{CATEGORY_ICONS[cat]}</span>
                        <span>{CATEGORY_LABELS[cat]}</span>
                        <span className="text-gray-300">({grouped[cat].length})</span>
                      </div>
                      {!collapsedCats[cat] && grouped[cat].filter(p => !p.parentId && (!p.parentIds || p.parentIds.length === 0)).map(p =>
                        renderPartRow(p, true)
                      )}
                    </div>
                  ))}
                  {filtered.length === 0 && (
                    <div className="text-xs text-gray-400 text-center mt-6">
                      {activeCollId ? 'Коллекция пуста — добавьте запчасти' : 'Ничего не найдено'}
                    </div>
                  )}
                  {!expertMode && CATEGORY_ORDER.some(cat => grouped[cat]?.length > 0 && !STUDENT_CATEGORIES.has(cat)) && (
                    <div className="text-[9px] text-gray-400 mt-3 px-1 py-2 bg-gray-50 rounded">
                      {'🎓'} Базовые элементы.{' '}
                      <button onClick={toggleExpertMode} className="text-purple-500 hover:underline">
                        Показать все →
                      </button>
                    </div>
                  )}
                </>
              );
            })()}
          </>
        )}
      </div>

      {/* 🧊 PhysicalDNA — Инвентарь (collapsed by default) */}
      {!activeCollId && (pcrProducts.length > 0 || plasmids.length > 0) && (
        <div>
          <div className="text-[10px] text-cyan-600 uppercase tracking-wider font-semibold mt-4 mb-1 cursor-pointer flex items-center gap-1"
            onClick={() => setInvOpen(!invOpen)}>
            <span className={`text-[8px] transition-transform ${invOpen ? 'rotate-90' : ''}`}>{'▶'}</span>
            <span>{'🧊'} Инвентарь</span>
            <span className="text-gray-300">({pcrProducts.length + plasmids.length})</span>
          </div>
          {invOpen && pcrProducts.map(item => (
            <DraggableHandle key={item.id} part={{
              id: item.id, name: item.name, type: 'pcr_product',
              sequence: item.sequence, length: item.length,
              needsAmplification: false, sourceAssemblyId: item.sourceAssemblyId,
            }}>
              <div className="flex items-center gap-1.5 px-2 py-1 mb-0.5 rounded
                bg-white border border-gray-100 hover:border-cyan-300 hover:shadow-sm transition cursor-grab text-xs">
                <span className="text-[11px]">{'🧪'}</span>
                <span className="truncate flex-1">{item.name}</span>
                <span className="text-[10px] text-gray-400">{item.length}</span>
              </div>
            </DraggableHandle>
          ))}
          {invOpen && plasmids.map(item => (
            <DraggableHandle key={item.id} part={{
              id: item.id, name: item.name, type: 'plasmid',
              sequence: item.sequence, length: item.length,
              needsAmplification: false, sourceAssemblyId: item.sourceAssemblyId,
            }}>
              <div className="flex items-center gap-1.5 px-2 py-1 mb-0.5 rounded
                bg-white border border-gray-100 hover:border-cyan-300 hover:shadow-sm transition cursor-grab text-xs">
                <span className="text-[11px]">{'💊'}</span>
                <span className="truncate flex-1">{item.name}</span>
                <span className="text-[10px] text-gray-400">{item.length}</span>
              </div>
            </DraggableHandle>
          ))}
        </div>
      )}

      {/* ═══ Context Menu ═══ */}
      {ctxMenu && (() => {
        const p = ctxMenu.part;
        const plasmid = isPlasmid(p);
        const items = [
          { icon: '\uD83D\uDCCB', label: 'Копировать последовательность', onClick: () => navigator.clipboard.writeText(p.sequence || '') },
          { icon: '\uD83D\uDCC4', label: 'Копировать имя', onClick: () => navigator.clipboard.writeText(p.name) },
          { divider: true },
          { icon: '\u270F\uFE0F', label: 'Редактировать', onClick: () => { setGlobalCDSPart(p); } },
          { icon: '\uD83D\uDC41', label: plasmid ? 'Просмотр (карта)' : 'Просмотр', onClick: () => setViewerPart(p) },
          { icon: '\uD83D\uDCE6', label: 'Экспорт .gb', onClick: () => exportGenBank([{
            name: p.name, type: 'source', sequence: p.sequence, strand: 1,
            annotations: p.annotations || [],
          }], p.name, true) },
          { divider: true },
          ...(plasmid ? [{ icon: '\u2699', label: 'Использовать в сборке', onClick: () => addFragment(p) }] : []),
          { divider: true },
          ...(p.status === 'draft' ? [
            { icon: '\u2705', label: 'Отметить как полученный', onClick: () => updatePartStatus(p.id, 'verified') },
          ] : []),
          ...(p.status !== 'archived' ? [
            { icon: '\uD83D\uDCE6', label: 'В архив', onClick: () => archivePart(p.id) },
          ] : [
            { icon: '\u21A9\uFE0F', label: 'Восстановить (черновик)', onClick: () => restorePart(p.id, 'draft') },
            { icon: '\u2705', label: 'Восстановить (получен)', onClick: () => restorePart(p.id, 'verified') },
          ]),
          { icon: '\uD83D\uDDD1', label: 'Удалить', onClick: () => { if (confirm(`Удалить "${p.name}"?`)) removePart(p.id); }, danger: true },
        ];
        return <ContextMenu items={items} position={{ x: ctxMenu.x, y: ctxMenu.y }} onClose={() => setCtxMenu(null)} />;
      })()}

      {/* Bottom actions — compact */}
      <div className="mt-3 pt-3 border-t">
        <div className="flex gap-2">
          <button onClick={() => setModalMode('sequence')}
            className="flex-1 text-[10px] px-2 py-2 rounded border border-dashed border-gray-300
              hover:border-blue-400 hover:bg-blue-50 transition text-center text-gray-500">
            {'✏️'} Вставить
          </button>
          <button onClick={() => fileInputRef.current?.click()}
            className="flex-1 text-[10px] px-2 py-2 rounded border border-dashed border-gray-300
              hover:border-green-400 hover:bg-green-50 transition text-center text-gray-500">
            {'📂'} Импорт
          </button>
        </div>
        <button onClick={() => setShowPartsLib(true)}
          className="w-full text-center text-[10px] text-blue-600 hover:underline mt-2">
          {'📦'} Полная библиотека →
        </button>
      </div>
    </div>
  );
}
