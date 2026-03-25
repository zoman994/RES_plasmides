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

export default function ProtocolTracker({ fragments, primers, pcrSizes, polymerase, protocol, circular, assemblyId, onInventoryUpdate }) {
  const stateKey = `pvcs-protocol-state-${assemblyId || 'default'}`;
  const [states, setStatesRaw] = useState(() => {
    try { return JSON.parse(localStorage.getItem(stateKey) || '{}'); } catch { return {}; }
  });

  useEffect(() => {
    try { setStatesRaw(JSON.parse(localStorage.getItem(stateKey) || '{}')); } catch { setStatesRaw({}); }
  }, [stateKey]);

  // ═══ Auto-timestamped update ═══
  const upd = (id, data) => {
    const now = new Date().toISOString();
    setStatesRaw(prev => {
      const step = prev[id] || {};
      const ts = { ...(step.timestamps || {}) };

      // Auto-record timestamps based on what changed
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

  // Generate steps
  const steps = useMemo(() => {
    const s = [];
    let n = 0;
    fragments.forEach((frag, i) => {
      if (!frag.needsAmplification) return;
      n++;
      const fwd = primers.find(p => p.direction === 'forward' && p.name.includes(frag.name));
      const rev = primers.find(p => p.direction === 'reverse' && p.name.includes(frag.name));
      const sz = pcrSizes?.[i] || frag.length || 1000;
      const tm = calcPCRTime(sz, polymerase);
      const anneal = Math.round(Math.min(fwd?.tmBinding || 60, rev?.tmBinding || 60));
      s.push({ id: `pcr_${i}`, num: n, type: 'pcr', title: `ПЦР ${frag.name}`, sub: `${sz} п.н.`,
        frag: frag.name, fwd: fwd?.name, rev: rev?.name, anneal, sz, ext: tm.extSec, timeMin: tm.totalMin,
        mix: PCR_MIXES[polymerase], seq: frag.sequence, fragLen: frag.length });
      const isLast = !fragments.slice(i + 1).some(f => f.needsAmplification);
      const purif = suggestPurif('pcr', protocol, isLast);
      n++;
      s.push({ id: `purif_${i}`, num: n, type: 'purif', title: `Очистка ${frag.name}`,
        sub: PURIFICATION[purif]?.name || '?', purif, frag: frag.name, sz, seq: frag.sequence, fragLen: frag.length });
    });
    n++;
    const asm = ASSEMBLY_PROTOCOLS[protocol] || ASSEMBLY_PROTOCOLS.gibson;
    const totalSz = fragments.reduce((sum, f) => sum + (f.length || 0), 0);
    s.push({ id: 'assembly', num: n, type: 'assembly', title: `Сборка — ${asm.name}`,
      sub: `${totalSz} п.н.`, asm, method: protocol, sz: totalSz,
      frags: fragments.filter(f => f.needsAmplification).map(f => f.name) });
    if (asm.postPurif && asm.postPurif !== 'none') {
      n++;
      s.push({ id: 'purif_asm', num: n, type: 'purif', title: 'Очистка после сборки',
        sub: PURIFICATION[asm.postPurif]?.name || '?', purif: asm.postPurif, frag: 'construct', sz: totalSz });
    }
    n++; s.push({ id: 'transform', num: n, type: 'transform', title: 'Трансформация' });
    n++; s.push({ id: 'screening', num: n, type: 'screening', title: 'Colony PCR', sub: `ожид. ${(totalSz/1000).toFixed(1)} кб`, sz: totalSz });
    n++; s.push({ id: 'miniprep', num: n, type: 'miniprep', title: 'Мини-преп' });
    n++; s.push({ id: 'sequencing', num: n, type: 'sequencing', title: 'Секвенирование',
      sub: totalSz > 1500 ? `${Math.ceil(totalSz / 700)} реакций` : '2 реакции' });
    return s;
  }, [fragments, primers, pcrSizes, polymerase, protocol]);

  // Assembly mix
  const measuredFrags = useMemo(() => {
    return steps.filter(s => s.type === 'purif' && s.id.startsWith('purif_') && s.id !== 'purif_asm')
      .map(s => ({ name: s.frag, sizeBp: s.sz, concentration: states[s.id]?.concentration || 0, volume: states[s.id]?.volume || 0 }))
      .filter(f => f.concentration > 0);
  }, [steps, states]);
  const asmMix = useMemo(() => measuredFrags.length > 0 ? calcAssemblyMix(measuredFrags, protocol) : null, [measuredFrags, protocol]);

  const handleConcSave = (stepId, measurement) => {
    addToInventory(measurement);
    upd(stepId, { concentration: measurement.concentration, volume: measurement.volume, measured: true });
    if (onInventoryUpdate) onInventoryUpdate();
  };

  // ═══ Statistics ═══
  const stats = useMemo(() => {
    const completed = steps.filter(s => states[s.id]?.done).length;
    const allTs = steps.map(s => states[s.id]?.timestamps).filter(Boolean);
    const firstStart = allTs.map(t => t.started).filter(Boolean).sort()[0];
    const lastComplete = allTs.map(t => t.completed).filter(Boolean).sort().pop();
    let totalMin = 0;
    allTs.forEach(t => {
      if (t.started && t.completed) totalMin += (new Date(t.completed) - new Date(t.started)) / 60000;
    });
    return { completed, total: steps.length, firstStart, lastComplete, activeMin: Math.round(totalMin) };
  }, [steps, states]);

  const exportPrint = () => {
    const html = steps.map((s) =>
      `<div style="page-break-inside:avoid;border:1px solid #ddd;border-radius:8px;padding:16px;margin:12px 0">
      <h3>Шаг ${s.num}: ${s.title} <small style="color:#888">${s.sub || ''}</small></h3>
      ${s.type === 'pcr' ? `<p>Темплейт: ${s.frag}<br>Праймеры: ${s.fwd} + ${s.rev}<br>Anneal: ${s.anneal}°C<br>Ожид.: ${s.sz} п.н.</p>` : ''}
      ${s.type === 'assembly' ? `<ol>${(s.asm?.steps || []).map(x => `<li>${x}</li>`).join('')}</ol>` : ''}
      <div style="border-top:1px solid #eee;padding-top:8px;margin-top:8px">Факт.: _____ п.н. &nbsp; Конц.: _____ нг/µl &nbsp; Комм.: __________</div></div>`
    ).join('');
    const w = window.open('', '_blank');
    w.document.write(`<html><head><title>Протокол</title><style>body{font:13px Inter,sans-serif;max-width:800px;margin:auto;padding:20px}h2{color:#1565C0}@media print{button{display:none}}</style></head><body><h2>🧬 Протокол сборки</h2><button onclick="print()">🖨 Печать</button>${html}</body></html>`);
    w.document.close();
  };

  if (!steps.length) return null;

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-bold">{'📋'} Протокол ({stats.completed}/{stats.total} шагов)</h3>
        <div className="flex items-center gap-2">
          {stats.activeMin > 0 && (
            <span className="text-[10px] text-gray-400">
              {'⏱'} {stats.activeMin >= 60 ? `${Math.floor(stats.activeMin / 60)} ч ${stats.activeMin % 60} мин` : `${stats.activeMin} мин`}
            </span>
          )}
          <button onClick={exportPrint} className="text-xs px-3 py-1.5 bg-gray-100 rounded hover:bg-gray-200">{'🖨️'} Печать</button>
        </div>
      </div>

      {/* Progress bar */}
      {stats.total > 0 && (
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full bg-green-500 rounded-full transition-all"
            style={{ width: `${(stats.completed / stats.total) * 100}%` }} />
        </div>
      )}

      {/* Assembly mix calculator */}
      {asmMix && (
        <div className="border border-green-200 bg-green-50 rounded-xl p-4">
          <h4 className="text-xs font-bold text-green-800 mb-2">{'🧪'} Расчёт сборочного микса (из реальных конц.)</h4>
          <table className="text-[11px] w-full">
            <tbody>
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
                  <td className="py-1" colSpan={2}>{r.r}</td>
                  <td className="py-1 text-right font-mono">{r.v} µl</td>
                  <td></td>
                </tr>
              ))}
              <tr className="border-b border-green-100 text-green-700">
                <td className="py-1" colSpan={2}>H₂O</td>
                <td className="py-1 text-right font-mono">{asmMix.water} µl</td>
                <td></td>
              </tr>
              <tr className="font-bold text-green-800">
                <td className="pt-1" colSpan={2}>Итого:</td>
                <td className="pt-1 text-right font-mono">{asmMix.total} µl</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Step cards */}
      {steps.map(step => {
        const st = states[step.id] || {};
        const ts = st.timestamps || {};
        return (
          <div key={step.id} className="border rounded-xl bg-white overflow-hidden">
            {/* Header */}
            <div className="px-4 py-2.5 bg-gray-50 border-b flex justify-between items-center">
              <div>
                <span className="text-sm font-bold">Шаг {step.num}: {step.title}</span>
                {step.sub && <span className="text-xs text-gray-500 ml-2">{step.sub}</span>}
                {/* Timestamp line */}
                {ts.started && (
                  <div className="text-[9px] text-gray-400 mt-0.5">
                    {fmtTs(ts.started)}
                    {ts.completed && <> → {fmtTs(ts.completed)} ({fmtDuration(ts.started, ts.completed)})</>}
                  </div>
                )}
              </div>
              <div className="flex gap-1">
                <button onClick={() => upd(step.id, { done: !st.done })}
                  className={`text-[10px] px-2 py-0.5 rounded-full border ${st.done ? 'bg-green-100 border-green-400 text-green-700' : 'border-gray-200 text-gray-400'}`}>
                  {st.done ? '✔ Готово' : '○ В процессе'}
                </button>
              </div>
            </div>

            {/* Content by type */}
            <div className="px-4 py-3">
              {step.type === 'pcr' && <PCRContent step={step} />}
              {step.type === 'purif' && <PurifContent step={step} />}
              {step.type === 'assembly' && <AssemblyContent step={step} />}
              {step.type === 'transform' && <TransformContent />}
              {step.type === 'screening' && <ScreeningContent step={step} />}
              {step.type === 'miniprep' && <div className="text-[11px]">Выделить плазмиду из положительной колонии (ночная культура → kit)</div>}
              {step.type === 'sequencing' && <div className="text-[11px]">Отправить на секвенирование с verify праймерами. {step.sub}</div>}
            </div>

            {/* Student inputs */}
            <div className="px-4 py-3 border-t bg-gray-50">
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[10px] text-gray-500">Факт. размер</label>
                  <input className="w-full border rounded px-2 py-1 text-xs" value={st.actualSize || ''}
                    placeholder={step.sz ? `ожид. ${step.sz}` : ''}
                    onChange={e => upd(step.id, { actualSize: e.target.value })} />
                </div>
                <div>
                  <label className="text-[10px] text-gray-500">{'📷'} Фото</label>
                  <input type="file" accept="image/*" className="w-full text-[10px]"
                    onChange={e => { const f = e.target.files?.[0]; if (!f) return; const r = new FileReader(); r.onload = () => upd(step.id, { photo: r.result, gelUploaded: true }); r.readAsDataURL(f); }} />
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
                  fragmentSequence={step.seq} sourceStep={`Шаг ${step.num} ${step.title}`}
                  onSave={m => handleConcSave(step.id, m)} />
              )}
              {st.measured && (
                <div className="text-[10px] text-green-600 mt-1">
                  {'✅'} Измерено: {st.concentration} нг/µл, {st.volume} µл
                  {ts.measured && <span className="text-gray-400 ml-1">({fmtTs(ts.measured)})</span>}
                </div>
              )}
            </div>
          </div>
        );
      })}
      <button onClick={exportPrint} className="text-xs px-4 py-2 bg-gray-100 rounded-lg hover:bg-gray-200">{'🖨️'} Печать протокола</button>
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

function TransformContent() {
  return (
    <div className="text-[11px] space-y-1">
      <div>Штамм: <input className="border rounded px-2 py-0.5 text-xs w-32" placeholder="AN-003" /></div>
      <div>Метод: <select className="border rounded px-2 py-0.5 text-xs">
        <option>Протопласты</option><option>Электропорация</option><option>Химическая</option>
      </select></div>
    </div>
  );
}

function ScreeningContent({ step }) {
  return (
    <div className="text-[11px]">
      <div className="font-semibold mb-1">Colony PCR (ожид. {step.sz ? `${(step.sz/1000).toFixed(1)} кб` : '?'})</div>
      <div className="grid grid-cols-4 gap-1">
        {[1,2,3,4,5,6,7,8].map(n => (
          <div key={n} className="flex items-center gap-1">
            <span className="text-[10px] text-gray-500">#{n}</span>
            <select className="border rounded text-[10px] px-1"><option>--</option><option>{'✓'} OK</option><option>{'✗'} нет</option></select>
          </div>
        ))}
      </div>
    </div>
  );
}

export { PCR_MIXES, ASSEMBLY_PROTOCOLS };
