import { useDrop } from 'react-dnd';
import PartBlock from './PartBlock';
import JunctionBlock from './JunctionBlock';

export default function DesignCanvas({
  fragments, junctions, onDrop, onRemove, onToggleAmplification, onJunctionChange,
}) {
  const [{ isOver }, drop] = useDrop({
    accept: 'PART',
    drop: (item) => onDrop(item.part),
    collect: m => ({ isOver: m.isOver() }),
  });

  const totalBp = fragments.reduce((s, f) => s + (f.length || 0), 0);

  return (
    <div ref={drop}
      className={`flex-1 min-h-[220px] border-2 border-dashed rounded-xl p-6
        flex flex-col items-center justify-center transition
        ${isOver ? 'border-blue-400 bg-blue-50/40' : 'border-gray-200 bg-white'}`}>

      {fragments.length === 0 ? (
        <div className="text-gray-400 text-sm select-none">
          Drag parts from the palette to start building your construct
        </div>
      ) : (
        <>
          <div className="text-[11px] text-gray-400 mb-3 select-none">
            5' &rarr;&rarr;&rarr; construct assembly &rarr;&rarr;&rarr; 3'
          </div>

          <div className="flex items-center">
            {/* 5' cap */}
            <div className="w-1.5 h-14 bg-gray-300 rounded-l" />

            {fragments.map((frag, i) => (
              <div key={frag.id || i} className="flex items-center">
                <PartBlock fragment={frag} index={i}
                  onRemove={onRemove} onToggleAmplification={onToggleAmplification} />
                {i < fragments.length - 1 && (
                  <JunctionBlock
                    junction={junctions[i]}
                    index={i}
                    leftName={frag.name}
                    rightName={fragments[i + 1]?.name || '?'}
                    onChange={cfg => onJunctionChange(i, cfg)} />
                )}
              </div>
            ))}

            {/* 3' cap */}
            <div className="w-1.5 h-14 bg-gray-300 rounded-r" />
          </div>

          <div className="text-xs text-gray-500 mt-3 select-none">
            Total: {totalBp >= 1000 ? `${(totalBp / 1000).toFixed(1)} kb` : `${totalBp} bp`}
            {' '}&middot; {fragments.length} fragments &middot; {junctions.length} junctions
          </div>
        </>
      )}
    </div>
  );
}
