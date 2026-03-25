/** Protocol reference data: PCR mixes, purification, assembly, timeline calculation. */

export const PCR_MIXES = {
  phusion: {
    name: 'Phusion HF', vendor: 'Thermo/NEB',
    components: [
      { reagent: '5× Phusion HF Buffer', volume: 10 },
      { reagent: 'dNTPs (10 mM each)', volume: 1 },
      { reagent: 'Праймер fwd (10 µM)', volume: 2.5 },
      { reagent: 'Праймер rev (10 µM)', volume: 2.5 },
      { reagent: 'Матрица ДНК', volume: 1, note: '1-10 нг' },
      { reagent: 'Phusion (2 U/µl)', volume: 0.5 },
      { reagent: 'H₂O', volume: 32.5 },
    ],
    total: 50, extRate: 30, denatT: 98, denatS: 10, initDenatS: 30, extT: 72, finalExtS: 300,
    fidelity: '50× Taq',
  },
  taq: {
    name: 'Taq', vendor: 'Thermo/Евроген',
    components: [
      { reagent: '10× Taq Buffer (+KCl)', volume: 5 },
      { reagent: 'MgCl₂ (25 mM)', volume: 3 },
      { reagent: 'dNTPs (10 mM each)', volume: 1 },
      { reagent: 'Праймер fwd (10 µM)', volume: 2.5 },
      { reagent: 'Праймер rev (10 µM)', volume: 2.5 },
      { reagent: 'Матрица ДНК', volume: 1 },
      { reagent: 'Taq (5 U/µl)', volume: 0.5 },
      { reagent: 'H₂O', volume: 34.5 },
    ],
    total: 50, extRate: 60, denatT: 95, denatS: 30, initDenatS: 180, extT: 72, finalExtS: 600,
    fidelity: 'базовая',
  },
  kod: {
    name: 'KOD One', vendor: 'Toyobo',
    components: [
      { reagent: '2× KOD One Master Mix', volume: 25 },
      { reagent: 'Праймер fwd (10 µM)', volume: 1.5 },
      { reagent: 'Праймер rev (10 µM)', volume: 1.5 },
      { reagent: 'Матрица ДНК', volume: 1 },
      { reagent: 'H₂O', volume: 21 },
    ],
    total: 50, extRate: 20, denatT: 98, denatS: 10, initDenatS: 120, extT: 68, finalExtS: 120,
    fidelity: '80× Taq',
  },
  colony_taq: {
    name: 'Colony PCR (Taq)', vendor: '-',
    components: [
      { reagent: '10× Taq Buffer', volume: 2.5 },
      { reagent: 'MgCl₂ (25 mM)', volume: 1.5 },
      { reagent: 'dNTPs (10 mM)', volume: 0.5 },
      { reagent: 'Праймер fwd (10 µM)', volume: 1 },
      { reagent: 'Праймер rev (10 µM)', volume: 1 },
      { reagent: 'Колония', volume: null, note: 'зубочисткой' },
      { reagent: 'Taq (5 U/µl)', volume: 0.2 },
      { reagent: 'H₂O', volume: 18.3 },
    ],
    total: 25, extRate: 60, denatT: 95, denatS: 30, initDenatS: 600, extT: 72, finalExtS: 600,
    fidelity: 'скрининг',
  },
};

export const PURIFICATION = {
  column_pcr: { name: 'Очистка на колонке', icon: '🧫', time: 15, recovery: '80-95%' },
  column_gel: { name: 'Гель-экстракция', icon: '🔪', time: 70, recovery: '50-80%' },
  ethanol:    { name: 'EtOH преципитация', icon: '🧊', time: 55, recovery: '70-90%' },
  gel_squeeze:{ name: 'Отжим + реамплификация', icon: '🫧', time: 60, recovery: 'низкий (хватает для ПЦР)' },
  none:       { name: 'Напрямую', icon: '➡️', time: 0, recovery: '100%' },
};

export const ASSEMBLY_PROTOCOLS = {
  overlap_pcr: {
    name: 'Overlap Extension PCR',
    steps: [
      'Смешать фрагменты эквимолярно (~50 нг)',
      '5× HF Buffer (10 µl), dNTPs (1 µl), Phusion (0.5 µl), H₂O до 50 µl',
      '5 циклов БЕЗ праймеров',
      'Добавить внешние праймеры, 25 циклов',
      'Гель → отжим → реамплификация',
    ],
    postPurif: 'gel_squeeze', time: 90,
  },
  gibson: {
    name: 'Gibson Assembly',
    steps: [
      'Смешать фрагменты (50-100 нг, вектор:вставка 1:2)',
      '10 µl Gibson Master Mix (2×), H₂O до 20 µl',
      '50°C, 60 мин',
      'Трансформировать 2 µl',
    ],
    postPurif: 'none', time: 70,
  },
  golden_gate: {
    name: 'Golden Gate Assembly',
    steps: [
      '75 нг каждого + 75 нг backbone',
      'T4 Ligase (1 µl) + рестриктаза (1 µl) + Buffer (2 µl)',
      '30 циклов (37°C 5мин / 16°C 5мин)',
      '50°C 5мин → 80°C 10мин → трансф. 5 µl',
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
  if (sec >= 60) { const m = Math.floor(sec / 60); const s = sec % 60; return s ? `${m} мин ${s} сек` : `${m} мин`; }
  return `${sec} сек`;
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
    if (!f.concentration || f.concentration <= 0) return { ...f, ul: '?', error: 'нет данных' };
    const ul = Math.round((target / f.concentration) * 10) / 10;
    return { ...f, ul, target, enough: ul <= (f.volume || 999) };
  });
  const fragVol = mix.reduce((s, f) => s + (typeof f.ul === 'number' ? f.ul : 0), 0);
  let reagents = [];
  if (method === 'gibson') reagents = [{ r: 'Gibson MM (2×)', v: 10 }];
  else if (method === 'overlap_pcr') reagents = [{ r: '5× HF Buffer', v: 10 }, { r: 'dNTPs', v: 1 }, { r: 'Phusion', v: 0.5 }];
  else if (method === 'golden_gate') reagents = [{ r: '10× T4 Buffer', v: 2 }, { r: 'T4 Ligase', v: 1 }, { r: 'Рестриктаза', v: 1 }];
  const reagVol = reagents.reduce((s, r) => s + r.v, 0);
  const water = Math.max(0, Math.round((vol - reagVol - fragVol) * 10) / 10);
  return { frags: mix, reagents, water, total: vol };
}
