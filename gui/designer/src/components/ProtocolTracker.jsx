import { useState, useEffect, useMemo } from 'react';
import ConcentrationInput from './ConcentrationInput';
import { PCR_MIXES, PURIFICATION, ASSEMBLY_PROTOCOLS, calcPCRTime, fmtTime, suggestPurif, calcAssemblyMix } from '../protocol-data';
import { addToInventory } from '../inventory';

export default function ProtocolTracker({ fragments, primers, pcrSizes, polymerase, protocol, circular, assemblyId, onInventoryUpdate }) {
  const stateKey = `pvcs-protocol-state-${assemblyId || 'default'}`;
  const [states, setStatesRaw] = useState(() => {
    try { return JSON.parse(localStorage.getItem(stateKey) || '{}'); } catch { return {}; }
  });

  // Reload when assembly changes
  useEffect(() => {
    try { setStatesRaw(JSON.parse(localStorage.getItem(stateKey) || '{}')); } catch { setStatesRaw({}); }
  }, [stateKey]);

  const upd = (id, data) => {
    setStatesRaw(prev => {
      const next = { ...prev, [id]: { ...prev[id], ...data } };
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
      s.push({ id: `pcr_${i}`, num: n, type: 'pcr', title: `\u041f\u0426\u0420 ${frag.name}`, sub: `${sz} \u043f.\u043d.`,
        frag: frag.name, fwd: fwd?.name, rev: rev?.name, anneal, sz, ext: tm.extSec, timeMin: tm.totalMin,
        mix: PCR_MIXES[polymerase], seq: frag.sequence, fragLen: frag.length });
      // Purification sub-step
      const isLast = !fragments.slice(i + 1).some(f => f.needsAmplification);
      const purif = suggestPurif('pcr', protocol, isLast);
      n++;
      s.push({ id: `purif_${i}`, num: n, type: 'purif', title: `\u041e\u0447\u0438\u0441\u0442\u043a\u0430 ${frag.name}`,
        sub: PURIFICATION[purif]?.name || '?', purif, frag: frag.name, sz, seq: frag.sequence, fragLen: frag.length });
    });
    // Assembly
    n++;
    const asm = ASSEMBLY_PROTOCOLS[protocol] || ASSEMBLY_PROTOCOLS.gibson;
    const totalSz = fragments.reduce((sum, f) => sum + (f.length || 0), 0);
    s.push({ id: 'assembly', num: n, type: 'assembly', title: `\u0421\u0431\u043e\u0440\u043a\u0430 \u2014 ${asm.name}`,
      sub: `${totalSz} \u043f.\u043d.`, asm, method: protocol, sz: totalSz,
      frags: fragments.filter(f => f.needsAmplification).map(f => f.name) });
    // Post-assembly purification
    if (asm.postPurif && asm.postPurif !== 'none') {
      n++;
      s.push({ id: 'purif_asm', num: n, type: 'purif', title: '\u041e\u0447\u0438\u0441\u0442\u043a\u0430 \u043f\u043e\u0441\u043b\u0435 \u0441\u0431\u043e\u0440\u043a\u0438',
        sub: PURIFICATION[asm.postPurif]?.name || '?', purif: asm.postPurif, frag: 'construct', sz: totalSz });
    }
    // Transform + screening + miniprep + sequencing
    n++; s.push({ id: 'transform', num: n, type: 'transform', title: '\u0422\u0440\u0430\u043d\u0441\u0444\u043e\u0440\u043c\u0430\u0446\u0438\u044f' });
    n++; s.push({ id: 'screening', num: n, type: 'screening', title: 'Colony PCR', sub: `\u043e\u0436\u0438\u0434. ${(totalSz/1000).toFixed(1)} \u043a\u0431`, sz: totalSz });
    n++; s.push({ id: 'miniprep', num: n, type: 'miniprep', title: '\u041c\u0438\u043d\u0438-\u043f\u0440\u0435\u043f' });
    n++; s.push({ id: 'sequencing', num: n, type: 'sequencing', title: '\u0421\u0435\u043a\u0432\u0435\u043d\u0438\u0440\u043e\u0432\u0430\u043d\u0438\u0435',
      sub: totalSz > 1500 ? `${Math.ceil(totalSz / 700)} \u0440\u0435\u0430\u043a\u0446\u0438\u0439` : '2 \u0440\u0435\u0430\u043a\u0446\u0438\u0438' });
    return s;
  }, [fragments, primers, pcrSizes, polymerase, protocol]);

  // Assembly mix from measured concentrations
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

  const exportPrint = () => {
    const html = steps.map((s, i) =>
      `<div style="page-break-inside:avoid;border:1px solid #ddd;border-radius:8px;padding:16px;margin:12px 0">
      <h3>\u0428\u0430\u0433 ${s.num}: ${s.title} <small style="color:#888">${s.sub || ''}</small></h3>
      ${s.type === 'pcr' ? `<p>\u0422\u0435\u043c\u043f\u043b\u0435\u0439\u0442: ${s.frag}<br>\u041f\u0440\u0430\u0439\u043c\u0435\u0440\u044b: ${s.fwd} + ${s.rev}<br>Anneal: ${s.anneal}\u00b0C<br>\u041e\u0436\u0438\u0434.: ${s.sz} \u043f.\u043d.</p>` : ''}
      ${s.type === 'assembly' ? `<ol>${(s.asm?.steps || []).map(x => `<li>${x}</li>`).join('')}</ol>` : ''}
      <div style="border-top:1px solid #eee;padding-top:8px;margin-top:8px">\u0424\u0430\u043a\u0442.: _____ \u043f.\u043d. &nbsp; \u041a\u043e\u043d\u0446.: _____ \u043d\u0433/\u00b5l &nbsp; \u041a\u043e\u043c\u043c.: __________</div></div>`
    ).join('');
    const w = window.open('', '_blank');
    w.document.write(`<html><head><title>\u041f\u0440\u043e\u0442\u043e\u043a\u043e\u043b</title><style>body{font:13px Inter,sans-serif;max-width:800px;margin:auto;padding:20px}h2{color:#1565C0}@media print{button{display:none}}</style></head><body><h2>\ud83e\uddec \u041f\u0440\u043e\u0442\u043e\u043a\u043e\u043b \u0441\u0431\u043e\u0440\u043a\u0438</h2><button onclick="print()">\ud83d\udda8 \u041f\u0435\u0447\u0430\u0442\u044c</button>${html}</body></html>`);
    w.document.close();
  };

  if (!steps.length) return null;

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-bold">{'\uD83D\uDCCB'} \u041f\u0440\u043e\u0442\u043e\u043a\u043e\u043b ({steps.length} \u0448\u0430\u0433\u043e\u0432)</h3>
        <button onClick={exportPrint} className="text-xs px-3 py-1.5 bg-gray-100 rounded hover:bg-gray-200">{'\uD83D\uDDA8\uFE0F'} \u041f\u0435\u0447\u0430\u0442\u044c</button>
      </div>

      {/* Assembly mix calculator */}
      {asmMix && (
        <div className="border border-green-200 bg-green-50 rounded-xl p-4">
          <h4 className="text-xs font-bold text-green-800 mb-2">{'\uD83E\uDDEA'} \u0420\u0430\u0441\u0447\u0451\u0442 \u0441\u0431\u043e\u0440\u043e\u0447\u043d\u043e\u0433\u043e \u043c\u0438\u043a\u0441\u0430 (\u0438\u0437 \u0440\u0435\u0430\u043b\u044c\u043d\u044b\u0445 \u043a\u043e\u043d\u0446.)</h4>
          <table className="text-[11px] w-full">
            <tbody>
              {asmMix.frags.map((f, i) => (
                <tr key={i} className="border-b border-green-100">
                  <td className="py-1">{f.name}</td>
                  <td className="py-1 text-right font-mono">{f.concentration} \u043d\u0433/\u00b5l</td>
                  <td className="py-1 text-right font-mono font-bold">{f.ul} \u00b5l</td>
                  <td className="py-1 text-right text-green-600">{f.target} \u043d\u0433</td>
                </tr>
              ))}
              {asmMix.reagents.map((r, i) => (
                <tr key={`r${i}`} className="border-b border-green-100 text-green-700">
                  <td className="py-1" colSpan={2}>{r.r}</td>
                  <td className="py-1 text-right font-mono">{r.v} \u00b5l</td>
                  <td></td>
                </tr>
              ))}
              <tr className="border-b border-green-100 text-green-700">
                <td className="py-1" colSpan={2}>H\u2082O</td>
                <td className="py-1 text-right font-mono">{asmMix.water} \u00b5l</td>
                <td></td>
              </tr>
              <tr className="font-bold text-green-800">
                <td className="pt-1" colSpan={2}>\u0418\u0442\u043e\u0433\u043e:</td>
                <td className="pt-1 text-right font-mono">{asmMix.total} \u00b5l</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Step cards */}
      {steps.map(step => {
        const st = states[step.id] || {};
        return (
          <div key={step.id} className="border rounded-xl bg-white overflow-hidden">
            {/* Header */}
            <div className="px-4 py-2.5 bg-gray-50 border-b flex justify-between items-center">
              <div>
                <span className="text-sm font-bold">\u0428\u0430\u0433 {step.num}: {step.title}</span>
                {step.sub && <span className="text-xs text-gray-500 ml-2">{step.sub}</span>}
              </div>
              <div className="flex gap-1">
                {['done'].map(k => (
                  <button key={k} onClick={() => upd(step.id, { done: !st.done })}
                    className={`text-[10px] px-2 py-0.5 rounded-full border ${st.done ? 'bg-green-100 border-green-400 text-green-700' : 'border-gray-200 text-gray-400'}`}>
                    {st.done ? '\u2714 \u0413\u043e\u0442\u043e\u0432\u043e' : '\u25cb \u0412 \u043f\u0440\u043e\u0446\u0435\u0441\u0441\u0435'}
                  </button>
                ))}
              </div>
            </div>

            {/* Content by type */}
            <div className="px-4 py-3">
              {step.type === 'pcr' && <PCRContent step={step} />}
              {step.type === 'purif' && <PurifContent step={step} />}
              {step.type === 'assembly' && <AssemblyContent step={step} />}
              {step.type === 'transform' && <TransformContent />}
              {step.type === 'screening' && <ScreeningContent step={step} />}
              {step.type === 'miniprep' && <div className="text-[11px]">\u0412\u044b\u0434\u0435\u043b\u0438\u0442\u044c \u043f\u043b\u0430\u0437\u043c\u0438\u0434\u0443 \u0438\u0437 \u043f\u043e\u043b\u043e\u0436\u0438\u0442\u0435\u043b\u044c\u043d\u043e\u0439 \u043a\u043e\u043b\u043e\u043d\u0438\u0438 (\u043d\u043e\u0447\u043d\u0430\u044f \u043a\u0443\u043b\u044c\u0442\u0443\u0440\u0430 \u2192 kit)</div>}
              {step.type === 'sequencing' && <div className="text-[11px]">\u041e\u0442\u043f\u0440\u0430\u0432\u0438\u0442\u044c \u043d\u0430 \u0441\u0435\u043a\u0432\u0435\u043d\u0438\u0440\u043e\u0432\u0430\u043d\u0438\u0435 \u0441 verify \u043f\u0440\u0430\u0439\u043c\u0435\u0440\u0430\u043c\u0438. {step.sub}</div>}
            </div>

            {/* Student inputs */}
            <div className="px-4 py-3 border-t bg-gray-50">
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[10px] text-gray-500">\u0424\u0430\u043a\u0442. \u0440\u0430\u0437\u043c\u0435\u0440</label>
                  <input className="w-full border rounded px-2 py-1 text-xs" value={st.actualSize || ''}
                    placeholder={step.sz ? `\u043e\u0436\u0438\u0434. ${step.sz}` : ''}
                    onChange={e => upd(step.id, { actualSize: e.target.value })} />
                </div>
                <div>
                  <label className="text-[10px] text-gray-500">{'\uD83D\uDCF7'} \u0424\u043e\u0442\u043e</label>
                  <input type="file" accept="image/*" className="w-full text-[10px]"
                    onChange={e => { const f = e.target.files?.[0]; if (!f) return; const r = new FileReader(); r.onload = () => upd(step.id, { photo: r.result }); r.readAsDataURL(f); }} />
                </div>
                <div>
                  <label className="text-[10px] text-gray-500">\u041a\u043e\u043c\u043c\u0435\u043d\u0442\u0430\u0440\u0438\u0439</label>
                  <input className="w-full border rounded px-2 py-1 text-xs" value={st.comment || ''}
                    onChange={e => upd(step.id, { comment: e.target.value })} />
                </div>
              </div>
              {st.photo && <img src={st.photo} alt="gel" className="mt-2 max-h-32 rounded border" />}

              {/* Concentration input for purification steps */}
              {(step.type === 'purif' || step.type === 'miniprep') && !st.measured && (
                <ConcentrationInput fragmentName={step.frag || 'construct'} fragmentLength={step.fragLen || step.sz}
                  fragmentSequence={step.seq} sourceStep={`\u0428\u0430\u0433 ${step.num} ${step.title}`}
                  onSave={m => handleConcSave(step.id, m)} />
              )}
              {st.measured && (
                <div className="text-[10px] text-green-600 mt-1">{'\u2705'} \u0418\u0437\u043c\u0435\u0440\u0435\u043d\u043e: {st.concentration} \u043d\u0433/\u00b5\u043b, {st.volume} \u00b5\u043b</div>
              )}
            </div>
          </div>
        );
      })}
      <button onClick={exportPrint} className="text-xs px-4 py-2 bg-gray-100 rounded-lg hover:bg-gray-200">{'\uD83D\uDDA8\uFE0F'} \u041f\u0435\u0447\u0430\u0442\u044c \u043f\u0440\u043e\u0442\u043e\u043a\u043e\u043b\u0430</button>
    </div>
  );
}

function PCRContent({ step }) {
  const m = step.mix || PCR_MIXES.phusion;
  return (
    <div className="grid grid-cols-2 gap-4">
      <div>
        <div className="text-xs font-semibold mb-1">\u041f\u0426\u0420 \u043c\u0438\u043a\u0441 ({m.name})</div>
        <table className="text-[11px] w-full"><tbody>
          {m.components.map((c, i) => (
            <tr key={i} className="border-b border-gray-100">
              <td className="py-0.5">{c.reagent}</td>
              <td className="py-0.5 text-right font-mono">{c.volume !== null ? `${c.volume} \u00b5l` : c.note || ''}</td>
            </tr>
          ))}
          <tr className="font-semibold"><td className="pt-1">\u0418\u0442\u043e\u0433\u043e:</td><td className="pt-1 text-right font-mono">{m.total} \u00b5l</td></tr>
        </tbody></table>
      </div>
      <div>
        <div className="text-xs font-semibold mb-1">\u041f\u0440\u043e\u0433\u0440\u0430\u043c\u043c\u0430</div>
        <div className="text-[11px] font-mono bg-gray-50 rounded p-2 space-y-0.5">
          <div>{m.denatT}\u00b0C {fmtTime(m.initDenatS)}</div>
          <div className="text-gray-400">\u2500\u2500\u2500 30 \u0446\u0438\u043a\u043b\u043e\u0432 \u2500\u2500\u2500</div>
          <div>{m.denatT}\u00b0C {m.denatS} \u0441\u0435\u043a</div>
          <div>{step.anneal}\u00b0C 20 \u0441\u0435\u043a (\u043e\u0442\u0436\u0438\u0433)</div>
          <div>{m.extT}\u00b0C {fmtTime(step.ext)} (\u044d\u043b\u043e\u043d\u0433.)</div>
          <div className="text-gray-400">\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500</div>
          <div>{m.extT}\u00b0C {fmtTime(m.finalExtS)}</div>
          <div>4\u00b0C hold</div>
        </div>
        <div className="text-[10px] text-gray-500 mt-1">\u041f\u0440\u0430\u0439\u043c\u0435\u0440\u044b: {step.fwd} + {step.rev} | ~{step.timeMin} \u043c\u0438\u043d</div>
      </div>
    </div>
  );
}

function PurifContent({ step }) {
  const p = PURIFICATION[step.purif] || PURIFICATION.column_pcr;
  return (
    <div className="text-[11px]">
      <div className="font-semibold">{p.icon} {p.name}</div>
      <div className="text-gray-500">\u0412\u0440\u0435\u043c\u044f: ~{p.time} \u043c\u0438\u043d | \u0412\u044b\u0445\u043e\u0434: {p.recovery}</div>
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
      {step.frags && <div className="text-[10px] text-gray-500 mt-1">\u0424\u0440\u0430\u0433\u043c\u0435\u043d\u0442\u044b: {step.frags.join(' + ')}</div>}
    </div>
  );
}

function TransformContent() {
  return (
    <div className="text-[11px] space-y-1">
      <div>\u0428\u0442\u0430\u043c\u043c: <input className="border rounded px-2 py-0.5 text-xs w-32" placeholder="AN-003" /></div>
      <div>\u041c\u0435\u0442\u043e\u0434: <select className="border rounded px-2 py-0.5 text-xs">
        <option>\u041f\u0440\u043e\u0442\u043e\u043f\u043b\u0430\u0441\u0442\u044b</option><option>\u042d\u043b\u0435\u043a\u0442\u0440\u043e\u043f\u043e\u0440\u0430\u0446\u0438\u044f</option><option>\u0425\u0438\u043c\u0438\u0447\u0435\u0441\u043a\u0430\u044f</option>
      </select></div>
    </div>
  );
}

function ScreeningContent({ step }) {
  return (
    <div className="text-[11px]">
      <div className="font-semibold mb-1">Colony PCR (\u043e\u0436\u0438\u0434. {step.sz ? `${(step.sz/1000).toFixed(1)} \u043a\u0431` : '?'})</div>
      <div className="grid grid-cols-4 gap-1">
        {[1,2,3,4,5,6,7,8].map(n => (
          <div key={n} className="flex items-center gap-1">
            <span className="text-[10px] text-gray-500">#{n}</span>
            <select className="border rounded text-[10px] px-1"><option>--</option><option>{'\u2713'} OK</option><option>{'\u2717'} \u043d\u0435\u0442</option></select>
          </div>
        ))}
      </div>
    </div>
  );
}

export { PCR_MIXES, ASSEMBLY_PROTOCOLS };
