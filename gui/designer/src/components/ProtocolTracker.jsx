import { useState, useEffect, useMemo } from 'react';
import ConcentrationInput from './ConcentrationInput';
import { PCR_MIXES, PURIFICATION, ASSEMBLY_PROTOCOLS, calcPCRTime, fmtTime, suggestPurif, calcAssemblyMix } from '../protocol-data';
import { addToInventory } from '../inventory';

function fmtTs(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })} ${d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;
}

function fmtDuration(startIso, endIso) {
  if (!startIso || !endIso) return '';
  const min = Math.round((new Date(endIso) - new Date(startIso)) / 60000);
  if (min < 60) return `${min} мин`;
  return `${Math.floor(min / 60)} ч ${min % 60} мин`;
}

const STAGE_TIMES = {
  pcr: '~3 часа', overlap: '~3 часа', gibson: '~2 часа',
  golden_gate: '~3 часа', kld: '~1 час', re_ligation: '~2 часа',
  transform: '~2 часа', screening: '~1 час', miniprep: '~1 час', sequencing: '1-3 дня',
};

const STAGE_COLORS = {
  pcr: 'bg-blue-500', overlap: 'bg-blue-600', gibson: 'bg-blue-600',
  golden_gate: 'bg-green-500', kld: 'bg-purple-500', re_ligation: 'bg-orange-500',
  transform: 'bg-teal-500', screening: 'bg-amber-500', miniprep: 'bg-indigo-500', sequencing: 'bg-gray-500',
};

export default function ProtocolTracker({ fragments, junctions, primers, pcrSizes, polymerase, protocol, circular, assemblyId, onInventoryUpdate }) {
  const stateKey = `pvcs-protocol-state-${assemblyId || 'default'}`;
  const [states, setStatesRaw] = useState(() => {
    try { return JSON.parse(localStorage.getItem(stateKey) || '{}'); } catch { return {}; }
  });

  useEffect(() => {
    try { setStatesRaw(JSON.parse(localStorage.getItem(stateKey) || '{}')); } catch { setStatesRaw({}); }
  }, [stateKey]);

  const upd = (id, data) => {
    const now = new Date().toISOString();
    setStatesRaw(prev => {
      const step = prev[id] || {};
      const ts = { ...(step.timestamps || {}) };
      if (!ts.started) ts.started = now;
      if (data.done && !step.done) ts.completed = now;
      if (data.done === false && step.done) delete ts.completed;
      if (data.photo && !step.photo) ts.gelUploaded = now;
      if (data.measured && !step.measured) ts.measured = now;
      const next = { ...prev, [id]: { ...step, ...data, timestamps: ts, updatedAt: now } };
      localStorage.setItem(stateKey, JSON.stringify(next));
      return next;
    });
  };

  // ═══ Build STAGED protocol from junction types ═══
  const stages = useMemo(() => {
    const result = [];
    const jTypes = (junctions || []).map(j => j.type || 'overlap');
    const hasOverlap = jTypes.includes('overlap');
    const hasGG = jTypes.includes('golden_gate');
    const hasKLD = jTypes.includes('kld');
    const hasRE = jTypes.includes('re_ligation') || jTypes.includes('sticky_end');

    // STAGE: PCR — deduplicate identical fragments (one PCR for all copies)
    const pcrSteps = [];
    let n = 0;
    const seenSeqs = new Map(); // sequence → first fragment index
    fragments.forEach((frag, i) => {
      if (!frag.needsAmplification) return;
      const seqKey = frag.sequence;
      // For overlap assembly: identical fragments share one PCR product
      // For GG: each copy needs unique primers (different tails), so don't dedup
      const jType = junctions[i]?.type || junctions[i - 1]?.type || 'overlap';
      const isGG = jType === 'golden_gate';
      if (!isGG && seqKey && seenSeqs.has(seqKey)) {
        // Skip — same PCR product already generated
        return;
      }
      if (seqKey) seenSeqs.set(seqKey, i);
      const copies = isGG ? 1 : fragments.filter(f => f.needsAmplification && f.sequence === seqKey).length;
      n++;
      const fwd = primers.find(p => p.direction === 'forward' && p.name?.includes(frag.name));
      const rev = primers.find(p => p.direction === 'reverse' && p.name?.includes(frag.name));
      const sz = pcrSizes?.[i] || frag.length || 1000;
      const tm = calcPCRTime(sz, polymerase);
      const anneal = Math.round(Math.min(fwd?.tmBinding || 60, rev?.tmBinding || 60));
      pcrSteps.push({ id: `pcr_${i}`, num: n, type: 'pcr',
        title: `ПЦР ${frag.name}${copies > 1 ? ` (×${copies})` : ''}`,
        sub: `${sz} п.н.${copies > 1 ? ` · 1 реакция для ${copies} копий` : ''}`,
        frag: frag.name, fwd: fwd?.name, rev: rev?.name, anneal, sz, ext: tm.extSec, timeMin: tm.totalMin,
        mix: PCR_MIXES[polymerase], seq: frag.sequence, fragLen: frag.length });
      n++;
      const purif = suggestPurif('pcr', protocol, false);
      pcrSteps.push({ id: `purif_${i}`, num: n, type: 'purif', title: `Очистка ${frag.name}`,
        sub: PURIFICATION[purif]?.name || '?', purif, frag: frag.name, sz, seq: frag.sequence, fragLen: frag.length });
    });
    if (pcrSteps.length > 0) {
      result.push({ name: 'Генерация ПЦР-продуктов', method: 'pcr', parallel: true, time: STAGE_TIMES.pcr, steps: pcrSteps });
    }

    // STAGE: Overlap merges
    if (hasOverlap) {
      const overlapSteps = [];
      // Group consecutive overlap junctions
      const groups = []; let cur = [0];
      for (let gi = 0; gi < jTypes.length; gi++) {
        if (jTypes[gi] === 'overlap') { cur.push((gi + 1) % fragments.length); }
        else { groups.push([...cur]); cur = [(gi + 1) % fragments.length]; }
      }
      groups.push([...cur]);
      groups.filter(g => g.length > 1).forEach((group, gi) => {
        n++;
        const names = group.map(i => fragments[i]?.name || '?');
        overlapSteps.push({ id: `overlap_${gi}`, num: n, type: 'assembly', title: `Overlap: ${names.join(' + ')}`,
          sub: `${names.length} фрагментов`, asm: ASSEMBLY_PROTOCOLS.overlap_pcr || ASSEMBLY_PROTOCOLS.gibson,
          method: 'overlap_pcr', frags: names, sz: group.reduce((s, i) => s + (fragments[i]?.length || 0), 0) });
      });
      if (overlapSteps.length > 0) {
        result.push({ name: 'Overlap-сборка', method: 'overlap', parallel: overlapSteps.length > 1, time: STAGE_TIMES.overlap, steps: overlapSteps });
      }
    }

    // STAGE: Golden Gate
    if (hasGG) {
      n++;
      const ggJunctions = (junctions || []).filter(j => j.type === 'golden_gate');
      const enzyme = ggJunctions[0]?.enzyme || 'BsaI';
      const totalSz = fragments.reduce((s, f) => s + (f.length || 0), 0);
      result.push({ name: `Golden Gate (${enzyme})`, method: 'golden_gate', parallel: false, time: STAGE_TIMES.golden_gate, steps: [{
        id: 'gg_asm', num: n, type: 'golden_gate', title: `Golden Gate — ${enzyme}`,
        sub: `${ggJunctions.length} стыков · (37°C↔16°C) ×30`, enzyme, overhangs: ggJunctions.map(j => j.overhang || '?'),
        sz: totalSz, frags: fragments.map(f => f.name),
      }] });
    }

    // STAGE: RE/Ligation
    if (hasRE) {
      n++;
      const reJunctions = (junctions || []).filter(j => j.type === 're_ligation' || j.type === 'sticky_end');
      const enzymes = [...new Set(reJunctions.map(j => j.reEnzyme || j.enzyme || '?'))];
      result.push({ name: 'Рестрикция + лигирование', method: 're_ligation', parallel: false, time: STAGE_TIMES.re_ligation, steps: [{
        id: 're_asm', num: n, type: 're_ligation', title: `Рестрикция: ${enzymes.join(', ')}`,
        sub: 'T4 Ligase · 16°C overnight', enzymes, sz: fragments.reduce((s, f) => s + (f.length || 0), 0),
      }] });
    }

    // STAGE: KLD (always last assembly step)
    if (hasKLD) {
      n++;
      result.push({ name: 'KLD (Kinase-Ligase-DpnI)', method: 'kld', parallel: false, time: STAGE_TIMES.kld, steps: [{
        id: 'kld_asm', num: n, type: 'kld', title: 'KLD реакция', sub: '25°C 30 мин',
        sz: fragments.reduce((s, f) => s + (f.length || 0), 0),
      }] });
    }

    // If no specific method, fallback to generic assembly
    if (!hasOverlap && !hasGG && !hasKLD && !hasRE) {
      n++;
      const asm = ASSEMBLY_PROTOCOLS[protocol] || ASSEMBLY_PROTOCOLS.gibson;
      const totalSz = fragments.reduce((s, f) => s + (f.length || 0), 0);
      result.push({ name: `Сборка — ${asm.name}`, method: 'gibson', parallel: false, time: STAGE_TIMES.gibson, steps: [{
        id: 'assembly', num: n, type: 'assembly', title: `${asm.name}`, sub: `${totalSz} п.н.`,
        asm, method: protocol, sz: totalSz, frags: fragments.filter(f => f.needsAmplification).map(f => f.name),
      }] });
    }

    // Post-assembly stages
    n++; result.push({ name: 'Трансформация', method: 'transform', parallel: false, time: STAGE_TIMES.transform,
      steps: [{ id: 'transform', num: n, type: 'transform', title: 'Трансформация' }] });
    n++; const totalSz = fragments.reduce((s, f) => s + (f.length || 0), 0);
    result.push({ name: 'Скрининг + верификация', method: 'screening', parallel: false, time: STAGE_TIMES.screening, steps: [
      { id: 'screening', num: n, type: 'screening', title: 'Colony PCR', sub: `ожид. ${totalSz} п.н.`, sz: totalSz },
      { id: 'miniprep', num: ++n, type: 'miniprep', title: 'Мини-преп' },
      { id: 'sequencing', num: ++n, type: 'sequencing', title: 'Секвенирование',
        sub: totalSz > 1500 ? `${Math.ceil(totalSz / 700)} реакций` : '2 реакции' },
    ] });

    return result;
  }, [fragments, junctions, primers, pcrSizes, polymerase, protocol]);

  // Flat steps for statistics
  const allSteps = useMemo(() => stages.flatMap(s => s.steps), [stages]);

  // Assembly mix from measured concentrations
  const measuredFrags = useMemo(() => {
    return allSteps.filter(s => s.type === 'purif' && s.id.startsWith('purif_'))
      .map(s => ({ name: s.frag, sizeBp: s.sz, concentration: states[s.id]?.concentration || 0, volume: states[s.id]?.volume || 0 }))
      .filter(f => f.concentration > 0);
  }, [allSteps, states]);
  const asmMix = useMemo(() => measuredFrags.length > 0 ? calcAssemblyMix(measuredFrags, protocol) : null, [measuredFrags, protocol]);

  const handleConcSave = (stepId, measurement) => {
    addToInventory(measurement);
    upd(stepId, { concentration: measurement.concentration, volume: measurement.volume, measured: true });
    if (onInventoryUpdate) onInventoryUpdate();
  };

  // Stats
  const stats = useMemo(() => {
    const completed = allSteps.filter(s => states[s.id]?.done).length;
    const allTs = allSteps.map(s => states[s.id]?.timestamps).filter(Boolean);
    const firstStart = allTs.map(t => t.started).filter(Boolean).sort()[0];
    const lastComplete = allTs.map(t => t.completed).filter(Boolean).sort().pop();
    let totalMin = 0;
    allTs.forEach(t => { if (t.started && t.completed) totalMin += (new Date(t.completed) - new Date(t.started)) / 60000; });
    const estDays = Math.ceil(stages.length / 3);
    return { completed, total: allSteps.length, firstStart, lastComplete, activeMin: Math.round(totalMin), estDays };
  }, [allSteps, states, stages]);

  const exportPrint = () => {
    const html = allSteps.map((s) =>
      `<div style="page-break-inside:avoid;border:1px solid #ddd;border-radius:8px;padding:16px;margin:12px 0">
      <h3>Шаг ${s.num}: ${s.title} <small style="color:#888">${s.sub || ''}</small></h3>
      ${s.type === 'pcr' ? `<p>Темплейт: ${s.frag}<br>Праймеры: ${s.fwd} + ${s.rev}<br>Anneal: ${s.anneal}°C<br>Ожид.: ${s.sz} п.н.</p>` : ''}
      ${s.type === 'assembly' && s.asm ? `<ol>${(s.asm.steps || []).map(x => `<li>${x}</li>`).join('')}</ol>` : ''}
      <div style="border-top:1px solid #eee;padding-top:8px;margin-top:8px">Факт.: _____ п.н. &nbsp; Конц.: _____ нг/µl</div></div>`
    ).join('');
    const w = window.open('', '_blank');
    w.document.write(`<html><head><title>Протокол</title><style>body{font:13px Inter,sans-serif;max-width:800px;margin:auto;padding:20px}h2{color:#1565C0}@media print{button{display:none}}</style></head><body><h2>Протокол сборки</h2><button onclick="print()">Печать</button>${html}</body></html>`);
    w.document.close();
  };

  if (!allSteps.length) return null;

  return (
    <div className="space-y-2">
      {/* Timeline summary */}
      <div className="flex items-center gap-6 p-3 bg-gray-50 rounded-xl">
        <div>
          <div className="text-[10px] text-gray-500">Этапов</div>
          <div className="text-lg font-bold">{stages.length}</div>
        </div>
        <div>
          <div className="text-[10px] text-gray-500">Шагов</div>
          <div className="text-lg font-bold">{stats.total}</div>
        </div>
        <div>
          <div className="text-[10px] text-gray-500">~Дней</div>
          <div className="text-lg font-bold">{stats.estDays}</div>
        </div>
        <div className="flex-1">
          <div className="text-[10px] text-gray-500 mb-1">Прогресс ({stats.completed}/{stats.total})</div>
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
            <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${stats.total ? (stats.completed / stats.total) * 100 : 0}%` }} />
          </div>
        </div>
        <button onClick={exportPrint} className="text-xs px-3 py-1.5 bg-white border rounded-lg hover:bg-gray-50 shrink-0">{'🖨️'} Печать</button>
      </div>

      {/* Assembly mix calculator */}
      {asmMix && (
        <div className="border border-green-200 bg-green-50 rounded-xl p-4">
          <h4 className="text-xs font-bold text-green-800 mb-2">{'🧪'} Расчёт сборочного микса</h4>
          <table className="text-[11px] w-full"><tbody>
            {asmMix.frags.map((f, i) => (
              <tr key={i} className="border-b border-green-100">
                <td className="py-1">{f.name}</td>
                <td className="py-1 text-right font-mono">{f.concentration} нг/µl</td>
                <td className="py-1 text-right font-mono font-bold">{f.ul} µl</td>
                <td className="py-1 text-right text-green-600">{f.target} нг</td>
              </tr>
            ))}
            {asmMix.reagents.map((r, i) => (
              <tr key={`r${i}`} className="border-b border-green-100 text-green-700">
                <td className="py-1" colSpan={2}>{r.r}</td><td className="py-1 text-right font-mono">{r.v} µl</td><td></td>
              </tr>
            ))}
            <tr className="border-b border-green-100 text-green-700"><td className="py-1" colSpan={2}>H₂O</td><td className="py-1 text-right font-mono">{asmMix.water} µl</td><td></td></tr>
            <tr className="font-bold text-green-800"><td className="pt-1" colSpan={2}>Итого:</td><td className="pt-1 text-right font-mono">{asmMix.total} µl</td><td></td></tr>
          </tbody></table>
        </div>
      )}

      {/* ═══ STAGED LAYOUT ═══ */}
      {stages.map((stage, si) => {
        const stageColor = STAGE_COLORS[stage.method] || 'bg-gray-500';
        const stageCompleted = stage.steps.every(s => states[s.id]?.done);
        return (
          <div key={si} className="mb-4">
            {/* Stage header */}
            <div className="flex items-center gap-3 mb-2 sticky top-0 bg-white/95 backdrop-blur z-10 py-1.5 border-b border-gray-100">
              <div className={`flex items-center justify-center w-7 h-7 rounded-full text-white text-xs font-bold shrink-0 ${stageCompleted ? 'bg-green-500' : stageColor}`}>
                {stageCompleted ? '✓' : si + 1}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-gray-800 truncate">{stage.name}</div>
                <div className="text-[10px] text-gray-400">
                  {stage.steps.length} {stage.steps.length === 1 ? 'шаг' : stage.steps.length < 5 ? 'шага' : 'шагов'}
                  {stage.parallel && <span className="ml-2 text-green-600 font-medium">{'⚡'} параллельно</span>}
                  {stage.time && <span className="ml-2">{'⏱'} {stage.time}</span>}
                </div>
              </div>
            </div>

            {/* Steps within stage */}
            <div className={`ml-3.5 pl-6 border-l-2 ${stageCompleted ? 'border-green-200' : 'border-gray-100'} space-y-2`}>
              {stage.steps.map(step => {
                const st = states[step.id] || {};
                const ts = st.timestamps || {};
                return (
                  <div key={step.id} className="border rounded-xl bg-white overflow-hidden shadow-sm">
                    {/* Step header */}
                    <div className="px-4 py-2 bg-gray-50 border-b flex justify-between items-center">
                      <div>
                        <span className="text-sm font-bold">{step.title}</span>
                        {step.sub && <span className="text-xs text-gray-500 ml-2">{step.sub}</span>}
                        {ts.started && (
                          <div className="text-[9px] text-gray-400 mt-0.5">
                            {fmtTs(ts.started)}
                            {ts.completed && <> → {fmtTs(ts.completed)} ({fmtDuration(ts.started, ts.completed)})</>}
                          </div>
                        )}
                      </div>
                      <button onClick={() => upd(step.id, { done: !st.done })}
                        className={`text-[10px] px-2 py-0.5 rounded-full border shrink-0 ${st.done ? 'bg-green-100 border-green-400 text-green-700' : 'border-gray-200 text-gray-400'}`}>
                        {st.done ? '✔ Готово' : '○'}
                      </button>
                    </div>

                    {/* Step content */}
                    <div className="px-4 py-3">
                      {step.type === 'pcr' && <PCRContent step={step} />}
                      {step.type === 'purif' && <PurifContent step={step} />}
                      {step.type === 'assembly' && <AssemblyContent step={step} />}
                      {step.type === 'golden_gate' && <GoldenGateContent step={step} />}
                      {step.type === 'kld' && <KLDContent />}
                      {step.type === 're_ligation' && <REContent step={step} />}
                      {step.type === 'transform' && <TransformContent />}
                      {step.type === 'screening' && <ScreeningContent step={step} />}
                      {step.type === 'miniprep' && <div className="text-[11px]">Ночная культура → мини-преп kit → элюция 30 µl</div>}
                      {step.type === 'sequencing' && <div className="text-[11px]">Секвенирование с verify праймерами. {step.sub}</div>}
                    </div>

                    {/* Student inputs */}
                    <div className="px-4 py-2.5 border-t bg-gray-50">
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="text-[10px] text-gray-500">Факт. размер</label>
                          <input className="w-full border rounded px-2 py-1 text-xs" value={st.actualSize || ''}
                            placeholder={step.sz ? `ожид. ${step.sz}` : ''} onChange={e => upd(step.id, { actualSize: e.target.value })} />
                        </div>
                        <div>
                          <label className="text-[10px] text-gray-500">{'📷'} Фото</label>
                          <input type="file" accept="image/*" className="w-full text-[10px]"
                            onChange={e => { const f = e.target.files?.[0]; if (!f) return; const r = new FileReader(); r.onload = () => upd(step.id, { photo: r.result }); r.readAsDataURL(f); }} />
                        </div>
                        <div>
                          <label className="text-[10px] text-gray-500">Комментарий</label>
                          <input className="w-full border rounded px-2 py-1 text-xs" value={st.comment || ''}
                            onChange={e => upd(step.id, { comment: e.target.value })} />
                        </div>
                      </div>
                      {st.photo && <img src={st.photo} alt="gel" className="mt-2 max-h-32 rounded border" />}
                      {(step.type === 'purif' || step.type === 'miniprep') && !st.measured && (
                        <ConcentrationInput fragmentName={step.frag || 'construct'} fragmentLength={step.fragLen || step.sz}
                          fragmentSequence={step.seq} sourceStep={`${step.title}`} onSave={m => handleConcSave(step.id, m)} />
                      )}
                      {st.measured && (
                        <div className="text-[10px] text-green-600 mt-1">{'✅'} {st.concentration} нг/µл, {st.volume} µл</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Purification hint between PCR and assembly stages */}
            {si === 0 && stage.method === 'pcr' && stages.length > 1 && (
              <div className="ml-3.5 pl-6 border-l-2 border-gray-100 my-1">
                <div className="text-[10px] text-amber-600 bg-amber-50 rounded-lg px-3 py-1.5 w-fit">
                  {'🧹'} Очистка ПЦР-продуктов перед следующим этапом
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function PCRContent({ step }) {
  const m = step.mix || PCR_MIXES.phusion;
  return (
    <div className="grid grid-cols-2 gap-4">
      <div>
        <div className="text-xs font-semibold mb-1">ПЦР микс ({m.name})</div>
        <table className="text-[11px] w-full"><tbody>
          {m.components.map((c, i) => (
            <tr key={i} className="border-b border-gray-100">
              <td className="py-0.5">{c.reagent}</td>
              <td className="py-0.5 text-right font-mono">{c.volume !== null ? `${c.volume} µl` : c.note || ''}</td>
            </tr>
          ))}
          <tr className="font-semibold"><td className="pt-1">Итого:</td><td className="pt-1 text-right font-mono">{m.total} µl</td></tr>
        </tbody></table>
      </div>
      <div>
        <div className="text-xs font-semibold mb-1">Программа</div>
        <div className="text-[11px] font-mono bg-gray-50 rounded p-2 space-y-0.5">
          <div>{m.denatT}°C {fmtTime(m.initDenatS)}</div>
          <div className="text-gray-400">─── 30 циклов ───</div>
          <div>{m.denatT}°C {m.denatS} сек</div>
          <div>{step.anneal}°C 20 сек (отжиг)</div>
          <div>{m.extT}°C {fmtTime(step.ext)} (элонг.)</div>
          <div className="text-gray-400">────────────</div>
          <div>{m.extT}°C {fmtTime(m.finalExtS)}</div>
          <div>4°C hold</div>
        </div>
        <div className="text-[10px] text-gray-500 mt-1">Праймеры: {step.fwd} + {step.rev} | ~{step.timeMin} мин</div>
      </div>
    </div>
  );
}

function PurifContent({ step }) {
  const p = PURIFICATION[step.purif] || PURIFICATION.column_pcr;
  return (
    <div className="text-[11px]">
      <div className="font-semibold">{p.icon} {p.name}</div>
      <div className="text-gray-500">Время: ~{p.time} мин | Выход: {p.recovery}</div>
    </div>
  );
}

function AssemblyContent({ step }) {
  if (!step.asm) return <div className="text-[11px]">Сборка: {step.frags?.join(' + ')}</div>;
  return (
    <div>
      <div className="text-xs font-semibold mb-1">{step.asm.name}</div>
      <ol className="text-[11px] space-y-0.5 list-decimal list-inside">
        {step.asm.steps.map((s, i) => <li key={i}>{s}</li>)}
      </ol>
      {step.frags && <div className="text-[10px] text-gray-500 mt-1">Фрагменты: {step.frags.join(' + ')}</div>}
    </div>
  );
}

function GoldenGateContent({ step }) {
  return (
    <div>
      <div className="text-xs font-semibold mb-1">Golden Gate Assembly ({step.enzyme})</div>
      <table className="text-[11px] w-full max-w-xs"><tbody>
        <tr className="border-b border-gray-100"><td className="py-0.5">Фрагменты (эквимолярно)</td><td className="text-right font-mono">~50 нг каждый</td></tr>
        <tr className="border-b border-gray-100"><td className="py-0.5">{step.enzyme}</td><td className="text-right font-mono">1 µl</td></tr>
        <tr className="border-b border-gray-100"><td className="py-0.5">T4 DNA Ligase</td><td className="text-right font-mono">1 µl</td></tr>
        <tr className="border-b border-gray-100"><td className="py-0.5">10× T4 Ligase Buffer</td><td className="text-right font-mono">2 µl</td></tr>
        <tr className="border-b border-gray-100"><td className="py-0.5">H₂O</td><td className="text-right font-mono">до 20 µl</td></tr>
      </tbody></table>
      <div className="font-mono text-[11px] bg-gray-50 rounded p-2 mt-2">
        (37°C 5 мин → 16°C 5 мин) × 30 циклов → 55°C 10 мин → 4°C
      </div>
      {step.overhangs && (
        <div className="text-[10px] text-gray-500 mt-1">
          Овехенги: {step.overhangs.map((o, i) => <span key={i} className="font-mono font-bold text-green-700 mr-1">{o}</span>)}
        </div>
      )}
    </div>
  );
}

function KLDContent() {
  return (
    <div>
      <div className="text-xs font-semibold mb-1">KLD Enzyme Mix (NEB #M0554)</div>
      <table className="text-[11px] w-full max-w-xs"><tbody>
        <tr className="border-b border-gray-100"><td className="py-0.5">ПЦР-продукт</td><td className="text-right font-mono">1 µl (~50 нг)</td></tr>
        <tr className="border-b border-gray-100"><td className="py-0.5">2× KLD Reaction Buffer</td><td className="text-right font-mono">5 µl</td></tr>
        <tr className="border-b border-gray-100"><td className="py-0.5">10× KLD Enzyme Mix</td><td className="text-right font-mono">1 µl</td></tr>
        <tr className="border-b border-gray-100"><td className="py-0.5">H₂O</td><td className="text-right font-mono">3 µl</td></tr>
        <tr className="font-semibold"><td className="pt-1">Итого:</td><td className="pt-1 text-right font-mono">10 µl</td></tr>
      </tbody></table>
      <div className="font-mono text-[11px] bg-gray-50 rounded p-2 mt-2">
        25°C 30 мин → на льду → трансформация 5 µl
      </div>
      <div className="text-[9px] text-green-600 mt-1.5 bg-green-50 rounded px-2 py-1">
        {'ℹ'} T4 PNK в составе KLD микса фосфорилирует 5'-концы в реакции.
        Фосфорилированные праймеры НЕ требуются.
      </div>
    </div>
  );
}

function REContent({ step }) {
  return (
    <div>
      <div className="text-xs font-semibold mb-1">Рестрикция + лигирование</div>
      <div className="text-[11px] space-y-1">
        <div><b>1.</b> Рестрикция: {step.enzymes?.join(' + ') || '?'} · 37°C · 1 час</div>
        <div><b>2.</b> Инактивация: 65°C · 20 мин</div>
        <div><b>3.</b> Лигирование: T4 DNA Ligase · 16°C · overnight</div>
        <div><b>4.</b> Трансформация 2-5 µl</div>
      </div>
    </div>
  );
}

function TransformContent() {
  return (
    <div className="text-[11px] space-y-1">
      <div>Штамм: <input className="border rounded px-2 py-0.5 text-xs w-32" placeholder="DH5α / AN-003" /></div>
      <div>Метод: <select className="border rounded px-2 py-0.5 text-xs">
        <option>Химическая (CaCl₂)</option><option>Электропорация</option><option>Протопласты</option>
      </select></div>
    </div>
  );
}

function ScreeningContent({ step }) {
  return (
    <div className="text-[11px]">
      <div className="font-semibold mb-1">Colony PCR (ожид. {step.sz ? `${step.sz} п.н.` : '?'})</div>
      <div className="grid grid-cols-4 gap-1">
        {[1,2,3,4,5,6,7,8].map(n => (
          <div key={n} className="flex items-center gap-1">
            <span className="text-[10px] text-gray-500">#{n}</span>
            <select className="border rounded text-[10px] px-1"><option>--</option><option>{'✓'}</option><option>{'✗'}</option></select>
          </div>
        ))}
      </div>
    </div>
  );
}

export { PCR_MIXES, ASSEMBLY_PROTOCOLS };
