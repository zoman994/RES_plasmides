# DECISIONS.md — Sprint-Level Decisions

> **Назначение.** Sprint-level решения без ⚓ (DEC-XX-NN). Не-фундаментальные выборы сделанные в ходе конкретного спринта. Читается всегда.
>
> **Ротация.** Записи старше 2 спринтов → `docs/archive/DECISIONS_YYYY_QN.md`. При финализации каждого спринта Chat проверяет и переносит устаревшие блоки.
>
> **Куда идёт что:**
> - Фундаментальное решение (явно закрепляется или supersede'ит другое фундаментальное) → `ANCHORS.md` с пометкой ⚓.
> - Sprint-level решение (паттерн, выбор библиотеки, UX-конкретика) → `DECISIONS.md` (этот файл).
>
> **История решений до v0.6.3 split.** Все sprint-level решения спринтов v0.5.x и v0.6.0..v0.6.2 остались в `ANCHORS.md` (в sprint-блоках §2–§15) вместе со своими ⚓ решениями — split сделан при реструктуризации 01.05.2026 без разбора их на fundamentals/sprint. Будущие спринты пишут сразу в правильный файл.

---

## Sprint M-B FINAL — Importer rework + post-acceptance polish + Catalog tree rewrite (02.05.2026, v0.7.0)

Финализация в одной сессии после Code one-shot M-B.1 + M-B.2 + 3 round'а post-acceptance polish (Игорь напрямую с Code) + v0.7.0 catalog tree rewrite. ⚓ fundamentals (DEC-IMP-15 lazy-mount tabs, DEC-DS-02 palette A+v2 + canonical-key, DEC-CAT-04 folder-as-slash-path) — в `ANCHORS.md`. Ниже — sprint-level outputs цикла.

### Importer (sprint-level, DEC-IMP-13..14, DEC-IMP-16..18)

**[2026-05-02] DEC-IMP-13 — Single-screen 4-column layout заменил Step1→Step2 двухэкранный flow.** `[CatalogColumn 320px] [Inspector flex] [MetaColumn 200px]` + footer (`SessionSummary` + `ActionsBar`). Биолог за полгода работы с v0.5 ImportStartScreen привык к single-screen паттерну; M-B.1 двухэкранный flow расходился с ожиданием. Inspector внутри несёт TabBar — Обзор / Последовательность / Аннотации / История (conditional при commits.length>0, в M-B.2 always false). Step semantic (`step`/`goNext`/`goBack`) выпилен из `useImporterState`; добавлены `activeTab` + `activeSource` (CatalogColumn drill-down state, выпилен в v0.7.0 при no-drilldown rewrite — см. DEC-CAT-01).

**[2026-05-02] DEC-IMP-14 — CatalogColumn — универсальный entry для 4 источников (Этот проект / Учебные / Моя библиотека / SnapGene catalog).** Все 4 источника рендерятся как однотипные узлы collapsible-tree с одним `onSelectItem` handler. Drop zone + paste textarea — в углу той же колонки, не отдельный screen. Sticky search input наверху с length-pattern (`>5kb` / `<2k` / `2k-3k`). MAX_CATALOG_LENGTH=20000 фильтр для SnapGene catalog. Lazy fetch SnapGene categories через `catalog-cache.js` (module-level cache, идентично v0.5 `prefetchAllCategories` + `fetchCategory`). v0.5 ImportStartScreen catalog parts pattern портирован с переписью под v0.6 store (`selectVisibleLibraryEntries` для «Моя библиотека», `currentProject.containerIds` для «Этот проект»).

**[2026-05-02] DEC-IMP-16 — Edit annotations через `perFileEdits[fn].editedAnnotations`, без commits[] в M-B.2.** Pending-state модель из M-B.1 K5 переиспользуется. При переключении файлов в multi-mode edits сохранены per-fileName, не теряются. При Confirm: `entry.payload.annotations = editedAnnotations ?? enrichedCache ?? parsedAnnotations`. Diff visualizer не делается. `editedTags` и `editedName` добавлены параллельно (Code-добавление сверх спеки, принято — для inline rename + multi-row rename + TagsEditor inline). **Future:** когда commits[] на molecule станут first-class в M-D Container Window, pre-commit edits импортёра станут initial commits на baseSnapshot — апгрейд contract'а LibraryEntry без breaking changes (текущее `entry.commits` либо undefined либо []).

**[2026-05-02] DEC-IMP-17 — SessionSummary footer как accumulating list (как v0.5).** Каждое action (Канвас / Библиотека / +N регионов / Заменён / Уже добавлено) добавляет entry в `state.addedItems[]`. Висит между MetaColumn'ом и ActionsBar'ом, видно всю сессию импорта. Replaces toast-only feedback из M-B.1 (toast ушёл — биолог забыл). `appendSessionEntry(prev, entry)` дедуплицирует annotate-action на same name с zero deltaRegions — копия v0.5 `session-log.js`.

**[2026-05-02] DEC-IMP-18 — MoleculeWorkspace компонент keep для M-D Container Window, НЕ импортируется в M-B.2 Importer.** Файлы `MoleculeWorkspace/{index,LeftPane,RightPane}.jsx` остаются в репо; контракт DEC-IMP-12 ⚓ (props без mode-prop, layout-only) валиден для будущего Container Window. M-B.2 Inspector нативно рендерит PlasmidMiniMap / SequenceMapView / AnnotationEditor по lazy-mount табам — табы Importer-specific UX, Container Window M-D будет другой layout. TD-MOLECULEWORKSPACE-M-D отслеживает компонент.

### Catalog tree (sprint-level, DEC-CAT-01..03; DEC-CAT-04 ⚓ в ANCHORS.md)

**[2026-05-02] DEC-CAT-01 — No drilldown — все группы collapsible-tree inline.** Изначально CatalogColumn в M-B.2 имел drill-down режим (`activeSource={kind, value}` с «← Назад» header'ом, как v0.5 ImportStartScreen). v0.7.0 round выкинул drill-down: все группы (Mine / Canvas / Demo / SnapGene + nested subgroups + folders) — collapsible dropdown'ы inline, на одном scroll'е. Items внутри каждой подгруппы — полный список, без «Показать все/меньше» пагинации. Order top-level: **Моя библиотека первой** (по запросу биолога), далее «Этот проект», «Учебные / demo», SnapGene catalog. Lazy fetch SnapGene категорий — на первое раскрытие.

**[2026-05-02] DEC-CAT-02 — Per-depth translucent accent tint для visual hierarchy.** `depthBackground(d) = 2.5%·d`, max 8% — banded визуальная иерархия для nested folder уровней. Через CSS variable `--depth-bg` (не inline-style), чтобы `:hover` не блокировался. `indentForDepth(d) = 12 + d*12`, capped at 72 px. `CHEVRON_GUTTER = 16` добавлен к items чтобы text лёг под parent text column. Без depth-tint биолог теряется в глубоком дереве (`Backbones/Pichia/AOX1/derivatives/`).

**[2026-05-02] DEC-CAT-03 — File-manager hover-icons (＋ создать папку / ⤓ импорт файла) на header'е каждой top-level группы и каждой папки.** Visible at opacity 0.5 (не hover-only — биолог пропускал hidden), opacity 1 на row hover. Эмодзи `📥` → Unicode `⤓` (DOWNWARDS ARROW TO BAR, согласуется с символами проекта ▾ ▸ ＋ ‹ ⋯ ↻). Drop file на section header «Моя библиотека» → импорт в root; drop на folder row → импорт с folder-path в `editedTags`. **Folder/file creation Mine-only** — Canvas/Demo/SnapGene GroupHeader без `onAddChild` (биолог: «запрети создавать папки и файлы внутри SnapGene демо и прочих кроме библиотеки»). `renderFolderNodes` гейтит actions через `isMine && !isUntagged`.

### Auto-annotate cleanup (sprint-level, DEC-AA-01)

**[2026-05-02] DEC-AA-01 — Auto-annotate radically scoped down («не надо НАСТОЛЬКО МНОГО»).** Удалены детекторы шума из `auto-annotate.js`: **linker detection** в `annotateCDS` (производил 25+ «Linker N» на каждой плазмиде); **promoter sub-features** (-10 element / -35 element / RBS / TATA box / CAAT box) — `annotatePromoter()` целиком; **terminator sub-features** (Poly-A signal) — `annotateTerminator()` целиком; **signal_peptide + propeptide** в CDS auto-flow — биолог: «отдельно при нажатии на CDS можно выбрать через сигнал IP» (отложено в TD-PER-CDS-SIGNALIP). Все типы (`linker`, `core_promoter`, `regulatory`, `polyA_signal`, `signal_peptide`, `propeptide`) **остались** в `TYPE_GROUPS` + палитре — пользователь добавляет вручную через AnnotationEditor. Unused helpers (`findConsensus`, `isProkaryote`, `PROKARYOTE_KEYWORDS`) удалены. **Auto-annotate UI moved** из ActionsBar overflow ⋯ в AnnotationsTab toolbar (биолог: «явно вынести на вкладку аннотаций»). Manual-trigger button сейчас disabled stub под per-CDS SignalIP next iteration; checkbox («авто-аннотация при импорте») рабочий.

### Library wipe + Importer surface как single entry (sprint-level, DEC-MB-01..02)

**[2026-05-02] DEC-MB-01 — Library fullscreen window удалён, browse function переехала в Importer CatalogColumn → группа «Моя библиотека».** `components/Library/` (4 файла + `Library.test.jsx`) wiped. `librarySlice` data API сохранён без изменений (M-A.3 контракт). Tag-editing — только при импорте через TagsEditor inline в SingleInspector (пишет в `perFileEdits.editedTags` → Confirm flow промотит в `entry.tags`). Soft-delete пользовательских entries отложен в M-D Container Window. StartScreen `Library` SidebarLink — opens Importer с target=library + full catalog visible. **Обоснование:** при flat tagging (DEC-LIB-09) и одном источнике browse (Importer CatalogColumn) отдельный fullscreen Library дублирует UI без выгод; биолог получает «open library» behaviour через Importer'ный path. M-A.3 группы D/E/F/H tests удалены вместе с фуллскрином, coverage data API остался в integration-тестах Importer.

**[2026-05-02] DEC-MB-02 — Origin-rotate переехал из MetaColumn на SequenceTab.** Биолог: «выбор точки начала для плазмид должен быть доступен только на сиквенс вью, где можно тыкнуть на нуклеотид (там хоть номера видны)». Origin-offset input + apply + intergenic-hints перенесены из правого sidebar (`MetaColumn`) в верхний toolbar `SequenceTab` — над `SequenceMapView`, где видны позиции. MetaColumn потерял: origin Card, `originOffset` state, `useEffect` reset, `onApplyOrigin`, импорт `computeIntergenicHints`. Топология toggle + length / info / IUPAC / description / organism / source остались в MetaColumn. SequenceTab принимает новые props `fileKey` + `onUpdateEdits`, рендерит control только при `topology === 'circular'`.

---

## (Старше 2 спринтов — в archive)

Решения спринтов v0.5.x и v0.6.0 (DEC-MA-01..04), Sprint M-A.1 (DEC-MA1-01..04), Sprint M-A.2 FINAL (DEC-MA2-02) живут в `ANCHORS.md` sprint-блоках и `docs/archive/DECISIONS_2026_Q2.md`. Исторический журнал по версиям — в `RELEASES.md`.
