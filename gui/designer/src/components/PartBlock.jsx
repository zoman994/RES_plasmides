import { useDrag, useDrop } from 'react-dnd';
import { getFragColor, isMarker } from '../theme';
import { getPartDescription } from '../part-descriptions';
import { SBOLIcon } from '../sbol-glyphs';

function fragmentWidth(bp, fragCount = 1) {
  const scale = fragCount <= 4 ? 1 : Math.max(0.45, 1 - (fragCount - 4) * 0.1);
  const minW = Math.round(70 * scale), maxW = Math.round(280 * scale);
  if (!bp || bp <= 20) return minW;
  if (bp >= 10000) return maxW;
  const frac = (Math.log(bp) - Math.log(20)) / (Math.log(10000) - Math.log(20));
  return Math.round(minW + frac * (maxW - minW));
}

function fmtSize(bp) {
  return bp ? `${bp} п.н.` : '0 п.н.';
}

function primerLabel(name) {
  return (name || '').match(/^[A-Za-z]+\d+/)?.[0] || (name || '').slice(0, 8);
}

export default function PartBlock({
  fragment, index, onRemove, onToggleAmplification, onReorder, onFlip,
  pcrSize, onSplitSignal, onEditFragment, fragmentCount,
  fwdPrimer, revPrimer, circularHint,
}) {
  const [{ isDragging }, drag] = useDrag({
    type: 'CANVAS_PART', item: { index },
    collect: m => ({ isDragging: m.isDragging() }),
  });
  const [{ isOver }, drop] = useDrop({
    accept: 'CANVAS_PART',
    drop: (item) => { if (item.index !== index && onReorder) onReorder(item.index, index); },
    collect: m => ({ isOver: m.isOver() }),
  });
  const ref = (el) => { drag(drop(el)); };
  const color = isMarker(fragment.name) ? '#F0E442' : getFragColor(fragment.type, index);
  const hasPrimers = !!(fwdPrimer || revPrimer);

  return (
    <div ref={ref} className={`relative group cursor-grab transition-transform ${isOver ? 'scale-105' : ''}`}
      style={{ opacity: isDragging ? 0.3 : 1, zIndex: 1 }}>
      {isOver && <div className="absolute -left-1 top-0 bottom-0 w-0.5 bg-blue-500 rounded" />}

      {/* ═══ MERGED PRODUCT ═══ */}
      {fragment.subFragments?.length > 0 ? (
        <>
          <div className="relative flex h-16 rounded-lg overflow-hidden border-2 border-green-400 shadow-sm"
            style={{ width: fragmentWidth(fragment.length, fragmentCount), minWidth: 100 }}
            title={`${fragment.name}: ${fragment.subFragments.map(s => s.name).join(' + ')}`}>
            {fragment.subFragments.map((sub, si) => (
              <div key={si} style={{ width: `${sub.pct}%`, backgroundColor: sub.color }}
                className="flex items-end justify-center border-r border-white/30 last:border-r-0"
                title={`${sub.name} (${fmtSize(sub.length)})`}>
                {sub.pct > 12 && <span className="text-[7px] text-white/80 font-medium truncate px-0.5 mb-0.5">{sub.name}</span>}
              </div>
            ))}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-sm font-bold text-white drop-shadow-md truncate max-w-full px-2">{fragment.name}</span>
              <span className="text-[9px] text-white/90 drop-shadow-sm">{fmtSize(fragment.length)}</span>
            </div>
          </div>
          <div className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-green-500 text-white text-[10px] flex items-center justify-center shadow border-2 border-white z-10">✓</div>
        </>
      ) : (
      <>
      {/* No-PCR badge */}
      {!fragment.needsAmplification && (
        <div className="absolute -top-5 left-0 right-0 text-center z-10">
          <span className="text-[9px] bg-yellow-100 text-yellow-700 px-1 rounded">без ПЦР</span>
        </div>
      )}

      {/* ═══ CLEAN CARD BLOCK ═══ */}
      <div className={`relative flex flex-col rounded-lg select-none
        ${isDragging ? 'shadow-xl' : 'shadow-sm hover:shadow-md'}`}
        style={{
          background: `linear-gradient(135deg, ${color}15 0%, ${color}08 100%)`,
          border: `1px solid ${color}30`,
          borderLeft: circularHint === 'first' ? '3px solid #3b82f6' : `4px solid ${color}`,
          borderRight: circularHint === 'last' ? '3px solid #3b82f6' : undefined,
          width: fragmentWidth(fragment.length, fragmentCount), minWidth: 60,
          transition: 'box-shadow 150ms ease',
        }}
        title={getPartDescription(fragment.name, fragment.type).short}>

        {/* Fwd primer — top line */}
        {fwdPrimer && (
          <div className="flex items-center justify-between px-2 pt-1.5 pb-0.5 text-[11px]">
            <span className="text-blue-600 font-medium flex items-center gap-0.5 truncate" title={fwdPrimer.name}>
              <span className="text-blue-500 text-[13px]">{'→'}</span>
              {primerLabel(fwdPrimer.name)}
            </span>
            <span className="text-blue-400 font-mono shrink-0">{fwdPrimer.tmBinding}°</span>
          </div>
        )}

        {/* Fragment center */}
        <div className={`flex-1 flex flex-col items-center justify-center px-2 overflow-hidden
          ${hasPrimers ? 'py-1' : 'py-3'}`}>
          <div className="flex items-center gap-1 max-w-full">
            <span className={`inline-block shrink-0 ${fragment.strand === -1 ? 'scale-x-[-1]' : ''}`}>
              <SBOLIcon type={fragment.type} size={14} color={color} />
            </span>
            <span className="text-xs font-semibold text-gray-800 truncate" title={fragment.name}>{fragment.name}</span>
          </div>
          {/* Domain bar (flips with strand) */}
          {fragment.domains?.length > 0 && (
            <div className={`flex h-2.5 rounded overflow-hidden w-full mt-0.5 ${fragment.strand === -1 ? 'flex-row-reverse' : ''}`}>
              {fragment.domains.map((d, di) => {
                const totalAA = Math.ceil((fragment.sequence || '').length / 3);
                const w = Math.max(3, ((d.endAA - d.startAA + 1) / (totalAA || 1)) * 100);
                return (
                  <div key={di} style={{ width: `${w}%`, backgroundColor: d.color || '#56B4E9' }}
                    className="border-r border-white/30 last:border-0"
                    title={`${d.name}: ${d.startAA}–${d.endAA} а.о.`} />
                );
              })}
            </div>
          )}
          <div className="text-[9px] text-gray-400">{fmtSize(fragment.length)}</div>
        </div>

        {/* Rev primer — bottom line */}
        {revPrimer && (
          <div className="flex items-center justify-between px-2 pb-1.5 pt-0.5 text-[11px]">
            <span className="text-red-400 font-mono shrink-0">{revPrimer.tmBinding}°</span>
            <span className="text-red-600 font-medium flex items-center gap-0.5 truncate" title={revPrimer.name}>
              {primerLabel(revPrimer.name)}
              <span className="text-red-500 text-[13px]">{'←'}</span>
            </span>
          </div>
        )}
      </div>

      {/* PCR size */}
      {pcrSize && (
        <div className="text-center text-[9px] text-green-600 font-medium mt-0.5">
          PCR: {fmtSize(pcrSize)}
        </div>
      )}

      {/* Hover toolbar */}
      <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 hidden group-hover:flex items-center gap-1 z-10
                       bg-white rounded-full shadow border border-gray-200 px-1.5 py-0.5">
        {onFlip && (
          <button onClick={(e) => { e.stopPropagation(); onFlip(index); }}
            className="w-5 h-5 rounded-full text-[10px] flex items-center justify-center hover:bg-indigo-100 text-indigo-600"
            title="Перевернуть (reverse complement)">↻</button>
        )}
        {onSplitSignal && (
          <button onClick={(e) => { e.stopPropagation(); onSplitSignal(index); }}
            className="w-5 h-5 rounded-full text-[10px] flex items-center justify-center hover:bg-orange-100 text-orange-600"
            title="Разделить фрагмент">✂</button>
        )}
        {onEditFragment && (
          <button onClick={(e) => { e.stopPropagation(); onEditFragment(index); }}
            className="w-5 h-5 rounded-full text-[10px] flex items-center justify-center hover:bg-blue-100 text-blue-600"
            title="Редактировать">✏️</button>
        )}
        <button onClick={(e) => { e.stopPropagation(); onToggleAmplification(index); }}
          className={`text-[8px] px-1.5 py-0.5 rounded-full font-medium
            ${fragment.needsAmplification ? 'bg-blue-50 text-blue-600 hover:bg-blue-100' : 'bg-amber-50 text-amber-600 hover:bg-amber-100'}`}
          title={fragment.needsAmplification ? 'Отключить ПЦР' : 'Включить ПЦР'}>
          {fragment.needsAmplification ? 'ПЦР' : 'нет'}
        </button>
        <button onClick={(e) => { e.stopPropagation(); onRemove(index); }}
          className="w-5 h-5 rounded-full text-[10px] flex items-center justify-center hover:bg-red-100 text-red-500"
          title="Удалить">×</button>
      </div>
      </>
      )}
    </div>
  );
}
