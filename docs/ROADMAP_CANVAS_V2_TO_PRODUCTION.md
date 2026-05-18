# ROADMAP_CANVAS_V2_TO_PRODUCTION.md

> **Назначение.** Wave-level дорожная карта от текущего минимального прототипа paradigma V2 (12.05.2026) до рабочего production-ready vertical slice одного эксперимента биолога end-to-end. 5 спринтов с зависимостями + цель wave + детализация первого sprint'а в отдельном документе.
>
> **Автор:** Chat 12.05.2026 поздний вечер. **Тип:** A (архитектура / wave-level).
>
> **Контракт.** Каждый sprint этой wave имеет собственную детальную спеку в `docs/SPRINT_M_CANVAS_*.md`. Этот ROADMAP — компас, не contract. Решения по конкретным спринтам финализируются спека-сессией перед стартом каждого.

---

## 1. Контекст: что есть сейчас

Минимальный прототип закрыт 12.05.2026 в `/canvas-skeleton` (DEV-only route). 16 DEC-CANVAS-V2-* в DECISIONS.md.

**Что валидировано прототипом:**
- Paradigma V2 (placeholder containers + drag from Library Tree + click-fill через PlaceholderTreePicker) работает end-to-end.
- §17 R1 в чистом виде: editor — композиция Library/inspector/tabs/* без копирования; tree — wrap `LibraryTreeRoot` через `LibraryTreeHost`.
- Junctions (визуализация соединений) с auto-detect kind heuristic (`detectJunctionKind(from, to)`) + manual override через popover.
- Pending edits per-container с carry-over + apply/discard.
- Annotator embedded через global slice с namespace `skeleton::${containerId}`.
- Del/Backspace удаляет container с правильными guard'ами.

**Что критически не хватает для рабочего прототипа:**
1. **Operations as ops на canvas** — биолог видит junctions «эти плазмиды собираются Gibson'ом», но не может нажать «выполнить». Это **самый большой gap**: без operations canvas — демо геометрии, не план эксперимента.
2. **Persistence** — skeleton mock-everywhere; refresh обнуляет всё, кроме production Library entries.
3. **Mutagenesis tools** в editor — tab 'mutagenesis' = заглушка-копия SequenceTab. Биолог не может intra-container правок делать через готовый workflow.
4. **Custom container types** — primer-containers / oligonucleotide blocks / fragment markers. Сейчас только `kind='molecule'`. PCR не может принять primer как input без primer-container shape.
5. **Mutability lifecycle** (frozen-on-use из NOTES_CANVAS_V2_KICKOFF Q4) — контейнер можно править после использования в operation, что нарушает honesty модели.
6. **Drop entry на filled container** (NOTES Q5) — drop проходит на canvas-level ADD path, семантика replace/merge/refuse не выбрана.
7. **UX-индикатор «это клон, не оригинал»** (DEC-CANVAS-V2-INSTANCES-NOT-DEDUP-01 carry-over open question).
8. **«+ кнопка» добавления placeholder вручную** на canvas (NOTES §3).
9. **Сборка из праймеров как первоклассный kind** (NOTES Q1).

---

## 2. Цель wave: vertical slice одного эксперимента

После завершения wave биолог может **в одной сессии без выхода из /canvas-skeleton (или /canvas после M-MERGE)**:

1. Создать проект, импортировать pUC19 + insert (genbank file через AddModal).
2. Перетащить pUC19 и insert на canvas как два container-блока.
3. Добавить primer-container с парой праймеров (sequence + Tm авто-расчёт).
4. Создать operation **PCR**: input template = insert, input primers = primer-container → popover «PCR» → popup параметров (annealing temp, extension time) → execute → новый linear amplicon container появляется автоматически, frozen у insert установлен.
5. Создать operation **Cut**: input = pUC19, enzyme = EcoRI+HindIII (multi-enzyme combo) → execute → два linear fragment containers как outputs.
6. Создать operation **Gibson** или **Ligation**: inputs = amplicon + один из cut-fragments → kind picker через junction popover **либо** через operation kind picker → execute → новый circular container + auto-junction'ы внутри operation.params документируют overlap regions.
7. Открыть editor на final circular container → видит sequence + annotations + features + plasmid map → может править annotation через двойной клик на feature.
8. Запустить **Mutagenesis** в editor (через mutagenesis tab) → point mutation в active feature → создаётся новый container-продукт, parent frozen.
9. Сохранить весь проект → `.bodge` file через Library export → закрыть → открыть заново → canvas, containers, junctions, operations, history — всё на месте.

**Это рабочий прототип.** Биолог замкнул один эксперимент полностью внутри BodgeGene без перехода в SnapGene/Geneious/Benchling. После этого можно говорить о реалистичном пилоте на собственных проектах Игоря (Aspergillus / Trichoderma экспрессионные конструкты).

---

## 3. Wave-list

5 спринтов в последовательности с обозначенными зависимостями. Параллелизация **не предусмотрена** — один разработчик последовательно.

### M-CANVAS-OPS — Operations as ops on canvas (детальная спека: `SPRINT_M_CANVAS_OPS.md`)

**Цель.** Operations становятся первоклассными узлами canvas. На ромб OperationNode добавляется kind picker через popover, popup параметров inline, COMMIT_OPERATION_V2 reducer создаёт container-outputs автоматически. Junctions переосмысляются как визуализация будущей сборки (proto-operation Gibson/Ligation/KLD), kind picker junction'а триггерит создание Gibson-operation.

**Зависимости.** Никаких внешних. Начало wave.

**Scope IN.**
- Split `store/skeleton-state.js` (22.77 KB watch) на 3 файла по domain (TD-SKELETON-STATE-SIZE).
- GC legacy `draftSessions` / `popup` / `derive-primers.js` / `fixture-puc19.js` (TD-SKELETON-LEGACY-DRAFTS).
- Operation data shape: `{id, kind, status, position, inputs, outputs, params, createdAt, executedAt}`.
- Status lifecycle: `draft → committed → executed → (failed)`.
- OperationNode v2 — kind picker через popover (PCR / Cut / Gibson / Ligate / KLD / Mutagenesis).
- OpPopups: PCROpPopup / CutOpPopup / GibsonOpPopup / LigateOpPopup / KLDOpPopup / MutagenesisOpPopup — inline popup-параметры, не wizards.
- COMMIT_OPERATION_V2 reducer: status `draft→committed→executed`; на `executed` создаёт container-products через harvest v0.5 algorithm core; устанавливает `frozen` на inputs.
- Frozen-on-use lifecycle (DEC-OPS-09 candidate): used input получает `frozen: true`, editor показывает banner «использован в operation, измените клон через Save As».
- Custom container kind `oligonucleotide` — primer-pair shape, sequence + Tm + GC%. PCR может принять oligonucleotide-container как input.
- Harvest v0.5 algorithms: `local-primer-design`, `tm-calculator`, `restriction-db`, `golden-gate`, `mutagenesis`. UI wizards (`PlasmidUseWizard`, `MutagenesisWizard`, `OligoManager`, `PrimerPanel`) переписываются inline в OpPopups.
- Junction kind picker triggers Gibson-operation либо Ligation-operation в зависимости от kind.

**Scope OUT.**
- Persistence (отдельный sprint M-CANVAS-PERSIST).
- Реальная mutagenesis logic в editor mutagenesis tab (отдельный sprint M-CANVAS-MUTAGENESIS — MutagenesisOpPopup из этого sprint'а отличается: на canvas — операция, в editor — intra-container правки).
- + кнопка добавления placeholder вручную (M-CANVAS-POLISH).
- Drop entry на filled container семантика (M-CANVAS-POLISH).
- Instance counter UX (M-CANVAS-POLISH).
- BsaI/BsmBI overhangs auto-detection в Gibson popup (M-CANVAS-POLISH).
- Замена production routes (M-CANVAS-MERGE).

**Ключевые DEC-кандидаты.** DEC-OPS-01..10 (split / GC / data shape / kind picker / popup-inline / commit-v2 / custom-containers / lifecycle / frozen-on-use / harvest).

**Размер.** Самый большой sprint wave. Спека ~30 KB. K1..K12 шагов. ~70-90 новых тестов.

**Риски (топ-3).**
1. v0.5 algorithm core может оказаться tightly coupled к v0.5 store. Mitigation: K1 разведка обязательна, harvest через pure-function extraction; если coupling непроходимый — wrap через adapter.
2. PCROpPopup / GibsonOpPopup могут вырасти до wizard-объёма despite intent. Mitigation: лимит файла 8 KB на popup, всё что больше — extract sub-step (например, primer-creation popup, не часть PCRopup).
3. Frozen-on-use lifecycle ломает текущий «editable=true константно». Editor получает дополнительное condition. Mitigation: явный banner + кнопка «Save As fork» (создаёт clone без frozen).

---

### M-CANVAS-PERSIST — Dexie persistence canvas state + .bodge export

**Цель.** Skeleton state (containers + operations + junctions + positions) persistence через Dexie + hydrate на reload + export проекта в `.bodge` файл по существующему Library workflow.

**Зависимости.** M-CANVAS-OPS должен закрыться первым — иначе persist данных в shape, который ещё меняется, потребует миграции.

**Scope IN.**
- New Dexie table `canvasProjects` per-project — { projectId, containers[], operations[], junctions[], positions{}, savedAt, version }.
- Hydrate flow: при `activateProject(id)` skeleton-state читает Dexie row → buildInitialState(loadedShape).
- Persist flow: debounced 1500ms write на каждое state-mutation (как librarySlice persistEntries).
- Migration: Dexie schema version bump; existing librarySlice persistEntries не трогать.
- `.bodge` export расширяется: canvasProjects данные кладутся в `.bodge/canvas.json` рядом с `.bodge/containers.json` + `.bodge/library.json`.
- `.bodge` import (через AddModal): обратный путь, hydrate canvasProjects из `.bodge/canvas.json`.
- Sequence diff compression для operations.params (optional, performance only).
- Migration legacy `.bodge` без `canvas.json` — skeleton-state остаётся пустым, biolog видит «нет данных canvas» вариант, может начать заново.

**Scope OUT.**
- Cloud sync (всё local-only).
- Multi-user collaborative editing.
- Diff-storage (compression — оставляем простой full-snapshot, optimisation на отдельный sprint).
- Conflict resolution при concurrent edits (single-user, не нужно).

**Ключевые DEC-кандидаты.** DEC-PERSIST-01..06 (Dexie schema / debounce / hydrate flow / `.bodge` extension / migration / legacy).

**Размер.** Средний sprint. Спека ~15-18 KB. K1..K7 шагов.

**Риски (топ-3).**
1. Dexie migration ломает existing librarySlice persistence. Mitigation: schema version bump, миграция только пустыми canvasProjects, librarySlice не трогаем.
2. Debounced write может потерять данные при refresh в окне 1500ms. Mitigation: `beforeunload` flush + visibility-change flush.
3. `.bodge` format меняется — старые `.bodge` files breakage. Mitigation: legacy fallback на пустой canvasProjects, biolog re-imports manually.

---

### M-CANVAS-MUTAGENESIS — Real mutagenesis tools в editor

**Цель.** Editor mutagenesis tab перестаёт быть копией SequenceTab. Реальные tools: point mutation wizard inline, primer design для KLD/QuickChange, library design batch (saturation mutagenesis), highlight active mutations в SequenceView.

**Зависимости.** M-CANVAS-OPS должен закрыться (harvest `mutagenesis.js` happens там; здесь — UI поверх harvested core).

**Scope IN.**
- Point mutation popup: select region in SequenceView → tab → «New mutation» → from/to nucleotide или amino acid → preview new sequence → create draft mutation либо immediate apply.
- KLD primer pair design: для site-directed mutagenesis, output — primer-container + commit operation как KLD.
- QuickChange primer design (alternative — flanking primer pair с одной mutation).
- Saturation mutagenesis batch: position range → all 20 amino acids + stop → library of N mutations → N container-products через single COMMIT_OPERATION_V2 batch.
- Mutation history per-container — список applied mutations c possibility revert (manual edit branching).
- Editor mutagenesis tab имеет sub-tabs: Point / KLD / QuickChange / Saturation (либо segmented control).

**Scope OUT.**
- Codon optimization (отдельный future sprint).
- Indel mutations beyond single-nucleotide (только substitution + small indel).
- Library cloning workflow (NEB Golden Gate library kit — после M-CANVAS-MERGE).

**Ключевые DEC-кандидаты.** DEC-MUTA-01..05 (point flow / KLD flow / QuickChange flow / saturation batch / history).

**Размер.** Средний sprint. Спека ~18-22 KB. K1..K8 шагов.

**Риски (топ-3).**
1. Point mutation triggered двумя путями (canvas Mutagenesis operation vs editor tab) → дублирование. Mitigation: единый редусер `applyMutationsBatch(container, mutations[])` для обоих entry points.
2. Saturation mutagenesis = 20 containers за раз — UX перегрузка. Mitigation: они кучкуются на canvas как один visual cluster, expand/collapse.
3. KLD primer design алгоритм может не работать на all sequences (constraints на Tm / GC / hairpin). Mitigation: fallback на «manual primer design», biolog задаёт primers вручную.

---

### M-CANVAS-POLISH — UX polish + остаточные NOTES вопросы

**Цель.** Закрыть NOTES_CANVAS_V2_KICKOFF Q1, Q4, Q5 + Custom Operation-types DOCS + add-placeholder button + instance counter UX.

**Зависимости.** M-CANVAS-OPS + M-CANVAS-MUTAGENESIS закрылись (UX polish имеет смысл когда core стабилен).

**Scope IN.**
- + кнопка добавления placeholder вручную на canvas (NOTES §3) — toolbar справа сверху либо right-click меню на canvas «Добавить контейнер».
- Drop entry на filled container семантика (NOTES Q5): popup «Заменить / Создать клон рядом / Отмена» при drop на filled. Default — клон рядом.
- Instance counter UX: ContainerBlock с `origin.sourceEntryId` имеет счётчик `(2)` либо badge `⎘`, при наведении подсказка «Копия pUC19».
- BsaI/BsmBI overhangs auto-detection в Gibson popup → автоматически предлагает Golden Gate если все fragments имеют 4-nt type IIS overhangs.
- Сборка из праймеров как kind (NOTES Q1): primer-pair-only operation → output container-amplicon без template (для phosphorothioate / synthetic genes).
- Operation status visualization: draft (dashed), committed (solid), executed (filled with checkmark), failed (red overlay).
- Operation re-execute flow (re-run operation с другими параметрами): right-click на operation → «Re-execute» → popup с pre-filled params → new outputs.
- Operation collapse/expand: групповая operation Gibson с 5 fragments collapses to single icon в Layout view.

**Scope OUT.**
- Multi-step protocol templates (Gibson-then-transform, Gateway-then-confirmation) — после M-CANVAS-MERGE.
- Operation library (saved templates) — после M-CANVAS-MERGE.

**Ключевые DEC-кандидаты.** DEC-POLISH-01..07 (add-placeholder / drop-on-filled / instance-counter / GG-autodetect / primer-only / status-viz / re-execute).

**Размер.** Средний sprint. Спека ~12-15 KB. K1..K7 шагов.

**Риски (топ-3).**
1. Drop-on-filled popup может появляться too often и раздражать. Mitigation: per-session «не спрашивать снова, default = клон рядом».
2. Instance counter может сбивать с толку если biolog **намеренно** хочет два экземпляра. Mitigation: counter info-only, не предлагает «удалить дубль».
3. Re-execute может конфликтовать с frozen-on-use lifecycle (frozen output становится template для re-run). Mitigation: re-execute создаёт **новую** operation, frozen inputs остаются frozen, outputs новой operation — новые container'ы.

---

### M-CANVAS-MERGE — Замена production routes

**Цель.** Завершение wave. Skeleton перестаёт быть DEV-only. Production routes `/library` + `/dag` заменяются на единый `/canvas` (с двумя view: Layout / Graph) поверх canvas-skeleton кода. Снос legacy `LibraryWorkspace`, `Dag/`, `MoleculeWorkspace` целиком.

**Зависимости.** Все 4 предыдущих sprint'а закрылись + визуальные приёмки прошли + биолог реально использовал prototype на 1-2 собственных проектах (внутренний пилот).

**Scope IN.**
- Rename `components/CanvasSkeleton/` → `components/Canvas/`.
- `App.jsx` route переключается с `library`/`dag` на единый `canvas`.
- Snipe legacy: `LibraryWorkspace.jsx`, `Library/index.jsx` legacy, `Dag/` целиком, `flow/`, `MoleculeWorkspace`, `RacetrackView`, `DesignCanvas`, `PartsPalette`, `PartsLibrary`, `PartBlock`, `AddFragmentModal`. ~150-200 KB кода на удаление.
- Sidebar / Topbar обновляются: больше нет «Library» / «DAG» переключателя, есть только Canvas + Tree.
- All Library/inspector/* reused as is (DEC-CANVAS-V2-EDITOR-01 anchor-promoted).
- Hotkeys переезжают: `Ctrl+L` open canvas, `Ctrl+G` toggle Layout/Graph view.
- Removal of bespoke skeleton wrapper `LibraryTreeHost` (теперь tree mount-ится напрямую в Canvas как было).
- Final ⚓ promotions: DEC-CANVAS-V2-PARADIGM-01, DEC-CANVAS-V2-EDITOR-01, DEC-CANVAS-V2-OPS-CANVAS-ONLY-01, DEC-CANVAS-V2-TREE-FROM-LIBRARY-01, DEC-CANVAS-V2-DETECT-KIND-HEURISTIC-01 — после второго подтверждающего sprint'а wave.

**Scope OUT.**
- Multi-canvas (multiple canvas per project) — отдельный future track.
- Real-time collaboration — отдельный track.
- Mobile (out of scope per ARCHITECTURE_v2 DEC-V2-19).

**Ключевые DEC-кандидаты.** DEC-MERGE-01..05 (route-merge / legacy-snipe / hotkey-remap / sidebar-update / anchor-promotion).

**Размер.** Большой sprint. Спека ~20 KB. K1..K10 шагов. **Очень много удалений** — ~150-200 KB legacy кода + соответствующие tests.

**Риски (топ-3).**
1. Existing production users (если есть) ломаются миграцией. Mitigation: legacy routes остаются доступны 1 sprint после M-MERGE через feature flag, потом удаляются. **Сейчас Игорь единственный user — риск низкий.**
2. Snipe legacy ломает существующие tests. Mitigation: tests осиротевших компонентов удаляются вместе с компонентами; orphan-tests cleanup как часть sprint'а.
3. Sidebar/Topbar regression. Mitigation: snapshot tests на key navigation + manual walkthrough перед закрытием sprint'а.

---

## 4. Wave-зависимости (DAG)

```
M-CANVAS-OPS  ──┬──>  M-CANVAS-PERSIST  ──┐
                │                          │
                └──>  M-CANVAS-MUTAGENESIS ┤
                                           │
                                           └──>  M-CANVAS-POLISH  ──>  M-CANVAS-MERGE
```

- **OPS** разблокирует всех остальных (algorithm core harvested, custom containers existed, operation shape stabilised).
- **PERSIST** и **MUTAGENESIS** могут идти **параллельно после OPS**, но реалистично — последовательно (один разработчик).
- **POLISH** требует и PERSIST, и MUTAGENESIS закрытыми (отлаживает UX поверх стабильного core).
- **MERGE** — финал wave.

---

## 5. Открытые вопросы wave-level

**Q1 — Mobile.** ARCHITECTURE_v2 DEC-V2-19 явно вне scope. После wave подтверждаем decision либо открываем mobile-track.

**Q2 — Multi-user.** Sandwiched после wave: Игорь — single-user, BodgeGene будет ли публичным сервисом или self-hosted tool — открытый strategic вопрос из userMemories. Если public service — multi-user collaboration становится requirement, требует concurrent edit conflict resolution + real-time sync (CRDT либо OT). Если self-hosted — multi-user не нужен. Решение **до M-CANVAS-MERGE**.

**Q3 — Institutional cluster integration.** Игорь имеет доступ к institutional computing cluster (SLURM, GPU 4 GB VRAM). После wave — отдельный track «backend computation»: BLAST / Pfam / dbCAN / HMMER / AUGUSTUS / DeepTMHMM / Helixer. Это не canvas-level decisions, но влияет на operation kinds (например, «Analyze with HMMER» operation которая uploads sequence на cluster и возвращает annotations).

**Q4 — AI annotation enhancement.** Roadmap M-X.2 Annotator architecture (M-X.2 sprint М-X.2). HyenaDNA / DNABERT-2 / ONNX Runtime Web/WebGPU — local browser inference. Это **отдельный wave** после Canvas-V2-MERGE.

**Q5 — Group projects.** ARCHITECTURE_v2 §7 DEC-V2-29 «⚓ post-M-I». Wave не покрывает.

---

## 6. Финальная картина после wave

После всех 5 спринтов биолог на собственном проекте:

- Импортирует pUC19 + insert + primer-pair → видит их в Tree.
- Перетаскивает на canvas → 3 блока (2 molecule + 1 oligonucleotide).
- На canvas: создаёт PCR operation между insert + primers → получает amplicon.
- Cut operation на pUC19 с EcoRI+HindIII → 2 fragments.
- Gibson operation с amplicon + один fragment → новый circular vector.
- Editor: open vector → видит plasmid map + sequence + features.
- Editor mutagenesis tab → point mutation в active site → KLD primer pair design → новый vector-mutant container.
- Save → `.bodge` file persisted в Dexie + downloadable.
- Refresh browser → весь pipeline на месте.
- Re-execute Gibson с другим fragment → новый vector-variant.
- Export `.bodge` → передать коллеге → коллега imports → видит весь experiment design.

Это **рабочий vertical slice** одного эксперимента молекулярной биологии — от reagents до finished construct — внутри BodgeGene без отрыва от прибора. После этой точки начинается путь BodgeGene **из персонального инструмента Игоря к продукту**, который реалистично показать ещё одному биологу.

---

## 7. Sprint 1 — M-CANVAS-OPS — детальная спека

См. `docs/SPRINT_M_CANVAS_OPS.md` (~30 KB, тип A, K1..K12).

---

_Создан: 12.05.2026 поздний вечер. Версия 1.0._
_Обновляется: при закрытии каждого sprint'а wave (передвинуть статус) + при изменении приоритетов / scope (явный edit с reason). Не append-only — этот документ карта, не журнал._
