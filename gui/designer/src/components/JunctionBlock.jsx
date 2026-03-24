import { useState } from 'react';

export default function JunctionBlock({ junction, index, leftName, rightName, onChange }) {
  const [open, setOpen] = useState(false);
  const j = junction || { type: 'overlap', overlapMode: 'split', overlapLength: 30, tmTarget: 62 };

  // Canvas label with direction indicator
  const label =
    j.type === 'overlap'
      ? (j.overlapMode === 'left_only' ? `\u25C0${j.overlapLength || 30}bp`
        : j.overlapMode === 'right_only' ? `${j.overlapLength || 30}bp\u25B6`
        : `\u25C0\u25B6${j.overlapLength || 30}bp`)
    : j.type === 'golden_gate' ? `GG:${j.overhang || '?'}`
    : j.type === 'sticky_end' ? (j.reEnzyme || 'RE')
    : j.type;

  const modeBtn = (mode, icon, desc) => (
    <button
      onClick={() => {
        let len = j.overlapLength || 30;
        if (mode === 'split' && len < 28) len = 30;
        onChange({ ...j, overlapMode: mode, overlapLength: len });
      }}
      className={`flex-1 text-[10px] py-2 px-1 rounded border text-center transition
        ${j.overlapMode === mode
          ? 'bg-blue-50 border-blue-400 text-blue-700 font-bold'
          : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
      <div className="font-mono">{icon}</div>
      <div className="mt-1">{desc}</div>
    </button>
  );

  return (
    <div className="relative">
      <div onClick={() => setOpen(!open)}
        className="w-6 h-14 cursor-pointer flex items-center justify-center
                   hover:bg-blue-50 transition rounded" title="Configure junction">
        <div className="w-px h-10 bg-gray-300" />
      </div>
      <div className="absolute -top-5 left-1/2 -translate-x-1/2 whitespace-nowrap">
        <span className="text-[9px] text-blue-600 font-semibold">{label}</span>
      </div>

      {open && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50
                        w-80 bg-white rounded-lg shadow-xl border p-4"
          onClick={e => e.stopPropagation()}>
          <h4 className="text-sm font-semibold mb-3">{leftName} &rarr; {rightName}</h4>

          <label className="text-[11px] text-gray-500 block mb-1">Junction type</label>
          <select value={j.type}
            onChange={e => onChange({ ...j, type: e.target.value })}
            className="w-full text-sm border rounded p-1.5 mb-3">
            <option value="overlap">Overlap (PCR/Gibson)</option>
            <option value="golden_gate">Golden Gate</option>
            <option value="sticky_end">Restriction enzyme</option>
            <option value="blunt">Blunt end</option>
            <option value="preformed">Pre-formed</option>
          </select>

          {j.type === 'overlap' && (
            <>
              <label className="text-[11px] text-gray-500 block mb-1">Overlap on:</label>
              <div className="flex gap-1 mb-3">
                {modeBtn('left_only',
                  <><span className="text-teal-500">&larr;overlap</span><span className="text-gray-300">|</span><span>binding</span></>,
                  <>&laquo; {leftName}</>
                )}
                {modeBtn('split',
                  <><span className="text-teal-500">&larr;half</span><span className="text-gray-300">|</span><span className="text-teal-500">half&rarr;</span></>,
                  <>&laquo;&raquo; both</>
                )}
                {modeBtn('right_only',
                  <><span>binding</span><span className="text-gray-300">|</span><span className="text-teal-500">overlap&rarr;</span></>,
                  <>{rightName} &raquo;</>
                )}
              </div>

              <div className="text-[10px] text-gray-400 mb-2">
                {j.overlapMode === 'split'
                  ? `${Math.floor((j.overlapLength || 30) / 2)}bp on each primer`
                  : `Full ${j.overlapLength || 30}bp on one primer`}
              </div>

              <div className="flex gap-3 mb-2">
                <div className="flex-1">
                  <label className="text-[11px] text-gray-500 block">Length (bp)</label>
                  <input type="number" value={j.overlapLength || 30} min={15} max={45}
                    onChange={e => onChange({ ...j, overlapLength: +e.target.value })}
                    className="w-full text-sm border rounded p-1.5" />
                </div>
                <div className="flex-1">
                  <label className="text-[11px] text-gray-500 block">Tm target</label>
                  <input type="number" value={j.tmTarget || 62} min={50} max={70}
                    onChange={e => onChange({ ...j, tmTarget: +e.target.value })}
                    className="w-full text-sm border rounded p-1.5" />
                </div>
              </div>
            </>
          )}

          {j.type === 'golden_gate' && (
            <>
              <label className="text-[11px] text-gray-500 block mb-1">Enzyme</label>
              <select value={j.enzyme || 'BsaI'}
                onChange={e => onChange({ ...j, enzyme: e.target.value })}
                className="w-full text-sm border rounded p-1.5 mb-2">
                <option>BsaI</option><option>BbsI</option><option>Esp3I</option>
              </select>
              <label className="text-[11px] text-gray-500 block mb-1">4-nt overhang</label>
              <input type="text" maxLength={4} value={j.overhang || ''}
                onChange={e => onChange({ ...j, overhang: e.target.value.toUpperCase() })}
                className="w-full text-sm border rounded p-1.5 font-mono" placeholder="ATCG" />
            </>
          )}

          {j.type === 'sticky_end' && (
            <>
              <label className="text-[11px] text-gray-500 block mb-1">Enzyme</label>
              <input type="text" value={j.reEnzyme || ''}
                onChange={e => onChange({ ...j, reEnzyme: e.target.value })}
                className="w-full text-sm border rounded p-1.5" placeholder="EcoRI" />
            </>
          )}

          <button onClick={() => setOpen(false)}
            className="mt-3 w-full text-xs bg-gray-100 hover:bg-gray-200 rounded p-1.5">
            Done
          </button>
        </div>
      )}
    </div>
  );
}
