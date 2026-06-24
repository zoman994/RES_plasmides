import { useState, useRef, useEffect } from 'react';
import { Icon } from './icons/Icon';
import { RE_ENZYMES } from '../restriction-db';
import { GG_ENZYMES } from '../golden-gate';
import { calcTmNN } from '../tm-calculator';

const RC = { A: 'T', T: 'A', G: 'C', C: 'G' };
const revComp = s => s.split('').reverse().map(c => RC[c.toUpperCase()] || 'N').join('');

/* ─── Primer row helper ─── */
function PrimerRow({ primer, fragName, arrow }) {
  if (!primer) return null;
  const tailLen = primer.tailSequence?.length || 0;
  const bindLen = (primer.bindingSequence || '').length;
  return (
    <div className="bg-gray-50 rounded p-2 mb-1.5">
      <div className="text-[9px] text-gray-500 mb-1">{primer.name} ({arrow} на {fragName})</div>
      <div className="font-mono text-[11px] overflow-x-auto whitespace-nowrap" style={{ fontWeight: 400 }}>
        <span className="text-gray-400 text-[9px]">5'─</span>
        <span className="text-teal-600 bg-teal-50 border-b-2 border-dashed border-teal-400 px-0.5 rounded-sm">
          {(primer.tailSequence || '').toLowerCase()}</span>
        <span className="text-[#1a1a1a] bg-gray-100 border-b-2 border-gray-600 px-0.5 rounded-sm">
          {(primer.bindingSequence || '').toUpperCase()}</span>
        <span className="text-gray-400 text-[9px]">─3'</span>
      </div>
      <div className="text-[8px] text-gray-500 mt-0.5">
        <span className="text-teal-600">tail</span> {tailLen} п.н. ·
        BINDING {bindLen} п.н. ·
        всего {tailLen + bindLen} п.н. ·
        Tm {primer.tmBinding}°C
      </div>
    </div>
  );
}

export default function JunctionDNA({ junction, calculated, primers = [],
                                       leftFragment, rightFragment }) {
  const [expanded, setExpanded] = useState(false);
  const panelRef = useRef(null);
  const j = junction || {};
  const jType = j.type || 'overlap';

  // Click outside to close
  useEffect(() => {
    if (!expanded) return;
    const handler = (e) => { if (panelRef.current && !panelRef.current.contains(e.target)) setExpanded(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [expanded]);

  // Always show panel — display context-appropriate message inside when sequences missing
  const hasContent = true;

  const leftName = leftFragment?.name || '';
  const rightName = rightFragment?.name || '';

  // ═══ Universal primer lookup — works for regular AND merged blocks ═══
  const findPrimers = () => {
    let revSearch = leftName;
    let fwdSearch = rightName;
    if (leftFragment?.subFragments?.length > 0) {
      revSearch = leftFragment.subFragments[leftFragment.subFragments.length - 1].name;
    }
    if (rightFragment?.subFragments?.length > 0) {
      fwdSearch = rightFragment.subFragments[0].name;
    }
    const revLeft = primers.find(p => p.direction === 'reverse' && p.name.includes(revSearch) && !p.isInternal) || null;
    const fwdRight = primers.find(p => p.direction === 'forward' && p.name.includes(fwdSearch) && !p.isInternal) || null;
    return { revLeft, fwdRight, revSearch, fwdSearch };
  };

  if (!expanded) {
    // Collapsed: small clickable dot, color-coded by type
    const dotColors = {
      overlap: 'bg-blue-300 hover:bg-blue-500',
      golden_gate: 'bg-green-300 hover:bg-green-500',
      re_ligation: 'bg-orange-300 hover:bg-orange-500',
      sticky_end: 'bg-orange-300 hover:bg-orange-500',
      kld: 'bg-purple-300 hover:bg-purple-500',
    };
    return (
      <div className="flex justify-center cursor-pointer" onClick={() => setExpanded(true)}
        title="Клик — показать детали стыка">
        <div className={`w-2 h-2 rounded-full transition ${dotColors[jType] || 'bg-blue-300 hover:bg-blue-500'}`} />
      </div>
    );
  }

  // ═══ Expanded panels by type ═══
  return (
    <div ref={panelRef} className="bg-white border border-gray-200 rounded-xl shadow-lg p-3 mx-1 my-1"
      style={{ minWidth: 340, maxWidth: 480 }}>

      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-semibold text-gray-700">
          {leftName} {'↔'} {rightName}
          {jType === 'overlap' && <> — {j.overlapLength || 30} п.н. overlap</>}
          {jType === 'golden_gate' && <> — Golden Gate ({j.enzyme || 'BsaI'})</>}
          {(jType === 're_ligation' || jType === 'sticky_end') && <> — RE ({j.reEnzyme || j.enzyme || '?'})</>}
          {jType === 'kld' && <> — KLD</>}
        </span>
        <button onClick={() => setExpanded(false)} className="text-gray-400 hover:text-gray-600 text-xs" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="close" size={12} /></button>
      </div>

      {/* ═══ Overlap / Gibson ═══ */}
      {jType === 'overlap' && (() => {
        const leftSeq = (leftFragment?.sequence || '').toUpperCase();
        const rightSeq = (rightFragment?.sequence || '').toUpperCase();
        if (!leftSeq || !rightSeq) return (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-2 text-[9px] text-amber-700">
            Добавьте последовательности фрагментам для отображения overlap зоны.
          </div>
        );

        const overlapLen = j.overlapLength || 30;
        const mode = j.overlapMode || 'split';
        const half = Math.ceil(overlapLen / 2);

        let overlapSeq;
        if (mode === 'split') {
          overlapSeq = leftSeq.slice(-half) + rightSeq.slice(0, overlapLen - half);
        } else if (mode === 'left_only') {
          overlapSeq = leftSeq.slice(-overlapLen);
        } else {
          overlapSeq = rightSeq.slice(0, overlapLen);
        }
        const overlapTm = overlapSeq.length >= 10 ? Math.round(calcTmNN(overlapSeq) * 10) / 10 : null;

        const { revLeft, fwdRight, revSearch, fwdSearch } = findPrimers();

        const CONTEXT = 10;
        const leftContext = leftSeq.slice(-(half + CONTEXT), -half);
        const rightContext = rightSeq.slice(overlapLen - half, overlapLen - half + CONTEXT);
        const leftOverlap = overlapSeq.slice(0, half);
        const rightOverlap = overlapSeq.slice(half);

        return (<>
          <PrimerRow primer={revLeft} fragName={revSearch} arrow="←" />
          <PrimerRow primer={fwdRight} fragName={fwdSearch} arrow="→" />

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-2 mt-1">
            <div className="text-[9px] font-semibold text-amber-700 mb-1.5">
              Перекрышка: {overlapSeq.length} п.н.
              {overlapTm && <> · Tm {overlapTm}°C</>}
              {' · '}{mode === 'split' ? `split ${half}+${overlapLen - half}` : mode}
            </div>

            {/* Pure ASCII character grid — no special chars, no bg colors */}
            {(() => {
              const maxLbl = Math.max(leftName.length, rightName.length) + 2;
              const pad = (s, len) => s + ' '.repeat(Math.max(0, len - s.length));
              const lbl1 = pad(leftName + ': ', maxLbl);
              const lbl2 = pad(rightName + ': ', maxLbl);
              const spc = ' '.repeat(maxLbl);
              const ctx = leftContext.toLowerCase();
              const ctxSpc = ' '.repeat(ctx.length);
              const prefix = "5'-";
              const prefixSpc = ' '.repeat(prefix.length);
              const lo = leftOverlap.toUpperCase();
              const ro = rightOverlap.toLowerCase();
              const loLow = leftOverlap.toLowerCase();
              const roUp = rightOverlap.toUpperCase();
              const bars = '|'.repeat(overlapSeq.length);
              const rCtx = rightContext.toLowerCase();
              return (
                <pre className="font-mono text-[10px] leading-relaxed m-0 overflow-x-auto whitespace-pre bg-white rounded border p-1.5" style={{ fontWeight: 400 }}>
                  <span className="text-gray-400">{lbl1}{prefix}{ctx}</span><span className="text-blue-700">{lo}</span><span className="text-teal-600">{ro}</span><span className="text-gray-400">{"-3'"}</span>{'\n'}
                  <span className="text-gray-300">{spc}{prefixSpc}{ctxSpc}</span><span className="text-amber-500">{bars}</span>{'\n'}
                  <span className="text-gray-400">{lbl2}{prefixSpc}{ctxSpc}</span><span className="text-teal-600">{loLow}</span><span className="text-blue-700">{roUp}</span><span className="text-gray-400">{rCtx}{"-3'"}</span>
                </pre>
              );
            })()}

            <div className="flex items-center gap-1 mt-1.5">
              <span className="text-[8px] text-gray-400">Seq:</span>
              <code className="text-[9px] font-mono bg-gray-50 px-1 rounded text-gray-600 select-all cursor-text overflow-x-auto max-w-[280px]">{overlapSeq}</code>
              <button onClick={() => navigator.clipboard.writeText(overlapSeq)}
                className="text-[8px] text-gray-400 hover:text-blue-600 shrink-0" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="copy" size={11} /></button>
            </div>
          </div>
        </>);
      })()}

      {/* ═══ Golden Gate ═══ */}
      {jType === 'golden_gate' && (() => {
        const enzKey = j.enzyme || 'BsaI';
        const enz = GG_ENZYMES[enzKey] || GG_ENZYMES.BsaI;
        const oh = (j.overhang || '').toUpperCase();
        const ohRC = oh ? revComp(oh) : '';
        const { revLeft, fwdRight, revSearch, fwdSearch } = findPrimers();

        return (<>
          <PrimerRow primer={revLeft} fragName={revSearch} arrow="←" />
          <PrimerRow primer={fwdRight} fragName={fwdSearch} arrow="→" />

          <div className="bg-green-50 border border-green-200 rounded-lg p-2">
            <div className="text-[9px] font-semibold text-green-700 mb-1.5">
              Golden Gate: {enzKey} ({enz?.recognition || '?'})
            </div>
            <div className="font-mono text-[10px] mb-1">
              <span className="text-green-700 font-bold">{oh || '????'}</span>
              <span className="text-gray-400 mx-1">overhang</span>
              <span className="text-gray-500">({enz?.overhangLength || 4} nt)</span>
            </div>
            {oh && (
              <pre className="bg-white rounded border p-1.5 font-mono text-[10px] leading-relaxed m-0 overflow-x-auto">{
`5' ...──${oh}     3'
       ${oh.split('').map(() => '│').join('')}
3'      ${ohRC}──... 5'`
              }</pre>
            )}
            <div className="text-[8px] text-green-600 mt-1">
              Праймеры содержат recognition site ({enz?.recognition}) + spacer + overhang в tail
            </div>
          </div>
        </>);
      })()}

      {/* ═══ RE / Ligation ═══ */}
      {(jType === 're_ligation' || jType === 'sticky_end') && (() => {
        const enzName = j.reEnzyme || j.enzyme || '';
        const info = RE_ENZYMES[enzName];
        const { revLeft, fwdRight, revSearch, fwdSearch } = findPrimers();

        return (<>
          <PrimerRow primer={revLeft} fragName={revSearch} arrow="←" />
          <PrimerRow primer={fwdRight} fragName={fwdSearch} arrow="→" />

          <div className="bg-orange-50 border border-orange-200 rounded-lg p-2">
            <div className="text-[9px] font-semibold text-orange-700 mb-1.5">
              Рестрикция: {enzName || '(не выбрана)'}
            </div>
            {info ? (<>
              <div className="font-mono text-[10px] mb-1">
                <span className="text-orange-700 font-bold">{info.site}</span>
                <span className="text-gray-400 mx-1">→</span>
                <span className={info.end === 'blunt' ? 'text-gray-600' : info.end === '5prime' ? 'text-blue-600' : 'text-orange-600'}>
                  {info.end === '5prime' ? "5' overhang" : info.end === '3prime' ? "3' overhang" : 'blunt ends'}
                </span>
                {info.overhang && <span className="font-mono text-gray-500 ml-1">({info.overhang})</span>}
              </div>
              <div className="text-[8px] text-gray-500">{info.temp}°C · {info.buffer}</div>
              <div className="text-[8px] text-orange-600 mt-1">
                Рестрикция обоих фрагментов → лигирование T4 лигазой
              </div>
            </>) : (
              <div className="text-[9px] text-gray-400">Выберите фермент в настройках junction</div>
            )}
          </div>
        </>);
      })()}

      {/* ═══ KLD ═══ */}
      {jType === 'kld' && (() => {
        const { revLeft, fwdRight, revSearch, fwdSearch } = findPrimers();

        return (<>
          <PrimerRow primer={revLeft} fragName={revSearch} arrow="←" />
          <PrimerRow primer={fwdRight} fragName={fwdSearch} arrow="→" />

          <div className="bg-purple-50 border border-purple-200 rounded-lg p-2">
            <div className="text-[9px] font-semibold text-purple-700 mb-1.5">
              KLD (Kinase–Ligase–DpnI)
            </div>
            <div className="text-[9px] text-purple-600 space-y-1">
              <div>Праймеры стоят «спина к спине» без overlap (back-to-back).</div>
              <div>5'-фосфорилированные или обработанные T4 PNK.</div>
              <div className="font-medium mt-1">Протокол:</div>
              <ol className="list-decimal ml-4 space-y-0.5">
                <li>ПЦР со спец. полимеразой (Q5, Phusion)</li>
                <li>DpnI — переваривание матричной ДНК (dam+)</li>
                <li>KLD mix: T4 PNK + T4 лигаза + DpnI</li>
                <li>Трансформация</li>
              </ol>
              <div className="text-[8px] text-purple-500 mt-1">NEB #M0554 / #E0554</div>
            </div>
          </div>
        </>);
      })()}
    </div>
  );
}
