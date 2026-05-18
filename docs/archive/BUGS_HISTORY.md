# BUGS_HISTORY.md — архив закрытых багов BodgeGene

Файл наполняется при финализации каждого нового спринта: Chat переносит сюда FIXED-записи из корневого `BUGS.md`, которые старше **предыдущего** спринта (т.е. оставляет в активном `BUGS.md` только OPEN + FIXED текущего спринта + FIXED предыдущего).

Правило от `CHAT_PLAYBOOK.md §4`.

---

## Оглавление по спринтам

_(наполняется при первой ротации)_

- Sprint M-B.2 + Parser-Unification — 02–03.05.2026 — «Lazy-mount табов Importer + 0-based exclusive end в pvcs parser» (закрыты V50 / V49)
- Sprint X cycle — 26.04.2026 — «Plasmid-Git data model + corrected undo timing» (закрыты V22 / V24 / V27)
- Sprint 1.7 — 22.04.2026 — «Unified Editor + Virtual Full Sequence + Topology»
- Sprint Map-WS-1 cycle — 21.04.2026 — «PlasmidWorkspace + sync cursor + feature palette»
- Sprint 1.6 — 21.04.2026 — «Мутагенез UX v2.1»
- Sprint 1 — 19–20.04.2026 — «Читаемые метки, чистые стыки, настоящий мутагенез»
- MUTWIZ-SANITIZE — 20.04.2026
- Этап 1.2 — 18.04.2026 — TYPE_MAP пересмотр
- Этап 1.1 — 18.04.2026 — Центральный sanitizeSequence
- Блок 11b — 03.04.2026 — Root cause fixes (P1v2, P3b)
- Блок 11 — 03.04.2026 — Bugfix P1–P5
- Блок 10 / 10b / 10c / 10d — 03.04.2026 — Circular Map + Visual Bugfix
- Блок 9 — 03.04.2026 — First-time User Flow
- Блок 8 — 03.04.2026 — HIGH фиксы + SnapGene каталог
- Блок 7 — 03.04.2026 — SYSTEM_AUDIT CRIT фиксы
- Блок 6 — 03.04.2026 — UX Polish
- Блок 5 — 03.04.2026 — Quick Start + Smart Import
- Блок 4b — 03.04.2026 — Restriction Cloning → Canvas
- BUG-01..83 — Сессии 22–28 (до 28.03.2026)

---

## Содержимое

### 26.04.2026 — Sprint X cycle (Plasmid-Git): закрытие V22 / V24 / V27 + corrected undo timing

Цикл из 4 спринтов (Sprint X / X-fix / X-fix-2 / X-fix-3) финализирован единым событием после визуальной приёмки 26.04.2026 на EGFP (196 bp): 5 сценариев PASS (multi-mutation undo/redo, editor persistence, footer buttons, single-mutation regression, race-test rapid keystrokes <300ms). Архитектурный сдвиг: data-модель `fragment.mutations[]` (мутации поверх applied sequence) заменена на Plasmid-Git (`baseSnapshot` + `commits[]` + `HEAD` + replay). Undo/redo переписан с поправкой debounce timing бага.

- [x] **V22 HIGHLIGHT-INDEL-TAIL → закрыт через Plasmid-Git replay.** Корень V22 (positional diff `parent.sequence.slice(templateStart, ...)` vs `fragment.sequence` ломается на indel'ах в sub-фрагменте — даёт ложный красный хвост до конца) устранён архитектурно: в Git-модели `fragment.commits[]` хранит mutation-объекты с `op` и абсолютными координатами относительно `baseSnapshot`. Highlights считаются по списку commits, не через positional diff applied vs parent. Indel-aware classification получается естественно из replay-цепочки. Sprint X K3–K4 (commit `16c58c5` baseline Sprint X / X-fix объединён) + Sprint X-fix-2 (commits `0f8211b`, `1bd69f4`).

- [x] **V24 SINGLE-CIRCULAR-NO-PRIMERS → закрыт extension в Sprint X-fix K5.** `local-primer-design.js::designPrimersLocal` при `fragments.length === 1 && circular` теперь генерирует пару праймеров для self-closure (binding + tail из `rc(seq.slice(-half))` для fwd, binding + tail из `seq.slice(0, half)` для rev). Контракт K12 Sprint 1.7 (single-circular = self-closure через overhang-tails, +30 bp в PCR) теперь физически собирается: биолог получает реальные oligos для синтеза при «Заказе олигов». Sprint X-fix K5 (commit в составе `16c58c5` baseline).

- [x] **V27 MUTATION-DELETE-NO-REVERT → закрыт через Plasmid-Git revert/applied-toggle.** Кнопка ✕ в Mutations panel `EditorPanels.jsx` теперь оперирует над `fragment.commits[]` корректно: каждый commit имеет `applied: true|false`, ✕ переключает флаг + replay на baseline пересчитывает sequence/Tm/GC%. Coordinate-remap проблема (которая раньше делала вариант (B) непригодным) снимается тем, что commits хранят координаты в координатах `baseSnapshot`, не в координатах applied-state. Sprint X K3–K6 + Sprint X-fix workflow rewire.

**Sprint X-fix-3 — pushUndo timing fix (commit `4292506`).** Баг pre-existing с момента введения debounced `pushUndo`: snapshot снимался **внутри setTimeout** (через 300мс после вызова) → захватывал post-apply state, undo не возвращал к baseline. Не проявлялся на одиночных user-actions (паузы между кликами >300мс), но Sprint X-fix-2 ввёл `applyMutationsBatch` (5 мутаций за один тик) — первый сценарий, где pushUndo + set + setTimeout-fire упаковались в окно <300мс, баг проявился. Fix: `_pendingSnapshot` module-level let — первый pushUndo в окне захватывает `shallowSnapshot(get())` синхронно до любого `set()`, последующие в окне продлевают timer но не перезаписывают snapshot. По срабатыванию timeout snapshot уходит в `_undoStack`. Race-сценарий «apply → Ctrl+Z <300мс → новый apply» закрыт обязательной очисткой `_pendingSnapshot` + `_pushTimeout` в `undo()` / `redo()`. Семантика debounce 300мс для merge серии быстрых действий в один Ctrl+Z step сохранена.

**Тесты:** 774 → 846 Vitest (+72 за весь цикл: +70 Sprint X / X-fix / X-fix-2 + 2 Sprint X-fix-3). pytest 112/112. vite build clean.

**Размеры (новые / изменённые):**
- `lib/plasmid-git-reducers.js`: новый, 5.02 KB.
- `store/index.js`: 10.70 → 12.06 KB (+1.36 KB; pushUndo + undo/redo очистка + комментарии).
- `components/FragmentEditor/index.jsx`: 39.55 → 39.32 KB (small refactor handleSaveMutagenesis).
- `store/__tests__/undo-batch.test.js`: новый, 3.77 KB.
- `store/__tests__/fragmentSlice-git.test.js`: новый.

**Приёмочный отчёт автоматизированной Cowork-сессии (Claude in Chrome):**
- K-fix2-1: 3 мутации (V2A/K4A/E6A) на EGFP → Apply → Ctrl+Z вернул GC% 67.9% → 65.8% (baseline), Mutations panel очищен → Ctrl+Y восстановил GC% и мутации. **PASS.**
- K-fix2-2: editor открыт после Apply / Ctrl+Z / Ctrl+Y / «Сохранить как запчасть». **PASS.**
- K-fix2-3: footer без «🔀 Как вариант», есть «Создать сборку (3)» / «Сохранить как запчасть» / «Отмена». **PASS.**
- SC-4 (single mutation): V2A → Apply → Ctrl+Z → GC% 66.3% → 65.8%. **PASS.**
- SC-5 (race-test): apply → Ctrl+Z (0мс) → Ctrl+Y (100мс) → Ctrl+Z (200мс) → Ctrl+Y финальная проверка. Все откаты корректные, redo stack intact. **PASS.**

### Новые находки приёмки 26.04.2026 (→ OPEN):
- **V32** (Низкий) — «Legacy-мутации: revert недоступен» warning misleading до Apply (текстовая правка UX).
- **V33** (Средний) — «Создать сборку (N)» активна с pending (не applied) мутациями; UX-вопрос что собирается (pre-apply или post-apply state).

**Архитектурный итог цикла Sprint X:** один из крупнейших архитектурных сдвигов проекта со времён Zustand-миграции (28.03.2026). Plasmid-Git data model открывает дорогу для «коммитов» как первоклассной сущности UX (Sprint X+1: panel истории мутаций с точкой возврата на любой commit, branching). Новый ⚓ DECISIONS «pushUndo synchronous capture» закрывает класс багов debounced-side-effect-функций для всего проекта.

---

### 22.04.2026 — Sprint 1.7: Unified Editor + Virtual Full Sequence + Topology (full visual acceptance)

Sprint 1.7 закрыт по всем 4 блокам после визуальной приёмки на HygroR (1023 bp): 5 substitution (G26A, R135A, G77C, C403G, G404C) + deletion regression. K9/K10/K11/K12 приняты. 700 → 738 Vitest (+38), pytest 112. 4 новых UX/алгоритмических гэпа (V18/V19/V20/V21) зафиксированы сепаратно для Sprint 2+/Sprint 3.

- [x] **K9 V15+V16 FIX (commit `1cffe1b`):** в `FragmentEditor.jsx` `isMutated` переведён на численное сравнение `codonStart`/`position` вместо substring-match по `label` (фикс V15); `computeMutationHighlights` учитывает `fragment.templateStart` и сравнивает `parent.sequence.slice(templateStart, templateStart+length)` с `fragment.sequence` (фикс V16). Приёмка: на HygroR_2/HygroR_5 (sub'ы с templateStart > 0) подсвечены только реальные позиции мутаций; AA 3/5/6 больше не подсвечиваются от substring-match с 135/403/26. Deletion тоже корректно — mapping не съезжает после indel. _Примечание 23.04.2026: deep code analysis обнаружил V22 — indel в sub-фрагменте даёт ложный красный хвост до конца (V16 fix закрыл только equal-length substitutions). V22 закрыт через Plasmid-Git replay в Sprint X (26.04.2026)._
- [x] **K10 UNIFIED EDITOR (commit `853535f`):** tabs «Последовательность/Белок» удалены. Layout: mode switcher (Правка/Мутагенез) → sequence primary (DNA + AA под каждым codon) → 3 collapsible panel (Annotations, Mutations, Protein). AA-клики mode-dependent: default cursor в Правке, mut menu в Мутагенезе. Sequence footer: mode-specific hint. Отклонение от спеки: баннер «Режим просмотра» удалён целиком, заменён mode-specific подсказкой в footer — функционально эквивалентно. _Примечание 23.04.2026: Sprint 2a.1 acceptance обнаружила V27 — кнопка ✕ в Mutations panel не откатывает sequence (pre-existing с K10). V27 закрыт в Sprint X (26.04.2026)._
- [x] **K11 VIRTUAL FULL SEQUENCE (commit `b2e21ed`):** toggle «Фрагмент N bp / Полный ген M bp» в header Editor для split-group sub-фрагментов. Full-view: sequence read-only + баннер «Виртуальный вид» + highlightRegion на текущий sub (templateStart..+length) + notice в annotations «В полном обзоре аннотации недоступны». Мутации в координатах parent по всей группе. Добавлен `data-testid="fragment-editor-full-view"` для integration-тестов.
- [x] **K12 TOPOLOGY + V17 FIX (commit `2c6d735`):** `fragment.topology` как persisted поле (linear|circular). Header Editor: toggle 📏 Линейная / ⭕ Кольцевая; PartBlock context menu: «Сделать линейной/кольцевой». Single-linear больше не рендерит decorative 30-bp junction справа (фикс V17). Single-circular: self-closure через overhang-tails, +30 bp в PCR, arc-indicator «⟲ замыкание» под фрагментом. Split-группа → все sub'ы topology='linear'. `expectedJunctionCount` = 0 для single-circular (self-closure без отдельного junction-объекта отложен до v1.1). _Примечание 23.04.2026: deep code analysis обнаружил V24 — primers для self-closure не собираются в `local-primer-design.js` (early-return при `fragments.length < 2`); +30 bp в PCR — только display-calculation. V24 закрыт extension в Sprint X-fix K5 (26.04.2026)._

#### Новые находки Sprint 1.7 (зафиксированы в OPEN на момент закрытия):
- **V18** — full-view DNA и Protein overview разорваны, нет AA под кодоном.
- **V19** — кнопка «Редакт. кодоны»: непонятный UX, нет bulk-delete, нет явного codon-usage table.
- **V20** — split плодит микро-PCR 30–60 bp при близких мутациях.
- **V21** — single-circular arc-indicator не считывается визуально.

#### Новые находки deep code analysis 23.04.2026 (зафиксированы в OPEN на момент закрытия):
- **V22** (Высокий) — indel в sub-фрагменте даёт ложный красный хвост до конца. **Закрыт Sprint X cycle 26.04.2026.**
- **V23** (Средний) — `ORTHOGONAL_OVERHANGS_4` содержит 6 палиндромов + 5 RC-пар, эффективный пул ~21 вместо 32.
- **V24** (Высокий) — single-circular self-closure не генерирует primers. **Закрыт Sprint X-fix K5 26.04.2026.**

#### Новые находки visual acceptance Sprint 2a.1 (23.04.2026):
- **V27** (Высокий) — кнопка ✕ в Mutations panel убирает мутацию из списка, но не откатывает sequence. Pre-existing с K10. **Закрыт Sprint X cycle 26.04.2026.**

---

### 21.04.2026 — Sprint Map-WS-1 cycle (Skeleton + fix + fix-B): полная визуальная приёмка

Три последовательных спринта на multi-pane Map view DesignCanvas + sequence-pane с synced cursor. Первый спринт Map-WS-1 (Skeleton, commits `e59c44e`..`ea1427a`) — приёмка на «Сборка 5» дала FAIL на D1/D2/D3. Map-WS-1-fix (K1–K3, commits `994ed79`..`a7cbbee`) — приёмка на «Сборка 7» (whole-plasmid catalog import) дала D2 PASS, D1/D3 FAIL + новая находка LABEL-читаемость на pastel. Map-WS-1-fix-B (K4.1–K4.5, commits `27cc518`..`5ac282a`) — полная визуальная приёмка на «Сборка 7» PASS.

- [x] **Map-WS-1 K1–K4 (Skeleton):** новый `PlasmidWorkspace` vertical split (PlasmidMap + SequencePane read-only) с resizable splitter (persist в localStorage `plasmid-workspace-bottom-h`), `selectedRegionId` state как синхронизированный cursor, `buildPlasmidSequence(fragments)` helper. DesignCanvas Map view branch заменён на `<PlasmidWorkspace>`. 738 → 756 Vitest (+18 синхронизация/helper/render), pytest 112, build clean.
- [x] **Map-WS-1-fix K1–K3 (D2 PASS, D1/D3 FAIL):** новый `feature-palette.js` (15 семейств + misc + `FEATURE_STROKE` warm-dark-brown `#3A2F1F` + normalizer `featureColor(type, name?)` с CDS→resistance/reporter/his/tag/linker refine, GenBank-aliases); `PlasmidMap` получил controlled `selectedRegionId` + `onSelectRegion` callback, `id`/`ftype` в `rawSubs`, highlight-branch с drop-shadow, `data-testid="sub-arc-<id>"`. `SequencePane` перешёл на `featureColor` + `min-w-full` на content-div. `PlasmidWorkspace` перестроил mapping idx→regionId через `regionsByFragment` + fallback `onMapFragmentFallback` (первый region фрагмента). 756 → 768 Vitest (+12).
- [x] **Map-WS-1-fix-B K4.1 (commit `27cc518`):** `annotation-model.js::getRegions` backfillит deterministic `id = region:${start}:${end}:${type}:${name}` для annotations без id (catalog whole-plasmid import через визард). Закрывает D1 root cause — до fix-B `sub.id = undefined` ломал и forward sync (через fragment-index fallback на первый region фрагмента), и back-sync (`setSelectedRegionId(undefined)` → `isRegSel` всегда false). Id детерминированный, stable между рендерами, существующий dedup в PlasmidMap по `start-end-type` остаётся корректным. +4 Vitest.
- [x] **Map-WS-1-fix-B K4.2 (commit `53247ac`):** defensive guard в `SequencePane.handleNucleotideClick` — `region.id != null` перед `onSelectRegion`. После K4.1 через normal render-path сюда не дотянуться, но страховка от будущих регрессий источника аннотаций. +1 Vitest (end-to-end: annotations без id → click → onSelectRegion вызван со строкой backfilled-id, не с undefined).
- [x] **Map-WS-1-fix-B K4.3 (commit `b9f59f8`):** `PlasmidWorkspace.regionsByFragment` через `getRegions(rawAnns)` вместо рукописного filter. После K4.1 это автоматически даёт fallback id для fallback-пути `onMapFragmentFallback`, `frs[0].id` всегда валиден. Regression-тесты `plasmid-workspace.test.jsx` PASS без правок.
- [x] **Map-WS-1-fix-B K4.4 (commit `e14994c`):** labels и directional markers на карте `fill: '#fff'` → `fill: FEATURE_STROKE` в трёх точках (sub-arc textPath ~327, direction arrow polygon ~353 с opacity 0.5→0.6, feature arc textPath ~491). `textShadow` убран полностью (по open question §14.3 fix-B spec — pastel + warm-dark контрастен, shadow только мутит). Hover tooltip text, center construct name, primer labels, RE labels, junction hover label — не тронуты (они на тёмных rect-фонах / на белом фоне карты, уже читаемы).
- [x] **Map-WS-1-fix-B K4.5 (commit `5ac282a`):** responsive `charsPerLine` в SequencePane через `ResizeObserver` на containerRef — clamp `[60, 120]` кратно 10 (GenBank-habit-compat). `CHAR_PX = 7.3` (`JetBrains Mono 11px`), `useState(80)` дефолт. `min-w-full` из K3 убран (responsive делает его ненужным). ResizeObserver mock в локальном `beforeEach` тестов; runtime `typeof ResizeObserver === 'undefined'` fallback. +2 Vitest (1 удалён старый `min-w-full` snapshot).

Итого: 768 → **774 Vitest** (+6), pytest 112, build clean (pre-existing warnings INEFFECTIVE_DYNAMIC_IMPORT auto-annotate.js + chunk >500 KB оставлены). Size budget: OK (PlasmidMap 34.30→35.12 / SequencePane 11.81→12.81 / PlasmidWorkspace 5.48→6.31 / annotation-model 2.47→2.78 — все далеко от hard 40/25 KB).

#### Новые находки Map-WS-1-fix-B visual acceptance (зафиксированы в OPEN на момент закрытия):
- **V28** — SequencePane region-фон не читается как интерактив, нужен cursor: pointer + hover-state.
- **V29** — PlasmidMap hover-scale затрагивает всю группу арок вместо hovered (pre-existing, не регрессия).
- **V30** — выносные подписи для микро-регионов (<2–3% окружности), leader-lines наружу кольца.
- **V31** — PlasmidMap масштабируется при resize окна (подозрение на регрессию Map-WS-1 Skeleton K4 — убранный `items-center justify-center` wrapper).

---

### 21.04.2026 — Sprint 1.6: Мутагенез UX v2.1 (partial visual acceptance)

Sprint 1.6 закрыт как **partial** — 4 коммита реализованы и технически зелёные (700 Vitest), но визуальная приёмка выявила 3 новые проблемы (V15/V16/V17) + архитектурный запрос на Unified Editor → Sprint 1.7. Все три закрыты в Sprint 1.7 K9–K12 (22.04.2026).

- [x] **K5 PROTEIN-READONLY-IN-EDIT (commit `c899f6e`):** В `FragmentEditor.jsx` tab «Белок» в `mode='edit'` теперь read-only: синяя info-полоса «Режим просмотра» + кнопка «→ Мутагенез» (вызывает `switchMode('mutagenesis')`). AA-span получает `cursor: default` и `onClick=undefined`. Подсказка «Клик по аминокислоте → мутагенез» показывается только в `mode='mutagenesis'`. `openMutMenu` сохраняет early-return guard как defence-in-depth. Биологическое обоснование: bookkeeping-правка белка невозможна без кодона. +4 integration-теста.
- [x] **K6 SPLIT-ANNOTATIONS-BIOLOGY (commit `acbf515`):** Новый `lib/split-annotations.js::trimAnnotationsForSubFragment(parentAnns, sf)` заменяет coordinate-only map+filter в `handleSaveFragment`. Правила: signal_peptide/transit_peptide/propeptide — drop на partial overlap (N-terminal); start_codon/stop_codon — только на правильной границе; restriction_site/primer_bind/mutation/variation/modified_base — drop на trim; CDS/gene — rename с (5' trimmed) / (3' trimmed) / (trimmed) суффиксом; остальное — trim + flag. Идемпотентно (не удваивает «trimmed»). +21 unit-тест.
- [x] **K7 SPLIT-GROUP-CANVAS (commit `d110272`):** Split-фрагменты (two/multi_fragment mutagenesis) получают общий `splitGroupId` + `splitGroupParentName` + `splitGroupIndex` + `splitGroupTotal` на уровне данных. `handleSaveFragment` и `handleMutagenesis` (non-KLD) ставят эти поля. `DesignCanvas` группирует consecutive same-groupId в `.split-group-container` с 4 визуальными эффектами: пунктирная фиолетовая рамка, тонированный фон, badge «🧬 parent (split: N частей)», соединительная линия. Internal junctions внутри группы, external — снаружи. KLD не затронут (single fragment). +4 component-теста.
- [x] **K8 MUTATION-HIGHLIGHTS (commit `b2ac6ec`):** `computeMutationHighlights(fragment, parent)` экспортирован из `FragmentEditor.jsx`. Primary — `sequenceDiff` против parent-part (через `fragment.parentId`), возвращает `Map<ntPos, 'silent'|'nonsilent'>`. Fallback — `fragment.mutations` list (conservatively nonsilent). DNA view подсвечивает per-nt (red/yellow + borderBottom + tooltip), protein view per-codon (любой nonsilent nt в codon → весь AA red). +8 unit-тестов. **Ограничение** (не учитывался `templateStart > 0`) закрыто в Sprint 1.7 K9 (V16).

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

#### Покрытие Sprint 1
Vitest: 604 → **634** (+30), pytest: 112 ✅, build: clean на каждом из 7 коммитов.

#### Визуальная приёмка Sprint 1 (20.04.2026)
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

#### Известные ограничения Этапа 1.2 (TODO v1.1)

- **Legacy-annotations с типом `catalytic`:** плазмиды в store из прошлых сессий могут содержать аннотации с типом `catalytic` (маппинг из `mat_peptide`/`domain`/`region` до Этапа 1.2). Автоматическая миграция невозможна — исходный INSDC-тип потерян. Render не ломается (`ANNOTATION_COLORS.catalytic` = `#2563EB` существует). Для получения корректных типов — переимпортировать исходный `.gb`/`.dna` файл.

### 18.04.2026 — Этап 1.1: Центральный sanitizeSequence (P2-arch)

- [x] **P2-arch:** Санитизация ДНК была в 3+ местах через разные regex. Fix: единая `sanitizeSequence()` в `sequence-utils.js` + экспортируемые константы `IUPAC_DNA_REGEX`/`IUPAC_DNA_CHAR_REGEX`. Применено на 9 точках входа: genbank-parser, file-import (FASTA + backend .dna), AddFragmentModal (clean helper + 3 onChange + extractFeature), FragmentEditor (3 места), PlasmidUseWizard (2 места), SequenceEditor (useState + textarea). Миграция store v6→v7 санитизирует legacy-данные. Inline workarounds удалены из local-primer-design (3 места) и PlasmidViewer. +28 тестов в `sequence-utils.test.js`.
- [x] **P-wizard-iupac:** `PlasmidUseWizard` использовал `[^ATGCN]` без IUPAC-кодов — IUPAC символы R/Y/S/W/K/M/B/D/H/V стирались при импорте insert. Fix: замена на `sanitizeSequence`.
- [x] **P-addfrag-iupac:** `AddFragmentModal` `clean` helper с `[^ATCGNatcgn]` (17 использований в файле) + 2 textarea без sanitize + cursor-position regex. Fix: централизация через `sanitizeSequence` + `IUPAC_DNA_REGEX`/`IUPAC_DNA_CHAR_REGEX` для cursor logic.

#### Известные ограничения Этапа 1.1 (TODO v1.1)

- `COMPLEMENT_MAP` не поддерживает IUPAC R/Y/S/W/K/M/B/D/H/V → `reverseComplement()` превращает их в N. Если реальные данные потребуют — расширить до полной IUPAC-таблицы.

### 03.04.2026 — Блок 11b

- [x] **P1v2:** 1 фрагмент "без ПЦР" → 4 stale-праймера. Fix: App.jsx useEffect else-ветка очищает stale primers при fragments<2. Блок 11b (03.04.2026).
- [x] **P3b:** Annotation bar — блёклые цвета + невидимый белый текст. Fix: region opacity 0.5→0.9, detail 0.85→0.7 в AnnotationEditor.jsx. Блок 11b (03.04.2026).

### 03.04.2026 — Блок 11 (P1–P5)

- [x] **P1:** 1 фрагмент "без ПЦР" → 4 праймера (дубли). Fix: useRef guard + partId dedup в handleUseWhole (StrictMode double-fire). Блок 11 (03.04.2026).
- [x] **P2:** ∅ в начале последовательности праймера. Fix: sanitize seq в designPrimersLocal + overlapTail. Блок 11 (03.04.2026).
- [x] **P3:** Circular map — блёклые цвета при повторном импорте. Fix: dedup regions по start-end-type в PlasmidMap. Блок 11 (03.04.2026). Требует визуальной верификации.
- [x] **P4:** Аннотации не отображаются на PartBlock после "Как backbone". Fix: migratePartAnnotations в handleUseWhole. Блок 11 (03.04.2026).
- [x] **P5:** Нет переключателя Карта/Стадион для backbone. Fix: inherit circular topology в handleUseWhole. Блок 11 (03.04.2026).

### 03.04.2026 — Блоки 10 / 10b / 10c / 10d

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

### 03.04.2026 — Блоки 4b, 7, 8 (CRIT/HIGH)

- [x] **CRIT-1..5, HIGH-1,3,6,9,10:** System audit фиксы. Блоки 4b, 7, 8a (03.04.2026).

### До 28.03.2026 — Сессии 22–28

- [x] **BUG-01..83:** Сессии 22-28.

### 02–03.05.2026 — Sprint M-B.2 K4 + Parser-Unification

- [x] **V50 — Parser double-+1 на start coordinate, AA-translation broken** (FIXED 03.05.2026, ветка `feature/racetrack-canvas`). Каскадный off-by-1 в `src/pvcs/snapgene_parser.py` (XML 1-based inclusive хранился как 0-based) + `src/pvcs/parser.py` добавлял ещё `+1` на start → CDS сдвинут на 2 nt → длина не кратна 3 → reading frame ехал. Фикс: `xml_start - 1` в snapgene_parser. Контракт по всему pipeline: **0-based exclusive end** (⛓ DEC-PARSER-COORD-01). Верификация на pUC19: lacZα / AmpR / AmpR promoter — все CDS ÷3 ✓. pytest 112/112, vitest 947/947.
- [x] **V49 — 50-секундный hang на default open Step2Combined 5333 bp / 12 регионов** (FIXED 02.05.2026, M-B.2 K4 коммит `4351552`). MoleculeWorkspace + SequenceMapView (5333×2 + ~1700 AA codon rows) + AnnotationEditor → ~12–15K DOM nodes на default render. Фикс: lazy-mount табов, default «overview» — лёгкий PlasmidMiniMap + categorized summary (~50–100 nodes). ⛓ DEC-IMP-15 (инвариант lazy-mount для всех fullscreen tab UIs — M-D / M-E / M-H).
