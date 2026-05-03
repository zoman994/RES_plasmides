# Sprint Catalog Polish — V43–V48 follow-up по ImportStartScreen IS-Final

**Тип:** bugfix
**База:** v0.5.4-alpha, коммит `b155e03` (финал Sprint App-Decomp 28.04.2026, App.jsx 30.56 KB)
**Предпосылка:** 6 follow-up багов после визуальной приёмки Sprint IS-Final (28.04.2026): один P1 регрессия базового use-case, два P2 UX-bug, три P3 polish. Спека написана отдельной Chat-сессией 28.04.2026 (вторая); предыдущая Chat-сессия упоминала готовую спеку, но фактически файл потерян — пишем с нуля.

---

## 0. Срез размеров затрагиваемых модулей

`list_directory_with_sizes` snapshot 28.04.2026 (после Sprint App-Decomp).

| Файл | Размер | Лимит | Зона |
|------|--------|-------|------|
| `App.jsx` | 30.56 KB | 40 KB | soft (на самой границе warning 30 KB) |
| `components/ImportStartScreen/CatalogPanel.jsx` | 18.67 KB | 40 KB | OK |
| `components/ImportStartScreen/index.jsx` | 17.79 KB | 40 KB | OK |
| `components/PlasmidMiniMap.jsx` | 13.62 KB | 40 KB | OK (warning signal +6.17 KB за прошлый цикл — фиксируем в §9) |
| `components/ImportStartScreen/MetaColumn.jsx` | 6.15 KB | 40 KB | OK |
| `components/ImportStartScreen/SingleInspector.jsx` | 5.39 KB | 40 KB | OK |
| `components/QuickStart.jsx` | 2.83 KB | 40 KB | OK |
| `components/ImportStartScreen/SessionSummary.jsx` | 2.71 KB | 40 KB | OK |

Декомпозиция первым пунктом не требуется. App.jsx на soft-границе — V45 (K4) удаляет код, размер уменьшится. Подробности в §9 (Риски).

---

## 1. Контекст

После закрытия Sprint IS-Final 28.04.2026 (двухколоночный ImportStartScreen, постоянный CatalogPanel + Inspector) визуальная приёмка выявила 6 багов. Корни — в новой оркестрации `index.jsx` + рендере `CatalogPanel` + неполном leader-labels алгоритме `PlasmidMiniMap`.

**Краткий перечень с привязкой к BUGS.md:**

- **V43 P1** `На канвас` always-append. Регрессия базового use-case BodgeGene как конструктора сборок (несколько копий backbone'а / inserts последовательно). Корень — Sprint IS-Final K4: native `window.confirm("Заменить текущий файл?")` сработал слишком широко.
- **V44 P2** Catalog items overflow. Раскрытая категория SnapGene рисуется ниже всех 19 категорий + drop-zone footer — на viewport ~600 px невидима, биолог считает «ничего не произошло».
- **V45 P2** Merge кнопок Импорт + Каталог. После IS-Final два entry-point (header + QuickStart) делают одно и то же.
- **V46 P3** Smart leader-labels. (a) Статичный mini-map в SingleInspector — labels не рендерятся. (b) Hover-overlay 180 px — labels вылезают за viewBox. (c) Алгоритм пропускает большие фичи (GUS 1811 bp в 14 kb плазмиде, 13% — без label из-за category-bias).
- **V47 P3** `↻ применить` overflow на 41 px вправо в Topology-блоке SingleInspector (правая колонка `[1fr_200px]`).
- **V48 P3** `Открыть холст →` в SessionSummary не закрывает модалку (резет state ≠ закрытие).

Все шесть — точечные, без data-model изменений. Подробности — BUGS.md OPEN.

---

## 2. Стратегия

Шесть независимых K-шагов, по нарастающей сложности. Каждый K — один баг. Никаких «заодно» рефакторингов смежных модулей.

| K | Баг | Стратегия в одной фразе |
|---|------|------------------------|
| K1 | V43 (P1) | `actionId === 'canvas'` всегда append; найти grep'ом и удалить любой `window.confirm` в orchestration пути «На канвас» |
| K2 | V47 (P3) | Vertical stack `<input>` + `<button>` в Topology-блоке MetaColumn вместо горизонтального flex |
| K3 | V48 (P3) | Разделить `onCloseSession` в SingleInspector на `onReplaceFile` + `onOpenCanvas`, последний привязать к `handleClose` (не `resetSession`) |
| K4 | V45 (P2) | Header: убрать `📚 Каталог`; QuickStart: PRIMARY 2→1 entry («Старт сборки»); параметр `catalogMode` помечается deprecated в `openImportStartScreen` |
| K5 | V44 (P2) | Replace-mode при `activeNode != null` — скрывает tree, оставляет header `← Назад · {label} ({count})` + items, симметрично search-mode |
| K6 | V46 (P3) | `buildLabels` refactor: убрать category-bias / hard caps, оставить только `length ≥ 300 bp` + blacklist `{source}`; `showLabels` расширить на linear + size ≥ 100; viewBox postRender expansion (вариант 1A — Игорь 28.04.2026) |

---

## 3. Scope — IN / OUT

### IN

- Шесть багов V43–V48 закрываются в этом спринте.
- Изменения только в файлах из §0.
- Тесты под каждый баг (см. §6).
- Visual acceptance после Code-финализации в отдельной сессии.

### OUT

- **F2/F3/F4** (Library-Canvas / paste-text / canvas-tab) — отдельный Sprint Library-Canvas Model.
- **V40** (Аннотировать → manual editor) — заблокирован Sprint Annotation-Commits.
- **V42** (Заменить-кнопка в title row) — UX-redesign в Sprint UX-1, не точечный fix.
- **V41** (дубликат session log) — снимется автоматически при V40 fix (Sprint Annotation-Commits).
- **V35/V36/V37/V38/V39** — уже закрыты в FIXED либо в backlog UX-1.
- Декомпозиция App.jsx — отдельный Sprint 2b при триггере (не сейчас).
- Регрессии не из этих 6 багов — в BUGS.md OPEN, не в этом спринте.
- Изменения data model или store-slice — нет.

---

## 4. Архитектурные решения

1. **`На канвас` = append-всегда (V43).** Кнопка с явной семантикой «положи копию», в отличие от drag-drop / catalog click (там confirm уместен — биолог мог случайно перетащить второй файл вместо первого). Closure: для catalog click + drop в single-mode confirm сохраняется (это другие пути). Замок ребуса — `handleAction('canvas')` ветка orchestrator + `addFragmentDirect` в store; оба должны быть чисты от confirm.

2. **Replace-mode в CatalogPanel симметричен search-mode (V44).** Когда `activeNode != null` (любой kind: snapgene / mine / demo) — tree скрывается, рисуется только header `← Назад · {label} ({count})` + cards inline. Кнопка `←` сбрасывает `activeNode = null`. Поиск (`searchActive`) — отдельная ветка, не пересекается. Drop-zone footer sticky внизу в обоих режимах.

3. **Header → один entry-point ImportStartScreen (V45).** `📂 Импорт` остаётся, `📚 Каталог` удаляется. Слева в модалке всегда виден `CatalogPanel` (после IS-Final K4) — отдельный «catalog button» не нужен. Параметр `catalogMode` в `openImportStartScreen` устаревает; код не падает если параметр придёт от старого вызова, но функционально игнорируется.

4. **QuickStart 2 actions вместо 3 (V45).** Биолог видит «Старт сборки» (объединяет import + catalog) и «Начать с нуля» (drag из палитры). Первая кнопка под капотом → `openImportStartScreen({})`.

5. **`onOpenCanvas` ≠ `onCloseSession` (V48).** Семантика разная: `onCloseSession` (`= resetSession`) очищает inputs модалки и оставляет окно открытым; `onOpenCanvas` (`= handleClose`) закрывает модалку и возвращает фокус на canvas. SingleInspector раньше получал один callback `onCloseSession` для обеих кнопок — это была ошибка биндинга.

6. **buildLabels: «всё что ≥ 300 bp» (V46, выбор Игоря 28.04.2026).** Никаких category-bias / promoter-cap / global-cap — все features длиной ≥ 300 bp получают label, кроме `type === 'source'` (GenBank metadata, всегда == sequence length). `mature_peptide` фильтруется естественно правилом ≥300 bp. Threshold выбран как средняя длина CDS-домена, под который биолог хочет видеть подпись.

7. **viewBox SVG расширяется postRender до bbox + padding (V46, вариант 1A).** Альтернативу «обрезать labels до viewBox» отвергаем — теряем информацию. Реализация: `useLayoutEffect` после render — `getBBox` на label-group, обновить `viewBox`/`width`/`height` SVG. Wrapper `<span>` уже имеет `lineHeight: 0` — рост SVG выйдет за wrapper, но `overflow: visible` уже стоит.

8. **Labels рендерятся одинаково в circular + linear (V46).** Сейчас `showLabels = size >= 180 && isCircular`. Новый порог — `size >= 100`, для обеих топологий. Linear leader-labels — вертикальная линия от bar вниз, текст под ней (`text-anchor: start`).

---

## 5. Предположения

Перед началом — каждое подтвердить grep'ом или коротким чтением соседнего модуля.

1. **`addFragmentDirect` (fragment-slice) НЕ содержит `window.confirm`** — путь «На канвас» из orchestrator уходит туда, и если slice сам показывает confirm на дубликаты, V43 fix будет неполным. **Источник:** не проверено. **Действие K1:** grep `window.confirm` в `gui/designer/src/store/` — если найдено в `addFragmentDirect`, расширить fix.

2. **`onAction('catalog')` в QuickStart wired в App.jsx или DesignCanvas.jsx** — это обработчик внешнего вызова `openImportStartScreen({ catalogMode: true })`. **Источник:** в QuickStart.jsx комментарий `📚 Выбрать из каталога → onAction('catalog') — opens with catalog expanded`, но сама точка вызова не в этом файле. **Действие K4:** grep `onAction.*catalog` или `'catalog'` в App.jsx + DesignCanvas.jsx.

3. **PlasmidMiniMap не используется снаружи `ImportStartScreen`** — никаких других мест где labels рисуются по другим правилам. **Источник:** в JSDoc PlasmidMiniMap указано «Used by ImportStartScreen MetaColumn (180 px), MultiInspector rows (40 px) и CatalogPanel cards (48 px)». **Действие K6:** grep `import.*PlasmidMiniMap` или `from.*PlasmidMiniMap` в `gui/designer/src/components/` — если найдены другие потребители, проверить что новый порог `size >= 100` не сломает их visual.

4. **Существующие тесты PlasmidMiniMap опираются на текущий MAX_LABELS=8 / cap-логику** — refactor сломает их. **Источник:** не проверено, но V46 — большой refactor алгоритма, обычно ломает 2-5 unit-тестов. **Действие K6:** при выполнении прочитать `__tests__/plasmid-mini-map*.test.jsx` и обновить assertions под новую логику. Если тестов окажется >10 — сообщить Chat в отчёте, может потребоваться ревизия test surface.

5. **`handleAction('canvas')` в текущем `index.jsx` НЕ содержит confirm** — read-pass показал чистый путь. **Источник:** прочитан Chat-сессией 28.04.2026, lines ~190–210. **Действие K1:** проверить что описание V43 от Игоря не указывает на другое поведение — возможно баг был замечен через handler где confirm всё-таки есть, например в drop-replacement при `parsedItems.length === 1` (line ~88) или в `handleCatalogSelectItem` (line ~280). См. §10 «Открытые вопросы».

---

## 6. Задачи

### K1 — V43 `На канвас` always-append (P1)

**Файлы:** `components/ImportStartScreen/index.jsx` + любые места где найден `window.confirm` на пути «На канвас» (см. предположение 1).

**Шаги:**
1. Grep `window.confirm` по всему `gui/designer/src/`. Подтвердить, что путь `handleAction('canvas')` (orchestrator) → `addFragmentDirect` (slice) не содержит confirm-вызовов.
2. Если confirm найден на пути «На канвас» — удалить.
3. Если confirm не найден на пути «На канвас» (только в `handleFilesImport` для drop-replacement и `handleCatalogSelectItem` для catalog click) — ничего не делать в коде, только записать в отчёт «V43 не воспроизводится в текущем коде, поведение «На канвас» уже append-only».
4. Тесты — независимо от результата (3): добавить regression-тесты. Они должны проходить уже сейчас, но фиксируют контракт.

**Тесты (`components/ImportStartScreen/__tests__/import-start-canvas-action.test.jsx` или подобный):**
- `handleAction('canvas') 3 раза подряд → addFragmentDirect вызван 3 раза, window.confirm НЕ вызван` (mock window.confirm и addFragmentDirect, проверить call count).
- `addedItems.length растёт с 0 → 1 → 2 → 3 после 3 кликов` (внутреннее состояние модалки).
- (+1 регрессия по паттерну): `handleCatalogSelectItem на single → window.confirm вызван 1 раз` (фиксируем что catalog click confirm СОХРАНЯЕТСЯ — это не V43 scope).

**Отчёт K1:** результат grep'а (где найден confirm и убран ли); число тестов добавлено; коммит-хэш.

---

### K2 — V47 Topology apply button vertical stack (P3)

**Файл:** `components/ImportStartScreen/MetaColumn.jsx`, секция `{isCircular && (...)}` — origin offset card.

**Шаги:**
1. Изменить структуру origin offset card с горизонтального flex (label + input + button) на vertical stack:
   - Строка 1: label `начало (п.н.)` (left) + `<input type="number" w-full>` (right, `flex-1` или `w-full`).
   - Строка 2: `<button w-full>↻ применить</button>` на полную ширину под input.
2. Сохранить existing className styling (rounded, padding), origin hints text остаётся как есть под button.
3. Высота блока вырастает на ~32 px — visual acceptance проверит, что MetaColumn не вылезает за высоту контейнера.

**Тесты:** не нужны (CSS-only, нет логики). Visual acceptance проверит.

**Отчёт K2:** коммит-хэш; замер DOM на dev-сервере: `↻ применить` button.right ≤ MetaColumn.right.

---

### K3 — V48 `Открыть холст →` closes modal (P3)

**Файлы:** `components/ImportStartScreen/index.jsx` + `components/ImportStartScreen/SingleInspector.jsx`.

**Шаги:**
1. **SingleInspector.jsx:**
   - Переименовать prop `onCloseSession` → `onReplaceFile` (используется только для `↻ замена файла` button).
   - Добавить новый prop `onOpenCanvas` (используется только для `<SessionSummary onOpenCanvas={...} />`).
2. **index.jsx:**
   - В `<SingleInspector />` передавать `onReplaceFile={resetSession}` (раньше `onCloseSession={resetSession}`).
   - Добавить `onOpenCanvas={handleClose}`.

**Тесты (`components/ImportStartScreen/__tests__/import-start-open-canvas.test.jsx` или подобный):**
- `Click «Открыть холст →» → onClose callback вызван` (проверка что modal-close path уходит к props.onClose).
- `Click «↻ замена файла» → onClose НЕ вызван, parsedItems сброшены` (replace-flow остаётся работать как прежде).

**Отчёт K3:** коммит-хэш; число тестов.

---

### K4 — V45 Merge Импорт + Каталог (P2)

**Файлы:** `App.jsx` + `components/QuickStart.jsx` + предположительно `components/DesignCanvas.jsx` или другой потребитель `QuickStart.onAction('catalog')` (см. предположение 2).

**Шаги:**
1. **App.jsx header:** удалить блок `<button onClick={() => useStore.getState().openImportStartScreen({ catalogMode: true })}>... 📚 Каталог ...</button>` целиком (~5 строк). Кнопка `📂 Импорт` остаётся.
2. **QuickStart.jsx:**
   - `PRIMARY` массив 2 entry → 1 entry: единственная кнопка `{ id: 'import', icon: '📂', tone: 'blue', label: 'Старт сборки', desc: 'файл · каталог 2800+ · Ctrl+V' }`.
   - Удалить entry с id `'catalog'`.
   - `onAction` сигнатура остаётся (`'import'` | `'free'`); вызовы `'catalog'` исчезают.
3. **Найти потребителя `onAction='catalog'`:** grep `onAction.*catalog` в `App.jsx` + `DesignCanvas.jsx`. Удалить ветку `'catalog'` (она сводится к `openImportStartScreen({ catalogMode: true })` — это удаляется).
4. **`store/uiSlice.js` (или где живёт `openImportStartScreen`):** прочитать сигнатуру. Если параметр `catalogMode` влияет на логику внутри (например автораскрытие SnapGene группы) — оставить функцию принимающей объект, но игнорирующей `catalogMode` (no-op). Записать deprecated-комментарий.

**Тесты (`__tests__/quick-start.test.jsx` либо подобный):**
- `QuickStart → render → 2 buttons (Старт сборки + Начать с нуля), no «Каталог» button`.
- `Click «Старт сборки» → onAction('import') called, NOT onAction('catalog')`.
- `App header → 1 button «📂 Импорт», no «📚 Каталог»` (новый или модификация существующего теста).

**Отчёт K4:** коммит-хэш; результат grep'а потребителя `onAction='catalog'` (где найден, как удалён); статус `catalogMode` параметра (no-op deprecated / удалён); финальный размер App.jsx (должен быть < 30.56 KB).

---

### K5 — V44 Catalog items overflow / replace-mode (P2)

**Файл:** `components/ImportStartScreen/CatalogPanel.jsx`.

**Шаги:**
1. **Логика replace-mode:** при `activeNode != null && !searchActive` скрыть tree (`<GroupHeader>` блоки + secondary buttons), показать вместо них header `← Назад · {label} ({count})` + items inline.
2. **Header при replace-mode:**
   - Кнопка `←` (label кликабельный) сбрасывает `setActiveNode(null)` и возвращает tree.
   - Label: для kind `snapgene` → `index.categories.find(c => c.slug === activeNode.value).name`; для `mine` → `myGroups.find(g => g.key === activeNode.value).label`; для `demo` → `'Базовые плазмиды'`.
   - Count: `items.length` (после загрузки) или `'…'` пока `loading`.
3. **Items render branch:** существующий блок `{(searchActive || activeNode) && (...)}` остаётся, но теперь когда tree скрыт — занимает всю scrollable область до drop-zone footer.
4. **Tree при `searchActive`:** уже скрыт текущей логикой (`{!searchActive && (...)}` обёрнут весь tree-рендер) — поведение сохраняется.
5. **Drop-zone footer:** не трогаем — он уже sticky 120 px shrink-0, висит внизу в любом режиме.

**Тесты (`__tests__/catalog-panel-replace-mode.test.jsx` либо аналог):**
- `Click on snapgene category → tree hidden, replace-mode header rendered, items rendered inline`.
- `Click ← in replace-mode header → setActiveNode(null), tree visible again`.
- `Click on mine group → same behavior` (replace-mode для mine тоже).
- `Click on demo → same behavior` (replace-mode для demo тоже).
- `Search active + activeNode set → search wins, replace-mode header NOT rendered, search results visible`.

**Отчёт K5:** коммит-хэш; число тестов; финальный размер CatalogPanel.jsx (ожидание: рост на ~1–2 KB до ~20 KB, в soft зоне ниже 30 KB).

---

### K6 — V46 Smart leader-labels (P3)

**Файл:** `components/PlasmidMiniMap.jsx` + (возможно) `__tests__/plasmid-mini-map*.test.jsx` обновление существующих тестов.

**Шаги:**

1. **`buildLabels` refactor:**
   - Убрать константы `LABEL_THRESHOLD = 0.03`, `MAX_LABELS = 8`, `HARD_CAP`, `passes`, `ORIGIN_NAME_RE`, `TAG_NAME_RE`, helpers `isOrigin` / `isPromoter` / `isTag`.
   - Новая константа `LABEL_LENGTH_THRESHOLD_BP = 300`.
   - Новый blacklist: `LABEL_TYPE_BLACKLIST = new Set(['source'])`.
   - Тело функции: `regions.filter(r => (r.end - r.start) >= LABEL_LENGTH_THRESHOLD_BP && !LABEL_TYPE_BLACKLIST.has(r.type))` → sort by length desc → map в label-objects (геометрия не меняется, COLLISION_RAD стэкинг сохраняется).
   - Без верхнего cap'а на count: ALL features ≥ 300 bp получают label.

2. **`showLabels` расширить:**
   - Старое условие: `size >= 180 && isCircular`.
   - Новое условие: `size >= 100` (обе топологии).
   - При `size < 100` (e.g. 48 px catalog cards, 32 px session summary) — labels не рендерятся, поведение прежнее.

3. **Linear render branch — добавить leader-labels:**
   - В цикле labels: для linear режима геометрия другая. Анкер point — середина rect'а на горизонтальной оси: `innerX = (start + end) / 2 / totalLen * (size - 8) + 4`, `innerY = cy - strokeWidth / 2`.
   - Leader vertical вверх: `outerX = innerX`, `outerY = innerY - LEADER_LEN`.
   - Текст над leader: `textX = outerX`, `textY = outerY - 2`, `textAnchor = 'middle'`.
   - Collision-staggering по горизонтали (не вертикали как у circular): если соседние labels слишком близки по `innerX` — сдвиг текста по высоте (`outerY -= 11`).

4. **viewBox postRender expansion (вариант 1A):**
   - `useLayoutEffect` после render: ref на root `<svg>` → `getBBox()` → если bbox выходит за `viewBox`, обновить `viewBox` + `width`/`height` через state.
   - Fallback: если `getBBox` не доступен (jsdom) — оставить дефолтный viewBox (тесты пройдут на основе fallback'а).
   - Padding: 4 px со всех сторон bbox.

5. **`isCompact` (size ≤ 90) hover-popover:** не трогаем, продолжает рендерить вложенный `<PlasmidMiniMap size={180}>` с labels. После K6 этот вложенный получит расширенный viewBox и not-overflowing.

**Тесты:**

Существующие тесты `plasmid-mini-map*.test.jsx` (количество узнать при чтении) — обновить assertions:
- Тесты на `MAX_LABELS = 8` / `LABEL_THRESHOLD = 0.03` — заменить на `LABEL_LENGTH_THRESHOLD_BP = 300` / no-cap.
- Тесты на priority pass (resistance / origin / promoter / tag pickup) — удалить либо переписать на «все ≥ 300 bp picked».
- Тесты на cap-overflow поведение — удалить (нет cap'а больше).

Новые тесты:
- `Region length 300 bp gets label, region length 299 bp does NOT get label` (boundary).
- `type='source' region of any length is NOT in labels` (blacklist).
- `Linear topology with size=180 renders labels` (новое поведение).
- `size=100 renders labels (new threshold), size=99 does NOT` (boundary).
- `Heavy plasmid (15 regions ≥ 300 bp) renders all 15 labels, no upper cap` (no-cap).
- `viewBox expands when labels exceed initial size` (postRender expansion — может потребовать `getBBox` mock в jsdom).

**Отчёт K6:** коммит-хэш; число обновлённых / удалённых / новых тестов; финальный размер PlasmidMiniMap.jsx (ожидание: ±0–2 KB, в зелёной зоне ниже 30 KB).

---

## 7. Порядок выполнения и оценка времени

Sequential — следующий K не начинать пока предыдущий не зелёный по тестам и build'у. Никакой параллелизации.

| K | Задача | Оценка |
|---|--------|--------|
| K1 | V43 `На канвас` always-append | 30 мин |
| K2 | V47 Topology vertical stack | 15 мин |
| K3 | V48 `Открыть холст →` close modal | 20 мин |
| K4 | V45 Merge Импорт + Каталог | 30 мин |
| K5 | V44 Catalog replace-mode | 60 мин |
| K6 | V46 Smart leader-labels | 90 мин |
| **Σ** | **Спринт** | **~3 ч 45 мин** |

Build / тесты — после каждого K. После K6 — финальный `npx vitest run && npx vite build` пройти clean.

---

## 8. STOP-условие и формат отчёта

### STOP

Code останавливается после K6 commit + clean `npx vitest run && npx vite build` и НЕ финализирует PROJECT_STATE / DECISIONS / BUGS / `docs/` archive. Финализация — отдельная Chat-сессия после визуальной приёмки.

### Формат отчёта в CURRENT_TASK.md (в конце)

```markdown
## Отчёт Code (Sprint Catalog Polish)

**Коммиты:**
- K1: `<hash>` — V43 confirm cleanup
- K2: `<hash>` — V47 vertical stack
- K3: `<hash>` — V48 close modal
- K4: `<hash>` — V45 merge entry-points
- K5: `<hash>` — V44 replace-mode
- K6: `<hash>` — V46 leader-labels refactor

**Тесты:** Vitest 978 → <N> (+<N> новых, –<N> удалённых, ~<N> обновлённых). Pytest 112/112.
**Build:** `vite build` clean.
**Размеры:**
- App.jsx: 30.56 → <N> KB (после K4 удаления button)
- CatalogPanel.jsx: 18.67 → <N> KB (после K5)
- PlasmidMiniMap.jsx: 13.62 → <N> KB (после K6)

**Отклонения от спеки:**
- <если есть — конкретно какое и почему. «Всё по спеке» — недопустимо как формулировка>

**Размер budget:** <«OK» / список нарушителей по §0 порогам>

**Готов к визуальной приёмке.**
```

Если K1 grep не нашёл confirm на пути «На канвас» — отчёт K1 явно фиксирует это (см. §6 K1 пункт 3).

---

## 9. Риски

1. **App.jsx после K4 может остаться 30.5+ KB.** Удаление 5 строк JSX header даёт ~150 байт сокращения, App.jsx 30.56 → ~30.4 KB — всё ещё на soft warning. Митигация: следующий спринт по App.jsx — отдельный Sprint 2b с дополнительной декомпозицией ModalStack + header. Сейчас не трогаем.

2. **PlasmidMiniMap.jsx warning signal +6.17 KB за прошлый спринт.** Sprint IS-Final + V37 mini-fix вырастили его с 3.96 KB до 10.13 KB; сейчас 13.62 KB (+3.49 за App-Decomp / случайно через unrelated commits?). K6 refactor может прибавить ещё ~1–2 KB на linear branch labels + viewBox expansion. Митигация: если после K6 PlasmidMiniMap.jsx ≥ 25 KB — Code останавливается, требует mini-spec на extract `lib/plasmid-mini-map-labels.js` (helper `buildLabels` + `LABEL_LENGTH_THRESHOLD_BP` + render logic для labels). Гарантированно меньше после refactor priority-pass удаления. Hard 40 KB далеко.

3. **K6 viewBox expansion в jsdom (Vitest).** `getBBox` не реализован в jsdom, useLayoutEffect упадёт без try/catch. Митигация: явный `try { getBBox() } catch { return }` fallback в effect; тест на expansion может потребовать mock через `Object.defineProperty(SVGGraphicsElement.prototype, 'getBBox', { value: () => bbox })`.

4. **K4 потребитель `onAction('catalog')` может быть в App.jsx или DesignCanvas.jsx — точно неизвестно.** Митигация: K4 шаг 3 явно требует grep + удаление; если потребителей >1 — сообщить в отчёте K4.

5. **K5 replace-mode для kind='mine' и kind='demo' расширяет scope относительно описания V44 в BUGS.md.** Игорь явно говорил только про snapgene tree. Митигация: симметрия trumpts narrowing — лучше единое поведение для всех `activeNode` kind, чем три раздельных policy. Если на приёмке Игорь скажет «mine был ОК как было» — откатить replace-mode для kind='mine' / 'demo' будет тривиально (одна `if`-ветка). Это **не** open question для Code — запускаем со всеми тремя kind, на приёмке корректируем при необходимости.

---

## 10. Открытые вопросы

1. **V43 точное место confirm на пути «На канвас».** Read-pass `index.jsx` показал чистый `handleAction('canvas')` без confirm. Описание Игоря в BUGS.md: «pBI221 на канвасе → клик «На канвас» → confirm». Возможно баг был в `addFragmentDirect` (slice) или в момент IS-Final K4 commit `5748521` confirm живёт в другом месте. Code находит точное место grep'ом в K1; если не нашёл — предположение в §5 п.5 закрывается с no-action в коде, только regression-тестами.

2. **K6 — labels на размере 100–160 px (CatalogPanel cards 48 px НЕ попадают, MetaColumn 160 px ПОПАДЁТ).** Изменение порога `size >= 180 → size >= 100` означает что MetaColumn 160 px тоже получит leader-labels. Это РАСширяет scope против буквального V46 описания (статичный mini-map в SingleInspector — не указано какой размер). Если на приёмке Игорь скажет «160 px без labels был лучше, тесно» — откатить порог на `>= 180`. Не блокер.

3. **K6 — `LABEL_LENGTH_THRESHOLD_BP = 300` хардкоднуто, не settings-toggle.** Sprint UX-1 backlog имеет V34 (AA-translation min-aa setting в `⚙️ Настройки`) — потенциально и порог mini-map labels можно будет вынести туда. Сейчас не делаем — увеличивает scope без необходимости. Если Игорь захочет «у меня плотная плазмида, 300 bp слишком много» — Sprint UX-1 K-step.

---

**Дата:** 28.04.2026 (вторая Chat-сессия после Sprint App-Decomp финализации).
**Автор:** Claude Chat по правилам CHAT_PLAYBOOK.md.
