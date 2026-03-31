import { useState } from 'react';
import { useDrag, useDrop } from 'react-dnd';
import { getFragColor, isMarker, FEATURE_COLORS } from '../theme';
import { getPartDescription } from '../part-descriptions';
import { SBOLIcon } from '../sbol-glyphs';
import { useStore } from '../store';
import { getRegions, getDetails } from '../annotation-model';
import { ANNOTATION_COLORS } from '../auto-annotate';
import ContextMenu from './ContextMenu';

function fragmentWidth(bp, fragCount = 1) {
  const scale = fragCount <= 4 ? 1 : fragCount <= 10 ? Math.max(0.45, 1 - (fragCount - 4) * 0.1) : Math.max(0.2, 0.45 - (fragCount - 10) * 0.015);
  const minW = Math.round(Math.max(50, 70 * scale)), maxW = Math.round(Math.max(70, 280 * scale));
  if (!bp || bp <= 20) return minW;
  if (bp >= 10000) return maxW;
  const frac = (Math.log(bp) - Math.log(20)) / (Math.log(10000) - Math.log(20));
  return Math.round(minW + frac * (maxW - minW));
}
const isCompact = (fc) => fc > 12;

function fmtSize(bp) {
  return bp ? `${bp} п.н.` : '0 п.н.';
}

function primerLabel(name) {
  return (name || '').match(/^[A-Za-z]+\d+/)?.[0] || (name || '').slice(0, 8);
}

export default function PartBlock({
  fragment, index, onRemove, onToggleAmplification, onReorder, onFlip,
  pcrSize, onSplitSignal, onEditFragment, fragmentCount,
  fwdPrimer, revPrimer, circularHint,
  variants, onSwapVariant,
  compact,
}) {
  // ═══ Store selector (granular) ═══
  const expertMode = useStore(s => s.expertMode);
  const highlightedPartId = useStore(s => s.highlightedPartId);
  const setHighlightedPartId = useStore(s => s.setHighlightedPartId);
  const selectedFragIndices = useStore(s => s.selectedFragIndices);
  const toggleFragSelection = useStore(s => s.toggleFragSelection);
  const clearFragSelection = useStore(s => s.clearFragSelection);
  const isHighlighted = fragment.partId && fragment.partId === highlightedPartId;
  const isSelected = selectedFragIndices.includes(index);
  const [showVariants, setShowVariants] = useState(false);
  const [ctxMenu, setCtxMenu] = useState(null);
  const variantCount = variants?.length || 0;
  const [{ isDragging }, drag] = useDrag({
    type: 'CANVAS_PART', item: { index },
    collect: m => ({ isDragging: m.isDragging() }),
  });
  const [{ isOver }, drop] = useDrop({
    accept: 'CANVAS_PART',
    drop: (item) => { if (item.index !== index && onReorder) onReorder(item.index, index); },
    collect: m => ({ isOver: m.isOver() }),
  });
  const ref = (el) => { drag(drop(el)); };
  const color = fragment.customColor || (isMarker(fragment.name) ? '#F0E442' : getFragColor(fragment.type, index));
  const hasPrimers = !!(fwdPrimer || revPrimer);

  return (
    <div ref={ref} className={`relative group cursor-grab transition-transform ${isOver ? 'scale-105' : ''}`}
      style={{ opacity: isDragging ? 0.3 : 1, zIndex: 1,
        outline: isSelected ? '3px solid #3b82f6' : undefined,
        outlineOffset: isSelected ? 2 : undefined,
        boxShadow: isSelected ? '0 0 0 5px rgba(59,130,246,0.15)' :
          (isHighlighted ? '0 0 0 2px #3b82f6, 0 0 8px rgba(59,130,246,0.3)' : undefined),
        borderRadius: (isSelected || isHighlighted) ? 8 : undefined,
      }}
      onClick={(e) => {
        e.stopPropagation();
        if (e.ctrlKey || e.metaKey) {
          toggleFragSelection(index);
        } else if (e.shiftKey && selectedFragIndices.length > 0) {
          const last = selectedFragIndices[selectedFragIndices.length - 1];
          useStore.getState().selectFragRange(Math.min(last, index), Math.max(last, index));
        } else {
          clearFragSelection();
          toggleFragSelection(index);
        }
        setHighlightedPartId(fragment.partId || null);
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        if (fragment.subFragments?.length > 0) {
          const store = useStore.getState();
          const active = store.getActive();
          if (!active) return;
          const expanded = [];
          let off = 0;
          for (const sub of fragment.subFragments) {
            expanded.push({
              id: `f${Date.now()}_${Math.random().toString(36).slice(2,5)}`,
              name: sub.name, type: sub.type,
              sequence: (fragment.sequence || '').slice(off, off + sub.length),
              length: sub.length, strand: 1, needsAmplification: true,
            });
            off += sub.length;
          }
          const newFragments = [...active.fragments];
          newFragments.splice(index, 1, ...expanded);
          const asmType = active.assemblyType || 'overlap';
          const isCirc = active.circular || false;
          const jCount = isCirc ? newFragments.length : Math.max(0, newFragments.length - 1);
          const newJuncs = Array.from({ length: jCount }, () => ({
            type: asmType === 'golden_gate' ? 'golden_gate' : 'overlap',
            overlapMode: 'split', overlapLength: 30, tmTarget: 62, calcMode: 'length',
          }));
          store.pushUndo();
          store.updateActive({ fragments: newFragments, junctions: newJuncs, calculated: false });
        } else {
          onEditFragment?.(index);
        }
      }}
      onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setCtxMenu({ x: e.clientX, y: e.clientY }); }}>
      {isOver && <div className="absolute -left-1 top-0 bottom-0 w-0.5 bg-blue-500 rounded" />}

      {/* ═══ COMPACT MODE (racetrack) ═══ */}
      {compact ? (
        <>
          <div className="rounded-md border-[1.5px] px-2 flex items-center gap-1"
            style={{
              height: 42,
              background: `${color}18`,
              borderColor: color,
              transition: 'box-shadow 150ms ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.boxShadow = `0 2px 8px ${color}40`; }}
            onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; }}
            title={`${fragment.name} (${fmtSize(fragment.length)})`}>
            <span className={`inline-block shrink-0 ${fragment.strand === -1 ? 'scale-x-[-1]' : ''}`}>
              <SBOLIcon type={fragment.type} size={12} color={color} />
            </span>
            <span className="text-[11px] font-medium truncate text-gray-800">
              {fragment.name?.length > 2 ? fragment.name.split('(')[0] : (fragment.type || 'frag')}
            </span>
            <span className="text-[9px] opacity-60 shrink-0 ml-auto">{fragment.length || 0} bp</span>
          </div>
        </>
      ) : (

      /* ═══ MERGED PRODUCT — with visible "stitches" + primers ═══ */
      fragment.subFragments?.length > 0 ? (
        <>
          {/* Fwd primer — top line */}
          {fwdPrimer && !isCompact(fragmentCount) && (
            <div className="flex items-center justify-between px-2 pt-1 pb-0.5 text-[11px]">
              <span className="text-blue-600 font-medium flex items-center gap-0.5 truncate" title={fwdPrimer.name}>
                <span className="text-blue-500 text-[13px]">{'→'}</span>
                {primerLabel(fwdPrimer.name)}
              </span>
              <span className="text-blue-400 font-mono shrink-0">{fwdPrimer.tmBinding}{'°'}</span>
            </div>
          )}

          <div className="relative rounded-xl overflow-hidden"
            style={{
              width: fragmentWidth(fragment.length, fragmentCount),
              minWidth: 100,
              border: '2px dashed #22c55e',
              background: '#f0fdf4',
            }}
            title={`${fragment.name}: ${fragment.subFragments.map(s => s.name).join(' + ')}`}>

            {/* Sub-fragment blocks with visible seams */}
            <div className="flex h-14">
              {fragment.subFragments.map((sub, si) => (
                <div key={si} className="relative flex flex-col items-center justify-center"
                  style={{
                    width: `${sub.pct}%`,
                    minWidth: 20,
                    borderRight: si < fragment.subFragments.length - 1
                      ? '2px dashed #86efac' : 'none',
                  }}>
                  <div className="absolute top-0 left-0 right-0 h-1.5"
                    style={{ backgroundColor: sub.color }} />
                  <span className="text-[9px] font-semibold text-gray-700 truncate px-1 mt-2"
                    title={`${sub.name} (${fmtSize(sub.length)})`}>
                    {sub.name}
                  </span>
                  <span className="text-[7px] text-gray-400">
                    {fmtSize(sub.length)}
                  </span>
                </div>
              ))}
            </div>

            {/* Bottom info bar */}
            <div className="flex items-center justify-center gap-2 py-0.5 bg-green-50 border-t border-dashed border-green-200">
              <span className="text-[8px] text-green-700 font-medium">
                {fragment.assemblyMethod === 'golden_gate' ? 'Golden Gate' :
                 fragment.assemblyMethod === 'kld' ? 'KLD' :
                 fragment.assemblyMethod === 're_ligation' ? 'RE-лигирование' :
                 fragment.assemblyMethod === 'gibson' ? 'Gibson' :
                 'OV-PCR'}
              </span>
              <span className="text-[8px] text-green-600">
                {fmtSize(fragment.length)}
              </span>
              <span className="text-[8px] text-green-600">
                {fragment.subFragments.length} {'фрагм.'}
              </span>
            </div>
          </div>

          {/* Rev primer — bottom line */}
          {revPrimer && !isCompact(fragmentCount) && (
            <div className="flex items-center justify-between px-2 pb-1 pt-0.5 text-[11px]">
              <span className="text-red-400 font-mono shrink-0">{revPrimer.tmBinding}{'°'}</span>
              <span className="text-red-600 font-medium flex items-center gap-0.5 truncate" title={revPrimer.name}>
                {primerLabel(revPrimer.name)}
                <span className="text-red-500 text-[13px]">{'←'}</span>
              </span>
            </div>
          )}

          {/* PCR size */}
          {pcrSize && !isCompact(fragmentCount) && (
            <div className="text-center text-[9px] text-green-600 font-medium mt-0.5">
              PCR: {fmtSize(pcrSize)}
            </div>
          )}

          {/* Stitch badge */}
          <div className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-green-500 text-white text-[10px]
            flex items-center justify-center shadow border-2 border-white z-10"
            title="Склеено">{'🔗'}</div>
        </>
      ) : (
      <>
      {/* No-PCR badge */}
      {!fragment.needsAmplification && (
        <div className="absolute -top-5 left-0 right-0 text-center z-10">
          <span className="text-[9px] bg-yellow-100 text-yellow-700 px-1 rounded">без ПЦР</span>
        </div>
      )}

      {/* ═══ CARD BLOCK — purple left border for mutants ═══ */}
      {(() => { const mutAnns = (fragment.annotations || []).filter(a => a.type === 'mutation'); const legacyMuts = fragment.mutations || []; const hasMuts = mutAnns.length > 0 || legacyMuts.length > 0; const muts = mutAnns.length > 0 ? mutAnns : legacyMuts; return (
      <div className={`relative flex flex-col rounded-lg select-none
        ${isDragging ? 'shadow-xl' : 'shadow-sm hover:shadow-md'}`}
        style={{
          background: `linear-gradient(135deg, ${color}15 0%, ${color}08 100%)`,
          border: `1px solid ${hasMuts ? '#c084fc' : color + '30'}`,
          borderLeft: circularHint === 'first' ? '3px solid #3b82f6' : `4px solid ${hasMuts ? '#a855f7' : color}`,
          borderRight: circularHint === 'last' ? '3px solid #3b82f6' : undefined,
          width: fragmentWidth(fragment.length, fragmentCount), minWidth: 60,
          transition: 'box-shadow 150ms ease',
        }}
        title={getPartDescription(fragment.name, fragment.type).short}>

        {/* Mutation badge */}
        {hasMuts && (
          <div className="absolute -top-2 right-1.5 z-10 group/mut">
            <span className="text-[7px] bg-purple-100 text-purple-700 border border-purple-200 rounded-full px-1.5 py-px font-medium cursor-help">
              {'🧬'}{muts.length}
            </span>
            <div className="hidden group-hover/mut:block absolute top-4 right-0 z-50 bg-white shadow-xl rounded-lg border p-2 min-w-[140px]">
              <div className="text-[9px] font-semibold text-purple-700 mb-1">Мутации:</div>
              {muts.map((m, mi) => (
                <div key={mi} className="text-[10px] text-gray-600 flex justify-between gap-2">
                  <span className="font-mono font-medium">{m.name || m.label || `${m.from || ''}${(m.position || 0) + 1}${m.to || ''}`}</span>
                  {(m.details?.codonChange || m.codonChange) && <span className="text-gray-400 text-[8px]">{m.details?.codonChange || m.codonChange}</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Fwd primer — top line (hidden in compact mode) */}
        {fwdPrimer && !isCompact(fragmentCount) && (
          <div className="flex items-center justify-between px-2 pt-1.5 pb-0.5 text-[11px]">
            <span className="text-blue-600 font-medium flex items-center gap-0.5 truncate" title={fwdPrimer.name}>
              <span className="text-blue-500 text-[13px]">{'→'}</span>
              {primerLabel(fwdPrimer.name)}
            </span>
            <span className="text-blue-400 font-mono shrink-0">{fwdPrimer.tmBinding}°</span>
          </div>
        )}

        {/* Fragment center */}
        <div className={`flex-1 flex flex-col items-center justify-center px-2 overflow-hidden
          ${hasPrimers ? 'py-1' : 'py-3'}`}>
          <div className="flex items-center gap-1 max-w-full">
            <span className={`inline-block shrink-0 ${fragment.strand === -1 ? 'scale-x-[-1]' : ''}`}>
              <SBOLIcon type={fragment.type} size={14} color={color} />
            </span>
            <span className="text-xs font-semibold text-gray-800 truncate" title={fragment.name}>
              {fragment.name.split('(')[0]}
            </span>
          </div>
          {/* Mutation labels as compact badges */}
          {hasMuts && !isCompact(fragmentCount) && (
            <div className="flex flex-wrap gap-0.5 mt-0.5 justify-center">
              {muts.slice(0, 3).map((m, mi) => (
                <span key={mi} className="text-[7px] font-mono bg-purple-100 text-purple-700 rounded px-0.5">
                  {m.name || m.label || `${m.from || ''}${(m.position || 0) + 1}${m.to || ''}`}
                </span>
              ))}
              {muts.length > 3 && (
                <span className="text-[7px] bg-purple-100 text-purple-700 rounded px-0.5">+{muts.length - 3}</span>
              )}
            </div>
          )}
          {/* Region bar — shows detail annotations as colored segments */}
          {(() => {
            const regions = getRegions(fragment.annotations);
            const allDetails = (fragment.annotations || []).filter(a => a.level === 'detail');
            const seqLen = (fragment.sequence || '').length || 1;

            if (regions.length > 0 && allDetails.length > 0) {
              // Render region(s): solid region color background + detail overlays
              return (
                <div className={`flex h-2.5 rounded overflow-hidden w-full mt-0.5 ${fragment.strand === -1 ? 'flex-row-reverse' : ''}`}>
                  {regions.map((r, ri) => {
                    const w = Math.max(3, ((r.end - r.start) / seqLen) * 100);
                    const regionColor = FEATURE_COLORS[r.type] || '#999';
                    const details = getDetails(fragment.annotations, r.id);
                    const regionLen = r.end - r.start || 1;
                    return (
                      <div key={ri} className="relative h-full border-r border-white/30 last:border-0 overflow-hidden"
                        style={{ width: `${w}%`, backgroundColor: regionColor }}
                        title={`${r.name}: ${r.start}–${r.end}`}>
                        {details.map((d, di) => {
                          const left = ((d.start - r.start) / regionLen) * 100;
                          const dw = Math.max(1, ((d.end - d.start) / regionLen) * 100);
                          return (
                            <div key={di} className="absolute top-0 h-full"
                              style={{ left: `${left}%`, width: `${dw}%`, backgroundColor: d.color || ANNOTATION_COLORS[d.type] || regionColor }}
                              title={`${d.name}: ${d.start}–${d.end}`} />
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              );
            }
            // Fallback: legacy domain bar
            if (fragment.domains?.length > 0) {
              const totalAA = Math.ceil(seqLen / 3);
              return (
                <div className={`flex h-2.5 rounded overflow-hidden w-full mt-0.5 ${fragment.strand === -1 ? 'flex-row-reverse' : ''}`}>
                  {fragment.domains.map((d, di) => {
                    const w = Math.max(3, ((d.endAA - d.startAA + 1) / (totalAA || 1)) * 100);
                    return (
                      <div key={di} style={{ width: `${w}%`, backgroundColor: d.color || '#56B4E9' }}
                        className="border-r border-white/30 last:border-0"
                        title={`${d.name}: ${d.startAA}–${d.endAA} а.о.`} />
                    );
                  })}
                </div>
              );
            }
            return null;
          })()}
          {/* Size + mutation position dots */}
          <div className="text-[9px] text-gray-400 w-full text-center relative">
            {fmtSize(fragment.length)}
            {hasMuts && muts.some(m => m.start != null || m.position != null) && (
              <div className="absolute inset-x-0 -bottom-1 h-1 flex items-center">
                {muts.map((m, mi) => {
                  const pos = m.start ?? m.codonStart ?? ((m.position || 0) * 3);
                  const pct = Math.min(95, Math.max(5, (pos / (fragment.length || 1)) * 100));
                  return <div key={mi} className="absolute w-1 h-1 rounded-full bg-fuchsia-500" style={{ left: `${pct}%` }} title={m.name || m.label} />;
                })}
              </div>
            )}
          </div>
        </div>

        {/* Rev primer — bottom line (hidden in compact mode) */}
        {revPrimer && !isCompact(fragmentCount) && (
          <div className="flex items-center justify-between px-2 pb-1.5 pt-0.5 text-[11px]">
            <span className="text-red-400 font-mono shrink-0">{revPrimer.tmBinding}°</span>
            <span className="text-red-600 font-medium flex items-center gap-0.5 truncate" title={revPrimer.name}>
              {primerLabel(revPrimer.name)}
              <span className="text-red-500 text-[13px]">{'←'}</span>
            </span>
          </div>
        )}
      </div>
      ); })()}

      {/* PCR size (hidden in compact mode) */}
      {pcrSize && !isCompact(fragmentCount) && (
        <div className="text-center text-[9px] text-green-600 font-medium mt-0.5">
          PCR: {fmtSize(pcrSize)}
        </div>
      )}

      {/* Variant badge */}
      {variantCount > 0 && (
        <span onClick={(e) => { e.stopPropagation(); setShowVariants(v => !v); }}
          className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-purple-500 text-white text-[9px] font-bold
                     flex items-center justify-center cursor-pointer hover:bg-purple-600 transition z-10 shadow"
          title={`${variantCount} вариант(ов)`}>
          {variantCount}
        </span>
      )}

      {/* Variant picker popup */}
      {showVariants && variants?.length > 0 && (
        <div className="absolute top-full left-0 mt-1 z-40 w-64 bg-white rounded-xl shadow-xl border p-2"
          onClick={e => e.stopPropagation()}>
          <div className="text-[10px] font-semibold text-gray-600 mb-1.5 px-1">Варианты {fragment.name}:</div>
          {variants.map(v => (
            <div key={v.id}
              onClick={() => { onSwapVariant?.(index, v); setShowVariants(false); }}
              className={`flex items-center justify-between p-1.5 rounded-lg cursor-pointer text-[11px] mb-0.5
                ${v.id === fragment.id ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-50'}`}>
              <div className="min-w-0">
                <div className="font-medium truncate">{v.name} <span className="text-gray-400 font-normal">{v.length} п.н.</span></div>
                {v.modification && <div className="text-[9px] text-gray-400 truncate">{v.modification.description}</div>}
              </div>
              {v.testResults?.length > 0 ? (
                <span className={`text-[9px] px-1.5 py-0.5 rounded-full shrink-0 ml-1 ${
                  v.testResults[0].result === 'active' ? 'bg-green-100 text-green-700' :
                  v.testResults[0].result === 'inactive' ? 'bg-red-100 text-red-700' :
                  'bg-amber-100 text-amber-700'}`}>
                  {v.testResults[0].result === 'active' ? '✓' : v.testResults[0].result === 'inactive' ? '✗' : '~'}
                  {v.testResults[0].activity != null ? ` ${Math.round(v.testResults[0].activity * 100)}%` : ''}
                </span>
              ) : (
                <span className="text-[9px] text-gray-300 shrink-0 ml-1">не тест.</span>
              )}
            </div>
          ))}
          <button onClick={() => setShowVariants(false)}
            className="text-[9px] text-gray-400 hover:text-gray-600 mt-1 px-1">Закрыть</button>
        </div>
      )}

      {/* Hover toolbar */}
      <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 hidden group-hover:flex items-center gap-1 z-10
                       bg-white rounded-full shadow border border-gray-200 px-1.5 py-0.5">
        {onFlip && (
          <button onClick={(e) => { e.stopPropagation(); onFlip(index); }}
            className="w-5 h-5 rounded-full text-[10px] flex items-center justify-center hover:bg-indigo-100 text-indigo-600"
            title="Перевернуть (reverse complement)">↻</button>
        )}
        {expertMode && onSplitSignal && (
          <button onClick={(e) => { e.stopPropagation(); onSplitSignal(index); }}
            className="w-5 h-5 rounded-full text-[10px] flex items-center justify-center hover:bg-orange-100 text-orange-600"
            title="Разделить фрагмент">✂</button>
        )}
        {expertMode && onEditFragment && (
          <button onClick={(e) => { e.stopPropagation(); onEditFragment(index); }}
            className="w-5 h-5 rounded-full text-[10px] flex items-center justify-center hover:bg-blue-100 text-blue-600"
            title="Редактировать">✏️</button>
        )}
        <button onClick={(e) => { e.stopPropagation(); onToggleAmplification(index); }}
          className={`text-[8px] px-1.5 py-0.5 rounded-full font-medium
            ${fragment.needsAmplification ? 'bg-blue-50 text-blue-600 hover:bg-blue-100' : 'bg-amber-50 text-amber-600 hover:bg-amber-100'}`}
          title={fragment.needsAmplification ? 'Отключить ПЦР' : 'Включить ПЦР'}>
          {fragment.needsAmplification ? 'ПЦР' : 'нет'}
        </button>
        <button onClick={(e) => { e.stopPropagation(); onRemove(index); }}
          className="w-5 h-5 rounded-full text-[10px] flex items-center justify-center hover:bg-red-100 text-red-500"
          title="Удалить">×</button>
      </div>
      </>
      ))}

      {/* ═══ Context Menu ═══ */}
      {ctxMenu && (
        <ContextMenu
          position={{ x: ctxMenu.x, y: ctxMenu.y }}
          onClose={() => setCtxMenu(null)}
          items={[
            { icon: '\uD83D\uDCCB', label: 'Копировать последовательность', onClick: () => navigator.clipboard.writeText(fragment.sequence || '') },
            { divider: true },
            ...(onEditFragment ? [{ icon: '\u270F\uFE0F', label: 'Редактировать', onClick: () => onEditFragment(index) }] : []),
            ...(onSplitSignal ? [{ icon: '\u2702\uFE0F', label: 'Разрезать', onClick: () => onSplitSignal(index) }] : []),
            ...(onFlip ? [{ icon: '\u21BB', label: 'Перевернуть (RC)', onClick: () => onFlip(index) }] : []),
            { divider: true },
            { icon: '\uD83D\uDDD1', label: 'Удалить', onClick: () => onRemove(index) },
          ]}
        />
      )}
    </div>
  );
}
