# BUGS.md — BodgeGene

Баги → сюда. Починены → `[x]`. Claude Code читает при старте сессии.

---

## OPEN

### Критичные

- [ ] **P1 (повтор):** 1 фрагмент → 4 праймера. Корень: App.jsx auto-design useEffect не очищает stale-праймеры.
- [ ] **V1 REGION-OVERFLOW:** PlasmidMap нечитаем для плазмид с крупными region-аннотациями (repeat_region 2440 bp на 10791 bp pDHG25 → 22% внешнего кольца серого цвета). Текст меток по арке не читается, мелкие regions (on, AmpR, platformer) перекрываются большими. Детектировано визуально после Этапа 1.2 — repeat_region теперь region-тип (раньше уходил в unknown-heuristic как misc_feature, но визуально было то же). Возможные направления: (а) limit для layout — regions >N% кольца → собственный внутренний track; (б) smarter font rotation + truncation rules; (в) интерактивный hover с полным именем при усечении; (г) top-K filter по priority. 19.04.2026 (after 1.2 visual testing).

### Высокие

- [ ] **P4 (повтор):** Нет аннотаций на PartBlock после «Как backbone». migratePartAnnotations не помог.
- [ ] **V7 INSERTION-CLOCK:** При сборке insert+backbone не видно в какое место backbone идёт вставка. Решение: reusable `<InsertionClock>` компонент (циферблат), стандартная метафора plasmid editors (SnapGene, Benchling, Geneious).

  **Дизайн:**
  - **Q1 (семантика):** Clock выбирает середину insert-region, cut = центр выбранного региона (интуитивно для юзера: «solid» вместо «как разорвать»).
  - **Q2 (размещение):** inline mini-clock в PartBlock (маленькая круговая иконка с pointer + маркер insert position); клик раскрывает full-modal с draggable cursor по кольцу + sequence-view ±50 nt внизу.
  - **Q3 (default):** авто-выбор safest place — середина самого длинного межгенного gap между features. Если авто не нашло (gaps < min-size или полное покрытие features) → блокировка сборки до явного выбора юзером.

  **User stories:**
  - **US-1 Assembly:** pUC118 + AsCpf1 → PartBlock backbone показывает mini-clock с pointer на autoshot safest position (напр. midgap между lacZα и AmpR). Клик → full clock modal → драг cursor по lacZα → inline warning "вставка разорвёт lacZα". «Выбрать» → пересчёт праймеров под новую cut position.
  - **US-2 Mutagenesis:** тот же компонент в MutagenesisWizard для выбора позиции мутации. Cursor по кольцу → внизу triplet highlight «AmpR кодон 245, AA=Glu».
  - **US-3 Linear:** для линейных фрагментов Clock вырождается в горизонтальную полоску (linear timeline), та же синхронизация с sequence-view.

  **Новые файлы:** `components/InsertionClock.jsx` (reusable). **Влияет на:** PartBlock.jsx (inline mini-clock), MutagenesisWizard.jsx (US-2), DesignCanvas.jsx (wiring), fragment-slice (поле `insertionPoint` у backbone-type fragments). **Влияет на primer design:** `local-primer-design.js` пересчитывает overlap-tails от `insertionPoint` backbone'а, не от позиции 0. **Sprint 2.** Оценка: ~8-10 ч. 19.04.2026.

- [ ] **V15 ISMUTATED-SUBSTRING-BUG:** В `FragmentEditor.jsx` (~строка 760 и ~852) подсветка «применённых» мутаций использует `mutations.some(m => m.label?.includes(String(pos)))` — substring match, не численное сравнение позиций. Для mutations `G26A, R135A, G77C, C403G, G404C` любая AA-позиция, номер которой встречается как подстрока в номере любой мутации, подсвечивается жёлтым (напр. pos=26 → match в любом label содержащем «26», pos=3 → match в «135», «403», «26» и т.д.). Биологически ложные совпадения. Фикс: сопоставление позиций всегда через численное сравнение полей `codonStart` / `position` (или парсинг числа из label с word-boundary). Перепишется в Sprint 1.7 K10 Unified Editor. 21.04.2026.
- [ ] **V16 HIGHLIGHT-IGNORES-TEMPLATESTART:** `computeMutationHighlights` в `FragmentEditor.jsx` делает diff по одинаковому индексу нуклеотида между `fragment.sequence` и `parent.sequence`, не учитывая `fragment.templateStart`. Для HygroR_2 (sub-fragment с `templateStart=42`, родитель — HygroR 1023 bp) child.sequence начинается на parent позиции 42, а не 0 — сравнение идёт «в лоб» и показывает все ~1000 позиций как мутации. После reopen мутантного sub-фрагмента подсветка теряет смысл. Фикс: при наличии `templateStart > 0` сравнивать `parent.sequence.slice(templateStart, templateStart + fragment.length)` с `fragment.sequence`. Фикс в Sprint 1.7 K9. 21.04.2026.
- [ ] **V17 SINGLE-LINEAR-DECORATIVE-JUNCTION:** Одиночный линейный фрагмент на canvas рендерит справа 30-bp overlap-junction, хотя соединять его не с чем. Возникает из дефолтного поведения `junctions[0]` при `fragments.length === 1`. UX-шум, для пользователя выглядит как «что-то ломается». Фикс связан с топологией: для одиночного линейного фрагмента junction не нужен; для одиночного circular — overlap замыкает сам на себя (но это уже KLD-сценарий). Sprint 1.7 K12 вводит явный topology toggle на уровне фрагмента, параллельно убирает decorative junction. 21.04.2026.

### Средние

- [ ] **P6:** Мутагенез: клик на 1 нуклеотид подсвечивает 2 соседних (весь кодон). При режиме "Нуклеотид → мутация ДНК" должен подсвечиваться только 1 нуклеотид, не триплет. 03.04.2026.
- [ ] **V2 DUP-REGIONS:** Дубликаты перекрывающихся regions при импорте (pDHG25: AMA1 5256 bp + AMA1 5226 bp, разница 30 bp). Gene-filter (`GENE_CHILD_TYPES` из 1.2) не срабатывает, если gene и CDS почти совпадают по координатам, но не в contained-отношении. Плюс длинные имена ("Repeat Region 1") усекаются до "platfor" на арках — UX проблема. Связано с V1. 19.04.2026.
- [ ] **V6 RE-LABELS-OVERLAP:** Метки рестриктаз в MCS пересекаются и нечитаемы (pUC118: HindIII/EcoRI/KpnI/BamHI/XbaI/SalI сгруппированы в ~50 bp → labels сливаются в одну точку). Классическая проблема плазмидной визуализации. Варианты: (а) leader lines с разной длиной (vertical stacking); (б) cluster labels ("6 sites" + hover-popup); (в) hide-on-zoom <X% с опцией показать; (г) минимум 2-пиксельный gap между labels. Файл: PlasmidMap.jsx (RE site rendering). Связано с V1/V2 — UX-sprint на circular map. 19.04.2026.
- [ ] **V8 CDS-WARNINGS-OVERFLOW:** В `PlasmidViewer` при просмотре плазмид с множественными CDS без ATG/stop (пример: `pET_lacZ(35-1025)_6HIS` даёт 28 warning'ов) — блок валидации не имеет max-height и перекрывает sequence view + annotation bar (60% видимой высоты модалки). Классическая проблема UX «слишком длинный список предупреждений». Варианты: (а) collapsible блок с "N замечаний — развернуть/свернуть" (по умолчанию свёрнут); (б) max-height + внутренний scroll; (в) фильтр «только errors (красные)» / «только warnings (жёлтые)»; (г) группировка по CDS-фиче. Файл: `PlasmidViewer.jsx` (секция рендеринга validation warnings). Низкий приоритет для чистых каталожных плазмид (0–2 warnings), критично для плазмид с partial CDS. 19.04.2026.

### Низкие

- [ ] **B7 (deferred):** GG overhang palette: stale state after re-render.
- [ ] **V9 SHORT-ANNOTATION-LABELS:** В `AnnotationEditor.jsx` annotation bar — подписи аннотаций скрываются если `width <= 10%` (код: `{width > 10 ? a.name : ''}`). На плотно аннотированных плазмидах (43 аннотации на 8 КБ) среднее окошко ~2% ширины, и практически все имена скрыты — видны только штрихи. Существующее поведение, не регрессия Sprint 1, но UX-долг. Варианты: (а) tooltip при hover показывает полное имя; (б) rotated/abbreviated labels; (в) leader lines с именами наружу полосы; (г) адаптивный threshold (если много коротких — показывать с truncation). 19.04.2026.
- [ ] **V10 SBOL-GLYPH-PALENESS:** SBOL глифы в `AnnotationEditor` tree list (размер 14px) выглядят бледными: в `sbol-glyphs.jsx` все глифы с заливкой используют `fillOpacity="0.15"` и `strokeWidth={2}` на viewBox 36×36. На 14px canvas stroke даёт <1px экранной линии, 15% fill — практически невидим на белом фоне списка. Fix: поднять `fillOpacity` до 0.3–0.4 и `strokeWidth` до 2.5 (или 3.0) в базовых глифах (CDSGlyph, MarkerGlyph, SignalGlyph, промоторы). Outline-only глифы (OriginGlyph, MiscGlyph, TerminatorGlyph) не требуют изменения fill. Проверить что не перегружает визуально tree list. 19.04.2026.

---

## FEATURE REQUESTS

- [ ] **F1:** Добавить свои праймеры на последовательность в PlasmidViewer. Primer mapping + визуализация на circular map и sequence view. Запрос 03.04.2026.

---

## FIXED

### 21.04.2026 — Sprint 1.6: Мутагенез UX v2.1 (partial visual acceptance)

Sprint 1.6 закрыт как **partial** — 4 коммита реализованы и технически зелёные (700 Vitest), но визуальная приёмка выявила 3 новые проблемы (V15/V16/V17) + архитектурный запрос на Unified Editor → Sprint 1.7.

- [x] **K5 PROTEIN-READONLY-IN-EDIT (commit `c899f6e`):** В `FragmentEditor.jsx` tab «Белок» в `mode='edit'` теперь read-only: синяя info-полоса «Режим просмотра» + кнопка «→ Мутагенез» (вызывает `switchMode('mutagenesis')`). AA-span получает `cursor: default` и `onClick=undefined`. Подсказка «Клик по аминокислоте → мутагенез» показывается только в `mode='mutagenesis'`. `openMutMenu` сохраняет early-return guard как defence-in-depth. Биологическое обоснование: bookkeeping-правка белка невозможна без кодона. +4 integration-теста.
- [x] **K6 SPLIT-ANNOTATIONS-BIOLOGY (commit `acbf515`):** Новый `lib/split-annotations.js::trimAnnotationsForSubFragment(parentAnns, sf)` заменяет coordinate-only map+filter в `handleSaveFragment`. Правила: signal_peptide/transit_peptide/propeptide — drop на partial overlap (N-terminal); start_codon/stop_codon — только на правильной границе; restriction_site/primer_bind/mutation/variation/modified_base — drop на trim; CDS/gene — rename с (5' trimmed) / (3' trimmed) / (trimmed) суффиксом; остальное — trim + flag. Идемпотентно (не удваивает «trimmed»). +21 unit-тест.
- [x] **K7 SPLIT-GROUP-CANVAS (commit `d110272`):** Split-фрагменты (two/multi_fragment mutagenesis) получают общий `splitGroupId` + `splitGroupParentName` + `splitGroupIndex` + `splitGroupTotal` на уровне данных. `handleSaveFragment` и `handleMutagenesis` (non-KLD) ставят эти поля. `DesignCanvas` группирует consecutive same-groupId в `.split-group-container` с 4 визуальными эффектами: пунктирная фиолетовая рамка, тонированный фон, badge «🧬 parent (split: N частей)», соединительная линия. Internal junctions внутри группы, external — снаружи. KLD не затронут (single fragment). +4 component-теста. **Финальное решение по визуалу** (какие из 4 эффектов оставить) — в Sprint 1.7 после приёмки.
- [x] **K8 MUTATION-HIGHLIGHTS (commit `b2ac6ec`):** `computeMutationHighlights(fragment, parent)` экспортирован из `FragmentEditor.jsx`. Primary — `sequenceDiff` против parent-part (через `fragment.parentId`), возвращает `Map<ntPos, 'silent'|'nonsilent'>`. Fallback — `fragment.mutations` list (conservatively nonsilent). DNA view подсвечивает per-nt (red/yellow + borderBottom + tooltip), protein view per-codon (любой nonsilent nt в codon → весь AA red). +8 unit-тестов. **Известное ограничение:** не учитывает `templateStart > 0` → для split sub-фрагментов ложно показывает всё как мутации → V16 в Sprint 1.7 K9.

**Известные проблемы Sprint 1.6 → Sprint 1.7:**
- V15: `isMutated` через `label.includes(String(pos))` — substring match вместо числового сравнения (см. OPEN).
- V16: `computeMutationHighlights` не учитывает `templateStart` (см. OPEN).
- V17: Single linear fragment рендерит decorative overlap-junction (см. OPEN).
- Архитектурный запрос: убрать tabs (Последовательность/Белок) из FragmentEditor → Unified Editor в Sprint 1.7 K10.

### 20–21.04.2026 — Sprint 1.5: Мутагенез v2 (partial visual acceptance)

Sprint 1.5 закрыт formal — 4 коммита реализованы и прошли автотесты (663 Vitest). K1/K3/K4 приняты визуально в рабочем сценарии; K2 технически валидный, но визуальная приёмка дала feedback → Sprint 1.6 K5–K8.

- [x] **V11 KLD-PRIMERS-ZERO-TM (commit `67d2269`):** `makeKLDStrategy` в `mutagenesis.js` возвращал хардкод `{tmBinding: 0, tmFull: 0, gcPercent: 0}`, ломая annealTemp в protocolSteps. Fix: переиспользована готовая `gcPercent` из `tm-calculator.js` + `calcTmNN` (уже импортирован). Для KLD `tmFull === tmBinding` (no tail). Свёрка с `docs/CLEANUP_DEAD_CODE.md` K3 — спека предлагала новый `gcPctInt` helper, но DRY важнее: `gcPercent` делает ровно то же. +2 теста.
- [x] **V12 FRAGMENTEDITOR-MODE-CONFUSION (commit `c394c64`, partial):** Top-level mode switcher в `FragmentEditor.jsx` (radio «Правка / Мутагенез» над tabs). `mode='edit'`: AA popup заблокирован в `openMutMenu`, DNA handlers (`applyDnaSub/Del/Insert`, `commitCodonEdit`) не пишут в mutations. `mode='mutagenesis'`: существующее поведение. Quick actions disabled в mutagenesis. `handleSave` разделён на `handleSaveEdit` (без mutations, +editHistory writer) и `handleSaveMutagenesis`. Save button routed по mode. `switchMode` helper с confirm при накопленных mutations. Мёртвый `workflow` state удалён. +6 integration-тестов. **Визуальная приёмка partial** — базовый mode switcher работает, но выявила V15/V16/V17 + архитектурный запрос на Unified Editor → Sprint 1.7 K10.
- [x] **V13 PLASMIDVIEWER-MUTATE-LOST-TEMPLATE (commit `e983fed`):** Корневая причина — «🔄 Мутагенез» в footer `PlasmidViewer` идёт через `PlasmidUseWizard` с `presetMode='mutate'`, который закрывал себя не передав plasmid в `MutagenesisWizard`. Fix: новый `uiSlice.mutagenesisInitialPlasmid` + setter; `PlasmidUseWizard` (оба пути — useEffect + menu-click) seed'ит это поле перед `setShowMutagenesis`. `MutagenesisWizard` принимает `initialTemplateSeq/Name/Organism/CdsStart/CdsEnd`, при наличии `initialTemplateSeq` стартует на Step 2. Initial seq санитизируется на mount (контракт Этапа 1.1). `App.jsx` реактивно прокидывает и зануляет на close. +3 integration-теста.
- [x] **V14 MUTAGENESIS-STRATEGY-CONTEXT-BLIND (commit `f342c57`):** `chooseStrategy(mutations, fragmentContext = {})` — default `{topology: 'circular', isStandalone: true}` для backwards compat. KLD разрешён только при `topology === 'circular' && isStandalone === true`; linear или non-standalone → `two_fragment`/`multi_fragment` независимо от числа мутаций. `computeMutagenesisStrategy` прокидывает `options.fragmentContext`. `makeFragmentStrategy` принимает `strategyLabel` — single-mutation linear case корректно помечается как `two_fragment` (не `multi_fragment`). Для single-mutation fragment strategy cut ставится ровно в позиции мутации → мутация в overlap-зоне между резулт. фрагментами. `handleSaveFragment` собирает context из `active.circular + fragments.length + templateSeq.length`; `MutagenesisWizard` — явный `{circular, standalone}`. +15 тестов.

### 20.04.2026 — MUTWIZ-SANITIZE: sanitize-at-entry в MutagenesisWizard

- [x] **MUTWIZ-SANITIZE:** Заменены 2 legacy inline-regex `/[^ATCGatcg]/g` и `/[^ATCG]/g` в `MutagenesisWizard.jsx` на централизованный `sanitizeSequence` из `sequence-utils.js` (контракт Этапа 1.1). Template textarea (строка 129) и Insert DNA input (строка 238) теперь сохраняют полный IUPAC-алфавит (NNK/NNN/MNN/NDT saturation codons и ambiguity R/Y/S/W/K/M/B/D/H/V). Placeholder insert-поля расширен: "CACCATCACCATCACCAT (6xHis) или CACCATNNKCATCAC (saturation)". +3 integration-теста в `mutagenesis-wizard-sanitize.test.jsx` (IUPAC paste, invalid char strip, NNK в insertSequence через full step-1→step-2 flow). Vitest 634 → 637.

### 19–20.04.2026 — Sprint 1: Читаемые метки, чистые стыки, настоящий мутагенез

- [x] **V5 ANNOTATION-BAR-CONTRAST:** `AnnotationEditor.jsx` annotation bar — белый текст на жёлтых/светлых фонах заменён на luminance-aware (`#FFFFFF` или `#1F2937`). Helper `getTextColor(bgHex)` в `gui/designer/src/lib/color-utils.js` с WCAG формулой `0.299*R + 0.587*G + 0.114*B`, threshold `0.55`. Fallback на белый при malformed hex. +7 unit-тестов. Коммит `7521dcb`.
- [x] **V3 JUNCTION-STALE-RE:** Переключение типа стыка в `JunctionBlock.jsx` (контекстное меню, tab-кнопки, GG warning-button) теперь ресетит enzyme/overhang поля предыдущего типа через `resetJunctionForType(j, newType)` helper в `gui/designer/src/lib/junction-utils.js`. 6 call-sites в JunctionBlock. Сохраняются: id + overlap-геометрия (overlapLength/overlapMode/autoMode/calcMode/tmTarget). GG → default enzyme `BsaI`, ligation/re_ligation → preserve reEnzyme (mirrored into j.enzyme). +6 unit-тестов. Коммит `50d8bf0`.
- [x] **V3-bulk:** `App.jsx:460` bulk-переключение `junctions.map(j => ({...j, type: 'golden_gate', ...}))` страдало той же stale-state проблемой. Фикс через `resetJunctionForType(j, 'golden_gate')` + spread-override `enzyme: ggEnzyme`. +1 bulk-pattern тест. Коммит `67ae2ee`.
- [x] **V4 MUTAGEN-NO-PRIMERS:** Core-workflow мутагенеза сломан в обоих UX-путях. Исправлено по 4 фронтам:
  - **V4-helper (`e0f48cd`):** новый `src/lib/mutagenesis-payload.js::buildMutagenesisPayload(result, ctx)` — чистая функция, транслирует результат `computeMutagenesisStrategy` в project-prefixed primer names (`<prefix>NNN_mut_<dir>_<template>`) + protocolSteps (KLD: pcr + dpni[type=assembly] + kld_asm[type=kld] + transform + screening + sequencing; two/multi: pcr_parts + overlap_pcr + transform + screening + sequencing). +6 unit-тестов.
  - **V4-A (`e0f48cd`):** `App.jsx` useEffect после `autoDesigned` — добавлен `isMutagenesis` guard в первую ветку. Если активная assembly несёт мутагенезные праймеры, стандартный auto-design не перезаписывает их, только обновляет `apiWarnings`+`calculated`. P1v2 regression (else-ветка) сохранена.
  - **V4-wizard (`20e7df0`):** `MutagenesisWizard.jsx::onComplete` payload расширен (strategy/primers/protocol/warnings/templateName). `useFragmentHandlers.js::handleMutagenesis` теперь ходит через `buildMutagenesisPayload`, пишет primers+protocolSteps+apiWarnings, `calculated = strategy === 'kld'`. +3 integration-теста.
  - **V4-overlap (`ea96ca2`):** `local-primer-design.js::overlapTail` в split-mode ветке теперь приоритезирует `junction.overlapSequence` над WT-флангами. Если strategy дала overlap-бridge с мутацией — мутация попадает в primer tail. Fallback на существующую логику без overlapSequence. +2 unit-теста.
  - **V4-inplace (`2f66348`):** `handleSaveFragment` переписан: ранний return на no-mutations, маппинг `updated.mutations` в strategy-формат (6 FragmentEditor типов → substitution/deletion/insertion), `computeMutagenesisStrategy` на исходном WT (`original.sequence`), dispatch по `result.strategy`: KLD → replace fragment inline; two/multi → splice фрагмента на N под-фрагментов с overlap-стыками, аннотации разрезаются по `templateStart/templateEnd` с флагом `trimmed`. No-PCR guard блокирует split с apiWarning. Вариант в parts library сохранён. +5 integration-тестов.

### Покрытие Sprint 1
Vitest: 604 → **634** (+30), pytest: 112 ✅, build: clean на каждом из 7 коммитов.

### Визуальная приёмка Sprint 1 (20.04.2026)
Проведена тест-сессия из 8 блоков. **Принято:**
- ✅ V5: контраст annotation bar работает (pUC-like плазмида с AmpR/ori/f1_ori — тёмные подписи на жёлтом, белые на синем).
- ✅ V3: Junction reset в context-menu работает, RE-метки чисто сбрасываются при переключении на GG.
- ✅ V3-bulk: bulk-переключение всей сборки на GG через App.jsx:460 — все стыки очищены.
- ✅ V4 Wizard KLD: `IS001_mut_fwd_pET-23(+)` / `IS002_mut_rev_pET-23(+)` — именование корректное, protocolSteps полный (pcr/dpni/kld_asm/transform/screening/sequencing).
- ✅ V4 in-place KLD: одна мутация на standalone circular плазмиде → фрагмент остаётся одним, 2 мутагенезных олига, олиги НЕ стираются последующим auto-design.
- ✅ V4-overlap: подтверждено косвенно через KLD workflow (но edge case с two_fragment split на линейном фрагменте — см. V14).

**Не принято / найдены побочные баги:**
- ❌ V4 in-place two_fragment split на линейном фрагменте в сборке — выбирается KLD вместо two_fragment (см. V14).
- ❌ V4-A guard в многофрагментной сборке — не проверено отдельным тестом (косвенно работает через Wizard-путь).
- Новые баги V8, V9, V10, V11, V12, V13, V14 — записаны в OPEN, перенесены в Sprint 1.5.

**Вердикт:** Sprint 1 формально принят (KLD-путь работает, UI-фиксы приняты). Линейный two_fragment и дизайн-долг вкладок FragmentEditor уходят в Sprint 1.5.

### 18.04.2026 — Этап 1.2: TYPE_MAP пересмотр в import-annotations.js

- [x] **TYPE_MAP:** Семантические ошибки в `import-annotations.js` исправлены. Region-level: `gene` → специализированная `normalizeGeneType(feat)` (по `/ncRNA_class` и `/product`), `mRNA`, `tRNA`, `rRNA`, `ncRNA`, `misc_RNA`, `oriT`, `repeat_region`, `mobile_element`, `D-loop` — собственные типы. Detail-level: `mat_peptide/domain/region → catalytic` заменены на identity, `transit_peptide → signal_peptide` → `transit_peptide`, `motif → binding` → `motif`. Новые маппинги: `CAAT_signal`/`GC_signal` → `core_promoter`, `polyA_site` → `poly_a`, `unsure`. Gene-filter расширен до всех RNA/CDS детей (`GENE_CHILD_TYPES`). `EXON_BEARING_TYPES` (`CDS`+`gene`+`mRNA`) для интрон-извлечения. `extractColor` учитывает `ApEinfo_revcolor` для strand=-1. `strand: feat.strand || 1` добавлен в 3 push-объекта (detail/point/unknown-heuristic). Backend: `snapgene_parser.py` `_TYPE_MAP['gene']` → `'gene'`. `ANNOTATION_COLORS` расширен 14 новыми ключами. +20 тестов в `import-annotations-typemap.test.js`, 5 правок в `import-annotations.test.js`.

### Известные ограничения (TODO v1.1)

- **Legacy-annotations с типом `catalytic`:** плазмиды в store из прошлых сессий могут содержать аннотации с типом `catalytic` (маппинг из `mat_peptide`/`domain`/`region` до Этапа 1.2). Автоматическая миграция невозможна — исходный INSDC-тип потерян. Render не ломается (`ANNOTATION_COLORS.catalytic` = `#2563EB` существует). Для получения корректных типов — переимпортировать исходный `.gb`/`.dna` файл.

### 18.04.2026 — Этап 1.1: Центральный sanitizeSequence (P2-arch)

- [x] **P2-arch:** Санитизация ДНК была в 3+ местах через разные regex. Fix: единая `sanitizeSequence()` в `sequence-utils.js` + экспортируемые константы `IUPAC_DNA_REGEX`/`IUPAC_DNA_CHAR_REGEX`. Применено на 9 точках входа: genbank-parser, file-import (FASTA + backend .dna), AddFragmentModal (clean helper + 3 onChange + extractFeature), FragmentEditor (3 места), PlasmidUseWizard (2 места), SequenceEditor (useState + textarea). Миграция store v6→v7 санитизирует legacy-данные. Inline workarounds удалены из local-primer-design (3 места) и PlasmidViewer. +28 тестов в `sequence-utils.test.js`.
- [x] **P-wizard-iupac:** `PlasmidUseWizard` использовал `[^ATGCN]` без IUPAC-кодов — IUPAC символы R/Y/S/W/K/M/B/D/H/V стирались при импорте insert. Fix: замена на `sanitizeSequence`.
- [x] **P-addfrag-iupac:** `AddFragmentModal` `clean` helper с `[^ATCGNatcgn]` (17 использований в файле) + 2 textarea без sanitize + cursor-position regex. Fix: централизация через `sanitizeSequence` + `IUPAC_DNA_REGEX`/`IUPAC_DNA_CHAR_REGEX` для cursor logic.

### Известные ограничения (TODO v1.1)

- `COMPLEMENT_MAP` не поддерживает IUPAC R/Y/S/W/K/M/B/D/H/V → `reverseComplement()` превращает их в N. Если реальные данные потребуют — расширить до полной IUPAC-таблицы.

### 03.04.2026 — Блок 11b

- [x] **P1v2:** 1 фрагмент "без ПЦР" → 4 stale-праймера. Fix: App.jsx useEffect else-ветка очищает stale primers при fragments<2. Блок 11b (03.04.2026).
- [x] **P3b:** Annotation bar — блёклые цвета + невидимый белый текст. Fix: region opacity 0.5→0.9, detail 0.85→0.7 в AnnotationEditor.jsx. Блок 11b (03.04.2026).
- [x] **P1:** 1 фрагмент "без ПЦР" → 4 праймера (дубли). Fix: useRef guard + partId dedup в handleUseWhole (StrictMode double-fire). Блок 11 (03.04.2026).
- [x] **P2:** ∅ в начале последовательности праймера. Fix: sanitize seq в designPrimersLocal + overlapTail. Блок 11 (03.04.2026).
- [x] **P3:** Circular map — блёклые цвета при повторном импорте. Fix: dedup regions по start-end-type в PlasmidMap. Блок 11 (03.04.2026). Требует визуальной верификации.
- [x] **P4:** Аннотации не отображаются на PartBlock после "Как backbone". Fix: migratePartAnnotations в handleUseWhole. Блок 11 (03.04.2026).
- [x] **P5:** Нет переключателя Карта/Стадион для backbone. Fix: inherit circular topology в handleUseWhole. Блок 11 (03.04.2026).
- [x] **B1:** Первый нуклеотид ∅/N в PlasmidViewer. Fix: sanitize seq. Блок 10 (03.04.2026).
- [x] **B2/B9:** Circular map спагетти. Fix: single plasmid + subArcs + assignSubTracks. Блок 10b-c (03.04.2026).
- [x] **B3:** RE cut markers в sequence view. Fix: reCutMap + inline markers. Блок 10b (03.04.2026).
- [x] **B4:** CDS validation ложные warnings. Fix: auto-trim к ATG + UTR hint. Блок 10b (03.04.2026).
- [x] **B5:** Region labels в sequence. Fix: color dot + name + length. Блок 10b (03.04.2026).
- [x] **B8:** RE junction preview. Fix: inline view в wizard step 3. Блок 10 (03.04.2026).
- [x] **B10:** presetMode instant actions. Fix: useEffect с handler dispatch. Блок 10d (03.04.2026).
- [x] **B11:** SequenceViewer plain text. Fix: per-fragment color. Блок 10 (03.04.2026).
- [x] **B12:** Несмежные регионы — verified корректно. Блок 10b (03.04.2026).
- [x] **B13:** Двойной клик дубли. Fix: creating guard. Блок 10 (03.04.2026).
- [x] **B14:** Дедупликация при импорте. Fix: mergeParts name+id check. Блок 10b (03.04.2026).
- [x] **B15:** Каталог topology. Fix: <1000bp→linear. Блок 10b (03.04.2026).
- [x] **B16:** HTML в каталоге. Fix: stripHtml. Блок 10 (03.04.2026).
- [x] **B17:** Circular map для 18bp. Fix: linear view <100bp. Блок 10b (03.04.2026).
- [x] **B18:** Ghost nodes Flow. Fix: filter missing partId. Блок 10b (03.04.2026).
- [x] **B19:** Settings dropdown обрезан. Fix: top-full. Блок 10 (03.04.2026).
- [x] **Hotkey hints** на пустом canvas. Fix: n>0 guard. Блок 10b (03.04.2026).
- [x] **CRIT-1..5, HIGH-1,3,6,9,10:** System audit фиксы. Блоки 4b, 7, 8a (03.04.2026).
- [x] **BUG-01..83:** Сессии 22-28.
