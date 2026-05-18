> **[ARCHIVED 2026-05-16 — D1 disposition]** Реализована через V71-V76 rework
> (см. RELEASES / BUGS_HISTORY блоки 15.05.2026). Use case: **isolated PCR**.
> Assembly workflow — отдельная парадигма: см.
> `docs/SPRINT_M-CANVAS-ASSEMBLY-MODEL.md` (A1),
> `docs/SPRINT_M-CANVAS-ASSEMBLY-CONSTRUCT.md` (A2),
> `docs/SPRINT_M-CANVAS-ASSEMBLY-PRIMER-DESIGN.md` (A3),
> `docs/SPRINT_M-CANVAS-ASSEMBLY-REALISE.md` (A4). Содержимое сохранено как история.

# SPRINT M-CANVAS-PCR — PCR Operation Mode (F3)

**Дата спеки:** 15.05.2026 (написана в batch с F1/F2/F4 без acceptance gate между — см. R-DRIFT).
**Тип:** A (на верхней границе по объёму, ~30-35 KB).
**Target размер спеки:** ~30 KB.
**Источник:** `docs/NOTES_CANVAS_V2_KICKOFF.md` §9.5 F3 + §9.3 walkthrough PCR + §9.9.1 уточнение #11 (confirmation gate перед заказом олигов).
**Цепочка:** F1 → F2 → **F3 этот sprint** → F4 Live Product Preview.
**Статус:** черновик Chat 15.05.2026, batch с F1+F2.
**Зависимости в коде:** требует реализованных F1 (tab system / mini-canvas) + F2 (junction contract / reactive selectors / popover).

---

## 0. Срез размеров

| Файл | Сейчас | Статус | Действие |
|---|---|---|---|
| `editor/ContainerEditorSkeleton.jsx` | 33.95 KB (после F1 trim — ~30 KB) | Watch | +3-5 KB (operation-aware mode wiring через context). Если выйдет за hard 40 — декомпозиция в operation-mode sub-components. |
| `canvas/OperationNode.jsx` | 7.65 KB | OK | +3-4 KB (template dropdown + hover-icons hybrid). |
| `canvas/ContainerBlock.jsx` | 10.17 KB | OK | +1.5-2 KB (hover-revealed op-icons sub-paradigma). |
| `store/skeleton-state-operations.js` | 7.78 KB | OK | +2-3 KB (PCR-specific params validation + primer derive trigger). |
| `lib/bio/` | существует после R5-R9 | OK | возможно +1-2 helper'а если K1 разведка выявит gap'ы. |

Новые файлы:
- `editor/operation-modes/PcrModeShell.jsx` ~6-8 KB
- `editor/operation-modes/PrimerDragHandles.jsx` ~4-6 KB
- `editor/operation-modes/PrimerSuggestionsPanel.jsx` ~4-6 KB
- `editor/operation-modes/PrimerReusePicker.jsx` ~3-4 KB
- `editor/operation-modes/OrderOligosConfirmGate.jsx` ~3-4 KB
- `canvas/OpRhombusTemplatePicker.jsx` ~3 KB
- `canvas/HoverOpIconRow.jsx` ~2.5-3 KB
- `lib/operation-pcr-bridge.js` ~3-5 KB (адаптер `local-primer-design.js` API → skeleton state)
- `store/selectors-pcr.js` ~3-5 KB (selectors для PCR-mode editor)

**Всё под soft limit.** Декомпозиция operation-modes в подпапку `editor/operation-modes/` — естественная (Mutagenesis / Restriction / Gibson modes пойдут туда же в следующих sprint'ах).

---

## 1. Контекст и связи перед действием (§17 R4)

### Главная идея walkthrough §9.3

Биолог двойным кликом на op-ромб (kind='pcr') → телепорт в editor (F1) → tab открывается в **PCR-mode**: SequenceView template + правая панель PrimerSuggestionsPanel + drag handles на selection range + footer ConfirmOrderOligos gate. Биолог может править primers (3 уровня UX), потом «Заказать» — explicit confirm. После confirm → op.status: committed → executed (когда биолог реально получит олиги, это вне Spec 3).

### Где задача сядет (existing → new)

- `canvas/OperationNode.jsx` — ромб теперь имеет два модa entry: (a) click ромб → dropdown «Выбрать template» (если op.inputs пуст); (b) hover на ContainerBlock → quick op-icons row (PCR / Gibson / Cut / Mutagenesis / Ligate) → click на иконку создаёт op с этим template.
- `canvas/ContainerBlock.jsx` — добавляет hover-state с quick op-icons row.
- `editor/EditorWindowShell.jsx` (F1) — двойной клик на op-ромб → open editor tab специального вида (не container, а **operation tab**). Tab.kind = 'operation', tab.operationId.
- `editor/ContainerEditorSkeleton.jsx` — если tab.kind === 'operation' → mount `PcrModeShell` вместо обычного container-view. Operation-mode shell мounts SequenceView с template's container + правую панель.
- `editor/operation-modes/PcrModeShell.jsx` — orchestrator. SequenceView + PrimerSuggestionsPanel + footer. Селектируется текущая op через `state.operations.find`.
- `local-primer-design.js` (v0.5, 20 KB) — **reuse как есть** через `lib/operation-pcr-bridge.js` адаптер.
- `lib/bio/` (R5-R9) — `gibson-primer-design`, `sanger-primer`, etc. **Reuse** для PCR с overhangs (Gibson tail) — это уже есть.
- F2 selectors `selectTailsForJunction` — adjacent junction'ы дают tails, PrimerSuggestionsPanel передаёт их в `designPrimers` через bridge.

### Что НЕ задеваем (важно для scope creep)

- v0.5 `JunctionBlock.jsx` 29 KB / `JunctionDNA.jsx` 14 KB — **не интегрируем** UI как есть. F2 junction popover уже сделан с reactive selectors; primer cascade через F2 selectors, не через v0.5 UI.
- v0.5 `PlasmidUseWizard.jsx` 39 KB — **harvest только** fragment-selection paradigma (drag handles на 5'-конце selection). Не mount'им wizard в operation-mode.
- v0.5 `MutagenesisWizard.jsx` 18 KB — **OUT.** Mutagenesis-op = отдельный sprint после F4.
- Container.ends data field — Spec 3 PCR op при execute может писать в output container ends (добавляются tail-derived overhangs). Это handled через op.outputs в F4.

### Дубли check (§17 R1)

- Operation tab — расширение F1 tab shape (`tab.kind = 'container' | 'operation'`), не новая сущность.
- PcrModeShell — новый компонент в новой подпапке `operation-modes/`; Mutagenesis / Restriction modes пойдут туда же — это subdir, не плодение разрозненных файлов.
- PrimerSuggestionsPanel — нет аналога в текущем skeleton. v0.5 PrimerPanel 9 KB — **harvest helper** через K1 discovery (если pattern переносим), сам файл не reuse'м (legacy store-coupled).
- OrderOligosConfirmGate — новый, реализует confirmation gate (§9.9.1 #11). Нет аналога в skeleton.

### Запрещённые слова §17 R3 — обоснования

- «**Новый компонент** PcrModeShell»: operation-mode renders **внутри** F1 tab (full-screen viewer); это не отдельное окно/workspace. Тоже самое для других mode shells (Mutagenesis / Restriction / etc.) — каждый = subcontent одного и того же tab.
- «**Новый popover** OpRhombusTemplatePicker»: расширяет existing OpKindPicker (использует existing pattern). Если можно inline в `OperationNode.jsx` — реализатор inline'ит.
- «**Новая модалка** OrderOligosConfirmGate»: explicit confirmation gate — это **функциональное требование** §9.9.1 уточнение #11 («явный confirmation gate для критичных действий»). Без модалки замены нет.

---

## 2. Стратегия

PCR-op получает специальный mode в F1 editor: двойной клик на op-ромб → tab.kind='operation'. PcrModeShell оркестрирует SequenceView template + правый PrimerSuggestionsPanel + footer order gate. Primer-suggestion идёт через **bridge** `lib/operation-pcr-bridge.js`, который адаптирует существующий `local-primer-design.js` API к skeleton-state shape. Junction tails вытягиваются через F2 selectors `selectTailsForJunction`.

3 уровня UX (дефолт / tweak / pro) реализованы через `state.editor.pcrModeUserLevel` (persisted preference) — биолог сам переключает.

Confirmation gate перед заказом олигов — обязательная модалка, показывает все pairs primer с источниками (тагом «from-junction-X» / «manual edit» / «reused from pool»). Биолог явно ставит галочки и нажимает «Заказать». После confirm → op.status meta=`orderConfirmedAt`. Реальное «получил олиги в лаборатории» = промоут в op.status='executed' — это вне Spec 3, кнопка в footer'е следующего sprint'а.

K1 — harvest discovery. Code прочитывает v0.5 файлы (`JunctionBlock`, `JunctionDNA`, `local-primer-design`, `PlasmidUseWizard`, `PrimerPanel`, `OligoManager`) и пишет **cherry-pick map** комментариями в `lib/operation-pcr-bridge.js` head. Это снимает с спеки бремя описывать v0.5 детально — Code сам ориентируется в legacy.

---

## 3. Scope IN / OUT

### IN

- Tab.kind extension: 'container' | 'operation'. Backward-compat default 'container'.
- `OPEN_EDITOR_OP_TAB(operationId)` action. `EditorTabStrip` рендерит operation tabs с другим icon (🔬 PCR / ✂️ Cut / ... — но только PCR в Spec 3, остальные модов в OUT).
- Tab breadcrumb для operation: `🔬 PCR · <input1.name> [+ <input2.name>] → <output_preview.name>` (output_preview = computed F4 если он реализован, иначе «product»).
- PcrModeShell + 3 уровня UX (default / tweak / pro) через `state.editor.pcrModeUserLevel`.
- PrimerSuggestionsPanel: rendering pairs (forward + reverse) + Tm + source tag + actions (edit / reuse / remove).
- PrimerDragHandles: drag на 5'-конце selection range в SequenceView. Прозрачные handle'ы поверх caret overlay.
- Tm пересчёт live на drag. Tm display в popup рядом с handle.
- PrimerReusePicker: dropdown реестра primer pool (state.primers; если пуст — pool из всех projects). Filter по similarity (length match ±5 nt, Tm match ±5°C).
- OrderOligosConfirmGate: модалка, чек-боксы на каждой паре, finalize → mutation `op.params.orderConfirmedAt` + push в primer pool как ordered.
- Op-rhombus state на canvas: dropdown template (если inputs пусты) + hover-icons на container (hybrid вход).
- Tests: 3 уровня UX переключаются, primer suggest при load template, drag handle меняет Tm, reuse picker рендерит pool, confirm gate требует чек-боксы.

### OUT

- Mutagenesis op mode — отдельный sprint после F4.
- Restriction op mode — отдельный sprint после F4.
- Gibson assembly op mode (multi-input) — отдельный sprint. PCR-op в Spec 3 — single-input single-output (PCR-amplification).
- Cut op mode (RE digest) — отдельный sprint. PCR с overhangs (Gibson tail) — это PCR-op с modified params, не cut.
- Primer ordering integration с external API (IDT / etc.) — confirm gate просто меняет status, реальная отправка вне Spec 3.
- Primer pool data layer (`state.primers` shape) — assumes уже существует в skeleton после R5-R9. Если K1 discovery вскроет gap — поправка в скоупе.
- Visual quality scoring of primers (GC%, hairpin, dimer) — beyond Tm/length basic checks. Если уже есть в `local-primer-design.js` — exposed через bridge; если нет — TECH_DEBT.

---

## 4. Архитектурные решения

### DEC-CANVAS-PCR-01 — Operation tab shape

`editorContext.tabs[i]` расширяется: `{id, kind: 'container'|'operation', containerId?, operationId?, openedAt}`. Tab.kind='container' (default) — open container; tab.kind='operation' — open operation in mode shell.

При close operation tab — pending op params discarded (как pending edits в container).

### DEC-CANVAS-PCR-02 — Operation tab открывается двойным кликом на op-ромб

`canvas/OperationNode.jsx` — onDoubleClick → `actions.openEditorOpTab(operationId)`. Single click — existing op selection (highlights inputs, opens OpKindPicker если op.kind===null).

### DEC-CANVAS-PCR-03 — Op-rhombus hybrid entry (§9.2 решение #5)

Два паттерна создания op:
1. **Из палитры** — existing «+ Операция» button (FIX V59 14.05) → ромб появляется → click → OpKindPicker (template via dropdown if op.inputs empty).
2. **Hover на ContainerBlock** — hover-revealed row иконок (PCR / Gibson / Cut / Mutagenesis / Ligate) → click → создаёт op с этим kind и inputs=[hovered_container].

В Spec 3 только PCR icon в hover row живой; остальные иконки видны как disabled с tooltip «следующий sprint».

### DEC-CANVAS-PCR-04 — 3 уровня UX через editor preference

`state.pcrModeUserLevel: 'default' | 'tweak' | 'pro'` — топ-уровневое поле в editor sub-reducer (рядом с существующими editorOpen, editorContext, pendingEditsByContainer, selectionByTab, sequenceViewModeByTab). Persisted через debouncedSaver.

**Путь `state.editor.*` НЕ подходит** — в skeleton state нет среды `state.editor` (editor-related поля живут на root). Single new top-level field `state.pcrModeUserLevel` (default 'default') + `SET_PCR_MODE_USER_LEVEL { level }` action.

- **default:** SequenceView с auto-selected primer range, PrimerSuggestionsPanel показывает auto-designed pair, биолог только смотрит и подтверждает. Drag handles скрыты.
- **tweak:** + drag handles на 5'-концах selection (live Tm rebalance). + edit-icon на каждой primer pair для inline edit.
- **pro:** + всё из tweak. + reuse picker всегда открытый сверху. + advanced params (anneal Tm target, dimer check, GC% override).

Toggle UI: 3-button strip в header pcr-mode «Default / Tweak / Pro».

### DEC-CANVAS-PCR-05 — Primer suggest reactive cascade

PrimerSuggestionsPanel mount → 
1. Чтение junction'ов через F2 selectors `selectTailsForJunction(junctionId)` для каждой incident junction op.inputs[0].
2. Вызов `lib/operation-pcr-bridge::suggestPrimers(template, tails, params)`.
3. Bridge внутри вызывает existing `local-primer-design.js::designPrimersLocal()` с адаптацией shape.
4. Result rendered в panel.
5. На любое изменение junction params (F2 reactive cascade) или selection range — recompute.

Tm calculation использует existing `tm-calculator.js` SantaLucia 1998 NN.

### DEC-CANVAS-PCR-06 — Drag handles 5'-end behaviour

Drag handle = transparent rect over caret in SequenceView с draggable cursor. Onmousedown → start drag. Onmousemove → updates selection.start или selection.end depending on side. Onmouseup → commit selection → recompute primer pair.

Live preview: floating tooltip near handle с current Tm + primer length («18 nt · Tm 58.3°C»).

Constraints (default level): 15 ≤ length ≤ 35 nt. В pro mode — 8 ≤ length ≤ 60 nt без soft warning.

### DEC-CANVAS-PCR-07 — Primer reuse pool

`state.primers` array (assumes existence в skeleton после R5-R9; K1 discovery подтверждает). Если в skeleton нет primer pool — K1 discovery flags + поправка в скоупе с создания минимального primer pool data layer.

PrimerReusePicker dropdown: filter primers by similarity to current suggestion (`length` ±5, `Tm` ±5°C, optional name regex). Click на existing primer → replaces current suggestion + sets `source: 'reused', primerId`.

### DEC-CANVAS-PCR-08 — Confirmation gate перед заказом олигов

OrderOligosConfirmGate — модалка (этим словом «модалка» оправдано §17 R3 функциональным требованием §9.9.1 уточнение #11). Показывает:

- Список primer pairs с tag (source: 'auto' | 'edited' | 'reused' | 'junction-derived').
- На каждой паре чекбокс «Подтверждаю эту пару» (default unchecked).
- На каждой паре mini-display: sequence, length, Tm, GC%, primer name (auto-generated `<op.kind>-<i>-<f|r>`).
- Footer summary: «N pairs to order, total cost ~$<X>» (cost via existing pricing table если есть; иначе hide cost).
- Button «Заказать» disabled до все чекбоксы поставлены.
- Cancel button «Отмена».

На «Заказать» → action `OP_CONFIRM_ORDER { operationId, orderedAt }`. Меняет op.params.orderConfirmedAt + flag в primer pool на каждой паре `status: 'ordered'`.

### DEC-CANVAS-PCR-09 — Operation-mode shell как replaceable за tab.kind

`ContainerEditorSkeleton.jsx`:

```
if (tab.kind === 'operation') {
  const op = state.operations.find(o => o.id === tab.operationId);
  if (op?.kind === 'pcr') return <PcrModeShell op={op} />;
  // future: mutagenesis / restriction / gibson / cut
  return <UnsupportedOpModeStub op={op} />;
}
return <ContainerView ... />; // existing
```

Future op-mode shells добавляются как новые case'и без переписывания editor'а.

### DEC-CANVAS-PCR-10 — Breadcrumb format для operation tab

`🔬 PCR · pET28a` (если только input) или `🔬 PCR · pET28a → amplicon_42` (если F4 уже даёт preview output name). F4 ⇆ F3 cross-spec interaction:

- F1 §3 Scope IN фиксирует breadcrumb format `📦 <container.name>` + 🔒 frozen badge для tab.kind='container'.
- F3 расширяет F1 breadcrumb через **opt-in** в `EditorTabStrip` на основе tab.kind. Если tab.kind='operation' — берёт format `<icon> <op.kind name> · <inputs joined>`. Без F4 — output_preview часть скрыта.

---

## 5. Файлы и сигнатуры

### Новые файлы

**`editor/operation-modes/PcrModeShell.jsx`** (~6-8 KB)

`PcrModeShell({ op })`. Layout:
```
PcrModeShell
├── PcrModeHeader (level switcher Default/Tweak/Pro)
├── flex row
│   ├── SequenceView (op.inputs[0] template, with PrimerDragHandles overlay)
│   └── PrimerSuggestionsPanel (right column 320 px)
└── PcrModeFooter («Заказать N олигов» button → OrderOligosConfirmGate)
```

Resolve `template = state.containers.find(c => c.id === op.inputs[0])`.

**`editor/operation-modes/PrimerDragHandles.jsx`** (~4-6 KB)

`PrimerDragHandles({ template, selectionStart, selectionEnd, onChange, level })`. Two `<div>` handles absolutely positioned over SequenceView caret area. Drag → onChange(start, end). Tooltip on hover.

Level='default' → hidden. Level='tweak'/'pro' → visible.

**`editor/operation-modes/PrimerSuggestionsPanel.jsx`** (~4-6 KB)

`PrimerSuggestionsPanel({ op, template, selection, level, onSelectionChange, onPrimerSet })`. Pure presentation:
- Reactive selector consume `selectPcrPrimers(state, op.id)` (new selector в `store/selectors-pcr.js`).
- Renders pair list with edit / reuse / remove actions.
- Reuse → opens `PrimerReusePicker`.

**`editor/operation-modes/PrimerReusePicker.jsx`** (~3-4 KB)

`PrimerReusePicker({ currentSuggestion, onPick, onClose })`. Dropdown over panel. Filter input + list of candidates from `state.primers`.

**`editor/operation-modes/OrderOligosConfirmGate.jsx`** (~3-4 KB)

`OrderOligosConfirmGate({ op, onConfirm, onCancel })`. Modal overlay. Renders pairs with checkboxes + summary. Submit calls `actions.opConfirmOrder(op.id)`.

**`canvas/OpRhombusTemplatePicker.jsx`** (~3 KB)

`OpRhombusTemplatePicker({ op, position, onPick, onCancel })`. Dropdown anchored to op-rhombus. Lists containers from `state.containers` (non-placeholder). Click → adds container as op.inputs[0].

**`canvas/HoverOpIconRow.jsx`** (~2.5-3 KB)

`HoverOpIconRow({ container, onPickKind })`. Row of icons appearing on container hover, ~36 px above ContainerBlock. PCR icon active in Spec 3; rest disabled with tooltip «следующий sprint».

**`lib/operation-pcr-bridge.js`** (~3-5 KB)

```
// === HARVEST DISCOVERY (K1) ===
// v0.5 PrimerPanel.jsx cherry-pick:
//   - <line ranges> ...
// v0.5 local-primer-design.js exports used:
//   - designPrimersLocal({...}) — signature, params
//   - findBindingTagAware() — tag-aware extend
// v0.5 OligoManager.jsx cherry-pick:
//   - status enum (Не заказан / Заказан / В доставке / Получен / Плохой)
// ...
```

API:
- `suggestPrimers(template, tails, params): {pairs: [{forward, reverse, fwdTm, revTm, source}]}`
- `recomputeFromSelection(template, start, end, tails): {forward, reverse, fwdTm, revTm}`
- `validatePrimer(primer): {ok, warnings}` — GC%, hairpin, dimer if available in v0.5; иначе минимум length+Tm.

**`store/selectors-pcr.js`** (~3-5 KB)

- `selectPcrPrimers(state, operationId): {pairs, status: 'computing'|'ready'|'error'}` — reactive selector reading op.inputs + adjacent junctions (F2 selectTailsForJunction) + op.params.userPrimers override → suggestPrimers via bridge.
- `selectTemplateForOp(state, operationId): container | null`.

### Существующие файлы

**`editor/ContainerEditorSkeleton.jsx`** (~+3-5 KB)

Header gate: если `tab.kind === 'operation'` → mount op-mode shell, иначе existing container view.

**`canvas/OperationNode.jsx`** (~+3-4 KB)

- onDoubleClick → openEditorOpTab.
- onClick → existing select + OpKindPicker (если op.kind===null) OR OpRhombusTemplatePicker (если op.kind!==null && op.inputs.length===0).

**`canvas/ContainerBlock.jsx`** (~+1.5-2 KB)

onMouseEnter → render HoverOpIconRow. onMouseLeave → hide.

**`store/skeleton-state-operations.js`** (~+2-3 KB)

- New action `OP_CONFIRM_ORDER { operationId, orderedAt }`. Sets op.params.orderConfirmedAt.
- New action `OP_SET_USER_PRIMERS { operationId, primers }`. Sets op.params.userPrimers (override auto-suggest).
- Lifecycle gate same as existing — only draft/committed allow these mutations.

**`store/skeleton-state-editor.js`** (~+1.5 KB)

- editorContext.tabs[].kind field + editorContext.tabs[].operationId field.
- `OPEN_EDITOR_OP_TAB { operationId }` — focus existing op-tab or create new.
- `state.pcrModeUserLevel` persisted preference (top-level field в editor sub-reducer — не вложенный `state.editor.*`, такого среды в skeleton нет) + `SET_PCR_MODE_USER_LEVEL { level }` action.

**`store/skeleton-context.jsx`** (~+0.5 KB)

- `openEditorOpTab(operationId)`.
- `opConfirmOrder(operationId, orderedAt)`.
- `opSetUserPrimers(operationId, primers)`.
- `setPcrModeUserLevel(level)`.

**`canvas/EditorTabStrip.jsx`** (F1, ~+0.8 KB)

Расширение renderera: если tab.kind === 'operation' → лейбл `<icon> <op kind> · <inputs joined> [→ <output_preview>]`. Icon из per-kind map (🔬 PCR / ✂️ Cut / ⚗️ Gibson / 🧬 Mutagenesis).

### Тесты

Файл `__tests__/canvas-skeleton/pcr-mode.test.jsx` (~12-15 KB).

Покрытие:
1. **Tab kind extension:** openEditorOpTab → tab.kind='operation', tab.operationId set.
2. **Breadcrumb operation tab:** rendered с icon + op kind + inputs.
3. **PcrModeShell mount:** template resolved, SequenceView + PrimerSuggestionsPanel rendered.
4. **Level switcher:** Default → drag handles hidden. Tweak → handles visible. Pro → reuse picker always visible.
5. **Primer suggest reactive:** mount triggers bridge → pairs in panel. Change junction param (F2 mock) → recompute fired.
6. **Drag handle update:** simulate drag → onChange fires → primer recomputed with new range.
7. **Reuse picker:** open → filter list → pick existing → replaces suggestion + source='reused'.
8. **ConfirmOrderGate:** all checkboxes unchecked → button disabled. Check all → enabled. Submit → opConfirmOrder dispatched.
9. **Hover op-icons:** hover ContainerBlock → row visible. Click PCR icon → op created with inputs=[hovered], kind='pcr'.
10. **OpRhombusTemplatePicker:** click ромб с empty inputs → picker open. Pick container → opAddInput dispatched.
11. **Bridge primer design smoke:** call suggestPrimers with mock template + tails → returns pairs (mocking v0.5 internals).

---

## 6. Порядок выполнения

### K1 — Harvest discovery v0.5 (только Code, head того файла)

Code прочитывает:
- `gui/designer/src/local-primer-design.js` (20 KB).
- `gui/designer/src/components/PrimerPanel.jsx` (9 KB).
- `gui/designer/src/components/OligoManager.jsx` (13 KB).
- `gui/designer/src/components/JunctionBlock.jsx` head 200 строк (для tail-construction pattern).
- `gui/designer/src/components/PlasmidUseWizard.jsx` head 150 строк (selection-range UX).
- `gui/designer/src/components/MutagenesisWizard.jsx` head 100 строк (для будущего mutagenesis-mode kickoff, не реализуется).

Пишет в `lib/operation-pcr-bridge.js` head **cherry-pick map** комментарием: какая функция/конст откуда взят. Это reference для K2+.

Если discovery вскроет gap (например, `state.primers` пула нет в skeleton) — поднять флаг в отчёте K1 + предложить min primer pool в K1 same sprint или поправку scope.

### K2 — Tab kind + operation-mode dispatch

- editorContext.tabs[].kind + operationId.
- OPEN_EDITOR_OP_TAB action.
- ContainerEditorSkeleton case gate (kind === 'operation' → mount mode shell).
- Stub PcrModeShell — рендерит «PCR mode for op <id>».
- Tests passing для tab open / breadcrumb.

### K3 — Bridge + selectors

- `lib/operation-pcr-bridge.js` skeleton (K1 cherry-picks).
- `store/selectors-pcr.js` skeleton.
- Stub suggestPrimers + selectPcrPrimers.
- Unit tests на bridge с mock template.

### K4 — PcrModeShell + PrimerSuggestionsPanel default level

- Default level UX: auto-suggest pair, рендерит в panel, биолог видит результат.
- SequenceView mount с template (op.inputs[0]).
- Auto selection range based на template ends + junction tails (F2 selectors).

### K5 — Level switcher + Drag handles + Reuse picker (tweak/pro)

- LevelSwitcher 3-button strip в header.
- PrimerDragHandles overlay поверх SequenceView (level≥tweak).
- PrimerReusePicker (level=pro always visible, level=tweak via icon).
- Live Tm recompute on drag.

### K6 — Order confirmation gate

- OrderOligosConfirmGate модалка.
- Checkbox-gated submit.
- OP_CONFIRM_ORDER action.

### K7 — Canvas integration: op-rhombus dropdown + hover-icons

- OpRhombusTemplatePicker (template dropdown).
- HoverOpIconRow на ContainerBlock.
- Double-click ромба → openEditorOpTab.

### K8 — Cleanup

- Lint, build clean.
- Size budget verify.
- Финальный отчёт.

**STOP после K8.** Не финализирует координационные файлы.

---

## 7. STOP-условие и формат отчёта

Идентично F1/F2 (size budget + tests count + DECISIONS draft 10 DEC-CANVAS-PCR-NN + manual smoke + отклонения).

**Дополнительно отчёт K1:** harvest map (что cherry-pick'ed из v0.5, что не использовано, gaps если есть).

**Manual smoke:** «создал PCR op через hover-icon → двойной клик → tab открылся в PCR-mode → default level показал пару primer'ов → tweak level dragged handle на 3 nt → Tm пересчитался → pro level reuse picker открылся → confirm gate с 1 unchecked → disabled, checked all → enabled → submit → op.params.orderConfirmedAt set».

---

## 8. Риски

### R-DRIFT (cross-spec) — Spec 3 опирается на F1 + F2 которые ещё не acceptance'ed

Митигация: явные ссылки на DEC-WIN-NN и DEC-JUNC-NN; при поправке F1/F2 в acceptance — F3 review против изменений до Code-сессии F3.

### R1 — v0.5 `local-primer-design.js` API не совместим с skeleton shape

К1 discovery + bridge изолирует API. Если в discovery вскроется fundamental несовместимость (например, требует Zustand store глобал) — bridge превращается в wrapper + ad-hoc state assembly. Размер bridge может вырасти 3-5 → 8-10 KB. Acceptance reviewed.

### R2 — primer pool `state.primers` отсутствует

К1 discovery flags. Если нет — поправка scope: добавить min `state.primers: []` + add/remove actions в K3. +2 KB к skeleton-state.

### R3 — Reactive cascade performance

Каждое изменение junction param → recompute primers. Каждое изменение selection range → recompute. На большом проекте (5+ PCR ops) пересчёт пачкой — bottleneck. Митигация: useMemo на consumer-side, debounce 100ms на drag handle.

### R4 — OrderOligosConfirmGate UX перебивает flow

Чек-боксы на каждой паре — friction. Если биолог хочет 5 пар → 5 кликов перед заказом. Митигация: «Подтвердить все» master checkbox в header. Биолог может одним кликом подтвердить, если все ОК.

### R5 — 3 уровня UX (level switcher) — биолог потеряет default

Митигация: первичный onboarding tooltip «3 уровня сложности» (F5 onboarding sprint позже). Сейчас — preference persisted, биолог настраивает один раз.

### R6 — Spec 3 размер (target 30 KB) — на верхней границе type A

Если в реализации видно что K6/K7 раздувают шеллы — split на F3a (PCR mode default+tweak) и F3b (pro+order gate). Не желательно (acceptance overhead), но безопасно.

---

## 9. Открытые вопросы — закрыты дефолтами 15.05.2026

### Q1 — 3 уровня UX names

Дефолт: «Default» / «Tweak» / «Pro». Альтернатива (рус): «Просто» / «Точно» / «Профи». Биолог в acceptance уточнит, текстуальная замена.

### Q2 — Hover-icons row на ContainerBlock

Дефолт (DEC-CANVAS-PCR-03): hover-revealed sticky icons. Альтернатива: right-click menu (как desktop apps). Hover проще обнаружить, выбираем default.

### Q3 — Confirmation gate stop-list

Дефолт: только PCR order — gate. Альтернативы: gate на любую mutation (что слишком, см. §9.9.1 — gate только для critical actions).

### Q4 — Operation tab close без confirm

Дефолт: close × → pending params discarded silently (как pending edits контейнера в F1). Альтернатива: confirm если op.params.orderConfirmedAt уже set. Take default — биолог явно прошёл gate, дальнейший discard явный.

---

## Acceptance gate

После Code commit'а + STOP. Acceptance:

- Hover ContainerBlock → PCR icon visible.
- Click PCR icon → op создан с inputs=[hovered].
- Double-click op-ромб → operation tab opens в PCR-mode.
- Level switcher 3 buttons работает: Default/Tweak/Pro.
- Default: panel с auto-pair primer + Tm.
- Tweak: drag handle двигает 5'-конец → Tm пересчёт.
- Pro: reuse picker открытый, фильтр работает, click existing → replace.
- ConfirmGate: чекбоксы required, master «подтвердить все» работает.
- Submit → op.params.orderConfirmedAt set, primer pool ordered status.
- Close tab → pending params lost (по design).

---

_Дата:_ 15.05.2026.
_Реализация Code:_ после F1 + F2 acceptance (либо batch — решение Игоря).
_Acceptance:_ отдельная chat-сессия.
