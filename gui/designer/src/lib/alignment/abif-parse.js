/**
 * ABIF (.ab1) Sanger chromatogram parser — pure client-side, no dependencies.
 *
 * ABIF is a big-endian, tag-directory binary format. We read the header
 * directory entry (offset 6), walk the directory, and extract:
 *   PBAS — base calls (char)         PCON — per-base quality / Q (byte)
 *   PLOC — peak locations (short)    DATA9..12 — 4 processed trace channels
 *   FWO_ — filter wheel order, maps DATA9..12 → A/C/G/T
 *
 * Returns { bases, qualities, peakLocations, traces:{A,C,G,T}, sampleCount, fwo }.
 * Spec: Applied Biosystems "ABIF File Format" (2009).
 */

const DIR_ENTRY_SIZE = 28;

function readDirEntry(view, off) {
  const name = String.fromCharCode(
    view.getUint8(off), view.getUint8(off + 1), view.getUint8(off + 2), view.getUint8(off + 3),
  );
  return {
    name,
    number: view.getInt32(off + 4, false),
    elementtype: view.getInt16(off + 8, false),
    elementsize: view.getInt16(off + 10, false),
    numelements: view.getInt32(off + 12, false),
    datasize: view.getInt32(off + 16, false),
    dataoffset: view.getInt32(off + 20, false),
    dataField: off + 20, // inline data lives here when datasize <= 4
  };
}

function dataStart(entry) {
  return entry.datasize <= 4 ? entry.dataField : entry.dataoffset;
}

function readNumbers(view, entry) {
  const start = dataStart(entry);
  const num = entry.numelements;
  const out = new Array(num);
  switch (entry.elementtype) {
    case 1: for (let i = 0; i < num; i++) out[i] = view.getUint8(start + i); break;          // byte
    case 2: for (let i = 0; i < num; i++) out[i] = view.getInt8(start + i); break;            // char (as int)
    case 3: for (let i = 0; i < num; i++) out[i] = view.getUint16(start + i * 2, false); break; // word
    case 4: for (let i = 0; i < num; i++) out[i] = view.getInt16(start + i * 2, false); break;  // short
    case 5: for (let i = 0; i < num; i++) out[i] = view.getInt32(start + i * 4, false); break;  // long
    default: for (let i = 0; i < num; i++) out[i] = view.getUint8(start + i);
  }
  return out;
}

function readString(view, entry) {
  if (!entry) return '';
  const start = dataStart(entry);
  let s = '';
  for (let i = 0; i < entry.numelements; i++) s += String.fromCharCode(view.getUint8(start + i));
  return s;
}

function pick(entries, name, numbers) {
  for (const n of numbers) {
    const e = entries.get(name + n);
    if (e) return e;
  }
  return null;
}

export function parseAbif(arrayBuffer) {
  if (!arrayBuffer || arrayBuffer.byteLength < 30) {
    throw new Error('файл слишком мал для ABIF (.ab1)');
  }
  const view = new DataView(arrayBuffer);
  const magic = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
  if (magic !== 'ABIF') throw new Error('не ABIF (.ab1) файл: неверная сигнатура');

  const header = readDirEntry(view, 6);
  const numEntries = header.numelements;
  const dirOffset = header.dataoffset;
  if (numEntries <= 0 || dirOffset + numEntries * DIR_ENTRY_SIZE > arrayBuffer.byteLength) {
    throw new Error('повреждённый каталог ABIF');
  }

  const entries = new Map();
  for (let i = 0; i < numEntries; i++) {
    const e = readDirEntry(view, dirOffset + i * DIR_ENTRY_SIZE);
    entries.set(e.name + e.number, e);
  }

  const basesEntry = pick(entries, 'PBAS', [1, 2]);
  const bases = readString(view, basesEntry);
  const conEntry = pick(entries, 'PCON', [1, 2]);
  const qualities = conEntry ? readNumbers(view, conEntry) : [];
  const plocEntry = pick(entries, 'PLOC', [1, 2]);
  const peakLocations = plocEntry ? readNumbers(view, plocEntry) : [];

  const fwo = readString(view, pick(entries, 'FWO_', [1])) || 'GATC';
  const traces = { A: [], C: [], G: [], T: [] };
  for (let k = 0; k < 4 && k < fwo.length; k++) {
    const baseChar = fwo[k];
    const e = pick(entries, 'DATA', [9 + k]);
    if (traces[baseChar] !== undefined) traces[baseChar] = e ? readNumbers(view, e) : [];
  }
  const sampleCount = traces.A.length || traces.C.length || traces.G.length || traces.T.length || 0;

  return { bases, qualities, peakLocations, traces, sampleCount, fwo };
}
