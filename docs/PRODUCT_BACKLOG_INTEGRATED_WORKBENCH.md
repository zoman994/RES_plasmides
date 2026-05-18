# PRODUCT_BACKLOG_INTEGRATED_WORKBENCH.md

> **Назначение.** Стратегический backlog BodgeGene на 12-18 месяцев вперёд. **Не контракт, манифест.** Перечитывается раз в месяц, корректируется по мере уточнения vision. Содержит strategic positioning + 4 столпа differentiation + wave-list (wave 2+) + open strategic questions + anti-feature-creep принципы.
>
> **Тип:** A (strategic vision-level, beyond single sprint).
> **Создан:** 12.05.2026 поздний вечер по обсуждению Игорь ↔ Chat.
> **Контракт.** Этот документ — **компас**, не roadmap. Wave 1 (M-CANVAS-V2-TO-PRODUCTION) — конкретный roadmap в `docs/ROADMAP_CANVAS_V2_TO_PRODUCTION.md`. Wave 2+ описываются здесь high-level; детальные spec'и пишутся в спрейт-кикофф сессиях когда подходим к старту wave.
>
> **Когда обновлять.** При закрытии каждого wave (передвинуть статус + recap). При появлении новых стратегических insight'ов (записать в open questions либо переформулировать positioning). При изменении приоритетов wave-list (явный edit с reason).

---

## 1. Strategic positioning

**Что BodgeGene делает.** Integrated workbench для биолога работающего с **filamentous fungi expression systems** (Aspergillus niger, Trichoderma reesei, Aspergillus fumigatus, Pichia pastoris, Yarrowia lipolytica). Покрывает **полный цикл эксперимента** — от planning ассемблии конструктов до получения и интерпретации результатов wet-lab. Не drawing tool, не database viewer, не cloud SaaS. **Investigator-grade research instrument** для одного scientist'а (либо small lab) которому нужно designed + plan + execute + capture + analyze + iterate без выхода из одного инструмента.

**Что BodgeGene НЕ делает.** Не пытается заменить SnapGene/Benchling в их собственной нише (general-purpose plasmid editor либо cloud collaboration). Не делает real-time multi-user editing. Не делает mobile. Не делает 3D structure visualization. Не делает AI-coding-assistant который пишет primers за биолога без understanding. Не делает clinical-grade analyses (regulatory compliance — отдельный mountain). Не делает high-throughput screening automation (это область j5 / Twist / Inscripta).

**Target user.**
- **Primary:** академический биолог / PhD student работающий с filamentous fungi expression (own constructs, own strains, own experiments). Solo либо small group (2-5 people in lab).
- **Secondary:** industrial researcher в малых biotech компаниях работающих с fungal expression (10-50 employees, own IP, no enterprise SaaS budget).
- **Tertiary:** академический PI рассматривающий BodgeGene как teaching tool для graduate students в molecular biology / biotech courses.

**Не target user.**
- E. coli-only researchers (SnapGene / Benchling cover their needs better).
- Mammalian cell biology (Twist Bioscience либо custom tools).
- Synthetic biology high-throughput (j5, Genome Compiler).
- Big pharma enterprise teams (Benchling Enterprise).

**Differentiator одной фразой.** «Tool который понимает контекст filamentous fungi expression и помогает с design + planning + execution + interpretation вместо того чтобы биолог сам собирал знание из 5 разных places».

## 2. Стратегические вопросы которые открыты

**Q-STRAT-01 — Public service vs self-hostable.** Это **самый важный** open strategic question. Два пути с разными последствиями.

- **Public service** (cloud-hosted, accounts, optional pricing tiers): больший reach, но требует SaaS infrastructure, multi-tenancy, security, compliance, ongoing maintenance. Подходит академическому community-tool с freemium tier.
- **Self-hostable** (local-first, optional sync): меньше friction для adoption, но затрудняет distribution, нет user analytics, нет community. Подходит investigator-grade тулу.

Игорь имеет access к institutional computing cluster — это **слегка склоняет** к self-hostable + optional cluster integration для compute. Но не закрывает вопрос. Решение **до M-CANVAS-MERGE** (sprint в Wave 1), потому что меняет deployment architecture фундаментально.

**Q-STRAT-02 — Open source vs proprietary vs hybrid.** Если open source — какая лицензия (MIT, Apache 2.0, AGPL для cloud protection). Если proprietary — какая business model. Hybrid (core OSS + premium features cloud-only) часто работает. Решение **не блокирует** разработку, но влияет на community engagement и paper-knowledge integration (если paper-DB curated — нужны attribution rights).

**Q-STRAT-03 — AI/ML scope.** Текущий план — local inference через ONNX Runtime Web / WebGPU (HyenaDNA-tiny, DNABERT-2 via LoRA) для annotation enhancement. **Trade-off**:
- Local inference — privacy preserved, no API costs, but slower + 4 GB VRAM constraint Игоря.
- Cloud inference (OpenAI / Anthropic API либо self-hosted на cluster) — faster + larger models, but introduces dependency.

Решение **до M-KNOWLEDGE-PAPERS** (Wave 3), потому что paper embeddings + context-aware recommendations требуют ML infrastructure.

**Q-STRAT-04 — Pricing если когда-нибудь.** Free для academic, paid для commercial? Donation-based? Sponsored development? Решение **отложено** до validation что product fit existing — нет смысла обсуждать pricing до того как product proven нужным.

**Q-STRAT-05 — Audience scope expansion.** Когда / как расширяться за пределы fungi (E. coli, yeast, mammalian)? Foundation для expansion уже заложена (multi-organism architecture), но **timing critical**: слишком рано — теряется fungal differentiator, слишком поздно — конкуренты заняли соседние ниши. Решение **по итогам Wave 2** (когда fungal-specific MVP shipped и есть real user feedback).

**Q-STRAT-06 — Regulatory + IP.** Биолог использующий BodgeGene в commercial setting может беспокоиться: где хранятся данные, кто видит constructs, есть ли audit trail. Self-hostable + local-first решает большую часть, но если есть cloud sync component — нужна clear policy. Решение **до первого commercial user**.

---

## 3. 4 столпа differentiation

### Столп 1 — Knowledge integration (CAZy + Restriction enzymes DB + Pfam + curated papers)

**Что это.** База знаний интегрирована **inline в design surface**, не как отдельный search-engine. Биолог не уходит «искать paper», система **сама** подсказывает в момент design decision.

**Конкретные примеры:**
- В CutOpPopup enzyme select — не просто список из 200 commercial enzymes, а **searchable knowledge view** с filters (overhang type, recognition length, methylation sensitivity, star activity, supplier, price). Click enzyme → side panel «Used in 47 papers for similar fungal expression workflows, common buffer NEB rCutSmart, typical concentration 10-20 U/μL, watch for star activity at high concentrations».
- Container view на любой sequence → auto-detection «contains 3 EcoRI sites + 1 BamHI site + 2 BsaI sites (Golden Gate compatible)». Hover на CDS → «similar to CAZy GH18 family member, see 5 papers using related constructs».
- Annotator → annotation suggestions подкреплены **доказательством**: «predicted as GH18 chitinase, confidence 0.94, see PMID:12345678, similar to A.fumigatus AFUA_6G02680 (3 papers report functional similarity)».

**Технологически.** Local DB (либо bundled, либо first-run download) — `knowledge/` directory с structured JSON files:
- `restriction-enzymes.json` (~50 KB, ~600 enzymes, NEB + commercial sources).
- `cazy-families.json` (~150 KB, all CAZy families with key members, fungal focus).
- `pfam-fungal.json` (~500 KB curated subset for fungal expression).
- `examples.json` (papers-curated examples, growing list).
- `secretion-signals.json` (signal peptides for filamentous fungi).
- `fungal-promoters.json` (glaA, cbh1, gpdA, etc. with strength data).

**Wave alignment.** Wave 2 (M-KNOWLEDGE-MVP) — restriction enzymes DB integrated + basic CAZy lookup. Без papers integration, без embeddings. Wave 3 (M-KNOWLEDGE-PAPERS) — full papers integration через embeddings, context-aware recommendations.

**Что **не** входит в knowledge integration:**
- Real-time literature search (это PubMed)
- Full-text paper viewer (это Zotero / Mendeley)
- Citation management (это reference managers)

Knowledge integration = **curated subset + contextual surface**, не universal literature tool.

### Столп 2 — Multi-organism с filamentous fungi-first

**Что это.** Каждый container, каждая operation, каждая аннотация **знает organism context**. Codon tables, secretion signals, promoter strength, glycosylation patterns — **organism-specific**, не universal.

**Конкретные примеры:**
- Container.meta получает `organism` либо `expression_host` field. Drag container на canvas → автоматически inherited organism context project'а либо явный select.
- Codon optimization operation на canvas — popup с organism select (default = project organism). Output — optimized sequence + diff vs original + estimated impact на expression.
- Secretion signal prediction — auto-runs при addition CDS-annotation, integrated с Aspergillus-specific либо Trichoderma-specific SignalP variants (если доступны) plus DeepTMHMM либо locally-trained model.
- Promoter strength estimation — для well-known fungal promoters (glaA, cbh1, gpdA, amyB, gla1, etc.) есть **measured data** из papers, biolog видит «glaA promoter expected strength X-fold over baseline».
- Glycosylation pattern prediction — N-linked sites detection, prediction для filamentous fungi (different from yeast/mammalian).

**Технологически.** Расширение `container.meta` shape + extension Library tree filters + Annotator integration с CAZy/Pfam + new operation kinds (`CodonOptimizeOpPopup`, `GlycoPredictOpPopup`, optional). Heavy compute через **institutional cluster** integration (SLURM-job submission для AUGUSTUS, DeepTMHMM, Helixer).

**Wave alignment.** Wave 2 (M-MULTIORGANISM-FOUNDATION) — organism field + basic codon tables + Aspergillus/Trichoderma data. Wave 2 (M-FUNGAL-SPECIFIC) — promoter strength data, secretion signal pred integration, glycosylation prediction. Wave 3 (M-MULTIORGANISM-EXPANSION) — Pichia, Yarrowia, расширение beyond filamentous fungi (E. coli, yeast).

**Что **не** входит:**
- Mammalian cell expression (out of scope ever)
- Insect cell expression (out of scope ever)
- Plant expression (out of scope ever)
- Cell-free expression systems (out of scope для wave 2-3, может быть later)

### Столп 3 — Protocols as first-class objects

**Что это.** Protocol — это **separate entity** связанная с operations на canvas. Двойной взгляд: digital design (operations as ромбы) + wet-lab steps (linked protocol с timings, reagents, hands-on actions). Они **синхронизированы**: изменил PCR annealing temp на canvas → protocol step «PCR annealing» автоматически updated.

**Конкретные примеры:**
- Each operation kind на canvas (PCR, Cut, Gibson, Ligate, KLD, Mutagenesis) **link'нута** к protocol template. Default — auto-generated «Phusion PCR» protocol при PCR operation creation, с steps {denaturation 98°C 10s, annealing X°C 20s, extension 72°C N seconds, cycles 35, ...}.
- Biolog может **переопределить** protocol на конкретной operation через right-click → «Edit linked protocol». Видит inline editor steps с durations + reagents + notes.
- Canvas pipeline → exportable as **protocol-step-list** для бенча. Print-friendly либо PDF либо markdown с checkboxes для wet-lab.
- Protocol **history** — какие constructs были собраны через какой protocol, success rate.
- Protocol **library** — reusable templates («My Gibson with HiFi Master Mix», «In-house mutagenesis primer design SOP»), shared между projects.

**Технологически.** New entity `Protocol` в state либо в отдельной Dexie table:
- shape `{id, name, steps: [{description, duration_s, temperature_C, reagents, notes}], variables: {var_name: value}, related_operations: operationId[], created_at, last_used, success_count, fail_count}`.
- Linkage с operations: bidirectional. Operation references protocolId. Protocol references operationIds where used.
- Templates vs instances: `Protocol` can be **template** (reusable, parameterized) либо **instance** (привязан к конкретной operation, parameters frozen).
- Export formats: markdown checkboxes, PDF (print-friendly), JSON (machine-readable for protocol-sharing с лабораторными ELN если такие будут).

**Wave alignment.** Wave 2 (M-PROTOCOLS-MVP) — Protocol entity + canvas linkage + default templates для 6 operation kinds + simple markdown export. **Harvest из v0.5** — Игорь упомянул что в v0.5 «щупали» protocols. Recap что работало / что нет в `docs/V05_PROTOCOLS_RECAP.md` (предложено создать parallel этому backlog'у).

**Что **не** входит:**
- Robotic protocol execution (Opentrons, etc.) — out of scope для Wave 2-3, может быть в Wave 4+ как **separate integration track**.
- ELN-grade compliance, audit trails, GMP — out of scope ever (это enterprise market).
- Inventory tracking (reagent stock levels, expiry) — отдельный track, не protocol.

### Столп 4 — Lab journal + auto-analysis (wet-lab capture loop)

**Что это.** Биолог делает wet-lab experiment, получает результаты (gel photos, plate counts, sequencing chromatograms), и **связывает их с конкретной operation на canvas** через минимальный friction. Через 2 месяца открывает старый эксперимент → видит canvas pipeline + рядом с PCR operation thumbnail геля + auto-tagged result.

**Конкретные примеры:**
- Camera capture: phone либо laptop camera → photo + auto-OCR метаданных (date, sample IDs если written on gel либо tube labels) + auto-linkage с recent operation by temporal proximity. Biolog подтверждает «yes this is from PCR operation #17».
- ML классификация геля: «bands at expected size — success», «no bands — failure», «extra bands — non-specific amplification». **Coarse-grained** initially (success/fail/partial), не размер-точная quantification.
- Plate counts: photo of agar plate → ML colony counter → linked к Transform operation.
- Sequencing chromatogram (.ab1 либо .scf файлы): upload → auto-alignment с expected mutant sequence → highlights differences → linked к Mutagenesis либо KLD operation.
- All wet-lab data **searchable** через canvas — click operation → see all linked wet-lab evidence.

**Технологически.** New entity `WetLabEvidence` (либо `LabRecord` или подобное):
- shape `{id, kind: 'gel'|'plate'|'sequencing'|'note'|'photo', file: {path, hash}, captured_at, linked_operation_id, ml_classification, manual_notes, biolog_confirmation}`.
- Storage: photos в `lab-evidence/` directory в `.bodge` либо отдельный Dexie table.
- ML models: gel classifier — small CNN, runs locally. Plate counter — similar small model. Chromatogram alignment — alg + ML-assisted base calling.

**Wave alignment.** Wave 3 (M-LAB-CAPTURE-MVP) — camera capture + simple gel photo storage + manual linkage. Wave 3 (M-LAB-CAPTURE-ML) — ML classification, OCR, auto-linkage. **Не в Wave 2** — потому что требует stable Wave 2 foundation (Protocol + Operations) для linkage to be meaningful.

**Что **не** входит:**
- Real-time camera feed (continuous monitoring) — out of scope.
- HPLC / mass-spec / flow-cytometry data — out of scope для Wave 3, может быть Wave 4+ через **separate analysis track**.
- Robotic integration — out of scope.

---

## 4. Anti-positioning — что мы явно НЕ делаем

Это важно зафиксировать чтобы избежать feature-creep:

**Не делаем:**
- ❌ Real-time multi-user collaborative editing (Benchling-style). Если когда-нибудь — через optional sync, не core.
- ❌ Mobile native apps (iOS, Android). Web responsive — maybe но не приоритет.
- ❌ 3D protein structure visualization (PyMOL territory).
- ❌ Drug discovery / molecular docking (Schrodinger territory).
- ❌ Clinical-grade analyses, FDA submissions, GMP compliance (regulatory mountain).
- ❌ High-throughput screening automation (j5, Twist, Inscripta).
- ❌ AI-coding-assistant который ПИШЕТ primers / sequences за биолога без его understanding. AI помогает, биолог decides.
- ❌ Mammalian / insect / plant expression first-class. Could-be in future, но не приоритет.
- ❌ Genome editing tools (CRISPR design specifically — отдельные tools этим занимаются).
- ❌ Bioinformatics workflow management (Snakemake / Nextflow territory).
- ❌ Wet-lab inventory tracking (reagent stock, expiry, ordering).

Все эти «не делаем» — **defensible decisions**, не «may be later». Если они станут «may be later» — это сдвиг strategic positioning, требует явного re-evaluation этого документа.

---

## 5. Wave-list

### Wave 1 — M-CANVAS-V2-TO-PRODUCTION (текущий, in flight)

Подробности в `docs/ROADMAP_CANVAS_V2_TO_PRODUCTION.md`. **Status:** в работе, sprint M-CANVAS-OPS to Code, K1 разведка завершена (см. `docs/SPRINT_M_CANVAS_OPS_K1_DISCOVERY.md`).

Цель — vertical slice одного эксперимента end-to-end. После closing — фундамент для всего остального backlog'а готов.

**Sprints в wave 1:** M-CANVAS-OPS / M-CANVAS-OPS-PREVIEWS / M-CANVAS-PERSIST / M-CANVAS-MUTAGENESIS / M-CANVAS-POLISH / M-CANVAS-MERGE.

**Реалистичный timeline:** 2-4 месяца с текущей точки (12.05.2026).

### Wave 2 — M-INTEGRATED-WORKBENCH (post-Wave-1)

**Цель.** Knowledge integration + multi-organism + protocols MVP — 3 из 4 столпов differentiation становятся реальностью на минимально работающем уровне.

**Sprints:**

#### M-KNOWLEDGE-MVP

Restriction enzymes DB integrated в CutOpPopup (filter по recognition site / overhang type / methylation sensitivity / supplier). Basic CAZy family detection в annotation (lookup by sequence similarity либо annotation label). Без papers integration пока. Sub-tasks:
- Curate `knowledge/restriction-enzymes.json` (~600 enzymes from NEB / commercial sources, fungal-relevant subset prioritized).
- Curate `knowledge/cazy-families.json` (all CAZy GH families, focus on GH18 / GH7 / GH6 / GH61 / AA9 — fungal-relevant).
- Integrate в `CutOpPopup` enzyme select (replace simple dropdown с searchable view + filters).
- Integrate в Annotator (CAZy family lookup для CDS annotations).
- Side panel «Used in N papers» — **placeholder until M-KNOWLEDGE-PAPERS** в wave 3.

**Размер:** ~2-3 спринта (~30-60 KB curated data + 1-2 sprints UI work).

#### M-MULTIORGANISM-FOUNDATION

`container.meta.organism` field + Library tree filter «show only Aspergillus constructs» + codon optimization operation на canvas (`CodonOptimizeOpPopup`). Sub-tasks:
- Расширение container shape с `meta.organism` (либо top-level `organism` field).
- Library tree filters by organism.
- Codon tables для Aspergillus niger, Trichoderma reesei, Pichia pastoris, Yarrowia lipolytica.
- `CodonOptimizeOpPopup` на canvas, output — new container с optimized sequence + diff visualisation.
- Project-level default organism (set при project creation, inherited by containers).

**Размер:** ~1-2 спринта.

#### M-PROTOCOLS-MVP

Protocol entity + canvas linkage + default templates для 6 operation kinds + simple markdown export. Sub-tasks:
- Define Protocol entity shape (steps, variables, related_operations).
- New Dexie table `protocols`.
- Default templates per operation kind (PCR / Cut / Gibson / Ligate / KLD / Mutagenesis).
- Inline protocol editor (`ProtocolEditor.jsx`) для editing steps.
- Bidirectional linkage operation ↔ protocol.
- Export to markdown с checkboxes (print-friendly для bench).
- **Harvest из v0.5** — read v0.5 protocols code, reuse data structures / step format. Recap в `docs/V05_PROTOCOLS_RECAP.md` (создаётся parallel этому backlog'у).

**Размер:** ~2 спринта.

#### M-FUNGAL-SPECIFIC-FOUNDATION

Aspergillus / Trichoderma specific data — promoter strength, secretion signals, glycosylation patterns. Sub-tasks:
- Curate `knowledge/fungal-promoters.json` (glaA, cbh1, gpdA, amyB, gla1, alcA, niiA, plus ~20 others с measured strength data из papers).
- Integration с container annotation: detect promoter sequence → annotate as known promoter + strength info.
- Secretion signal prediction integration:
  - Local model SignalP-style для filamentous fungi (если existing model доступен через ONNX).
  - Либо institutional cluster integration (submit SLURM job DeepTMHMM, return results).
- Glycosylation site prediction (N-linked sites detection — regex-level, fast).
- New annotation types: «promoter_known» с strength field, «signal_peptide_predicted» с confidence.

**Размер:** ~2-3 спринта (зависит от ML model integration complexity).

**Wave 2 timeline:** ~6-9 месяцев после Wave 1 closing. **Total wave 2 sprints:** ~7-10.

### Wave 3 — M-LAB-CAPTURE + M-KNOWLEDGE-PAPERS (post-Wave-2)

**Цель.** Wet-lab capture loop + papers integration через embeddings. 4-й столп differentiation реализован, knowledge становится **truly contextual**.

**Sprints:**

#### M-LAB-CAPTURE-MVP

Camera capture + photo storage + manual linkage с operations. Sub-tasks:
- `<input type="file" capture="environment">` для phone / laptop camera.
- Storage в `.bodge/lab-evidence/` directory либо отдельный Dexie table с file blob.
- Manual linkage UI: «Attach to operation X» button.
- Simple gallery view per-project — все evidence files thumbnail grid с filter by operation / date.
- Manual notes на каждый evidence file.

**Размер:** ~2 спринта.

#### M-LAB-CAPTURE-ML

ML classification + OCR + auto-linkage. Sub-tasks:
- Gel classifier (small CNN либо vision transformer) — train on representative gel dataset (public sources либо Igor's own historical gels). Classify: success / partial / fail / unclear.
- OCR метаданных (date, sample IDs from labels на gel либо tube).
- Auto-linkage by temporal proximity к recent operation (within configurable window).
- Plate colony counter (similar small CNN либо classical CV).
- Chromatogram alignment (.ab1 / .scf parsing + alignment с expected mutant) — может использовать existing libraries (biopython).

**Размер:** ~3-4 спринта (зависит от ML training infrastructure availability).

#### M-KNOWLEDGE-PAPERS-MVP

Papers integration через embeddings + context-aware recommendations. Sub-tasks:
- Curated paper-DB — initially ~500-1000 papers manually selected (fungal expression focus). Growing list.
- Embedding model — HyenaDNA либо DNABERT-2 либо general scientific paper embeddings (SciBERT / Specter).
- Embedding pre-computation — batch process papers, store vectors in local DB.
- Context-aware search: «show papers relevant to this CDS» (CDS sequence → similarity search в paper-embeddings).
- Side panels в editor / canvas: «3 papers report similar mutation in this position», «similar promoter used in N papers, success rate X%».
- Citation metadata в knowledge entries (when biolog hovers «used in N papers» — see actual paper list).

**Размер:** ~3-4 спринта. **Большой sprint, требует ML infrastructure setup.**

**Wave 3 timeline:** ~6-9 месяцев после Wave 2 closing. **Total wave 3 sprints:** ~8-12.

### Wave 4 — AI annotation enhancement + extensibility (post-Wave-3)

**Цель.** Local AI inference через ONNX Runtime / WebGPU. Open API для third-party integrations. Custom container kinds extensibility.

**Sprints:**

#### M-AI-ANNOTATION

HyenaDNA-tiny / DNABERT-2 через LoRA + ONNX Runtime Web / WebGPU. Local browser inference либо optional cloud. Sub-tasks:
- Model conversion (PyTorch → ONNX).
- LoRA fine-tuning для fungal-specific tasks (CAZy family classification, secretion signal prediction, promoter strength estimation).
- ONNX Runtime Web integration в browser, WebGPU acceleration.
- Inference cache (avoid re-running models на одной sequence).
- Optional cloud fallback (если local не справляется либо model too large).
- Confidence calibration для AI predictions.

**Размер:** ~4-6 спринтов. **Требует ML infrastructure expertise.**

#### M-OPEN-API

Public API для third-party integrations. Sub-tasks:
- REST либо GraphQL endpoint для programmatic access к containers / operations / annotations.
- Python SDK для scripting (если biolog хочет запустить custom analysis через Python над любым container'ом на canvas).
- Plugin system для custom operations / annotation types.
- Documentation + examples.

**Размер:** ~2-3 спринта.

#### M-CUSTOM-KINDS-EXPANSION

Beyond oligonucleotide — RNA, protein, marker, complex constructs. Sub-tasks:
- Each new kind через `container-kind-registry.js` (foundation laid в Wave 1).
- Specific OpPopups per kind interactions.
- Tree icons + filtering.

**Размер:** ~2 спринта.

**Wave 4 timeline:** ~6-9 месяцев после Wave 3 closing.

### Wave 5+ — Open

Audience expansion beyond fungi (Q-STRAT-05), regulatory features если pursuing commercial market (Q-STRAT-06), advanced visualizations, lab robotics integration, etc. **Open** — формируется по итогам Waves 1-4 + real user feedback.

---

## 6. Принципы (anti-feature-creep guidelines)

Эти принципы — **filter** для каждой proposed feature. Если feature не fit'ит — re-evaluate.

**P1 — Local-first.** Приложение работает **без интернета**. Optional cloud sync — bonus, не requirement. Все данные хранятся локально в open format (`.bodge` как ZIP с JSON). User owns его data.

**P2 — Open format.** `.bodge` — публично документированный format (ZIP + structured JSON). Любой может написать parser. Lock-in невозможен. User может в любой момент migrate к другому tool через export.

**P3 — Python-scriptable.** Любой container на canvas доступен programmatically через Python SDK (после M-OPEN-API в Wave 4). Biolog может запустить custom analysis без выхода из BodgeGene.

**P4 — No friction между мыслью и системой.** Когда biolog думает «а что если бы я заменил вот этот residue на arginine» → 2 clicks max до actionable result. Каждый раз когда хочется добавить step / popup / dialog — спрашивай «можно ли без него». §17 R2 правило пары кликов — carry-over.

**P5 — Inline > wizard.** Wizards только когда строго N>3 sequential steps + redko (см. предыдущий обсуждение в чате). Большинство «многошаговых» процессов сводятся к single popup с collapsible sections либо drag-reorder list.

**P6 — Knowledge подкреплён доказательствами.** Любая system suggestion (CAZy family, promoter strength, mutation effect) должна показывать **source** (paper PMID, database entry, prediction confidence). Не «черный ящик AI говорит X», а «predicted X based on Y similarity, see paper Z, confidence 0.94».

**P7 — Biolog decides.** Tools не делают decisions за biolog'а. Они показывают context, options, predictions с confidence — biolog выбирает. Никакого auto-apply mutations / auto-design primers без explicit biolog click.

**P8 — Honesty over polish.** Frozen-on-use lifecycle (immutability) — пример honest design. Polished design hide complexity; honest design surface it appropriately. Biolog должен знать что happens с data, не предполагать что-то behind the scenes.

---

## 7. Параллельные подготовительные actions

**Не sprint'ы, а накапливающая работа.** Это файлы которые Игорь начинает писать **сейчас** для будущего Wave 2-3 prep. Без них Wave 2 sprints начнутся с пустого старта.

### `docs/KNOWLEDGE_BACKLOG.md`

Накапливающий список того что хочется в knowledge integration. Растёт по мере того как Игорь работает с проектами и встречает relevant items.

**Структура:**
- Restriction enzymes которые actively used in Игорь's experiments (priority for M-KNOWLEDGE-MVP curated subset).
- CAZy families которые приоритетны (GH18, GH7, GH6, GH61, AA9 — Trichoderma cellulases, Aspergillus chitinases — relevant к PhD work с Drosera).
- Promoters которые seen in literature как effective для Aspergillus / Trichoderma (glaA, cbh1, gpdA, amyB, gla1, etc.).
- Papers которые reference points в области fungal expression (curated reading list).
- Secretion signals known to work in filamentous fungi.

Без этого file через 3 месяца Wave 2 start будет с «а что вообще положить в knowledge». С file — 100+ entries ready.

**Action для Игоря:** создать `docs/KNOWLEDGE_BACKLOG.md` как empty structured list с placeholder секциями. Добавлять по мере встречи в работе. Раз в месяц — review + cleanup.

### `docs/V05_PROTOCOLS_RECAP.md`

Recap того что было в v0.5 protocols. Что работало / что нет / что забрать в M-PROTOCOLS-MVP / что переосмыслить.

**Структура:**
- Какие protocols были в v0.5 (PCR, restriction digest, Gibson, ligation, etc.).
- Какие данные структуры — steps shape, variables, durations.
- Что хорошо работало в UX (если что-то было).
- Что плохо работало (modal wizards если такие были, friction для biolog'а, etc.).
- Что забрать в M-PROTOCOLS-MVP (data structures, step templates).
- Что переосмыслить (UX patterns).

Без этого file Игорь через 6 месяцев забудет что было в v0.5 (если v0.5 code ещё в репо — можно прочитать, но recap accelerates).

**Action для Игоря:** найти v0.5 protocol code (если на disk), прочитать, написать recap. Сейчас, пока в памяти свежо. Положить в `docs/V05_PROTOCOLS_RECAP.md`.

### Будущие parallel actions (открыто)

По мере появления тем — возможно `docs/PAPER_DB_SEED.md` (curated reading list для M-KNOWLEDGE-PAPERS), `docs/LAB_GEL_DATASET.md` (sourcing dataset для M-LAB-CAPTURE-ML training), etc. Эти файлы создаются ad-hoc когда становятся relevant, не пред-заказываются.

---

## 8. Что обновляется в этом документе

**Регулярно** (раз в месяц либо при closing wave):
- Status каждого wave (in progress / closed / pending).
- Open strategic questions (Q-STRAT-01..06) — отвечены или ещё открыты.
- Wave-list — реалистичная sequence по мере того как priority меняется.

**Когда появляется новый insight** (явный edit с reason):
- Strategic positioning — если фундаментально меняется.
- Anti-positioning — если решено что-то добавить либо убрать из «не делаем».
- Принципы P1-P8 — если приoritization меняется.

**Не обновляется автоматически** — это **манифест**, не tracker. Sprint progress отслеживается в `CURRENT_TASK.md` + `PROJECT_STATE.md`. Этот документ — компас, raptor every month / two.

---

## 9. Open questions для следующего month-review

После closing Wave 1 (вероятно ~2-4 месяца с 12.05.2026):
1. Какие из Q-STRAT-01..06 ответились по итогам Wave 1?
2. Wave 2 sequence sprint'ов — M-KNOWLEDGE-MVP first, либо M-PROTOCOLS-MVP first, либо параллельно? Зависит от того что biolog почувствует most missing после Wave 1.
3. `KNOWLEDGE_BACKLOG.md` content — достаточно ли material для M-KNOWLEDGE-MVP MVP?
4. `V05_PROTOCOLS_RECAP.md` написан? Что забираем в M-PROTOCOLS-MVP?
5. Q-STRAT-01 (public service vs self-hostable) — нужно решить **до M-CANVAS-MERGE**. Какой direction?

---

_Создан 12.05.2026 поздний вечер по обсуждению Игорь ↔ Chat. Версия 1.0._
_Не sprint spec, не roadmap — манифест. Перечитывается раз в месяц. Корректируется по уточнению vision._
_Cross-refs: `docs/ROADMAP_CANVAS_V2_TO_PRODUCTION.md` (Wave 1 детально), `docs/NOTES_CANVAS_V2_KICKOFF.md` (Wave 1 paradigma origin), `docs/ARCHITECTURE_v2.md` (foundational data model)._
