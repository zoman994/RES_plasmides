# Sprint M-A.2 — i18n-prep: UI strings → English через lib/strings.js

**Статус:** ✅ РЕАЛИЗОВАНО 01.05.2026 (Code K1–K5 + Chat-direct правки 3 strings + main.jsx ErrorBoundary). Приёмка 1-pass. Архив.

**Тип:** C (UX/refactor пакет, ~7 KB по §13 CHAT_PLAYBOOK).
**Создано:** 01.05.2026, после финализации Sprint M-A.1.
**Цель:** перевести весь активный v0.6 user-facing UI surface на английский через централизованный словарь `lib/strings.js`. Подготовить foundation для всех будущих milestone'ов и для будущей публичной публикации (GitHub OSS, статья).

---

## 0. Срез размеров затрагиваемых модулей

Все файлы в скоупе — в зелёной зоне, декомпозиция не требуется.

| Файл | Размер | Лимит |
|------|--------|-------|
| `components/StartScreen/index.jsx` | 11.27 KB | 30/40 .jsx |
| `components/StartScreen/RecentCard.jsx` | 5.67 KB | 30/40 |
| `components/StartScreen/SidebarLink.jsx` | 796 B | 30/40 |
| `components/AppShell/Topbar.jsx` | 5.03 KB | 30/40 |
| `components/AppShell/index.jsx` | 558 B | 30/40 |
| `components/Toast/Toast.jsx` | 2.78 KB | 30/40 |
| `components/Toast/ToastStack.jsx` | 936 B | 30/40 |
| `components/Toast/toast-icons.jsx` | 1.39 KB | 30/40 |
| `components/Toast/index.jsx` | 152 B | 30/40 |
| `components/ProjectInfoModal.jsx` | 11.94 KB | 30/40 |
| `components/SettingsModal.jsx` | 7.66 KB | 30/40 |
| `components/ModalStack.jsx` | 7.91 KB | 30/40 (только ProjectInfo + Settings блоки) |
| `components/DagPlaceholder.jsx` | 731 B | 30/40 |
| `components/UnderConstruction.jsx` | 990 B | 30/40 |
| `components/ThemeToggle.jsx` | 993 B | 30/40 |
| `App.jsx` | 8.66 KB | 30/40 |
| `lib/hotkeys.js` | 8.10 KB | 20/25 .js |
| `lib/file-system.js` | 3.47 KB | 20/25 |
| `lib/multi-tab-lock.js` | 2.06 KB | 20/25 |
| `lib/pwa-install.js` | 1.25 KB | 20/25 |
| `lib/v05-cleanup.js` | 481 B | 20/25 |
| `store/projectSlice.js` | 13.74 KB | 20/25 |
| `store/uiSlice.js` | (см. при чтении) | 20/25 |
| **NEW** `lib/strings.js` | ~3–5 KB | 20/25 |

Новый файл `lib/strings.js` ожидается небольшой (3–5 KB) — все user-facing strings v0.6 active surface.

---

## 1. Контекст

После Sprint M-A.1 финализации (01.05.2026) v0.6 active UI surface состоит из ~15 компонентов с user-facing текстом — большинство на русском, часть на английском (рандомный mix от добавления Игорем правок руками и Code'ом по спекам).

Игорь решает (01.05.2026): **публичный код (UI strings + code comments в `gui/designer/src/`) → english; внутренние координационные файлы и спецификации в `docs/` → остаются на русском.** Распределение по файлам:

- **English:** UI strings во всех компонентах, code comments + JSDoc в `gui/designer/src/`, console error / warning / throw messages, имена переменных/функций.
- **Русский:** CLAUDE.md / BUGS.md / CURRENT_TASK.md / PROJECT_STATE.md / DECISIONS.md / CHAT_PLAYBOOK.md / TECH_DEBT.md, все файлы в `docs/` (спеки, ARCHITECTURE_v2, DESIGN_SYSTEM, ACCEPTANCE_ALGORITHM, etc.), журнал сессий, diff-comments в коммитах.

Время — критический фактор. Сейчас активный surface — узкий (~15 файлов). После M-B Importer + M-C Container Window + M-D Editable Container это будет в 3–5× больше. Перевод сейчас = 1 спринт; перевод позже = несколько сессий, плюс рефакторинг новых строк добавленных тогда же.

Подход — **(b) централизованный словарь `lib/strings.js` без i18next**. Все user-facing strings вынесены в один файл-namespace, компоненты импортируют через `import { STRINGS } from '../lib/strings'` (или относительный путь), используют `STRINGS.startScreen.newProject` вместо литералов. Когда понадобится локализация (французский / японский для конференции) — миграция на `react-i18next` делается за один pass через `t('startScreen.newProject')`, без рефакторинга компонентов. Стандарт индустрии для bioinfo-tools (SnapGene, Benchling, Geneious, ApE, pLannotate — все english-only без i18n инфраструктуры в первой версии).

---

## 2. Стратегия

Один pass по 15 активным компонентам + 5 lib-модулей + 2 store slices. Code собирает все user-facing strings в `lib/strings.js` с namespace-структурой, заменяет литералы на `STRINGS.xxx.yyy`-обращения, попутно переводит inline `// комментарии` и JSDoc на english. Тесты в `__tests__/` обновляются — те assertions, которые ссылаются на конкретные русские строки, читают их теперь через `STRINGS.xxx.yyy` (не повторяют литерал). Один коммит на K-шаг.

---

## 3. Scope

### IN — обязательно:

1. Создать `gui/designer/src/lib/strings.js` с namespace-структурой (см. §5).
2. Перевести все user-facing strings в активном v0.6 UI surface:
   - `components/StartScreen/**` (index.jsx, RecentCard.jsx, SidebarLink.jsx)
   - `components/AppShell/**` (Topbar.jsx, index.jsx)
   - `components/Toast/**` (Toast.jsx, ToastStack.jsx, toast-icons.jsx, index.jsx)
   - `components/ProjectInfoModal.jsx`
   - `components/SettingsModal.jsx`
   - `components/ModalStack.jsx` — только блоки рендера ProjectInfoModal и SettingsModal; остальные 12 модалов (FragmentEditor, MutagenesisWizard, AddFragmentModal, и т.д.) **не активны** в v0.6 → не трогаем, переведутся когда соответствующий milestone их активирует.
   - `components/DagPlaceholder.jsx`
   - `components/UnderConstruction.jsx`
   - `components/ThemeToggle.jsx`
   - `App.jsx` (footer link «Install as desktop app», ToastBar wiring если осталось, root-level wiring)
3. Перевести user-facing strings в активных lib-модулях:
   - `lib/hotkeys.js` — `formatHotkey()` labels, hotkey IDs description если выводятся в tooltips
   - `lib/file-system.js` — toast messages при .bodge save/load/export ошибках
   - `lib/multi-tab-lock.js` — lock-conflict screen text («Project already opened in another tab», «Take control»)
   - `lib/pwa-install.js` — нет user-facing (logging only), но проверить
   - `lib/v05-cleanup.js` — нет user-facing, но проверить
4. Перевести user-facing toast / error messages в store reducers:
   - `store/projectSlice.js` — toast strings из `markPendingDelete`, `commitPendingDelete`, save/load/export reducers
   - `store/uiSlice.js` — все user-facing
5. Перевести inline `// комментарии` и JSDoc на english в **затронутых файлах** (любой файл в IN scope, который Code открывает для замены strings). Не делать pass по нетронутым файлам.
6. Перевести throw-сообщения, console.error / console.warn в затронутых файлах.
7. Обновить assertions в `__tests__/` — там, где тест ищет конкретный русский текст (`getByText('Сохранить')`, `expect(...).toBe('Удалить')` и т.п.), заменить либо на `STRINGS.xxx.yyy`-обращение через тот же импорт, либо на новый english-литерал. Рекомендуется первый вариант (импорт STRINGS) — это автоматически защищает тесты от drift'а если строка в STRINGS поменяется.

### OUT — явно отложено:

- **12 неактивных модалов в ModalStack** (AddFragmentModal, MutagenesisWizard, FragmentEditor wrapper, AnnotationEditor, и т.д.) — переведутся в milestone'ах M-B / M-D / M-E когда станут активны.
- **v0.5 legacy components** (PartsPalette, DesignCanvas, PlasmidMap, FragmentEditor/, PartBlock, JunctionBlock, ProtocolTracker, PlasmidUseWizard, и т.д. — ~30 файлов / ~500 KB) — будут касаться в соответствующих milestone'ах по reuse-списку ARCHITECTURE_v2 §8. Правило: **при первом касании любого v0.5 legacy файла в M-B+ — перевод его strings + comments входит в скоуп того спринта**.
- **Backend (`src/pvcs/**` Python)** — если Code в процессе обнаружит русские строки / comments при обращении к backend (через api.js wiring), выписать их в отчёт. Перевод — отдельным mini-fix либо в M-B (если M-B будет менять backend интеграцию). В этом спринте backend не трогаем активно.
- **README.md в корне** — пишется по-английски с нуля при публикации, не переводим текущий русский (он внутренний).
- Перевод комментариев в файлах **вне IN scope** — не делаем.

---

## 4. Архитектурные решения

1. **`lib/strings.js` — единый namespace dictionary, default export не используется.** Named export `STRINGS` (uppercase). Plain JS object с nested namespaces по компонентам. Импорт: `import { STRINGS } from '<rel-path>/lib/strings'`. Использование: `<button>{STRINGS.startScreen.newProject}</button>`.

2. **Namespace структура по компонентам, не по фичам.** Ключи групп — camelCase имена компонентов: `startScreen`, `topbar`, `projectInfo`, `settings`, `toast`, `pwa`, `multiTabLock`, `hotkeys`, `common`. Это предсказуемо: если ты в `ProjectInfoModal.jsx` — все его строки в `STRINGS.projectInfo.*`. `common` — для строк используемых в нескольких местах (например `STRINGS.common.cancel = 'Cancel'`, `STRINGS.common.save = 'Save'`).

3. **Helper-функции для интерполяций — обычные JS-функции.** Toast-сообщения с подстановкой имени проекта и т.п. — функция возвращающая готовую строку:
   ```
   STRINGS.toast.projectDeleted = (name) => `Project "${name}" deleted`;
   ```
   Это будущая i18next-совместимая семантика (легко мигрирует на `t('toast.projectDeleted', { name })` без изменения вызовов в компонентах).

4. **Без runtime locale switching.** Никаких `useLocale`, никаких provider'ов, никаких lazy loading. Один static import — один словарь. Будущая локализация добавляется при появлении реальной потребности (отдельный milestone, не сейчас).

5. **Тесты импортируют STRINGS, не дублируют литералы.** Стандарт: `screen.getByText(STRINGS.startScreen.newProject)` вместо `screen.getByText('New project')`. Защищает от drift'а strings dictionary без рефакторинга тестов.

6. **При обнаружении строки которая уже на английском — всё равно вынести в STRINGS.** Не оставлять литералы в JSX даже если они english. Цель — чистый foundation: все user-facing strings из одного источника.

---

## 5. Структура `lib/strings.js`

Code пишет файл по этой структуре. Конкретные тексты — Code решает по контексту использования (он видит JSX и понимает что должно быть «Save» vs «Save changes» vs «Save project»). Перевод не должен быть word-for-word — приоритет естественности English UX.

Namespace структура (Code заполняет конкретными ключами по мере прохода по файлам):

- `STRINGS.startScreen` — все строки StartScreen / RecentCard / SidebarLink (примеры ключей: `newProject`, `openBodge`, `importSequence`, `exportBodge`, `library`, `primerPool`, `allProjects`, `groupProjects`, `groupProjectsBadge`, `installAsDesktopApp`, `recentProjectsHeader`, `noRecentProjects`, `untitledPlaceholder`, `noFileLocation`, `noTags`, `noDescription`, `containersCount(n)`, `savedStatus`, `unsavedStatus`, `timeAgo(...)` если используется, `exportModeHeader(n)`, `downloadSelected(n)`, `selectForExport`).
- `STRINGS.topbar` — Topbar текст (ключи: `backButton`, `projectName`, `editInfoButton`, `saveStatus.saved`, `saveStatus.unsaved`, `saveStatus.saving`, `saveStatus.error`, `settingsButton`, `themeToggle.toLight`, `themeToggle.toDark`).
- `STRINGS.projectInfo` — ProjectInfoModal (ключи: `title`, `nameLabel`, `namePlaceholder`, `descriptionLabel`, `descriptionPlaceholder`, `tagsLabel`, `tagsPlaceholder`, `addTagButton`, `suggestionsLabel`, `removeTagAria(tag)`, `saveButton`, `cancelButton`).
- `STRINGS.settings` — SettingsModal (ключи: `title`, `tabs.identity`, `tabs.advanced`, `identity.nameLabel`, `identity.emailLabel`, `identity.namePlaceholder`, `identity.emailPlaceholder`, `advanced.wipeData`, `advanced.exportSettings`, etc — Code выписывает по факту).
- `STRINGS.toast` — все toast-сообщения (примеры: `projectSaved`, `projectDeleted(name)`, `projectRestored(name)`, `undoButton`, `closeAria`, `bodgeExportSuccess(n)`, `bodgeExportError(msg)`, `bodgeImportSuccess(name)`, `bodgeImportError(msg)`, `multiTabConflict`).
- `STRINGS.pwa` — PWA install messages (`installPrompt`, `installSuccess`, `alreadyInstalled`).
- `STRINGS.multiTabLock` — multi-tab guard screen (`title`, `description`, `takeControlButton`).
- `STRINGS.hotkeys` — formatHotkey display labels (`commandKey`, `ctrlKey`, `optKey`, `altKey`, `shiftKey`, `enterKey`, `escapeKey`).
- `STRINGS.placeholder` — DagPlaceholder, UnderConstruction (`emptyProject`, `comingInMB`, `underConstruction`).
- `STRINGS.common` — переиспользуемые (`save`, `cancel`, `delete`, `confirm`, `close`, `loading`, `unknownError`).

Code НЕ обязан использовать ровно эти ключи. Перечень — стартовая точка; финальный набор Code определяет по факту прохода по файлам. Главное — namespace-структура по компонентам и интерполяционные функции для строк с переменными.

Файл `lib/strings.js` пишется как plain JS object (без TypeScript типов — проект на JS). Header-комментарий в начале файла на английском с описанием паттерна и future-i18next-migration note.

---

## 6. Тесты

Тесты не нужны для самого `lib/strings.js` (это data file). Регрессия покрывается уже существующими тестами — Code проходит по `__tests__/` файлам и обновляет assertions. После замены литералов на `STRINGS.xxx.yyy` все тесты должны пройти.

**Обязательно проверить и обновить assertions в:**
- `__tests__/StartScreen.test.jsx` — все `getByText` / `getByRole` с конкретными русскими строками.
- `__tests__/ProjectInfoModal.test.jsx` — особенно K2-tests (tag suggestions assertions).
- `__tests__/Topbar.test.jsx` (если есть).
- `__tests__/Toast.test.jsx` — K5 tests (8 штук) часто содержат строки в assertions.
- `lib/__tests__/hotkeys.test.js` — formatHotkey tests могут проверять конкретные label.

**Стиль обновления assertion'а:**
```
// Before:
expect(screen.getByText('Сохранить')).toBeInTheDocument();
// After:
import { STRINGS } from '../../lib/strings';
expect(screen.getByText(STRINGS.common.save)).toBeInTheDocument();
```

Если конкретный assertion использует частичное матчинг или regex — Code адаптирует под новую структуру.

---

## 7. Порядок выполнения + оценка времени

Code делает 5 K-шагов в указанном порядке, по одному коммиту на K-шаг.

**K1. Создать `lib/strings.js` skeleton с namespace структурой и header-комментарием.** Без конкретных ключей пока — пустые namespaces. ~30 минут.

**K2. Перевод StartScreen + AppShell + ThemeToggle + DagPlaceholder + UnderConstruction.** Самый видимый user-facing surface. Заполнить `STRINGS.startScreen`, `STRINGS.topbar`, `STRINGS.placeholder`. Обновить `__tests__/StartScreen.test.jsx`. ~1.5 часа.

**K3. Перевод ProjectInfoModal + SettingsModal + ModalStack (только блоки активных модалов).** Заполнить `STRINGS.projectInfo`, `STRINGS.settings`. Обновить `__tests__/ProjectInfoModal.test.jsx`. ~1 час.

**K4. Перевод Toast + lib/multi-tab-lock + pwa-install + v05-cleanup.** Заполнить `STRINGS.toast`, `STRINGS.pwa`, `STRINGS.multiTabLock`. Обновить `__tests__/Toast.test.jsx`. ~45 минут.

**K5. Перевод lib/hotkeys + lib/file-system + store/projectSlice + store/uiSlice + App.jsx + финальный proofread.** Заполнить `STRINGS.hotkeys`, `STRINGS.common`. Обновить `lib/__tests__/hotkeys.test.js` если нужно. Финальный pass по затронутым файлам — comments + JSDoc + throw messages должны быть english. ~1 час.

**Тотал ~4–5 часов Code.**

---

## 8. STOP-условие и формат отчёта

**STOP после K5.** Code останавливается, не продолжает в `__tests__/` нетронутых тестов, не лезет в backend `src/pvcs/`, не правит v0.5 legacy components вне scope.

**Формат отчёта в CURRENT_TASK.md:**

- Коммит-хэши K1..K5.
- Финальные счётчики тестов (Vitest + pytest).
- Build status (`npx vite build` clean).
- Для каждого K-шага: список затронутых файлов + кол-во заменённых строк.
- **Размер `lib/strings.js`** финальный.
- **Отклонения от спеки** — конкретно (не «всё по спеке»). Например: «K3 переименовал `STRINGS.settings.tabs.identity` в `STRINGS.settings.identityTab` потому что в JSX так короче читается».
- **Нашли ли русские строки в backend `src/pvcs/`** — если да, выписать список (не переводить, оставить на следующий sprint).
- **Список assertion'ов которые потребовали обновления** — короткий список путей `__tests__/` файлов + кол-во правок.

Если Code в процессе обнаружит что какой-то файл из IN scope **не содержит** user-facing strings (только internal logic, console.log в dev) — пометить в отчёте как «touched, no strings».

---

## 9. Риски

1. **Мерж-конфликт с активным feature/racetrack-canvas branch.** Сейчас работа идёт в `feature/racetrack-canvas` ветке. Если Code делает M-A.2 параллельно с M-B kickoff в той же ветке — будут конфликты. **Митигация:** делать M-A.2 первым после Sprint M-A.1 коммитов, до старта M-B. Этот спринт **блокирует M-B kickoff** до своей финализации.

2. **Тесты ловят drift'ы в неочевидных местах.** Какой-то integration-тест может assertion'ом ссылаться на строку которую Code не нашёл в JSX напрямую (например error message bubbled через try/catch). **Митигация:** после K5 запустить `npm test` и пройти по failed тестам — если хоть один сломан из-за неперетёрной строки, Code допереводит и коммитит исправление поверх K5 (или в K5 commit amendment).

3. **Перевод смыслово неточен.** Code может перевести «Все проекты» как «All projects» (хорошо) либо как «All my projects» (overinterpretation). **Митигация:** Code делает буквальный перевод когда контекст однозначен; если в строке есть неоднозначность — оставляет минимальный («Save», не «Save the project») и помечает в отчёте «K3 неуверенный перевод [строка]: [контекст], выбрал [вариант]» — Игорь правит на визуальной приёмке либо в M-A.3 mini-fix.

4. **Случайно затронули файл вне scope.** Code увидел рядом русский текст в `PartsPalette.jsx` или подобном v0.5 legacy и поправил. **Митигация:** жёсткое правило: scope IN — только перечисленные в §3 файлы. Любая правка вне списка — отклонение, явно зафиксировать в отчёте. Если такая правка случайно прошла — откатить в финале спринта или принять с указанием.

5. **English UX-фразы звучат неестественно.** Перевод по спеке может дать «Open .bodge file…» вместо более идиоматичного «Open project…». **Митигация:** Code следует существующему дизайн-вокабуляру SnapGene/Benchling/Linear/Notion — если есть established фраза для аналогичного UX-элемента, использовать её. Игорь финально правит на визуальной приёмке.

---

## 10. Открытые вопросы

1. **Backend `src/pvcs/` — переводить если Code обнаружит русские строки?** В текущем M-A.2 scope — нет. Backend api.js не вызывается из v0.6 UI surface (multi-tab lock + Dexie persistence работают локально, backend для расчётов будет включён только в M-B Importer). Если Code увидит русские строки — выписывает в отчёт, оставляет на M-B либо отдельный mini-fix. **Подтвердить:** Игорь, ОК?

2. **Имена коммит-сообщений и PR description — на каком языке?** Сейчас Code пишет коммит-сообщения на русском. Раз правила «всё публичное — english», логично перейти и на english коммиты. **Подтвердить:** Игорь, переключаемся на english коммит-сообщения сейчас, или это отдельная договорённость?

3. **Должен ли `lib/strings.js` содержать JSDoc-typedef для STRINGS?** Без TypeScript JSDoc-typedef даёт IDE-autocomplete для `STRINGS.xxx`. Не критично, но делает работу с словарём приятнее. **Решение:** добавить простой JSDoc-typedef в начале файла; Code сам решит уровень детализации.

4. **Добавить или нет `STRINGS.dev` / `STRINGS.errors` namespace для console.error / throw?** Аргумент за — централизация. Аргумент против — это dev-only, не user-facing, литералы в коде нормальны. **Решение:** не выносить в STRINGS, оставить литералами на english в throw / console.error. STRINGS только для user-facing UI текста. Это уменьшает размер `lib/strings.js`.

---

**Handoff для Code (одной фразой):**

> Прочитай CLAUDE.md, BUGS.md, CURRENT_TASK.md, потом docs/SPRINT_M-A.2.md. Выполни K1–K5 по порядку, по одному коммиту на K-шаг. После K5 остановись — жди визуальной приёмки, не финализируй PROJECT_STATE/DECISIONS/BUGS/TECH_DEBT.
