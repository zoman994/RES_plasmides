# CURRENT_TASK.md — Sprint M-A.2 i18n-prep

**Статус:** 🟡 В процессе (Code: K1–K5).

## TL;DR

Перевод всех user-facing UI strings в активном v0.6 surface на английский через централизованный `lib/strings.js`. Подход (b) — без i18next infrastructure, plain JS namespace dictionary. Подготовка к публикации (GitHub OSS) и foundation для всех будущих milestone'ов M-B..M-I. Тип C, 5 K-шагов, ~4–5 часов.

## Порядок чтения перед началом

1. `CLAUDE.md` (стандарт).
2. `BUGS.md` (OPEN пуст, информационно).
3. `CURRENT_TASK.md` (этот файл).
4. **`docs/SPRINT_M-A.2.md`** — основная спека.
5. По необходимости: первый абзац `PROJECT_STATE.md` (текущая версия / тесты baseline).

## Контекст одной фразой

После Sprint M-A.1 финализации (01.05.2026) кодовая база v0.6 UI содержит mix русского и английского текста. Игорь решил: **публичный код → english, координационные доки → русский**. Этот спринт переводит активный v0.6 UI surface (~15 файлов в `components/` + `lib/` + `store/`).

## K-задачи

### K1 — `lib/strings.js` skeleton

- [ ] Создать `gui/designer/src/lib/strings.js` с header-комментарием на english (описание паттерна + future-i18next-migration note).
- [ ] Namespace структура (пустые объекты пока): `startScreen`, `topbar`, `projectInfo`, `settings`, `toast`, `pwa`, `multiTabLock`, `hotkeys`, `placeholder`, `common`.
- [ ] JSDoc-typedef для `STRINGS` (для IDE autocomplete).
- [ ] Named export: `export const STRINGS = { ... }`.
- [ ] Коммит: `i18n-prep: add lib/strings.js skeleton with namespaces`.

### K2 — StartScreen + AppShell + ThemeToggle + DagPlaceholder + UnderConstruction

- [ ] Заполнить `STRINGS.startScreen` (ключи из §5 спеки + по факту).
- [ ] Заполнить `STRINGS.topbar`.
- [ ] Заполнить `STRINGS.placeholder`.
- [ ] Заменить литералы в `components/StartScreen/index.jsx`, `RecentCard.jsx`, `SidebarLink.jsx`.
- [ ] Заменить литералы в `components/AppShell/Topbar.jsx`, `AppShell/index.jsx`, `ThemeToggle.jsx`.
- [ ] Заменить литералы в `components/DagPlaceholder.jsx`, `UnderConstruction.jsx`.
- [ ] Перевести inline `// комментарии` и JSDoc на english в перечисленных файлах.
- [ ] Перевести throw / console.error messages в перечисленных файлах.
- [ ] Обновить `__tests__/StartScreen.test.jsx` — все assertions на конкретные русские строки → импортировать STRINGS, использовать `STRINGS.xxx.yyy`.
- [ ] Запустить `npm test -- StartScreen` — должны проходить.
- [ ] Коммит: `i18n-prep K2: StartScreen + AppShell + placeholders → english`.

### K3 — ProjectInfoModal + SettingsModal + ModalStack (active blocks only)

- [ ] Заполнить `STRINGS.projectInfo`.
- [ ] Заполнить `STRINGS.settings`.
- [ ] Заменить литералы в `components/ProjectInfoModal.jsx`.
- [ ] Заменить литералы в `components/SettingsModal.jsx`.
- [ ] В `components/ModalStack.jsx` — **только** блоки рендера `{modals.projectInfo && ...}` и `{modals.settings && ...}`. Остальные 12 модалов (FragmentEditor wrapper, MutagenesisWizard, AddFragmentModal, AnnotationEditor, PlasmidUseWizard wrapper, и т.д.) **не трогать** — они не активны в v0.6.
- [ ] Перевести `// комментарии` + JSDoc + throw/console в этих 3 файлах.
- [ ] Обновить `__tests__/ProjectInfoModal.test.jsx` (8 тестов M-A + 3 тест M-A.1 K2 tag suggestions).
- [ ] `__tests__/SettingsModal.test.jsx` (если есть).
- [ ] Запустить `npm test -- ProjectInfoModal SettingsModal`.
- [ ] Коммит: `i18n-prep K3: ProjectInfoModal + SettingsModal → english`.

### K4 — Toast + multi-tab + PWA

- [ ] Заполнить `STRINGS.toast` (включая helper-функции с интерполяцией: `projectDeleted(name)`, `bodgeExportSuccess(n)`, etc).
- [ ] Заполнить `STRINGS.pwa`.
- [ ] Заполнить `STRINGS.multiTabLock`.
- [ ] Заменить литералы в `components/Toast/Toast.jsx`, `ToastStack.jsx`, `toast-icons.jsx`, `index.jsx`.
- [ ] Заменить литералы в `lib/multi-tab-lock.js`.
- [ ] Проверить `lib/pwa-install.js` (likely no user-facing, но pass'нуть).
- [ ] Проверить `lib/v05-cleanup.js` (likely no user-facing).
- [ ] Перевести `// комментарии` + JSDoc + throw/console в этих файлах.
- [ ] Обновить `__tests__/Toast.test.jsx` (8 тестов M-A.1 K5).
- [ ] Запустить `npm test -- Toast`.
- [ ] Коммит: `i18n-prep K4: Toast + multi-tab + PWA → english`.

### K5 — hotkeys + file-system + store + App.jsx + final proofread

- [ ] Заполнить `STRINGS.hotkeys` (formatHotkey labels).
- [ ] Заполнить `STRINGS.common` (переиспользуемые: save, cancel, delete, close, loading).
- [ ] Заменить литералы в `lib/hotkeys.js`.
- [ ] Заменить литералы в `lib/file-system.js` (toast messages).
- [ ] Заменить литералы в `store/projectSlice.js` (toast generators).
- [ ] Заменить литералы в `store/uiSlice.js`.
- [ ] Заменить литералы в `App.jsx` (footer link, root wiring).
- [ ] Перевести `// комментарии` + JSDoc + throw/console в перечисленных файлах.
- [ ] Обновить `lib/__tests__/hotkeys.test.js` если assertions на конкретные labels.
- [ ] Обновить `store/__tests__/projectSlice.test.js` / `uiSlice.test.js` (если есть).
- [ ] Финальный pass: `git diff` посмотреть что в IN scope нет оставшихся русских строк / комментариев. Если есть — починить в этом же коммите.
- [ ] Запустить полный `npm test` + `npx vite build` — оба clean.
- [ ] Коммит: `i18n-prep K5: hotkeys + file-system + store + App + final proofread`.

## Артефакты

- 1 новый файл: `gui/designer/src/lib/strings.js` (~3–5 KB ожидается).
- ~15 модифицированных компонентов в `components/`.
- ~4 модифицированных модуля в `lib/`.
- 2 модифицированных store slice.
- ~5 модифицированных тестовых файлов в `__tests__/`.
- 5 коммитов, ветка `feature/racetrack-canvas` (продолжение от Sprint M-A.1).

## STOP-условие

После K5 коммита Code останавливается. **Не финализирует** PROJECT_STATE / DECISIONS / BUGS / TECH_DEBT — это работа Chat в следующей сессии после визуальной приёмки.

Также не запускает M-B kickoff и не переводит файлы вне IN scope (включая v0.5 legacy и backend `src/pvcs/`).

## Формат отчёта (после K5 в этом файле в конце)

В конец этого файла Code дописывает:

- Коммит-хэши K1..K5.
- Финальные счётчики: Vitest X/X, pytest 112/112.
- Build status: `npx vite build` clean.
- Размер `lib/strings.js` финальный.
- Per-K-step список затронутых файлов + кол-во заменённых строк (примерно).
- Отклонения от спеки — конкретно (не «всё по спеке»).
- Найдены ли русские строки в `src/pvcs/` (backend) — если да, список путей.
- Список тестовых файлов где обновлялись assertions + кол-во правок.
- Любые «неуверенные переводы» с контекстом и выбранным вариантом — для приёмки Игорем.

## Что делать при регрессии

Если после K-шага падают тесты которые до этого проходили — **в том же K-шаге** Code находит причину и фиксит. Если регрессия за пределами строк (что-то сломалось в логике) — Code останавливается, пишет в отчёт «K-шаг N сломал X, не уверен почему, нужен ревью» и **не делает** последующие K-шаги до решения Игоря/Chat.

Если падают только тесты с русскими string-assertions — это ожидаемо до обновления тестов внутри K-шага, не считать регрессией.

## Ссылки

- Полная спека: `docs/SPRINT_M-A.2.md`.
- Контекст принятия подхода (b): обсуждение Игорь ↔ Chat 01.05.2026 после Sprint M-A.1 финализации.
- Архитектурные anchor'ы не затрагиваются — этот спринт не меняет ни data-model, ни component API; только UI strings + comments.

---

_Создан 01.05.2026 при подготовке Sprint M-A.2._

---

## Отчёт Code (K1–K5, 01.05.2026)

### Коммиты

| K | Hash | Сообщение |
|---|------|-----------|
| K1 | `5f536a0` | i18n-prep: add lib/strings.js skeleton with namespaces |
| K2 | `cc98e63` | i18n-prep K2: StartScreen + AppShell + placeholders -> english |
| K3 | `1a876d0` | i18n-prep K3: ProjectInfoModal + SettingsModal -> english |
| K4 | `3ee3427` | i18n-prep K4: Toast + multi-tab + PWA -> english |
| K5 | _(текущий HEAD на ветке `feature/racetrack-canvas` — `git log -1 --format=%h`)_ | i18n-prep K5: hotkeys + file-system + store + App + final proofread |

### Финальные счётчики

- **Vitest:** 764/764 passed (63 файла)
- **pytest:** 112/112 passed
- **Build:** `npx vite build` clean, 25807 KiB precache, 34 entries
- **`lib/strings.js`:** 6.6 KB final (~3–5 KB ожидался → чуть больше из-за интерполяционных функций для всех тостов)

### Per-K-step список

**K1** — `gui/designer/src/lib/strings.js` (новый, 1.6 KB skeleton).

**K2** — 7 файлов:
- `components/StartScreen/index.jsx` — ~25 литералов на STRINGS.startScreen.*
- `components/StartScreen/RecentCard.jsx` — ~10 литералов + formatRelativeTimeAgo переведён
- `components/AppShell/Topbar.jsx` — ~10 литералов на STRINGS.topbar.*
- `components/ThemeToggle.jsx` — 1 литерал (toLight/toDark)
- `components/DagPlaceholder.jsx` — 1 литерал
- `components/UnderConstruction.jsx` — 2 литерала + fallback name
- `components/__tests__/StartScreen.test.jsx` — 4 assertion-блока обновлено (export header × 2 + recent projects + formatRelativeTimeAgo)

**K3** — 3 файла:
- `components/ProjectInfoModal.jsx` — ~15 литералов на STRINGS.projectInfo.*
- `components/SettingsModal.jsx` — ~12 литералов на STRINGS.settings.*
- `lib/strings.js` дополнен namespaces projectInfo/settings
- ModalStack.jsx **не трогали** — projectInfo/settings блоки рендерятся в App.jsx (не в ModalStack), а ModalStack содержит только 12 v0.5 legacy модалов вне scope.

**K4** — 4 файла:
- `components/Toast/Toast.jsx` — 2 литерала (Undo + Close)
- `components/MultiTabBlocked.jsx` — 5 литералов + toast string
- `components/ReadOnlyForced.jsx` — 3 литерала (включён по логике как parallel-screen multi-tab UX)
- `lib/strings.js` дополнен namespaces toast/multiTabLock
- `lib/multi-tab-lock.js`, `lib/pwa-install.js`, `lib/v05-cleanup.js` — touched, no strings (внутренняя логика, без user-facing).

**K5** — 3 файла:
- `lib/hotkeys.js` — 7 label-литералов в HOTKEYS map переведены через STRINGS.hotkeys.actionLabels.*
- `App.jsx` — 4 литерала (3 toast + drop overlay)
- `lib/strings.js` дополнен namespaces hotkeys/app/common
- `lib/file-system.js` — touched, no user-facing strings (только file-picker description "BodgeGene project" уже на english).
- `store/projectSlice.js`, `store/uiSlice.js` — touched, no user-facing strings (только dev-only console.warn / throw — оставлены литералами на english).

### Размеры модулей

После спринта:
- `gui/designer/src/lib/strings.js`: 6.6 KB (новый, в пределах 20/25 KB лимита).
- `App.jsx`: 8.7 KB → 8.7 KB (без существенных изменений).
- `components/StartScreen/index.jsx`: 11.3 KB → 11.6 KB.
- `components/ProjectInfoModal.jsx`: 11.9 KB → 12.0 KB.
- `lib/hotkeys.js`: 8.1 KB → 8.4 KB.

Все файлы остаются в зелёной зоне. Size budget: OK. Новых hard-violators нет.

### Отклонения от спеки

1. **ReadOnlyForced.jsx включён в K4**, хотя не упомянут в IN списке §3 явно. Спека упоминает «lock-conflict screen text» в `lib/multi-tab-lock.js`, но фактически эти строки живут в `MultiTabBlocked.jsx`. ReadOnlyForced.jsx — parallel screen того же multi-tab UX (показывается когда другая вкладка перехватила контроль). Перевод сделан по той же логике; namespace `STRINGS.multiTabLock` покрывает оба экрана. Просьба подтвердить на приёмке.
2. **`STRINGS.app` namespace добавлен** для App.jsx-специфичной строки drop-overlay. В §5 спеки этого namespace нет — добавлен по факту, чтобы не пихать в общий `placeholder` или `toast` (не подходит по семантике).
3. **`STRINGS.hotkeys.actionLabels`** структура чуть отличается от §5 (где предложены ключи `commandKey/ctrlKey/optKey/altKey/shiftKey/enterKey/escapeKey`). Эти модификаторные строки оставлены литералами в `_formatCombo` (стандартные UI-конвенции 'Ctrl', 'Win', 'Alt', 'Shift', 'Esc'), а namespace `STRINGS.hotkeys.actionLabels.*` хранит per-action labels (newProject, openBodge, и т.д.) которые видны в title-tooltips.
4. **store/projectSlice.js + store/uiSlice.js touched, no strings.** В этих модулях нет user-facing генераторов toast — все toast-сообщения создаются на стороне компонентов/App.jsx и передаются через `showToast(msg, kind, options)`. Spec §3.4 предполагал что в store есть toast generators — фактически их там нет.

### Backend (`src/pvcs/`)

**Чисто** — `grep [А-Яа-яЁё]` в `src/pvcs/` не нашёл русских строк. Backend touched не был, отдельный mini-fix не требуется.

### Файл вне scope с русскими строками — `main.jsx` ErrorBoundary

`gui/designer/src/main.jsx` (entry-point) содержит ErrorBoundary fallback с двумя строками:
- `<h2>Ошибка рендеринга</h2>`
- `<button>Очистить данные и перезагрузить</button>`

В §3 IN scope `main.jsx` не указан, поэтому **не тронут**. По логике спеки v0.6 active surface — этот fallback тоже user-facing и заслуживает перевода. Просьба подтвердить включение в M-A.3 mini-fix.

### Тестовые фикстуры с русским текстом — оставлены

В `__tests__/StartScreen.test.jsx` остались русские строки в **fixture data** (project descriptions), не в assertions:
- `description: 'Меняем lac promoter на T7.'` (mock data)
- `description: 'Тест замены ampR на cmR.'` (mock data)
- 1 русское test-name: `'Скачать выбранные → triggers downloadBlob once per selected project'`

Спецификация §3.7 говорит про assertions, не про fixture data и test names. Оставил как есть. Если нужно — переведу в M-A.3 mini-fix.

### Список тестовых файлов с обновлёнными assertions

- `components/__tests__/StartScreen.test.jsx` — **4 правки**:
  1. Импорт STRINGS добавлен.
  2. `'Recent projects'` → `STRINGS.startScreen.recentProjects` (×2).
  3. `'Выбор для экспорта · N выбрано'` → `STRINGS.startScreen.exportHeader(N)` (×4 в двух тестах).
  4. `formatRelativeTimeAgo` 7 assertion'ов: точные `.toBe('только что')` / `.toBe('вчера')` заменены на `STRINGS.startScreen.timeAgo.justNow` / `.yesterday`; `.toContain('мин назад')` заменено на `.toContain('min ago')` (паттерн англ.); аналогично для часов/дней/недель/месяцев.

Остальные тестовые файлы IN-scope (`ProjectInfoModal.test.jsx`, `Toast.test.jsx`, `AppShell.test.jsx`, `lib/__tests__/hotkeys.test.js`) **не потребовали правок** — их assertions используют data-testid селекторы или behavior-проверки, без зависимости от конкретных русских строк.

### Неуверенные переводы (требуют визуальной приёмки Игоря)

1. **`Выйти из выбора`** → `Done selecting` (как label кнопки выхода из export-mode). Альтернативы: `Done`, `Exit selection`, `Cancel selection`. Контекст — кнопка после нажатия которой пользователь выходит из режима выбора файлов для экспорта.
2. **`Выгрузить .bodge файлы`** → `Download .bodge files` (title attribute). Можно `Export .bodge files`. Выбрал `Download` потому что физически это download через анчор.
3. **`Импорт sequence — будет в M-B`** → `Sequence import — coming in M-B`. Можно более кратко `Import — coming in M-B`. Оставил полную фразу.
4. **`Скачать выбранные (N)`** → `Download selected (N)`. OK.
5. **`Перенять контроль`** → `Take control` (multi-tab takeover). Альтернатива: `Take over`, `Claim control`. Выбрал `Take control` как наиболее естественное.
6. **`Подтверждаем…`** → `Confirming…` (busy state). Контекст — пока broadcast force-release ждёт 500ms перед retry. Альтернатива `Taking over…`. Выбрал `Confirming…` (как было).
7. **`Контроль над проектом перешёл к другой вкладке`** → `Control of this project moved to another tab`. Длинно но точно. Альтернатива `Project moved to another tab`.
8. **`Эта вкладка переведена в режим только-чтения. Чтобы продолжить редактирование...`** → `This tab is now read-only. To keep editing, close the project here and continue in the active tab.` Сильно длиннее в русском, но смысл сохранён.
9. **`Перетаскивание файлов появится в M-B (X)`** → `File drop coming in M-B (X)`. Можно `Drag & drop arrives in M-B (X)`. Выбрал короткое.
10. **`Создать проект`** (HOTKEYS label) → `New project` (как в кнопке StartScreen). Можно `Create project`, но `New project` соответствует реальной кнопке в UI.
11. **`Сохранить`** (HOTKEYS label) → `Save`. OK.
12. **`Закрыть проект`** (HOTKEYS label + close button) → `Close project`. OK.
13. **`Настройки`** (HOTKEYS label) → `Settings`. OK.
14. **`Identity = label для commit attribution. Не аккаунт.`** → `Identity = a label for commit attribution. Not an account.` Сохранил тон.
15. **`Reset очистит IndexedDB и localStorage. Все локальные проекты будут удалены.`** → `Reset will clear IndexedDB and localStorage. All local projects will be deleted.` OK.

### STOP

Не финализирую PROJECT_STATE / DECISIONS / BUGS / TECH_DEBT — это работа Chat в следующей сессии после визуальной приёмки.
