# Архив — отчёт Code по V96 (вынесен из CURRENT_TASK.md 22.05.2026)

V96 реализован Code 22.05.2026, ждёт визуальной приёмки (вместе с остальным bug-batch'ем 22.05 — см. `CURRENT_TASK.md`). Отчёт сохранён здесь при переписывании `CURRENT_TASK.md` под новый хендофф.

---

## 🔧 Отчёт Code — V96 Overlay-геометрия (22.05.2026)

**Спека:** `docs/SPEC_V96_OVERLAY_GEOMETRY.md` (тип C). **Баг:** V96 в `BUGS.md`. Спека не редактировалась.

**Реализация (по разделу 7 спеки):**
- `index.jsx` — `const [layoutEpoch, setLayoutEpoch] = useState(0)` + `useLayoutEffect(() => setLayoutEpoch((e) => e + 1), [linesJsx])` сразу за мемо `linesJsx` (до early-return `!fullSeq`). `layoutEpoch={layoutEpoch}` проброшен в 5 overlay'ев: SegmentZones / OutOfRangeMask / Selection / SearchHits / Caret. `OriginMarkerOverlay` НЕ тронут (вне scope — спека перечисляет ровно 5).
- 5 overlay-файлов — приняли prop `layoutEpoch = 0` (default обязателен, back-compat) + добавили его в массив deps своего `useLayoutEffect`. Больше ничего. rAF-retry в `SegmentZonesOverlay` оставлен как есть (раздел 4 OUT).
- **Подход = спека, не bullet `BUGS.md`:** единый счётчик `layoutEpoch` от `linesJsx` вместо перечисления `tracksReady`/`measured` в каждом overlay (раздел 3 спеки). Loop-safe: `linesJsx` не зависит от `layoutEpoch`.

**Тесты (TDD red → green), 2 новых файла:**
- `__tests__/overlay-layout-epoch-v96.test.jsx` — 5 per-overlay unit. Mount overlay на geometry A → мутировать `offsetTop` + bump `layoutEpoch` → rect пересчитался на geometry B. Гео-стаб `offsetTop/Left/Height` на прототипе (паттерн `wrap-bridge-caret.test`). `hits`/`zones` вынесены в стабильные module-const, чтобы единственный меняющийся dep был `layoutEpoch` (иначе fresh array-literal сам триггерит effect и тест не гейтит фикс — поймано на red-прогоне).
- `__tests__/sequence-view-layout-epoch-v96.test.jsx` — 1 integration. Mock `SelectionOverlay` → проверка, что `index.jsx` пробрасывает числовой `layoutEpoch` и инкрементирует его при смене `linesJsx` (смена `fullSeq`). Без фикса → prop `undefined` → NaN → red.
- Red-прогон: 6/6 падали (после правки стабильных ref). Green-прогон: **6/6 pass**.

**Прогон (раздел 5 спеки):**
- Полный Vitest: **3923 pass / 18 skipped / 0 fail** (399 файлов pass / 1 skipped). 6 новых тестов включены; 18 skipped — pre-existing (V96 не добавил ни одного skip). Существующие overlay-тесты (`out-of-range-mask-v87`, `search-hits-overlay`, `wrap-bridge-caret`) зелёные — `layoutEpoch` опционален (default 0).
- `npx vite build` — clean (`✓ built`, PWA сгенерирован). Только pre-existing warnings (chunk >500 KB, INEFFECTIVE_DYNAMIC_IMPORT `DagWorkspace`).
- size budget: `index.jsx` +26 строк (был 44.65 KB, > hard 40 KB — но это bugfix +6 строк нетто логики, декомпозиция остаётся в TECH_DEBT, раздел 0 спеки). Overlay'и +2–6 строк. OK.

**Изменённые файлы:** `index.jsx` (+26), `SelectionOverlay`/`OutOfRangeMask`/`SearchHits`/`Caret` (prop + dep), `SegmentZonesOverlay` (prop + dep — файл был `M` в working tree ДО сессии: pre-existing uncommitted rAF-retry правка, моя V96-доля = 2 строки) + 2 новых тест-файла.

**Коммит:** не делал (по инструкции — реализация + отчёт + STOP). База HEAD `7a25375`, изменения в working tree, branch `feature/m-x-7a-library-structure-v2`.

**Визуальная приёмка (биолог):** открыть любой sequence-viewer ВПЕРВЫЕ (range picker «Выбор фрагмента» / container editor) → оранжевый highlight выделения и OOR-маска должны сидеть ровно по финальным строкам СРАЗУ, без клика. До фикса — «съехавший / половинной высоты» до первого клика по канвасу.

**STOP:** жду визуальной приёмки. `PROJECT_STATE` / `BUGS` / `DECISIONS` НЕ финализировал — V96 → FIXED отдельной Chat-сессией после приёмки (раздел 7 спеки).
