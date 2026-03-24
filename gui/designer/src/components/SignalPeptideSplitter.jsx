import { useState, useMemo } from 'react';

const CODONS = {
  TTT:'F',TTC:'F',TTA:'L',TTG:'L',CTT:'L',CTC:'L',CTA:'L',CTG:'L',
  ATT:'I',ATC:'I',ATA:'I',ATG:'M',GTT:'V',GTC:'V',GTA:'V',GTG:'V',
  TCT:'S',TCC:'S',TCA:'S',TCG:'S',CCT:'P',CCC:'P',CCA:'P',CCG:'P',
  ACT:'T',ACC:'T',ACA:'T',ACG:'T',GCT:'A',GCC:'A',GCA:'A',GCG:'A',
  TAT:'Y',TAC:'Y',TAA:'*',TAG:'*',CAT:'H',CAC:'H',CAA:'Q',CAG:'Q',
  AAT:'N',AAC:'N',AAA:'K',AAG:'K',GAT:'D',GAC:'D',GAA:'E',GAG:'E',
  TGT:'C',TGC:'C',TGA:'*',TGG:'W',CGT:'R',CGC:'R',CGA:'R',CGG:'R',
  AGT:'S',AGC:'S',AGA:'R',AGG:'R',GGT:'G',GGC:'G',GGA:'G',GGG:'G',
};
const HYDRO = new Set('AVLIFWM'.split(''));
const SMALL = new Set('AGST'.split(''));

function translate(dna) {
  let p = '';
  for (let i = 0; i + 2 < dna.length; i += 3) p += CODONS[dna.slice(i, i + 3).toUpperCase()] || 'X';
  return p;
}

function predictSP(prot) {
  let best = 0, bestS = 0;
  for (let c = 15; c <= Math.min(35, prot.length - 10); c++) {
    const w = prot.slice(0, c);
    const hyd = w.split('').filter(a => HYDRO.has(a)).length / c;
    const site = prot.slice(Math.max(0, c - 3), c);
    const sb = site.length >= 3 && SMALL.has(site[0]) && SMALL.has(site[2]) ? 0.15 : 0;
    const nr = prot.slice(0, 5);
    const cb = (nr.match(/[KR]/g) || []).length * 0.03;
    const s = hyd + sb + cb;
    if (s > bestS) { bestS = s; best = c; }
  }
  return { position: best, confidence: bestS };
}

export default function SignalPeptideSplitter({ fragment, onSplit, onClose, partsLibrary = [] }) {
  const protein = useMemo(() => translate(fragment.sequence || ''), [fragment]);
  const pred = useMemo(() => predictSP(protein), [protein]);
  const [cut, setCut] = useState(pred.position);

  const sigDNA = (fragment.sequence || '').slice(0, cut * 3);
  const matDNA = (fragment.sequence || '').slice(cut * 3);

  const sigParts = partsLibrary.filter(p =>
    p.name.toLowerCase().includes('_ss') || p.name.toLowerCase().includes('signal'));

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-[600px] max-h-[80vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
        <h3 className="font-bold text-lg mb-2">{'\u2702'} Split Signal Peptide \u2014 {fragment.name}</h3>

        <div className={`text-xs px-3 py-1 rounded-full inline-block mb-4 ${
          pred.confidence > 0.5 ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
          {pred.confidence > 0.5
            ? `Signal peptide detected (${pred.position} aa, ${(pred.confidence * 100).toFixed(0)}%)`
            : `Weak prediction (${(pred.confidence * 100).toFixed(0)}%) \u2014 verify manually`}
        </div>

        <div className="mb-4">
          <div className="text-xs text-gray-500 mb-1">Protein sequence:</div>
          <div className="font-mono text-[11px] leading-relaxed bg-gray-50 p-3 rounded break-all max-h-[100px] overflow-y-auto">
            <span className="text-orange-600 font-bold">{protein.slice(0, cut)}</span>
            <span className="text-red-500 text-lg font-bold">{'\u2193'}</span>
            <span className="text-blue-600">{protein.slice(cut, cut + 30)}</span>
            <span className="text-gray-400">{protein.slice(cut + 30)}</span>
          </div>
          <div className="flex gap-4 mt-1 text-[10px]">
            <span className="text-orange-600">{'\u25a0'} Signal ({cut} aa, {cut * 3} bp)</span>
            <span className="text-blue-600">{'\u25a0'} Mature ({protein.length - cut} aa)</span>
          </div>
        </div>

        <div className="flex items-center gap-3 mb-4">
          <label className="text-xs text-gray-500">Cleavage at aa:</label>
          <input type="number" value={cut} min={5} max={50}
            onChange={e => setCut(Math.max(5, Math.min(50, +e.target.value)))}
            className="w-20 border rounded p-1.5 text-sm" />
          <input type="range" value={cut} min={5} max={50}
            onChange={e => setCut(+e.target.value)} className="flex-1" />
        </div>

        <div className="space-y-2">
          <button onClick={() => onSplit({ action: 'remove', matureName: `${fragment.name}_mature`, matureDNA: matDNA, cutPosition: cut })}
            className="w-full text-left px-4 py-3 border rounded-lg hover:bg-red-50 hover:border-red-300 transition">
            <div className="text-sm font-semibold text-red-700">Remove signal, keep mature</div>
            <div className="text-[10px] text-gray-500">Delete first {cut * 3}bp</div>
          </button>

          {sigParts.map(sp => (
            <button key={sp.id || sp.name} onClick={() => onSplit({
              action: 'replace', signalPart: sp, matureName: `${fragment.name}_mature`, matureDNA: matDNA, cutPosition: cut })}
              className="w-full text-left px-4 py-3 border rounded-lg hover:bg-green-50 hover:border-green-300 transition">
              <div className="text-sm font-semibold text-green-700">Replace with {sp.name}</div>
              <div className="text-[10px] text-gray-500">Insert {sp.name} before mature {fragment.name}</div>
            </button>
          ))}

          <button onClick={() => onSplit({
            action: 'split_only', signalName: `${fragment.name}_ss`, signalDNA: sigDNA,
            matureName: `${fragment.name}_mature`, matureDNA: matDNA, cutPosition: cut })}
            className="w-full text-left px-4 py-3 border border-dashed rounded-lg hover:bg-blue-50 transition">
            <div className="text-sm font-semibold text-blue-700">Split into two fragments</div>
            <div className="text-[10px] text-gray-500">[{fragment.name}_ss ({sigDNA.length}bp)] + [{fragment.name}_mature ({matDNA.length}bp)]</div>
          </button>

          <button onClick={onClose} className="w-full text-left px-4 py-3 border rounded-lg hover:bg-gray-50 transition">
            <div className="text-sm font-semibold text-gray-700">Keep native signal</div>
          </button>
        </div>
      </div>
    </div>
  );
}
