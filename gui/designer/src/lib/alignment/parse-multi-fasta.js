/**
 * Multi-record FASTA parser (client-side, no backend).
 *
 * The project's import path (`file-import.js::parseFasta`) is single-record —
 * it concatenates a multi-FASTA into one entry. The alignment workspace needs
 * the real records, so this parser splits `>header … >header …` into
 * `[{ name, description, sequence }]`. Sequences are uppercased and stripped of
 * non-letter characters; headerless raw input becomes one anonymous record.
 */

const DNA_ONLY = /^[ACGTUNRYSWKMBDHVacgtunryswkmbdhv]+$/;

function cleanSeq(s) {
  return s.replace(/[^A-Za-z]/g, '').toUpperCase();
}

function finalize(rec) {
  let sequence = cleanSeq(rec.seq.join(''));
  let description = rec.description;
  // V103-style rescue: ">F1 ACGT" with the sequence on the header line and no
  // body — promote a pure-nucleotide description to the sequence.
  if (!sequence && description && DNA_ONLY.test(description.replace(/\s/g, ''))) {
    sequence = cleanSeq(description);
    description = '';
  }
  return { name: rec.name, description, sequence };
}

export function parseMultiFasta(text) {
  if (!text) return [];
  const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
  const records = [];
  let cur = null;

  for (const line of lines) {
    if (line.startsWith('>')) {
      if (cur) records.push(finalize(cur));
      const header = line.slice(1).trim();
      const sp = header.search(/\s/);
      const name = sp === -1 ? header : header.slice(0, sp);
      const description = sp === -1 ? '' : header.slice(sp + 1).trim();
      cur = { name: name || `seq_${records.length + 1}`, description, seq: [] };
    } else if (cur) {
      cur.seq.push(line.trim());
    } else if (line.trim()) {
      cur = { name: 'seq_1', description: '', seq: [line.trim()] };
    }
  }
  if (cur) records.push(finalize(cur));
  return records;
}
