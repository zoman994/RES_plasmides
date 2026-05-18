# SPRINT M-CANVAS-PRODUCT — Live Product Preview (F4)

**Дата спеки:** 15.05.2026 (написана в batch с F1/F2/F3 без acceptance gate между — см. R-DRIFT).
**Тип:** A (первоначально в NOTES §9.5 помечено B, но реальный scope — state machine + reactive selectors + 3 новых файла + read-only tab mode — выходит за type-B 8-15 KB).
**Target размер спеки:** ~24 KB.
**Источник:** `docs/NOTES_CANVAS_V2_KICKOFF.md` §9.5 F4 + §9.2 решения #13-15 (live product + visual gap).
**Цепочка:** F1 → F2 → F3 → **F4 этот sprint**.
**Статус:** черновик Chat 15.05.2026, batch.
**Зависимости:** F1 (tab system) + F2 (junction selectors) + F3 (op-mode + primer suggestions). При acceptance последовательно.

---

## 0. Срез размеров

| Файл | Сейчас | Действие |
|---|---|---|
| `canvas/ContainerBlock.jsx` | 10.17 KB (после F3 ~12 KB) | +1.5-2 KB (product-preview kind: dashed/dimmed/open-ring branches) |
| `store/skeleton-state-operations.js` | 7.78 KB (после F3 ~10 KB) | +0.5-1 KB (derived virtual outputs selector hook) |
| `canvas/CanvasLayoutView.jsx` | 34.36 KB | +0.5 KB (virtual outputs rendering) |
| `canvas/junction-styles.js` | 4.25 KB (после F2 ~6 KB) | +0.3 KB (gap/disconnected stroke palette) |

Новые файлы:
- `store/selectors-product.js` ~4-5 KB (virtual product state machine + sequence assembly).
- `canvas/VirtualOutputBadge.jsx` ~2-3 KB (warning badge с tooltip на pre-execute container).
- `lib/operation-product-assembly.js` ~3-4 KB (sequence-assembly logic per op kind, reuse R5-R9 bio helpers).

Всё под soft limit.

---

## 1. Контекст и связи перед действием (§17 R4)

### Идея

Op-ромб создан, inputs выбраны — на canvas **сразу** появляется virtual output container с одной из 4 state'ов:
- `incomplete` — inputs или params неполные → ghost dashed grey, label «...настройте параметры».
- `disconnected` — inputs полные, kind set, но junction validation FAIL (Gibson overlap = 0 / sticky mismatch / GG enzyme orthogonality fail) → open ring (gap) + warning badge с описанием.
- `valid` — всё OK, sequence assembly computed → solid container, dimmed, can be opened в tab как preview-only.
- `executed` — op.status === 'executed' → real container existed в state.containers, virtual hidden, real shown как обычно.

После op.status переходит в 'executed' → virtual snapshot → реальный container в state.containers + промоут в Library Tree (когда биолог сохраняет).

### Где задача сядет (existing → new)

- `store/selectors-product.js` (новый) — reactive selector `selectVirtualOutputs(state)` — массив виртуальных контейнеров derived от `state.operations` (non-executed) + adjacent junctions + inputs. Pure function, мounted в CanvasLayoutView + EditorTabStrip.
- `lib/operation-product-assembly.js` (новый) — per-op-kind sequence assembly: PCR (amplification with tails), Gibson (concat with overlap regions), GG (ligation with sticky), Mutagenesis (apply mutation patch). Reuse R5-R9 helpers (`lib/bio/gibson-primer-design`, `golden-gate`, `mutagenesis`).
- `canvas/CanvasLayoutView.jsx` — рендерит virtual outputs параллельно реальным containers. Source: `selectVirtualOutputs(state)`. Стиль зависит от state (incomplete/disconnected/valid).
- `canvas/ContainerBlock.jsx` — accepts `virtualState` prop ('incomplete' | 'disconnected' | 'valid' | null). Branches rendering: dashed border / open-ring / dimmed.
- `canvas/junction-styles.js` — palette extension: `VIRTUAL_STROKE` (`incomplete: '#cbd5e1'`, `disconnected: '#ef4444'`, `valid: '#94a3b8'`).
- F3 EditorTabStrip — virtual product container можно открыть в tab (tab.kind='container'), но `pendingEdits` disabled (read-only preview). Header banner «Preview only · до OP_EXECUTE» вместо apply/discard.
- F2 `selectJunctionValidation` — используется для определения `disconnected` state.

### Что НЕ задеваем

- `state.containers` data array — virtual outputs **не** хранятся там. Это **derived**, не persisted. После execute — real container добавляется в `state.containers` (existing OP_EXECUTE pattern из R5-R9).
- Library Tree — virtual containers не появляются. Promote в Tree происходит только при executed + биолог явно «Сохранить в проект».
- Algorithm core — без изменений (reuse R5-R9 helpers).
- F1/F2/F3 — без изменений в их API; F4 опирается на их selectors / state shape.

### Дубли check (§17 R1)

- ContainerBlock уже умеет рендерить placeholder (dashed). Virtual states — расширение branches того же компонента, не плодение.
- Selector `selectVirtualOutputs` — новый, нет аналога. Pure derive function.
- Bio-validation rules — **reuse R5-R9** (`lib/bio/annotation-conflicts`, `lib/bio/strain-compat`, etc.), не дублируем.

### Запрещённые слова §17 R3 — обоснования

- «**Новый компонент** VirtualOutputBadge»: warning badge с tooltip — atomic UI, отделение от ContainerBlock для тестируемости. Inline в ContainerBlock допустимо если влезает в soft.
- Нет «новых workspace / окон / fullscreen» — virtual output живёт **на том же canvas**, как dimmed sibling реальных containers. Preview-tab — это existing F1 tab (kind='container'), не отдельное окно.

---

## 2. Стратегия

`selectVirtualOutputs(state)` — pure function: iterates `state.operations`, skip executed. Для каждой non-executed op считает её state (incomplete/disconnected/valid) + если valid вычисляет product sequence через `operation-product-assembly`. Возвращает массив виртуальных containers (`{id: 'v-'+opId, name: derived, state: 'incomplete'|..., sequence?, junctionRefs}`).

CanvasLayoutView рендерит реальные containers + virtual outputs в одном слое. ContainerBlock branches per `virtualState`.

Tab-open virtual: F1 `OPEN_EDITOR_TAB('v-'+opId)` распознаёт virtual id (prefix `v-`) → mounts ContainerEditorSkeleton в read-only mode. Header banner «Preview · OP_EXECUTE для финализации».

После OP_EXECUTE (R5-R9 helpers) — real container добавляется в state.containers, op.outputs включает его id, op.status='executed'. Virtual для этой op больше не возвращается selector'ом (skip executed). Если был открыт в tab — tab silently switches на real container (id substituted в editor reducer).

State machine — derived, не persisted. Сложность только в правильности bio-validation reuse.

---

## 3. Scope IN / OUT

### IN

- `selectVirtualOutputs(state)` pure selector.
- `operation-product-assembly.js` sequence assembly per kind (PCR, Gibson, GG, mutagenesis — reuse R5-R9 bio helpers).
- ContainerBlock virtualState rendering (4 branches).
- VirtualOutputBadge с tooltip warning text.
- Open virtual в tab → read-only preview mode в editor.
- Junction visual gap для disconnected (open-ring) — extension `junction-styles.js`.
- Auto-switch tab id при OP_EXECUTE (virtual → real).
- Reactive: изменение junction param → product sequence пересчитался + state машина updated.
- Tests: 4 state'а на mock op, sequence assembly correctness on PCR/Gibson/GG.

### OUT

- Mutation tracking при `executed` (биолог сделал в лаборатории → `executed` status) — кнопка / UI в footer'е op-tab. Отдельный sprint после F4.
- Promote virtual → Library Tree (биолог сохраняет product в коллекцию). Отдельный sprint.
- Performance optimization для проектов с 50+ ops — useMemo + cache по op id.
- Multi-output op (rare: PCR с double-strand product). Spec 4 — single output per op.
- Annotation transfer from inputs → product (например, CDS from template → amplicon). **Уже есть в R5-R9 `auto-annotate`** для real executed containers; для virtual — reuse selector через `operation-product-assembly`. Если discovery K1 (F3 уже сделал) вскроет gap — TECH_DEBT.

---

## 4. Архитектурные решения

### DEC-CANVAS-PROD-01 — Virtual containers как derived state

`selectVirtualOutputs(state): Array<VirtualContainer>` — pure function. **Не пишет в state.** CanvasLayoutView consumes через `useStore(s => selectVirtualOutputs(s))`. Re-render при изменении operations / containers / junctions.

`VirtualContainer` shape:
```
{
  id: `v-${opId}`,           // virtual id, prefix 'v-' распознаётся editor reducer
  name: string,               // derived (e.g., «amplicon_<n>», «pcr_product»)
  state: 'incomplete' | 'disconnected' | 'valid',
  sequence?: string,          // только если state='valid'
  topology?: { circular },
  annotations?: array,
  warnings: string[],         // для state='disconnected' or 'incomplete'
  opId: string,               // back-reference
  inputContainerIds: string[], // тех inputs op'а
  position: { x, y },         // computed относительно op.position (offset to right)
}
```

### DEC-CANVAS-PROD-02 — Four-state machine

`incomplete`: op.inputs.length === 0 OR op.kind === null OR op.params не валидны (per-kind validation).

`disconnected`: op.inputs полные, op.kind set, но **junction validation FAIL** для одной из incident junction'ов. Reuse F2 `selectJunctionValidation`. Warning text = aggregated warnings.

`valid`: все validation pass + `operation-product-assembly` returns sequence без error.

`executed` (excluded из selector): op.status === 'executed'.

### DEC-CANVAS-PROD-03 — Product assembly per kind

`lib/operation-product-assembly.js::assembleProduct(op, inputs, junctions): {ok, sequence?, topology?, annotations?, error?}`.

Switch op.kind:
- `pcr` — single input. Tails берутся из adjacent junctions (F2 selectTailsForJunction). Sequence = forwardTail + selection + reverseComplement(reverseTail). Topology='linear'. Annotation transfer auto (reuse R5-R9 auto-annotate).
- `gibson` — N inputs. Concat sequences via overlap regions (junction.overlapLength). Topology='circular' если последний overlap есть с первым inputs[0].
- `golden_gate` — N inputs + Type IIS enzyme (op.params.enzyme). Ligate fragments by 4-nt overhangs.
- `mutagenesis` — single input + mutation patch (op.params.mutations). Apply mutation batch.
- `kld`, `ligation`, `re_ligation`, `cut` — minimal MVP: KLD = циркуляризация + apply edits; cut = single input split via op.params.cutPositions.

**Пути reusable bio helpers — ориентиры**, точные paths определяет K1 audit:

- v0.5 алгоритмика (пре-R5-R9) — `gui/designer/src/` root: `mutagenesis.js` (18 KB), `golden-gate.js` (11 KB), `local-primer-design.js` (20 KB), `restriction-db.js`, `tm-calculator.js`, `auto-annotate.js`.
- R5-R9 helpers после DEC-OPS-BIO-HELPERS-RELOCATE-01 (R11) — `gui/designer/src/lib/bio/`: `gibson-primer-design`, `sanger-primer`, `codon-optimize`, `strain-compat`, `annotation-conflicts`.

K1 audit определяет по факту что из этих helpers reusable в **pure** режиме (без store или toast side-effects). Bridge в `operation-product-assembly.js` адаптирует shape.

Если op.kind unsupported → `error: 'unsupported_kind'`, state='disconnected'.

### DEC-CANVAS-PROD-04 — Visual styling per state

- `incomplete`: dashed border 2 px slate-300, fill `transparent`, label muted text «...настройте операцию».
- `disconnected`: open-ring border (circle с gap top-right, simulate «not closed»), red-400 stroke, warning badge с tooltip.
- `valid`: solid border 1.5 px slate-400, fill `surface-2`, label normal text, dimmed opacity 0.7 (отличает от executed).
- `executed`: standard ContainerBlock styling (no special treatment — selector skipped).

Junction между filled inputs и virtual output:
- incomplete/disconnected — dashed grey junction line.
- valid — normal solid junction line per F2 palette.

### DEC-CANVAS-PROD-05 — Virtual id prefix `v-` распознаётся в editor

`editorReducer` extension (F1): при `OPEN_EDITOR_TAB { containerId }` если `containerId.startsWith('v-')` → create tab с тем же shape, **`readOnly` derived** в консьюмерах из `tab.containerId.startsWith('v-')`. Дополнительные поля в tab shape НЕ нужны (избыточная информация — всё выводится из containerId prefix).

**ContainerEditorSkeleton resolve** контейнер для рендера по tab.containerId:
- Если `tab.containerId.startsWith('v-')` → resolve через `selectVirtualOutputs(state).find(v => v.id === tab.containerId)`.
- Иначе → existing `state.containers.find(c => c.id === tab.containerId)`.

**Substitute virtual → real при OP_EXECUTE** — через reducer extension OP_EXECUTE (не useEffect watcher). При OP_EXECUTE:
1. Real container добавляется в state.containers (existing R5-R9 logic).
2. Редьюсер iterates editorContext.tabs: если tab.containerId === `'v-' + op.id` → заменить на real container id (первый из op.outputs).
3. Один atomic state update — нет race condition между ContainerEditorSkeleton ре-resolve и reducer.
4. Toast «Product executed → tab switched to <real-name>» push'ется в state.toasts queue.

Альтернатива (auto-close virtual tab) — биолог потеряет контекст. Авто-substitute smooth UX, take A.

### DEC-CANVAS-PROD-06 — Reactive recompute scope

Selector recompute triggered by changes in:
- `state.operations` — any op mutation.
- `state.containers` — inputs могут изменяться (rename, sequence edit).
- `state.junctions` — junction kind/params change (F2 cascade).

Memoization через `useMemo(() => selectVirtualOutputs(state), [state.operations, state.containers, state.junctions])` на consumer-side в CanvasLayoutView.

### DEC-CANVAS-PROD-07 — Annotations transfer

Если op.kind='pcr' + valid + inputs[0] имеет аннотации → product получает аннотации **из selection range** (часть template которая amplified) + adjusted координаты (selection range maps to [0, range.length] в product).

Reuse R5-R9 `auto-annotate` (если применимо для PCR amplicon) ИЛИ minimal annotation transfer в `assembleProduct`. Если discovery вскроет gap — TECH_DEBT, defer.

### DEC-CANVAS-PROD-08 — Position virtual relative to op

Virtual container.position = `{x: op.position.x + 120, y: op.position.y}` (справа от op ромба).

Если биолог явно перетаскивает virtual container — `state.virtualPositions[opId]` (новое поле, lightweight). При OP_EXECUTE — `virtualPositions[opId]` mapped на real container position.

---

## 5. Файлы и сигнатуры

### Новые файлы

**`store/selectors-product.js`** (~4-5 KB)

`selectVirtualOutputs(state): VirtualContainer[]` — iterates state.operations skip executed, для каждой вычисляет state via `computeVirtualState(op, state)` + sequence via `assembleProduct(op, ...)` если state='valid'. Returns array.

Helpers (internal):
- `computeVirtualState(op, state): {state, warnings}` — incomplete / disconnected / valid logic.
- `derivedProductName(op, inputs): string` — e.g., «pcr_<input.name>_amplicon», «gibson_assembly_3frag».

**`lib/operation-product-assembly.js`** (~3-4 KB)

`assembleProduct(op, inputs, junctions): {ok, sequence?, topology?, annotations?, error?}` — switch op.kind, reuse R5-R9 helpers.

Note: K1 audit что из R5-R9 reusable; missing → TECH_DEBT.

**`canvas/VirtualOutputBadge.jsx`** (~2-3 KB)

`VirtualOutputBadge({ virtualContainer, position })`. Renders small badge с iconon (⚠ для disconnected, ⏳ для incomplete, 🔬 для valid) + tooltip с warnings.

### Существующие файлы

**`canvas/ContainerBlock.jsx`** (+1.5-2 KB)

Prop `virtualState?: 'incomplete'|'disconnected'|'valid'`. Branches rendering per state. Если virtualState set → также renders `VirtualOutputBadge` adjacent.

**`canvas/CanvasLayoutView.jsx`** (+0.5 KB)

Consume `selectVirtualOutputs(state)` + render virtual containers параллельно real ones. Junction lines между inputs и virtual — dashed для incomplete/disconnected.

**`canvas/junction-styles.js`** (+0.3 KB)

`VIRTUAL_STROKE` palette extension.

**`store/skeleton-state-operations.js`** (+0.5-1 KB)

OP_EXECUTE flow extension (если K1 audit вскроет gap — но похоже R5-R9 уже handles). Минимальное добавление — virtualPositions store + cleanup при OP_REMOVE.

**`store/skeleton-state-editor.js`** (~+1 KB)

`OPEN_EDITOR_TAB { containerId }` — без дополнительных полей в tab shape (виртуальность derived из containerId prefix). Существующий reducer case в F1 принимает virtual id (`v-opid`) без правок.

**Reducer extension `OP_EXECUTE`** (через router в skeleton-state.js, cross-domain c operations slice):
После того как operations reducer создал real container и выставил op.outputs/status='executed', editor reducer iterates editorContext.tabs: если tab.containerId === `'v-' + opId` → substitute на op.outputs[0]. Atomic. Push toast в state.toasts queue.

**`editor/ContainerEditorSkeleton.jsx`** (~+0.5 KB)

**Container resolve gate** по tab.containerId:
- Если `tab.containerId.startsWith('v-')` → resolve через `selectVirtualOutputs(state).find(v => v.id === tab.containerId)`. Render в read-only mode с banner.
- Иначе → existing `state.containers.find(c => c.id === tab.containerId)`.

`readOnly` flag derived из prefix — не хранится в tab shape, computed inline. Banner «Preview · OP_EXECUTE for finalize» вместо Apply/Discard/SaveAsFork. Кнопки edit disabled.

### Тесты

`__tests__/canvas-skeleton/live-product.test.jsx` (~6-8 KB).

Покрытие:
1. **State machine incomplete:** op без inputs → virtual state='incomplete'.
2. **State machine disconnected:** op with mock junction validation fail → state='disconnected', warnings populated.
3. **State machine valid:** op with valid junctions → state='valid', sequence computed.
4. **PCR assembly:** mock template + tails → sequence = forwardTail + selection + RC(reverseTail).
5. **Gibson assembly:** 3 inputs + overlaps → concat sequence + topology='circular' если last overlaps with first.
6. **Annotations transfer:** PCR mode template с annot → product annot map'ed to relative coords.
7. **Open virtual tab:** OPEN_EDITOR_TAB('v-opid') → tab.containerId='v-opid' (без readOnly field — derived), ContainerEditorSkeleton resolve через selectVirtualOutputs, renders banner.
8. **OP_EXECUTE substitution:** virtual tab open → execute op → редьюсер atomic update'ит tab.containerId 'v-opid' → real container id (op.outputs[0]). Banner gone, edit кнопки возвращаются.
9. **Visual rendering:** ContainerBlock with virtualState='disconnected' → open-ring + warning badge.
10. **Reactive recompute:** change junction.overlapLength → product sequence recomputed.

---

## 6. Порядок выполнения

### K1 — Audit reusability of R5-R9 bio helpers

Code прочитывает `lib/bio/*` (post R5-R9 после R10-R11 ARCH split):
- `gibson-primer-design`
- `golden-gate` (если переехал в bio/)
- `mutagenesis`
- `auto-annotate`
- `strain-compat`
- `annotation-conflicts`

Пишет в `lib/operation-product-assembly.js` head map — что reuse, что отсутствует. Если gap — TECH_DEBT entry + min stub в spec scope.

### K2 — Selector + assembly skeleton

- `store/selectors-product.js` + `lib/operation-product-assembly.js`.
- Stub assemble per kind (returns ok=false для unsupported).
- Unit tests на state machine + PCR assembly как минимум.

### K3 — ContainerBlock virtualState

- Prop + 3 branches (incomplete / disconnected / valid).
- VirtualOutputBadge inline или отдельно.
- Junction-styles palette extension.

### K4 — CanvasLayoutView render virtual

- Consume selector.
- Render virtual containers рядом с real.
- Dashed junctions для incomplete/disconnected.

### K5 — Tab readOnly mode (virtual preview)

- editorReducer extension: virtual id detection.
- ContainerEditorSkeleton readOnly banner.
- OP_EXECUTE → SUBSTITUTE_VIRTUAL_TAB.

### K6 — Cleanup + size audit

- Lint, build clean.
- Sizes под budget.
- Final отчёт.

**STOP после K6.** Не финализирует.

---

## 7. STOP-условие и формат отчёта

Идентично F1/F2/F3 (size budget + tests count + DECISIONS draft 8 DEC-CANVAS-PROD-NN + manual smoke + отклонения).

**K1 reuse audit отчёт:** что переиспользовано из R5-R9, что отсутствует (TECH_DEBT entries).

**Manual smoke:** «Создал PCR op + inputs пустые → dashed virtual «...настройте операцию» появилось. Drag template в inputs → state='disconnected' пока junction не настроен. Settings junction kind='overlap' → state='valid', virtual solid. Открыл virtual в tab → banner «Preview». Execute op → tab автоматически substituted на real container, banner gone».

---

## 8. Риски

### R-DRIFT (cross-spec) — Spec 4 depends on F1/F2/F3 без acceptance

Описано в F1/F2/F3. Митигация: после F1/F2/F3 acceptance — F4 review против изменений до Code-сессии F4.

### R1 — R5-R9 bio helpers ad-hoc shape, не подходят для virtual assembly

K1 audit вскрывает. Если несовместим — F4 пишет min wrapper per kind в operation-product-assembly. +2-3 KB. Возможно gibson/GG assembly реалистично только в R5-R9 context (с side-effect Toast / annotation merge); для virtual нужен **pure** helper. Refactor R5-R9 bio в **pure** — отдельный sprint если нужно.

### R2 — Performance при 10+ ops + 30+ containers

Selector iterates всё на каждое change. Митигация: memoize по op.id в pure helper; на consumer side useMemo с dep array.

### R3 — Auto-substitute tab при OP_EXECUTE confusing UX

Биолог открыл virtual preview → выполнил op → tab показывает real container. Может не заметить.

Митигация: toast «Product executed → tab switched to <real-name>». Через existing showToast.

### R4 — Annotations transfer для PCR на partial selection — много edge cases

Selection range пересекает annotation границы (e.g., CDS половина в range, половина вне). Митигация: K1 audit `auto-annotate` поведения на range; minimum logic в spec — annotations внутри range копируются, частично пересекающие truncated или dropped (TECH_DEBT entry).

### R5 — Virtual containers занимают визуально много места на canvas

10 ops → 10 virtual containers рядом → визуальный шум. Митигация: collapse virtual в minified bubble (only badge + small label) до hover; expand на hover. **OUT of Spec 4** — TECH_DEBT TD-VIRTUAL-COLLAPSE.

---

## 9. Открытые вопросы — закрыты дефолтами 15.05.2026

### Q1 — Auto-substitute vs auto-close virtual tab при OP_EXECUTE

Дефолт: auto-substitute virtual tab id → real (DEC-PROD-05). Toast notify. Smooth UX.

### Q2 — Virtual container draggable

Дефолт: yes. position сохраняется в `virtualPositions[opId]`; при OP_EXECUTE mapped на real container.

### Q3 — Open virtual в tab — visible always или только когда state='valid'

Дефолт: visible для всех state'ов (incomplete shows banner + skeleton placeholder content; disconnected shows banner + warnings list; valid shows preview). Биолог может drill-in в любой state.

### Q4 — Virtual contributors в mini-canvas (F1)

Дефолт: yes, virtual outputs показываются в mini-canvas с диff styling (smaller marker, dashed border). F1 `MiniProjectCanvas` уже consumes containers + operations; добавление virtual через selector — natural extension.

---

## Acceptance gate

После Code commit'а + STOP. Acceptance:

- Create PCR op without inputs → ghost virtual «...настройте операцию» appears.
- Drag template into inputs → state changes to 'disconnected' (junction not set).
- Set junction kind via popover (F2) → state='valid', virtual solid.
- Open virtual в tab → banner «Preview» visible, no Apply/Discard.
- OP_EXECUTE → tab substituted на real container, banner gone, toast «Product executed».
- 4 visual states distinct в canvas (incomplete/disconnected/valid/executed).
- Mini-canvas (F1) shows virtual outputs.

---

_Дата:_ 15.05.2026.
_Реализация Code:_ после F1+F2+F3 acceptance (либо batch — решение Игоря).
_Acceptance:_ отдельная chat-сессия.
