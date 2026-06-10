# SPEC_PROJECT_CANVAS_CLEANUP.md — project canvas: убрать дубли + library search bar

> **Тип задачи:** C (UX cleanup, mid). Размер спеки ~14 KB.
> **Sprint:** **M-PROJECT-CANVAS-CLEANUP** (Code ~2-3 дня, low-mid risk).
> **Приоритет:** низкий-средний. Делается **вместе с** или **после** M-ASSEMBLY-CLEANUP — половина решений (action buttons unification) откладывается до assembly cleanup потому что они wire to assembly model.
> **Не блокирующий:** project canvas сейчас работает.

---

> ## 🔄 ПОПРАВКА 23.05.2026 — разбор узла B
>
> **DEC-V0.8.3-CANVAS-FINAL-MODEL:** на канвасе живут только зоны-сборки; свободного контейнера-ноды нет. Следствия для этой спеки:
>
> **1.** §2 layout / §3.2 — рудимент «+ Пусто · click / drop запчасть» на пустом канвасе и «click → создать новую zone (если empty area)» **отменяются**: канвас не принимает свободный контейнер. Клик по entry в выпадающем списке `LibrarySearchBar` всегда ведёт в зону-сборку (нет активной зоны — создаётся зона), не кладёт ноду на пустой канвас.
>
> **2.** Удаление свободного контейнера-ноды из живого кода (`ContainerBlock`, drop-пути в `CanvasLayoutView`/`useCanvasLayoutDrag`) — **НЕ в этой спеке**, вынесено в `SPEC_CANVAS_NO_LOOSE_CONTAINERS.md`. Остальное в PC-K (search bar, убрать дубли, title, non-functional кнопки) — в силе без изменений.
>
> **3.** §5 «Option B — убрать + Операция, операции только внутри зон» — согласуется с DEC-V0.8.3-CANVAS-FINAL-MODEL и становится не «одной из опций», а следствием модели (нет верхнего уровня кроме зон).

---

## 0. Scope & non-goals

### IN scope (можно зафиксировать сейчас, изолированно)

- **Library tree → top search bar:** заменить sidebar tree `LibraryTreeHost` на top search-input. Click либо typeahead-input открывает выпадающий dropdown с категориями (Контейнеры / Сборки / Праймеры) и searchable list.
- Убрать non-functional кнопки: `📁 Протокол`, `🧪 Заказ олигов`.
- Условный rendering `📋 Сборки (N)` — скрыть когда `N === 0`.
- Title в header: `Canvas-скелет` → `<project name>` (читабельно биологу).
- Footer link `Рабочие таблицы` (Airtable shortcut) — убрать целиком.
- Duplicate version в footer tree panel — убрать (оставить только в sidebar footer).
- «Свободный стол биолога» — переименовать в **«Из библиотеки (не привязано)»** или **«Доступные плазмиды»** (биолог сказал — фрагменты в библиотеке без привязки к проектам).

### OUT scope (отложено в assembly cleanup)

- **`+ Сборка` vs `+ Операция` unification** — биолог сказал «там всё перепутано, надо унифицировать с новым ассемблером». Эта переработка идёт **вместе с** M-ASSEMBLY-CLEANUP, не отдельно. В этой спеке canvas action buttons остаются как есть (минус два non-functional).
- **`Layout / Graph` toggle** — биолог сказал «дальше когда пойдём в сборку». Отложено до visual acceptance assembly editor.
- **`+ Добавить` (orange) в tree header** — поведение depends on what tree становится после замены на search bar. Решается в Library search dropdown design.
- **Дубликаты pUC19/pET-28b ×2** — биолог не ответил, скорее всего это **fixture data** для демо (8 entries из start-screen-data.js). Не bug, не fix в этой спеке. Если bug в реальной library — отдельная диагностика.

---

## 1. Контекст

### 1.1 Что сейчас (v0.8.3-alpha, screenshot 20.05.2026)

Project canvas state с открытым проектом «Новый проект»:

**Sidebar (persistent — общий со StartScreen):**
- Logo + actions + navigation. Этим занимается `SPEC_MAIN_SCREEN_CLEANUP.md`.

**Tree panel (middle, ~300px width):**
- `+ Добавить` orange CTA + sort icon.
- Filter input «Фильтр в дереве…».
- Tree:
  - `▾ ★ Новый проект [active] (Контейнеры 0 / Праймеры 0)`.
  - `▾ ⓧ свободный стол биолога 8 (Контейнеры 8 / Праймеры 0)` — список pUC19 ×2 / pET-28b ×2 / pGEX-4T-1 ×2 / pBluescript SK ×2.
  - `▾ 🗑 КОРЗИНА (удалено, можно восстановить 0)`.
- Bottom: `🧪 Рестриктазы [○ Скрыты]` toggle.
- Footer: `BodgeGene v0.8.3-alpha · 8 entries` (duplicate version).

**Canvas area (main, right):**
- Header: `← Назад` button + title `Canvas-скелет` + `[Layout | Graph]` toggle.
- Empty state: dashed border zone «+ Пусто · click / drop запчасть».
- Bottom-right floating action buttons:
  - `🗑 Очистить` (ghost gray).
  - `📋 Сборки (0)` (ghost gray, counter с 0).
  - `+ Сборка` (orange primary).
  - `📁 Протокол` (ghost gray).
  - `🧪 Заказ олигов` (ghost gray).
  - `+ Операция` (orange primary).
- Zoom indicator top-right: `[− 100% +]`.
- Footer link bottom-left: `Рабочие таблицы` (Airtable shortcut).

### 1.2 Решения Игоря (20.05.2026 обсуждение)

| # | Игорь сказал | Действие |
|---|---|---|
| 1 | «Библиотека = строка поиска сверху, sidebar убрать» | Replace `LibraryTreeHost` с top search bar + dropdown. |
| 2 | «Свободный стол биолога — фрагменты без привязки к проектам» | Переименовать, оставить семантику. |
| 3 | «+ Сборка / + Операция перепутано, надо унифицировать с ассемблером» | **Отложено** в M-ASSEMBLY-CLEANUP. |
| 4 | «📁 Протокол / 🧪 Заказ олигов — нерабочие, убрать» | Remove from UI. |
| 5 | «Layout / Graph — дальше в сборке» | **Отложено** в M-ASSEMBLY-CLEANUP. |
| 6 | «Рабочие таблицы — нафиг не нужно» | Remove footer link. |

---

## 2. Финальный layout (после правок CORE — то что в IN scope)

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│  ☰ BodgeGene             ⌘K           ? Помощь    ⚙ Настройки                       │
├──────┬──────────────────────────────────────────────────────────────────────────────┤
│ side │   ← Назад   Новый проект                              [Layout | Graph]      │
│ bar  │                                                                                │
│ (см. │   ┌──────────────────────────────────────────────────────┐                   │
│ MAIN-│   │ 🔍 Поиск в библиотеке (плазмиды, праймеры, сборки)   │                   │
│ SCRE-│   └──────────────────────────────────────────────────────┘                   │
│ EN-  │      (click → выпадающий список или ввод → typeahead)                         │
│ CLEA-│                                                                                │
│ NUP) │                                                                                │
│      │   ┌──────────────────────────────────────────────────────────────────────┐  │
│      │   │                                                                       │  │
│      │   │              +  Пусто · click / drop запчасть                         │  │
│      │   │                                                                       │  │
│      │   └──────────────────────────────────────────────────────────────────────┘  │
│      │                                                                                │
│      │                                                                                │
│      │                                                                                │
│      │                                                                                │
│      │                                                                                │
│      │                                                                                │
│      │                                                                  [− 100% +]   │
│      │                                                                                │
│      │                                                          [🗑 Очистить]        │
│      │                                                          [+ Сборка]          │
│      │                                                          [+ Операция]        │
└──────┴──────────────────────────────────────────────────────────────────────────────┘
```

**Что изменилось:**

- **Tree panel** (middle ~300px) — удалена целиком. Освободилось значимое место для canvas.
- **Top of canvas area:** добавлена search bar для library (full-width над canvas).
- **Title** в header: `Canvas-скелет` → `Новый проект` (имя проекта).
- **Bottom-right actions:** удалены `📁 Протокол`, `🧪 Заказ олигов`. `📋 Сборки (0)` скрыта при 0. Остались только `🗑 Очистить`, `+ Сборка`, `+ Операция` — последние два **остаются как есть до M-ASSEMBLY-CLEANUP** где будут unified.
- **Footer link** «Рабочие таблицы» — удалён.
- **Layout / Graph toggle** — оставлен на месте (решение в M-ASSEMBLY-CLEANUP).

---

## 3. Library search bar (детально)

### 3.1 Behavior

Top of canvas area — full-width input с placeholder `🔍 Поиск в библиотеке (плазмиды, праймеры, сборки)`.

**State 1 — collapsed (default):** только input field. Не занимает много места.

**State 2 — focused / typing:** под input открывается dropdown panel ~400-500px height с категориями:

```
┌────────────────────────────────────────────────────────────┐
│ 🔍 puc                                                  ⓧ  │
└────────────────────────────────────────────────────────────┘
┌────────────────────────────────────────────────────────────┐
│ ── Из библиотеки (не привязано) · 2 ──                     │
│  ○ pUC19         432 bp · circular · 3 features  [перетащ.]│
│  ○ pUC19         432 bp · circular · 3 features  [перетащ.]│
│                                                              │
│ ── В этом проекте · 0 ──                                    │
│  (пусто)                                                    │
│                                                              │
│ ── Сборки · 0 ──                                            │
│  (пусто)                                                    │
│                                                              │
│ ── Праймеры · 0 ──                                          │
│  (пусто)                                                    │
└────────────────────────────────────────────────────────────┘
```

**State 3 — click outside / Esc:** dropdown collapses, input остаётся visible.

### 3.2 Search logic

- **Filter substring** (case-insensitive) по полю `name` каждой entry.
- Группировка по категориям: «В этом проекте» (containers/zones текущего проекта) + «Из библиотеки (не привязано)» (LibraryEntry без projectId либо с другим projectId) + «Сборки» (zones cross-project? или только текущего проекта?) + «Праймеры» (pool).
- Click на entry → автоматически добавляет в текущий project canvas (drag-drop equivalent).
- Drag-drop из dropdown в canvas — тоже работает (existing pattern).
- Empty search query → показывать **все категории collapsed by default** (header + counter без content). Biolog раскрывает интересную категорию click'ом на header.

### 3.2.1 Visual parity с Library view (amendment 20.05.2026)

**Решение Игоря 20.05.2026:** rows в dropdown должны выглядеть так же как rows в Library view — с MiniPlasmidMap thumbnails, не просто text.

Каждая row dropdown'а:
- **Слева:** `<MiniPlasmidMap container={c} size={32} />` (existing component из `canvas/MiniPlasmidMap.jsx`) — circular thumbnail с цветным feature map. Для primers → `OligonucleotideBlock` mini variant. Для zones → placeholder icon (🧬 в кружке или mini zone diagram).
- **Центр:** name (bold) + metadata line (`432 bp · circular · 3 features`).
- **Справа:** опциональный visual marker если container используется в текущем проекте.
- **Hover:** `background: var(--surface-2)` highlight (стандарт).
- **Click:** add to current zone (если active) или создать новую zone (если empty area). Single click sufficient — no double-click needed.
- **Drag:** existing pattern, biolog тянет в кастомную позицию canvas.

### 3.2.2 Collapsed categories behavior

- **Default state** (focus on input, empty query): все категории показаны как headers + counter, content скрыт. Compact view — biolog видит сразу что есть, не scroll'я через 142 entries.
- **Click на category header** → expand (▶ → ▼) показывает rows.
- **Typing в search input** → категории с матчами **auto-expand** (matches highlighted). Категории без матчей остаются collapsed.
- **Empty category** (например «Сборки · 0») — header показан как disabled (gray), не expandable.
- **Click outside dropdown** → close dropdown. При повторном open — категории возвращаются к default collapsed state.

### 3.3 Что было в tree панели, что не теряется

Tree show'ил:
- ✓ Контейнеры текущего проекта → в dropdown «В этом проекте».
- ✓ Контейнеры свободного стола (LibraryEntry без projectId) → «Из библиотеки (не привязано)».
- ✓ Праймеры → «Праймеры».
- ✓ Корзина (deleted, recoverable) → **в dropdown отдельная вкладка/секция или скрывается?**
- ✓ Рестриктазы toggle → отдельный setting, не в search.

**КОРЗИНА** — что делать?
- Option A: показывать deleted entries в search dropdown с серой иконкой + кнопкой «восстановить».
- Option B: убрать корзину из search, доступ через context menu или Settings → «Восстановить удалённое».

Я бы делал **B** — корзина не нужна biolog'у каждый день, доступ через Settings → подменю «Trash» (или undelete через Ctrl+Z right after delete). Освобождает search dropdown от noise.

**Рестриктазы скрыты toggle** — это другая фича (restriction site overlay в SequenceView). Не часть library tree, переезжает в **canvas settings popover** (через гайку в canvas header).

### 3.4 Component

Новый компонент `canvas/LibrarySearchBar.jsx` (~6-8 KB):

```jsx
function LibrarySearchBar({ project, library, onSelectEntry, onDragStartEntry }) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  
  const grouped = useMemo(() => {
    const all = [...project.containers, ...library.entries];
    const filtered = query 
      ? all.filter(e => e.name.toLowerCase().includes(query.toLowerCase()))
      : all;
    return {
      inProject: filtered.filter(e => e.projectId === project.id),
      fromLibrary: filtered.filter(e => !e.projectId || e.projectId !== project.id),
      // assemblies, primers — separate slices
    };
  }, [query, project, library]);
  
  return (
    <div className="library-search-bar">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setIsOpen(true)}
        onBlur={(e) => {
          // Delay close so click on dropdown item registers
          setTimeout(() => setIsOpen(false), 200);
        }}
        placeholder="🔍 Поиск в библиотеке (плазмиды, праймеры, сборки)"
      />
      {isOpen && (
        <div className="library-search-dropdown">
          <Section title="Из библиотеки (не привязано)" entries={grouped.fromLibrary} />
          <Section title="В этом проекте" entries={grouped.inProject} />
          <Section title="Сборки" entries={grouped.assemblies} />
          <Section title="Праймеры" entries={grouped.primers} />
        </div>
      )}
    </div>
  );
}
```

---

## 4. Конкретные правки (список для Code)

### 4.1 Tree panel — remove

- **Удалить** `LibraryTreeHost.jsx` из mount в `CanvasSkeleton/index.jsx` или wherever it's mounted.
- **Не удалять файл `LibraryTreeHost.jsx`** — keep as orphan component для возможного future use (как «collapsed sidebar tree variant»). Если не будет использован 1-2 sprint'а — archive в `src/_archive/`.
- **Tree state slice** в Zustand — keep (search bar читает теже данные).

### 4.2 Library search bar — add

- **Новый компонент** `CanvasSkeleton/canvas/LibrarySearchBar.jsx` (~6-8 KB).
- **Mount** в `CanvasLayoutView` (или wherever canvas root renders) сверху над canvas (full-width).
- **Wiring** с existing actions: `addContainerFromLibraryEntry` / `dragStartFromLibrary` / etc.

### 4.3 Header title

- **`SkeletonHeader.jsx`** — заменить `'Canvas-скелет'` (или какая там сейчас literal) на `state.activeProject.name`.
- Если name пустой / placeholder → fallback `'Без названия'` или `'Новый проект'` (defensive).

### 4.4 Remove non-functional buttons

- **`ProtocolPanel.jsx`** — удалить mount из canvas. Не удалять file — может пригодиться (T-future actual implementation). Можно переместить в `src/_pending/`.
- **`PrimerOrderPanel.jsx`** — same. Удалить mount, файл оставить.
- **`📋 Сборки (N)`** counter — conditional rendering: если zones count === 0, не рендерить. Иначе show count.

### 4.5 Footer cleanup

- **Tree panel footer** `BodgeGene v0.8.3-alpha · 8 entries` — удалить целиком (tree panel убирается).
- **Sidebar footer** version display — оставить (это единственное место).
- **`Рабочие таблицы` link** — найти где это linked (наверное в `SkeletonHeader` или footer area), удалить. Если это hardcoded Airtable URL — точно удалить.

### 4.6 «КОРЗИНА» feature relocation

- В tree был раздел корзины. После удаления tree — корзина переезжает в **Settings → «Удалённые элементы»** subsection (separate sprint, не в этой спеке).
- На время M-PROJECT-CANVAS-CLEANUP — корзина **temporarily disabled** в UI. Items не удаляются окончательно (data preserved), просто нет UI для restore. **Toast warning** при delete: «Удалённые элементы можно восстановить через Settings (раздел в разработке)».

Альтернатива (если простое решение нужно) — Ctrl+Z undo на recent delete (existing pattern). Если 3+ minutes since delete — only через Settings.

### 4.7 «Рестриктазы скрыты» toggle relocation

- Сейчас был внизу tree panel.
- Переезжает в **canvas settings popover** (gear icon в header или existing settings).
- Или **persistent state** — toggle на нижней панели canvas (если активно используется).
- На время M-PROJECT-CANVAS-CLEANUP — toggle переехал в `SkeletonHeader.jsx` рядом с Layout/Graph (small icon-button).

---

## 5. Что отложено до M-ASSEMBLY-CLEANUP

В canvas есть `+ Сборка` и `+ Операция` (два orange primary actions). Биолог сказал «там всё перепутано, надо унифицировать с новым ассемблером».

Решение — **в этой спеке оставить кнопки как есть**, переработка их разрезки идёт **в M-ASSEMBLY-CLEANUP**. Возможные направления (для discussion в той сессии):

- **Option A:** один `+ Добавить` dropdown с подпунктами `Сборка` / `Операция`. Меньше CTAs.
- **Option B:** убрать `+ Операция` целиком — операции живут **только внутри зон**, не в верхнем уровне canvas. Это согласно T-серии модели — op принадлежит zone.
- **Option C:** оставить два action'а но изменить veight — `+ Сборка` primary, `+ Операция` secondary. Visual disambiguation.

Я склоняюсь к **Option B** (operations внутри zone, никак иначе) — это согласуется с four-tier model + биолог-«пробирки на столе» mental model. Но это решение принимаем в assembly cleanup session.

---

## 6. K-точки для Code

**K1 — Remove tree panel mount.** Открепить `LibraryTreeHost` от mount в canvas. Не удалять файл. +2 tests.

**K2 — LibrarySearchBar component.** New `canvas/LibrarySearchBar.jsx` (~6-8 KB) с search + dropdown + 4 секции (В проекте / Из библиотеки / Сборки / Праймеры). +8 tests (rendering, filter, click→add, drag-out). **Visual parity follow-up (amendment 20.05.2026):** rows используют `<MiniPlasmidMap size={32} />` thumbnails + collapsed categories by default + auto-expand на typed query. Если K2 уже implemented Code'ом без этого — отдельный K2.1 follow-up sprint (3-5 ч работы).

**K3 — Mount search bar в canvas.** В `CanvasLayoutView` (или wherever) добавить mount сверху над canvas area. Width full. +3 tests.

**K4 — Header title binding.** `SkeletonHeader.jsx` — show `project.name` вместо hardcoded. Fallback. +2 tests.

**K5 — Remove non-functional panels.** Открепить mount `ProtocolPanel`, `PrimerOrderPanel`. Не удалять файлы. +2 tests (absence assertion).

**K6 — Conditional `Сборки (N)` button.** Скрыть кнопку когда N=0. +2 tests.

**K7 — Remove `Рабочие таблицы` footer link.** Find + delete. +1 test.

**K8 — Remove tree panel footer version.** Удаляется вместе с tree panel в K1, no extra work.

**K9 — Рестриктазы toggle relocation.** Move toggle из tree footer в `SkeletonHeader` или canvas settings popover. Existing state binding preserved. +3 tests.

**K10 — Smoke test.** Manual flow:
1. Open project → no tree panel sidebar, search bar сверху над canvas.
2. Type `puc` in search → dropdown с pUC19 в «Из библиотеки» секции.
3. Click pUC19 → container added в canvas.
4. Esc / click outside → dropdown closed, search input still visible.
5. Project title `Новый проект` (не `Canvas-скелет`).
6. Bottom-right: `🗑 Очистить` + `+ Сборка` + `+ Операция` (без Протокол / Заказ олигов / Сборки 0).
7. Footer link «Рабочие таблицы» — отсутствует.

---

## 7. STOP-условие

Code останавливается после K10. Отчёт включает:
- Tree panel removal verified.
- LibrarySearchBar mounted + tested.
- Header title shows project name.
- Non-functional buttons absent.
- Vitest counter delta.
- Smoke test 7 steps PASS/FAIL.

**Координационные файлы Code не трогает.**

---

## 8. Открытые вопросы

1. **Sort order в dropdown** — alphabetical, recent first, или favorites first? Я склоняюсь к recent first (биолог чаще обращается к недавним). T-future polish.

2. **Дубликаты pUC19 / pET-28b ×2 в screenshot** — это fixture data или реальный bug? Игорь не ответил. Если bug — отдельная диагностика, не в этой спеке. Если fixture — игнорировать.

3. **Drag-and-drop из dropdown в canvas** — нужен ли visual ghost при drag? Сейчас наверняка есть existing drag pattern из tree, нужно переиспользовать. Реализация — Code.

4. **Корзина relocation в Settings** — Settings page rework — отдельный sprint. На время M-PROJECT-CANVAS-CLEANUP — Ctrl+Z undo основной способ.

5. **«Из библиотеки (не привязано)» vs «Доступные плазмиды»** — какое название лучше? Биолог сказал «фрагменты в библиотеке без привязки к проекту». Я выбрал первый вариант, но если он короче / точнее — заменим. Решение Игоря.

6. **Empty dropdown state** — что показывать когда query пустой и нет recent? «Начните вводить, чтобы найти плазмиду» текстовый hint? Decide в реализации.

---

## 9. Связь с другими спеками

- **`SPEC_MAIN_SCREEN_CLEANUP.md`** — sidebar cleanup общий со StartScreen, не дублируется в этой спеке. Sidebar editing — там.
- **`SPEC_ASSEMBLY_WORKFLOW_UX.md`** — assembly editor cleanup, `+ Сборка` / `+ Операция` unification, Layout/Graph toggle — там.
- **`SPEC_BODGE_FORMAT_V2_CORE.md`** — никак не связан с этой спекой.
- **`SPEC_BODGE_NOTEBOOK_MARKDOWN.md`** — никак.

---

**Дата:** 20.05.2026.
**Author:** Chat (BodgeGene Architecture).
**Реализация:** Sprint M-PROJECT-CANVAS-CLEANUP (Code, ~2-3 дня).
**Зависимости:** existing `LibraryTreeHost.jsx`, `SkeletonHeader.jsx`, `ProtocolPanel.jsx`, `PrimerOrderPanel.jsx`, `CanvasLayoutView.jsx`. State slices preserved.
**Не блокирует:** assembly cleanup идёт parallel. Эта спека лежит в backlog.
