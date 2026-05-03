# Sprint M-A.1 — Polish после Sprint M-A

**Статус:** ✅ РЕАЛИЗОВАНО 01.05.2026 (визуальная приёмка PASS все 4 блока, K1–K5 коммиты `9ffdf2d` `ca20869` `39af2b4` `facd425` `aac0b53` в ветке `feature/racetrack-canvas`).

**Тип:** A/B на границе (mini-spec polish + Notion-style toast fea­ture, ~14–15 KB по §13 CHAT_PLAYBOOK).
**Создано:** 30.04.2026, после финализации Sprint M-A (третья сессия 30.04).
**Обновлено:** 01.05.2026 — K5 расширен до Notion-style (placement bottom-left + dark fill + icon + manual close × + undo button). Меняет K3 test «delete confirm flow» (window.confirm уходит, заменяется на soft-delete с undo).
**Цель:** закрыть 6 TD entries, накопленных при финализации M-A, до старта Sprint M-B.
**Объём Code:** ~4–5 ч (пять K-шагов; K5 расширен до Notion-style).
**Ветка:** `feature/racetrack-canvas` (продолжение M-A, без отдельного branch).

---

## §0 Срез размеров затрагиваемых модулей

Снимок 30.04.2026 после M-A финализации:

- `lib/hotkeys.js` — **7.62 KB** / hard 25, soft 20 (свободно).
- `lib/__tests__/hotkeys.test.js` — **6.31 KB** / hard 25.
- `components/ProjectInfoModal.jsx` — **11.94 KB** / hard 40, soft 30 (без правок в этом спринте).
- `components/__tests__/ProjectInfoModal.test.jsx` — **5.14 KB** / hard 25.
- `components/StartScreen/index.jsx` — **10.80 KB** / hard 40 (правки в K5 для soft-delete pattern, ~+2 KB → ~13 KB).
- `components/__tests__/StartScreen.test.jsx` — **13.08 KB** / hard 25 (~+3 KB после K3 → ~16 KB, в soft).
- `App.jsx` — **9.49 KB** / hard 40 (после K5 уменьшится за счёт extract `ToastBar` → ~8.5 KB).
- `vite.config.js` — **0.45 KB** (+~1 KB после K4).
- Новые файлы: `components/Toast/{Toast,ToastStack,toast-icons,index}.jsx` (~6–7 KB суммарно), `manifest.webmanifest`, `public/icons/icon-192.png` / `icon-512.png` / `icon-512-maskable.png`, `components/__tests__/Toast.test.jsx` (~5 KB).

**Декомпозиция в скоупе спринта не требуется** — все затрагиваемые файлы под soft.

---

## §1 Контекст

Sprint M-A финализирован 30.04.2026 — стартовый экран + Dexie persistence + .bodge ZIP + multi-tab lock + hotkey registry + ProjectInfoModal + auto-open + delete + export + tag suggestions. Тесты 851 (739 Vitest + 112 pytest) PASS, build clean, визуальная приёмка PASS.

В процессе финализации накопилось 6 TD entries (TECH_DEBT.md):

1. **TD-HOTKEY-MODAL-GUARD** — ⌘N inside открытой ProjectInfoModal/SettingsModal создаёт новый Untitled проект и переоткрывает modal. Не блокирует работу, но переключает контекст без явного действия. Аналогично для ⌘O / ⌘W / ⌘, / ⌘I.
2. **TD-PROJECTINFO-SUGGESTIONS-NOTESTS** — tag suggestions блок (DEC-MA-04, добавлен Chat'ом через Filesystem:edit_file) без unit-тестов.
3. **TD-EXPORT-DELETE-NOTESTS** — runtime UI Игоря (auto-open ProjectInfoModal после createProject, export mode toggle, чекбоксы, handleExportSelected, delete confirm) без unit-тестов.
4. **TD-PWA-SETUP-DEFERRED** — `vite-plugin-pwa` setup, manifest, service worker, beforeinstallprompt handler. Заодно закрывает **TD-CMD-W-VIVALDI-LIMITATION**.
5. **TD-TOAST-UI-MINIMAL** — текущий inline `<ToastBar/>` в App.jsx показывает один toast at a time. Расширяем до **Notion-style** (Игорь, 01.05.2026): bottom-left placement + dark background + icon + manual close × + undo button. Это меняет flow delete project (заменяет `window.confirm()` на soft-delete с undo).

Sprint закрывает все 6 одним пакетом. После M-A.1 идёт M-B kickoff на чистом контексте.

---

## §2 Стратегия (по K-шагам)

- **K1 — Modal guard:** в `runHotkeyResolver` читать `getState().ui.modals`; блокировать `'new-project'` / `'open-bodge'` / `'close-project'` / `'open-settings'` / `'project-info'` когда открыт modal. `'escape'` и `'save-bodge'` — продолжают работать.
- **K2 — ProjectInfoModal tag suggestions tests:** 3 unit-теста.
- **K3 — StartScreen runtime UI tests:** 5 unit-тестов (test «delete» переписан под soft-delete + undo flow).
- **K4 — PWA setup:** `vite-plugin-pwa` + manifest + 3 icon файла + beforeinstallprompt handler.
- **K5 — Notion-style Toast component с queue + soft-delete pattern:**
  - Новый `components/Toast/` с queue в store.
  - **Placement bottom-left** (24px от left + 24px от bottom).
  - **Dark background** в обеих темах (`#262626` background + `#f5f5f5` text — hardcoded, НЕ через theme tokens).
  - **Icon** слева для типа: `✓` success (green-500), `✕` error (red-500), `⚠` warning (amber-500), `i` info (gray-300).
  - **Manual close ×** справа.
  - **Undo button** — опциональный prop `onUndo`. Если задан — рендерится текстовая кнопка «Отменить» между текстом и × (link-style underline).
  - **Soft-delete pattern для delete project:** `handleDelete` теперь не вызывает `window.confirm`, а:
    1. Помечает проект как `_pendingDelete: true` в store (скрывает из RecentList в UI).
    2. Показывает toast с msg = `«Проект "N" удалён»`, kind = `'info'`, `onUndo: () => unmarkPendingDelete(id)`, autoDismissMs = 5000 (не 3500 — деструктивное действие требует больше времени на undo).
    3. Если undo нажат до timeout → unmark, проект возвращается в RecentList.
    4. Если timeout истёк без undo → actually call `removeProjectFromIndexedDB(id)`.

Порядок: K1, K2, K3, K4 как раньше; K5 в финале (наибольший по объёму).

---

## §3 Scope

### IN

- 5 K-шагов выше + финальная visual-acceptance (K6 в §6).
- Все правки в `feature/racetrack-canvas` ветке (продолжение M-A).
- Soft-delete pattern (был «delete с window.confirm» в M-A, становится «delete с toast undo» в M-A.1) — единственное **функциональное** изменение workflow в этом спринте.
- ~14–17 новых тестов (~739 → ~753–756 Vitest).

### OUT (явно отложено)

- **Refactor `ProjectInfoModal.jsx` или `StartScreen/index.jsx`** — оба под soft, не трогаем.
- **Toast events from importer / reactions (M-B)** — toast queue будет готов к ним, но конкретные интеграции в M-B.
- **Service Worker .bodge кэширование** — local-first архитектура, SW кэширует только статику.
- **Keyboard Lock API fallback** — Firefox/Safari не поддерживают; PWA standalone достаточен для Chrome/Edge/Vivaldi.
- **Maskable icon design** — placeholder amber-fill в K4, реальную иконку Игорь приложит когда дойдут руки.
- **Toast persistent (не auto-dismiss)** — для M-B reactions, где user может хотеть видеть прогресс долгой операции.
- **Toast theme-aware colors** — Notion-style фиксирует dark fill в обеих темах, не следует app theme. Если в M-B понадобится theme-aware — отдельное решение.

---

## §4 Архитектурные решения

1. **Modal guard через deny-list, не allow-list.** Проще читается; новые hotkeys по умолчанию allowed в modal-context (если в будущем кто-то добавит, который должен работать в modal — он сразу работает). Альтернатива (allow-list) защищённее, но требует регистрации каждого hotkey в guard. Для Sprint М-А.1 deny проще.

2. **Toast queue в `ui` slice store.** `toast: null | object` → `toasts: Array<{id, msg, kind, createdAt, onUndo?, autoDismissMs}>`. ID через `crypto.randomUUID()`. Queue capacity 3 — четвёртый замещает самый старый (FIFO drop). Это паттерн react-hot-toast / sonner / Notion.

3. **Placement bottom-left, dark fill в обеих темах.** Notion-style. Bottom-left:
   - Не конфликтует с потенциальной правой колонкой / sidebar (которые могут быть в M-D Container Window).
   - Менее назойливо чем bottom-center (текущий) — не закрывает основной контент.
   - Стандарт: Notion, Linear, Figma (Figma вообще top-right — но bottom-left у Notion и большинства productivity tools).
  
   Dark fill (`#262626` bg + `#f5f5f5` text) hardcoded, не следует app theme. Это даёт контраст в обеих темах: на light theme dark toast «pops out» как notification; на dark theme — естественно сливается, остаётся читаемым. Альтернатива (theme-aware) — toast визуально сливается с app в обеих темах, теряется «notification» характер.

4. **Soft-delete с undo для delete project.** Заменяет `window.confirm()` на toast-flow. Преимущества: (a) недеструктивный UX — Игорь может промахнуться кнопкой ×, ошибку видно сразу; (b) консистентность с Notion / Linear / Figma; (c) не требует второго клика «Confirm» — один клик + видимое последствие + явная возможность откатить. **5 секунд** auto-dismiss специально для деструктивных действий (стандарт Notion / Linear).
  
   Имплементация: `_pendingDelete: boolean` per-project (в Project state object либо в отдельном `ui.pendingDeletes: Set<string>`). RecentList фильтрует out проекты с `_pendingDelete: true`. Toast `onUndo` callback unmark'ит флаг. Timer (через `setTimeout` в reducer'е либо через middleware) после `autoDismissMs` actually вызывает `removeProjectFromIndexedDB`. Если в течение 5s другой delete пришёл на тот же id (edge case) — игнорируем, флаг уже стоит.

5. **Manual close × кнопка** — отдельная иконка-кнопка справа в toast'е. Click → `clearToast(id)` без вызова `onUndo`. Это разные действия: «закрыть toast (без undo)» vs «отменить действие (закрывает toast как побочный эффект)». Соответствует Notion-flow.

6. **PWA SW через workbox-window (vite-plugin-pwa default).** Precache статики, NetworkFirst для index.html, CacheFirst для остального. SW регистрируется только в production build (`registerType: 'autoUpdate'`).

7. **beforeinstallprompt handler в StartScreen footer.** Кнопка «Install as desktop app» появляется только когда событие сработало. Click → `prompt()` → если accepted, `showToast('Приложение установлено', 'success')`, скрываем кнопку.

---

## §5 По K-шагам

### K1 — TD-HOTKEY-MODAL-GUARD

**Файлы:** `gui/designer/src/lib/hotkeys.js`, `gui/designer/src/lib/__tests__/hotkeys.test.js`.

**Правка `hotkeys.js`:** в `runHotkeyResolver` сразу после строки `const ctx = opts.context ? opts.context : _getContext();` (около строки 220) добавить:

```
// Modal guard: when ProjectInfoModal or SettingsModal is open, block hotkeys
// that would create/switch project context. Esc + Save still work.
const modals = useStore.getState().modals || {};
const modalOpen = modals.projectInfo || modals.settings;
const MODAL_BLOCKED = new Set([
  'new-project', 'open-bodge', 'close-project', 'open-settings', 'project-info'
]);
```

И в основной цикл `for (const [id, def] of Object.entries(HOTKEYS))` добавить условие `if (modalOpen && MODAL_BLOCKED.has(id)) continue;` после `if (!_handlers.has(id)) continue;`. ~10 строк.

**Регрессия-тесты в `hotkeys.test.js`:**

1. `'⌘N inside open ProjectInfoModal does not run new-project handler'` — mock `useStore.getState()` возвращает `{ modals: { projectInfo: true }, currentProjectId: 'p1', canvas: { activeFullscreen: 'dag' } }`, регистрируем handler через `registerHandler('new-project', spy)`, диспатчим keyboard event ⌘N → `runHotkeyResolver` returns false, spy не вызван.
2. `'Escape inside open ProjectInfoModal still runs escape handler'` — тот же setup, регистрируем `'escape'` handler, диспатчим Esc → returns true, spy вызван.

**Объём:** ~10 строк правки + 2 теста (~30 строк). 30 мин.

---

### K2 — TD-PROJECTINFO-SUGGESTIONS-NOTESTS

**Файлы:** `gui/designer/src/components/__tests__/ProjectInfoModal.test.jsx` (existing 5.14 KB).

**3 теста:**

1. `'excludes already-added tags from suggestions'`.
2. `'sorts suggestions by frequency then alphabetically'`.
3. `'click on suggestion adds tag and removes it from suggestions'`.

Code посмотрит существующий `ProjectInfoModal.test.jsx` для паттерна mock store + render. Размер вырастет до ~7 KB.

**Объём:** 3 теста (~50 строк). 30 мин.

---

### K3 — TD-EXPORT-DELETE-NOTESTS

**Файлы:** `gui/designer/src/components/__tests__/StartScreen.test.jsx` (existing 13.08 KB).

**5 тестов:**

1. `'handleNewProject calls createProject then openProjectInfo'` — spy на оба action'а, click `+ New project`, проверить call order.
2. `'export toggle switches exportMode and updates header text'` — click на «⤓ Export .bodge…», проверить header «Выбор для экспорта · 0 выбрано».
3. `'checkbox click updates selectedIds and counter'` — exportMode on, click на checkbox первого RecentCard, проверить counter «1 выбрано».
4. **`'delete shows toast with undo, project hidden from list'`** (заменён под soft-delete, см. K5 §4 решение #4) — click на × delete-button, проверить (a) `toasts` в store содержит entry с `onUndo` и `kind: 'info'`, (b) проект `_pendingDelete: true`, (c) проект НЕ виден в RecentList DOM, (d) `removeProjectFromIndexedDB` НЕ вызван (мгновенно). Дополнительный sub-тест: `'undo callback restores project to list'` — call onUndo, проверить `_pendingDelete: false`, проект снова в DOM.
5. `'exportMode hides delete × button'` — exportMode on, проверить что delete `×` отсутствует в DOM RecentCard.

`handleExportSelected` loop с 80ms паузой не тестируем (отложено в M-B). **timeout-driven `removeProjectFromIndexedDB` после 5s** — отдельный тест в K5 (`Toast.test.jsx`), не в `StartScreen.test.jsx`.

**Объём:** 5 тестов + 1 sub-тест (~110 строк). 1 ч.

---

### K4 — TD-PWA-SETUP-DEFERRED (+ TD-CMD-W-VIVALDI-LIMITATION)

**Файлы:** `gui/designer/vite.config.js`, `gui/designer/package.json`, новый `gui/designer/public/manifest.webmanifest`, новые 3 иконки в `gui/designer/public/icons/`, новый `gui/designer/src/lib/pwa-install.js`, правка `gui/designer/src/components/StartScreen/index.jsx` (footer кнопка), правка `gui/designer/src/App.jsx` (setup beforeinstallprompt listener).

**Шаги:**

1. `npm i -D vite-plugin-pwa` в `gui/designer/`.
2. В `vite.config.js` — `VitePWA` plugin с `registerType: 'autoUpdate'`, manifest config (name / short_name / icons / theme_color amber из DESIGN_SYSTEM / background_color / display: 'standalone' / start_url: '/').
3. Иконки 192/512/maskable. Минимальный вариант: amber background + белый текст «BG». Если Code не может — placeholder + просьба к Игорю.
4. `lib/pwa-install.js`: capture beforeinstallprompt event, expose `canPromptInstall()` + `promptInstall()`.
5. `StartScreen/index.jsx` футер: кнопка «Install as desktop app» рендерится только при `ui.canInstallPwa: true`. Click → `promptInstall()` → если accepted, `showToast('Приложение установлено', 'success')`, set `canInstallPwa: false`.
6. App.jsx: useEffect для setup beforeinstallprompt listener.

**Тесты:** не пишем (PWA infrastructure, не unit-testable без e2e setup).

**Acceptance K4 (визуальная приёмка K6):** см. §6 K6.

**Объём:** ~30 строк vite.config + ~20 строк pwa-install.js + ~10 строк интеграции + 3 icon файла + manifest. 1–1.5 ч.

**Риск:** иконки — partial K4 если Code не может сгенерировать.

---

### K5 — TD-TOAST-UI-MINIMAL (Notion-style + soft-delete pattern)

**Файлы:**
- Новые: `gui/designer/src/components/Toast/Toast.jsx`, `gui/designer/src/components/Toast/ToastStack.jsx`, `gui/designer/src/components/Toast/toast-icons.jsx`, `gui/designer/src/components/Toast/index.jsx` (барель), `gui/designer/src/components/__tests__/Toast.test.jsx`.
- Правка: `gui/designer/src/store/uiSlice.js` (или текущее место `showToast` / `clearToast` — Code узнает через grep).
- Правка: `gui/designer/src/store/projectSlice.js` (или где живут `removeProject` / `_pendingDelete` flag).
- Правка: `gui/designer/src/App.jsx` — удалить inline `ToastBar` (~20 строк), импорт `<ToastStack />`.
- Правка: `gui/designer/src/components/StartScreen/index.jsx` — `handleDelete` переписать под soft-delete (~20 строк правки).

**Структура нового Toast.**

`store` (расширение существующего slice):
- `toast: null` → `toasts: Array<{id, msg, kind, createdAt, onUndo?, autoDismissMs}>`. Capacity 3 (FIFO drop).
- `showToast(msg, kind = 'info', options = {})`. Options: `{ onUndo?: () => void, autoDismissMs?: number = 3500 }`. Возвращает `id` (для возможности `clearToast(id)` снаружи).
- `clearToast(id?)` — без аргумента clear all (compat для старого вызова), с id remove by id.
- ID через `crypto.randomUUID()`.
- **Project soft-delete flag.** В `Project` entity (или в `ui.pendingDeletes: Set<string>` — Code решает по существующей структуре) добавить `_pendingDelete: boolean`. RecentList фильтрует out проекты с `_pendingDelete: true`.
- **Soft-delete reducer'ы:** `markPendingDelete(id)` — set flag true. `unmarkPendingDelete(id)` — set false. `commitPendingDelete(id)` — actually вызывает `removeProjectFromIndexedDB(id)` + remove из `projects` map.

`Toast.jsx` (~50 строк) — один toast. Props: `{ id, msg, kind, onUndo?, onDismiss }`. Структура DOM:
- `<div role="status">`
  - `<icon>` (из `toast-icons.jsx` по kind)
  - `<span>{msg}</span>`
  - `{onUndo && <button onClick={() => { onUndo(); onDismiss(id); }}>Отменить</button>}`
  - `<button onClick={() => onDismiss(id)} aria-label="Закрыть">×</button>`
- useEffect setTimeout `autoDismissMs` → `onDismiss(id)`. Если `onUndo` задан — также вызывает callback который commit'ит delete (или Code делает это в reducer'е через side-effect middleware — TBD во время K5).

**Стили Toast.jsx (hardcoded, обе темы):**
- Background: `#262626`.
- Text: `#f5f5f5`.
- Border: `none`.
- Border-radius: `6px`.
- Padding: `10px 14px`.
- Box-shadow: `0 4px 12px rgba(0, 0, 0, 0.25)`.
- Display: `flex`, `align-items: center`, `gap: 10px`.
- Min-width: `260px`, `max-width: 480px`.
- Icon: 16×16, mr-2.
- Undo button: link-style, `color: #fbbf24` (amber-400 для контраста на dark), underline on hover, padding 0 4px.
- Close × button: 20×20, color `#a3a3a3` (neutral-400), hover `#f5f5f5`, transparent bg.
- Font-size: 13.

`toast-icons.jsx` (~30 строк) — 4 SVG-иконки 16×16 с цветной заливкой по kind:
- `success`: ✓ green (#22c55e).
- `error`: ✕ red (#ef4444).
- `warning`: ⚠ amber (#f59e0b).
- `info`: i gray (#a3a3a3).

`ToastStack.jsx` (~30 строк) — рендерит массив toasts. Position fixed, **bottom: 24, left: 24** (изменено с center на bottom-left), zIndex 1100. Стек растёт вверх — каждый toast обёрнут в div с `style={{ marginBottom: i === 0 ? 0 : 8 }}` или абсолютно позиционируется через `bottom: 24 + i * 56`. Code выберет более чистый вариант.

`index.jsx` — barrel: `export { default as ToastStack } from './ToastStack'`.

**Замена в App.jsx:** удалить функцию `ToastBar()` целиком, импортить `ToastStack`, render `<ToastStack />` вместо `<ToastBar />`.

**Правка `handleDelete` в StartScreen/index.jsx:**

```
// БЫЛО (M-A):
function handleDelete(project) {
  if (window.confirm(`Удалить проект "${project.name}"?`)) {
    removeProjectFromIndexedDB(project.id);
  }
}

// СТАНЕТ (M-A.1):
function handleDelete(project) {
  markPendingDelete(project.id);
  showToast(`Проект "${project.name}" удалён`, 'info', {
    onUndo: () => unmarkPendingDelete(project.id),
    autoDismissMs: 5000,
  });
  // commit timer запускается в reducer'е showToast или в Toast.jsx::useEffect.
  // Если onUndo НЕ был вызван к моменту dismiss → commitPendingDelete(project.id).
}
```

Code решит точное место timer'а (в reducer'е через middleware — чище; либо в Toast.jsx через useEffect — проще). Главное: **гарантия** что без undo через 5s проект actually удалится.

**Тесты в `Toast.test.jsx` (8 тестов):**

1. `'shows single toast with msg'` — store dispatch `showToast('hello')`, render `<ToastStack />`, проверить DOM contains 'hello'.
2. `'icon matches kind'` — render с `kind: 'success'`, проверить наличие SVG иконки success (data-testid="toast-icon-success" либо проверка через role/aria).
3. `'stacks multiple toasts vertically with bottom-left placement'` — три `showToast`, проверить три DOM элемента, стэк, координаты left = 24.
4. `'queue caps at 3 (FIFO drop)'` — четыре `showToast`, проверить что в DOM 3 toasts, последние 3.
5. `'auto-dismisses after 3500ms (default)'` — fake timers, `showToast('a')`, advance 3500ms, проверить toast disappeared.
6. `'auto-dismisses after custom autoDismissMs'` — `showToast('a', 'info', { autoDismissMs: 5000 })`, advance 4999ms — toast в DOM; advance 1ms — toast disappeared.
7. `'manual close button removes toast'` — render, click на ×, проверить toast удалён из store.
8. `'undo button calls onUndo callback then dismisses'` — render с `onUndo` spy, click «Отменить», проверить spy вызван + toast удалён.

Доп. интеграционный тест в `StartScreen.test.jsx` (уже посчитан в K3 №4): полный flow soft-delete с timer commit. Используется fake timers + spy на `removeProjectFromIndexedDB`.

**Объём:**
- Toast.jsx ~50 строк + ToastStack.jsx ~30 + toast-icons.jsx ~30 + index.jsx 1 строка ≈ 110 строк.
- Slice patches ~30 строк (`toasts` array + `_pendingDelete` flag + 3 reducer'а).
- App.jsx delete 20 строк.
- StartScreen handleDelete patch ~10 строк.
- 8 тестов в Toast.test.jsx ~150 строк.

Итого K5 = **2–3 ч**.

---

## §6 Порядок выполнения + оценка времени

1. **K1** — modal guard + 2 теста — 30 мин.
2. **K2** — 3 теста ProjectInfoModal suggestions — 30 мин.
3. **K3** — 5 тестов StartScreen (включая soft-delete flow test) — 1 ч.
4. **K4** — PWA setup — 1–1.5 ч.
5. **K5** — Notion-style Toast + soft-delete pattern + 8 тестов — 2–3 ч.
6. **K6** — финальная проверка:
   - `npx vitest run` — все PASS, ~755 (delta vs 739 = +16 тестов).
   - `npx vite build` — clean.
   - Manual smoke в `npx vite preview` (production build):
     - ProjectInfoModal открыт → ⌘N / ⌘O / ⌘W / ⌘, / ⌘I не реагируют. Esc закрывает modal. ⌘S работает (если есть проект).
     - DevTools Application → Manifest корректный, SW activated, install icon (⊕) появляется. Кнопка «Install as desktop app» → install prompt.
     - Standalone window: ⌘W (Ctrl+W) закрывает проект, не вкладку.
     - Toast smoke (DevTools console: `useStore.getState().showToast('test 1', 'info')` etc.):
       - **Bottom-left placement** (24px от left и bottom).
       - **Dark fill** в light theme (контрастный) и в dark theme (естественный).
       - **Icons** для всех 4 kinds (✓ ✕ ⚠ i).
       - **Manual close ×** работает.
       - **Stack 3** — четвёртый toast вытесняет старейший.
       - **Auto-dismiss** 3.5s по default.
     - **Soft-delete flow:** click × на RecentCard → проект исчезает из списка, toast «Проект удалён» с кнопкой «Отменить». Click «Отменить» → проект возвращается. Если ждать 5s — проект actually удаляется (проверить через DevTools Application → IndexedDB).

**Итого Code:** ~5–7 ч (в зависимости от иконок K4 и сложности soft-delete reducer wiring K5).

---

## §7 STOP-условие и формат отчёта

**STOP:** после K5 коммита и финальной `npx vitest run` + `npx vite build`. **Не финализировать** PROJECT_STATE / DECISIONS / BUGS / TECH_DEBT — финализирует Chat следующей сессии после визуальной приёмки.

**Формат отчёта Code в CURRENT_TASK.md в финале:**

- Коммит-хэши по K1–K5.
- Финальные счётчики: Vitest XXX/XXX (delta vs 739), pytest 112/112.
- Build status.
- Размеры файлов после: App.jsx, lib/hotkeys.js, components/Toast/* (новые), manifest.webmanifest, vite.config.js delta, StartScreen/index.jsx delta.
- **Отклонения от спеки** — явным блоком (особенно Toast styles, цвета, расстояния — они hardcoded в спеке; если Code изменил — указать).
- **K4 status:** иконки сгенерил Code / placeholder / попросил Игоря.
- **K5 timer placement:** где запускается delete-commit timer (в reducer'е middleware / в Toast.jsx useEffect / другое).
- **Найденные регрессии или баги** — в BUGS.md OPEN.

---

## §8 Риски

1. **K4 иконки.** Если Code не может сгенерировать — partial K4 с placeholder PNG. Игорь приложит реальные.
2. **K5 store API breaking change.** `clearToast()` → `clearToast(id?)`. Backward-compatible (без аргумента clear all). `useStore(s => s.toast)` → `useStore(s => s.toasts)` (массив). Code сделает grep по всем consumer'ам.
3. **K5 soft-delete commit timer race.** Если пользователь нажимает delete 2-й раз на тот же проект пока первый ещё в pending state — игнорируем (флаг уже `true`, toast уже показан). Если delete на разные проекты — каждый имеет свой timer, не конфликтуют.
4. **K5 soft-delete restoration после browser close.** Если пользователь закрыл вкладку до auto-commit (5s) — `_pendingDelete` flag в store, но Dexie не знает (проект в Dexie остаётся). При следующем открытии: store hydrate из Dexie, флаг `_pendingDelete` сбрасывается (default false) — проект возвращается в RecentList. Это **корректное** поведение (по умолчанию ничего не делать = не удалять). Не митигируем.
5. **K1 modal guard race.** `runHotkeyResolver` синхронный, store update тоже (Zustand) — race не возникает. Не митигируем.
6. **PWA в Vivaldi.** beforeinstallprompt может не сработать. Митигация: кнопка install скрыта если `canInstallPwa: false`, фолбек на ‹ back-button. Sprint не блокируется.
7. **K5 Toast styles на desktop / mobile.** Игорь работает на desktop; mobile out of scope (DEC-V2-19). На узких экранах bottom-left toast 480px max-width может не уместиться — width будет subтractный по viewport. Не митигируем (mobile out of scope).
8. **K5 auto-commit при unmount Toast.** Если Toast удалён из DOM до timeout (например через `clearToast(id)` или `clearAll`) — timer должен отмениться, иначе delete commit'ится «навсегда» когда пользователь хотел отменить через manual close. Митигация: cleanup в useEffect cleanup function. Code обязан проверить.

---

## §9 Открытые вопросы

1. **K4 иконки.** Code пробует ImageMagick → placeholder если не выходит → Игорь приложит реальные. Решение Игоря на K6 acceptance.
2. **K5 timer placement.** В reducer middleware (чище, инвариант на уровне store) или в Toast.jsx useEffect (проще, инвариант на уровне UI). Оба варианта приемлемы. Code решит по существующей структуре slice'ов; в отчёте указать какой выбран.
3. **K5 soft-delete flag — где живёт.** На project entity (`project._pendingDelete: boolean`) или в `ui.pendingDeletes: Set<string>`. Первое проще для filtering RecentList (один map по проектам), второе изолирует UI-state от data-model. Code решит по существующей структуре.
4. **K2 + K3 + K5 тесты — все или часть?** Спека пишет 3 + 5 + 8 = 16 тестов. Если Code упирается в timing — приоритет: K3 №4 (soft-delete flow) > K5 №8 (undo) > K5 №7 (manual close) > K1 тесты > K2 №2 (sort) > остальные. Можно отрезать минимум 4–6 тестов и закрыть TD частично.

---

**Создан:** 30.04.2026 (Sprint M-A.1 spec writing).  
**Обновлён:** 01.05.2026 — K5 расширен до Notion-style (placement bottom-left, dark fill, icon, manual close ×, undo button) + soft-delete pattern для delete project (заменяет window.confirm). Игорь, в чате 01.05.2026.  
**Источник:** TECH_DEBT.md TD entries 6 шт. + post-mortem Sprint M-A финализации (PROJECT_STATE.md журнал 30.04 третья сессия) + Notion-style toast спецификация (Игорь, 01.05.2026).
