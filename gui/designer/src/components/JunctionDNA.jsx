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
    <div className="relative flex flex-col items-center select-none">
      {/* Compact: clickable sequence preview */}
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

      {/* Inline popover — attached below junction */}
      {expanded && (
        <>
          {/* Click-away overlay (transparent) */}
          <div className="fixed inset-0 z-20" onClick={() => setExpanded(false)} />
          {/* Popover */}
          <div className="absolute top-full left-1/2 -translate-x-1/2 z-30 mt-1
                          w-[380px] bg-white rounded-lg shadow-xl border p-3"
            onClick={e => e.stopPropagation()}>
            {/* Arrow pointing up */}
            <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-white border-l border-t rotate-45" />

            <div className="text-[10px] font-semibold mb-2">
              {leftName} {'↔'} {rightName} ({overlapSeq.length} п.н., Tm {j.overlapTm}°C)
            </div>

            {/* Primer details */}
            {revLeft && (
              <div className="bg-gray-50 rounded p-2 mb-1.5">
                <div className="text-[9px] text-gray-500 mb-1">{revLeft.name} (← обратный)</div>
                <div className="font-mono text-[10px]">
                  <span className="text-[7px] text-gray-400">5'─</span>
                  <span style={{ color: rc }}>{(revLeft.tailSequence || '').toLowerCase()}</span>
                  <span className="font-bold">{(revLeft.bindingSequence || '').toUpperCase()}</span>
                  <span className="text-[7px] text-gray-400">─3'</span>
                </div>
                <div className="text-[8px] text-gray-400 mt-0.5">
                  tail {revTailLen} п.н. (от {rightName}) · binding {(revLeft.bindingSequence || '').length} п.н.
                </div>
              </div>
            )}
            {fwdRight && (
              <div className="bg-gray-50 rounded p-2 mb-2">
                <div className="text-[9px] text-gray-500 mb-1">{fwdRight.name} (→ прямой)</div>
                <div className="font-mono text-[10px]">
                  <span className="text-[7px] text-gray-400">5'─</span>
                  <span style={{ color: lc }}>{(fwdRight.tailSequence || '').toLowerCase()}</span>
                  <span className="font-bold">{(fwdRight.bindingSequence || '').toUpperCase()}</span>
                  <span className="text-[7px] text-gray-400">─3'</span>
                </div>
                <div className="text-[8px] text-gray-400 mt-0.5">
                  tail {fwdTailLen} п.н. (от {leftName}) · binding {(fwdRight.bindingSequence || '').length} п.н.
                </div>
              </div>
            )}

            {/* Overlap double-strand */}
            <div className="bg-blue-50 rounded p-2 font-mono text-[9px] overflow-x-auto">
              <div className="whitespace-nowrap">
                <span className="text-[7px] text-gray-400">5'…</span>
                <span style={{ color: lc, fontWeight: 'bold' }}>{leftPart}</span>
                <span className="text-gray-300">│</span>
                <span style={{ color: rc, fontWeight: 'bold' }}>{rightPart}</span>
                <span className="text-[7px] text-gray-400">…3'</span>
              </div>
              <div className="whitespace-nowrap text-gray-300 tracking-[0.5px]">
                {'   '}{'|'.repeat(overlapSeq.length)}
              </div>
              <div className="whitespace-nowrap">
                <span className="text-[7px] text-gray-400">3'…</span>
                <span style={{ color: lc }}>{revComp(leftPart)}</span>
                <span className="text-gray-300">│</span>
                <span style={{ color: rc }}>{revComp(rightPart)}</span>
                <span className="text-[7px] text-gray-400">…5'</span>
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
