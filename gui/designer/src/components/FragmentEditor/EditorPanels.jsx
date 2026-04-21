import { ANNOTATION_COLORS, autoAnnotate } from '../../auto-annotate';
import { DOMAIN_COLORS } from '../../domain-detection';
import { getAllDetails } from '../../annotation-model';
import AnnotationEditor from '../AnnotationEditor';
import { REGION_COLORS, getRegionTypes, addCustomRegionType } from './region-types';
import { mutationHitsAA } from './highlights';

/**
 * K10 (Sprint 1.7) Unified Editor — collapsible panels below sequence view.
 * Annotations / Mutations / Protein(обзор). Pure-props: no internal state, all
 * interaction delegated via callbacks. State (panelsOpen, annotations, domains,
 * mutations, addForm) lives in FragmentEditor/index.jsx.
 */
export default function EditorPanels({
  fragment, seq, isCDS, totalAA, protein,
  fullViewActive,
  annotations, setAnnotations,
  mutations, setMutations,
  mutationHighlight,
  panelsOpen, togglePanel,
  addForm, setAddForm,
  onAddDomain,
}) {
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
                  <button onClick={onAddDomain} className="text-xs px-3 py-1 bg-green-600 text-white rounded">Добавить</button>
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
}
