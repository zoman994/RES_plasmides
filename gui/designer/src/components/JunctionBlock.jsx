import { useState } from 'react';
import { createPortal } from 'react-dom';
import { GG_ENZYMES, reverseComplement } from '../golden-gate';
import { useStore } from '../store';

const TYPE_STYLES = {
  overlap:      { bg: 'bg-blue-50',   border: 'border-blue-200',   text: 'text-blue-700',   active: 'bg-blue-500 text-white border-blue-500' },
  golden_gate:  { bg: 'bg-green-50',  border: 'border-green-200',  text: 'text-green-700',  active: 'bg-green-500 text-white border-green-500' },
  re_ligation:  { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700', active: 'bg-orange-500 text-white border-orange-500' },
  kld:          { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700', active: 'bg-purple-500 text-white border-purple-500' },
  sticky_end:   { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700', active: 'bg-orange-500 text-white border-orange-500' },
  blunt:        { bg: 'bg-gray-50',   border: 'border-gray-200',   text: 'text-gray-600',   active: 'bg-gray-500 text-white border-gray-500' },
  preformed:    { bg: 'bg-gray-50',   border: 'border-gray-200',   text: 'text-gray-600',   active: 'bg-gray-500 text-white border-gray-500' },
};

const LINE_COLORS = {
  overlap: 'bg-blue-300', golden_gate: 'bg-green-400', re_ligation: 'bg-orange-400',
  kld: 'bg-purple-400', sticky_end: 'bg-orange-300', blunt: 'bg-gray-300', preformed: 'bg-gray-300',
};

export default function JunctionBlock({ junction, index, leftName, rightName, leftFrag, rightFrag, leftPCR = true, rightPCR = true, onChange, allOverhangs, fragmentCount = 1 }) {
  // ═══ Store selector (granular) ═══
  const expertMode = useStore(s => s.expertMode);
  const [open, setOpen] = useState(false);
  const j = junction || { type: 'overlap', overlapMode: 'split', overlapLength: 30, tmTarget: 62 };
  const jType = j.type || 'overlap';
  const st = TYPE_STYLES[jType] || TYPE_STYLES.overlap;

  // Detect identical adjacent fragments — overlap is impossible
  const identicalNeighbors = leftFrag?.sequence && rightFrag?.sequence && leftFrag.sequence === rightFrag.sequence;
  const overlapImpossible = identicalNeighbors && (jType === 'overlap');

  const calcMode = j.calcMode || 'length';
  const userLen = j.overlapLength || 30;
  const actualLen = j.overlapSequence ? j.overlapSequence.length : null;
  const displayLen = actualLen || userLen;
  const modeArrow = j.overlapMode === 'left_only' ? '◀' : j.overlapMode === 'right_only' ? '▶' : '◀▶';

  const tip = overlapImpossible
    ? `⛔ Идентичные фрагменты — overlap невозможен! Переключите на Golden Gate.`
    : jType === 'overlap'
    ? (j.overlapSequence
      ? `Overlap: ${j.overlapSequence}\n${displayLen} п.н. · Tm ${j.overlapTm || '?'}°C · GC ${j.overlapGc || '?'}%`
      : `Overlap: ${userLen} п.н.`)
    : jType === 'golden_gate' ? `Golden Gate: ${j.enzyme || 'BsaI'} · ${j.overhang || '----'}`
    : jType === 're_ligation' || jType === 'sticky_end' ? `Рестрикция: ${j.reEnzyme || j.enzyme || '?'}`
    : jType === 'kld' ? 'KLD (back-to-back ligation)'
    : jType;

  const modeBtn = (mode, icon, desc) => {
    const disabled = (mode === 'split' && (!leftPCR || !rightPCR))
      || (mode === 'left_only' && !leftPCR) || (mode === 'right_only' && !rightPCR);
    return (
      <button onClick={() => { if (disabled) return; let len = j.overlapLength || 30; if (mode === 'split' && len < 28) len = 30; onChange({ ...j, overlapMode: mode, overlapLength: len, autoMode: false }); }}
        disabled={disabled}
        className={`flex-1 text-[10px] py-2 px-1 rounded border text-center transition
          ${j.overlapMode === mode ? 'bg-blue-50 border-blue-400 text-blue-700 font-bold'
            : disabled ? 'bg-gray-50 text-gray-300 cursor-not-allowed border-gray-100'
            : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
        title={disabled ? `Недоступно: ${!leftPCR ? leftName : rightName} без ПЦР` : undefined}>
        <div className="font-mono">{icon}</div>
        <div className="mt-1">{desc}</div>
      </button>
    );
  };

  // ═══ Junction label (visual coding per type) ═══
  const renderLabel = () => {
    switch (jType) {
      case 'golden_gate':
        return (
          <div className="flex flex-col items-center leading-tight">
            <span className="text-[7px] text-gray-400">{j.enzyme || 'BsaI'}</span>
            <span className={`text-[10px] font-bold font-mono px-1.5 py-0.5 rounded-full border ${st.bg} ${st.border} ${st.text}`}>
              {j.overhang || '----'}
            </span>
          </div>
        );
      case 're_ligation':
      case 'sticky_end':
        return (
          <div className="flex flex-col items-center leading-tight">
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${st.bg} ${st.border} ${st.text}`}>
              {'✂'} {j.reEnzyme || j.enzyme || 'RE'}
            </span>
          </div>
        );
      case 'kld':
        return (
          <div className="flex flex-col items-center leading-tight">
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${st.bg} ${st.border} ${st.text}`}>
              KLD
            </span>
          </div>
        );
      default: { // overlap
        const compact = fragmentCount > 8;
        return (
          <div className="flex flex-col items-center leading-tight">
            <span className={`text-[${compact ? '8' : '10'}px] font-bold px-1 py-0.5 rounded-full border ${st.bg} ${st.border} ${st.text}`}>
              {compact ? displayLen : `${modeArrow} ${displayLen} п.н.`}
            </span>
            {!compact && j.overlapTm ? (
              <span className="text-[8px] text-gray-400 mt-0.5">
                {calcMode === 'tm' ? `Tm≈${j.tmTarget || 62}°` : `Tm ${j.overlapTm}°`}
              </span>
            ) : null}
          </div>
        );
      }
    }
  };

  // ═══ Junction type selector buttons ═══
  const typeButtons = [
    { val: 'overlap', icon: '◀▶', label: 'Overlap' },
    { val: 'golden_gate', icon: '🔶', label: 'Golden Gate' },
    { val: 're_ligation', icon: '✂', label: 'RE/Лигирование' },
    { val: 'kld', icon: '🔄', label: 'KLD' },
  ];

  return (
    <div className="relative">
      <div onClick={() => expertMode && setOpen(!open)}
        className={`w-6 h-14 flex items-center justify-center transition rounded ${expertMode ? 'cursor-pointer hover:bg-blue-50' : 'cursor-default'}`}
        title={expertMode ? tip : `${tip}\n🔬 Эксперт: настройка`}>
        <div className={`w-0.5 h-10 rounded ${overlapImpossible ? 'bg-red-400' : LINE_COLORS[jType] || 'bg-gray-300'}`} />
      </div>
      <div className="absolute -top-4 left-1/2 -translate-x-1/2 whitespace-nowrap pointer-events-none" style={{ zIndex: 2 }}>
        {renderLabel()}
      </div>

      {open && createPortal(
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-black/20 overflow-y-auto"
          onClick={() => setOpen(false)}>
        <div className="w-80 bg-white rounded-lg shadow-xl border p-4 mb-8"
          onClick={e => e.stopPropagation()}>
          <h4 className="text-sm font-semibold mb-3">{leftName} &rarr; {rightName}</h4>
          {overlapImpossible && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-2 mb-3 text-[10px] text-red-800">
              <div className="font-semibold">{'⛔'} Идентичные фрагменты!</div>
              <div className="text-red-600 mt-0.5">Overlap-регионы будут одинаковыми — сборка даст неправильный продукт.</div>
              <button onClick={() => onChange({ ...j, type: 'golden_gate', enzyme: 'BsaI' })}
                className="mt-1.5 text-[10px] bg-green-600 text-white px-2 py-0.5 rounded hover:bg-green-700 inline-flex items-center gap-1">
                {'🔶'} Переключить на Golden Gate
              </button>
            </div>
          )}

          {/* Type selector — visual buttons */}
          <div className="flex gap-1 mb-3">
            {typeButtons.map(tb => {
              const tst = TYPE_STYLES[tb.val];
              return (
                <button key={tb.val}
                  onClick={() => onChange({ ...j, type: tb.val })}
                  className={`flex-1 px-1.5 py-1.5 rounded-lg text-[9px] font-medium border transition text-center ${
                    jType === tb.val ? tst.active : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}>
                  <div className="text-sm">{tb.icon}</div>
                  <div>{tb.label}</div>
                </button>
              );
            })}
          </div>

          {/* ═══ Overlap settings ═══ */}
          {jType === 'overlap' && (
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

          {/* ═══ Golden Gate settings ═══ */}
          {jType === 'golden_gate' && (() => {
            const enzKey = j.enzyme || 'BsaI';
            const enz = GG_ENZYMES[enzKey] || GG_ENZYMES.BsaI;
            const ovLen = enz.overhangLength;
            const oh = j.overhang || '';
            const ohValid = oh.length === ovLen;
            const ohRC = ohValid ? reverseComplement(oh) : '';
            const isPalindrome = ohValid && oh === ohRC;
            const gc = ohValid ? oh.split('').filter(c => c === 'G' || c === 'C').length : 0;
            const leftSeq = (leftFrag?.sequence || '').toUpperCase();
            const rightSeq = (rightFrag?.sequence || '').toUpperCase();
            const contextL = leftSeq.slice(-6);
            const contextR = rightSeq.slice(0, 6);
            const half = Math.floor(ovLen / 2);
            const ohLeft = leftSeq.slice(-half);
            const ohRight = rightSeq.slice(0, ovLen - half);
            return (<>
              <label className="text-[11px] text-gray-500 block mb-1">Рестриктаза</label>
              <select value={enzKey}
                onChange={e => {
                  const newEnz = e.target.value;
                  const newOvLen = GG_ENZYMES[newEnz]?.overhangLength || 4;
                  const newHalf = Math.floor(newOvLen / 2);
                  const newOh = leftSeq.slice(-newHalf) + rightSeq.slice(0, newOvLen - newHalf);
                  onChange({ ...j, enzyme: newEnz, overhang: newOh.toUpperCase() });
                }}
                className="w-full text-xs border rounded p-1.5 mb-1">
                {Object.entries(GG_ENZYMES).map(([k, e]) => (
                  <option key={k} value={k}>{e.name} ({e.recognition}, {e.overhangLength}nt){e.alias ? ` / ${e.alias}` : ''}</option>
                ))}
              </select>
              <div className="text-[9px] text-gray-400 mb-3">{enz.notes}</div>

              {/* Auto-extracted overhang display */}
              <div className="text-[10px] text-gray-500 mb-1">{ovLen}-нт овехенг (из последовательности):</div>
              <div className="flex items-center gap-2 mb-2">
                <span className={`font-mono text-base font-bold tracking-widest px-3 py-1 rounded-lg border ${
                  !ohValid ? 'bg-gray-50 border-gray-200 text-gray-400'
                  : isPalindrome ? 'bg-red-50 border-red-200 text-red-700'
                  : 'bg-green-50 border-green-200 text-green-700'}`}>
                  {oh || '?'.repeat(ovLen)}
                </span>
                {ohValid && (
                  <div className="flex flex-col gap-0.5 text-[9px]">
                    <span className={isPalindrome ? 'text-red-600' : 'text-green-600'}>
                      {isPalindrome ? '✗ Палиндром' : '✓ Не палиндром'}
                    </span>
                    <span className={gc === 0 || gc === ovLen ? 'text-amber-600' : 'text-green-600'}>
                      GC: {gc}/{ovLen} {'·'} {ohValid ? '✓ уникальный' : ''}
                    </span>
                  </div>
                )}
              </div>

              {/* Sequence context + sticky end structure */}
              {leftSeq && rightSeq && (
                <div className="bg-gray-50 rounded-lg p-2 mb-2">
                  <div className="text-[9px] text-gray-500 mb-1.5 font-mono">
                    {leftName}: ...{contextL.slice(0, -half)}<span className="text-green-700 font-bold bg-green-100 px-0.5 rounded">{ohLeft}</span>
                    <span className="text-gray-300 mx-0.5">│</span>
                    <span className="text-green-700 font-bold bg-green-100 px-0.5 rounded">{ohRight}</span>{contextR.slice(ovLen - half)}... :{rightName}
                  </div>
                  {ohValid && (
                    <pre className="bg-white rounded border p-2 font-mono text-[10px] leading-relaxed m-0 overflow-x-auto">{
`5' ...──${oh}${'    '} 3'
       ${oh.split('').map(() => '│').join('')}
3'  ${'    '}${ohRC}──... 5'`
                    }</pre>
                  )}
                </div>
              )}

              {/* Manual override */}
              <details className="mb-2">
                <summary className="text-[9px] text-gray-400 cursor-pointer hover:text-gray-600">Ручная коррекция овехенга</summary>
                <input type="text" maxLength={ovLen} value={oh}
                  onChange={e => onChange({ ...j, overhang: e.target.value.toUpperCase().replace(/[^ATGC]/g, '') })}
                  className="mt-1 text-sm border rounded px-2 py-1 font-mono tracking-widest w-24 text-center" />
              </details>

              {/* All junctions in this assembly — show type for each */}
              {allOverhangs?.length > 0 && (
                <div className="pt-2 border-t">
                  <div className="text-[10px] text-gray-500 font-medium mb-1">Все стыки в сборке:</div>
                  <div className="space-y-0.5">
                    {allOverhangs.map((ao, ai) => {
                      const isCurrent = ai === index;
                      const isGG = ao.type === 'golden_gate';
                      if (!isGG) {
                        // Non-GG junction — show method label
                        return (
                          <div key={ai} className="flex items-center gap-2 text-[10px] px-1.5 py-0.5">
                            <span className="text-gray-400 w-4">#{ai + 1}</span>
                            <span className="text-gray-400 italic w-12 text-[9px]">
                              {ao.type === 'overlap' ? 'overlap' : ao.type === 'kld' ? 'KLD' : ao.type === 're_ligation' ? 'RE' : ao.type || 'overlap'}
                            </span>
                            <span className="text-gray-300 truncate flex-1">({ao.leftName}↔{ao.rightName})</span>
                            <span className="text-gray-300">—</span>
                          </div>
                        );
                      }
                      // GG junction — show overhang with validation
                      const isDup = allOverhangs.some((o, oi) => oi !== ai && o.type === 'golden_gate' && o.overhang === ao.overhang && ao.overhang);
                      const isRCm = allOverhangs.some((o, oi) => oi !== ai && o.type === 'golden_gate' && ao.overhang && o.overhang === reverseComplement(ao.overhang));
                      const aoPalin = ao.overhang && ao.overhang === reverseComplement(ao.overhang);
                      const hasIssue = isDup || isRCm || aoPalin;
                      return (
                        <div key={ai} className={`flex items-center gap-2 text-[10px] px-1.5 py-0.5 rounded ${isCurrent ? 'bg-green-50' : ''}`}>
                          <span className="text-gray-400 w-4">#{ai + 1}</span>
                          <span className={`font-mono font-bold w-12 ${hasIssue ? 'text-red-600' : 'text-green-700'}`}>
                            {ao.overhang || '????'}
                          </span>
                          <span className="text-gray-400 truncate flex-1">({ao.leftName}↔{ao.rightName})</span>
                          {hasIssue ? <span className="text-red-500 text-[9px]">{'⚠'}</span> : <span className="text-green-500 text-[9px]">{'✓'}</span>}
                          {isCurrent && <span className="text-[8px] text-blue-500">{'←'}</span>}
                        </div>
                      );
                    })}
                  </div>
                  {(() => {
                    const ggOH = allOverhangs.filter(ao => ao.type === 'golden_gate' && ao.overhang);
                    if (!ggOH.length) return null;
                    const allUnique = ggOH.every(ao =>
                      !ggOH.some(o => o !== ao && (o.overhang === ao.overhang || o.overhang === reverseComplement(ao.overhang)))
                    ) && !ggOH.some(ao => ao.overhang === reverseComplement(ao.overhang));
                    return (
                      <div className={`mt-1 pt-1 border-t text-[9px] ${allUnique ? 'text-green-600' : 'text-amber-600'}`}>
                        {allUnique
                          ? `✅ ${ggOH.length} GG овехенг(ов) — все уникальны`
                          : `⚠ Есть конфликты — проверьте овехенги`}
                      </div>
                    );
                  })()}
                </div>
              )}
            </>);
          })()}

          {/* ═══ RE/Ligation settings ═══ */}
          {jType === 're_ligation' && (
            <>
              <label className="text-[11px] text-gray-500 block mb-1">Рестриктаза</label>
              <input type="text" value={j.reEnzyme || j.enzyme || ''}
                onChange={e => onChange({ ...j, reEnzyme: e.target.value, enzyme: e.target.value })}
                className="w-full text-sm border rounded p-1.5" placeholder="EcoRI" />
              <div className="text-[9px] text-gray-400 mt-1">Рестрикция обоих фрагментов + лигирование T4 лигазой</div>
            </>
          )}

          {/* ═══ Sticky end (legacy, same as re_ligation) ═══ */}
          {jType === 'sticky_end' && (
            <>
              <label className="text-[11px] text-gray-500 block mb-1">Рестриктаза</label>
              <input type="text" value={j.reEnzyme || ''}
                onChange={e => onChange({ ...j, reEnzyme: e.target.value })}
                className="w-full text-sm border rounded p-1.5" placeholder="EcoRI" />
            </>
          )}

          {/* ═══ KLD settings ═══ */}
          {jType === 'kld' && (
            <div className="text-[10px] text-gray-500 bg-purple-50 rounded p-2">
              <b>KLD (Kinase-Ligase-DpnI):</b> Праймеры стоят «спина к спине» без overlap.
              Продукт фосфорилируется, лигируется и обрабатывается DpnI.
              <div className="mt-1 text-purple-600">Идеален для делеций, инсерций и замен в плазмиде.</div>
            </div>
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
