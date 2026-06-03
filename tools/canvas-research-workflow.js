export const meta = {
  name: 'canvas-deep-research',
  description: 'Robust deep research (OSS cloning/SynBio) → integrated BodgeGene canvas model: data + primers + git + visual',
  phases: [
    { title: 'Research', detail: '12 web+repo research agents (text, no schema)' },
    { title: 'Synthesize', detail: 'data-model / primers+git / visual sections' },
  ],
};

// Search/read agents return free TEXT (NO schema) — this is the fix for the
// built-in deep-research failure ("subagent completed without StructuredOutput").
const TOPICS = [
  { label: 'opencloning-datamodel', p:
`Research the OpenCloning data model IN DEPTH (LinkML: CloningStrategy, Sequence, Source subclasses incl. AssemblyFragment, SequenceRange/SimpleSequenceLocation, schema_version + migrations, primers). Use WebSearch + WebFetch (github.com/manulera/OpenCloning, opencloning.github.io/OpenCloning_LinkML, docs.opencloning.org). ALSO Read docs/archive/COMPARATIVE_OPENCLONING.md. Return a detailed findings brief: concrete schema facts, inline source URLs, and exactly how each maps to BodgeGene's four-tier (Source/Piece/Reaction/Product), Dexie and .bodge.` },
  { label: 'cloning-primer-mgmt', p:
`Research how cloning-design tools MANAGE PRIMERS: OpenCloning Primers tab (Tm/GC), DIVA/j5 oligo design+ordering, Benchling/SnapGene primer handling, pydna primer design, primer pools/registries. How do primers ATTACH to PCR/assembly steps in the data model? 5'-tail vs binding region; overhang tails for Gibson/GoldenGate/RE. WebSearch+WebFetch. ALSO Read store/primerSlice.js, db/dexie-schema.js, local-primer-design.js. Return findings + a concrete recommendation for where primers live in BodgeGene (unified pool + per-reaction refs) and how they appear on the canvas.` },
  { label: 'sbol-visual', p:
`Research SBOL Visual 3 FULLY: glyph categories (promoter/RBS/CDS/terminator/operator/origin/restriction-site/insulator/etc., molecular species, interactions), strand/baseline layout rules, the glyph ontology, and SBOLCanvas/VisBOL/DNAplotlib/paraSBOLv tooling. WebSearch+WebFetch (sbolstandard.org/visual-glyphs, visual-specification, arxiv 2507.04601). Return the concrete glyph list + usage rules + a recommended BodgeGene glyph set mapped to our feature types (CDS/marker/reporter/promoter/terminator/rep_origin/RBS/...).` },
  { label: 'sbol3-prov', p:
`Research the SBOL3 data model (Component, Sequence, SubComponent, Feature, hierarchical composition) AND W3C PROV-O (Entity/Activity/Agent, wasGeneratedBy/used/wasDerivedFrom) and how SynBio tools capture build provenance. WebSearch+WebFetch. ALSO Read docs/archive/COMPARATIVE_OSS_HARVEST.md. Return findings + verdict on SBOL3 export (not native) for BodgeGene + how Source→Reaction→Product aligns with PROV (Entity=Sequence, Activity=Reaction).` },
  { label: 'diva-j5-deviceeditor', p:
`Research DIVA / j5 / DeviceEditor (BioCAD): the drag-and-drop part canvas, how parts are arranged, how j5 assembly design is represented as data (assembly pieces, junctions, methods SLIC/Gibson/CPEC/GoldenGate), ICE registry integration. WebSearch+WebFetch. Return findings + UX + data patterns to adopt/avoid for BodgeGene's zone canvas.` },
  { label: 'construct-canvas-ux', p:
`Research construct-design CANVAS UX patterns in Genetic Constructor (Autodesk), Benchling, SnapGene (PATTERNS ONLY — do not reproduce proprietary content): block/part arrangement, inline sequence editing, assembly wizards, version-history UI, drag-to-build. WebSearch. Return UX patterns relevant to a sequence-first editable canvas + concrete differentiators for BodgeGene.` },
  { label: 'versioning-git-dna', p:
`Research VERSION CONTROL for genetic constructs: OpenCloning history-as-provenance, Benchling version history, JBEI-ICE, "git for DNA"/Plasmid version trees, provenance (PROV) vs linear version history. KEY QUESTION: assembly-provenance graph (DAG of how a construct was built across molecules) vs sequence-edit history (linear commits within ONE molecule) — same axis or TWO different axes? WebSearch+WebFetch. ALSO Read lib/plasmid-git.js and grep the repo for plasmid-git usage (it is currently disconnected — TD-PLASMID-GIT-LOSS). Return findings + a concrete recommendation for how BodgeGene should attach versioning/git, reconciling plasmid-git with the provenance graph.` },
  { label: 'pydna-engine', p:
`Research pydna's assembly graph + Dseqrecord model (overlap graph: nodes=overlaps, edges=fragments; circular/linear products; Gibson/GoldenGate/restriction simulation; gel). WebSearch+WebFetch (github.com/pydna-group/pydna, paper PMID 25933606). Return findings + what reaction-RESULT data BodgeGene's model should store per reaction (product seq, junctions, simulated outcome).` },
  { label: 'reactflow-ux', p:
`Research node-graph CANVAS UX at scale (React Flow / @xyflow): grouping/sub-flows (parent extent), collapse/expand, auto-layout (dagre/elk/d3-hierarchy), edge routing, virtualization, minimap, pan/zoom, multi-select. Plus general node-editor UX (n8n, Blender, Unreal Blueprints) for frames/zones. WebSearch+WebFetch (reactflow.dev/learn/layouting, examples/grouping). Return concrete patterns to adopt for BodgeGene's Miro-zone four-tier canvas (we already use @xyflow for the project DAG).` },
  { label: 'assembly-standards', p:
`Research assembly STANDARDS shaping canvas/data: MoClo / Golden Gate Type IIS hierarchical assembly (levels, fusion sites, standard overhangs), Gibson, Gateway (att sites), BioBricks/iGEM. How do design tools encode method-specific constraints? WebSearch+WebFetch. Return how a generic four-tier model should encode constraints (GG fusion-site compatibility, MoClo levels, Gateway att) without 16 god-classes.` },
  { label: 'fungal-context', p:
`Research fungal expression platform construct design (Aspergillus niger, Trichoderma reesei): typical vectors, promoters (PgpdA, cbh1, glaA), selection markers (pyrG, hph, amdS), integration loci, codon usage, and what generic tools (SnapGene/Benchling/OpenCloning) LACK for fungi. WebSearch. Return BodgeGene-specific canvas differentiators (templates, knowledge integration, markers).` },
  { label: 'our-system', p:
`Read our OWN system docs to ground the synthesis: docs/CANVAS_DESIGN_PROPOSAL.md, docs/SOURCE_OF_TRUTH.md, docs/ARCHITECTURE_MAP.md (cluster sections for CanvasSkeleton/store/lib/root), docs/SPEC_ASSEMBLY_PIECE_MODEL.md, docs/SPEC_ASSEMBLY_JUNCTION_MODULE.md, docs/archive/SPEC_M-CANVAS-FOUR-TIER-ARCHITECTURE.md. Grep store/ for slices. Return a precise summary of BodgeGene's CURRENT canvas data model (pieces/zones/operations/products), primer pool (primerSlice), Dexie tables, and the locked ⚓ decisions (DAG-as-edge, zones-only, sequence-first, SBOL3-not-native) that any proposal must respect. This is the integration anchor.` },
];

phase('Research');
const found = await parallel(TOPICS.map((t) => () => agent(t.p, { label: 'r:' + t.label, phase: 'Research', model: 'sonnet' })));
const findings = found.map((f, i) => (f ? '### ' + TOPICS[i].label + '\n' + f : '')).filter(Boolean).join('\n\n---\n\n');

phase('Synthesize');
const dataModelMd = await agent(
  'You are the lead architect for BodgeGene (local-first React SPA visual plasmid designer; four-tier Source→Piece→Reaction→Product canvas with Miro-zones, sequence-first; Dexie + .bodge format; fungal expression focus). Using the RESEARCH below, write the **DATA MODEL** section of a design doc, in RUSSIAN prose (keep code identifiers / file names / standard names in English). Cover: (1) provenance graph (sequences+sources) and the exact mapping to our four-tier; (2) flat-by-id storage shape in Dexie + .bodge v2 (concrete TS/JSON); (3) abstract↔concrete (plan vs built) duality keeping sequence-first; (4) operation discriminated-union by `kind` with per-method fields + how method constraints (GG fusion sites, MoClo levels, Gateway att) attach WITHOUT 16 god-classes; (5) schema_version + migrations; (6) PROV-O / SBOL3-export alignment. Include a Mermaid diagram. Cite sources inline (URLs). MUST respect locked ⚓ (DAG-as-edge DEC-V2-02, zones-only, sequence-first, SBOL3-not-native DEC-V2-10) — flag any tension. Return ONLY markdown.\n\nRESEARCH:\n' + findings,
  { label: 'synth:data-model', phase: 'Synthesize' },
);
const primersGitMd = await agent(
  'Lead architect for BodgeGene. Using the RESEARCH below, write TWO sections in RUSSIAN (code/identifiers in English):\n\n## Праймеры в модели\nWhere primers live: unified pool (our `primerSlice` + Dexie `primers` table) + per-reaction references; the tail(5-prime overhang)/binding model; overhang tails for Gibson/GoldenGate/RE (our local-primer-design conventions V123-125); how primers appear ON the canvas (PrimerTrack pentagon arrows on pieces) and in the provenance graph (a PCR Reaction references 2 primers from the pool). UX: design/order/Tm. Concrete shapes.\n\n## Git / версионирование\nThe TWO-AXIS insight: (a) assembly-provenance DAG (how a construct was BUILT across molecules — our four-tier graph) vs (b) sequence-edit history (linear commits WITHIN one molecule — our `plasmid-git`: baseSnapshot+commits+replay, currently DISCONNECTED per TD-PLASMID-GIT-LOSS). Are these the same? Recommendation: how to attach BOTH cleanly in four-tier (provenance graph = build history for free; plasmid-git revived as per-Piece/Product sequence-edit history on containers), how they interoperate, what to store in .bodge, and whether to revive or replace plasmid-git. Cite sources inline. Respect locked ⚓. Return ONLY markdown.\n\nRESEARCH:\n' + findings,
  { label: 'synth:primers-git', phase: 'Synthesize' },
);
const visualMd = await agent(
  'Lead designer for BodgeGene. Using the RESEARCH below, write the **VISUAL + INTERACTION** section in RUSSIAN (code/identifiers English). Cover: (1) two coordinated views of one model (provenance zone-canvas ⇄ sequence-first editable, our G/S-toggle); (2) a concrete SBOL Visual 3 glyph set mapped to OUR feature types (CDS/marker/reporter/promoter/terminator/rep_origin/RBS/primer_bind/protein_bind) + the mandatory rules (specific not generic, consistent backbone, explicit arrows); (3) interaction: «+»-under-node→form (OpenCloning), drag part-icons into zone (DeviceEditor), drag-edge, hide-ancestors/collapse-zone, reaction preview, primer glyphs lane, a git/version timeline affordance, «два клика»; (4) React Flow patterns (grouping/extent:parent, dagre/elk auto-layout, virtualization, minimap); (5) an «взять / не брать» table with sources. Also give a concrete SPEC for an upgraded visual mockup (panels: zone-canvas, sequence-first with primer lane, version timeline, legend). Cite inline. Respect locked ⚓. Return ONLY markdown.\n\nRESEARCH:\n' + findings,
  { label: 'synth:visual', phase: 'Synthesize' },
);

return { topics: TOPICS.map((t) => t.label), dataModelMd, primersGitMd, visualMd };
