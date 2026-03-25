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
  calculated, pcrSizes = [], onSplitSignal, primers = [],
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

  // Fit to view
  const fitToView = useCallback(() => {
    const totalW = fragments.reduce((s, f) => s + fragmentWidthEstimate(f.length), 0)
      + Math.max(0, n - 1) * 60 + 80; // junctions + padding
    const containerW = scrollRef.current?.clientWidth || 800;
    setZoom(Math.max(30, Math.min(100, Math.floor(containerW / totalW * 100))));
  }, [fragments, n]);

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
      className={`flex-1 min-h-[220px] border-2 border-dashed rounded-xl p-4
        flex flex-col items-center justify-center transition
        ${isOver ? 'border-blue-400 bg-blue-50/40' : 'border-gray-200 bg-white'}`}>

      {n === 0 ? (
        <div className="text-gray-400 text-sm select-none">
          {t('Drag parts here')}
        </div>
      ) : (
        <>
          {/* Top bar: direction + zoom + topology */}
          <div className="flex items-center gap-3 mb-2 select-none w-full">
            <div className="text-[11px] text-gray-400">
              5' &rarr;&rarr;&rarr; сборка конструкции &rarr;&rarr;&rarr; 3'
            </div>
            <div className="flex-1" />

            {/* Zoom controls */}
            <div className="flex items-center gap-1 text-xs text-gray-400">
              <button onClick={() => setZoom(z => Math.max(30, z - 10))}
                className="w-5 h-5 rounded border border-gray-200 flex items-center justify-center hover:bg-gray-100 text-[10px]">−</button>
              <span className="w-8 text-center font-mono text-[10px]">{zoom}%</span>
              <button onClick={() => setZoom(z => Math.min(150, z + 10))}
                className="w-5 h-5 rounded border border-gray-200 flex items-center justify-center hover:bg-gray-100 text-[10px]">+</button>
              {n > 2 && (
                <button onClick={fitToView}
                  className="px-1.5 h-5 rounded border border-gray-200 text-[9px] hover:bg-gray-100 ml-0.5">
                  Вписать
                </button>
              )}
            </div>

            <button onClick={onToggleCircular}
              className={`text-[11px] px-3 py-1 rounded-full font-medium transition
                ${circular ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
              {circular ? `⭕ ${t('Circular')}` : `📏 ${t('Linear')}`}
            </button>
          </div>

          {/* Scrollable + zoomable canvas */}
          <div ref={scrollRef} className="overflow-x-auto max-w-full w-full">
            <div className="py-6 px-6 gap-1"
              style={{
                display: 'flex', alignItems: 'center', overflow: 'visible',
                transform: `scale(${zoom / 100})`, transformOrigin: 'left center',
                minHeight: zoom < 100 ? `${Math.ceil(100 / zoom * (hasPrimers ? 120 : 80))}px` : undefined,
              }}>
              {/* 5' cap */}
              <div className={`w-1.5 bg-gray-300 rounded-l shrink-0 ${hasPrimers ? 'h-[72px]' : 'h-14'}`} />

              {fragments.map((frag, i) => {
                const fwdPrimer = primers.find(p => p.direction === 'forward' && p.name.includes(frag.name)) || null;
                const revPrimer = primers.find(p => p.direction === 'reverse' && p.name.includes(frag.name)) || null;

                const leftIdx = circular ? (i - 1 + n) % n : i - 1;
                const rightIdx = circular ? (i + 1) % n : i + 1;
                const leftNeighborColor = (leftIdx >= 0 && leftIdx < n && leftIdx !== i)
                  ? fragColor(fragments[leftIdx], leftIdx) : null;
                const rightNeighborColor = (rightIdx >= 0 && rightIdx < n && rightIdx !== i)
                  ? fragColor(fragments[rightIdx], rightIdx) : null;

                return (
                  <div key={frag.id || i} className="flex items-center">
                    <div className="mx-1">
                      <PartBlock fragment={frag} index={i} fragmentCount={n}
                        onRemove={onRemove} onToggleAmplification={onToggleAmplification}
                        onReorder={onReorder} onFlip={onFlip} pcrSize={pcrSizes[i]}
                        onSplitSignal={onSplitSignal}
                        fwdPrimer={fwdPrimer} revPrimer={revPrimer}
                        leftNeighborColor={leftNeighborColor}
                        rightNeighborColor={rightNeighborColor} />
                    </div>
                    {i < junctions.length && (i < n - 1 || circular) && (
                      <div className="flex flex-col items-center shrink-0" style={{ minWidth: 50 }}>
                        <JunctionBlock
                          junction={junctions[i]} index={i}
                          leftName={frag.name}
                          rightName={fragments[(i + 1) % n]?.name || '?'}
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

          <div className="text-xs text-gray-500 mt-2 select-none">
            Итого: {totalBp >= 1000 ? `${(totalBp / 1000).toFixed(1)} т.п.н.` : `${totalBp} п.н.`}
            {' '}{circular ? 'кольцевой' : 'линейный'}
            {' '}&middot; {n} фрагм. &middot; {junctions.length} {junctions.length === 1 ? 'стык' : 'стыков'}
          </div>
        </>
      )}
    </div>
  );
}
