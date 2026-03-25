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
  // "IS001_fwd_PglaA" → "IS001"
  const m = (name || '').match(/^[A-Za-z]+\d+/);
  return m ? m[0] : (name || '').slice(0, 8);
}

export default function PartBlock({
  fragment, index, onRemove, onToggleAmplification, onReorder,
  pcrSize, onSplitSignal,
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

  return (
    <div ref={ref} className={`relative group cursor-grab transition-transform
      ${isOver ? 'scale-105' : ''}`}
      style={{ opacity: isDragging ? 0.3 : 1, zIndex: 1 }}>
      {/* Drop indicator */}
      {isOver && <div className="absolute -left-1 top-0 bottom-0 w-0.5 bg-blue-500 rounded" />}
      {/* No-PCR badge */}
      {!fragment.needsAmplification && (
        <div className="absolute -top-5 left-0 right-0 text-center z-10">
          <span className="text-[9px] bg-yellow-100 text-yellow-700 px-1 rounded">no PCR</span>
        </div>
      )}

      {/* ═══ Main colored block ═══ */}
      <div className={`relative flex flex-col min-w-[100px] rounded-sm select-none
        ${hasPrimers ? 'min-h-[72px]' : 'h-14'}`}
        style={{ background: color, border: dark ? '1px solid #ccc' : 'none' }}
        onDoubleClick={() => onToggleAmplification(index)}
        title="Double-click to toggle PCR amplification">

        {/* ── Forward primer row (top) ── */}
        {fwdPrimer && (
          <div className="relative flex items-center h-5 px-2 shrink-0">
            {/* Tail extending LEFT — colored as LEFT neighbor */}
            {fwdPrimer.tailSequence && leftNeighborColor && (
              <div className="absolute right-full top-0 bottom-0 flex items-center px-1.5 rounded-l-sm text-[7px] font-mono whitespace-nowrap"
                style={{
                  backgroundColor: leftNeighborColor + '40',
                  borderLeft: `2px solid ${leftNeighborColor}`,
                  color: darken(leftNeighborColor, 0.3),
                }}
                title={`Tail: ${fwdPrimer.tailSequence} (${fwdPrimer.tailSequence.length}bp)`}>
                {fwdPrimer.tailSequence.length}
              </div>
            )}
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
          <div className={`flex-1 flex items-center justify-center text-sm font-semibold px-4
            ${hasPrimers ? 'min-h-[30px]' : ''}`}
            style={{ color: tc }}>
            {fragment.strand === -1 && <span className="text-xs mr-1 opacity-60">&larr;</span>}
            {fragment.name}
            {fragment.strand !== -1 && <span className="text-xs ml-1 opacity-60">&rarr;</span>}
          </div>
        )}

        {/* ── Reverse primer row (bottom) ── */}
        {revPrimer && (
          <div className="relative flex items-center h-5 px-2 shrink-0">
            <span className="text-[7px]" style={{ color: tc, opacity: 0.6 }}>{revPrimer.tmBinding}°</span>
            <div className="flex-1 h-[2px] mx-1 rounded" style={{ background: tc, opacity: 0.25 }} />
            <span className="text-[7px] truncate max-w-[55px] text-right" style={{ color: tc, opacity: 0.7 }}
              title={revPrimer.name}>{primerLabel(revPrimer.name)}</span>
            <span className="text-[9px] ml-0.5" style={{ color: tc, opacity: 0.8 }}>{'←'}</span>
            {/* Tail extending RIGHT — colored as RIGHT neighbor */}
            {revPrimer.tailSequence && rightNeighborColor && (
              <div className="absolute left-full top-0 bottom-0 flex items-center px-1.5 rounded-r-sm text-[7px] font-mono whitespace-nowrap"
                style={{
                  backgroundColor: rightNeighborColor + '40',
                  borderRight: `2px solid ${rightNeighborColor}`,
                  color: darken(rightNeighborColor, 0.3),
                }}
                title={`Tail: ${revPrimer.tailSequence} (${revPrimer.tailSequence.length}bp)`}>
                {revPrimer.tailSequence.length}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Length + PCR size */}
      <div className="text-center text-[10px] text-gray-400 mt-0.5">
        {fragment.length >= 1000
          ? `${(fragment.length / 1000).toFixed(1)} kb`
          : `${fragment.length} bp`}
      </div>
      {pcrSize && (
        <div className="text-center text-[9px] text-blue-500 font-medium">
          PCR: {pcrSize} bp
        </div>
      )}
      {/* Intron badge */}
      {fragment.has_introns && fragment.introns?.length > 0 && (
        <div className="text-center text-[8px] bg-gray-200 text-gray-600 rounded px-1 mx-auto w-fit">
          {fragment.introns.length} intron{fragment.introns.length > 1 ? 's' : ''}
        </div>
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
