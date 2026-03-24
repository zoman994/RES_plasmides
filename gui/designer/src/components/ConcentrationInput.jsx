import { useState } from 'react';

export default function ConcentrationInput({ fragmentName, fragmentLength, fragmentSequence, sourceStep, onSave }) {
  const [conc, setConc] = useState('');
  const [vol, setVol] = useState('30');
  const [method, setMethod] = useState('nanodrop');
  const [a280, setA280] = useState('');
  const [a230, setA230] = useState('');
  const [location, setLocation] = useState('');

  const totalDNA = conc && vol ? (parseFloat(conc) * parseFloat(vol)).toFixed(0) : '\u2014';
  const qualityOk = method !== 'nanodrop' || ((!a280 || (parseFloat(a280) >= 1.7 && parseFloat(a280) <= 2.1)) && (!a230 || parseFloat(a230) >= 1.5));
  const canSave = conc && vol && parseFloat(conc) > 0;

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mt-2">
      <h4 className="text-xs font-semibold text-blue-800 mb-2">{'\uD83D\uDCCA'} \u0418\u0437\u043c\u0435\u0440\u0435\u043d\u0438\u0435: {fragmentName}</h4>
      <div className="grid grid-cols-4 gap-2 mb-2">
        <div>
          <label className="text-[10px] text-blue-600">\u041a\u043e\u043d\u0446. (\u043d\u0433/\u00b5\u043b)</label>
          <input type="number" step="0.1" min="0" value={conc} onChange={e => setConc(e.target.value)}
            className="w-full border border-blue-300 rounded px-2 py-1.5 text-sm font-mono outline-none focus:border-blue-500" />
        </div>
        <div>
          <label className="text-[10px] text-blue-600">\u041e\u0431\u044a\u0451\u043c (\u00b5\u043b)</label>
          <input type="number" step="1" min="1" value={vol} onChange={e => setVol(e.target.value)}
            className="w-full border border-blue-300 rounded px-2 py-1.5 text-sm font-mono outline-none focus:border-blue-500" />
        </div>
        <div>
          <label className="text-[10px] text-blue-600">\u041c\u0435\u0442\u043e\u0434</label>
          <select value={method} onChange={e => setMethod(e.target.value)}
            className="w-full border border-blue-300 rounded px-2 py-1.5 text-xs outline-none">
            <option value="nanodrop">NanoDrop</option>
            <option value="qubit">Qubit</option>
            <option value="gel">\u041f\u043e \u0433\u0435\u043b\u044e</option>
          </select>
        </div>
        <div>
          <label className="text-[10px] text-blue-600">\u0418\u0442\u043e\u0433\u043e \u0414\u041d\u041a</label>
          <div className="border border-blue-200 rounded px-2 py-1.5 text-sm font-mono bg-white font-bold text-blue-800">{totalDNA} \u043d\u0433</div>
        </div>
      </div>
      {method === 'nanodrop' && (
        <div className="grid grid-cols-2 gap-2 mb-2">
          <div>
            <label className="text-[10px] text-blue-600">A260/280 (1.8-2.0)</label>
            <input type="number" step="0.01" value={a280} onChange={e => setA280(e.target.value)}
              className={`w-full border rounded px-2 py-1 text-xs font-mono outline-none ${a280 && (parseFloat(a280) < 1.7 || parseFloat(a280) > 2.1) ? 'border-amber-400 bg-amber-50' : 'border-blue-300'}`} />
          </div>
          <div>
            <label className="text-[10px] text-blue-600">A260/230 (\u22651.8)</label>
            <input type="number" step="0.01" value={a230} onChange={e => setA230(e.target.value)}
              className={`w-full border rounded px-2 py-1 text-xs font-mono outline-none ${a230 && parseFloat(a230) < 1.5 ? 'border-amber-400 bg-amber-50' : 'border-blue-300'}`} />
          </div>
        </div>
      )}
      {!qualityOk && <div className="text-[10px] text-amber-700 bg-amber-50 rounded px-2 py-1 mb-2">{'\u26a0'} A260/280 \u0438\u043b\u0438 A260/230 \u0432\u043d\u0435 \u043d\u043e\u0440\u043c\u044b</div>}
      <div className="mb-2">
        <label className="text-[10px] text-blue-600">\u0425\u0440\u0430\u043d\u0435\u043d\u0438\u0435</label>
        <input value={location} onChange={e => setLocation(e.target.value)} placeholder="-20\u00b0C, \u0448\u0442\u0430\u0442\u0438\u0432 3, A7"
          className="w-full border border-blue-300 rounded px-2 py-1 text-xs outline-none" />
      </div>
      <button onClick={() => onSave({
        name: fragmentName, type: sourceStep?.includes('miniprep') ? 'plasmid' : 'pcr_product',
        sequence: fragmentSequence || '', length: fragmentLength || 0,
        concentration: parseFloat(conc), volume: parseFloat(vol), totalDNA: parseFloat(totalDNA),
        method, a260_280: a280 ? parseFloat(a280) : null, a260_230: a230 ? parseFloat(a230) : null,
        location, source: sourceStep || 'manual',
      })} disabled={!canSave}
        className="text-xs bg-blue-600 text-white px-4 py-1.5 rounded-lg hover:bg-blue-700 transition disabled:opacity-50">
        {'\uD83D\uDCBE'} \u0421\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c \u2192 \u0434\u043e\u0431\u0430\u0432\u0438\u0442\u044c \u0432 \u0438\u043c\u0435\u044e\u0449\u0438\u0435\u0441\u044f
      </button>
    </div>
  );
}
