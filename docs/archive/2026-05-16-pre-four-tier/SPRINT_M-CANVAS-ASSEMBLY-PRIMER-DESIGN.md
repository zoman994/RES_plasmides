# SPRINT M-CANVAS-ASSEMBLY-PRIMER-DESIGN — Primer Design на Assembly View (A3)

**Дата спеки:** 15.05.2026 (batch с A1/A2/A4).
**Тип:** A.
**Target размер спеки:** ~25 KB.
**Источник:** chat-сессия Игоря 15.05 — «подбираю primers глядя на границы фрагментов». A2 даёт AssemblySequenceView с coloured zones; A3 добавляет primer design ON этой view используя F3-rework patterns (SequenceView API: onSelectRange, onWritePrimer, primers prop, showSelectionTm).
**Цепочка:** A1 → A2 → **A3 этот sprint, primer design** → A4 Realise as DAG.
**Статус:** черновик Chat 15.05.2026, batch.
**Зависимости:** A1 (assemblies data model) + A2 (AssemblySequenceView mounted) + F3 rework leftovers (`lib/operation-pcr-bridge.js`, `recomputeFromSelection`) + V74 `onWritePrimer` API + V76 `showSelectionTm`.

---

## 0. Срез размеров затрагиваемых модулей

| Файл | После A1+A2 | Действие в A3 |
|---|---|---|
| `editor/assembly/AssemblyShell.jsx` | ~10-12 KB | +1-2 KB (primer design wiring + AssemblyPrimerPanel mount) |
| `editor/assembly/AssemblySequenceView.jsx` | ~5-7 KB | +1 KB (onWritePrimer wired, showSelectionTm always true) |
| `store/skeleton-state-assemblies.js` (A1) | ~10-12 KB | +1-2 KB (ASSEMBLY_ADD_PRIMER / REMOVE / UPDATE) |
| `lib/assembly-model.js` (A1) | ~6-8 KB | +0.5 KB (shape хелпер makePrimerForAssembly) |
| `store/skeleton-context.jsx` | ~12 KB | +0.5 KB (assembly primer actions) |

Новые файлы:
- `editor/assembly/AssemblyPrimerPanel.jsx` ~6-8 KB (right panel: primer pairs list, actions).
- `store/selectors-assembly-primers.js` ~3-5 KB (computeAssemblyPrimerOnBoundaries, computeViewerPrimers).
- `lib/assembly-primer-bridge.js` ~3-4 KB (wraps recomputeFromSelection для assembly context: selection map в source coords).

Все под soft limit.

---

## 1. Контекст и связи перед действием (§17 R4)

### Откуда

После A1/A2 биолог работает с continuous assembly sequence + coloured segments + side panel segments. Логичный следующий шаг — **писать primers на этой view**. Selection в SequenceView → Ctrl+R → primer pair добавляется. F3 rework (V71-V74) дал готовые механики: `onSelectRange`, `onWritePrimer` context-menu, `primers` prop для overlay, `showSelectionTm` для Tm hint near cursor, `recomputeFromSelection` для bio-design.

A3 поднимает эти patterns в assembly context. Главное отличие — **primer attached к assembly draft**, не к operation. В A4 при Realise as DAG — primers будут привязаны к derived operations.

### Где задача сядет

- `editor/assembly/AssemblyShell.jsx` — добавляет AssemblyPrimerPanel в layout (right column, рядом или вместо AssemblySegmentsPanel — toggle / split).
- `editor/assembly/AssemblySequenceView.jsx` — wired `onWritePrimer` (V74 API) дёргает A3 logic. `showSelectionTm` всегда true в assembly context.
- `store/skeleton-state-assemblies.js` (A1) — расширяется new actions для primers. AssemblyDraft shape расширяется на `primers: AssemblyPrimer[]`.
- `lib/assembly-primer-bridge.js` — связывает selection в assembly coords с recomputeFromSelection (которое работает на template containers). Помогает с **boundary-aware** дизайном: primer на границу двух segments → один из них = «template» (forward strand), второй = «overhang source» (даёт tail).
- `lib/assembly-model.js` — extension shape + `makePrimerForAssembly`.
- `store/selectors-assembly-primers.js` — derive primers для viewer (map в SequenceView primers shape с binding/sequence) + boundary analysis (какие segment edges cover'ed primer'ами).

### Что НЕ задеваем

- A1 reducer cases для segments — без изменений.
- A2 segments panel / source picker / drafts panel — без изменений (но layout AssemblyShell расширяется).
- F2/F3/F4 — без изменений (F3 PcrModeShell остаётся для isolated-PCR; primers там per-op, here per-assembly).
- Primer pool (state.primers если такой есть после R5-R9) — assembly primers НЕ автоматически добавляются в pool. Promote в pool — отдельная action (Q3).

### Дубли check (§17 R1)

- **AssemblyPrimerPanel vs PrimerSuggestionsPanel (F3)** — оба right-panel с primer list. PrimerSuggestionsPanel специализирован под one-PCR-op context (designed pair + reuse from pool + order N oligos), AssemblyPrimerPanel — multiple pairs + boundary coverage view. Pattern похож, контент разный. Реальный refactor в общий `PrimerListPanel` — преждевременно (DRY 3-rule), отложить.
- **assembly-primer-bridge vs operation-pcr-bridge (F3)** — оба обёртка над recomputeFromSelection. Bridge ассембли работает с **assembly-coordinate selection** (offset в assembly sequence) → resolves в source container via segmentMap → calls recomputeFromSelection для конкретного source. operation-pcr-bridge работает с **template-coordinate selection** напрямую. Разный input — не дубль.

### Запрещённые слова §17 R3 — обоснования

- «**Новый компонент** AssemblyPrimerPanel»: assembly primer UX requires boundary-coverage visualization которая отсутствует в PrimerSuggestionsPanel. Reuse невозможен без расширения PrimerSuggestionsPanel на multi-pair context, что излишне сложнее чем отдельный компонент.

---

## 2. Стратегия

Primer design на assembly = native SequenceView selection + V74 `onWritePrimer` context-menu (правая кнопка → «Прямой primer» / «Обратный primer»). Ctrl+R и Ctrl+Alt+R hotkeys (V72) **работают в assembly tab** так же как в F3 PcrModeShell (lifecycle scope через useHotkey).

Bridge `assembly-primer-bridge::recomputePrimerFromAssemblySelection(state, assemblyId, selStart, selEnd, direction)`:
1. Resolve selection [selStart, selEnd] в assembly coords.
2. Через segmentMap (computeAssemblySequence) — найти какой segment(s) contains selection.
3. Если selection полностью внутри одного sourced segment:
   - Map к source container coords + orientation.
   - Call existing `recomputeFromSelection(sourceContainer, mappedStart, mappedEnd)`.
   - Return primer attached to `sourceSegmentId`.
4. Если selection cross-cuts boundary:
   - **Это primer для boundary** (overlap-PCR situation).
   - Forward direction: source = left-segment (template), tail = right-segment 5'-end (overhang).
   - Reverse direction: source = right-segment (template, RC), tail = left-segment 3'-end RC.
   - Return primer с tail-aware structure (`fwdBinding` отдельно от `forward = tail + binding`).
5. Если selection в gap или orphan — toast «primer на gap не поддержан».

Result → `addAssemblyPrimer(assemblyId, primer)` action.

AssemblyPrimerPanel показывает list pairs:
- Каждая пара = card с forward/reverse strings, Tm, source segment(s) info, boundary coverage indicator.
- Actions: rename, delete, edit (open edit modal с manual sequence override).
- Empty state: «Выдели регион → Ctrl+R или ПКМ → Прямой/Обратный primer».

Primers рендерятся в SequenceView через `primers` prop (V71 mechanism, binding indexOf). Tooltip on hover: «Primer fwd / boundary segment A→B / Tm 62.3°C».

Tm hint при selection — V76 `showSelectionTm` always true в AssemblySequenceView.

---

## 3. Scope IN / OUT

### IN

- AssemblyDraft shape extension: `primers: AssemblyPrimer[]`.
- AssemblyPrimer shape: id, forward/reverse, fwdBinding/revBinding, fwdTm/revTm, source attachment metadata, label, createdAt, updatedAt, status.
- Reducer cases: `ASSEMBLY_ADD_PRIMER`, `ASSEMBLY_REMOVE_PRIMER`, `ASSEMBLY_UPDATE_PRIMER`, `ASSEMBLY_RENAME_PRIMER`.
- `lib/assembly-primer-bridge.js::recomputePrimerFromAssemblySelection`.
- `store/selectors-assembly-primers.js::selectViewerPrimers` (assembly primers → SequenceView primers-prop shape).
- `store/selectors-assembly-primers.js::selectBoundaryCoverage` (для каждой boundary в assembly — есть ли primer fwd + reverse cover'ing it).
- `editor/assembly/AssemblyPrimerPanel.jsx`.
- AssemblySequenceView wired для `onWritePrimer` + Ctrl+R/Alt+R hotkeys (V72 reuse).
- Tm hint в AssemblySequenceView (V76).
- Primer rename / delete / manual edit (edit modal — пара text inputs forward/reverse + Tm display).
- Tests на bridge + selectors + reducer + UI integration.
- Migration: A3 расширяет shape — schema v4 → v5 (если A1 закрепил v4) с migration adds `primers: []` to existing assembly drafts.

### OUT

- Reverse-DAG / Realise — A4.
- Auto-design primers для ALL boundaries (one-click «design primers for all») — рассматривается как opt-in feature, **OUT** для A3 — могло бы вызвать накопление, биолог должен явно design каждый.
- Primer pool promotion (assembly primer → state.primers) — Q3.
- Primer cost estimation (для order) — A4 (Order Oligos integration на assembly уровне).
- Multi-primer pairs для одной boundary (например split-PCR с двумя оверлапами) — advanced, OUT.
- Primer drag-handles (5'/3' visual adjustment как было в F3 до V71 rework) — НЕ переоткрываем (rework принял decoupled).
- Annotation feature transfer (segment с CDS аннотацией → primer аннотированный) — advanced, OUT.

---

## 4. Архитектурные решения

### DEC-CANVAS-ASM-PRIMER-01 — AssemblyPrimer shape

```
AssemblyPrimer = {
  id: 'asm-primer-' + uuidv7(),
  pairId?: string,                     // id связки fwd+rev primer пары (если в паре)
  direction: 'forward' | 'reverse',
  
  sequence: string,                    // финальная ATCG строка primer для order (binding + optional tail)
  bindingSequence: string,             // только binding part (для PrimerTrack indexOf match)
  tm: number,                          // расчёт от bindingSequence через calcTm
  gc: number,                          // GC%
  
  source: {
    kind: 'segment' | 'boundary',
    segmentId?: string,                // если kind='segment' — на каком segment'е primer
    boundaryAtOffset?: number,         // если kind='boundary' — assembly offset границы
    leftSegmentId?: string,            // на boundary — какой segment слева
    rightSegmentId?: string,           // и справа
    selectionStart: number,            // assembly coords, для recovery / показа на view
    selectionEnd: number,
  },
  
  label: string,                       // user-given название, default 'PRIMER-F-<n>' / 'PRIMER-R-<n>'
  status: 'auto' | 'edited' | 'reused',
  notes: string,                       // optional comment
  createdAt: number,
  updatedAt: number,
}
```

**Rationale:** sequence = financial primer (что закажется), bindingSequence = template-match part (overlay rendering). status mirrors PCR mode (V71-V73 patterns).

### DEC-CANVAS-ASM-PRIMER-02 — Pair grouping через pairId

Когда biolog пишет Ctrl+R forward на selection X — создаётся primer с direction='forward'. Если потом Ctrl+Alt+R reverse на похожем selection — создаётся primer reverse с тем же `pairId` IF:
- Reverse selection overlaps с forward selection (same boundary / same segment region).
- Same source attachment.

Иначе — отдельная pair, новый pairId.

Биолог в panel видит pairs grouped (forward + reverse side-by-side в одной card если same pairId; иначе отдельно).

**Rationale:** биолог думает парами primers (для PCR), но иногда пишет один primer без pair (e.g. для sequencing). Pair grouping — convenience, не обязательно.

### DEC-CANVAS-ASM-PRIMER-03 — Bridge boundary-aware logic

`recomputePrimerFromAssemblySelection(state, assemblyId, selStart, selEnd, direction): AssemblyPrimer`:

```
1. assemblySequence = computeAssemblySequence(state, assemblyId)
2. segmentMap iter: find segment(s) overlap [selStart, selEnd]
3a. If single sourced segment:
    - mapToSourceCoords(segment, selStart, selEnd) → {sourceStart, sourceEnd}
    - Account for segment.orientation = 'reverse' if RC.
    - pair = recomputeFromSelection(sourceContainer, sourceStart, sourceEnd) — existing F3 helper.
    - return AssemblyPrimer with source.kind='segment', segmentId=segment.id.
3b. If boundary (cuts between two segments at boundaryOffset):
    - If direction='forward':
      template = leftSegment, anchor = boundaryOffset + few bp into right segment
      binding = leftSegment.sourceSequence[binding region]
      tail = rightSegment.sourceSequence[первые ~15-30 bp from boundary] (5'-overhang)
    - If direction='reverse':
      template = rightSegment, anchor = boundaryOffset - few bp into left segment (RC)
      binding = reverseComplement(rightSegment.sourceSequence[binding region])
      tail = reverseComplement(leftSegment.sourceSequence[последние ~15-30 bp]) (5'-overhang)
    - sequence = tail + binding
    - return AssemblyPrimer with source.kind='boundary', leftSegmentId, rightSegmentId.
3c. If selection touches gap segment:
    - toast «primer in gap not supported», return null.
3d. If selection touches orphan:
    - toast «primer на orphan segment не поддержан», return null.
4. If RC binding adjustments needed (segment.orientation='reverse'), handle in mapToSourceCoords.
```

`mapToSourceCoords(segment, assemblyOffsetStart, assemblyOffsetEnd)`:
- relativeOffset = assemblyOffset - segment.offset.
- If orientation='forward': sourceOffset = segment.sourceRangeStart + relativeOffset.
- If orientation='reverse': sourceOffset = segment.sourceRangeEnd - relativeOffset (RC mapping).

### DEC-CANVAS-ASM-PRIMER-04 — `selectViewerPrimers` for SequenceView primers prop

```
selectViewerPrimers(state, assemblyId): SequenceViewPrimer[]
```

Iter assembly.primers:
- Each primer → SequenceViewPrimer shape `{name, sequence (full), bindingSequence, direction, tmBinding}`.
- bindingSequence для indexOf matching (V71 pattern). Если binding в SOURCE container'е — на assembly sequence это будет position computed как segment.offset + offset_in_source.
- В SequenceView indexOf search через всю assembly sequence — works correctly если binding не повторяется внутри assembly. (Edge case: binding повторяется (palindrome / repeat) — primer track shows multiple matches → ambiguous. Acceptance.)

### DEC-CANVAS-ASM-PRIMER-05 — Boundary coverage indicator

```
selectBoundaryCoverage(state, assemblyId): BoundaryCoverage[]
```

Each boundary returned by `lib/assembly-model::segmentBoundaries`:
- coverage: {fwd: boolean, rev: boolean, fwdPrimerId?, revPrimerId?}.
- fwd=true если any primer с source.kind='boundary' && boundaryAtOffset = this boundary && direction='forward'.

UI:
- AssemblyPrimerPanel header: «Boundaries: 3 / 4 covered (1 missing reverse)».
- В AssemblySequenceView — small indicator на boundary в overlay: zелёная точка если fwd+rev, жёлтая если только одна, красная если ни одной.

### DEC-CANVAS-ASM-PRIMER-06 — Panel layout: AssemblyPrimerPanel parallel или toggle с AssemblySegmentsPanel?

Дефолт: **toggle** в right column — биолог переключает между «Segments view» (A2) и «Primers view» (A3) через tab-strip в header right column. Это economy of screen — обе panel'ы 280 px на одной стороне = много.

Альтернатива: parallel — segments panel сужается до 200 px, primer panel 200 px. Total 400 px right side. Менее места для main SequenceView.

Хотя — другая альтернатива: bottom toolbar tabs «Segments | Primers | Boundaries (coverage info)» — клик переключает right panel. Минимальный footprint. Take this.

### DEC-CANVAS-ASM-PRIMER-07 — Primer rename / edit / delete

AssemblyPrimerPanel each card:
- Click name → inline edit.
- ⋮ menu: Edit sequence (manual override → status='edited'), Reuse from pool (если pool exists; Q3), Delete.
- Edit modal: two text inputs (forward / reverse), validation (ATCG only), Tm display recomputed, save → ASSEMBLY_UPDATE_PRIMER.

### DEC-CANVAS-ASM-PRIMER-08 — Hotkey scope в assembly tab

`useHotkey('pcr-primer-forward', ...)` уже зарегистрирован в V72. В AssemblyShell — registered with **same hotkey id** но другой handler (assembly-context recompute).

Hotkey resolver скилл `resolveScope` (lib/hotkeys.js) — какие scope правила сейчас? Если один handler regiстрируется в нескольких mount points (PcrModeShell + AssemblyShell) — resolver должен подхватить тот что **mounted/visible**.

В A3 — assumption: одна из них mounted (либо PCR tab open, либо assembly tab — не оба одновременно). Если оба mounted — last-registered handler wins (race). Acceptance test это покрывает.

**TODO if collision actual problem:** разные hotkey id для assembly: `assembly-primer-forward` / `assembly-primer-reverse`. Простое распарение. Решить в K1.

### DEC-CANVAS-ASM-PRIMER-09 — Backward-compat A1 shape

`assembly.primers` — new field. A3 adds migration v4 → v5 (если A1 был v4): для existing assemblies добавляется `primers: []`. Idempotent.

---

## 5. Файлы и сигнатуры

### Новые файлы

**`lib/assembly-primer-bridge.js`** (~3-4 KB)

- `recomputePrimerFromAssemblySelection(state, assemblyId, selStart, selEnd, direction): AssemblyPrimer | null`.
- `mapToSourceCoords(segment, asmStart, asmEnd): {sourceStart, sourceEnd, container}`.
- `makeBoundaryPrimer(state, leftSeg, rightSeg, direction, params?): AssemblyPrimer`.
- `makeSegmentPrimer(state, segment, asmStart, asmEnd, direction): AssemblyPrimer`.

**`store/selectors-assembly-primers.js`** (~3-5 KB)

- `selectAssemblyPrimers(state, assemblyId): AssemblyPrimer[]`.
- `selectViewerPrimers(state, assemblyId): SequenceViewPrimer[]` — map в SequenceView prop shape.
- `selectBoundaryCoverage(state, assemblyId): {boundaryAtOffset, fwd, rev, fwdPrimerId?, revPrimerId?}[]`.
- `selectPrimerById(state, assemblyId, primerId): AssemblyPrimer | null`.

**`editor/assembly/AssemblyPrimerPanel.jsx`** (~6-8 KB)

`AssemblyPrimerPanel({ assemblyId })`. Renders:
- Header: «N primers · M boundaries covered».
- Empty state с hint.
- List of pairs (grouped by pairId) + standalone primers.
- Per-pair card:
  - Forward + reverse strings (monospace, truncate if long, click to copy).
  - Tm + GC display.
  - Source attachment info («segment <name>» / «boundary <left> → <right>»).
  - ⋮ menu (rename / edit / reuse / delete).
- Edit modal trigger.
- «+ Pair empty» button — creates empty pair placeholder, biolog заполняет manual (Q4).

### Existing файлы — изменения

**`editor/assembly/AssemblyShell.jsx`** (~+1-2 KB)

Right column extended с tab-strip toggle между Segments / Primers / Boundaries.

PrimerPanel mount + wires `onWritePrimer` (V74), `onCaretChange` (для tracking selection state), hotkey handlers (V72 reuse).

**`editor/assembly/AssemblySequenceView.jsx`** (~+1 KB)

- `showSelectionTm={true}` always (assembly context).
- `onWritePrimer={handleWritePrimer}` wired.
- `primers={selectViewerPrimers(state, assemblyId)}` consumed.

**`store/skeleton-state-assemblies.js`** (~+1-2 KB)

New reducer cases:
- `ASSEMBLY_ADD_PRIMER { assemblyId, primer }` — push в assembly.primers.
- `ASSEMBLY_REMOVE_PRIMER { assemblyId, primerId }`.
- `ASSEMBLY_UPDATE_PRIMER { assemblyId, primerId, patch }`.
- `ASSEMBLY_RENAME_PRIMER { assemblyId, primerId, label }`.

Все обновляют `assembly.updatedAt`.

**`lib/assembly-model.js`** (~+0.5 KB)

`makePrimerForAssembly({sequence, binding, direction, source, tm, gc, label}): AssemblyPrimer`.

**`store/skeleton-context.jsx`** (~+0.5 KB)

Actions: `addAssemblyPrimer`, `removeAssemblyPrimer`, `updateAssemblyPrimer`, `renameAssemblyPrimer`.

Hooks: `useAssemblyPrimers(assemblyId)`, `useBoundaryCoverage(assemblyId)`.

**`store/skeleton-persistence.js`** (~+0.3 KB if schema bump)

Schema v4 → v5 migration: добавляет `primers: []` к assemblies. Idempotent.

### Тесты

`__tests__/canvas-skeleton/assembly-primer-design.test.jsx` (~10-12 KB).

Покрытие:

1. **AssemblyPrimer shape valid:** makePrimerForAssembly creates correct object.
2. **mapToSourceCoords forward:** asm offset 100 in segment at offset 50 with sourceStart=200 → sourceOffset 250.
3. **mapToSourceCoords reverse:** account for orientation='reverse'.
4. **recomputePrimerFromAssemblySelection within single segment forward:** correct binding, correct Tm.
5. **recomputePrimerFromAssemblySelection within single segment reverse:** RC binding.
6. **recomputePrimerFromAssemblySelection boundary forward:** binding from left segment, tail from right segment first 15 bp.
7. **recomputePrimerFromAssemblySelection boundary reverse:** binding from right segment RC, tail from left segment RC.
8. **selection within gap:** returns null, toast pushed.
9. **selection touches orphan:** returns null, toast pushed.
10. **ASSEMBLY_ADD_PRIMER:** primer in assembly.primers, updatedAt bumped.
11. **ASSEMBLY_REMOVE_PRIMER:** removed.
12. **ASSEMBLY_UPDATE_PRIMER manual edit:** sequence overridden, status='edited'.
13. **selectViewerPrimers:** mapping to SequenceView shape correct (bindingSequence preserved).
14. **selectBoundaryCoverage:** boundary 1 covered fwd + rev, boundary 2 only fwd → status reflected.
15. **pairId grouping:** Ctrl+R fwd + Ctrl+Alt+R rev on same selection range → both have same pairId.
16. **pairId not grouping:** different selection ranges → different pairId.
17. **Migration v4 → v5:** existing v4 assembly snapshot → primers: [] added.
18. **AssemblyPrimerPanel renders pairs + standalone:** UI integration.
19. **Inline rename:** click → edit → save → label updated.
20. **Edit sequence manual:** modal save → status='edited', new sequence.
21. **Delete primer:** removed from panel.
22. **Toggle panel Segments → Primers → Boundaries:** right column shows correct content.
23. **Tm hint visible в AssemblySequenceView:** showSelectionTm true → tooltip shown on selection.
24. **Hotkey conflict between PCR tab and Assembly tab:** if A3 keeps same id 'pcr-primer-forward' — last mounted wins. Acceptance test current behavior. If renaming to 'assembly-primer-forward' — confirm both work.

---

## 6. Порядок выполнения

### K1 — Hotkey scope decision + AssemblyPrimer shape + bridge skeleton

- Решить: same hotkey id vs separate (DEC-PRIMER-08 TODO).
- `lib/assembly-primer-bridge.js` skeleton (recompute, mapCoords, make...).
- AssemblyPrimer shape доб в assembly-model.
- Reducer cases stub.
- Migration v4 → v5.
- Tests 1-3.

### K2 — Bridge full implementation

- Within-segment cases (forward + reverse).
- Boundary cases (forward + reverse) с tail logic.
- Gap / orphan guards.
- Tests 4-9.

### K3 — Reducer + context actions

- ASSEMBLY_ADD/REMOVE/UPDATE/RENAME_PRIMER.
- Context actions exposed.
- Tests 10-12.

### K4 — Selectors

- selectAssemblyPrimers, selectViewerPrimers, selectBoundaryCoverage, selectPrimerById.
- Tests 13, 14.

### K5 — Pair grouping logic

- pairId assignment в bridge при создании primer (check existing primers same range/source → reuse pairId).
- Tests 15, 16.

### K6 — AssemblyPrimerPanel UI

- Render + actions (rename, edit modal, delete).
- Empty state + hint.
- Tests 18-21.

### K7 — Right column tab toggle (Segments / Primers / Boundaries)

- AssemblyShell right column extension.
- Boundaries panel — readonly summary of coverage.
- Tests 22.

### K8 — Wire SequenceView (onWritePrimer + primers + showSelectionTm)

- AssemblySequenceView расширение.
- AssemblyShell connects bridge call → addAssemblyPrimer dispatch.
- Tests 23.

### K9 — Hotkey wire + cleanup

- useHotkey wire в AssemblyShell (per K1 decision).
- Tests 24.
- Lint, build, sizes.
- Final отчёт.

**STOP после K9.** Не финализирует.

---

## 7. STOP-условие и формат отчёта

Идентично A1/A2 + дополнительно:

- DECISIONS draft 9 DEC-CANVAS-ASM-PRIMER-NN.
- Manual smoke: «создал draft → 3 sourced segments → selection в первом segment → Ctrl+R → primer fwd добавлен → Ctrl+Alt+R на похожем range → reverse, same pairId → selection на границу A-B → Ctrl+R → boundary primer с tail из B → panel показывает 2 pair groups, boundary coverage 1/2».

---

## 8. Риски

### R-DRIFT (cross-spec) — A3 на A1/A2 без acceptance

Каждое DEC-ASM-PRIMER-NN ссылается на A1/A2. При acceptance review поправки cascade-обновляются.

### R1 — Boundary primer tail length default

DEC-ASM-PRIMER-03 предлагает ~15-30 bp tail. Это hardcoded. В будущем — preference (per-assembly или per-boundary). В A3 — fixed 20 bp default. TECH_DEBT `TD-ASM-BOUNDARY-TAIL-CONFIG`.

### R2 — primers prop indexOf на assembly sequence: false positives

Если binding sequence повторяется в assembly (внутри одного segment OR между segments same source) → SequenceView primer track покажет multiple matches. Acceptance — visual noise приemlemen. TECH_DEBT enhancement: index-based mapping (specific offset вместо indexOf).

### R3 — Hotkey scope conflict PCR/Assembly tab

DEC-PRIMER-08 описывает. Митigation: K1 решить. Если same hotkey id — last mounted wins. Если biolog держит одновременно PCR + Assembly tab (multi-tab F1) — конфликт. К1 → отдельные hotkey id безопаснее.

### R4 — Manual edit primer ломает auto-derive

Если biolog «Edit sequence» → status='edited'. Bridge respect: не перезаписывать edited primer'ы при reactive recompute. Reactive recompute в A3 — fires при изменении assembly segments (boundary moved, segment removed). Edited primer'ы — frozen, могут стать invalid (binding больше не на assembly) — orphan-warn (TODO TECH_DEBT для display).

### R5 — Pair grouping ambiguity

DEC-PRIMER-02 — overlap criterion для same pairId. Может быть subjective. Edge cases: selection ranges overlap by 1 bp — same pair? Threshold 50% overlap default. К1 implement, acceptance видит.

### R6 — Schema v4 → v5 migration cascade

Если A1 финализирован v4, A2 не bumped — v5 adds `primers: []`. Idempotent. Если A1 не bumped (заложил v3 без assemblies field вообще) — coordinated migration: v3 → v4 (adds assemblies: []) → v5 (adds primers per assembly).

---

## 9. Открытые вопросы

### Q1 — Right column layout (Segments / Primers toggle vs parallel) — DEC-PRIMER-06

Дефолт: toggle tab-strip. Альтернатива: parallel split.

### Q2 — Hotkey scope namespace — DEC-PRIMER-08

Дефолт: shared id (`pcr-primer-forward`) — last mounted wins.

Альтернатива: separate (`assembly-primer-forward`). Биолог может назначить разные shortcuts в HotkeySettings (если такая есть). Safer для multi-tab.

### Q3 — Primer pool promotion: assembly primer → state.primers

В A3 — no promotion. Primer живёт в assembly.primers. После A4 Realise — primer переписывается в state.primers (или связывается с derived operation).

Альтернатива: «Promote to Library» action в panel → adds copy в state.primers. Биолог иметь reusable primer для других assemblies / PCR ops.

Я бы оставил «no promotion» в A3 и сделал promotion как часть A4 (auto-promote при Realise) или отдельный mini-sprint.

### Q4 — «+ Pair empty» button — нужен в A3?

Manual primer entry без selection: biolog знает sequence наизусть, кладёт сразу в panel.

Дефолт: yes, useful для копипаста из старых протоколов.
Альтернатива: no, biolog использует Library primer pool. Take yes — это <10 строк UI.

### Q5 — Annotation transfer

Sourced segment может иметь аннотации в source container (e.g. CDS). Должны ли они «протекать» в AssemblySequenceView (рендериться как annotations)?

Дефолт **no** в A3 (упрощение). Annotations transfer — отдельный sprint после MVP, если biolog запросит. В A3 SequenceView не получает annotations prop для assembly.

Альтернатива: «derived annotations» selector → annotations from segments' sources, координаты пересчитываются. Полезно но сложно (edge cases: annotation cross-cuts boundary, partial annotation, RC orientation).

---

## Acceptance gate

После Code STOP:

- В draft с 3 sourced segments → selection within first → Ctrl+R → primer fwd добавлен → AssemblyPrimerPanel показывает.
- Ctrl+Alt+R на overlapping range → reverse в same pair.
- Selection на boundary → Ctrl+R → boundary primer с tail (length ~20 bp), tail = first 20 bp of right segment.
- Tm hint near cursor visible.
- Boundary coverage indicator updated.
- Right column toggle Segments / Primers / Boundaries.
- Inline rename primer.
- Edit modal manual override sequence → status='edited'.
- Delete primer.
- Reload → primers preserved.

---

_Дата:_ 15.05.2026.
_Реализация Code:_ после A1+A2 acceptance + OK Q1-Q5 + compact.
_Acceptance:_ отдельная chat-сессия.
