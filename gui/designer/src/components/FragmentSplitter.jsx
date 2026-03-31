import { useState, useMemo } from 'react';
import { CODON_TABLE, translateDNA } from '../codons';
import { getRegions } from '../annotation-model';
import { FEATURE_COLORS } from '../theme';

/* ── Built-in signal peptides (real DNA sequences) ── */
const SIGNAL_PEPTIDES = [
  { name: 'glaA_ss', organism: 'A. niger', aa: 18,
    sequence: 'ATGTTCTCTCCCATCCTCACTGCCGTCGCTCTCGCAGCCGGCCTGGCCGCCCCC' },
  { name: 'cbhI_ss', organism: 'T. reesei', aa: 17,
    sequence: 'ATGTACCGCAAGCTCGCCGTCATCTCCGCCTTCCTCGCCACAGCCCGCGCC' },
  { name: 'α-factor_ss', organism: 'S. cerevisiae', aa: 85,
    sequence: 'ATGAGATTTCCTTCAATTTTTACTGCTGTTTTATTCGCAGCATCCTCCGCATTAGCTGCTCCAGTCAACACTACAACAGAAGATGAAACGGCACAAATTCCGGCTGAAGCTGTCATCGGTTACTCAGATTTAGAAGGGGATTTCGATGTTGCTGTTTTGCCATTTTCCAACAGCACAAATAACGGGTTATTGTTTATAAATACTACTATTGCCAGCATTGCTGCTAAAGAAGAAGGGGTATCTCTCGAGAAAAGAGAG' },
  { name: 'pelB_ss', organism: 'E. coli', aa: 22,
    sequence: 'ATGAAATACCTATTGCCTACGGCAGCCGCTGGATTGTTATTACTCGCGGCCCAGCCAGCCATGGCC' },
  { name: 'ompA_ss', organism: 'E. coli', aa: 21,
    sequence: 'ATGAAAAAGACAGCTATCGCGATTGCAGTGGCACTGGCTGGTTTCGCTACCGTAGCGCAGGCC' },
];

/* ── Hydrophobicity prediction (from old SignalPeptideSplitter) ── */
const HYDRO = new Set('AVLIFWM'.split(''));
const SMALL = new Set('AGST'.split(''));

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

/* ── TATA-box finder ── */
function findTATA(seq) {
  const s = seq.toUpperCase();
  const patterns = ['TATAAAT', 'TATAAAA', 'TATATA', 'TATAAA'];
  for (const pat of patterns) {
    const idx = s.indexOf(pat);
    if (idx !== -1) return { position: idx, pattern: pat };
  }
  return null;
}

export default function FragmentSplitter({ fragment, onSplit, onClose, partsLibrary = [] }) {
  const seq = fragment.sequence || '';
  const isCDS = fragment.type === 'CDS';
  const isPromoter = fragment.type === 'promoter';

  const [mode, setMode] = useState(isCDS ? 'aa' : 'nt'); // 'aa' | 'nt'
  const [cutAA, setCutAA] = useState(0);
  const [cutNT, setCutNT] = useState(Math.floor(seq.length / 2));
  const [insertMode, setInsertMode] = useState(false);
  const [cutStart, setCutStart] = useState(0);
  const [cutEnd, setCutEnd] = useState(0);
  const [flankLength, setFlankLength] = useState(1000);

  // Regions from annotations
  const regions = useMemo(() => getRegions(fragment.annotations), [fragment.annotations]);

  // Protein for CDS mode
  const protein = useMemo(() => isCDS ? translateDNA(seq) : '', [seq, isCDS]);
  const spPred = useMemo(() => protein.length > 30 ? predictSP(protein) : { position: 0, confidence: 0 }, [protein]);

  // TATA-box for promoters
  const tata = useMemo(() => isPromoter ? findTATA(seq) : null, [seq, isPromoter]);

  // Initialize cut position on first render
  useState(() => {
    if (isCDS && spPred.position > 0) setCutAA(spPred.position);
    else if (isCDS) setCutAA(Math.min(20, Math.floor(protein.length / 2)));
  });

  // Effective cut in nucleotides
  const cutBP = mode === 'aa' ? cutAA * 3 : cutNT;
  const part1DNA = seq.slice(0, cutBP);
  const part2DNA = seq.slice(cutBP);

  const maxAA = protein.length > 0 ? protein.length - 1 : 1;
  const maxNT = seq.length > 0 ? seq.length - 1 : 1;

  // Signal peptide parts from library
  const sigParts = partsLibrary.filter(p =>
    p.name.toLowerCase().includes('_ss') || p.name.toLowerCase().includes('signal'));

  // Presets
  const applyPresetSP = () => {
    setMode('aa');
    if (spPred.position > 0) setCutAA(spPred.position);
  };
  const applyPresetTATA = () => {
    setMode('nt');
    if (tata) setCutNT(tata.position);
  };

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-[650px] max-h-[85vh] overflow-y-auto p-6"
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="font-bold text-lg">{'✂'} Разделить фрагмент</h3>
            <div className="text-sm text-gray-500 mt-1">
              {fragment.name} ({fragment.type}, {seq.length} п.н.
              {isCDS && protein.length > 0 ? `, ${protein.length} а.о.` : ''})
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">{'✕'}</button>
        </div>

        {/* Mode tabs */}
        <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1">
          <button onClick={() => setMode('aa')}
            disabled={!isCDS}
            className={`flex-1 text-xs py-2 rounded-md font-medium transition
              ${mode === 'aa' ? 'bg-white shadow text-blue-700' : 'text-gray-500'}
              ${!isCDS ? 'opacity-40 cursor-not-allowed' : 'hover:text-gray-700'}`}>
            По аминокислотам
          </button>
          <button onClick={() => setMode('nt')}
            className={`flex-1 text-xs py-2 rounded-md font-medium transition
              ${mode === 'nt' ? 'bg-white shadow text-blue-700' : 'text-gray-500 hover:text-gray-700'}`}>
            По нуклеотидам
          </button>
        </div>

        {/* Presets */}
        <div className="flex gap-2 mb-4 flex-wrap">
          {/* Region boundary presets */}
          {(() => {
            const regions = getRegions(fragment.annotations);
            if (regions.length > 1) {
              return regions.slice(0, -1).map((r, ri) => {
                const next = regions[ri + 1];
                const color = FEATURE_COLORS[r.type] || '#999';
                return (
                  <button key={`r${ri}`} onClick={() => { setCutNT(r.end); }}
                    className="text-[11px] px-3 py-1.5 rounded-full border hover:bg-blue-50 transition"
                    style={{ borderColor: color, color }}>
                    {'📐'} {r.name} | {next.name} (поз. {r.end})
                  </button>
                );
              });
            }
            return null;
          })()}
          {/* Legacy domain boundary presets */}
          {isCDS && fragment.domains?.length > 1 && fragment.domains.slice(0, -1).map((d, i) => {
            const next = fragment.domains[i + 1];
            return (
              <button key={i} onClick={() => { if (mode === 'aa') setCutAA(d.endAA); else setCutNT(d.endAA * 3); }}
                className="text-[11px] px-3 py-1.5 rounded-full border hover:bg-blue-50 transition"
                style={{ borderColor: d.color, color: d.color }}>
                {'📐'} {d.name} | {next.name} (поз. {d.endAA})
              </button>
            );
          })}
          {isCDS && spPred.position > 0 && !fragment.domains?.length && (
            <button onClick={applyPresetSP}
              className="text-[11px] px-3 py-1.5 rounded-full bg-orange-50 text-orange-700 border border-orange-200 hover:bg-orange-100 transition">
              {'🔬'} Сигнальный пептид (авто)
            </button>
          )}
          {isPromoter && tata && (
            <button onClick={applyPresetTATA}
              className="text-[11px] px-3 py-1.5 rounded-full bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 transition">
              {'📏'} TATA-box (pos {tata.position})
            </button>
          )}
          <button onClick={() => { mode === 'aa' ? setCutAA(Math.floor(maxAA / 2)) : setCutNT(Math.floor(maxNT / 2)); }}
            className="text-[11px] px-3 py-1.5 rounded-full bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100 transition">
            {'✏️'} Произвольная позиция
          </button>
        </div>

        {/* SP detection badge */}
        {mode === 'aa' && isCDS && spPred.position > 0 && cutAA === spPred.position && (
          <div className={`text-xs px-3 py-1.5 rounded-full inline-block mb-3 ${
            spPred.confidence > 0.5 ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
            {spPred.confidence > 0.5
              ? `Обнаружен сигнальный пептид (${spPred.position} а.о., ${(spPred.confidence * 100).toFixed(0)}%)`
              : `Слабый прогноз (${(spPred.confidence * 100).toFixed(0)}%) — проверьте вручную`}
          </div>
        )}

        {/* Sequence visualization */}
        {mode === 'aa' && isCDS ? (
          <div className="mb-4">
            <div className="text-xs text-gray-500 mb-1">Белковая последовательность:</div>
            <div className="font-mono text-[11px] leading-relaxed bg-gray-50 p-3 rounded break-all max-h-[100px] overflow-y-auto">
              <span className="text-orange-600 font-bold">{protein.slice(0, cutAA)}</span>
              <span className="text-red-500 text-lg font-bold">{'↓'}</span>
              <span className="text-blue-600">{protein.slice(cutAA, cutAA + 30)}</span>
              <span className="text-gray-400">{protein.slice(cutAA + 30)}</span>
            </div>
            <div className="flex gap-4 mt-1 text-[10px]">
              <span className="text-orange-600">{'■'} Часть 1: {cutAA} а.о. ({cutAA * 3} п.н.)</span>
              <span className="text-blue-600">{'■'} Часть 2: {protein.length - cutAA} а.о. ({part2DNA.length} п.н.)</span>
            </div>
          </div>
        ) : (
          <div className="mb-4">
            <div className="text-xs text-gray-500 mb-1">Нуклеотидная последовательность:</div>
            <div className="font-mono text-[11px] leading-relaxed bg-gray-50 p-3 rounded break-all max-h-[100px] overflow-y-auto">
              <span className="text-orange-600 font-bold">
                {seq.slice(Math.max(0, cutNT - 30), cutNT)}
              </span>
              <span className="text-red-500 text-lg font-bold">{'│'}</span>
              <span className="text-blue-600">
                {seq.slice(cutNT, cutNT + 30)}
              </span>
              {cutNT + 30 < seq.length && <span className="text-gray-400">...</span>}
            </div>
            <div className="flex gap-4 mt-1 text-[10px]">
              <span className="text-orange-600">{'■'} Часть 1: {cutNT} п.н.</span>
              <span className="text-blue-600">{'■'} Часть 2: {seq.length - cutNT} п.н.</span>
            </div>
          </div>
        )}

        {/* Position controls */}
        <div className="flex items-center gap-3 mb-5">
          <label className="text-xs text-gray-500 shrink-0">Позиция разреза:</label>
          {mode === 'aa' ? (
            <>
              <input type="number" value={cutAA} min={1} max={maxAA}
                onChange={e => setCutAA(Math.max(1, Math.min(maxAA, +e.target.value)))}
                className="w-20 border rounded p-1.5 text-sm" />
              <span className="text-xs text-gray-400">а.о.</span>
              <input type="range" value={cutAA} min={1} max={maxAA}
                onChange={e => setCutAA(+e.target.value)} className="flex-1" />
            </>
          ) : (
            <>
              <input type="number" value={cutNT} min={1} max={maxNT}
                onChange={e => setCutNT(Math.max(1, Math.min(maxNT, +e.target.value)))}
                className="w-20 border rounded p-1.5 text-sm" />
              <span className="text-xs text-gray-400">п.н.</span>
              <input type="range" value={cutNT} min={1} max={maxNT}
                onChange={e => setCutNT(+e.target.value)} className="flex-1" />
            </>
          )}
        </div>

        {/* Insert mode controls */}
        {insertMode && (
          <div className="mb-4 space-y-3 bg-green-50 rounded-lg p-3 border border-green-200">
            <div className="text-xs font-semibold text-green-700">Длина плечей гомологии:</div>
            <div className="flex gap-2">
              {[500, 750, 1000, 1500, 2000].map(len => (
                <button key={len} onClick={() => setFlankLength(len)}
                  className={`text-[11px] px-3 py-1.5 rounded-full border transition
                    ${flankLength === len ? 'bg-green-100 border-green-400 text-green-700 font-semibold' : 'hover:bg-gray-50'}`}>
                  {len} п.н.
                </button>
              ))}
            </div>

            <div className="text-xs font-semibold text-green-700 mt-2">Границы удаляемого региона:</div>
            {regions.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {regions.map((r, ri) => (
                  <button key={ri} onClick={() => { setCutStart(r.start); setCutEnd(r.end); }}
                    className="text-[10px] px-2 py-1 rounded border border-red-200 hover:bg-red-50 transition text-red-600">
                    {'🎯'} {r.name} ({r.start}–{r.end}, {r.end - r.start} п.н.)
                  </button>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2">
              <label className="text-[10px] text-gray-500 w-14">Начало:</label>
              <input type="number" value={cutStart} min={0} max={seq.length}
                onChange={e => setCutStart(Math.max(0, +e.target.value))}
                className="w-20 border rounded p-1 text-xs" />
              <label className="text-[10px] text-gray-500 w-14">Конец:</label>
              <input type="number" value={cutEnd} min={cutStart} max={seq.length}
                onChange={e => setCutEnd(Math.min(seq.length, +e.target.value))}
                className="w-20 border rounded p-1 text-xs" />
              <span className="text-[10px] text-red-500">Удалить: {cutEnd - cutStart} п.н.</span>
            </div>

            <div className="bg-white rounded p-2 font-mono text-[10px] border">
              <span className="text-orange-600">[5' flank: {Math.min(flankLength, cutStart)} п.н.]</span>
              <span className="text-red-400 mx-1">──✂ {cutEnd - cutStart} п.н. ✂──</span>
              <span className="text-blue-600">[3' flank: {Math.min(flankLength, seq.length - cutEnd)} п.н.]</span>
            </div>
          </div>
        )}

        {/* ── Actions ── */}
        <div className="space-y-2">

          {/* 1. Split into two */}
          <button onClick={() => onSplit({
            action: 'split',
            part1Name: `${fragment.name}_part1`, part1DNA,
            part2Name: `${fragment.name}_part2`, part2DNA,
            cutPosition: cutBP,
          })}
            className="w-full text-left px-4 py-3 border border-dashed rounded-lg hover:bg-blue-50 hover:border-blue-300 transition">
            <div className="text-sm font-semibold text-blue-700">{'✂'} Разрезать на два фрагмента</div>
            <div className="text-[10px] text-gray-500">
              [{fragment.name}_part1 ({part1DNA.length} п.н.)] + [{fragment.name}_part2 ({part2DNA.length} п.н.)]
            </div>
          </button>

          {/* 2. Remove part 1, keep part 2 */}
          <button onClick={() => onSplit({
            action: 'remove_part1',
            name: `${fragment.name}`,
            sequence: part2DNA,
            cutPosition: cutBP,
          })}
            className="w-full text-left px-4 py-3 border rounded-lg hover:bg-red-50 hover:border-red-300 transition">
            <div className="text-sm font-semibold text-red-700">{'🗑'} Удалить часть 1, оставить часть 2</div>
            <div className="text-[10px] text-gray-500">Удалить первые {part1DNA.length} п.н.</div>
          </button>

          {/* 3. Remove part 2, keep part 1 */}
          <button onClick={() => onSplit({
            action: 'remove_part2',
            name: `${fragment.name}`,
            sequence: part1DNA,
            cutPosition: cutBP,
          })}
            className="w-full text-left px-4 py-3 border rounded-lg hover:bg-red-50 hover:border-red-300 transition">
            <div className="text-sm font-semibold text-red-700">{'🗑'} Удалить часть 2, оставить часть 1</div>
            <div className="text-[10px] text-gray-500">Оставить первые {part1DNA.length} п.н.</div>
          </button>

          {/* 4. Replace part 1 (CDS mode — signal peptides) */}
          {isCDS && mode === 'aa' && (
            <div className="border rounded-lg p-3 space-y-2">
              <div className="text-sm font-semibold text-green-700">{'🔄'} Заменить часть 1 на:</div>

              {/* Built-in signal peptides */}
              {SIGNAL_PEPTIDES.map(sp => (
                <button key={sp.name} onClick={() => onSplit({
                  action: 'replace_part1',
                  replacementName: sp.name, replacementSeq: sp.sequence,
                  replacementType: 'signal_peptide',
                  part2Name: `${fragment.name}_mature`, part2DNA,
                  cutPosition: cutBP,
                })}
                  className="w-full text-left px-3 py-2 rounded hover:bg-green-50 transition text-xs">
                  <span className="font-semibold">{sp.name}</span>
                  <span className="text-gray-400 ml-2">({sp.organism}, {sp.sequence.length} п.н.)</span>
                </button>
              ))}

              {/* Parts from library */}
              {sigParts.length > 0 && (
                <>
                  <div className="text-[10px] text-gray-400 border-t pt-2 mt-1">Из библиотеки</div>
                  {sigParts.map(sp => (
                    <button key={sp.id || sp.name} onClick={() => onSplit({
                      action: 'replace_part1',
                      replacementName: sp.name, replacementSeq: sp.sequence || '',
                      replacementType: sp.type || 'signal_peptide',
                      part2Name: `${fragment.name}_mature`, part2DNA,
                      cutPosition: cutBP,
                    })}
                      className="w-full text-left px-3 py-2 rounded hover:bg-green-50 transition text-xs">
                      <span className="font-semibold">{sp.name}</span>
                      <span className="text-gray-400 ml-2">({(sp.sequence || '').length} п.н.)</span>
                    </button>
                  ))}
                </>
              )}
            </div>
          )}

          {/* 5. Split for cassette insertion */}
          <button onClick={() => {
            if (!insertMode) {
              setInsertMode(true);
              const targetRegion = regions.find(r => r.type === 'CDS' || r.type === 'gene');
              if (targetRegion) { setCutStart(targetRegion.start); setCutEnd(targetRegion.end); }
              else { setCutStart(Math.floor(seq.length * 0.3)); setCutEnd(Math.floor(seq.length * 0.7)); }
              return;
            }
            const flank5Len = Math.min(flankLength, cutStart);
            const flank3Len = Math.min(flankLength, seq.length - cutEnd);
            onSplit({
              action: 'split_for_insert',
              flank5Name: `5'_flank_${fragment.name}`,
              flank5DNA: seq.slice(cutStart - flank5Len, cutStart),
              flank3Name: `3'_flank_${fragment.name}`,
              flank3DNA: seq.slice(cutEnd, cutEnd + flank3Len),
              cutStart, cutEnd,
              deletedLength: cutEnd - cutStart,
              flankLength,
            });
          }}
            className="w-full text-left px-4 py-3 border-2 border-dashed rounded-lg hover:bg-green-50 hover:border-green-400 transition">
            <div className="text-sm font-semibold text-green-700">
              {insertMode ? '✂ + ➕ Создать фланки для вставки' : '✂ + ➕ Разрезать для вставки кассеты'}
            </div>
            <div className="text-[10px] text-gray-500">
              {insertMode
                ? `[5'_flank ${Math.min(flankLength, cutStart)} п.н.] + [📦 кассета] + [3'_flank ${Math.min(flankLength, seq.length - cutEnd)} п.н.]`
                : 'Удалить целевой ген, оставить фланки гомологии для overlap/Gibson'}
            </div>
          </button>

          {/* 6. Cancel */}
          <button onClick={onClose}
            className="w-full text-left px-4 py-3 border rounded-lg hover:bg-gray-50 transition">
            <div className="text-sm font-semibold text-gray-700">{'✅'} Отмена</div>
          </button>
        </div>
      </div>
    </div>
  );
}
