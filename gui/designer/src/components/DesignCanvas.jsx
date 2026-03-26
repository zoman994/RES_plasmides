import { useState, useRef, useEffect, useCallback } from 'react';
import { useDrop } from 'react-dnd';
import PartBlock from './PartBlock';
import JunctionBlock from './JunctionBlock';
import JunctionDNA from './JunctionDNA';
import { getFragColor, isMarker } from '../theme';
import { t } from '../i18n';

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
  fragments, junctions, circular, onToggleCircular,
  onDrop, onRemove, onToggleAmplification, onJunctionChange, onReorder, onFlip,
  calculated, pcrSizes = [], onSplitSignal, onEditDomains, onEditSequence, primers = [],
}) {
  const [{ isOver }, drop] = useDrop({
    accept: 'PART',
    drop: (item) => onDrop(item.part),
    collect: m => ({ isOver: m.isOver() }),
  });

  const [zoom, setZoom] = useState(() => {
    const saved = localStorage.getItem('pvcs-canvas-zoom');
    return saved ? parseInt(saved) : 100;
  });
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

  const totalBp = fragments.reduce((s, f) => s + (f.length || 0), 0);
  const n = fragments.length;
  const hasPrimers = calculated && primers.length > 0;

  // Persist zoom
  useEffect(() => { localStorage.setItem('pvcs-canvas-zoom', String(zoom)); }, [zoom]);

  const fitToView = useCallback(() => {
    const scale = n <= 4 ? 1 : Math.max(0.45, 1 - (n - 4) * 0.1);
    const totalW = fragments.reduce((s, f) => s + fragmentWidthEstimate(f.length) * scale, 0)
      + Math.max(0, n - 1) * 55 + 60;
    const containerW = scrollRef.current?.clientWidth || 800;
    setZoom(Math.max(30, Math.min(100, Math.floor(containerW / totalW * 100))));
  }, [fragments, n]);

  // Auto-fit when fragment count changes or primers are calculated
  const prevN = useRef(n);
  const prevHasPrimers = useRef(hasPrimers);
  useEffect(() => {
    const nChanged = n > 0 && n !== prevN.current;
    const primersJustCalculated = hasPrimers && !prevHasPrimers.current;
    if (nChanged || primersJustCalculated) {
      const tm = setTimeout(fitToView, 100);
      prevN.current = n;
      prevHasPrimers.current = hasPrimers;
      return () => clearTimeout(tm);
    }
    prevN.current = n;
    prevHasPrimers.current = hasPrimers;
  }, [n, hasPrimers, fitToView]);

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
        flex flex-col shrink-0
        ${isOver ? 'border-2 border-blue-400 bg-blue-50/40' : 'border border-gray-200'}`}
      style={{
        height: n > 0 ? canvasH : undefined,
        minHeight: n > 0 ? 200 : 180,
        maxHeight: 800,
        backgroundColor: '#ffffff',
        backgroundImage: 'radial-gradient(#e0e2e6 1px, transparent 1px)',
        backgroundSize: '20px 20px',
      }}
      >

      {n === 0 ? (
        <div className="flex-1 flex items-center justify-center text-gray-400 text-sm select-none">
          {t('Drag parts here')}
        </div>
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
          </div>

          {/* Scrollable + zoomable blocks */}
          <div ref={scrollRef} className="flex-1 overflow-x-auto overflow-y-auto w-full">
            <div ref={blocksRowRef} className="py-4 px-4 gap-1 w-fit"
              style={{
                display: 'flex', alignItems: 'center', overflow: 'visible',
                transform: `scale(${zoom / 100})`, transformOrigin: 'left top',
                minHeight: zoom < 100 ? `${Math.ceil(100 / zoom * (hasPrimers ? 110 : 70))}px` : undefined,
              }}>
              <div className={`w-1.5 bg-gray-300 rounded-l shrink-0 ${hasPrimers ? 'h-[72px]' : 'h-14'}`} />

              {fragments.map((frag, i) => {
                const fwdPrimer = primers.find(p => p.direction === 'forward' && p.name.includes(frag.name)) || null;
                const revPrimer = primers.find(p => p.direction === 'reverse' && p.name.includes(frag.name)) || null;

                return (
                  <div key={frag.id || i} className="flex items-center">
                    <div className="mx-1">
                      <PartBlock fragment={frag} index={i} fragmentCount={n}
                        onRemove={onRemove} onToggleAmplification={onToggleAmplification}
                        onReorder={onReorder} onFlip={onFlip} pcrSize={pcrSizes[i]}
                        onSplitSignal={onSplitSignal} onEditDomains={onEditDomains} onEditSequence={onEditSequence}
                        fwdPrimer={fwdPrimer} revPrimer={revPrimer}
                        circularHint={circular && (i === 0 || i === n - 1) ? (i === 0 ? 'first' : 'last') : null} />
                    </div>
                    {i < junctions.length && (i < n - 1 || circular) && (
                      <div className="flex flex-col items-center shrink-0" style={{ minWidth: 50 }}>
                        <JunctionBlock junction={junctions[i]} index={i}
                          leftName={frag.name} rightName={fragments[(i + 1) % n]?.name || '?'}
                          leftPCR={frag.needsAmplification !== false}
                          rightPCR={fragments[(i + 1) % n]?.needsAmplification !== false}
                          onChange={cfg => onJunctionChange(i, cfg)} />
                        <JunctionDNA junction={junctions[i]} calculated={calculated}
                          primers={primers}
                          leftFragment={frag} rightFragment={fragments[(i + 1) % n]}
                          leftColor={fragColor(frag, i)}
                          rightColor={fragColor(fragments[(i + 1) % n], (i + 1) % n)} />
                      </div>
                    )}
                  </div>
                );
              })}

              {!circular && <div className={`w-1.5 bg-gray-300 rounded-r shrink-0 ${hasPrimers ? 'h-[72px]' : 'h-14'}`} />}
            </div>
            {/* Circular arc — inside scroll container, right after blocks row */}
            {circular && n > 1 && (
              <div className="relative mx-4" style={{ marginTop: -8 }}>
                <div className="border-b-2 border-l-2 border-r-2 border-dashed border-blue-400 rounded-b-[20px] h-4 mx-2 opacity-40" />
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 bg-white px-2 rounded">
                  <span className="text-[9px] font-bold text-blue-500">{'⟳'} замыкание</span>
                </div>
              </div>
            )}
          </div>

          {/* Summary line */}
          <div className="text-[10px] text-gray-500 mt-1 select-none shrink-0">
            Итого: {totalBp} п.н.
            {' '}{circular ? 'кольцевой' : 'линейный'}
            {' '}&middot; {n} фрагм. &middot; {junctions.length} {junctions.length === 1 ? 'стык' : 'стыков'}
          </div>
        </>
      )}

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
