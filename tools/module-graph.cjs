#!/usr/bin/env node
/**
 * module-graph.cjs — deterministic import-dependency extractor + visualizer for
 * the BodgeGene frontend (gui/designer/src). Walks every non-test .js/.jsx,
 * parses static/side-effect/re-export/dynamic imports, resolves relative specs
 * to module ids, and emits:
 *   - module-graph.json   (nodes + edges, module-level + cluster-level)
 *   - module-graph.html   (interactive vis-network: Clusters / Modules toggle)
 *   - a Mermaid cluster diagram + stats to stdout
 *
 * Pure tooling — no app deps. Run: node tools/module-graph.cjs
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'gui', 'designer', 'src');
const EXTS = ['.js', '.jsx'];

// ── walk ────────────────────────────────────────────────────────────────
function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) {
      if (name === '__tests__' || name === 'node_modules' || name === 'assets') continue;
      walk(p, out);
    } else if (EXTS.includes(path.extname(name)) && !/\.test\.|\.spec\./.test(name)) {
      out.push(p);
    }
  }
  return out;
}

const rel = (p) => path.relative(SRC, p).split(path.sep).join('/');

// ── cluster assignment ──────────────────────────────────────────────────
function clusterOf(id) {
  const parts = id.split('/');
  if (parts[0] === 'components') return parts.length > 1 ? `components/${parts[1]}` : 'components';
  if (parts.length === 1) return 'root';            // src/*.js
  return parts[0];                                  // store, lib, hooks, db, schemas, canvas
}

// ── import resolution ───────────────────────────────────────────────────
function resolve(fromFile, spec) {
  if (!spec.startsWith('.')) return null;           // external / bare → skip
  const base = path.resolve(path.dirname(fromFile), spec);
  const cands = [
    base, base + '.js', base + '.jsx',
    path.join(base, 'index.js'), path.join(base, 'index.jsx'),
  ];
  for (const c of cands) {
    try { if (fs.statSync(c).isFile()) return rel(c); } catch { /* nope */ }
  }
  return null;                                       // unresolved (e.g. .json/.css) → skip
}

const IMPORT_RE = /(?:^|\n)\s*(?:import|export)\b[^;\n]*?\bfrom\s*['"]([^'"]+)['"]/g;
const SIDE_RE = /(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g;
const DYN_RE = /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g;

// ── build graph ─────────────────────────────────────────────────────────
const files = walk(SRC);
const nodes = new Map();   // id -> { id, cluster, loc, inDeg, outDeg }
const edgeSet = new Set(); // "from->to"
const edges = [];

function node(id) {
  if (!nodes.has(id)) nodes.set(id, { id, cluster: clusterOf(id), loc: 0, inDeg: 0, outDeg: 0 });
  return nodes.get(id);
}

for (const f of files) {
  const id = rel(f);
  const src = fs.readFileSync(f, 'utf8');
  const n = node(id);
  n.loc = src.split('\n').length;
  const specs = new Set();
  for (const re of [IMPORT_RE, SIDE_RE, DYN_RE]) {
    let m; re.lastIndex = 0;
    while ((m = re.exec(src))) specs.add(m[1]);
  }
  for (const spec of specs) {
    const target = resolve(f, spec);
    if (!target || target === id) continue;
    const key = `${id}->${target}`;
    if (edgeSet.has(key)) continue;
    edgeSet.add(key);
    edges.push({ from: id, to: target });
    node(target).outDeg; // ensure target node exists
  }
}
// degrees
for (const e of edges) { nodes.get(e.from).outDeg++; nodes.get(e.to).inDeg++; }

// ── cluster aggregation ─────────────────────────────────────────────────
const clusters = new Map(); // name -> { name, modules, loc }
for (const n of nodes.values()) {
  if (!clusters.has(n.cluster)) clusters.set(n.cluster, { name: n.cluster, modules: 0, loc: 0 });
  const c = clusters.get(n.cluster); c.modules++; c.loc += n.loc;
}
const cEdge = new Map(); // "a->b" -> count
for (const e of edges) {
  const a = nodes.get(e.from).cluster, b = nodes.get(e.to).cluster;
  if (a === b) continue;
  const k = `${a}->${b}`; cEdge.set(k, (cEdge.get(k) || 0) + 1);
}

// ── palette ─────────────────────────────────────────────────────────────
const PALETTE = ['#e6550d','#3182bd','#31a354','#756bb1','#636363','#e377c2','#17becf','#bcbd22','#8c564b','#1f77b4','#ff7f0e','#2ca02c','#d62728','#9467bd','#7f7f7f','#aec7e8'];
const clusterNames = [...clusters.keys()].sort();
const colorOf = {}; clusterNames.forEach((c, i) => { colorOf[c] = PALETTE[i % PALETTE.length]; });

// ── emit json ───────────────────────────────────────────────────────────
const data = {
  generatedFrom: 'gui/designer/src (non-test .js/.jsx)',
  stats: { modules: nodes.size, edges: edges.length, clusters: clusters.size },
  nodes: [...nodes.values()],
  edges,
  clusters: [...clusters.values()].map((c) => ({ ...c, color: colorOf[c.name] })),
  clusterEdges: [...cEdge.entries()].map(([k, count]) => { const [from, to] = k.split('->'); return { from, to, count }; }),
};
// Attach agent-written cluster descriptions (from the arch workflow) as tooltips.
try {
  const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'cluster-descriptions.json'), 'utf8'));
  // Agents returned names inconsistently (some with the `components/` prefix,
  // some without) — match on a normalized key.
  const norm = (s) => String(s).replace(/^components\//, '').toLowerCase().trim();
  const byNorm = {};
  for (const [k, v] of Object.entries(raw)) byNorm[norm(k)] = v;
  data.clusters.forEach((c) => { c.desc = raw[c.name] || byNorm[norm(c.name)] || ''; });
} catch { /* descriptions not generated yet — tooltips fall back to the name */ }
fs.writeFileSync(path.join(ROOT, 'module-graph.json'), JSON.stringify(data, null, 2));

// ── emit html ───────────────────────────────────────────────────────────
const html = `<!doctype html><html><head><meta charset="utf-8"><title>BodgeGene — module graph</title>
<script src="https://unpkg.com/vis-network/standalone/umd/vis-network.min.js"></script>
<style>
  body{margin:0;font:13px/1.4 system-ui,sans-serif;background:#1c1917;color:#e7e5e4}
  #bar{padding:8px 12px;background:#292524;border-bottom:1px solid #44403c;display:flex;gap:14px;align-items:center;flex-wrap:wrap}
  #bar b{color:#fafaf9}
  #net{width:100vw;height:calc(100vh - 92px)}
  button,input{font:12px system-ui;background:#1c1917;color:#e7e5e4;border:1px solid #57534e;border-radius:4px;padding:4px 8px;cursor:pointer}
  button.on{background:#e6550d;border-color:#e6550d;color:#fff}
  #legend{padding:6px 12px;background:#292524;border-top:1px solid #44403c;display:flex;gap:10px;flex-wrap:wrap;font-size:11px;max-height:46px;overflow:auto}
  .lg{display:flex;align-items:center;gap:4px}.sw{width:10px;height:10px;border-radius:2px;display:inline-block}
</style></head><body>
<div id="bar">
  <b>BodgeGene module graph</b>
  <span>${data.stats.modules} modules · ${data.stats.edges} imports · ${data.stats.clusters} clusters</span>
  <button id="bCluster" class="on">Clusters</button>
  <button id="bModules">Modules</button>
  <input id="q" placeholder="highlight module…" style="cursor:text">
  <span style="color:#a8a29e">drag · scroll-zoom · click a cluster node to see its size</span>
</div>
<div id="net"></div>
<div id="legend"></div>
<script>
const DATA = ${JSON.stringify({ nodes: data.nodes, edges: data.edges, clusters: data.clusters, clusterEdges: data.clusterEdges, colorOf })};
const el = document.getElementById('net');
let network;
function draw(mode){
  let nodes, edges;
  if(mode==='clusters'){
    nodes = DATA.clusters.map(c=>({id:c.name,label:c.name+'\\n('+c.modules+')',title:c.desc||c.name,color:c.color,
      value:c.loc,shape:'dot',font:{color:'#e7e5e4',size:14}}));
    edges = DATA.clusterEdges.map(e=>({from:e.from,to:e.to,value:e.count,arrows:'to',
      color:{color:'#57534e',opacity:0.6},smooth:{type:'continuous'}}));
  } else {
    nodes = DATA.nodes.map(n=>({id:n.id,label:n.id.split('/').pop(),title:n.id+' ('+n.loc+' loc)',
      color:DATA.colorOf[n.cluster],value:1+n.inDeg,shape:'dot',font:{color:'#d6d3d1',size:9}}));
    edges = DATA.edges.map(e=>({from:e.from,to:e.to,arrows:'to',color:{color:'#44403c',opacity:0.35},smooth:false}));
  }
  network = new vis.Network(el,{nodes:new vis.DataSet(nodes),edges:new vis.DataSet(edges)},{
    physics:{stabilization:{iterations:mode==='clusters'?300:120},barnesHut:{gravitationalConstant:mode==='clusters'?-8000:-3000,springLength:mode==='clusters'?180:60}},
    interaction:{hover:true,tooltipDelay:120},
    nodes:{scaling:{min:6,max:mode==='clusters'?60:26}}
  });
  window.network=network;
  // Freeze layout once stable so the canvas stops animating (screenshot-safe).
  network.once('stabilizationIterationsDone',()=>network.setOptions({physics:false}));
}
function setMode(m){
  document.getElementById('bCluster').classList.toggle('on',m==='clusters');
  document.getElementById('bModules').classList.toggle('on',m==='modules');
  draw(m);
}
document.getElementById('bCluster').onclick=()=>setMode('clusters');
document.getElementById('bModules').onclick=()=>setMode('modules');
document.getElementById('q').oninput=(e)=>{
  const q=e.target.value.toLowerCase(); if(!q||!network)return;
  const hit=DATA.nodes.find(n=>n.id.toLowerCase().includes(q));
  if(hit){try{network.selectNodes([hit.id]);network.focus(hit.id,{scale:1.2,animation:true});}catch(_){}}
};
const lg=document.getElementById('legend');
DATA.clusters.sort((a,b)=>b.modules-a.modules).forEach(c=>{
  const d=document.createElement('div');d.className='lg';
  d.innerHTML='<span class="sw" style="background:'+c.color+'"></span>'+c.name+' ('+c.modules+')';lg.appendChild(d);
});
setMode('clusters');
</script></body></html>`;
fs.writeFileSync(path.join(ROOT, 'module-graph.html'), html);

// ── stdout: stats + mermaid cluster diagram + hubs ──────────────────────
console.log(`MODULES=${nodes.size} EDGES=${edges.length} CLUSTERS=${clusters.size}`);
console.log('\nTop clusters (modules / loc):');
[...clusters.values()].sort((a, b) => b.modules - a.modules)
  .forEach((c) => console.log(`  ${c.name.padEnd(26)} ${String(c.modules).padStart(4)}  ${c.loc} loc`));
console.log('\nMost-imported modules (in-degree):');
[...nodes.values()].sort((a, b) => b.inDeg - a.inDeg).slice(0, 12)
  .forEach((n) => console.log(`  ${String(n.inDeg).padStart(3)}  ${n.id}`));

const safe = (s) => s.replace(/[^a-zA-Z0-9]/g, '_');
console.log('\n```mermaid\ngraph LR');
for (const c of clusterNames) console.log(`  ${safe(c)}["${c}\\n${clusters.get(c).modules}"]`);
[...cEdge.entries()].filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1])
  .forEach(([k, n]) => { const [a, b] = k.split('->'); console.log(`  ${safe(a)} -->|${n}| ${safe(b)}`); });
console.log('```');
