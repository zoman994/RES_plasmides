/**
 * JunctionDNA — shows overlap sequence info at a junction.
 * Primers are now visualized inside PartBlock, so this just shows
 * the overlap zone info (sequence, length, Tm).
 */

export default function JunctionDNA({ junction, calculated }) {
  const j = junction || {};

  // Before calculation — simple label
  if (!calculated) {
    const len = j.overlapLength || 30;
    const mode = j.overlapMode || 'split';
    const arrow = mode === 'left_only' ? '◀' : mode === 'right_only' ? '▶' : '◀▶';
    return (
      <div className="flex flex-col items-center px-1">
        <span className="text-[9px] text-blue-600 font-semibold">{arrow}{len}bp</span>
        <div className="w-px h-6 bg-gray-300 my-0.5" />
      </div>
    );
  }

  const overlapSeq = (j.overlapSequence || '').toUpperCase();
  if (!overlapSeq) return null;

  return (
    <div className="flex flex-col items-center px-1 py-0.5 select-none"
      title={`Overlap: ${overlapSeq}`}>
      <div className="font-mono text-[7px] leading-none text-teal-600 font-bold text-center max-w-[80px] truncate">
        {overlapSeq}
      </div>
      <div className="text-[7px] text-gray-400">
        {overlapSeq.length}bp {'·'} Tm {j.overlapTm}°C
      </div>
    </div>
  );
}
