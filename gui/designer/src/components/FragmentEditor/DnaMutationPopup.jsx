import { createPortal } from 'react-dom';
import { CODON_TABLE } from '../../codons';
import { sanitizeSequence } from '../../sequence-utils';

/**
 * DNA-level mutation portal-popup: substitution, insertion, deletion.
 * For CDS fragments also shows codon/AA preview and "delete codon" shortcut.
 */
export default function DnaMutationPopup({
  dnaMutTarget, seq, insertSeq, mutations, isCDS,
  onClose, onSetInsertSeq, onApplyDnaSub, onApplyDnaDel, onApplyDnaInsert,
}) {
  if (!dnaMutTarget) return null;

  const isRange = dnaMutTarget.endPos != null && dnaMutTarget.endPos !== dnaMutTarget.pos;
  const rangeLen = isRange ? dnaMutTarget.endPos - dnaMutTarget.pos + 1 : 1;

  return createPortal(
    <div className="fixed inset-0 z-[60]" onClick={onClose}>
      <div className="absolute bg-white rounded-xl shadow-2xl border p-3 w-64 max-h-[90vh] overflow-y-auto"
        style={{
          left: Math.max(8, Math.min(dnaMutTarget.x, window.innerWidth - 272)),
          top: Math.max(8, Math.min(dnaMutTarget.y, window.innerHeight - 400)),
        }}
        onClick={e => e.stopPropagation()}>

        <div className="flex justify-between items-center mb-2">
          <div className="text-[11px] font-semibold">
            {isRange ? (
              <>ДНК: <span className="text-teal-700 font-mono">{dnaMutTarget.pos + 1}–{dnaMutTarget.endPos + 1}</span>
              <span className="text-gray-400 ml-1">({rangeLen} п.н.)</span></>
            ) : (
              <>ДНК мутация: <span className="text-teal-700 font-mono">{dnaMutTarget.nt}</span>
              <span className="text-gray-400 ml-1">позиция {dnaMutTarget.pos + 1}</span></>
            )}
          </div>
          <button onClick={onClose} className="text-gray-300 hover:text-gray-500 text-xs">{'✕'}</button>
        </div>

        {/* Substitution */}
        <div className="text-[10px] text-gray-500 mb-1">Замена нуклеотида:</div>
        <div className="flex gap-1 mb-2">
          {['A', 'T', 'G', 'C'].map(nt => (
            <button key={nt} onClick={() => onApplyDnaSub(dnaMutTarget.pos, nt)}
              disabled={nt === dnaMutTarget.nt}
              className={`w-8 h-8 rounded-lg font-mono font-bold text-sm border transition
                ${nt === dnaMutTarget.nt ? 'bg-gray-100 text-gray-300 cursor-default' :
                  nt === 'A' ? 'hover:bg-green-50 hover:border-green-400 text-green-700' :
                  nt === 'T' ? 'hover:bg-red-50 hover:border-red-400 text-red-700' :
                  nt === 'G' ? 'hover:bg-amber-50 hover:border-amber-400 text-amber-700' :
                  'hover:bg-blue-50 hover:border-blue-400 text-blue-700'}`}>
              {nt}
            </button>
          ))}
        </div>

        {/* Show AA effect for CDS */}
        {isCDS && (() => {
          const ai = Math.floor(dnaMutTarget.pos / 3);
          const codon = seq.slice(ai * 3, ai * 3 + 3).toUpperCase();
          const aa = CODON_TABLE[codon] || '?';
          return (
            <div className="text-[9px] text-gray-500 mb-2 bg-gray-50 rounded px-2 py-1 font-mono">
              Кодон: {codon} → {aa}{ai + 1}
            </div>
          );
        })()}

        {/* Insertion */}
        <div className="border-t pt-2 mb-2">
          <div className="text-[10px] text-gray-500 mb-1">Вставка после позиции {dnaMutTarget.pos + 1}:</div>
          <div className="flex gap-1">
            <input value={insertSeq} onChange={e => onSetInsertSeq(sanitizeSequence(e.target.value))}
              placeholder="ATGC..." className="flex-1 border rounded px-2 py-1 text-xs font-mono" />
            <button onClick={() => onApplyDnaInsert(dnaMutTarget.pos + 1, insertSeq)}
              disabled={!insertSeq}
              className="text-[10px] px-2 border rounded hover:bg-teal-50 disabled:opacity-30">Вставить</button>
          </div>
        </div>

        {/* Deletion */}
        <div className="border-t pt-2 space-y-1">
          {isRange ? (
            <button onClick={() => onApplyDnaDel(dnaMutTarget.pos, rangeLen)}
              className="text-[10px] text-red-600 hover:bg-red-50 px-2 py-0.5 rounded w-full text-left">
              {'🗑'} Удалить {dnaMutTarget.pos + 1}–{dnaMutTarget.endPos + 1} ({rangeLen} п.н.)
            </button>
          ) : (<>
            <button onClick={() => onApplyDnaDel(dnaMutTarget.pos, 1)}
              className="text-[10px] text-red-600 hover:bg-red-50 px-2 py-0.5 rounded w-full text-left">
              {'🗑'} Удалить {dnaMutTarget.nt} (1 п.н.)
            </button>
            {isCDS && (
              <button onClick={() => onApplyDnaDel(Math.floor(dnaMutTarget.pos / 3) * 3, 3)}
                className="text-[10px] text-red-600 hover:bg-red-50 px-2 py-0.5 rounded w-full text-left">
                {'🗑'} Удалить кодон — 3 п.н.
              </button>
            )}
          </>)}
        </div>

        {/* Applied mutations */}
        {mutations.length > 0 && (
          <div className="border-t pt-2 mt-2">
            <div className="text-[9px] text-gray-400 mb-0.5">Применённые ({mutations.length}):</div>
            {mutations.map((m, mi) => (
              <span key={mi} className="inline-block text-[9px] bg-teal-50 text-teal-700 rounded px-1.5 py-0.5 mr-1 mb-0.5 font-mono">{m.label}</span>
            ))}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

/**
 * Instant nucleotide tooltip (no browser delay). Rendered alongside the DNA
 * popup so its lifecycle stays co-located with other mutation-UI portals.
 */
export function NucTooltip({ tooltip }) {
  if (!tooltip) return null;
  return createPortal(
    <div style={{ position: 'fixed', left: tooltip.x, top: tooltip.y,
      transform: 'translate(-50%, -100%)', pointerEvents: 'none', zIndex: 9999,
      background: 'rgba(0,0,0,0.8)', color: '#fff', fontSize: '10px',
      padding: '2px 6px', borderRadius: '4px', whiteSpace: 'nowrap' }}>
      {tooltip.text}
    </div>,
    document.body
  );
}
