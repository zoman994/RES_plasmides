> **Архивировано 27.05.2026 — консолидация docs/ (S4). РЕАЛИЗОВАНО / поглощено four-tier T-серией.** Operations slice, op-группы, реакции внутри зон. Учтено в `BACKLOG.md` §Канвас-и-окна.

# SPRINT_M_CANVAS_OPS.md — Operations as ops on canvas

> **Тип:** A (архитектура / wave-первый sprint).
> **Wave:** M-CANVAS-V2-TO-PRODUCTION. Cross-ref: `docs/ROADMAP_CANVAS_V2_TO_PRODUCTION.md` §3.
> **Дата создания:** 12.05.2026 поздний вечер.
> **Триггер.** Минимальный прототип paradigma V2 закрыт. Биолог видит junctions «эти плазмиды собираются Gibson'ом», но не может нажать «выполнить». Без operations canvas — демо геометрии, не план эксперимента. Этот sprint поднимает operations до первоклассных узлов canvas.
> **Stop-условие.** После K12: `npm test` зелёный + ручной end-to-end на pUC19 (PCR insert → amplicon, Cut pUC19 → 2 fragments, Gibson amplicon+fragment → circular vector). Жду визуальной приёмки в отдельной сессии.

---

## 0. Срез размеров затрагиваемых модулей

`gui/designer/src/components/CanvasSkeleton/store/`
- `skeleton-state.js` — **22.77 KB** (watch zone, TD-SKELETON-STATE-SIZE). После K2+K3 split+GC ожидается ~7-8 KB (router + base actions only).
- `skeleton-context.jsx` — 6.11 KB. После K4-K10 ожидается ~7-8 KB (exports новых actions).

`gui/designer/src/components/CanvasSkeleton/canvas/`
- `OperationNode.jsx` — 1.96 KB. После K5 ожидается ~5-7 KB.
- `CanvasLayoutView.jsx` — 15.99 KB. После K6-K9 ожидается ~17-19 KB (operations integration + popovers).
- `CanvasGraphView.jsx` — 8.68 KB. После K6-K9 ожидается ~10-11 KB.

`gui/designer/src/components/CanvasSkeleton/editor/`
- `derive-primers.js` — 2.78 KB **(удаляется K3)**.
- `fixture-puc19.js` — 4.71 KB **(удаляется K3, либо перенос в `__tests__/fixtures/`)**.

v0.5 algorithm core (запрещённые зоны для Chat, harvest через adapters):
- `gui/designer/src/local-primer-design.js`
- `gui/designer/src/tm-calculator.js`
- `gui/designer/src/restriction-db.js`
- `gui/designer/src/golden-gate.js`
- `gui/designer/src/mutagenesis.js`

**Hard-лимиты соблюдены** (после sprint'а): все `.jsx` под 40 KB, все `.js` под 25 KB. `CanvasLayoutView.jsx` ~19 KB — под soft 30. `skeleton-state.js` ~7-8 KB — далеко от лимита.

---

## 1. Контекст

Минимальный прототип V2 (12.05.2026) реализовал:
- placeholder containers + drag from Library Tree + fill;
- container editor композированный из Library/inspector/*;
- junctions (визуализация соединений) с auto-detect kind + manual override через popover;
- Del/Backspace удаление + cleanup.

Что **не реализовано** в прототипе и блокирует «рабочий vertical slice»:
- Operation как сущность canvas. `state.operations` нет. OperationNode (1.96 KB) — старый ромб из Graph view без kind picker и без commit-flow.
- Биолог не может нажать «выполнить PCR» / «выполнить Cut» / «выполнить Gibson». Junctions показывают визуальную связь, но не запускают reaction и не создают output container'ы автоматически.
- Custom container kinds (oligonucleotide / primer-pair) — нет. PCR не может принять primer-container как input.
- Frozen-on-use lifecycle — нет. Контейнер можно править после использования.
- Существующий `editorContext.draftId` + `draftSessions` + `popup` slice в reducer — **dead legacy** из pre-V2 paradigma (SKELETON_DRAFTS=[], popup-actions удалены).
- `state.js` 22.77 KB — watch zone (soft 20). Любое расширение под operations пробьёт hard 25 без split'а.

Этот sprint закрывает все эти gap'ы одним заходом, потому что они **взаимозависимы**: operations требуют новый shape; новый shape требует split state.js; split state.js — повод GC legacy; custom containers нужны для PCR-from-primers.

## 2. Где задача сядет (R4 §17)

**Затрагивает:**
- `store/skeleton-state.js` — split на 3 файла + GC legacy. Эту работу делает только K2+K3, после K3 файл стабилен.
- `store/skeleton-context.jsx` — exports новых actions + новый hook `useOperations`.
- `canvas/OperationNode.jsx` — переписан с kind picker.
- `canvas/CanvasLayoutView.jsx` — operations rendering + operation-кликов wiring + + кнопка добавления **operation** (placeholder add — отдельный sprint M-CANVAS-POLISH).
- `canvas/CanvasGraphView.jsx` — operations rendering в Graph view dagre layout.
- `fixture-canvas-skeleton.js` — добавить `SKELETON_OPERATIONS=[]`, `SKELETON_CUSTOM_CONTAINER_KINDS`.
- `editor/ContainerEditorSkeleton.jsx` — banner «frozen — использован в operation, Save As fork» + кнопка Save-As-fork (минимум).

**Новые модули:**
- `store/skeleton-state-canvas.js` — extract из state.js: containers, positions, junctions, placeholder/fill/add/remove/reconcile actions.
- `store/skeleton-state-operations.js` — operations actions + reducer.
- `store/skeleton-state-editor.js` — pending edits + rename + viewOnly editor context.
- `canvas/operations/OpPopup.jsx` — base frame для всех OpPopups (header / body / apply / cancel).
- `canvas/operations/OpKindPicker.jsx` — popover на пустом OperationNode для выбора kind.
- `canvas/operations/PCROpPopup.jsx`, `CutOpPopup.jsx`, `GibsonOpPopup.jsx`, `LigateOpPopup.jsx`, `KLDOpPopup.jsx`, `MutagenesisOpPopup.jsx` — kind-specific popups.
- `canvas/operations/lib-adapters.js` — pure-function adapters над v0.5 algorithm core (PCR via local-primer-design, Cut via restriction-db, Gibson via golden-gate, Mutagenesis via mutagenesis.js).
- `canvas/container-kind-registry.js` — registry custom container kinds (oligonucleotide добавляется здесь).

**Удаляется (после K3 GC):**
- `editor/derive-primers.js` — dead helper, SKELETON_COMMITS=[].
- `editor/fixture-puc19.js` — либо удаление, либо перенос в `__tests__/fixtures/` если нужен тестам.
- В `skeleton-state.js`: `state.draftSessions`, `state.activeDraftId`, `state.editorContext.draftId`, `state.popup`, reducer cases `OPEN_EDITOR_DRAFT` / `SET_ACTIVE_DRAFT` / `SET_ACTIVE_TAB`, action `openPopup` / `closePopup` (последние два уже de-facto удалены, но docstring обновляется).
- `SKELETON_DRAFTS` экспорт в `fixture-canvas-skeleton.js`.

**Reuse из v0.5 algorithm core (через adapter):**
- `local-primer-design.js::designPrimerPair` — для PCR-from-template (если нет primer-pair input) и для KLD/QuickChange (M-CANVAS-MUTAGENESIS, не здесь).
- `tm-calculator.js::calculateTm` — для Oligonucleotide container Tm display.
- `restriction-db.js` — для CutOpPopup enzyme lookup + cut-site detection.
- `golden-gate.js` — для GibsonOpPopup type IIS detection (или fallback на overlap Gibson).
- `mutagenesis.js::applyMutations` — для MutagenesisOpPopup full-container mutation.

**Reuse из Library/lib/ (что есть готовое):**
- `lib/annotation-edit.js::applyAnnotationEdit` — для intra-result annotation editing (когда operation result имеет inherited annotations).
- `lib/sequence-diff.js` — для отображения mutation diff в MutagenesisOpPopup preview.

**Не трогать (production code, риск регрессии):**
- `components/Library/inspector/*` — расширения только если absolutely required, иначе fork в `canvas/` через wrapper.
- `components/Library/tree/*` — wrap через `LibraryTreeHost` уже стоит, новых правок не нужно.
- `components/Annotator/*` — Annotator работает как есть.

## 3. Стратегия

**Trinity подход.**

Sprint трёхчастный, не однопоточный:
- **Foundation** (K1-K3) — разведка v0.5 + state.js split + GC legacy. Без этого следующие шаги либо упрутся в size limit либо в coupling.
- **Operation infrastructure** (K4-K6) — Operation data shape + OperationNode v2 + OpKindPicker + OpPopup base + первая kind (PCR).
- **Operation kinds** (K7-K10) — Cut / Gibson / Ligate / KLD / Mutagenesis + Custom containers (oligonucleotide).
- **Test + sanity** (K11-K12).

**Inline popup, не wizard.**

OpPopups — **inline popup на ромбе**, не отдельные fullscreen wizards. Лимит файла **8 KB на popup**. Если PCROpPopup растёт выше — extract sub-component (например, PrimerSelector). Это требование §17 R2 «правило пары кликов»: биолог не должен выходить из canvas-контекста для запуска PCR.

**Harvest v0.5 через pure-function adapter.**

v0.5 algorithm core живёт в `gui/designer/src/` корне (запрещённая зона для Chat). Импортируется в `canvas/operations/lib-adapters.js`. Адаптер — pure function: `{inputs, params} → {outputs, error?}`. Никакого store-coupling в адаптере. Если v0.5 функция требует store — extract pure-fn часть в новый `lib/*-pure.js` (extraction делается в K1 разведке).

**Operation lifecycle: draft → committed → executed → failed.**

Operation добавляется на canvas через + кнопку либо через junction kind picker → создаётся **draft** (dashed ромб, kind undefined либо kind-from-junction). Biolog задаёт kind через OpKindPicker → **committed** (solid ромб с kind icon). Biolog задаёт params через OpPopup → нажимает Execute → **executed** (filled с checkmark) либо **failed** (red overlay). Container outputs создаются на executed. Frozen на inputs устанавливается на executed.

**Junctions переосмысляются.**

Текущие junctions (auto-detect between proximal containers) — это **proto-Gibson/Ligation operations** в `draft` status. После kind picker на junction'е → создаётся реальная Gibson/Ligation operation в `draft` status (видна как ромб между containers), junction скрывается под operation. Это симметрично двум путям: «junction-first» (биолог расставил containers близко → auto-junction → kind picker создаёт operation) и «operation-first» (биолог нажал + → kind picker → operation создаёт inputs/outputs slots → drags containers в input slots).

**State split — по domain, не по action-prefix.**

`skeleton-state-canvas.js` — containers + positions + junctions + canvas-level actions (placeholder/fill/add/remove/reconcile).
`skeleton-state-operations.js` — operations array + operation-level actions.
`skeleton-state-editor.js` — pending edits + rename + viewOnly editor context.
`skeleton-state.js` — main reducer router + base state (view / highlight / toast / reset).

Router-pattern: main reducer вызывает sub-reducers по action.type prefix. Каждый sub-reducer получает full state + action, возвращает обновлённый state. Это позволяет sub-reducers видеть cross-domain state (REMOVE_CONTAINER из canvas slice видит operations slice и удаляет referenced operations).

## 4. Scope IN

- State split (3 файла + main router).
- GC legacy (drafts, popup, derive-primers, fixture-puc19, SKELETON_DRAFTS).
- Operation data shape + state.operations + state.operationDrafts (separate for transient).
- 6 operation kinds: PCR / Cut / Gibson / Ligate / KLD / Mutagenesis.
- Each kind has dedicated OpPopup inline popup.
- COMMIT_OPERATION_V2 reducer с lifecycle draft→committed→executed→failed.
- Frozen-on-use lifecycle на inputs + Save-As-fork в editor.
- Custom container kind `oligonucleotide` (primer-pair shape) + registry для extensibility.
- v0.5 algorithm core harvested через adapter.
- OperationNode v2 с kind picker + status visualisation.
- + Operation кнопка в canvas-toolbar (placeholder-add — другой sprint).
- Junction → Gibson/Ligation operation linkage.
- Editor banner «frozen — used in operation» + Save-As-fork button.
- TabBar mutagenesis tab переходит в **active state** (canvas Mutagenesis operation создаётся; реальные tools intra-container — M-CANVAS-MUTAGENESIS).

## 5. Scope OUT

- **Persistence через Dexie** — M-CANVAS-PERSIST. Skeleton остаётся mock-everywhere.
- **Real intra-container mutagenesis tools в editor mutagenesis tab** — M-CANVAS-MUTAGENESIS. Здесь только canvas-level Mutagenesis operation (full-container mutation).
- **+ кнопка добавления placeholder вручную** — M-CANVAS-POLISH.
- **Drop entry на filled container семантика** — M-CANVAS-POLISH.
- **Instance counter UX** — M-CANVAS-POLISH.
- **BsaI/BsmBI overhangs auto-detection в Gibson popup** — M-CANVAS-POLISH (текущий sprint поддерживает только overlap Gibson и type-IIS GG через explicit enzyme select в Gibson popup).
- **Сборка из праймеров без template** (NOTES Q1) — M-CANVAS-POLISH.
- **Operation re-execute** — M-CANVAS-POLISH (текущий sprint: re-create operation manually).
- **Operation collapse/expand для multi-fragment Gibson** — M-CANVAS-POLISH.
- **Saturation mutagenesis batch** — M-CANVAS-MUTAGENESIS.
- **Multi-template PCR** — out of scope; PCR один template per operation в этом sprint'е.
- **Operation library (saved templates)** — после wave.

## 6. Архитектурные решения DEC-OPS-01..10

**DEC-OPS-01 — state.js split на 3 sub-reducers по domain.** Main `skeleton-state.js` остаётся entry-point + router; sub-reducers в `skeleton-state-canvas.js` / `skeleton-state-operations.js` / `skeleton-state-editor.js`. Router pattern: main reducer dispatch'ит по `action.type` prefix (`CANVAS_*` / `OP_*` / `EDITOR_*` / base actions). Каждый sub-reducer pure-fn `(state, action) → newState`, видит full state но мутирует только свой slice. Cross-domain effects (REMOVE_CONTAINER удаляет referenced operations) — main reducer chain'ит sub-reducers последовательно.

**DEC-OPS-02 — GC legacy.** Удаляются `state.draftSessions`, `state.activeDraftId`, `state.editorContext.draftId`, `state.popup`, reducer cases `OPEN_EDITOR_DRAFT` / `SET_ACTIVE_DRAFT` / `SET_ACTIVE_TAB`, actions `openPopup` / `closePopup`. Файлы `editor/derive-primers.js` + `editor/fixture-puc19.js` — удаляются (либо перенос pUC19 fixture в `__tests__/fixtures/` если нужен тестам). `editor.editorContext` упрощается до `{viewOnlyContainerId: string | null}` (raw shape, не nested).

**DEC-OPS-03 — Operation data shape.** `Operation = { id: uuidv7(), kind: 'pcr'|'cut'|'gibson'|'ligate'|'kld'|'mutagenesis', status: 'draft'|'committed'|'executed'|'failed', position: {x, y}, inputs: containerId[], outputs: containerId[], params: {...kind-specific}, junctionRefs: junctionId[] (Gibson/Ligate only — refs to source junctions for visualisation), createdAt: ISO, executedAt: ISO|null, error: string|null }`. `state.operations: Operation[]` живёт в operations slice.

**DEC-OPS-04 — Operation status lifecycle.** Transitions: `draft → committed` (kind chosen via OpKindPicker), `committed → executed` (params filled + Execute clicked + algorithm success), `committed → failed` (algorithm error), `failed → committed` (params edited + retry). Невозможные переходы (executed → draft, executed → committed) — block reducer'ом, выдаёт warning toast.

**DEC-OPS-05 — OperationNode v2 = kind-picker popover + status visualisation.** Click на пустой ромб (status='draft', kind=null) → OpKindPicker popover с grid 3x2 (PCR / Cut / Gibson / Ligate / KLD / Mutagenesis). Click on filled ромб (status='committed' или later) → OpPopup для редактирования params либо re-execute. Status visual: draft = dashed border + grey, committed = solid + kind colour, executed = filled + checkmark + green tint, failed = filled + red border + ! icon.

**DEC-OPS-06 — OpPopup inline, hard cap 8 KB на kind-specific popup.** Все OpPopups имеют общую `OpPopup.jsx` base (header с kind name + close + status badge; body — kind-specific; footer — Cancel + Execute). Inline означает рендер поверх canvas как absolute-positioned popover, не fullscreen modal. Anchored к operation position. Lim 8 KB enforced — если popup растёт, extract sub-component (например, `PrimerSelectorWidget` shared между PCR и KLD popups).

**DEC-OPS-07 — COMMIT_OPERATION_V2 reducer выполняет algorithm + создаёт outputs.** Action `{type: 'OP_EXECUTE', operationId}`. Reducer:
1. Lookup operation by id; assert status='committed'.
2. Dispatch to `canvas/operations/lib-adapters.js::executeOperation(operation, contextSnapshot)` — pure fn.
3. Adapter возвращает `{outputs: Container[], error?: string}`.
4. На success: status='executed', outputs ids appended to state.containers, frozen=true set on input containers, positions assigned auto-layout (right-of-operation), toast «Operation X executed: N outputs».
5. На error: status='failed', error message stored, toast «Operation X failed: <error>».
6. Junction'ы между inputs and operation drop из junctions slice (заменяются operation visualisation).

**DEC-OPS-08 — Frozen-on-use lifecycle.** Container с `frozen=true` field получает:
- В editor: red banner «Этот контейнер использован в operation Y. Любые изменения создают форк через Save As.»
- Apply/Discard buttons заменены на «Save As fork» (создаёт clone container без frozen, наследует pending edits, биолог даёт name).
- Inline rename — disabled.
- Tree icon — lock 🔒 mini-overlay.
- REMOVE_CONTAINER на frozen — warning toast «Удаление frozen container'а удалит и operation Y. Подтвердить?», требует second click.
- Unfreeze flow: если operation удалена → frozen automatically снимается с inputs (if no other operations reference them).

**DEC-OPS-09 — Custom container kind `oligonucleotide` (primer-pair).** Shape: `{id, kind: 'oligonucleotide', name, payload: { sequences: [{name, sequence, Tm, GC}], purpose: 'pcr_primer'|'kld_primer'|'sequencing'|'cloning', concentration_uM, stock_volume_ul }, origin, position}`. Tree icon — 🧬 mini. ContainerBlock — узкий rectangle с двумя sequence lanes (forward / reverse) + Tm/GC pills. PCR may accept either:
- 1 oligonucleotide-container с двумя sequences (primer-pair) +1 molecule-container (template), OR
- 2 separate oligonucleotide-containers (forward + reverse) + 1 template.

`container-kind-registry.js` — central place: `KIND_REGISTRY = { molecule: {icon, blockRenderer, ...}, oligonucleotide: {icon, blockRenderer, ...}, placeholder: {...} }`. Extensible для будущих kinds (gblock, RNA, protein).

**DEC-OPS-10 — Harvest v0.5 algorithms через pure-function adapter, no store-coupling.** `canvas/operations/lib-adapters.js`:
- `executePCR({template, primer1, primer2, params}) → {amplicon: Container} | {error}`
- `executeCut({template, enzymes}) → {fragments: Container[]} | {error}`
- `executeGibson({fragments, method}) → {assembly: Container} | {error}` (method = 'overlap' | 'goldengate' | ...)
- `executeLigate({fragments}) → {assembly: Container} | {error}` (sticky / blunt)
- `executeKLD({primer_pair, template}) → {circular: Container} | {error}` (single-tube KLD self-circularization for site-directed mutagenesis)
- `executeMutagenesis({template, mutations}) → {mutant: Container} | {error}` (full-container mutation; intra-region — другой sprint)

Internal lookup: `local-primer-design`, `tm-calculator`, `restriction-db`, `golden-gate`, `mutagenesis`. **Если v0.5 function требует store** — K1 разведка extract'ит pure-fn часть в `lib/*-pure.js`, либо wrap'ит через adapter. Если coupling непроходим — K1 поднимает блокер.

## 7. Файлы

### Новые

**`store/skeleton-state-canvas.js`** (~8-9 KB)
- Sub-reducer: containers + positions + junctions + cascadeIndex.
- Action prefix: `CANVAS_*` либо unprefixed (legacy compat).
- Actions: ADD_CONTAINER_FROM_ENTRY, FILL_PLACEHOLDER, REMOVE_CONTAINER, SET_POSITION, SET_HIGHLIGHT, RECONCILE_AUTO_JUNCTIONS, REMOVE_JUNCTION, SET_JUNCTION_KIND.
- Helper functions: `containerFromLibraryEntry` (existing) + `containerFromKindRegistry`.

**`store/skeleton-state-operations.js`** (~7-8 KB)
- Sub-reducer: operations + operationDrafts.
- Action prefix: `OP_*`.
- Actions: `OP_ADD` (creates draft), `OP_REMOVE`, `OP_SET_POSITION`, `OP_SET_KIND` (draft → committed), `OP_SET_PARAMS`, `OP_EXECUTE` (committed → executed/failed), `OP_RESET` (failed → committed for retry).
- Helper: `createOperationDraft({position, kind?, inputs?, junctionRef?})`.

**`store/skeleton-state-editor.js`** (~5-6 KB)
- Sub-reducer: pendingEditsByContainer + editorContext + viewOnlyContainerId.
- Action prefix: `EDITOR_*` либо unprefixed.
- Actions: SET_PENDING_EDITS, COMMIT_PENDING_EDITS, DISCARD_PENDING_EDITS, SET_CONTAINER_NAME, OPEN_EDITOR_VIEW_ONLY, CLOSE_EDITOR.

**`canvas/operations/OpPopup.jsx`** (~3-4 KB)
- Base frame: header (kind icon + name + close X), body (children prop), footer (status badge + Cancel + Execute buttons).
- Absolute positioning anchored to operation.position with viewport-aware adjustment.
- Esc closes (Cancel).
- Click outside closes (Cancel, не Execute).

**`canvas/operations/OpKindPicker.jsx`** (~3-4 KB)
- Popover anchored to operation (status='draft', kind=null).
- 6 tiles in 3x2 grid: PCR / Cut / Gibson / Ligate / KLD / Mutagenesis.
- Each tile: icon + name + 1-line description.
- Click tile → `OP_SET_KIND(operationId, kind)` → close picker → open OpPopup для выбранной kind.

**`canvas/operations/PCROpPopup.jsx`** (~7-8 KB)
- Template input: select-from-canvas-containers (filter: kind='molecule', topology=any).
- Primer pair input: либо 1 oligonucleotide-container с 2 sequences, либо 2 separate oligonucleotide-containers (toggle).
- Auto-design primers checkbox: использует `local-primer-design::designPrimerPair` если template selected без primer pair.
- Annealing temperature: number input (default = min(primer1.Tm, primer2.Tm) - 5).
- Extension time: seconds (default = template.length / 1000).
- Execute → adapter `executePCR(...)` → result.amplicon → new linear container as output.

**`canvas/operations/CutOpPopup.jsx`** (~6-7 KB)
- Template input: select-from-canvas-containers.
- Enzyme select: multi-select из `restriction-db` (search by name, recognition site, или 5'/3'-overhang type). Common enzymes pinned (EcoRI / BamHI / HindIII / SalI / NotI / XhoI / NcoI / BglII / BsaI / BsmBI).
- Preview: shows N cut positions + resulting N+1 (linear template) или N (circular template) fragments with lengths.
- Execute → adapter `executeCut(...)` → result.fragments → new linear containers as outputs (auto-positioned right-of-operation).

**`canvas/operations/GibsonOpPopup.jsx`** (~6-7 KB)
- Fragment inputs: multi-select from canvas containers (≥2, all linear).
- Order toggle: drag-and-drop ordering of fragments in assembly chain.
- Method select: 'overlap' (default, Gibson via 20-40 bp overlap) | 'goldengate' (Type IIS BsaI/BsmBI with 4-nt overhangs).
- Topology of output: circular (default) | linear (option).
- Execute → adapter `executeGibson(...)` → result.assembly → new container as output.

**`canvas/operations/LigateOpPopup.jsx`** (~5-6 KB)
- Fragment inputs: multi-select linear containers (≥2).
- Sticky-end vs blunt detection: auto from container.ends; biolog can override.
- Topology of output: circular | linear.
- Execute → adapter `executeLigate(...)` → result.assembly.

**`canvas/operations/KLDOpPopup.jsx`** (~5-6 KB)
- Template input: 1 circular container.
- Primer pair input: oligonucleotide-container (must have phosphorylated 5' ends per KLD protocol).
- DpnI digest: auto-on (default true) — strips methylated template before ligation.
- Execute → adapter `executeKLD(...)` → result.circular (mutagenized closed plasmid).

**`canvas/operations/MutagenesisOpPopup.jsx`** (~6-7 KB)
- Template input: 1 container (molecule kind).
- Mutation type: point | insertion | deletion | substitution-range.
- Mutation list: rows of `{position, from, to}` либо `{position, insert: 'ATG'}` либо `{from_position, to_position}`.
- Preview: shows resulting sequence diff via `lib/sequence-diff.js`.
- Execute → adapter `executeMutagenesis(...)` → result.mutant.

**`canvas/operations/lib-adapters.js`** (~5-7 KB)
- Pure-function adapter layer. No store reads. Pure `(operation, contextSnapshot) → {outputs, error?}`.
- Internal: lookup v0.5 algorithm core, pass containers' sequence/annotations/topology/ends, return new container shapes.
- ContextSnapshot = `{containers: {[id]: Container}}` — read-only view of state.containers for input lookup by id.

**`canvas/container-kind-registry.js`** (~3-4 KB)
- Central registry для container kinds. Shape:
  ```
  KIND_REGISTRY = {
    molecule: {
      icon: '◯',
      blockRenderer: ContainerBlock (default),
      payloadShape: {sequence, annotations, topology, length, ends},
      treeIcon: '◯',
      canBePCRInput: false,
      canBePCRTemplate: true,
      ...
    },
    oligonucleotide: {
      icon: '🧬',
      blockRenderer: OligonucleotideBlock (new component, в canvas/),
      payloadShape: {sequences: [{name, sequence, Tm, GC}], purpose, concentration_uM},
      treeIcon: '🧬',
      canBePCRInput: true,
      canBePCRTemplate: false,
      ...
    },
    placeholder: {
      icon: '+',
      blockRenderer: ContainerBlock (placeholder variant),
      payloadShape: {},
      treeIcon: null,  // placeholders never in tree
      ...
    },
  }
  ```
- Lookup helper: `getKindRegistry(kind) → KindEntry`.
- Default fallback: 'molecule' if kind not found.

**`canvas/OligonucleotideBlock.jsx`** (~4-5 KB)
- Renders oligonucleotide-container на canvas: narrow rectangle, two sequence lanes (forward 5'→3' top, reverse 3'←5' bottom), Tm pill on each, GC% on each. Drag-source for OpPopup primer-input select.

### Изменяемые

**`store/skeleton-state.js`** (22.77 → ~7-8 KB)
- Becomes router: main reducer dispatches to sub-reducers based on action.type prefix.
- Base state: `view`, `highlightedContainerId`, `toast`, `cascadeIndex`.
- Base actions: `SET_VIEW`, `SET_HIGHLIGHT` (highlight живёт здесь, не в canvas slice — потому что highlight cross-domain), `CLEAR_TOAST`, `RESET`.
- buildInitialState merges sub-state initializers.

**`store/skeleton-context.jsx`** (4.63 → ~7-8 KB)
- Exports новые actions из 3 sub-reducers + 6 operation actions + 2 custom-container actions.
- Новый hook `useOperations()` → returns operations array.
- Hook `useOperationById(id)` → returns single operation.
- Hook `usePendingEdits` — existing.

**`canvas/OperationNode.jsx`** (1.96 → ~5-7 KB)
- Renders operation as ромб with status-driven visual.
- Click handler: kind=null → open OpKindPicker; kind!=null → open OpPopup.
- Right-click handler (или long-press): context menu с «Delete operation» + «Re-execute» (future).
- Status icons inline.

**`canvas/CanvasLayoutView.jsx`** (15.99 → ~17-19 KB)
- Adds operations rendering layer (SVG operations between containers).
- Adds + Operation button в floating toolbar (right side).
- Adds operation popup mount points (OpKindPicker, OpPopup).
- Pointer-up reconcile теперь учитывает operations (proximity к operation = potential input).

**`canvas/CanvasGraphView.jsx`** (8.68 → ~10-11 KB)
- Adds operations as dagre nodes in Graph layout.
- Operations rendered as ромбы between container-rectangles.
- Edges: container → operation (input) + operation → container (output).
- Same popups available в Graph view.

**`fixture-canvas-skeleton.js`** (2.91 → ~3.5 KB)
- Add `SKELETON_OPERATIONS = []` export.
- Update isPlaceholderContainer predicate to handle oligonucleotide kind (oligo with sequences[]=[] is placeholder).
- Optional: add `SKELETON_OLIGO_PLACEHOLDERS` — option начать с 0 oligo placeholders (default), либо предложить 1 oligo placeholder для quick PCR start.

**`editor/ContainerEditorSkeleton.jsx`** (24.82 → ~26-27 KB)
- Add frozen banner при `container.frozen === true`.
- Add «Save As fork» button (clone container w/o frozen, inherit pending edits, prompt for name).
- Apply/Discard buttons disabled when frozen.
- Inline rename disabled when frozen.

**`canvas/ContainerBlock.jsx`** (8.52 → ~9-10 KB)
- Add lock 🔒 mini-overlay when container.frozen.
- Add dispatch на oligonucleotide kind: render `OligonucleotideBlock` instead of default molecule block.
- Use `container-kind-registry.js` для kind-based rendering.

### Удаляемые (полностью)

- `editor/derive-primers.js` (2.78 KB) — dead helper, SKELETON_COMMITS=[].
- `editor/fixture-puc19.js` (4.71 KB) — был для operation popup'ов которые удалены K3 предыдущего sprint'а. Либо delete, либо move to `__tests__/fixtures/fixture-puc19.js` if нужен тестам.

### Удаляемые fragments из existing files

- В `skeleton-state.js`: cases `OPEN_EDITOR_DRAFT`, `SET_ACTIVE_DRAFT`, `SET_ACTIVE_TAB`. State fields `draftSessions`, `activeDraftId`, `editorContext.draftId`, `popup`. Helpers ссылающиеся на draftSessions.
- В `fixture-canvas-skeleton.js`: `SKELETON_DRAFTS=[]` export (если не используется тестами — verify в K3).

## 8. Порядок выполнения K1..K12

### K1 — Разведка v0.5 algorithm core (БЛОКЕР)

**Без правок кода.** Прочитать файлы:
- `gui/designer/src/local-primer-design.js`
- `gui/designer/src/tm-calculator.js`
- `gui/designer/src/restriction-db.js`
- `gui/designer/src/golden-gate.js`
- `gui/designer/src/mutagenesis.js`

Для каждого файла определить:
1. **Pure-function signature** — exists ли function которая принимает inputs и возвращает outputs **без** store reads.
2. **Store coupling** — если file читает `useStore.getState()` либо принимает store as arg либо имеет implicit store-dependency — какая часть pure-extractable.
3. **Test coverage** — какие tests существуют, что они валидируют.

Document K1: `docs/SPRINT_M_CANVAS_OPS_K1_DISCOVERY.md` — table per algorithm с фактическим signature, coupling status, predicted adapter shape.

**Блокер K1.** Если v0.5 algorithm core значимо coupled и pure extraction требует широкого рефакторинга v0.5 production code — **остановиться**, поднять к Chat. Re-evaluate: либо minimal coupling-wrapper, либо full v0.5 algorithm rewrite в `canvas/operations/lib/` без harvest. Решение принимается на этом блокере, не во время K6-K10.

**Тесты K1:** нет — это разведка.

### K2 — State.js split

В `store/`:
1. Создать `skeleton-state-canvas.js` с extracted state + actions + sub-reducer. Test-first: один smoke-test что split не сломал existing tests.
2. Создать `skeleton-state-operations.js` — пустая shell + initialState + empty reducer cases (filled later K4).
3. Создать `skeleton-state-editor.js` с extracted state + actions + sub-reducer.
4. `skeleton-state.js` стать router'ом: imports sub-reducers, main reducer dispatches by action.type prefix либо by exhaustive switch, base state remains.
5. `skeleton-context.jsx` exports не меняются (compatibility).

**Тесты K2 (≥4):**
- `skeleton-state.split.test.js` — все existing actions ещё работают (smoke).
- `skeleton-state.canvas-slice.test.js` — extracted canvas actions test.
- `skeleton-state.editor-slice.test.js` — extracted editor actions test.
- `skeleton-state.cross-domain.test.js` — REMOVE_CONTAINER cleans operations references (когда operations появятся в K4, этот тест initially placeholder).

**Stop K2.** Если existing tests падают — fix немедленно, не двигаться дальше.

### K3 — GC legacy

В `store/skeleton-state.js` + `fixture-canvas-skeleton.js`:
1. Удалить state.draftSessions, state.activeDraftId, state.editorContext.draftId, state.popup.
2. Удалить reducer cases OPEN_EDITOR_DRAFT, SET_ACTIVE_DRAFT, SET_ACTIVE_TAB.
3. `state.editorContext` упрощается до `{viewOnlyContainerId: string | null}` raw shape.
4. `SKELETON_DRAFTS` export remove from fixture.
5. Удалить `editor/derive-primers.js` (file delete).
6. Удалить `editor/fixture-puc19.js` либо перенос в `__tests__/fixtures/`.

**Тесты K3:**
- Existing tests pass после GC.
- Smoke test: `state.draftSessions === undefined` (после GC).

### K4 — Operation as data shape

В `store/skeleton-state-operations.js`:
1. Initialize state: `{operations: []}`.
2. Reducer cases:
   - `OP_ADD(payload: {position, kind?, inputs?, junctionRef?}) → adds draft operation`
   - `OP_REMOVE(operationId)` — drops operation, unfreezes inputs (if no other op refs them).
   - `OP_SET_POSITION(operationId, position)`
   - `OP_SET_KIND(operationId, kind)` — draft → committed.
   - `OP_SET_PARAMS(operationId, params)` — merge into operation.params.
   - `OP_EXECUTE(operationId)` — covered K9.
   - `OP_RESET(operationId)` — failed → committed for retry.
3. `skeleton-context.jsx` — exports new actions + `useOperations` / `useOperationById` hooks.

**Тесты K4 (≥8):**
- OP_ADD создаёт draft operation.
- OP_REMOVE удаляет.
- OP_SET_POSITION применяется.
- OP_SET_KIND переводит draft → committed.
- OP_SET_PARAMS мерджит.
- OP_RESET переводит failed → committed.
- REMOVE_CONTAINER (cross-domain) удаляет operations referencing this container as input/output.
- useOperationById hook возвращает correct operation.

### K5 — OperationNode v2

`canvas/OperationNode.jsx` rewrite:
1. Props: `operation` (full operation object).
2. Status-driven visual: draft (dashed grey ромб), committed (solid kind-coloured), executed (filled + ✓), failed (red + !).
3. Kind icon inline.
4. Click handler: kind=null → open OpKindPicker; kind!=null → open OpPopup.
5. Right-click: context menu (Delete + Re-execute placeholder).

В `CanvasLayoutView` и `CanvasGraphView`:
1. Render `state.operations` array as OperationNode components.
2. Mount OpKindPicker когда `state.openPicker?.operationId === op.id`.
3. Mount OpPopup когда `state.openPopup?.operationId === op.id`.
4. New local state `openPicker` / `openPopup` либо в editor slice.

**Тесты K5 (≥6):**
- OperationNode рендерит correct status visual.
- Click on draft → OpKindPicker opens.
- Click on committed → OpPopup opens.
- Right-click → context menu.
- Status badge text correct ('draft' / 'committed' / 'executed' / 'failed').
- Kind icon correct.

### K6 — OpPopup base + PCROpPopup

`canvas/operations/OpPopup.jsx`:
1. Frame component: header + body slot + footer (Cancel / Execute).
2. Esc closes (Cancel).
3. Click outside closes (Cancel).
4. Absolute positioned anchored to operation.

`canvas/operations/OpKindPicker.jsx`:
1. Popover with 3x2 grid.
2. Click tile → onPick(kind).

`canvas/operations/PCROpPopup.jsx`:
1. Template select: dropdown from canvas containers filtered by kind='molecule'.
2. Primer pair select: dropdown from oligonucleotide containers, либо 2 separate (toggle).
3. Auto-design primers checkbox.
4. Annealing temp input (default min(Tm)-5).
5. Extension time input (default template.length/1000).
6. Execute → dispatch OP_EXECUTE → adapter.

**Тесты K6 (≥10):**
- OpPopup mounts at operation position.
- Esc closes.
- Click outside closes.
- Cancel button closes без Execute.
- OpKindPicker renders 6 tiles.
- Click PCR tile sets kind=pcr.
- PCROpPopup template select shows only molecule containers.
- PCROpPopup primer pair select shows only oligonucleotide containers.
- Auto-design checkbox toggles.
- Execute button triggers OP_EXECUTE.

### K7 — CutOpPopup + GibsonOpPopup

`canvas/operations/CutOpPopup.jsx`:
1. Template select (any container).
2. Enzyme multi-select из `restriction-db` (filter by name / overhang).
3. Preview: shows cut positions + fragment lengths.
4. Execute → adapter → result.fragments.

`canvas/operations/GibsonOpPopup.jsx`:
1. Multi-select linear fragments.
2. Drag-and-drop reorder.
3. Method select (overlap | goldengate).
4. Topology output toggle.
5. Execute → adapter.

**Тесты K7 (≥12):**
- Cut popup enzyme search filters by name.
- Cut preview shows correct cut count.
- Cut execute creates N fragments (для N cut sites).
- Gibson popup accepts ≥2 fragments.
- Gibson reorder works.
- Gibson method overlap vs goldengate.
- Gibson execute creates assembly.
- Gibson circular vs linear topology output.
- Error handling: Cut on circular without cut site → no-op + warning.
- Error handling: Gibson without overlap → adapter error → operation status='failed'.

### K8 — LigateOpPopup + KLDOpPopup + MutagenesisOpPopup

3 popups, ~5-7 tests each.

### K9 — COMMIT_OPERATION_V2 + frozen-on-use

В `store/skeleton-state-operations.js`:
1. `OP_EXECUTE` reducer:
   - Lookup operation by id, assert committed.
   - Dispatch to `canvas/operations/lib-adapters.js::executeOperation(operation, contextSnapshot)`.
   - На success: status='executed', containers append outputs, frozen=true on inputs (cross-domain effect via main reducer chain), positions auto-assigned, toast.
   - На error: status='failed', error message stored.
2. `OP_REMOVE` unfreezes inputs if no other operations reference them (cross-domain lookup).

Editor banner:
1. ContainerEditorSkeleton checks `container.frozen` — renders red banner.
2. Apply/Discard disabled.
3. «Save As fork» button replaces Apply: prompt for name → `OP_FORK_CONTAINER(containerId, newName)` → creates new container with pending edits applied, removes frozen from clone.

**Тесты K9 (≥10):**
- OP_EXECUTE on PCR creates amplicon container.
- OP_EXECUTE on Cut creates N fragment containers.
- OP_EXECUTE on Gibson creates assembly.
- frozen=true set on inputs after execute.
- OP_REMOVE unfreezes inputs if last reference.
- OP_REMOVE keeps frozen if another op references same container.
- Editor banner appears on frozen container.
- Apply button disabled on frozen.
- Save As fork creates new container without frozen.
- Save As fork inherits pending edits.

### K10 — Custom Oligonucleotide container kind

1. `canvas/container-kind-registry.js` — registry с molecule + oligonucleotide + placeholder.
2. `canvas/OligonucleotideBlock.jsx` — render component.
3. `containerFromLibraryEntry` extension: detects oligonucleotide entries (entry.payload.purpose === 'pcr_primer' либо entry.kind === 'oligonucleotide') и создаёт correct shape.
4. `containerFromKindRegistry` helper — `(kind, payload?) → Container` для placeholder-create / + button create.
5. ContainerBlock dispatches к OligonucleotideBlock для kind='oligonucleotide'.
6. Tree icon updates: oligonucleotide entries get 🧬 icon.

**Тесты K10 (≥6):**
- Oligonucleotide registry entry exists.
- OligonucleotideBlock renders two sequence lanes.
- Tm pill shows correct value.
- ContainerBlock dispatches by kind.
- PCR popup primer select filters by kind='oligonucleotide'.
- Drag-drop oligonucleotide to canvas creates oligonucleotide container.

### K11 — Tests + cleanup

1. Полный test run; fix any flaky.
2. Integration test: full PCR + Cut + Gibson chain on pUC19 fixture (end-to-end).
3. Performance smoke: 50 containers + 20 operations не лагает (drag positions stays responsive).

**Тесты K11 (≥4):**
- E2E PCR amplicon creation.
- E2E Cut → 2 fragments.
- E2E Gibson amplicon + fragment → circular.
- Performance smoke.

### K12 — Sanity + size check

1. `list_directory_with_sizes` на всех изменённых директориях.
2. Verify hard limits: all .jsx < 40 KB, all .js < 25 KB.
3. Verify soft limits (advisory): .jsx < 30 KB, .js < 20 KB.
4. Update docstring у `skeleton-state.js` отражая router pattern.
5. Run `npm test`. Все зелёные.

**Stop K12.** Manual end-to-end на pUC19 fixture — biolog ladder из ROADMAP §2 шаги 1-7 проходят без сбоев. Ждать визуальной приёмки в отдельной сессии.

## 9. Тесты — итого

K2 split: ≥4 + ~2 вариации = 6
K3 GC: ≥3
K4 operations data: ≥8 + ~2 вариации = 10
K5 OperationNode: ≥6
K6 OpPopup + PCR: ≥10 + ~3 вариации = 13
K7 Cut + Gibson: ≥12 + ~3 вариации = 15
K8 Ligate + KLD + Mutagenesis: ≥15 (5 each)
K9 EXECUTE + frozen: ≥10 + ~3 вариации = 13
K10 oligonucleotide: ≥6 + ~2 вариации = 8
K11 integration: ≥4

**Ожидание новых: ~88-95 тестов.** Старых не удаляется (legacy GC уже сделан, тестов на dead code не было). Чистый рост ~88-95.

## 10. Риски (топ-5)

1. **v0.5 algorithm core может быть store-coupled непроходимо.** K1 разведка обязательна. Если выясняется, что pure extraction требует широкого рефакторинга — поднять к Chat для re-scoping. **Mitigation:** worst-case rewrite algorithm core в `canvas/operations/lib/*-pure.js` (full reimplementation на основе v0.5 logic), без harvest. Это удвоит K6-K10 объём, но не блокирует Sprint.

2. **OpPopups вырастают за 8 KB despite intent.** Hard cap на popup — 8 KB. Если PCROpPopup вырастает до 10 KB после auto-design integration — extract sub-component (например, `PrimerSelectorWidget` shared между PCR и KLD). **Mitigation:** K6+K7+K8 step-by-step с size check после каждого popup.

3. **Frozen-on-use ломает существующий editable=true.** Editor получает дополнительный condition. Banner + Save As fork работают correctly только если pending edits применяются к fork, не к frozen. **Mitigation:** explicit test «Apply on frozen does nothing; Save As fork applies». Если biolog сбит with confused — UX clarity priority над perfectionism.

4. **State split ломает existing tests если imports не обновлены.** `useSkeletonActions().setPosition` теперь может оказаться в canvas slice. **Mitigation:** K2 step-by-step + smoke test prior moving к K3+. Если падает — rollback split и попробовать smaller chunks.

5. **Custom container kinds расползаются в много мест.** Tree icon (LibraryTreeRoot), ContainerBlock render, FILL_PLACEHOLDER accept, ADD_CONTAINER_FROM_ENTRY, PCR popup filter. Если registry не centralized — N мест menять одновременно при добавлении нового kind. **Mitigation:** K10 enforce `container-kind-registry.js` как single source of truth; все callsites через lookup.

## 11. Открытые вопросы

**Q1 — Operation re-execute.** В этом sprint'е re-execute = create new operation manually. Альтернатива: button «Re-execute» на existing executed operation создаёт **новую** operation с pre-filled params (default values из old). Решение **отложено на M-CANVAS-POLISH** — здесь не реализуется.

**Q2 — Operation draft state visualisation.** Где живёт «список pending operations» — на canvas как dashed ромб (текущее decision) или в отдельной panel «Pending operations» внизу canvas? **Default — на canvas**, panel — overkill пока. Если biolog найдёт что dashed-операции теряются в N=10+ — reconsider в M-POLISH.

**Q3 — Junction → Gibson operation auto-link timing.** Когда biolog кликает junction kind picker → создаётся Gibson operation немедленно (kind=gibson, status=committed, inputs=[junction.from, junction.to]) или нужен «execute» step? **Default — committed immediately**, biolog должен ещё раз click execute для actual run. Это симметрично с manual + Operation button → kind picker → committed → execute flow.

**Q4 — Multi-input PCR.** PCR один template per operation. Multi-template PCR (несколько templates через одну primer pair — overlap-extension PCR) — **out of scope**, поддержим в M-CANVAS-POLISH либо после wave.

**Q5 — Mutagenesis-as-canvas-operation vs editor mutagenesis tab.** Canvas Mutagenesis operation = **full-container mutation** (mutations applied to whole sequence, output = new container with mutations). Editor mutagenesis tab (M-CANVAS-MUTAGENESIS sprint) = **intra-region** (select region → mutation → applied in pending edits либо fork). Это разные surfaces разной granularity. **Default decision:** их параллельное существование оправдано — canvas для experiment planning (Mutagenesis как step в protocol), editor для quick local fixes.

**Q6 — Oligonucleotide custom kind: один или два sequences.** Primer pair = 1 oligonucleotide container with 2 sequences (forward + reverse), либо 2 separate containers? **Default:** **поддерживаем оба варианта** — biolog может организовать как удобнее. PCR popup принимает либо 1 oligo with 2 sequences либо 2 separate. Tree shows oligo containers as single rows; expand → see both sequences.

**Q7 — Frozen-on-use на oligonucleotide.** Primer-container используется в PCR → должен ли быть frozen? Биолог может тех же primers использовать в нескольких PCR (типично). **Default decision:** oligonucleotide kind **не получает frozen** — primer designs reusable, не consumed. Frozen применяется только к molecule kind.

## 12. Code handoff (одной фразой)

> Новая сессия — прочитай оба свежих документа **`docs/SPRINT_M_CANVAS_OPS.md`** (эта спека) и **`docs/ROADMAP_CANVAS_V2_TO_PRODUCTION.md`** (оба от 12.05.2026 поздний вечер) + **`CHAT_PLAYBOOK_CORE.md`** + **`CURRENT_TASK.md`** + **`docs/NOTES_CANVAS_V2_KICKOFF.md`**, затем выполни K1–K12 строго последовательно с size check после каждого K (K1 — разведка v0.5 algorithm core `local-primer-design.js` / `tm-calculator.js` / `restriction-db.js` / `golden-gate.js` / `mutagenesis.js` — **БЛОКЕР**: если pure extraction требует широкого рефакторинга v0.5 production code, остановись и подними к Chat для re-scoping; K2–K3 foundation stable до K4; K4–K10 operation infrastructure + kinds; K11–K12 tests + sanity), спеку не переписывай, после зелёного K12 (тесты + size sanity + manual e2e на pUC19) остановись для визуальной приёмки в отдельной сессии — DECISIONS / COMPONENT_MAP / PROJECT_STATE / RELEASES / BUGS / TECH_DEBT / CLAUDE.md финализирует Chat.

---

_Создан 12.05.2026 поздний вечер. Версия 1.0. Wave-первый sprint, после prototype-V2 (12.05.2026). Cross-refs: `docs/ROADMAP_CANVAS_V2_TO_PRODUCTION.md`, `docs/NOTES_CANVAS_V2_KICKOFF.md`, `docs/SPRINT_CANVAS_V2_EDITOR_FULL.md` (предыдущий sprint, к архивированию после OPS acceptance)._
