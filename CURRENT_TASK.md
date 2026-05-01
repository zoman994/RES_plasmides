# CURRENT_TASK.md — Sprint M-A.1 Polish

**Дата старта:** 01.05.2026
**Статус:** 🟢 В процессе
**Спека:** `docs/SPRINT_M-A.1.md` (32.3 KB, обновлена 01.05.2026 под Notion-style toast).
**Тип:** A/B на границе (5 K-шагов; K5 расширен до Notion-style + soft-delete pattern).
**Ветка:** `feature/racetrack-canvas` (продолжение M-A).

---

## TL;DR

Закрыть 6 TD entries, накопленных при финализации Sprint M-A:

- **K1** — modal guard в `lib/hotkeys.js` (⌘N inside ProjectInfoModal/SettingsModal).
- **K2** — 3 теста tag suggestions в `ProjectInfoModal.test.jsx`.
- **K3** — 5 тестов runtime UI (auto-open / export / soft-delete) в `StartScreen.test.jsx`. Test #4 переписан под soft-delete flow (window.confirm уходит).
- **K4** — `vite-plugin-pwa` setup + manifest + 3 иконки + beforeinstallprompt handler.
- **K5** — **Notion-style** Toast queue: bottom-left placement + dark fill + icon + manual close × + undo button. Заменяет inline `<ToastBar/>` в App.jsx + меняет `handleDelete` в StartScreen на soft-delete pattern. +8 тестов.

После K5 + K6 (final check) — STOP, ждать визуальной приёмки.

---

## Порядок чтения перед началом

1. **CLAUDE.md** — правила проекта, размеры модулей.
2. **BUGS.md** — OPEN пустой на старте v0.6, проверить что не появилось.
3. **`docs/SPRINT_M-A.1.md`** — полная спека (читать целиком, особенно §5 K5 — Notion-style детализирован).
4. **TECH_DEBT.md** — TD entries 6 шт.
5. PROJECT_STATE.md последняя сессия (Sprint M-A финализация 30.04 третья сессия).

Не читать `docs/ARCHITECTURE_v2.md` — Sprint M-A.1 не трогает архитектурный layer v0.6.

---

## Чеклист

### K1 — TD-HOTKEY-MODAL-GUARD

Файлы: `gui/designer/src/lib/hotkeys.js`, `gui/designer/src/lib/__tests__/hotkeys.test.js`.

- [ ] Modal guard в `runHotkeyResolver` (~10 строк, см. спека §5 K1).
- [ ] Test: `'⌘N inside open ProjectInfoModal does not run new-project handler'`.
- [ ] Test: `'Escape inside open ProjectInfoModal still runs escape handler'`.
- [ ] `npx vitest run` PASS (ожидаем 741/741).

**Артефакт:** 1 коммит, `lib/hotkeys.js` ~7.62 → ~8.0 KB, `hotkeys.test.js` ~6.31 → ~7.0 KB.

### K2 — TD-PROJECTINFO-SUGGESTIONS-NOTESTS

Файл: `gui/designer/src/components/__tests__/ProjectInfoModal.test.jsx`.

- [ ] Test: `'excludes already-added tags from suggestions'`.
- [ ] Test: `'sorts suggestions by frequency then alphabetically'`.
- [ ] Test: `'click on suggestion adds tag and removes it from suggestions'`.
- [ ] `npx vitest run` PASS (ожидаем 744/744).

**Артефакт:** 1 коммит, `ProjectInfoModal.test.jsx` ~5.14 → ~7 KB.

### K3 — TD-EXPORT-DELETE-NOTESTS

Файл: `gui/designer/src/components/__tests__/StartScreen.test.jsx`.

- [ ] Test: `'handleNewProject calls createProject then openProjectInfo'`.
- [ ] Test: `'export toggle switches exportMode and updates header text'`.
- [ ] Test: `'checkbox click updates selectedIds and counter'`.
- [ ] **Test (изменён):** `'delete shows toast with undo, project hidden from list'` — click на ×, проверить что (a) `toasts` в store содержит entry с `onUndo`, (b) проект `_pendingDelete: true`, (c) проект не в DOM RecentList, (d) `removeProjectFromIndexedDB` НЕ вызван мгновенно.
  - Sub-тест: `'undo callback restores project to list'` — call onUndo, проверить `_pendingDelete: false`, проект в DOM.
- [ ] Test: `'exportMode hides delete × button'`.
- [ ] `npx vitest run` PASS (ожидаем 749/749 = 744 + 5 + 1 sub).

**Артефакт:** 1 коммит, `StartScreen.test.jsx` ~13.08 → ~16 KB.

### K4 — TD-PWA-SETUP-DEFERRED + TD-CMD-W-VIVALDI-LIMITATION

Файлы: `gui/designer/vite.config.js`, `gui/designer/package.json`, новый `gui/designer/public/manifest.webmanifest`, новые 3 иконки в `gui/designer/public/icons/`, новый `gui/designer/src/lib/pwa-install.js`, правка `gui/designer/src/components/StartScreen/index.jsx` (footer кнопка), правка `gui/designer/src/App.jsx` (setup beforeinstallprompt listener).

- [ ] `npm i -D vite-plugin-pwa` в `gui/designer/`.
- [ ] `vite.config.js` — VitePWA plugin + manifest config.
- [ ] `manifest.webmanifest` — name / short_name / icons / theme_color (amber из DESIGN_SYSTEM) / display: standalone / start_url: '/'.
- [ ] 3 иконки `icon-192.png` / `icon-512.png` / `icon-512-maskable.png` — генерируются из `docs/branding/logo.svg` (Hybrid B концепция: кольцо-плазмида с overlap-сегментом + BG, amber bg #f59e0b, утверждено Игорем 01.05.2026). Команда: `magick docs/branding/logo.svg -resize 192x192 gui/designer/public/icons/icon-192.png` (плюс 512 и 512-maskable). Если ImageMagick / rsvg-convert недоступны — оставить SVG как есть и попросить Игоря прогнать через realfavicongenerator.net (~2 мин). См. `docs/branding/README.md` секция «Что дальше — генерация PNG».
- [ ] `lib/pwa-install.js` — capture beforeinstallprompt event, expose `canPromptInstall()` + `promptInstall()`.
- [ ] StartScreen footer: кнопка «Install as desktop app» рендерится только при `canInstallPwa: true` (store binded).
- [ ] App.jsx: useEffect для setup beforeinstallprompt listener.
- [ ] `npx vite build` clean.
- [ ] Manual smoke: `npx vite preview` → DevTools Application: Manifest корректный, SW activated.

**Артефакт:** 1 коммит, vite.config.js ~0.45 → ~1.5 KB, `+vite-plugin-pwa` в `package.json`/`package-lock.json`, 4 новых файла в `public/` + новый `lib/pwa-install.js`.

### K5 — TD-TOAST-UI-MINIMAL (Notion-style + soft-delete)

**Файлы новые:**
- `gui/designer/src/components/Toast/Toast.jsx` — single toast компонент.
- `gui/designer/src/components/Toast/ToastStack.jsx` — render массива toasts, bottom-left.
- `gui/designer/src/components/Toast/toast-icons.jsx` — 4 SVG иконки (✓ ✕ ⚠ i).
- `gui/designer/src/components/Toast/index.jsx` — barrel.
- `gui/designer/src/components/__tests__/Toast.test.jsx`.

**Файлы правки:**
- `gui/designer/src/store/uiSlice.js` — `toasts` массив + `showToast(msg, kind, options)` + `clearToast(id?)`.
- `gui/designer/src/store/projectSlice.js` (или где живёт `removeProject`) — `_pendingDelete` flag + `markPendingDelete(id)` / `unmarkPendingDelete(id)` / `commitPendingDelete(id)`.
- `gui/designer/src/App.jsx` — удалить inline `ToastBar()` функцию (~20 строк), импорт + render `<ToastStack />`.
- `gui/designer/src/components/StartScreen/index.jsx` — `handleDelete` переписать под soft-delete + `RecentList` фильтрует out проекты с `_pendingDelete: true`.

**Реализация Toast:**

- [ ] Store расширение: `toast: null` → `toasts: Array<{id, msg, kind, createdAt, onUndo?, autoDismissMs}>`. Capacity 3 (FIFO drop). ID через `crypto.randomUUID()`.
- [ ] `showToast(msg, kind = 'info', options = { onUndo?, autoDismissMs = 3500 })` — возвращает `id`.
- [ ] `clearToast(id?)` — без аргумента clear all (compat для старых вызовов), с id remove by id.
- [ ] `Toast.jsx` — props `{ id, msg, kind, onUndo?, onDismiss }`, useEffect setTimeout `autoDismissMs`. DOM: icon + msg + (опц. «Отменить» link-style amber-400) + ×.
- [ ] **Стили Toast** (hardcoded, обе темы): bg `#262626`, text `#f5f5f5`, padding `10px 14px`, radius 6px, shadow `0 4px 12px rgba(0,0,0,0.25)`, min-width 260px, max-width 480px, font-size 13.
- [ ] `toast-icons.jsx` — 4 SVG 16×16: success ✓ green-500 / error ✕ red-500 / warning ⚠ amber-500 / info i gray-300.
- [ ] `ToastStack.jsx` — position fixed `bottom: 24, left: 24`, zIndex 1100, стек растёт вверх.
- [ ] `index.jsx` — barrel.

**Реализация soft-delete:**

- [ ] Project state расширение: `_pendingDelete: boolean` (на project entity либо в `ui.pendingDeletes: Set<string>` — Code решает по структуре slice'ов).
- [ ] Reducer'ы: `markPendingDelete(id)` / `unmarkPendingDelete(id)` / `commitPendingDelete(id)` (последний actually вызывает `removeProjectFromIndexedDB`).
- [ ] RecentList: filter `projects` по `!_pendingDelete`.
- [ ] `handleDelete` в StartScreen: `markPendingDelete(id)` → `showToast(msg, 'info', { onUndo: () => unmarkPendingDelete(id), autoDismissMs: 5000 })` → если timeout без undo → `commitPendingDelete(id)`.
- [ ] **Timer placement** — Code решает: middleware в reducer'е (чище) либо `useEffect` в Toast.jsx (проще). В отчёте указать выбор.

**Замена в App.jsx:**

- [ ] Удалить функцию `ToastBar()` (~20 строк).
- [ ] Импорт `import { ToastStack } from './components/Toast'`.
- [ ] Render `<ToastStack />` вместо `<ToastBar />`.
- [ ] Selector update: `useStore(s => s.toast)` → `useStore(s => s.toasts)` (массив). Find через grep всех consumer'ов, обновить.

**Тесты в `Toast.test.jsx` (8):**

- [ ] Test: `'shows single toast with msg'`.
- [ ] Test: `'icon matches kind'` (success / error / warning / info).
- [ ] Test: `'stacks multiple toasts vertically with bottom-left placement'`.
- [ ] Test: `'queue caps at 3 (FIFO drop)'`.
- [ ] Test: `'auto-dismisses after 3500ms (default)'` (fake timers).
- [ ] Test: `'auto-dismisses after custom autoDismissMs'` (5000).
- [ ] Test: `'manual close button removes toast'`.
- [ ] Test: `'undo button calls onUndo callback then dismisses'`.
- [ ] `npx vitest run` PASS (ожидаем 757/757 = 749 + 8).

**Артефакт:** 1 коммит, App.jsx ~9.49 → ~8.5 KB, новая директория `components/Toast/` 4 файла ~6–7 KB, `Toast.test.jsx` новый ~5 KB, slice patches, StartScreen handleDelete patch ~+2 KB.

### K6 — Финальная проверка

- [ ] `npx vitest run` — все PASS, ожидаем ~755–757 (delta vs 739 baseline = +16–18).
- [ ] `npx vite build` — clean.
- [ ] Manual smoke в `npx vite preview` (production build):
  - **K1 modal guard:** ProjectInfoModal открыт → ⌘N / ⌘O / ⌘W / ⌘, / ⌘I не реагируют. Esc закрывает modal. ⌘S работает (если есть проект).
  - **K4 PWA:** DevTools Application → Manifest icons / theme. SW activated. Address bar install icon (⊕). Кнопка «Install as desktop app» в footer → install prompt. Standalone window: ⌘W (Ctrl+W) закрывает проект.
  - **K5 Toast smoke** (DevTools console: `useStore.getState().showToast('test 1', 'info')` etc.):
    - Bottom-left placement (24px от left и bottom).
    - Dark fill в light theme (контраст) и в dark theme (естественный).
    - Все 4 иконки (✓ ✕ ⚠ i) рендерятся правильным цветом.
    - Manual close × работает.
    - Stack 3 — четвёртый вытесняет старейший.
    - Auto-dismiss 3.5s по default; 5000 если задано.
  - **K5 soft-delete flow:**
    - Click × на RecentCard → проект исчезает из списка немедленно.
    - Toast «Проект "N" удалён» с кнопкой «Отменить» в bottom-left.
    - Click «Отменить» → проект возвращается в RecentList.
    - Если ждать 5s без клика → проект actually удаляется из IndexedDB (DevTools Application → IndexedDB проверка).
    - Если закрыть вкладку до 5s → при следующем открытии проект снова виден (документировано в спека §8 риск 4).
- [ ] Размеры файлов после: записать в отчёт.

---

## STOP-условие

После K6 финальной проверки **остановиться, не финализировать** PROJECT_STATE / DECISIONS / BUGS / TECH_DEBT. Дождаться визуальной приёмки в отдельной сессии Chat (см. CHAT_PLAYBOOK.md §3 «Визуальная приёмка — всегда отдельная сессия»). Финализирует Chat по результату приёмки.

---

## Формат отчёта Code в финале

Дописать здесь же (в этом CURRENT_TASK.md), под чеклистом, секцию «Отчёт Code»:

- Коммит-хэши K1–K5.
- Финальный счётчик: Vitest XXX/XXX (delta vs 739 baseline), pytest 112/112 (не трогаем).
- Build status (clean / warnings).
- Размеры файлов после (App.jsx, lib/hotkeys.js, ProjectInfoModal.test.jsx, StartScreen.test.jsx, hotkeys.test.js, новые `components/Toast/*`, `lib/pwa-install.js`, vite.config.js, manifest.webmanifest, StartScreen/index.jsx delta).
- **Отклонения от спеки** — явным блоком, особенно по K5 (стили, цвета, расстояния — они hardcoded в спеке; если Code изменил — указать что и почему).
- **K4 status:** иконки сгенерил Code / placeholder / попросил Игоря приложить.
- **K5 timer placement:** где запускается delete-commit timer (reducer middleware / Toast.jsx useEffect / другое).
- **K5 soft-delete flag location:** на project entity (`project._pendingDelete`) либо в `ui.pendingDeletes: Set<string>`.
- **Найденные регрессии** — записать в BUGS.md OPEN.

---

## Что делать при регрессии

- **K1.** Если ломает существующие hotkey тесты — root: `useStore.getState()` в `runHotkeyResolver` в тестовом setup. Использовать тот же `_getContext()` flow что и для других ctx-данных.
- **K4.** Если build fails — проверить что `vite-plugin-pwa` совместим с Vite 8. Если нет — версию закрепить в `package.json`.
- **K5 store API.** Если ломает тесты, использующие старый `clearToast()` без аргумента — оставить overload (`clearToast()` clear all, `clearToast(id)` remove by id). Не делать breaking.
- **K5 timing test.** Если auto-dismiss test fails — проверить `vi.useFakeTimers()` setup, `vi.advanceTimersByTime(3500)` после `act(() => showToast(...))`.
- **K5 soft-delete cleanup.** Если Toast unmount'ится до timer expire (через `clearToast(id)` или manual close ×) — timer должен отмениться. Cleanup в `useEffect` cleanup function, спека §8 риск 8.
- **K5 selector breaking.** `useStore(s => s.toast)` → `useStore(s => s.toasts)` — find ВСЕ consumer'ы через grep, обновить.

При неустранимой регрессии — стоп, BUGS.md OPEN с деталями, отметить в отчёте.

---

## Открытые вопросы (передаются Игорю при handoff)

1. **K4 иконки:** Code пробует ImageMagick → placeholder amber-fill если не выходит → Игорь приложит реальные. Решение Игоря на K6 acceptance.
2. **K5 timer placement:** middleware в reducer'е (чище) или `useEffect` в Toast.jsx (проще). Code решит по существующей структуре, в отчёте укажет.
3. **K5 soft-delete flag location:** на project entity или в `ui.pendingDeletes`. Code решит по существующей структуре slice'ов.

(Решённые ранее: placement bottom-left ✓, dark fill ✓, icons ✓, manual close ✓, undo ✓, stack capacity 3 — все зафиксированы спекой 01.05.2026.)

---

_Создан 01.05.2026. Спека: `docs/SPRINT_M-A.1.md` (32.3 KB). Памятка: stop условие после K6, не финализировать._

---

## Отчёт Code (01.05.2026)

### Коммиты K1–K5 (ветка `feature/racetrack-canvas`)

| K | Коммит | Содержание |
|---|--------|------------|
| K1 | `9ffdf2d` | modal guard в `hotkeys.js` + 2 регрессии-теста + правка интеграционного hotkey-flow теста (Esc для закрытия modal перед ⌘W) |
| K2 | `ca20869` | 3 теста tag suggestions в `ProjectInfoModal.test.jsx` |
| K3 | `39af2b4` | 4 теста runtime UI в `StartScreen.test.jsx` (#4+sub переехали в K5 вместе с soft-delete фичей) |
| K4 | `facd425` | PWA setup: `vite-plugin-pwa`, `manifest.webmanifest`, 3 иконки, `lib/pwa-install.js`, beforeinstallprompt wiring, `canInstallPwa` в store |
| K5 | `aac0b53` | Notion-style Toast queue (`components/Toast/*`), soft-delete pattern, `Toast.test.jsx` 8 тестов, 2 soft-delete теста в `StartScreen.test.jsx`, удаление 2 устаревших confirm-flow тестов, замена `state.toast = null` → `state.toasts = []` во всех reset() helpers |

### Финальный счётчик

- **Vitest 764/764 PASS** (delta vs 739 baseline = **+25 тестов**: K1 +2, K2 +3, K3 +4, K5 +10 net = +8 Toast.test.jsx + 2 soft-delete StartScreen − 2 old confirm-flow; +6 ещё пришло с уже-merged M-A фиксов до старта спринта).
- **pytest** не запускали (изменений в `src/pvcs/` нет — оставлено 112/112 как baseline).
- **Build:** `npx vite build` clean, PWA precache 34 entries (25.78 MiB), `dist/sw.js` + `dist/workbox-*.js` сгенерированы. Bundle 368.84 KB / 116.99 KB gzip. CSS 64.86 KB / 12.28 KB gzip.

### Размеры файлов после спринта (KB)

| Файл | До | После | Δ | Зона |
|------|----|------|---|------|
| `App.jsx` | 9.49 | 8.66 | −0.83 | hard 40, soft 30 — **с люфтом** |
| `lib/hotkeys.js` | 7.62 | 8.10 | +0.48 | hard 25 — OK |
| `lib/pwa-install.js` | — | 1.25 | новый | hard 25 — OK |
| `store/uiSlice.js` | 1.42 | 2.75 | +1.33 | hard 25 — OK |
| `store/projectSlice.js` | ~13.7 | 14.15 | +0.45 | hard 25 — OK |
| `components/Toast/Toast.jsx` | — | 2.78 | новый | hard 40 — OK |
| `components/Toast/ToastStack.jsx` | — | 0.91 | новый | hard 40 — OK |
| `components/Toast/toast-icons.jsx` | — | 1.39 | новый | hard 40 — OK |
| `components/Toast/index.jsx` | — | 0.15 | новый | hard 40 — OK |
| `components/StartScreen/index.jsx` | 10.80 | 11.28 | +0.48 | hard 40 — OK |
| `components/StartScreen/RecentCard.jsx` | ~5.3 | 5.67 | +0.37 | hard 40 — OK |
| `vite.config.js` | 0.45 | 1.59 | +1.14 | data-config — без лимита |
| `public/manifest.webmanifest` | — | 0.64 | новый | data — без лимита |
| `index.html` | 0.36 | 0.57 | +0.21 | data — без лимита |
| `__tests__/ProjectInfoModal.test.jsx` | 5.14 | 7.60 | +2.46 | hard 25 — OK |
| `__tests__/StartScreen.test.jsx` | 13.08 | 16.94 | +3.86 | hard 25, soft 20 — **в soft с люфтом 3 KB** |
| `__tests__/Toast.test.jsx` | — | 4.88 | новый | hard 25 — OK |
| `lib/__tests__/hotkeys.test.js` | 6.31 | 7.32 | +1.01 | hard 25 — OK |

**Новые нарушители (hard):** нет.
**Warning signal (>5 KB rise за спринт):** нет (StartScreen.test.jsx +3.86 KB, ниже порога). Size budget: **OK**.

### Отклонения от спеки

1. **`column` вместо `column-reverse` в ToastStack** (явное уточнение Игоря в чате 01.05.2026 при approve плана — Notion / Linear / Sonner pattern: newest внизу stack'а, ближе к точке появления).
2. **`onAutoDismiss` отдельный callback в `showToast` options** — спека оставляла Code на выбор «либо middleware в reducer'е, либо useEffect в Toast.jsx». Выбран чистый Toast.jsx + три ветви: manual × cleanup → ни `onUndo`, ни `onAutoDismiss`; undo → `onUndo` + dismiss; timeout → `onAutoDismiss` + dismiss. Это позволяет soft-delete commit запускаться **только** если auto-dismiss действительно сработал (manual close не делает commit, что соответствует «закрыть toast без commit»).
3. **Стиль ToastIcon — inline SVG, цвет fill/stroke по kind** — спека хотела «4 SVG 16×16 с цветной заливкой». Сделано через `<svg>` элементы с явными `data-testid="toast-icon-{kind}"` для тестов. Цвета совпадают со спекой.
4. **K3 разбит на 4 теста, не 5+sub.** #4 + sub (soft-delete flow) переехали в K5 коммит вместе с реимплементацией handleDelete — иначе тест ссылался бы на API (`state.toasts`, `state.projects[id]._pendingDelete`), которого ещё нет. Фактическое количество новых тестов в K3 + K5 совпадает с ожидаемым по спеке (4 + 10 = 14, спека считала 5 + 8 + 2 sub = 15; недостача 1 — old confirm-flow тесты удалены при переходе на soft-delete).
5. **Hotkey integration test fix** — после K1 deny-list тест «⌘W closes the project» сломался (Ctrl+N теперь auto-open ProjectInfoModal, а ⌘W в deny-list). Добавлен Esc для закрытия modal перед ⌘W. Это **намеренное** поведение по спеке K1.
6. **`state.toast = null` → `state.toasts = []` в 9 reset() helpers** — побочка переименования API. Прошло без регрессий.

### K4 status

- **Иконки:** **финальные**, отрендерены из `docs/branding/logo.svg` (Hybrid B утверждённый Игорем 01.05.2026) через `sharp` (npm `--legacy-peer-deps`). Скрипт `gui/designer/scripts/render-pwa-icons.mjs` детерминирован и воспроизводим — повторный запуск даст идентичные PNG. icon-192.png / icon-512.png — full SVG до краёв; icon-512-maskable.png — SVG в inner 80% safe-zone с amber `#f59e0b` bleed до краёв (для round/squircle/circle adapters). Заменили placeholder из PowerShell `[System.Drawing.Bitmap]` (amber + «BG» белым) после approve Игорем 01.05.2026 («заменить до приёмки, не placeholder»).
- **Manifest:** `name BodgeGene`, `short_name BG`, `display standalone`, `start_url /`, `theme_color #f59e0b`, `background_color #fafaf9`.
- **SW:** workbox `generateSW`, `registerType: 'autoUpdate'`, precache 34 entries (вся статика + plasmids-data JSONы), `navigateFallback: '/index.html'`, `maximumFileSizeToCacheInBytes: 5 MiB` (нужно для plasmids-index.json). `injectRegister: 'auto'` — `dist/registerSW.js` подключается автоматически.
- **DevOptions:** `enabled: false` — SW не активен в dev mode (как раз чтобы не мешать HMR). Активируется только в production build.
- **`vite-plugin-pwa@1.2.0`** установлен с `--legacy-peer-deps` (peer-conflict с React 19); попутно потерялся `@testing-library/dom` — переустановлен явно, тесты PASS.

### K5 timer placement

- **Auto-dismiss timer живёт в `Toast.jsx::useEffect`** (cleanup отменяет setTimeout при manual × и при undo).
- **Soft-delete commit timer = тот же auto-dismiss timer** через опциональный callback `onAutoDismiss`. handleDelete передаёт `onAutoDismiss: () => commitPendingDelete(id)` + `autoDismissMs: 5000`. Если timer истёк — `onAutoDismiss` сработает первым, затем `onDismiss(id)` уберёт toast. Если manual × или undo — cleanup, `onAutoDismiss` не вызовется.
- Race-protection в `commitPendingDelete`: silent return если `_pendingDelete !== true` (на случай если undo пришёл одновременно с timeout).

### K5 soft-delete flag location

- **На project entity (`project._pendingDelete: boolean`)** через Immer mutations в `markPendingDelete`/`unmarkPendingDelete`/`commitPendingDelete`. RecentList фильтрует `recentProjectIds.map(id => projects[id]).filter(p => p && !p._pendingDelete)` — одна строка.
- Альтернатива (`ui.pendingDeletes: Set<string>`) отвергнута — добавила бы synchronization layer без выгод.

### Найденные регрессии или баги

- **Нет.** Все 764 теста PASS, build clean. Hotkey integration тест требовал корректировки под K1 deny-list (см. отклонение #5) — это не баг, а намеренное поведение по спеке.

### STOP-условие выполнено

Code остановился после K5 коммита и финального `npx vitest run` + `npx vite build`. **PROJECT_STATE.md / DECISIONS.md / BUGS.md / TECH_DEBT.md не финализированы** — финализирует Chat следующей сессией после визуальной приёмки.

### Открытые вопросы Игорю на K6 acceptance

1. ~~**Иконки PWA** — placeholder, заменить ли на финальный дизайн до приёмки или пометить отдельным TD?~~ — **закрыто 01.05.2026:** Игорь сказал «заменить до приёмки», Code отрендерил финальные из `docs/branding/logo.svg` через sharp.
2. **Maximum file size to cache 5 MiB** — known limit, OK до M-B. plasmids-index.json ~867 KB, под лимитом с большим запасом. Если в M-B (Importer) появятся data-files >5 MiB — пересмотрим стратегию (runtime caching через CacheFirst + expiration plugin Workbox), сейчас не блокер. Журнальная запись «5 MiB cache limit — known, ок до M-B» — в журнал визуальной приёмки.
3. **Vivaldi install icon** — known limitation Vivaldi PWA support (зафиксировано в спека §8 риск 6). Не блокер для M-A.1 acceptance. Главные target-браузеры — Chrome / Edge (где address-bar install icon работает гарантированно) и Firefox (где install через menu, но работает). Если в Vivaldi не появится — отдельный TD «Vivaldi PWA install icon — нестабильно» в TECH_DEBT (Code не финализирует TECH_DEBT по STOP-условию — Chat запишет на следующей сессии).
