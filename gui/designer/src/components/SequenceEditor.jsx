import { useState, useMemo } from 'react';
import { translateDNA } from '../codons';

const STOPS = ['TAA', 'TAG', 'TGA'];
const hasStop = s => STOPS.includes((s || '').slice(-3).toUpperCase());
const gcContent = s => { const g = ((s || '').toUpperCase().match(/[GC]/g) || []).length; return s ? g / s.length : 0; };
const fmtCodons = s => (s || '').match(/.{1,3}/g)?.join(' ') || s;

const QUICK_ACTIONS = [
  { key: 'add_TAA', label: '+ TAA стоп', pos: 'end', insert: 'TAA', forType: 'CDS', cond: s => !hasStop(s) },
  { key: 'add_TAG', label: '+ TAG стоп', pos: 'end', insert: 'TAG', forType: 'CDS', cond: s => !hasStop(s) },
  { key: 'add_TGA', label: '+ TGA стоп', pos: 'end', insert: 'TGA', forType: 'CDS', cond: s => !hasStop(s) },
  { key: 'add_ATG', label: '+ ATG старт', pos: 'start', insert: 'ATG', forType: 'CDS', cond: s => !s.toUpperCase().startsWith('ATG') },
  { key: 'rm_stop', label: 'Удалить стоп', pos: 'end', remove: 3, forType: 'CDS', cond: s => hasStop(s) },
  { key: 'kozak', label: '+ Kozak', pos: 'start', insert: 'GCCACC', forType: 'CDS', desc: 'GCCACCATG — для млекопитающих' },
  { key: 'his6c', label: '+ His6 (C)', pos: 'before_stop', insert: 'CATCACCATCACCATCAC', forType: 'CDS', desc: '6×His перед стопом' },
  { key: 'his6n', label: '+ His6 (N)', pos: 'after_start', insert: 'CATCACCATCACCATCAC', forType: 'CDS', desc: '6×His после ATG' },
  { key: 'gs_link', label: '+ GS линкер', pos: 'end', insert: 'GGCGGCGGCGGCTCCGGCGGCGGCGGCTCC', desc: '(GGGGS)₂' },
];

export default function SequenceEditor({ fragment, onSave, onClose }) {
  const [seq, setSeq] = useState(fragment.sequence || '');
  const [mode, setMode] = useState('quick'); // 'quick' | 'full'
  const origLen = (fragment.sequence || '').length;

  const protein5 = useMemo(() => fragment.type === 'CDS' ? translateDNA(seq.slice(0, 30)) : '', [seq, fragment.type]);
  const protein3 = useMemo(() => fragment.type === 'CDS' ? translateDNA(seq.slice(-30)) : '', [seq, fragment.type]);

  const apply = (a) => {
    let s = seq;
    if (a.insert) {
      if (a.pos === 'start') s = a.insert + s;
      else if (a.pos === 'end') s = s + a.insert;
      else if (a.pos === 'before_stop' && hasStop(s)) s = s.slice(0, -3) + a.insert + s.slice(-3);
      else if (a.pos === 'before_stop') s = s + a.insert;
      else if (a.pos === 'after_start') s = s.slice(0, 3) + a.insert + s.slice(3);
    }
    if (a.remove) {
      if (a.pos === 'start') s = s.slice(a.remove);
      if (a.pos === 'end') s = s.slice(0, -a.remove);
    }
    setSeq(s);
  };

  const handleSave = () => {
    onSave({ ...fragment, sequence: seq, length: seq.length, editedAt: new Date().toISOString() });
    onClose();
  };

  const isCDS = fragment.type === 'CDS';
  const diff = seq.length - origLen;

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-[600px] max-h-[85vh] overflow-y-auto p-5"
        onClick={e => e.stopPropagation()}>

        <div className="flex justify-between items-start mb-3">
          <div>
            <h3 className="font-bold text-base">{'✏️'} Редактировать: {fragment.name}</h3>
            <div className="text-xs text-gray-500">{origLen} п.н.{isCDS ? ` (${Math.floor(origLen / 3)} а.о.)` : ''}</div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg">{'✕'}</button>
        </div>

        {/* Quick actions */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          {QUICK_ACTIONS
            .filter(a => !a.forType || a.forType === fragment.type)
            .filter(a => !a.cond || a.cond(seq))
            .map(a => (
              <button key={a.key} onClick={() => apply(a)}
                className="text-[10px] px-2 py-1 rounded border border-gray-200 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 transition"
                title={a.desc || ''}>
                {a.label}
              </button>
            ))}
        </div>

        {/* 5' / 3' end preview */}
        {isCDS && (
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className="bg-gray-50 rounded-lg p-2">
              <div className="text-[9px] text-gray-400 mb-1">5' начало:</div>
              <div className="font-mono text-[10px] text-gray-800">{fmtCodons(seq.slice(0, 30))}</div>
              <div className="font-mono text-[9px] text-gray-400 mt-0.5">{protein5}</div>
              {!seq.toUpperCase().startsWith('ATG') && (
                <div className="text-[9px] text-amber-600 mt-1">{'⚠'} Нет ATG!</div>
              )}
            </div>
            <div className="bg-gray-50 rounded-lg p-2">
              <div className="text-[9px] text-gray-400 mb-1">3' конец:</div>
              <div className="font-mono text-[10px] text-gray-800">...{fmtCodons(seq.slice(-30))}</div>
              <div className="font-mono text-[9px] text-gray-400 mt-0.5">...{protein3}</div>
              {!hasStop(seq) && (
                <div className="text-[9px] text-red-600 mt-1 flex gap-1 items-center">
                  {'⚠'} Нет стоп!
                  <button onClick={() => apply(QUICK_ACTIONS[0])} className="underline text-blue-600 text-[9px]">+TAA</button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Full sequence editor */}
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-gray-500">
              {mode === 'quick' ? 'Последовательность (только просмотр)' : 'Редактирование последовательности'}
            </span>
            <button onClick={() => setMode(m => m === 'quick' ? 'full' : 'quick')}
              className="text-[10px] text-blue-600 hover:underline">
              {mode === 'quick' ? '✏️ Редактировать' : '👁 Только просмотр'}
            </button>
          </div>
          {mode === 'full' ? (
            <textarea value={seq}
              onChange={e => setSeq(e.target.value.toUpperCase().replace(/[^ATGCNRYWSMKHBVD]/g, ''))}
              className="w-full font-mono text-[10px] leading-relaxed border rounded-lg p-3 h-32 resize-y focus:border-blue-400 outline-none"
              spellCheck={false} />
          ) : (
            <div className="font-mono text-[10px] leading-relaxed bg-gray-50 rounded-lg p-3 max-h-[120px] overflow-y-auto break-all text-gray-600">
              {seq.slice(0, 300)}{seq.length > 300 && <span className="text-gray-400">... ({seq.length} п.н.)</span>}
            </div>
          )}
        </div>

        {/* Live stats */}
        <div className="flex gap-3 text-[10px] text-gray-500 mb-3 flex-wrap">
          <span>Длина: {seq.length} п.н.
            {diff !== 0 && <span className={diff > 0 ? 'text-green-600' : 'text-red-600'}> ({diff > 0 ? '+' : ''}{diff})</span>}
          </span>
          {isCDS && (
            <>
              <span className={seq.length % 3 === 0 ? 'text-green-600' : 'text-red-600'}>
                Рамка: {seq.length % 3 === 0 ? '✓ ×3' : `⚠ ост. ${seq.length % 3}`}
              </span>
              <span>ATG: {seq.toUpperCase().startsWith('ATG') ? '✓' : '⚠'}</span>
              <span>Стоп: {hasStop(seq) ? `✓ ${seq.slice(-3).toUpperCase()}` : '⚠ нет'}</span>
            </>
          )}
          <span>GC: {(gcContent(seq) * 100).toFixed(1)}%</span>
        </div>

        {/* Frameshift warning */}
        {isCDS && seq.length % 3 !== 0 && (
          <div className="text-[10px] text-red-600 bg-red-50 rounded-lg p-2 mb-3">
            {'⚠'} Длина {seq.length} не кратна 3 — сдвиг рамки считывания!
          </div>
        )}

        {/* Save */}
        <div className="flex gap-2">
          <button onClick={handleSave}
            className="text-xs bg-blue-600 text-white px-4 py-1.5 rounded-lg hover:bg-blue-700 transition font-semibold">
            {'💾'} Сохранить
          </button>
          <button onClick={onClose} className="text-xs text-gray-500 px-4 py-1.5">Отмена</button>
        </div>
      </div>
    </div>
  );
}
