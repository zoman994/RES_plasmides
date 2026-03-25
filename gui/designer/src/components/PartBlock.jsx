import { useDrag, useDrop } from 'react-dnd';
import { getFragColor, isMarker, darken } from '../theme';

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
  pcrSize, onSplitSignal, fragmentCount,
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
      {/* Drop indicator */}
      {isOver && <div className="absolute -left-1 top-0 bottom-0 w-0.5 bg-blue-500 rounded" />}
      {/* No-PCR badge */}
      {!fragment.needsAmplification && (
        <div className="absolute -top-5 left-0 right-0 text-center z-10">
          <span className="text-[9px] bg-yellow-100 text-yellow-700 px-1 rounded">no PCR</span>
        </div>
      )}

      {/* ═══ Main colored block ═══ */}
      <div className={`relative flex flex-col rounded-sm select-none
        ${hasPrimers ? 'min-h-[72px]' : 'h-14'}`}
        style={{
          background: color,
          border: dark ? '1px solid #ccc' : 'none',
          width: fragmentWidth(fragment.length, fragmentCount), minWidth: 60,
          borderLeft: fragment.strand === -1 ? `3px solid ${dark ? '#fff' : 'rgba(255,255,255,0.6)'}` : undefined,
        }}
        onDoubleClick={() => onToggleAmplification(index)}
        title="Double-click to toggle PCR amplification">

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
            <span className="text-[9px] mr-0.5" style={{ color: tc, opacity: 0.8 }}>{'→'}</span>
            <span className="text-[7px] truncate max-w-[55px]" style={{ color: tc, opacity: 0.7 }}
              title={fwdPrimer.name}>{primerLabel(fwdPrimer.name)}</span>
            <div className="flex-1 h-[2px] mx-1 rounded" style={{ background: tc, opacity: 0.25 }} />
            <span className="text-[7px]" style={{ color: tc, opacity: 0.6 }}>{fwdPrimer.tmBinding}°</span>
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
          <div className={`flex-1 flex flex-col items-center justify-center px-3
            ${hasPrimers ? 'min-h-[30px]' : ''}`}
            style={{ color: tc }}>
            <div className="flex items-center text-sm font-semibold">
              {fragment.strand === -1 && <span className="text-xs mr-1 opacity-60">&larr;</span>}
              {fragment.name}
              {fragment.strand !== -1 && <span className="text-xs ml-1 opacity-60">&rarr;</span>}
            </div>
            <div className="text-[9px] opacity-50">{fmtSize(fragment.length)}</div>
          </div>
        )}

        {/* ── Reverse primer row (bottom) ── */}
        {revPrimer && (
          <div className="flex items-center h-5 px-2 shrink-0">
            <span className="text-[7px]" style={{ color: tc, opacity: 0.6 }}>{revPrimer.tmBinding}°</span>
            <div className="flex-1 h-[2px] mx-1 rounded" style={{ background: tc, opacity: 0.25 }} />
            <span className="text-[7px] truncate max-w-[55px] text-right" style={{ color: tc, opacity: 0.7 }}
              title={revPrimer.name}>{primerLabel(revPrimer.name)}</span>
            <span className="text-[9px] ml-0.5" style={{ color: tc, opacity: 0.8 }}>{'←'}</span>
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
      {/* Flip button */}
      {onFlip && (
        <button onClick={(e) => { e.stopPropagation(); onFlip(index); }}
          className="absolute -bottom-2 -left-2 w-5 h-5 bg-indigo-500 text-white rounded-full
                     text-[10px] hidden group-hover:flex items-center justify-center
                     hover:bg-indigo-600 z-10"
          title="Перевернуть (reverse complement)">
          {'↻'}
        </button>
      )}
      {/* Fragment splitter (universal) */}
      {onSplitSignal && (
        <button onClick={(e) => { e.stopPropagation(); onSplitSignal(index); }}
          className="absolute -top-2 -left-2 w-5 h-5 bg-orange-400 text-white rounded-full
                     text-[10px] hidden group-hover:flex items-center justify-center
                     hover:bg-orange-500 z-10" title="Разделить фрагмент">
          {'✂'}
        </button>
      )}
      {/* Remove */}
      <button onClick={() => onRemove(index)}
        className="absolute -top-2 -right-2 w-4 h-4 bg-red-500 text-white rounded-full
                   text-[10px] hidden group-hover:flex items-center justify-center
                   hover:bg-red-600 z-10">&times;</button>
    </div>
  );
}
