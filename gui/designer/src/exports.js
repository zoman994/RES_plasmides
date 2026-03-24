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
      txt += `PCR amplify ${f.name}\n`;
      txt += `  Template: ${f.name} (${(f.sequence || '').length} bp)\n`;
      txt += `  Primers: ${fwd.name || '?'} + ${rev.name || '?'}\n`;
      txt += `  Annealing: ${Math.round(Math.min(fwd.tmBinding || 60, rev.tmBinding || 60))}\u00b0C\n`;
      txt += `  Expected size: ${pcrSize} bp\n`;
      primerIdx += 2;
    } else {
      txt += `Use ${f.name} as-is (${(f.sequence || '').length} bp)\n`;
      txt += `  Source: ${f.sourceType || 'synthesis'}\n`;
    }
    txt += '\n';
  });

  if (method === 'overlap_pcr') {
    txt += `Step ${fragments.length + 1}: Fusion PCR\n`;
    txt += `  Mix all fragments, overlap-extend\n`;
    txt += `  Outer primers: ${primers[0]?.name || '?'} + ${primers[primers.length - 1]?.name || '?'}\n`;
    txt += `  Expected product: ${totalBp.toLocaleString()} bp\n`;
  } else if (method === 'gibson') {
    txt += `Step ${fragments.length + 1}: Gibson Assembly\n`;
    txt += `  Mix all fragments + Gibson Master Mix\n`;
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
