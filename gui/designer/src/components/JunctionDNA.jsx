/**
 * JunctionDNA — shows actual overlap bases between fragments as double-strand DNA.
 * Before calculation: shows "30bp" label.
 * After calculation: shows sense + antisense strands, colored by which primer carries it.
 */

const COMP = { A: 'T', T: 'A', G: 'C', C: 'G', N: 'N' };

function getTailColor(mode, i, len) {
  const half = Math.floor(len / 2);
  if (mode === 'left_only') return 'text-teal-500';
  if (mode === 'right_only') return 'text-emerald-500';
  // split
  return i < half ? 'text-teal-500' : 'text-emerald-500';
}

export default function JunctionDNA({ junction, calculated }) {
  const j = junction || {};

  if (!calculated || !j.overlapSequence) {
    // Before calculation — just show bp label with direction
    const len = j.overlapLength || 30;
    const mode = j.overlapMode || 'split';
    const arrow =
      mode === 'left_only' ? '\u25C0' :
      mode === 'right_only' ? '\u25B6' : '\u25C0\u25B6';
    return (
      <div className="flex flex-col items-center px-1">
        <span className="text-[9px] text-blue-600 font-semibold">{arrow}{len}bp</span>
        <div className="w-px h-6 bg-gray-300 my-0.5" />
      </div>
    );
  }

  // After calculation — show DNA double strand
  const seq = j.overlapSequence.toUpperCase();
  const comp = seq.split('').map(c => COMP[c] || 'N').join('');
  const mode = j.overlapMode || 'split';

  return (
    <div className="flex flex-col items-center px-0.5 select-none" title={`Overlap: ${seq} (${seq.length}bp)`}>
      {/* Sense strand (5'→3') */}
      <div className="flex font-mono text-[7px] leading-none tracking-tight">
        {seq.split('').map((ch, i) => (
          <span key={`s${i}`} className={getTailColor(mode, i, seq.length)}>{ch}</span>
        ))}
      </div>
      {/* Base pairing lines */}
      <div className="flex font-mono text-[5px] leading-none text-gray-300 tracking-tight">
        {seq.split('').map((_, i) => <span key={`p${i}`}>|</span>)}
      </div>
      {/* Antisense strand (3'→5') */}
      <div className="flex font-mono text-[7px] leading-none tracking-tight">
        {comp.split('').map((ch, i) => (
          <span key={`a${i}`} className={getTailColor(mode, i, seq.length)}>{ch}</span>
        ))}
      </div>
      {/* Tm label */}
      {j.overlapTm && (
        <div className="text-[7px] text-gray-400 mt-0.5">
          {j.overlapTm}&deg;C
        </div>
      )}
    </div>
  );
}
