import { useState } from 'react';

const RC = { A: 'T', T: 'A', G: 'C', C: 'G' };
const revComp = s => s.split('').reverse().map(c => RC[c.toUpperCase()] || 'N').join('');

/**
 * JunctionDNA — shows overlap zone between two fragments.
 * Compact: overlap sequence + Tm. Click to expand double-strand view.
 */
export default function JunctionDNA({ junction, calculated, primers = [],
                                       leftFragment, rightFragment,
                                       leftColor, rightColor }) {
  const [expanded, setExpanded] = useState(false);
  const j = junction || {};

  // Before calculation — simple label
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

  // Find relevant primers
  const leftName = leftFragment?.name || '';
  const rightName = rightFragment?.name || '';
  const revLeft = primers.find(p => p.direction === 'reverse' && p.name.includes(leftName));
  const fwdRight = primers.find(p => p.direction === 'forward' && p.name.includes(rightName));

  const revTailLen = revLeft?.tailSequence?.length || 0;
  const fwdTailLen = fwdRight?.tailSequence?.length || 0;

  // Split overlap into left-origin and right-origin portions
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
        title={`Overlap: ${overlapSeq}\n${overlapSeq.length} п.н. · Tm ${j.overlapTm || '?'}°C`}>
        <span style={{ color: lc }}>{leftPart.slice(0, 6)}</span>
        <span className="text-gray-300">{'·'}</span>
        <span style={{ color: rc }}>{rightPart.slice(0, 6) || overlapSeq.slice(-6)}</span>
      </div>
      <div className="text-[7px] text-gray-400">
        {overlapSeq.length} п.н. {'·'} Tm {j.overlapTm}°C
      </div>

      {/* Expanded double-strand view */}
      {expanded && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20"
          onClick={e => { e.stopPropagation(); setExpanded(false); }}>
          <div className="bg-white rounded-lg shadow-xl border p-4 max-w-lg"
            onClick={e => e.stopPropagation()}>
            <div className="text-xs font-semibold mb-2">
              Overlap: {leftName} {'↔'} {rightName} ({overlapSeq.length} п.н.)
            </div>

            {/* Double-strand visualization */}
            <div className="font-mono text-[10px] leading-relaxed bg-gray-50 rounded p-3 space-y-1 overflow-x-auto">
              {/* Top strand 5'→3' */}
              <div className="whitespace-nowrap">
                <span className="text-gray-400">5' …</span>
                <span style={{ color: lc, fontWeight: 'bold' }}>{leftPart}</span>
                <span style={{ color: rc, fontWeight: 'bold' }}>{rightPart}</span>
                <span className="text-gray-400">… 3'</span>
              </div>
              {/* Base pair indicators */}
              <div className="whitespace-nowrap text-gray-300">
                {'    '}{'|'.repeat(overlapSeq.length)}
              </div>
              {/* Bottom strand 3'→5' */}
              <div className="whitespace-nowrap">
                <span className="text-gray-400">3' …</span>
                <span style={{ color: lc, fontWeight: 'bold' }}>{revComp(leftPart)}</span>
                <span style={{ color: rc, fontWeight: 'bold' }}>{revComp(rightPart)}</span>
                <span className="text-gray-400">… 5'</span>
              </div>
            </div>

            {/* Primer annotations */}
            <div className="mt-3 space-y-1 text-[10px]">
              {revLeft && (
                <div className="flex items-center gap-2">
                  <span className="text-red-500">{'←'}</span>
                  <span className="font-semibold">{revLeft.name}</span>
                  <span className="text-gray-400">binding</span>
                  <span style={{ color: rc }} className="font-mono">
                    + {revTailLen} п.н. tail
                  </span>
                </div>
              )}
              {fwdRight && (
                <div className="flex items-center gap-2">
                  <span className="text-blue-500">{'→'}</span>
                  <span className="font-semibold">{fwdRight.name}</span>
                  <span className="text-gray-400">binding</span>
                  <span style={{ color: lc }} className="font-mono">
                    + {fwdTailLen} п.н. tail
                  </span>
                </div>
              )}
            </div>

            <div className="mt-2 text-[10px] text-gray-400">
              Tm {j.overlapTm}°C {'·'} GC {j.overlapGc}%
            </div>

            <button onClick={() => setExpanded(false)}
              className="mt-3 w-full text-xs bg-gray-100 hover:bg-gray-200 rounded p-1.5">
              Закрыть
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
