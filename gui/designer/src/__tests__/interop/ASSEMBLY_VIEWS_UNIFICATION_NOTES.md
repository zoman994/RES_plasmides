# AV-K1 / AV-K11 / AV-K12 — Assembly views unification audit + consistency notes

Companion document for `SPEC_ASSEMBLY_VIEWS_UNIFICATION.md`.

## AV-K1 — Matrix audit (post-implementation state)

| Action / Capability | Frame view | Sequence view | Editor |
|---|---|---|---|
| **Add sourced piece (plasmid)** | ✓ K3 popover OR drag library | ✓ K6 click on empty | ✓ + Плазмида / strip click |
| **Add snippet (tag/linker)** | ✓ K3 popover | ✓ K6 click on empty | ✓ + Обвес |
| **Add synthesis (long ПСО)** | ✓ K3 popover | ✓ K6 click on empty | ✓ + Синтез |
| **Add gap (placeholder)** | ✓ K3 popover | ✓ K6 click on empty | ✓ + Gap |
| **Add mutation на piece** | ⚠ K4 deferred (requires piece↔container resolution) | ⚠ deferred | ✓ context menu в SequenceView |
| **Group pieces (Сшить)** | ⚠ K5 multi-select model not implemented | ⚠ same | ✓ select + Сшить |
| **Edit primer manual** | ✗ no UI | ⚠ K8 deferred | ✓ Primers panel |
| **Realise pipeline** | ✓ via 🧬 «Открыть сборку» → Editor header | ✗ | ✓ header «🪄 Realise» |
| **Edit junction params** | ✓ existing JunctionPopover | n/a | ✓ Junction modal |
| **Delete piece / op** | ✓ existing context menu | n/a inline | ✓ context menu |
| **Rename zone / piece** | ✓ existing context menu | n/a inline | ✓ InlineEditableTitle |
| **View sequence (text)** | ✗ no text | ✓ assembled state | ✓ SequenceTab |
| **Reorder pieces** | ✗ drag in lane unclear | ⚠ palette drag (existing) | ✓ Drag в strip |
| **Editor → Sequence collapse** | n/a | n/a | ✓ AV-K10 «↩ S» button |

### Implemented (this sprint)

- **AV-K2** — `AddPiecePopover` shared component (4 entry-points + hotkeys P/S/./G).
- **AV-K3** — ZoneFrame «+» button → popover; routes to assembly editor with the matching kind.
- **AV-K6** — Sequence view empty area click → popover (same routing).
- **AV-K9** — Shared `PieceContextMenu` + `OpContextMenu` components (caller wires callbacks).
- **AV-K10** — Editor header «↩ S» button collapses to canvas sequence view.

### Deferred (next sprint or post-acceptance)

- **AV-K4** — Frame view mutation context menu via ContainerBlock right-click. Blocked by piece↔container resolution: MutationModal expects a piece ID, but ContainerBlock only knows containerId. Needs a resolver from `state.pieces` filtered by `zoneId === focusedZoneId && sourceIds.includes(containerId)` — chooses first matching piece.
- **AV-K5 / AV-K7** — Multi-select model (cmd-click) in Frame/Sequence views. Selection state currently exists only in Editor (`selectedSegmentIds` in AssemblyShellBody). Lifting it up to canvas requires either: (a) a canvas-level selection slice, or (b) reusing the Editor's selection via a portal. Both are larger refactors.
- **AV-K8** — Sequence view primer inline edit. Sequence view assembled state shows primers as colored glyphs; click handler needs a mini modal (subset of PrimerFromSelectionModal). Modal exists, only wiring is missing — but it depends on which primer-glyph component is used in the assembled state (`ZoneAssembledView` not deeply audited).

## AV-K11 — Visual consistency notes (post-implementation)

Single source of truth — `piece.color`:
- ContainerBlock in Frame view: uses `palette` color via canvas-layout palette assignment.
- Strip blocks in Editor: same palette (collectAssemblyAnnotations + boundaries.color).
- ZoneSequenceMode: same palette consumed via `coloredZones`.

Single source for piece labels — `piece.name`:
- ContainerBlock displays `container.name`.
- Strip blocks display segment label (derived from source container name).
- Sequence view colored region label = piece.name.

No fallback drift detected: all three surfaces share the same palette + name source. Test coverage: existing palette tests in `assembly-mode.test.jsx` + `palette` color assertions.

## AV-K12 — Empty state hint consistency notes

Three empty-state hints standardised to single tone:

1. **Frame view** zone empty: `ZoneEmptyView` text (`STRINGS.canvasSkeleton.zones.sequenceMode.emptyHint`).
   Lists available sources + invites click on empty area.

2. **Sequence view** zone empty: same text, same component.

3. **Editor** assembly empty (segments.length === 0): `EmptyAssemblyHint` component (AE-K1).
   Lists 4 entry-points (📚 / ✦ / 🧪 / ◊) + invitation to Realise after ≥2 segments.

All three hints mention the same 4 piece kinds (Плазмида / Обвес / Синтез / Gap = library / snippet / synthesis / gap). The AddPiecePopover (AV-K2) emits the same 4 labels.

Discrepancy in tone: Editor's EmptyAssemblyHint is the most verbose (full onboarding); Frame/Sequence is terser ("Зона пуста. Перетащите плазмиду…"). This is intentional per spec §3.3 — full hint in central editor, compact hint inline on canvas.

## AV-K13 — Manual smoke test plan

See `__tests__/interop/ASSEMBLY_EDITOR_SMOKE_PLAN.md` for the existing 14-step Assembly editor flow. The AV unification additions are folded into that plan as new steps:

15. From Frame view, click «+» in zone header → popover with 4 options → pick «Обвес» → SnippetCatalog opens.

16. Click «G» on zone frame → Sequence view inline. Click on empty area → popover with 4 options → pick «Из плазмиды» → range picker.

17. In Editor, click «↩ S» button → editor closes, zone on canvas shows Sequence view with same data.

18. Right-click on a piece block in Frame view (when K4 ships) → context menu with «Переименовать / RC / Изменить диапазон / Mutation / Удалить» (and «Сшить» if multi-select).

19. Same context menu items appear when right-clicking piece-card in Sequence view / piece in Editor strip (when K9 wiring lands).

20. Cmd-click on multiple pieces in any view → context menu shows «Сшить (N) →» highlighted (when K5/K7 ship).

### Expected biolog flow (compressed)

Empty project → +Сборка → Frame view with zone «Сборка 1». Frame +click → popover → «Из плазмиды» → opens editor with picker. Add pieces. Editor «↩ S» → back to canvas sequence view, see colored strip inline. «🧬 Открыть сборку» on zone frame → editor again. Realise → final container appears in the «Финалы» lane of Frame view.

Three levels of zoom (Frame / Sequence / Editor) covering the same data, each with progressively more detail.
