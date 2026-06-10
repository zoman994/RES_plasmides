# SPEC_MAIN_SCREEN_CLEANUP.md — главный экран: убрать дубли + reorganize

> **Тип задачи:** C (UX cleanup, mid). Размер спеки ~10 KB.
> **Sprint:** **M-MAIN-SCREEN-CLEANUP** (Code ~1-2 дня, low risk — точечные правки в StartScreen).
> **Приоритет:** низкий-средний. Делается **после** assembly cleanup раундов (M-ASSEMBLY-* sprints) — главный экран сейчас работает, просто перегружен. Assembly важнее.
> **Спека не блокирующая** — Игорь идёт обсуждать следующий экран (assembly), эта спека лежит в backlog до момента когда дойдём до её реализации.

---

## 0. Scope & non-goals

### IN scope
- Reorganize `StartScreen/Sidebar.jsx` — удалить лишние items, переместить actions.
- Reorganize `StartScreen/MainPanel.jsx` — primary CTA + 2 secondary actions + recent.
- Conditional rendering баннера «Сначала наполните библиотеку» (показывать только при пустой библиотеке).
- Conditional ⭐ favorite (только на проектах с контентом).
- Drop sequence file (`.dna`/`.gb`/`.fasta`) anywhere на главном экране → автоматически открывается Library + файл импортируется туда.
- `?` Help popover в header — слияние Руководство+Хоткеи+Глоссарий в один UI element.
- PWA install action переезжает в Settings.
- Footer припиской с версией.

### OUT scope
- **Glossary content** (что такое .bodge / .bodgeassembly / контейнер / сборка / piece / primer / op / zone) — **отдельный документ + раунд UX**. В этой спеке только подключение `?` popover, без содержания.
- **Library view UX** — отдельный sprint.
- **Settings page** — отдельный sprint (PWA install переезжает туда, но сама Settings page rework — out).
- **Лимит «В работе 1/15» ergonomics** — оставлено как есть (в Open Q).

---

## 1. Контекст

### 1.1 Что сейчас (v0.8.3-alpha, screenshot 20.05.2026)

Sidebar содержит:
- Logo + `<<` collapse.
- `+ Создать проект ^N` (primary action, оранжевый).
- `↑ Загрузить .bodge... ^O` (secondary action).
- `↓ Импорт .gb / .dna...` (secondary action).
- **РАБОЧЕЕ МЕСТО** label.
- `🏠 Главная`, `📚 Библиотека 142`, `📦 Праймеры soon`, `📂 Открыть проект`.
- **В РАБОТЕ 1/15** label + list проектов.
- `⌘ Все проекты ⌘P` (висит между секциями).
- **СПРАВКА** label + `📖 Руководство`, `⌨ Хоткеи ?`.
- Footer: `↓ Установить` PWA + `Тема: светлая` + `Настройки` + `v0.8.3-alpha`.

Main area содержит:
- Header: `Главная` + search bar (`Поиск проекта, плазмиды или фичи` `Ctrl K`) + `?`.
- `НЕДАВНИЕ ПРОЕКТЫ · 1` + `[Все] [Активные]` filters.
- Карточка проекта `Новый проект` + `0 контейнеров` + `2 мин назад` + ⭐ favorite.
- Баннер `Сначала наполните библиотеку` с `Выбрать набор` button.

### 1.2 Что не так

| Проблема | Описание |
|---|---|
| **3+ пути «открыть проект»** | Sidebar `📂 Открыть проект`, sidebar `⌘ Все проекты`, карточки в main. Биолог не понимает разницу. |
| **3 пути import sequence** | Sidebar `↓ Импорт .gb / .dna`, main баннер «Перетащите .dna / .gb», main `Выбрать набор`. |
| **`Праймеры soon`** disabled | Визуальный шум — функция не готова, не должна быть в навигации. |
| **`Открыть проект` в РАБОЧЕЕ МЕСТО** | Это action, не место. Структурное несоответствие. |
| **`Все проекты ⌘P` повисла** между секциями. |
| **Баннер «Наполните библиотеку» при заполненной** библиотеке (142 entries) — конфликт state. |
| **⭐ favorite на 0-контейнерном** проекте — преждевременно. |
| **`Установить` PWA внизу** — навязчивый CTA для casual user. |
| **Search bar сверху main** дублирует Ctrl+K palette overlay. |
| **Справка + Руководство + Хоткеи** — одна сущность размазана по трём элементам. |

---

## 2. Финальный layout (после правок)

```
┌────────────────────────────────────────────────────────────────────────┐
│  ☰  BodgeGene                       ⌘ K        ? Помощь    ⚙ Настройки│
├──────┬──────────────────────────────────────────────────────────────────┤
│ Logo │                                                                   │
│      │   ┌────────────────────────────────────────────────────────┐    │
│ + Соз│   │  + Создать проект                            ^N        │    │
│ дать │   └────────────────────────────────────────────────────────┘    │
│      │                                                                   │
│ ↑ За-│   ── Открыть существующее ──                                     │
│ грузи│                                                                   │
│ ть   │   ┌──────────────────────┐  ┌──────────────────────────┐        │
│ .bod-│   │ ↑ Загрузить .bodge   │  │ 📂 Все проекты        ⌘P│        │
│ ge   │   │   С диска (file)     │  │   Внутренний список      │        │
│      │   └──────────────────────┘  └──────────────────────────┘        │
│ ↓ Им-│                                                                   │
│ порт │   НЕДАВНИЕ ПРОЕКТЫ · 1                  [Все] [Активные]         │
│ .gb  │                                                                   │
│      │   ┌──────────────────────────────────────────────────────────┐  │
│ ─── │   │  ◯  Новый проект                       2 мин назад       │  │
│      │   │     0 контейнеров                          (no ⭐)        │  │
│ 🏠   │   └──────────────────────────────────────────────────────────┘  │
│ Глав-│                                                                   │
│ ная  │                                                                   │
│      │                                                                   │
│ 📚   │   (если библиотека пустая — баннер «Выбрать набор» здесь)        │
│ Биб- │                                                                   │
│ лио- │                                                                   │
│ тека │                                                                   │
│  142 │                                                                   │
│      │                                                                   │
│ 📂   │                                                                   │
│ Все  │                                                                   │
│ про- │                                                                   │
│ екты │                                                                   │
│      │                                                                   │
│ ─── │                                                                   │
│      │                                                                   │
│ В РА-│                                                                   │
│ БОТЕ │                                                                   │
│  1/15│                                                                   │
│      │                                                                   │
│ • Но-│                                                                   │
│ вый  │                                                                   │
│      │                                                                   │
├──────┤                                                                   │
│      │                                                                   │
│ ⚙ Те-│                                                                   │
│ ма   │                                                                   │
│      │                                                                   │
│ v0.9 │                                                                   │
│ .0-α │                                                                   │
└──────┴───────────────────────────────────────────────────────────────────┘
```

### 2.1 Что изменилось

**Sidebar:**
- Удалены: `📦 Праймеры soon`, `📂 Открыть проект` из РАБОЧЕЕ МЕСТО, `⌘ Все проекты ⌘P` отдельной строкой, секция «СПРАВКА» целиком (`📖 Руководство`, `⌨ Хоткеи ?`), `↓ Установить` PWA.
- Перемещён: `📂 Все проекты` теперь в основной navigation block (между `📚 Библиотека` и группой «В РАБОТЕ»).
- Удалена label `РАБОЧЕЕ МЕСТО` (искусственная группировка).
- Footer: `Тема` + `Настройки` + версия (PWA install переехал в Settings).

**Main area:**
- Header: `?` Help popover + `⚙ Настройки` icon buttons (search убран в Ctrl+K palette only).
- Top: `+ Создать проект` primary CTA full-width.
- Separator: «Открыть существующее».
- Two-column row: `↑ Загрузить .bodge` (С диска) + `📂 Все проекты` (внутренний список).
- `НЕДАВНИЕ ПРОЕКТЫ` + filters + cards (existing).
- Баннер «Сначала наполните библиотеку» — **только если `library.entries.length === 0`**.
- Drop area visual — **убран**. Drop любого sequence-файла anywhere → автоматически Library import (см. §4).

---

## 3. Конкретные правки (список для Code)

### 3.1 `StartScreen/Sidebar.jsx` (16.5 KB → ~12-13 KB)

**Удалить:**
1. SidebarItem `📦 Праймеры soon` (disabled state).
2. SidebarItem `📂 Открыть проект` в секции РАБОЧЕЕ МЕСТО.
3. SidebarItem `⌘ Все проекты ⌘P` повисший между секциями.
4. Section header `РАБОЧЕЕ МЕСТО` (label).
5. Section header `СПРАВКА` (label).
6. SidebarItem `📖 Руководство`.
7. SidebarItem `⌨ Хоткеи ?`.
8. SidebarItem `↓ Установить` PWA install (footer).

**Добавить:**
1. SidebarItem `📂 Все проекты` (без `⌘P` hint, hotkey активен через CommandPalette) — в main navigation block после `📚 Библиотека`.

**Сохранить:**
- Logo + `<<` collapse.
- `+ Создать проект ^N` (primary, orange).
- `↑ Загрузить .bodge... ^O`.
- `↓ Импорт .gb / .dna...`.
- `🏠 Главная`, `📚 Библиотека 142`.
- В РАБОТЕ 1/15 + open projects list.
- Footer: `Тема` toggle + `Настройки` + `v0.X.Y-alpha`.

### 3.2 `StartScreen/MainPanel.jsx`

**Header:**
- Удалить search input (Ctrl+K palette достаточно).
- Добавить `? Помощь` button → popover с тремя секциями (`Руководство` / `Хоткеи` / `Глоссарий терминов`, контент Глоссария — placeholder для будущего раунда).
- Сохранить `⚙ Настройки` icon button.

**Action area (новая секция сверху):**
1. Full-width orange button `+ Создать проект ^N` (primary CTA).
2. Separator label «Открыть существующее».
3. Two-column row:
   - Left card: `↑ Загрузить .bodge` + подпись «С диска (file)» → opens OS file picker.
   - Right card: `📂 Все проекты` + подпись «Внутренний список» + `⌘P` hint badge → opens projects list panel (existing flow).

**Recent projects (existing, минимальная правка):**
- Cards — same as now.
- ⭐ favorite icon — **conditional rendering**: показывать только если `project.containers.length > 0 || project.zones.length > 0`. На пустых проектах ⭐ не виден.
- Empty state «нет recent projects» — silent (просто отсутствие cards).

**Library onboarding banner:**
- Conditional rendering: показывать **только** если `library.entries.length === 0`.
- Если показывается — текст «Сначала наполните библиотеку» + кнопка `Выбрать набор`.
- Иначе — не рендерится (no DOM noise).

### 3.3 `StartScreen/index.jsx` (root)

**Drop file handling:**
- Whole `<StartScreen>` принимает `onDrop` event handler.
- При drop `.dna` / `.gb` / `.fasta` / `.fa` файлов:
  - Highlight sidebar item `📚 Библиотека` (visual feedback during drag-over).
  - Cursor `copy` icon во время dragOver.
  - При drop → dispatch `openLibrary()` + `importSequenceFilesIntoLibrary([files])`.
  - Toast notification «N файлов импортируется в Библиотеку».
- При drop `.bodge` / `.bodgeassembly` файлов:
  - Highlight основной area.
  - При drop → existing `.bodge` open flow.
- При drop неизвестных типов:
  - Toast warning «Поддерживаются .dna / .gb / .fasta / .bodge / .bodgeassembly».
  - Не открывать ничего.

### 3.4 `?` Help popover (новый компонент `StartScreen/HelpPopover.jsx`)

```jsx
// ~50 LOC component
<Popover anchor="?-button">
  <Tabs>
    <Tab label="Руководство">
      <a href="...">Открыть онлайн-руководство ↗</a>
      {/* TODO: inline help text — отдельный раунд */}
    </Tab>
    <Tab label="Хоткеи">
      {/* Re-use existing HotkeyCheatsheet.jsx content */}
      <HotkeyCheatsheet />
    </Tab>
    <Tab label="Глоссарий">
      {/* Placeholder для будущего раунда */}
      <p style={{color: 'var(--text-tertiary)'}}>
        Содержание готовится. Скоро будут пояснения терминов:
        контейнер, сборка, кусок, праймер, операция, зона, .bodge,
        .bodgeassembly, и других.
      </p>
    </Tab>
  </Tabs>
</Popover>
```

Размер: ~4 KB.

### 3.5 `SettingsModal.jsx` — добавить «Установить как приложение»

В существующий SettingsModal добавить секцию:

```
─ Установка как PWA ─

  [↓ Установить BodgeGene как приложение]

  При установке BodgeGene становится отдельным окном с
  иконкой в системе. Работает без браузерной обвязки.
```

При click — trigger existing PWA install prompt (`window.deferredPrompt.prompt()`). Hide section если приложение уже установлено или PWA install не поддерживается браузером.

---

## 4. Drop sequence file → Library behavior (детально)

### 4.1 Flow

1. **`dragenter` на `<StartScreen>` root** → check `event.dataTransfer.types.includes('Files')`.
2. **`dragover`** → preventDefault + `event.dataTransfer.dropEffect = 'copy'` (cursor показывает copy icon).
3. **Visual feedback во время dragOver:**
   - Sidebar item `📚 Библиотека` — добавить class `drag-target-active` (pulsing border + accent background).
   - Тoast не показывать (избыточно).
4. **`dragleave` на root** → убрать highlight.
5. **`drop` event** →
   - Получить `Array.from(event.dataTransfer.files)`.
   - Filter по расширению: `.dna`, `.gb`, `.gbk`, `.fasta`, `.fa`, `.txt` (sequence).
   - Если есть sequence files → `actions.openLibraryAndImportSequenceFiles(files)`.
   - Если есть `.bodge` / `.bodgeassembly` → existing flow (`actions.openBodgeFromFile(file)`).
   - Если все файлы не распознаны → Toast warning «Поддерживаются: .dna / .gb / .fasta / .bodge / .bodgeassembly».

### 4.2 `openLibraryAndImportSequenceFiles(files)` action (новая)

```javascript
// в store actions
async function openLibraryAndImportSequenceFiles(files) {
  // 1. Переключить view на Library
  dispatch({ type: 'NAVIGATE_TO', view: 'library' });
  
  // 2. Запустить import flow для каждого file
  for (const file of files) {
    await dispatch(importSequenceFileIntoLibrary(file));
  }
  
  // 3. Toast notification
  toast.success(`${files.length} файлов импортированы в Библиотеку`);
}
```

Existing `importSequenceFileIntoLibrary(file)` — predict re-use из текущего Library/ImportStartScreen path.

---

## 5. Conditional rendering rules

| Element | Condition |
|---|---|
| Library onboarding banner | `library.entries.length === 0` |
| ⭐ favorite icon on project card | `project.containers.length > 0 \|\| project.zones.length > 0` |
| `↓ Установить` PWA в Settings | `window.deferredPrompt !== null && !isPWAInstalled` |
| Search bar в Main header | **никогда** (Ctrl+K palette only) |
| Sidebar item highlight `drag-target-active` | `isDraggingOverWindow && hasSequenceFiles` |

---

## 6. K-точки для Code

**K1 — Sidebar cleanup.** Удалить 8 items per §3.1, добавить `📂 Все проекты` в main navigation. Sidebar.jsx 16.5 KB → ~12 KB. +3 tests (visibility/absence).

**K2 — MainPanel restructure.** New action area с primary CTA + secondary 2-card row. Header search → `?` popover button. ⚙ Settings icon. +5 tests.

**K3 — HelpPopover component.** New `StartScreen/HelpPopover.jsx` ~50 LOC. 3 tabs (Руководство placeholder / Хоткеи через existing HotkeyCheatsheet / Глоссарий placeholder). +3 tests.

**K4 — Drop file handler.** `StartScreen/index.jsx` принимает `onDragOver` / `onDrop`. Dispatch `openLibraryAndImportSequenceFiles(files)` для sequence files, existing flow для `.bodge` / `.bodgeassembly`, toast для unknown. +5 tests.

**K5 — Conditional rendering.** Library banner only if empty. ⭐ only if non-empty project. +4 tests.

**K6 — Settings PWA install section.** Добавить в `SettingsModal.jsx` PWA install button с conditional rendering. +2 tests.

**K7 — Smoke test.** Manual flow:
1. Open app first time → empty state, library banner visible, no recent projects, no PWA install в sidebar.
2. Drop `.gb` file on window → highlight Library, drop → opens Library + file imported + toast.
3. Click `?` Help → popover с 3 tabs.
4. Settings → PWA install section visible (если supported).
5. Create project → recent card appears без ⭐ (0 containers).
6. Open project, add container, return → recent card с ⭐ visible.

---

## 7. STOP-условие

Code останавливается после K7. Отчёт включает:
- Sidebar size before/after.
- MainPanel size before/after.
- Vitest counter delta.
- Drop file smoke test result.
- Conditional rendering verified.

**Координационные файлы Code не трогает** (per CHAT_PLAYBOOK Code recurring violation pattern).

---

## 8. Открытые вопросы

1. **Glossary content** — содержимое Tab «Глоссарий» в HelpPopover. Список терминов:
   - `.bodge` — формат файла проекта.
   - `.bodgeassembly` — портативный артефакт одной сборки.
   - `.bodgebox` — single container portable (если решим использовать).
   - Контейнер — физическая запись ДНК (плазмида / линейный фрагмент).
   - Сборка — операция конструирования нового контейнера из существующих.
   - Кусок (piece) — концептуальный фрагмент в сборке.
   - Праймер — короткая ДНК для PCR.
   - Операция — реакция (PCR / Gibson / GG / Restriction / KLD).
   - Зона — Miro-style рамка на canvas группирующая узлы одной сборки.
   - **Отдельный раунд UX** — pure content task.

2. **«В работе 1/15» лимит ergonomics** — оставить 15 или снизить? Решается после real-world usage с 10+ проектами.

3. **Drop sequence file на open project** (не на главный экран) — что делает? Сейчас спека описывает только Drop на StartScreen. Drop на canvas / sequence view / другое — может быть в **отдельном раунде** (consistency UX project-level).

4. **`.bodgeassembly` import** — нужна ли отдельная кнопка `↑ Загрузить .bodgeassembly` рядом с `↑ Загрузить .bodge`, или один auto-detect dispatcher (расширение определяет flow)? Я склоняюсь к **auto-detect** (одна кнопка `↑ Загрузить файл .bodge*`), но это требует UI labeling. Решение Игоря.

5. **Drag-over visual feedback intensity** — pulsing border + accent background highlight Library item OK, или слишком visually intense? Подгонка в визуальной приёмке.

---

## 9. Связь с другими спеками

- **`SPEC_ASSEMBLY_WORKFLOW_UX.md`** — assembly editor cleanup идёт раньше, у него выше priority.
- **`SPEC_BODGE_FORMAT_V2_CORE.md`** — `.bodgeassembly` import handler (K11) уже есть в backend, нужно wire в этой спеке `.bodgeassembly` file dispatch.
- **`SPEC_BODGE_NOTEBOOK_MARKDOWN.md`** — NotebookTab wire-up в EditorWindowShell — отдельная задача, не в этой спеке.

---

**Дата:** 20.05.2026.
**Author:** Chat (BodgeGene Architecture).
**Реализация:** Sprint M-MAIN-SCREEN-CLEANUP (Code, ~1-2 дня).
**Зависимости:** существующий StartScreen/* код. Existing actions (`importSequenceFileIntoLibrary`, PWA install prompt).
**Не блокирует:** assembly cleanup sprints — главный экран работает, просто перегружен. Этот sprint в backlog до момента когда дойдёт очередь.
