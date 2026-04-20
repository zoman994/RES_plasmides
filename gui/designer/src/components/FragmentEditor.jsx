/**
 * FragmentEditor — unified editor:
 *   🔤 ДНК (DNA editing + codon/AA display + quick actions)
 *   🧬 Белок (protein editing + domain annotation) — CDS only
 */
import { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { translateDNA, CODON_TABLE } from '../codons';
import { sanitizeSequence } from '../sequence-utils';
import { autoDetectDomains, DOMAIN_COLORS } from '../domain-detection';
import { FEATURE_COLORS, getFragColor, isMarker } from '../theme';
import { ANNOTATION_COLORS, autoAnnotate } from '../auto-annotate';
import { migratePartAnnotations } from '../migrate-annotations';
import { getRegions, getAllDetails, getPoints } from '../annotation-model';
import AnnotationEditor from './AnnotationEditor';
import { detectModification, suggestVariantName } from '../part-variants';
import { getCommonSubstitutions, inlineSubstitution, inlineDeletion, designInlineKLDPrimers } from '../mutagenesis';
import { sequenceDiff } from '../sequence-diff';
import { useStore } from '../store';

/**
 * K8 (Sprint 1.6) — compute per-nucleotide mutation highlights.
 *
 * Primary: diff against the parent-part sequence (fragment.parentId → parts).
 *   - aaChange.silent === true  → 'silent'     (yellow)
 *   - otherwise                 → 'nonsilent'  (red)
 * Fallback (no parent): use fragment.mutations list, mark conservatively as
 *   'nonsilent'. Insertions/deletions span `insertSequence.length` / `deletedBp`.
 *
 * K9/V16 — honors `fragment.templateStart`: for split sub-fragments whose
 * sequence is a window of the parent gene, we slice parent at templateStart
 * before diffing. Without this the diff treats parent[0] as aligned to
 * fragment[0] and reports the entire sub-fragment as mutated.
 *
 * @param {Object} fragment — { sequence, annotations?, parentId?, mutations?, templateStart? }
 * @param {Object|null} parent — parts library entry or null
 * @returns {Map<number, 'silent'|'nonsilent'>}
 */
export function computeMutationHighlights(fragment, parent) {
  const map = new Map();
  if (!fragment?.sequence) return map;

  if (parent?.sequence) {
    const offset = fragment.templateStart || 0;
    const parentSlice = parent.sequence.slice(offset, offset + fragment.sequence.length);
    const cdsRegions = (fragment.annotations || [])
      .filter(a => a.level === 'region' && (a.type === 'CDS' || a.type === 'gene'))
      .map(a => ({ start: a.start, end: a.end }));
    const diff = sequenceDiff(parentSlice, fragment.sequence, cdsRegions);
    for (const sub of diff.substitutions) {
      const kind = sub.aaChange?.silent === true ? 'silent' : 'nonsilent';
      map.set(sub.pos, kind);
    }
    return map;
  }

  for (const m of fragment.mutations || []) {
    const pos = m.codonStart ?? m.position ?? 0;
    const len = m.type === 'insertion' ? (m.insertSequence?.length || 0)
              : m.type === 'deletion'  ? (m.deletedBp || 1)
              : m.type === 'nt_substitution' ? 1
              : 3;
    for (let i = pos; i < pos + len; i++) map.set(i, 'nonsilent');
  }
  return map;
}

/**
 * K9/V15 — check whether mutation `m` hits the AA at 1-based position `aaPos`.
 * Always numeric — never label-based.
 *
 * Replaces the previous `m.label?.includes(String(pos))` substring match,
 * which false-positived any AA whose digits appeared inside another label
 * (pos=26 matched "G26A", "R135A", "C403G", …).
 */
export function mutationHitsAA(m, aaPos) {
  if (!m) return false;
  const nt = m.codonStart ?? m.position;
  if (nt == null) return false;
  const aaStart = (aaPos - 1) * 3;
  const aaEnd = aaPos * 3;
  const span = m.type === 'insertion' || m.type === 'nt_insertion'
    ? (m.insertSequence?.length || 3)
    : m.type === 'deletion' || m.type === 'nt_deletion'
    ? (m.deletedBp || 3)
    : 3;
  return nt < aaEnd && nt + span > aaStart;
}

/**
 * K11 (Sprint 1.7) — per-nucleotide highlight map for the virtual full-view
 * of a split group. Positions come directly from the mutation list (not diff),
 * so all are conservatively marked 'nonsilent'.
 */
export function computeFullViewHighlights(fragment) {
  const map = new Map();
  const muts = fragment?.splitGroupFullParentMutations || [];
  for (const m of muts) {
    const pos = m.codonStart ?? m.position ?? m.dnaPosition ?? 0;
    const len = m.type === 'insertion' || m.type === 'nt_insertion'
      ? (m.insertSequence?.length || 3)
      : m.type === 'deletion' || m.type === 'nt_deletion'
      ? (m.deletedBp || 3)
      : 3;
    for (let i = pos; i < pos + len; i++) map.set(i, 'nonsilent');
  }
  return map;
}

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

export default function FragmentEditor({ fragment, onSave, onClose, onColorChange, onSaveAsVariant, assemblyCircular = false }) {
  // CDS-like if fragment type is CDS or any annotation region is CDS
  const hasCDSRegion = (fragment.annotations || []).some(a => a.level === 'region' && (a.type === 'CDS' || a.type === 'gene' || a.type === 'marker'));
  const isCDS = fragment.type === 'CDS' || hasCDSRegion;
  // V12 — Sprint 1.5 mode switcher: bookkeeping edit (fix sequence in system)
  // vs lab mutagenesis (plan experiment, generate primers/protocol).
  // These are biologically distinct operations that share the click gesture.
  const [mode, setMode] = useState('edit'); // 'edit' | 'mutagenesis'
  const [seq, setSeq] = useState(fragment.sequence || '');

  // K10 (Sprint 1.7) — Unified Editor: tabs replaced by collapsible panels.
  const [panelsOpen, setPanelsOpen] = useState({
    annotations: true,
    mutations: true,
    protein: false,
  });
  const togglePanel = (id) => setPanelsOpen(p => ({ ...p, [id]: !p[id] }));

  // K11 (Sprint 1.7) — virtual full-gene view for split sub-fragments.
  // Only shown when fragment.splitGroupFullSequence is set (split-group member).
  const hasFullView = !!fragment.splitGroupFullSequence;
  const [sequenceView, setSequenceView] = useState('sub'); // 'sub' | 'full'
  const fullViewActive = hasFullView && sequenceView === 'full';
  const fullViewHighlight = useMemo(() => computeFullViewHighlights(fragment), [fragment]);

  // K12 (Sprint 1.7) — per-fragment topology toggle. Optional field on fragment;
  // fallback to assembly-level `assemblyCircular` (passed as prop from App.jsx).
  const [topology, setTopology] = useState(
    fragment.topology === 'circular' || fragment.topology === 'linear'
      ? fragment.topology
      : (assemblyCircular ? 'circular' : 'linear')
  );

  // K8 — mutation highlights relative to parent part. Recomputed when sequence
  // or parent changes. Returns Map<ntPos, 'silent'|'nonsilent'>.
  const parts = useStore(s => s.parts);
  const mutationHighlight = useMemo(() => {
    const parent = fragment.parentId
      ? parts.find(p => p.id === fragment.parentId)
      : null;
    return computeMutationHighlights(
      { ...fragment, sequence: seq, annotations: fragment.annotations },
      parent
    );
  }, [fragment.parentId, fragment.mutations, seq, parts, fragment.annotations]);
  // Unified annotations — migrate from legacy domains if needed
  const [annotations, setAnnotations] = useState(() => {
    if (fragment.annotations?.some(a => a.level === 'region')) return fragment.annotations;
    return migratePartAnnotations(fragment);
  });
  // Legacy compat: keep domains in sync for save handler
  const [domains, setDomains] = useState(fragment.domains?.length ? fragment.domains : loadSavedDomains(fragment.id) || loadSavedDomains(fragment.name) || []);
  const [customColor, setCustomColor] = useState(fragment.customColor || '');
  const [showPalette, setShowPalette] = useState(false);
  const [editMode, setEditMode] = useState('view'); // 'view' | 'edit' (codon inline editing)
  const [mutTarget, setMutTarget] = useState(null); // { start, end, x, y } — AA range
  const [dnaMutTarget, setDnaMutTarget] = useState(null); // { pos, nt, x, y }
  const [customAA, setCustomAA] = useState('');
  const [mutations, setMutations] = useState([]);
  const [editingCodon, setEditingCodon] = useState(null);
  const [insertSeq, setInsertSeq] = useState('');

  // Custom instant tooltip for nucleotide hover (replaces slow browser title)
  const [nucTooltip, setNucTooltip] = useState(null); // { x, y, text }

  // V12 — safe mode switch: confirm-and-clear if there are pending mutations.
  const switchMode = (newMode) => {
    if (newMode === mode) return;
    if (mutations.length > 0) {
      const ok = window.confirm(
        `Переключение режима отменит ${mutations.length} накопленных мутаций. Продолжить?`
      );
      if (!ok) return;
      setMutations([]);
    }
    setMutTarget(null);
    setDnaMutTarget(null);
    setMode(newMode);
  };

  // Open AA mutation menu
  const openMutMenu = (e, aaIdx, aa, codon) => {
    if (mode === 'edit') return; // V12 — AA clicks disabled in edit mode
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

  // Open DNA mutation menu (nucleotide-level, Shift extends range)
  const dnaMutAnchor = useRef(null); // remember first click position for Shift+click
  const openDnaMutMenu = (e, ntPos) => {
    e.preventDefault(); // prevent browser text selection on Shift+click
    e.stopPropagation();
    window.getSelection()?.removeAllRanges(); // clear any existing selection
    setMutTarget(null);
    const rect = e.currentTarget.getBoundingClientRect();
    if (e.shiftKey && dnaMutAnchor.current != null) {
      // Extend from anchor to ntPos
      const start = Math.min(dnaMutAnchor.current, ntPos);
      const end = Math.max(dnaMutAnchor.current, ntPos);
      setDnaMutTarget(prev => ({
        ...(prev || {}), pos: start, endPos: end,
        nt: seq.slice(start, end + 1).toUpperCase(),
        x: prev?.x || rect.left, y: prev?.y || rect.bottom + 4,
      }));
    } else {
      dnaMutAnchor.current = ntPos; // set anchor for future Shift+click
      setDnaMutTarget({ pos: ntPos, endPos: ntPos, nt: seq[ntPos]?.toUpperCase() || 'N', x: rect.left, y: rect.bottom + 4 });
    }
    setInsertSeq('');
  };

  // Close DNA popup on Escape
  useEffect(() => {
    if (!dnaMutTarget) return;
    const handler = (e) => { if (e.key === 'Escape') setDnaMutTarget(null); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [dnaMutTarget]);

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
    const oldLen = s.length;
    if (a.insert) {
      if (a.pos === 'start') s = a.insert + s;
      else if (a.pos === 'end') s = s + a.insert;
      else if (a.pos === 'before_stop' && hasStop(s)) s = s.slice(0, -3) + a.insert + s.slice(-3);
      else if (a.pos === 'before_stop') s = s + a.insert;
    }
    if (a.remove) { if (a.pos === 'end') s = s.slice(0, -a.remove); if (a.pos === 'start') s = s.slice(a.remove); }
    setSeq(s);
    // CRIT-1 fix: shift annotations for Quick Actions
    if (s.length !== oldLen) {
      setAnnotations(prev => {
        if (a.insert && a.pos === 'start') {
          const shift = a.insert.length;
          return prev.map(ann => ({ ...ann, start: ann.start + shift, end: ann.end + shift }));
        }
        if (a.insert && a.pos === 'before_stop' && hasStop(seq)) {
          const insertPos = oldLen - 3;
          const shift = a.insert.length;
          return prev.map(ann => {
            if (ann.end <= insertPos) return ann;
            if (ann.start >= insertPos) return { ...ann, start: ann.start + shift, end: ann.end + shift };
            return { ...ann, end: ann.end + shift };
          });
        }
        if (a.remove && a.pos === 'start') {
          const count = a.remove;
          return prev.map(ann => {
            if (ann.end <= count) return null;
            if (ann.start >= count) return { ...ann, start: ann.start - count, end: ann.end - count };
            return { ...ann, start: 0, end: ann.end - count };
          }).filter(Boolean);
        }
        if (a.remove && a.pos === 'end') {
          const cutPos = oldLen - a.remove;
          return prev.map(ann => {
            if (ann.start >= cutPos) return null;
            if (ann.end > cutPos) return { ...ann, end: cutPos };
            return ann;
          }).filter(Boolean);
        }
        return prev;
      });
    }
  };

  const seqChanged = seq.toUpperCase() !== (fragment.sequence || '').toUpperCase();
  const modification = seqChanged ? detectModification(fragment.sequence || '', seq) : null;

  // CRIT-2 fix: re-run autoAnnotate when sequence changes (detail/point only, preserve regions + manual)
  useEffect(() => {
    if (!seqChanged) return;
    const timer = setTimeout(() => {
      const regionAnns = annotations.filter(a => a.level === 'region');
      const manualAnns = annotations.filter(a => !a.auto && a.level !== 'region');
      const reAnnotated = autoAnnotate({ ...fragment, sequence: seq, annotations: regionAnns });
      const autoDetails = (reAnnotated || []).filter(a => a.level !== 'region');
      setAnnotations([...regionAnns, ...manualAnns, ...autoDetails]);
    }, 500);
    return () => clearTimeout(timer);
  }, [seq]);

  // V12 — bookkeeping edit: fix the record, no experimental intent.
  const handleSaveEdit = () => {
    persistDomains(fragment.id || fragment.name, domains);
    const newEntry = seq !== fragment.sequence
      ? [{ timestamp: Date.now(), oldSeq: fragment.sequence, newSeq: seq }]
      : [];
    onSave({ ...fragment, sequence: seq, length: seq.length, domains, annotations,
      customColor: customColor || undefined, editedAt: new Date().toISOString(),
      editHistory: [...(fragment.editHistory || []), ...newEntry],
      topology, // K12
      // mutations NOT passed — bookkeeping edit, not mutagenesis.
    });
    onClose();
  };

  // V12 — experimental mutagenesis: rename with labels, trigger strategy engine.
  const handleSaveMutagenesis = () => {
    persistDomains(fragment.id || fragment.name, domains);
    const mutLabels = mutations.map(m => m.label).join(',');
    const name = mutations.length > 0 ? `${fragment.name}(${mutLabels})` : fragment.name;
    onSave({ ...fragment, name, sequence: seq, length: seq.length, domains, annotations,
      customColor: customColor || undefined,
      mutations: mutations.length > 0 ? [...(fragment.mutations || []), ...mutations] : fragment.mutations,
      topology, // K12
      editedAt: new Date().toISOString() });
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
    if (oldAA !== newAA && mode !== 'edit') {
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
    // V12 — in edit mode, DNA change is a bookkeeping fix; no mutation tracking.
    if (mode !== 'edit') {
      const label = isCDS
        ? (() => { const ai = Math.floor(pos / 3); const oldC = seq.slice(ai*3, ai*3+3).toUpperCase(); const newC = newSeq.slice(ai*3, ai*3+3).toUpperCase();
            const oldAA = CODON_TABLE[oldC]||'?'; const newAA = CODON_TABLE[newC]||'?';
            return oldAA !== newAA ? `${oldAA}${ai+1}${newAA} (${oldNt}${pos+1}${newNt})` : `${oldNt}${pos+1}${newNt} (silent)`; })()
        : `${oldNt}${pos+1}${newNt}`;
      setMutations(prev => [...prev, { type: 'nt_substitution', label, codonStart: pos, position: pos }]);
    }
    setDnaMutTarget(null);
  };

  /** Delete nucleotide(s) at position. */
  const applyDnaDel = (pos, count = 1) => {
    if (pos < 0 || pos >= seq.length) return;
    const deleted = seq.slice(pos, pos + count).toUpperCase();
    const newSeq = seq.slice(0, pos) + seq.slice(pos + count);
    setSeq(newSeq);
    // CRIT-1 fix: shift annotations after deletion
    setAnnotations(prev => prev.map(a => {
      if (a.end <= pos) return a;
      if (a.start >= pos + count) return { ...a, start: a.start - count, end: a.end - count };
      const newEnd = Math.max(a.start, a.end - count);
      return { ...a, end: newEnd < a.start ? a.start : newEnd };
    }).filter(a => a.end > a.start));
    if (mode !== 'edit') {
      setMutations(prev => [...prev, { type: 'nt_deletion', label: `Δ${pos+1}${count > 1 ? `-${pos+count}` : ''} (${deleted})`, codonStart: pos, position: pos, deletedBp: count }]);
    }
    setDnaMutTarget(null);
  };

  /** Insert sequence at position. */
  const applyDnaInsert = (pos, insertedSeq) => {
    const clean = sanitizeSequence(insertedSeq);
    if (!clean) return;
    const newSeq = seq.slice(0, pos) + clean + seq.slice(pos);
    setSeq(newSeq);
    // CRIT-1 fix: shift annotations after insertion
    const insertLen = clean.length;
    setAnnotations(prev => prev.map(a => {
      if (a.end <= pos) return a;
      if (a.start >= pos) return { ...a, start: a.start + insertLen, end: a.end + insertLen };
      return { ...a, end: a.end + insertLen };
    }));
    if (mode !== 'edit') {
      setMutations(prev => [...prev, { type: 'nt_insertion', label: `ins${pos+1}+${clean.length}п.н.`, codonStart: pos, position: pos }]);
    }
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

        {/* V12 — Mode switcher (above tabs): bookkeeping edit vs experimental mutagenesis */}
        <div className="flex gap-0 rounded-lg overflow-hidden border mb-2" role="radiogroup" aria-label="Режим">
          <button onClick={() => switchMode('edit')}
            role="radio" aria-checked={mode === 'edit'}
            className={`flex-1 px-3 py-1.5 text-xs font-medium transition ${
              mode === 'edit' ? 'bg-slate-600 text-white' : 'hover:bg-gray-50'}`}>
            {'✏️'} Правка <span className="opacity-70 text-[9px]">(фикс записи)</span>
          </button>
          <button onClick={() => switchMode('mutagenesis')}
            role="radio" aria-checked={mode === 'mutagenesis'}
            className={`flex-1 px-3 py-1.5 text-xs font-medium transition ${
              mode === 'mutagenesis' ? 'bg-purple-600 text-white' : 'hover:bg-gray-50'}`}>
            {'🧬'} Мутагенез <span className="opacity-70 text-[9px]">(эксперимент)</span>
          </button>
        </div>

        {/* K11 (Sprint 1.7) — virtual full-view toggle for split sub-fragments */}
        {hasFullView && (
          <div className="flex items-center gap-2 text-[10px] mb-2">
            <span className="text-gray-500">Вид:</span>
            <div className="flex rounded-lg overflow-hidden border">
              <button onClick={() => setSequenceView('sub')}
                className={`px-2 py-0.5 ${sequenceView === 'sub' ? 'bg-purple-600 text-white' : 'hover:bg-gray-50'}`}>
                Фрагмент ({fragment.length} п.н.)
              </button>
              <button onClick={() => setSequenceView('full')}
                className={`px-2 py-0.5 ${sequenceView === 'full' ? 'bg-purple-600 text-white' : 'hover:bg-gray-50'}`}>
                Полный ген ({fragment.splitGroupFullLength} п.н.)
              </button>
            </div>
            {fullViewActive && (
              <span className="text-[9px] text-purple-500 ml-auto truncate">
                Просмотр split-группы · {fragment.splitGroupParentName || ''}
              </span>
            )}
          </div>
        )}

        {fullViewActive && (
          <div className="text-[9px] text-purple-700 bg-purple-50 rounded px-2 py-1 mb-2">
            {'👁'} Виртуальный вид: показана полная мутант-последовательность родителя. Редактирование доступно в виде «Фрагмент».
          </div>
        )}

        {/* K12 (Sprint 1.7) — per-fragment topology toggle */}
        <div className="flex items-center gap-2 text-[10px] mb-2">
          <span className="text-gray-500">Топология:</span>
          <div className="flex rounded-lg overflow-hidden border">
            <button onClick={() => setTopology('linear')}
              className={`px-2 py-0.5 ${topology === 'linear' ? 'bg-gray-700 text-white' : 'hover:bg-gray-50'}`}>
              {'📏'} Линейная
            </button>
            <button onClick={() => setTopology('circular')}
              className={`px-2 py-0.5 ${topology === 'circular' ? 'bg-blue-600 text-white' : 'hover:bg-gray-50'}`}>
              {'⭕'} Кольцевая
            </button>
          </div>
        </div>

        {/* K10 — tabs removed. Sequence view is primary; annotations/mutations/protein are collapsible panels below. */}
        {mode === 'edit' && seqChanged && (
          <div className="text-[9px] text-amber-600 bg-amber-50 rounded px-2 py-1 mb-2">
            {'⚠'} Последовательность изменена. При сохранении праймеры будут сброшены.
          </div>
        )}
        {mode === 'mutagenesis' && mutations.length === 0 && (
          <div className="text-[9px] text-purple-500 bg-purple-50 rounded px-2 py-1 mb-2">
            {'🧬'} Кликните по кодону (ДНК) или аминокислоте (АК) для мутагенеза. Будут подобраны праймеры и протокол.
          </div>
        )}

        {/* K11 — virtual full-view grid (read-only) */}
        {fullViewActive && (() => {
          const fullSeq = fragment.splitGroupFullSequence || '';
          const regionStart = fragment.templateStart || 0;
          const regionEnd = regionStart + (fragment.length || 0);
          const PER_LINE = 60;
          const lines = [];
          for (let i = 0; i < fullSeq.length; i += PER_LINE) {
            lines.push({ start: i, slice: fullSeq.slice(i, i + PER_LINE) });
          }
          return (
            <div className="bg-gray-50 rounded-lg p-3 max-h-[240px] overflow-y-auto mb-3 font-mono text-[11px]"
              data-testid="fragment-editor-full-view">
              {lines.map(line => (
                <div key={line.start} className="flex items-start mb-0.5">
                  <span className="text-gray-400 w-10 text-right mr-2 shrink-0 text-[9px] pt-0.5 select-none">{line.start + 1}</span>
                  <span>
                    {line.slice.split('').map((nt, ci) => {
                      const pos = line.start + ci;
                      const inRegion = pos >= regionStart && pos < regionEnd;
                      const mh = fullViewHighlight.get(pos);
                      const gap = ci > 0 && ci % 10 === 0;
                      return (
                        <span key={ci}
                          className={`rounded ${gap ? 'ml-1' : ''} ${inRegion ? 'bg-purple-100' : 'text-gray-500'}`}
                          style={{ cursor: 'default',
                            backgroundColor: mh === 'nonsilent' ? 'rgba(239,68,68,0.35)'
                              : mh === 'silent' ? 'rgba(234,179,8,0.35)'
                              : (inRegion ? 'rgba(168,85,247,0.18)' : undefined),
                            borderBottom: mh ? `2px solid ${mh === 'nonsilent' ? '#ef4444' : '#eab308'}` : 'none',
                          }}
                          title={`${nt} · ${pos + 1}${inRegion ? ' · текущий фрагмент' : ''}${mh ? ' · мутация' : ''}`}>
                          {nt}
                        </span>
                      );
                    })}
                  </span>
                </div>
              ))}
              <div className="text-[9px] text-gray-400 text-center mt-1">
                Обзор полной split-группы (read-only). Область текущего sub-фрагмента подсвечена.
              </div>
            </div>
          );
        })()}

        {/* ═══ Sequence view (primary) — behavior controlled by `mode` ═══ */}
        {!fullViewActive && (<>
        {/* Quick actions — disabled in mutagenesis mode (they're bookkeeping helpers) */}
            <div className="flex flex-wrap gap-1 mb-3">
              {QUICK_ACTIONS.filter(a => !a.forType || a.forType === fragment.type).filter(a => !a.cond || a.cond(seq)).map(a => (
                <button key={a.key} onClick={() => apply(a)} title={mode === 'mutagenesis' ? 'Доступно только в режиме Правки' : (a.desc || '')}
                  disabled={mode === 'mutagenesis'}
                  className="text-[10px] px-2 py-1 rounded border border-gray-200 hover:bg-blue-50 hover:border-blue-300 transition disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:border-gray-200">{a.label}</button>
              ))}
            </div>

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
                          const isMiddle = ni === 1; // AA shown under middle nucleotide
                          const isCodonEnd = ni === 2; // small gap after codon
                          const mh = mutationHighlight.get(ntPos); // K8
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
                                onMouseEnter={e => { const r = e.currentTarget.getBoundingClientRect(); setNucTooltip({ x: r.left + r.width/2, y: r.top - 4, text: `${nt} · ${ntPos + 1}${mh ? ` · ${mh}` : ''}` }); }}
                                onMouseLeave={() => setNucTooltip(null)}
                                onClick={e => { e.preventDefault(); openDnaMutMenu(e, ntPos); }}>
                                {nt}
                              </span>
                              {isMiddle ? (
                                <span className={`block text-[9px] cursor-pointer ${editMode === 'view' ? 'hover:font-bold' : ''}`}
                                  style={{ color: c.aa === '*' ? '#dc2626' : c.aa === 'M' && c.aaIdx === 1 ? '#16a34a' : c.dom ? c.dom.color : '#aaa' }}
                                  onClick={e => { e.preventDefault(); e.stopPropagation(); openMutMenu(e, ai, c.aa, c.codon); }}>
                                  {c.aa}
                                </span>
                              ) : (
                                <span className="block text-[9px] text-transparent">{'\u00A0'}</span>
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
                <textarea value={seq} onChange={e => setSeq(sanitizeSequence(e.target.value))}
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
                          const mh = mutationHighlight.get(pos); // K8
                          return (
                            <span key={ci}
                              className={`cursor-pointer transition rounded ${gap ? 'ml-1' : ''}
                                ${isDnaMut ? 'bg-teal-300 text-white' : isMut ? 'bg-amber-200' : mh ? '' : 'hover:bg-teal-100'}`}
                              style={!isDnaMut && !isMut && mh ? {
                                backgroundColor: mh === 'nonsilent' ? 'rgba(239,68,68,0.25)' : 'rgba(234,179,8,0.25)',
                                borderBottom: `2px solid ${mh === 'nonsilent' ? '#ef4444' : '#eab308'}`,
                              } : undefined}
                              title={mh ? `Мутация: ${mh === 'silent' ? 'silent (same AA)' : 'non-silent'}` : undefined}
                              onMouseEnter={e => { const r = e.currentTarget.getBoundingClientRect(); setNucTooltip({ x: r.left + r.width/2, y: r.top - 4, text: `${nt} · ${pos + 1}${mh ? ` · ${mh}` : ''}` }); }}
                              onMouseLeave={() => setNucTooltip(null)}
                              onClick={e => openDnaMutMenu(e, pos)}>
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
        </>)}

            <div className="flex justify-between items-center mb-3">
              <div className="flex gap-3 text-[10px] text-gray-500 flex-wrap">
                <span>Длина: {fullViewActive ? fragment.splitGroupFullLength : seq.length}{!fullViewActive && diff !== 0 && <span className={diff > 0 ? 'text-green-600' : 'text-red-600'}> ({diff > 0 ? '+' : ''}{diff})</span>}</span>
                {!fullViewActive && isCDS && <span className={seq.length % 3 === 0 ? 'text-green-600' : 'text-red-600'}>Рамка: {seq.length % 3 === 0 ? '✓' : `⚠ ост. ${seq.length % 3}`}</span>}
                {!fullViewActive && isCDS && <span>ATG: {seq.toUpperCase().startsWith('ATG') ? '✓' : '⚠'}</span>}
                {!fullViewActive && isCDS && <span>Стоп: {hasStop(seq) ? `✓ ${seq.slice(-3).toUpperCase()}` : '⚠'}</span>}
                <span>GC: {(gcContent(fullViewActive ? (fragment.splitGroupFullSequence || '') : seq) * 100).toFixed(1)}%</span>
                {fullViewActive && <span className="text-purple-500">Только обзор</span>}
              </div>
              <div className="flex gap-2 items-center shrink-0">
                <button onClick={() => navigator.clipboard.writeText(fullViewActive ? (fragment.splitGroupFullSequence || '') : seq)}
                  className="text-[10px] text-gray-400 hover:text-gray-600" title="Копировать">{'📋'}</button>
                <button onClick={() => { setEditMode(m => m === 'view' ? 'edit' : 'view'); setEditingCodon(null); }}
                  disabled={fullViewActive}
                  className={`text-[10px] px-2 py-0.5 rounded transition disabled:opacity-40 disabled:cursor-not-allowed ${editMode === 'edit' ? 'bg-blue-100 text-blue-700' : 'text-blue-600 hover:bg-blue-50'}`}>
                  {editMode === 'view'
                    ? (isCDS ? '✏️ Редакт. кодоны' : '✏️ Редактировать')
                    : (isCDS ? '🧬 Мутагенез' : '👁 Просмотр')}
                </button>
              </div>
            </div>

        {/* ═══ K10 Unified Editor — collapsible panels below sequence view ═══ */}
        {(() => {
          const getColor = (type) => ANNOTATION_COLORS[type] || REGION_COLORS[type] || DOMAIN_COLORS[type] || '#56B4E9';
          const details = getAllDetails(annotations);

          const PanelHeader = ({ id, title, badge }) => (
            <button onClick={() => togglePanel(id)}
              className="w-full px-3 py-2 text-xs font-semibold text-left flex items-center justify-between hover:bg-gray-50 rounded-t-lg">
              <span>{panelsOpen[id] ? '▾' : '▸'} {title}</span>
              {badge != null && <span className="text-[9px] text-gray-400">{badge}</span>}
            </button>
          );

          return (
            <>
              {/* ── Annotations panel ── */}
              <div className="border rounded-lg mb-3">
                <PanelHeader id="annotations" title="Аннотации" badge={fullViewActive ? '—' : annotations.length} />
                {panelsOpen.annotations && (
                  <div className="px-3 pb-3">
                    {fullViewActive ? (
                      <div className="text-[10px] text-gray-500 bg-gray-50 rounded px-2 py-2">
                        В полном обзоре аннотации недоступны. Откройте parent-part из библиотеки для просмотра.
                      </div>
                    ) : (<>
                    <div className="flex items-center justify-end mb-2">
                      <button onClick={() => setAnnotations(autoAnnotate({ ...fragment, sequence: seq, annotations: annotations.filter(a => a.level === 'region' && !a.auto) }))}
                        className="text-[10px] px-2 py-1 bg-blue-50 text-blue-700 rounded hover:bg-blue-100">{'🔍'} Авто</button>
                    </div>
                    <AnnotationEditor
                      annotations={annotations}
                      seqLength={seq.length}
                      onChange={setAnnotations}
                      compact />
                    {addForm && (
                      <div className="border rounded p-2 bg-gray-50 mb-3 space-y-2 mt-2">
                        <div className="grid grid-cols-4 gap-2">
                          <input placeholder="Имя" value={addForm.name} onChange={e => setAddForm({ ...addForm, name: e.target.value })} className="text-xs border rounded p-1.5 col-span-2" />
                          <select value={addForm.type} onChange={e => {
                            if (e.target.value === '__new__') {
                              const name = prompt('Название нового типа:');
                              if (name) { const val = name.toLowerCase().replace(/\s+/g, '_'); addCustomRegionType(val, name); setAddForm({ ...addForm, type: val }); }
                            } else setAddForm({ ...addForm, type: e.target.value });
                          }} className="text-xs border rounded p-1.5">
                            {getRegionTypes(fragment.type).map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                            <option value="__new__">+ Новый тип...</option>
                          </select>
                          <div className="flex gap-1">
                            <input type="number" value={addForm.startAA} min={1} max={isCDS ? totalAA : seq.length} onChange={e => setAddForm({ ...addForm, startAA: +e.target.value })} className="text-xs border rounded p-1.5 w-14" />
                            <input type="number" value={addForm.endAA} min={1} max={isCDS ? totalAA : seq.length} onChange={e => setAddForm({ ...addForm, endAA: +e.target.value })} className="text-xs border rounded p-1.5 w-14" />
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={addDomain} className="text-xs px-3 py-1 bg-green-600 text-white rounded">Добавить</button>
                          <button onClick={() => setAddForm(null)} className="text-xs px-3 py-1 bg-gray-200 rounded">Отмена</button>
                        </div>
                      </div>
                    )}
                    </>)}
                  </div>
                )}
              </div>

              {/* ── Mutations panel ── */}
              {mutations.length > 0 && (
                <div className="border rounded-lg mb-3">
                  <PanelHeader id="mutations" title="Мутации" badge={mutations.length} />
                  {panelsOpen.mutations && (
                    <div className="px-3 pb-3">
                      <div className="space-y-1">
                        {mutations.map((m, mi) => (
                          <div key={mi} className="flex items-center justify-between text-[10px] bg-purple-50 text-purple-700 rounded px-2 py-1">
                            <span className="font-mono">{m.label}</span>
                            <button
                              onClick={() => setMutations(prev => prev.filter((_, i) => i !== mi))}
                              className="text-purple-400 hover:text-purple-600 text-xs ml-2"
                              title="Убрать мутацию из списка">{'✕'}</button>
                          </div>
                        ))}
                      </div>
                      <div className="text-[9px] text-gray-400 mt-2">
                        Кнопка ✕ убирает мутацию только из списка — последовательность не откатывается.
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── Protein (обзор) panel — CDS only, read-only in BOTH modes ── */}
              {isCDS && (
                <div className="border rounded-lg mb-3">
                  <PanelHeader id="protein" title="Белок (обзор)" badge={`${totalAA} а.о.`} />
                  {panelsOpen.protein && (
                    <div className="px-3 pb-3">
                      <div className="font-mono text-[10px] leading-relaxed bg-gray-50 p-3 rounded max-h-[200px] overflow-y-auto relative">
                        {(() => {
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
                                  const ntPos = i * 3;
                                  const det = details.find(d => ntPos >= d.start && ntPos < d.end);
                                  const detColor = det ? (det.color || getColor(det.type)) : null;
                                  const isMutated = mutations.some(m => mutationHitsAA(m, pos));
                                  const gap10 = ci > 0 && ci % 10 === 0;
                                  let codonMh = null;
                                  for (let k = 0; k < 3; k++) {
                                    const h = mutationHighlight.get(ntPos + k);
                                    if (h === 'nonsilent') { codonMh = 'nonsilent'; break; }
                                    if (h === 'silent') codonMh = 'silent';
                                  }
                                  const codonMhBg = codonMh === 'nonsilent' ? 'rgba(239,68,68,0.25)'
                                                 : codonMh === 'silent' ? 'rgba(234,179,8,0.25)'
                                                 : null;
                                  return (
                                    <span key={i}
                                      className={`rounded-sm inline-block text-center ${gap10 ? 'ml-1' : ''}
                                        ${isMutated ? 'bg-amber-200' : ''}`}
                                      style={{ backgroundColor: isMutated ? undefined : codonMhBg ? codonMhBg : detColor ? detColor + '25' : 'transparent',
                                        borderBottom: codonMh ? `2px solid ${codonMh === 'nonsilent' ? '#ef4444' : '#eab308'}` : (detColor ? `2px solid ${detColor}` : 'none'),
                                        color: aa === '*' ? '#dc2626' : '#333',
                                        cursor: 'default' }}
                                      title={codonMh ? `${aa}${pos} — Мутация: ${codonMh === 'silent' ? 'silent (same AA)' : 'non-silent'}` : `${aa}${pos}${det ? ` (${det.name})` : ''}`}
                                      >{aa}</span>
                                  );
                                })}
                              </div>
                            </div>
                          ));
                        })()}
                      </div>
                      <div className="text-[9px] text-gray-400 mt-2 text-center">
                        Обзор белка read-only. Для мутагенеза кликайте по аминокислотам в основной последовательности выше.
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          );
        })()}

        {/* Save — routed by mode, not tab (V12) */}
        <div className="flex gap-2 items-center">
          {mode === 'edit' ? (
            <button onClick={handleSaveEdit} className="text-xs bg-blue-600 text-white px-4 py-1.5 rounded-lg hover:bg-blue-700 font-semibold">
              {'💾'} Сохранить
            </button>
          ) : (
            <button onClick={handleSaveMutagenesis}
              disabled={mutations.length === 0}
              className="text-xs bg-purple-600 text-white px-4 py-1.5 rounded-lg hover:bg-purple-700 font-semibold disabled:opacity-40">
              {'🧬'} Применить мутагенез {mutations.length > 0 && `(${mutations.length})`}
            </button>
          )}
          {mode === 'mutagenesis' && seqChanged && onSaveAsVariant && (
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
        <div className="fixed inset-0 z-[60]" onClick={(e) => { e.stopPropagation(); setMutTarget(null); }}>
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

      {/* DNA mutation popup — no full-screen backdrop (allows Shift+click on nucleotides) */}
      {dnaMutTarget && createPortal(
        <div className="fixed inset-0 z-[60]" onClick={() => setDnaMutTarget(null)}>
        <div className="absolute bg-white rounded-xl shadow-2xl border p-3 w-64 max-h-[90vh] overflow-y-auto"
          style={{
            left: Math.max(8, Math.min(dnaMutTarget.x, window.innerWidth - 272)),
            top: Math.max(8, Math.min(dnaMutTarget.y, window.innerHeight - 400)),
          }}
          onClick={e => e.stopPropagation()}>

            {(() => {
              const isRange = dnaMutTarget.endPos != null && dnaMutTarget.endPos !== dnaMutTarget.pos;
              const rangeLen = isRange ? dnaMutTarget.endPos - dnaMutTarget.pos + 1 : 1;
              return (<>
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
                <input value={insertSeq} onChange={e => setInsertSeq(sanitizeSequence(e.target.value))}
                  placeholder="ATGC..." className="flex-1 border rounded px-2 py-1 text-xs font-mono" />
                <button onClick={() => applyDnaInsert(dnaMutTarget.pos + 1, insertSeq)}
                  disabled={!insertSeq}
                  className="text-[10px] px-2 border rounded hover:bg-teal-50 disabled:opacity-30">Вставить</button>
              </div>
            </div>

            {/* Deletion */}
            <div className="border-t pt-2 space-y-1">
              {isRange ? (
                <button onClick={() => applyDnaDel(dnaMutTarget.pos, rangeLen)}
                  className="text-[10px] text-red-600 hover:bg-red-50 px-2 py-0.5 rounded w-full text-left">
                  {'🗑'} Удалить {dnaMutTarget.pos + 1}–{dnaMutTarget.endPos + 1} ({rangeLen} п.н.)
                </button>
              ) : (<>
                <button onClick={() => applyDnaDel(dnaMutTarget.pos, 1)}
                  className="text-[10px] text-red-600 hover:bg-red-50 px-2 py-0.5 rounded w-full text-left">
                  {'🗑'} Удалить {dnaMutTarget.nt} (1 п.н.)
                </button>
                {isCDS && (
                  <button onClick={() => applyDnaDel(Math.floor(dnaMutTarget.pos / 3) * 3, 3)}
                    className="text-[10px] text-red-600 hover:bg-red-50 px-2 py-0.5 rounded w-full text-left">
                    {'🗑'} Удалить кодон — 3 п.н.
                  </button>
                )}
              </>)}
            </div>

            {/* Close IIFE */}
            </>); })()}

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
      {/* Instant nucleotide tooltip (no browser delay) */}
      {nucTooltip && createPortal(
        <div style={{ position: 'fixed', left: nucTooltip.x, top: nucTooltip.y,
          transform: 'translate(-50%, -100%)', pointerEvents: 'none', zIndex: 9999,
          background: 'rgba(0,0,0,0.8)', color: '#fff', fontSize: '10px',
          padding: '2px 6px', borderRadius: '4px', whiteSpace: 'nowrap' }}>
          {nucTooltip.text}
        </div>,
        document.body
      )}
    </div>
  );
}
