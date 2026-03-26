import { useState } from 'react';
import { createPortal } from 'react-dom';

export default function JunctionBlock({ junction, index, leftName, rightName, onChange }) {
  const [open, setOpen] = useState(false);
  const j = junction || { type: 'overlap', overlapMode: 'split', overlapLength: 30, tmTarget: 62 };

  const calcMode = j.calcMode || 'length';
  const userLen = j.overlapLength || 30;
  const actualLen = j.overlapSequence ? j.overlapSequence.length : null;
  const displayLen = actualLen || userLen;

  // Mode arrow
  const modeArrow = j.overlapMode === 'left_only' ? '◀' : j.overlapMode === 'right_only' ? '▶' : '◀▶';

  // Canvas label
  const label =
    j.type === 'overlap'
      ? `${modeArrow}${displayLen} п.н.`
    : j.type === 'golden_gate' ? `GG:${j.overhang || '?'}`
    : j.type === 'sticky_end' ? (j.reEnzyme || 'RE')
    : j.type;

  // Tooltip with overlap details
  const tip = j.overlapSequence
    ? `Overlap: ${j.overlapSequence}\n${displayLen} п.н. · Tm ${j.overlapTm || '?'}°C · GC ${j.overlapGc || '?'}%${diff ? `\nАвто-расширен с ${userLen} до ${displayLen} п.н. для Tm` : ''}`
    : `Overlap: ${userLen} п.н.`;

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
                   hover:bg-blue-50 transition rounded" title={tip}>
        <div className="w-px h-10 bg-gray-300" />
      </div>
      <div className="absolute -top-4 left-1/2 -translate-x-1/2 whitespace-nowrap flex flex-col items-center leading-tight">
        <span className="text-[10px] text-blue-600 font-bold">{label}</span>
        {j.overlapTm ? (
          <span className="text-[8px] text-gray-400">
            {calcMode === 'tm' ? `Tm≈${j.tmTarget || 62}°` : `Tm ${j.overlapTm}°`}
          </span>
        ) : null}
      </div>

      {open && createPortal(
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-black/20 overflow-y-auto"
          onClick={() => setOpen(false)}>
        <div className="w-80 bg-white rounded-lg shadow-xl border p-4 mb-8"
          onClick={e => e.stopPropagation()}>
          <h4 className="text-sm font-semibold mb-3">{leftName} &rarr; {rightName}</h4>

          <label className="text-[11px] text-gray-500 block mb-1">Тип стыка</label>
          <select value={j.type}
            onChange={e => onChange({ ...j, type: e.target.value })}
            className="w-full text-sm border rounded p-1.5 mb-3">
            <option value="overlap">Overlap (PCR/Gibson)</option>
            <option value="golden_gate">Golden Gate</option>
            <option value="sticky_end">Рестриктаза</option>
            <option value="blunt">Тупые концы</option>
            <option value="preformed">Готовые концы</option>
          </select>

          {j.type === 'overlap' && (
            <>
              <label className="text-[11px] text-gray-500 block mb-1">Overlap на:</label>
              <div className="flex gap-1 mb-3">
                {modeBtn('left_only',
                  <><span className="text-teal-500">&larr;overlap</span><span className="text-gray-300">|</span><span>binding</span></>,
                  <>&laquo; {leftName}</>
                )}
                {modeBtn('split',
                  <><span className="text-teal-500">&larr;half</span><span className="text-gray-300">|</span><span className="text-teal-500">half&rarr;</span></>,
                  <>&laquo;&raquo; оба</>
                )}
                {modeBtn('right_only',
                  <><span>binding</span><span className="text-gray-300">|</span><span className="text-teal-500">overlap&rarr;</span></>,
                  <>{rightName} &raquo;</>
                )}
              </div>

              {/* Calc mode toggle */}
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] text-gray-500">Расчёт:</span>
                <div className="flex rounded-lg overflow-hidden border border-gray-200">
                  <button onClick={() => onChange({ ...j, calcMode: 'length' })}
                    className={`px-2.5 py-1 text-[10px] font-medium transition ${
                      calcMode === 'length' ? 'bg-blue-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                    По длине
                  </button>
                  <button onClick={() => onChange({ ...j, calcMode: 'tm' })}
                    className={`px-2.5 py-1 text-[10px] font-medium transition ${
                      calcMode === 'tm' ? 'bg-blue-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                    По Tm
                  </button>
                </div>
              </div>

              {calcMode === 'length' ? (
                <div className="flex items-center gap-2 mb-2">
                  <label className="text-[10px] text-gray-500">Overlap:</label>
                  <input type="number" value={j.overlapLength || 30} min={15} max={60}
                    onChange={e => onChange({ ...j, overlapLength: +e.target.value })}
                    className="w-16 text-sm border rounded px-2 py-1 text-center font-mono" />
                  <span className="text-[10px] text-gray-400">п.н.</span>
                  {j.overlapTm && <span className="text-[10px] text-gray-400 ml-1">→ Tm {j.overlapTm}°</span>}
                </div>
              ) : (
                <div className="flex items-center gap-2 mb-2">
                  <label className="text-[10px] text-gray-500">Целевой Tm:</label>
                  <input type="number" value={j.tmTarget || 62} min={45} max={75} step={0.5}
                    onChange={e => onChange({ ...j, tmTarget: +e.target.value })}
                    className="w-16 text-sm border rounded px-2 py-1 text-center font-mono" />
                  <span className="text-[10px] text-gray-400">°C</span>
                  {actualLen && <span className="text-[10px] text-gray-400 ml-1">→ {actualLen} п.н.</span>}
                </div>
              )}

              <div className="text-[9px] text-gray-400 mb-2">
                {j.overlapMode === 'split'
                  ? `Overlap ${displayLen} п.н. (по ~${Math.floor(displayLen / 2)} на каждый праймер)`
                  : `Overlap ${displayLen} п.н. целиком на одном праймере`}
              </div>
            </>
          )}

          {j.type === 'golden_gate' && (
            <>
              <label className="text-[11px] text-gray-500 block mb-1">Фермент</label>
              <select value={j.enzyme || 'BsaI'}
                onChange={e => onChange({ ...j, enzyme: e.target.value })}
                className="w-full text-sm border rounded p-1.5 mb-2">
                <option>BsaI</option><option>BbsI</option><option>Esp3I</option>
              </select>
              <label className="text-[11px] text-gray-500 block mb-1">4-нт овергенг</label>
              <input type="text" maxLength={4} value={j.overhang || ''}
                onChange={e => onChange({ ...j, overhang: e.target.value.toUpperCase() })}
                className="w-full text-sm border rounded p-1.5 font-mono" placeholder="ATCG" />
            </>
          )}

          {j.type === 'sticky_end' && (
            <>
              <label className="text-[11px] text-gray-500 block mb-1">Рестриктаза</label>
              <input type="text" value={j.reEnzyme || ''}
                onChange={e => onChange({ ...j, reEnzyme: e.target.value })}
                className="w-full text-sm border rounded p-1.5" placeholder="EcoRI" />
            </>
          )}

          <button onClick={() => setOpen(false)}
            className="mt-3 w-full text-xs bg-gray-100 hover:bg-gray-200 rounded p-1.5">
            Готово
          </button>
        </div>
        </div>,
        document.body
      )}
    </div>
  );
}
