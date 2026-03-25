/**
 * JunctionDNA — shows how primers lay on the template at a junction.
 * Before calculation: simple "◀30bp" label.
 * After calculation: template DNA + primer arrows with tail/binding highlighted.
 */

export default function JunctionDNA({ junction, calculated, primers = [],
                                       leftFragment, rightFragment }) {
  const j = junction || {};

  // Before calculation — simple label
  if (!calculated || !primers || primers.length === 0) {
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

  // Find relevant primers
  const leftName = leftFragment?.name || '';
  const rightName = rightFragment?.name || '';
  const revLeft = primers.find(p => p.direction === 'reverse' && p.name.includes(leftName));
  const fwdRight = primers.find(p => p.direction === 'forward' && p.name.includes(rightName));

  const overlapSeq = (j.overlapSequence || '').toUpperCase();

  return (
    <div className="flex flex-col items-center px-1 py-1 select-none max-w-[300px]"
      title={`Overlap: ${overlapSeq} (${overlapSeq.length}bp, Tm=${j.overlapTm}°C)`}>

      {/* Template DNA at junction */}
      {overlapSeq && (
        <div className="font-mono text-[7px] leading-none tracking-tight text-center">
          <span className="text-gray-400">{'…'}</span>
          <span className="text-teal-600 font-bold">{overlapSeq}</span>
          <span className="text-gray-400">{'…'}</span>
        </div>
      )}

      {/* Reverse primer (← pointing left, binds on left fragment) */}
      {revLeft && (
        <div className="mt-0.5 w-full">
          <div className="flex items-center font-mono text-[6px] leading-none">
            <span className="text-red-400 mr-0.5">{'←'}</span>
            <span className="text-teal-500">{(revLeft.tailSequence || '').toLowerCase()}</span>
            <span className="text-red-600 font-bold">{(revLeft.bindingSequence || '').toUpperCase()}</span>
          </div>
          <div className="text-[6px] text-red-400 truncate">{revLeft.name} Tm={revLeft.tmBinding}°C</div>
        </div>
      )}

      {/* Forward primer (→ pointing right, binds on right fragment) */}
      {fwdRight && (
        <div className="mt-0.5 w-full">
          <div className="flex items-center justify-end font-mono text-[6px] leading-none">
            <span className="text-teal-500">{(fwdRight.tailSequence || '').toLowerCase()}</span>
            <span className="text-blue-600 font-bold">{(fwdRight.bindingSequence || '').toUpperCase()}</span>
            <span className="text-blue-400 ml-0.5">{'→'}</span>
          </div>
          <div className="text-[6px] text-blue-400 text-right truncate">{fwdRight.name} Tm={fwdRight.tmBinding}°C</div>
        </div>
      )}

      {/* Overlap info */}
      {overlapSeq && (
        <div className="text-[7px] text-gray-400 mt-0.5">
          {overlapSeq.length}bp {'·'} {j.overlapTm}°C
        </div>
      )}
    </div>
  );
}
