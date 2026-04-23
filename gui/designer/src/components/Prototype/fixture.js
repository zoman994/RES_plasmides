/**
 * Sprint UX-1 prototype fixture.
 *
 * Synthetic ~5 kb circular plasmid with 16 annotations — one per feature-palette
 * family (15 biological families + misc). Every annotation is chosen so that
 * `featureColor(type, name)` lands on the expected palette entry without hitting
 * the ivory misc fallback unintentionally.
 *
 * NOT a real plasmid — names are canonical so regex refinement in
 * `feature-palette.js` (AmpR, GFP, 6×His, 3×FLAG, GS-linker, lac/CAP) works.
 */

function generateSeq(length, seed = 42) {
  const bases = 'ACGT';
  let x = seed >>> 0;
  const out = new Array(length);
  for (let i = 0; i < length; i++) {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    out[i] = bases[x >>> 30];
  }
  return out.join('');
}

const LENGTH = 5000;

export const fixture = {
  id: 'pUX1-proto',
  name: 'pUX1-prototype',
  length: LENGTH,
  topology: 'circular',
  sequence: generateSeq(LENGTH),
  annotations: [
    { id: 'a01', type: 'promoter',      name: 'T7 promoter',       start:   50, end:  170, strand:  1, level: 'region' },
    { id: 'a02', type: 'CDS',           name: 'GFP',               start:  200, end:  920, strand:  1, level: 'region' },
    { id: 'a03', type: 'CDS',           name: '6×His',             start:  920, end:  944, strand:  1, level: 'detail' },
    { id: 'a04', type: 'CDS',           name: '3×FLAG',            start:  944, end: 1010, strand:  1, level: 'detail' },
    { id: 'a05', type: 'CDS',           name: 'GS-linker',         start: 1010, end: 1055, strand:  1, level: 'detail' },
    { id: 'a06', type: 'CDS',           name: 'lacI',              start: 1100, end: 1900, strand:  1, level: 'region' },
    { id: 'a07', type: 'terminator',    name: 'T7 terminator',     start: 1920, end: 1980, strand:  1, level: 'region' },
    { id: 'a08', type: 'CDS',           name: 'AmpR',              start: 2100, end: 2960, strand: -1, level: 'region' },
    { id: 'a09', type: 'ori',           name: 'pUC ori',           start: 3050, end: 3650, strand:  1, level: 'region' },
    { id: 'a10', type: 'primer_bind',   name: 'M13/pUC seq-rev',   start: 3700, end: 3720, strand: -1, level: 'point' },
    { id: 'a11', type: 'protein_bind',  name: 'lac operator',      start: 3750, end: 3775, strand:  1, level: 'detail' },
    { id: 'a12', type: 'protein_bind',  name: 'CAP binding site',  start: 3800, end: 3825, strand:  1, level: 'detail' },
    { id: 'a13', type: 'LTR',           name: "5' LTR",            start: 3850, end: 4050, strand:  1, level: 'region' },
    { id: 'a14', type: 'enhancer',      name: 'CMV enhancer',      start: 4100, end: 4400, strand:  1, level: 'region' },
    { id: 'a15', type: 'sig_peptide',   name: 'IgG leader',        start: 4450, end: 4515, strand:  1, level: 'detail' },
    { id: 'a16', type: 'misc_feature',  name: 'unknown domain',    start: 4600, end: 4700, strand:  1, level: 'region' },
  ],
};

export default fixture;
