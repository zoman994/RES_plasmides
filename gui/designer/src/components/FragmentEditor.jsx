/**
 * FragmentEditor — unified editor:
 *   🔤 ДНК (DNA editing + codon/AA display + quick actions)
 *   🧬 Белок (protein editing + domain annotation) — CDS only
 */
import { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { translateDNA, CODON_TABLE } from '../codons';
import { autoDetectDomains, DOMAIN_COLORS } from '../domain-detection';
import { FEATURE_COLORS, getFragColor, isMarker } from '../theme';
import { detectModification, suggestVariantName } from '../part-variants';
import { getCommonSubstitutions, inlineSubstitution, inlineDeletion, designInlineKLDPrimers } from '../mutagenesis';

// Standard palette from design system
const BASE_PALETTE = [
  '#56B4E9', '#009E73', '#D55E00', '#E69F00', '#F0E442',
  '#CC79A7', '#0072B2', '#999999', '#661100', '#AA4499',
  '#6929c4', '#1192e8', '#005d5d', '#9f1853', '#fa4d56',
  '#198038', '#002d9c', '#b28600',
];

const USER_COLORS_KEY = 'pvcs-user-palette';
function loadUserColors() {
  try {
    const raw = JSON.parse(localStorage.getItem(USER_COLORS_KEY) || '[]');
    return raw.filter(c => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c));
  } catch { return []; }
}
function saveUserColor(hex) {
  if (!hex || !/^#[0-9a-f]{6}$/i.test(hex)) return;
  const c = hex.toUpperCase();
  if (BASE_PALETTE.some(p => p.toUpperCase() === c)) return;
  const arr = loadUserColors();
  if (arr.some(p => p.toUpperCase() === c)) return;
  arr.push(hex);
  if (arr.length > 12) arr.shift();
  localStorage.setItem(USER_COLORS_KEY, JSON.stringify(arr));
}
function replaceUserColor(idx, hex) {
  if (!hex || !/^#[0-9a-f]{6}$/i.test(hex)) return;
  const arr = loadUserColors();
  if (idx < 0 || idx >= arr.length) return;
  arr[idx] = hex;
  localStorage.setItem(USER_COLORS_KEY, JSON.stringify(arr));
}

function getFragColorDefault(frag) {
  return isMarker(frag.name) ? '#F0E442' : (FEATURE_COLORS[frag.type] || '#56B4E9');
}

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

// Domain/region types — universal for all fragment types
const REGION_TYPES = {
  CDS: [
    { value: 'signal', label: 'Сигн. пептид' }, { value: 'propeptide', label: 'Пропептид' },
    { value: 'domain', label: 'Домен' }, { value: 'linker', label: 'Линкер' },
    { value: 'tag', label: 'Тег (His, FLAG)' }, { value: 'binding', label: 'Связывающий' },
    { value: 'transmembrane', label: 'Трансмембр.' }, { value: 'custom', label: 'Другое' },
  ],
  promoter: [
    { value: 'UAS', label: 'UAS/Энхансер' }, { value: 'TATA', label: 'TATA-box' },
    { value: 'RBS', label: 'RBS (Шайн-Дальгарно)' }, { value: 'core', label: 'Core промотор' },
    { value: 'operator', label: 'Оператор' }, { value: 'insulator', label: 'Инсулятор' },
    { value: 'TSS', label: 'Старт транскрипции' }, { value: 'custom', label: 'Другое' },
  ],
  terminator: [
    { value: 'polyA', label: 'PolyA-сигнал' }, { value: 'stem_loop', label: 'Стем-луп' },
    { value: 'T_rich', label: 'T-богатый участок' }, { value: 'custom', label: 'Другое' },
  ],
  _default: [
    { value: 'region', label: 'Область' }, { value: 'repeat', label: 'Повтор' },
    { value: 'binding', label: 'Сайт связывания' }, { value: 'custom', label: 'Другое' },
  ],
};
function getRegionTypes(fragType) {
  const base = REGION_TYPES[fragType] || REGION_TYPES._default;
  // Load user-defined types from localStorage
  try {
    const custom = JSON.parse(localStorage.getItem('pvcs-custom-region-types') || '[]');
    return [...base, ...custom];
  } catch { return base; }
}

function addCustomRegionType(value, label) {
  try {
    const custom = JSON.parse(localStorage.getItem('pvcs-custom-region-types') || '[]');
    if (!custom.some(t => t.value === value)) {
      custom.push({ value, label });
      localStorage.setItem('pvcs-custom-region-types', JSON.stringify(custom));
    }
  } catch {}
}

// Region colors — extend for regulatory elements
const REGION_COLORS = {
  ...DOMAIN_COLORS,
  UAS: '#6929c4', TATA: '#d55e00', RBS: '#0072b2', core: '#009e73',
  operator: '#e69f00', insulator: '#cc79a7', TSS: '#56b4e9',
  polyA: '#d55e00', stem_loop: '#009e73', T_rich: '#e69f00',
  region: '#56b4e9', repeat: '#999999',
};

const DOMAINS_LS_KEY = 'pvcs-parts-domains';
function loadSavedDomains(id) { try { return JSON.parse(localStorage.getItem(DOMAINS_LS_KEY) || '{}')[id]; } catch { return null; } }
function persistDomains(id, domains) { try { const a = JSON.parse(localStorage.getItem(DOMAINS_LS_KEY) || '{}'); a[id] = domains; localStorage.setItem(DOMAINS_LS_KEY, JSON.stringify(a)); } catch {} }

export default function FragmentEditor({ fragment, onSave, onClose, onColorChange, onSaveAsVariant }) {
  const isCDS = fragment.type === 'CDS';
  const [tab, setTab] = useState('dna'); // 'dna' | 'protein'
  const [seq, setSeq] = useState(fragment.sequence || '');
  const [domains, setDomains] = useState(fragment.domains?.length ? fragment.domains : loadSavedDomains(fragment.id) || loadSavedDomains(fragment.name) || []);
  const [customColor, setCustomColor] = useState(fragment.customColor || '');
  const [showPalette, setShowPalette] = useState(false);
  const [editMode, setEditMode] = useState('view'); // 'view' | 'edit' (codon inline editing)
  const [workflow, setWorkflow] = useState('edit'); // 'edit' = simple edit | 'mutagenesis' = with protocol
  const [mutTarget, setMutTarget] = useState(null); // { start, end, x, y } — AA range
  const [dnaMutTarget, setDnaMutTarget] = useState(null); // { pos, nt, x, y }
  const [customAA, setCustomAA] = useState('');
  const [mutations, setMutations] = useState([]);
  const [editingCodon, setEditingCodon] = useState(null);
  const [insertSeq, setInsertSeq] = useState('');

  // Open AA mutation menu
  const openMutMenu = (e, aaIdx, aa, codon) => {
    if (aa === '*') return;
    setDnaMutTarget(null);
    const rect = e.currentTarget.getBoundingClientRect();
    if (e.shiftKey && mutTarget) {
      const start = Math.min(mutTarget.start, aaIdx);
      const end = Math.max(mutTarget.end, aaIdx);
      setMutTarget({ ...mutTarget, start, end });
    } else {
      setMutTarget({ start: aaIdx, end: aaIdx, x: rect.left, y: rect.bottom + 4 });
    }
  };

  // Open DNA mutation menu (nucleotide-level)
  const openDnaMutMenu = (e, ntPos) => {
    setMutTarget(null);
    const rect = e.currentTarget.getBoundingClientRect();
    setDnaMutTarget({ pos: ntPos, nt: seq[ntPos]?.toUpperCase() || 'N', x: rect.left, y: rect.bottom + 4 });
    setInsertSeq('');
  };
  const [addForm, setAddForm] = useState(null);
  const [domPaletteIdx, setDomPaletteIdx] = useState(null); // which domain row has palette open
  const origLen = (fragment.sequence || '').length;
  const [userColors, setUserColors] = useState(() => loadUserColors());
  const refreshUserColors = () => setUserColors(loadUserColors());

  // Live sync color to canvas (skip initial mount)
  const colorInitRef = useRef(true);
  useEffect(() => {
    if (colorInitRef.current) { colorInitRef.current = false; return; }
    if (onColorChange) onColorChange(customColor || undefined);
  }, [customColor]);

  // Ref callback: attach native 'change' event (fires only when picker dialog closes,
  // unlike React onChange which fires on every drag)
  const bindNativeChange = (el, onFinalColor) => {
    if (!el || el.__bound) return;
    el.__bound = true;
    el.addEventListener('change', () => {
      onFinalColor(el.value);
      saveUserColor(el.value);
      refreshUserColors();
    });
  };

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

  const seqChanged = seq.toUpperCase() !== (fragment.sequence || '').toUpperCase();
  const modification = seqChanged ? detectModification(fragment.sequence || '', seq) : null;

  const handleSave = () => {
    persistDomains(fragment.id || fragment.name, domains);

    if (workflow === 'edit') {
      // Simple edit mode — save sequence directly, no variants/primers
      onSave({ ...fragment, sequence: seq, length: seq.length, domains,
        customColor: customColor || undefined, editedAt: new Date().toISOString(),
        // Don't pass mutations — this is a direct edit, not mutagenesis
      });
    } else {
      // Mutagenesis mode — rename with mutations, trigger variant + KLD
      const mutLabels = mutations.map(m => m.label).join(',');
      const name = mutations.length > 0 ? `${fragment.name}(${mutLabels})` : fragment.name;
      onSave({ ...fragment, name, sequence: seq, length: seq.length, domains,
        customColor: customColor || undefined,
        mutations: mutations.length > 0 ? [...(fragment.mutations || []), ...mutations] : fragment.mutations,
        editedAt: new Date().toISOString() });
    }
    onClose();
  };

  const handleSaveAsVariant = () => {
    if (!onSaveAsVariant) return;
    const variantName = prompt('Имя варианта:', suggestVariantName(fragment.name, modification));
    if (!variantName) return;
    persistDomains(fragment.id || fragment.name, domains);
    onSaveAsVariant({
      name: variantName,
      type: fragment.type,
      sequence: seq,
      length: seq.length,
      domains,
      customColor: customColor || undefined,
      parentId: fragment.parentId || fragment.id,
      modification,
      testResults: [],
    });
    onClose();
  };

  // ═══ Inline mutagenesis ═══
  const mutRangeLen = mutTarget ? mutTarget.end - mutTarget.start + 1 : 0;
  const mutRangeAAs = mutTarget ? protein.slice(mutTarget.start, mutTarget.end + 1) : '';

  const applyMut = (targetAA) => {
    if (!mutTarget) return;
    // For single AA
    if (mutRangeLen === 1) {
      const result = inlineSubstitution(seq, mutTarget.start, targetAA);
      if (!result) return;
      setSeq(result.sequence);
      setMutations(prev => [...prev, { type: 'substitution', ...result }]);
    }
    setMutTarget(null);
    setCustomAA('');
  };

  // Replace entire range with a custom AA string (e.g. "AGA" for 3 AAs)
  const applyMultiMut = (targetAAs) => {
    if (!mutTarget || !targetAAs) return;
    let s = seq;
    const newMuts = [];
    // Apply from end to start to preserve positions
    for (let i = Math.min(targetAAs.length, mutRangeLen) - 1; i >= 0; i--) {
      const aaIdx = mutTarget.start + i;
      if (aaIdx >= totalAA) continue;
      const origAA = protein[aaIdx];
      if (targetAAs[i] === origAA) continue; // no change
      const result = inlineSubstitution(s, aaIdx, targetAAs[i]);
      if (result) { s = result.sequence; newMuts.push({ type: 'substitution', ...result }); }
    }
    if (newMuts.length) {
      setSeq(s);
      setMutations(prev => [...prev, ...newMuts.reverse()]);
    }
    setMutTarget(null);
    setCustomAA('');
  };

  const applyDel = () => {
    if (!mutTarget) return;
    const count = mutRangeLen;
    const result = inlineDeletion(seq, mutTarget.start, count);
    setSeq(result.sequence);
    setMutations(prev => [...prev, { type: 'deletion', ...result }]);
    setMutTarget(null);
  };

  // Inline codon editing
  const commitCodonEdit = (aaIdx, newCodon) => {
    const clean = newCodon.toUpperCase().replace(/[^ATGC]/g, '');
    if (clean.length !== 3) return;
    const start = aaIdx * 3;
    const oldCodon = seq.slice(start, start + 3).toUpperCase();
    if (clean === oldCodon) { setEditingCodon(null); return; }
    const newSeq = seq.slice(0, start) + clean + seq.slice(start + 3);
    const oldAA = CODON_TABLE[oldCodon] || '?';
    const newAA = CODON_TABLE[clean] || '?';
    setSeq(newSeq);
    if (oldAA !== newAA) {
      setMutations(prev => [...prev, { type: 'substitution', label: `${oldAA}${aaIdx + 1}${newAA}`, codonChange: `${oldCodon}→${clean}`, changes: 0 }]);
    }
    setEditingCodon(null);
  };

  // ═══ DNA-level mutagenesis ═══
  /** Substitute single nucleotide at position. */
  const applyDnaSub = (pos, newNt) => {
    if (pos < 0 || pos >= seq.length) return;
    const oldNt = seq[pos].toUpperCase();
    if (newNt === oldNt) return;
    const newSeq = seq.slice(0, pos) + newNt + seq.slice(pos + 1);
    setSeq(newSeq);
    // Track mutation
    const label = isCDS
      ? (() => { const ai = Math.floor(pos / 3); const oldC = seq.slice(ai*3, ai*3+3).toUpperCase(); const newC = newSeq.slice(ai*3, ai*3+3).toUpperCase();
          const oldAA = CODON_TABLE[oldC]||'?'; const newAA = CODON_TABLE[newC]||'?';
          return oldAA !== newAA ? `${oldAA}${ai+1}${newAA} (${oldNt}${pos+1}${newNt})` : `${oldNt}${pos+1}${newNt} (silent)`; })()
      : `${oldNt}${pos+1}${newNt}`;
    setMutations(prev => [...prev, { type: 'nt_substitution', label, codonStart: pos, position: pos }]);
    setDnaMutTarget(null);
  };

  /** Delete nucleotide(s) at position. */
  const applyDnaDel = (pos, count = 1) => {
    if (pos < 0 || pos >= seq.length) return;
    const deleted = seq.slice(pos, pos + count).toUpperCase();
    const newSeq = seq.slice(0, pos) + seq.slice(pos + count);
    setSeq(newSeq);
    setMutations(prev => [...prev, { type: 'nt_deletion', label: `Δ${pos+1}${count > 1 ? `-${pos+count}` : ''} (${deleted})`, codonStart: pos, position: pos, deletedBp: count }]);
    setDnaMutTarget(null);
  };

  /** Insert sequence at position. */
  const applyDnaInsert = (pos, insertedSeq) => {
    const clean = insertedSeq.toUpperCase().replace(/[^ATGCNRYWSMKHBVD]/g, '');
    if (!clean) return;
    const newSeq = seq.slice(0, pos) + clean + seq.slice(pos);
    setSeq(newSeq);
    setMutations(prev => [...prev, { type: 'nt_insertion', label: `ins${pos+1}+${clean.length}п.н.`, codonStart: pos, position: pos }]);
    setDnaMutTarget(null);
    setInsertSeq('');
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
      <div className="bg-white rounded-xl shadow-2xl w-[680px] max-h-[85vh] overflow-y-auto p-5" onClick={e => { e.stopPropagation(); setDomPaletteIdx(null); }}>

        <div className="flex justify-between items-start mb-3">
          <div className="flex items-center gap-2">
            <button onClick={() => setShowPalette(v => !v)}
              className="w-6 h-6 rounded-lg border-2 border-gray-200 cursor-pointer shadow-sm shrink-0"
              style={{ backgroundColor: customColor || getFragColorDefault(fragment) }}
              title="Выбрать цвет" />
            <div>
              <h3 className="font-bold text-base">
                {fragment.name}
                {mutations.length > 0 && (
                  <span className="ml-1.5 text-[10px] font-medium bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full">
                    {mutations.map(m => m.label).join(', ')}
                  </span>
                )}
              </h3>
              <div className="text-xs text-gray-500">{seq.length} п.н.{isCDS ? ` · ${totalAA} а.о.` : ''}</div>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg">{'✕'}</button>
        </div>
        {/* Dropdown color palette */}
        {showPalette && (
          <div className="mb-3 p-2 bg-gray-50 rounded-lg border border-gray-100">
            <div className="text-[9px] text-gray-400 mb-1">Стандартные</div>
            <div className="flex gap-1 flex-wrap items-center">
              {BASE_PALETTE.map(c => (
                <button key={c} type="button" onClick={() => setCustomColor(c)}
                  className="w-5 h-5 rounded-full cursor-pointer"
                  style={{ backgroundColor: c, outline: customColor.toUpperCase() === c.toUpperCase() ? '2px solid #1f2937' : '1px solid #d1d5db', outlineOffset: '1px' }} title={c} />
              ))}
            </div>
            <div className="flex items-center gap-2 mt-2 mb-1">
              <span className="text-[9px] text-gray-400">Мои цвета <span className="text-gray-300">(клик — изменить)</span></span>
              {customColor && (
                <button type="button" onClick={() => setCustomColor('')}
                  className="text-[9px] px-1.5 py-0.5 rounded border border-gray-200 text-gray-400 hover:text-gray-600 ml-auto">Сброс</button>
              )}
            </div>
            <div className="flex gap-1 flex-wrap items-center">
              {userColors.map((c, ci) => (
                <label key={ci} className="relative w-5 h-5 rounded-full cursor-pointer"
                  style={{ backgroundColor: c, outline: customColor.toUpperCase() === c.toUpperCase() ? '2px solid #1f2937' : '1px solid #d1d5db', outlineOffset: '1px' }}
                  title={`${c} (клик — выбрать, пикер — изменить)`}
                  onClick={() => setCustomColor(c)}>
                  <input type="color" value={c}
                    onChange={e => {
                      setCustomColor(e.target.value);
                      replaceUserColor(ci, e.target.value);
                      refreshUserColors();
                    }}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                </label>
              ))}
              <label className="relative w-5 h-5 rounded-full cursor-pointer flex items-center justify-center border border-dashed border-gray-300 hover:border-gray-400 text-gray-400 text-xs"
                title="Добавить цвет">
                <span>+</span>
                <input type="color" value={customColor || getFragColorDefault(fragment)}
                  ref={el => bindNativeChange(el, hex => setCustomColor(hex))}
                  onChange={e => setCustomColor(e.target.value)}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
              </label>
            </div>
          </div>
        )}

        {/* Workflow mode toggle */}
        <div className="flex items-center gap-1 mb-2 p-1.5 bg-gray-50 rounded-lg">
          <button onClick={() => setWorkflow('edit')}
            className={`flex-1 px-2 py-1 text-[10px] rounded-md flex items-center justify-center gap-1 transition ${
              workflow === 'edit' ? 'bg-white shadow-sm border font-medium text-gray-800' : 'text-gray-400 hover:bg-gray-100'}`}>
            {'✏️'} Редактирование
          </button>
          <button onClick={() => setWorkflow('mutagenesis')}
            className={`flex-1 px-2 py-1 text-[10px] rounded-md flex items-center justify-center gap-1 transition ${
              workflow === 'mutagenesis' ? 'bg-purple-50 shadow-sm border border-purple-200 font-medium text-purple-700' : 'text-gray-400 hover:bg-gray-100'}`}>
            {'🧬'} Мутагенез
          </button>
        </div>
        {workflow === 'edit' && seqChanged && (
          <div className="text-[9px] text-amber-600 bg-amber-50 rounded px-2 py-1 mb-2">
            {'⚠'} Последовательность изменена. При сохранении праймеры будут сброшены.
          </div>
        )}
        {workflow === 'mutagenesis' && mutations.length === 0 && (
          <div className="text-[9px] text-purple-500 bg-purple-50 rounded px-2 py-1 mb-2">
            {'🧬'} Кликните по кодону (ДНК) или аминокислоте (АК) для мутагенеза. Будут подобраны праймеры и протокол.
          </div>
        )}

        {/* Content tabs */}
        <div className="flex gap-0 rounded-lg overflow-hidden border mb-3">
          <button onClick={() => setTab('dna')}
            className={`flex-1 px-3 py-1.5 text-xs font-medium transition ${tab === 'dna' ? 'bg-blue-600 text-white' : 'hover:bg-gray-50'}`}>
            {'🔤'} ДНК
          </button>
          <button onClick={() => setTab('regions')}
            className={`flex-1 px-3 py-1.5 text-xs font-medium transition ${tab === 'regions' ? 'bg-blue-600 text-white' : 'hover:bg-gray-50'}`}>
            {isCDS ? '🧬 Белок' : '📐 Разметка'}
          </button>
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

            {/* Codon view — unified: click AA → mutate, edit mode → inline codon editing */}
            {isCDS && (
              <div className="bg-gray-50 rounded-lg p-3 max-h-[220px] overflow-y-auto mb-3 font-mono relative">
                {codonLines.map(line => (
                  <div key={line.pos} className="mb-2 flex items-start">
                    <span className="text-gray-400 w-10 text-right mr-2 shrink-0 text-[9px] pt-0.5">{line.pos}</span>
                    <div className="flex flex-wrap">
                      {line.codons.map((c, ci) => {
                        const ai = c.aaIdx - 1; // 0-based
                        const isMutated = mutations.some(m => m.label && String(c.aaIdx) === m.label.match(/\d+/)?.[0]);
                        const inRange = mutTarget && ai >= mutTarget.start && ai <= mutTarget.end;
                        const isEditing = editMode === 'edit' && editingCodon?.aaIdx === ai;
                        const ntStart = ai * 3; // nucleotide position of this codon
                        const dnaMutHere = dnaMutTarget && dnaMutTarget.pos >= ntStart && dnaMutTarget.pos < ntStart + 3;
                        return (
                        <span key={ci} className={`inline-block text-center rounded transition
                          ${editMode === 'view' ? 'cursor-pointer' : 'cursor-text'}
                          ${inRange ? 'bg-purple-200' : dnaMutHere ? 'bg-teal-200' : isMutated ? 'bg-amber-100' : editMode === 'view' ? 'hover:bg-purple-50' : 'hover:bg-blue-50'}`}
                          style={{ width: '3.6ch' }}
                          onClick={e => {
                            if (editMode === 'edit') {
                              setEditingCodon({ aaIdx: ai, value: c.codon });
                            }
                          }}>
                          {isEditing ? (
                            <input value={editingCodon.value}
                              onChange={e => setEditingCodon({ aaIdx: ai, value: e.target.value.toUpperCase().replace(/[^ATGC]/g, '').slice(0, 3) })}
                              onBlur={() => commitCodonEdit(ai, editingCodon.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') commitCodonEdit(ai, editingCodon.value);
                                if (e.key === 'Escape') setEditingCodon(null);
                                if (e.key === 'Tab') { e.preventDefault(); commitCodonEdit(ai, editingCodon.value); setEditingCodon({ aaIdx: ai + 1, value: seq.slice((ai + 1) * 3, (ai + 1) * 3 + 3).toUpperCase() }); }
                              }}
                              className="w-full text-[11px] text-center border-b-2 border-blue-400 bg-white outline-none font-mono px-0"
                              style={{ width: '3.6ch' }}
                              autoFocus maxLength={3} />
                          ) : (
                            <span className={`block text-[11px] text-[#1a1a1a] ${editMode === 'view' ? 'hover:text-teal-700 hover:underline cursor-pointer' : ''}`}
                              style={{ borderBottom: c.dom ? `2px solid ${c.dom.color}` : editMode === 'edit' ? '1px dashed #cbd5e1' : 'none' }}
                              onClick={editMode === 'view' ? (e) => { e.stopPropagation(); openDnaMutMenu(e, ntStart); } : undefined}>
                              {c.codon}
                            </span>
                          )}
                          <span className={`block text-[9px] ${editMode === 'view' ? 'hover:font-bold cursor-pointer' : ''}`}
                            style={{ color: c.aa === '*' ? '#dc2626' : c.aa === 'M' && c.aaIdx === 1 ? '#16a34a' : c.dom ? c.dom.color : '#aaa' }}
                            onClick={editMode === 'view' ? (e) => { e.stopPropagation(); openMutMenu(e, ai, c.aa, c.codon); } : undefined}>
                            {c.aa}
                          </span>
                        </span>
                      );})}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {isCDS && !mutTarget && !dnaMutTarget && (
              <div className="text-[9px] text-gray-400 -mt-2 mb-2 text-center">
                {editMode === 'view' ? 'Кодон → мутация ДНК · Аминокислота → замена АК · Shift → диапазон' : 'Клик → редактирование кодона · Tab → след.'}
              </div>
            )}

            {/* Non-CDS edit mode: textarea */}
            {!isCDS && editMode === 'edit' && (
              <div className="mb-3">
                <textarea value={seq} onChange={e => setSeq(e.target.value.toUpperCase().replace(/[^ATGCNRYWSMKHBVD]/g, ''))}
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
                          const isDnaMut = dnaMutTarget?.pos === pos;
                          const isMut = mutations.some(m => m.position === pos);
                          const gap = ci > 0 && ci % 10 === 0;
                          return (
                            <span key={ci}
                              className={`cursor-pointer transition ${gap ? 'ml-1' : ''}
                                ${isDnaMut ? 'bg-teal-300 text-white rounded' : isMut ? 'bg-amber-200 rounded' : 'hover:bg-teal-100 rounded'}`}
                              onClick={e => openDnaMutMenu(e, pos)}>
                              {nt}
                            </span>
                          );
                        })}
                      </span>
                    </div>
                  );
                })}
                {!dnaMutTarget && <div className="text-[9px] text-gray-400 text-center mt-1">Клик по нуклеотиду → мутагенез ДНК</div>}
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
              <div className="flex gap-2 items-center shrink-0">
                <button onClick={() => navigator.clipboard.writeText(seq)}
                  className="text-[10px] text-gray-400 hover:text-gray-600" title="Копировать">{'📋'}</button>
                <button onClick={() => { setEditMode(m => m === 'view' ? 'edit' : 'view'); setEditingCodon(null); }}
                  className={`text-[10px] px-2 py-0.5 rounded transition ${editMode === 'edit' ? 'bg-blue-100 text-blue-700' : 'text-blue-600 hover:bg-blue-50'}`}>
                  {editMode === 'view'
                    ? (isCDS ? '✏️ Редакт. кодоны' : '✏️ Редактировать')
                    : (isCDS ? '🧬 Мутагенез' : '👁 Просмотр')}
                </button>
              </div>
            </div>
          </>
        )}

        {/* ═══ TAB: Белок / Разметка ═══ */}
        {tab === 'regions' && (() => {
            const unit = isCDS ? 'а.о.' : 'п.н.';
            const maxPos = isCDS ? totalAA : seq.length;
            const regionTypes = getRegionTypes(fragment.type);
            const getColor = (type) => REGION_COLORS[type] || DOMAIN_COLORS[type] || '#56B4E9';
            return (
            <>
            {/* Region bar */}
            {domains.length > 0 && (
              <div className="mb-3">
                <div className="flex h-6 rounded overflow-hidden border">
                  {domains.map((d, di) => {
                    const w = Math.max(2, ((d.endAA - d.startAA + 1) / maxPos) * 100);
                    return (
                      <div key={di} style={{ width: `${w}%`, backgroundColor: d.color || getColor(d.type) }}
                        className="flex items-center justify-center text-[7px] text-white font-medium truncate px-0.5 border-r border-white/30"
                        title={`${d.name}: ${d.startAA}–${d.endAA} ${unit}`}>
                        {w > 6 ? d.name : ''}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Protein sequence with numbered lines — clickable AAs for mutagenesis (CDS) */}
            <div className="font-mono text-[10px] leading-relaxed bg-gray-50 p-3 rounded max-h-[200px] overflow-y-auto mb-3 relative">
              {isCDS ? (() => {
                const PER_LINE = 50;
                const lines = [];
                for (let li = 0; li < protein.length; li += PER_LINE) {
                  lines.push({ start: li, aas: protein.slice(li, li + PER_LINE) });
                }
                return lines.map(line => (
                  <div key={line.start} className="flex items-start mb-1">
                    <span className="text-gray-400 w-10 text-right mr-2 shrink-0 text-[9px] pt-0.5 select-none">{line.start + 1}</span>
                    <div className="flex flex-wrap">
                      {line.aas.split('').map((aa, ci) => {
                        const i = line.start + ci;
                        const pos = i + 1;
                        const dom = domains.find(d => pos >= d.startAA && pos <= d.endAA);
                        const isMutated = mutations.some(m => m.label?.includes(String(pos)));
                        // Add a thin gap every 10 AAs for readability
                        const gap10 = ci > 0 && ci % 10 === 0;
                        return (
                          <span key={i}
                            className={`cursor-pointer rounded-sm transition inline-block text-center ${gap10 ? 'ml-1' : ''}
                              ${mutTarget?.aaIdx === i ? 'bg-purple-300' : isMutated ? 'bg-amber-200' : 'hover:bg-purple-100'}`}
                            style={{ backgroundColor: mutTarget?.aaIdx === i ? undefined : isMutated ? undefined : dom ? (dom.color || getColor(dom.type)) + '25' : 'transparent',
                              borderBottom: dom ? `2px solid ${dom.color || getColor(dom.type)}` : 'none',
                              color: aa === '*' ? '#dc2626' : '#333' }}
                            title={`${aa}${pos} — клик для мутации`}
                            onClick={e => openMutMenu(e, i, aa, seq.slice(i * 3, i * 3 + 3).toUpperCase())}>{aa}</span>
                        );
                      })}
                    </div>
                  </div>
                ));
              })() : seq.split('').map((nt, i) => {
                const pos = i + 1;
                const dom = domains.find(d => pos >= d.startAA && pos <= d.endAA);
                return (
                  <span key={i} style={{ backgroundColor: dom ? (dom.color || getColor(dom.type)) + '20' : 'transparent',
                    borderBottom: dom ? `2px solid ${dom.color || getColor(dom.type)}` : 'none' }}
                    title={`${pos} п.н.${dom ? ` (${dom.name})` : ''}`}>{nt}</span>
                );
              })}

            </div>
            {isCDS && !mutTarget && <div className="text-[9px] text-gray-400 -mt-2 mb-2 text-center">Клик по аминокислоте → мутагенез</div>}

            {/* Region management */}
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-gray-600">{isCDS ? 'Домены' : 'Области'} ({domains.length})</span>
              <div className="flex gap-2">
                {isCDS && <button onClick={() => setDomains(autoDetectDomains(seq, fragment.name))}
                  className="text-[10px] px-2 py-1 bg-blue-50 text-blue-700 rounded hover:bg-blue-100">{'🔍'} Авто</button>}
                <button onClick={() => setAddForm({ name: '', type: regionTypes[0]?.value || 'custom', startAA: 1, endAA: maxPos })}
                  className="text-[10px] px-2 py-1 bg-green-50 text-green-700 rounded hover:bg-green-100">+ Добавить</button>
              </div>
            </div>

            {domains.length > 0 && (
              <table className="w-full text-[11px] mb-3">
                <thead><tr className="text-gray-400 text-[9px] uppercase">
                  <th className="text-left p-1">#</th><th className="text-left p-1">Имя</th>
                  <th className="text-left p-1">Тип</th><th className="text-right p-1">Позиция ({unit})</th>
                  <th className="text-right p-1">Дл.</th><th className="p-1 w-5"></th>
                </tr></thead>
                <tbody>{domains.map((d, di) => (
                  <tr key={di} className="border-t hover:bg-gray-50">
                    <td className="p-1 relative">
                      <span className="w-4 h-4 rounded-full inline-block border border-gray-200 cursor-pointer"
                        style={{ backgroundColor: d.color || getColor(d.type) }}
                        onClick={() => setDomPaletteIdx(domPaletteIdx === di ? null : di)} />
                      {domPaletteIdx === di && (
                        <div className="absolute left-0 top-7 z-20 bg-white border border-gray-200 rounded-lg shadow-lg p-2 w-56"
                          onClick={e => e.stopPropagation()}>
                          <div className="flex gap-1 flex-wrap">
                            {BASE_PALETTE.map(c => (
                              <button key={c} type="button" onClick={() => { setDomains(prev => prev.map((x, j) => j === di ? { ...x, color: c } : x)); setDomPaletteIdx(null); }}
                                className="w-4 h-4 rounded-full cursor-pointer"
                                style={{ backgroundColor: c, outline: (d.color || getColor(d.type)).toUpperCase() === c.toUpperCase() ? '2px solid #1f2937' : '1px solid #d1d5db', outlineOffset: '1px' }} />
                            ))}
                          </div>
                          {userColors.length > 0 && (
                            <div className="flex gap-1 flex-wrap mt-1.5 pt-1.5 border-t border-gray-100">
                              {userColors.map((c, ci) => (
                                <label key={ci} className="relative w-4 h-4 rounded-full cursor-pointer"
                                  style={{ backgroundColor: c, outline: (d.color || getColor(d.type)).toUpperCase() === c.toUpperCase() ? '2px solid #1f2937' : '1px solid #d1d5db', outlineOffset: '1px' }}>
                                  <input type="color" value={c}
                                    onChange={e => {
                                      setDomains(prev => prev.map((x, j) => j === di ? { ...x, color: e.target.value } : x));
                                      replaceUserColor(ci, e.target.value);
                                      refreshUserColors();
                                    }}
                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                                </label>
                              ))}
                            </div>
                          )}
                          <div className="flex items-center gap-2 mt-1.5 pt-1.5 border-t border-gray-100">
                            <label className="flex items-center gap-1 cursor-pointer text-[9px] text-blue-600 hover:text-blue-800">
                              <input type="color" value={d.color || getColor(d.type)}
                                ref={el => bindNativeChange(el, hex => setDomains(prev => prev.map((x, j) => j === di ? { ...x, color: hex } : x)))}
                                onChange={e => setDomains(prev => prev.map((x, j) => j === di ? { ...x, color: e.target.value } : x))}
                                className="w-3 h-3 cursor-pointer border-0 p-0 rounded" />
                              Свой цвет
                            </label>
                          </div>
                        </div>
                      )}
                    </td>
                    <td className="p-1"><input value={d.name} onChange={e => setDomains(prev => prev.map((x, j) => j === di ? { ...x, name: e.target.value } : x))}
                      className="text-[11px] border rounded px-1 py-0.5 w-24" /></td>
                    <td className="p-1"><select value={d.type} onChange={e => setDomains(prev => prev.map((x, j) => j === di ? { ...x, type: e.target.value, color: getColor(e.target.value) } : x))}
                      className="text-[10px] border rounded px-1 py-0.5">{regionTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select></td>
                    <td className="p-1 text-right text-[10px]">
                      <input type="number" value={d.startAA} min={1} max={maxPos} onChange={e => setDomains(prev => prev.map((x, j) => j === di ? { ...x, startAA: +e.target.value } : x))}
                        className="w-11 text-[10px] border rounded px-1 py-0.5 text-right" />–
                      <input type="number" value={d.endAA} min={1} max={maxPos} onChange={e => setDomains(prev => prev.map((x, j) => j === di ? { ...x, endAA: +e.target.value } : x))}
                        className="w-11 text-[10px] border rounded px-1 py-0.5 text-right" />
                    </td>
                    <td className="p-1 text-right text-gray-400">{d.endAA - d.startAA + 1}</td>
                    <td className="p-1"><button onClick={() => setDomains(prev => prev.filter((_, j) => j !== di))} className="text-gray-300 hover:text-red-500">{'✕'}</button></td>
                  </tr>
                ))}</tbody>
              </table>
            )}

            {domains.length === 0 && <div className="text-center text-gray-400 text-xs py-3 mb-3">{isCDS ? 'Нажмите «Авто» или добавьте вручную' : 'Добавьте области вручную'}</div>}

            {addForm && (
              <div className="border rounded p-2 bg-gray-50 mb-3 space-y-2">
                <div className="grid grid-cols-4 gap-2">
                  <input placeholder="Имя" value={addForm.name} onChange={e => setAddForm({ ...addForm, name: e.target.value })} className="text-xs border rounded p-1.5 col-span-2" />
                  <select value={addForm.type} onChange={e => {
                    if (e.target.value === '__new__') {
                      const name = prompt('Название нового типа:');
                      if (name) { const val = name.toLowerCase().replace(/\s+/g, '_'); addCustomRegionType(val, name); setAddForm({ ...addForm, type: val }); }
                    } else setAddForm({ ...addForm, type: e.target.value });
                  }} className="text-xs border rounded p-1.5">
                    {regionTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    <option value="__new__">+ Новый тип...</option>
                  </select>
                  <div className="flex gap-1">
                    <input type="number" value={addForm.startAA} min={1} max={maxPos} onChange={e => setAddForm({ ...addForm, startAA: +e.target.value })} className="text-xs border rounded p-1.5 w-14" />
                    <input type="number" value={addForm.endAA} min={1} max={maxPos} onChange={e => setAddForm({ ...addForm, endAA: +e.target.value })} className="text-xs border rounded p-1.5 w-14" />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={addDomain} className="text-xs px-3 py-1 bg-green-600 text-white rounded">Добавить</button>
                  <button onClick={() => setAddForm(null)} className="text-xs px-3 py-1 bg-gray-200 rounded">Отмена</button>
                </div>
              </div>
            )}
          </>
          );
        })()}

        {/* Save */}
        <div className="flex gap-2 items-center">
          {workflow === 'edit' ? (
            <button onClick={handleSave} className="text-xs bg-blue-600 text-white px-4 py-1.5 rounded-lg hover:bg-blue-700 font-semibold">
              {'💾'} Сохранить
            </button>
          ) : (
            <button onClick={handleSave}
              disabled={mutations.length === 0 && !seqChanged}
              className="text-xs bg-purple-600 text-white px-4 py-1.5 rounded-lg hover:bg-purple-700 font-semibold disabled:opacity-40">
              {'🧬'} Применить мутагенез {mutations.length > 0 && `(${mutations.length})`}
            </button>
          )}
          {workflow === 'mutagenesis' && seqChanged && onSaveAsVariant && (
            <button onClick={handleSaveAsVariant}
              className="text-xs bg-purple-50 text-purple-700 px-3 py-1.5 rounded-lg hover:bg-purple-100 border border-purple-200 font-medium">
              {'🔀'} Как вариант
            </button>
          )}
          {modification && (
            <span className="text-[9px] text-gray-400 ml-1">{modification.description}</span>
          )}
          <button onClick={onClose} className="text-xs text-gray-500 px-4 py-1.5 ml-auto">Отмена</button>
        </div>
      </div>

      {/* Mutation popup — portal, positioned near click */}
      {isCDS && mutTarget && createPortal(
        <div className="fixed inset-0 z-[60]" onClick={() => setMutTarget(null)}>
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
              <button onClick={() => setMutTarget(null)} className="text-gray-300 hover:text-gray-500 text-xs">{'✕'}</button>
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
                  <button key={sub.to} onClick={() => applyMut(sub.to)}
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
                onChange={e => setCustomAA(e.target.value.toUpperCase().replace(/[^ACDEFGHIKLMNPQRSTVWY]/g, ''))}
                maxLength={mutRangeLen} placeholder={mutRangeLen === 1 ? 'X' : 'AA...'}
                className={`border rounded text-center font-mono text-sm ${mutRangeLen === 1 ? 'w-8' : 'w-20'}`} autoFocus />
              <button onClick={() => {
                  if (!customAA) return;
                  if (mutRangeLen === 1) applyMut(customAA[0]);
                  else applyMultiMut(customAA);
                }}
                disabled={!customAA}
                className="text-[10px] px-2 border rounded hover:bg-purple-50 disabled:opacity-30">
                {mutRangeLen > 1 ? `Заменить ${mutRangeLen} а.о.` : 'Заменить'}
              </button>
            </div>

            {/* Multi-AA: Ala scan all */}
            {mutRangeLen > 1 && (
              <div className="flex gap-1 mb-2">
                <button onClick={() => applyMultiMut('A'.repeat(mutRangeLen))}
                  className="text-[10px] px-2 py-0.5 border rounded hover:bg-purple-50 flex-1 text-left">
                  {'→'} {'A'.repeat(mutRangeLen)} <span className="text-[8px] text-gray-400">Ala scan ({mutRangeLen})</span>
                </button>
              </div>
            )}

            {/* Delete */}
            <div className="border-t pt-2 space-y-1">
              <button onClick={applyDel}
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
      )}

      {/* DNA mutation popup — nucleotide-level */}
      {dnaMutTarget && createPortal(
        <div className="fixed inset-0 z-[60]" onClick={() => setDnaMutTarget(null)}>
          <div className="absolute bg-white rounded-xl shadow-2xl border p-3 w-64"
            style={{
              left: Math.min(dnaMutTarget.x, window.innerWidth - 270),
              top: Math.min(dnaMutTarget.y, window.innerHeight - 350),
            }}
            onClick={e => e.stopPropagation()}>

            <div className="flex justify-between items-center mb-2">
              <div className="text-[11px] font-semibold">
                ДНК мутация: <span className="text-teal-700 font-mono">{dnaMutTarget.nt}</span>
                <span className="text-gray-400 ml-1">позиция {dnaMutTarget.pos + 1}</span>
              </div>
              <button onClick={() => setDnaMutTarget(null)} className="text-gray-300 hover:text-gray-500 text-xs">{'✕'}</button>
            </div>

            {/* Substitution */}
            <div className="text-[10px] text-gray-500 mb-1">Замена нуклеотида:</div>
            <div className="flex gap-1 mb-2">
              {['A', 'T', 'G', 'C'].map(nt => (
                <button key={nt} onClick={() => applyDnaSub(dnaMutTarget.pos, nt)}
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
                <input value={insertSeq} onChange={e => setInsertSeq(e.target.value.toUpperCase().replace(/[^ATGCNRYWSMKHBVD]/g, ''))}
                  placeholder="ATGC..." className="flex-1 border rounded px-2 py-1 text-xs font-mono" />
                <button onClick={() => applyDnaInsert(dnaMutTarget.pos + 1, insertSeq)}
                  disabled={!insertSeq}
                  className="text-[10px] px-2 border rounded hover:bg-teal-50 disabled:opacity-30">Вставить</button>
              </div>
            </div>

            {/* Deletion */}
            <div className="border-t pt-2 space-y-1">
              <button onClick={() => applyDnaDel(dnaMutTarget.pos, 1)}
                className="text-[10px] text-red-600 hover:bg-red-50 px-2 py-0.5 rounded w-full text-left">
                {'🗑'} Удалить {dnaMutTarget.nt} (1 п.н.)
              </button>
              {isCDS && (
                <button onClick={() => applyDnaDel(Math.floor(dnaMutTarget.pos / 3) * 3, 3)}
                  className="text-[10px] text-red-600 hover:bg-red-50 px-2 py-0.5 rounded w-full text-left">
                  {'🗑'} Удалить кодон ({seq.slice(Math.floor(dnaMutTarget.pos / 3) * 3, Math.floor(dnaMutTarget.pos / 3) * 3 + 3).toUpperCase()}) — 3 п.н.
                </button>
              )}
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
      )}
    </div>
  );
}
