# SPRINT T4.5 — Zone auto-layout (3-lane, left→right)

**Статус:** ✅ РЕАЛИЗОВАНО [17.05.2026] (Code, continuous-mode)
**Тип:** A (UI + algorithm). **Якорь:** SPEC_M-CANVAS-FOUR-TIER + DEC-CANVAS-4T-31 (zone имеет 3-lane structure).
**Зависимости:** T3 (zones), T4 (zone rendering). Параллелен T5–T7.

> Спека поднята из inline-обсуждения 17.05.2026 и сразу реализована по
> явному запросу Игоря («спеку T4.5 просто выполни — и запиши что
> выполнил»). Чистовая ревизия / acceptance / promotion DEC —
> milestone-сессия Chat (CLAUDE.md §6).

## Цель
Авто-укладка узлов внутри zone по 3 рядам — **Источники / Промежуточное /
Финалы**, слева направо, dagre для middle-ряда. Drag-override через
`pinned`. Per-zone opt-out `laneLayout:'manual'`. Idempotent-финализатор
после T8.

## Архитектурные решения (как реализовано)
- **DEC-T4.5-01** 3 lane горизонтально, top-anchored.
- **DEC-T4.5-02** dagre — переиспользован `lib/dag-layout.computeAutoLayout`
  (`@dagrejs/dagre` УЖЕ был зависимостью — K1 install не потребовался,
  bundle НЕ вырос на ~40 KB как оценивала спека).
- **DEC-T4.5-03** классификация derived из state refs (junctions / op
  inputs-outputs), не флаг node.role.
- **DEC-T4.5-04** `pinned:false` per-node (container/piece/operation).
- **DEC-T4.5-05** `zone.laneLayout:'auto'|'manual'` opt-out.
- **DEC-T4.5-06** финализатор последним, после T8 + T4-bounds; idempotent
  (same-ref когда разложено) → нет цикла.
- **DEC-T4.5-07** layout НЕ на drag (drag = pin override).
- **DEC-T4.5-08** — **ОТКЛОНЕНИЕ:** lane Y — фиксированные офсеты от
  ВЕРХА зоны (`LANE_FIN_DY=380`), НЕ `height-80` от низа. Причина:
  bottom-anchor + grow-only T4-bounds-финализатор = feedback-петля
  (finalsY уезжает вниз каждый pass, idempotency-контракт R2 никогда не
  выполняется → finalizer loop). Top-anchor зависит только от стабильной
  `bounds.y` → computeZoneLayout = фиксированная точка. Та же 3-lane
  семантика, loop-safe.
- **DEC-T4.5-09** lane-divider — dashed + labels, pointer-events:none.
- **DEC-T4.5-10** sequence-mode zone пропускается.

## K-шаги
| K | Что | Статус |
|---|-----|--------|
| K1 | dagre dependency | ✅ уже была (`@dagrejs/dagre@^3`) |
| K2 | `lib/zone-layout-rules.js` (isSource/isFinal/isIntermediate/collectAllNodes/classifyZoneNodes) | ✅ +9 тестов |
| K3 | `lib/zone-layout.js` (computeZoneLayout + dagre middle-lane) | ✅ +9 тестов |
| K4 | `pinned:false` factories (createPiece/clonePiece/createOperationDraft/makeGhostPlaceholder/realise-containers) + migration v9→v10 + SCHEMA 9→10 | ✅ +7 тестов |
| K5 | `zone.laneLayout` (createZone) + SET_ZONE_LANE_LAYOUT + RECOMPUTE_ZONE_LAYOUT (force) + applyZoneLayout/applyZoneLayouts | ✅ +9 тестов |
| K6 | SET_NODE_PINNED (zonesReducer) + action-creators + drag pointer-up auto-pin (встроено в `applyDragAt`/onPointerUp путь — реконсилировано с infinite-canvas) | ✅ +5 тестов |
| K7 | финализатор `applyZoneLayouts(next)` в skeleton-state.js (после T4-bounds, перед return) | ✅ idempotency покрыта |
| K8 | `canvas/zone-lane-divider.jsx` + mount в ZoneFrame (graph + laneLayout≠manual) | ✅ |
| K9 | ZoneContextMenu: «Авто/Ручная раскладка» + «Перестроить раскладку» | ✅ |
| K10 | dbl-click toggle — **ОТКЛОНЕНИЕ:** не реализован (конфликт с устоявшимся double-click→openEditor; ui-interactions=edit). Pin/unpin = drag-auto-pin + кликабельный 📌-бейдж + zone-menu | задокументировано |
| K11 | 📌-бейдж на pinned container/operation (CanvasLayoutView), клик → unpin | ✅ |
| K12 | STRINGS: zones.lanes / zones.pin / contextMenu.lane* | ✅ |
| K13 | integration через skeletonReducer (lanes/pinned/manual/sequence/idempotent) | ✅ +6 тестов |
| K15 | full suite + size budget | ✅ см. ниже |

## Отклонения от спеки
1. **K1** — dagre уже зависимость; install не нужен; bundle не вырос.
2. **DEC-T4.5-08** — finals top-anchored (фиксированный офсет), не от
   низа: иначе finalizer-петля (см. выше). Loop-safety > буквальный §4.
3. **K10** — double-click toggle pinned НЕ реализован: hijack устоявшегося
   double-click→openEditor сломал бы основной UX (ui-interactions =
   double-click=edit). Pin/unpin покрыт drag-auto-pin (K6) +
   кликабельным 📌-бейджем (K11, unpin в 1 клик) + zone-menu — ≤2 клика,
   контракт ui-interactions соблюдён.
4. **K4 container factory** — нет единой container-фабрики; `pinned:false`
   проставлен на канонических точках (createPiece/clonePiece/
   createOperationDraft/makeGhostPlaceholder/realise frag·gap·product),
   остальные контейнеры нормализует миграция v9→v10 + read-as-unpinned
   (absence===unpinned, V83-style additive-optional, zero behavioural
   diff). Не стэмпил ad-hoc container-литералы в skeleton-state-canvas
   (churn/regression-риск, поведенчески идентично).

## Тесты / размеры / build
- **Vitest 3213 pass / 1 skip / 0 fail** (baseline pre-T4.5 3168, Δ+45
  новых; flake TD-PRIMER-WIZARD не сработал).
- **R-DRIFT contract-collateral (15, легитимно, tdd-enforce):** SCHEMA
  `toBe(9)→toBe(10)` ×8 + deep-equal миграций +`pinned:false` (v5/v8/v9/
  r12/assembly-selectors/assembly-mode) — тот же класс, что T9
  variantGroupId. Все обновлены на верный новый контракт.
- **Размеры:** zone-layout.js 7.1 / zone-layout-rules.js 4.5 /
  zone-lane-divider.jsx 2.2 / canvas-layout.js 12.7 — все под soft.
  **Watch:** `CanvasLayoutView.jsx` 41.35 KB — перевалил .jsx hard 40
  (T4.5 +~1.5 KB pin-бейджи на уже-крупном файле). Per CLAUDE.md §7
  calibration — Watch-list, не авто-блок; декомпозиция = решение Chat
  (mini-spec), не Code.
- vite build: не гонялся (Игорь увёл от него ранее); full suite + 0
  console-ошибок после reload — принятый сигнал.

## Follow-up фикс (Игорь «не работает сортировка по зонам», 17.05.2026)
Корневой баг T4.5: `handleAssemblyRealise` мерджил realised
containers/ops без `zoneId` → при realise в зону все узлы loose →
`nodeListInZone` пуст → финализатор нечего сортировать. Фикс: realise
в зону тегает `zoneId` на diff-узлы + подтягивает loose source-
контейнеры; `realised-product` (edge-isolated) классифицируется как
final (origin-authoritative) в classifyZoneNodes/isSource/isFinal.
+5 тестов `zone-realise-autolayout.test.js`. Full Vitest **3218 pass /
1 skip / 0 fail**, zero рег.

## Регрессия-коррекция #2 (Игорь «рамка гигантская / узлы недостижимы», 17.05.2026)
Follow-up-фикс #1 подтягивал loose source-контейнеры в зону → их
произвольные позиции через grow-only T4-bounds раздували рамку зоны
навсегда (гигантская + узлы вне scroll-spacer + resize отбивается).
**Откат source-pull:** `handleAssemblyRealise` тегает `zoneId` только
на новые realised diff-узлы; sources остаются loose. Realised граф
кладётся T4.5 в bounded lanes → зона растёт только под ограниченный
контент. Тест-контракт `zone-realise-autolayout.test.js` обновлён
(source НЕ pulled). Resize auto-зоны — исходный grow-only T4
(DEC-T3-06, pre-T4.5); ручной контроль через «Ручная раскладка».
Full Vitest **3222 pass +1 flake / 1 skip / 0 real fail**, zero рег.

## Reconciliation notes (session 17.05.2026)
- K6 auto-pin **встроен в общий `applyDragAt`/onPointerUp путь**
  `useCanvasLayoutDrag` (не рядом) — не конфликтует с edge-pan/infinite
  canvas; drag→pinned→📌→click→unpinned→auto-layout reclaims.
- `canvas-layout.js` вырос за сессию (edgeAnchors/zoomAtPoint/
  canvasContentExtent/edgePanVelocity + ZONE_LANE_DY) до 12.7 KB —
  под soft, для §0 будущих спек baseline обновлён.

После K15: **СТОП.** PROJECT_STATE/DECISIONS/ANCHORS/RELEASES/TECH_DEBT/
package.json/version.js НЕ трогались — визуальная приёмка + финализация
координационных файлов = отдельная сессия Chat.
