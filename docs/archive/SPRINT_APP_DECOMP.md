# Sprint App-Decomp — ModalStack extract

**Статус:** ✅ РЕАЛИЗОВАНО 28.04.2026 (commits `301db04` K1 + `b155e03` K2, App.jsx 40.39 → 30.56 KB, ModalStack.jsx 7.91 KB + useAppEffects.js 4.35 KB, 978/978 Vitest, 1-pass visual acceptance).
**Тип:** refactor (декомпозиция App.jsx, технический долг TD-SIZE-APP)
**База:** v0.5.4-alpha, коммит `a34674e` (финал Sprint IS-Final, K5–K9)
**Предпосылка:** App.jsx 39.37 → 40.39 KB после Sprint IS-Final (+1.02 KB за wiring CatalogPanel → orchestrator) — первый случай выхода .jsx за hard 40 KB с момента введения лимитов 22.04.2026. Любая дальнейшая правка App.jsx по CLAUDE.md §7 требует декомпозицию первым шагом. Этот короткий рефакторинг возвращает App.jsx в soft-зону **без полного Sprint 2b** (DesignCanvas-декомпозиция остаётся отдельной задачей).

> Спека по `docs/_TEMPLATE_SPEC.md` v1.1. §0.5 опущен — kickoff-интервью не проводилось, задача чисто техническая (UX-выборов нет, рефакторинг без поведенческих изменений). Связанные файлы: `TECH_DEBT.md` (TD-SIZE-APP), `BUGS.md` (V43–V48 в Catalog Polish — будут писаться после этого спринта без size-gate).

---

## 0. Срез размеров затрагиваемых модулей

`list_directory_with_sizes` 28.04.2026.

| Файл | Размер | Лимит | Зона |
|------|--------|-------|------|
| `gui/designer/src/App.jsx` | **40.39 KB** | 40 KB | **HARD — задача спринта вернуть в soft** |
| `gui/designer/src/hooks/` | (директория) | — | новый файл `useAppEffects.js` опционально (K2) |
| `gui/designer/src/components/ModalStack.jsx` | **новый** | 40 KB | будет ~12–15 KB |

Цель: после K1 commit `App.jsx ≤ 32 KB` (soft, с люфтом ~8 KB до hard). Если K1 даёт <32 KB — K2 не выполняется.

---

## 1. Контекст

После Sprint IS-Final (28.04.2026, commits `5748521` + `a34674e`) App.jsx вырос на +1.02 KB и впервые с введения лимитов (⚓ DECISIONS.md 22.04.2026) перешёл за hard 40 KB. Это формальное превышение на 0.39 KB, но по CLAUDE.md §7 любая последующая спека, затрагивающая App.jsx, обязана делать декомпозицию первым пунктом — иначе Code останавливается. Sprint Catalog Polish K1 (V45 merge import + catalog buttons) затрагивает App.jsx. Без декомпозиции мы либо откладываем V45 в Sprint 2b, либо тратим скоуп Catalog Polish на extract — что нарушает single-purpose спринта.

Этот короткий refactor-спринт берёт **только** ModalStack extract: 14 modals JSX-блока + связанные store-selectors выносятся в `components/ModalStack.jsx`. Это самая безопасная и предсказуемая часть полного TD-SIZE-APP fix (полный план — также `hooks/useAppEffects.js` extract, оставлен в Sprint 2b). После этого спринта App.jsx ~30 KB, и Sprint Catalog Polish можно писать как чистый bugfix-пакет.

Полный Sprint 2b (App + DesignCanvas декомпозиция параллельно) остаётся в TECH_DEBT — здесь делается только то что разблокирует ближайший спринт.

---

## 2. Стратегия

Extract-only refactor: `{/* ═══ Modals ═══ */}` JSX-блок (строки ~`...` до конца `App()` перед `</DndProvider>`, ~140 строк) выносится в новый компонент `components/ModalStack.jsx`. ModalStack читает store напрямую через `useStore` для всех 14 trigger states (modalMode, showMutagenesis, replacingFragment и т.д.) — App.jsx больше не передаёт их через props. Из App.jsx в ModalStack передаются **только** handlers, которые либо локальны в App (составные handlers вроде `handleSaveFragment` из useFragmentHandlers + дополнительная логика), либо инкапсулируют доступ к local-state App (`updateActive`, `setActiveTab` для side-effects в onSave).

Поведение пиксель-в-пиксель идентично до-коммита. Ни один тест не должен переписываться — они тестируют сами модальные компоненты, а ModalStack только композирует их рендеринг.

K2 (useAppEffects extract) выполняется **только** если после K1 коммита App.jsx ≥ 32 KB. Если ≤ 32 — K2 пропускается, спринт закрывается одним коммитом.

---

## 3. Scope

### IN

- `gui/designer/src/components/ModalStack.jsx` — новый файл, ~12–15 KB. 14 modals JSX из App.jsx + relevant store selectors.
- `gui/designer/src/App.jsx` — удалить весь `{/* ═══ Modals ═══ */}` блок, заменить на одну строку `<ModalStack {...handlers} />`. Удалить store selectors, которые использовались **только** этими modals (см. §5 предположения о том, что часть из них также используется в основном render — те остаются).
- `__tests__/` — **0 новых тестов**. Это рефакторинг, поведение не меняется. Если у Code срабатывает тест на модалу — это regression, фиксить.

### OUT (явно отложено)

- **`hooks/useAppEffects.js` extract** — Sprint 2b (или K2 этой спеки **только при необходимости**, см. §6 K2 gate).
- **DesignCanvas.jsx декомпозиция** — Sprint 2b, отдельный поток.
- **Реструктуризация структуры handlers внутри useFragmentHandlers** — не трогаем.
- **Замена `useStore.getState().setX(null)` inline на actions** — не трогаем, оставляем как есть.
- **Любые поведенческие изменения** — не делаем; если что-то выглядит «странно как написано», это не повод править в этом спринте.

---

## 4. Архитектурные решения

1. **ModalStack читает store напрямую, не получает trigger states через props.** Альтернатива (App.jsx передаёт `modalMode`, `showMutagenesis`, ... 14 trigger states через props) — раздувает props ModalStack до 30+, и App.jsx от этого только частично облегчается. Прямое чтение из store — стандартный паттерн в проекте (PartsPalette, DesignCanvas — все читают свой кусок store сами).
2. **Handlers передаются через props.** Они часто составные (handler из hook + локальная логика App): `handleSaveFragment`, `handleSaveAsVariant`, `handleCreateMutagenesisAssembly`, `addFragment`, `addCustomFragment`, `handleFragmentSplit`, `handleSwapVariant`, `handleMutagenesis`. Их можно было бы тоже вынести в hooks, но это уже рефакторинг handlers, не размеров — отдельная история.
3. **`onClose` callbacks остаются inline.** Они короткие (1–3 строки), легко читаются, и часто содержат сложение state-сбросов: `() => { setShowPartsLib(false); useStore.getState().setPartsLibPartId(null); }`. Выносить их в named functions — overengineering.
4. **K2 (useAppEffects) — условный.** Если K1 даёт App.jsx ≤ 32 KB, K2 не нужен. Это снимает риск переусложнить рефакторинг. Если K1 даёт 32–34 KB — K2 опционально, по решению Code (commit message указывает что выбрано). Если K1 даёт >34 KB — K2 обязателен.
5. **Никаких поведенческих правок.** Любая инициатива «заодно поправить» отклоняется. Если Code видит что-то странное — записывает в Report как наблюдение, не трогает.

---

## 5. Предположения

1. **Все 14 modals trigger states читаются `useStore(s => s.X)` синтаксисом, не через прямой `getState()`.** Источник: head App.jsx до строки ~115. Проверено: да (см. `read_text_file` 28.04.2026 head 120).
2. **Часть store selectors из App.jsx (например `parts`, `fragments`, `circular`) используется как в основном render-блоке, так и в modals.** Эти selectors в App.jsx **остаются** — App.jsx продолжает их читать для main render. ModalStack читает свою копию из useStore (Zustand cheap-чтение, нет penalty). Не пытаемся «оптимизировать» через context provider — ML-overengineering.
3. **`onColorChange` в FragmentEditor (editTarget) использует `updateActive` + `fragments` (locals из App-render-блока).** Источник: tail App.jsx. Это **не** проблема для extract — `updateActive` приходит в ModalStack как prop, `fragments` ModalStack читает из useStore сам. Проверено: да.
4. **`globalCDSPart` second instance FragmentEditor использует похожий паттерн** через `updateActive` + `updatePart`. Аналогично — props.
5. **`showOligos` overlay (последний в списке modals) — нестандартный** (не отдельный компонент с modal-обёрткой, а inline `<div className="fixed inset-0 ...">` обёртка вокруг `OligoManager`). Code переносит как есть, не оборачивает в общий MoadalShell.
6. **Тесты в `__tests__/` не импортируют App.jsx напрямую с reach-in на modals.** Источник: предположение по архитектуре проекта (тесты модальных компонентов рендерят сами компоненты с mocked store). Проверено: **нет**. **Действие:** K1 первым подшагом — `grep -rn "from.*App'" gui/designer/src/__tests__/`. Если App.jsx импортируется в тестах с access to internal modals — Code останавливается, фиксирует место в Report.

---

## 6. Задачи

### K1 — ModalStack extract

**Файлы:**
- `gui/designer/src/components/ModalStack.jsx` (новый, ~12–15 KB ожидание).
- `gui/designer/src/App.jsx` (удаление блока modals + relevant selectors).

**Что делаем:** вынести JSX `{/* ═══ Modals ═══ */}` блок и связанные `useStore` selectors в новый компонент. App.jsx остаётся root-layout + main render + side-effects.

**Шаги:**

1. **Pre-flight grep:** `grep -rn "from.*App'" gui/designer/src/__tests__/`. Если App.jsx импортируется в тестах — зафиксировать в Report. Если результат пустой — продолжаем.
2. **Создать `components/ModalStack.jsx`:**
   - Default-export функциональный компонент. Props (handlers только; trigger states ModalStack читает сам):
     ```
     export default function ModalStack({
       addFragment,
       addCustomFragment,
       handleMutagenesis,
       handleSwapVariant,
       handleFragmentSplit,
       handleSaveFragment,
       handleSaveAsVariant,
       handleCreateMutagenesisAssembly,
       updateActive,
       updatePart,
       incrementInventoryVersion,
       setEditTarget,
       setSplitTarget,
       setActiveTab,
       circular,
     })
     ```
     Точный список — Code сверяет с current usage (см. §5 предположения 3–4).
   - Внутри: 14 trigger states через `useStore(s => s.X)`. Базовые selectors (`fragments`, `parts`) — также из useStore.
   - Возвращает `<>...</>` фрагмент с 14 conditional-rendered modals (порядок сохраняется как в текущем App.jsx).
3. **Перенести JSX:** скопировать `{/* ═══ Modals ═══ */}` блок включая `showOligos` overlay в return ModalStack. Заменить inline `useStore.getState().setX(...)` calls в onClose callbacks остаются как есть (см. §4 решение 3).
4. **Чистить App.jsx:**
   - Удалить `{/* ═══ Modals ═══ */}` блок целиком (последние ~140 строк перед `</DndProvider>`).
   - Заменить на одну строку: `<ModalStack {...{handlers}} />`.
   - Удалить store selectors, использованные **только** этими modals (например `replacingFragment`, `tagFusionTarget`, `splitTarget`, `editTarget`, `versionTreePartId`, `wizardPresetMode`, `viewerPart`, `wizardPlasmid`, `globalCDSPart`, `showPartsLib`, `partsLibPartId`, `mutagenesisInitialPlasmid`, `showMutagenesis`, `mutagenesisTarget`, `showOligos`, `showDataMgr`, `modalMode`, `importStartOpen`, `importStartFiles`, `importStartCatalogMode`). Точный список — Code определяет grep'ом по rest of App.jsx; если selector используется где-то ещё в App, оставить.
   - Удалить imports компонентов модалок: `AddFragmentModal`, `MutagenesisWizard`, `ReplacePicker`, `TagFusionPicker`, `FragmentSplitter`, `FragmentEditor`, `PartsLibrary`, `PlasmidViewer`, `PlasmidUseWizard`, `ImportStartScreen`, `PlasmidVersionTree`, `OligoManager`, `DataManager` (13 компонентов; они переезжают в ModalStack).
5. **Импорт ModalStack:** `import ModalStack from './components/ModalStack';` в App.jsx.
6. **Post-edit size check:** `wc -c gui/designer/src/App.jsx`. Зафиксировать в Report. **Acceptance:** App.jsx ≤ 32 KB → K2 не нужен. App.jsx 32–34 KB → K2 опционален (Code сам). App.jsx > 34 KB → K2 обязателен.

**Тесты:**
- `cd gui/designer && npx vitest run` — все 978 тестов **должны** пройти как было. Любой FAIL — regression, фиксить.
- `npx vite build` — clean.
- **Не добавляем новые тесты.** Это refactor, поведение не меняется.

**Коммит:** `refactor(app): extract ModalStack — 14 modals → ModalStack.jsx (App.jsx X KB → Y KB)`.

---

### K2 — useAppEffects extract (условный)

**Условие выполнения:** `App.jsx > 34 KB` после K1 (обязателен), либо 32–34 KB и Code решает делать (опционален).

**Файлы:**
- `gui/designer/src/hooks/useAppEffects.js` (новый, ожидание ~3–5 KB).
- `gui/designer/src/App.jsx` (удаление useEffect блоков).

**Что делаем:** вынести useEffect блоки из App.jsx (keydown handler, autoDesignGGOverhangs trigger, fetchParts initial, autoAnnotate triggers и т.п.) в кастомный hook.

**Шаги:**

1. Identify useEffect'ов для extract — все top-level `useEffect(() => { ... }, [...])` в `App()`. Те что зависят от local-state App (через render-цикл) — оставить; те что только slаt-side-effects (через store) — вынести.
2. Создать `hooks/useAppEffects.js`:
   ```
   export function useAppEffects() {
     // useEffect(...)
     // useEffect(...)
     // ...
   }
   ```
   Hook не возвращает значения, только запускает effects.
3. App.jsx: вызвать `useAppEffects()` в начале `App()` функции.
4. Удалить вынесенные useEffect блоки.

**Тесты:** аналогично K1 — все existing pass, без новых.

**Коммит:** `refactor(app): extract useAppEffects hook (App.jsx X KB → Y KB)`.

---

## 7. Порядок и оценка

K1 (обязательно) → K2 (условно). K2 после K1 **только** если K1 не закрыл App.jsx ≤ 34 KB.

**Оценка времени Code:**
- K1 один: ~1.5–2 ч (включая sanity тесты + build).
- K1 + K2: ~3 ч.

Если K1 даёт результат ≤ 32 KB (вероятно — оценка ~30 KB), спринт закрывается одним коммитом за ~2 ч.

---

## 8. STOP-условие и формат отчёта

### STOP

После K1 commit (либо K2 commit если выполнялся):

- **App.jsx ≤ 32 KB** → STOP. Code не делает K2. Спринт закрыт.
- **App.jsx 32–34 KB** → Code решает: либо K2 commit, либо STOP с объяснением в Report.
- **App.jsx > 34 KB** → Code обязан делать K2. Если после K2 всё ещё > 34 KB — STOP, в Report «дальнейшая декомпозиция требует Sprint 2b» (это не FAIL, это сигнал что extract-only недостаточно).

В любом случае Code:
- НЕ обновляет PROJECT_STATE.md / DECISIONS.md / BUGS.md / TECH_DEBT.md.
- НЕ перемещает спеки в `docs/archive/`.
- НЕ начинает Sprint Catalog Polish.

### Формат отчёта

Code дописывает в конец `CURRENT_TASK.md` блок:

```
## Отчёт Code по Sprint App-Decomp

- K1 коммит: `<hash>` — <commit message>
- K2 коммит: `<hash>` (если был) — <commit message>
- Изменения размеров:
  - App.jsx — 40.39 KB → X KB (ΔY KB; hard 40 — OK/WARN/FAIL)
  - ModalStack.jsx (новый) — Z KB
  - useAppEffects.js (новый, если K2) — W KB
- Vitest: 978/978 (baseline 978; ожидание 978/978 без новых тестов)
- pytest: 112/112 (не трогалось)
- vite build: clean | warnings: <...> | errors: <...>
- Отклонения от спеки (§3 / §4 / §6): <явный список или «нет»>
- Pre-flight grep результат (§6 K1 шаг 1): <пусто или список мест>
- Selectors удалённые из App.jsx: <список из §6 K1 шаг 4>
- Selectors оставленные в App.jsx (использованы где-то ещё): <список>
- Решение по K2 (если 32–34 KB): сделан / не сделан + почему
- Size budget: OK | нарушители <...>
```

---

## 9. Риски

1. **Selector используется и в modals и в main render.** Code удаляет его из App.jsx, тесты падают. **Митигация:** §6 K1 шаг 4 явно указывает grep по rest of App.jsx перед удалением каждого selector. Если selector найден — оставить.
2. **Handlers передаются через props в ModalStack — список props длинный (~15).** **Митигация:** §4 решение 2 — это допустимо. Альтернатива (вынос всех handlers в hooks) — отдельный рефакторинг, не размер.
3. **`onColorChange` в FragmentEditor (editTarget) использует locals.** **Митигация:** §5 предположение 3 — `updateActive` приходит prop'ом, `fragments` ModalStack читает сам. Проверено в head App.jsx.
4. **`showOligos` overlay не стандартная модалка.** **Митигация:** §5 предположение 5 — переносим как есть, не нормализуем.
5. **Тесты ссылаются на App.jsx с reach-in.** **Митигация:** §6 K1 шаг 1 — pre-flight grep.
6. **App.jsx после K1 ≥ 34 KB.** **Митигация:** §6 K2 условный — Code делает useAppEffects extract без новой спеки.

---

## 10. Открытые вопросы

1. **Точная граница trigger states «modal-only» vs «shared».** Я (Chat) не делал полный grep, опираюсь на head App.jsx + tail App.jsx. Code по факту определяет границу при K1 шаге 4 (grep selectors по rest of App.jsx). Если граница неожиданная (например, `editTarget` используется ещё где-то в main render — что я не вижу) — Code фиксирует в Report.
2. **Имя файла `ModalStack.jsx`.** Альтернативы: `Modals.jsx`, `RootModals.jsx`, `ModalContainer.jsx`. Решено: `ModalStack.jsx` по терминологии TECH_DEBT TD-SIZE-APP. Если у Code другая интуиция — допустимо переименовать с явным rationale в Report.
3. **Нужно ли export non-default дополнительно?** ModalStack — single component, `export default` достаточно. Если Code увидит резон делать `export function ModalStack` (например для тестов) — оставить single source of truth, выбрать одно из.

---

_Спринт-отдельный refactor. Не путать с Sprint 2b (полная декомпозиция App + DesignCanvas) — здесь делается минимум для разблокировки Catalog Polish. После приёмки спека → `docs/archive/` со штампом ✅ РЕАЛИЗОВАНО._
