# Sprint M-A — Стартовый экран + Project shell

**Статус:** ✅ РЕАЛИЗОВАНО 30.04.2026 (включая M-A-fix-1 UX, M-A-fix-2 ProjectInfoModal, runtime additions Игоря — auto-open / export mode / delete, tag suggestions Chat'ом). См. PROJECT_STATE.md журнал 30.04.2026 (третья сессия), DECISIONS.md DEC-MA-01..04, TECH_DEBT.md TD-HOTKEY-MODAL-GUARD / TD-PROJECTINFO-SUGGESTIONS-NOTESTS / TD-EXPORT-DELETE-NOTESTS / TD-CMD-W-VIVALDI-LIMITATION / TD-PWA-SETUP-DEFERRED / TD-TOAST-UI-MINIMAL.

**Изменения по итогам реализации (отклонения от исходной спеки):**
- K4 retrofit: добавлен после K3 как kickoff hotkey infrastructure (после K11 в исходной нумерации, коммит `441b53b`).
- M-A-fix-1 UX (Игорь руками): theme toggle вынесен из Settings Display tab в header (☀/🌙 icon button), Guide → UnderConstruction stub, back button `‹` вместо wordmark в Topbar.
- M-A-fix-2 ProjectInfoModal (Code, mini-spec, коммит `fedbeed`): name + description + tags edit modal + 7-й хоткей `'project-info'` (⌘I/Ctrl+I) + reducer `updateDescription` + кнопка `✏️` в Topbar.
- Runtime additions (Игорь руками): handleNewProject auto-open ProjectInfoModal после createProject, export mode toggle с чекбоксами на RecentCard и handleExportSelected, delete button с window.confirm, downloadBlob helper в file-system.js.
- Tag suggestions (Chat прямой правкой через Filesystem): useMemo derived из store.projects, sort by frequency then alphabetical, exclude already-added.

Финальные числа: vitest 739/739, pytest 112/112, vite build clean. ~17 коммитов в `feature/racetrack-canvas` (`b1b13b9..` + последний поверх `fedbeed`).

---

**Тип:** feature (первый милстоун v0.6)
**База:** v0.6.0-dev (wipe + rewrite frontend, см. ARCHITECTURE_v2 §0). Последний v0.5.4-alpha коммит остаётся в git, M-A коммиты пишутся поверх с явным переходом на v0.6 структуру.
**Предпосылка:** dual-сессия 30.04.2026 утвердила Variant B v7 wireframe (DEC-DS-01) + ⚓ DEC-V2-28..30. Hotkey infrastructure kickoff 30.04.2026 (после M-A spec writing) добавил архитектурный фундамент хоткеев. Нужна полная спека первого окна v0.6 — стартового экрана + минимального project shell + lifecycle e2e + hotkey registry.

---

## 0. Срез размеров

M-A — почти полностью **новые файлы**. Существующие переписываются (App.jsx / store/index.js / projectSlice / uiSlice) либо **не трогаются** (все 42 v0.5 компонента, FragmentEditor/, flow/, ImportStartScreen/, hooks/, lib/, расчётные модули — переиспользуются в M-B+ по ARCHITECTURE_v2 §8).

| Файл | Действие | Текущий | Прогноз | Лимит |
|------|----------|---------|---------|-------|
| `App.jsx` | rewrite | 30.56 KB | 3–5 KB | 40 KB |
| `store/index.js` | rewrite | 12.88 KB | 8–12 KB | 25 KB |
| `store/projectSlice.js` | rewrite | 3.68 KB | 6–10 KB | 25 KB |
| `store/uiSlice.js` | rewrite | 7.22 KB | 3–4 KB | 25 KB |
| `store/canvasSlice.js` | новый | — | 2–3 KB | 25 KB |
| `db/dexie-schema.js` | новый | — | 2–3 KB | 25 KB |
| `lib/file-system.js` | новый | — | 4–6 KB | 25 KB |
| `lib/bodge-zip.js` | новый | — | 4–6 KB | 25 KB |
| `lib/multi-tab-lock.js` | новый | — | 2–3 KB | 25 KB |
| `lib/storage.js` | новый | — | 1–2 KB | 25 KB |
| `lib/hotkeys.js` | новый | — | 3–5 KB | 25 KB |
| `components/AppShell/index.jsx` + Topbar.jsx | новые | — | 7–11 KB total | 40 KB each |
| `components/StartScreen/*` (3 файла) | новые | — | 9–15 KB total | 40 KB each |
| `components/UnderConstruction.jsx` | новый | — | 1–2 KB | 40 KB |
| `components/DagPlaceholder.jsx` | новый | — | 1–2 KB | 40 KB |
| `components/SettingsModal.jsx` | новый | — | 3–4 KB | 40 KB |
| `index.css` | расширить | (existing) | +1–2 KB | data-like |

Все в зелёной зоне. Декомпозиция первым пунктом не нужна.

---

## 0.5. Ответы Игоря

### Wireframe-сессия 30.04.2026

7-итерационный refinement Variant B → v7. Зафиксировано в DECISIONS.md блоком «Sprint M-A Wireframe Selection» (DEC-DS-01 + ⚓ DEC-V2-28..30). Утверждённый wireframe HTML: `docs/prototype/start_screen_variant_b_v7_theme_toggle.html` (15 KB). Ключевые ответы Игоря:
- Layout — split panel (B), отвергнуты A minimal centered и C dashboard;
- Accent — янтарный (light `#BA7517` / dark `#FAC775` в wireframe);
- Recent card — name + meta + path (monospace) + tags chips + description (italic, 3-line clamp);
- Browse в sidebar — Library / Primer pool / All projects standalone, Group projects disabled с badge `soon` (DEC-V2-29);
- Light + Dark обязательны через `data-theme` + CSS-vars + `!important` на критичных text/bg button-цветах.

### M-A spec writing 30.04.2026 — три closing-вопроса

- **Q1: Open .bodge / Import sequence в M-A?** A: Open работает для минимального ZIP; Save через Cmd/Ctrl+S; Import sequence disabled; drag-drop overlay visible с toast «coming in M-B»; Active Drive API не в M-A.
- **Q2: Что внутри пустого DAG?** A: серый канвас + центральный placeholder text «Empty project. Push containers from Importer (coming in M-B).»
- **Q3: Library / Primer pool / All projects при клике в M-A?** A: общий компонент `<UnderConstruction milestone="M-F" name="Primer pool" />` с back-button. Library = M-H, Primer pool = M-F, All projects = TBD. Group projects = disabled.

### Hotkey Infrastructure kickoff 30.04.2026 — три closing-вопроса

- **Q1: Какие категории SnapGene-хоткеев критичны?** A: Find/search + Selection + Edit + Annotation + View modes + Translation/ORF + File ops (7 из 8 категорий).
- **Q2: Customization?** A: System-fixed (как SnapGene и ApE).
- **Q3: Discoverability?** A: Tooltip на каждой кнопке («Save ⋅ ⌘S» как SnapGene). Без cheat-sheet popup `?`.

**M-A scope из kickoff'а:** infrastructure (registry + scope-resolver + `useHotkey` хук + `formatHotkey()`) + 6 базовых хоткеев (Cmd+N/O/S/W + Cmd+, + Esc).

---

## 1. Контекст

После 30.04.2026 проект вошёл в rewrite phase v0.6+. Архитектура зафиксирована в `docs/ARCHITECTURE_v2.md` (~100 KB) с 27 ⚓ DEC-V2-01..27 + DEC-DS-01 + ⚓ DEC-V2-28..30. Текущая v0.5.4-alpha (~284 коммита, 1090 тестов) feature-complete по итогам Sprint Catalog Polish FIX-2; **wipe data при переходе на v0.6** (DEC-V2-08).

Sprint M-A — **первый милстоун** roadmap v0.6 → v1.0 (ARCHITECTURE_v2 §7). Цель — два параллельных рабочих e2e сценария:
- **A. IndexedDB autosave:** New project → пустой DAG → close browser tab → reopen URL → проект в Recent → клик → восстановленный DAG.
- **B. .bodge explicit save:** New project → Cmd/Ctrl+S → Save As → close → Open .bodge → восстановленный проект.

Это два уровня persistence из DEC-V2-23. M-A — это **пустой контракт**: project entity, lifecycle, минимальный .bodge формат, navigation между фулскринами + **hotkey infrastructure фундамент**.

---

## 2. Стратегия

Стартовый экран по wireframe v7. Минимальный project shell: Zustand с тремя slices (project / canvas / ui), Dexie schema v1, App-level топбар + stack-навигация, минимальный .bodge ZIP I/O для пары New + Save + Open + Reopen, hotkey registry с 6 базовыми хоткеями. Browse entries — фулскрин-заглушки. DAG — placeholder. Multi-tab блокируется через `navigator.locks`. Theme через `data-theme` + persist localStorage.

**Принцип границы:** всё что после старта проекта (управление containers, операциями, библиотекой, primers) — OUT. Всё что до или вокруг старта — IN.

---

## 3. Scope

### IN

- **Persistence:** `db/dexie-schema.js`, `lib/storage.js`, `lib/file-system.js` (File System Access API + fallback), `lib/bodge-zip.js` (fflate ZIP I/O), `lib/multi-tab-lock.js` (navigator.locks).
- **Hotkey infrastructure:** `lib/hotkeys.js` (HOTKEYS map, useHotkey hook, single global keydown listener, scope-resolver, formatHotkey, platform detect). 6 хоткеев: `'new-project'` (Cmd+N) / `'open-bodge'` (Cmd+O) / `'save-bodge'` (Cmd+S, allowInInput) / `'close-project'` (Cmd+W) / `'open-settings'` (Cmd+,) / `'escape'` (context-aware: closes modal > popFullscreen > no-op).
- **Store rewrite:** удаление v0.5 store целиком, новые store/index.js + projectSlice.js + canvasSlice.js + uiSlice.js по shape из ARCHITECTURE_v2 §6.
- **App-level shell:** App.jsx (minimal layout-wiring, single global keydown listener), components/AppShell/{index,Topbar}.jsx.
- **Стартовый экран:** components/StartScreen/{index,RecentCard,SidebarLink}.jsx по wireframe v7 на DESIGN_SYSTEM tokens.
- **Заглушки фулскринов:** UnderConstruction.jsx, DagPlaceholder.jsx, SettingsModal.jsx.
- **Theme:** data-theme="light"|"dark", CSS-vars mapping (см. §4.7).
- **Lifecycle e2e сценарии:** A (IndexedDB autosave), B (.bodge save), C (multi-tab block), D (theme persist), E (Browse stubs), F (hotkeys end-to-end).

### OUT (явно отложено)

Полный Importer (M-B), drag-drop с auto-detect (M-B), Active Google Drive API (M-A.1+), Conflict detection (M-B), Stale handle UI banner (M-B), MoleculeContainer / ContainerCommit / ProjectCommit / Primer / Library / Primer Pool real data (M-B по M-H), DAG real view с @xyflow/react (M-B), Mix Workspace / Container Window / Importer фулскрины (M-C / M-D / M-E), Group projects (post-M-I), Cross-project import modal (M-B+), PWA install (M-A.1), все 42 v0.5 компонента, hooks, lib, расчётные модули — НЕ ТРОГАЮТСЯ. Backend Python — не трогается. Crash recovery toast UI (M-A.1). Полный набор хоткеев Find/Selection/Edit/Annotation/View/Translation (M-D/M-E). Cheat-sheet popup `?` — отвергнут. Customization хоткеев — отвергнуто. Кастомный Tooltip компонент (M-A.1+).

---

## 4. Архитектурные решения

После приёмки M-A копируются в DECISIONS.md как DEC-MA-NN (без ⚓).

1. `activeFullscreen` строкой, не enum.
2. `navStack: NavStackEntry[]` — `{ fullscreen, payload }`. Pop возвращает на предыдущий entry.
3. Стартовый экран рендерится без AppShell.
4. DAG в M-A — placeholder, не @xyflow/react.
5. Theme через `data-theme`, не CSS class или Tailwind dark:.
6. ZIP — fflate, не JSZip.
7. Локальные wireframe `--ss-*` маппятся на global DESIGN_SYSTEM tokens.
8. `id`-генератор — UUIDv7 через uuid package.
9. `agent` в localStorage, не Dexie.
10. `projects` Dexie table — сериализованный Project + lifecycle metadata одним record.
11. Multi-tab lock — named lock `bodge-project-${projectId}`.
12. `recentProjectIds` в localStorage.
13. Drag-drop — global event listener в App.jsx, NoOp + toast в M-A.
14. Settings — модальная заглушка, не фулскрин в M-A.
15. Hotkey registry — system-fixed (no rebind), scope-aware, single global listener.

---

## 4.7. CSS-vars mapping table

Wireframe v7 локальные `--ss-*` маппятся на global DESIGN_SYSTEM tokens.

| Wireframe | DESIGN_SYSTEM | Light | Dark |
|-----------|---------------|-------|------|
| `--ss-bg-primary` | `--surface-1` | `#ffffff` | `#171717` |
| `--ss-bg-secondary` | `--surface-base` | `#fafaf9` | `#0c0c0d` |
| `--ss-bg-tertiary` | `--surface-3` | `#e7e5e4` | `#2a2a28` |
| `--ss-text-primary` | `--text-primary` | `#1c1917` | `#f5f5f4` |
| `--ss-text-secondary` | `--text-secondary` | `#57534e` | `#a8a29e` |
| `--ss-text-tertiary` | `--text-tertiary` | `#78716c` | `#78716c` |
| `--ss-border-tertiary` | `--border-subtle` | `#e7e5e4` | `#2a2a28` |
| `--ss-border-secondary` | `--border-default` | `#d6d3d1` | `#3f3f3a` |
| `--ss-text-info` | `--info-fg` | `#1d4ed8` | `#93c5fd` |
| `--ss-accent-amber` | `--accent-500` | `#f59e0b` | `#d97706` |
| `--ss-accent-amber-bg` | `--accent-50` | `#fffbeb` | `#1c1306` |
| `--ss-accent-amber-text` | `--accent-text` | `#78350f` | `#fde68a` |

---

## 6. Задачи (краткая раскладка)

11 K-шагов жёстким порядком: K1 Dexie schema + storage → K2 store rewrite + Dexie wiring + v0.5 wipe → K3 file-system + bodge-zip + multi-tab-lock → **K4 hotkey infrastructure (kickoff add-on, retrofit)** → K5 App.jsx + AppShell + Topbar + theme apply + drag-drop overlay + global keydown listener → K6 StartScreen + RecentCard + SidebarLink + index.css → K7 UnderConstruction + DagPlaceholder + SettingsModal → K8 lifecycle e2e (autosave + crash recovery) → K9 .bodge round-trip → K10 multi-tab guard → K11 CSS-vars mapping + v0.5 cleanup + README.

Оценка: ~28-40 ч Code. Реальное время: ~12 коммитов в `feature/racetrack-canvas` (см. PROJECT_STATE journal 30.04.2026 третья сессия для полной цепочки).

---

## 7. STOP-условие

После commit K11 Code останавливается. НЕ обновляет PROJECT_STATE / DECISIONS / BUGS / TECH_DEBT — Chat в сессии приёмки.

---

## 9. Риски (исходные, для архео)

1. Dexie 4 + React 19 + Vite 8 несовместимость — не реализовался.
2. navigator.locks отсутствует в Safari < 15.4 — feature detect, fallback на read-only mode.
3. File System Access API отсутствует в Safari/Firefox — fallback на input + a download.
4. fflate overhead для очень маленьких ZIP — не материализовался.
5. Wireframe vs DESIGN_SYSTEM amber дрейф — DESIGN_SYSTEM выбран, приёмка PASS.
6. v0.5 wipe migration ломает ~200 тестов — реализовано: 1031 → 712 + 95 новых v0.6 = 726 → 739 после fix-2.
7. Cmd+W перехватывается браузером — known limitation, fallback через back button (см. TD-CMD-W-VIVALDI-LIMITATION).
8. Cmd+, конфликт с Firefox — не релевантен для Igor (Vivaldi).

---

## 10. Открытые вопросы (по итогам реализации закрыты)

1. **OQ-1 (amber accent):** закрыт — DESIGN_SYSTEM выбран, визуальная приёмка PASS.
2. **OQ-2 (toast в M-A):** закрыт — реализован минимальный inline `<ToastBar/>` в App.jsx (single toast, auto-dismiss 3.5s, no queue). Custom Toast с queue → M-A.1 (TD-TOAST-UI-MINIMAL).
3. **OQ-3 (Settings минималистичная):** закрыт — Display + Identity + Advanced (Reset = clear IndexedDB) реализованы. После M-A-fix-1 Display tab удалён, theme переехал в header (DEC-MA-01). Tabs = Identity + Advanced.
4. **OQ-4 (readOnlyForced хоткеи):** закрыт — `'save-bodge'` и `'close-project'` остаются активны.

---

_Спека написана 30 апреля 2026, после трёх дизайн-сессий. Реализована за один день несколькими циклами: M-A core 10 K-шагов → K4 retrofit hotkey → M-A-fix-1 UX → M-A-fix-2 ProjectInfoModal → runtime additions → tag suggestions. Архивирована со статус-штампом 30.04.2026 третьей сессией._
