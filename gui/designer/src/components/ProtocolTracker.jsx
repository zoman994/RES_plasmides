import { useState } from 'react';
import { t } from '../i18n';

const PCR_MIXES = {
  phusion: {
    name: 'Phusion HF',
    components: [
      { reagent: '5\u00d7 Phusion HF Buffer', volume: 10 },
      { reagent: 'dNTPs (10 mM each)', volume: 1 },
      { reagent: '\u041f\u0440\u0430\u0439\u043c\u0435\u0440 fwd (10 \u00b5M)', volume: 2.5 },
      { reagent: '\u041f\u0440\u0430\u0439\u043c\u0435\u0440 rev (10 \u00b5M)', volume: 2.5 },
      { reagent: 'Template DNA', volume: 1 },
      { reagent: 'Phusion DNA Polymerase', volume: 0.5 },
      { reagent: 'H\u2082O (nuclease-free)', volume: 32.5 },
    ],
    total: 50, extRate: 30, denatTemp: 98, denatTime: 10,
  },
  taq: {
    name: 'Taq',
    components: [
      { reagent: '10\u00d7 Taq Buffer', volume: 5 },
      { reagent: 'dNTPs (10 mM each)', volume: 1 },
      { reagent: '\u041f\u0440\u0430\u0439\u043c\u0435\u0440 fwd (10 \u00b5M)', volume: 2.5 },
      { reagent: '\u041f\u0440\u0430\u0439\u043c\u0435\u0440 rev (10 \u00b5M)', volume: 2.5 },
      { reagent: 'Template DNA', volume: 1 },
      { reagent: 'Taq DNA Polymerase', volume: 0.5 },
      { reagent: 'H\u2082O (nuclease-free)', volume: 37.5 },
    ],
    total: 50, extRate: 60, denatTemp: 95, denatTime: 30,
  },
  kod: {
    name: 'KOD One',
    components: [
      { reagent: '2\u00d7 KOD One Master Mix', volume: 25 },
      { reagent: '\u041f\u0440\u0430\u0439\u043c\u0435\u0440 fwd (10 \u00b5M)', volume: 1.5 },
      { reagent: '\u041f\u0440\u0430\u0439\u043c\u0435\u0440 rev (10 \u00b5M)', volume: 1.5 },
      { reagent: 'Template DNA', volume: 1 },
      { reagent: 'H\u2082O (nuclease-free)', volume: 21 },
    ],
    total: 50, extRate: 20, denatTemp: 98, denatTime: 10,
  },
};

const ASM_PROTOCOLS = {
  overlap_pcr: {
    name: 'Overlap Extension PCR',
    steps: [
      '\u0421\u043c\u0435\u0448\u0430\u0442\u044c \u0444\u0440\u0430\u0433\u043c\u0435\u043d\u0442\u044b \u044d\u043a\u0432\u0438\u043c\u043e\u043b\u044f\u0440\u043d\u043e (~50 \u043d\u0433 \u043a\u0430\u0436\u0434\u044b\u0439)',
      '5\u00d7 HF Buffer (10 \u00b5l), dNTPs (1 \u00b5l), Phusion (0.5 \u00b5l), H\u2082O \u0434\u043e 50 \u00b5l',
      '5 \u0446\u0438\u043a\u043b\u043e\u0432 \u0411\u0415\u0417 \u043f\u0440\u0430\u0439\u043c\u0435\u0440\u043e\u0432 (\u043e\u0442\u0436\u0438\u0433 \u0444\u0440\u0430\u0433\u043c\u0435\u043d\u0442\u043e\u0432)',
      '\u0414\u043e\u0431\u0430\u0432\u0438\u0442\u044c \u0432\u043d\u0435\u0448\u043d\u0438\u0435 \u043f\u0440\u0430\u0439\u043c\u0435\u0440\u044b, 25 \u0446\u0438\u043a\u043b\u043e\u0432',
      '\u0413\u0435\u043b\u044c-\u044d\u043b\u0435\u043a\u0442\u0440\u043e\u0444\u043e\u0440\u0435\u0437 \u2192 \u0432\u044b\u0440\u0435\u0437\u0430\u0442\u044c \u0431\u044d\u043d\u0434 \u2192 \u043e\u0447\u0438\u0441\u0442\u043a\u0430',
    ],
  },
  gibson: {
    name: 'Gibson Assembly',
    steps: [
      '\u0421\u043c\u0435\u0448\u0430\u0442\u044c \u0444\u0440\u0430\u0433\u043c\u0435\u043d\u0442\u044b (50-100 \u043d\u0433, \u0432\u0435\u043a\u0442\u043e\u0440:\u0432\u0441\u0442\u0430\u0432\u043a\u0430 = 1:2)',
      '\u0414\u043e\u0431\u0430\u0432\u0438\u0442\u044c 10 \u00b5l Gibson Master Mix (2\u00d7)',
      'H\u2082O \u0434\u043e 20 \u00b5l',
      '50\u00b0C, 60 \u043c\u0438\u043d',
      '\u0422\u0440\u0430\u043d\u0441\u0444\u043e\u0440\u043c\u0438\u0440\u043e\u0432\u0430\u0442\u044c 2 \u00b5l',
    ],
  },
  golden_gate: {
    name: 'Golden Gate Assembly',
    steps: [
      '75 \u043d\u0433 \u043a\u0430\u0436\u0434\u043e\u0433\u043e \u0444\u0440\u0430\u0433\u043c\u0435\u043d\u0442\u0430 + 75 \u043d\u0433 backbone',
      '1 \u00b5l T4 DNA Ligase + 1 \u00b5l \u0440\u0435\u0441\u0442\u0440\u0438\u043a\u0442\u0430\u0437\u044b',
      '2 \u00b5l 10\u00d7 T4 Ligase Buffer, H\u2082O \u0434\u043e 20 \u00b5l',
      '30 \u0446\u0438\u043a\u043b\u043e\u0432 (37\u00b0C 5\u043c\u0438\u043d / 16\u00b0C 5\u043c\u0438\u043d)',
      '50\u00b0C 5\u043c\u0438\u043d \u2192 80\u00b0C 10\u043c\u0438\u043d',
      '\u0422\u0440\u0430\u043d\u0441\u0444\u043e\u0440\u043c\u0438\u0440\u043e\u0432\u0430\u0442\u044c 5 \u00b5l',
    ],
  },
};

function fmtTime(sec) {
  return sec >= 60 ? `${Math.floor(sec / 60)} \u043c\u0438\u043d ${sec % 60 ? sec % 60 + ' \u0441\u0435\u043a' : ''}` : `${sec} \u0441\u0435\u043a`;
}

function PCRCard({ step }) {
  const mix = step.mix || PCR_MIXES.phusion;
  const extSec = step.extensionTime || 30;
  return (
    <div className="grid grid-cols-2 gap-4">
      <div>
        <div className="text-xs font-semibold mb-2">\u041f\u0426\u0420 \u043c\u0438\u043a\u0441 ({mix.name})</div>
        <table className="text-[11px] w-full">
          <tbody>
            {mix.components.map((c, i) => (
              <tr key={i} className="border-b border-gray-100">
                <td className="py-0.5 pr-3">{c.reagent}</td>
                <td className="py-0.5 text-right font-mono">{c.volume} \u00b5l</td>
              </tr>
            ))}
            <tr className="font-semibold">
              <td className="pt-1">\u0418\u0442\u043e\u0433\u043e:</td>
              <td className="pt-1 text-right font-mono">{mix.total} \u00b5l</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div>
        <div className="text-xs font-semibold mb-2">\u041f\u0440\u043e\u0433\u0440\u0430\u043c\u043c\u0430</div>
        <div className="text-[11px] font-mono bg-gray-50 rounded p-2 space-y-0.5">
          <div>{mix.denatTemp}\u00b0C &nbsp; 30 \u0441\u0435\u043a &nbsp; (\u0434\u0435\u043d\u0430\u0442\u0443\u0440\u0430\u0446\u0438\u044f)</div>
          <div className="text-gray-400">\u2500\u2500\u2500 30 \u0446\u0438\u043a\u043b\u043e\u0432 \u2500\u2500\u2500</div>
          <div>{mix.denatTemp}\u00b0C &nbsp; {mix.denatTime} \u0441\u0435\u043a</div>
          <div>{step.annealTemp}\u00b0C &nbsp; 20 \u0441\u0435\u043a &nbsp; (\u043e\u0442\u0436\u0438\u0433)</div>
          <div>72\u00b0C &nbsp; {fmtTime(extSec)} &nbsp; (\u044d\u043b\u043e\u043d\u0433\u0430\u0446\u0438\u044f)</div>
          <div className="text-gray-400">\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500</div>
          <div>72\u00b0C &nbsp; 5 \u043c\u0438\u043d</div>
          <div>4\u00b0C &nbsp; hold</div>
        </div>
        <div className="text-[10px] text-gray-500 mt-2">
          \u0422\u0435\u043c\u043f\u043b\u0435\u0439\u0442: {step.template} &middot;
          \u041f\u0440\u0430\u0439\u043c\u0435\u0440\u044b: {step.fwdPrimer} + {step.revPrimer}
        </div>
      </div>
    </div>
  );
}

function AssemblyCard({ step }) {
  const proto = step.protocol || ASM_PROTOCOLS.overlap_pcr;
  return (
    <div>
      <div className="text-xs font-semibold mb-2">{proto.name}</div>
      <ol className="text-[11px] space-y-1 list-decimal list-inside">
        {proto.steps.map((s, i) => <li key={i}>{s}</li>)}
      </ol>
      {step.fragments && (
        <div className="text-[10px] text-gray-500 mt-2">
          \u0424\u0440\u0430\u0433\u043c\u0435\u043d\u0442\u044b: {step.fragments.join(' + ')} &middot;
          \u041e\u0436\u0438\u0434\u0430\u0435\u043c\u044b\u0439 \u043f\u0440\u043e\u0434\u0443\u043a\u0442: {(step.expectedSize / 1000).toFixed(1)} \u0442.\u043f.\u043d.
        </div>
      )}
    </div>
  );
}

function TransformCard() {
  return (
    <div className="text-[11px] space-y-1">
      <div>\u0428\u0442\u0430\u043c\u043c: <input className="border rounded px-2 py-0.5 text-xs w-40" placeholder="e.g. AN-003" /></div>
      <div>\u041c\u0435\u0442\u043e\u0434: <select className="border rounded px-2 py-0.5 text-xs">
        <option>\u041f\u0440\u043e\u0442\u043e\u043f\u043b\u0430\u0441\u0442\u044b (PEG)</option>
        <option>\u042d\u043b\u0435\u043a\u0442\u0440\u043e\u043f\u043e\u0440\u0430\u0446\u0438\u044f</option>
        <option>\u0425\u0438\u043c\u0438\u0447\u0435\u0441\u043a\u0430\u044f</option>
      </select></div>
      <div>\u0421\u0435\u043b\u0435\u043a\u0446\u0438\u044f: <input className="border rounded px-2 py-0.5 text-xs w-40" placeholder="pyrG / HygR" /></div>
    </div>
  );
}

function ScreeningCard({ step }) {
  return (
    <div className="text-[11px]">
      <div className="font-semibold mb-1">Colony PCR</div>
      <div>\u041e\u0436\u0438\u0434\u0430\u0435\u043c\u044b\u0439 \u0440\u0430\u0437\u043c\u0435\u0440: {step.expectedSize ? `${(step.expectedSize / 1000).toFixed(1)} \u0442.\u043f.\u043d.` : '?'}</div>
      <div className="grid grid-cols-4 gap-1 mt-2">
        {[1, 2, 3, 4, 5, 6, 7, 8].map(n => (
          <div key={n} className="flex items-center gap-1">
            <span className="text-[10px] text-gray-500">#{n}</span>
            <select className="border rounded text-[10px] px-1">
              <option>--</option>
              <option>\u2713 \u041e\u041a</option>
              <option>\u2717 \u043d\u0435\u0442</option>
              <option>? \u0434\u0440\u0443\u0433\u043e\u0439</option>
            </select>
          </div>
        ))}
      </div>
    </div>
  );
}

function SequencingCard() {
  return (
    <div className="text-[11px]">
      <div className="font-semibold mb-1">\u0421\u0435\u043a\u0432\u0435\u043d\u0438\u0440\u043e\u0432\u0430\u043d\u0438\u0435</div>
      <div className="flex gap-2 mb-2">
        <select className="border rounded text-xs px-2 py-0.5">
          <option>\u041e\u0436\u0438\u0434\u0430\u0435\u0442\u0441\u044f</option>
          <option>\u041e\u0442\u043f\u0440\u0430\u0432\u043b\u0435\u043d\u043e</option>
          <option>\u0421\u043e\u0432\u043f\u0430\u0434\u0430\u0435\u0442 \u2713</option>
          <option>\u0415\u0441\u0442\u044c \u043c\u0443\u0442\u0430\u0446\u0438\u0438 \u2717</option>
        </select>
      </div>
      <div className="text-[10px] text-gray-500">
        \u0417\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u0435 .ab1 \u0444\u0430\u0439\u043b\u044b \u0434\u043b\u044f \u0441\u0440\u0430\u0432\u043d\u0435\u043d\u0438\u044f \u0441 \u043f\u0440\u0435\u0434\u0441\u043a\u0430\u0437\u0430\u043d\u043d\u043e\u0439 \u043f\u043e\u0441\u043b\u0435\u0434\u043e\u0432\u0430\u0442\u0435\u043b\u044c\u043d\u043e\u0441\u0442\u044c\u044e
      </div>
    </div>
  );
}

export default function ProtocolTracker({ steps, onUpdate, polymerase, protocol }) {
  if (!steps || steps.length === 0) return null;

  const exportPrint = () => {
    const html = steps.map((s, i) =>
      `<div style="page-break-inside:avoid;border:1px solid #ddd;border-radius:8px;padding:16px;margin:12px 0">
        <h3 style="margin:0 0 8px">\u0428\u0430\u0433 ${i + 1}: ${s.title} <small style="color:#888">${s.subtitle || ''}</small></h3>
        ${s.type === 'pcr' ? `<p>Template: ${s.template}<br>Primers: ${s.fwdPrimer} + ${s.revPrimer}<br>Anneal: ${s.annealTemp}\u00b0C<br>Expected: ${s.expectedSize} \u043f.\u043d.</p>` : ''}
        ${s.type === 'assembly' ? `<p>${(s.protocol?.steps || []).map((x, j) => `${j + 1}. ${x}`).join('<br>')}</p>` : ''}
        <div style="border-top:1px solid #eee;padding-top:8px;margin-top:8px">
          <span>\u0424\u0430\u043a\u0442. \u0440\u0430\u0437\u043c\u0435\u0440: _____ \u043f.\u043d.</span> &nbsp;
          <span>\u041a\u043e\u043d\u0446.: _____ \u043d\u0433/\u00b5l</span> &nbsp;
          <span>\u041a\u043e\u043c\u043c\u0435\u043d\u0442\u0430\u0440\u0438\u0439: __________</span>
        </div>
      </div>`
    ).join('');
    const w = window.open('', '_blank');
    w.document.write(`<html><head><title>\u041f\u0440\u043e\u0442\u043e\u043a\u043e\u043b \u0441\u0431\u043e\u0440\u043a\u0438</title>
      <style>body{font-family:Inter,sans-serif;font-size:13px;max-width:800px;margin:auto;padding:20px}
      h2{color:#1565C0} @media print{button{display:none}}</style></head><body>
      <h2>\ud83e\uddec \u041f\u0440\u043e\u0442\u043e\u043a\u043e\u043b \u0441\u0431\u043e\u0440\u043a\u0438</h2>
      <button onclick="window.print()">\ud83d\udda8\ufe0f \u041f\u0435\u0447\u0430\u0442\u044c</button>
      ${html}</body></html>`);
    w.document.close();
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-sm font-bold">{'\uD83D\uDCCB'} \u041f\u0440\u043e\u0442\u043e\u043a\u043e\u043b ({steps.length} \u0448\u0430\u0433\u043e\u0432)</h3>
        <button onClick={exportPrint}
          className="text-xs px-3 py-1.5 bg-gray-100 rounded hover:bg-gray-200">
          {'\uD83D\uDDA8\uFE0F'} \u041f\u0435\u0447\u0430\u0442\u044c
        </button>
      </div>

      {steps.map((step, i) => (
        <div key={step.id} className="border rounded-xl bg-white mb-4 overflow-hidden">
          {/* Header */}
          <div className="px-4 py-2.5 bg-gray-50 border-b flex justify-between items-center">
            <div>
              <span className="text-sm font-bold">\u0428\u0430\u0433 {i + 1}: {step.title}</span>
              {step.subtitle && <span className="text-xs text-gray-500 ml-2">{step.subtitle}</span>}
            </div>
            <div className="flex gap-1">
              {(step.statuses || []).map((s, si) => (
                <button key={si}
                  onClick={() => {
                    const ns = [...step.statuses];
                    ns[si] = { ...ns[si], done: !ns[si].done };
                    onUpdate(step.id, { statuses: ns });
                  }}
                  className={`text-[10px] px-2 py-0.5 rounded-full border transition ${
                    s.done ? 'bg-green-100 border-green-400 text-green-700' : 'border-gray-200 text-gray-400'}`}>
                  {s.done ? '\u25cf' : '\u25cb'} {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Content */}
          <div className="px-4 py-3">
            {step.type === 'pcr' && <PCRCard step={step} />}
            {step.type === 'assembly' && <AssemblyCard step={step} />}
            {step.type === 'transform' && <TransformCard />}
            {step.type === 'screening' && <ScreeningCard step={step} />}
            {step.type === 'sequencing' && <SequencingCard />}
          </div>

          {/* Student input */}
          <div className="px-4 py-3 border-t bg-gray-50">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-[10px] text-gray-500">\u0424\u0430\u043a\u0442. \u0440\u0430\u0437\u043c\u0435\u0440 (\u043f.\u043d.)</label>
                <input className="w-full border rounded px-2 py-1 text-xs"
                  placeholder={step.expectedSize ? `\u043e\u0436\u0438\u0434. ${step.expectedSize}` : ''}
                  value={step.actualSize || ''}
                  onChange={e => onUpdate(step.id, { actualSize: e.target.value })} />
              </div>
              <div>
                <label className="text-[10px] text-gray-500">\u041a\u043e\u043d\u0446. (\u043d\u0433/\u00b5l)</label>
                <input className="w-full border rounded px-2 py-1 text-xs"
                  value={step.concentration || ''}
                  onChange={e => onUpdate(step.id, { concentration: e.target.value })} />
              </div>
              <div>
                <label className="text-[10px] text-gray-500">{'\uD83D\uDCF7'} \u0424\u043e\u0442\u043e \u0433\u0435\u043b\u044f</label>
                <input type="file" accept="image/*" className="w-full text-[10px]"
                  onChange={e => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    const r = new FileReader();
                    r.onload = () => onUpdate(step.id, { gelPhoto: r.result });
                    r.readAsDataURL(f);
                  }} />
              </div>
            </div>
            <div className="mt-2">
              <label className="text-[10px] text-gray-500">\u041a\u043e\u043c\u043c\u0435\u043d\u0442\u0430\u0440\u0438\u0439</label>
              <textarea className="w-full border rounded px-2 py-1 text-xs h-10"
                value={step.comment || ''}
                onChange={e => onUpdate(step.id, { comment: e.target.value })} />
            </div>
            {step.gelPhoto && (
              <img src={step.gelPhoto} alt="\u0413\u0435\u043b\u044c" className="mt-2 max-h-40 rounded border" />
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export { PCR_MIXES, ASM_PROTOCOLS };
