/** Okabe-Ito colorblind-safe palette + nucleotide Sanger colors. */

export const FEATURE_COLORS = {
  CDS:            '#56B4E9',
  gene:           '#56B4E9',
  promoter:       '#009E73',
  terminator:     '#D55E00',
  rep_origin:     '#E69F00',
  marker:         '#F0E442',
  signal_peptide: '#CC79A7',
  primer_bind:    '#0072B2',
  misc_feature:   '#999999',
  regulatory:     '#661100',
  misc_RNA:       '#AA4499',
};

// Alternating pairs for adjacent same-type fragments
export const FEATURE_PAIRS = {
  CDS:            ['#56B4E9', '#3A96C8'],
  gene:           ['#56B4E9', '#3A96C8'],
  promoter:       ['#009E73', '#007A59'],
  terminator:     ['#D55E00', '#A84A00'],
  rep_origin:     ['#E69F00', '#B87E00'],
  marker:         ['#F0E442', '#C8BE30'],
  signal_peptide: ['#CC79A7', '#A85E87'],
  primer_bind:    ['#0072B2', '#005A8E'],
  misc_feature:   ['#999999', '#777777'],
  regulatory:     ['#661100', '#4D0D00'],
  misc_RNA:       ['#AA4499', '#883377'],
};

export function getFragColor(type, index) {
  const pair = FEATURE_PAIRS[type] || FEATURE_PAIRS.misc_feature;
  return pair[index % 2];
}

// Nucleotide colors (Sanger convention)
export const NT_COLORS = {
  A: '#009900',
  T: '#CC0000',
  G: '#B8860B',
  C: '#0000CC',
};

// Marker keywords that override color to marker yellow
export const MARKER_KEYWORDS = ['hygr','ampr','kanr','neor','zeor','bsd','nat','ble','pyrg','hph','amds'];

export function isMarker(name) {
  const nl = (name || '').toLowerCase();
  return MARKER_KEYWORDS.some(kw => nl.includes(kw));
}

export function getColor(feature) {
  if (isMarker(feature.name || feature)) return FEATURE_COLORS.marker;
  return FEATURE_COLORS[feature.type || feature] || FEATURE_COLORS.misc_feature;
}

/** Darken a hex color by a fraction (0-1). */
export function darken(hex, amount = 0.2) {
  if (!hex || hex[0] !== '#') return hex || '#333';
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return '#' + [r, g, b].map(c =>
    Math.round(c * (1 - amount)).toString(16).padStart(2, '0')
  ).join('');
}
