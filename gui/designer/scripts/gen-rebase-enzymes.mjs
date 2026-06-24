/**
 * gen-rebase-enzymes.mjs — generate src/restriction-db-rebase.js from REBASE.
 *
 * Source: REBASE (http://rebase.neb.com), Dr. Richard J. Roberts. We use the
 * EMBOSS pattern file (cut sites) + withrefm (suppliers). Output = COMMERCIAL
 * Type IIP enzymes (cuts WITHIN the recognition site). Type IIS (cut outside,
 * e.g. BsaI) are excluded — they belong to golden-gate.js per the bio-invariant.
 *
 * Regenerate:
 *   curl http://rebase.neb.com/rebase/link_emboss_e   -o /tmp/emboss_e.txt
 *   curl http://rebase.neb.com/rebase/link_withrefm   -o /tmp/withrefm.txt
 *   curl http://rebase.neb.com/rebase/link_emboss_s   -o /tmp/emboss_s.txt
 *   node scripts/gen-rebase-enzymes.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';

const IUPAC = /^[ACGTRYMKSWHBVDN]+$/;

function deriveEndOverhang(site, [f, r]) {
  if (f === r) return { end: 'blunt', overhang: null };
  const lo = Math.min(f, r);
  const hi = Math.max(f, r);
  return { end: f < r ? '5prime' : '3prime', overhang: site.slice(lo, hi) || null };
}

// ── parse EMBOSS pattern file → name -> { site, cut:[c1,c2], len, ncuts } ──
const embE = readFileSync('.rebase-tmp/emboss_e.txt', 'utf8').split('\n');
const cuts = new Map();
for (const line of embE) {
  if (!line || line.startsWith('#')) continue;
  const p = line.split(/\s+/);
  if (p.length < 7) continue;
  const [name, pattern, len, ncuts, , c1, c2] = p;
  const L = +len; const N = +ncuts; const a = +c1; const b = +c2;
  if (N !== 2) continue;                       // single ds cut site only
  if (!(a >= 0 && a <= L && b >= 0 && b <= L)) continue; // Type IIP (cut INSIDE) — excludes IIS
  if (!IUPAC.test(pattern)) continue;
  cuts.set(name, { site: pattern, cut: [a, b], len: L });
}

// ── parse withrefm → name -> { suppliers:[codes], isoschizomers:[...] } ──
const wr = readFileSync('.rebase-tmp/withrefm.txt', 'utf8').split('\n');
const meta = new Map();
let cur = null;
for (const line of wr) {
  if (line.startsWith('<1>')) { cur = line.slice(3).trim(); meta.set(cur, { suppliers: [], iso: [] }); }
  else if (cur && line.startsWith('<2>')) meta.get(cur).iso = line.slice(3).split(',').map((s) => s.trim()).filter(Boolean);
  else if (cur && line.startsWith('<7>')) meta.get(cur).suppliers = line.slice(3).trim().split('').filter((c) => /[A-Z]/.test(c));
}

// ── supplier code -> name ─────────────────────────────────────────────
const sup = new Map();
for (const line of readFileSync('.rebase-tmp/emboss_s.txt', 'utf8').split('\n')) {
  if (!line || line.startsWith('#')) continue;
  const m = line.match(/^(\S)\s+(.+)$/);
  if (m) sup.set(m[1], m[2].trim());
}

// ── build commercial Type IIP entries ─────────────────────────────────
const out = {};
for (const [name, c] of cuts) {
  const m = meta.get(name);
  if (!m || m.suppliers.length === 0) continue; // commercial only
  const { end, overhang } = deriveEndOverhang(c.site, c.cut);
  out[name] = {
    site: c.site,
    cut: c.cut,
    end,
    overhang,
    temp: 37,
    buffer: null,
    supplier: sup.get(m.suppliers[0]) || 'REBASE',
    suppliers: m.suppliers,
    isoschizomers: m.iso,
    neoschizomers: [],
    minFlanking: 2,
    damSensitive: false,
    dcmSensitive: false,
    source: 'REBASE',
  };
}

const names = Object.keys(out).sort((a, b) => a.localeCompare(b));
console.log(`commercial Type IIP enzymes: ${names.length}`);
console.log('NEB (code N):', names.filter((n) => out[n].suppliers.includes('N')).length);
console.log('Thermo (code B):', names.filter((n) => out[n].suppliers.includes('B')).length);
// cross-check a few against our curated values
for (const [n, exp] of [['EcoRI', '[1,5]'], ['PstI', '[5,1]'], ['BamHI', '[1,5]'], ['HindIII', '[1,5]'], ['NotI', '[2,6]'], ['SfiI', '[8,5]'], ['KpnI', '[5,1]'], ['EcoRV', '[3,3]']]) {
  console.log(`  ${n}: site=${out[n]?.site} cut=[${out[n]?.cut}] (expect ${exp}) end=${out[n]?.end} oh=${out[n]?.overhang}`);
}

// ── emit data module ──────────────────────────────────────────────────
const lines = names.map((n) => {
  const e = out[n];
  const j = JSON.stringify(e.suppliers);
  const iso = JSON.stringify(e.isoschizomers);
  return `  ${/^[A-Za-z_$][\w$]*$/.test(n) ? n : JSON.stringify(n)}: { site: ${JSON.stringify(e.site)}, cut: [${e.cut[0]}, ${e.cut[1]}], end: ${JSON.stringify(e.end)}, overhang: ${JSON.stringify(e.overhang)}, temp: 37, buffer: null, supplier: ${JSON.stringify(e.supplier)}, suppliers: ${j}, isoschizomers: ${iso}, neoschizomers: [], minFlanking: 2, damSensitive: false, dcmSensitive: false, source: 'REBASE' },`;
});
const header = `/**
 * restriction-db-rebase.js — AUTO-GENERATED. Do not edit by hand.
 *
 * Commercial Type IIP restriction enzymes from REBASE (http://rebase.neb.com,
 * © Dr. Richard J. Roberts), the database NEB/SnapGene also draw from. Cut sites
 * are authoritative (EMBOSS pattern file); end/overhang are derived; supplier
 * codes drive the NEB/Thermo presets. Type IIS (cut outside site) are excluded —
 * they live in golden-gate.js per the bio-invariant.
 *
 * Regenerate: node scripts/gen-rebase-enzymes.mjs  (see that file for the curl URLs).
 * Count: ${names.length} enzymes.
 */
export const RE_ENZYMES_REBASE = {
${lines.join('\n')}
};
`;
writeFileSync('src/restriction-db-rebase.js', header);
console.log('wrote src/restriction-db-rebase.js');
