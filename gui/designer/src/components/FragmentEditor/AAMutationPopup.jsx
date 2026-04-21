import { createPortal } from 'react-dom';
import { getCommonSubstitutions } from '../../mutagenesis';

/**
 * AA mutation popup — portal-positioned menu for amino-acid substitutions,
 * range replacements, Ala-scan and deletions. Rendered from FragmentEditor
 * when `mutTarget` is non-null and the fragment is a CDS.
 */
export default function AAMutationPopup({
  mutTarget, protein, seq, customAA, mutations,
  onClose, onSetCustomAA, onApplyMut, onApplyMultiMut, onApplyDel,
}) {
  if (!mutTarget) return null;

  const mutRangeLen = mutTarget.end - mutTarget.start + 1;
  const mutRangeAAs = protein.slice(mutTarget.start, mutTarget.end + 1);

  return createPortal(
    <div className="fixed inset-0 z-[60]" onClick={(e) => { e.stopPropagation(); onClose(); }}>
      <div className="absolute bg-white rounded-xl shadow-2xl border p-3 w-64"
        style={{
          left: Math.min(mutTarget.x, window.innerWidth - 270),
          top: Math.min(mutTarget.y, window.innerHeight - 320),
        }}
        onClick={e => e.stopPropagation()}>

        {/* Header — single AA or range */}
        <div className="flex justify-between items-center mb-2">
          <div className="text-[11px] font-semibold">
            {mutRangeLen === 1 ? (
              <>Мутация: <span className="text-purple-700">{mutRangeAAs}{mutTarget.start + 1}</span>
              <span className="text-gray-400 ml-1 font-mono">({seq.slice(mutTarget.start * 3, mutTarget.start * 3 + 3).toUpperCase()})</span></>
            ) : (
              <>Диапазон: <span className="text-purple-700">{mutTarget.start + 1}–{mutTarget.end + 1}</span>
              <span className="text-gray-400 ml-1">({mutRangeLen} а.о.)</span></>
            )}
          </div>
          <button onClick={onClose} className="text-gray-300 hover:text-gray-500 text-xs">{'✕'}</button>
        </div>

        {/* Current sequence */}
        <div className="flex items-center gap-1 mb-2 font-mono text-[11px] bg-gray-50 rounded px-2 py-1">
          <span className="text-gray-400 text-[9px]">сейчас:</span>
          <span className="font-bold text-purple-700">{mutRangeAAs}</span>
          <span className="text-gray-400">({seq.slice(mutTarget.start * 3, (mutTarget.end + 1) * 3).toUpperCase()})</span>
        </div>

        {/* Single AA: quick substitutions */}
        {mutRangeLen === 1 && (<>
          <div className="text-[10px] text-gray-500 mb-1">Замена на:</div>
          <div className="flex flex-wrap gap-1 mb-2">
            {getCommonSubstitutions(mutRangeAAs).map(sub => (
              <button key={sub.to} onClick={() => onApplyMut(sub.to)}
                className="px-2 py-0.5 rounded border text-[10px] font-mono hover:bg-purple-50 hover:border-purple-300 transition">
                {'→'}{sub.to}
                <span className="text-[8px] text-gray-400 ml-0.5">{sub.note}</span>
              </button>
            ))}
          </div>
        </>)}

        {/* Custom AA input — works for single and multi */}
        <div className="flex gap-1 mb-2">
          <input value={customAA}
            onChange={e => onSetCustomAA(e.target.value.toUpperCase().replace(/[^ACDEFGHIKLMNPQRSTVWY]/g, ''))}
            maxLength={mutRangeLen} placeholder={mutRangeLen === 1 ? 'X' : 'AA...'}
            className={`border rounded text-center font-mono text-sm ${mutRangeLen === 1 ? 'w-8' : 'w-20'}`} autoFocus />
          <button onClick={() => {
              if (!customAA) return;
              if (mutRangeLen === 1) onApplyMut(customAA[0]);
              else onApplyMultiMut(customAA);
            }}
            disabled={!customAA}
            className="text-[10px] px-2 border rounded hover:bg-purple-50 disabled:opacity-30">
            {mutRangeLen > 1 ? `Заменить ${mutRangeLen} а.о.` : 'Заменить'}
          </button>
        </div>

        {/* Multi-AA: Ala scan all */}
        {mutRangeLen > 1 && (
          <div className="flex gap-1 mb-2">
            <button onClick={() => onApplyMultiMut('A'.repeat(mutRangeLen))}
              className="text-[10px] px-2 py-0.5 border rounded hover:bg-purple-50 flex-1 text-left">
              {'→'} {'A'.repeat(mutRangeLen)} <span className="text-[8px] text-gray-400">Ala scan ({mutRangeLen})</span>
            </button>
          </div>
        )}

        {/* Delete */}
        <div className="border-t pt-2 space-y-1">
          <button onClick={onApplyDel}
            className="text-[10px] text-red-600 hover:bg-red-50 px-2 py-0.5 rounded w-full text-left">
            {'🗑'} Удалить {mutRangeLen === 1 ? `${mutRangeAAs}${mutTarget.start + 1}` : `${mutTarget.start + 1}–${mutTarget.end + 1} (${mutRangeLen} а.о.)`}
          </button>
        </div>

        {/* Applied mutations */}
        {mutations.length > 0 && (
          <div className="border-t pt-2 mt-2">
            <div className="text-[9px] text-gray-400 mb-0.5">Применённые ({mutations.length}):</div>
            {mutations.map((m, mi) => (
              <span key={mi} className="inline-block text-[9px] bg-purple-50 text-purple-700 rounded px-1.5 py-0.5 mr-1 mb-0.5 font-mono">{m.label}</span>
            ))}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
