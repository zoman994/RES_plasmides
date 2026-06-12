/**
 * PlasmidUseWizard — modal wizard for plasmid operations.
 *
 * Triggered when addFragment detects a circular Part with ≥2 regions.
 * 10 modes: view, use whole, restriction cloning, replace, disassemble, extract, mutate, insert, delete, versions.
 */
import { useState, useMemo, useEffect, useRef } from 'react';
import PlasmidMap from './PlasmidMap';
import { getRegions, getDetails } from '../annotation-model';
import { ANNOTATION_COLORS } from '../auto-annotate';
import { FEATURE_COLORS } from '../theme';
import { useStore } from '../store';
import { checkDuplicates } from '../duplicate-checker';
import { migratePartAnnotations } from '../migrate-annotations';
import { sanitizeSequence } from '../sequence-utils';
import { digest, checkDoubleDigest, checkInsertSites, checkReadingFrame, scanAllSites } from '../restriction-db';

const MODES = [
  { id: 'view',        icon: '\uD83D\uDC41',  label: 'Посмотреть',            desc: 'только просмотр' },
  { id: 'use_whole',   icon: '\uD83D\uDCE6',  label: 'Использовать целиком',  desc: 'как backbone/вектор' },
  { id: 'restriction_cloning', icon: '\uD83D\uDD2A', label: 'Рестрикционное клонирование', desc: 'digest + insert + ligate' },
  { id: 'replace',     icon: '\uD83D\uDD04',  label: 'Заменить элемент',      desc: 'одиночный или кассету' },
  { id: 'disassemble', icon: '\uD83E\uDDE9',  label: 'Разобрать на части',    desc: 'все регионы в библиотеку' },
  { id: 'extract',     icon: '\u2702\uFE0F',   label: 'Вырезать элемент',      desc: 'один регион в библиотеку' },
  { id: 'mutate',      icon: '\uD83E\uDDEC',  label: 'Точечный мутагенез',    desc: 'KLD / QuikChange / OE' },
  { id: 'insert',      icon: '\u2795',         label: 'Вставить элемент',      desc: 'добавить без удаления' },
  { id: 'delete',      icon: '\uD83D\uDDD1',  label: 'Удалить элемент',       desc: 'делеция без замены' },
  { id: 'versions',    icon: '\uD83D\uDCCB',  label: 'Версии',                desc: 'история изменений' },
];

/**
 * @param {Object} props
 * @param {Object} props.plasmid — Part with topology='circular' and ≥2 regions
 * @param {Function} props.onClose
 */
export default function PlasmidUseWizard({ plasmid, presetMode, onClose }) {
  const [step, setStep] = useState(presetMode || 'menu'); // 'menu' | mode id | sub-steps
  const [selectedRegionIds, setSelectedRegionIds] = useState([]);
  const [message, setMessage] = useState(null);
  const [creating, setCreating] = useState(false);

  // ui-interactions A — wizard closes on Escape (backdrop-click already wired).
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const addFragment = useStore(s => s.addFragment);
  const addPart = useStore(s => s.addPart);
  const setViewerPart = useStore(s => s.setViewerPart);
  const setShowMutagenesis = useStore(s => s.setShowMutagenesis);
  const insertElement = useStore(s => s.insertElement);
  const deleteElement = useStore(s => s.deleteElement);
  const parts = useStore(s => s.parts);

  const seq = plasmid.sequence || '';
  const regions = useMemo(() => getRegions(plasmid.annotations), [plasmid.annotations]);
  const totalBp = seq.length;

  // Build fragments for PlasmidMap — single plasmid to avoid overlapping region chaos
  const mapFragments = useMemo(() => [{
    id: plasmid.id || 'wizard',
    name: plasmid.name,
    type: plasmid.type || 'plasmid',
    sequence: seq,
    length: totalBp,
    strand: 1,
    annotations: plasmid.annotations || [],
  }], [plasmid, seq, totalBp]);

  // ── Mode handlers ──

  const usedRef = useRef(false);
  const handleUseWhole = () => {
    if (usedRef.current) return; // StrictMode double-fire guard
    usedRef.current = true;
    // Bypass plasmid detection by adding directly via store set
    useStore.getState().pushUndo?.();
    // P4 fix: ensure annotations have region/detail levels for PartBlock rendering
    const migratedAnnotations = plasmid.annotations?.some(a => a.level === 'region')
      ? plasmid.annotations
      : migratePartAnnotations(plasmid);
    useStore.setState(state => {
      const asm = state.assemblies.find(a => a.id === state.activeId);
      if (!asm) return;
      // Guard: don't duplicate if same partId already on canvas
      if (asm.fragments.some(f => f.partId === plasmid.id)) return;
      asm.fragments.push({
        id: `f${Date.now()}`, name: plasmid.name, type: plasmid.type || 'fusion',
        sequence: seq, length: totalBp, strand: 1,
        needsAmplification: false, partId: plasmid.id,
        annotations: migratedAnnotations,
      });
      // P5 fix: inherit topology from plasmid → enables Map/Racetrack views
      if (plasmid.topology === 'circular') asm.circular = true;
      asm.calculated = false;
      asm.primers = [];
    });
    onClose();
  };

  const handleDisassemble = () => {
    const added = [];
    const dupes = [];
    for (const r of regions) {
      const regionSeq = seq.slice(r.start, r.end);
      const dups = checkDuplicates(regionSeq, parts);
      if (dups.some(d => d.match === 'exact')) {
        dupes.push(r.name);
        continue;
      }
      addPart({
        name: r.name, type: r.type,
        sequence: regionSeq, length: regionSeq.length,
        parentId: plasmid.id,
        derivation: { type: 'extract', from: plasmid.name },
        source: 'disassemble',
        organism: plasmid.organism,
      });
      added.push(r.name);
    }
    setMessage(`Добавлено: ${added.length} частей${dupes.length ? `. Дупликаты пропущены: ${dupes.join(', ')}` : ''}`);
  };

  // B10: sync presetMode — instant actions execute immediately, multi-step set step
  useEffect(() => {
    if (!presetMode) return;
    if (presetMode === 'view') { setViewerPart(plasmid); onClose(); return; }
    if (presetMode === 'use_whole') { handleUseWhole(); return; }
    if (presetMode === 'disassemble') { handleDisassemble(); return; }
    if (presetMode === 'mutate') {
      // V13: seed MutagenesisWizard with this plasmid so it opens pre-filled.
      useStore.getState().setMutagenesisInitialPlasmid(plasmid);
      setShowMutagenesis(true);
      onClose();
      return;
    }
    if (presetMode === 'versions') { useStore.getState().setVersionTreePartId(plasmid.id); onClose(); return; }
    if (step === 'menu') setStep(presetMode);
  }, [presetMode]);

  const handleExtract = (regionId) => {
    const r = regions.find(reg => reg.id === regionId);
    if (!r) return;
    const regionSeq = seq.slice(r.start, r.end);
    const dups = checkDuplicates(regionSeq, parts);
    if (dups.some(d => d.match === 'exact')) {
      setMessage(`${r.name} уже есть в библиотеке`);
      return;
    }
    addPart({
      name: r.name, type: r.type,
      sequence: regionSeq, length: regionSeq.length,
      parentId: plasmid.id,
      derivation: { type: 'extract', from: plasmid.name },
      source: 'extract',
      organism: plasmid.organism,
    });
    setMessage(`${r.name} добавлен в библиотеку`);
  };

  const toggleRegion = (id, ctrlKey) => {
    setSelectedRegionIds(prev => {
      if (ctrlKey) {
        return prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
      }
      return prev.includes(id) && prev.length === 1 ? [] : [id];
    });
  };

  // ── Render ──

  const renderMenu = () => (
    <div className="grid grid-cols-1 gap-1.5">
      {MODES.map(m => (
        <button key={m.id}
          onClick={() => {
            if (m.id === 'view') { setViewerPart(plasmid); onClose(); return; }
            if (m.id === 'use_whole') { handleUseWhole(); return; }
            if (m.id === 'disassemble') { handleDisassemble(); return; }
            if (m.id === 'mutate') {
              useStore.getState().setMutagenesisInitialPlasmid(plasmid);
              setShowMutagenesis(true); onClose(); return;
            }
            if (m.id === 'versions') { useStore.getState().setVersionTreePartId(plasmid.id); onClose(); return; }
            setStep(m.id);
          }}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-[var(--border-subtle)] hover:border-blue-300 hover:bg-blue-50 transition text-left">
          <span className="text-lg w-7 text-center">{m.icon}</span>
          <div>
            <div className="text-xs font-semibold text-[var(--text-primary)]">{m.label}</div>
            <div className="text-[10px] text-[var(--text-tertiary)]">{m.desc}</div>
          </div>
        </button>
      ))}
    </div>
  );

  const renderExtract = () => (
    <div>
      <div className="text-xs font-semibold text-[var(--text-secondary)] mb-2">Выберите регион для извлечения:</div>
      <div className="space-y-1">
        {regions.map(r => (
          <button key={r.id} onClick={() => handleExtract(r.id)}
            className="flex items-center gap-2 w-full px-3 py-2 rounded border hover:bg-blue-50 transition text-left">
            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: ANNOTATION_COLORS[r.type] || FEATURE_COLORS[r.type] || '#999' }} />
            <span className="text-xs font-medium flex-1">{r.name}</span>
            <span className="text-[10px] text-[var(--text-tertiary)]">{r.type} · {r.end - r.start} п.н.</span>
          </button>
        ))}
      </div>
    </div>
  );

  // Multi-region contiguity check (gap ≤ 50bp = contiguous)
  const selectionAnalysis = useMemo(() => {
    if (selectedRegionIds.length === 0) return null;
    const selected = regions
      .filter(r => selectedRegionIds.includes(r.id))
      .sort((a, b) => a.start - b.start);
    if (selected.length === 0) return null;

    // Group by contiguity
    const groups = [[ selected[0] ]];
    for (let i = 1; i < selected.length; i++) {
      const prev = groups[groups.length - 1];
      const gap = selected[i].start - prev[prev.length - 1].end;
      if (gap <= 50) {
        prev.push(selected[i]);
      } else {
        groups.push([ selected[i] ]);
      }
    }

    if (groups.length === 1) {
      const block = groups[0];
      return {
        type: 'contiguous',
        start: block[0].start,
        end: block[block.length - 1].end,
        totalLength: block[block.length - 1].end - block[0].start,
        names: block.map(r => r.name).join(' + '),
        regionCount: block.length,
      };
    }
    return {
      type: 'non_contiguous',
      groups: groups.map(g => ({
        names: g.map(r => r.name).join(' + '),
        start: g[0].start,
        end: g[g.length - 1].end,
      })),
    };
  }, [selectedRegionIds, regions]);

  const handleReplace = () => {
    if (!selectionAnalysis || selectionAnalysis.type !== 'contiguous') return;

    const cutStart = selectionAnalysis.start;
    const cutEnd = selectionAnalysis.end;
    const allAnns = plasmid.annotations || [];

    // Left flank: sequence before the deleted region
    const leftSeq = seq.slice(0, cutStart);
    const leftAnns = allAnns
      .filter(a => a.end <= cutStart)
      .map(a => ({ ...a }));

    // Right flank: sequence after the deleted region
    const rightSeq = seq.slice(cutEnd);
    const rightAnns = allAnns
      .filter(a => a.start >= cutEnd)
      .map(a => ({ ...a, start: a.start - cutEnd, end: a.end - cutEnd }));

    // Add two homology flanks on canvas
    useStore.getState().pushUndo?.();
    useStore.setState(state => {
      const asm = state.assemblies.find(a => a.id === state.activeId);
      if (!asm) return;
      const ts = Date.now();
      asm.fragments.push(
        {
          id: `f${ts}_left`, name: `${plasmid.name} left flank`,
          type: 'homology_arm', sequence: leftSeq, length: leftSeq.length,
          strand: 1, needsAmplification: true, partId: plasmid.id,
          annotations: leftAnns,
        },
        {
          id: `f${ts}_right`, name: `${plasmid.name} right flank`,
          type: 'homology_arm', sequence: rightSeq, length: rightSeq.length,
          strand: 1, needsAmplification: true, partId: plasmid.id,
          annotations: rightAnns,
        },
      );
      asm.calculated = false;
    });
    setMessage(`Два фланка гомологии созданы (${leftSeq.length} + ${rightSeq.length} п.н.). Добавьте вставку между ними.`);
  };

  const renderReplace = () => (
    <div>
      <div className="text-xs font-semibold text-[var(--text-secondary)] mb-1">Что заменить? (Ctrl+клик для нескольких)</div>
      <div className="space-y-1 mb-3">
        {regions.map(r => {
          const isSel = selectedRegionIds.includes(r.id);
          return (
            <button key={r.id} onClick={e => toggleRegion(r.id, e.ctrlKey || e.metaKey)}
              className={`flex items-center gap-2 w-full px-3 py-2 rounded border transition text-left
                ${isSel ? 'bg-blue-50 border-blue-400 ring-1 ring-blue-300' : 'hover:bg-[var(--surface-2)]'}`}>
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: ANNOTATION_COLORS[r.type] || '#999' }} />
              <span className="text-xs font-medium flex-1">{r.name}</span>
              {isSel && <span className="text-blue-600 text-xs">{'✓'}</span>}
              <span className="text-[10px] text-[var(--text-tertiary)]">{r.end - r.start} п.н.</span>
            </button>
          );
        })}
      </div>

      {/* Selection analysis */}
      {selectionAnalysis?.type === 'contiguous' && (
        <div className="p-2 bg-blue-50 rounded text-[11px] text-blue-700 mb-2">
          <div className="font-medium">Выбрано: {selectionAnalysis.names} ({selectionAnalysis.totalLength} п.н.)</div>
          <div className="text-[10px] text-blue-500 mt-0.5">Смежные регионы — можно заменить как один блок</div>
          <button onClick={() => { setCreating(true); handleReplace(); }} disabled={creating}
            className="mt-1.5 text-[10px] px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">
            {'🔄'} {creating ? 'Создано ✓' : 'Создать фланки гомологии (без выбранного блока)'}
          </button>
        </div>
      )}

      {selectionAnalysis?.type === 'non_contiguous' && (
        <div className="p-2 bg-amber-50 rounded text-[11px] text-amber-700 mb-2">
          <div className="font-medium">{'⚠️'} Выбранные регионы не смежные</div>
          <div className="text-[10px] text-amber-500 mt-0.5">
            {selectionAnalysis.groups.map((g, i) => (
              <div key={i}>Группа {i + 1}: {g.names}</div>
            ))}
          </div>
          <div className="text-[10px] text-amber-500 mt-1">Нужно несколько отдельных замен</div>
        </div>
      )}

      {selectedRegionIds.length === 0 && (
        <div className="text-[10px] text-[var(--text-tertiary)]">{'💡'} Кликните на регион для выбора. Ctrl+клик для множественного.</div>
      )}
    </div>
  );

  const renderDelete = () => (
    <div>
      <div className="text-xs font-semibold text-[var(--text-secondary)] mb-2">Какой регион удалить?</div>
      <div className="space-y-1">
        {regions.map(r => (
          <button key={r.id} onClick={() => {
            const newId = deleteElement(plasmid.id, r.id);
            if (newId) {
              setMessage(`${plasmid.name}\u0394${r.name} создан в библиотеке (inverse PCR + KLD)`);
            } else {
              setMessage(`Ошибка при делеции ${r.name}`);
            }
          }}
            className="flex items-center gap-2 w-full px-3 py-2 rounded border hover:bg-red-50 transition text-left">
            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: ANNOTATION_COLORS[r.type] || '#999' }} />
            <span className="text-xs font-medium flex-1">{r.name}</span>
            <span className="text-[10px] text-[var(--text-tertiary)]">{r.end - r.start} п.н.</span>
            <span className="text-red-400 text-xs">{'🗑'}</span>
          </button>
        ))}
      </div>
    </div>
  );

  // ── Restriction cloning state ──
  const [rcStep, setRcStep] = useState(1); // 1=enzymes, 2=insert, 3=preview
  const [rcEnzymes, setRcEnzymes] = useState([]);  // [enzyme1] or [enzyme1, enzyme2]
  const [rcInsertMode, setRcInsertMode] = useState('library'); // 'library' | 'paste' | 'later'
  const [rcInsertPartId, setRcInsertPartId] = useState('');
  const [rcInsertSeq, setRcInsertSeq] = useState('');
  const [rcInsertName, setRcInsertName] = useState('');

  // Unique-cutter sites for restriction cloning
  const uniqueSites = useMemo(() => {
    if (!seq) return [];
    return scanAllSites(seq, { circular: true, minSiteLen: 6 })
      .filter(s => s.isUnique)
      .sort((a, b) => {
        // CutSmart first, then alphabetical
        const aCS = a.buffer === 'CutSmart' ? 0 : 1;
        const bCS = b.buffer === 'CutSmart' ? 0 : 1;
        return aCS - bCS || a.enzyme.localeCompare(b.enzyme);
      });
  }, [seq]);

  const rcDigestResult = useMemo(() => {
    if (rcEnzymes.length === 0) return null;
    if (rcEnzymes.length === 1) return digest(seq, plasmid.annotations || [], rcEnzymes[0]);
    return digest(seq, plasmid.annotations || [], rcEnzymes[0], rcEnzymes[1]);
  }, [rcEnzymes, seq, plasmid.annotations]);

  const rcDoubleCheck = useMemo(() => {
    if (rcEnzymes.length !== 2) return null;
    return checkDoubleDigest(rcEnzymes[0], rcEnzymes[1]);
  }, [rcEnzymes]);

  const rcInsertWarnings = useMemo(() => {
    const insertSeq = rcInsertMode === 'paste' ? rcInsertSeq :
      rcInsertMode === 'library' ? (parts.find(p => p.id === rcInsertPartId)?.sequence || '') : '';
    if (!insertSeq || rcEnzymes.length === 0) return [];
    return checkInsertSites(insertSeq, rcEnzymes[0], rcEnzymes[1] || null);
  }, [rcInsertMode, rcInsertSeq, rcInsertPartId, rcEnzymes, parts]);

  const handleRcCreate = () => {
    if (!rcDigestResult || rcDigestResult.error) return;

    const insertPart = rcInsertMode === 'library' ? parts.find(p => p.id === rcInsertPartId) : null;
    const insertSeq = rcInsertMode === 'paste' ? sanitizeSequence(rcInsertSeq) :
      rcInsertMode === 'library' ? (insertPart?.sequence || '') : '';
    const insertName = rcInsertMode === 'library' ? (insertPart?.name || 'Insert') :
      rcInsertMode === 'paste' ? (rcInsertName || 'Insert') : 'Insert (TBD)';

    const bb = rcDigestResult.backbone;

    useStore.getState().pushUndo?.();
    useStore.setState(state => {
      const asm = state.assemblies.find(a => a.id === state.activeId);
      if (!asm) return;
      const ts = Date.now();

      // Clear existing fragments for a fresh cloning setup
      asm.fragments = [
        {
          id: `f${ts}_bb`, name: `${plasmid.name} backbone`,
          type: 'backbone', sequence: bb.sequence, length: bb.length,
          strand: 1, needsAmplification: false, partId: plasmid.id,
          annotations: bb.annotations,
        },
        {
          id: `f${ts}_ins`, name: insertName,
          type: insertPart?.type || 'CDS', sequence: insertSeq,
          length: insertSeq.length, strand: 1,
          needsAmplification: insertSeq.length > 0,
          partId: insertPart?.id || null,
          annotations: insertPart?.annotations || [],
        },
      ];

      // Two ligation junctions
      asm.junctions = [
        {
          type: 'ligation', enzyme: rcEnzymes[0],
          overhang: bb.leftEnd.overhang, overhangType: bb.leftEnd.overhangType,
          compatible: true, siteDestroyed: false,
        },
        {
          type: 'ligation',
          enzyme: rcEnzymes.length > 1 ? rcEnzymes[1] : rcEnzymes[0],
          overhang: bb.rightEnd.overhang, overhangType: bb.rightEnd.overhangType,
          compatible: true,
          siteDestroyed: rcEnzymes.length > 1 && bb.leftEnd.overhang === bb.rightEnd.overhang &&
            rcEnzymes[0] !== rcEnzymes[1],
        },
      ];

      asm.circular = true;
      asm.calculated = false;
    });
    onClose();
  };

  const [insertPos, setInsertPos] = useState(null);
  const [insertPartId, setInsertPartId] = useState('');

  const handleInsert = () => {
    if (insertPos == null || !insertPartId) return;
    const newId = insertElement(plasmid.id, insertPartId, insertPos);
    if (newId) {
      const insert = parts.find(p => p.id === insertPartId);
      setMessage(`${insert?.name || 'элемент'} вставлен в позицию ${insertPos}. Новая плазмида в библиотеке.`);
      setInsertPos(null);
      setInsertPartId('');
    }
  };

  const renderInsert = () => (
    <div>
      <div className="text-xs font-semibold text-[var(--text-secondary)] mb-2">Вставить между:</div>
      <div className="space-y-1 mb-3">
        {regions.map((r, i) => {
          const next = regions[(i + 1) % regions.length];
          const pos = r.end;
          return (
            <button key={r.id} onClick={() => setInsertPos(pos)}
              className={`flex items-center gap-2 w-full px-3 py-2 rounded border transition text-left text-xs
                ${insertPos === pos ? 'bg-green-50 border-green-400 ring-1 ring-green-300' : 'hover:bg-green-50'}`}>
              <span>{r.name}</span>
              <span className="text-[var(--text-tertiary)]">{'↔'}</span>
              <span>{next.name}</span>
              <span className="text-[10px] text-[var(--text-tertiary)] ml-auto">поз. {pos}</span>
              {insertPos === pos && <span className="text-green-600">{'✓'}</span>}
            </button>
          );
        })}
      </div>
      {insertPos != null && (
        <div className="p-2 bg-green-50 rounded border border-green-200 space-y-2">
          <div className="text-[11px] text-green-700 font-medium">Позиция вставки: {insertPos}</div>
          <select value={insertPartId} onChange={e => setInsertPartId(e.target.value)}
            className="w-full text-xs border rounded p-1.5">
            <option value="">Выберите элемент из библиотеки...</option>
            {parts.filter(p => p.id !== plasmid.id && p.sequence).map(p => (
              <option key={p.id} value={p.id}>{p.name} ({p.length || (p.sequence || '').length} п.н.)</option>
            ))}
          </select>
          {insertPartId && (
            <button onClick={handleInsert}
              className="text-[10px] px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700">
              {'➕'} Вставить
            </button>
          )}
        </div>
      )}
    </div>
  );

  const renderRestrictionCloning = () => (
    <div>
      {/* Step indicators */}
      <div className="flex items-center gap-2 mb-3">
        {[1, 2, 3].map(s => (
          <div key={s} className={`flex items-center gap-1 text-[10px] ${rcStep === s ? 'text-red-600 font-bold' : rcStep > s ? 'text-green-600' : 'text-[var(--text-tertiary)]'}`}>
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] border ${
              rcStep === s ? 'bg-red-50 border-red-300' : rcStep > s ? 'bg-green-50 border-green-300' : 'border-[var(--border-subtle)]'}`}>
              {rcStep > s ? '✓' : s}
            </span>
            <span>{s === 1 ? 'Ферменты' : s === 2 ? 'Insert' : 'Создать'}</span>
          </div>
        ))}
      </div>

      {/* Step 1: enzyme selection */}
      {rcStep === 1 && (
        <div>
          <div className="text-xs font-semibold text-[var(--text-secondary)] mb-1">Выберите 1 или 2 уникальных рестриктазы:</div>
          <div className="text-[9px] text-[var(--text-tertiary)] mb-2">1 фермент = linearize, 2 фермента = excise (directional cloning)</div>

          <div className="max-h-48 overflow-y-auto border rounded mb-2">
            {uniqueSites.map(s => {
              const isSelected = rcEnzymes.includes(s.enzyme);
              return (
                <div key={s.enzyme}
                  className={`flex items-center gap-1.5 px-2 py-1.5 text-[10px] cursor-pointer hover:bg-red-50 transition
                    ${isSelected ? 'bg-red-50 font-semibold' : ''}`}
                  onClick={() => {
                    setRcEnzymes(prev => {
                      if (prev.includes(s.enzyme)) return prev.filter(e => e !== s.enzyme);
                      if (prev.length >= 2) return [prev[1], s.enzyme];
                      return [...prev, s.enzyme];
                    });
                  }}>
                  <span className={`w-4 h-4 rounded border flex items-center justify-center text-[8px] ${
                    isSelected ? 'bg-red-500 text-white border-red-500' : 'border-[var(--border-default)]'}`}>
                    {isSelected ? '✓' : ''}
                  </span>
                  <span className="font-medium w-14">{s.enzyme}</span>
                  <span className="font-mono text-[9px] text-[var(--text-tertiary)] w-20">{s.site}</span>
                  <span className={`text-[8px] w-10 ${s.end === '5prime' ? 'text-blue-600' : s.end === '3prime' ? 'text-orange-600' : 'text-[var(--text-tertiary)]'}`}>
                    {s.end === '5prime' ? "5' oh" : s.end === '3prime' ? "3' oh" : 'blunt'}
                  </span>
                  <span className="text-[8px] text-[var(--text-tertiary)]">{s.buffer}</span>
                  <span className="text-[8px] text-[var(--text-tertiary)] ml-auto">поз. {s.positions[0]?.position}</span>
                </div>
              );
            })}
            {uniqueSites.length === 0 && (
              <div className="p-3 text-center text-[10px] text-[var(--text-tertiary)]">Нет уникальных сайтов рестрикции</div>
            )}
          </div>

          {/* Digest preview */}
          {rcDigestResult && !rcDigestResult.error && (
            <div className="bg-[var(--surface-2)] rounded p-2 mb-2 text-[10px]">
              <div className="font-medium text-[var(--text-secondary)]">
                {rcDigestResult.type === 'linearize' ? 'Линеаризация' : 'Excision'}: backbone {rcDigestResult.backbone.length} п.н.
                {rcDigestResult.excised && `, excised ${rcDigestResult.excised.length} п.н.`}
              </div>
              {rcDigestResult.isDirectional && <div className="text-green-600 mt-0.5">✓ Направленное клонирование</div>}
              {rcDigestResult.selfLigationRisk && <div className="text-amber-600 mt-0.5">⚠ Риск самолигирования</div>}
            </div>
          )}
          {rcDigestResult?.error && (
            <div className="bg-red-50 rounded p-2 mb-2 text-[10px] text-red-700">{rcDigestResult.error}</div>
          )}

          {/* Double digest check */}
          {rcDoubleCheck && rcDoubleCheck.warnings.length > 0 && (
            <div className="bg-amber-50 rounded p-2 mb-2 text-[10px]">
              {rcDoubleCheck.warnings.map((w, i) => <div key={i} className="text-amber-700">{w}</div>)}
            </div>
          )}

          <button onClick={() => setRcStep(2)}
            disabled={rcEnzymes.length === 0 || rcDigestResult?.error}
            className="text-[10px] px-3 py-1.5 bg-red-600 text-white rounded hover:bg-red-700 disabled:bg-[var(--surface-3)] disabled:cursor-not-allowed">
            Далее →
          </button>
        </div>
      )}

      {/* Step 2: insert selection */}
      {rcStep === 2 && (
        <div>
          <div className="text-xs font-semibold text-[var(--text-secondary)] mb-2">Откуда insert?</div>
          <div className="flex gap-1 mb-3">
            {[
              { val: 'library', label: 'Из библиотеки' },
              { val: 'paste', label: 'Вставить seq' },
              { val: 'later', label: 'Потом' },
            ].map(m => (
              <button key={m.val} onClick={() => setRcInsertMode(m.val)}
                className={`flex-1 text-[10px] py-1.5 rounded border transition ${
                  rcInsertMode === m.val ? 'bg-red-50 border-red-300 text-red-700 font-bold' : 'border-[var(--border-subtle)] text-[var(--text-tertiary)] hover:bg-[var(--surface-2)]'}`}>
                {m.label}
              </button>
            ))}
          </div>

          {rcInsertMode === 'library' && (
            <select value={rcInsertPartId} onChange={e => setRcInsertPartId(e.target.value)}
              className="w-full text-xs border rounded p-1.5 mb-2">
              <option value="">Выберите элемент...</option>
              {parts.filter(p => p.id !== plasmid.id && p.sequence).map(p => (
                <option key={p.id} value={p.id}>{p.name} ({(p.sequence || '').length} п.н.) — {p.type}</option>
              ))}
            </select>
          )}

          {rcInsertMode === 'paste' && (
            <div className="space-y-1.5 mb-2">
              <input type="text" value={rcInsertName} onChange={e => setRcInsertName(e.target.value)}
                className="w-full text-xs border rounded p-1.5" placeholder="Имя insert..." />
              <textarea value={rcInsertSeq} onChange={e => setRcInsertSeq(sanitizeSequence(e.target.value))}
                className="w-full text-xs border rounded p-1.5 font-mono h-20" placeholder="ATGCCC..." />
            </div>
          )}

          {rcInsertMode === 'later' && (
            <div className="text-[10px] text-[var(--text-tertiary)] mb-2">Placeholder-фрагмент будет создан. Замените позже.</div>
          )}

          {/* Insert site warnings */}
          {rcInsertWarnings.length > 0 && (
            <div className="bg-red-50 rounded p-2 mb-2">
              {rcInsertWarnings.map((w, i) => (
                <div key={i} className="text-[10px] text-red-700">
                  ⚠ {w.message}
                  {w.alternatives.length > 0 && <span className="text-[var(--text-tertiary)]"> Альтернативы: {w.alternatives.join(', ')}</span>}
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <button onClick={() => setRcStep(1)} className="text-[10px] px-3 py-1.5 border rounded hover:bg-[var(--surface-2)]">← Назад</button>
            <button onClick={() => setRcStep(3)}
              disabled={rcInsertMode === 'library' && !rcInsertPartId}
              className="text-[10px] px-3 py-1.5 bg-red-600 text-white rounded hover:bg-red-700 disabled:bg-[var(--surface-3)] disabled:cursor-not-allowed">
              Далее →
            </button>
          </div>
        </div>
      )}

      {/* Step 3: preview + confirm */}
      {rcStep === 3 && rcDigestResult && !rcDigestResult.error && (() => {
        const insertPart = rcInsertMode === 'library' ? parts.find(p => p.id === rcInsertPartId) : null;
        const insertSeq = rcInsertMode === 'paste' ? rcInsertSeq : (insertPart?.sequence || '');
        const insertName = rcInsertMode === 'library' ? (insertPart?.name || 'Insert') :
          rcInsertMode === 'paste' ? (rcInsertName || 'Insert') : 'Insert (TBD)';
        const bb = rcDigestResult.backbone;

        // Reading frame check for CDS inserts
        const isCDS = insertPart?.type === 'CDS' || insertPart?.type === 'gene';
        const frameChecks = rcEnzymes.map(e => ({ enzyme: e, ...checkReadingFrame(e) }));

        return (
          <div>
            <div className="text-xs font-semibold text-[var(--text-secondary)] mb-2">Preview</div>
            <div className="bg-[var(--surface-2)] rounded-lg p-3 space-y-2 mb-3 text-[10px]">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-[var(--text-secondary)]">Backbone:</span>
                <span>{plasmid.name} — {bb.length} п.н.</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-[var(--text-secondary)]">Insert:</span>
                <span>{insertName} — {insertSeq.length || '?'} п.н.</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-[var(--text-secondary)]">Ферменты:</span>
                <span>{rcEnzymes.join(' + ')}</span>
                {rcDigestResult.isDirectional && <span className="text-green-600 font-medium">✓ направленное</span>}
              </div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-[var(--text-secondary)]">Junctions:</span>
                <span>
                  {rcEnzymes[0]} ({bb.leftEnd.overhangType}, {bb.leftEnd.overhang || 'blunt'})
                  {rcEnzymes[1] && ` + ${rcEnzymes[1]} (${bb.rightEnd.overhangType}, ${bb.rightEnd.overhang || 'blunt'})`}
                </span>
              </div>
            </div>

            {/* Reading frame warnings for CDS */}
            {isCDS && frameChecks.some(f => !f.inFrame) && (
              <div className="bg-amber-50 rounded p-2 mb-2 text-[10px]">
                {frameChecks.filter(f => !f.inFrame).map((f, i) => (
                  <div key={i} className="text-amber-700">⚠ {f.enzyme}: добавляет {f.addedBases} п.н. — не в рамке считывания</div>
                ))}
              </div>
            )}
            {isCDS && frameChecks.some(f => f.containsATG) && (
              <div className="bg-blue-50 rounded p-2 mb-2 text-[10px]">
                {frameChecks.filter(f => f.containsATG).map((f, i) => (
                  <div key={i} className="text-blue-700">💡 {f.enzyme} ({f.tip})</div>
                ))}
              </div>
            )}

            {/* B8: Junction sequence preview */}
            {insertSeq && (() => {
              const leftRE = rcEnzymes[0];
              const rightRE = rcEnzymes[1] || rcEnzymes[0];
              const leftOH = bb.leftEnd.overhang || '';
              const rightOH = bb.rightEnd.overhang || '';
              const bbSeqLeft = bb.sequence ? bb.sequence.slice(0, 12) : '';
              const bbSeqRight = bb.sequence ? bb.sequence.slice(-12) : '';
              const insLeft = insertSeq.slice(0, 12);
              const insRight = insertSeq.slice(-12);
              const totalAdded5 = leftOH.length;
              const totalAdded3 = rightOH.length;
              const inFrame5 = totalAdded5 % 3 === 0;
              const inFrame3 = totalAdded3 % 3 === 0;
              return (
                <div className="bg-[var(--surface-2)] rounded-lg p-3 mb-3 font-mono text-[10px] leading-5 space-y-2">
                  <div className="text-[9px] text-[var(--text-tertiary)] font-sans font-semibold mb-1">Junction preview</div>
                  <div>
                    <span className="text-[9px] text-[var(--text-tertiary)] font-sans">5' ({leftRE}):</span>
                    <div>
                      <span className="text-[var(--text-tertiary)]">...{bbSeqRight}</span>
                      <span className="bg-red-100 text-red-700 px-0.5 rounded">{leftOH || 'blunt'}</span>
                      <span className="text-blue-600">{insLeft}...</span>
                    </div>
                  </div>
                  <div>
                    <span className="text-[9px] text-[var(--text-tertiary)] font-sans">3' ({rightRE}):</span>
                    <div>
                      <span className="text-blue-600">...{insRight}</span>
                      <span className="bg-red-100 text-red-700 px-0.5 rounded">{rightOH || 'blunt'}</span>
                      <span className="text-[var(--text-tertiary)]">{bbSeqLeft}...</span>
                    </div>
                  </div>
                  <div className="text-[9px] font-sans">
                    {inFrame5 && inFrame3
                      ? <span className="text-green-600">✓ Оба стыка в рамке считывания</span>
                      : <span className="text-amber-600">⚠ Проверьте рамку: 5' +{totalAdded5} п.н., 3' +{totalAdded3} п.н.</span>}
                  </div>
                </div>
              );
            })()}

            <div className="text-[9px] text-[var(--text-tertiary)] mb-3">
              На canvas будут созданы 2 фрагмента (backbone + insert) и 2 ligation junction.
              Primer design автоматически добавит RE-тейлы к праймерам insert.
            </div>

            <div className="flex gap-2">
              <button onClick={() => setRcStep(2)} className="text-[10px] px-3 py-1.5 border rounded hover:bg-[var(--surface-2)]">← Назад</button>
              <button onClick={() => { setCreating(true); handleRcCreate(); }} disabled={creating}
                className="text-[10px] px-4 py-1.5 bg-red-600 text-white rounded hover:bg-red-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed">
                🔪 {creating ? 'Создано ✓' : 'Создать на canvas'}
              </button>
            </div>
          </div>
        );
      })()}
    </div>
  );

  const renderVersions = () => (
    <div className="text-center py-6">
      <div className="text-[var(--text-tertiary)] text-sm mb-2">{'🌳'} Дерево версий загружается...</div>
    </div>
  );

  const stepContent = {
    menu: renderMenu,
    extract: renderExtract,
    replace: renderReplace,
    restriction_cloning: renderRestrictionCloning,
    delete: renderDelete,
    insert: renderInsert,
    versions: renderVersions,
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-6 bg-[color-mix(in_srgb,var(--text-primary)_40%,transparent)]" onClick={onClose}>
      <div className="w-[800px] max-h-[85vh] bg-[var(--surface-1)] rounded-xl shadow-2xl border overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b shrink-0">
          <div className="flex items-center gap-2">
            {step !== 'menu' && (
              <button onClick={() => { setStep('menu'); setMessage(null); setSelectedRegionIds([]); }}
                className="text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] text-sm mr-1">{'←'}</button>
            )}
            <h3 className="text-sm font-bold text-[var(--text-secondary)]">
              {step === 'menu' ? `Что сделать с «${plasmid.name}»?` : MODES.find(m => m.id === step)?.label || step}
            </h3>
            <span className="text-[10px] text-[var(--text-tertiary)]">
              {totalBp.toLocaleString()} п.н., circular, {regions.length} регионов
            </span>
          </div>
          <button onClick={onClose} className="text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] text-lg">{'✕'}</button>
        </div>

        {/* Main */}
        <div className="flex flex-1 overflow-hidden min-h-0">
          {/* Left: circular map */}
          <div className="w-[320px] shrink-0 p-3 flex items-center justify-center border-r bg-[var(--surface-2)]">
            <PlasmidMap
              fragments={mapFragments}
              constructName={plasmid.name}
              totalBp={totalBp}
            />
          </div>

          {/* Right: action panel */}
          <div className="flex-1 overflow-y-auto p-4">
            {(stepContent[step] || renderMenu)()}

            {/* Message banner */}
            {message && (
              <div className="mt-3 p-2 bg-green-50 border border-green-200 rounded text-[11px] text-green-700">
                {message}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-5 py-3 border-t shrink-0 bg-[var(--surface-2)]">
          <button onClick={onClose}
            className="text-xs px-4 py-1.5 border rounded hover:bg-[var(--surface-3)]">
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
}
