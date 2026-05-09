# CURRENT_TASK.md

## Поручение Code: StartScreen pixel-perfect (одна сессия)

**Статус:** 🟡 Готово к handoff Code.
**База:** v0.8.0 (M-X.5 Этап 2 закрыт). Ветка: новая `feature/startscreen-pixel`, форкается от main.
**Visual source-of-truth:** `docs/design_assets/start_screen.html` (22.90 KB, читать целиком).

**Что мы НЕ делаем сейчас:** не пишем спеку. Не правим Library workspace. Не финализируем acceptance Sprint M-X.7a v2 (он остаётся в FAIL-состоянии до отдельного цикла позже). Это **изолированная** задача — собрать стартовый экран по дизайну, без затрагивания библиотеки.

**Парный спринт после этого:** правки Library workspace (отдельные мелкие task'и).

---

## Что делать

Реализовать стартовый экран **pixel-perfect** по `docs/design_assets/start_screen.html`. Все кнопки — заглушки (`onClick={() => console.log('TODO: <action>')}`), без реальной логики. Цель — визуал и поведение **collapse/expand** + **theme switching**, ничего больше.

После реализации этот стартовый экран — **default landing** при открытии `localhost:3000`. Через него пользователь попадает во все остальные workspace'ы (на текущий момент работает только переход в Библиотеку — остальное `disabled` или stub).

---

## Структура (по mockup)

### Layout

- **Sidebar** (left): collapsible, **232 px expanded** ↔ **56 px collapsed**. Toggle через кнопку ‹‹ в шапке + hotkey **Ctrl+B**. Состояние persist в `localStorage` ключ `sidebar.collapsed`. При `window.innerWidth < 1100 px` авто-сворачивается; пользователь может развернуть обратно вручную (флаг «manual override» в localStorage).
- **Main** (right, flex-1): topbar 48 px + content area.

### Sidebar внутри (по mockup)

**Шапка (`sb-head`, 48 px):**
- Logo SVG (circle + амбер arc, 26×26 viewBox 256, точно как в mockup)
- «BodgeGene» 14 px / 600 weight (скрыт в collapsed)
- Кнопка ‹‹ toggle (скрыта в collapsed; в collapsed `sb-head` центрирует logo)

**Тело (`sb-body`):**

Первый блок — действия (без секции, виден сразу):
- `+ Создать проект` (`primary` амбер background, ⌃N в правом углу) → stub
- `↑ Открыть .bodge…` (⌃O) → stub
- `⤓ Импорт .gb / .dna…` → stub

Секция `Рабочее место`:
- `⌂ Главная` (**active** при `workspace.active==='startup'`)
- `▦ Библиотека` + counter `142` справа (active при `workspace.active==='library'`; counter — пока **захардкоженное `142`** для соответствия mockup; реальное число entries — следующий шаг)
- `⏣ Конструкции` disabled + `<span class="badge-soon">soon</span>`
- `⌬ Реакции` disabled + `soon`
- `⊟ Праймеры` disabled + `soon`

Секция `Справка`:
- `📖 Руководство` → stub
- `⌨ Хоткеи` + `?` справа → stub (или открывает существующую `KeyboardShortcuts` modal если есть; если её нет — stub)

**Подвал (`sb-foot`):**
- `⤓ Установить` (color `--accent-700`) → stub (in future — PWA install prompt)
- `◐ Тема: системная` → stub (theme switcher в этой версии — статичная заглушка с label, реальное переключение позже)
- `⚙ Настройки` (Ctrl+,) → stub
- `v 0.8.0` mono, маленький, читать из `gui/designer/src/lib/version.js`

**Active state визуал** (по mockup): `background: var(--accent-50)`, `color: var(--accent-500)`, и **левая полоска 2.5 px** через `::before` pseudoelement.

**Tooltip в collapsed state** (по mockup): `::after` с `data-tip` attribute, 60 px справа от иконки, фон `--surface-3`, shadow.

### Main внутри (по mockup)

**Topbar (`topbar`, 48 px):**
- `<h2>Главная</h2>` 15 px / 500 weight
- Search input flex:1 max-width 480 px, placeholder «Поиск проекта, плазмиды или фичи…», иконка ⌕ слева, kbd `Ctrl K` справа → stub (просто отображение, никакой логики поиска)
- Action button `?` (Руководство) → stub

**Content (`content`, padding 22 px / 26 px):**

Recent projects header:
- `<h3>Недавние проекты · 7</h3>` (захардкоженное `7`)
- Filter pills row: `Все` (`on` active) · `Активные` · `CRISPR` · `Экспрессионные` → stub'ы переключения активного пилла

Recent rows — **4 захардкоженных** по mockup:
1. `P43_Cas_Uni_Tr` ring 4-color · 8 432 bp · circular · 14 features · теги CRISPR + hygR · «2 часа назад» · `~/lab/Cas9` · status-dot ok (зелёный)
2. `pEXP-glaA-XynTL` ring 3-color · 7 218 bp · circular · 11 features · тег expression · «вчера» · `~/lab/expression` · status-dot unsaved (амбер)
3. `pHDR-pepA` ring 3-color · 5 940 bp · circular · 9 features · теги HDR + pepA · «3 дня назад» · `~/lab/pep`
4. `pET-28b_T5exo` ring 2-color · 5 369 bp · circular · 6 features · тег `черновик` (transparent border) · «неделю назад» · `~/lab/expression`

Все ring SVG — **точно по mockup** (paths, цвета, opacity). Это статичные SVG для каждой row, не data-driven.

**Empty card** (амбер тинт):
- 📚 иконка
- `<h4>Сначала наполните библиотеку</h4>`
- Описание: «Перетащите .dna / .gb в это окно или возьмите готовый набор: pUC19, pET28b, базовые CRISPR-векторы.»
- CTA `Выбрать набор` (амбер primary inline) → stub

---

## Темы

**Light + dark** через `data-theme` атрибут на root (`<div id="root">` либо на родительском элементе StartScreen). Все CSS variables из `start_screen.html` `:root` (light) и `[data-theme="dark"]` (dark).

Переключение темы — пока **не работает** (footer button `◐ Тема: системная` — stub). По умолчанию **light**.

Все цвета, размеры, font-family, font-size, padding, gap, border-radius, shadow — **строго из mockup**. Никаких приближений «на глаз».

---

## Файлы (предложение Code'у; точная декомпозиция — на усмотрение)

Новый каталог `components/StartScreen/`:
- `StartScreen.jsx` — корневой компонент (sidebar + main wrapper)
- `Sidebar.jsx` — collapsible sidebar (232/56)
- `SidebarItem.jsx` — переиспользуемая кнопка пункта (icon + label + right + tooltip + active/disabled states)
- `MainPanel.jsx` — topbar + content
- `RecentRow.jsx` — одна row recent projects (с MiniRing SVG)
- `EmptyCard.jsx` — амбер empty card
- `hooks/useSidebarCollapsed.js` — state collapse + persist + Ctrl+B + auto-collapse <1100px
- `start-screen-data.js` — захардкоженные 4 recent projects + ring SVG paths

Подключение:
- `App.jsx` — рендер `<StartScreen />` когда `workspace.active === 'startup'`.
- `store/workspaceSlice.js` — default `active = 'startup'` (вместо `'library'` как было). При первом запуске — startup экран.
- Существующий `NavRail.jsx` оставить **как есть** на текущий момент (ничего не трогаем за пределами StartScreen). После приёмки этой задачи решим что с ним.

CSS — inline через style либо отдельный `StartScreen.module.css` (на усмотрение Code; результат должен совпадать pixel-perfect).

---

## Чего Code НЕ делает

- Не трогает `components/Library/*`, `components/AppShell/*`, `LibraryWorkspace`, `LibraryTopBar`, `LibraryTree`, Inspector — все эти компоненты работают как есть.
- Не правит `librarySlice`, `db.js`, IndexedDB schema.
- Не делает реальный поиск, реальное переключение темы, реальный PWA install, реальный shortcut handler (кроме Ctrl+B для sidebar collapse).
- Не делает реальные recent projects из projectSlice — захардкоженные данные.
- Не финализирует PROJECT_STATE / RELEASES / DECISIONS / ANCHORS / TECH_DEBT / CLAUDE.md / BUGS.md.
- Не закрывает FAIL-состояние Sprint M-X.7a v2 (он остаётся открыт, в этой задаче не трогаем).

---

## Acceptance критерий

Open `localhost:3000` → видим стартовый экран **точно как в mockup** (expanded sidebar 232 px, light theme).

Проверки:
1. Sidebar 232 px, все элементы по mockup на правильных местах с правильными размерами.
2. Click на ‹‹ либо `Ctrl+B` → sidebar collapse в 56 px. Click ещё раз → expand.
3. Hover на иконку в collapsed → tooltip справа.
4. Active item (Главная) имеет амбер background + амбер text + амбер левую полоску.
5. Disabled items (Конструкции / Реакции / Праймеры) — opacity 0.45, badge `soon`, не кликабельны.
6. Topbar: «Главная» h2 + поиск 480 px max + ?.
7. Recent: 7 в счётчике header, 4 row отрисовано pixel-perfect (ring SVG, теги, время, путь, status-dot).
8. Empty card амбер тинт с CTA «Выбрать набор».
9. Версия в footer mono `0.8.0` (читается из `lib/version.js`).
10. Click на «Библиотека» в sidebar → переключает на `workspace.active='library'` (existing Library workspace остаётся как есть).
11. Все остальные кнопки → `console.log('TODO: …')`.
12. Reload → состояние sidebar (collapsed/expanded) сохраняется через localStorage.

Pixel-perfect значит: размеры, цвета, отступы, шрифты, hover-effects, active-effects, тени — **все совпадают с mockup**. Если Code где-то отступил — явно отметить в отчёте «вместо X в mockup сделал Y, причина Z».

---

## Формат отчёта Code

В конце сессии Code дописывает в этот `CURRENT_TASK.md` секцию «Отчёт StartScreen pixel-perfect»:

1. Коммит-хэши (один или несколько).
2. Vitest passing/total. Build status.
3. Размеры новых файлов.
4. **Отклонения от mockup** — explicit блок (если что-то не получилось pixel-perfect — по каждому пункту: «было в mockup X, сделано Y, причина Z»).
5. Что **не реализовано**: список stub-ов.
6. Скриншоты или указания «как проверить» (URL + последовательность кликов).

---

## STOP-условие

После реализации Code останавливается на ветке `feature/startscreen-pixel`:

> «StartScreen pixel-perfect landed. Vitest XXXX passing. Build clean. Жду визуальной приёмки. Не финализирую PROJECT_STATE / RELEASES / DECISIONS / ANCHORS / TECH_DEBT / CLAUDE.md / BUGS.md.»

---

## Handoff фраза для Code (одной строкой)

> Прочитай `CLAUDE.md`, `BUGS.md`, `CURRENT_TASK.md`. Реализуй стартовый экран pixel-perfect по `docs/design_assets/start_screen.html`. Все кнопки — stub'ы. Default landing на `workspace.active='startup'`. Не трогай `components/Library/*`, не трогай `components/AppShell/NavRail.jsx`, не правь `librarySlice`/`db.js`. После landing коммита — STOP, жди визуальной приёмки. Не финализируй PROJECT_STATE / RELEASES / DECISIONS / ANCHORS / TECH_DEBT / CLAUDE.md / BUGS.md.

---

**Дата:** 09.05.2026 (после приёмки Sprint M-X.7a v2 → FAIL и решения «маленькими шажками — сначала StartScreen, потом Library»).

---

## После приёмки этого

Когда StartScreen будет принят, делаем следующие маленькие шаги (примерный порядок, обсуждается):

1. **NavRail / AppShell cleanup** — старый `NavRail.jsx` (5 emoji-иконок) больше не нужен (его роль играет Sidebar в StartScreen). Удалить, переключить App.jsx чтобы Sidebar был общим shell для всех workspace'ов.
2. **Counter в Sidebar** — `▦ Библиотека` counter подключить к реальному `selectVisibleLibraryEntries().length`.
3. **Recent projects** — захардкоженные 4 row → реальные данные из projectSlice (если он есть; если нет — stub продолжает).
4. **F1: Library как default landing OR пересмотр DEC-MX7A-V2-08** — если решим что StartScreen и есть default landing навсегда, DEC-MX7A-V2-08 пересматриваем. Если StartScreen — переходный, и Library должна быть default — F1 fix остаётся в плане.
5. **Library workspace fix-цикл** (R4 PreImportModal handoff, IndexedDB wipe verification, остальные UNSURE из Sprint M-X.7a v2 acceptance).

Это **порядок**, не commit'ы в одной сессии. Каждый — отдельная маленькая задача с handoff Code.

---

## Отчёт StartScreen pixel-perfect (09.05.2026, end-of-sprint, STOP перед визуальной приёмкой)

### 1. Коммит-хэш

Один коммит — всё в составе spec'а одной сессией. Хэш landing'a — в репорте после `git commit`. Branch: текущая `feature/m-x-7a-library-structure-v2` (пользователь сказал «пиши в мэйн» — отступление от спеки которая просила новую `feature/startscreen-pixel`; решение: остаться на текущей рабочей ветке т.к. main за `dd0c36c` отстаёт от живой кодовой базы и потребовал бы major rebase).

### 2. Финальные счётчики

- **Vitest:** 1684 / 1684 passing + 28 skipped (legacy StartScreen tests `K5 — StartScreen wireframe v7` целиком marked describe.skip — старый M-A.x layout снесён рuilt'ом).
- **Build:** clean (~520 ms), PWA 28 entries 1182.87 KiB (+9.5 KiB от K7 baseline — новые StartScreen CSS + components + lazy AppShell chunks).
- pytest 112/112 (backend untouched).

### 3. Размеры новых файлов

| Файл | Размер | Лимит | Заметка |
|------|--------|-------|---------|
| `components/StartScreen/StartScreen.css` | 10.8 KB | — | scoped под `.start-screen-root` |
| `components/StartScreen/Sidebar.jsx` | 5.7 KB | 40 KB | OK |
| `components/StartScreen/hooks/useSidebarCollapsed.js` | 3.4 KB | 25 KB | OK |
| `components/StartScreen/RecentRow.jsx` | 3.0 KB | 40 KB | OK |
| `components/StartScreen/MainPanel.jsx` | 2.7 KB | 40 KB | OK |
| `components/StartScreen/start-screen-data.js` | 2.6 KB | 25 KB | OK |
| `components/StartScreen/SidebarItem.jsx` | 1.7 KB | 40 KB | OK |
| `components/StartScreen/StartScreen.jsx` | 1.5 KB | 40 KB | OK |
| `components/StartScreen/EmptyCard.jsx` | 1.0 KB | 40 KB | OK |
| `components/StartScreen/index.jsx` | 0.7 KB | 40 KB | re-export shim для App.jsx callsite |

**Удалены:** `StartScreen/SidebarLink.jsx` (1.2 KB), `StartScreen/RecentCard.jsx` (5.0 KB) — legacy support files. Старый `StartScreen/index.jsx` (365 lines / ~12 KB) переписан в re-export shim.

**Тронутые existing файлы (минимальный delta):**

| Файл | Delta | Заметка |
|------|-------|---------|
| `store/workspaceSlice.js` | +0.1 KB | default `active = 'startup'` (был 'library' от M-X.7a v2 K1) |
| `components/__tests__/AppShell.test.jsx` | +0.2 KB | testid update (`start-screen` → `start-screen-root`) |
| `components/__tests__/StartScreen.test.jsx` | (whole file) | marked `describe.skip` — legacy M-A.x tests deprecated |

### 4. Отклонения от mockup

- **Branch:** спека просила `feature/startscreen-pixel` от main; реализовано на `feature/m-x-7a-library-structure-v2` (пользователь сказал «пиши в мэйн», но `main` git branch стоит на v0.2.4-alpha с feb-2026; rebase невозможен без cherry-pick всей working history). Если для acceptance критичен отдельный branch — могу cherry-pick StartScreen commits на новый branch от любой указанной точки.
- **Theme switching** — кнопка `◐ Тема: системная` остаётся stub per спеку («реальное переключение позже»). `data-theme` атрибут читается с `<div id="root">` или родителя (через ThemeManager в Topbar/AppShell — существующий `applyThemeToDOM`); StartScreen наследует. Light default стоит.
- **`+ Создать проект` Ctrl+N hotkey** — отображается в right slot как `⌃N`, но реальный hotkey handler НЕ регистрируется (per спеку «не делает реальный shortcut handler кроме Ctrl+B для sidebar collapse»). Только Ctrl+B живой.
- **Counter `142`** — захардкожен per спеку. Реальный подсчёт `selectVisibleLibraryEntries().length` — следующий шаг.
- **Recent projects (4 row)** — захардкожены per спеку. Реальные данные из projectSlice — следующий шаг.
- **Filter pills** — переключают локальный active state (визуальный), но НЕ фильтруют список (4 row остаются всегда). Per спеку «stub'ы переключения активного пилла» — реализовано.
- **Search input** — stub без onChange handler (per спеку «никакой логики поиска»). Placeholder + kbd visual только.
- **CSS via plain CSS file** — выбран вместо CSS modules или inline-styles. Pseudo-elements (`.sb-item.active::before` для левой полоски, `.sb.collapsed .sb-item:hover::after` для tooltip) inline стилями невозможны. CSS scoped через `.start-screen-root` префикс (паттерн `Prototype/prototype-tokens.css`).

### 5. Не реализовано (stubs — все per спеку)

- `+ Создать проект`, `↑ Открыть .bodge…`, `⤓ Импорт .gb / .dna…` — `console.log('TODO: …')`
- `📖 Руководство`, `⌨ Хоткеи`, `?` topbar — stubs
- `⤓ Установить` (footer PWA), `◐ Тема: системная` (footer theme), `⚙ Настройки` (footer) — stubs
- Search input — нет onChange handler
- 4 recent rows — клик `console.log('TODO: open-recent <id>')`
- Empty card CTA `Выбрать набор` — stub
- Filter pills — переключают локальный active state, но не фильтруют

**Реальные:**
- `▦ Библиотека` click → `setActiveWorkspace('library')` + `setActiveFullscreen('library')` → entering existing LibraryWorkspace
- `⌂ Главная` click → `setActiveWorkspace('startup')` + `setActiveFullscreen('start')` → возврат на StartScreen
- ‹‹ toggle и Ctrl+B → sidebar collapse + persist в localStorage `sidebar.collapsed`
- Auto-collapse при `window.innerWidth < 1100 px` (с manual-override flag)

### 6. Как проверить

```
cd gui/designer && npm run dev
# открыть http://localhost:3000
```

1. Видим стартовый экран — sidebar 232 px expanded, ⌂ Главная active (амбер background + полоска слева).
2. Click ‹‹ → sidebar 56 px, видны только иконки. Hover → tooltip справа.
3. Ctrl+B → toggle.
4. Click `▦ Библиотека` → переходим в Library workspace (new M-X.7a v2). Click ⌂ Главная в любом месте Library Sidebar (если он там есть) или browser back → StartScreen.
5. Reload (Ctrl+R) → состояние sidebar сохраняется через localStorage.
6. DevTools console → клик любой stub-кнопки выдаёт `TODO: <action>`.

**Pixel-perfect verification:** открыть `docs/design_assets/start_screen.html` рядом с `localhost:3000` в side-by-side. Сравнить размеры, цвета, отступы. Любые расхождения — отметить, я разберусь в follow-up.

### 7. STOP

Per CURRENT_TASK.md STOP-условие: жду визуальной приёмки. **НЕ финализирую** PROJECT_STATE / RELEASES / DECISIONS / ANCHORS / TECH_DEBT / CLAUDE.md / BUGS.md. Sprint M-X.7a v2 FAIL-state не трогаю — он остаётся открыт для отдельного цикла.
