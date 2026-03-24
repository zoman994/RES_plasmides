/** Export functions — GenBank, protocol, clipboard. */

function download(filename, content, type = 'text/plain') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Export predicted sequence as GenBank file. */
export function exportGenBank(fragments, constructName = 'construct', circular = false) {
  const seq = fragments.map(f => f.sequence || '').join('');
  const topology = circular ? 'circular' : 'linear';
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');

  let gb = '';
  gb += `LOCUS       ${constructName.slice(0, 16).padEnd(16)} ${seq.length} bp    DNA     ${topology}   SYN ${date}\n`;
  gb += `DEFINITION  ${constructName} designed by PlasmidVCS\n`;
  gb += `FEATURES             Location/Qualifiers\n`;

  let offset = 0;
  fragments.forEach(f => {
    const start = offset + 1;
    const end = offset + (f.sequence || '').length;
    const loc = f.strand === -1 ? `complement(${start}..${end})` : `${start}..${end}`;
    gb += `     ${(f.type || 'misc_feature').padEnd(16)}${loc}\n`;
    gb += `                     /label="${f.name}"\n`;
    offset = end;
  });

  gb += `ORIGIN\n`;
  const seqLower = seq.toLowerCase();
  for (let i = 0; i < seqLower.length; i += 60) {
    const lineNum = String(i + 1).padStart(9);
    const chunks = [];
    for (let j = 0; j < 60 && i + j < seqLower.length; j += 10) {
      chunks.push(seqLower.slice(i + j, i + j + 10));
    }
    gb += `${lineNum} ${chunks.join(' ')}\n`;
  }
  gb += `//\n`;

  download(`${constructName}.gb`, gb);
}

/** Export assembly protocol as text. */
export function exportProtocol(fragments, junctions, primers, method, circular) {
  const methodLabels = {
    overlap_pcr: 'Overlap PCR',
    gibson: 'Gibson Assembly',
    golden_gate: 'Golden Gate',
  };
  const totalBp = fragments.reduce((s, f) => s + (f.sequence || '').length, 0);

  let txt = `Assembly Protocol\n`;
  txt += `${'='.repeat(50)}\n`;
  txt += `Method: ${methodLabels[method] || method}\n`;
  txt += `Fragments: ${fragments.length}\n`;
  txt += `Expected product: ${totalBp.toLocaleString()} bp ${circular ? '(circular)' : '(linear)'}\n\n`;

  let primerIdx = 0;
  fragments.forEach((f, i) => {
    txt += `Step ${i + 1}: `;
    if (f.needsAmplification) {
      const fwd = primers[primerIdx] || {};
      const rev = primers[primerIdx + 1] || {};
      const pcrSize = (f.sequence || '').length + (fwd.tailSequence || '').length + (rev.tailSequence || '').length;
      const anneal = Math.round(Math.min(fwd.tmBinding || 60, rev.tmBinding || 60));
      const extSec = Math.ceil(pcrSize / 1000) * 30;
      const extTime = extSec >= 60 ? `${Math.floor(extSec/60)} min ${extSec%60?extSec%60+' sec':''}` : `${extSec} sec`;
      txt += `PCR amplify ${f.name}\n`;
      txt += `  Template: ${f.name} (${(f.sequence || '').length} bp)\n`;
      txt += `  Primers: ${fwd.name || '?'} + ${rev.name || '?'}\n`;
      txt += `  Expected size: ${pcrSize} bp\n`;
      txt += `  PCR Program:\n`;
      txt += `    98\u00b0C  30 sec  (initial denaturation)\n`;
      txt += `    --- 30 cycles ---\n`;
      txt += `    98\u00b0C  10 sec  (denature)\n`;
      txt += `    ${anneal}\u00b0C  20 sec  (anneal)\n`;
      txt += `    72\u00b0C  ${extTime}  (extend)\n`;
      txt += `    -----------------\n`;
      txt += `    72\u00b0C  5 min   (final extension)\n`;
      txt += `    4\u00b0C   hold\n`;
      primerIdx += 2;
    } else {
      txt += `Use ${f.name} as-is (${(f.sequence || '').length} bp)\n`;
      txt += `  Source: ${f.sourceType || 'synthesis'}\n`;
    }
    txt += '\n';
  });

  const fusionExt = Math.ceil(totalBp / 1000) * 30;
  const fusionTime = fusionExt >= 60 ? `${Math.floor(fusionExt/60)} min ${fusionExt%60?fusionExt%60+' sec':''}` : `${fusionExt} sec`;

  if (method === 'overlap_pcr') {
    txt += `Step ${fragments.length + 1}: Fusion PCR\n`;
    txt += `  Mix ${fragments.filter(f=>f.needsAmplification).length} PCR products equimolar (~50 ng each)\n`;
    txt += `  5 cycles WITHOUT outer primers (fragment annealing)\n`;
    txt += `  Then add outer primers: ${primers[0]?.name || '?'} + ${primers[primers.length - 1]?.name || '?'}\n`;
    txt += `  25 more cycles, anneal 60\u00b0C, extend 72\u00b0C ${fusionTime}\n`;
    txt += `  Expected product: ${totalBp.toLocaleString()} bp\n`;
  } else if (method === 'gibson') {
    txt += `Step ${fragments.length + 1}: Gibson Assembly\n`;
    txt += `  Mix fragments equimolar (50-100 ng each, 2:1 insert:vector)\n`;
    txt += `  Add 10 \u00b5l Gibson Master Mix\n`;
    txt += `  50\u00b0C, 60 min\n`;
    txt += `  Transform 2 \u00b5l into competent cells\n`;
    txt += `  50\u00b0C, 60 min\n`;
    txt += `  Expected product: ${totalBp.toLocaleString()} bp\n`;
  }

  download('assembly_protocol.txt', txt);
}

/** Save assembly to PlasmidVCS via API. */
export async function saveToPVCS(fragments, junctions, primers, method, circular, name) {
  try {
    const r = await fetch('/api/assembly/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: name || 'Designer assembly',
        method,
        circular,
        fragments: fragments.map(f => ({
          name: f.name, type: f.type, sequence: f.sequence,
          length: (f.sequence || '').length,
          needsAmplification: f.needsAmplification,
        })),
        junctions,
        primers,
      }),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}
