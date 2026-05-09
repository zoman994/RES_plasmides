/**
 * start-screen-data — Sprint StartScreen-Pixel.
 *
 * Hardcoded recent projects + ring SVG paths per
 * docs/design_assets/start_screen.html. All 4 rows are static —
 * real recent projects from projectSlice come in a follow-up
 * patch (см. CURRENT_TASK.md «после приёмки этого: Recent
 * projects → реальные данные из projectSlice»).
 */

export const RECENT_PROJECTS = [
  {
    id: 'P43_Cas_Uni_Tr',
    name: 'P43_Cas_Uni_Tr',
    bp: 8432,
    topology: 'circular',
    features: 14,
    tags: ['CRISPR', 'hygR'],
    timeAgo: '2 часа назад',
    location: '~/lab/Cas9',
    status: 'ok', // 'ok' | 'unsaved' | null
    ring: [
      // Each entry: { d, stroke } — 4-color circular ring per mockup row 1
      { d: 'M 40 12 A 28 28 0 0 1 64 40', stroke: '#D9836B' },
      { d: 'M 64 40 A 28 28 0 0 1 50 64', stroke: '#B0C84A' },
      { d: 'M 22 60 A 28 28 0 0 1 14 32', stroke: '#FFC400' },
      { d: 'M 14 32 A 28 28 0 0 1 28 14', stroke: '#5DA5C4' },
    ],
  },
  {
    id: 'pEXP-glaA-XynTL',
    name: 'pEXP-glaA-XynTL',
    bp: 7218,
    topology: 'circular',
    features: 11,
    tags: ['expression'],
    timeAgo: 'вчера',
    location: '~/lab/expression',
    status: 'unsaved',
    ring: [
      { d: 'M 40 12 A 28 28 0 0 1 68 40', stroke: '#FFC400' },
      { d: 'M 68 40 A 28 28 0 0 1 40 68', stroke: '#B0C84A' },
      { d: 'M 40 68 A 28 28 0 0 1 12 40', stroke: '#D9836B' },
    ],
  },
  {
    id: 'pHDR-pepA',
    name: 'pHDR-pepA',
    bp: 5940,
    topology: 'circular',
    features: 9,
    tags: ['HDR', 'pepA'],
    timeAgo: '3 дня назад',
    location: '~/lab/pep',
    status: null,
    ring: [
      { d: 'M 40 12 A 28 28 0 0 1 60 24', stroke: '#5DA5C4' },
      { d: 'M 60 24 A 28 28 0 0 1 60 56', stroke: '#B884B8' },
      { d: 'M 60 56 A 28 28 0 0 1 16 50', stroke: '#E8B333' },
    ],
  },
  {
    id: 'pET-28b_T5exo',
    name: 'pET-28b_T5exo',
    bp: 5369,
    topology: 'circular',
    features: 6,
    tags: [{ label: 'черновик', variant: 'draft' }],
    timeAgo: 'неделю назад',
    location: '~/lab/expression',
    status: null,
    ring: [
      { d: 'M 40 12 A 28 28 0 0 1 68 40', stroke: '#B0C84A' },
      { d: 'M 12 40 A 28 28 0 0 1 28 14', stroke: '#D9836B' },
    ],
  },
];

export const RECENT_COUNT_TOTAL = 7; // hardcoded per mockup header «Недавние проекты · 7»

export const FILTER_PILLS = [
  { id: 'all', label: 'Все' },
  { id: 'active', label: 'Активные' },
  { id: 'crispr', label: 'CRISPR' },
  { id: 'expression', label: 'Экспрессионные' },
];
