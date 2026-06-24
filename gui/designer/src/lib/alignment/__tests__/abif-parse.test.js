import { describe, it, expect } from 'vitest';
import { parseAbif } from '../abif-parse';

/* ---- minimal ABIF (.ab1) builder for tests ---- */
function ascii(s) { return Array.from(s).map((c) => c.charCodeAt(0)); }
function int16BE(arr) {
  const out = new Uint8Array(arr.length * 2);
  const v = new DataView(out.buffer);
  arr.forEach((n, i) => v.setInt16(i * 2, n, false));
  return out;
}
function writeAscii(view, off, s) { ascii(s).forEach((c, i) => view.setUint8(off + i, c)); }
function writeDirEntry(view, off, name, number, etype, esize, num, datasize, dataoffset, inline) {
  writeAscii(view, off, name);
  view.setInt32(off + 4, number, false);
  view.setInt16(off + 8, etype, false);
  view.setInt16(off + 10, esize, false);
  view.setInt32(off + 12, num, false);
  view.setInt32(off + 16, datasize, false);
  if (inline) { for (let k = 0; k < inline.length; k++) view.setUint8(off + 20 + k, inline[k]); }
  else view.setInt32(off + 20, dataoffset, false);
  view.setInt32(off + 24, 0, false);
}

function buildAbif({ bases, qualities, ploc, fwo, data }) {
  const metas = [];
  const add = (name, number, etype, esize, num, bytes) =>
    metas.push({ name, number, etype, esize, num, bytes });
  add('PBAS', 1, 2, 1, bases.length, new Uint8Array(ascii(bases)));
  add('PCON', 1, 1, 1, qualities.length, new Uint8Array(qualities));
  add('PLOC', 1, 4, 2, ploc.length, int16BE(ploc));
  add('FWO_', 1, 2, 1, 4, new Uint8Array(ascii(fwo)));
  [9, 10, 11, 12].forEach((d) => add('DATA', d, 4, 2, data['DATA' + d].length, int16BE(data['DATA' + d])));

  const ENTRIES_OFF = 128;
  const n = metas.length;
  let dataOff = ENTRIES_OFF + n * 28;
  metas.forEach((e) => {
    e.datasize = e.bytes.length;
    if (e.datasize > 4) { e.dataoffset = dataOff; dataOff += e.datasize; if (dataOff % 2) dataOff += 1; }
  });
  const buf = new ArrayBuffer(dataOff);
  const view = new DataView(buf);
  writeAscii(view, 0, 'ABIF');
  view.setUint16(4, 101, false);
  writeDirEntry(view, 6, 'tdir', 1, 1023, 28, n, n * 28, ENTRIES_OFF);
  metas.forEach((e, i) => {
    const off = ENTRIES_OFF + i * 28;
    const inline = e.datasize <= 4 ? e.bytes : null; // ABIF stores ≤4-byte data inline
    writeDirEntry(view, off, e.name, e.number, e.etype, e.esize, e.num, e.datasize,
      e.datasize > 4 ? e.dataoffset : 0, inline);
    if (e.datasize > 4) new Uint8Array(buf, e.dataoffset, e.datasize).set(e.bytes);
  });
  return buf;
}

describe('parseAbif', () => {
  const sample = buildAbif({
    bases: 'ACGT',
    qualities: [40, 38, 20, 10],
    ploc: [5, 15, 25, 35],
    fwo: 'GATC', // DATA9=G, DATA10=A, DATA11=T, DATA12=C
    data: {
      DATA9: [1, 2, 3],   // G channel
      DATA10: [4, 5, 6],  // A channel
      DATA11: [7, 8, 9],  // T channel
      DATA12: [10, 11, 12], // C channel
    },
  });

  it('reads base calls, qualities and peak locations', () => {
    const r = parseAbif(sample);
    expect(r.bases).toBe('ACGT');
    expect(Array.from(r.qualities)).toEqual([40, 38, 20, 10]);
    expect(Array.from(r.peakLocations)).toEqual([5, 15, 25, 35]);
  });

  it('maps DATA9..12 channels to A/C/G/T via FWO_ order', () => {
    const r = parseAbif(sample);
    expect(Array.from(r.traces.G)).toEqual([1, 2, 3]);
    expect(Array.from(r.traces.A)).toEqual([4, 5, 6]);
    expect(Array.from(r.traces.T)).toEqual([7, 8, 9]);
    expect(Array.from(r.traces.C)).toEqual([10, 11, 12]);
    expect(r.sampleCount).toBe(3);
  });

  it('throws a clear error on a non-ABIF buffer', () => {
    const bad = new ArrayBuffer(64);
    new DataView(bad).setUint32(0, 0x12345678, false);
    expect(() => parseAbif(bad)).toThrow();
  });
});
