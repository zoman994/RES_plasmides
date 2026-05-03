# Sprint Catalog Polish FIX — пять FAIL-пунктов после визуальной приёмки

**Тип:** bugfix
**База:** v0.5.4-alpha, коммит `846346b` (финал Sprint Catalog Polish K6).
**Предпосылка:** Визуальная приёмка Sprint Catalog Polish 28.04.2026 дала PASS по контрактам K1–K6, но выявила пять связанных проблем в сценариях, не покрытых acceptance: три FAIL по самим K-пунктам в неучтённых сценариях, плюс две системные находки (data-shape для `mine` и catalog-каша на гигантских вирусных геномах).

---

## 0. Срез размеров затрагиваемых модулей

Замер до правок (по отчёту Code Sprint Catalog Polish):

| Файл | Размер | Лимит | Зона |
|------|--------|-------|------|
| `components/PlasmidMiniMap.jsx` | 15.25 KB | 40 KB (.jsx) | OK, **warning signal** — вырос +1.63 KB за Sprint Catalog Polish |
| `components/ImportStartScreen/index.jsx` | ~17 KB (оценка) | 40 KB | OK |
| `components/ImportStartScreen/SingleInspector.jsx` | 5.42 KB | 40 KB | OK |
| `components/ImportStartScreen/MetaColumn.jsx` | 6.21 KB | 40 KB | OK |
| `components/ImportStartScreen/CatalogPanel.jsx` | 20.05 KB | 40 KB | OK |
| `components/ImportStartScreen/MultiFileList.jsx` | (не замерен) | 40 KB | предположительно OK |
| `annotation-model.js` | (не замерен) | 25 KB | предположительно OK |
| `store/parts-slice` (Code находит точный путь) | (не замерен) | 25 KB | предположительно OK |

**Risk-bullet (см. §9):** F1 + F4 расширят `PlasmidMiniMap.jsx` (новый prop `mode`, prop `name`, animated grow через portal, source-fade на hover). При росте +5 KB файл подойдёт к soft warning 30 KB (для .jsx). Если перейдёт — кандидат на extract `mini-map-labels.js` helper в Sprint UX-1.

---

## 0.5. Ответы Игоря на kickoff-интервью 28.04.2026

**Scope:**

- **Q:** Defensive в `getRegions` или миграция (один раз нормализовать `level: 'region'` при rehydrate)?
  **A:** Миграция данных. «Данные не стоят ничего, обновим».

- **Q:** F5' — фильтровать catalog SnapGene по размеру (≤20 кб) или blacklist'ить только Coronavirus?
  **A:** «Давай пока ограничимся плазмидами до 20кб». Универсальный фильтр.

- **Q:** Пустую после фильтра категорию (Coronavirus с count=0) показывать с `(0)` или скрывать?
  **A:** «Удалить просто». Скрываем категории с count=0.

**UX decisions:**

- **Q:** Inline mini-map в правой колонке inspector — как поступаем с подписями?
  **A:** «В нашей библиотеке мы будем видеть мини-карты, и при наведении будем видеть большие». Inline mini-map без leader-labels по умолчанию, hover запускает overlay с подписями.

- **Q:** Confirm `Заменить файл?` при клике на другую плазмиду в каталоге — оставлять?
  **A:** «Хочу чтобы просто переключалось». Убираем.

- **Q:** F4 — как именно overlay должен появляться? Popover с белым фоном или другой подход?
  **A:** «Всплывающие окна с мапой — их можно сделать тупо прозрачными? Чтобы мы видели только плазмиду и подписи но не белый фон». Прозрачный без диалогового прямоугольника.

- **Q:** Анимация появления — резкое появление или эффект «выхода навстречу»?
  **A:** «При наведении она как бы увеличивалась (при этом могла пропадать чтобы не мешаться). Как будто выходить на встречу человеку». Transform-based grow animation, не fade-in popover.

- **Q:** Source mini-map (маленькая в карточке) при hover — полностью исчезает или оставляет след?
  **A:** «Давай как след». Source остаётся призрачно (`opacity: 0.15`).

- **Q:** Название плазмиды — отдельным элементом UI или в самой overlay?
  **A:** «Название плазмиды тоже должно отражаться (так удобнее)». Название встраивается в overlay вместе с аркой/подписями.

- **Q:** V38 (mini-map preview переключён с click на hover) — намеренно или регрессия?
  **A:** Подтвердил намеренно. Закрываем V38 в FIXED при финализации.

**Error cases:**

- **Q:** При смене catalog item остаётся stale annotations (наложение на скриншоте 2). Atomic clear или допустимо?
  **A:** «В другом браузере если работать только с плазмидами то никакого наложения нет. Этот баг опосредован только с сарс ков геномом». State-engineering фикс не нужен — после F5' (≤20 кб) проблема не воспроизводится.

**Acceptance criteria:**

- **Q:** Как визуально подтвердим что сделано?
  **A:** На любой плазмиде из остатка каталога SnapGene (≤20 кб): hover на mini-map в карточке → плавный «рост» к большой версии с прозрачным фоном, видны arc + подписи (≥300 bp regions) + название плазмиды; source становится призрачным (~15% opacity); никакого белого rectangle. В SingleInspector правая колонка mini-map = arc/bar без leader-labels по умолчанию, при hover тот же grow-overlay. На mine→Репортёры — подписи появляются после миграции. Клик на другую плазмиду — без confirm, без наложения.

**Что не обсуждалось (и стало assumption'ом в §5):**

- Где именно проводить миграцию F3. Принимаю: при rehydrate, marker `_schemaVersion: 2`.
- Topology toggle для catalog items не работает — отдельный bug V52, не в этом спринте.
- Где разместить название плазмиды в overlay. Принимаю: ПОД аркой (стандартный subtitle pattern). Если выше — F1/F4 переделать в micro-fix.

---

## 1. Контекст

Sprint Catalog Polish (закрыт коммитом `846346b`) реализовал K1–K6: V43 append-only, V47 vertical stack, V48 close modal, V45 merge entry-points, V44 catalog replace-mode, V46 leader-labels (≥300 bp + viewBox 1A expansion). Визуальная приёмка 28.04.2026 PASS по контрактам — но выявила пять связанных проблем:

1. **F1 — viewBox 1A expansion ломает inline-контекст SingleInspector.** SVG `overflow: visible` + `width/height = bbox` физически выходит за фиксированный 200 px бокс правой колонки. На SARS Genome (62 региона) mini-map налазит на блок Топология; на pCAMBIA1381Xb (linear, 15 регионов) — labels стопкой улетают вверх до хедера модалки (collision-stagger без верхнего предела).

2. **F2 — catalog click confirm.** Code оставил `window.confirm("Заменить текущий файл?")` в `handleCatalogSelectItem` ветке `single → replace` (line ~339). Игорь ожидает: переключение preview без commitment.

3. **F3 — mine parts annotations без `level: 'region'`.** В `mine` библиотеке legacy parts хранятся в старом формате annotations без `level`. `getRegions` фильтрует по `a.level === 'region'` → возвращает `[]` → labels не строятся. PlasmidMiniMap ловит fallback `paths.length === 0` → рисует empty linker bar. Игорь видит «у линейных нет подписей» — это и есть причина.

4. **F4 — белый popover не подходит концептуально + вылазит за рамки.** Текущий popover (`bg-white rounded-lg shadow-xl border border-gray-200 p-3`) ощущается как диалоговое окно, занимает место белым прямоугольником, на больших плазмидах вылазит на соседние карточки. Решение: **transparent grow-animation** — mini-map плавно вырастает из source-карточки через React portal, прозрачный фон, source при этом остаётся призрачно (`opacity: 0.15`). В overlay рендерятся arc + leader-labels + название плазмиды.

5. **F5' — фильтр catalog SnapGene по длине ≤20000 bp.** На вирусных геномах (Coronavirus, ~30 кб с 16 mature_peptide подряд) leader-labels создают визуальный хаос даже при правильной 1A реализации. Биологу для клонирования вирусные геномы не нужны — это reference-материал, не subjects сборки. Universal фильтр ≤20 кб убирает корень проблемы и расчищает каталог от non-cloning материала.

---

## 2. Стратегия

**F1** — добавить prop `mode: 'inline' | 'overlay'` в `PlasmidMiniMap`. В `inline` viewBox остаётся `0 0 size size`, leader-labels не строятся, `overflow: hidden`. В `overlay` сохраняется текущее поведение V46 1A — leader-labels рендерятся, plus название плазмиды (F4).

**F4** — заменить popover-с-белым-фоном на **transparent grow animation через React portal**:
- При hover на inline mini-map (любой size, не только compact) — через portal в `document.body` появляется overlay-копия с `size=180`, `mode='overlay'`.
- Анимация `transform: scale(0.5) → scale(1)` + `opacity: 0 → 1` за 200ms ease-out, центр overlay совпадает с центром source.
- Прозрачный фон (нет background, border, shadow). Только SVG: arc + leader-labels + название плазмиды снизу.
- Source mini-map плавно `opacity: 1 → 0.15` параллельно (хвост-след «откуда выехала»).
- Подписи и название с `paint-order: stroke fill; stroke: white; stroke-width: 3` + `filter: drop-shadow(0 0 1px rgba(0,0,0,0.4))` — читаются на любом фоне.
- На mouse-leave — обратная анимация с 250 ms hover-bridge debounce (как сейчас).
- Clamping в viewport (как сейчас в `openPopover`) сохраняется.
- Z-index 100 (выше catalog scrollable area, ниже modal back-drop, ниже native dialogs).

**F2** — удалить `window.confirm` из `handleCatalogSelectItem` single→replace. Drag-drop file confirm и multi→batch confirm не трогать.

**F3** — миграция `mine` parts при rehydrate: для каждой annotation без `level` поле проставлять `level: 'region'`. Marker `_schemaVersion: 2` в parts-slice state — идемпотентность.

**F5'** — фильтровать catalog SnapGene по `length <= 20000` (где загружается список). Категории с count=0 после фильтра не рендерятся.

---

## 3. Scope

### IN

- `components/PlasmidMiniMap.jsx` — основной фронт правок:
  - prop `mode: 'inline' | 'overlay'`, default `'inline'`
  - prop `name?: string` — название плазмиды, рендерится только в `mode='overlay'` под аркой
  - в `inline`: `showLabels = false` независимо от size, viewBox `0 0 size size`, `overflow: hidden`
  - в `overlay`: текущее V46 поведение + `<text>` с названием плазмиды снизу + paint-order white stroke на всех `<text>`
  - Hover-логика расширена: `isCompact` правило заменить на universal — hover на любой `mode='inline'` mini-map запускает overlay
  - Overlay рендерится через `createPortal(document.body)`, прозрачный фон (без `bg-white shadow border`)
  - Анимация: CSS transition `transform 200ms ease-out, opacity 200ms ease-out` на overlay-обёртке, initial `transform: scale(0.5); opacity: 0`, target `transform: scale(1); opacity: 1`
  - Source style `transition: opacity 200ms`, на hover state `opacity: 0.15`
- `components/ImportStartScreen/SingleInspector.jsx` — pass `mode='inline'` + `name={parsedItem.name}` в MetaColumn → PlasmidMiniMap.
- `components/ImportStartScreen/MetaColumn.jsx` — пробросить `mode` и `name` props.
- `components/ImportStartScreen/CatalogPanel.jsx` — на cards pass `mode='inline'` + `name={plasmid.name}`. F5': в data-loader или render-этапе фильтр `length <= 20000`, скрывать пустые категории (`items.length === 0` skip).
- `components/ImportStartScreen/MultiFileList.jsx` — `mode='inline'` + `name` для inline rows.
- `components/ImportStartScreen/index.jsx` — F2: убрать `window.confirm` из ветки `handleCatalogSelectItem` single → replace (line ~339).
- `store/parts-slice` (Code находит точный путь) — F3: rehydrate-миграция с `_schemaVersion: 2`.
- Новые тесты: `__tests__/plasmid-mini-map-mode.test.jsx`, `__tests__/plasmid-mini-map-grow-overlay.test.jsx`, `__tests__/parts-migration.test.js`, regression-тесты для catalog click и F5' фильтра.

### OUT (явно отложено)

- **Topology toggle для catalog items не работает** — V52 в OPEN после fix-приёмки. Не в этом спринте.
- **Extract `mini-map-labels.js` helper** — если PlasmidMiniMap.jsx после F1+F4 перейдёт в soft warning — Sprint UX-1.
- **Альтернативные стратегии labels в `inline`** (truncate / inside-arc / top-K) — Sprint UX-1.
- **Атомарный clear catalog parsedItem** — не нужен, после F5' не воспроизводится.
- **Все остальные V** (V40, V42, V35, V36, V19–V21, V23, V28–V34, V18, V37, V39, V41, V8–V10, V1, V2, V6, V7) — не трогаем.

---

## 4. Архитектурные решения

1. **`PlasmidMiniMap.mode = 'inline' | 'overlay'` явное, не auto-detect по size.** Одинаковый `size=160` нужен в SingleInspector (inline без labels) и теоретически возможен где-то ещё в overlay-роли — явный prop безопаснее. Контракт V46 («every region ≥ 300 bp gets a label») сужается до overlay-mode — это pragmatic.

2. **Hover-overlay через React portal в `document.body`** (F4). Закрывает sibling-overflow в catalog list. Position: fixed + clamping в viewport. Z-index 100 — достаточно над catalog, не конфликтует с native dialogs.

3. **Анимация роста через CSS transform, не JS animation**. Простой transition на entry/exit состояния (`scale(0.5)/opacity(0)` ↔ `scale(1)/opacity(1)`). Использует GPU accel, плавно, без зависимостей от animation lib. 200ms — стандартное «быстро но заметно» по material guidelines.

4. **Source mini-map fade-to-след (`opacity: 0.15`), не полный fade-out.** Сохраняет визуальную связь «откуда выехала overlay»; биолог видит карточку под overlay, понимает контекст. Полный fade-out оставлял бы карточку «пустой» — ощущение пропавшего контента.

5. **Название плазмиды в overlay-SVG как `<text>`, не как HTML overlay.** Унифицированная стилистика с подписями (тот же `paint-order: stroke fill; stroke: white`) — название читается на любом фоне через тот же механизм. Размещение под аркой (стандартный subtitle pattern: title under image).

6. **Миграция F3 через `_schemaVersion: 2` маркер.** Идемпотентно. Старые pre-fix persisted state на диске Игоря оживает после первого запуска. fragmentSlice не трогать — он держит `commits[]` через ⚓ Plasmid-Git модель, annotations там сериализуются с правильной shape с момента введения.

7. **F5' фильтр в data-loader, не runtime.** Чем раньше отфильтровать — тем меньше работы для tree-render. Скрытие пустых категорий — на уровне tree-render.

---

## 5. Предположения

1. **Catalog SnapGene items имеют annotations с `level: 'region'`.** Проверено визуально через MCP — на SARS Genome labels рендерятся.
2. **`mine` parts annotations не имеют `level: 'region'`.** Подтверждено через код-анализ: `paths.length === 0` ветка PlasmidMiniMap = empty linker.
3. **Миграция F3 идемпотентна.** Marker `_schemaVersion` блокирует повторное прохождение.
4. **F5' фильтр ≤20000 bp не трогает `mine` и `demo`.** Только catalog SnapGene tree.
5. **State-flow при смене catalog item корректный.** Подтверждено Игорем («в другом браузере наложений нет»).
6. **Прозрачный overlay читается на любом фоне.** Через `paint-order: stroke fill; stroke: white; stroke-width: 3` + drop-shadow подписи и название читаемы на белом UI и на цветных арках. Если визуально окажется недостаточно — Sprint UX-1 добавит легкий backdrop-filter blur для overlay-region.
7. **Hover на size=160 mini-map (SingleInspector) психологически ожидаем.** Биолог уже привык что catalog-карточки реагируют на hover; единый паттерн в инспекторе нормально воспринимается. Если нет — отдельная feedback-сессия.

---

## 6. По задачам

### F1 — Inline mini-map без leader-labels

**Файлы:**
- `components/PlasmidMiniMap.jsx` — prop `mode`, default `'inline'`. В `inline`: `showLabels = false`, viewBox `0 0 size size`, `overflow: hidden`.
- `components/ImportStartScreen/MetaColumn.jsx` — принять `mode` prop, пробросить в PlasmidMiniMap. Default `'inline'`.
- `components/ImportStartScreen/SingleInspector.jsx` — pass `mode='inline'`.
- `components/ImportStartScreen/CatalogPanel.jsx`, `MultiFileList.jsx` — `mode='inline'`.

**Тесты (`__tests__/plasmid-mini-map-mode.test.jsx`, новый):**
- mode='inline' с большой плазмидой → labels не рендерятся (`<text>` count = 0)
- mode='inline' viewBox остаётся `0 0 160 160` (атрибут на SVG)
- mode='inline' SVG style включает `overflow: hidden`
- mode='overlay' (size=180) labels рендерятся (regression V46 K6)

### F2 — Catalog click без confirm

**Файлы:**
- `components/ImportStartScreen/index.jsx` — `handleCatalogSelectItem` ветка single → replace (line ~339): убрать `window.confirm`.

**Тесты:**
- Catalog click на 2-й item с активным parsedItem → inspector меняется без confirm
- Drag-drop file confirm сохраняется (regression)
- Multi→batch confirm сохраняется (regression)

### F3 — Миграция parts → level='region'

**Файлы:**
- `store/parts-slice` (Code находит точный путь). При rehydrate:
  - if `state._schemaVersion < 2` или undefined: пройти по `parts[].annotations`, set `.level = 'region'` где нет. Set `state._schemaVersion = 2`.
  - if `>= 2`: no-op.

**Тесты (`__tests__/parts-migration.test.js`, новый):**
- old shape (без level) → annotations с level='region'
- new shape (с level='region') → no-op, идемпотентность
- mixed (some level + some no-level) → пустые получают, existing не перезаписываются
- `_schemaVersion: 2` после миграции

### F4 — Hover grow-overlay через portal с прозрачным фоном

**Файлы:**
- `components/PlasmidMiniMap.jsx`:
  - prop `name?: string` — название плазмиды.
  - Hover-логика: `onMouseEnter` на любой `mode='inline'` mini-map (не только compact) → openOverlay.
  - Overlay рендерится через `createPortal(node, document.body)`. Контейнер: только SVG, без `bg-white shadow border`.
  - Inner `<PlasmidMiniMap>` создаётся с `mode='overlay'`, `size=180`, `name={name}`, та же `length/topology/annotations`.
  - Анимация: state `overlayState: 'closed' | 'opening' | 'open' | 'closing'`. На `'opening'` initial style: `transform: scale(0.5); opacity: 0; transition: transform 200ms ease-out, opacity 200ms ease-out`. На next frame (requestAnimationFrame) → `transform: scale(1); opacity: 1`. Это запускает CSS transition.
  - Source-fade: на hover state добавлять `opacity: 0.15` к inline-mini-map через CSS class.
  - В overlay-mode: добавить `<text>` с `name` под аркой (y = size + 20, text-anchor: middle, fontSize: 14, fontWeight: 600, paint-order: stroke fill, stroke: white, stroke-width: 3, filter: drop-shadow).
  - Все `<text>` (labels + name) в overlay: общий `paint-order: stroke fill; stroke: white; stroke-width: 3` + `filter: drop-shadow(0 0 1px rgba(0,0,0,0.4))`.
  - Hover-bridge debounce 250ms (как сейчас).
  - Z-index 100.

**Тесты (`__tests__/plasmid-mini-map-grow-overlay.test.jsx`, новый):**
- hover на size=64 inline-mini-map → overlay появляется в `document.body` (не в card-обёртке)
- overlay имеет `transform: scale(1)` и `opacity: 1` после animation frame
- overlay style НЕ включает `bg-white`, `border`, `shadow` (transparent)
- source mini-map при hover state получает `opacity: 0.15`
- overlay в `mode='overlay'` рендерит `<text>` с переданным `name` под аркой
- mouse-leave → 250ms debounce → overlay closes

### F5' — Catalog SnapGene фильтр ≤20 кб

**Файлы:**
- Где загружается catalog SnapGene data (Code находит) — добавить `.filter(plasmid => (plasmid.length || 0) <= 20000)`. Константа `MAX_CATALOG_LENGTH = 20000` рядом с TODO-комментарием.
- `components/ImportStartScreen/CatalogPanel.jsx` — tree-render skip ветку для категорий с `items.length === 0`.

**Тесты:**
- Catalog после загрузки не содержит plasmid с `length > 20000`
- Категория Coronavirus (count=0 после фильтра) не рендерится в tree
- Категория с mixed (если бы 5 из 6 ≤20 кб) — рендерится с count=5

---

## 7. Порядок выполнения

1. **F5'** (~30 мин) — фильтр catalog. Самостоятельная правка, упрощает MCP-проверку остальных.
2. **F2** (~15 мин) — удалить confirm.
3. **F3** (~45 мин) — миграция parts.
4. **F1** (~1 ч) — mode='inline' | 'overlay' + проброс через MetaColumn / SingleInspector / cards.
5. **F4** (~1.5 ч) — hover grow-overlay через portal + прозрачный фон + название плазмиды + source-fade + paint-order text styling.

Общее время: ~4 ч. После каждого F-пункта commit + `npx vitest run` + `npx vite build` clean.

---

## 8. STOP-условие и формат отчёта

После F4 commit + финальный `npx vitest run && npx vite build` clean — STOP. **НЕ финализировать** PROJECT_STATE / DECISIONS / BUGS / спеку в archive.

В CURRENT_TASK.md в конце отчитаться:
- Коммит-хэши F1–F5'.
- Финальные счётчики Vitest + pytest.
- Build status.
- Размеры файлов в скоупе (PlasmidMiniMap.jsx, CatalogPanel.jsx, ImportStartScreen/index.jsx).
- Точный путь к store/parts-slice.
- Точный путь catalog SnapGene data-loader.
- Скольких плазмид catalog лишился после F5' фильтра.
- Отклонения от спеки явным блоком.

---

## 9. Риски

- **PlasmidMiniMap.jsx может перейти в soft warning (~30 KB).** F1 + F4 добавят ~5-7 KB (новый mode-branch, portal-логика, animation states, name `<text>`, source-fade CSS class). Если перевалит 30 KB — Code останавливается, mini-spec на extract `mini-map-labels.js` helper. Митигация: F1 — pure conditional skip без новых helpers, F4 — `createPortal` 5-10 строк + animation state machine ~20 строк. Реалистично укладывается в +5 KB.
- **Анимация может ощущаться медленной/быстрой.** 200ms — стандарт material elevation, но Игорь может попросить 150 или 300 на приёмке. Митигация: вынести `GROW_DURATION_MS = 200` константой рядом с `HOVER_BRIDGE_MS`.
- **Подписи на цветных арках могут плохо читаться даже с paint-order white stroke.** Если visual проверка покажет недостаточный контраст — fallback на легкий `backdrop-filter: blur(2px)` под overlay. Sprint UX-1.
- **Hover на size=160 SingleInspector mini-map может быть неожиданным.** Биолог видит inspector с уже видимой картой, ожидает что hover ничего не меняет. Митигация: если на приёмке окажется неудобным — отключить overlay для SingleInspector в follow-up; в этом спринте включаем потому что иначе биолог не увидит leader-labels вообще.
- **store/parts-slice путь не известен.** Code диагностирует и фиксирует в отчёте.
- **F5' может убрать не только Coronavirus.** Если в каталоге SnapGene есть другие плазмиды >20 кб — они выпадут. Это **ожидаемое поведение** по решению Игоря 28.04.2026. В отчёте Code зафиксировать сколько именно плазмид выпало.

---

## 10. Открытые вопросы

- **Что если Игорь захочет вернуть какие-то >20 кб плазмиды в каталог?** `MAX_CATALOG_LENGTH = 20000` как именованная константа решает легко. Без UI-настройки.
- **Контракт V46 теперь работает только в overlay-mode.** Сужение контракта — отметить в DECISIONS.md при финализации.
- **Если SingleInspector overlay психологически странен** — отключить только для inspector в follow-up sprint.

---

**Дата создания:** 28.04.2026.
**Источник:** визуальная приёмка Sprint Catalog Polish + ответы Игоря на kickoff-интервью (включая итерации по F4).
