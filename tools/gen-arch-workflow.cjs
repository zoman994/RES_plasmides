#!/usr/bin/env node
/**
 * gen-arch-workflow.cjs — builds a self-contained Workflow script
 * (tools/arch-workflow.js) with the cluster list + doc partition embedded
 * (workflow scripts have no FS access). Deterministic data-gathering here,
 * agent fan-out there.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const graph = JSON.parse(fs.readFileSync(path.join(ROOT, 'module-graph.json'), 'utf8'));

// ── clusters from the graph ───────────────────────────────────────────
const depBy = {}, useBy = {};
for (const e of graph.clusterEdges) {
  (depBy[e.from] ||= []).push([e.to, e.count]);
  (useBy[e.to] ||= []).push([e.from, e.count]);
}
const top = (m, k) => (m[k] || []).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([n, c]) => `${n}(${c})`);
const dirFor = (name) => name === 'root'
  ? 'gui/designer/src (top-level *.js only)'
  : `gui/designer/src/${name}`;

const big = graph.clusters.filter((c) => c.modules >= 3).map((c) => ({
  name: c.name, dir: dirFor(c.name), count: c.modules, loc: c.loc,
  dependsOn: top(depBy, c.name), usedBy: top(useBy, c.name),
}));
const small = graph.clusters.filter((c) => c.modules < 3 && c.name !== 'db');
const dbC = graph.clusters.find((c) => c.name === 'db');
const legacyFiles = graph.nodes.filter((n) => small.some((s) => s.name === n.cluster)).map((n) => n.id);
const CLUSTERS = [...big];
if (dbC) CLUSTERS.push({ name: 'db', dir: 'gui/designer/src/db', count: dbC.modules, loc: dbC.loc, dependsOn: top(depBy, 'db'), usedBy: top(useBy, 'db') });
CLUSTERS.push({ name: 'components/(legacy v0.5 singletons + misc)', dir: 'gui/designer/src/components', count: legacyFiles.length, loc: 0, dependsOn: [], usedBy: [], files: legacyFiles });

// ── doc partition ─────────────────────────────────────────────────────
const INTENT = new Set([
  // root operational (intent/status/decisions)
  'VISION.md', 'BACKLOG.md', 'ARCHITECTURE.md', 'UX_REFERENCE_BASE.md', 'DESIGN_SYSTEM.md', 'COMPONENT_MAP.md',
  'DECISIONS.md', 'ANCHORS.md', 'RELEASES.md', 'PROJECT_STATE.md', 'TECH_DEBT.md', 'CHANGELOG.md', 'CURRENT_TASK.md', 'README.md', 'BUGS.md',
  // archive: vision / ux concept
  'UX_VISION.md', 'ux-concept-ru.md', 'UX_FIRST_TIME_USER.md', 'UX_AUDIT_FINDINGS.md', 'UX_VISION', 'ux-concept-ru',
  // archive: roadmaps / backlogs / ideas
  'PRODUCT_BACKLOG_INTEGRATED_WORKBENCH.md', 'ROADMAP_v2.md', 'ROADMAP_CANVAS_V2_TO_PRODUCTION.md', 'IDEAS_PARKING_LOT.md', 'KNOWLEDGE_BACKLOG.md', 'DESIGN_BACKLOG_POLISH.md',
  // archive: architecture lineage / models
  'ARCHITECTURE_v2.md', 'ARCHITECTURE_APPROVED_v2.md', 'ARCHITECTURE_3LEVELS.md', 'ARCHITECTURE_CANVAS_MODEL.md', 'ARCHITECTURE_PROJECT_MODEL_KICKOFF_v1.md', 'PROJECT_MODEL_KICKOFF_v1.1.md', 'CONTAINER_ARCHITECTURE_DRAFT.md', 'architecture.md',
  'LIBRARY_MODEL_DRAFT.md', 'PART_MODEL.md', 'PARTS_LIFECYCLE.md', 'ASSEMBLY_ENGINE_v2.md', 'SPEC_M-CANVAS-FOUR-TIER-ARCHITECTURE.md', 'NOTES_FOUR_TIER_MODEL_DRAFT.md', 'NOTES_CANVAS_V2_KICKOFF.md',
  // archive: concepts / flow
  'TWO_CLICK_CONCEPT.md', 'TWO_CLICK_OPS.md', 'RACETRACK_DESIGN.md', 'FLOW_V2_DESIGN.md', 'PROJECT_FLOW_DESIGN.md',
  // archive: comparative (what to match) + decisions
  'COMPARATIVE_OPENCLONING.md', 'COMPARATIVE_TEEMI.md', 'COMPARATIVE_OSS_HARVEST.md', 'DECISIONS_2026_Q2.md',
]);

function listMd(dir) {
  const out = [];
  (function walk(d) {
    for (const n of fs.readdirSync(d)) {
      const p = path.join(d, n); const st = fs.statSync(p);
      if (st.isDirectory()) { if (n !== '_pending_delete') walk(p); }
      else if (n.endsWith('.md')) out.push(path.relative(ROOT, p).split(path.sep).join('/'));
    }
  })(dir);
  return out;
}
const rootMd = fs.readdirSync(ROOT).filter((n) => n.endsWith('.md')).map((n) => n);
const docsMd = listMd(path.join(ROOT, 'docs')).filter((p) => !p.includes('/guides/') && !p.includes('/process/'));
const all = [...rootMd, ...docsMd];

const intentDocs = [];
const logDocs = [];
for (const p of all) {
  const base = p.split('/').pop();
  // current docs/SPEC_*.md are live feature wishes → intent
  const isLiveSpec = p.startsWith('docs/SPEC_') && !p.includes('/archive/');
  if (INTENT.has(base) || isLiveSpec) intentDocs.push(p); else logDocs.push(p);
}

// ── emit workflow script ──────────────────────────────────────────────
const HUBS = graph.nodes.sort((a, b) => b.inDeg - a.inDeg).slice(0, 8).map((n) => `${n.id}(${n.inDeg})`).join(', ');
const J = (x) => JSON.stringify(x);

const script = `export const meta = {
  name: 'arch-and-requirements-map',
  description: 'Annotate code clusters + consolidate all archive docs into one requirements/status source of truth',
  phases: [
    { title: 'Clusters', detail: 'one agent per code cluster' },
    { title: 'Intent docs', detail: 'full-read vision/architecture/decisions/backlog' },
    { title: 'Archive scan', detail: 'batched skim of sprint/spec/audit logs for product intent' },
    { title: 'Synthesize', detail: 'ARCHITECTURE_MAP + requirements source-of-truth' },
  ],
};

const CLUSTERS = ${J(CLUSTERS)};
const INTENT_DOCS = ${J(intentDocs)};
const LOG_DOCS = ${J(logDocs)};
const HUBS = ${J(HUBS)};
const chunk = (a, n) => { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; };

const CLUSTER_SCHEMA = { type: 'object', additionalProperties: false, required: ['name','oneLiner','purpose','responsibilities','risks'], properties: {
  name: { type: 'string' }, oneLiner: { type: 'string' }, purpose: { type: 'string' },
  keyModules: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { file: { type: 'string' }, role: { type: 'string' } }, required: ['file','role'] } },
  responsibilities: { type: 'array', items: { type: 'string' } },
  dependsOn: { type: 'array', items: { type: 'string' } }, usedBy: { type: 'array', items: { type: 'string' } },
  risks: { type: 'array', items: { type: 'string' } } } };
const DOC_SCHEMA = { type: 'object', additionalProperties: false, required: ['path','category','summary','wishes'], properties: {
  path: { type: 'string' }, category: { type: 'string' }, summary: { type: 'string' },
  wishes: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['text','area','status'], properties: { text: { type: 'string' }, area: { type: 'string' }, status: { type: 'string', enum: ['done','in-progress','planned','dropped','superseded','unknown'] }, evidence: { type: 'string' } } } },
  decisions: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { text: { type: 'string' }, date: { type: 'string' } }, required: ['text'] } },
  abandoned: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { idea: { type: 'string' }, why: { type: 'string' } }, required: ['idea'] } } } };
const LOG_SCHEMA = { type: 'object', additionalProperties: false, required: ['items'], properties: {
  items: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['doc','intent','status'], properties: { doc: { type: 'string' }, intent: { type: 'string' }, status: { type: 'string' }, note: { type: 'string' } } } },
  milestoneTimeline: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { milestone: { type: 'string' }, whatChanged: { type: 'string' } }, required: ['milestone','whatChanged'] } } } };

phase('Clusters');
const clusters = await parallel(CLUSTERS.map((c) => () => agent(
  'Map the BodgeGene frontend module cluster "' + c.name + '" (dir: ' + c.dir + ', ' + c.count + ' modules, ' + (c.loc||'?') + ' loc).\\n'
  + 'Use Glob/Grep/Read to read the KEY files (index/entry, store, the largest, the most-imported) — you do NOT need every file' + (c.files ? '. Files: ' + c.files.join(', ') : '') + '.\\n'
  + 'Dependency context (from the import graph): depends on [' + (c.dependsOn||[]).join(', ') + '], used by [' + (c.usedBy||[]).join(', ') + ']. App-wide hub modules: ' + HUBS + '.\\n'
  + 'Return: oneLiner (<=120 chars, what this cluster IS), purpose, keyModules (file+role, 4-8), responsibilities, dependsOn, usedBy, risks (size/tech-debt/coupling).',
  { schema: CLUSTER_SCHEMA, phase: 'Clusters', label: 'cl:' + c.name, model: 'sonnet' }
)));

phase('Intent docs');
const intent = await parallel(INTENT_DOCS.map((p) => () => agent(
  'Read the BodgeGene doc "' + p + '" IN FULL (may be large; read all of it). It is a product-intent / vision / architecture / decisions / backlog doc for a visual genetic-construct (plasmid) designer.\\n'
  + 'Extract the OWNER\\'s wishes ("хотелки") + decisions, with CURRENT status. Be specific and cite section/line evidence. Distinguish what was WANTED vs what was BUILT vs DROPPED/SUPERSEDED.\\n'
  + 'Return DOC_SCHEMA: path, category (vision|architecture|decisions|backlog|roadmap|model|concept|comparative|status|spec|other), summary (3-5 sentences), wishes[{text, area, status, evidence}], decisions[{text, date}], abandoned[{idea, why}].',
  { schema: DOC_SCHEMA, phase: 'Intent docs', label: 'doc:' + p.split('/').pop(), model: 'sonnet' }
)));

phase('Archive scan');
const logBatches = chunk(LOG_DOCS, 8);
const logs = await parallel(logBatches.map((b, i) => () => agent(
  'Skim these BodgeGene archive docs (mostly sprint/spec/audit/report logs) for PRODUCT INTENT ONLY — stated wishes, scope decisions, abandoned or reworked ideas, renamed/re-scoped milestones. SKIP pure implementation detail. Read each briefly (title + goal/scope/«что хотим» sections).\\n'
  + 'Files:\\n' + b.map((x) => '- ' + x).join('\\n') + '\\n'
  + 'Return LOG_SCHEMA: items[{doc, intent, status, note}] — only docs that carry a real product wish/decision (omit pure-impl ones); milestoneTimeline[{milestone, whatChanged}] for any rework/pivot you spot.',
  { schema: LOG_SCHEMA, phase: 'Archive scan', label: 'scan:' + (i + 1) + '/' + logBatches.length, model: 'sonnet' }
)));

phase('Synthesize');
const okClusters = clusters.filter(Boolean);
const arch = await agent(
  'Write docs/ARCHITECTURE_MAP.md for BodgeGene (visual plasmid designer; React SPA + Python CLI) from these cluster analyses.\\n'
  + 'Markdown: H1 title; intro (462 modules, 973 imports, 47 clusters; hubs: ' + HUBS + '); then a section per cluster (### name — oneLiner; purpose; key-modules table file|role; responsibilities; depends-on / used-by; risks); end with "## Cross-cutting hubs & systemic risks" (the hub modules + the biggest files / coupling). Engineer-facing, concise, faithful to the data. Return ONLY markdown.\\n\\nCLUSTERS JSON:\\n' + JSON.stringify(okClusters),
  { phase: 'Synthesize', label: 'ARCHITECTURE_MAP' }
);
const req = await agent(
  'Write a single SOURCE-OF-TRUTH product doc for BodgeGene in RUSSIAN (owner Игорь is Russian-speaking; keep code identifiers/file names as-is). The owner changed his mind often and reworked a lot — your job is to consolidate every wish into one annotated truth + current status.\\n'
  + 'H1: "BodgeGene — единый источник правды: хотелки и статус (на 02.06.2026)". Sections:\\n'
  + '1. **Видение** — что такое BodgeGene и для кого (1 абзац).\\n'
  + '2. **Хотелки по областям** — для каждой области (Библиотека/Parts, Canvas/Сборка, Sequence-вьювер и правка, Аннотации, Рестрикция/Golden Gate/праймеры, Импорт-экспорт .bodge, Проект/Flow, UX «два клика», Лаб-журнал/Sanger/T-серия, Common-features, Формат .bodge v2) — таблица: Хотелка | Статус (✅ готово / 🟡 в работе / 📋 план / ❌ отброшено / 🔁 переработано) | Заметка/эволюция (+ка кой док это говорит).\\n'
  + '3. **Что менялось (эволюция мнения)** — хронология крупных разворотов: архитектурная линия (3-levels → v2 → approved → canvas-model → four-tier T1-T10), переименования вех (M-A..M-X, M-CANVAS, T-series), смены модели (parts→library→containers→pieces/zones). Каждый пункт: что было → что стало → почему.\\n'
  + '4. **Отброшено / заморожено** — идеи и почему.\\n'
  + '5. **Текущий статус** — версия (v0.8.4-alpha), что работает сейчас, что в работе (common-features Пачки 1-3), что дальше.\\n'
  + 'Аннотируй плотно, ссылайся на имена доков как evidence. Это должен быть документ, заменяющий чтение десятков архивов. Return ONLY markdown.\\n\\n'
  + 'INTENT EXTRACTIONS:\\n' + JSON.stringify(intent.filter(Boolean)) + '\\n\\nARCHIVE SCAN:\\n' + JSON.stringify(logs.filter(Boolean)),
  { phase: 'Synthesize', label: 'REQUIREMENTS_SOT' }
);

return {
  stats: { clusters: okClusters.length, intentDocs: INTENT_DOCS.length, logDocs: LOG_DOCS.length, logBatches: logBatches.length },
  clusterOneLiners: okClusters.map((c) => ({ name: c.name, oneLiner: c.oneLiner })),
  archMd: arch,
  reqMd: req,
};
`;

fs.writeFileSync(path.join(ROOT, 'tools', 'arch-workflow.js'), script);
console.log(`clusters=${CLUSTERS.length} intentDocs=${intentDocs.length} logDocs=${logDocs.length} logBatches=${Math.ceil(logDocs.length / 8)}`);
console.log(`approx agents = ${CLUSTERS.length} + ${intentDocs.length} + ${Math.ceil(logDocs.length / 8)} + 2 = ${CLUSTERS.length + intentDocs.length + Math.ceil(logDocs.length / 8) + 2}`);
console.log('intentDocs:', intentDocs.join(', '));
console.log('\\nwrote tools/arch-workflow.js');
