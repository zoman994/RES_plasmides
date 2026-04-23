/**
 * FragmentEditor — unified editor:
 *   🔤 ДНК (DNA editing + codon/AA display + quick actions)
 *   🧬 Белок (protein editing + domain annotation) — CDS only
 */
import { useState, useMemo, useEffect, useRef } from 'react';
import { translateDNA, CODON_TABLE } from '../../codons';
import { sanitizeSequence } from '../../sequence-utils';
import { DOMAIN_COLORS } from '../../domain-detection';
import { autoAnnotate } from '../../auto-annotate';
import { migratePartAnnotations } from '../../migrate-annotations';
import { detectModification, suggestVariantName } from '../../part-variants';
import { inlineSubstitution, inlineDeletion, designInlineKLDPrimers } from '../../mutagenesis';
import { useStore } from '../../store';
import { computeMutationHighlights, mutationHitsAA, computeFullViewHighlights } from './highlights';
import {
  BASE_PALETTE, loadUserColors, saveUserColor, replaceUserColor, getFragColorDefault,
} from './color-palette';
import { loadSavedDomains, persistDomains } from './region-types';
import FullViewGrid from './FullViewGrid';
import AAMutationPopup from './AAMutationPopup';
import DnaMutationPopup, { NucTooltip } from './DnaMutationPopup';
import SequenceGrid from './SequenceGrid';
import EditorPanels from './EditorPanels';
import { normalizeMutationForGit, buildSavePartPayload } from './mutation-normalize';
export { computeMutationHighlights, mutationHitsAA, computeFullViewHighlights };

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

export default function FragmentEditor({ fragment, onSave, onClose, onColorChange, onSaveAsVariant, onSavePart, onCreateAssembly, assemblyCircular = false }) {
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

  // K5 (Sprint X) — Plasmid-Git diff view + commit actions. `commits` is read
  // from live fragment in store so toggle/archive/message reflect instantly.
  const [diffViewActive, setDiffViewActive] = useState(false);
  const toggleCommit = useStore(s => s.toggleCommit);
  const archiveCommit = useStore(s => s.archiveCommit);
  const setCommitMessage = useStore(s => s.setCommitMessage);
  const applyMutationsBatch = useStore(s => s.applyMutationsBatch);
  const liveFragment = useStore(s => {
    const asm = s.assemblies.find(a => a.id === s.activeId);
    return asm?.fragments.find(f => f.id === fragment.id) || fragment;
  });
  const commits = Array.isArray(liveFragment.commits) ? liveFragment.commits : [];
  const hasCommits = commits.length > 0;
  const appliedCommitCount = commits.filter(c => c.applied !== false).length;
  const hasAppliedCommits = appliedCommitCount > 0;
  const fragIdx = useStore(s => {
    const asm = s.assemblies.find(a => a.id === s.activeId);
    return asm?.fragments.findIndex(f => f.id === fragment.id) ?? -1;
  });
  const handleToggleCommit = (commitId) => { if (fragIdx >= 0) toggleCommit(fragIdx, commitId); };
  const handleArchiveCommit = (commitId) => { if (fragIdx >= 0) archiveCommit(fragIdx, commitId); };
  const handleSetCommitMessage = (commitId, msg) => { if (fragIdx >= 0) setCommitMessage(fragIdx, commitId, msg); };

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

  // Sprint X-fix-2 K-fix2-2: after batch-commit (or toggleCommit / archiveCommit)
  // the store replays fragment.sequence; re-sync local `seq` so SequenceGrid
  // reflects the new state. Gated on `liveFragment.sequence` CHANGING (ref-tracked)
  // to ignore initial mount and cross-test store bleed. mode=edit — skip
  // (user's local input wins there).
  const lastLiveSeqRef = useRef(liveFragment.sequence);
  useEffect(() => {
    if (mode !== 'mutagenesis') return;
    if (liveFragment.sequence !== lastLiveSeqRef.current) {
      setSeq(liveFragment.sequence);
      lastLiveSeqRef.current = liveFragment.sequence;
    }
  }, [liveFragment.sequence, mode]);

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

  // Sprint X-fix K1 + X-fix-2 K-fix2-1/K-fix2-2: route local mutations through
  // Plasmid-Git as a single batch (one pushUndo for all N); editor stays open
  // so biologist can see commits land in the Mutations panel.
  const handleSaveMutagenesis = () => {
    if (mutations.length === 0) return;
    if (fragIdx < 0) return;
    persistDomains(fragment.id || fragment.name, domains);
    const muts = mutations.map(m => normalizeMutationForGit(m, seq));
    applyMutationsBatch(fragIdx, muts);
    setMutations([]);
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

  // Sprint X-fix K3 + X-fix-2 K-fix2-2: save Part from applied Git commits
  // (HEAD replay). Editor stays open so biologist can continue working.
  const handleSavePart = () => {
    if (!onSavePart) return;
    const payload = buildSavePartPayload({ fragment, liveFragment, seq, annotations, domains, customColor, commits });
    const variantName = prompt('Имя варианта:', suggestVariantName(fragment.name, payload.modification));
    if (!variantName) return;
    persistDomains(fragment.id || fragment.name, domains);
    onSavePart({ ...payload, name: variantName });
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
      setMutations(prev => [...prev, { type: 'nt_insertion', label: `ins${pos+1}+${clean.length}п.н.`, codonStart: pos, position: pos, insertSequence: clean }]);
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
          {/* K5 (Sprint X) — diff vs baseline toggle. Disabled without commits. */}
          <button
            onClick={() => setDiffViewActive(v => !v)}
            disabled={!hasCommits}
            title={hasCommits ? 'Показать baseline с наложением мутаций' : 'Нет применённых мутаций'}
            className={`ml-auto px-2 py-0.5 rounded border transition disabled:opacity-40 disabled:cursor-not-allowed ${
              diffViewActive ? 'bg-amber-100 text-amber-800 border-amber-300' : 'hover:bg-gray-50 border-gray-200'
            }`}
            data-testid="diff-view-toggle"
          >
            {diffViewActive ? '✕ Закрыть diff' : '⇌ Сравнить с baseline'}
          </button>
        </div>
        {diffViewActive && (
          <div className="text-[9px] text-amber-700 bg-amber-50 rounded px-2 py-1 mb-2">
            {'⇌'} Показан baseline с выделением точек мутаций. Редактирование заблокировано.
          </div>
        )}

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
        {fullViewActive && (
          <FullViewGrid
            fragment={fragment}
            fullViewHighlight={fullViewHighlight}
            mutationHighlight={mutationHighlight}
          />
        )}

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

            <SequenceGrid
              isCDS={isCDS}
              codonLines={codonLines}
              seq={seq}
              editMode={editMode}
              mode={mode}
              mutations={mutations}
              mutTarget={mutTarget}
              dnaMutTarget={dnaMutTarget}
              mutationHighlight={mutationHighlight}
              onOpenDnaMutMenu={openDnaMutMenu}
              onOpenMutMenu={openMutMenu}
              onSetSeq={setSeq}
              onSetNucTooltip={setNucTooltip}
            />
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
        <EditorPanels
          fragment={fragment}
          seq={seq}
          isCDS={isCDS}
          totalAA={totalAA}
          protein={protein}
          fullViewActive={fullViewActive}
          annotations={annotations}
          setAnnotations={setAnnotations}
          mutations={mutations}
          setMutations={setMutations}
          mutationHighlight={mutationHighlight}
          panelsOpen={panelsOpen}
          togglePanel={togglePanel}
          addForm={addForm}
          setAddForm={setAddForm}
          onAddDomain={addDomain}
          commits={commits}
          onToggleCommit={handleToggleCommit}
          onArchiveCommit={handleArchiveCommit}
          onSetMessage={handleSetCommitMessage}
        />

        {/* Save — routed by mode, not tab (V12) */}
        <div className="flex gap-2 items-center flex-wrap">
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
          {hasAppliedCommits && onCreateAssembly && (
            <button
              onClick={() => { if (fragIdx >= 0) onCreateAssembly(fragIdx); onClose(); }}
              data-testid="create-assembly-button"
              className="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700 font-semibold">
              {'🧬'} Создать сборку ({appliedCommitCount})
            </button>
          )}
          {hasAppliedCommits && onSavePart && (
            <button onClick={handleSavePart}
              data-testid="save-as-part-button"
              className="text-xs bg-purple-50 text-purple-700 px-3 py-1.5 rounded-lg hover:bg-purple-100 border border-purple-200 font-medium">
              {'💾'} Сохранить как запчасть
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
      {isCDS && (
        <AAMutationPopup
          mutTarget={mutTarget}
          protein={protein}
          seq={seq}
          customAA={customAA}
          mutations={mutations}
          onClose={() => setMutTarget(null)}
          onSetCustomAA={setCustomAA}
          onApplyMut={applyMut}
          onApplyMultiMut={applyMultiMut}
          onApplyDel={applyDel}
        />
      )}

      {/* DNA mutation popup — no full-screen backdrop (allows Shift+click on nucleotides) */}
      <DnaMutationPopup
        dnaMutTarget={dnaMutTarget}
        seq={seq}
        insertSeq={insertSeq}
        mutations={mutations}
        isCDS={isCDS}
        onClose={() => setDnaMutTarget(null)}
        onSetInsertSeq={setInsertSeq}
        onApplyDnaSub={applyDnaSub}
        onApplyDnaDel={applyDnaDel}
        onApplyDnaInsert={applyDnaInsert}
      />
      {/* Instant nucleotide tooltip (no browser delay) */}
      <NucTooltip tooltip={nucTooltip} />
    </div>
  );
}
