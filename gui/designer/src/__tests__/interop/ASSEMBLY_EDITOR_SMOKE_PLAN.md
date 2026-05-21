# AE-K11 — Assembly editor manual smoke test plan

> 14-step biolog flow per `SPEC_ASSEMBLY_EDITOR_CLEANUP.md` §8 K11.
> Browser-driven verification of the cleanup deltas (K1-K10).

## Prerequisites

- BodgeGene dev server on http://127.0.0.1:3000 (avoid AmneziaVPN per V79).
- Existing or fresh project (empty canvas OK).

## Steps

### 1. Empty project canvas

- Empty canvas, no `+ Операция` button anywhere (AE-K9).
- `+ Сборка` and `🗑 Очистить` visible bottom-right.

✅ PASS if `+ Операция` floating button gone.

### 2. Create assembly — auto-name

- Click `+ Сборка`.
- Zone created with name **«Сборка 1»** (AE-K6).
- Editor opens automatically with EmptyAssemblyHint (AE-K1+K2).

✅ PASS if tab shows `🧬 Сборка 1` (not `(пустой)`).

### 3. Empty editor layout

- AssemblyHeader: title editable, метрика `0 bp · 0 сегм. · linear`, no 🎨 Палитра (AE-K3 conditional), `🪄 Realise as DAG` disabled.
- Center: EmptyAssemblyHint with 4-point list (📚/✦/🧪/◊).
- Right rail: AssemblySidebar / Primers / Pipeline panels HIDDEN when empty (AE-K2).
- Bottom toolbar: 4 add buttons + Undo/Redo. No `🔗 Сшить` yet (AE-K4 conditional).

✅ PASS if all hidden panels confirmed.

### 4. Add first piece

- Click `+ Плазмида` → picker → pick a container → range picker → confirm.
- Strip view replaces EmptyAssemblyHint.
- AssemblySidebar appears (containers list).
- AssemblyPrimersPanel appears (empty hint inside).
- AssemblyPipelinePanel still HIDDEN (no groups yet) UNLESS segments ≥ 2.
- 🎨 Палитра button now visible in header (paletteLegend > 0).

✅ PASS if panels appear progressively per state.

### 5. Add 2 more pieces

- Click `+ Плазмида` twice more → 3 segments total.
- AssemblyPipelinePanel now visible (segments ≥ 2 deviation per AE-K2).
- `🪄 Realise as DAG` enabled.

### 6. Select all 3 → 🔗 Сшить

- Multi-select via SegmentList checkboxes.
- Toolbar shows `🔗 Сшить (3)` button in **accent (orange)** colour (AE-K4).
- Click → OpGroupPicker → OvPCR → confirm.

✅ PASS if first group created.

### 7. Verify pipeline panel updates

- AssemblyPipelinePanel shows Group A under Layer 1.
- Mini DAG block now visible inside panel (AE-K5).
- **No** «Realise pipeline →» button at bottom of panel (AE-K5).
- Auto-собрать button still present.

✅ PASS if pipeline button gone, Mini DAG visible.

### 8. Realise from header

- Click `🪄 Realise as DAG` in AssemblyHeader (top-right).
- RealiseModal opens.

✅ PASS if single primary entry-point works.

### 9. Drag pUC19 from library to empty canvas (AE-K10 — pre-wire)

- Return to canvas (back button).
- ⚠️ AE-K10 not implemented in this sprint (deferred to follow-up wiring).
- Manual fallback: click `+ Сборка` again → creates `Сборка 2`.

⚠️ DEFERRED — see Open Question #1.

### 10. Sidebar filter placeholder

- In editor, AssemblySidebar filter input placeholder reads «**Фильтр по контейнерам проекта…**» (AE-K8).

✅ PASS if placeholder updated.

### 11. SegmentList empty hint

- Reset to empty zone (or remove all segments).
- SegmentList footer hint reads «Сегментов нет. + Плазмида — выбор из списка выше; кнопки: + Обвес / + Синтез / + Gap.» (AE-K7 + V86 copy-fix 21.05.2026).

✅ PASS if no stale `+ Сегмент` reference.

### 12. Default zone name gap-fill

- Delete `Сборка 1` (right-click zone → Удалить).
- Click `+ Сборка` again.
- New zone named `Сборка 1` (gap-fill, AE-K6).

✅ PASS if name reuses the freed number.

### 13. Multiple zones — sequential names

- Create 3 zones: names should be `Сборка 1`, `Сборка 2`, `Сборка 3`.

✅ PASS.

### 14. Explicit naming preserved

- Create zone via API call with explicit name «pks4-ko» (or set name manually after creation).
- Verify the explicit name is not overridden by `Сборка N`.

✅ PASS.

## Reporting

```
Step 1  (no + Операция):              PASS / FAIL
Step 2  (auto-name Сборка 1):         PASS / FAIL
Step 3  (empty editor layout):        PASS / FAIL
Step 4  (panels appear progressively): PASS / FAIL
Step 5  (3 pieces):                    PASS / FAIL
Step 6  (🔗 Сшить):                    PASS / FAIL
Step 7  (Mini DAG, no Realise btn):    PASS / FAIL
Step 8  (Realise from header):         PASS / FAIL
Step 9  (drag-from-library):           DEFERRED
Step 10 (sidebar placeholder):         PASS / FAIL
Step 11 (SegmentList hint):            PASS / FAIL
Step 12 (gap-fill names):              PASS / FAIL
Step 13 (sequential):                  PASS / FAIL
Step 14 (explicit name preserved):     PASS / FAIL
```

Drop sign-off + screenshots in Chat to finalise the M-ASSEMBLY-EDITOR-CLEANUP sprint.
