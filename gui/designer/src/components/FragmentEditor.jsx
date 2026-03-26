/**
 * FragmentEditor — unified editor:
 *   🔤 ДНК (DNA editing + codon/AA display + quick actions)
 *   🧬 Белок (protein editing + domain annotation) — CDS only
 */
import { useState, useMemo } from 'react';
import { translateDNA, CODON_TABLE } from '../codons';
import { autoDetectDomains, DOMAIN_COLORS } from '../domain-detection';

const STOPS = ['TAA', 'TAG', 'TGA'];
const hasStop = s => STOPS.includes((s || '').slice(-3).toUpperCase());
const gcContent = s => { const g = ((s || '').toUpperCase().match(/[GC]/g) || []).length; return s ? g / s.length : 0; };

const QUICK_ACTIONS = [
  { key: 'add_TAA', label: '+ TAA', pos: 'end', insert: 'TAA', forType: 'CDS', cond: s => !hasStop(s) },
  { key: 'add_TAG', label: '+ TAG', pos: 'end', insert: 'TAG', forType: 'CDS', cond: s => !hasStop(s) },
  { key: 'add_ATG', label: '+ ATG', pos: 'start', insert: 'ATG', forType: 'CDS', cond: s => !s.toUpperCase().startsWith('ATG') },
  { key: 'rm_stop', label: 'Убрать стоп', pos: 'end', remove: 3, forType: 'CDS', cond: s => hasStop(s) },
  { key: 'kozak', label: '+ Kozak', pos: 'start', insert: 'GCCACC', forType: 'CDS', desc: 'GCCACCATG' },
  { key: 'his6c', label: '+ His6 (C)', pos: 'before_stop', insert: 'CATCACCATCACCATCAC', forType: 'CDS' },
];

const DOMAIN_TYPES = [
  { value: 'signal', label: 'Сигн. пептид' }, { value: 'propeptide', label: 'Пропептид' },
  { value: 'domain', label: 'Домен' }, { value: 'linker', label: 'Линкер' },
  { value: 'tag', label: 'Тег' }, { value: 'binding', label: 'Связывающий' },
  { value: 'transmembrane', label: 'Трансмембр.' }, { value: 'custom', label: 'Другое' },
];

const DOMAINS_LS_KEY = 'pvcs-parts-domains';
function loadSavedDomains(id) { try { return JSON.parse(localStorage.getItem(DOMAINS_LS_KEY) || '{}')[id]; } catch { return null; } }
function persistDomains(id, domains) { try { const a = JSON.parse(localStorage.getItem(DOMAINS_LS_KEY) || '{}'); a[id] = domains; localStorage.setItem(DOMAINS_LS_KEY, JSON.stringify(a)); } catch {} }

export default function FragmentEditor({ fragment, onSave, onClose }) {
  const isCDS = fragment.type === 'CDS';
  const [tab, setTab] = useState('dna'); // 'dna' | 'protein'
  const [seq, setSeq] = useState(fragment.sequence || '');
  const [domains, setDomains] = useState(fragment.domains?.length ? fragment.domains : loadSavedDomains(fragment.id) || loadSavedDomains(fragment.name) || []);
  const [editMode, setEditMode] = useState('view');
  const [addForm, setAddForm] = useState(null);
  const origLen = (fragment.sequence || '').length;

  const protein = useMemo(() => translateDNA(seq), [seq]);
  const totalAA = protein.length;
  const diff = seq.length - origLen;

  const apply = (a) => {
    let s = seq;
    if (a.insert) {
      if (a.pos === 'start') s = a.insert + s;
      else if (a.pos === 'end') s = s + a.insert;
      else if (a.pos === 'before_stop' && hasStop(s)) s = s.slice(0, -3) + a.insert + s.slice(-3);
      else if (a.pos === 'before_stop') s = s + a.insert;
    }
    if (a.remove) { if (a.pos === 'end') s = s.slice(0, -a.remove); if (a.pos === 'start') s = s.slice(a.remove); }
    setSeq(s);
  };

  const handleSave = () => {
    persistDomains(fragment.id || fragment.name, domains);
    onSave({ ...fragment, sequence: seq, length: seq.length, domains, editedAt: new Date().toISOString() });
    onClose();
  };

  const addDomain = () => {
    if (!addForm?.name || addForm.startAA >= addForm.endAA) return;
    setDomains(prev => [...prev, { name: addForm.name, type: addForm.type || 'domain', startAA: addForm.startAA, endAA: addForm.endAA, color: DOMAIN_COLORS[addForm.type] || DOMAIN_COLORS.custom }].sort((a, b) => a.startAA - b.startAA));
    setAddForm(null);
  };

  // Build codon lines for DNA tab (10 codons per line)
  const codonLines = useMemo(() => {
    if (!isCDS) return [];
    const lines = [];
    for (let i = 0; i < seq.length; i += 30) {
      const chunk = seq.slice(i, i + 30);
      const codons = [];
      for (let j = 0; j < chunk.length; j += 3) {
        const codon = chunk.slice(j, j + 3).toUpperCase();
        const aa = CODON_TABLE[codon] || (codon.length < 3 ? '' : 'X');
        const aaIdx = Math.floor((i + j) / 3) + 1;
        const dom = domains.find(d => aaIdx >= d.startAA && aaIdx <= d.endAA);
        codons.push({ codon, aa, aaIdx, dom });
      }
      lines.push({ pos: i + 1, codons });
    }
    return lines;
  }, [seq, isCDS, domains]);

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-[680px] max-h-[85vh] overflow-y-auto p-5" onClick={e => e.stopPropagation()}>

        <div className="flex justify-between items-start mb-3">
          <div>
            <h3 className="font-bold text-base">{'✏️'} {fragment.name}</h3>
            <div className="text-xs text-gray-500">{seq.length} п.н.{isCDS ? ` · ${totalAA} а.о.` : ''}</div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg">{'✕'}</button>
        </div>

        {/* Tabs */}
        <div className="flex gap-0 rounded-lg overflow-hidden border mb-3">
          <button onClick={() => setTab('dna')}
            className={`flex-1 px-3 py-1.5 text-xs font-medium transition ${tab === 'dna' ? 'bg-blue-600 text-white' : 'hover:bg-gray-50'}`}>
            {'🔤'} ДНК
          </button>
          {isCDS && (
            <button onClick={() => setTab('protein')}
              className={`flex-1 px-3 py-1.5 text-xs font-medium transition ${tab === 'protein' ? 'bg-blue-600 text-white' : 'hover:bg-gray-50'}`}>
              {'🧬'} Белок
            </button>
          )}
        </div>

        {/* ═══ TAB: ДНК ═══ */}
        {tab === 'dna' && (
          <>
            {/* Quick actions */}
            <div className="flex flex-wrap gap-1 mb-3">
              {QUICK_ACTIONS.filter(a => !a.forType || a.forType === fragment.type).filter(a => !a.cond || a.cond(seq)).map(a => (
                <button key={a.key} onClick={() => apply(a)} title={a.desc || ''}
                  className="text-[10px] px-2 py-1 rounded border border-gray-200 hover:bg-blue-50 hover:border-blue-300 transition">{a.label}</button>
              ))}
            </div>

            {/* Codon view with amino acids (CDS) */}
            {isCDS && editMode === 'view' && (
              <div className="bg-gray-50 rounded-lg p-3 max-h-[200px] overflow-y-auto mb-3 font-mono text-[10px]">
                {codonLines.map(line => (
                  <div key={line.pos} className="mb-1">
                    <div className="flex items-start">
                      <span className="text-gray-400 w-10 text-right mr-2 shrink-0 text-[9px] pt-0.5">{line.pos}</span>
                      <div>
                        {/* Codons */}
                        <div className="flex flex-wrap">
                          {line.codons.map((c, ci) => (
                            <span key={ci} className="mr-1.5" style={{ borderBottom: c.dom ? `2px solid ${c.dom.color}` : 'none' }}>
                              {c.codon}
                            </span>
                          ))}
                        </div>
                        {/* Amino acids below */}
                        <div className="flex flex-wrap text-[9px] text-gray-500 -mt-0.5">
                          {line.codons.map((c, ci) => (
                            <span key={ci} className="mr-1.5 w-[calc(3ch+6px)] text-center"
                              style={{ color: c.aa === '*' ? '#dc2626' : c.dom ? c.dom.color : '#888' }}>
                              {c.aa}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Non-CDS or edit mode: plain sequence */}
            {(!isCDS || editMode === 'edit') && (
              <div className="mb-3">
                {editMode === 'edit' ? (
                  <textarea value={seq} onChange={e => setSeq(e.target.value.toUpperCase().replace(/[^ATGCNRYWSMKHBVD]/g, ''))}
                    className="w-full font-mono text-[10px] leading-relaxed border rounded-lg p-3 h-32 resize-y focus:border-blue-400 outline-none" spellCheck={false} />
                ) : (
                  <div className="font-mono text-[10px] leading-relaxed bg-gray-50 rounded-lg p-3 max-h-[150px] overflow-y-auto break-all text-gray-600">
                    {seq.slice(0, 400)}{seq.length > 400 && <span className="text-gray-400">... ({seq.length})</span>}
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-between items-center mb-3">
              <div className="flex gap-3 text-[10px] text-gray-500 flex-wrap">
                <span>Длина: {seq.length}{diff !== 0 && <span className={diff > 0 ? 'text-green-600' : 'text-red-600'}> ({diff > 0 ? '+' : ''}{diff})</span>}</span>
                {isCDS && <span className={seq.length % 3 === 0 ? 'text-green-600' : 'text-red-600'}>Рамка: {seq.length % 3 === 0 ? '✓' : `⚠ ост. ${seq.length % 3}`}</span>}
                {isCDS && <span>ATG: {seq.toUpperCase().startsWith('ATG') ? '✓' : '⚠'}</span>}
                {isCDS && <span>Стоп: {hasStop(seq) ? `✓ ${seq.slice(-3).toUpperCase()}` : '⚠'}</span>}
                <span>GC: {(gcContent(seq) * 100).toFixed(1)}%</span>
              </div>
              <button onClick={() => setEditMode(m => m === 'view' ? 'edit' : 'view')}
                className="text-[10px] text-blue-600 hover:underline shrink-0">
                {editMode === 'view' ? '✏️ Редактировать' : '👁 Просмотр'}
              </button>
            </div>
          </>
        )}

        {/* ═══ TAB: Белок ═══ */}
        {tab === 'protein' && isCDS && (
          <>
            {/* Domain bar */}
            {domains.length > 0 && (
              <div className="mb-3">
                <div className="flex h-6 rounded overflow-hidden border">
                  {domains.map((d, di) => {
                    const w = Math.max(2, ((d.endAA - d.startAA + 1) / totalAA) * 100);
                    return (
                      <div key={di} style={{ width: `${w}%`, backgroundColor: d.color }}
                        className="flex items-center justify-center text-[7px] text-white font-medium truncate px-0.5 border-r border-white/30"
                        title={`${d.name}: ${d.startAA}–${d.endAA} а.о.`}>
                        {w > 6 ? d.name : ''}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Protein sequence — editable with domain coloring */}
            <div className="font-mono text-[10px] leading-relaxed bg-gray-50 p-3 rounded max-h-[150px] overflow-y-auto break-all mb-3">
              {protein.split('').map((aa, i) => {
                const pos = i + 1;
                const dom = domains.find(d => pos >= d.startAA && pos <= d.endAA);
                return (
                  <span key={i} style={{
                    backgroundColor: dom ? dom.color + '25' : 'transparent',
                    borderBottom: dom ? `2px solid ${dom.color}` : 'none',
                    color: aa === '*' ? '#dc2626' : '#333',
                  }} title={`${aa} — позиция ${pos}${dom ? ` (${dom.name})` : ''}`}>{aa}</span>
                );
              })}
            </div>

            {/* Domain management */}
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-gray-600">Домены ({domains.length})</span>
              <div className="flex gap-2">
                <button onClick={() => setDomains(autoDetectDomains(seq, fragment.name))}
                  className="text-[10px] px-2 py-1 bg-blue-50 text-blue-700 rounded hover:bg-blue-100">{'🔍'} Авто</button>
                <button onClick={() => setAddForm({ name: '', type: 'domain', startAA: 1, endAA: totalAA })}
                  className="text-[10px] px-2 py-1 bg-green-50 text-green-700 rounded hover:bg-green-100">+ Добавить</button>
              </div>
            </div>

            {domains.length > 0 && (
              <table className="w-full text-[11px] mb-3">
                <thead><tr className="text-gray-400 text-[9px] uppercase">
                  <th className="text-left p-1">#</th><th className="text-left p-1">Имя</th>
                  <th className="text-left p-1">Тип</th><th className="text-right p-1">Позиция</th>
                  <th className="text-right p-1">Дл.</th><th className="p-1 w-5"></th>
                </tr></thead>
                <tbody>{domains.map((d, di) => (
                  <tr key={di} className="border-t hover:bg-gray-50">
                    <td className="p-1"><span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: d.color }} /></td>
                    <td className="p-1"><input value={d.name} onChange={e => setDomains(prev => prev.map((x, j) => j === di ? { ...x, name: e.target.value } : x))}
                      className="text-[11px] border rounded px-1 py-0.5 w-24" /></td>
                    <td className="p-1"><select value={d.type} onChange={e => setDomains(prev => prev.map((x, j) => j === di ? { ...x, type: e.target.value, color: DOMAIN_COLORS[e.target.value] || x.color } : x))}
                      className="text-[10px] border rounded px-1 py-0.5">{DOMAIN_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select></td>
                    <td className="p-1 text-right text-[10px]">
                      <input type="number" value={d.startAA} min={1} max={totalAA} onChange={e => setDomains(prev => prev.map((x, j) => j === di ? { ...x, startAA: +e.target.value } : x))}
                        className="w-11 text-[10px] border rounded px-1 py-0.5 text-right" />–
                      <input type="number" value={d.endAA} min={1} max={totalAA} onChange={e => setDomains(prev => prev.map((x, j) => j === di ? { ...x, endAA: +e.target.value } : x))}
                        className="w-11 text-[10px] border rounded px-1 py-0.5 text-right" />
                    </td>
                    <td className="p-1 text-right text-gray-400">{d.endAA - d.startAA + 1}</td>
                    <td className="p-1"><button onClick={() => setDomains(prev => prev.filter((_, j) => j !== di))} className="text-gray-300 hover:text-red-500">{'✕'}</button></td>
                  </tr>
                ))}</tbody>
              </table>
            )}

            {domains.length === 0 && <div className="text-center text-gray-400 text-xs py-3 mb-3">Нажмите «Авто» или добавьте вручную</div>}

            {addForm && (
              <div className="border rounded p-2 bg-gray-50 mb-3 space-y-2">
                <div className="grid grid-cols-4 gap-2">
                  <input placeholder="Имя" value={addForm.name} onChange={e => setAddForm({ ...addForm, name: e.target.value })} className="text-xs border rounded p-1.5 col-span-2" />
                  <select value={addForm.type} onChange={e => setAddForm({ ...addForm, type: e.target.value })} className="text-xs border rounded p-1.5">
                    {DOMAIN_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select>
                  <div className="flex gap-1">
                    <input type="number" value={addForm.startAA} min={1} max={totalAA} onChange={e => setAddForm({ ...addForm, startAA: +e.target.value })} className="text-xs border rounded p-1.5 w-14" />
                    <input type="number" value={addForm.endAA} min={1} max={totalAA} onChange={e => setAddForm({ ...addForm, endAA: +e.target.value })} className="text-xs border rounded p-1.5 w-14" />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={addDomain} className="text-xs px-3 py-1 bg-green-600 text-white rounded">Добавить</button>
                  <button onClick={() => setAddForm(null)} className="text-xs px-3 py-1 bg-gray-200 rounded">Отмена</button>
                </div>
              </div>
            )}
          </>
        )}

        {/* Save */}
        <div className="flex gap-2">
          <button onClick={handleSave} className="text-xs bg-blue-600 text-white px-4 py-1.5 rounded-lg hover:bg-blue-700 font-semibold">{'💾'} Сохранить</button>
          <button onClick={onClose} className="text-xs text-gray-500 px-4 py-1.5">Отмена</button>
        </div>
      </div>
    </div>
  );
}
