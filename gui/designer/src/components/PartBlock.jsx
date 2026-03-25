import { useDrag, useDrop } from 'react-dnd';
import { getFragColor, isMarker, darken } from '../theme';
import { getPartDescription } from '../part-descriptions';
import { SBOLIcon } from '../sbol-glyphs';

function needsDarkText(hex) {
  if (!hex || hex[0] !== '#') return false;
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) > 0.6;
}

function primerLabel(name) {
  const m = (name || '').match(/^[A-Za-z]+\d+/);
  return m ? m[0] : (name || '').slice(0, 8);
}

function fragmentWidth(bp, fragCount = 1) {
  const scale = fragCount <= 4 ? 1 : Math.max(0.45, 1 - (fragCount - 4) * 0.1);
  const minW = Math.round(70 * scale), maxW = Math.round(280 * scale);
  const minBp = 20, maxBp = 10000;
  if (!bp || bp <= minBp) return minW;
  if (bp >= maxBp) return maxW;
  const frac = (Math.log(bp) - Math.log(minBp)) / (Math.log(maxBp) - Math.log(minBp));
  return Math.round(minW + frac * (maxW - minW));
}

function fmtSize(bp) {
  if (!bp) return '0 п.н.';
  return bp >= 1000 ? `${(bp / 1000).toFixed(1)} т.п.н.` : `${bp} п.н.`;
}

export default function PartBlock({
  fragment, index, onRemove, onToggleAmplification, onReorder, onFlip,
  pcrSize, onSplitSignal, onEditDomains, onEditSequence, fragmentCount,
  fwdPrimer, revPrimer, leftNeighborColor, rightNeighborColor,
}) {
  const [{ isDragging }, drag] = useDrag({
    type: 'CANVAS_PART',
    item: { index },
    collect: m => ({ isDragging: m.isDragging() }),
  });

  const [{ isOver }, drop] = useDrop({
    accept: 'CANVAS_PART',
    drop: (item) => {
      if (item.index !== index && onReorder) onReorder(item.index, index);
    },
    collect: m => ({ isOver: m.isOver() }),
  });

  const ref = (el) => { drag(drop(el)); };
  const color = isMarker(fragment.name) ? '#F0E442' : getFragColor(fragment.type, index);
  const dark = needsDarkText(color);
  const tc = dark ? '#333' : '#fff';
  const hasPrimers = !!(fwdPrimer || revPrimer);

  const fwdTail = fwdPrimer?.tailSequence;
  const revTail = revPrimer?.tailSequence;

  return (
    <div ref={ref} className={`relative group cursor-grab transition-transform
      ${isOver ? 'scale-105' : ''}`}
      style={{ opacity: isDragging ? 0.3 : 1, zIndex: 1, overflow: 'visible' }}>
      {isOver && <div className="absolute -left-1 top-0 bottom-0 w-0.5 bg-blue-500 rounded" />}

      {/* ═══ MERGED PRODUCT BLOCK ═══ */}
      {fragment.subFragments?.length > 0 ? (
        <>
          <div className="relative flex h-16 rounded-lg overflow-hidden border-2 border-green-400 shadow-sm"
            style={{ width: fragmentWidth(fragment.length, fragmentCount), minWidth: 100 }}
            title={`${fragment.name}: ${fragment.subFragments.map(s => s.name).join(' + ')}`}>
            {fragment.subFragments.map((sub, si) => (
              <div key={si} style={{ width: `${sub.pct}%`, backgroundColor: sub.color }}
                className="flex items-end justify-center border-r border-white/30 last:border-r-0"
                title={`${sub.name} (${fmtSize(sub.length)})`}>
                {sub.pct > 12 && (
                  <span className="text-[7px] text-white/80 font-medium truncate px-0.5 mb-0.5">{sub.name}</span>
                )}
              </div>
            ))}
            {/* Name overlay */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-sm font-bold text-white drop-shadow-md truncate max-w-full px-2">{fragment.name}</span>
              <span className="text-[9px] text-white/90 drop-shadow-sm">{fmtSize(fragment.length)}</span>
            </div>
          </div>
          {/* ✓ badge */}
          <div className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-green-500 text-white text-[10px]
                          flex items-center justify-center shadow border-2 border-white z-10">✓</div>
          {fragment.concentration && (
            <div className="text-center text-[9px] text-green-600 font-medium mt-0.5">
              {fragment.concentration} нг/µл
            </div>
          )}
        </>
      ) : (
      <>
      {/* No-PCR badge */}
      {!fragment.needsAmplification && !fragment.subFragments && (
        <div className="absolute -top-5 left-0 right-0 text-center z-10">
          <span className="text-[9px] bg-yellow-100 text-yellow-700 px-1 rounded">без ПЦР</span>
        </div>
      )}

      {/* ═══ Main block — card style with left color bar ═══ */}
      <div className={`relative flex flex-col rounded-lg select-none
        ${hasPrimers ? 'min-h-[72px]' : 'h-14'}
        ${isDragging ? 'shadow-xl' : 'shadow-sm hover:shadow-md'}`}
        style={{
          background: `linear-gradient(135deg, ${color}15 0%, ${color}08 100%)`,
          border: `1px solid ${color}30`,
          borderLeft: `4px solid ${color}`,
          width: fragmentWidth(fragment.length, fragmentCount), minWidth: 60,
          transition: 'box-shadow 150ms ease, transform 150ms ease',
        }}
        onDoubleClick={() => onToggleAmplification(index)}
        title={getPartDescription(fragment.name, fragment.type).short || 'Двойной клик — вкл/выкл ПЦР'}>

        {/* ── Fwd tail bar — extends LEFT from block edge (top area) ── */}
        {fwdTail && leftNeighborColor && (
          <div className="absolute right-full top-1 flex items-center h-5 rounded-l px-1.5 text-[8px] font-bold whitespace-nowrap z-[2]"
            style={{
              minWidth: 24,
              backgroundColor: leftNeighborColor + '55',
              borderLeft: `2px solid ${leftNeighborColor}`,
              borderTop: `1px solid ${leftNeighborColor}60`,
              borderBottom: `1px solid ${leftNeighborColor}60`,
              color: darken(leftNeighborColor, 0.3),
            }}
            title={`Tail (от соседа): ${fwdTail} (${fwdTail.length} п.н.)`}>
            {fwdTail.length}
          </div>
        )}

        {/* ── Rev tail bar — extends RIGHT from block edge (bottom area) ── */}
        {revTail && rightNeighborColor && (
          <div className="absolute left-full bottom-1 flex items-center h-5 rounded-r px-1.5 text-[8px] font-bold whitespace-nowrap z-[2]"
            style={{
              minWidth: 24,
              backgroundColor: rightNeighborColor + '55',
              borderRight: `2px solid ${rightNeighborColor}`,
              borderTop: `1px solid ${rightNeighborColor}60`,
              borderBottom: `1px solid ${rightNeighborColor}60`,
              color: darken(rightNeighborColor, 0.3),
            }}
            title={`Tail (от соседа): ${revTail} (${revTail.length} п.н.)`}>
            {revTail.length}
          </div>
        )}

        {/* ── Forward primer row (top) ── */}
        {fwdPrimer && (
          <div className="flex items-center h-5 px-2 shrink-0">
            <span className="text-[9px] mr-0.5 text-blue-500">{'→'}</span>
            <span className="text-[7px] truncate max-w-[55px] text-gray-500"
              title={fwdPrimer.name}>{primerLabel(fwdPrimer.name)}</span>
            <div className="flex-1 h-[2px] mx-1 rounded" style={{ background: color, opacity: 0.2 }} />
            <span className="text-[7px] text-gray-400">{fwdPrimer.tmBinding}°</span>
          </div>
        )}

        {/* ── Fragment content (center) ── */}
        {fragment.subParts?.length > 0 ? (
          <div className={`flex-1 flex items-center overflow-hidden ${hasPrimers ? 'min-h-[30px]' : ''}`}>
            {fragment.subParts.map((sp, si) => {
              const spColor = getFragColor(sp.type, si);
              return (
                <div key={si} className="h-full flex items-center px-1 text-[8px]
                                         border-r border-white/20 last:border-r-0"
                  style={{ background: spColor, flex: 1, color: needsDarkText(spColor) ? '#333' : '#fff' }}>
                  {sp.name}
                </div>
              );
            })}
          </div>
        ) : (
          <div className={`flex-1 flex flex-col items-center justify-center px-2 overflow-hidden
            ${hasPrimers ? 'min-h-[30px]' : ''}`}
            title={fragment.name}>
            <div className="flex items-center gap-1 max-w-full">
              <SBOLIcon type={fragment.type} size={14} color={color} />
              {fragment.strand === -1 && <span className="text-[10px] opacity-50 shrink-0">&larr;</span>}
              <span className="text-xs font-semibold text-gray-800 truncate">{fragment.name}</span>
              {fragment.strand !== -1 && <span className="text-[10px] opacity-50 shrink-0">&rarr;</span>}
            </div>
            {/* Domain bar for CDS with domains */}
            {fragment.domains?.length > 0 && (
              <div className="flex h-3 rounded overflow-hidden w-full mx-1 mt-0.5">
                {fragment.domains.map((d, di) => {
                  const totalAA = Math.ceil((fragment.sequence || '').length / 3);
                  const widthPct = Math.max(3, ((d.endAA - d.startAA + 1) / (totalAA || 1)) * 100);
                  return (
                    <div key={di} style={{ width: `${widthPct}%`, backgroundColor: d.color || '#56B4E9' }}
                      className="flex items-center justify-center text-[6px] text-white font-medium truncate border-r border-white/30 last:border-0"
                      title={`${d.name} (${d.type}): ${d.startAA}–${d.endAA} а.о.`}>
                      {widthPct > 10 ? d.name : ''}
                    </div>
                  );
                })}
              </div>
            )}
            <div className="text-[9px] text-gray-400">{fmtSize(fragment.length)}</div>
          </div>
        )}

        {/* ── Reverse primer row (bottom) ── */}
        {revPrimer && (
          <div className="flex items-center h-5 px-2 shrink-0">
            <span className="text-[7px] text-gray-400">{revPrimer.tmBinding}°</span>
            <div className="flex-1 h-[2px] mx-1 rounded" style={{ background: color, opacity: 0.2 }} />
            <span className="text-[7px] truncate max-w-[55px] text-right text-gray-500"
              title={revPrimer.name}>{primerLabel(revPrimer.name)}</span>
            <span className="text-[9px] ml-0.5 text-red-500">{'←'}</span>
          </div>
        )}
      </div>

      {/* PCR size (below block) */}
      {pcrSize && (
        <div className="text-center text-[9px] text-blue-500 font-medium mt-0.5">
          PCR: {fmtSize(pcrSize)}
        </div>
      )}
      {/* Intron badge */}
      {fragment.has_introns && fragment.introns?.length > 0 && (
        <div className="text-center text-[8px] bg-gray-200 text-gray-600 rounded px-1 mx-auto w-fit">
          {fragment.introns.length} intron{fragment.introns.length > 1 ? 's' : ''}
        </div>
      )}
      {/* ── Hover toolbar (bottom) ── */}
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
        {fragment.type === 'CDS' && onEditDomains && (
          <button onClick={(e) => { e.stopPropagation(); onEditDomains(index); }}
            className="w-5 h-5 rounded-full text-[9px] flex items-center justify-center hover:bg-teal-100 text-teal-600"
            title="Разметить домены">📐</button>
        )}
        {onEditSequence && (
          <button onClick={(e) => { e.stopPropagation(); onEditSequence(index); }}
            className="w-5 h-5 rounded-full text-[10px] flex items-center justify-center hover:bg-blue-100 text-blue-600"
            title="Редактировать последовательность">✏️</button>
        )}
        <button onClick={(e) => { e.stopPropagation(); onToggleAmplification(index); }}
          className={`text-[8px] px-1.5 py-0.5 rounded-full font-medium
            ${fragment.needsAmplification ? 'bg-blue-50 text-blue-600 hover:bg-blue-100' : 'bg-amber-50 text-amber-600 hover:bg-amber-100'}`}
          title={fragment.needsAmplification ? 'Отключить ПЦР (фрагмент из пробирки)' : 'Включить ПЦР (нужна амплификация)'}>
          {fragment.needsAmplification ? 'ПЦР' : 'нет'}
        </button>
        <button onClick={(e) => { e.stopPropagation(); onRemove(index); }}
          className="w-5 h-5 rounded-full text-[10px] flex items-center justify-center hover:bg-red-100 text-red-500"
          title="Удалить фрагмент">×</button>
      </div>
      </>
      )}
    </div>
  );
}
