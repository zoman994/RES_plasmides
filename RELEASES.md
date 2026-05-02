# RELEASES.md — BodgeGene

> Журнал по версиям. Один блок на версию, 1.5–3 KB.
> Ротация: при достижении 30 KB или 10 версий — старшие → `docs/archive/RELEASES_YYYY_QN.md`.
> Схема версий: M-A.x = patches v0.6.x, M-B = v0.7.0, M-C = v0.8.0, ..., M-I = v1.4.0. Документационные milestones (kickoff'ы) без version bump. Patches между формальными milestones (post-acceptance polish между M-A.3 и M-B finale) допускаются как v0.6.x continuation.

---

## v0.6.4 — M-B.2 Importer Rework + post-acceptance polish (02.05.2026)

**Коммиты на ветке `feature/racetrack-canvas`:** M-B.2 K1..K6 (`f2554fd` → `c36d7bc`) + catalog-scroll-anchor (`8e9debe`) + Library wipe + TagsEditor (`3281779`) + StartScreen Library link (`18e86ce`, `a547f26`) + palette A+v2 + shade + canonical-key (`23bf484`, `7146af9`) + DESIGN_SYSTEM §2.1 (`03e3c11`) + StartScreen UX (`20508d5`) + Importer Critical (`219c2d7`) + Importer High (`98172f7`) + Polish round 2 (`c1f66ed`).
**Тесты:** Vitest 891 / 891 (от v0.6.3 baseline 834: +57 нетто — добавлены M-B.2 unit + integration suites, palette canonical-key matrix, tags-editor, lazy-tabs guard, multi-inspector; удалены legacy step2-combined.test + simple-import.test). pytest 112 / 112 (backend untouched).
**Build:** clean, ~570 KB / gzip ~172 KB (от M-A.3 baseline 120.49 KB +51 KB carries весь M-B.1 K6 + M-B.2 surface).

**Скоуп — M-B.2 Importer Rework (K1..K6).** Single-screen 4-column layout (CatalogColumn 320 / Inspector flex / MetaColumn 200 / footer) заменил Step1→Step2 двухэкранный flow из M-B.1. Inspector с TabBar: Обзор (eager, lightweight) / Последовательность / Аннотации / История (conditional). SequenceTab + AnnotationsTab — React conditional render → lazy mount → V49 50-сек hang fixed. CatalogColumn 4 sources («Этот проект» / «Учебные» / «Моя библиотека» sub-grouped by tags / «Каталог SnapGene» lazy-fetch) + sticky search с length-pattern + drop zone + paste textarea. MultiInspector table с tristate master. Inline TagsEditor пишет в `perFileEdits.editedTags` → Confirm flow промотит в LibraryEntry.

**Скоуп — post-acceptance polish (3 round'а Игоря).** **Round 1 (Critical):** AppShell `min-height:100vh` → `height:100vh` + overflow:hidden чтобы footer с primary actions не уезжал за viewport · `addCatalogItem` пробрасывает `_fromFileCount` (MetaColumn перестал показывать 0 для catalog items) · EmptyInspector context-aware (target=library + libraryEmpty → 📚 onboarding) · Cancel × → ‹ Назад в left header. **Round 2 (visual + simple-mode rip):** simple/advanced toggle убран целиком — всегда advanced; «не делать аннотацию» surfaces как autoAnnotate checkbox в overflow-menu · uppercase labels (СЕЛЕКЦИЯ / ПРОМОТОРЫ / etc.) перекрашены text-tertiary → text-secondary, weight 500 → 600 · межгенные участки label-stacked monospace вместо italic-tertiary · SequenceMapView `readOnly` prop drops 120 px primer reservation, +20% chars per line · AnnotationsTab `compact=false hideBar=false` → нормальные rows + linear feature-bar v0.5-style. **Round 3 (palette):** A+v2 approved over `docs/design_assets/feature-palette-comparison.html` mockup — 4 base hex changed (CDS/promoter/resistance/reporter), warm-sepia stroke сохранён · `featureColorShaded(type, name)` HSL ±10% L / ±6° H shade keyed by `canonicalFeatureKey(name)` (30+ entries; AmpR ≡ ApR ≡ bla → одинаковый shade) · DESIGN_SYSTEM §2.1 обновлён.

**Скоуп — Library fullscreen wipe.** `components/Library/` (4 файла + test) удалён. Function (browse saved containers) переехала в Importer CatalogColumn → «Моя библиотека». Tag-editing — только при импорте через TagsEditor. Soft-delete deferred to M-D Container Window. `librarySlice` data layer kept untouched. StartScreen `Library` SidebarLink → opens Importer with target=library + full catalog visible.

**Скоуп — StartScreen UX fixes.** Recent card layout `flex 1.1/0.9` → grid `[1fr 280px]` (~600px пустоты убрано) · ▷ chevron удалён · × delete hover-only · description colour primary opacity 0.85 (was tertiary, near-illegible на dark) · sidebar Browse links gap 2→4 + amber border-left accent on hover · Topbar Guide / Settings ghost-button styling · sidebar/header padding-left aligned at 20.

**v0.6.4 ↔ v0.7.0 contract.** Все M-B.2 фиксы накатываются как patch поверх M-A.3 (incremental). Formal v0.7.0 release block будет создан Chat'ом при финальной M-B.2 acceptance + bump до v0.7.0 (CLAUDE.md схема). До тех пор v0.6.4 — рабочий snapshot для visual review.

**Закрытые TD:** TD-V49-IMPORTER-HANG (lazy-tabs guard в `lazy-tabs.test.jsx::default-overview-no-annotation-editor`).
**Открытые TD:** TD-IMPORTSTARTSCREEN-V05-DELETE (v0.5 `components/ImportStartScreen/` — dead, удалить отдельным cleanup) · TD-MOLECULEWORKSPACE-M-D (компонент keep для Container Window) · TD-LIBRARY-CRUD-M-D (soft-delete + tag-edit existing entries — M-D scope).
**DEC-блок:** DEC-IMP-13..18 (single-screen / catalog 4-source / lazy tabs / edit через perFileEdits / SessionSummary footer / MoleculeWorkspace keep) + новые decision'ы по A+v2 палитре (ждёт DEC-DS-NN от Chat'а в финализирующей сессии) — добавятся в `ANCHORS.md` / `DECISIONS.md` Chat'ом при финальной приёмке.

---

## v0.6.3 — M-A.3 Library minimal CRUD + версионирование в коде (01.05.2026)

**Коммиты:** `5fcceea` → `41b394d` → `038986d` → `c568f61` → `525cac6` → `1167bba` (6 спринт-коммитов M-A.3 + 1 параллельный Chat-task fix StartScreen) + `<TBD>` (Type C версионирование v0.6.3 — package.json bump + `lib/version.js` + StartScreen footer + 1 unit-тест) · ветка `feature/racetrack-canvas`.
**Тесты:** 901 (789 Vitest + 112 pytest). Дельта от v0.6.2: +24 Vitest (M-A.3) + 1 Vitest (версионирование). _Если итоговый счётчик из K5 verify отличается — поправь это число одной правкой._
**Build:** clean, 0 warnings, bundle 384.51 KB / gzip 120.49 KB (M-A.3 baseline; версионирование bundle-нейтральное).

**Скоуп M-A.3.** Library fullscreen: list view + tabs Containers/Primers + topology filter + tags chips inline editable + soft-delete с undo. Schema v2 расширена table `library` с indexes `id, kind, addedAt, [kind+addedAt], *tags`. Reuse v0.5 паттернов: soft-delete (DEC-MA1-02), tag suggestions (DEC-MA-04), bilingual STRINGS (DEC-MA2-01). 8 отклонений Code от спеки (все приняты). Параллельный Chat-task: `↓ Import sequence` placeholder убран из StartScreen (DEC-IMP-03 follow-up).

**Скоуп версионирования (Type C, после M-A.3 приёмки).** `gui/designer/package.json` версия `0.0.0` → `0.6.3` (K1). Новый файл `gui/designer/src/lib/version.js` — single source of truth (`APP_VERSION = '0.6.3'`, K2). Footer в `StartScreen/index.jsx`: импорт `APP_VERSION`, отображение строки `BodgeGene v{APP_VERSION}` в нижней части sidebar — Code обернул его вместе с существующей PWA-install кнопкой в общий flex-контейнер с `marginTop: auto`, `data-testid="ss-version-footer"`, `fontSize: 11` / `var(--ss-text-tertiary)` (K3). Тест добавлен в `components/__tests__/StartScreen.test.jsx` (где уже живут другие StartScreen-тесты), ассерт по импортированному `APP_VERSION` — не ломается при следующем bump (K4). 2 отклонения Code от спеки: (a) тест положил рядом с другими component-тестами, не в новый `StartScreen/__tests__/` подкаталог; (b) Code обернул PWA-install в общий контейнер с footer вместо отдельных контейнеров — оба отклонения структурно чище и приняты на визуальной приёмке.

**Якорь схемы версий.** M-A.x = patches v0.6.x (M-A=v0.6.0, M-A.1=v0.6.1, M-A.2=v0.6.2, **M-A.3=v0.6.3**). Далее M-B=v0.7.0, M-C=v0.8.0, ..., M-I=v1.4.0. Документационные milestones (kickoff'ы, реструктуризация документации) — без bump. Закреплено в шапке этого файла + `lib/version.js` комментарии + `CLAUDE.md` правило 5.

**Закрытые TD:** —  
**Открытые TD:** TD-LIBRARY-CLEANUP-PENDING-DELETES · TD-LIBRARY-PERSISTED-TAG-DB · TD-LIBRARY-SEARCH-SORT-BULK (все 3 кандидаты M-H).
**DEC-блок:** ⚓ DEC-LIB-10 (фиксация «teги только на LibraryEntry», supersedes филд `MoleculeContainer.tagIds: UUID[]` из ARCHITECTURE_v2 v1.1). ARCHITECTURE_v2.md v1.1 → v1.2.

**Отложенная приёмка.** Группы D/E/F/H (list-rows / soft-delete / tags inline / persistence reload) требуют entries в Library — в release-сборке Library стартует пустым. 10 unit-тестов в `Library.test.jsx` покрывают функционал. Визуальная приёмка этих групп — после v0.7.0 (M-B.1 Importer наполнит Library реальным импортом).

---

## v0.6.2 — M-A.2 i18n-prep (01.05.2026)

**Коммиты:** `5f536a0` → `cc98e63` → `1a876d0` → `3ee3427` + K5 HEAD (5 спринт-коммитов Code + 5 Chat-direct strings post-приёмки).
**Тесты:** 764 (652 Vitest + 112 pytest). Дельта от v0.6.1: 0 новых — только assertions обновлены в 4 правках `StartScreen.test.jsx` на STRINGS namespace.
**Build:** clean, 25807 KiB precache, 34 entries.

**Скоуп.** UI strings вынесены в централизованный `gui/designer/src/lib/strings.js` (6.6 KB) — plain JS namespace dictionary, named export `STRINGS`. 11 namespaces (`startScreen` / `topbar` / `projectInfo` / `settings` / `toast` / `pwa` / `multiTabLock` / `hotkeys` / `placeholder` / `app` / `common`). ~15 компонентов + 5 lib-модулей + 2 store slice переведены. backend `src/pvcs/` чист (никаких russian литералов). 4 отклонения Code от спеки (все приняты).

**Закрытые TD:** —  
**Открытые TD:** —
**DEC-блок:** ⚓ DEC-MA2-01 (bilingual policy — public code english, coordination docs russian); DEC-MA2-02 (3 strings правки + 3 правила перевода для M-B+, sprint-level).

---

## v0.6.1 — M-A.1 Polish (01.05.2026)

**Коммиты:** `9ffdf2d` → `ca20869` → `39af2b4` → `facd425` → `aac0b53` (5 коммитов K1–K5).
**Тесты:** 764 (652 Vitest + 112 pytest). Дельта от v0.6.0: +25 Vitest.
**Build:** clean, PWA precache 34 entries 25.78 MiB, bundle 368.84 KB / gzip 116.99 KB, CSS 64.86 KB / gzip 12.28 KB.

**Скоуп.** 6 TD-entries накопленных при финализации v0.6.0 закрыты: K1 modal guard в `runHotkeyResolver`, K2 tag suggestions tests, K3 runtime UI tests, K4 PWA setup (`vite-plugin-pwa@1.2.0`, `manifest.webmanifest`, 3 финальных иконки Hybrid B отрендерены из `docs/branding/logo.svg` через sharp), K5 Notion-style Toast queue (`components/Toast/` 4 файла + 8 тестов) + soft-delete pattern (`_pendingDelete` flag на project entity). 18/18 визуальных критериев PASS, 1-pass. 6 отклонений Code от спеки (все приняты).

**Закрытые TD:** TD-HOTKEY-MODAL-GUARD · TD-PROJECTINFO-SUGGESTIONS-NOTESTS · TD-EXPORT-DELETE-NOTESTS · TD-CMD-W-VIVALDI-LIMITATION · TD-PWA-SETUP-DEFERRED · TD-TOAST-UI-MINIMAL.  
**Открытые TD:** TD-CTRL-N-OS-FALLBACK (low priority known: в standalone PWA Ctrl+N с открытым modal → guard блокирует handler, Chrome открывает новое browser-окно как OS-fallback).
**DEC-блок:** DEC-MA1-01..04 (sprint-level): Notion-style Toast queue / soft-delete pattern / auto-dismiss timer в useEffect / `_pendingDelete` на entity.

---

## v0.6.0 — M-A core + finalization trifecta (30.04.2026)

**Коммиты:** Основные K1–K11: `b1b13b9` → `5b30e81` → `82ee848` → `4213465` → `bb8c77f` → `77c339a` → `ce4fb47` → `aa4f188` → `c08cf22` → `b33c441`. K4 retrofit: `441b53b` + `baa01c8`. M-A-fix-2: `fedbeed`. Плюс несколько Chat-direct правок (theme toggle вынос, Guide stub, back button, runtime UI, tag suggestions). **Total ~17 коммитов.**
**Тесты:** 739 · 851 (627 Vitest + 112 pytest). Базелайн до M-A был 1031 (v0.5.4-alpha) — в v0.6.0 wipe удалил 305 v0.5 тестов, добавил 95 новых v0.6.
**Build:** clean.

**Скоуп.** Первый milestone v0.6 rewrite. **Wipe всех v0.5 данных** (DEC-V2-08, ARCHITECTURE_v2 §0). M-A core (10 K-шагов): IndexedDB schema v1 (Dexie · `projects` table), store rewrite, `lib/file-system.js` helpers, App+AppShell+Topbar skeleton, StartScreen Variant B v7 wireframe (split panel 220px sidebar + Recent column), заглушки (Settings/Library/Primer pool/All projects/Group projects), lifecycle (createProject / openProject / closeProject), `.bodge` round-trip (File System Access API + fflate ZIP, fallback `<a download>`), multi-tab guard (`navigator.locks`), CSS + v0.5 wipe. K4 retrofit: `lib/hotkeys.js` 7.62 KB — hotkey registry 7 entries (`new-project`/`open-bodge`/`save-bodge`/`close-project`/`open-settings`/`escape`/`project-info`), single global keydown listener через `runHotkeyResolver`. M-A-fix-2: `ProjectInfoModal` (auto-open после createProject) + 7-й хоткей ⌘I + reducer `updateDescription` + кнопка ✏️ в Topbar.

**Закрытые TD:** — (v0.6 rewrite, baseline)  
**Открытые TD:** TD-HOTKEY-MODAL-GUARD · TD-PROJECTINFO-SUGGESTIONS-NOTESTS · TD-EXPORT-DELETE-NOTESTS · TD-CMD-W-VIVALDI-LIMITATION · TD-PWA-SETUP-DEFERRED · TD-TOAST-UI-MINIMAL (все 6 кандидаты v0.6.1).
**DEC-блок:** DEC-MA-01..04 (sprint-level): theme toggle в углу header (не Settings) / ProjectInfoModal central UI / auto-open after createProject / tag suggestions sort by frequency. Все anchor-уровневые решения уже в DEC-V2-01..30 + DEC-DS-01.

**Post-mortem.** Цикл имел 2 fix-итерации (M-A-fix-1 UX руками Игоря + M-A-fix-2 ProjectInfoModal). Root causes: theme toggle в Settings (не в углу header) и базовое редактирование name/tags out of M-A scope — оба от недостаточной эмпатии к workflow биолога в формулировке спеки. Вывод: добавить §2 playbook'а 4-й sanity вопрос «как биолог попадёт в эту функцию?» (deferred).

---

## Документационные milestones (без version bump)

**M-B Kickoff формализация (01.05.2026, между v0.6.2 и v0.6.3).** Library re-definition (личная коллекция контейнеров и праймеров, **НЕ** 3-tier ownership) + Importer scope (3 источника file/paste/cross-project, 2 контекста in-project + into-library). 15 ⚓ решений: DEC-LIB-01..09 + DEC-IMP-01..05 + DEC-REUSE-01. ARCHITECTURE_v2.md обновлён в 8 секциях (v1.0 → v1.1) одним атомарным edit_file с 12 hunks. Исходные записки `M_B_KICKOFF_NOTES.md` (7 KB) в archive/.

---

## Предыдущие версии (перед v0.6 rewrite)

**v0.5.4-alpha (28.04.2026)** — feature-complete: ~290 коммитов, 1126 тестов (1014 Vitest + 112 pytest). Sprint Catalog Polish FIX-2 финал. История в `docs/archive/SESSIONS_2026_Q2.md` (цикл ImportStartScreen + App-Decomp + IS-Final). v0.5 baseline полностью wiped при переходе на v0.6.0 (DEC-V2-08).
