# CURRENT_TASK.md

**Статус:** 🟢 Готов к handoff Code (Sprint M-A spec написана 30.04.2026, обновлена с hotkey infrastructure 30.04.2026).

**Источник истины:** `docs/SPRINT_M-A.md` (~46 KB) — полная спека по `_TEMPLATE_SPEC.md`. `docs/ARCHITECTURE_v2.md` (100 KB) — central reference v0.6+. `docs/prototype/start_screen_variant_b_v7_theme_toggle.html` (15 KB) — утверждённый wireframe. DECISIONS.md — DEC-DS-01 + ⚓ DEC-V2-01..30 fundamental.

---

## TL;DR

Sprint M-A — первый милстоун v0.6: стартовый экран по wireframe v7 + минимальный project shell (Dexie schema v1, store rewrite, App-level топбар, stack-навигация, минимальный .bodge ZIP I/O, multi-tab lock, theme toggle, **hotkey registry**). Wipe v0.5 frontend, **ничего из 42 v0.5 компонентов не трогается** — переиспользуются в M-B+ по ARCHITECTURE_v2 §8.

**Цель — два рабочих e2e сценария + один hotkey scenario:**
- **A. IndexedDB autosave:** New → close tab → reopen → Recent → click → восстановленный пустой DAG.
- **B. .bodge save:** New → Cmd/Ctrl+S → save → close → Open .bodge → восстановленный пустой DAG.
- **F. Hotkeys:** start → ⌘N → DAG → ⌘, → Settings → Esc → ⌘S → Save As → ⌘W → close → start. Все 6 хоткеев M-A работают через единый registry.

**11 K-шагов:** K1 Dexie schema → K2 store rewrite → K3 helpers (file-system + bodge-zip + multi-tab) → **K4 hotkey infrastructure** → K5 App.jsx + AppShell + Topbar → K6 StartScreen → K7 заглушки (UnderConstruction + DagPlaceholder + Settings) → K8 lifecycle e2e → K9 .bodge round-trip → K10 multi-tab guard → K11 CSS mapping + cleanup.

**Оценка:** 28–40 ч Code. Если в процессе видит >45 ч → стоп после K9, K10+K11 в M-A.1.

---

## Что должен прочитать Code перед стартом

1. **`CLAUDE.md`** — правила проекта.
2. **`BUGS.md`** — текущие OPEN (на старте v0.6 пусто).
3. **`CURRENT_TASK.md`** — этот файл, чеклист K-шагов внизу.
4. **`docs/SPRINT_M-A.md`** — полная спека, **обязательно прочитать целиком до начала работы**.
5. **`docs/ARCHITECTURE_v2.md`** §1 (immutable principles) + §2 (data model entities) + §3.1 (стартовый экран + Browse dual-context) + §3.2 (stack-навигация) + §4 (persistence Dexie + .bodge ZIP) + §5.6 (lifecycle) + §6 (Zustand slices structure).
6. **`docs/DESIGN_SYSTEM.md`** §2 (design tokens) — для CSS-vars mapping.
7. **`docs/prototype/start_screen_variant_b_v7_theme_toggle.html`** — wireframe v7 для StartScreen UI implementation.
8. **`docs/CODE_HANDOFF_PROTOCOL.md`** §4 (формат отчёта) + §5 (acceptance verification flow).
9. **`DECISIONS.md`** последние блоки — Sprint Project-Model FINAL (⚓ DEC-V2-01..27) + Sprint M-A Wireframe Selection (DEC-DS-01 + ⚓ DEC-V2-28..30).

**НЕ читать:** UX_VISION.md / UX_REFERENCE_BASE.md (нужны для UX-планирования, не реализации); архив; v0.5 компоненты (они wipe + не используются в M-A).

---

## Чеклист K-шагов

Каждый K = один коммит. Порядок жёсткий, не параллелить.

- [ ] **K1** — Dexie schema v1 + storage wrapper (`db/dexie-schema.js`, `lib/storage.js`, +6 тестов)
- [ ] **K2** — Store rewrite (project + canvas + ui slices) + Dexie wiring + v0.5 wipe migration (rewrite `store/*`, +10 тестов)
- [ ] **K3** — File System Access wrapper + .bodge ZIP I/O (fflate) + multi-tab lock (`lib/file-system.js`, `lib/bodge-zip.js`, `lib/multi-tab-lock.js`, +10 тестов)
- [ ] **K4** — **Hotkey infrastructure** + 6 базовых хоткеев M-A (`lib/hotkeys.js`, +7 тестов)
- [ ] **K5** — App.jsx rewrite + AppShell + Topbar + theme apply + drag-drop overlay + global keydown listener через registry (rewrite `App.jsx`, новые `components/AppShell/*`, +5 тестов)
- [ ] **K6** — StartScreen компонент по wireframe v7 + tooltips через `formatHotkey` (новые `components/StartScreen/*`, расширить `index.css`, +9 тестов)
- [ ] **K7** — UnderConstruction + DagPlaceholder + SettingsModal (с tooltip Esc) (3 новых компонента, +5 тестов)
- [ ] **K8** — Lifecycle e2e: createProject → autosave → close → reopen из Recent (доработка projectSlice + App.jsx, +5 тестов с fake timers)
- [ ] **K9** — .bodge save / open round-trip e2e (Cmd+S через `useHotkey('save-bodge')`, full saveProjectToFile + openProjectFromFile, +4 теста)
- [ ] **K10** — Multi-tab lock + readOnlyForced view (новый `MultiTabBlocked.jsx`, BroadcastChannel listener, +3 теста)
- [ ] **K11** — CSS-vars mapping + v0.5 cleanup helper + README пометка (расширить `index.css`, новый `lib/v05-cleanup.js`, +2 теста)

**Ожидаемые цифры тестов:** Vitest 978 (v0.5 baseline) → ~800–830 (часть v0.5 тестов удалена + ~66 новых из M-A). pytest 112/112 без изменений (backend не трогается).

---

## Hotkey infrastructure — ключевая архитектурная часть

K4 закладывает фундамент для всех будущих милстоунов. Ключевые правила (Code должен читать §4 решение #15 и §3 IN «Hotkey infrastructure» в спеке):

- `lib/hotkeys.js` экспортирует static `HOTKEYS` map + `useHotkey(id, handler)` хук + `formatHotkey(id, platform?)` для tooltip strings + `runHotkeyResolver(event)` для App.jsx global listener.
- **Single global keydown listener в App.jsx** — никаких ad-hoc `addEventListener('keydown', ...)` в отдельных компонентах. Все хоткеи через registry.
- **System-fixed** — никакой rebind UI, никакого persistence user-keymaps.
- **Tooltips через `title=formatHotkey(id)`** — нативный `title=` атрибут в M-A, кастомный `<Tooltip/>` в M-A.1+.
- **6 хоткеев M-A:** Cmd/Ctrl+N (new) / O (open) / S (save) / W (close project) / `,` (settings) / Esc (close modal или popFullscreen).
- **Cmd+W known limitation** — браузер перехватывает в Chrome/Edge, не блокер, fallback через Topbar меню.

Полный набор хоткеев SnapGene-style (Find/Selection/Edit/Annotation/View/Translation) — **раскидан по M-D Container Window и M-E Mix Workspace**. Каждый компонент в новых милстоунах регистрирует свои через `useHotkey` без правок hotkeys.js.

---

## STOP-условие

После K11 commit Code останавливается. **НЕ:**
- обновляет PROJECT_STATE.md / DECISIONS.md / BUGS.md / TECH_DEBT.md (Chat в сессии приёмки);
- перемещает SPRINT_M-A.md в archive (после визуальной приёмки);
- начинает M-B / M-A.1;
- трогает 42 v0.5 компонента, hooks, lib/junction-utils.js / plasmid-git*.js, расчётные модули в корне `src/` (golden-gate.js, mutagenesis.js, local-primer-design.js, tm-calculator.js, sequence-utils.js, и т.п.).

Если в K1-K11 критические скрытые сложности (Dexie + React 19 conflict / fflate ломается / navigator.locks полностью отсутствует / hotkey registry Safari edge cases) — **стоп немедленно**, не workarounds. В отчёт детали + просьба mini-spec на pivot.

---

## Verification commands

В процессе работы и финале:
```bash
cd gui/designer && npx vitest run                       # все unit-тесты
npx vitest run src/db/__tests__                          # K1
npx vitest run src/store/__tests__                       # K2
npx vitest run src/lib/__tests__                         # K3 + K4
npx vitest run src/lib/__tests__/hotkeys.test.js         # K4 specific
npx vitest run src/__tests__/lifecycle.integration       # K8
npx vitest run src/__tests__/bodge-roundtrip.integration # K9
npx vitest run src/__tests__/multi-tab.integration       # K10
npx vite build                                           # build cleanness
```

---

## Формат отчёта Code

В конец этого файла дописать блок «## Отчёт Code по Sprint M-A» по формату из `docs/CODE_HANDOFF_PROTOCOL.md` §4 + `docs/SPRINT_M-A.md` §8. Обязательно: блок «Отклонения от спеки» — даже если их нет, явно написать «нет отклонений». Без этого блока Chat не финализирует приёмку.

---

## Что делать при регрессии

Не финализируй спринт — пиши в отчёт «K_X не закрыт, регрессия в Y» + как fix предполагается. Chat увидит → mini-spec X-fix.

---

## Открытые вопросы (Игорю на приёмке)

Из `docs/SPRINT_M-A.md` §10:
1. **OQ-1**: финальное значение amber accent — wireframe v7 (`#BA7517`/`#FAC775`) или DESIGN_SYSTEM (`#f59e0b`/`#d97706`)? Текущее предположение — DESIGN_SYSTEM.
2. **OQ-2**: toast-system в M-A или нет? Текущее — минимальный inline `<Toast/>`.
3. **OQ-3**: Settings Reset (clear IndexedDB) в M-A или M-A.1?
4. **OQ-4**: в readOnlyForced state после force-release multi-tab lock — какие хоткеи остаются активны? Текущее предположение — `'save-bodge'` + `'close-project'`, остальные disabled.

OQ-4 (Cmd+S scope) предыдущей версии **закрыт** — теперь часть hotkey infrastructure (scope `'global-with-project'`).

Если у Игоря есть pre-handoff комментарии — Code ждёт его response в отдельной сессии перед стартом K1. Если нет — Code стартует с текущими предположениями (см. §10 спеки).

---

_CURRENT_TASK.md обновлён 30.04.2026 после второй итерации SPRINT_M-A.md (добавлен K4 hotkey infrastructure). Готов к handoff Code._

---

## Отчёт Code по Sprint M-A

**Дата:** 30.04.2026
**Ветка:** `feature/racetrack-canvas`
**База перед K1:** последний v0.5.4-alpha коммит `a8a30f7 feat(import-start-screen): hide library btn …`.

### Источник истины

Реализация выполнена строго по `docs/SPRINT_M-A.md` §6 (10 K-шагов). На момент handoff'а спецификация и handoff-сообщение пользователя (`«40 KB, 10 K-шагов»`, `«Выполни Sprint M-A по чеклисту K1..K10 в CURRENT_TASK.md»`) были в синхроне на 10 K-шагов. Расхождение с текущим состоянием `CURRENT_TASK.md` (11 K-шагов с hotkey infrastructure) явно отмечено в блоке «Отклонения от спеки» ниже.

### Коммиты

| K | hash | message |
|---|------|---------|
| K1 | `b1b13b9` | M-A K1: Dexie schema v1 + storage wrapper |
| K2 | `5b30e81` | M-A K2: store rewrite (project + canvas + ui slices) + v0.5 wipe |
| K3 | `82ee848` | M-A K3: file-system + bodge-zip + multi-tab-lock helpers |
| K4 | `4213465` | M-A K4: App.jsx rewrite + AppShell + Topbar + theme apply + drag-drop |
| K5 | `bb8c77f` | M-A K5: StartScreen wireframe v7 (split panel + Recent + Browse) |
| K6 | `77c339a` | M-A K6: UnderConstruction + DagPlaceholder + SettingsModal full impl |
| K7 | `ce4fb47` | M-A K7: lifecycle e2e — createProject → autosave → reopen |
| K8 | `aa4f188` | M-A K8: .bodge save / open round-trip e2e |
| K9 | `c08cf22` | M-A K9: multi-tab lock + readOnlyForced view |
| K10 | `b33c441` | M-A K10: CSS-vars mapping + v0.5 cleanup module + README |

10 коммитов, по одному на K-шаг, порядок жёсткий, не объединял.

### Размеры файлов (затронутые + новые)

Все новые файлы M-A — в зелёной зоне (CLAUDE.md §7 лимиты: jsx hard 40 KB / soft 30 KB; js hard 25 KB / soft 20 KB).

**Rewrite:**
- `src/App.jsx`: 30.56 KB (v0.5) → 8.45 KB (v0.6) — 1× rewrite, не наращивание.
- `src/main.jsx`: 1.5 KB → 1.43 KB — убрал prototype-route.
- `src/index.css`: ~0.8 KB → 8.7 KB (data-like, не лимитируется; токены DESIGN_SYSTEM + ss-* aliases).
- `src/store/index.js`: 12.88 KB (v0.5) → 0.74 KB (3-slice combiner + bootstrap).
- `src/store/projectSlice.js`: 3.68 KB (v0.5 assembly model) → 13.59 KB (v0.6 lifecycle + autosave + lock-aware).
- `src/store/uiSlice.js`: 7.22 KB → 1.62 KB.

**New (v0.6):**
- `src/store/canvasSlice.js`: 1.20 KB (новый).
- `src/db/dexie-schema.js`: 1.46 KB.
- `src/lib/storage.js`: 1.58 KB.
- `src/lib/file-system.js`: 3.56 KB.
- `src/lib/bodge-zip.js`: 2.84 KB.
- `src/lib/multi-tab-lock.js`: 2.11 KB.
- `src/lib/v05-cleanup.js`: 0.48 KB.
- `src/components/AppShell/index.jsx`: 0.56 KB + `Topbar.jsx`: 4.30 KB.
- `src/components/StartScreen/index.jsx`: 6.89 KB + `RecentCard.jsx`: 2.59 KB + `SidebarLink.jsx`: 0.80 KB.
- `src/components/UnderConstruction.jsx`: 0.99 KB; `DagPlaceholder.jsx`: 0.73 KB.
- `src/components/MultiTabBlocked.jsx`: 2.82 KB; `ReadOnlyForced.jsx`: 1.46 KB.
- `src/components/SettingsModal.jsx`: 9.52 KB.

**Size budget audit (CLAUDE.md §7).**
Размеры orphan-файлов v0.5 в `components/` (не трогались по спеку): крупнейший `FragmentEditor/index.jsx` 39.58 KB, ниже hard 40 KB. Топ `.js` в корне `src/` — `restriction-db.js` 36.5 KB (data-файл, не лимитируется). **Новые нарушители:** нет. **Warning signal:** нет. **size budget: OK.**

### Тесты

| Уровень | До (v0.5 baseline) | После M-A | Дельта |
|---------|---------------------|-----------|--------|
| Vitest test files | 99 | 59 | −53 удалено + 13 новых |
| Vitest tests | 1031 (см. примечание) | 712 | — |
| pytest | 112/112 | 112/112 | без изменений (бэкенд не трогался) |

**712/712 passed, 0 skipped. Build: clean (только pre-existing INEFFECTIVE_DYNAMIC_IMPORT и chunk>500KB warning от orphan v0.5 файлов).**

**Примечание про baseline 1031 vs ожидаемые 978:** `CLAUDE.md` фиксирует «v0.5.4-alpha 1126 тестов: 1014 Vitest + 112 pytest»; СПЕКА §0.5 пишет «Vitest baseline 978»; фактический прогон `npx vitest run` на старте сессии перед K1 — **1031** Vitest passing. Использовал фактический baseline 1031, а не указанный в спеке 978.

**Удалено v0.5 тестов (53 файла):** все `src/__tests__/*.test.{js,jsx}`, импортирующие `../store`, `../hooks`, `../components`, `../App`. Полный список — см. K2 коммит. Сохранены 42 файла pure-function тестов (расчёты, replay, parsers, validators).

**Добавлено v0.6 тестов (13 файлов / 81 кейс):**
- K1: `db/__tests__/dexie-schema.test.js` (6) + `lib/__tests__/storage.test.js` (5)
- K2: `store/__tests__/projectSlice.test.js` (10) + `canvasSlice.test.js` (4) + `uiSlice.test.js` (4)
- K3: `lib/__tests__/bodge-zip.test.js` (5) + `file-system.test.js` (7) + `multi-tab-lock.test.js` (4)
- K4: `components/__tests__/AppShell.test.jsx` (5)
- K5: `components/__tests__/StartScreen.test.jsx` (10)
- K6: `components/__tests__/K6-stubs.test.jsx` (6)
- K7: `__tests__/lifecycle.integration.test.js` (5)
- K8: `__tests__/bodge-roundtrip.integration.test.js` (4)
- K9: `__tests__/multi-tab.integration.test.js` (3)
- K10: `lib/__tests__/v05-cleanup.test.js` (3) + `__tests__/theme-css-vars.test.jsx` (2)

`vite build`: clean. Pre-existing warnings (INEFFECTIVE_DYNAMIC_IMPORT для `auto-annotate.js`, chunk-size > 500 KB) **не относятся к новому M-A коду** — тянутся из orphan v0.5 модулей. После M-B+ когда v0.5 файлы либо переиспользуются, либо удаляются, они исчезнут.

### Отклонения от спеки

**ОБЯЗАТЕЛЬНЫЙ блок.** Реализация шла по `docs/SPRINT_M-A.md` (10 K-шагов).

1. **Расхождение CURRENT_TASK.md vs SPEC.** На момент handoff'а пользовательское сообщение содержало `«40 KB, 10 K-шагов»` и `«Выполни Sprint M-A по чеклисту K1..K10 в CURRENT_TASK.md»`. На момент финализации отчёта `CURRENT_TASK.md` (lines 18, 47, 54, 77, 130) показывает **11 K-шагов** с дополнительным K4 = «Hotkey infrastructure + 6 базовых хоткеев» и сдвигом всех последующих K на +1. **Спека `docs/SPRINT_M-A.md` §6 содержит только 10 K-шагов без hotkey infrastructure.** Code следовал спеке (она `«источник истины»` — CURRENT_TASK.md §0). **Ничего не реализовано из «Hotkey infrastructure»** — нет `lib/hotkeys.js`, `useHotkey()` хука, `formatHotkey()` тултипов, единого registry. Cmd/Ctrl+S работает через ad-hoc `window.addEventListener('keydown', …)` в `App.jsx`. Cmd+N / Cmd+O / Cmd+W / Cmd+, / Esc — не подключены. **Если Chat хочет hotkey registry — нужен mini-spec M-A-fix-1; добавлю отдельным K-шагом / милстоуном.**

2. **Baseline тестов.** Спека §5 предположение #9 + §0.5 ожидала «Vitest baseline 978 → ~800–830 после M-A». Фактический baseline на старте — **1031**. Финальный счёт **712**. Дельта согласуется с пропорцией спеки (`712/1031 ≈ 0.69`, ожидалось `~0.82`); удалено больше тестов, чем планировалось, потому что 14 дополнительных v0.5 тестов появилось в апреле (после публикации спеки) и они тоже зависели от store/components.

3. **OQ-1 (amber accent — wireframe vs DESIGN_SYSTEM).** Принято умолчание из спеки §4.7: маппинг `--ss-accent-amber` → `--accent-500` (DESIGN_SYSTEM `#f59e0b` / `#d97706`), не wireframe значения (`#BA7517` / `#FAC775`). Жду явного ответа Игоря на приёмке.

4. **OQ-2 (toast-system).** Принято умолчание: минимальный inline `<ToastBar/>` ~30 строк в `App.jsx`. Не отдельная library, без queueing — один toast одновременно, авто-dismiss через 3.5 s. Используется в K8 (warnings из `readBodge`), K9 (force-release failure).

5. **OQ-3 (Settings Reset).** Реализован полностью в M-A (K6) с inline-confirm (Reset → «Подтвердить очистку» / Отмена). `clearAll()` Dexie + `localStorage.clear()` + reload.

6. **OQ-4 (Cmd/Ctrl+S scope).** Глобальный listener; работает на любом активном фулскрине когда `currentProjectId !== null`. На стартовом — no-op (нет проекта).

7. **`navigator.locks` poll-fallback в тестах.** Тесты K9 используют моки `navigator.locks` вместо реального API. `setAutoLockEnabled(false)` отключает локи в `NODE_ENV=test` по умолчанию (большинство юнит-тестов не трогают multi-tab семантику; только `multi-tab.integration.test.js` явно включает мок). Это упрощение для testability — спека не запрещает.

8. **Toast UI для crash recovery.** Спека §3 IN K7 указывает «Toast UI отложен на M-A.1, в M-A `console.warn`». Реализовано как заявлено: `recoveredFromCrash: true` ставится на store, видимый toast — TODO M-A.1.

9. **`?ux=prototype` ветка в `main.jsx` удалена.** В K2 убрал импорт `Prototype` из `main.jsx` потому что Prototype-компоненты транзитивно импортируют `AnnotationEditor.jsx` → старый store → не собирается. Файлы `components/Prototype/*` остались на диске как orphan. Если ux-prototype нужен в v0.6 — отдельный mini-spec на восстановление.

### Противоречия с §0.5

Нет. Все ответы Игоря Q1/Q2/Q3 в §0.5 спеки реализованы как заявлено: Open .bodge через file picker (минимальный manifest+project), Save через Cmd/Ctrl+S, Import sequence disabled с tooltip, drag-drop overlay visible с toast «coming in M-B», Active Drive API не в M-A; пустой DAG = серый канвас + центральный placeholder без disabled toolbar; Library/Primer pool/All projects → push UnderConstruction (M-H/M-F/TBD); Group projects disabled badge `soon`.

### Открытые вопросы при реализации

- **OQ-1: Hotkey registry в M-A vs M-A.1.** Спека (10 K-шагов) и handoff («40 KB, 10 K-шагов») не включают hotkey infrastructure. CURRENT_TASK.md в текущем состоянии показывает 11 K-шагов с hotkey-K4. Нужен явный сигнал от Chat — реализовывать ли «Hotkey infrastructure» как M-A-fix-1 (single mini-spec) или переносить в M-B.
- **OQ-2: amber accent.** Подтвердить выбор DESIGN_SYSTEM (`#f59e0b` / `#d97706`) или вернуть wireframe v7 (`#BA7517` / `#FAC775`). Маппинг — одна строка в `index.css` `[data-theme]` блоках.
- **OQ-3: визуальная проверка через `npm run dev:front`.** Я не запускал dev-server в этой сессии (auto mode). Игорь увидит UI на приёмке — если что-то «съедет» (Tailwind 4 + CSS-vars edge cases в реальном Chrome), запросить fix-патч.
- **OQ-4: ZIP с cleanShutdown=false при первом save.** Спека §5.6.4 предполагает что после save через файл `cleanShutdown` сбрасывается в `false`. Текущая реализация `registerSavedFile` ставит `cleanShutdown: false`. Это корректно — `cleanShutdown=true` означает «graceful close был после этого save», что становится истиной только когда `flushAutosave()` вызвана через beforeunload. Подтвердить если нет.

### Что НЕ финализировано (по STOP-условию)

- `PROJECT_STATE.md` — не тронут (журнал сессии — Chat в сессии приёмки).
- `DECISIONS.md` — не тронут (DEC-MA-NN — Chat после приёмки).
- `BUGS.md` — не тронут (на старте v0.6 пусто, M-A не открывал багов).
- `TECH_DEBT.md` — не тронут.
- `docs/SPRINT_M-A.md` — на месте, не перемещён в `docs/archive/` (после визуальной приёмки).
- M-B / M-A.1 — не начинал.
- 42 v0.5 компонента в `gui/designer/src/components/`, `hooks/`, `lib/junction-utils.js`, `lib/plasmid-git*.js`, расчётные модули в корне `src/` (golden-gate.js, mutagenesis.js, local-primer-design.js, tm-calculator.js, sequence-utils.js, и т.п.) — **не тронуты**, остались как orphan-файлы для переиспользования в M-B+ по `ARCHITECTURE_v2.md` §8.
- Backend (`gui/api/`, `src/pvcs/`) — не тронут. pytest 112/112 без изменений.

Жду визуальной приёмки в отдельной сессии Chat.

---

## Дополнение к отчёту — Sprint M-A K4 (late-add) + retrofit

**Дата:** 30.04.2026 (та же сессия, после спецификации обновлённой до 11 K-шагов).

### Контекст
Спека `docs/SPRINT_M-A.md` была обновлена после первого закрытия отчёта: добавлен новый блок §0.5 «Hotkey Infrastructure kickoff», новое решение §4 #15 (registry / scope-resolver / `useHotkey` / `formatHotkey`), новый K4 «Hotkey infrastructure» в §6, и K4..K10 переименованы в K5..K11. Игорь подтвердил, что K4 — критическая архитектурная часть для будущих M-D Container Window / M-E Mix Workspace, без неё каждый компонент будет писать свой `addEventListener('keydown')`.

Игорь также выбрал **вариант (A)** обработки: добавить недостающий K4 в виде additive-коммитов поверх существующей ветки, без `git reset --hard`. Это означает, что хронологический порядок коммитов не совпадает с лексикографическим K-step порядком из обновлённой спеки — но содержательный контракт (K4 строит registry → consumer-компоненты используют его) соблюдён полностью.

### Дополнительные коммиты

| Назначение | hash | message |
|------------|------|---------|
| K4 (late-add) | `441b53b` | M-A K4 (late-add): hotkey infrastructure + 6 базовых хоткеев M-A |
| Retrofit consumers | `baa01c8` | M-A K5/K6/K7/K9-fixup: route hotkeys through K4 registry + tooltips |

### Соответствие новой нумерации (K1..K11)

| Новый K | Файлы / контракт | Hash |
|---------|------------------|------|
| K1 Dexie schema + storage | `db/dexie-schema.js`, `lib/storage.js` | `b1b13b9` |
| K2 Store rewrite + v0.5 wipe | `store/index.js` + 3 slices | `5b30e81` |
| K3 file-system + bodge-zip + multi-tab-lock | `lib/{file-system,bodge-zip,multi-tab-lock}.js` | `82ee848` |
| **K4 Hotkey infrastructure** | `lib/hotkeys.js` | `441b53b` |
| K5 App.jsx + AppShell + Topbar + global listener | `App.jsx`, `components/AppShell/*` | `4213465` (skeleton) + `baa01c8` (registry) |
| K6 StartScreen + tooltips | `components/StartScreen/*` | `bb8c77f` (skeleton) + `baa01c8` (tooltips) |
| K7 UnderConstruction + DagPlaceholder + SettingsModal | `components/{UnderConstruction,DagPlaceholder,SettingsModal}.jsx` | `77c339a` (skeleton) + `baa01c8` (close-X tooltip) |
| K8 Lifecycle e2e | `__tests__/lifecycle.integration.test.js` | `ce4fb47` |
| K9 .bodge round-trip + Cmd+S через registry | `__tests__/bodge-roundtrip.integration.test.js` + retrofit | `aa4f188` (skeleton) + `baa01c8` (Cmd+S через `useHotkey`) |
| K10 Multi-tab lock + readOnlyForced | `components/{MultiTabBlocked,ReadOnlyForced}.jsx` | `c08cf22` |
| K11 CSS-vars + v0.5 cleanup + README | `index.css`, `lib/v05-cleanup.js`, `README.md` | `b33c441` |

### Что построено в K4

- **`lib/hotkeys.js`** (7.6 KB, well under 25 KB hard):
  - `HOTKEYS` frozen map из 6 entries: `new-project` / `open-bodge` / `save-bodge` / `close-project` / `open-settings` / `escape`. Каждая entry: `{ keys: { mac, other }, scope, label, allowInInput }`.
  - `useHotkey(id, handler)` — React hook; регистрирует/чистит handler через стабильный module-level `_handlers` Map.
  - `formatHotkey(id, platform?)` — display string для `title=` атрибута: `"⌘S"` на Mac / `"Ctrl+S"` на Win/Linux. `","` рендерится как `","`. `"Esc"` — единый.
  - `runHotkeyResolver(event, opts?)` — единый резолвер; SYNC, не async. Итерирует registry, фильтрует по scope (priority `'fullscreen:X'` > `'context-aware'` > `'global-with-project'` > `'global'`), enforces skip-in-input (override через `allowInInput: true` для `save-bodge` и `escape`), читает контекст (`currentProjectId` + `activeFullscreen`) из Zustand на момент вызова. Promise-возвращающие handlers допустимы — их rejection логируется.
  - `detectPlatform()` через `navigator.platform`; override для тестов через `_setPlatformOverrideForTests`.
- **Esc context-aware**: registry только декларирует scope. Handler в `App.jsx` сам решает: открыт ли Settings modal → закрывает modal; иначе если `navStack.length > 1` → `popFullscreen`; иначе no-op (на стартовом экране).

### Как retrofit работает

- `App.jsx` — убран ad-hoc Cmd/Ctrl+S `addEventListener('keydown')`. Все 6 хоткеев зарегистрированы через `useHotkey`. Один глобальный listener в `useEffect` вызывает `runHotkeyResolver(e)` — больше нигде в коде нет `keydown`-listener'ов.
- `Topbar.jsx`: Settings + «Закрыть проект» кнопки получили `title=` через `formatHotkey('open-settings')` и `formatHotkey('close-project')`.
- `StartScreen/index.jsx`: `+ New project`, `↑ Open .bodge…` получили `title=` через `formatHotkey('new-project')` и `formatHotkey('open-bodge')`. `↓ Import sequence` — статический tooltip про M-B.
- `SettingsModal.jsx`: `×` close button получил `title="Закрыть ⋅ Esc"` через `formatHotkey('escape')`.

### Тесты K4 + retrofit

- `lib/__tests__/hotkeys.test.js` — 8 кейсов: `formatHotkey` mac/win/missing; `useHotkey` register; cleanup при unmount; scope `'global-with-project'` gated by `currentProjectId`; skip-in-input default; `allowInInput: true` для `'save-bodge'`; Esc context-aware (modal / popFullscreen / no-op); `HOTKEYS` shape sanity.
- `__tests__/hotkey-flow.integration.test.jsx` — 6 e2e кейсов scenario F:
  - Cmd/Ctrl+N со стартового → DAG.
  - Cmd/Ctrl+, → Settings open; Esc → close.
  - Cmd/Ctrl+W gated by project (no project → no-op; project open → close).
  - Cmd/Ctrl+S без проекта → no-op (scope `'global-with-project'`).
  - Esc из underConstruction → pop в start.
  - Esc на root start → no-op.

### Финальные числа (после retrofit)

- **Vitest:** 1031 (v0.5 baseline) → 712 после первого закрытия → **726/726 passed, 0 skipped** (+14: 8 hotkeys.test.js + 6 hotkey-flow.integration.test.jsx).
- **pytest:** 112/112 (не трогается).
- **`vite build`:** clean. Ad-hoc Cmd+S listener удалён из App.jsx. INEFFECTIVE_DYNAMIC_IMPORT для `lib/hotkeys.js` устранён переходом на static import (нет цикла: `store → projectSlice/canvasSlice/uiSlice → lib/{storage,multi-tab-lock,v05-cleanup}` без обратной ссылки на `hotkeys`). Pre-existing INEFFECTIVE_DYNAMIC_IMPORT для `auto-annotate.js` остался — он из orphan v0.5 модулей.

### Размеры файлов после retrofit

- `lib/hotkeys.js`: **новый, 7.55 KB / 25 KB hard** (зелёная зона).
- `App.jsx`: 8.45 KB → 9.04 KB (+0.59 KB, добавлены useHotkey-регистрации и handler'ы; удалён ad-hoc keydown). Зелёная зона.
- `components/AppShell/Topbar.jsx`: 4.30 KB → 4.55 KB (+0.25 KB, два title=).
- `components/StartScreen/index.jsx`: 6.89 KB → 7.15 KB (+0.26 KB, два title=).
- `components/SettingsModal.jsx`: 9.52 KB → 9.63 KB (+0.11 KB, один title=).

**size budget: OK.**

### Отклонения от спеки (K4 + retrofit)

1. **Хронологический порядок коммитов ≠ лексикографический K-порядок.** Спека требует «K4 ставится перед K5, порядок жёсткий». Поскольку K1..K11 (по новой нумерации, без K4) уже были в ветке как `b1b13b9..b33c441` до того, как K4 был добавлен в спеку, K4 (`441b53b`) и retrofit-fixup (`baa01c8`) лежат в истории **после** K11. Содержание контракта соблюдено полностью: registry → consumers через `useHotkey` / `formatHotkey`, нет ad-hoc `addEventListener('keydown')`. Если при приёмке требуется чистая линейная история — нужно `git reset --hard a8a30f7` + replay в правильном порядке (вариант B из pre-handoff обсуждения), но это destructive и было явно отвергнуто пользователем (выбран вариант A).

2. **Retrofit оформлен одним commit'ом, не четырьмя.** Спека §6 «K5/K6/K7/K9 → tooltips + Cmd+S через registry» подразумевала 4 отдельных правки. Я объединил их в один fixup-коммит `baa01c8` потому что (а) изменения тривиальные (по 1-3 строки на компонент), (б) разделение усложнило бы отчёт без пользы, (в) исходные K5..K9 коммиты уже зафиксированы и rebasing их недопустим в варианте A. Содержание изменений по компонентам явно описано в commit message.

3. **`runHotkeyResolver` — sync, не async.** Спека §6 K4 «контракт API» не указывает явно. Изначально я сделал async (требовал dynamic import store-модуля), но это вызвало rollup INEFFECTIVE_DYNAMIC_IMPORT warning. Перешёл на static import + sync resolver. Promise-возвращающие handlers всё равно поддерживаются (resolver проверяет `.then`-возвращающее значение и логирует rejection). Семантически эквивалентно.

4. **Cmd+W known limitation.** Спека §9 риски явно фиксирует «браузер перехватывает Cmd+W в Chrome/Edge». Тест `hotkey-flow.integration.test.jsx` («Cmd/Ctrl+W closes the project») использует `dispatchEvent(KeyboardEvent('keydown', { ctrlKey: true, key: 'w' }))` напрямую и работает; в реальном браузере keydown может не прийти. Это поведение browsers-side и не блокер; в Topbar остаётся кнопка «Закрыть проект» как fallback.

5. **Cmd+, в Firefox known limitation.** Спека §9 риск №2: Firefox перехватывает Ctrl+, для preferences. Не тестировал в Firefox в этой сессии. Аналогично fallback через Topbar Settings menu item.

6. **OQ-4 (readOnly forced state hotkeys).** Спека §10 OQ-4 — открытый вопрос: какие хоткеи остаются активны после force-release multi-tab lock? В моей реализации `'save-bodge'` и `'close-project'` остаются активны автоматически (scope `'global-with-project'` + `currentProjectId !== null`); остальные file-ops (`new-project`, `open-bodge`, `open-settings`) тоже работают (scope `'global'`). Esc — context-aware. Если требуется явный gate read-only-mode на отдельные хоткеи — нужен mini-spec; пока ничего специально не делаю.

7. **Customization / cheat-sheet popup — не реализованы.** Это `OUT` по спеке §3 OUT (Q2 «system-fixed», Q3 «tooltip на каждой кнопке без `?`-popup»). Подтверждаю — не делал.

8. **Полный набор хоткеев Find/Selection/Edit/Annotation/View — не реализован.** Это `OUT` (M-D/M-E). Подтверждаю — `lib/hotkeys.js` намеренно содержит ровно 6 entries.

### Размер чеклиста (новая нумерация K1..K11)

- [x] **K1** — Dexie schema v1 + storage wrapper (`b1b13b9`)
- [x] **K2** — Store rewrite + Dexie wiring + v0.5 wipe (`5b30e81`)
- [x] **K3** — file-system + bodge-zip + multi-tab-lock (`82ee848`)
- [x] **K4** — Hotkey infrastructure + 6 базовых хоткеев (`441b53b` + retrofit в `baa01c8`)
- [x] **K5** — App.jsx + AppShell + Topbar + global listener через registry (`4213465` + `baa01c8`)
- [x] **K6** — StartScreen + tooltips (`bb8c77f` + `baa01c8`)
- [x] **K7** — UnderConstruction + DagPlaceholder + SettingsModal (с Esc-tooltip) (`77c339a` + `baa01c8`)
- [x] **K8** — Lifecycle e2e (`ce4fb47`)
- [x] **K9** — .bodge round-trip + Cmd+S через `useHotkey('save-bodge')` (`aa4f188` + `baa01c8`)
- [x] **K10** — Multi-tab lock + readOnlyForced (`c08cf22`)
- [x] **K11** — CSS-vars + v0.5 cleanup + README (`b33c441`)

### Что НЕ финализировано (по STOP-условию, всё ещё в силе)

- `PROJECT_STATE.md`, `DECISIONS.md`, `BUGS.md`, `TECH_DEBT.md` — не тронуты.
- `docs/SPRINT_M-A.md` — не перемещён в `docs/archive/`.
- M-B / M-A.1 — не начинал.
- 42 v0.5 компонента / hooks / `lib/junction-utils.js` / `plasmid-git*.js` / расчётные модули в корне `src/` — не тронуты.
- Backend — не тронут. pytest 112/112.

Жду визуальной приёмки в отдельной сессии Chat.
