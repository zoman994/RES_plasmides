# SPRINT_IMPORT_START_SCREEN.md — стартовый экран импорта

**Статус:** ✅ РЕАЛИЗОВАНО 27.04.2026 (Sprint Import-Start-Screen K1–K9 + fix-цикл Kfix-1..Kfix-7 + V37 mini-fix в коммите `d6149c4`). Финализирован после визуальной приёмки 27.04.2026 — 16/16 F-критериев PASS. См. PROJECT_STATE.md журнал сессии 27.04.2026.

**Workflow:** Import & Preview, часть 1 из 3 (стартовая страница).
**Версия проекта:** v0.5.2-alpha (~265 commits, 958 тестов: 846 Vitest + 112 pytest).
**Pre-read:** `docs/WF_IMPORT_PREVIEW_GAP.md`, `docs/prototype/import_preview_prototype_v2.html`, `CURRENT_TASK.md` (зафиксированные решения этапов (1)–(2)).
**Связанные ⚓:** sanitize-at-entry (18.04.2026), feature-palette контракт (21.04.2026), `getRegions()` id-contract (21.04.2026), архитектурная гигиена / лимит размеров (22.04.2026), prototype-first (23.04.2026).

---

## 0. Срез размеров затронутых модулей

Снимок по WF_IMPORT_PREVIEW_GAP.md §7 (26.04.2026):

| Файл | Размер | Зона |
|---|---|---|
| `App.jsx` | 39.29 KB | **NEAR HARD .jsx 40** — правки только на удаление ImportDecisionModal-state и переподключение, цель: уменьшение |
| `auto-annotate.js` | 18.68 KB | Soft .js 20 KB — НЕ трогаем в этом скоупе |
| `components/PlasmidViewer.jsx` | 20.12 KB | НЕ трогаем (превью молекулы — отдельный workflow) |
| `components/CatalogPanel.jsx` | 11.09 KB | **Удаляется** — функциональность переезжает в `ImportStartScreen/CatalogTree.jsx` |
| `components/ImportDecisionModal.jsx` | 4.26 KB | **Удаляется** — полностью покрыто ImportStartScreen |
| `file-import.js` | 7.06 KB | Расширяем (multi-file batch + paste auto-detect helper) |
| `genbank-parser.js` | 7.47 KB | НЕ трогаем |
| `import-annotations.js` | 9.27 KB | НЕ трогаем |
| `sequence-utils.js` | (не измеряли) | Расширяем (sanitize-with-report + rotate-origin) — Code в отчёте указывает финальный размер |

**Декомпозиция первым пунктом не требуется:** ни один файл в скоупе не находится за hard-лимитом перед началом. App.jsx в красной зоне, но правки сокращающие.

**Risk-bullet (см. §9):** новый компонент `ImportStartScreen` суммарно собирает 9 состояний прототипа + множество полей — изначально проектируется декомпозированным (root + 7 sub-модулей в `components/ImportStartScreen/`), чтобы ни один файл не подходил к 30 KB soft.

---

## 1. Контекст

Текущая модель импорта в проекте — точечная: window-level drag-drop ловит первый файл (`App.jsx::handleFileDrop`, остальные молча отбрасываются), `ImportDecisionModal` показывает 6 действий для circular / 2 для linear, `CatalogPanel` живёт отдельной модалкой с дублирующим preview-detail без map. Биолог не имеет UI для override topology, выбора origin, контроля enrichment, multi-record `.gb`. Каталог SnapGene и пользовательская библиотека parts отделены — биолог выбирает «откуда брать», вместо «что брать».

Этап (1) (`WF_IMPORT_PREVIEW_GAP.md`) зафиксировал 5 sub-workflow и 8 decision points. Этап (2) — статический HTML-прототип `docs/prototype/import_preview_prototype_v2.html` с 9 состояниями — закрыт визуальным согласием Игоря 27.04.2026. Из 8 decision points этап (2) решил 4 (точки 1, 2, 5, 8); точки 3, 4, 6, 7 затрагивают превью молекулы и provenance — отложены в OUT текущего workflow (последующие per-workflow сессии).

Сверх 4 закрытых точек этап (2) добавил 10 решений сверх gap'а, главные: имя `part_N` по умолчанию, primary-actions «На канвас / В библиотеку / Аннотировать» + Действия ▾, поле `originOffset` для circular с физической ротацией, накопительный toast после «На канвас» без таймера, inline-rename в multi-list, sanitize-фильтр через существующий `sanitizeSequence`, мини-карта как индикатор «нужна ли аннотация», свёрнутый каталог по умолчанию.

Спринт реализует один экран — стартовую страницу импорта. Превью молекулы (ставка 6 Vision: provenance + coverage + fragment-aware rendering) и мастера действий (Restriction / Мутагенез / Разобрать) — отдельные per-workflow сессии после визуальной приёмки этого экрана.

---

## 2. Стратегия

Один новый компонент `ImportStartScreen` становится единой точкой входа для импорта и каталога. Все четыре трюка существующего входа (window drag-drop, QuickStart «📂 Импортировать», PartsPalette file picker, header «📚 Каталог») приводят в один и тот же экран; разница только в начальном состоянии (раскрытый каталог / уже загруженный файл / пустое поле). `ImportDecisionModal` и `CatalogPanel` удаляются. Внутренняя структура — root компонент + 7 sub-модулей в `components/ImportStartScreen/` (декомпозиция спроектирована до старта, чтобы избежать раздутия 30+ KB).

---

## 3. Scope — IN / OUT

### IN

1. Новый компонент `ImportStartScreen` с подкомпонентами InputZone / MetaColumn / MultiFileList / CatalogTree / ActionsBar / Toast.
2. Новый общий компонент `PlasmidMiniMap` (используется в MetaColumn 90/180 px и в карточках MultiFileList 46 px / CatalogTree 64 px).
3. Расширение `sequence-utils.js`: `sanitizeWithReport()` поверх существующего `sanitizeSequence()`.
4. Новый модуль `format-detect.js` (auto-detect GenBank / FASTA / raw nucleotides при paste).
5. Новый модуль `rotate-origin.js`: физическая ротация sequence + сдвиг annotations с обработкой wrap через границу.
6. Расширение `file-import.js`: `handleFilesImport(files: File[]) → ParsedItem[]` для batch.
7. Wiring `App.jsx`: замена `ImportDecisionModal` state и handlers на `ImportStartScreen`. Window-level drop принимает все файлы. Кнопка `📚 Каталог` в header открывает `ImportStartScreen` с раскрытым каталогом.
8. Удаление: `components/ImportDecisionModal.jsx`, `components/CatalogPanel.jsx`. Соответствующие state/handlers в `App.jsx`.
9. Тесты: ~17 новых (4 unit sanitize + 4 unit format-detect + 3 unit PlasmidMiniMap + 5 integration ImportStartScreen + 1 регрессия App drag-drop). Целевой коридор ≤20 (DECISIONS 22.04.2026 — тесты соразмерно коду).

### OUT

- Превью молекулы (`PlasmidViewer` правки, footer, V8 CDS-warnings overflow, decision points 3 и 4 gap'а) — следующий per-workflow.
- Мастера Restriction / Мутагенез / Разобрать. Кнопки в `Действия ▾` — disabled stub'ы с тултипом «доступно после открытия плазмиды на канвасе» в этом спринте.
- Provenance enum + coverage (gap §5.2, decision point 7) — затрагивает рендер аннотаций в превью.
- Repeat-import dedup (gap §5.1.6, decision point 6) — UX полишинг.
- Web Worker для batch parsing — MVP последовательно, прогресс-бар при N≥3 файлов.
- `ImportPrompt` («Импортируйте вектор» при пустой библиотеке внутри Restriction/Мутагенез wizards) — оставляется как есть, своя точка входа в эти wizards.
- Изменения в `auto-annotate.js`, `genbank-parser.js`, `import-annotations.js`. Используются как есть.
- Provenance-tooltip на аннотациях, hover-state мини-карты с подробностями — кроме базового SVG `<title>` атрибута для accessibility.

---

## 4. Архитектурные решения

1. **`ImportStartScreen` — root + 7 sub-модулей в `components/ImportStartScreen/`.** Прототип содержит 9 принципиально разных состояний с независимыми областями (input / meta / actions / multi-list / catalog / toast). Запихать в один файл = 35–40 KB на пороге hard. Декомпозиция спроектирована заранее (см. §6.1).

2. **State не в Zustand store, а в самом компоненте.** ImportStartScreen — модалка с временным состоянием одной сессии импорта. Финальные действия (`На канвас`, `В библиотеку`) дёргают `addPart`, `addFragment` через store, но локальные поля (содержимое input-zone, topology toggle, originOffset, имя, накопленный toast) живут локально через `useReducer` либо состав `useState` (выбирает Code). Обоснование: при закрытии модалки локальное состояние сбрасывается; при повторном открытии — чистый старт. Никакого `importSlice` в store не вводится.

3. **Физическая ротация sequence при `originOffset ≠ 1`.** Принято Игорем 27.04.2026: при действии («На канвас» / «В библиотеку» / «Аннотировать») если `topology === 'circular' && originOffset !== 1` — sequence реально rotates, координаты annotations пересчитываются. Annotations пересекающие точку рассечения (start < origin < end в circular) превращаются в `joined` (массив `parts: [{start, end}, {start, end}]` либо отдельный flag — выбор Code). После ротации `originOffset` сбрасывается в 1. **Обоснование:** все downstream consumers (PlasmidMap arc layout, SequencePane region rendering, primer design, restriction digest, mutagenesis split) работают в координатах от position 1. Введение runtime-смещения через все consumers — большой архитектурный сдвиг, отложен; на этапе импорта проще привести данные к каноническому виду.

4. **`ImportDecisionModal` и `CatalogPanel` удаляются полностью.** Не deprecated, не fast-path. Прототип ImportStartScreen покрывает весь функционал без конкуренции точек входа. `CatalogPanel.jsx::handleSelectPart` lazy-load logic (`fetch /plasmids-data/{cat}.json`) переезжает в `ImportStartScreen/CatalogTree.jsx` с минимальным рефакторингом (extract `useCatalogIndex()` + `useCatalogCategory(cat)` если Code сочтёт уместным; не предписывается).

5. **`PlasmidMiniMap` — отдельный shared компонент.** Используется в MetaColumn (180 px) при single-file загрузке, в MultiFileList (46 px), в CatalogTree карточках (64 px). Не переиспользует `PlasmidMap.jsx` (33 KB, полнофункциональный с tracks, RE sites, labels, hover scale). Mini-map: один трек, без RE sites, без labels внутри арок, цвета через `featureColor()` из `feature-palette.js` (⚓ 21.04.2026), `<title>` SVG для accessibility hover.

6. **При пустых features рисуется одна сплошная дуга `featureColor('linker')`** (`#C4B8A8`, тёплый бежевый). Это сигнал биологу «структура не распознана, аннотируйте или принимайте как есть». Применяется во всех размерах мини-карты.

7. **Sanitize контракт остаётся: один `sanitizeSequence` на входе.** `sanitizeWithReport` — обёртка, которая возвращает чистую sequence + статистику убранных символов + флаг IUPAC. Это data для UI («убрано: 47 цифр, 32 пробела» / «содержит IUPAC: R, Y, N»). Underlying логика очистки в `sanitizeSequence` не меняется — обёртка просто параллельно считает категории отбрасываемых символов.

8. **Toast после «На канвас» persistent в течение сессии модалки.** Состояние `addedToCanvasNames: string[]` в локальном state ImportStartScreen, добавляется при каждом успешном `На канвас`. При закрытии модалки (× / Esc) — сбрасывается. Без таймера автоскрытия.

9. **Multi-file: при N>1 actions ограничены `В библиотеку` и `Аннотировать → в библиотеку`.** Биологическая защита: пакетом нельзя клонировать или мутагенизировать (decision 8 этапа (2)). UI: остальные actions visually disabled (`opacity: 0.35`, `cursor: not-allowed`, `aria-disabled`). При наведении тултип «доступно для одиночной загрузки».

10. **Каталог по умолчанию свёрнут в одну строку, открытие — disclosure pattern.** При раскрытии каталога главное input-поле переходит в compact-mode (одна строка с подсказкой `Ctrl+V`, без больших drag-зон). Отдаёт пространство каталогу. Это устраняет ложный drag-pattern «слева ввод / справа каталог» (этап (2) явно).

---

## 5. Предположения

Источник истины кроме спеки — `WF_IMPORT_PREVIEW_GAP.md`, `CURRENT_TASK.md` зафиксированные решения, прототип v2.

1. **`sanitizeSequence(rawText)` существует в `sequence-utils.js`, чистит всё кроме `ATGCNRYSWKMBDHV` (case-insensitive), возвращает upper-case строку.** Источник: ⚓ DECISIONS 18.04.2026 «sanitize-at-entry». **Статус:** проверено через gap §3.1. Code при K1 сначала смотрит существующую сигнатуру, расширяет совместимо.

2. **Lazy-load каталога:** `public/plasmids-data/index.json` (~867 KB) даёт мета 2822 плазмид с категориями. `public/plasmids-data/{category}.json` (19 файлов) содержат полные records по категории. Код-паттерн в `CatalogPanel.jsx`. **Статус:** проверено через gap §3.5. CatalogTree копирует тот же fetch-pattern.

3. **Window-level drag-drop в `App.jsx::handleFileDrop` строки 165–178 берёт `e.dataTransfer.files[0]` (только первый).** **Статус:** проверено через gap §5.1.5. Нужна правка на `Array.from(files)`. ImportPrompt и file picker в PartsPalette используют `<input type="file">` без `multiple` — multi-file picker не требуется в этой спеке (можно добавить `multiple` если просто, но не предписывается).

4. **`Part` в store не имеет поля `originOffset` сейчас.** Не хранится отдельно — origin приходит из `.dna`/`.gb` файлов и используется при парсинге, но в Part data структура хранит уже sequence от position 1. **Статус:** не проверено. Code при K3 проверяет, добавляет поле если нужно (не должно быть нужно: ротация физическая, после неё origin всегда 1). Никакая миграция existing parts не требуется.

5. **`feature-palette.js::featureColor(type, name?)` — единственный источник цвета region-семейств, экспортирует также `FEATURE_STROKE` и сам `featureColor`.** Источник: ⚓ DECISIONS 21.04.2026. **Статус:** проверено. Все цветные дуги в `PlasmidMiniMap` ходят через эту функцию.

6. **`getRegions(annotations)` из `annotation-model.js` возвращает массив region'ов с гарантированным `id` (id-backfill при отсутствии).** Источник: ⚓ DECISIONS 21.04.2026. **Статус:** проверено. PlasmidMiniMap ходит через `getRegions`, не через ручной `filter(level === 'region')`.

7. **`parseGenBank(text)` останавливается на первом `//`.** Источник: gap §3.1, §5.1.2. Multi-record `.gb` сейчас даёт первую запись. **Статус:** проверено. Decision этапа (2) точка 2: «все записи попадают пакетом, аннотация утверждается отдельно для каждой либо разом флагом «без аннотации»». Это требует extension `parseGenBank` либо нового `parseGenBankMultiRecord`. Включено в K1 как открытый под-вопрос для Code (см. §10 OQ-2).

---

## 6. Файлы / сигнатуры / структура тестов

### 6.1 Новые модули

#### `gui/designer/src/sequence-utils.js` (расширение)

Существующая функция `sanitizeSequence` остаётся. Добавляется:

**`sanitizeWithReport(rawText: string) → { sequence: string, removed: { whitespace, digits, punctuation, bom, other }, hasIUPAC: boolean, iupacChars: string[] }`**

- Параллельно с очисткой считает категории отбрасываемых символов.
- `hasIUPAC` — true если в результате есть хотя бы один из `RYSWKMBDHVN` (без A/T/G/C).
- `iupacChars` — уникальные IUPAC-символы в результате, отсортированы по алфавиту.
- Empty input → пустая sequence + все нули.

#### `gui/designer/src/format-detect.js` (новый)

**`detectFormat(text: string) → 'genbank' | 'fasta' | 'raw' | 'unknown'`**

- `text.trim()` пустой → `unknown`.
- Начинается с `LOCUS ` (ровно так, GenBank header) → `genbank`.
- Первая non-empty строка начинается с `>` → `fasta`.
- После `sanitizeSequence` от первых 1000 символов осталось ≥10 валидных IUPAC символов → `raw`.
- Иначе → `unknown`.

#### `gui/designer/src/rotate-origin.js` (новый)

**`rotateOriginToPosition(sequence: string, annotations: Annotation[], newOriginPos1Indexed: number) → { sequence: string, annotations: Annotation[] }`**

- Для linear sequence (вне circular контекста) — no-op (возвращает тот же объект).
- Для circular: новая sequence = `sequence.slice(k-1) + sequence.slice(0, k-1)` где `k = newOriginPos1Indexed`.
- Для каждой annotation: новая позиция `p_new = ((p_old - k + length) % length) + 1` (1-indexed).
- Аннотации, пересекающие точку рассечения (т.е. `start < k && end >= k` в circular), становятся `joined`: либо две части `[{start: 1, end: end_new}, {start: start_new, end: length}]` с общими `id`/`name`/`type`, либо single annotation с флагом `wrapped: true` и массивом `parts: [...]` — Code выбирает совместимо с тем, как `getRegions` и render-pipeline сейчас обрабатывают joined GenBank features (есть ли уже паттерн `complement(join(...))` parsing). Если паттерн отсутствует — тогда two separate annotations с одним `id`-prefix.
- Сохраняет `strand`, `level`, `type`, `name`, остальные поля.

#### `gui/designer/src/components/PlasmidMiniMap.jsx` (новый)

**Props:** `{ length: number, topology: 'circular' | 'linear', annotations: Annotation[], size: number }`

- `topology === 'circular'` → SVG circular: один трек, sub-arcs по `getRegions(annotations)`, цвет через `featureColor(region.type, region.name)`, stroke `FEATURE_STROKE`.
- `topology === 'linear'` → SVG horizontal bar (same height ratio).
- Empty `annotations` или `getRegions()` пустой → одна дуга/полоса `featureColor('linker')` (`#C4B8A8`).
- Для каждой sub-arc — SVG `<title>` с `${region.name} · ${region.start}–${region.end} bp` для accessibility hover.
- `size` параметризует viewBox и stroke-width: 46 / 64 / 90 / 180 в прототипе.
- Без labels, без RE sites, без hover scale, без selected state. Read-only визуальный индикатор.
- Не использует `getCenteredArcPath` или другие helpers `PlasmidMap.jsx` — собственный мини-pathBuilder; не зависит от `assignSubTracks` (один трек).

#### `gui/designer/src/components/ImportStartScreen/index.jsx` (новый, root)

**Props:** `{ onClose: () => void, presetFiles?: File[], catalogExpandedInitial?: boolean }`

- Root layout: title bar (× закрытие), main column (primary input + actions / multi-list / catalog), bottom toast.
- Local state: `parsedItems: ParsedItem[]` (массив длины 0/1/N), `topology`, `originOffset`, `name`, `pasteText`, `sanitizeReport`, `catalogExpanded`, `addedToCanvasNames: string[]`, `pendingMultiAnnotate: Set<string>`.
- Effect on mount: если `presetFiles?.length > 0` → `handleFilesImport(presetFiles)` → `setParsedItems`. Если `catalogExpandedInitial` → `setCatalogExpanded(true)`.
- Render branches: `parsedItems.length === 0 && !catalogExpanded` → empty start (full primary + collapsed catalog row); `catalogExpanded` → compact primary + CatalogTree; `parsedItems.length === 1` → primary с filled InputZone + MetaColumn справа + ActionsBar; `parsedItems.length > 1` → MultiFileList + restricted ActionsBar.
- Хендлеры: `handleDrop`, `handlePaste`, `handleAction(actionId)` (3 primary + Действия ▾ stubs), `handleRotateOrigin`, `handleNameChange`, `handleTopologyChange`, `handleCatalogSelect(item)`.
- При `handleAction('canvas')` → 1) если circular && originOffset !== 1, вызвать `rotateOriginToPosition`, 2) `addPart` или `addFragmentDirectlyToCanvas` (зависит от существующих store actions; Code выбирает совместимо), 3) push в `addedToCanvasNames` для toast, 4) reset input state. Модалка не закрывается.
- При `handleAction('library')` → `addPart` для каждого parsed item, для multi: skip auto-annotate если чекбокс снят, иначе `autoAnnotate` + `enrichWithCommonFeatures`. Reset state. Модалка не закрывается (или закрывается с toast — Code выбирает; в прототипе после batch `В библиотеку (5)` модалка остаётся, ок).
- При `handleAction('annotate')` → `autoAnnotate` + `enrichWithCommonFeatures` для items с активным чекбоксом, затем `addPart`. Аналогично library.

#### `gui/designer/src/components/ImportStartScreen/InputZone.jsx`

**Props:** `{ onFiles: (files: File[]) => void, onPasteText: (text: string) => void, isOver: boolean, mode: 'empty' | 'compact' | 'filled', placeholder?: string }`

- `mode === 'empty'`: dual-purpose dropzone + textarea, dashed border, 200 px min height, large icon + text.
- `mode === 'compact'` (catalog раскрыт): одна строка с `Ctrl+V` подсказкой и иконкой.
- `mode === 'filled'`: solid border, тонкая полоса с именем файла + кнопкой «Заменить».
- Drag events: `onDragEnter` → setIsOver, `onDragLeave` → unset, `onDrop` → preventDefault + извлечение `Array.from(e.dataTransfer.files)` → onFiles.
- Paste handler: `onPaste` → если `pastedText.length > 50` (примерно — отсечка от обычного коротенького пасте) → `detectFormat` → `onPasteText`.

#### `gui/designer/src/components/ImportStartScreen/MetaColumn.jsx`

**Props:** `{ length, topology, onTopologyChange, originOffset, onOriginChange, originHints, name, onNameChange, features, hasIUPAC, iupacChars, sanitizeReport }`

- 280 px фиксированная ширина (grid-template-columns у parent: `1fr 280px`).
- Block 1: `PlasmidMiniMap size={180}`.
- Block 2: topology toggle — пара круглых кнопок ◯ / —, активная зелёная (`--accent`), tooltip на hover.
- Block 3: `originOffset` input — visible only if `topology === 'circular'`. Number input, range `[1, length]`. Под полем — text-faint список intergenic regions (`originHints` — массив строк `1–60, 130–180, ...`). Кнопка «↻ применить» рядом с input применяет ротацию (вызывает `onOriginChange` который дёргает `rotateOriginToPosition`).
- Block 4: `name` input — placeholder «присвоится part_N если оставить пустым».
- Block 5: info-card — длина + features count + sanitize-report (если был paste с убранными символами, серая курсивная пометка `убрано: N цифр, M пробелов`).
- Block 6: warning-card — если `hasIUPAC === true`, жёлтый блок «Содержит IUPAC: R, Y, N — праймеры по таким участкам не дизайнятся».

#### `gui/designer/src/components/ImportStartScreen/MultiFileList.jsx`

**Props:** `{ items, onRename, onAnnotateToggle, onAllAnnotate, onNoneAnnotate }`

- Список строк, каждая: `PlasmidMiniMap size={46}` + inline-rename имя (contenteditable) + длина + features + checkbox auto-annotate.
- Imя через `contenteditable="true"` на span'е; CSS hover показывает иконку `✎`, focus → зелёная рамка + белый фон, save on `blur` (`onRename(item.id, span.textContent.trim())`).
- Снизу списка строка `[☑ всем] [☐ никому]` для batch toggle.

#### `gui/designer/src/components/ImportStartScreen/CatalogTree.jsx`

**Props:** `{ onSelectItem: (item) => void, query, onQueryChange }`

- Layout: tree слева (240 px), grid карточек справа (auto-fill, min-width 280 px, 2 колонки на стандартном viewport).
- Tree разделы: «Учебные / demo», «Моя библиотека» (Промоторы / CDS / Терминаторы / Репортёры / Теги — берутся из `parts[]` через filter по type), «Каталог SnapGene» (19 категорий из `plasmids-index.json`).
- Поиск над деревом — по имени и описанию: для index — фильтр по name+description прямо; для уже загруженных категорий — local search; для незагруженных — отложенно при раскрытии.
- Lazy-load: при открытии раздела SnapGene — `fetch('/plasmids-data/${cat}.json')`. Cache в local state. Pattern взят из удаляемого `CatalogPanel.jsx` (Code копирует логику оттуда перед удалением).
- Карточка: `PlasmidMiniMap size={64}` слева + name (bold) / description (muted) / `${length} bp` / badge `моё` (зелёный) или `demo` (нейтральный). Hover — поднятие на 1 px + тень.
- Click карточки → `onSelectItem(item)` → ImportStartScreen загружает item как parsed (как если бы это был импорт файла), переходит в `parsedItems.length === 1` state.

#### `gui/designer/src/components/ImportStartScreen/ActionsBar.jsx`

**Props:** `{ canCanvas, canLibrary, canAnnotate, mode: 'single' | 'multi', onAction: (id) => void }`

- 3 primary: `На канвас` (зелёный, primary accent) / `В библиотеку` / `Аннотировать`.
- При `mode === 'multi'` → 2 primary: `В библиотеку (N)` / `Аннотировать → в библиотеку`. На канвас визуально приглушён `disabled`.
- Действия ▾ — dropdown справа: Restriction / Мутагенез / Разобрать. В этом спринте — disabled stub'ы с тултипом «доступно для одиночной плазмиды на канвасе».

#### `gui/designer/src/components/ImportStartScreen/Toast.jsx`

**Props:** `{ items: string[], onOpenCanvas: () => void, onClose: () => void }`

- `items.length === 0` → render `null`.
- Fixed bottom-center, 600 px max-width, dark bg (`#1a1a1a`), white text. Зелёные ✓ перед каждым именем.
- Кнопка `Открыть холст →` справа (зелёная). Кнопка `✕` для скрытия (вызывает `onClose`).
- Stacking: при добавлении нового имени — appended в строку (с разделителем `·`), нет отдельных строк per item.

### 6.2 Изменения в существующих

#### `gui/designer/src/file-import.js`

- Существующий `handleFileImport(file) → ParsedItem` остаётся.
- Новый `handleFilesImport(files: File[]) → Promise<ParsedItem[]>` — sequential `for (const f of files) result.push(await handleFileImport(f))`. Прогресс-callback опционально (Code решает по UX надобности; не предписывается).
- Новый `parsePastedText(text: string) → ParsedItem | null` — `detectFormat` → если `genbank` → `parseGenBank`; если `fasta` → `parseFasta`; если `raw` → создать ParsedItem с `sanitizeWithReport(text).sequence`, `topology: 'linear'`, `name: ''`, `annotations: []`; если `unknown` → null.

#### `gui/designer/src/App.jsx`

- Удалить state `importDecisionPart`, `importDecisionTopology` (или их аналоги — Code находит). Удалить handler `handleImportDecisionAction`, `handleImportDecisionClose`.
- Заменить `<ImportDecisionModal .../>` на `<ImportStartScreen open={importStartOpen} onClose={...} presetFiles={importStartFiles} catalogExpandedInitial={importStartCatalogMode} />`.
- В `handleFileDrop` (строки ~165–178): принимать `Array.from(e.dataTransfer.files)` целиком, передавать в `setImportStartFiles` + `setImportStartOpen(true)`.
- Кнопка `📚 Каталог` в header → `setImportStartFiles([])` + `setImportStartCatalogMode(true)` + `setImportStartOpen(true)`.
- QuickStart кнопка `📂 Импортировать плазмиду` → `setImportStartOpen(true)` (без presetFiles, без catalog mode).
- Удалить импорты `ImportDecisionModal`, `CatalogPanel`. Удалить `<CatalogPanel .../>` и связанный state.

**После правки Code в отчёте сообщает финальный размер `App.jsx`.** Цель: ≤39 KB (сокращение). Если >40 KB — откатить и обсудить декомпозицию отдельной спекой (Sprint 2b в backlog).

#### `gui/designer/src/components/ImportDecisionModal.jsx`, `gui/designer/src/components/CatalogPanel.jsx`

- Удаляются. В `git rm` коммите.

### 6.3 Структура тестов

Целевой объём: **~17 тестов** (DECISIONS 22.04.2026: «≤20 на спринтах средней сложности»).

#### `gui/designer/src/__tests__/sanitize-with-report.test.js` — 4 теста

Характерные:
- Чистый ATGCATGC → removed = все нули, hasIUPAC = false.
- `"AT GC\n123 ATG"` → removed.whitespace = 2 + 1 (space, newline, space), removed.digits = 3, sequence = 'ATGCATG'.
- `"ATGCNNRYW"` → hasIUPAC = true, iupacChars = ['N', 'R', 'W', 'Y'].
- Empty input → пустая sequence, все нули.

#### `gui/designer/src/__tests__/format-detect.test.js` — 4 теста

- `"LOCUS pUC19 ..."` → `'genbank'`.
- `">seq1\nATGCATGC..."` → `'fasta'`.
- `"ATGCATGCATGCATGC"` (16 нт) → `'raw'`.
- `"hello world this is text"` → `'unknown'`.

#### `gui/designer/src/__tests__/rotate-origin.test.js` — 3 теста

- Linear sequence → no-op (sequence и annotations возвращаются без изменений).
- Circular простая ротация: 17 нт, origin pos 10, annotation [13..15] не пересекает рассечение → новая позиция [4..6].
- Circular wrap: annotation [3..7] до origin pos 10, после ротации становится joined (две части или wrapped flag — assert на форму, которую выбрал Code).

#### `gui/designer/src/components/__tests__/PlasmidMiniMap.test.jsx` — 3 теста

- Circular с features: render, проверить количество `<path>` равно числу regions.
- Empty annotations: render, проверить наличие одного path с цветом `featureColor('linker')`.
- Linear topology: render horizontal bar (другой root path).

#### `gui/designer/src/components/ImportStartScreen/__tests__/ImportStartScreen.test.jsx` — 5 интеграционных

- Single file загружается → MetaColumn появляется с topology toggle / originOffset / name input.
- Topology toggle linear → originOffset скрыт.
- Multi-file (5 items) → ActionsBar показывает только `В библиотеку (5)` и `Аннотировать → в библиотеку`; `На канвас` disabled; MultiFileList рендерит 5 строк.
- Paste IUPAC текст → warning-card «Содержит IUPAC» появляется.
- `На канвас` action → toast появляется с именем; повтор для другого item → toast обновляется (два имени с разделителем).

#### `gui/designer/src/__tests__/App.import-flow.test.jsx` — 1 регрессия

- Window-level drop трёх файлов → ImportStartScreen открывается с `parsedItems.length === 3`. (Один тест, не более — App.jsx wiring проверка.)

---

## 7. Порядок выполнения + оценка времени

Целевой суммарный объём — **22–25 ч Code**.

| K | Задача | Артефакты | Оценка |
|---|---|---|---|
| K1 | `sanitizeWithReport` + `format-detect` + `rotate-origin` модули и тесты | 3 модуля + 11 unit тестов | 3 ч |
| K2 | `PlasmidMiniMap` компонент + 3 теста | 1 файл | 3 ч |
| K3 | `ImportStartScreen/index.jsx` skeleton + InputZone + базовый state-management | 2 файла, частичный рендер empty + filled single | 4 ч |
| K4 | MetaColumn + интеграция originOffset / sanitize report / topology toggle | 1 файл + интеграция в index | 3 ч |
| K5 | ActionsBar + Toast + handlers `handleAction` для primary actions | 2 файла + handlers в index | 3 ч |
| K6 | MultiFileList + multi-file флоу + 3 интеграционных теста | 1 файл + расширение `file-import.js::handleFilesImport` + 3 теста | 3 ч |
| K7 | CatalogTree (lazy-load + поиск + grid) + интеграция с ImportStartScreen | 1 файл + 1 интеграционный тест | 4 ч |
| K8 | Wiring `App.jsx`: замена Modal+Catalog на ImportStartScreen, удаление старых компонентов, регрессия теста | App.jsx правка + 2 удаления + 1 регрессия | 2 ч |

**Естественные точки коммита:** после K1, K2, K4, K6, K7, K8 (минимум 6 коммитов; больше — нормально). К каждому K прилагается зелёный `npx vitest run` и `npx vite build`.

---

## 8. STOP-условие и формат отчёта

**STOP:** после K8 коммита `App.jsx` wiring + успешного `npx vitest run` (все ~17 новых + регрессия 846 → ≤866) и `npx vite build` без ошибок. **Code не финализирует** PROJECT_STATE.md / DECISIONS.md / BUGS.md и не переносит спеку в `docs/archive/` — это после визуальной приёмки в следующей сессии Chat.

**Формат отчёта в CURRENT_TASK.md (раздел Report):**

1. **Коммит-хэши** по K-шагам (короткий sha + title).
2. **Финальные счётчики тестов:** Vitest before / after, pytest (должен остаться 112).
3. **Build status** (`vite build`).
4. **Новые файлы и их размеры:**
    - `components/ImportStartScreen/index.jsx` ?? KB
    - `components/ImportStartScreen/InputZone.jsx` ?? KB
    - `components/ImportStartScreen/MetaColumn.jsx` ?? KB
    - `components/ImportStartScreen/MultiFileList.jsx` ?? KB
    - `components/ImportStartScreen/CatalogTree.jsx` ?? KB
    - `components/ImportStartScreen/ActionsBar.jsx` ?? KB
    - `components/ImportStartScreen/Toast.jsx` ?? KB
    - `components/PlasmidMiniMap.jsx` ?? KB
    - `format-detect.js` ?? KB
    - `rotate-origin.js` ?? KB
5. **Изменения в существующих:** `App.jsx` size before / after, `file-import.js` size before / after, `sequence-utils.js` size before / after.
6. **Удалённые файлы:** `ImportDecisionModal.jsx`, `CatalogPanel.jsx`.
7. **Size budget check** (см. CLAUDE.md §7): новые нарушители hard, файлы выросшие >5 KB. Если ни одного — `size budget: OK`.
8. **Отклонения от спеки** — явный блок. Не «всё по спеке», а конкретные расхождения, даже мелкие. Если что-то не сделано — указать причину и предложение (например, выбор формата `joined` annotation, где спека оставила Code на усмотрение).
9. **Что я (Code) рекомендую проверить визуально первым делом** — 3–5 пунктов (e.g. catalog tree lazy-load на категории Cloning; topology toggle с большой плазмидой; toast accumulation после 3+ нажатий «На канвас»).

---

## 9. Риски

1. **Размер `ImportStartScreen/index.jsx` может выйти за soft 30 KB** — состояние большое (8+ полей) + много условного рендеринга 4 mode'ов (empty/compact/single/multi). **Митигация:** root содержит только state + handlers + branching, весь рендер в sub-модулях. Если index.jsx прогнозируется ≥30 KB к K6 — Code останавливается и предлагает вынести state в хук `useImportState()` (отдельный файл).

2. **Ротация origin с `joined` annotations** — нетривиальная семантика. Если в проекте сейчас нет паттерна joined annotations (`complement(join(...))` GenBank), Code выбирает простую форму: две отдельные annotations с общим `id`-prefix и одинаковыми `name`/`type`. **Митигация:** assert в тесте только на корректность координат каждой части, не на конкретный shape. См. OQ-1.

3. **App.jsx 39.29 KB → переваливание hard 40 KB при wiring** — гипотеза маловероятна (правки сокращающие), но возможна. **Митигация:** Code в отчёте указывает финальный размер; если >40 KB — откатывает wiring K8 и предлагает Sprint 2b декомпозицию App.jsx как блокер. Тогда этот спринт частично пройдёт visual review (всё кроме одной точки входа), Sprint 2b разруливает App.jsx, потом отдельный pass завершает wiring.

4. **Multi-file batch parsing блокирует UI** при N≥10 файлов с большими `.dna`. **Митигация:** sequential parsing с `await` + visual indicator (spinner или прогресс bar в InputZone при импорте) — Code решает форму. Web Worker — OUT этого спринта (если N в реальной практике >20, поднимем в backlog).

5. **CatalogTree поиск по 2822 плазмидам через index.json** — index ~867 KB, парс на каждом open модалки. **Митигация:** один fetch при первом open, cache в module-level переменной (как уже делает `CatalogPanel.jsx`). Code копирует pattern. Поиск по уже-распарсенному index — синхронный, < 50 ms на типичной машине.

---

## 10. Открытые вопросы

**OQ-1 (для Code на K1).** Существует ли в проекте паттерн `joined` annotations (т.е. рендеринг single annotation с двумя или более несмежными `parts`)? Это важно для wrap-поведения `rotateOriginToPosition`. Если да — `rotate-origin.js` собирает `wrapped: true` + `parts: [{start, end}, {start, end}]`. Если нет — две отдельные annotations с общим `id`-prefix (`{id}_part1`, `{id}_part2`) и одинаковыми `name`/`type`. Code проверяет в `genbank-parser.js` (`complement(join(...))` parsing) и в `annotation-model.js`, выбирает совместимое решение, фиксирует выбор в отчёте.

**OQ-2 (для Code на K1).** `parseGenBank` останавливается на первом `//`. Decision этапа (2) точка 2: «все записи попадают пакетом». Реализация: либо extension существующего `parseGenBank` на параметр `multi: true` (возвращает массив), либо новая `parseGenBankMultiRecord(text) → ParsedItem[]`. **Рекомендация:** extension с дефолтным `multi: false` для обратной совместимости + тест на 2-record fixture. Code выбирает форму, фиксирует в отчёте.

**OQ-3 (для приёмки в следующей Chat-сессии).** Поведение action `Аннотировать` для multi-file: каждое включённое в чекбокс item получает `autoAnnotate + enrichWithCommonFeatures` перед `addPart`, или сначала batch, потом show progress? UX-вопрос для визуальной приёмки. В этом спринте — последовательно, без specific progress UI; если в приёмке выяснится что заметная задержка на 5+ файлов — добавим progress bar отдельным fix'ом.

---

_Создан 27.04.2026, этап (3) workflow Import & Preview по решениям этапа (2) (CURRENT_TASK.md ‹Workflow Import & Preview / этап (2)›)._
