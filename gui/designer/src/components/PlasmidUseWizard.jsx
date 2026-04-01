/**
 * PlasmidUseWizard — modal wizard for plasmid operations.
 *
 * Triggered when addFragment detects a circular Part with ≥2 regions.
 * 9 modes: view, use whole, replace, disassemble, extract, mutate, insert, delete, versions.
 */
import { useState, useMemo } from 'react';
import PlasmidMap from './PlasmidMap';
import { getRegions, getDetails } from '../annotation-model';
import { ANNOTATION_COLORS } from '../auto-annotate';
import { FEATURE_COLORS } from '../theme';
import { useStore } from '../store';
import { checkDuplicates } from '../duplicate-checker';

const MODES = [
  { id: 'view',        icon: '\uD83D\uDC41',  label: 'Посмотреть',            desc: 'только просмотр' },
  { id: 'use_whole',   icon: '\uD83D\uDCE6',  label: 'Использовать целиком',  desc: 'как backbone/вектор' },
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
export default function PlasmidUseWizard({ plasmid, onClose }) {
  const [step, setStep] = useState('menu'); // 'menu' | mode id | sub-steps
  const [selectedRegionIds, setSelectedRegionIds] = useState([]);
  const [message, setMessage] = useState(null);

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

  // Build fragments for PlasmidMap
  const mapFragments = useMemo(() =>
    regions.map(r => ({
      id: r.id, name: r.name, type: r.type,
      sequence: seq.slice(r.start, r.end),
      length: r.end - r.start, strand: r.strand || 1,
      annotations: (plasmid.annotations || []).filter(a =>
        a.regionId === r.id || (a.level === 'region' && a.id === r.id)
      ),
    })),
  [regions, plasmid.annotations, seq]);

  // ── Mode handlers ──

  const handleUseWhole = () => {
    // Bypass plasmid detection by adding directly via store set
    useStore.getState().pushUndo?.();
    useStore.setState(state => {
      const asm = state.assemblies.find(a => a.id === state.activeId);
      if (!asm) return;
      asm.fragments.push({
        id: `f${Date.now()}`, name: plasmid.name, type: plasmid.type || 'fusion',
        sequence: seq, length: totalBp, strand: 1,
        needsAmplification: false, partId: plasmid.id,
        annotations: plasmid.annotations,
      });
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
            if (m.id === 'mutate') { setShowMutagenesis(true); onClose(); return; }
            if (m.id === 'versions') { useStore.getState().setVersionTreePartId(plasmid.id); onClose(); return; }
            setStep(m.id);
          }}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-gray-100 hover:border-blue-300 hover:bg-blue-50 transition text-left">
          <span className="text-lg w-7 text-center">{m.icon}</span>
          <div>
            <div className="text-xs font-semibold text-gray-800">{m.label}</div>
            <div className="text-[10px] text-gray-400">{m.desc}</div>
          </div>
        </button>
      ))}
    </div>
  );

  const renderExtract = () => (
    <div>
      <div className="text-xs font-semibold text-gray-600 mb-2">Выберите регион для извлечения:</div>
      <div className="space-y-1">
        {regions.map(r => (
          <button key={r.id} onClick={() => handleExtract(r.id)}
            className="flex items-center gap-2 w-full px-3 py-2 rounded border hover:bg-blue-50 transition text-left">
            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: ANNOTATION_COLORS[r.type] || FEATURE_COLORS[r.type] || '#999' }} />
            <span className="text-xs font-medium flex-1">{r.name}</span>
            <span className="text-[10px] text-gray-400">{r.type} · {r.end - r.start} п.н.</span>
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
      <div className="text-xs font-semibold text-gray-600 mb-1">Что заменить? (Ctrl+клик для нескольких)</div>
      <div className="space-y-1 mb-3">
        {regions.map(r => {
          const isSel = selectedRegionIds.includes(r.id);
          return (
            <button key={r.id} onClick={e => toggleRegion(r.id, e.ctrlKey || e.metaKey)}
              className={`flex items-center gap-2 w-full px-3 py-2 rounded border transition text-left
                ${isSel ? 'bg-blue-50 border-blue-400 ring-1 ring-blue-300' : 'hover:bg-gray-50'}`}>
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: ANNOTATION_COLORS[r.type] || '#999' }} />
              <span className="text-xs font-medium flex-1">{r.name}</span>
              {isSel && <span className="text-blue-600 text-xs">{'✓'}</span>}
              <span className="text-[10px] text-gray-400">{r.end - r.start} п.н.</span>
            </button>
          );
        })}
      </div>

      {/* Selection analysis */}
      {selectionAnalysis?.type === 'contiguous' && (
        <div className="p-2 bg-blue-50 rounded text-[11px] text-blue-700 mb-2">
          <div className="font-medium">Выбрано: {selectionAnalysis.names} ({selectionAnalysis.totalLength} п.н.)</div>
          <div className="text-[10px] text-blue-500 mt-0.5">Смежные регионы — можно заменить как один блок</div>
          <button onClick={handleReplace}
            className="mt-1.5 text-[10px] px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700">
            {'🔄'} Создать фланки гомологии (без выбранного блока)
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
        <div className="text-[10px] text-gray-400">{'💡'} Кликните на регион для выбора. Ctrl+клик для множественного.</div>
      )}
    </div>
  );

  const renderDelete = () => (
    <div>
      <div className="text-xs font-semibold text-gray-600 mb-2">Какой регион удалить?</div>
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
            <span className="text-[10px] text-gray-400">{r.end - r.start} п.н.</span>
            <span className="text-red-400 text-xs">{'🗑'}</span>
          </button>
        ))}
      </div>
    </div>
  );

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
      <div className="text-xs font-semibold text-gray-600 mb-2">Вставить между:</div>
      <div className="space-y-1 mb-3">
        {regions.map((r, i) => {
          const next = regions[(i + 1) % regions.length];
          const pos = r.end;
          return (
            <button key={r.id} onClick={() => setInsertPos(pos)}
              className={`flex items-center gap-2 w-full px-3 py-2 rounded border transition text-left text-xs
                ${insertPos === pos ? 'bg-green-50 border-green-400 ring-1 ring-green-300' : 'hover:bg-green-50'}`}>
              <span>{r.name}</span>
              <span className="text-gray-300">{'↔'}</span>
              <span>{next.name}</span>
              <span className="text-[10px] text-gray-400 ml-auto">поз. {pos}</span>
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

  const renderVersions = () => (
    <div className="text-center py-6">
      <div className="text-gray-400 text-sm mb-2">{'🌳'} Дерево версий загружается...</div>
    </div>
  );

  const stepContent = {
    menu: renderMenu,
    extract: renderExtract,
    replace: renderReplace,
    delete: renderDelete,
    insert: renderInsert,
    versions: renderVersions,
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-6 bg-black/40" onClick={onClose}>
      <div className="w-[800px] max-h-[85vh] bg-white rounded-xl shadow-2xl border overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b shrink-0">
          <div className="flex items-center gap-2">
            {step !== 'menu' && (
              <button onClick={() => { setStep('menu'); setMessage(null); setSelectedRegionIds([]); }}
                className="text-gray-400 hover:text-gray-600 text-sm mr-1">{'←'}</button>
            )}
            <h3 className="text-sm font-bold text-gray-700">
              {step === 'menu' ? `Что сделать с «${plasmid.name}»?` : MODES.find(m => m.id === step)?.label || step}
            </h3>
            <span className="text-[10px] text-gray-400">
              {totalBp.toLocaleString()} п.н., circular, {regions.length} регионов
            </span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg">{'✕'}</button>
        </div>

        {/* Main */}
        <div className="flex flex-1 overflow-hidden min-h-0">
          {/* Left: circular map */}
          <div className="w-[320px] shrink-0 p-3 flex items-center justify-center border-r bg-gray-50">
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
        <div className="flex items-center justify-end px-5 py-3 border-t shrink-0 bg-gray-50">
          <button onClick={onClose}
            className="text-xs px-4 py-1.5 border rounded hover:bg-gray-100">
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
}
