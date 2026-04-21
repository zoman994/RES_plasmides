# BodgeGene — Архитектурные решения

Append-only журнал. Решения не удаляются и не пересматриваются без явного обсуждения.
Формат: `[ДАТА] **Решение.** Обоснование.`

Записи с `⚓` — **фундаментальные**: определяют архитектуру всего проекта, не переезжают в архив при ротации. Всё остальное старше двух спринтов → `docs/archive/DECISIONS_2026_Q2.md`.

---

## Фундаментальные решения (⚓) — не переезжают в архив

### State management / технологии

[2026-03-28] **⚓ Zustand v5 вместо useState/Context.** App.jsx был монолитом 1350 строк с 40+ useState. Zustand: granular selectors (shallow equality), middleware (persist, devtools, immer), тестируемость вне React. 5 domain slices: project, fragment, junction, primer, ui.

[2026-03-28] **⚓ React Compiler v1.0 вместо ручного useMemo/useCallback.**

[2026-03-28] **⚓ Immer middleware для иммутабельных обновлений.**

[2026-03-28] **⚓ Manual undo/redo вместо zundo.** Debounce 300ms, max 50 уровней.

### Биологические алгоритмы

[2026-03-28] **⚓ SantaLucia 1998 NN Tm.** ΔH/ΔS, Owczarzy 2008 Mg²+ коррекция → ±1-2°C.

[2026-03-26] **⚓ Golden Gate: 5 ферментов, 32 orthogonal overhangs.**

[2026-03-26] **⚓ KLD мутагенез по протоколу NEB #M0554.**

[2026-03-25] **⚓ Assembly strategy: Auto / All-at-once / 3 parts / 2 parts.**

### Рендеринг последовательности

[2026-03-29] **⚓ Character grid (ch units) для всех sequence views.**

[2026-03-27] **⚓ 4 вида canvas: Blocks (Ctrl+1) / Sequence (Ctrl+2) / Map (Ctrl+3) / Racetrack (Ctrl+4).**

### UX-инварианты

[2026-03-29] **⚓ Два типа объектов: Плазмиды и Запчасти.** Плазмида = circular + ≥2 regions.

[2026-03-29] **⚓ Три режима: Canvas, PlasmidViewer, PlasmidUseWizard.**

[2026-03-25] **⚓ Okabe-Ito color system.**

### Данные и аннотации

[2026-03-29] **⚓ Аннотации трёхуровневые: region > detail > point.**

[2026-03-26] **⚓ Part versioning: parent/child с derivation types.**

### Circular Map

[2026-04-03] **⚓ PlasmidViewer/Wizard: mapFragments = [{whole plasmid}], не массив регионов.** Регионы плазмиды перекрываются (nested CDS, gene внутри operon). При передаче массивом offset > totalBp, арки уходят за 360°. Решение: всегда одна плазмида; PlasmidMap рисует sub-arcs по annotations с assignSubTracks() (max 4 tracks).

### Project Flow

[2026-03-31] **⚓ @xyflow/react (React Flow v12) для Project Flow DAG.**

[2026-03-31] **⚓ Два уровня: Construct View (Ctrl+1-4) + Project Flow (Ctrl+5).**

[2026-03-31] **⚓ projectFlowSlice — 6-й slice.** Не в SNAPSHOT_KEYS (undo только construct).

[2026-03-31] **⚓ Neoschizomers: строгая терминология.** Убраны 18 ложных, добавлены настоящие (SacI↔Eco53kI, DpnI↔DpnII/MboI).

### Архитектура v2 — утверждено 31.03.2026

[2026-03-31] **⚓ «Составной блок» — видно из чего склеен.** subFragments[], assemblyMethod, protocol status. Цветная полоска + имена.

[2026-03-31] **⚓ Привязка к протоколу: 4 статуса.** complete / in_progress / planned / manual.

[2026-03-31] **⚓ validateJunctionEnds() ПЕРЕД расчётом праймеров.** Overlap/RE/GG pre-flight checks.

[2026-03-31] **⚓ Мерж аннотаций при склейке.** Offset по фрагментам, sourceFragment для трейсабильности.

### Restriction Cloning (Блок 4b, 03.04.2026)

[2026-04-03] **⚓ digest() — чистая функция без side effects.** sequence + annotations + enzyme(s) → backbone + excised + ends. Три режима: linearize (1 site), excise same enzyme (2 sites), excise two enzymes.

[2026-04-03] **⚓ autoAdjustJunctions() не трогает ligation junctions.** Guard: `if (j.type === 'ligation' || j.type === 're_ligation') return;`. Предотвращает переключение ligation → overlap при авто-подстройке.

[2026-04-03] **⚓ N+N + ligation = valid.** Два фрагмента без ПЦР + ligation junction — стандартная операция digest+ligate. Warning «overlap невозможен» проверяет `junc.type === 'overlap'`.

### Sanitize contract (Этап 1.1, 18.04.2026)

[2026-04-18] **⚓ sanitize-at-entry как архитектурный контракт.** `sanitizeSequence()` вызывается один раз при входе данных (paste, file import, API response), далее в кодобазе данные считаются чистыми. Inline workarounds из `local-primer-design.js` и `PlasmidViewer.jsx` удалены. Trade-off: новая точка входа без sanitize — тесты не поймают; защита через code review + чеклист в CLAUDE.md.

[2026-04-18] **⚓ Канонический IUPAC-порядок: `ATGCNRYSWKMBDHV`.** Все regex приведены через `sanitizeSequence()` в `sequence-utils.js`. `IUPAC_DNA_REGEX` и `IUPAC_DNA_CHAR_REGEX` экспортируются как anti-drift механизм (синхронизация курсора в AddFragmentModal).

### Import-annotations (Этап 1.2, 18.04.2026)

[2026-04-18] **⚓ `normalizeGeneType(feat)` — gene-семантика из qualifiers, не из type.** `gene` не в TYPE_MAP; `normalizeType(type, feat)` делегирует `normalizeGeneType`, читающую `/ncRNA_class` → `ncRNA`, `/product` matches → `tRNA`/`rRNA`, иначе → `gene`. Free-text `/note` эвристики отвергнуты как источник регрессий.

[2026-04-18] **⚓ `oriT` ≠ `rep_origin`.** Биологически разные (конъюгация vs репликация). Собственный region-тип, цвет `#7C3AED`.

### Sprint 1 — мутагенез (19–20.04.2026)

[2026-04-20] **⚓ `resetJunctionForType(j, newType)` как единый источник сброса junction-state.** Любая смена типа стыка (ligation↔GG↔KLD↔overlap) должна чистить enzyme/overhang поля предыдущего типа. 7 call-sites ходят через helper. Сохраняются: id + overlap-геометрия. GG default = `BsaI`, ligation/re_ligation mirror reEnzyme→enzyme.

[2026-04-20] **⚓ Единый источник правды мутагенеза — `computeMutagenesisStrategy`.** Оба UX-пути (Wizard + FragmentEditor in-place) ходят через одну функцию выбора стратегии (KLD для 1 мутации или 2 близких; two_fragment для 2 далёких; multi_fragment для 3+). Раньше in-place путь использовал упрощённый `designInlineKLDPrimers` — сломанная стратегия для любого числа мутаций.

[2026-04-20] **⚓ `junction.overlapSequence` — расширение контракта `local-primer-design.js`.** В split-mode ветке `overlapTail`: если `j.overlapSequence` задана — тейл берётся из неё (первая половина → RC → fwd-тейл; вторая половина → rev-тейл). Если не задана — существующая логика без изменений (регрессия-тест). Применимо не только к мутагенезу — любой случай, где overlap нужно задать явно.

[2026-04-20] **⚓ No-PCR guard для two/multi_fragment мутагенеза.** `needsAmplification === false` + two/multi split → блокировка + apiWarning. Биологически: нельзя ПЦР'ить кусками то, что само по себе не амплифицируется. KLD на No-PCR-фрагменте разрешён (обратная ПЦР всей плазмиды валидна для любой ДНК-матрицы).

[2026-04-20] **⚓ `chooseStrategy` принимает `fragmentContext`** (V14). KLD возможен ТОЛЬКО при `topology === 'circular' && isStandalone === true`. Линейные фрагменты и фрагменты в составе сборки всегда идут через two/multi_fragment overlap PCR. Биологическое требование KLD-реакции (нужна матрица для back-to-back линеаризации + backbone для лигирования концов).

### Sprint 1.7 — Unified Editor + Virtual Full Sequence + Topology (22.04.2026)

[2026-04-22] **⚓ `fragment.topology` как persisted per-fragment поле (`linear` \| `circular`).** Ранее topology была атрибутом всей сборки (circular-flag на project), что ломало смешанные сценарии (линейный insert в circular backbone). Теперь каждый фрагмент несёт собственную topology; split-группа → все sub'ы `linear`; single-fragment circular → self-closure через overhang-tails. Data-model инвариант, влияет на junction-расчёт, primer design, assembly semantics.

[2026-04-22] **⚓ `expectedJunctionCount(fragments)` как source of truth для junction-валидации.** Контракт: single-circular = 0 (self-closure без отдельного junction-объекта; реальное замыкание через +30 bp tails на PCR-праймерах), N linear = N−1, N circular = N (включая замыкающий). Любой UI-рендер стыков и любой invariant-check в assembly ходят через эту функцию. Нарушение → регрессия V17 (decorative junction у single-linear).

[2026-04-22] **⚓ Тесты соразмерны коду, а не наращиваются ради галочки.** TDD-first для биологических алгоритмов (mutagenesis strategy, primer design, Tm/GC, split helpers), state slices (reducers, migrations) и data-model инвариантов. Для UX-компонентов (рендеры, тулбары, модалки) — happy path + 1–2 edge case, не больше. Ориентир: рост код/тесты 1:1 — допустим, 1:2+ — сигнал пересмотра объёма спринта. Наблюдение по ходу приёмки Sprint 1.7: +38 Vitest на 4 коммита воспринимается как избыточный темп. Целевой коридор на следующих спринтах средней сложности — ≤20 новых тестов.

### Архитектурная гигиена (22.04.2026)

[2026-04-22] **⚓ Лимит размера модулей.** Принято после Sprint 1.7 (FragmentEditor вырос с 62 до 70 KB за один спринт, чтение целиком в одну Chat-сессию невозможно).

- **`.jsx` компонент:** soft warning 30 KB, hard лимит **40 KB** (обязательная декомпозиция в текущем или ближайшем спринте).
- **`.js` helper / algorithm:** soft warning 20 KB, hard лимит **25 KB**.
- **Data-файлы** (словари, константы, локали — `restriction-db.js`, `i18n.js`, `tags-db.js`, `part-descriptions.js`) — не лимитируются. Дробление по алфавиту бессмысленно.

**Enforcement:**
- Chat при написании спеки читает размер затрагиваемых модулей (`list_directory_with_sizes`). Если цель правки — модуль ≥ hard, первым пунктом спеки идёт декомпозиция, не новая функциональность (см. CHAT_PLAYBOOK.md §2).
- Code после реализации спринта сообщает в отчёте: (а) файлы, переросшие hard за этот спринт (новые нарушители); (б) файлы, выросшие >5 KB за спринт (warning signal) (см. CLAUDE.md §7).

**Текущие нарушители (снимок 22.04.2026):** `FragmentEditor.jsx` 70 KB, `App.jsx` 39 KB, `PlasmidUseWizard.jsx` 39 KB, `DesignCanvas.jsx` 38 KB, `AddFragmentModal.jsx` 35 KB (красная зона). `PlasmidMap.jsx` 33 KB, `PartsPalette.jsx` 31 KB, `JunctionBlock.jsx` 29 KB, `ProtocolTracker.jsx` 28 KB, `PartBlock.jsx` 26 KB (граничная зона, контроль). Плановая декомпозиция красной зоны — Sprint 3 «Decomposition» сразу после V7 InsertionClock.

---

## Sprint 1.7 — Unified Editor + Virtual Full Sequence + Topology (22.04.2026)

[2026-04-22] **V15 fix: `isMutated` через числовое сравнение `codonStart`/`position`.** Старая проверка `m.label?.includes(String(pos))` ломалась на мутациях вида `G26A, R135A, C403G, G404C` — любая позиция-substring подсвечивалась ложно. Теперь сопоставление позиций — только числовое; парсинг числа из `label` — через word-boundary regex как fallback. Правило для будущего: **никогда** не матчить позиции через substring `label.includes`.

[2026-04-22] **V16 fix: `computeMutationHighlights` учитывает `fragment.templateStart`.** Для sub-фрагментов split-группы (templateStart > 0) diff с parent теперь сравнивает `parent.sequence.slice(templateStart, templateStart + fragment.length)` с `fragment.sequence`, а не от индекса 0 (что давало «весь ген красный»). Протестировано на substitution и deletion — mapping не съезжает после indel.

[2026-04-22] **Unified Editor layout (K10).** Tabs «Последовательность / Белок» удалены. Информационная модель: sequence = primary view (DNA + AA под каждым кодоном), под ней — три collapsible panel (Annotations, Mutations, Protein). Mode switcher Правка/Мутагенез — ортогональная ось, меняет семантику кликов (AA-клики no-op в Правке, mut-menu в Мутагенезе), не разделение контента. UX-паттерн — не ⚓: может пересматриваться при декомпозиции FragmentEditor в v1.1.

[2026-04-22] **`splitGroupFullSequence` virtual view (K11).** Для sub-фрагментов split-группы в header Editor — toggle «Фрагмент / Полный ген». Full-view режим: sequence read-only, баннер «Виртуальный вид», `highlightRegion(templateStart, length)`, notice «Аннотации недоступны в полном обзоре», мутации в координатах parent по всей длине гена. Виртуальная последовательность не сохраняется как фрагмент — вычисляется на лету из `parent.sequence` + applied mutations от всей группы. UX-паттерн — не ⚓.

[2026-04-22] **`renderSequenceGrid` — извлечённый helper.** В ходе K10 рефакторинга sequence-рендер вынесен из `FragmentEditor.jsx` в отдельный helper для переиспользования в fragment-view и full-view. Не ⚓: внутренняя декомпозиция, потенциально переедет в hooks в рамках v1.1 FragmentEditor-декомпозиции.

---

## Sprint 1.6 — Мутагенез UX v2.1 + приёмка (21.04.2026)

[2026-04-21] **Белок в режиме Правка — read-only (K5).**
Bookkeeping-edit белка невозможен: из одной AA нельзя выбрать codon, нужна исходная ДНК. Поэтому в `mode='edit'` tab «Белок» показывает синюю полосу «Режим просмотра» + кнопку «→ Мутагенез». AA-span теряет `cursor: pointer` и `onClick`; `openMutMenu` сохраняет early-return guard как defence-in-depth. Semantics после K5: **Правка = только ДНК**, **Мутагенез = ДНК + AA**. Радио-лейблы mode switcher'а из Sprint 1.5 K2 не меняются.

[2026-04-21] **Биологически корректная обрезка аннотаций при split — `lib/split-annotations.js` (K6).**
Coordinate-only map+filter в `handleSaveFragment` был филологически верным, но биологически слеп: signal peptide в середине sub-фрагмента, половина restriction-сайта, трёхбуквенный start-codon в несуществующем месте. Введён helper `trimAnnotationsForSubFragment(parentAnns, sf)` с тремя классами правил: N-terminal (signal_peptide/transit_peptide/propeptide) — drop на partial overlap, survive только при fully-inside + `subStart === 0` + `a.start === 0`; point-like (restriction_site/primer_bind/mutation/variation/modified_base) — drop на любой partial overlap (половина не работает); start_codon — только при `a.start === subStart`; stop_codon — только при `a.end === subEnd`; CDS/gene — rename с (5' trimmed) / (3' trimmed) / (trimmed) суффиксом. Идемпотентность: `!a.name.includes('trimmed')` guard. Всё остальное — trim + flag без rename. `useFragmentHandlers.handleSaveFragment` делегирует helper'у.

[2026-04-21] **Split-группа как явная сущность данных — `splitGroupId` + метаданные (K7).**
При two_fragment/multi_fragment split новые фрагменты несут `splitGroupId` (shared), `splitGroupParentName`, `splitGroupIndex`, `splitGroupTotal`. `DesignCanvas` группирует consecutive same-groupId элементы в `.split-group-container` с 4 визуальными эффектами (dashed border + tinted backdrop + badge + connector line). Internal junctions (между членами группы) рендерятся внутри контейнера; external (группа ↔ соседний фрагмент/next row/circular close) — снаружи. KLD не создаёт группу (single fragment in place). **Финальное решение по визуалу** (какие из 4 эффектов оставить) — после приёмки; решено отложить в Sprint 1.7.

[2026-04-21] **Подсветка мутаций относительно parent-part — `computeMutationHighlights` (K8, partial).**
FragmentEditor вычисляет per-nt мутации через `sequenceDiff(parent.sequence, fragment.sequence, cdsRegions)` и рисует red/yellow backdrop + underline (nonsilent/silent). Fallback на `fragment.mutations` если parent не найден — conservatively nonsilent. Protein view: per-codon priority (any nonsilent nt → весь AA nonsilent). **Известный дефект (V16):** diff не учитывает `fragment.templateStart` → для sub-фрагментов после split подсветка ложная. Исправление перенесено в Sprint 1.7 K9.

[2026-04-21] **`isMutated` по `label.includes(String(pos))` — баг, не работает для цифр (V15).**
В `FragmentEditor.jsx` (~строки 760, 852) подсветка «применённых» мутаций использовала `mutations.some(m => m.label?.includes(String(pos)))`. Для мутаций с номерами `G26A, R135A, G77C, C403G, G404C` любая AA-позиция, номер которой встречается как подстрока в номере любой мутации, подсвечивалась ложно. **Ключевое правило для будущего:** сопоставление позиций всегда через числовое сравнение полей `codonStart` / `position`, никогда через `.label.includes(String(pos))`. Если сравнивать надо через label — минимум word-boundary regex (`\bNNN\b`) и числовой парсинг. Переделка в Sprint 1.7 K10 Unified Editor.

[2026-04-21] **Unified Editor — направление Sprint 1.7.**
Tabs (Последовательность / Белок) в FragmentEditor — артефакт Sprint 1.5 K2: добавлены чтобы вместить radio mode switcher. Правильная информационная модель: **sequence = primary view**, аннотации/белок/список мутаций — panel(s) под ней или сбоку. Mode (Правка / Мутагенез) остаётся как ортогональная ось — он меняет семантику кликов, а не разделение контента. Реализация в Sprint 1.7 K10 Unified Editor. До тех пор: K2 mode switcher, `switchMode` helper, identity-guard в `handleSaveFragment` — сохраняются как база.

---

**Исторические записи старше Sprint 1.6 (с полными формулировками):** `docs/archive/DECISIONS_2026_Q2.md`.
