/**
 * protein-effect.js (UX-6) — classify the protein-level consequence of an edit
 * inside a CDS, so the sequence view can flag it immediately (silent ✓ /
 * missense / truncation / extension / frameshift ⚠ / inframe-indel). Pure;
 * reuses the codon table + reverseComplement. Geneious's «Protein Effect» as a
 * first-class verdict — the loud FRAMESHIFT case is the molbiol headline.
 *
 * Model: the CDS region is given on the ORIGINAL sequence (0-based half-open,
 * strand ±). The edit is assumed to land within / before the CDS end with the
 * CDS start fixed (the common drag-resize / type-in-CDS case); the edited CDS
 * span is `[start, end + lenDelta)`.
 */
import { CODON_TABLE } from '../codons';
import { reverseComplement } from '../sequence-utils';

function translate(dna) {
  const out = [];
  for (let i = 0; i + 3 <= dna.length; i += 3) {
    out.push(CODON_TABLE[dna.slice(i, i + 3)] || 'X');
  }
  return out; // array of single-letter AAs; '*' = stop
}

/**
 * @param {string} originalSeq
 * @param {string} editedSeq
 * @param {{start:number,end:number,strand?:number}|null} cds  CDS on the original
 * @returns {{kind:'none'|'silent'|'missense'|'truncation'|'extension'|'frameshift'|'inframe-indel',
 *   lenDelta?:number, changes?:Array<{pos:number,from:string,to:string}>, at?:number}}
 */
export function classifyProteinEffect(originalSeq, editedSeq, cds) {
  if (!cds || !Number.isFinite(cds.start) || !Number.isFinite(cds.end) || cds.end <= cds.start) {
    return { kind: 'none' };
  }
  const orig = String(originalSeq || '').toUpperCase();
  const edited = String(editedSeq || '').toUpperCase();
  const lenDelta = edited.length - orig.length;

  // A non-3× length change anywhere within the CDS shifts the reading frame.
  if (lenDelta % 3 !== 0) return { kind: 'frameshift', lenDelta };

  let aSeg = orig.slice(cds.start, cds.end);
  let bSeg = edited.slice(cds.start, cds.end + lenDelta);
  if (cds.strand === -1) { aSeg = reverseComplement(aSeg); bSeg = reverseComplement(bSeg); }

  const protA = translate(aSeg);
  const protB = translate(bSeg);
  const stopA = protA.indexOf('*');
  const stopB = protB.indexOf('*');
  const codingEndA = stopA === -1 ? protA.length : stopA;

  // Premature stop (verdict shared by substitution + in-frame indel paths).
  if (stopB !== -1 && (stopA === -1 || stopB < stopA)) return { kind: 'truncation', at: stopB };
  // Stop codon read through → protein extends past the original terminus.
  if (stopA !== -1 && stopB === -1) return { kind: 'extension' };

  if (lenDelta !== 0) return { kind: 'inframe-indel', lenDelta };

  // Same length, same stop position → per-residue diff over the coding span.
  const changes = [];
  const n = Math.min(protA.length, protB.length, codingEndA);
  for (let i = 0; i < n; i += 1) {
    if (protA[i] !== protB[i]) changes.push({ pos: i + 1, from: protA[i], to: protB[i] });
  }
  return changes.length === 0 ? { kind: 'silent' } : { kind: 'missense', changes };
}

/** RU label + tone for a protein-effect verdict (for the UI badge). */
export const PROTEIN_EFFECT_META = {
  silent: { label: 'тихая ✓', tone: 'ok' },
  missense: { label: 'миссенс', tone: 'warn' },
  truncation: { label: 'усечение ⚠', tone: 'bad' },
  extension: { label: 'удлинение', tone: 'warn' },
  frameshift: { label: 'сдвиг рамки ⚠', tone: 'bad' },
  'inframe-indel': { label: 'индел в рамке', tone: 'warn' },
  none: { label: '', tone: 'none' },
};
