# Sprint IS-Final — финальный редизайн ImportStartScreen

**Статус:** ✅ РЕАЛИЗОВАНО 28.04.2026 (commits `5748521` K0–K4 + `a34674e` K5–K9; visual acceptance PASS, 5 follow-up багов V43–V47 в BUGS.md/OPEN, закрываются Sprint Catalog Polish).
**~~Прежний статус:~~** ~~🟢 Активная спека (28.04.2026)~~
**Цель:** свести импорт-экран к одному устойчивому состоянию: каталог слева всегда виден, inspector справа реагирует на выбор. Закрыть UX-долг и сделать архитектуру такой, чтобы дальнейшие правки не плодили модальных state'ов.

**Не в скоупе** — отдельные спринты:
- Палитра v2 (`feature-palette.js`) — отдельный исследовательский effort
- V40 manual annotation editor — Sprint Annotation-Commits (заблокирован TD-ARCH-ANNOTATION-VERSIONING)
- V31 Map rescales on resize, V8 PlasmidViewer warnings, V45 linear-mode подписи

---

## 0. Размеры затрагиваемых модулей

| Файл | Сейчас | После | Дельта |
|---|---|---|---|
| `components/ImportStartScreen/index.jsx` | 23.8 KB | ~17 KB | сокращение (вынос multi + удаление `catalogExpanded`) |
| `components/ImportStartScreen/CatalogTree.jsx` → `CatalogPanel.jsx` | 9.8 KB | ~14 KB | rebuild (cross-search + drop-footer) |
| `components/ImportStartScreen/FileSummaryCard.jsx` | 9.3 KB | ~10 KB | косметика |
| `components/ImportStartScreen/MetaColumn.jsx` | 6.1 KB | 6.1 KB | без изменений |
| `components/ImportStartScreen/InputZone.jsx` | 7.8 KB | **удаляется** | роль раздаётся в CatalogPanel и SingleInspector |
| `components/ImportStartScreen/MultiFileList.jsx` | 4.1 KB | **удаляется** | роль занимает MultiInspector |
| `components/ImportStartScreen/ActionsBar.jsx` | 4.9 KB | ~5 KB | косметика — Аннотировать в `⋯` |
| `components/ImportStartScreen/SingleInspector.jsx` | NEW | ~10 KB | вынос single-блока из index.jsx |
| `components/ImportStartScreen/MultiInspector.jsx` | NEW | ~7 KB | замещает MultiFileList |
| `components/PlasmidMiniMap.jsx` | ~10 KB | +~2 KB | hover-bridge + smart labels |

Все модули комфортно ниже soft-зоны (.jsx soft 30 KB / hard 40 KB; .js soft 20 KB / hard 25 KB). Декомпозиция текущих файлов не требуется.

---

## 1. Контекст

### Что не работает после Polish (commit `fed06f0`, 27.04.2026)

**1.1 Четыре state'а ImportStartScreen.** Сейчас компонент — машина состояний (empty / catalogExpanded / single / multi). После выбора плазмиды из каталога нет кнопки «вернуться в результаты поиска» — `catalogExpanded` уже схлопнулся, остаётся только `↻ замена файла` (полный reset) или ✕ модалки. Пункт #1 списка Игоря 28.04.2026.

**1.2 Поиск ищет по выбранной категории, не по всей базе.** В `CatalogTree.jsx::filtered` — `.filter()` от `items` (контент текущего active node). Биолог ввёл `pAC94` в search — ничего не нашлось пока не выбрал «CRISPR Plasmids». Корень: search фильтрует уже загруженный category-items, а не весь catalog index. Решение в спеке — построить cross-category flat-cache при первом запросе.

**1.3 Hover-bridge на mini-map overlay.** V38 mini-fix-2: 64 px карточка → mouseenter → 180 px popover, mouseleave → close. Между ними зазор 5–10 px; при движении к leader-label курсор пересекает зазор и закрывает overlay. Стандартная hover-bridge problem. Решение — debounced close (250 ms cancellable timer).

**1.4 Leader-label placement не учитывает биологическую важность.** В `PlasmidMiniMap.jsx::buildLabels` фильтр `frac >= 0.10` (10% окружности). На 14 kb плазмиде Ori 600 bp = 4% — не проходит. Решение — двухступенчатый отбор: priority class (resistance / origin / promoter / tag) подписывается **независимо от длины** (с hard-cap по типу), затем top-N по длине из остальных, threshold 3%.

**1.5 FileSummaryCard визуально неоднороден.** Категории — wrap-flex в строку, CDS — табличный список, RE-сайты — wrap-flex, заголовок «Уникальные/редкие сайты» без слова «рестрикции», overflow `…ещё N CDS` некликабелен. Решение — единый табличный формат для всего что является **списком регионов** (категории + CDS), плюс косметические правки заголовков и кликабельный overflow.

**1.6 V35 master-checkbox в multi-mode.** Сейчас две отдельные кнопки `[☑ всем] [☐ никому]` — биолог: «уродство». Решение — один tristate master-checkbox (`indeterminate` для частичного выбора) в header столбца «Аннотация».

### Якоря в репо
- `components/ImportStartScreen/index.jsx` (orchestrator после Polish 24 KB)
- `components/ImportStartScreen/CatalogTree.jsx` (основной редизайн)
- `components/PlasmidMiniMap.jsx` (leader-label + hover-bridge)
- `feature-palette.js` — **не трогаем** в этом спринте
- DECISIONS.md ⚓ 22.04.2026 (лимиты модулей), Polish ⚓ 27.04.2026 (Plasmid-Git, V40 блок)

---

## 2. Стратегия

Свести ImportStartScreen к **одному устойчивому layout'у** двух колонок. Empty / single / multi — это разные содержимые правой колонки (inspector); левая колонка (каталог + библиотека + drop-zone) **всегда видна**. Возврат к каталогу = клик слева. Никаких back-кнопок и transition-states.

```
┌────── Старт сборки ────────────────────────── ✕ ┐
│ ┌──────────────────┬───────────────────────────┐│
│ │ 🔍 поиск         │  Inspector:               ││
│ │ ▾ Учебные        │   empty  → placeholder    ││
│ │ ▾ Моя библиотека │   single → SingleInspector││
│ │ ▾ Каталог        │   multi  → MultiInspector ││
│ │ ─── 📥 загрузка──│                           ││
│ │ drop / picker    │                           ││
│ └──────────────────┴───────────────────────────┘│
└──────────────────────────────────────────────── ┘
```

Левая колонка: фикс. ширина 320 px. Правая: flex-1. Высота прежняя (max-h 92vh).

---

## 3. Архитектурные решения

1. **`catalogExpanded` state удаляется.** Каталог всегда развёрнут в левой колонке.
2. **`InputZone` упраздняется как отдельный компонент.** Drop-zone + file picker → подвал левой колонки. Filled-state header → переезжает в новый `SingleInspector`. Compact strip и progress bar — переходят в drop-zone подвал.
3. **Cross-category search.** На mount грузится `/plasmids-index.json` (имена + counts). При первом наборе текста в search → `Promise.all` всех 19 category JSON'ов в `_categoryCache`, затем фильтрация flat-array. Последующие запросы — мгновенно. Search by `name`, `description`, length-pattern (`>5000`, `<2kb`, `2k-3k`).
4. **«Моя библиотека» включена в search**, как и SnapGene catalog. Демо-секция тоже.
5. **Hover-bridge debounce.** В `PlasmidMiniMap.jsx`: `mouseleave` → `setTimeout(closeOverlay, 250)`; `mouseenter` (на trigger или overlay) → `clearTimeout`.
6. **Smart leader-labels — priority + threshold.** Двухступенчато:
   - **(a) priority class**: `resistance` (hard-cap 5), `origin` (3), `promoter` (3), `tag` (2). Без length-фильтра. По длине внутри типа.
   - **(b) добор из остальных** по длине, threshold 3%, до `MAX_LABELS = 8`.
7. **Inspector — три варианта:** empty (placeholder), single (`SingleInspector`), multi (`MultiInspector` — новый компонент, замещает MultiFileList в роли primary).
8. **`Аннотировать` уходит из основного footer'а** в `⋯` dropdown как `📥 Авто-аннотация`. Footer становится короче: `[На канвас] [В библиотеку]  ⋯`. Семантика: «обычный flow слева, продвинутое под троеточием». V40 manual editor — отдельный спринт.

---

## 4. Предположения

1. `/plasmids-index.json` стабилен (формат `{ categories: [{slug, name, count}] }`). **Проверено** — используется в текущем `CatalogTree.fetchIndex`.
2. Каждая category JSON содержит `plasmids: [{name, sequence, length, topology, annotations, description}]`. **Проверено** в Polish.
3. `getRegions()` детерминированно возвращает regions с `id`. **Проверено** (Map-WS-1).
4. `isResistanceMarker(r)` уже экспортируется из `FileSummaryCard.jsx` (Polish §4a). **Проверено**.
5. `useStore` Zustand имеет `parts[]`, `addPart`, `addFragmentDirect`. **Проверено**.
6. Ctrl+V flow ловится в `App.jsx` или в `InputZone`. **Не проверено** — K0 шаг.
7. Drag-drop файлов в multi mode — единственный способ попасть в multi. Catalog click добавляет один item. **Проверено**.

---

## 5. K-этапы

### K0. Pre-flight (15 мин)

1. `npx vitest run` — baseline 937 пройдены (Polish), `npx vite build` clean.
2. Найти Ctrl+V handler. Если в `InputZone` — поднять на App-level или перенести в drop-zone подвал левой колонки. Если уже на App-level — без действий.
3. Снять скриншоты текущего state'а: empty / single / multi на трёх плазмидах (pAC94 single, два файла из catalog для simulated multi). Сохранить ссылки в `CURRENT_TASK.md`.

### K1. SingleInspector — extract component (45 мин)

Создать `components/ImportStartScreen/SingleInspector.jsx`. Вынести `single`-ветку из `index.jsx` (после Polish это grid `[1fr_280px]` с InputZone filled + SessionSummary + FileSummaryCard слева, MetaColumn справа).

**Props:** `parsedItem`, `topology`, `onTopologyChange`, `originOffset`, `onOriginOffsetChange`, `onApplyOrigin`, `originHints`, `name`, `onNameChange`, `sanitizeReport`, `lastActionStatus`, `addedItems`, `onAction(id)`, `onCloseSession`, `exportEnabled`, `hasParsedItem`.

**Структура:** одна grid-колонка (главная область) + узкая правая 200 px (mini-map + topology toggle + origin offset). Title row (InlineEditableTitle + sanitize summary + subtitle + ↻ замена файла link) — **сверху на всю ширину**. ActionsBar — снизу на всю ширину.

**Отличие от Polish:** правая колонка inspector'а сужается с 280 → 200 px; основная область получает больше горизонтального места для FileSummaryCard. mini-map уменьшается до 160 px (в API PlasmidMiniMap прогон `size` уже параметризован).

**Тесты (3 новых):**
- renders with valid parsedItem → title + mini-map + categories present
- empty parsedItem → returns null
- onAction propagation для `'canvas'` / `'library'` / `'replace'`

### K2. MultiInspector — replace MultiFileList в роли primary (60 мин)

Создать `components/ImportStartScreen/MultiInspector.jsx`. Это **новый компонент** (не модификация MultiFileList). Старый MultiFileList удаляется в K8.

**Props:** `items`, `annotateSet`, `onRename(item, newName)`, `onAnnotateToggle(name)`, `onAnnotateMaster('all'|'none')`, `onRemoveItem(item)`, `onAction(id)`.

**Структура:**
- Header: `Загружено N файлов` + `↻ заменить все` link.
- Таблица: колонки `Имя` (inline-editable), `Длина`, `Регионов`, `Аннотация` (row checkbox), `✕ удалить`.
- Header столбца «Аннотация» содержит **tristate master-checkbox** (`indeterminate` для partial state). Цикл клика: `none → all → some → all → none`. Реализация: native `<input type="checkbox">` + `useEffect(() => { ref.current.indeterminate = state === 'some' })`.
- Footer: `[На канвас] (disabled)` + `[В библиотеку (N)]` + `⋯` dropdown.

`⋯` dropdown в multi:
- `📁 Заменить весь batch` (=onAction('replace'))
- `🗑 Удалить весь batch` (с confirm, =onAction('delete-all'))

`onRemoveItem(item)` — удаляет один файл из batch'а. Если осталось 0 → empty inspector. Если 1 → single inspector с ним.

**Тесты (8 новых):**
- master tristate cycle (all→none, none→all, some→all)
- master-checkbox indeterminate=true при mixed state
- single row toggle invokes onAnnotateToggle
- onRemoveItem удаляет из items
- footer count `В библиотеку (N)` корректен
- На канвас disabled с tooltip
- `⋯` dropdown — 2 entries (replace, delete-all)
- delete-all → window.confirm

### K3. CatalogPanel — left column rebuild (90 мин)

Переименовать `CatalogTree.jsx` → `CatalogPanel.jsx`. Проверить grep'ом что имя `CatalogPanel.jsx` свободно (старый удалён в Sprint Import-Start-Screen).

**Структура:**
- Search input (top, sticky).
- Three collapsible groups: «Учебные / demo», «Моя библиотека», «Каталог SnapGene».
- Drop-zone footer (~120 px фикс. высота, отделена top-border).

**Cross-category search:**
- На mount грузится `/plasmids-index.json` (как сейчас).
- Когда пользователь вводит первый символ в search input AND `_flatCache === null` → `prefetchAllCategories()`: `Promise.all` всех слугов из `index.categories[]`. Пока идёт загрузка → правая панель показывает «Поиск во всех категориях…». После — `_flatCache` готов.
- Каждый keystroke — фильтр `_flatCache + parts[] + demo seeds` по name / description / length-pattern.
- Length-pattern parser:
  - `>5000` или `>5kb` → length > 5000
  - `<2000` или `<2kb` → length < 2000
  - `2k-3k` или `2000-3000` → between
  - всё остальное — substring по name + description
- Когда search empty AND activeNode выбран → items активной категории (текущее поведение).
- Когда search empty AND activeNode null → placeholder в правой панели «Выберите категорию или начните искать».

**Collapsible groups:** каждый top-level group имеет header с `▾/▸`. Default state: «Моя библиотека» развёрнуто, «Каталог SnapGene» свёрнут, «Учебные» развёрнуто. State в `localStorage` под ключом `pvcs-catalog-group-{groupKey}`.

**Drop-zone footer:**
- Фикс. высота 120 px, отделена top-border от tree.
- Содержимое: `⬇ Перетащите файл сюда / .dna · .gb · .gbk · .fasta — формат определится сам / или выберите файл (link) / или вставьте Ctrl+V`.
- При drag-over — emerald border emphasize.
- Hidden `<input type="file" multiple accept="...">` (V36 pattern сохраняется).
- Click на dropzone → opens native picker (V36).
- `progress` overlay при batch-parse `{current, total}` поверх drop-zone (полупрозрачный).

**Тесты (10 новых):**
- search empty + activeNode null → placeholder
- search with text + activeNode null → triggers prefetchAllCategories (mock fetch)
- search results show `_badge` from each category
- length-pattern parsing — `>5000`, `<2kb`, `2k-3k`
- collapsible group state persisted в localStorage
- drop-zone accepts files + invokes onFiles
- drop-zone file picker click invokes onFiles
- drop-zone Ctrl+V paste → onPasteText (если text > 50 chars)
- progress overlay при `progress.total > 1`
- tree click → activeNode set + items load (regression)

### K4. ImportStartScreen — orchestrator simplification (60 мин)

`index.jsx` — переписать main render-block:

```
Title bar (✕)
Body (flex-row):
  <CatalogPanel ...320px />   ← всегда
  <Inspector ...flex-1 />:
    if empty  → <EmptyInspector />
    if single → <SingleInspector ... />
    if multi  → <MultiInspector ... />
```

State live на ImportStartScreen, без изменений из Polish: `parsedItems`, `topology`, `originOffset`, `name`, `pasteText`, `sanitizeReport`, `addedItems`, `pendingMultiAnnotate`, `importError`, `actionBusy`, `lastActionStatus`, `pendingMultiParse`.

Удаляются: `catalogExpanded` state, ветки `if (empty && !catalogExpanded)` / `if (empty && catalogExpanded)`.

**`onSelectItem` от CatalogPanel:**
- если `parsedItems.length === 0` → создаём single (как сейчас).
- если `parsedItems.length === 1` → `window.confirm("Заменить текущий файл?")`. На OK — single → новый item. На Cancel — ничего.
- если `parsedItems.length >= 2` (multi) → каталог item-buttons имеют `disabled` attribute с tooltip «сначала завершите batch».

`handleFilesImport` (drag-drop / picker / Ctrl+V) — на single показывает confirm; на multi — добавляет к существующим parsedItems.

**EmptyInspector** — inline функция в index.jsx (≤30 строк) или отдельный файл если предпочитаете. Отображает «👈 Выберите плазмиду слева или перетащите файл / Ctrl+V».

**Тесты (5 новых, точечные):**
- empty state renders EmptyInspector
- catalog click on empty → state goes to single
- catalog click on single → window.confirm called с «Заменить текущий файл?»
- catalog click on multi → disabled (no state change)
- drag-drop files on empty → state goes to single или multi по count

### K5. PlasmidMiniMap — hover-bridge debounce + smart leader-labels (75 мин)

В `components/PlasmidMiniMap.jsx`:

**5.1 Hover-bridge debounce.** Добавить `closeTimer = useRef(null)` + helpers `scheduleClose()` (setTimeout 250ms → setOverlayOpen(false)) и `cancelClose()` (clearTimeout). На trigger: `mouseenter` → cancelClose + setOverlayOpen(true); `mouseleave` → scheduleClose. На overlay container: тот же `mouseenter` / `mouseleave` cancel-or-schedule. Cleanup: `useEffect(() => () => clearTimeout(closeTimer.current), [])`.

**Тесты (3 новых):**
- mouseenter → overlay opens
- mouseleave on trigger → overlay closes after ~250ms (использовать `vi.useFakeTimers`)
- mouseleave on trigger + mouseenter on overlay within 250ms → overlay stays open

**5.2 Smart leader-labels.** Заменить функцию `buildLabels(regions, totalLen, cx, cy, r)`:

Двухступенчатый pick:
- **(a) Priority class scan** в порядке: resistance → origin → promoter → tag. Для каждого класса фильтруется `regions.filter(r => !used.has(r.id) && classMatch(r))`, сортируется по `r.end - r.start` desc, берётся top-`hardCap`. Hard-caps: resistance=5, origin=3, promoter=3, tag=2. Каждый pick → `used.add(r.id)`. Брeak если `picks.length >= MAX_LABELS = 8`.
- **(b) Fallback fill** — из оставшихся (`!used`) по `frac = (end-start) / totalLen`, threshold 0.03 (3% — было 0.10), сортировка по `span` desc, добор до `MAX_LABELS - picks.length`.

Existing collision-staggering сохраняется без изменений (применяется к финальному `picks` массиву).

**Class match functions:**
- `resistance` — `isResistanceMarker(r)` (импортируется из `FileSummaryCard.jsx`; либо Code выносит его в `src/biological-classifiers.js` — на усмотрение).
- `origin` — `r.type === 'rep_origin' || /^(ori|pUC ori|f1 ori|ColE1|p15A|2[μu]|ARS|CEN|pMB1|R6K|pBR322 ori)/i.test(r.name)`.
- `promoter` — `r.type === 'promoter'`.
- `tag` — `r.type === 'tag' || /^(His[6-9]?|FLAG|HA|c?-?Myc|GFP|EGFP|mCherry|mTagBFP|T7-?tag|Strep-?II?|S-?tag|V5|VP(16|64|160))/i.test(r.name)`.

Constants: `MAX_LABELS = 8`, `LABEL_THRESHOLD = 0.03`, `LEADER_LEN`, `LABEL_RING`, `COLLISION_RAD` — без изменений.

**Тесты (5 новых):**
- pUC19 (AmpR + ori) → оба подписаны независимо от длины
- 14 kb плазмида с ori 600 bp (frac=0.04) → ori подписан (раньше не проходил 10%)
- 4 promoters → только 3 первых по длине (hardCap=3)
- 0 priority matches → fallback к top-N-by-length с threshold 3%
- collision-staggering сохраняется (regression existing test)

### K6. FileSummaryCard cosmetic unification (45 мин)

В `components/ImportStartScreen/FileSummaryCard.jsx`:

**6.1 Единый табличный формат для категорий и CDS.** Все списки регионов (4 категории + CDS) рендерятся одним helper'ом `<CategorySection icon label regions>` который содержит header `[icon] [LABEL] (N)` и список row'ов `<ItemRow region>`. Каждый row: `[dot] [name truncate] [bp font-mono]` с правым выравниванием bp.

**Не меняется:**
- Type-counter strip (`9 CDS · 5 promoter · …`) — остаётся summary в верху.
- RE-сайты — остаются wrap-flex (`1× AfIII · 1× AscI`), потому что у них нет bp-длины (только cut-count).
- Warnings collapsible — без изменений (Polish §4d).

**6.2 Заголовки секций — переименования:**

| Было | Станет |
|---|---|
| `🛡 Селекция: a · b` (inline) | `🛡 СЕЛЕКЦИЯ (N)` table-section header |
| `📣 Промоторы: …` | `📣 ПРОМОТОРЫ (N)` |
| `⚓ Origin: …` | `⚓ ORIGIN (N)` |
| `🏷 Tags: …` | `🏷 TAGS (N)` |
| `CDS (N)` | `CDS (N)` (unified format) |
| `УНИКАЛЬНЫЕ/РЕДКИЕ САЙТЫ` | `🔬 САЙТЫ РЕСТРИКЦИИ` |

**6.3 Кликабельный overflow CDS.** Local state `showAllCDS = useState(false)`. Кнопка `…ещё N CDS` при click → `setShowAllCDS(true)`, тогда показываются все, без overflow row. Свернуть нельзя в этой версии (expand-only).

**Тесты (4 обновляются + 2 новых):**
- (обновляются) `categorizeAnnotations` тесты — без изменений (helper тот же)
- (обновляется) FileSummaryCard render — все 5 секций (4 cat + CDS) в одинаковом формате (presence selectors `[data-testid^="cat-"]` + `[data-testid="file-summary-cds-list"]`)
- (новый) overflow click expands — `…ещё N CDS` → click → 5 → all rows visible
- (новый) RE-секция называется `🔬 САЙТЫ РЕСТРИКЦИИ`
- (обновляется) Polish-тесты на категории остаются зелёные после переформатирования

### K7. ActionsBar refactor — `Аннотировать` в `⋯` dropdown (30 мин)

В `components/ImportStartScreen/ActionsBar.jsx`:

**7.1 Single mode footer:**
- Основная строка: `[На канвас] [В библиотеку]  |  ⋯` (divider остаётся, теперь между destinations и `⋯`).
- Кнопка `[Аннотировать]` из основной строки **удаляется**.
- `⋯` dropdown содержимое:
  - `📥 Авто-аннотация` (новая позиция, было в основной строке как «Аннотировать», семантика та же — `onAction('annotate')`)
  - `📁 Заменить файл` (existing)
  - `─────────`
  - `💾 Скачать как .gb` (existing)
  - `🗑 Удалить из сессии` (existing)

**7.2 Multi mode footer:** реализуется в K2 (внутри MultiInspector). ActionsBar в multi-mode не используется напрямую — вся footer-логика multi живёт в MultiInspector.

**Тесты (3 обновляются):**
- (обновляется) single-mode footer не содержит кнопку «Аннотировать» в основной строке
- (новый) `📥 Авто-аннотация` в dropdown'е → `onAction('annotate')`
- (обновляется) divider присутствует — между `[В библиотеку]` и `⋯`

### K8. Удаление старых файлов и тестов (15 мин)

После K1–K4:
- `components/ImportStartScreen/InputZone.jsx` — больше нигде не импортируется.
- `components/ImportStartScreen/MultiFileList.jsx` — больше нигде не импортируется.

`git rm` оба. Потом:
- Grep'ом проверить `import .* from .*InputZone` и `import .* from .*MultiFileList` в `src/` — должно быть 0 совпадений.
- Найти `__tests__/`-файлы, которые ссылались на эти компоненты по directory pattern. Отметить какие тесты:
  - тестировали flow (paste длиной >50 chars в InputZone) — перенести в новый CatalogPanel test.
  - тестировали helper или layout — удалить, т.к. компонент мёртв.

Список ожидаемо удаляемых тестов (Code проверит и подтвердит):
- `__tests__/import-mopup-kfix7.test.jsx` (если он целиком про InputZone)
- `__tests__/multi-file-list-*.test.jsx` (если есть такие)
- Возможно отдельные тесты в `import-start-screen.test.jsx`, проверяющие `catalog-disclosure` testid (его больше нет).

Перенесённые тесты (drop-zone behaviour из InputZone-тестов) — добавить в новый `catalog-panel.test.jsx`.

### K9. Финальный sanity + commit (15 мин)

```bash
cd gui/designer && npx vitest run
npx vite build
```

Ожидание: 937 → ~975-985 passing (+~40 новых, –~5-8 удалённых старых InputZone/MultiFileList тестов).

Коммит:
```
Sprint IS-Final: catalog-first ImportStartScreen — single layout, cross-search, smart labels, hover-bridge debounce, FSC unification

Closes V35 (master tristate checkbox in multi).
Reframes V38 (overlay still hover-triggered, now with bridge debounce).
Closes #1 (back navigation — left tree always visible).
Closes #5 (catalog + library + drop-zone in one persistent left column).
Partial close on #2 (mini-map hover bridge debounced 250 ms).
Partial close on #3 (smart leader-labels — priority class + 3 % threshold + N hard caps).
Partial close on #3d (FSC categories + CDS unified table format).
Partial close on #3e (RE-section relabeled «🔬 Сайты рестрикции»).
Closes #3f (overflow «…ещё N CDS» now clickable expand).
Search now globally cross-category (prefetch + flat-cache).

Out of scope (separate sprints):
- Palette v2 — colors not redesigned
- V40 — manual annotation editor blocked by TD-ARCH-ANNOTATION-VERSIONING
- V31 / V8 / V45 — separate component bugs
```

---

## 6. Порядок выполнения + оценка

K0 → K3 (CatalogPanel — самое крупное; делать первым чтобы Inspector мог опираться на новый layout)
→ K1 (SingleInspector extract)
→ K4 (orchestrator переписать с CatalogPanel + SingleInspector — empty + single работают)
→ K2 (MultiInspector — multi работает)
→ K5 (PlasmidMiniMap hover-bridge + smart labels)
→ K6 (FileSummaryCard косметика)
→ K7 (ActionsBar refactor)
→ K8 (cleanup)
→ K9 (commit)

**Total estimate: ~6.5 часа Code.** Рекомендуется разбить на **2 коммита**:
1. **K0–K4** «catalog-first layout works» (~3.5 ч)
2. **K5–K9** «mini-map polish + cleanup» (~3 ч)

Между коммитами — `npx vitest run && npx vite build` зелёный.

---

## 7. STOP-условие

После K9 коммита Code останавливается, отчёт:
- 1–2 коммит-хэша
- Финальные test counts (Vitest + pytest)
- Build status
- Список удалённых старых тестов с обоснованием (K8)
- Отклонения от спеки

**Не финализировать** PROJECT_STATE.md / DECISIONS.md / BUGS.md — это работа Chat в следующей сессии после визуальной приёмки.

Визуальная приёмка — отдельная сессия, после compact.

---

## 8. Риски

1. **`prefetchAllCategories`: 19 fetch'ей × 100–300 KB JSON каждый.** Сетевая нагрузка. Митигация: на dev (localhost) не критично; на prod — нагрузка на static-host'е терпима. Если при будущем переходе на API → заменим на серверный flat-search endpoint. Не блокер.
2. **`isResistanceMarker` импорт cross-folder.** Сейчас в `FileSummaryCard.jsx`, нужен в `PlasmidMiniMap.jsx`. Code вправе вынести в общий `src/biological-classifiers.js` (~3 KB, новый файл) — это чище и убирает циркулярные риски. Решение оставлено на Code.
3. **Удаление `catalogExpanded` ветки → существующие тесты на `catalog-disclosure` button и `catalog-collapse` button развалятся.** Митигация: в K8 grep'ом найти и удалить/обновить под новую модель.
4. **Click на каталог при single уже открыт — confirm prompt** может раздражать частыми clicks. Альтернатива: silent replace. Текущее решение — confirm чтобы не потерять данные. Если на приёмке окажется громоздко — переключим в follow-up.
5. **Tristate master checkbox через `indeterminate` ref.** Стандартный pattern, но требует `useEffect(() => { ref.current.indeterminate = state === 'some' })`. Если Code забудет — checkbox всегда `☑/☐` без `[-]`-state. Митигация: один из тестов V35 обязательно проверяет `indeterminate=true` при mixed.

---

## 9. Открытые вопросы

1. **«Удалить весь batch» в multi-mode — нужен?** Симметричен с single `🗑 Удалить из сессии`. Решение: **оставить**.
2. **«Скачать все как .gb» в multi-mode** — TODO, не в этом спринте.
3. **`biological-classifiers.js` появится** (Risk #2) — путь `gui/designer/src/biological-classifiers.js` рядом с `feature-palette.js`. Решение Code.
4. **Drop-zone в left column footer — фикс. высота 120 px** или auto-shrink при tree overflow? Решение: **фикс 120 px**, tree выше скроллируется. Биологу важна устойчивая позиция drop-zone.

---

**Дата создания:** 28.04.2026
**Источник:** обсуждение в Chat 28.04.2026 после Polish acceptance + UX-issues от Игоря (catalog return, hover-bridge, leader-labels, palette, search scope, FSC inconsistency).
