> **[ARCHIVED 2026-05-16 — D1 disposition]** Устарел. Идеи прототипа
> (DEC-CANVAS-V01-*) реализованы через F1 (Window System) + V58-V76 rework.
> Не использовать как источник; см. F1/F3 + Assembly stack A1-A4.

# SPRINT_M-CANVAS-PROTOTYPE-PCR.md — прототип контейнер-редактора (1×PCR flow)

> **Тип:** B (mockup-прототип). Размер спеки целевой ≤15 KB.
> **Версия:** v1, 11.05.2026.
> **Срок promotion DEC:** не сейчас. Прототип — для визуальной проверки модели «pill + tabs + operation flow». DEC-CANVAS-V01-* из M-Canvas v0.1 макетной сессии 11.05.2026 — кандидаты на ⚓ **после** acceptance этого прототипа, не до.
> **Что не в спеке:** real store write, canvas integration, multi-draft pills, Mix picker, остальные operations кроме PCR, draft persistence через `← Назад`, primer pool. Всё это — следующие итерации.

---

## 1. Контекст

В M-Canvas v0.1 макетной сессии 11.05.2026 (Игорь ↔ Chat) зафиксирована модель контейнер-редактора:
- Multi-tab workspace, не «одна молекула в окне».
- Pill-переключатель сверху между draft-сессиями (multiple operations в фоне).
- Tabs persistent до commit'а; `← Назад` на canvas не убивает session.
- Двойной клик по контейнеру — единственный primary жест инициации.

Все 6 решений (DEC-CANVAS-V01-INIT-DBLCLICK-01, -EDITOR-PERSISTENT-TABS-01, -DRAFT-PILLS-01, -MIXWITH-PICKER-01, -COMMIT-KEEP-TABS-01, -EMPTY-CONTAINER-01) **черновики, не запись в DECISIONS.md**. Игорь явно сказал: «мне сложно всё представить, нужны визуальные якоря и пилить исходя из работающего прототипа».

Этот прототип — первый визуальный якорь. Узкий срез: один draft session (PCR), без интеграции в canvas, без реального store, без commit на молекулу. Цель — потрогать pill + tabs + operation toolbar + popup → product tab руками на реальной плазмиде и понять что работает, что нет.

После acceptance прототипа — DEC-CANVAS-V01-* записываются в DECISIONS.md (с возможными правками формулировок по итогам визуального опыта), идём к §7 №4 Layout algorithm.

---

## 2. Где задача сядет (§17 R4)

**Existing компоненты которые прототип использует:**

- `components/SequenceView/` (~330 KB) — universal viewer. Прототип оборачивает его как child, **без правок в SequenceView**. Все existing tracks/overlays/popups сохранены: ruler, DNA fwd/rev, annotation, AA fwd/rev, selection state, caret, hotkeys, copy в 3 режимах. Прототип передаёт стандартный `fragments` shape (DEC-SQV-07: NO container imports, plain shape).
- `local-primer-design.js` (~20 KB) — algorithm core, используется как black box. Public API уже стабильный (`designPrimersLocal(sequence, region, options)` или аналогичная сигнатура — Code сам найдёт точное имя). Не трогаем.
- `tm-calculator.js` (~7 KB) — используется внутри primer-design, не зовём напрямую.
- `lib/strings.js` — namespace для UI-строк прототипа добавляем (см. §6).
- `Toast/` — для mock-commit feedback.

**Кто ссылается на затрагиваемое:**
- На `SequenceView/` — 4 context'а: Importer (`LibrarySingleInspector` SequenceTab), Library Inspector (тот же), Annotator PreviewTab, ImportStartScreen (legacy). Все 4 не задеваются — прототип НЕ модифицирует `SequenceView/` ни в одном файле.
- На `local-primer-design.js` — `useGeneratePrimers` hook, `MutagenesisWizard`, `JunctionBlock`. Не задеваются.

**Что может сломаться:**
- Если прототип ошибочно правит `SequenceView/` — ломаются все 4 context'а. Гарантия: не правим. Code-side guard: если возникает соблазн «маленькая правка в SequenceView» — стоп, пишем wrapper в прототипе.
- `App.jsx` правится минимально (один новый case в роутинге). Размер App.jsx — точечная правка ≤10 строк, не декомпозиция.
- `uiSlice` (или `canvas` slice) — может потребоваться один новый прототипный flag (`prototypes.containerEditor: bool`). Implementation detail — Code выбирает где живёт (uiSlice / canvas / hash-route без store).

**Карта дублей (§17 R1 чек):** прототип создаёт **новую** папку `components/ContainerEditorPrototype/`. Не конфликтует с:
- `Dag/ContainerWindowPlaceholder.jsx` (M-C.1 K4 заглушка) — на kill, не трогаем.
- `LibrarySingleInspector.jsx` — другой workflow, не пересекается.
- `MoleculeWorkspace/` — orphan, на Этап 3 kill.

Прототип living-experiment в изоляции, после accept-FAIL может быть снесён одним коммитом без последствий для остального кода.

---

## 3. Стратегия

Изолированный route `/canvas-prototype` (или эквивалентный механизм — query param / store flag, на выбор Code), pre-seeded плазмидой pUC19 inline-fixture'ом. Один draft session, одна active tab (template = pUC19), кнопка «ПЦР» в operations toolbar активна. Selection → ПЦР popup → real primers через `local-primer-design.js` → confirm → product tab появляется → переключение на product → mock-commit toast → state reset.

**Принципы:**
- В прототипе ничего не пишется в реальный store / IndexedDB / Dexie. Все state — local React (useState/useReducer внутри прототипа).
- Realistic visuals (real SequenceView, real primers), mock semantics (commit ничего не создаёт глобально).
- Удаление прототипа = снос папки `components/ContainerEditorPrototype/` + откат строк в App.jsx + откат строки в `lib/strings.js`. Один коммит revert.
- Точка входа dev-mode (не виден в production sidebar). Конкретный механизм — Code на выбор (рекомендуемые варианты в §6).

---

## 4. Scope IN / OUT

**IN:**
- Новая папка `components/ContainerEditorPrototype/` с 6-8 компонентами.
- Inline fixture pUC19 (sequence + features) — `fixture-puc19.js`.
- Route в App.jsx через минимальную правку.
- Pill-bar сверху с одной активной session «PCR draft» (placeholder для multi-draft в будущем).
- Tabs-bar с одной active tab (template) → две tab после PCR confirm (template + product).
- Operations toolbar: «ПЦР» enabled + «Restriction» / «Мутагенез» disabled stubs (для proportions).
- PCR popup при клике на «ПЦР»: реквайер selection в SequenceView; показывает рассчитанные fwd/rev primers (sequence, Tm, length); confirm создаёт product tab; cancel закрывает popup.
- Product tab: linear amplicon = selection sequence; SequenceView рендерит его без modifications.
- Mock-commit button в product tab → toast «Mock commit OK», state сбрасывается до initial (template tab активна, product исчезает).
- Кнопка «← Назад» (top-left header прототипа) — возврат на route с которого пришли (или fallback Library / StartScreen).
- STRINGS namespace `prototypeCanvas` в `lib/strings.js` для всех UI-строк прототипа.
- Tests (5-7 штук).

**OUT (явно):**
- Multi-draft pills (только один pill, не активный switcher).
- Mix picker (не нужен для 1→1 PCR).
- Canvas integration (нет двойного клика с canvas в прототипе; вход через route directly).
- Real store write — product НЕ создаётся как реальный MoleculeContainer.
- Draft persistence через `← Назад` — state сбрасывается на возврате.
- Restriction / Mutagenesis / Replace operations — disabled stubs только.
- Primer pool persistence (праймеры от PCR не сохраняются после commit'а).
- Internal site validation в PCR (биологическая корректность primers — algorithm core её сам считает, но we не блокируем confirm на её основе).
- SelectionContextMenu расширение «PCR этого региона» — **изменено в скопе**, не делаем. Объяснение в §5 DEC-PROTO-04.

---

## 5. Архитектурные решения (sprint-level, не ⚓)

**DEC-PROTO-01 — Изолированный route, не модификация existing surface.** Прототип не подменяет `Dag/ContainerWindowPlaceholder`, не правит `LibrarySingleInspector`, не вклинивается в существующий двойной клик flow. Цель — изоляция risk'а. Снос прототипа после accept-FAIL = revert одного коммита.

**DEC-PROTO-02 — In-memory state, нет write в real store.** Все state в local React (useState/useReducer внутри ContainerEditorPrototype). `librarySlice` / `projectSlice` / `uiSlice` (кроме одного flag на open/close прототипа) не задеваются. Product НЕ становится реальной молекулой; mock-commit — только toast.

**DEC-PROTO-03 — Real primer design, mock commit.** Primers через `local-primer-design.js` (algorithm core). Биолог видит **реальные** fwd/rev primers с правильной Tm на selection. Это критично — mock primers («P1_mock») искажают визуальный опыт. Но commit и persistence — mock.

**DEC-PROTO-04 — SelectionContextMenu НЕ расширяется в прототипе.** Изначально (макетная сессия) предполагалось добавить «PCR этого региона» в right-click menu SequenceView. Изменение скопа: PCR-кнопка живёт **только в operations toolbar прототипа**, не в SequenceView. Причина: правка `SequenceView/popups/SelectionContextMenu.jsx` задевает 4 context'а (Importer / Library / Annotator / future Container Window). Это переплёт scope из B в A. Для прототипа достаточно toolbar-кнопки; context-menu integration — в реальной реализации M-Canvas v0.4, когда контейнер-редактор интегрируется в canvas. Selection state в SequenceView читается прототипом через имеющийся API (existing `useSelectionState` exposes selection через ref/callback), не через mod context menu.

**DEC-PROTO-05 — Inline fixture pUC19, не lazy-load из catalog.** Прототип захардкоживает pUC19 sequence + 8-10 базовых features (lacZα, AmpR, AmpR promoter, ori, MCS, lac promoter, M13 fwd/rev priming sites) в `fixture-puc19.js`. Не зависит от `public/plasmids-data/basic_cloning_vectors.json` lazy-load. Изоляция: прототип работает даже без backend / без сети / в тестах без mocks. Если нужно тестировать на других плазмидах позже — расширяемо до dropdown «выбрать demo plasmid», в текущей итерации не нужно.

**DEC-PROTO-06 — Pill как indicator, не switcher в первой итерации.** Сверху прототипа рендерится одна pill «📋 PCR draft» — статичная, не кликабельная. Это шаблон под будущий multi-draft switcher, но в текущей итерации второй draft session создать нельзя. Цель — увидеть как pill смотрится визуально, не проверять переключение.

---

## 6. Файлы / структура

**Новые файлы в `gui/designer/src/`:**

```
components/ContainerEditorPrototype/
├── index.jsx                       — оркестратор (~6 KB), local state, layout
├── PillsBar.jsx                    — top pill indicator (~1 KB)
├── TabsBar.jsx                     — переключатель template ⇄ product (~2 KB)
├── OperationsToolbar.jsx           — кнопки PCR/RE/Mut (3 кнопки, ~2 KB)
├── PCRPopup.jsx                    — popup с primers preview + confirm (~4 KB)
├── ProductView.jsx                 — обёртка SequenceView для product tab + mock-commit button (~2 KB)
├── fixture-puc19.js                — pUC19 sequence + features inline (~3 KB)
└── usePrototypeState.js            — local state hook (template / product / activeTab / showPopup / selection) (~2 KB)
```

Итого ~22 KB на 8 файлов. Каждый файл — well under soft limit (.jsx soft 30 / .js soft 20).

**Правка App.jsx:**

Минимум: один новый case в WorkspaceRouter switch + один флаг открытия. Точное местоположение определяет Code (либо `canvas.activeFullscreen === 'canvas-prototype'` case, либо отдельный `uiSlice.prototypes.containerEditor` boolean — на выбор). Размер правки ≤10 строк. Точка входа dev-mode — Code предлагает:
- (a) Hidden hotkey, например `Ctrl+Shift+Alt+P`.
- (b) Query param `?prototype=container-editor` который ставит flag на mount.
- (c) Кнопка в StartScreen sidebar **только при** `import.meta.env.DEV` (production build её не покажет).

Любой из трёх ОК. Рекомендация — (c), потому что Игорь сам захочет открывать прототип повторно на dev-машине.

**Правка `lib/strings.js`:**

Добавление namespace `STRINGS.prototypeCanvas`:
- `pcrButton` — «ПЦР» (operations toolbar)
- `restrictionButtonDisabled` — «Restriction» (disabled stub)
- `mutagenesisButtonDisabled` — «Мутагенез» (disabled stub)
- `pcrPopupTitle` — «ПЦР региона»
- `pcrPopupNoSelection` — «Выделите регион в последовательности»
- `pcrPopupForward` / `pcrPopupReverse` — labels для fwd/rev
- `pcrPopupTm` — «Tm»
- `pcrPopupLength` — «Длина»
- `pcrPopupConfirm` — «Создать ампликон»
- `pcrPopupCancel` — «Отмена»
- `tabTemplate` — «Template: pUC19»
- `tabProduct` — «Amplicon»
- `pillDraft` — «📋 PCR draft»
- `mockCommitToast` — «Mock commit OK · продукт не сохранён»
- `backToCanvas` — «← Назад»

EN-комментарии в strings.js по правилу проекта (DEC-MA2-01 bilingual).

**Тесты:**

`gui/designer/src/components/ContainerEditorPrototype/__tests__/`:

1. `prototype-mount.test.jsx` — renders без ошибок, template tab активна по умолчанию, pill виден, operations toolbar показывает 3 кнопки (PCR enabled, RE/Mut disabled).
2. `prototype-pcr-no-selection.test.jsx` — клик «ПЦР» без selection → popup показывает empty state «Выделите регион» или disabled state.
3. `prototype-pcr-with-selection.test.jsx` — set selection в SequenceView programmatically, клик «ПЦР» → popup открывается, отображает fwd/rev primers с Tm и length values (значения не проверяем на конкретные числа, проверяем что они present и truthy).
4. `prototype-product-tab.test.jsx` — после confirm в popup → product tab появляется как вторая, активная переключается на product.
5. `prototype-mock-commit.test.jsx` — кнопка mock-commit на product tab → toast called, state сбрасывается (product tab исчезает, template снова active).
6. `prototype-back-button.test.jsx` — клик «← Назад» вызывает navigation handler (mock-able), state сбрасывается.

Code добавляет ~2-3 вариации по паттерну для edge cases (например — selection edge case на wrap-tail; primer design returns null fallback). Итого 8-9 тестов.

---

## 7. Порядок выполнения (K-блоки)

**K1 — Fixture + Skeleton.** Создать `fixture-puc19.js` с pUC19 sequence (2686 bp) и базовыми features. Создать `index.jsx` с layout-skeleton (Header / PillsBar / TabsBar / OperationsToolbar / Content area). Без логики — просто видно что-то на экране. Доступ через DEV-mode entry (Code выбирает механизм). Тест K1: prototype-mount.

**K2 — SequenceView wrapping + state hook.** Подключить SequenceView к Content area, передать `fragments` shape из fixture. Создать `usePrototypeState.js` — minimal state (activeTab, showPopup, currentSelection). Selection из SequenceView пробрасывается в hook через existing API. Тест K2: prototype-pcr-no-selection (clicking PCR без selection корректно обрабатывается).

**K3 — PCR popup + primer design.** PCRPopup компонент. Кнопка «ПЦР» в OperationsToolbar открывает popup. Если selection пуст — empty state. Если selection есть — вызов `local-primer-design.js` (Code находит точную сигнатуру в файле), показ primers. Cancel закрывает popup. Тест K3: prototype-pcr-with-selection.

**K4 — Product tab + переключение.** Confirm в popup создаёт product entry в state, переключает activeTab на product. TabsBar рендерит две tab. ProductView обёртка над SequenceView показывает product как linear amplicon (sequence = selection.fragment.sequence.substring(start, end), features внутри selection clipped). Тест K4: prototype-product-tab.

**K5 — Mock-commit + back button.** Кнопка «Mock commit» в ProductView показывает toast, сбрасывает state до initial (activeTab = template, product cleared). Кнопка «← Назад» в header вызывает navigation handler. Тесты K5: prototype-mock-commit + prototype-back-button.

**Order rationale:** К1 → К2 даёт визуальный feedback рано (видна обёртка SequenceView). К3 закрывает риск primer-design integration рано (если API local-primer-design.js не совместим с прямым вызовом — выясняется на K3, не на K5). К4-К5 короткие, безрисковые.

---

## 8. STOP-условие и формат отчёта

**STOP после K5.**

Code в финальном отчёте:
- Подтверждение каждого K-блока: «K1 done», «K2 done», ...
- Тесты passed: `npm test -- ContainerEditorPrototype` zelёный полностью, плюс баланс всего suite (1764+ baseline → 1772+ с новыми тестами).
- Build clean: `npx vite build` без warnings связанных с прототипом.
- Размеры файлов прототипа (через `find components/ContainerEditorPrototype -printf '%s %p\n'`).
- Скриншот / описание поведения: что биолог видит при открытии прототипа, что при клике «ПЦР» без selection, с selection, после confirm, после mock-commit.
- Точка входа dev-mode: конкретно как Игорь открывает прототип в браузере (URL / hotkey / кнопка).
- Известные ограничения / edge cases / тривиальности отложенные.

**Не финализировать (НЕ писать в):**
- `CURRENT_TASK.md` (Chat-side файл).
- `RELEASES.md`, `PROJECT_STATE.md`, `DECISIONS.md`, `ANCHORS.md`, `BUGS.md`, `COMPONENT_MAP.md`, `TECH_DEBT.md`.
- `gui/designer/package.json` + `lib/version.js` (нет bump'а — прототип не в production track).

Это explicit STOP-список по итогам Code handoff violations 11.05.2026 (см. `CURRENT_TASK.md` блок «Code нарушил handoff-протокол»).

После STOP — Игорь визуально оценивает прототип в отдельной сессии. Chat в той же / следующей сессии финализирует sprint-side updates (RELEASES блок, PROJECT_STATE snapshot, DEC-PROTO-* в DECISIONS, DEC-CANVAS-V01-* — переоценка по итогам визуального опыта) **после** PASS.

---

## 9. Риски

**R1 — `local-primer-design.js` API оказывается несовместимым с прямым вызовом из прототипа.** Сейчас он зовётся из `useGeneratePrimers` hook + `MutagenesisWizard`, контракт может быть зашит на specific fragments shape. Митигация: K3 рано раскрывает риск. Fallback — обёрнуть в простую функцию-адаптер внутри прототипа, не править core. Если API требует store-context — прототип передаёт минимальные mocks.

**R2 — SequenceView не позволяет внешнему компоненту читать current selection без правок.** Митигация: existing `useSelectionState` уже expose'ит selection через onSelectionChange callback (по COMPONENT_MAP §SequenceView hooks). Прототип подписывается через callback, не правит SequenceView. Если callback нет — Code предлагает добавить prop `onSelectionChange` в SequenceView (это OK правка, она симметрична существующим `onCaretChange` / `onLocate`).

**R3 — `← Назад` navigation корректно работает только если механизм входа известен.** Если входим через store flag — back закрывает flag. Если query param — back правит URL. Если hotkey — back возвращает на previous fullscreen. Митигация: Code выбирает один механизм и реализует back симметрично.

**R4 — Биолог увидит pill+tabs впервые и интерпретирует не так как мы.** Это собственно цель прототипа. Не митигация — оценка. По итогам Игорь даёт PASS/FAIL/CHANGE. В случае CHANGE — переписываем DEC-CANVAS-V01-* (черновики) и итерация. В случае FAIL — снос прототипа, возврат к текстовым макетам.

**R5 — Прототип «прирастает» — Code добавляет фичи сверх scope.** Митигация: §4 OUT явный список. К2-K5 короткие, чёткие. Если Code хочет «маленькое улучшение» — стоп, в чат, спросить Chat'а до коммита.

---

## 10. Открытые вопросы (для Code)

**O1 — Где живёт open/close flag прототипа.** uiSlice / canvas slice / query param / hash route. На выбор Code, но: revert должен быть простым (один файл правки).

**O2 — Как тестировать primer design call в прототипе.** `local-primer-design.js` использует sync-ные расчёты (нет async / нет workers, по CLAUDE.md). Если так — тест на K3 простой (assertions на returned values). Если есть async — Code добавляет await pattern в тестах.

**O3 — Layout прототипа на узком экране.** 1280 px минимум поддерживаем (текущий dev). Mobile / planshet — нет (DEC-V2-19). Если pill+tabs+toolbar не помещаются в width — обрезаем через overflow:hidden, не переписываем layout под responsive.

**O4 — Иконки для operations toolbar.** Использовать существующие из проекта (если есть scissor / DNA / molecule icons в `components/`) или Unicode-эмодзи (🧬 ПЦР, 🔪 Restriction, 🧪 Мутагенез) — Code на выбор. Не блокер.

---

## 11. Что делать при регрессии

- Vitest 1764+ baseline должен оставаться зелёным. Если упало — Code НЕ продолжает, выясняет в чат.
- `npx vite build` clean — если warning от прототипа, fix перед STOP.
- Если K3 разваливается на R1 (primer-design API) — STOP, в чат, не геройствовать.
- Если SequenceView selection read API оказывается недоступным — STOP, в чат, не правим SequenceView без обсуждения.

---

**Источник:** M-Canvas v0.1 макетная сессия 11.05.2026 (Игорь ↔ Chat) — DEC-CANVAS-V01-INIT-DBLCLICK-01..06 черновики. `docs/ARCHITECTURE_CANVAS_MODEL.md` §4.2 контейнер-редактор как layer над SequenceView + §7 вопросы №1 (закрыт черновиком) / №4 / №10 (следующие).
**После acceptance прототипа:** DEC-CANVAS-V01-* финализируются в DECISIONS.md, переход к M-Canvas v0.1 макетной сессии 2 (вопрос №4 Layout algorithm) на основе работающего прототипа.
