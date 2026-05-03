# UX_VISION.md — BodgeGene UX Vision

> Что хотим в итоге. Без layout, без wireframes, без спринт-плана.
> Навигационный якорь для per-workflow сессий: `UX_REFERENCE_BASE.md` (анализ конкурентов) → `UX_VISION.md` (наш выбор) → `docs/SPRINT_*.md` (спека) → код.

**Создан:** 26.04.2026 после анализа UX_REFERENCE_BASE.md.
**Связан с:** `CLAUDE.md`, `CHAT_PLAYBOOK.md`, `DECISIONS.md` (⚓ фундаментальные).

---

## 1. Что строим

BodgeGene — visual-first plasmid editor для академической молекулярной биологии. Пользователь — биолог, который ставит много вариантов конструкции в день, делает мутагенез сериями, склеивает фрагменты под Gibson / Golden Gate / restriction cloning.

Конкуренты: SnapGene (платный desktop, embedded ancestry), Benchling (cloud, real-time, корпоративный), Geneious Prime (платный IDE), ApE (бесплатный text-editor), pLannotate (read-only annotator).

Дифференциация BodgeGene — не «ещё один SnapGene-клон», а инструмент с тремя слоями ставок там, где у всех гэп: **state** (mutation cart + Plasmid-Git), **time** (two-way diff + rebase-propagation), **feedback** (silent / missense / frameshift badges + fragment-aware rendering + provenance tooltips). Парадигма — keyboard-first, modal-light, single-source-of-truth state. Open-source, offline-first, без облачной зависимости.

---

## 2. Universal baselines (принимаем)

Из `UX_REFERENCE_BASE.md` § Synthesis — паттерны, общие для 5 ПО, которые мы принимаем как обязательные. Статус: ✓ есть, ◐ частично, ○ нет.

| Паттерн | Статус | Комментарий |
|---|---|---|
| Single-ring map с leader-line labels + sync с sequence | ◐ | PlasmidWorkspace + SequencePane synced (Map-WS-1 cycle). Leader lines микро-регионов нет (V30). |
| Monospace + colored feature tracks + status-bar live metrics | ✓ | SequencePane + AnnotationEditor + footer. |
| Type-driven default palette с override | ✓ | `feature-palette.js` (15 семейств + misc + FEATURE_STROKE), ⚓ DECISIONS 21.04.2026. |
| GenBank `.gb` exchange | ✓ | parseGenBank + GenBank export. |
| Tabbed wizards для assembly chemistry | ✓ | RestrictionWizard, GoldenGateWizard, MutagenesisWizard. |
| Annotation auto-detection из curated library | ✓ | common-features.json (415 features из 2822 SnapGene плазмид) + ORF + RE sites. |
| History / lineage per file | ◐ | Plasmid-Git Sprint X — baseline + commits + HEAD. Diff viewer и branch / tag — нет. |
| CSV oligo export | ✓ | order-oligos.js + копия в clipboard. |

Итого: 5 из 8 baseline-ов закрыты, 3 в активной доработке. ~60% baseline-фундамента уже стоит — полная переработка интерфейса в смысле «выкинуть всё» не нужна.

---

## 3. Ставки (где BodgeGene innovate)

7 design opportunities из `UX_REFERENCE_BASE.md`, на которых мы строим differentiation. Для каждой: что это, зачем, что в коде, какой workflow ведёт к доводке.

### Ставка 1 — Plasmid-Git: state + time

Объединяет mutation cart, two-way base diff, rebase-propagation, content-addressable commits.

**Что это.** Каждое изменение фрагмента (мутация, indel, insert/delete) — commit с операцией+параметрами, не file snapshot. `applyMutationsBatch(N мутаций)` создаёт N commits в одной транзакции (один pushUndo). Replay по HEAD реконструирует sequence из baseSnapshot. Toggle commit'а через `applied: true/false`. Sequence переигрывается мгновенно.

**Зачем.** UX_REFERENCE_BASE: «no tool has first-class staged-then-committed-atomically pattern. … no tool has two-way base-level diff». Универсальный гэп — наша главная differentiator-ставка.

**Текущее состояние.** Sprint X (baseline) + X-fix + X-fix-2 реализованы Code, **pending visual acceptance**. Reducer `applyMutationsBatch` готов, `_applyOneCommit` helper централизует логику. Mutations panel в FragmentEditor показывает CommitRow со статусом applied / inactive. Toggle и revert sequence работают.

**Чего ещё нет.** (a) Two-way diff viewer (parent vs HEAD, side-by-side с AA-overlay) — нет UI. (b) Branch / tag concepts — нет. (c) Rebase-propagation через cloning lineage (Geneious-style active links) — нет. (d) Граф истории как у SnapGene History view — нет.

**Workflow к доводке.** Sprint X-fix-2 visual acceptance (отдельная сессия) → закрытие V22 / V24 / V27 → Plasmid-Git UI (diff viewer + commit graph) на per-workflow цикле в рамках workflow «Mutagenesis».

### Ставка 2 — Mutation effect badges

**Что это.** Каждая мутация в Mutations panel имеет first-class визуальный значок effect: silent / missense / frameshift / stop-gained / extension. Plus loud toast при frameshift во время edit (универсальный гэп — никто не ругается на frameshift громко).

**Зачем.** UX_REFERENCE_BASE: «universally implicit, never first-class badge. … A loud frameshift toast would be a small but high-value touch». Geneious Find Variations / SNPs — ближайший аналог, но не явный визуал на мутации.

**Текущее состояние.** `computeMutationHighlights` в `components/FragmentEditor/highlights.js` уже classifies silent/nonsilent на уровне ntPosition → Map. Render использует это для red/yellow подсветки в DNA grid. Frameshift detection нет. Stop-gained / extension нет. Toast системы нет.

**Чего ещё нет.** (a) Frameshift-aware effect classifier — алгоритм. (b) Per-commit badge в Mutations panel UI. (c) Loud toast при mutation типа indel в CDS, меняющем рамку. (d) Иконки в SequenceGrid рядом с подсвеченным nt.

**Workflow.** Per-workflow цикл в рамках Mutagenesis — после Plasmid-Git visual acceptance.

### Ставка 3 — Tag-aware primer library

**Что это.** Drag-and-drop tag (His6, FLAG, V5, c-Myc, Strep-tag II, …) из tag-panel в primer 5'-extension. First-class tag-объекты в коде с metadata (sequence, GC%, Tm contribution, position). Превью эффекта на primer (новый Tm, длина, hairpin warning).

**Зачем.** UX_REFERENCE_BASE: «universally weak — no tool ships a first-class tag library that drag-attaches. SnapGene Insertions tab — text без library; Benchling / Geneious manual entry; ApE manual». Биологам это нужно постоянно — His-tag и Kozak один из двух самых частых tag-паттернов.

**Текущее состояние.** Data layer есть: `tags-db.js` содержит 13 PEPTIDE_TAGS + 5 FUSION_PARTNERS. Primer design tag-aware (`findBindingTagAware()` extends past low-complexity tags). Но **UI-библиотеки нет** — теги торчат только в коде, не как панель.

**Чего ещё нет.** (a) `TagLibraryPanel` — UI компонент с категориями (PEPTIDE / FUSION / promoter / RBS / Kozak / linker). (b) Drag-and-drop из panel в primer's 5'-extension с превью. (c) Per-tag GC / Tm metadata в hover tooltip. (d) Tag-detection в импортированных primer'ах (auto-recognize и проставлять label).

**Workflow.** Per-workflow цикл в рамках «Primer design».

### Ставка 4 — Smart primer merging

**Что это.** При близких мутациях (<60–80 bp между ними) split-алгоритм автоматически merges их в один multi-site primer вместо отдельных PCR-фрагментов. Параметр `minFragmentLength` ~60–80 bp; ниже — merge с соседом + multi-site primer (70–120 nt, IDT Ultramer scale).

**Зачем.** UX_REFERENCE_BASE: «cited as Reddit r/labrats pain point; no tool does it. SnapGene users hand-combine if two SDM events fall within ~30 nt». V20 в backlog — split плодит 30–60 bp PCR-фрагменты при 5 мутациях в HygroR (1023 bp).

**Текущее состояние.** Split-алгоритм в `mutagenesis.js::makeFragmentStrategy` создаёт N+1 sub-фрагментов на N мутациях без оглядки на расстояние. PCR-продукт может быть 60 bp — биологически осмысленно, но экономически абсурдно.

**Чего ещё нет.** (a) `minFragmentLength` параметр в strategy. (b) Multi-site primer generation для merged близких мутаций. (c) UI «merging 3 mutations into 1 primer» в Plan view с явным badge.

**Workflow.** Per-workflow цикл в рамках «Mutagenesis», после Plasmid-Git и Mutation badges.

### Ставка 5 — Decision-modal-driven import

**Что это.** При import (.dna / .gb / .fasta) — explicit modal с decision points: «Это circular или linear? (мы детектировали X)» / «Эту последовательность считать CDS, non-coding, или mixed?» / «Origin кажется X — re-index или оставить?». Не молчаливые heuristics, а явное подтверждение. Уникально среди всех 5 ПО.

**Зачем.** UX_REFERENCE_BASE: «None of the 5 tools opens a decision modal. … An explicit "we think this is circular because X" dialog removes a class of support tickets». У нас этот паттерн уже есть в зачаточной форме — расширим.

**Текущее состояние.** ImportDecisionModal работает: для circular — 6 действий (restriction / backbone / mutagenesis / view / library / disassemble), для linear — 2 (view / library). Это **процессуальный** decision (что делать с импортированной плазмидой), не **семантический** (как её интерпретировать).

**Чего ещё нет.** (a) Семантический step перед действиями: «Detected: circular, X bp, Y CDS warnings, Z annotations. Confirm?» с возможностью override. (b) Re-index origin hint, если detected ARS / replication origin не в позиции 1. (c) Multi-record файл — explicit dialog «выбери которую плазмиду» (сейчас pLannotate отказывает, SnapGene берёт первую молча).

**Workflow.** Per-workflow цикл в рамках «Import / Export».

### Ставка 6 — Fragment-aware annotation rendering

**Что это.** Аннотации с %coverage <95% от reference feature рендерятся **с белой заливкой и цветной обводкой** (pLannotate-стиль) — глаз сразу читает «incomplete». Plus per-аннотация **provenance tooltip** на hover: «GenoLIB, 98% identity, 87% coverage» / «Manual entry» / «Imported from Addgene #12345».

**Зачем.** UX_REFERENCE_BASE: «pLannotate's signature differentiator — fragment-aware. SnapGene / PlasMapper silently report imperfect matches. … Provenance tooltips show which DB the hit came from — a deliberate transparency choice». Никто кроме pLannotate этого не делает; а pLannotate read-only.

**Текущее состояние.** common-features.json даёт reference lengths — мы **можем** считать %coverage. Visual индикаторов нет: incomplete features рендерятся идентично complete. `source` поле на аннотации не структурировано.

**Чего ещё нет.** (a) Расчёт %coverage при auto-annotate. (b) Visual: white-fill + colored-outline для <95% coverage. (c) `source` поле на аннотации с энумом (`auto-genolib` / `auto-orf` / `auto-re-site` / `manual` / `imported-genbank` / `imported-snapgene` / `imported-addgene`). (d) Hover tooltip с provenance.

**Workflow.** Per-workflow цикл в рамках «Annotations».

### Ставка 7 — Command palette (Ctrl+K)

**Что это.** Universal fuzzy-finder для всех операций, features, primers, RE sites. ESC закрывает, Enter triggers. Современный 2020s паттерн (VS Code, Linear, Notion, Raycast).

**Зачем.** UX_REFERENCE_BASE: «None of the 5 tools has a Ctrl+K command palette in the modern sense. ApE keyboard-first via menus, Geneious remappable but modal-heavy. Generational UX leap».

**Текущее состояние.** Нет. Сборные shortcut'ы есть (R/E/Del/Ctrl+C/Ctrl+D/Ctrl+1-5), не унифицированы в палет.

**Чего ещё нет.** (a) Command palette UI overlay. (b) Index команд (operations + features + primers + RE sites). (c) Fuzzy matching. (d) Recent / favorites. (e) Контекстные команды (зависят от того, что выделено).

**Workflow.** Per-workflow цикл в рамках «Two-click / keyboard-driven workflows», ближе к концу — нужна стабильная operations API, а она не сложилась пока остальные workflow в активной доработке.

---

## 4. Что отказываемся

- **Real-time multi-user co-editing** (Benchling-style). Out of scope для open-source v1: cloud-инфраструктура + CRDT + аутентификация — другой класс продукта. BodgeGene local-first.
- **IDT / Twist API ordering integration**. Gated by partnership agreements (UX_REFERENCE_BASE: «none of 5 tools has it»). v1 — CSV export достаточно. v2 пересмотрим.
- **Hairpin / dimer 2D structure rendering**. Heavy физика (mfold / RNAfold-стиль). Geneious показывает Tm hairpin / dimer как метрики; мы тоже можем показывать метрики (uMelt-style nearest-neighbor). 2D визуал отложен — за пределами v1 ROI.
- **Concentric ring / 3D plasmid map**. UX_REFERENCE_BASE: ни один из 5 не использует. Single ring — universal стандарт.
- **Build-your-own-feature-library из text-файла** (ApE-стиль). Гибкость избыточная для биолога; common-features.json + user-added annotations + import из GenBank — достаточный набор источников.

---

## 5. Сквозные принципы UX

1. **Keyboard-first.** Любая операция доступна через клавиатуру. Mouse — для discovery новичком, не для daily use. Опирается на ⚓ «Принцип двух кликов» из CLAUDE.md.

2. **Sanitize-at-entry.** Любой sequence — strip BOM / null / whitespace / numbers / non-IUPAC при чтении / вводе. Один контракт, одна точка очистки. Inherited from ⚓ DECISIONS.

3. **Modal-light, panel-right.** Глобальные модалки только для destructive confirm и assembly wizards (где multi-step). Editing — в panels, не в модалках. Inspired by Benchling docked-not-modal pattern.

4. **Mode switcher вместо tabs.** На FragmentEditor / DesignCanvas — режимы (Правка / Мутагенез / View) переключаются как radio, не tabs. Tabs дробят данные; modes — показывают одни данные с разной affordance. Inherited from K10 Sprint 1.7.

5. **Single source of truth.** Аннотации только в `annotations[]` (3 уровня), не в отдельных `domains[]` / `features[]`. Mutations — в Plasmid-Git commits, не в `fragment.mutations[]`. Sequence — derived через replay, не stored как два инвариантных копии.

6. **Sync over duplication.** Map ↔ Sequence ↔ FragmentEditor — synced cursor, не дубль фокусов. Inherited from Map-WS-1 cycle.

7. **Loud feedback на silent failures.** Frameshift при insert / delete в CDS — toast. RE-site внутри insert при restriction cloning — warning в wizard. Tag в primer низкого качества (poly-A run) — inline warning. Не молчать.

8. **WCAG-AA palette by default.** Только ApE из 5 ПО считает контрасты. Мы — second. `feature-palette.js` (15 семейств + warm-dark-brown FEATURE_STROKE) уже движется в эту сторону; нужно audit на ≥4.5:1 для текста.

9. **Pixel-stable visualization.** PlasmidMap не растягивается при resize окна (V31 — open). Map имеет фиксированный визуальный размер (~600 px diameter), zoom — отдельная ось.

10. **Provenance everywhere.** Каждая аннотация / commit / primer знает, откуда пришла (auto / imported / manual / derived). Hover tooltip показывает источник. Базовая прозрачность — нет ни у кого кроме pLannotate.

---

## 6. Что НЕ в этом документе

- **Layout / wireframes / mockups** — рождаются на per-workflow цикле, моделируются в визуализаторе перед спекой.
- **Цветовая система / typography / spacing** — отдельный `DESIGN_SYSTEM.md` (запланирован после Sprint 2b decomposition). Конкретные значения — там.
- **Sprint roadmap** — per-workflow процесс не предполагает явного roadmap'а: следующий workflow выбирается после finalization предыдущего.
- **Code-level дизайн** (component tree, props contract) — рождается в спеке спринта, не в Vision.

---

## 7. Дальнейший процесс (per-workflow cycle)

Каждый workflow проходит фиксированные четыре этапа. Не перескакиваем, не делаем параллельных workflow.

1. **Оценка реализованности.** В одной сессии Chat: что есть в коде сейчас (читаем файлы), что в backlog (BUGS.md), что отсутствует. Output: gap-analysis раздел в этом Vision или мини-документ `docs/WF_*_GAP.md`.

2. **Моделирование визуала.** Отдельной сессией Chat: wireframe / interactive prototype через визуализатор; обсуждение с Игорем; итерации до согласия по визуалу. Output: финальный prototype + текстовое описание поведения.

3. **Спека спринта.** В одной сессии Chat: пишется по `_TEMPLATE_SPEC.md` (CHAT_PLAYBOOK §2), 20–30 KB, со ссылкой на финальный prototype как визуальный якорь. Output: `docs/SPRINT_*.md` + CURRENT_TASK.md мост для Code.

4. **Реализация Code + Visual acceptance.** Code реализует по спеке и CURRENT_TASK.md, затем — отдельная сессия Chat-приёмки на конкретном тестовом случае. PASS / FAIL → finalization или fix-цикл.

**Правило гигиены.** Новый workflow не входит в этап (2) пока предыдущий не дошёл до finalization после (4). «Не делаем нового визуала пока не отшлифуем то, что делаем».

---

## 8. Workflows в порядке проработки

Приоритет — где густой технический долг и где Plasmid-Git ставка приземляется.

1. **Mutagenesis workflows.** Plasmid-Git Sprint X-fix-2 → visual acceptance → diff viewer → mutation effect badges → smart primer merging. Закрывает V18, V19, V20, V21, V22, V23, V24, V27. Дом для ставок 1, 2, 4.

2. **Working with circular plasmids (PlasmidMap).** UX-1 readability / affordance: V28 (cursor: pointer на region-фоне), V29 (hover-scale group fix), V30 (leader lines микро-регионов), V31 (pixel-stable size), V1, V2, V6 (RE labels overlap), V9 (annotation labels). Дом для ставки 6 на map-view.

3. **Working with linear sequences (FragmentEditor / SequencePane).** V18 (full-view AA disjoint), V19 (codon-edit UX redesign), bulk-delete по выделению, codon-usage table choice. Дом для ставки 6 на sequence-view.

4. **Assembly design.** DesignCanvas, JunctionBlock, V7 (insertion clock — где вставка идёт в backbone). Reusable InsertionClock компонент.

5. **Primer design & oligo ordering.** Дом для ставки 3 (tag-aware library). PrimerEditor, drag-and-drop tag panel.

6. **Annotations.** Дом для ставки 6 (fragment-aware rendering + provenance). Auto-annotate enrichment + provenance contract.

7. **Import / Export.** Дом для ставки 5 (расширенный decision modal). Multi-record file UX.

8. **Two-click / keyboard-driven workflows.** Дом для ставки 7 (command palette). Делается последним — нужна стабильная operations API.

9. **Visual design patterns** (cross-cutting). Уезжает в DESIGN_SYSTEM.md, не отдельный workflow per se.

Этот порядок — не контракт. После каждого finalization Игорь решает следующий workflow. Vision обновляется по мере необходимости.

---

## 9. Что обновляется в Vision

Vision — живой документ. Обновляется в одном из случаев:
- Закрылся workflow — добавить в § 8 «Реализован: дата» и обновить статус ставок в § 3 (текущее состояние).
- Появилась новая ставка / отменилась старая (после exploration) — обновить § 3 / § 4.
- Изменилось что-то в universal baselines (новое внешнее ПО изменило стандарт) — обновить § 2 + перечитать UX_REFERENCE_BASE.md.

Не обновляется при каждой мелкой правке — Vision не сводка коммитов.

---

_Создан 26.04.2026 после анализа UX_REFERENCE_BASE.md._
_Sprint X-fix-2 на момент создания — pending visual acceptance._
