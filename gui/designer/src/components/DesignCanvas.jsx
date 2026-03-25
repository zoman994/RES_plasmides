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
  calculated, pcrSizes = [], onSplitSignal, onEditDomains, primers = [],
}) {
  const [{ isOver }, drop] = useDrop({
    accept: 'PART',
    drop: (item) => onDrop(item.part),
    collect: m => ({ isOver: m.isOver() }),
  });

  const [zoom, setZoom] = useState(100);
  const canvasRef = useRef(null);
  const scrollRef = useRef(null);

  const totalBp = fragments.reduce((s, f) => s + (f.length || 0), 0);
  const n = fragments.length;
  const hasPrimers = calculated && primers.length > 0;

  const fitToView = useCallback(() => {
    const scale = n <= 4 ? 1 : Math.max(0.45, 1 - (n - 4) * 0.1);
    const totalW = fragments.reduce((s, f) => s + fragmentWidthEstimate(f.length) * scale, 0)
      + Math.max(0, n - 1) * 55 + 60;
    const containerW = scrollRef.current?.clientWidth || 800;
    setZoom(Math.max(30, Math.min(100, Math.floor(containerW / totalW * 100))));
  }, [fragments, n]);

  // Auto-fit when fragments change
  useEffect(() => {
    if (n > 0) {
      // Defer to let refs attach
      const t = setTimeout(fitToView, 50);
      return () => clearTimeout(t);
    }
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

  return (
    <div ref={(el) => { drop(el); canvasRef.current = el; }}
      className={`border-2 border-dashed rounded-xl px-4 py-2
        flex flex-col items-center transition
        ${isOver ? 'border-blue-400 bg-blue-50/40' : 'border-gray-200 bg-white'}
        ${n === 0 ? 'min-h-[180px] justify-center' : ''}`}>

      {n === 0 ? (
        <div className="text-gray-400 text-sm select-none">
          {t('Drag parts here')}
        </div>
      ) : (
        <>
          {/* Top bar — compact */}
          <div className="flex items-center gap-2 mb-1 select-none w-full">
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
          <div ref={scrollRef} className="overflow-x-auto max-w-full w-full">
            <div className="py-4 px-4 gap-1"
              style={{
                display: 'flex', alignItems: 'center', overflow: 'visible',
                transform: `scale(${zoom / 100})`, transformOrigin: 'left center',
                minHeight: zoom < 100 ? `${Math.ceil(100 / zoom * (hasPrimers ? 110 : 70))}px` : undefined,
              }}>
              <div className={`w-1.5 bg-gray-300 rounded-l shrink-0 ${hasPrimers ? 'h-[72px]' : 'h-14'}`} />

              {fragments.map((frag, i) => {
                const fwdPrimer = primers.find(p => p.direction === 'forward' && p.name.includes(frag.name)) || null;
                const revPrimer = primers.find(p => p.direction === 'reverse' && p.name.includes(frag.name)) || null;
                const leftIdx = circular ? (i - 1 + n) % n : i - 1;
                const rightIdx = circular ? (i + 1) % n : i + 1;
                const leftNeighborColor = (leftIdx >= 0 && leftIdx < n && leftIdx !== i) ? fragColor(fragments[leftIdx], leftIdx) : null;
                const rightNeighborColor = (rightIdx >= 0 && rightIdx < n && rightIdx !== i) ? fragColor(fragments[rightIdx], rightIdx) : null;

                return (
                  <div key={frag.id || i} className="flex items-center">
                    <div className="mx-1">
                      <PartBlock fragment={frag} index={i} fragmentCount={n}
                        onRemove={onRemove} onToggleAmplification={onToggleAmplification}
                        onReorder={onReorder} onFlip={onFlip} pcrSize={pcrSizes[i]}
                        onSplitSignal={onSplitSignal} onEditDomains={onEditDomains}
                        fwdPrimer={fwdPrimer} revPrimer={revPrimer}
                        leftNeighborColor={leftNeighborColor}
                        rightNeighborColor={rightNeighborColor} />
                    </div>
                    {i < junctions.length && (i < n - 1 || circular) && (
                      <div className="flex flex-col items-center shrink-0" style={{ minWidth: 50 }}>
                        <JunctionBlock junction={junctions[i]} index={i}
                          leftName={frag.name} rightName={fragments[(i + 1) % n]?.name || '?'}
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

              {circular && n > 1 && (
                <div className="text-[9px] text-blue-500 font-medium ml-1">&rarr;1st</div>
              )}
              <div className={`w-1.5 bg-gray-300 rounded-r shrink-0 ${hasPrimers ? 'h-[72px]' : 'h-14'}`} />
            </div>
          </div>

          <div className="text-[10px] text-gray-500 mt-1 select-none">
            Итого: {totalBp >= 1000 ? `${(totalBp / 1000).toFixed(1)} т.п.н.` : `${totalBp} п.н.`}
            {' '}{circular ? 'кольцевой' : 'линейный'}
            {' '}&middot; {n} фрагм. &middot; {junctions.length} {junctions.length === 1 ? 'стык' : 'стыков'}
          </div>
        </>
      )}
    </div>
  );
}
