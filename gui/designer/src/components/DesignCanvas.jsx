import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useDrop } from 'react-dnd';
import PartBlock from './PartBlock';
import JunctionBlock from './JunctionBlock';
import JunctionDNA from './JunctionDNA';
import { getFragColor, isMarker } from '../theme';
import { t } from '../i18n';
import PlasmidWorkspace from './PlasmidWorkspace';
import RacetrackView from './RacetrackView';
import SequenceMapView from './SequenceMapView';
import { collectFamily } from '../part-variants';
import ContextMenu from './ContextMenu';
import QuickStart from './QuickStart';
import { useStore, useFragments, useJunctions, usePrimers, useCustomPrimers } from '../store';
import { getFragmentTopology, expectedJunctionCount } from './utils/fragment-topology';

function fragColor(frag, idx) {
  return isMarker(frag.name) ? '#F0E442' : getFragColor(frag.type, idx);
}

function fragmentWidthEstimate(bp) {
  const minW = 70, maxW = 280, minBp = 20, maxBp = 10000;
  if (!bp || bp <= minBp) return minW;
  if (bp >= maxBp) return maxW;
  const frac = (Math.log(bp) - Math.log(minBp)) / (Math.log(maxBp) - Math.log(minBp));
  return Math.round(minW + frac * (maxW - minW));
}

export default function DesignCanvas({
  onDrop, onRemove, onToggleAmplification, onReorder, onFlip,
  pcrSizes = [], onSplitSignal, onEditFragment,
  onSwapVariant, onAddCustomPrimer, onJunctionChange, onToggleCircular,
  onToggleFragmentTopology,
}) {
  // ═══ Store selectors (granular) ═══
  const fragments  = useFragments();
  const junctions  = useJunctions();
  const primers    = usePrimers();
  const customPrimers = useCustomPrimers();
  const circular   = useStore(s => { const asm = s.assemblies.find(a => a.id === s.activeId); return asm?.circular || false; });
  const calculated = useStore(s => { const asm = s.assemblies.find(a => a.id === s.activeId); return asm?.calculated || false; });
  const parts      = useStore(s => s.parts);
  const constructName = useStore(s => { const asm = s.assemblies.find(a => a.id === s.activeId); return asm?.name || ''; });
  const completed  = useStore(s => { const asm = s.assemblies.find(a => a.id === s.activeId); return asm?.completed || false; });
  const selectedFragIndices = useStore(s => s.selectedFragIndices);
  const clearFragSelection = useStore(s => s.clearFragSelection);

  // ═══ Derived from store data ═══
  const allPrimers = useMemo(() => [
    ...primers.map(p => ({ ...p, category: 'assembly' })),
    ...customPrimers.map(p => ({ ...p, category: 'custom' })),
  ], [primers, customPrimers]);

  const allOverhangs = useMemo(() => junctions.map((j, i) => ({
    overhang: j.overhang || '',
    type: j.type || 'overlap',
    leftName: fragments[i]?.name || '?',
    rightName: fragments[(i + 1) % fragments.length]?.name || '?',
  })), [junctions, fragments]);

  // ═══ Quick Start handler (post-K9: 3 actions only) ═══
  const handleQuickStart = (actionId) => {
    switch (actionId) {
      case 'import':
        useStore.getState().openImportStartScreen({});
        break;
      case 'catalog':
        useStore.getState().openImportStartScreen({ catalogMode: true });
        break;
      case 'free':
        setDismissed(true);
        break;
    }
  };

  const [{ isOver }, drop] = useDrop({
    accept: 'PART',
    drop: (item) => onDrop(item.part),
    collect: m => ({ isOver: m.isOver() }),
  });

  const [dismissed, setDismissed] = useState(false); // QuickStart dismissed by «📦 Начать с нуля»

  const [zoom, setZoom] = useState(() => {
    const saved = localStorage.getItem('pvcs-canvas-zoom');
    return saved ? parseInt(saved) : 100;
  });
  const [viewMode, setViewMode] = useState('blocks'); // 'blocks' | 'sequence' | 'map'
  const [canvasH, setCanvasH] = useState(() => {
    const saved = localStorage.getItem('pvcs-canvas-height');
    return saved ? parseInt(saved) : 280;
  });
  const canvasRef = useRef(null);
  const canvasContainerRef = useRef(null);
  const scrollRef = useRef(null);
  const blocksRowRef = useRef(null);
  const resizing = useRef(false);
  const startY = useRef(0);
  const startH = useRef(0);
  const [canvasCtx, setCanvasCtx] = useState(null);

  // Keyboard shortcuts: Ctrl+1/2/3/4, Delete, Escape, Ctrl+A
  useEffect(() => {
    const handler = (e) => {
      // Ignore if typing in an input/textarea
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;

      // Ctrl/Meta combos — view modes, select all, copy, duplicate
      if (e.ctrlKey || e.metaKey) {
        if (e.key === '1') { setViewMode('blocks'); e.preventDefault(); }
        if (e.key === '2') { setViewMode('sequence'); e.preventDefault(); }
        if (e.key === '3') { setViewMode('map'); e.preventDefault(); }
        if (e.key === '4') { setViewMode('racetrack'); e.preventDefault(); }
        if (e.key === 'a' && fragments.length > 0) {
          e.preventDefault();
          useStore.getState().selectFragRange(0, fragments.length - 1);
        }
        // Ctrl+C = copy sequence
        if (e.key === 'c' && selectedFragIndices.length > 0) {
          const seqs = selectedFragIndices.map(i => fragments[i]?.sequence || '').join('');
          if (seqs) { navigator.clipboard.writeText(seqs); e.preventDefault(); }
        }
        // Ctrl+D = duplicate
        if (e.key === 'd' && selectedFragIndices.length === 1) {
          e.preventDefault();
          const frag = fragments[selectedFragIndices[0]];
          if (frag) onDrop({ ...frag, id: `dup_${Date.now()}`, name: frag.name + '_copy' });
        }
        return;
      }

      // Delete / Backspace — remove selected fragments (single undo for batch)
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedFragIndices.length > 0) {
        e.preventDefault();
        const store = useStore.getState();
        const active = store.getActive();
        if (!active) return;

        store.pushUndo();

        const toRemove = new Set(selectedFragIndices);
        const newFragments = active.fragments.filter((_, i) => !toRemove.has(i));

        const asmType = active.assemblyType || 'overlap';
        const isCirc = active.circular || false;
        const juncCount = expectedJunctionCount(newFragments, isCirc); // K12 / V17
        const defaultJ = () => ({
          type: asmType === 'golden_gate' ? 'golden_gate' : 'overlap',
          overlapMode: 'split', overlapLength: 30, tmTarget: 62, calcMode: 'length',
        });
        const newJunctions = Array.from({ length: juncCount }, (_, i) =>
          active.junctions[i] || defaultJ()
        );

        store.updateActive({
          fragments: newFragments,
          junctions: newJunctions,
          calculated: false,
        });
        clearFragSelection();
      }

      // Escape — clear selection
      if (e.key === 'Escape' && selectedFragIndices.length > 0) {
        clearFragSelection();
      }

      // R = reverse complement (flip)
      if (e.key === 'r' && !e.ctrlKey && !e.metaKey && selectedFragIndices.length === 1) {
        e.preventDefault(); onFlip(selectedFragIndices[0]);
      }
      // E or Enter = edit fragment
      if ((e.key === 'e' || e.key === 'Enter') && !e.ctrlKey && !e.metaKey && selectedFragIndices.length === 1) {
        e.preventDefault(); onEditFragment(selectedFragIndices[0]);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [selectedFragIndices, clearFragSelection, onRemove, onFlip, onEditFragment, onDrop, fragments]);

  const totalBp = fragments.reduce((s, f) => s + (f.length || 0), 0);
  const n = fragments.length;
  const hasPrimers = calculated && primers.length > 0;

  // Persist zoom
  useEffect(() => { localStorage.setItem('pvcs-canvas-zoom', String(zoom)); }, [zoom]);

  const fitToView = useCallback(() => {
    const scale = n <= 4 ? 1 : n <= 10 ? Math.max(0.45, 1 - (n - 4) * 0.1) : Math.max(0.2, 0.45 - (n - 10) * 0.02);
    const blockW = n > 15 ? 80 : fragmentWidthEstimate;
    const totalW = fragments.reduce((s, f) => s + (typeof blockW === 'function' ? blockW(f.length) : blockW) * scale, 0)
      + Math.max(0, n - 1) * (n > 15 ? 48 : 84) + 60;
    const containerW = scrollRef.current?.clientWidth || 800;
    setZoom(Math.max(15, Math.min(100, Math.floor(containerW / totalW * 100))));
  }, [fragments, n]);

  // Auto-fit when fragment count changes
  const prevN = useRef(n);
  useEffect(() => {
    if (n > 0 && n !== prevN.current) {
      const tm = setTimeout(fitToView, 100);
      prevN.current = n;
      return () => clearTimeout(tm);
    }
    prevN.current = n;
  }, [n, fitToView]);

  // Ctrl+wheel zoom
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const handler = (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        setZoom(z => Math.max(30, Math.min(150, z + (e.deltaY > 0 ? -5 : 5))));
      }
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, []);

  // ═══ Resize handle (direct DOM for smooth 60fps) ═══
  const onResizeStart = useCallback((e) => {
    e.preventDefault();
    resizing.current = true;
    startY.current = e.clientY;
    startH.current = canvasH;
    const onMove = (ev) => {
      if (!resizing.current) return;
      const h = Math.max(200, Math.min(800, startH.current + ev.clientY - startY.current));
      if (canvasContainerRef.current) canvasContainerRef.current.style.height = `${h}px`;
      startH.current = h; // track for onUp
      startY.current = ev.clientY;
    };
    const onUp = () => {
      resizing.current = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      const finalH = parseInt(canvasContainerRef.current?.style.height) || 280;
      setCanvasH(finalH);
      localStorage.setItem('pvcs-canvas-height', String(finalH));
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [canvasH]);

  return (
    <div ref={(el) => { drop(el); canvasRef.current = el; canvasContainerRef.current = el; }}
      className={`relative rounded-xl px-4 pt-2 pb-3
        flex flex-col shrink-0 min-w-0 overflow-hidden
        ${isOver ? 'border-2 border-blue-400 bg-blue-50/40' : 'border border-gray-200'}`}
      onClick={(e) => { if (e.target === e.currentTarget) { useStore.getState().setHighlightedPartId(null); clearFragSelection(); } }}
      onContextMenu={(e) => {
        if (e.target === e.currentTarget || e.target.closest('[data-canvas-bg]')) {
          e.preventDefault(); setCanvasCtx({ x: e.clientX, y: e.clientY });
        }
      }}
      style={{
        height: n > 0 ? canvasH : undefined,
      }}>

      {/* Canvas context menu */}
      {canvasCtx && (
        <ContextMenu position={canvasCtx} onClose={() => setCanvasCtx(null)} items={[
          { icon: '+', label: 'Добавить фрагмент', onClick: () => { setCanvasCtx(null); useStore.getState().setModalMode('add'); } },
          { icon: '\uD83D\uDCC2', label: 'Импорт файла', onClick: () => { setCanvasCtx(null); useStore.getState().setModalMode('import'); } },
          { divider: true },
          { icon: circular ? '\u2500' : '\u25EF', label: circular ? 'Linear' : 'Circular', onClick: () => { setCanvasCtx(null); onToggleCircular(); } },
        ]} />
      )}

      {/* Hotkey hints when single fragment selected */}
      {n > 0 && selectedFragIndices.length === 1 && (
        <div className="absolute top-2 right-2 z-20 bg-white/90 backdrop-blur-sm border border-gray-200 rounded-lg px-2.5 py-1.5 shadow-sm text-[9px] text-gray-500 space-y-0.5 pointer-events-none">
          <div><kbd className="font-mono bg-gray-100 px-1 rounded">E</kbd> Редактировать</div>
          <div><kbd className="font-mono bg-gray-100 px-1 rounded">R</kbd> Перевернуть</div>
          <div><kbd className="font-mono bg-gray-100 px-1 rounded">Del</kbd> Удалить</div>
          <div><kbd className="font-mono bg-gray-100 px-1 rounded">Ctrl+C</kbd> Копировать</div>
          <div><kbd className="font-mono bg-gray-100 px-1 rounded">Ctrl+D</kbd> Дублировать</div>
        </div>
      )}

      <div className="flex-1 flex flex-col overflow-hidden" style={{
        minHeight: n > 0 ? (viewMode === 'racetrack' ? 380 : 200) : 180,
        maxHeight: 800,
        backgroundColor: '#ffffff',
        backgroundImage: 'radial-gradient(#e0e2e6 1px, transparent 1px)',
        backgroundSize: '20px 20px',
      }}
      >

      {n === 0 ? (
        completed ? (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm select-none">
            {t('Drag parts here')}
          </div>
        ) : dismissed ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-gray-400">
            <div className="text-sm">Перетащите запчасти из палитры слева</div>
            <div className="text-[10px] text-gray-300">или</div>
            <button onClick={() => useStore.getState().setModalMode('add')}
              className="text-xs px-4 py-2 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-100">
              + Добавить фрагмент по последовательности
            </button>
            <button onClick={() => setDismissed(false)}
              className="text-[10px] text-gray-300 hover:text-gray-500 mt-2">
              ← Назад к выбору метода
            </button>
          </div>
        ) : (
          <QuickStart onAction={handleQuickStart} />
        )
      ) : (
        <>
          {/* Top bar */}
          <div className="flex items-center gap-2 mb-1 select-none w-full shrink-0">
            <div className="text-[10px] text-gray-400">
              5' &rarr; сборка конструкции &rarr; 3'
            </div>
            <div className="flex-1" />
            <div className="flex items-center gap-1 text-xs text-gray-400">
              <button onClick={() => setZoom(z => Math.max(30, z - 10))}
                className="w-5 h-5 rounded border border-gray-200 flex items-center justify-center hover:bg-gray-100 text-[10px]">−</button>
              <span className="w-8 text-center font-mono text-[10px]">{zoom}%</span>
              <button onClick={() => setZoom(z => Math.min(150, z + 10))}
                className="w-5 h-5 rounded border border-gray-200 flex items-center justify-center hover:bg-gray-100 text-[10px]">+</button>
              <button onClick={fitToView}
                className="px-1.5 h-5 rounded border border-gray-200 text-[9px] hover:bg-gray-100 ml-0.5">
                Вписать
              </button>
            </div>
            <button onClick={onToggleCircular}
              className={`text-[10px] px-2 py-0.5 rounded-full font-medium transition
                ${circular ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
              {circular ? `⭕ ${t('Circular')}` : `📏 ${t('Linear')}`}
            </button>
            <div className="flex rounded-lg overflow-hidden border border-gray-200 ml-1">
              {[
                { mode: 'blocks', label: '📦 Блоки', key: '1' },
                { mode: 'sequence', label: '🧬 Посл.', key: '2' },
                ...(circular ? [
                  { mode: 'map', label: '⭕ Карта', key: '3' },
                  { mode: 'racetrack', label: '🏟 Стадион', key: '4' },
                ] : []),
              ].map(v => (
                <button key={v.mode} onClick={() => setViewMode(v.mode)}
                  className={`text-[9px] px-2 py-0.5 transition ${
                    viewMode === v.mode ? 'bg-gray-800 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                  title={`Ctrl+${v.key}`}>
                  {v.label}
                </button>
              ))}
            </div>
          </div>

          {/* View modes */}
          {viewMode === 'racetrack' && circular ? (
            <RacetrackView
              fragments={fragments} junctions={junctions} primers={primers}
              circular={circular} constructName={constructName} totalBp={totalBp}
              zoom={zoom} parts={parts} allOverhangs={allOverhangs} calculated={calculated}
              onRemove={onRemove} onFlip={onFlip}
              onEditFragment={onEditFragment} onToggleAmplification={onToggleAmplification}
              onReorder={onReorder} onSplitSignal={onSplitSignal} onSwapVariant={onSwapVariant}
              onInsertAt={(afterIdx, part) => useStore.getState().insertFragmentAt(afterIdx + 1, part)}
              onJunctionChange={(index, config) => useStore.getState().updateJunction(index, config)}
              onImportFile={null}
            />
          ) : viewMode === 'map' && circular ? (
            <div className="flex-1 overflow-hidden min-h-0">
              <PlasmidWorkspace fragments={fragments} constructName={constructName}
                totalBp={totalBp} junctions={junctions} primers={primers}
                onRemove={onRemove} onFlip={onFlip}
                onSplitSignal={onSplitSignal} onEditFragment={onEditFragment} />
            </div>
          ) : viewMode === 'sequence' ? (
            <SequenceMapView fragments={fragments} primers={allPrimers || primers} circular={circular}
              onAddCustomPrimer={onAddCustomPrimer} />
          ) :
          /* Scrollable + zoomable blocks — wraps to rows */
          <div ref={scrollRef} className="flex-1 overflow-x-auto overflow-y-auto w-full">
            {(() => {
              const perRow = n <= 5 ? n : Math.ceil(n / Math.ceil(n / 5));
              const rows = [];
              for (let r = 0; r < n; r += perRow) rows.push(fragments.slice(r, r + perRow).map((f, ri) => ({ frag: f, idx: r + ri })));

              return (
                <div ref={blocksRowRef} className="py-4 px-4" style={{ zoom: zoom / 100 }}>
                  {rows.map((row, ri) => (
                    <div key={ri}>
                      <div className="flex items-center gap-1 w-fit">
                        {ri === 0 && <div className={`w-1.5 bg-gray-300 rounded-l shrink-0 ${hasPrimers ? 'h-[72px]' : 'h-14'}`} />}
                        {ri > 0 && <div className="text-[9px] text-gray-400 px-1 shrink-0">{'↳'}</div>}
                        {(() => {
                          // K7 — split row into segments of consecutive fragments sharing a splitGroupId.
                          // Segment with ≥2 items and a groupId is rendered inside a visual group container.
                          const segments = [];
                          for (const it of row) {
                            const gid = it.frag.splitGroupId || null;
                            const cur = segments[segments.length - 1];
                            if (cur && cur.gid && cur.gid === gid) cur.items.push(it);
                            else segments.push({ gid, items: [it] });
                          }

                          const renderFrag = ({ frag, idx: i }) => {
                            let fwdPrimer = null, revPrimer = null;
                            if (frag.subFragments?.length > 0) {
                              const firstName = frag.subFragments[0].name;
                              const lastName = frag.subFragments[frag.subFragments.length - 1].name;
                              fwdPrimer = primers.find(p => p.direction === 'forward' && p.name.includes(firstName)) || null;
                              revPrimer = primers.find(p => p.direction === 'reverse' && p.name.includes(lastName)) || null;
                            } else {
                              fwdPrimer = primers.find(p => p.direction === 'forward' && p.name.includes(frag.name)) || null;
                              revPrimer = primers.find(p => p.direction === 'reverse' && p.name.includes(frag.name)) || null;
                            }
                            return (
                              <div className="mx-1">
                                <PartBlock fragment={frag} index={i} fragmentCount={n}
                                  onRemove={onRemove} onToggleAmplification={onToggleAmplification}
                                  onReorder={onReorder} onFlip={onFlip} pcrSize={pcrSizes[i]}
                                  onSplitSignal={onSplitSignal} onEditFragment={onEditFragment}
                                  fwdPrimer={fwdPrimer} revPrimer={revPrimer}
                                  circularHint={circular && (i === 0 || i === n - 1) ? (i === 0 ? 'first' : 'last') : null}
                                  variants={parts.length > 0 ? collectFamily(frag.id, parts).filter(v => v.id !== frag.id) : []}
                                  onSwapVariant={onSwapVariant}
                                  onToggleFragmentTopology={onToggleFragmentTopology} />
                              </div>
                            );
                          };

                          const renderJunction = (i, frag) => {
                            // V17 / K12 — single-fragment canvases never render a decorative
                            // junction: linear has nothing to connect, circular shows the
                            // separate arc indicator below. Guard uses the canonical count.
                            if (expectedJunctionCount(fragments, circular) === 0) return null;
                            if (!(i < junctions.length && (i < n - 1 || circular))) return null;
                            return (
                              <div data-junction className="flex flex-col items-center shrink-0" style={{ minWidth: n > 12 ? 44 : 80 }}>
                                <JunctionBlock junction={junctions[i]} index={i}
                                  leftName={frag.name} rightName={fragments[(i + 1) % n]?.name || '?'}
                                  leftFrag={frag} rightFrag={fragments[(i + 1) % n]}
                                  leftPCR={frag.needsAmplification !== false}
                                  rightPCR={fragments[(i + 1) % n]?.needsAmplification !== false}
                                  onChange={cfg => onJunctionChange(i, cfg)}
                                  fragmentCount={n}
                                  allOverhangs={allOverhangs} />
                                <JunctionDNA junction={junctions[i]} calculated={calculated}
                                  primers={primers}
                                  leftFragment={frag} rightFragment={fragments[(i + 1) % n]}
                                  leftColor={fragColor(frag, i)}
                                  rightColor={fragColor(fragments[(i + 1) % n], (i + 1) % n)} />
                              </div>
                            );
                          };

                          return segments.map((seg, si) => {
                            const isGroup = !!seg.gid && seg.items.length >= 2;
                            const last = seg.items[seg.items.length - 1];
                            const innerContent = seg.items.map(({ frag, idx: i }, k) => (
                              <div key={frag.id || i} className="flex items-center">
                                {renderFrag({ frag, idx: i })}
                                {/* Internal junction — only when there's a next item in the SAME segment */}
                                {k < seg.items.length - 1 && renderJunction(i, frag)}
                              </div>
                            ));
                            // External junction after the segment (leads to the next segment / next row / circular close)
                            const externalJunction = renderJunction(last.idx, last.frag);
                            if (isGroup) {
                              const parentName = seg.items[0].frag.splitGroupParentName || 'split';
                              return (
                                <div key={`seg-${si}`} className="flex items-center">
                                  <div className="split-group-container relative flex items-center"
                                    style={{
                                      padding: '10px 6px 6px 6px',
                                      marginTop: '14px',
                                      border: '2px dashed #a855f7',
                                      borderRadius: '12px',
                                      backgroundColor: 'rgba(168, 85, 247, 0.05)',
                                      gap: '2px',
                                    }}>
                                    {/* Badge */}
                                    <div className="split-group-badge" style={{
                                      position: 'absolute', top: '-10px', left: '12px',
                                      backgroundColor: '#a855f7', color: 'white',
                                      fontSize: '10px', fontWeight: 500, lineHeight: '14px',
                                      padding: '1px 8px', borderRadius: '8px',
                                      whiteSpace: 'nowrap', pointerEvents: 'none',
                                    }}>
                                      {'🧬'} {parentName} (split: {seg.items.length} частей)
                                    </div>
                                    {/* Connector line — subtle horizontal ink behind the fragments */}
                                    <div className="split-group-connector" style={{
                                      position: 'absolute', left: '10px', right: '10px',
                                      top: '50%', height: '1px',
                                      backgroundColor: 'rgba(168, 85, 247, 0.35)',
                                      pointerEvents: 'none', zIndex: 0,
                                    }} />
                                    {innerContent}
                                  </div>
                                  {externalJunction}
                                </div>
                              );
                            }
                            return (
                              <div key={`seg-${si}`} className="flex items-center">
                                {innerContent}
                                {externalJunction}
                              </div>
                            );
                          });
                        })()}
                        {ri === rows.length - 1 && !circular && <div className={`w-1.5 bg-gray-300 rounded-r shrink-0 ${hasPrimers ? 'h-[72px]' : 'h-14'}`} />}
                      </div>
                      {ri < rows.length - 1 && <div className="h-2" />}
                    </div>
                  ))}
                  {/* Circular arc — n>=2 follows assembly.circular; n=1 honors per-fragment topology (K12). */}
                  {((n >= 2 && circular) || (n === 1 && getFragmentTopology(fragments[0], circular) === 'circular')) && (
                    <div className="relative mx-4 mt-1">
                      <div className="border-b-2 border-l-2 border-r-2 border-dashed border-blue-400 rounded-b-[20px] h-4 mx-2 opacity-40" />
                      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 bg-white px-2 rounded">
                        <span className="text-[9px] font-bold text-blue-500">{'⟳'} замыкание</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>}

          {/* ═══ MERGE / UNFOLD buttons ═══ */}

          {/* Merge selected — FLOATING over canvas */}
          {selectedFragIndices.length >= 2 && (() => {
            const sorted = [...selectedFragIndices].sort((a, b) => a - b);
            const isConsecutive = sorted.every((v, i) => i === 0 || v === sorted[i-1] + 1);
            return (
              <div className="absolute bottom-14 left-1/2 -translate-x-1/2 z-30
                bg-white/95 backdrop-blur-sm shadow-xl rounded-full
                border-2 border-green-400 flex items-center gap-2 px-4 py-2">
                {isConsecutive ? (
                  <button onClick={() => {
                    const active = useStore.getState().getActive();
                    if (!active) return;

                    // HIGH-3: block merge through ligation junctions
                    const junctionsBetween = sorted.slice(0, -1).map(i => active.junctions[i]);
                    if (junctionsBetween.some(j => j && (j.type === 'ligation' || j.type === 're_ligation'))) {
                      useStore.getState().updateActive({
                        apiWarnings: [...(active.apiWarnings || []),
                          '⛔ Нельзя склеить фрагменты через ligation junction — используйте overlap или Golden Gate'],
                      });
                      return;
                    }

                    const selFrags = sorted.map(i => fragments[i]);
                    const fullSeq = selFrags.map(f => f.sequence || '').join('');
                    const totalLen = fullSeq.length;

                    const subFrags = selFrags.map((f, i) => {
                      if (f.subFragments?.length > 0) return f.subFragments;
                      return [{ name: f.name, type: f.type, length: f.length,
                        color: f.customColor || getFragColor(f.type, sorted[i]),
                        pct: (f.length / totalLen) * 100 }];
                    }).flat();
                    const totalSubLen = subFrags.reduce((s, sf) => s + sf.length, 0);
                    subFrags.forEach(sf => { sf.pct = (sf.length / totalSubLen) * 100; });

                    const mergedAnnotations = [];
                    let offset = 0;
                    for (const frag of selFrags) {
                      for (const ann of (frag.annotations || [])) {
                        mergedAnnotations.push({ ...ann, start: ann.start + offset, end: ann.end + offset, sourceFragment: frag.name });
                      }
                      offset += (frag.sequence || '').length;
                    }

                    const mergedName = selFrags.map(f => f.name).join('+');
                    const mergedProduct = {
                      id: `merged_${Date.now()}`, name: mergedName,
                      type: active.circular ? 'plasmid' : 'pcr_product',
                      sequence: fullSeq, length: totalLen, strand: 1, needsAmplification: false,
                      subFragments: subFrags,
                      assemblyMethod: (() => {
                        const asmType = active.assemblyType || 'overlap';
                        if (asmType === 'golden_gate') return 'golden_gate';
                        if (asmType === 'kld') return 'kld';
                        if (asmType === 're_ligation') return 're_ligation';
                        return (active.circular || false) ? 'gibson' : 'overlap_pcr';
                      })(),
                      protocol: 'manual', annotations: mergedAnnotations,
                      topology: active.circular ? 'circular' : 'linear',
                    };

                    const newFragments = [...fragments];
                    newFragments.splice(sorted[0], sorted.length, mergedProduct);

                    const asmType = active.assemblyType || 'overlap';
                    const isCirc = active.circular || false;
                    const juncCount = expectedJunctionCount(newFragments, isCirc); // K12 / V17
                    const defaultJ = () => ({ type: asmType === 'golden_gate' ? 'golden_gate' : 'overlap',
                      overlapMode: 'split', overlapLength: 30, tmTarget: 62, calcMode: 'length' });
                    const newJunctions = [];
                    for (let fi = 0; fi < newFragments.length - 1; fi++) {
                      if (fi < sorted[0]) {
                        newJunctions.push(active.junctions[fi] || defaultJ());
                      } else if (fi === sorted[0]) {
                        const nextOrigIdx = sorted[sorted.length - 1];
                        newJunctions.push(active.junctions[nextOrigIdx] || defaultJ());
                      } else {
                        const origIdx = sorted[sorted.length - 1] + (fi - sorted[0]);
                        newJunctions.push(active.junctions[origIdx] || defaultJ());
                      }
                    }
                    while (newJunctions.length < juncCount) newJunctions.push(defaultJ());
                    newJunctions.length = juncCount;

                    useStore.getState().pushUndo();
                    useStore.getState().updateActive({
                      fragments: newFragments, junctions: newJunctions,
                      calculated: false,
                    });
                    clearFragSelection();
                  }}
                    className="flex items-center gap-1.5 text-sm font-semibold text-green-700
                      hover:text-green-900 transition whitespace-nowrap">
                    <span>{'🔗'}</span>
                    {'Склеить'} {selectedFragIndices.length} {'фрагмент'}{selectedFragIndices.length > 4 ? 'ов' : selectedFragIndices.length > 1 ? 'а' : ''}
                  </button>
                ) : (
                  <span className="text-[11px] text-amber-600 whitespace-nowrap">
                    {'⚠'} Выберите смежные фрагменты
                  </span>
                )}
                <button onClick={clearFragSelection}
                  className="text-gray-400 hover:text-red-500 text-sm transition ml-1"
                  title="Сбросить выбор">{'✕'}</button>
              </div>
            );
          })()}

          {/* Unfold: разворачивает merged products обратно через sequence slicing */}
          {fragments.some(f => f.subFragments?.length > 0) && selectedFragIndices.length === 0 && (
            <div className="flex justify-center mt-2 shrink-0">
              <button onClick={() => {
                const active = useStore.getState().getActive();
                if (!active) return;

                const expanded = [];
                for (const frag of active.fragments) {
                  if (frag.subFragments?.length > 0) {
                    let off = 0;
                    for (const sub of frag.subFragments) {
                      expanded.push({
                        id: `f${Date.now()}_${Math.random().toString(36).slice(2,5)}`,
                        name: sub.name, type: sub.type,
                        sequence: frag.sequence.slice(off, off + sub.length),
                        length: sub.length, strand: 1, needsAmplification: true,
                        annotations: (frag.annotations || [])
                          .filter(a => a.sourceFragment === sub.name)
                          .map(a => ({ ...a, start: a.start - off, end: a.end - off })),
                      });
                      off += sub.length;
                    }
                  } else {
                    expanded.push(frag);
                  }
                }

                const asmType = active.assemblyType || 'overlap';
                const isCirc = active.circular || false;
                const count = expectedJunctionCount(expanded, isCirc); // K12 / V17
                const newJunctions = Array.from({ length: count }, () => ({
                  type: asmType === 'golden_gate' ? 'golden_gate' : 'overlap',
                  overlapMode: 'split', overlapLength: 30, tmTarget: 62, calcMode: 'length',
                }));

                useStore.getState().pushUndo();
                useStore.getState().updateActive({
                  fragments: expanded, junctions: newJunctions,
                  completed: false, product: null,
                  calculated: false,
                });
              }}
                className="px-4 py-1.5 bg-white border-2 border-green-400 text-green-700 rounded-xl text-sm font-semibold
                  hover:bg-green-50 transition shadow-sm flex items-center gap-2">
                <span className="text-base">{'🔍'}</span>
                Развернуть склейки
              </button>
            </div>
          )}

          {/* Hint when nothing selected */}
          {n >= 2 && selectedFragIndices.length === 0 && !fragments.some(f => f.subFragments?.length > 0) && (
            <div className="text-center mt-1 shrink-0">
              <span className="text-[9px] text-gray-400">Ctrl+Click на 2+ смежных фрагмента {'→'} склейка</span>
            </div>
          )}

          {/* Summary line */}
          <div className="text-[10px] text-gray-500 mt-1 select-none shrink-0">
            Итого: {totalBp} п.н.
            {' '}{circular ? 'кольцевой' : 'линейный'}
            {' '}&middot; {n} фрагм. &middot; {junctions.length} {junctions.length === 1 ? 'стык' : 'стыков'}
          </div>
        </>
      )}
      </div>

      {/* Resize handle */}
      {n > 0 && (
        <div onMouseDown={onResizeStart}
          className="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize
                     flex items-center justify-center group hover:bg-blue-50 transition-colors">
          <div className="w-10 h-1 rounded-full bg-gray-300 group-hover:bg-blue-400 transition-colors" />
        </div>
      )}
    </div>
  );
}
