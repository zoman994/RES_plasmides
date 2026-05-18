# Pre-four-tier specs — устаревшие после v0.8.3-alpha

**Дата создания архива:** 18.05.2026 (финализация Chat Пачки 3 v0.8.3-alpha).

**Причина архивации.** 16-18.05.2026 canvas-skeleton прошёл **архитектурный поворот** от draft/segment-based модели к four-tier (containers / pieces / operations / zones). Якорь новой архитектуры — `docs/SPEC_M-CANVAS-FOUR-TIER-ARCHITECTURE.md` (~32 KB). Реализация — 10 T-спринтов (T1-T10) + T4.5 zone auto-layout (`docs/SPRINT_T*.md`, ~360 KB суммарно, все на диске).

Перечисленные ниже спеки **полностью заменены** T-серией или интегрированы в новый якорь. Не читать как guideline. Не использовать как reference для новых правок. Сохранены **только для исторической трассируемости** причин архитектурных решений.

---

## Устаревшие F-серия (Window / Junction / Product / Disposition)

| Файл в `docs/` | Заменено |
|---|---|
| `SPRINT_M-CANVAS-WINDOW.md` (F1) | T7 Dual-Mode Toggle + Sync (inline sequence-mode in zone-frame, не отдельный editor tab — DEC-T7-01). |
| `SPRINT_M-CANVAS-JUNCTION.md` (F2) | T8 Auto-Reactions + Cross-Zone Links (finalizer pattern для junctions через op.materializedFrom — DEC-T8-08..13). |
| `SPRINT_M-CANVAS-PRODUCT.md` (F4) | T9 Variants (design variants + clone variants через materializedClones — DEC-T9-03..05). |
| `SPRINT_M-CANVAS-F3-DISPOSITION.md` (D1) | T4.5 Zone 3-lane Auto-Layout (dagre LR + pinned + lanes — DEC-T4.5-01..15). |

## Устаревшие A-серия (Assembly Model + UI)

| Файл в `docs/` | Заменено |
|---|---|
| `SPRINT_M-CANVAS-ASSEMBLY-MODEL.md` (A1) | T1 Pieces State + T6 Sequence-Mode Migration (assemblyDraft → zone, segments → pieces — DEC-T6-01..15). |
| `SPRINT_M-CANVAS-ASSEMBLY-CONSTRUCT.md` (A2) | T5 Piece Authoring UI (4 способа создать piece — DEC-T5-01..15). |
| `SPRINT_M-CANVAS-ASSEMBLY-PRIMER-DESIGN.md` (A3) | DEC-V0.8.3-PRIMER-REDESIGN (primer redesign 18.05 — модал-от-выделения, cross-portal pattern, pentagon-arrow). |
| `SPRINT_M-CANVAS-ASSEMBLY-REALISE.md` (A4) | T6 migration `lib/assembly-realise.js` → `lib/zone-pieces-to-dag.js` (читает pieces из zone — DEC-T6-01). |

## Устаревшие NOTES (kickoff drafts)

| Файл в `docs/` | Заменено |
|---|---|
| `NOTES_FOUR_TIER_MODEL_DRAFT.md` (15.05.2026 kickoff) | `docs/SPEC_M-CANVAS-FOUR-TIER-ARCHITECTURE.md` (16.05.2026, формальный якорь). |
| `NOTES_CANVAS_V2_KICKOFF.md` (11-15.05.2026 walkthroughs) | Спеки T1-T10 + T4.5 + DEC-MUTABILITY-FREEZE-ON-USE-01 (15.05 ⚓ в ANCHORS). |

---

## Действие — что делать с этими файлами

**Сейчас (на момент создания архива):** файлы **физически остаются** в `docs/` корне. Filesystem MCP не имеет `delete`/`move` (только read/write/edit). Этот README — soft-маркер: Chat/Code знают что они устарели и не используют их.

**Корректный финальный шаг (требует PowerShell от Игоря):**

```powershell
cd D:\RESplasmide\docs
Move-Item -Path "SPRINT_M-CANVAS-WINDOW.md", "SPRINT_M-CANVAS-JUNCTION.md", "SPRINT_M-CANVAS-PRODUCT.md", "SPRINT_M-CANVAS-F3-DISPOSITION.md", "SPRINT_M-CANVAS-ASSEMBLY-MODEL.md", "SPRINT_M-CANVAS-ASSEMBLY-CONSTRUCT.md", "SPRINT_M-CANVAS-ASSEMBLY-PRIMER-DESIGN.md", "SPRINT_M-CANVAS-ASSEMBLY-REALISE.md", "NOTES_FOUR_TIER_MODEL_DRAFT.md", "NOTES_CANVAS_V2_KICKOFF.md" -Destination "archive/2026-05-16-pre-four-tier/"
```

После этого `docs/` корень освобождается на ~150 KB (8 spec'ов × ~15-20 KB + 2 notes × ~10 KB).

---

## Контекст архитектурного поворота

**Что было.** F-серия (F1 Window, F2 Junction, F4 Product, D1 Disposition) и A-серия (A1 Model, A2 Construct, A3 Primer Design, A4 Realise) — план 4+4 спринтов от 11-15.05.2026, ориентированный на «assembly draft» как первичную сущность. Draft содержал implicit segments, был параллелен containers/operations/junctions. Realise превращал draft в DAG явным шагом.

**Что не так.** Биолог попросил «вижу свалку, могу руками двигать узлы — нет авто-раскладки» (скрин 17.05 pks4 knockout 16-узловый хаос). Глубже — концептуальная проблема: segments внутри draft не reusable между drafts, не имели acquisitionMethod, draft существовал параллельно DAG до Realise (два представления одного и того же). В 4-tier модели: pieces как первичная сущность (reusable, имеют acquisitionMethod), zones как Miro-frames (визуальная группировка без draft-as-entity), auto-reactions создаются finalizer'ом по piece.acquisitionMethod без шага Realise.

**Что стало.** Four-tier: containers (физический контейнер ДНК) + pieces (концептуальный «кусок») + operations (ромб реакции) + zones (Miro-frame для группировки). 10 T-спринтов реализованы 16-18.05 Code в continuous mode. Тесты: Vitest 2320 → 3276 pass (+956). Schema v=10 через 6 идемпотентных миграций. Реверс DEC-T3-08 (default zone) + V61 (ghost respawn) 17.05 «полностью из state» — чистый старт.

Подробно — `RELEASES.md` v0.8.3-alpha entry + `DECISIONS.md` sprint-block v0.8.3-alpha (84 DEC).
