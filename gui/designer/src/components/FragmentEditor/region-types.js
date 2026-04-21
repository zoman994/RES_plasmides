import { DOMAIN_COLORS } from '../../domain-detection';

// Domain/region types — universal for all fragment types
export const REGION_TYPES = {
  CDS: [
    { value: 'signal', label: 'Сигн. пептид' }, { value: 'propeptide', label: 'Пропептид' },
    { value: 'domain', label: 'Домен' }, { value: 'linker', label: 'Линкер' },
    { value: 'tag', label: 'Тег (His, FLAG)' }, { value: 'binding', label: 'Связывающий' },
    { value: 'transmembrane', label: 'Трансмембр.' }, { value: 'custom', label: 'Другое' },
  ],
  promoter: [
    { value: 'UAS', label: 'UAS/Энхансер' }, { value: 'TATA', label: 'TATA-box' },
    { value: 'RBS', label: 'RBS (Шайн-Дальгарно)' }, { value: 'core', label: 'Core промотор' },
    { value: 'operator', label: 'Оператор' }, { value: 'insulator', label: 'Инсулятор' },
    { value: 'TSS', label: 'Старт транскрипции' }, { value: 'custom', label: 'Другое' },
  ],
  terminator: [
    { value: 'polyA', label: 'PolyA-сигнал' }, { value: 'stem_loop', label: 'Стем-луп' },
    { value: 'T_rich', label: 'T-богатый участок' }, { value: 'custom', label: 'Другое' },
  ],
  _default: [
    { value: 'region', label: 'Область' }, { value: 'repeat', label: 'Повтор' },
    { value: 'binding', label: 'Сайт связывания' }, { value: 'custom', label: 'Другое' },
  ],
};

export function getRegionTypes(fragType) {
  const base = REGION_TYPES[fragType] || REGION_TYPES._default;
  // Load user-defined types from localStorage
  try {
    const custom = JSON.parse(localStorage.getItem('pvcs-custom-region-types') || '[]');
    return [...base, ...custom];
  } catch { return base; }
}

export function addCustomRegionType(value, label) {
  try {
    const custom = JSON.parse(localStorage.getItem('pvcs-custom-region-types') || '[]');
    if (!custom.some(t => t.value === value)) {
      custom.push({ value, label });
      localStorage.setItem('pvcs-custom-region-types', JSON.stringify(custom));
    }
  } catch {}
}

// Region colors — extend for regulatory elements
export const REGION_COLORS = {
  ...DOMAIN_COLORS,
  UAS: '#6929c4', TATA: '#d55e00', RBS: '#0072b2', core: '#009e73',
  operator: '#e69f00', insulator: '#cc79a7', TSS: '#56b4e9',
  polyA: '#d55e00', stem_loop: '#009e73', T_rich: '#e69f00',
  region: '#56b4e9', repeat: '#999999',
};

export const DOMAINS_LS_KEY = 'pvcs-parts-domains';

export function loadSavedDomains(id) {
  try { return JSON.parse(localStorage.getItem(DOMAINS_LS_KEY) || '{}')[id]; } catch { return null; }
}

export function persistDomains(id, domains) {
  try {
    const a = JSON.parse(localStorage.getItem(DOMAINS_LS_KEY) || '{}');
    a[id] = domains;
    localStorage.setItem(DOMAINS_LS_KEY, JSON.stringify(a));
  } catch {}
}
