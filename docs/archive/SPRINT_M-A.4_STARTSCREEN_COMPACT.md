# Sprint M-A.4 — StartScreen compact rework

**Тип:** feature (UX-rework)
**База:** v0.8.0, спринт M-X.5 Library = primary closed (07.05.2026)
**Предпосылка:** Игорь подготовил визуальный макет компактного StartScreen в `docs/design_assets/start_screen.html` + анализ трёх вариантов в `start_screen_exploration.html`. Цель — переписать layout под единый collapsible sidebar (232/56 px) + recent с ring-thumbs + filter pills + drop-overlay + empty-card.

> Спека по шаблону `docs/_TEMPLATE_SPEC.md` v1.2.

---

## 0. Срез размеров

| Файл | Размер | Лимит | Зона |
|------|--------|-------|------|
| `components/StartScreen/index.jsx` | 13.61 KB | 40 KB | OK (после §3 декомпозиции должен уменьшиться) |
| `components/StartScreen/RecentCard.jsx` | 5.15 KB | 40 KB | OK (заменяется на `RecentRow.jsx`) |
| `components/StartScreen/SidebarLink.jsx` | 0.78 KB | 40 KB | OK (расширяется под collapsed mode) |

Декомпозиция первым шагом не нужна — все файлы в green zone. §4 решение 2 предусматривает разбиение нового кода по подкомпонентам, чтобы `index.jsx` не вырос.

---

## 0.5. Ответы Игоря на kickoff 08.05.2026

Источник — обмен в этой сессии после разбора макета `start_screen.html` и exploration A/B/C.

- **Section labels PROJECT/SEQUENCE/BROWSE — нужны?** Нет. Один блок действий сверху без подзаголовков; primary амбер «Создать» отделяется визуальным весом.
- **Disabled пункты в «Рабочее место» (Конструкции/Реакции/Праймеры soon) — убирать?** Нет, оставить как есть. BodgeGene — личный инструмент, недоделки норма.
- **Counter «142» рядом с Библиотекой?** Оставить.
- **Theme toggle — текст или иконка?** Текст в expanded, иконка ◐ в collapsed.
- **Primary CTA «Создать» — в шапке sidebar или внутри блока?** Внутри блока.
- **Импорт включает `.bodgebox` явно?** Принято (без этого нет ни одного entry point для нашего родного формата после DEC-INTEROP-01).
- **«Открыть .bodge…» → «Открыть проект»?** Решение Chat'у — выбираем «Открыть проект» (имя действия, расширение в tooltip).
- **Filter pills vs search-as-primary?** Filter pills — биолог думает категориями.
- **Drop-overlay на всю площадь?** Да, амбер-overlay с подсказкой по форматам.

**Не обсуждалось** (assumption'ы в §5):
- «Выбрать набор» CTA в empty-card — куда ведёт. Chat предполагает Library catalog.
- Multi-export mode (текущий `exportMode` + checkbox selection) — оставить или вырезать. Chat предполагает оставить как secondary через `⋯` меню. См. §10.
- PlasmidMiniMap API — подойдёт ли под 48px thumbnail. См. §10.

---

## 1. Контекст

Текущий StartScreen финализирован в Sprint M-A (30.04.2026), прошёл polish-итерации M-A.1..M-A.3. С тех пор было три волны изменений снаружи: import scope расширен (DEC-IMP-15..18 + DEC-CAT-04 в M-B FINAL), Library стала primary workspace (⚓ DEC-IMP-06 + DEC-LIB-12..17 в M-X.5), форматы получили DEC-INTEROP-01 (`.bodgebox` родной формат, 08.05.2026). Структура старт-экрана за этим не успела.

Что болит (см. exploration `start_screen_exploration.html` ARTBOARD 0 audit): бренд слабый; recent — текстовая стена без миниатюр; нет search; empty-state без CTA; drag-and-drop только через picker; PWA-install прячется. Макет `start_screen.html` решает это через collapsible single-sidebar layout — берём его как основу с двумя правками: импорт показывает `.bodgebox`; «Открыть .bodge» → «Открыть проект».

---

## 2. Стратегия

Переписываем `StartScreen` под trzy-зонный layout: sidebar (collapsible 232/56 px) + main (заголовок + filter pills + recent list) + drop-overlay на всю площадь. Декомпозируем `index.jsx` по подкомпонентам, чтобы файл остался в green zone. Strings — через `STRINGS.startScreen.*` (DEC-MA2-01). Persistence sidebar collapsed state — `localStorage` через `uiSlice`. PlasmidMiniMap реюзим как ring-thumb 48px через тонкий адаптер.

---

## 3. Scope

### IN

- `components/StartScreen/index.jsx` — переписать под orchestrator (~6–8 KB цель).
- `components/StartScreen/StartScreenSidebar.jsx` — новый. Шапка + actions + workspace + footer. Props `{ collapsed, onToggleCollapsed, ...handlers }`.
- `components/StartScreen/StartScreenMain.jsx` — новый. Топбар + filter pills + recent list (или EmptyCard).
- `components/StartScreen/RecentRow.jsx` — новый, заменяет `RecentCard.jsx` (удаляется). Горизонтальный ряд: thumb 48px / name+status-dot / meta+tags / time / path / hover-actions.
- `components/StartScreen/MiniRingThumbnail.jsx` — новый. Адаптер над `PlasmidMiniMap` для 48px ring без UI-обвязки.
- `components/StartScreen/EmptyCard.jsx` — новый. First-run nudge с CTA «Выбрать набор».
- `components/StartScreen/DropOverlay.jsx` — новый. Полноэкранный overlay при `dragenter` window.
- `components/StartScreen/SidebarLink.jsx` — расширить под collapsed mode (icon-only + tooltip).
- `store/uiSlice.js` — добавить `startScreenSidebarCollapsed: boolean` (default `false`) + setter + persist в localStorage.
- `lib/strings.js` — обновить `STRINGS.startScreen.*` (см. §6 K8 список новых keys).
- `lib/hotkeys.js` — `HOTKEYS.toggleStartSidebar = Ctrl+B`.

### OUT (явно отложено)

- **Полная фильтрация по pills.** «Все» работает, остальные — UI-only с toast `coming soon`. Реальная фильтрация — Sprint M-H.
- **Ctrl K command palette.** Заглушка-input с `kbd` подсказкой; собственно palette — отдельный спринт v0.9+ (UX_VISION ставка 7).
- **Grid/list switcher.** Только list view. Grid — кандидат на M-H.
- **Workspace rail (56px).** Отвергнут — Figma-style двойная навигация оправдана от 3+ живых разделов; сейчас один (Library). Кандидат на M-F.

---

## 4. Архитектурные решения

1. **Collapsible single sidebar 232/56 px с persistence.** Toggle через кнопку `‹‹` или Ctrl+B. State в `uiSlice.startScreenSidebarCollapsed` через тот же localStorage middleware что и `theme`. Auto-collapse при `window.innerWidth < 1100` (single-shot, пользователь может развернуть обратно).

2. **Декомпозиция StartScreen по подкомпонентам.** `index.jsx` остаётся orchestrator'ом, всё содержимое уезжает в подкомпоненты. Цель — упреждающее размещение под soft 30 KB и облегчение тестов (mount по подкомпоненту).

3. **PlasmidMiniMap реюз через адаптер.** `MiniRingThumbnail` оборачивает `PlasmidMiniMap` с `size={48}`. Если внутренний API не позволяет — fallback на собственный SVG с feature-palette через `featureColorShaded(type, name)` (DEC-DS-02). При невозможности любого варианта — Code останавливается. См. §5/§10.

4. **Filter pills как UI-stub в этом спринте.** «Все» работает, остальные — toast `coming soon`. Сохраняет visual integrity макета и даёт place-holder под M-H.

5. **Drop-overlay через window event listeners (capture phase).** `dragenter`/`dragleave`/`dragover`/`drop` на root. Visible когда `event.dataTransfer.types.includes('Files')`. Cleanup на unmount StartScreen — иначе двойная диспетчеризация в Library window.

6. **Импорт label включает `.bodgebox`.** Кнопка: `Импорт молекулы…`; tooltip: `.bodgebox · .gb · .dna · .fasta`. Drop-overlay text: `Drop .bodgebox / .gb / .dna / .fasta to import sequence`. Привязано к ⚓ DEC-INTEROP-01.

7. **«Открыть проект» вместо «Открыть .bodge».** Имя действия читается лучше расширения. Расширение раскрывается в file-picker filter и tooltip.

Решения 1, 2, 5 — кандидаты в sprint-level DECISIONS.md после приёмки. Решения 6, 7 — следствия уже зафиксированных ⚓ DEC-INTEROP-01 / DEC-MA2-01. Решения 3, 4 — sprint-level.

---

## 5. Предположения

1. **`PlasmidMiniMap` поддерживает рендер `size={48}` без UI-обвязки.** Источник: упоминание в memory (PlasmidMiniMap.jsx 29.68 KB). Проверено: **нет**. **Действие:** K6 первый шаг — посмотреть props; если не подходит — Code останавливается.

2. **`uiSlice` имеет localStorage persistence middleware (по `theme` / `sequenceView`).** Источник: memory + код v0.7. Проверено: **частично** — Code определит точное место подключения при чтении uiSlice.

3. **`STRINGS.startScreen.*` namespace существует и содержит current keys.** Источник: импорт в `index.jsx` строка 7. Проверено: да (head-чтение). Новые keys добавляем в тот же namespace.

4. **`data-testid="start-screen"` на корне сохраняется.** Источник: index.jsx строка 100. **Регрессия-guard:** не переименовывать; новые подкомпоненты получают свои testid'ы (`start-screen-sidebar`, `start-screen-recent-row` и т.п.).

5. **`promptInstall` из `lib/pwa-install` работает как сейчас.** Источник: index.jsx строка 6. UI-обёртка меняется (footer block в sidebar), вызов остаётся.

---

## 6. Задачи

### K1 — uiSlice + hotkey + persistence

**Файлы:** `store/uiSlice.js`, `lib/hotkeys.js`.

Добавить `startScreenSidebarCollapsed: boolean` (default `false`) + setter + persist через существующий middleware. Добавить `HOTKEYS.toggleStartSidebar = Ctrl+B`.

**Тесты** (`__tests__/uiSlice.startScreen.test.js`, +3): default state, setter обновляет state+localStorage, after-reload восстановление.

### K2 — Sidebar header + collapse toggle

**Файл:** новый `components/StartScreen/StartScreenSidebar.jsx`.

Шапка sidebar — лого 26px (ring SVG как в макете) + `BodgeGene` 14px/600 + кнопка `‹‹` toggle. В collapsed — только лого по центру.

**Тесты** (`__tests__/StartScreenSidebar.test.jsx`, +2): expanded видит все элементы, collapsed только лого.

### K3 — Sidebar actions block

**Файл:** тот же `StartScreenSidebar.jsx`.

Три кнопки: `+ Создать проект` (primary амбер, Ctrl+N), `↑ Открыть проект` (Ctrl+O, tooltip `.bodge файл`), `↑ Импорт молекулы…` (tooltip `.bodgebox · .gb · .dna · .fasta`).

**Тесты** (+4): три кнопки видимы, click «Создать» → `createProject` вызван, hotkey Ctrl+O → `onOpenFile`, импорт label содержит `.bodgebox` (regression guard для DEC-INTEROP-01).

### K4 — Sidebar workspace + footer

**Файлы:** `StartScreenSidebar.jsx` + расширить `SidebarLink.jsx`.

Workspace section: `Главная` (active), `Библиотека` с counter `STRINGS.startScreen.libraryCount(n)`, disabled пункты `Конструкции / Реакции / Праймеры` с `badge-soon`.

Справка section: `Руководство` (toast soon если нет route), `Хоткеи` (открывает HotkeysModal).

Footer: PWA-install (если `canInstallPwa`), Тема (текст в expanded, ◐ в collapsed), Настройки (`openSettings()`), версия mono.

`SidebarLink.jsx` — добавить prop `collapsed: boolean` + `tooltip: string` (рендер CSS-tooltip справа на hover в collapsed mode).

**Тесты** (+5): library counter render, disabled не reagируют на click, theme toggle переключает, PWA скрыт когда `canInstallPwa === false`, версия из `APP_VERSION`.

### K5 — Main topbar + filter pills

**Файл:** новый `components/StartScreen/StartScreenMain.jsx`.

Топбар: `Главная` (h2 15/500) + search-stub input (placeholder + `kbd Ctrl K`, focus → toast `Поиск — soon`) + `?` иконка (открывает HotkeysModal).

Filter pills row: `Все` (active), `Активные`, `CRISPR`, `Экспрессионные`. Click на не-«Все» → toast `STRINGS.startScreen.filterSoon(name)`.

**Тесты** (+3): search placeholder + Ctrl K видимы, click pill «CRISPR» → toast soon, default active pill = «Все».

### K6 — RecentRow + MiniRingThumbnail

**Файлы:** новый `RecentRow.jsx` + новый `MiniRingThumbnail.jsx`. Удалить `RecentCard.jsx`.

`MiniRingThumbnail` — адаптер `<MiniRingThumbnail size={48} project={p} />`:
1. Проверить `PlasmidMiniMap` props на поддержку size без обвязки.
2. Если поддерживает — реюзить.
3. Если нет — fallback SVG с arc segments через `featureColorShaded(type, name)` (DEC-DS-02). Min features check: 0 контейнеров → пустой круг.

**STOP при failure:** если ни PlasmidMiniMap, ни fallback SVG не сработают — Code останавливается с вопросом. См. §10.

`RecentRow` (grid 60px / 1fr / 90px / 110px / 30px): thumb / name+status-dot+meta+tags / relative-time / file-path mono / hover-only `⋯`.

Status-dot: зелёный для `lifecycle.savedToFile === true`, амбер для unsaved.

**Тесты** (+5): filled lifecycle → зелёный dot+filename, unsaved → амбер dot, click row → `onClick(projectId)`, hover показывает `⋯`, project с 0 features → пустой ring (regression guard).

### K7 — EmptyCard + DropOverlay

**Файлы:** новый `EmptyCard.jsx` + новый `DropOverlay.jsx`.

`EmptyCard` — render когда `recentProjects.length === 0`. Иконка + heading + body + CTA `Выбрать набор` → переход в Library (с прескролом на catalog presets если возможно, иначе обычный Library).

`DropOverlay` — listening на window dragenter/dragleave/dragover/drop (capture phase). Visible при file MIME. UI: full-screen амбер-tinted overlay + центральный блок с подсказкой по форматам. Drop dispatch: `.bodge` → `onOpenFile(file)`, `.bodgebox`/`.gb`/`.dna`/`.fasta` → import flow, другое → toast `Unsupported format`. Cleanup на unmount.

**Тесты EmptyCard** (+2): render heading+CTA, click CTA → переход в Library (mock route).
**Тесты DropOverlay** (+4): dragenter file → visible, dragleave → hidden, drop `.bodge` → `onOpenFile`, drop `.gb` → import flow.

### K8 — STRINGS обновление

**Файл:** `lib/strings.js`.

Добавить keys в `STRINGS.startScreen.*`:
- `actionCreate`, `actionOpen`, `actionImport` (`.bodgebox` упомянут в tooltip)
- `collapseTooltip`, `themeLabel(theme)`, `searchPlaceholder`
- `filterAll`, `filterActive`, `filterSoon(name)`
- `recentTitle`, `emptyTitle`, `emptyBody`, `emptyCTA`
- `dropOverlayBodge`, `dropOverlayMolecule`
- `libraryCount(n)`
- Tooltips для disabled Workspace items

**Тесты** (+1 smoke): все keys присутствуют.

### K9 — index.jsx orchestrator + integration tests

**Файл:** `components/StartScreen/index.jsx`.

Переписать как orchestrator: читает store, регистрирует hotkey через `useEffect`, рендерит `<StartScreenSidebar />` + `<StartScreenMain />` + `<DropOverlay />` + `<EmptyCard />` (если recent пуст). Auto-collapse при `window.innerWidth < 1100` (single-shot в `useEffect`).

Цель размера: ~6–8 KB.

**Integration тесты** (`__tests__/StartScreen.integration.test.jsx`, +4): empty recent → EmptyCard видим без RecentRow, 3 проекта → 3 RecentRow + filter pills, Ctrl+B → flag в store обновляется + layout меняется, drag `.bodge` на window → DropOverlay показан + drop вызывает `onOpenFile`.

---

## 7. Порядок

K1 → K2 → K3 → K4 → K5 → K6 → K7 → K8 → K9.

K1 даёт state (нужен в K9 orchestrator), K2–K4 строят sidebar инкрементально, K5–K7 — main area, K8 финализирует strings, K9 склеивает в orchestrator.

После каждого K — Vitest + build clean (Code сам прогоняет; baseline берёт из PROJECT_STATE.md перед стартом).

---

## 8. STOP-условие и формат отчёта

### STOP

После commit K9 Code останавливается. **НЕ:** обновляет PROJECT_STATE/RELEASES/DECISIONS/ANCHORS/BUGS/TECH_DEBT, не перемещает спеку в archive, не начинает следующий спринт, не трогает модули вне `StartScreen/`, `uiSlice`, `hotkeys`, `strings`.

### Формат отчёта

Code дописывает в конец `CURRENT_TASK.md`:

```
## Отчёт Code по Sprint M-A.4

- K1 коммит: <hash> — uiSlice + hotkey + persistence
- K2..K9 коммиты: <hash> — <commit msg>

- Размеры: index.jsx 13.61 → X KB; новые файлы (StartScreenSidebar / StartScreenMain / RecentRow / MiniRingThumbnail / EmptyCard / DropOverlay) X KB каждый
- Удалён: RecentCard.jsx (5.15 KB)
- Тесты: Vitest baseline N → N + ~33
- Build: clean | warnings | errors
- Отклонения от спеки: <список или «нет»>
- PlasmidMiniMap reuse: <через size={48} | fallback SVG | сорвалось — STOP>
- Multi-export mode: <оставлен | вырезан — см. §10>
```

---

## 9. Риски

1. **PlasmidMiniMap API не подойдёт под `size={48}`.** Митигация: K6 первый шаг — посмотреть props; fallback на собственный SVG с feature-palette; если оба варианта проваливаются — Code STOP с вопросом.

2. **`index.jsx` после декомпозиции остаётся overweight (>15 KB).** Митигация: при росте >12 KB — выделить `useStartScreenState` hook или `StartScreenLayout` wrapper; зафиксировать в отчёте.

3. **DropOverlay listeners на window конфликтуют с другими drop-targets (Library, Importer fullscreen).** Митигация: cleanup на unmount + capture phase + check `event.target` ancestry. Regression-test K7: смонтировать → unmount → drag-event → overlay не появляется.

4. **Auto-collapse при `<1100px` ломает тесты в JSDOM.** Митигация: auto-collapse активен только при наличии `window.innerWidth`; default false при mock JSDOM. Тест в K1 проверяет это.

---

## 10. Открытые вопросы

1. **Multi-export mode** (текущий `exportMode` + checkbox selection) — оставить или вырезать? Предполагаемый ответ: оставить как secondary через `⋯` меню в шапке main. Если Игорь хочет вырезать — сказать до K6 (RecentRow без checkbox по умолчанию).

2. **PlasmidMiniMap API** — подходит под 48px без обвязки? Жду первого K6 шага Code.

3. **«Выбрать набор» CTA в EmptyCard — куда ведёт?** Предполагаемый ответ: открыть Library с прескролом на catalog presets если возможно, иначе обычный Library. Не блокер.

4. **Filter pills фиксированный набор vs динамический?** Предполагаемый ответ: в этом спринте — фиксированный (`Все / Активные / CRISPR / Экспрессионные`) как в макете; динамический по реальным тегам — кандидат на M-H.

---

_Спека написана 08.05.2026. Код по этой спеке не запускался — обсуждаем структуру библиотеки прежде._
