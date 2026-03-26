import { useState } from 'react';

export default function JunctionDNA({ junction, calculated, primers = [],
                                       leftFragment, rightFragment,
                                       leftColor, rightColor }) {
  const [expanded, setExpanded] = useState(false);
  const j = junction || {};

  if (!calculated || !primers.length) return null;

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
    <div className="relative flex flex-col items-center select-none">
      <div className="cursor-pointer hover:bg-gray-50 rounded px-1 py-0.5"
        onClick={() => setExpanded(!expanded)}
        title="Клик для подробностей">
        <div className="font-mono text-[7px] leading-none text-center flex justify-center">
          <span style={{ color: lc }}>{leftPart.slice(0, 5)}</span>
          <span className="text-gray-300">{'·'}</span>
          <span style={{ color: rc }}>{rightPart.slice(0, 5) || overlapSeq.slice(-5)}</span>
        </div>
        <div className="text-[7px] text-gray-400 text-center">
          {overlapSeq.length} п.н. {'·'} {j.overlapTm}°C
        </div>
      </div>

      {expanded && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setExpanded(false)} />
          <div className="absolute top-full left-1/2 -translate-x-1/2 z-30 mt-1
                          w-[480px] bg-white rounded-lg shadow-xl border p-3"
            onClick={e => e.stopPropagation()}>
            <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-white border-l border-t rotate-45" />

            <div className="text-[10px] font-semibold mb-2">
              Overlap: {leftName} {'↔'} {rightName} — {overlapSeq.length} п.н., Tm {j.overlapTm}°C
            </div>

            {/* Rev primer — full sequence, 5'→3' as ordered */}
            {revLeft && (
              <div className="bg-gray-50 rounded p-2 mb-1.5">
                <div className="text-[9px] text-gray-500 mb-1">
                  {revLeft.name} (← обратный, на {leftName})
                </div>
                <div className="font-mono text-[11px] overflow-x-auto whitespace-nowrap">
                  <span className="text-gray-400 text-[9px]">5'─</span>
                  <span className="text-teal-600 bg-teal-50 border-b-2 border-dashed border-teal-400 px-0.5 rounded-sm">
                    {(revLeft.tailSequence || '').toLowerCase()}</span>
                  <span className="font-bold text-[#1a1a1a] bg-gray-100 border-b-2 border-gray-700 px-0.5 rounded-sm">
                    {(revLeft.bindingSequence || '').toUpperCase()}</span>
                  <span className="text-gray-400 text-[9px]">─3'</span>
                </div>
                <div className="text-[8px] text-gray-500 mt-0.5">
                  <span className="text-teal-600">tail</span> {revTailLen} п.н. (от {rightName}) ·
                  <span className="font-bold"> BINDING</span> {(revLeft.bindingSequence || '').length} п.н. ·
                  всего {revTailLen + (revLeft.bindingSequence || '').length} п.н. ·
                  Tm {revLeft.tmBinding}°C
                </div>
              </div>
            )}

            {/* Fwd primer — full sequence, 5'→3' as ordered */}
            {fwdRight && (
              <div className="bg-gray-50 rounded p-2 mb-2">
                <div className="text-[9px] text-gray-500 mb-1">
                  {fwdRight.name} (→ прямой, на {rightName})
                </div>
                <div className="font-mono text-[11px] overflow-x-auto whitespace-nowrap">
                  <span className="text-gray-400 text-[9px]">5'─</span>
                  <span className="text-teal-600 bg-teal-50 border-b-2 border-dashed border-teal-400 px-0.5 rounded-sm">
                    {(fwdRight.tailSequence || '').toLowerCase()}</span>
                  <span className="font-bold text-[#1a1a1a] bg-gray-100 border-b-2 border-gray-700 px-0.5 rounded-sm">
                    {(fwdRight.bindingSequence || '').toUpperCase()}</span>
                  <span className="text-gray-400 text-[9px]">─3'</span>
                </div>
                <div className="text-[8px] text-gray-500 mt-0.5">
                  <span className="text-teal-600">tail</span> {fwdTailLen} п.н. (от {leftName}) ·
                  <span className="font-bold"> BINDING</span> {(fwdRight.bindingSequence || '').length} п.н. ·
                  всего {fwdTailLen + (fwdRight.bindingSequence || '').length} п.н. ·
                  Tm {fwdRight.tmBinding}°C
                </div>
              </div>
            )}

            {/* Overlap annealing zone — aligned with fixed-width labels */}
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 font-mono text-[10px] overflow-x-auto">
              <div className="text-[9px] text-amber-700 font-sans font-semibold mb-2">
                Зона отжига ({overlapSeq.length} п.н.)
              </div>
              <div className="space-y-0.5">
                <div className="flex whitespace-nowrap">
                  <span className="text-[9px] text-gray-500 w-20 shrink-0 text-right mr-2 font-sans">{leftName}:</span>
                  <span>
                    <span className="text-gray-300">…</span>
                    <span className="font-bold text-[#1a1a1a] bg-gray-100 px-0.5 rounded-sm">{leftPart.toUpperCase()}</span>
                    <span className="text-teal-600 bg-teal-50 px-0.5 rounded-sm">{rightPart.toLowerCase()}</span>
                  </span>
                </div>
                <div className="flex whitespace-nowrap">
                  <span className="text-[9px] text-gray-500 w-20 shrink-0 text-right mr-2 font-sans">{rightName}:</span>
                  <span>
                    <span className="text-teal-600 bg-teal-50 px-0.5 rounded-sm">{leftPart.toLowerCase()}</span>
                    <span className="font-bold text-[#1a1a1a] bg-gray-100 px-0.5 rounded-sm">{rightPart.toUpperCase()}</span>
                    <span className="text-gray-300">…</span>
                  </span>
                </div>
              </div>
              <div className="text-[8px] text-amber-600 mt-2 font-sans text-center">
                {'←'} {revTailLen} п.н. от {rightName} {'│'} {fwdTailLen} п.н. от {leftName} {'→'}
              </div>
            </div>

            <button onClick={() => setExpanded(false)}
              className="mt-2 w-full text-[10px] bg-gray-100 hover:bg-gray-200 rounded py-1">
              Закрыть
            </button>
          </div>
        </>
      )}
    </div>
  );
}
