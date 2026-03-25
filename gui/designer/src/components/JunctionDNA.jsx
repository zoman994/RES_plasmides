import { useState } from 'react';

const RC = { A: 'T', T: 'A', G: 'C', C: 'G' };
const revComp = s => s.split('').reverse().map(c => RC[c.toUpperCase()] || 'N').join('');

export default function JunctionDNA({ junction, calculated, primers = [],
                                       leftFragment, rightFragment,
                                       leftColor, rightColor }) {
  const [expanded, setExpanded] = useState(false);
  const j = junction || {};

  if (!calculated || !primers.length) {
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

  const overlapSeq = (j.overlapSequence || '').toUpperCase();
  if (!overlapSeq) return null;

  const leftName = leftFragment?.name || '';
  const rightName = rightFragment?.name || '';
  const revLeft = primers.find(p => p.direction === 'reverse' && p.name.includes(leftName));
  const fwdRight = primers.find(p => p.direction === 'forward' && p.name.includes(rightName));

  const revTailLen = revLeft?.tailSequence?.length || 0;
  const fwdTailLen = fwdRight?.tailSequence?.length || 0;
  const splitAt = Math.min(revTailLen, overlapSeq.length);
  const leftPart = overlapSeq.slice(0, splitAt);
  const rightPart = overlapSeq.slice(splitAt);
  const lc = leftColor || '#999';
  const rc = rightColor || '#999';

  return (
    <div className="flex flex-col items-center select-none cursor-pointer"
      onClick={() => setExpanded(!expanded)}>

      {/* Compact view */}
      <div className="font-mono text-[7px] leading-none text-center max-w-[100px] flex justify-center"
        title={`Overlap: ${overlapSeq}\n${overlapSeq.length} п.н. · Tm ${j.overlapTm || '?'}°C\nКлик для подробностей`}>
        <span style={{ color: lc }}>{leftPart.slice(0, 6)}</span>
        <span className="text-gray-300">{'·'}</span>
        <span style={{ color: rc }}>{rightPart.slice(0, 6) || overlapSeq.slice(-6)}</span>
      </div>
      <div className="text-[7px] text-gray-400">
        {overlapSeq.length} п.н. {'·'} Tm {j.overlapTm}°C
      </div>

      {/* Expanded modal with full primer detail */}
      {expanded && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20"
          onClick={e => { e.stopPropagation(); setExpanded(false); }}>
          <div className="bg-white rounded-lg shadow-xl border p-5 w-[560px] max-h-[80vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}>

            <div className="text-sm font-semibold mb-3">
              Стык: {leftName} {'↔'} {rightName}
            </div>

            {/* Summary line */}
            <div className="text-xs text-gray-500 mb-3">
              Overlap: {overlapSeq.length} п.н. {'·'} Tm: {j.overlapTm}°C {'·'} GC: {j.overlapGc}%
              {'·'} Режим: {j.overlapMode === 'split' ? `◀▶ split (${revTailLen} + ${fwdTailLen})` : j.overlapMode}
            </div>

            {/* Rev primer of left fragment */}
            {revLeft && (
              <div className="bg-gray-50 rounded-lg p-3 mb-2">
                <div className="text-[10px] text-gray-500 mb-1.5">
                  {revLeft.name} {'(← обратный, на '}{leftName}{')'}
                </div>
                <div className="font-mono text-[11px] flex items-center gap-0.5 flex-wrap">
                  <span className="text-[8px] text-gray-400">5'─</span>
                  <span style={{ color: rc }} className="underline decoration-dotted"
                    title={`Tail: ${revTailLen} п.н. (от ${rightName})`}>
                    {(revLeft.tailSequence || '').toLowerCase()}
                  </span>
                  <span className="font-bold">{(revLeft.bindingSequence || '').toUpperCase()}</span>
                  <span className="text-[8px] text-gray-400">─3'</span>
                </div>
                <div className="flex gap-4 text-[9px] text-gray-400 mt-1">
                  <span style={{ color: rc }}>tail {revTailLen} п.н. (от {rightName})</span>
                  <span>binding {(revLeft.bindingSequence || '').length} п.н. (на {leftName})</span>
                  <span>Tm {revLeft.tmBinding}°C</span>
                </div>
              </div>
            )}

            {/* Fwd primer of right fragment */}
            {fwdRight && (
              <div className="bg-gray-50 rounded-lg p-3 mb-3">
                <div className="text-[10px] text-gray-500 mb-1.5">
                  {fwdRight.name} {'(→ прямой, на '}{rightName}{')'}
                </div>
                <div className="font-mono text-[11px] flex items-center gap-0.5 flex-wrap">
                  <span className="text-[8px] text-gray-400">5'─</span>
                  <span style={{ color: lc }} className="underline decoration-dotted"
                    title={`Tail: ${fwdTailLen} п.н. (от ${leftName})`}>
                    {(fwdRight.tailSequence || '').toLowerCase()}
                  </span>
                  <span className="font-bold">{(fwdRight.bindingSequence || '').toUpperCase()}</span>
                  <span className="text-[8px] text-gray-400">─3'</span>
                </div>
                <div className="flex gap-4 text-[9px] text-gray-400 mt-1">
                  <span style={{ color: lc }}>tail {fwdTailLen} п.н. (от {leftName})</span>
                  <span>binding {(fwdRight.bindingSequence || '').length} п.н. (на {rightName})</span>
                  <span>Tm {fwdRight.tmBinding}°C</span>
                </div>
              </div>
            )}

            {/* Overlap zone — double strand */}
            <div className="bg-blue-50 rounded-lg p-3 font-mono text-[10px]">
              <div className="text-[9px] text-blue-700 mb-2 font-sans font-semibold">
                Зона перекрытия ({overlapSeq.length} п.н.)
              </div>
              <div className="overflow-x-auto space-y-0.5">
                <div className="whitespace-nowrap">
                  <span className="text-[8px] text-gray-400">5' …</span>
                  <span style={{ color: lc, fontWeight: 'bold' }}>{leftPart}</span>
                  <span className="text-gray-300">│</span>
                  <span style={{ color: rc, fontWeight: 'bold' }}>{rightPart}</span>
                  <span className="text-[8px] text-gray-400">… 3'</span>
                </div>
                <div className="whitespace-nowrap text-gray-300 tracking-[1px]">
                  {'     '}{'|'.repeat(overlapSeq.length)}
                </div>
                <div className="whitespace-nowrap">
                  <span className="text-[8px] text-gray-400">3' …</span>
                  <span style={{ color: lc }}>{revComp(leftPart)}</span>
                  <span className="text-gray-300">│</span>
                  <span style={{ color: rc }}>{revComp(rightPart)}</span>
                  <span className="text-[8px] text-gray-400">… 5'</span>
                </div>
              </div>
              <div className="flex justify-center gap-4 text-[8px] text-gray-400 mt-2 font-sans">
                <span>{'←'} {revTailLen} п.н. от {rightName}</span>
                <span>{fwdTailLen} п.н. от {leftName} {'→'}</span>
              </div>
            </div>

            <button onClick={() => setExpanded(false)}
              className="mt-4 w-full text-xs bg-gray-100 hover:bg-gray-200 rounded p-2">
              Закрыть
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
