# CURRENT_TASK.md

## Поручение Code: единый Sidebar во всех режимах

**Статус:** 🟡 Готово к handoff Code.
**Цель:** убрать скачки интерфейса при переходе StartScreen ↔ Library ↔ другие режимы. Sidebar StartScreen (232/56 px) — единственный shell на всех экранах. Меняется только content area справа.

---

## Что делать

**Сделать `components/StartScreen/Sidebar.jsx` единственной левой панелью для всех workspace'ов.** При любых переключениях:

- Кликаешь `▦ Библиотека` → справа рендерится Library content (тот что сейчас работает в LibraryWorkspace). Sidebar остаётся тот же.
- Кликаешь `⌂ Главная` → справа рендерится StartScreen content (Главная: topbar «Главная» + поиск + recent + empty card). Sidebar остаётся тот же.
- Аналогично для DAG / Importer / placeholders — sidebar не меняется, только справа другое содержимое.

Active item в Sidebar меняется по контексту:
- StartScreen workspace → `⌂ Главная` active.
- Library workspace → `▦ Библиотека` active.
- DAG / Importer / Mix — пока активен НИ один из существующих пунктов Sidebar (они под `Конструкции/Реакции/Праймеры (soon)`, что не совпадает). Active state в этом случае не подсвечивается. Доступ к DAG/Importer временно — через ту же навигацию что есть сейчас (старая `canvas.activeFullscreen='dag'` через какие-то существующие триггеры). Это не идеально, но в этой задаче DAG и Importer **не трогаем**.

---

## Конкретные изменения

### 1. `App.jsx` — реструктурировать root

Сейчас:
```
{activeFullscreen === 'start'
  ? <StartScreen onOpenFile={handleOpen} />
  : <AppShell>{inProjectChild}</AppShell>}
```

Меняется на единый layout: всегда снаружи Sidebar (StartScreen Sidebar), внутри — content area, в которую рендерится либо StartScreen MainPanel (Главная), либо AppShell.WorkspaceRouter content, либо overlay (`inProjectChild` для `containerWindow` / `multiTabBlocked` / `readOnlyForced`).

Псевдо-структура (Code сам реализует):
```
<div data-theme>
  <Layout>  ← новый, минималистичный
    <Sidebar />  ← из components/StartScreen/Sidebar.jsx
    <ContentArea>
      {если activeFullscreen === 'start' → <StartScreen.MainPanel />}
      {иначе если есть inProjectChild → inProjectChild (overlay режимы)}
      {иначе → <WorkspaceRouter /> из AppShell}
    </ContentArea>
  </Layout>
  {modals: ProjectInfo, Settings}
  <ToastStack />
</div>
```

### 2. `components/AppShell/index.jsx`

Удалить из AppShell **NavRail** и **Topbar** — они дублируются Sidebar'ом. Оставить только `WorkspaceRouter` (если он остаётся самостоятельным компонентом — экспортировать его, чтобы App.jsx использовал напрямую). Или вообще растащить AppShell — App.jsx сам делает switch по `workspace.active`.

Сам файл `components/AppShell/index.jsx` после правки либо **минимальный wrapper** (только WorkspaceRouter, без shell), либо удаляется и его содержимое переезжает в App.jsx. На усмотрение Code — главное что результат: ноль NavRail и ноль AppShell.Topbar в DOM.

`components/AppShell/NavRail.jsx` — **удалить** (или оставить файл с пометкой `// DEPRECATED, removed from layout` если удаление ломает тесты — Code решит).

`components/AppShell/Topbar.jsx` — **удалить** (или оставить-deprecate). Внутри него были: HotkeyCheatsheet триггер, ThemeToggle, breadcrumb с save status, settings/projectInfo триггеры. Из них:
- HotkeyCheatsheet — он есть в Sidebar StartScreen как `⌨ Хоткеи` (stub). Если Code хочет — может прокинуть открытие модалки на эту кнопку Sidebar'а в этой же задаче. Если сложно — оставит stub'ом, отдельной задачей.
- ThemeToggle — есть в Sidebar StartScreen как `◐ Тема` (stub сейчас). Аналогично — если Code может прокинуть существующий ThemeToggle на эту кнопку — пусть прокинет. Иначе stub.
- Settings / ProjectInfo триггеры — есть в Sidebar как `⚙ Настройки` (stub). Аналогично.
- Save status / breadcrumb — теряется. Это глобальный state «текущий проект сохранён или нет». На текущем этапе мы можем без него обойтись — биолог увидит save status внутри content area workspace'а который этим занимается (например в Library Inspector в будущем). В этой задаче save status не возвращаем.

### 3. `components/StartScreen/StartScreen.jsx` — реструктурировать

Сейчас StartScreen рендерит **Sidebar + MainPanel** вместе (это полноэкранный компонент). После правки:
- `Sidebar.jsx` — переезжает на корень (используется App.jsx как outer shell).
- `MainPanel.jsx` — становится **content только для `activeFullscreen === 'start'`** (рендерит «Главная» с topbar + recent + empty card).

То есть `StartScreen.jsx` — либо превращается в тонкий wrapper над `MainPanel.jsx` (для случая когда выбран Главная), либо полностью убирается, App.jsx рендерит MainPanel напрямую.

### 4. Sidebar — пункты меню переключают workspace

При клике `⌂ Главная` → `setActiveFullscreen('start')` (текущий механизм через canvasSlice).

При клике `▦ Библиотека` → `setActiveWorkspace('library')` + `setActiveFullscreen('library')` (или как сейчас работает — Code сам разберётся, главное что Library content появляется справа).

Остальные пункты sidebar (`⏣ Конструкции`, `⌬ Реакции`, `⊟ Праймеры`) — disabled stubs, не трогаем.

`+ Создать проект`, `↑ Открыть .bodge…`, `⤓ Импорт .gb / .dna…` — действия, не workspace'ы. Существующая логика (то что есть сейчас в Sidebar StartScreen) сохраняется.

`📖 Руководство`, `⌨ Хоткеи` — stubs, не трогаем.

### 5. Active state в Sidebar по workspace

`⌂ Главная` active при `activeFullscreen === 'start'`.
`▦ Библиотека` active при `workspace.active === 'library'` (или эквивалентном условии).
Остальные — никогда active в этой задаче.

---

## Acceptance

1. Открыть `localhost:3000` → видим StartScreen (Главная + recent + empty card). Слева Sidebar 232 px.
2. Кликнуть `▦ Библиотека` → справа открывается Library workspace (Tree + Inspector pane). **Sidebar слева не двигается, не меняет ширину, не перемещает кнопки. Сворачиваемость 232 ↔ 56 продолжает работать.**
3. Active в Sidebar переключился: `⌂ Главная` → не active; `▦ Библиотека` → active (амбер фон + полоска слева).
4. Кликнуть `⌂ Главная` → справа возвращается StartScreen content. Sidebar опять не двигается. Active вернулся на `⌂ Главная`.
5. Так по кругу: туда-сюда без скачков.
6. AppShell.NavRail и AppShell.Topbar — **их больше нет в DOM**.
7. Theme switch — продолжает работать (через footer `◐ Тема` в Sidebar).
8. Ctrl+B sidebar collapse — продолжает работать как раньше.
9. Hotkey escape, hotkey new-project, hotkey open-bodge, hotkey save-bodge — продолжают работать (они в App.jsx через `useHotkey`, не в AppShell).
10. Modals (ProjectInfo, Settings, Toast) — продолжают появляться поверх всего.

---

## Чего Code НЕ делает

- Не трогает Library workspace внутрянку (Tree, Inspector, ActionRow, AddModal — всё работает как сейчас).
- Не трогает StartScreen MainPanel внутрянку (recent + empty card — как есть).
- Не трогает DAG, Importer, Container, Mix workspace'ы.
- Не правит navigation state (`canvas.activeFullscreen` ↔ `workspace.active` дубль остаётся, разрулим отдельно).
- Не трогает `librarySlice`, `db.js`, IndexedDB, никакие данные.
- Не финализирует PROJECT_STATE / RELEASES / DECISIONS / ANCHORS / TECH_DEBT / CLAUDE.md / BUGS.md.
- AddModal Submit (R4) не трогаем.
- Старый `components/Library/index.jsx` (легаси Importer) — не трогаем, остаётся доступен через свой путь.

---

## Handoff фраза (одной строкой)

> Прочитай CLAUDE.md и CURRENT_TASK.md. Сделай Sidebar (`components/StartScreen/Sidebar.jsx`) единственной левой панелью на всех режимах: при переключении StartScreen ↔ Library ↔ DAG ↔ Importer Sidebar остаётся неподвижным, меняется только content area справа. AppShell.NavRail и AppShell.Topbar удалить (или съёжить до `// DEPRECATED` если удаление ломает тесты). Theme/Settings/Hotkeys триггеры из старого Topbar — прокинуть на существующие пункты Sidebar если просто (footer `◐ Тема`, `⚙ Настройки`, секция `⌨ Хоткеи`); если сложно — пусть остаются stubs. Active state в Sidebar по workspace: `⌂ Главная` при activeFullscreen='start', `▦ Библиотека` при workspace.active='library'. Internals Library / StartScreen / DAG / Importer — не трогать. Старый `components/Library/index.jsx` (легаси Importer) — не трогать. После landing коммита — STOP, жду визуальной приёмки. Не финализируй PROJECT_STATE / RELEASES / DECISIONS / ANCHORS / TECH_DEBT / CLAUDE.md / BUGS.md.

---

**Дата:** 09.05.2026.

---

## Что было сделано до этого (reference, не задача)

**StartScreen pixel-perfect** ✅ — работает, sidebar 232/56, тёмная тема, Ctrl+B, кнопка `▦ Библиотека` → Library workspace.

**Library workspace** — работает в новом виде (по последнему скриншоту: Tree с Loose+Lab pool, Inspector с табами Overview/Sequence/Annotations, action-row снизу с Использовать/Открыть/Manual-edit/Переместить/Экспорт/Удалить, footer `192 entries`). Внутрянка хорошая, не трогаем.

**Известные дубли** (для памяти, не активные задачи):
- `canvas.activeFullscreen` vs `workspace.active` — два navigation state machines. Эта задача не решает. Решим отдельно когда дозреем.
- `components/Library/index.jsx` (легаси Importer) vs `LibraryWorkspace.jsx` (новый workspace). Первый деpr, второй основной. Importer пока остаётся живым.
- AddModal.Submit = toast stub (R4 не доделан). Реальный путь импорта — через старый Importer.
- Поле `entry.zone` — концептуально лишнее, игнорируется визуально, но не удалено.
- DAG и Container Window — отдельные workspace'ы пока, концептуальное переосмысление позже.

Эти хвосты НЕ берём в текущее поручение. Возьмём по одному маленькому шагу позже.
