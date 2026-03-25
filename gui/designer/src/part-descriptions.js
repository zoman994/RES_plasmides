/** Descriptions for common genetic parts — tooltips and detail cards. */

export const PART_DESCRIPTIONS = {
  // ═══ Origins ═══
  'ori': {
    short: 'Ориджин репликации E. coli (ColE1/pMB1, high-copy ~500-700 копий)',
    long: 'Стандартный ориджин из pUC/pBR322. High-copy: ~500-700 копий/клетку (pUC) или ~15-20 (pBR322). Не работает в грибах — для Aspergillus нужен AMA1.',
    hostRange: 'E. coli, энтеробактерии',
  },
  'pUC ori': {
    short: 'High-copy ориджин (~500-700 копий/клетку в E. coli)',
    long: 'Мутантная версия pMB1 ori с делецией rop. Даёт высокое число копий. Высокая копийность может быть токсична для нестабильных вставок.',
    hostRange: 'E. coli',
  },
  'f1 ori': {
    short: 'Ориджин фага f1 — для одноцепочечной ДНК (ssDNA)',
    long: 'Позволяет получить ssDNA при суперинфекции хелперным фагом M13KO7. Нужен для фагового дисплея, метода Кункеля. НЕ нужен для стандартного клонирования.',
    hostRange: 'E. coli с F-пилем (XL1-Blue, TG1)',
    note: 'Функционален только в одной ориентации!',
  },
  'SV40 ori': {
    short: 'Ориджин SV40 — репликация в клетках млекопитающих с T-антигеном',
    long: 'Репликация в клетках с SV40 Large T-антигеном (COS-7). Для транзиентной экспрессии.',
    hostRange: 'Клетки млекопитающих с T-антигеном',
  },
  'AMA1': {
    short: 'Автономный ориджин для Aspergillus (нестабильный без селекции)',
    long: 'Из A. nidulans. Автономная репликация без интеграции. Нестабилен: теряется за 5-10 генераций без селекции. Для стабильной экспрессии — интеграция в геном.',
    hostRange: 'A. niger, A. nidulans, A. oryzae',
    note: 'Нестабилен без селекции!',
  },

  // ═══ Markers ═══
  'AmpR': {
    short: 'Ампициллин-резистентность (бета-лактамаза, bla)',
    long: 'Разрушает ампициллин в среде. 100 мкг/мл. Ампициллин разрушается за 4-6 часов — сателлитные колонии! Для долгих инкубаций лучше карбенициллин.',
    hostRange: 'E. coli',
    note: 'Сателлитные колонии — используйте карбенициллин для долгих инкубаций.',
  },
  'KanR': {
    short: 'Канамицин-резистентность (50 мкг/мл)',
    long: 'Стабильнее ампициллина — нет сателлитных колоний. Часто в pET-серии.',
    hostRange: 'E. coli',
  },
  'HygR': {
    short: 'Гигромицин B резистентность — маркер для грибов и млекопитающих',
    long: 'Ген hph. Работает в E. coli, грибах, клетках млекопитающих. Стандарт для Aspergillus. 100-200 мкг/мл для грибов.',
    hostRange: 'E. coli, Aspergillus, Trichoderma, млекопитающие',
  },
  'NatR': {
    short: 'Нурсеотрицин-резистентность — второй маркер для грибов',
    long: 'Ген nat1. Когда hygR уже занят первой трансформацией.',
    hostRange: 'Aspergillus, Trichoderma, дрожжи',
  },
  'pyrG': {
    short: 'Ауксотрофный маркер (уридин) — контрселекция на 5-FOA',
    long: 'Комплементирует pyrG⁻. Двунаправленный: селекция без уридина (прямая) и на 5-FOA (контрселекция для вырезания маркера). Стандарт для последовательных модификаций генома.',
    hostRange: 'A. niger, A. nidulans (pyrG⁻ штаммы)',
    note: 'Контрселекция на 5-FOA — можно переиспользовать маркер!',
  },
  'amdS': {
    short: 'Ацетамидаза — селекция на ацетамиде как источнике N',
    long: 'Из A. nidulans. Рост на ацетамиде. Контрселекция: фторацетамид.',
    hostRange: 'A. niger, A. nidulans',
  },

  // ═══ Promoters ═══
  'PglaA': {
    short: 'Промотор глюкоамилазы A. niger — сильный, индуцибельный (мальтоза)',
    long: 'Один из самых сильных промоторов в A. niger. Индуцируется мальтозой/крахмалом, репрессируется ксилозой. Часто в паре с glaA signal peptide.',
    hostRange: 'A. niger',
  },
  'PgpdA': {
    short: 'Промотор GAPDH — конститутивный, средняя сила',
    long: 'Из A. nidulans. Конститутивный, не требует индукции. Для маркеров селекции и вспомогательных генов.',
    hostRange: 'A. niger, A. nidulans',
  },
  'T7 promoter': {
    short: 'Промотор T7 — для pET-системы (IPTG-индукция, очень сильный)',
    long: 'Распознаётся только T7 RNAP. Нужен штамм BL21(DE3). Индукция IPTG. >50% белка клетки. Токсичные белки — использовать pLysS.',
    hostRange: 'E. coli BL21(DE3)',
    note: 'Не работает без T7 RNAP!',
  },
  'CMV': {
    short: 'Промотор CMV — сильный конститутивный для млекопитающих',
    long: 'Стандарт для клеток млекопитающих. Может сайленситься при длительной культивации.',
    hostRange: 'Клетки млекопитающих',
  },

  // ═══ Terminators ═══
  'TtrpC': {
    short: 'Терминатор trpC — стандарт для грибных векторов',
    long: 'Из A. nidulans. Универсальный для Aspergillus. 567 п.н.',
    hostRange: 'A. niger, A. nidulans, A. oryzae',
  },
  'BGH polyA': {
    short: 'Сигнал полиаденилирования BGH — для млекопитающих',
    long: 'Полиаденилирование и терминация в клетках млекопитающих.',
    hostRange: 'Клетки млекопитающих',
  },
  'CYC1 terminator': {
    short: 'Терминатор CYC1 из S. cerevisiae',
    long: 'Стандарт для дрожжевых экспрессионных систем.',
    hostRange: 'S. cerevisiae, P. pastoris',
  },
  'T7 terminator': {
    short: 'Терминатор T7 — останавливает T7 RNAP',
    long: 'Специфичен для T7 RNAP. В pET-векторах. Не останавливает бактериальную RNAP.',
    hostRange: 'E. coli (pET-система)',
  },

  // ═══ Reporters / Tags ═══
  'EGFP': {
    short: 'Зелёный флуоресцентный белок (Ex 488, Em 507 нм)',
    long: 'Репортёрный ген. Визуальная оценка экспрессии. Мутант GFP (F64L, S65T). Созревание ~30 мин.',
    note: 'Нужен O₂ для хромофора — не работает в анаэробных условиях.',
  },
  'GFP': {
    short: 'Зелёный флуоресцентный белок (Ex 488, Em 507 нм)',
    long: 'Репортёрный ген. Для визуальной оценки экспрессии.',
  },
  'LacZ': {
    short: 'β-галактозидаза — blue/white скрининг на X-gal',
    long: 'Синие колонии = lacZ, белые = вставка. Нужен штамм с lacZΔM15 (DH5α).',
    note: 'Нужен штамм с α-комплементацией.',
  },
};

/** Get description for a part by name (with fuzzy matching). */
export function getPartDescription(name, type) {
  if (!name) return { short: '' };
  if (PART_DESCRIPTIONS[name]) return PART_DESCRIPTIONS[name];

  // Fuzzy: try partial match
  const nl = name.toLowerCase();
  const key = Object.keys(PART_DESCRIPTIONS).find(k =>
    nl.includes(k.toLowerCase()) || k.toLowerCase().includes(nl)
  );
  if (key) return PART_DESCRIPTIONS[key];

  // Generic by type
  const generic = {
    CDS: { short: `Кодирующая последовательность ${name}` },
    promoter: { short: `Промотор ${name}` },
    terminator: { short: `Терминатор ${name}` },
    rep_origin: { short: `Ориджин репликации ${name}` },
    marker: { short: `Маркер селекции ${name}` },
    signal_peptide: { short: `Сигнальный пептид ${name}` },
    misc_feature: { short: name },
  };
  return generic[type] || { short: name };
}
