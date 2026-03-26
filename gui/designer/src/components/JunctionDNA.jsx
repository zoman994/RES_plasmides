import { useState, useRef, useEffect } from 'react';

const RC = { A: 'T', T: 'A', G: 'C', C: 'G' };
const revComp = s => s.split('').reverse().map(c => RC[c.toUpperCase()] || 'N').join('');

export default function JunctionDNA({ junction, calculated, primers = [],
                                       leftFragment, rightFragment }) {
  const [expanded, setExpanded] = useState(false);
  const panelRef = useRef(null);
  const j = junction || {};

  // Click outside to close
  useEffect(() => {
    if (!expanded) return;
    const handler = (e) => { if (panelRef.current && !panelRef.current.contains(e.target)) setExpanded(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [expanded]);

  // Before calculation — nothing (label is in JunctionBlock)
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

  if (!expanded) {
    // Collapsed: just a small clickable dot
    return (
      <div className="flex justify-center cursor-pointer" onClick={() => setExpanded(true)}
        title="Клик — показать праймеры на стыке">
        <div className="w-2 h-2 rounded-full bg-blue-300 hover:bg-blue-500 transition" />
      </div>
    );
  }

  // Expanded: inline panel between blocks
  return (
    <div ref={panelRef} className="bg-white border border-gray-200 rounded-xl shadow-lg p-3 mx-1 my-1"
      style={{ minWidth: 340, maxWidth: 480 }}>

      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-semibold text-gray-700">
          {leftName} {'↔'} {rightName} — {overlapSeq.length} п.н., Tm {j.overlapTm}°C
        </span>
        <button onClick={() => setExpanded(false)} className="text-gray-400 hover:text-gray-600 text-xs">{'✕'}</button>
      </div>

      {/* Rev primer — full sequence */}
      {revLeft && (
        <div className="bg-gray-50 rounded p-2 mb-1.5">
          <div className="text-[9px] text-gray-500 mb-1">{revLeft.name} (← на {leftName})</div>
          <div className="font-mono text-[11px] overflow-x-auto whitespace-nowrap" style={{ fontWeight: 400 }}>
            <span className="text-gray-400 text-[9px]">5'─</span>
            <span className="text-teal-600 bg-teal-50 border-b-2 border-dashed border-teal-400 px-0.5 rounded-sm">
              {(revLeft.tailSequence || '').toLowerCase()}</span>
            <span className="text-[#1a1a1a] bg-gray-100 border-b-2 border-gray-600 px-0.5 rounded-sm">
              {(revLeft.bindingSequence || '').toUpperCase()}</span>
            <span className="text-gray-400 text-[9px]">─3'</span>
          </div>
          <div className="text-[8px] text-gray-500 mt-0.5">
            <span className="text-teal-600">tail</span> {revTailLen} п.н. ·
            BINDING {(revLeft.bindingSequence || '').length} п.н. ·
            всего {revTailLen + (revLeft.bindingSequence || '').length} п.н. ·
            Tm {revLeft.tmBinding}°C
          </div>
        </div>
      )}

      {/* Fwd primer — full sequence */}
      {fwdRight && (
        <div className="bg-gray-50 rounded p-2 mb-2">
          <div className="text-[9px] text-gray-500 mb-1">{fwdRight.name} (→ на {rightName})</div>
          <div className="font-mono text-[11px] overflow-x-auto whitespace-nowrap" style={{ fontWeight: 400 }}>
            <span className="text-gray-400 text-[9px]">5'─</span>
            <span className="text-teal-600 bg-teal-50 border-b-2 border-dashed border-teal-400 px-0.5 rounded-sm">
              {(fwdRight.tailSequence || '').toLowerCase()}</span>
            <span className="text-[#1a1a1a] bg-gray-100 border-b-2 border-gray-600 px-0.5 rounded-sm">
              {(fwdRight.bindingSequence || '').toUpperCase()}</span>
            <span className="text-gray-400 text-[9px]">─3'</span>
          </div>
          <div className="text-[8px] text-gray-500 mt-0.5">
            <span className="text-teal-600">tail</span> {fwdTailLen} п.н. ·
            BINDING {(fwdRight.bindingSequence || '').length} п.н. ·
            всего {fwdTailLen + (fwdRight.bindingSequence || '').length} п.н. ·
            Tm {fwdRight.tmBinding}°C
          </div>
        </div>
      )}

      {/* Overlap zone — uniform weight for alignment */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-2">
        <div className="text-[9px] font-semibold text-amber-700 mb-1.5">
          Зона отжига ({overlapSeq.length} п.н.)
        </div>
        <div className="font-mono text-[11px] space-y-0.5" style={{ fontWeight: 400, fontVariantLigatures: 'none' }}>
          <div className="flex whitespace-nowrap">
            <span className="text-[9px] text-gray-500 w-20 shrink-0 text-right mr-2 font-sans self-center">{leftName}:</span>
            <pre className="m-0 text-[11px] font-mono" style={{ fontWeight: 400 }}>
              <span className="text-gray-300">…</span>
              <span className="text-[#1a1a1a]">{leftPart.toUpperCase()}</span>
              <span className="text-teal-600">{rightPart.toLowerCase()}</span>
            </pre>
          </div>
          <div className="flex whitespace-nowrap">
            <span className="text-[9px] text-gray-500 w-20 shrink-0 text-right mr-2 font-sans self-center">{rightName}:</span>
            <pre className="m-0 text-[11px] font-mono" style={{ fontWeight: 400 }}>
              <span className="text-[#aaa]">{' '}</span>
              <span className="text-teal-600">{leftPart.toLowerCase()}</span>
              <span className="text-[#1a1a1a]">{rightPart.toUpperCase()}</span>
              <span className="text-gray-300">…</span>
            </pre>
          </div>
        </div>
        <div className="text-[8px] text-amber-600 mt-1.5 text-center">
          {'←'} {revTailLen} п.н. от {rightName} {'│'} {fwdTailLen} п.н. от {leftName} {'→'}
        </div>
      </div>
    </div>
  );
}
