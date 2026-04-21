import { sanitizeSequence } from '../../sequence-utils';

/**
 * Primary sequence rendering — three branches:
 *   1. CDS nucleotide view: per-nt clickable grid with AA under middle nt
 *   2. Non-CDS edit mode: textarea (free-form DNA editing)
 *   3. Non-CDS view mode: clickable nucleotide grid for DNA-level mutagenesis
 *
 * No internal state. All interactions go through callbacks so FragmentEditor
 * keeps ownership of mutTarget/dnaMutTarget/mutations/seq state.
 */
export default function SequenceGrid({
  isCDS, codonLines, seq, editMode, mode,
  mutations, mutTarget, dnaMutTarget, mutationHighlight,
  onOpenDnaMutMenu, onOpenMutMenu, onSetSeq, onSetNucTooltip,
}) {
  return (
    <>
      {/* CDS nucleotide view — per-nucleotide clickable, AA below middle nt */}
      {isCDS && (
        <div className="bg-gray-50 rounded-lg p-3 max-h-[220px] overflow-y-auto mb-3 font-mono relative select-none">
          {codonLines.map(line => (
            <div key={line.pos} className="mb-2 flex items-start">
              <span className="text-gray-400 w-10 text-right mr-2 shrink-0 text-[9px] pt-0.5">{line.pos}</span>
              <div className="flex flex-wrap">
                {line.codons.map((c, ci) => {
                  const ai = c.aaIdx - 1;
                  const ntBase = ai * 3;
                  return c.codon.split('').map((nt, ni) => {
                    const ntPos = ntBase + ni;
                    const dEnd = dnaMutTarget?.endPos ?? dnaMutTarget?.pos ?? -1;
                    const inDnaRange = dnaMutTarget && ntPos >= dnaMutTarget.pos && ntPos <= dEnd;
                    const inAARange = mutTarget && ai >= mutTarget.start && ai <= mutTarget.end;
                    const isMut = mutations.some(m => m.position === ntPos || (m.codonStart != null && ntPos >= m.codonStart && ntPos < m.codonStart + 3));
                    const isMiddle = ni === 1;
                    const isCodonEnd = ni === 2;
                    const mh = mutationHighlight.get(ntPos);
                    return (
                      <span key={`${ci}-${ni}`} className="inline-block text-center" style={{ width: '1.2ch', marginRight: isCodonEnd ? '0.3ch' : 0 }}>
                        <span className={`block text-[11px] cursor-pointer rounded-sm transition
                          ${inDnaRange ? 'bg-teal-300 text-white' : inAARange ? 'bg-purple-200' : isMut ? 'bg-amber-200' : 'hover:bg-teal-100'}`}
                          style={{
                            borderBottom: mh
                              ? `2px solid ${mh === 'nonsilent' ? '#ef4444' : '#eab308'}`
                              : (c.dom ? `2px solid ${c.dom.color}` : 'none'),
                            backgroundColor: !inDnaRange && !inAARange && !isMut && mh
                              ? (mh === 'nonsilent' ? 'rgba(239,68,68,0.25)' : 'rgba(234,179,8,0.25)')
                              : undefined,
                          }}
                          title={mh ? `Мутация: ${mh === 'silent' ? 'silent (same AA)' : 'non-silent'}` : undefined}
                          onMouseEnter={e => { const r = e.currentTarget.getBoundingClientRect(); onSetNucTooltip({ x: r.left + r.width/2, y: r.top - 4, text: `${nt} · ${ntPos + 1}${mh ? ` · ${mh}` : ''}` }); }}
                          onMouseLeave={() => onSetNucTooltip(null)}
                          onClick={e => { e.preventDefault(); onOpenDnaMutMenu(e, ntPos); }}>
                          {nt}
                        </span>
                        {isMiddle ? (
                          <span className={`block text-[9px] cursor-pointer ${editMode === 'view' ? 'hover:font-bold' : ''}`}
                            style={{ color: c.aa === '*' ? '#dc2626' : c.aa === 'M' && c.aaIdx === 1 ? '#16a34a' : c.dom ? c.dom.color : '#aaa' }}
                            onClick={e => { e.preventDefault(); e.stopPropagation(); onOpenMutMenu(e, ai, c.aa, c.codon); }}>
                            {c.aa}
                          </span>
                        ) : (
                          <span className="block text-[9px] text-transparent">{' '}</span>
                        )}
                      </span>
                    );
                  });
                })}
              </div>
            </div>
          ))}
        </div>
      )}
      {isCDS && !mutTarget && !dnaMutTarget && (
        <div className="text-[9px] text-gray-400 -mt-2 mb-2 text-center">
          {mode === 'mutagenesis'
            ? 'Нуклеотид → мутация ДНК · Аминокислота → замена АК · Shift → диапазон'
            : 'Клик по нуклеотиду — правка ДНК. Для мутагенеза переключите режим выше.'}
        </div>
      )}

      {/* Non-CDS edit mode: textarea */}
      {!isCDS && editMode === 'edit' && (
        <div className="mb-3">
          <textarea value={seq} onChange={e => onSetSeq(sanitizeSequence(e.target.value))}
            className="w-full font-mono text-[11px] leading-relaxed border rounded-lg p-3 h-32 resize-y focus:border-blue-400 outline-none" spellCheck={false} />
        </div>
      )}

      {/* Non-CDS view mode: clickable nucleotides for DNA mutagenesis */}
      {!isCDS && editMode === 'view' && (
        <div className="bg-gray-50 rounded-lg p-3 max-h-[200px] overflow-y-auto mb-3 font-mono text-[11px]">
          {Array.from({ length: Math.ceil(seq.length / 60) }, (_, li) => {
            const lineStart = li * 60;
            const lineSeq = seq.slice(lineStart, lineStart + 60);
            return (
              <div key={li} className="flex items-start mb-0.5">
                <span className="text-gray-400 w-10 text-right mr-2 shrink-0 text-[9px] pt-0.5 select-none">{lineStart + 1}</span>
                <span>
                  {lineSeq.split('').map((nt, ci) => {
                    const pos = lineStart + ci;
                    const isDnaMut = dnaMutTarget && pos >= dnaMutTarget.pos && pos <= (dnaMutTarget.endPos ?? dnaMutTarget.pos);
                    const isMut = mutations.some(m => m.position === pos);
                    const gap = ci > 0 && ci % 10 === 0;
                    const mh = mutationHighlight.get(pos);
                    return (
                      <span key={ci}
                        className={`cursor-pointer transition rounded ${gap ? 'ml-1' : ''}
                          ${isDnaMut ? 'bg-teal-300 text-white' : isMut ? 'bg-amber-200' : mh ? '' : 'hover:bg-teal-100'}`}
                        style={!isDnaMut && !isMut && mh ? {
                          backgroundColor: mh === 'nonsilent' ? 'rgba(239,68,68,0.25)' : 'rgba(234,179,8,0.25)',
                          borderBottom: `2px solid ${mh === 'nonsilent' ? '#ef4444' : '#eab308'}`,
                        } : undefined}
                        title={mh ? `Мутация: ${mh === 'silent' ? 'silent (same AA)' : 'non-silent'}` : undefined}
                        onMouseEnter={e => { const r = e.currentTarget.getBoundingClientRect(); onSetNucTooltip({ x: r.left + r.width/2, y: r.top - 4, text: `${nt} · ${pos + 1}${mh ? ` · ${mh}` : ''}` }); }}
                        onMouseLeave={() => onSetNucTooltip(null)}
                        onClick={e => onOpenDnaMutMenu(e, pos)}>
                        {nt}
                      </span>
                    );
                  })}
                </span>
              </div>
            );
          })}
          {!dnaMutTarget && (
            <div className="text-[9px] text-gray-400 text-center mt-1">
              {mode === 'mutagenesis' ? 'Клик по нуклеотиду → мутагенез ДНК' : 'Клик по нуклеотиду → правка ДНК'}
            </div>
          )}
        </div>
      )}
    </>
  );
}
