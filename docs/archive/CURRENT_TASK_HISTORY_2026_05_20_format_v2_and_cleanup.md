# CURRENT_TASK_HISTORY — архив 2026-05-20

> Архив отчётов Code за серию сессий 19-20.05.2026: pre-sprint batch + M-CANVAS-WORKFLOW-UX + M-FORMAT-V2-CORE + M-FORMAT-V2-NOTEBOOK + 3× cleanup.
> Перенесено из `CURRENT_TASK.md` при подготовке к визуальной приёмке. Vitest 3300 → 3840 pass / 2 skip / 0 fail.
> Все коммиты в branch `feature/m-x-7a-library-structure-v2`.

---

## Сводка батчей

| Батч | K-точки | Commits | Vitest | Спека |
|---|---|---|---|---|
| Pre-sprint batch (7 пунктов) | — | `ee97960` | 3284 → 3300 | live bug-fix/UX |
| M-CANVAS-WORKFLOW-UX | K1-K17 | `fe4e92b`..`fb9a920` | 3300 → 3437 | SPEC_ASSEMBLY_WORKFLOW_UX.md |
| M-FORMAT-V2-CORE | K0-K16 | `633f6fc`..`26a3136` | 3437 → 3651 | SPEC_BODGE_FORMAT_V2_CORE.md |
| M-FORMAT-V2-NOTEBOOK | NB-K1-K19 | `fce4d8d`..`8a50647` | 3651 → 3797 | SPEC_BODGE_NOTEBOOK_MARKDOWN.md |
| 3× cleanup + follow-up | все K | `6239956`,`9a1b2e6`,`36ffb36`,`7076021` | 3797 → 3840 | SPEC_ASSEMBLY_EDITOR_CLEANUP / SPEC_PROJECT_CANVAS_CLEANUP / SPEC_MAIN_SCREEN_CLEANUP |

Итого: **3300 → 3840 pass / 2 skip / 0 fail**, zero регрессий, build clean.

---

## Pre-sprint batch — 7 пунктов post-148936a

1. assembly-unify («Только зона» — buildAssemblyZoneAction).
2. TD-ZONE-ATTACH-CONTAINMENT H1/H4 (viewportToWorld unified screen→world transform).
3. TD-ZONE-ATTACH-CONTAINMENT H2/H3 (drop→`laneLayout:'manual'`).
4. piece-from-primers-fix (PiecePrimersPickModal source/shape sync).
5. assembly-editor-open regression-fix: `+ Сборка` и `AssemblyDraftsPanel.createZone` → создать зону И сразу `openEditorAssemblyTab`.
6. assembly source-picker → вся Библиотека (superseded п.7).
7. Fix A — re-entry: `🧬 Открыть сборку` header-кнопка в ZoneFrame + `zone-menu-open-assembly` в ZoneContextMenu. Fix B — reuse `PlaceholderTreePicker` (bespoke `AssemblySourcePicker` + `assembly-source-search.js` удалены).

TD-ZONE-ATTACH-CONTAINMENT CLOSED (отметить в TECH_DEBT при финализации).

---

## M-CANVAS-WORKFLOW-UX — отчёт Code

Commits 18 шт `ee97960`→`fb9a920`. Vitest 3300→3437 (+137). SCHEMA 10→11 + DB 4→5 (additive snippets table).

Verified: 4 entry-points, snippet catalog 48 built-in + custom, strip iconography, snippet onboarding tip, explicit grouping, group bordered container, side panel Схема сборки, automode, primer auto-derivation per kind, manual primer override + auto/manual flag, mutation entry.

Spec deviations: §3 buildLeftTail RC spec-bug (K11 bio-correct); K7 intermediate piece отложен в K15; K15 реализовал 2 из 8 триггеров; K13 payload +{tail,binding}; K17 step 8 (Realise) out.

Open Q: Realise+op-groups интеграция; K15 re-derive triggers; multi-layer intermediate; golden_gate placeholder overhang.

Size: skeleton-state-operations.js 18.70 KB WARN soft.

---

## M-FORMAT-V2-CORE — отчёт Code

Commits 16 шт `633f6fc`→`26a3136`. Vitest 3437→3651 (+214).

K0 SnapGene probe: loss-detect robustness ✓; 5 simulators ✓; real-tool round-trip → K14 manual smoke.
Migration: v1→v2 idempotent ✓; v0.7.x ✓; v0.8.x post-T3-revert ✓; v0.8.x с zones ✓; re-export→re-import identity ✓.
SnapGene interop K13: sequence bit-perfect ✓; FEATURES+qualifiers ✓; COMMENT verbatim/reassembly ✓; external edit detection ✓.
Atomic write+recovery: crash recoverable ✓; ZIP corruption recoverable ✓; concurrent-write warning ✓.
README.md: на каждом write ✓; markdown valid ✓; no sensitive data ✓; empty edge case ✓.
Size: lib/bodge-*.js ~106 KB ungzipped, ~30 KB gzipped main impact.

Spec deviations: K1+K8 contract change; K6+K7 объединены; **K10 ExportProjectModal НЕ wired в App.jsx**; **K11 .bodgeassembly НЕ зарегистрирован в File→Open**; **App.jsx call-sites НЕ переключены на v2** (v1 path сохранён bit-perfect); lazy-load migration НЕ реализован; DEC-FMT-V2-LIBRARY-CANONICAL-01 wire-up out of scope.

Open Q: App.jsx switch v1→v2; ExportProjectModal wire-up; .bodgeassembly file association; Migration UX toast (§11.5); §6.4 loss matrix real-tool fill; JSON Schema URIs; lazy-load migrations.

Manual smoke K14: план `__tests__/interop/MANUAL_SMOKE_PLAN.md` (5 шагов), execution = биолог+Chat.

---

## M-FORMAT-V2-NOTEBOOK — отчёт Code

Commits 14 шт `fce4d8d`→`8a50647`. Vitest 3651→3797 (+146).

Markdown verified: CommonMark+GFM, footnotes+highlight, custom @@ref@@ (7 kinds), DNA/AA highlight, mermaid-link stub, KaTeX lazy-load.
Editor UX: split-view, live scroll sync, drag-drop+paste image, 16+3 toolbar buttons, hotkeys, ref picker modal, onBlur flush + debounce.
Migration: T10 Sanger notes → notebook entries ✓ idempotent ✓.
Security: DOMPurify 5 attack vectors ✓; html:false ✓.
Bundle: notebook stack ~60 KB gzipped lazy; KaTeX ~250 KB lazy. Main bundle delta +0.58 KB (NotebookTab tree-shaken — не подключён).

Spec deviations: K1+K2, K8-K11 объединены; **K16 wire-up в CanvasLayoutView НЕ сделан** (NotebookTab standalone); **state.notebook slice НЕ создан**; хоткеи без scope registry; mermaid.live `?code=`.

Open Q: App.jsx+EditorWindowShell wire-up; state.notebook slice; global vs per-zone; tab persistent vs conditional; MS Word paste; print/PDF; CanvasLayoutView size; linked entries.

Manual smoke: `__tests__/interop/NOTEBOOK_MANUAL_SMOKE_PLAN.md` (7 шагов).

---

## 3× CLEANUP — отчёт Code

Commits `6239956`,`9a1b2e6` (initial) + `36ffb36`,`7076021` (follow-up). Vitest 3797→3840 (+43).

ASSEMBLY-EDITOR (K1-K11): EmptyAssemblyHint; progressive UI conditional panels; 🎨 Палитра conditional; 🔗 Сшить toolbar; single Realise; default zone name «Сборка N» + gap-fill; SegmentList stale text fix; AssemblySidebar placeholder rename; + Операция removed. **AE-K10 drop-on-empty-area branch DEFERRED** (касается 41 KB CanvasLayoutView hard-breached).

PROJECT-CANVAS (K1-K10): tree removed; LibrarySearchBar создан+mounted; header title binding; ProtocolPanel+PrimerOrderPanel unmounted; 📋 Сборки counter conditional; «Рабочие таблицы» уже отсутствует; Restriction toggle relocation (RestrictionHeaderToggle pill).

MAIN-SCREEN (K1-K7): sidebar 8 items removed +1 added; MainPanel restructure; HelpPopover; drop-to-library; library banner conditional; PWA в Settings.

Spec deviations: AE-K2 relaxed gate (op-groups OR segments≥2); AE-K10 drop-branch deferred; orphan files (LibraryTreeHost/ProtocolPanel/PrimerOrderPanel) оставлены in-place.

Новые компоненты: EmptyAssemblyHint, HelpPopover, LibrarySearchBar, RestrictionHeaderToggle, PwaInstallSection.

Open Q: AE-K10 drop-branch priority; **LibrarySearchBar visual parity** (amendment SPEC_PROJECT_CANVAS_CLEANUP §3.2.1/§3.2.2 — MiniPlasmidMap thumbnails + collapsed categories — НЕ реализовано в базовом LibrarySearchBar); orphan files → src/_archive/.

---

## Смоук-планы Code (на диске, для биолог-приёмки)

- `gui/designer/src/__tests__/interop/MANUAL_SMOKE_PLAN.md` — format v2 (5 шагов).
- `gui/designer/src/__tests__/interop/NOTEBOOK_MANUAL_SMOKE_PLAN.md` — notebook (7 шагов).
- `gui/designer/src/__tests__/interop/ASSEMBLY_EDITOR_SMOKE_PLAN.md`.
- `gui/designer/src/__tests__/interop/PROJECT_CANVAS_SMOKE_PLAN.md`.
- `gui/designer/src/__tests__/interop/MAIN_SCREEN_SMOKE_PLAN.md`.
- `gui/designer/src/__tests__/interop/K15_SIZE_BUDGET.md` + `NB_K19_SIZE_BUDGET.md`.

---

## Состояние координационных файлов на момент архивации

Code НЕ трогал (per STOP, финализация — Chat): `CLAUDE.md`, `PROJECT_STATE.md`, `DECISIONS.md`, `ANCHORS.md`, `BUGS.md`, `RELEASES.md`, `TECH_DEBT.md`, `COMPONENT_MAP.md`, `lib/version.js`, `package.json::version`.

Версия на диске остаётся **v0.8.3-alpha**. Bump к **v0.9.0-alpha** — задача финализации после визуальной приёмки.

Backend `src/pvcs/` — не задет ни одним sprint'ом.

---

_Архив создан 20.05.2026 при подготовке к визуальной приёмке._
