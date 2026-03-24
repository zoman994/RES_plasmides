import { useState } from 'react';

const RC = {A:'T',T:'A',G:'C',C:'G'};
const revComp = s => s.split('').reverse().map(c => RC[c.toUpperCase()]||'N').join('');

export default function VerificationPanel({ fragments, circular }) {
  const [show, setShow] = useState(false);
  const [vp, setVp] = useState(null);

  const fullSeq = fragments.map(f => f.sequence || '').join('');
  const totalLen = fullSeq.length;

  const design = () => {
    const fwd = fullSeq.slice(0, 22);
    const rev = revComp(fullSeq.slice(-22));
    const internal = [];
    if (totalLen > 1500) {
      for (let p = 700; p < totalLen - 200; p += 700) {
        internal.push({ name: `seq_${Math.floor(p/1000)}k`, sequence: fullSeq.slice(p, p + 22), position: p });
      }
    }
    setVp({ fwd: { name: 'verify_fwd', sequence: fwd }, rev: { name: 'verify_rev', sequence: rev },
      expectedSize: totalLen, internal });
  };

  if (!show) return (
    <button onClick={() => setShow(true)} className="text-xs px-4 py-2 border rounded-lg hover:bg-gray-50 text-gray-600 w-full text-left">
      {'\uD83E\uDDEB'} Verification Primers (colony PCR + sequencing)
    </button>
  );

  return (
    <div className="border rounded-lg bg-white p-4">
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-sm font-bold text-gray-700">Verification Strategy</h3>
        <button onClick={() => setShow(false)} className="text-gray-400 text-xs">{'\u2715'}</button>
      </div>

      <button onClick={design} className="px-4 py-2 bg-green-600 text-white rounded text-xs font-semibold hover:bg-green-700 mb-3">
        Design Verification Primers
      </button>

      {vp && (<>
        <div className="bg-green-50 rounded p-3 mb-3">
          <div className="text-xs font-semibold text-green-800 mb-2">Colony PCR</div>
          <div className="text-[11px] font-mono text-green-700 space-y-1">
            <div>fwd: {vp.fwd.sequence}</div>
            <div>rev: {vp.rev.sequence}</div>
          </div>
          <div className="text-xs text-green-600 mt-2">
            Expected: <strong>{(vp.expectedSize / 1000).toFixed(1)} kb</strong>
          </div>
        </div>

        {vp.internal.length > 0 && (
          <div className="bg-blue-50 rounded p-3 mb-3">
            <div className="text-xs font-semibold text-blue-800 mb-2">
              Sequencing primers (insert &gt;1.5 kb)
            </div>
            <div className="text-[11px] font-mono text-blue-700 space-y-1">
              <div>1. verify_fwd (pos 1)</div>
              {vp.internal.map((p, i) => (
                <div key={i}>{i + 2}. {p.name} (pos {p.position}) {p.sequence}</div>
              ))}
              <div>{vp.internal.length + 2}. verify_rev (pos {vp.expectedSize})</div>
            </div>
            <div className="text-xs text-blue-600 mt-2">
              {vp.internal.length + 2} sequencing reactions for full coverage
            </div>
          </div>
        )}

        <button onClick={() => {
          const lines = [`verify_fwd\t${vp.fwd.sequence}\t25nmol\tDesalt`,
            `verify_rev\t${vp.rev.sequence}\t25nmol\tDesalt`,
            ...vp.internal.map(p => `${p.name}\t${p.sequence}\t25nmol\tDesalt`)];
          navigator.clipboard.writeText(lines.join('\n'));
        }} className="text-xs px-3 py-1.5 bg-blue-50 text-blue-700 rounded">
          Copy verification primers (TSV)
        </button>
      </>)}
    </div>
  );
}
