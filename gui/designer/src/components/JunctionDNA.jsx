/**
 * JunctionDNA — pre-calculation overlap label.
 * After calculation, returns null (overlap info is in JunctionBlock label,
 * primers/tails are visualized in PartBlock).
 */

export default function JunctionDNA({ junction, calculated }) {
  // After calculation — nothing to show here (tails are in PartBlock)
  if (calculated) return null;

  const j = junction || {};
  const len = j.overlapLength || 30;
  const mode = j.overlapMode || 'split';
  const arrow = mode === 'left_only' ? '◀' : mode === 'right_only' ? '▶' : '◀▶';

  return (
    <div className="flex flex-col items-center px-1">
      <span className="text-[9px] text-blue-600 font-semibold">{arrow}{len} п.н.</span>
      <div className="w-px h-6 bg-gray-300 my-0.5" />
    </div>
  );
}
