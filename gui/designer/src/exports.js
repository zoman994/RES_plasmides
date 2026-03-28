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
      txt += `    98°C  30 sec  (initial denaturation)\n`;
      txt += `    --- 30 cycles ---\n`;
      txt += `    98°C  10 sec  (denature)\n`;
      txt += `    ${anneal}°C  20 sec  (anneal)\n`;
      txt += `    72°C  ${extTime}  (extend)\n`;
      txt += `    -----------------\n`;
      txt += `    72°C  5 min   (final extension)\n`;
      txt += `    4°C   hold\n`;
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
    txt += `  25 more cycles, anneal 60°C, extend 72°C ${fusionTime}\n`;
    txt += `  Expected product: ${totalBp.toLocaleString()} bp\n`;
  } else if (method === 'gibson') {
    txt += `Step ${fragments.length + 1}: Gibson Assembly\n`;
    txt += `  Mix fragments equimolar (50-100 ng each, 2:1 insert:vector)\n`;
    txt += `  Add 10 µl Gibson Master Mix\n`;
    txt += `  50°C, 60 min\n`;
    txt += `  Transform 2 µl into competent cells\n`;
    txt += `  50°C, 60 min\n`;
    txt += `  Expected product: ${totalBp.toLocaleString()} bp\n`;
  }

  download('assembly_protocol.txt', txt);
}

// ═══════════ Data Export / Import ═══════════

const DATA_LS_KEYS = {
  projects: 'pvcs_designer_state',
  primers: 'pvcs-primer-registry',
  inventory: 'pvcs-inventory',
  collections: 'pvcs-collections',
  customTypes: 'pvcs-custom-part-types',
  customRegions: 'pvcs-custom-region-types',
  domains: 'pvcs-parts-domains',
  userColors: 'pvcs-user-palette',
  oligos: 'pvcs-oligos',
};

/** Export all user data as a single JSON file. */
export function exportAllData(projectName) {
  const data = { _format: 'pvcs-backup', _version: 2, _date: new Date().toISOString() };
  Object.entries(DATA_LS_KEYS).forEach(([key, lsKey]) => {
    try { data[key] = JSON.parse(localStorage.getItem(lsKey) || 'null'); } catch {}
  });
  const name = (projectName || 'pvcs_backup').replace(/\s+/g, '_');
  download(`${name}_${new Date().toISOString().slice(0,10)}.json`, JSON.stringify(data, null, 2), 'application/json');
}

/** Export only projects (assemblies, fragments). */
export function exportProjects() {
  try {
    const state = JSON.parse(localStorage.getItem(DATA_LS_KEYS.projects) || '{}');
    const data = { _format: 'pvcs-projects', _version: 2, _date: new Date().toISOString(), ...state };
    download('pvcs_projects.json', JSON.stringify(data, null, 2), 'application/json');
  } catch {}
}

/** Export primer database. */
export function exportPrimers() {
  try {
    const primers = JSON.parse(localStorage.getItem(DATA_LS_KEYS.primers) || '[]');
    const data = { _format: 'pvcs-primers', _date: new Date().toISOString(), primers };
    download('pvcs_primers.json', JSON.stringify(data, null, 2), 'application/json');
  } catch {}
}

/** Export parts library (inventory + collections + custom types). */
export function exportParts(allParts) {
  const data = {
    _format: 'pvcs-parts', _date: new Date().toISOString(),
    parts: allParts || [],
  };
  try { data.inventory = JSON.parse(localStorage.getItem(DATA_LS_KEYS.inventory) || '[]'); } catch {}
  try { data.collections = JSON.parse(localStorage.getItem(DATA_LS_KEYS.collections) || '[]'); } catch {}
  try { data.customTypes = JSON.parse(localStorage.getItem(DATA_LS_KEYS.customTypes) || '[]'); } catch {}
  try { data.domains = JSON.parse(localStorage.getItem(DATA_LS_KEYS.domains) || '{}'); } catch {}
  download('pvcs_parts.json', JSON.stringify(data, null, 2), 'application/json');
}

/** Import data from JSON file. Returns { type, data } or throws. */
export function parseImportFile(jsonString) {
  const data = JSON.parse(jsonString);
  if (data._format === 'pvcs-backup') return { type: 'backup', data };
  if (data._format === 'pvcs-projects' || data.projects) return { type: 'projects', data };
  if (data._format === 'pvcs-primers') return { type: 'primers', data };
  if (data._format === 'pvcs-parts') return { type: 'parts', data };
  throw new Error('Неизвестный формат файла');
}

/** Apply imported data to localStorage. Returns summary string. */
export function applyImport(parsed) {
  const { type, data } = parsed;
  const results = [];

  if (type === 'backup') {
    Object.entries(DATA_LS_KEYS).forEach(([key, lsKey]) => {
      if (data[key] != null) {
        localStorage.setItem(lsKey, JSON.stringify(data[key]));
        results.push(key);
      }
    });
    return `Восстановлено: ${results.join(', ')}. Перезагрузите страницу.`;
  }

  if (type === 'projects') {
    localStorage.setItem(DATA_LS_KEYS.projects, JSON.stringify(data));
    return `Импортировано ${data.projects?.length || 0} проектов. Перезагрузите страницу.`;
  }

  if (type === 'primers') {
    const existing = JSON.parse(localStorage.getItem(DATA_LS_KEYS.primers) || '[]');
    const existingSeqs = new Set(existing.map(p => p.sequence));
    const newPrimers = (data.primers || []).filter(p => !existingSeqs.has(p.sequence));
    localStorage.setItem(DATA_LS_KEYS.primers, JSON.stringify([...existing, ...newPrimers]));
    return `Добавлено ${newPrimers.length} новых праймеров (пропущено ${data.primers.length - newPrimers.length} дубликатов).`;
  }

  if (type === 'parts') {
    if (data.inventory) localStorage.setItem(DATA_LS_KEYS.inventory, JSON.stringify(data.inventory));
    if (data.collections) localStorage.setItem(DATA_LS_KEYS.collections, JSON.stringify(data.collections));
    if (data.customTypes) localStorage.setItem(DATA_LS_KEYS.customTypes, JSON.stringify(data.customTypes));
    if (data.domains) localStorage.setItem(DATA_LS_KEYS.domains, JSON.stringify(data.domains));
    return `Импортировано: ${data.parts?.length || 0} запчастей, ${data.collections?.length || 0} коллекций. Перезагрузите страницу.`;
  }

  return 'Неизвестный формат.';
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
