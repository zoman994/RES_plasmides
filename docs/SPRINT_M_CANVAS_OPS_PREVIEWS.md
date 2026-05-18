# SPRINT_M_CANVAS_OPS_PREVIEWS.md — Inline preview-sections в OpPopups

> **Тип:** B (фича среднего объёма, переиспользование existing visualisation pieces).
> **Wave:** M-CANVAS-V2-TO-PRODUCTION. Cross-ref: `docs/ROADMAP_CANVAS_V2_TO_PRODUCTION.md`.
> **Дата создания:** 12.05.2026 поздний вечер.
> **Зависимости.** M-CANVAS-OPS должен быть закрыт (OpPopups существуют, kinds стабильны). Этот sprint не модифицирует OPS параллельно, не блокирует Code на OPS.
> **Размещение в wave.** После M-CANVAS-OPS, до M-CANVAS-POLISH. Параллельно с M-CANVAS-PERSIST допустимо (нет state-overlap). Реалистично — sprint #2 либо #3 wave.
> **Триггер.** Биолог 12.05.2026 поздний вечер: «можно же в конвейере показывать старую плазмиду и затенять то что мы условно "удаляем"». Семантически honest визуализация operation behaviour до execute — показывает что reaction сделает с input'ом, не предсказывает соединение.
> **Stop-условие.** После K8: `npm test` зелёный + ручная проверка preview во всех 6 OpPopups (Cut + PCR + Gibson + Ligate + KLD + Mutagenesis). Жду визуальной приёмки в отдельной сессии.

---

## 0. Срез размеров затрагиваемых модулей

После M-CANVAS-OPS закрытия (target sizes):
- `canvas/operations/OpPopup.jsx` — ожидание ~3-4 KB. После K2 расширение под preview-slot: ~4-5 KB.
- Каждый kind-specific OpPopup (PCROpPopup / CutOpPopup / etc.) — 5-7 KB. После K3-K6 добавится `<XPreview>` mount: +0.5-1 KB на popup.

Новая директория:
- `canvas/operations/previews/` — 8 новых файлов, total ~25-30 KB.

Reuse:
- `components/Library/inspector/tabs/LinearFeatureBar.jsx` — 25.75 KB existing, **не модифицируется**.
- `components/Library/inspector/tabs/OverviewTab.jsx` — содержит PlasmidMiniMap inline. **Возможно потребуется extract** PlasmidMiniMap в отдельный файл — решение K1 разведки.

**Hard-лимиты соблюдены:** все новые `.jsx` planned под 8 KB; helpers `.js` под 5 KB.

---

## 1. Контекст

**Что не хватает после M-CANVAS-OPS.** OpPopup получает inputs + params, biolog нажимает Execute → algorithm runs → output containers создаются. Биолог видит результат **после** execute. До execute popup показывает **только form fields** (select + number-input + checkbox). Биолог не видит **что произойдёт** с input'ом до того как нажмёт Execute.

**Семантический gap.** Это инверсия: biolog надеется что params правильные, нажимает Execute, проверяет результат. Должно быть наоборот: biolog видит что произойдёт, корректирует params до того как реакция запустится. Особенно критично для **Cut** (где cut sites могут оказаться неожиданными), **PCR** (где primers могут охватить не то), **Gibson** (где overhangs могут не совпадать), **Mutagenesis** (где mutation может попасть в active site feature).

**Что добавляется.** Каждая OpPopup получает **preview-section** между header и form-body. Preview показывает input(s) container(s) с **наложенной семантической подсветкой operation**:
- Cut — template ribbon с cut-site markers + затенением удаляемого региона.
- PCR — template ribbon с primer-positions + highlight копируемого региона.
- Gibson — fragments lane с overhang-zones colored.
- Ligate — fragments lane со sticky-end markers.
- KLD — circular minimap template с region highlight + mutation point.
- Mutagenesis — sequence ribbon с mutation dots.

Биолог видит **input + transform** одновременно, до execute.

**Семантически honest, не misleading.** Это **не** соединение двух containers полумесяцами (которое создаёт иллюзию «уже собрано»). Это **визуализация того что operation сделает с одним input'ом** — точная семантика, не предсказание будущего соединения. Разница принципиальная и обсуждалась в paradigma chat 12.05.2026 вечер.

## 2. Где задача сядет (R4 §17)

**Затрагивает:**
- `canvas/operations/OpPopup.jsx` — добавляется `preview` slot между header и body.
- Каждый из 6 kind-specific OpPopups — добавляется mount `<XPreview>` в начало body.

**Новые модули (в `canvas/operations/previews/`):**
- `PreviewSection.jsx` — общий wrapper (header «Preview» + collapsible body + error-banner-slot).
- `CutPreview.jsx` / `PCRPreview.jsx` / `GibsonPreview.jsx` / `LigatePreview.jsx` / `KLDPreview.jsx` / `MutagenesisPreview.jsx`.
- `lib-preview-helpers.js` — pure helpers: `calcCutSitesOnTemplate`, `calcPrimerCoverageRegion`, `calcOverhangZones`, `applyMutationsForPreview`.

**Reuse из Library:**
- `LinearFeatureBar` — для linear template/fragment visualisation внутри preview. **Не модифицируется** — используется через props.
- `PlasmidMiniMap` из OverviewTab — для circular template visualisation. **K1 разведка**: extract в отдельный standalone компонент если внутри OverviewTab tightly embedded. Если standalone — re-use as is.

**Reuse из lib/:**
- `lib/feature-palette.js` — единый цветовой контракт для features.
- `lib/annotation-model.js::getRegions` — extraction regions.
- `lib/sequence-diff.js` — mutation preview diff.

**Не трогать:**
- `LinearFeatureBar.jsx` Library production — если требуется правка для preview-use-case, поднять как блокер K1.
- Algorithm core v0.5 — preview не выполняет реальный algorithm, использует pure helpers с simplified logic. Real algorithm runs в OpPopup Execute через harvest из M-CANVAS-OPS.

## 3. Стратегия

**Pure read, no state mutation.** Preview-компоненты — **pure functional**. Read inputs из popup-state via props. Не диспатчат actions. Не пишут в pendingEditsByContainer. Не модифицируют containers. Это **visualisation only**.

**Reactive к form fields.** Когда biolog меняет template select → preview перерисовывается. Когда добавляет enzyme — preview обновляется. Это **realtime simulation** (Q1 default: реактивно, не «после Generate Preview button»). Implementation — preview принимает params как props, useMemo пересчитывает visualisation derived state. Debounce 150ms на param-change для perf.

**Two visualisation modes — linear vs circular.** Container.topology dictates: circular → PlasmidMiniMap (arcs + features as wedges). Linear → LinearFeatureBar (ribbon + features as horizontal blocks). Каждый preview сам выбирает mode based on input topology.

**Error visualisation inline.** Если operation не может быть выполнена с current params (Gibson overhang mismatch, Cut no sites, PCR primer Tm out of range), preview показывает **red banner внутри preview-section** + visual marker на проблемном регионе. Execute button в popup footer становится disabled либо показывает warning при click. Catches errors **до** algorithm run.

**Hard cap на preview component — 6 KB.** Если CutPreview вырастает за 6 KB — extract sub-component (`CutSiteMarker` shared между Cut и Gibson). Pure visualisation не должна разрастаться.

**Anti-wizard guard.** Preview — **не отдельный шаг**, а **inline secondary visual** в той же форме. Biolog не клик-клик-клик через preview-step. Он видит preview одновременно с form fields, корректирует params, preview реагирует синхронно. §17 R2 правило пары кликов соблюдено.

---

## 4. Scope IN

- PreviewSection общий wrapper компонент (header «Preview» + collapsible + error-slot).
- 6 kind-specific preview компонентов с realtime reactivity к popup params.
- Pure helpers в `lib-preview-helpers.js` для calculation visualisation state (cut positions, primer coverage, overhang zones, mutation diff).
- Reuse LinearFeatureBar и PlasmidMiniMap через props.
- Error visualisation: red banner внутри preview + visual markers на проблемных регионах.
- Linear vs circular auto-switching based на container.topology.
- Preview обновляется realtime при изменении любого params field в popup (debounce 150ms для perf).
- Tests на каждый preview — параметризованные tests с representative fixtures.

## 5. Scope OUT

- **ContainerBlock expanded mode на canvas** — circular visualisation containers напрямую на canvas (а не только в OpPopup preview). Отдельный sprint M-CANVAS-CONTAINER-VIZ либо M-CANVAS-POLISH (decision deferred).
- **Затенение/highlight на canvas-level вне popup** — currently preview только внутри OpPopup, не persists на canvas blocks.
- **Animations / transitions** — appearance / disappearance / morph анимации. Polish concern.
- **Clickable features в preview** (click → expand info, show sequence span) — read-only в первой версии (Q2 default).
- **Drag-handle в preview** для repositioning primers/cut sites — polish concern.
- **3D visualisation, supercoiling, advanced rendering** — out of scope ever.
- **Preview для custom future kinds** (gBlock-specific, RNA-specific) — добавляются вместе с custom kinds.

## 6. Архитектурные решения DEC-PREV-01..05

**DEC-PREV-01 — Preview-section как обязательная часть OpPopup body.** OpPopup.jsx (base frame после M-CANVAS-OPS) расширяется новым slot `previewContent` между header и form-body. Каждый kind-specific popup передаёт свой `<XPreview {...currentParams} />` как preview-prop. Default — preview always visible (не collapsed initially); biolog может collapse через chevron в header preview-section если хочет больше места для form.

**DEC-PREV-02 — Preview компоненты в `canvas/operations/previews/` директории.** Изолированы от form-логики popup'ов. Pure visualisation. Каждый preview — не больше 6 KB hard cap. Если разрастается — extract sub-components в shared `canvas/operations/previews/lib/`.

**DEC-PREV-03 — Reuse Library visualisation pieces, no fork.** LinearFeatureBar и PlasmidMiniMap (extracted либо as is из OverviewTab) — single source of truth для container visualisation. Preview-компоненты — wrappers с **overlay semantics** на top базовой visualisation. Не дублируем feature-rendering логику; добавляем семантические markers (cut sites, primer arrows, overhang highlights, mutation dots) как SVG-overlay поверх LinearFeatureBar/PlasmidMiniMap output.

**DEC-PREV-04 — Preview temporary, не persists.** Живёт только пока OpPopup открыт. После Execute либо Cancel — preview unmount'ится. Не пишется в state. Не visible на canvas containers (это разные surfaces). Биолог видит preview = visualisation of upcoming transform, не permanent annotation.

**DEC-PREV-05 — Visual language consistent с feature-palette + junction-styles.** Cut shading использует `feature-palette` `DELETE_COLOR`. PCR highlight — `COPY_COLOR`. Gibson overhang zones — junction-styles palette (overlap blue / GG green). Mutation dots — red-warm. Error banner — same red как BUGS warning. Единый visual vocabulary через codebase.

## 7. Файлы

### Новые

**`canvas/operations/previews/PreviewSection.jsx`** (~3-4 KB) — Wrapper. Header с «Preview» label + collapse-chevron + optional error-banner-slot, body (children), optional footer-note. Props: `title`, `error` (string|null), `errorRegions` (array для visual highlight), `collapsed`, `children`. Renders error-banner with red background когда `error` set. Collapse-chevron toggles visibility.

**`canvas/operations/previews/CutPreview.jsx`** (~5-6 KB) — Props: `template`, `enzymes`, `onError`. Если template null → «select template». Если enzymes empty → template visualisation + «select enzyme(s)» message. Если both selected: `calcCutSitesOnTemplate(template.sequence, enzymes)` → base visualisation + overlay vertical lines в cut positions + overlay shaded rectangle между adjacent cut sites. Side panel: list of resulting fragments с lengths + features. Если no cut sites → onError.

**`canvas/operations/previews/PCRPreview.jsx`** (~5-6 KB) — Props: `template`, `primer1` (oligo либо raw sequence), `primer2`, `autoDesign`. Если autoDesign=true и no primers → call `designPrimerPair`. `calcPrimerCoverageRegion(template, primer1, primer2)` → `{start, end, length, strand}`. Base visualisation + forward primer arrow at start + reverse arrow at end + bright highlight on copy-region. Side panel: amplicon length + Tm. Error «primer not found».

**`canvas/operations/previews/GibsonPreview.jsx`** (~5-6 KB) — Props: `fragments`, `method` ('overlap'|'goldengate'), `topology_output`. `calcOverhangZones` → per-pair `{overlap_length, overlap_sequence, match: bool}`. Fragments как horizontal ribbons (assembly chain horizontal, Q4 default). Overlay overhang-zones colored. goldengate → 4-nt green; overlap → 20-40 bp blue. Match indicator green check / red X. Если circular output → assembled product preview internal. Mismatch → onError.

**`canvas/operations/previews/LigatePreview.jsx`** (~5-6 KB) — Similar to Gibson но proще: sticky-end markers + blunt-end markers. `calcStickyEndMatching` → match indicator. Horizontal chain.

**`canvas/operations/previews/KLDPreview.jsx`** (~5-6 KB) — Props: `template` (circular), `primer_pair`, `dpnI_digest`. `calcKLDRegion` → `{primer1_pos, primer2_pos, mutation_offset, gap_size}`. PlasmidMiniMap base + primer position arrows on circle + highlight gap region + mutation point red dot в gap. Side panel: predicted mutant diff + DpnI status.

**`canvas/operations/previews/MutagenesisPreview.jsx`** (~5-6 KB) — Props: `template`, `mutations`. `applyMutationsForPreview` → `{mutant_sequence, affected_features, conflicts}`. Base visualisation + mutation dots at positions (red sub / blue ins / gray del). Affected features warning border. Active-site feature → yellow warning, not blocking. Side panel: mutation list + affected features.

**`canvas/operations/previews/lib-preview-helpers.js`** (~4-5 KB) — pure functions: `calcCutSitesOnTemplate(sequence, enzymes) → CutSite[]`; `calcPrimerCoverageRegion(template, p1, p2)`; `calcOverhangZones(fragments, method)`; `calcStickyEndMatching(fragments)`; `calcKLDRegion(template, primer_pair)`; `applyMutationsForPreview(seq, anns, mutations)`. **Все pure**, no side effects, no store reads.

### Изменяемые

- **`canvas/operations/OpPopup.jsx`** — add `previewContent` prop slot между header и body.
- **6 kind-specific OpPopups** — mount `<XPreview ... />` as previewContent.

### Возможные extract (K1 решение)

- **`components/PlasmidMiniMap/index.jsx`** — если K1 определит что PlasmidMiniMap в OverviewTab tightly embedded и нужен extract как standalone. Размер ~5-8 KB ожидание.

## 8. Порядок выполнения K1..K8

### K1 — Разведка (≤ 30 минут, БЛОКЕР)

Прочитать без правок:
- `components/Library/inspector/tabs/OverviewTab.jsx` (9.99 KB) — определить расположение PlasmidMiniMap кода.
- `components/Library/inspector/tabs/LinearFeatureBar.jsx` (25.75 KB) — определить props контракт + reusability.
- v0.5 algorithm core (`restriction-db`, `local-primer-design`, `golden-gate`, `mutagenesis`) — квик-чек signatures для adapter pure helpers.

Document K1 (в docs/SPRINT_M_CANVAS_OPS_PREVIEWS_K1.md):
- PlasmidMiniMap status — standalone или embedded, нужен ли extract.
- LinearFeatureBar props контракт — какие props pure-data accept (sequence, annotations, length, cursorPosition) vs depend on Library state.
- Algorithm functions reuse через preview helpers vs full reimplement.

**Блокер K1.** Если LinearFeatureBar tightly coupled к Library state (через imported hooks из Library/inspector/hooks/), preview-use потребует либо props-injection refactor (правка Library), либо fork в `canvas/operations/previews/lib/LinearLane.jsx`. Решение поднимается к Chat если right path неясен.

### K2 — PreviewSection base frame (≥ 3 теста)

1. Create `PreviewSection.jsx` (~3-4 KB).
2. Update `OpPopup.jsx` — add `previewContent` slot.
3. Smoke integration test: OpPopup без preview render OK; OpPopup с placeholder PreviewSection render OK.

### K3 — CutPreview (reference implementation, ≥ 6 тестов)

1. Create `lib-preview-helpers.js` с `calcCutSitesOnTemplate` first function.
2. Create `CutPreview.jsx`.
3. Wire to `CutOpPopup.jsx` as previewContent.

Тесты: «select template» при null / «select enzymes» при empty / N cut sites для pUC19+EcoRI fixture / shaded region rendered / side panel fragments correct / error «no cut sites» при нерезабельном enzyme.

### K4 — PCRPreview (≥ 6 тестов)

1. Add `calcPrimerCoverageRegion` to helpers.
2. Create `PCRPreview.jsx`.
3. Wire to `PCROpPopup.jsx`.

Тесты: template visualisation / primer 1 arrow correct position / primer 2 reverse strand / highlight region correct length / side panel amplicon length + Tm / error «primer not found».

### K5 — GibsonPreview + LigatePreview (≥ 10 тестов)

1. Add `calcOverhangZones` + `calcStickyEndMatching` to helpers.
2. Create `GibsonPreview.jsx` + `LigatePreview.jsx`.
3. Wire to respective popups.

Тесты: N fragments stacked / overhang zones colored / match indicator green/red / goldengate vs overlap visual / circular output preview / sticky-end markers / blunt-end markers / mixed error / empty list placeholder.

### K6 — KLDPreview + MutagenesisPreview (≥ 10 тестов)

1. Add `calcKLDRegion` + `applyMutationsForPreview` to helpers.
2. Create `KLDPreview.jsx` + `MutagenesisPreview.jsx`.
3. Wire to respective popups.

Тесты: KLD circular template / primer arrows on circle / mutation dot in gap / mutant diff preview / Mutagenesis dots positions / sub red / ins blue / del gray / affected features highlighted / active-site warning / multi-mutations all visible / empty list placeholder.

### K7 — Integration tests + visual fidelity (≥ 5 тестов)

1. E2E tests: open each OpPopup, see preview с correct visualisation для representative fixtures.
2. Performance smoke: 5+ fragments Gibson preview не лагает.
3. Reactive update test: change template select → preview updates within 200ms.

### K8 — Sanity + size check

1. `list_directory_with_sizes` на `canvas/operations/previews/`.
2. Verify hard cap 6 KB на каждый preview component.
3. Verify lib-preview-helpers.js under 5 KB.
4. Run full test suite.

**Stop K8.** Manual e2e: open each of 6 OpPopups, see preview update reactively, see errors когда params bad, see correct visualisation для representative inputs.

## 9. Тесты — итого

K2: 3 / K3: 6 / K4: 6 / K5: 10 / K6: 10 / K7: 5 = **~40 новых тестов**. Старых не удаляется (preview — additive). Чистый рост ~40.

## 10. Риски (топ-4)

1. **LinearFeatureBar tight coupling к Library state.** K1 must verify. Если bound через hooks которые требуют librarySlice — preview либо fork либо props-injection refactor Library code. **Mitigation:** K1 поднимает блокер если right path неясен. Worst case fork в `canvas/operations/previews/lib/LinearLane.jsx`.

2. **PlasmidMiniMap extract decision.** Если K1 решит что extract нужен — это правка Library production кода, риск регрессии Library OverviewTab. **Mitigation:** snapshot tests OverviewTab перед extract; PlasmidMiniMap extract — отдельная mini-task с собственным test coverage.

3. **Realtime preview perf на complex inputs.** 5-fragment Gibson preview с big sequences (~10 kb each) может лагать. **Mitigation:** debounce 150ms на param-change; useMemo для expensive calculations.

4. **Preview accuracy vs algorithm output mismatch.** Preview pure-helpers упрощают algorithm для visualisation, real adapter `executeCut` может вернуть иное. Risk: preview предсказал 3 cut sites, execute вернул 4. **Mitigation:** preview-helpers и operation adapters share underlying logic; K7 verifies parity через test pairing.

## 11. Открытые вопросы

**Q1 — Realtime vs explicit Preview button.** Default realtime (debounced 150ms). Если perf проблема — fallback на explicit button.

**Q2 — Clickable features в preview.** Default — read-only first version. Clickable = polish.

**Q3 — Multiple inputs preview layout.** Default — chain horizontal (assembly order visible). Vertical stack — fallback.

**Q4 — Error visualisation severity.** Errors block Execute (red), warnings allow with confirm (yellow). Каждый preview сам classifies.

**Q5 — Preview persistence after Execute.** Default — disappear. Historical preview = bloat.

## 12. Code handoff (одной фразой)

> Прочитай CHAT_PLAYBOOK.md, CLAUDE.md, BUGS.md, CURRENT_TASK.md, docs/ROADMAP_CANVAS_V2_TO_PRODUCTION.md, docs/SPRINT_M_CANVAS_OPS.md (M-CANVAS-OPS должен быть закрыт), и эту спеку. Выполни K1–K8. K1 разведка LinearFeatureBar + PlasmidMiniMap coupling status — **БЛОКЕР**: если tight coupling с Library state требует широкий refactor либо fork непроходим, остановись и подними к Chat. K2 PreviewSection foundation + OpPopup slot integration — должно быть stable до K3. K3 CutPreview как reference implementation, K4-K6 остальные previews по тому же паттерну. K7 e2e + perf, K8 sanity + size. Спеку не переписывай. После K8 (зелёный test + 6 OpPopups имеют working preview) остановись — жду визуальной приёмки в отдельной сессии. Не финализируй DECISIONS / COMPONENT_MAP / PROJECT_STATE / RELEASES / BUGS / TECH_DEBT / CLAUDE.md.

---

_Создан 12.05.2026 поздний вечер. Версия 1.0. Sprint #2 (после OPS) или #3 (parallel к PERSIST) wave M-CANVAS-V2-TO-PRODUCTION. Cross-refs: ROADMAP_CANVAS_V2_TO_PRODUCTION.md, SPRINT_M_CANVAS_OPS.md (зависит от него — OpPopups + 6 kinds + algorithm adapters должны существовать), NOTES_CANVAS_V2_KICKOFF.md._



