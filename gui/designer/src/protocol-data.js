/** Protocol reference data: PCR mixes, purification, assembly, timeline calculation. */

export const PCR_MIXES = {
  phusion: {
    name: 'Phusion HF', vendor: 'Thermo/NEB',
    components: [
      { reagent: '5\u00d7 Phusion HF Buffer', volume: 10 },
      { reagent: 'dNTPs (10 mM each)', volume: 1 },
      { reagent: '\u041f\u0440\u0430\u0439\u043c\u0435\u0440 fwd (10 \u00b5M)', volume: 2.5 },
      { reagent: '\u041f\u0440\u0430\u0439\u043c\u0435\u0440 rev (10 \u00b5M)', volume: 2.5 },
      { reagent: '\u041c\u0430\u0442\u0440\u0438\u0446\u0430 \u0414\u041d\u041a', volume: 1, note: '1-10 \u043d\u0433' },
      { reagent: 'Phusion (2 U/\u00b5l)', volume: 0.5 },
      { reagent: 'H\u2082O', volume: 32.5 },
    ],
    total: 50, extRate: 30, denatT: 98, denatS: 10, initDenatS: 30, extT: 72, finalExtS: 300,
    fidelity: '50\u00d7 Taq',
  },
  taq: {
    name: 'Taq', vendor: 'Thermo/\u0415\u0432\u0440\u043e\u0433\u0435\u043d',
    components: [
      { reagent: '10\u00d7 Taq Buffer (+KCl)', volume: 5 },
      { reagent: 'MgCl\u2082 (25 mM)', volume: 3 },
      { reagent: 'dNTPs (10 mM each)', volume: 1 },
      { reagent: '\u041f\u0440\u0430\u0439\u043c\u0435\u0440 fwd (10 \u00b5M)', volume: 2.5 },
      { reagent: '\u041f\u0440\u0430\u0439\u043c\u0435\u0440 rev (10 \u00b5M)', volume: 2.5 },
      { reagent: '\u041c\u0430\u0442\u0440\u0438\u0446\u0430 \u0414\u041d\u041a', volume: 1 },
      { reagent: 'Taq (5 U/\u00b5l)', volume: 0.5 },
      { reagent: 'H\u2082O', volume: 34.5 },
    ],
    total: 50, extRate: 60, denatT: 95, denatS: 30, initDenatS: 180, extT: 72, finalExtS: 600,
    fidelity: '\u0431\u0430\u0437\u043e\u0432\u0430\u044f',
  },
  kod: {
    name: 'KOD One', vendor: 'Toyobo',
    components: [
      { reagent: '2\u00d7 KOD One Master Mix', volume: 25 },
      { reagent: '\u041f\u0440\u0430\u0439\u043c\u0435\u0440 fwd (10 \u00b5M)', volume: 1.5 },
      { reagent: '\u041f\u0440\u0430\u0439\u043c\u0435\u0440 rev (10 \u00b5M)', volume: 1.5 },
      { reagent: '\u041c\u0430\u0442\u0440\u0438\u0446\u0430 \u0414\u041d\u041a', volume: 1 },
      { reagent: 'H\u2082O', volume: 21 },
    ],
    total: 50, extRate: 20, denatT: 98, denatS: 10, initDenatS: 120, extT: 68, finalExtS: 120,
    fidelity: '80\u00d7 Taq',
  },
  colony_taq: {
    name: 'Colony PCR (Taq)', vendor: '-',
    components: [
      { reagent: '10\u00d7 Taq Buffer', volume: 2.5 },
      { reagent: 'MgCl\u2082 (25 mM)', volume: 1.5 },
      { reagent: 'dNTPs (10 mM)', volume: 0.5 },
      { reagent: '\u041f\u0440\u0430\u0439\u043c\u0435\u0440 fwd (10 \u00b5M)', volume: 1 },
      { reagent: '\u041f\u0440\u0430\u0439\u043c\u0435\u0440 rev (10 \u00b5M)', volume: 1 },
      { reagent: '\u041a\u043e\u043b\u043e\u043d\u0438\u044f', volume: null, note: '\u0437\u0443\u0431\u043e\u0447\u0438\u0441\u0442\u043a\u043e\u0439' },
      { reagent: 'Taq (5 U/\u00b5l)', volume: 0.2 },
      { reagent: 'H\u2082O', volume: 18.3 },
    ],
    total: 25, extRate: 60, denatT: 95, denatS: 30, initDenatS: 600, extT: 72, finalExtS: 600,
    fidelity: '\u0441\u043a\u0440\u0438\u043d\u0438\u043d\u0433',
  },
};

export const PURIFICATION = {
  column_pcr: { name: '\u041e\u0447\u0438\u0441\u0442\u043a\u0430 \u043d\u0430 \u043a\u043e\u043b\u043e\u043d\u043a\u0435', icon: '\uD83E\uDDEB', time: 15, recovery: '80-95%' },
  column_gel: { name: '\u0413\u0435\u043b\u044c-\u044d\u043a\u0441\u0442\u0440\u0430\u043a\u0446\u0438\u044f', icon: '\uD83D\uDD2A', time: 70, recovery: '50-80%' },
  ethanol:    { name: 'EtOH \u043f\u0440\u0435\u0446\u0438\u043f\u0438\u0442\u0430\u0446\u0438\u044f', icon: '\uD83E\uDDCA', time: 55, recovery: '70-90%' },
  gel_squeeze:{ name: '\u041e\u0442\u0436\u0438\u043c + \u0440\u0435\u0430\u043c\u043f\u043b\u0438\u0444\u0438\u043a\u0430\u0446\u0438\u044f', icon: '\uD83E\uDEE7', time: 60, recovery: '\u043d\u0438\u0437\u043a\u0438\u0439 (\u0445\u0432\u0430\u0442\u0430\u0435\u0442 \u0434\u043b\u044f \u041f\u0426\u0420)' },
  none:       { name: '\u041d\u0430\u043f\u0440\u044f\u043c\u0443\u044e', icon: '\u27a1\ufe0f', time: 0, recovery: '100%' },
};

export const ASSEMBLY_PROTOCOLS = {
  overlap_pcr: {
    name: 'Overlap Extension PCR',
    steps: [
      '\u0421\u043c\u0435\u0448\u0430\u0442\u044c \u0444\u0440\u0430\u0433\u043c\u0435\u043d\u0442\u044b \u044d\u043a\u0432\u0438\u043c\u043e\u043b\u044f\u0440\u043d\u043e (~50 \u043d\u0433)',
      '5\u00d7 HF Buffer (10 \u00b5l), dNTPs (1 \u00b5l), Phusion (0.5 \u00b5l), H\u2082O \u0434\u043e 50 \u00b5l',
      '5 \u0446\u0438\u043a\u043b\u043e\u0432 \u0411\u0415\u0417 \u043f\u0440\u0430\u0439\u043c\u0435\u0440\u043e\u0432',
      '\u0414\u043e\u0431\u0430\u0432\u0438\u0442\u044c \u0432\u043d\u0435\u0448\u043d\u0438\u0435 \u043f\u0440\u0430\u0439\u043c\u0435\u0440\u044b, 25 \u0446\u0438\u043a\u043b\u043e\u0432',
      '\u0413\u0435\u043b\u044c \u2192 \u043e\u0442\u0436\u0438\u043c \u2192 \u0440\u0435\u0430\u043c\u043f\u043b\u0438\u0444\u0438\u043a\u0430\u0446\u0438\u044f',
    ],
    postPurif: 'gel_squeeze', time: 90,
  },
  gibson: {
    name: 'Gibson Assembly',
    steps: [
      '\u0421\u043c\u0435\u0448\u0430\u0442\u044c \u0444\u0440\u0430\u0433\u043c\u0435\u043d\u0442\u044b (50-100 \u043d\u0433, \u0432\u0435\u043a\u0442\u043e\u0440:\u0432\u0441\u0442\u0430\u0432\u043a\u0430 1:2)',
      '10 \u00b5l Gibson Master Mix (2\u00d7), H\u2082O \u0434\u043e 20 \u00b5l',
      '50\u00b0C, 60 \u043c\u0438\u043d',
      '\u0422\u0440\u0430\u043d\u0441\u0444\u043e\u0440\u043c\u0438\u0440\u043e\u0432\u0430\u0442\u044c 2 \u00b5l',
    ],
    postPurif: 'none', time: 70,
  },
  golden_gate: {
    name: 'Golden Gate Assembly',
    steps: [
      '75 \u043d\u0433 \u043a\u0430\u0436\u0434\u043e\u0433\u043e + 75 \u043d\u0433 backbone',
      'T4 Ligase (1 \u00b5l) + \u0440\u0435\u0441\u0442\u0440\u0438\u043a\u0442\u0430\u0437\u0430 (1 \u00b5l) + Buffer (2 \u00b5l)',
      '30 \u0446\u0438\u043a\u043b\u043e\u0432 (37\u00b0C 5\u043c\u0438\u043d / 16\u00b0C 5\u043c\u0438\u043d)',
      '50\u00b0C 5\u043c\u0438\u043d \u2192 80\u00b0C 10\u043c\u0438\u043d \u2192 \u0442\u0440\u0430\u043d\u0441\u0444. 5 \u00b5l',
    ],
    postPurif: 'none', time: 200,
  },
};

export function calcPCRTime(sizeBp, polymerase) {
  const m = PCR_MIXES[polymerase] || PCR_MIXES.phusion;
  const ext = Math.ceil(sizeBp / 1000) * m.extRate;
  const cycle = m.denatS + 20 + ext; // denature + anneal(20s) + extension
  const total = m.initDenatS + 30 * cycle + m.finalExtS;
  return { extSec: ext, totalMin: Math.ceil(total / 60) };
}

export function fmtTime(sec) {
  if (sec >= 60) { const m = Math.floor(sec / 60); const s = sec % 60; return s ? `${m} \u043c\u0438\u043d ${s} \u0441\u0435\u043a` : `${m} \u043c\u0438\u043d`; }
  return `${sec} \u0441\u0435\u043a`;
}

export function suggestPurif(stepType, method, isLast) {
  if (stepType === 'pcr' && isLast) return 'column_gel';
  if (stepType === 'pcr') return 'column_pcr';
  if (stepType === 'assembly' && method === 'overlap_pcr') return 'gel_squeeze';
  return 'none';
}

export function calcAssemblyMix(frags, method) {
  const target = method === 'golden_gate' ? 75 : 50;
  const vol = method === 'gibson' ? 20 : 50;
  const mix = frags.map(f => {
    if (!f.concentration || f.concentration <= 0) return { ...f, ul: '?', error: '\u043d\u0435\u0442 \u0434\u0430\u043d\u043d\u044b\u0445' };
    const ul = Math.round((target / f.concentration) * 10) / 10;
    return { ...f, ul, target, enough: ul <= (f.volume || 999) };
  });
  const fragVol = mix.reduce((s, f) => s + (typeof f.ul === 'number' ? f.ul : 0), 0);
  let reagents = [];
  if (method === 'gibson') reagents = [{ r: 'Gibson MM (2\u00d7)', v: 10 }];
  else if (method === 'overlap_pcr') reagents = [{ r: '5\u00d7 HF Buffer', v: 10 }, { r: 'dNTPs', v: 1 }, { r: 'Phusion', v: 0.5 }];
  else if (method === 'golden_gate') reagents = [{ r: '10\u00d7 T4 Buffer', v: 2 }, { r: 'T4 Ligase', v: 1 }, { r: '\u0420\u0435\u0441\u0442\u0440\u0438\u043a\u0442\u0430\u0437\u0430', v: 1 }];
  const reagVol = reagents.reduce((s, r) => s + r.v, 0);
  const water = Math.max(0, Math.round((vol - reagVol - fragVol) * 10) / 10);
  return { frags: mix, reagents, water, total: vol };
}
