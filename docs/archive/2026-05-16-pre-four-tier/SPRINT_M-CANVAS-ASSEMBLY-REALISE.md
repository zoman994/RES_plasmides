# SPRINT M-CANVAS-ASSEMBLY-REALISE — Realise Assembly as DAG (A4)

**Дата спеки:** 15.05.2026 (batch с A1/A2/A3).
**Тип:** A.
**Target размер спеки:** ~30 KB.
**Источник:** chat-сессия Игоря 15.05 — «соединяю оverlap'ами до разумного числа кусков и дальше Gibson/рекомбиназа». A4 — финальный шаг: assembly draft превращается в исполняемый DAG operations + junctions + containers, который потом execute'нется по обычному F3/F4 pipeline.
**Цепочка:** A1 → A2 → A3 → **A4 этот sprint, Realise as DAG**.
**Статус:** черновик Chat 15.05.2026, batch.
**Зависимости:** A1 (assembly data model) + A2 (UI) + A3 (primers attached) + F2 (junction shape DEC-JUNC-01) + F3 (operation shape, executePCR adapter) + F4 (virtual output, live product).

---

## 0. Срез размеров затрагиваемых модулей

| Файл | После A1+A2+A3 | Действие в A4 |
|---|---|---|
| `editor/assembly/AssemblyToolbar.jsx` | ~3-4 KB | +0.5 KB (Realise button → opens RealiseModal) |
| `editor/assembly/AssemblyShell.jsx` | ~12-14 KB | +0.5 KB (RealiseModal mount) |
| `store/skeleton-state.js` | ~17 KB | +0.5-1 KB (ASSEMBLY_REALISE action — multi-domain mutation) |
| `lib/strings.js` | — | +0.5 KB (realise UI strings) |

Новые файлы:
- `lib/assembly-realise.js` ~10-12 KB (the algorithm: assembly + per-boundary methods → operations + junctions + containers).
- `lib/assembly-realise-suggest.js` ~5-7 KB (auto-suggest method per boundary based on tails/endings/RE-sites).
- `editor/assembly/RealiseModal.jsx` ~10-12 KB (modal: per-boundary method picker, DAG preview, confirm).
- `editor/assembly/RealiseDagPreview.jsx` ~6-8 KB (mini visual DAG preview inside modal: containers + ops + junctions).
- `editor/assembly/MethodPickerCard.jsx` ~3-4 KB (single boundary card в modal: kind selector + params).

Все под soft limit.

---

## 1. Контекст и связи перед действием (§17 R4)

### Идея

Биолог в A2 сложил assembly из N segments. В A3 написал primers на boundaries (или нет). Жмёт «Realise as DAG» → A4 алгоритм reverse-engineers:

- N PCR operations (амплификация каждого segment'а из source container).
- N-1 junctions между ними с user-chosen method (Gibson / GG / overlap-PCR / RE / direct).
- N output containers (per PCR) + 1 final assembled container.
- Primers from assembly.primers attached к соответствующим PCR ops.

Результат — обычный DAG на canvas, который biolog потом execute'нет через existing F3/F4 pipeline.

**Critical:** Assembly Draft НЕ удаляется при Realise. Он может быть retried (биолог изменил parameters и снова realise → создаются новые ops/junctions; старые могут быть удалены biolog'ом manually). Multi-realise — feature, не bug.

### Где задача сядет

- `editor/assembly/AssemblyToolbar.jsx` — «Realise as DAG» button → opens RealiseModal.
- `editor/assembly/RealiseModal.jsx` — modal с per-boundary method picker + DAG preview + confirm.
- `lib/assembly-realise.js` — pure алгоритм: input (assembly + methods per boundary), output (operations + junctions + containers diff to apply).
- `lib/assembly-realise-suggest.js` — pure алгоритм auto-suggest method per boundary.
- `store/skeleton-state.js` — new action `ASSEMBLY_REALISE { assemblyId, perBoundaryMethods, options }` который dispatch'ит multi-domain mutation (containers + operations + junctions + primers одним atomic update).

### Что НЕ задеваем

- A1 segments / A2 UI / A3 primers — без изменений в data shape.
- F2 junction logic — переиспользуется, не меняется.
- F3 PcrModeShell — без изменений.
- F4 Live Product — derived containers после Realise становятся virtual outputs до OP_EXECUTE (existing F4 mechanism).
- Library — без изменений.

### Дубли check (§17 R1)

- **RealiseModal vs OrderOligosConfirmGate (F3)** — оба modal с confirm UX. RealiseModal сложнее (DAG preview, per-boundary picker), OrderOligosConfirmGate простая chuck-list. Не дубль, отдельный UX.
- **RealiseDagPreview vs MiniProjectCanvas (F1)** — оба mini-vis. MiniProjectCanvas — read-only mini map current canvas. RealiseDagPreview — preview БУДУЩЕГО DAG (ops + junctions + containers которые **появятся** после realise). Не дубль.

### Запрещённые слова §17 R3 — обоснования

- «**Новая модалка** RealiseModal»: per-boundary method picker + DAG preview + confirm — это **функциональное требование** (биолог должен видеть что появится на canvas до confirm). Inline в AssemblyShell не работает (нужна dedicated UI surface). Modal — adequate.

---

## 2. Стратегия

A4 — два слоя:

**Algorithm layer** (`lib/assembly-realise.js`): pure функция `realiseAssembly(assembly, perBoundaryMethods, state): RealiseResult`. RealiseResult — diff к state: operations to add, junctions to add, containers to add, primer attachments. Side-effect: none. State change применяется в reducer через ASSEMBLY_REALISE action.

**Suggest layer** (`lib/assembly-realise-suggest.js`): `suggestMethodForBoundary(state, assembly, boundaryIndex): {method, confidence, rationale}`. Эвристики:
- Если левый segment 3'-end + правый 5'-end overlap >= 20 bp (через bridge) → 'overlap_pcr'.
- Если в assembly.primers есть boundary primers с tail для этой boundary → 'gibson' (overlap ~30 bp).
- Если source containers соседних segments имеют compatible RE-sites на endings → 'restriction'.
- Если ничего не подходит → 'gibson' (default — most general).
- (Mutagenesis / GG — special cases, требуют дополнительной info — не auto-suggested в MVP, биолог manual choose.)

**UI layer** (`RealiseModal.jsx` + sub-components): per-boundary cards с picker + DAG preview обновляется реактивно при изменении picker'а.

ASSEMBLY_REALISE reducer — atomic: создаёт ops + junctions + containers одной операцией, transactional. Если bridge / алгоритм возвращает error — reducer returns unchanged + toast error.

---

## 3. Scope IN / OUT

### IN

- `lib/assembly-realise.js`: realiseAssembly pure function.
- `lib/assembly-realise-suggest.js`: suggestMethodForBoundary pure function.
- `editor/assembly/RealiseModal.jsx` + sub-components.
- `store/skeleton-state.js`: ASSEMBLY_REALISE action.
- DAG preview: visual representation in modal.
- Per-boundary method picker: Gibson / GG / Overlap-PCR / RE / Direct Ligation.
- Confirm UX: «Реализовать» button (disabled until all boundaries methodified).
- Naming generated entities: ops names `<assembly.name>-pcr-<i>`, output containers `<assembly.name>-frag-<i>`, final container `<assembly.name>-product`, primers re-labeled с context.
- Multi-realise: повторный realise создаёт новые ops/junctions с suffix (e.g., `<name>-pcr-1-r2`).
- Primer attachment: assembly.primers с source.kind='segment'/'boundary' → linked to corresponding op.params.userPrimers.
- Position layout: derived ops + containers расставляются на canvas в линию (positions computed).
- Tests на algorithm + suggest + UI integration.

### OUT

- Recombinase-mediated assembly (LR/BP, Cre/loxP) — будущий sprint. В A4 method set: Gibson / GG / Overlap-PCR / RE / Direct Ligation.
- Multi-fragment Gibson optimization (когда 5+ fragments — split на multiple sub-assemblies) — biolog решает manually в A2 (создаёт 2 assemblies). A4 не split'ит автоматически.
- Cost estimation / oligo ordering aggregation — отдельный sprint (post-MVP).
- «Undo Realise» (отмена realisation, удаление derived ops) — через standard undo / manual delete (биолог удаляет ops руками если нужно). TECH_DEBT enhancement.
- Re-derive only changed boundaries (incremental realisation when assembly changes slightly) — full re-realise sufficient в MVP.
- Inverse: «Convert DAG back to assembly draft» — out, отдельный sprint если потребуется.

---

## 4. Архитектурные решения

### DEC-CANVAS-ASM-REAL-01 — RealiseResult shape

```
RealiseResult = {
  ok: boolean,
  error?: string,
  diff?: {
    operations: Operation[],          // new ops to add
    junctions: Junction[],            // new junctions to add
    containers: Container[],          // new output containers
    primerAttachments: [{opId, userPrimers}], // map assembly.primers → op.params.userPrimers
    positionsLayout: {                // x,y coordinates for placement on canvas
      operations: {[opId]: {x, y}},
      containers: {[containerId]: {x, y}},
    }
  }
}
```

ASSEMBLY_REALISE reducer берёт diff и применяет atomically.

### DEC-CANVAS-ASM-REAL-02 — Mapping assembly segments → DAG entities

Для каждого sourced segment'а в assembly:
- 1 PCR operation `op_i` (kind='pcr', inputs=[sourceContainerId], params={template region, primer pair}).
- 1 derived output container `c_i` (final ампликон). После OP_EXECUTE — real container в state.containers; до OP_EXECUTE — virtual via F4.

Для каждой boundary между segments i и i+1:
- 1 junction `j_i` (between output containers c_i и c_{i+1}, kind = chosen method).

Для финальной assembly product:
- 1 «final» operation (kind = одного из 'gibson'/'golden_gate'/'recombinase' для polishing шага) OR series of pair-wise ops (depends on method choice).

Gap segments → не создают PCR op'а:
- Если gap.gapSequence известна → создаётся **synthetic oligo container** (`kind='oligo'`, sequence=gapSequence) + добавляется как input к flanking ops as «overhang source» / linker. Detali в DEC-REAL-04.
- Если gap.gapSequence пуста → realisation **blocked** для этой boundary с явным error «gap unknown sequence at offset X — заполни перед realise».

### DEC-CANVAS-ASM-REAL-03 — Method per boundary

Methods supported in A4:

- **'overlap_pcr'**: classic overlap-PCR. Tail в primer (from A3 boundary primer) даёт overlap; second-round PCR mass-amplify joined product. Junction.kind='overlap'.
- **'gibson'**: Gibson assembly. Bigger overlap (>= 20 bp). Junction.kind='overlap', overlapLength configurable (default 30).
- **'golden_gate'**: Type IIS RE с overhangs. Junction.kind='golden_gate', requires op.params.enzyme (BsaI/BsmBI default), overhangs 4 bp.
- **'restriction'**: classic RE-ligation. Junction.kind='re_ligation', requires RE-sites in flanking containers (auto-detected if possible; manual specified).
- **'direct_ligation'**: blunt or sticky end ligation без overlap. Junction.kind='ligation' or 'sticky_end' or 'blunt'.

Reagents (enzymes, ligases) — не explicit в DAG для MVP. Это metadata в operation/junction params (для protocol export — отдельный sprint).

### DEC-CANVAS-ASM-REAL-04 — Gap segment handling

Two cases:

**Gap with sequence** (e.g., 6×His linker, custom):
- A4 создаёт synthetic oligo container `c_gap_k` с sequence=gap.gapSequence.
- Container добавлен в как input одной из соседних PCR ops (left segment's op gets gap appended via primer tail; OR right segment's op gets gap prepended).
- В junction между соседними segments — gap sequence baked-in как overlap region.

**Gap without sequence** (unknown):
- ASSEMBLY_REALISE returns error `{ok: false, error: 'gap-without-sequence at offset X'}` с явным указанием на проблему. Biolog должен либо заполнить gap в A2, либо изменить on convert-to-known-segment.

### DEC-CANVAS-ASM-REAL-05 — Suggest algorithm

```
suggestMethodForBoundary(state, assembly, boundaryIdx): {method, confidence: 'high'|'medium'|'low', rationale}
```

Decision tree:

1. Если в assembly.primers есть boundary primer для этой boundary с tail length:
   - tail < 10 bp → 'overlap_pcr'.
   - tail 10-25 bp → 'overlap_pcr' (high confidence).
   - tail 25-50 bp → 'gibson' (high confidence).
   - tail > 50 bp → 'gibson' (high) — biolog явно хотел Gibson.

2. Иначе (no primer для этой boundary):
   - Если source containers имеют compatible RE-sites: top-Y rated → 'restriction' (medium confidence).
   - Если оба endings 'blunt' → 'direct_ligation' (medium).
   - Иначе → 'gibson' (low confidence) — default suggest.

3. Special case: если ALL boundaries сразу suggest 'golden_gate' (через какой-то external context, например biolog ранее использовал GG в этом проекте) — collective GG. Но это эвристика для UX hints, не logic для default. Default 'gibson' / 'overlap_pcr'.

### DEC-CANVAS-ASM-REAL-06 — Position layout algorithm

Derived ops + containers расставляются на canvas в линию:
- Y = bottom area (e.g., y = top of canvas + 400 px) — чтобы не конфликтовать с existing canvas content.
- X = горизонтальная цепочка: source containers слева (existing), ampliconops + output containers в правую сторону, итоговый product в конце.
- spacing = ~280 px (BLOCK_LINEAR_W + margin).

Этот layout grim-стилевой (всё в линию) — biolog может потом manually реорганизовать через standard drag (existing).

If existing entities already occupy this area → shift down on Y + warning toast.

### DEC-CANVAS-ASM-REAL-07 — Primer attachment

Для each PCR op:
- primer pair (fwd + rev) выбирается из assembly.primers таким образом:
  - Forward: primer с source.kind='segment'+segmentId=current OR source.kind='boundary'+leftSegmentId=current (boundary primer cover'ed по left side из current op's segment).
  - Reverse: primer с source.kind='segment'+segmentId=current OR source.kind='boundary'+rightSegmentId=current (boundary primer cover'ed по right side).
- Если none found → A4 fallback на auto-design primers через existing `recomputeFromSelection` в момент realise. Primers становятся source='auto'.
- Если multiple found (несколько pairs для одного segment'а — biolog wrote experimental options) — A4 берёт **last updated** или **first pair'd one**. UX в modal позволяет explicit choose в edge case.

### DEC-CANVAS-ASM-REAL-08 — Multi-realise behavior

Биолог может realise повторно (после изменения assembly или попробовать другой method). Каждый realise:
- Создаёт **новые** ops/junctions/containers с suffix `-r<N>` (revision counter).
- Старые не удаляются автоматически. Biolog может удалить вручную если нужно.
- Action хранит `assembly.lastRealisedAt` + `assembly.realiseRevision` для tracking. В UI assembly toolbar — text «Last realised: 2 hours ago (revision 2)».

### DEC-CANVAS-ASM-REAL-09 — Atomic ASSEMBLY_REALISE reducer

Multi-domain mutation в одном action:
- Adds ops в state.operations.
- Adds junctions в state.junctions.
- Adds containers в state.containers (initially placeholders / not yet executed, F4 derives virtual).
- Maps primers в op.params.userPrimers.
- Updates state.assemblies[i].lastRealisedAt + realiseRevision.

Если `realiseAssembly()` returns `ok: false` → state unchanged + showToast 'error' с reason.

### DEC-CANVAS-ASM-REAL-10 — RealiseModal layout

```
RealiseModal (overlay z 100+)
├── Header: «Реализовать <assembly.name> как DAG»
├── Top section: assembly summary («3 segments, 2 boundaries»)
├── Middle section: scrollable list of MethodPickerCard, по одной на boundary
│   - Boundary 1: <leftSeg.name> → <rightSeg.name>
│     - Method radio buttons: Overlap-PCR | Gibson | Golden Gate | Restriction | Direct Ligation
│     - Suggest hint: «Suggested: Gibson (overlap 30 bp from primer tail)»
│     - Per-method params (if any): GG enzyme dropdown, RE site selector
│   - Boundary 2: ...
├── Right or bottom: RealiseDagPreview (mini DAG visualization, updates реактивно)
├── Bottom: «Реализовать» (disabled until все boundaries chosen) + «Отмена»
```

### DEC-CANVAS-ASM-REAL-11 — RealiseDagPreview

Mini SVG diagram внутри modal:
- Source containers (slim rectangles) ← arrows → PCR ops (rhombuses) ← arrows → output containers (smaller rectangles) — junction lines (per chosen method color/style) — final product rectangle.
- Updates реактивно при изменении picker'а (новый junction.kind отображается).
- Read-only preview.

Style: same palette as canvas (containers blue, ops yellow, junctions per F2 palette).

---

## 5. Файлы и сигнатуры

### Новые файлы

**`lib/assembly-realise.js`** (~10-12 KB)

- `realiseAssembly(state, assemblyId, perBoundaryMethods, options): RealiseResult` — main entry.
- `generateOperationsForSegments(assembly, state): Operation[]` — N PCR ops per sourced segment.
- `generateJunctionsForBoundaries(assembly, perBoundaryMethods): Junction[]` — boundary junctions.
- `generateContainersForOutputs(assembly): Container[]` — derived output containers + final.
- `mapPrimersToOps(assembly, ops): primerAttachments` — primer pair per op.
- `computePositionsLayout(state, ops, containers): positionsLayout` — x,y placement.
- `handleGapSegments(assembly, ops, junctions): {ops, junctions, error?}` — gap synthetic oligo containers, errors if unknown gap.
- `nameWithRevision(baseName, revision): string` — `<base>-r<n>` suffix logic.

**`lib/assembly-realise-suggest.js`** (~5-7 KB)

- `suggestMethodForBoundary(state, assembly, boundaryIdx): {method, confidence, rationale}` — decision tree from DEC-REAL-05.
- `getBoundaryPrimerInfo(state, assembly, boundaryIdx): {hasPrimer, tailLength}` — helper.
- `detectCompatibleREsites(state, leftSeg, rightSeg): RESite[] | null` — helper.
- `detectBluntEndings(state, leftSeg, rightSeg): boolean` — helper.

**`editor/assembly/RealiseModal.jsx`** (~10-12 KB)

`RealiseModal({ assemblyId, onConfirm, onCancel })`. State: `perBoundaryMethods: {[boundaryIdx]: method}`.

Renders:
- Header.
- Summary.
- MethodPickerCards (one per boundary).
- RealiseDagPreview (реактивно обновляется при изменении methods).
- Confirm button: disabled if `Object.keys(perBoundaryMethods).length < boundaries.length`.
- onConfirm → dispatch ASSEMBLY_REALISE → если ok → close modal + show toast «Реализовано N ops + M junctions».

**`editor/assembly/RealiseDagPreview.jsx`** (~6-8 KB)

`RealiseDagPreview({ assembly, perBoundaryMethods })`. Computes ops/junctions/containers через `realiseAssembly` (pure, не dispatch) и рендерит mini SVG.

**`editor/assembly/MethodPickerCard.jsx`** (~3-4 KB)

`MethodPickerCard({ boundary, suggested, value, onChange })`:
- Header «Boundary N: <leftSegName> → <rightSegName>».
- Radio group methods.
- Per-method params expand на выбор method.
- Suggest hint text (small, italic).

### Existing файлы — изменения

**`editor/assembly/AssemblyToolbar.jsx`** (~+0.5 KB)

Realise button становится active (был disabled в A2). Click → opens RealiseModal через AssemblyShell state.

**`editor/assembly/AssemblyShell.jsx`** (~+0.5 KB)

Manages modal open state. Mounts RealiseModal при `realiseModalOpen=true`.

**`store/skeleton-state.js`** (~+0.5-1 KB)

ASSEMBLY_REALISE action dispatch:
- Validates через `realiseAssembly` pure func.
- If ok → atomic apply diff (push ops, junctions, containers; map primers; update positions).
- If error → state unchanged + push toast.
- Updates assembly.lastRealisedAt + realiseRevision.

**`lib/strings.js`** (~+0.5 KB)

STRINGS.canvasSkeleton.assemblyRealise.* keys: modalTitle, summaryText, boundaryHeaderTemplate, methodOverlapPcr, methodGibson, methodGoldenGate, methodRestriction, methodDirect, suggestPrefix, confirmButton, cancelButton, gapUnknownError, layoutShiftWarning.

### Тесты

`__tests__/canvas-skeleton/assembly-realise.test.jsx` (~10-12 KB).

Покрытие:

1. **realiseAssembly simple 2 segments + 1 boundary Gibson**: → 2 ops + 1 junction (overlap kind), 2 outputs + 1 final container.
2. **realiseAssembly 3 segments mixed methods**: Gibson + RE → 3 ops + 2 junctions с разными kinds.
3. **realiseAssembly with gap (sequence known)**: synthetic oligo container created, baked into flanking primer tail.
4. **realiseAssembly with gap (sequence unknown)**: returns ok=false с error 'gap-without-sequence'.
5. **realiseAssembly with orphan segment**: returns ok=false с error 'orphan-source'.
6. **suggestMethodForBoundary with tail=30 bp primer**: → 'gibson', high confidence.
7. **suggestMethodForBoundary without primer + blunt ends**: → 'direct_ligation', medium.
8. **suggestMethodForBoundary fallback**: → 'gibson', low confidence (default).
9. **suggestMethodForBoundary with detected RE sites**: → 'restriction', medium.
10. **ASSEMBLY_REALISE reducer apply diff**: ops/junctions/containers added в state.
11. **ASSEMBLY_REALISE reducer error → state unchanged**: toast pushed.
12. **Multi-realise revision**: second realise creates ops с suffix '-r2', старые не удалены.
13. **mapPrimersToOps**: assembly.primers с segmentId=A → linked to op for segment A's userPrimers.
14. **mapPrimersToOps fallback auto-design**: no primer found → op.params.userPrimers = auto-designed via recomputeFromSelection.
15. **computePositionsLayout**: ops + containers расположены в линию на y=<bottom area>.
16. **computePositionsLayout collision**: existing entities в zone → shift down + toast warning.
17. **RealiseModal render**: shows methodPickerCard per boundary, dag preview, confirm disabled until all picked.
18. **RealiseModal confirm enabled**: after all methods chosen → click → dispatch ASSEMBLY_REALISE.
19. **RealiseDagPreview reactive**: change method → preview updates.
20. **End-to-end**: open assembly tab → write 1 boundary primer (A3) → open RealiseModal → suggest 'gibson' for boundary → confirm → 2 ops + 1 junction в state.operations / state.junctions, primer mapped, modal closes, toast.

---

## 6. Порядок выполнения

### K1 — Pure suggest algorithm

- `lib/assembly-realise-suggest.js`.
- Helpers (boundary primer info, RE sites detection, blunt detection).
- Tests 6-9.

### K2 — Pure realise algorithm — simple cases

- `lib/assembly-realise.js`.
- Single-segment / two-segment / N-segment cases without gaps.
- Tests 1, 2.

### K3 — Gap handling + orphan handling

- handleGapSegments в realise algorithm.
- Tests 3, 4, 5.

### K4 — Primer mapping + fallback

- mapPrimersToOps.
- Fallback auto-design.
- Tests 13, 14.

### K5 — Positions layout

- computePositionsLayout.
- Collision detection + toast.
- Tests 15, 16.

### K6 — ASSEMBLY_REALISE reducer

- Atomic diff apply в state.
- Error path.
- Multi-realise revision.
- Tests 10, 11, 12.

### K7 — RealiseModal UI + sub-components

- Modal layout.
- MethodPickerCard.
- Render integration.
- Tests 17, 18.

### K8 — RealiseDagPreview

- Mini SVG render.
- Reactive updates.
- Tests 19.

### K9 — End-to-end + cleanup

- AssemblyToolbar Realise button wire.
- AssemblyShell modal mount.
- End-to-end test 20.
- Lint, build, sizes.
- Финальный отчёт.

**STOP после K9.** Visual acceptance — отдельная сессия.

---

## 7. STOP-условие и формат отчёта

Идентично A1-A3 + дополнительно:

- DECISIONS draft 11 DEC-CANVAS-ASM-REAL-NN.
- Manual smoke: «открыл draft с 3 segments + boundary primers → Realise modal → 2 boundaries: первая Gibson, вторая Overlap-PCR → DAG preview показывает 3 PCR ops + 2 junctions + final product → confirm → на canvas появилось всё в линию, primers mapped → execute first PCR op → output container в state.containers».

---

## 8. Риски

### R-DRIFT — самый высокий из всех A-sprint'ов

A4 опирается на A1+A2+A3 и пересекается с F2 (junction shape) + F3 (operation shape + primer mapping) + F4 (virtual containers).

Митигация: каждый DEC-ASM-REAL-NN ссылается на конкретный DEC из F2/F3/F4. Cross-spec consistency check перед K1 — review все 7 связанных DEC.

### R1 — Multi-realise может создать накопление мусора

10 realisations = 30 ops на canvas. Митigation: limit hard 5 realisations per assembly (warn at 3). Hard cap → toast «Удалите старые revisions сначала».

### R2 — Mapping primers fallback на auto-design делает realise dependent от source state

Если source container.sequence изменился между A3 (primer written) и A4 (realise) — auto-design в realise может выдать разные primer'ы. Не критично (биолог увидит и подкорректирует), но потенциально confusing.

### R3 — Gap synthetic oligo container ad-hoc

Это создаёт «short oligo» container в state.containers. У container'а должен быть kind. F1 container shape подразумевает kind ∈ {'plasmid', 'fragment', 'amplicon', 'oligo', ...}? Если 'oligo' kind не существует — добавить в DEC.

### R4 — Position layout overlaps с existing canvas entities

A4 computes positions «bottom area», но если biolog уже расставил entities там — shift down + toast. На практике canvas может быть «забит» — biolog должен manually relocate. Acceptance.

### R5 — RealiseModal complexity (DAG preview + per-boundary cards)

UI весомый. RealiseModal ~10 KB. Если расширится за soft 30 KB — extract DagPreview в отдельный file (уже отдельный) и MethodPickerCard (уже отдельный). Cleaner.

### R6 — RealiseDagPreview pure-recompute на каждое изменение picker'а

Реактивный recompute через `realiseAssembly()` — pure, но для большого assembly (50 segments) может тормозить. Митigation: debounce 100 ms, useMemo. Performance tests добавить как acceptance.

### R7 — Recombinase / другие methods OUT — биолог попросит

Recombinase (LR/BP, Cre/loxP) — common workflow в biology. Без него A4 incomplete. Митigation: TECH_DEBT `TD-ASM-RECOMBINASE-METHOD`, fast-follow sprint. В MVP A4 — 5 methods (overlap-PCR / Gibson / GG / Restriction / Direct Ligation).

---

## 9. Открытые вопросы

### Q1 — RealiseModal: per-boundary card scroll vs page-flow

Дефолт: vertical scroll внутри modal (modal fixed size).
Альтернатива: page-by-page (boundary 1 → click next → boundary 2). Сложнее UX. Take дефолт.

### Q2 — Multi-realise UI

Дефолт (DEC-REAL-08): автоматический suffix `-r2`. Старые не удаляются.
Альтернатива: при confirm спросить «Delete previous realisation?» — biolog выбирает. Friction. Take дефолт.

### Q3 — Naming conflicts на existing containers/ops

Если в state уже есть container с именем `<assembly.name>-frag-1` (например, biolog ранее назвал так что-то вручную) — auto-derive увидит conflict. 

Дефолт: имена unique через counter suffix.
Альтернатива: error «name conflict» + biolog должен переименовать. Stricter. Take дефолт.

### Q4 — Gap with sequence inserted into primer tail vs separate oligo container

Дефолт (DEC-REAL-04): synthetic oligo container в state.containers. Cleaner DAG (gap явно represented).
Альтернатива: bake gap sequence в primer tail flanking PCR op. Меньше containers, но primer становится длиннее (gap+overlap_tail+binding).

Solid argument для дефолта: oligo container reusable + visible в DAG. Stay default.

### Q5 — Final assembly container kind

Что за `kind` у итогового product container'а?
- Если topology=circular → 'plasmid'.
- Если linear → 'amplicon' или 'fragment'? Take 'fragment' (general).

---

## Acceptance gate

После Code STOP, отдельная chat-сессия:

- Open draft с 3 sourced segments + 1 boundary primer pair.
- Click «Realise as DAG» button → modal opens.
- See 2 boundary cards, each suggesting method.
- Boundary 1: suggested Gibson (because primer tail 25 bp). Change to Overlap-PCR → preview updates.
- Boundary 2: suggested Gibson (no primer, fallback) → keep.
- Click «Реализовать» → modal closes, toast.
- Canvas shows 3 PCR ops, 2 junctions, 3 output containers, 1 final container в линию (~y=400).
- Primers mapped: op_1.params.userPrimers содержит boundary primer fwd.
- Click PCR op rhombus → operation tab opens с template из source container.
- Execute first PCR op → output container становится real в state.containers.
- Reload → realised DAG preserved.

---

_Дата:_ 15.05.2026.
_Реализация Code:_ после A1+A2+A3 acceptance + OK Q1-Q5 + compact.
_Acceptance:_ visual в отдельной chat-сессии.
