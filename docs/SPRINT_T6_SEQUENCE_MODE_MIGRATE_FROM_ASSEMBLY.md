# SPRINT_T6_SEQUENCE_MODE_MIGRATE_FROM_ASSEMBLY.md — миграция assembly-mode shape segments → pieces

> **Тип:** A (major refactor + migration).
> **Якорь:** `docs/SPEC_M-CANVAS-FOUR-TIER-ARCHITECTURE.md` (DEC-CANVAS-4T-26, 29).
> **Зависимости:** T1 + T2 (pieces shape). Параллелен T3/T4/T5.
> **Размер целевой:** 50-60 KB.
> **Цель:** мигрировать существующую `editor/assembly-mode/` инфраструктуру (14 файлов, A1-A4 реализация) с shape `state.assemblyDrafts[i].segments[]` на shape `state.zones[i] + state.pieces[]`. Переиспользовать 80% UI components без переписывания. Adapter-based миграция через transition window.

---

## 0. Срез размеров затрагиваемых модулей

| Файл | Текущий | Лимит | Действие |
|------|---------|-------|----------|
| `editor/assembly-mode/AssemblyModeShell.jsx` | ? | soft 30 / hard 40 (.jsx) | tab.kind='assembly' → tab.kind='sequence-mode' переключение OR keep old name |
| `editor/assembly-mode/AssemblyShellBody.jsx` | ? | soft 30 / hard 40 | read pieces из zone вместо segments из draft. ~+1 KB |
| `editor/assembly-mode/AssemblyHeader.jsx` | ? | soft 30 / hard 40 | minor wire |
| `editor/assembly-mode/AssemblySidebar.jsx` | ? | soft 30 / hard 40 | minor wire |
| `editor/assembly-mode/SegmentList.jsx` | ? | soft 30 / hard 40 | rename рендеринг "segment" → "piece" UI strings + data shape |
| `editor/assembly-mode/SegmentDetailPanel.jsx` | ? | soft 30 / hard 40 | piece shape вместо segment |
| `editor/assembly-mode/AssemblyToolbar.jsx` | ? | soft 30 / hard 40 | actions → CREATE_PIECE etc. |
| `editor/assembly-mode/AssemblySourcePicker.jsx` | ? | soft 30 / hard 40 | unchanged — uses LibraryTreeRoot |
| `editor/assembly-mode/InsertGapModal.jsx` | ? | soft 30 / hard 40 | gap piece — piece с manual range, sourceIds: ['__gap__'] sentinel или separate kind. Re-think |
| `editor/assembly-mode/AssemblyPrimersPanel.jsx` | ? | soft 30 / hard 40 | unchanged structurally; reads piece.acquisitionParams.primerPairId |
| `editor/assembly-mode/MethodPickerCard.jsx` | ? | soft 30 / hard 40 | переходит в Junction method picker для piece-piece junctions |
| `editor/assembly-mode/RealiseModal.jsx` | ? | soft 30 / hard 40 | unchanged — uses lib/assembly-realise.js (которая использует segments shape — нужен adapter) |
| `editor/assembly-mode/RealiseDagPreview.jsx` | ? | soft 30 / hard 40 | unchanged structurally |
| `editor/assembly-mode/useAssemblyPrimerWriting.js` | ? | soft 20 / hard 25 (.js) | reads piece.ranges вместо segment.start/end |
| `CanvasSkeleton/lib/assembly-model.js` | ? | soft 20 / hard 25 | DEPRECATED для T6+. Re-export through adapter. ~-keep |
| `CanvasSkeleton/lib/assembly-invariants.js` | ? | soft 20 / hard 25 | adapter для pieces invariants |
| `CanvasSkeleton/lib/assembly-realise.js` | ? | soft 20 / hard 25 | adapter — читает pieces вместо segments |
| `CanvasSkeleton/lib/segment-color-palette.js` | ? | soft 20 / hard 25 | DEPRECATED. piece.color уже HSL hash (T1) |
| `CanvasSkeleton/lib/segment-to-piece-adapter.js` | — (new) | soft 20 / hard 25 | ~8-10 KB adapter layer |
| `CanvasSkeleton/lib/skeleton-persistence.js` | ? (после T1-T3) | soft 20 / hard 25 | +migrateV6toV7 (~1.5 KB) |
| `SequenceView/overlays/SegmentZonesOverlay.jsx` | ? | soft 30 / hard 40 | rename `coloredZones` → `pieceZones` prop. Backward-compat alias |
| `store/skeleton-state-assembly.js` | ? | soft 20 / hard 25 | DEPRECATED после migration. Keep sub-reducer как `legacy-assemblies` для backward-compat snapshot loading. T-future cleanup |

**Главная угроза:** `assembly-mode/` файлы могут быть big (each), миграция трогает все 14. Risk R-T6-1 — large-scale refactor. Mitigation: adapter layer + поэтапная миграция (file by file), unit tests verify equivalence до и после.

---

## 1. Контекст

### 1.1 Что в коде сейчас (assembly-mode A1-A4)

После A1-A4 sprint (12-15.05.2026) реализовано:
- `state.assemblyDrafts: AssemblyDraft[]` — параллельно containers/operations/junctions/pieces (T1).
- AssemblyDraft = `{id, name, topology: 'linear'|'circular', segments: Segment[], realiseRevision?, position?, ...}`.
- Segment = `{id, kind: 'sourced'|'manual', sourceContainerId, start, end, orientation, ...}` — implicit piece embedded в draft.
- 16+ DEC-CANVAS-ASM-* решения зафиксированы.
- F1 tab system mounts `assembly-mode/AssemblyModeShell` для `tab.kind='assembly'`.
- Coloured zones rendering через `SequenceView/overlays/SegmentZonesOverlay.jsx` (opt-in `coloredZones` prop).
- `lib/assembly-realise.js` — A4 reverse-DAG algorithm: assemblyDraft → ops + junctions + containers.
- Primers written ON assembly sequence через `useAssemblyPrimerWriting.js` (V72-V74 mechanism).
- 14 файлов в `editor/assembly-mode/` + ~6 helpers в `lib/`.

### 1.2 Что не так с assembly-mode shape

**Проблема 1:** segments embedded в drafts. Один segment не reusable между drafts (как уже определено в DEC-CANVAS-4T-04 для pieces — piece reusable, ссылочный).

**Проблема 2:** segments — implicit piece. Не имеют поля acquisitionMethod (всегда implicit 'pcr' через RealiseModal output). Биолог не может explicitly выбрать «этот segment получаю рестрикцией, не ПЦР'ом».

**Проблема 3:** draft существует параллельно с DAG (operations/junctions) до Realise. После Realise — два представления одного и того же (draft + созданный DAG). В 4-tier модели — единая структура: pieces в zone, reactions auto-created, нет «draft» как отдельной сущности.

**Проблема 4:** "Realise" — отдельный модальный action создающий N ops + N-1 junctions + N+1 containers. В 4-tier — это происходит постепенно через `piece.acquisitionMethod = 'pcr'` → auto-create ромб PCR (T8). Не нужен большой одношаговый Realise.

### 1.3 Что меняется в T6

**Mapping:**
- `assemblyDraft` → `zone` с `viewMode='sequence'`.
- `draft.segments[i]` (kind='sourced') → `piece` (origin='legacy-migration', sourceIds=[segment.sourceContainerId], ranges=[{...segment range}]).
- `draft.segments[i]` (kind='manual') → `piece` (origin='legacy-migration', sourceIds=['__gap__'] sentinel — special "gap" piece OR new kind 'gap'). См. §5.4.
- `draft.topology` → derived из zone (final container topology — circular если zone имеет циркулярный финал).
- `draft.realiseRevision`, `lastRealisedAt` → drop (Realise as single action archives, post-T8 это auto-created continuously).

**Storage migration v6→v7:**
- Для каждого assemblyDraft → создать zone.
- Для каждого segment → создать piece + добавить `zoneId = newZone.id`.
- assemblyDraft.position → zone.bounds (default centered).
- Drop `state.assemblyDrafts` или keep как `legacy-assembly-drafts: []` для backward-compat reading старых snapshots.

**Code migration:**
- `AssemblyModeShell` mounts when `tab.kind='assembly'` — keep tab kind но reading shape changed. Tab показывает zone в `viewMode='sequence'`.
- `AssemblyShellBody` reads `pieces` из target zone вместо `segments` from draft.
- All UI components (SegmentList, SegmentDetailPanel, etc.) reading через adapter `selectZonePieces(state, zoneId)` вместо `selectDraftSegments(state, draftId)`.
- `lib/assembly-realise.js` — переписана как `lib/zone-pieces-to-dag.js` — читает pieces из zone, генерирует ops+junctions+containers. Сохраняет существующий API (RealiseModal без изменений).

### 1.4 Подход — adapter layer + поэтапная миграция

**Adapter `lib/segment-to-piece-adapter.js`:**
- `segmentToPieceData(segment): pieceData` — pure.
- `pieceToSegmentShape(piece): segmentLike` — для **temporary** обратной совместимости (некоторые UI компоненты не ещё мигрированы, читают segment shape).
- `zonePiecesAsAssemblyDraft(state, zoneId): draftLike` — для RealiseModal etc., shimming.

**Поэтапная миграция:**
- K1-K3: создать adapter + helpers + tests.
- K4-K6: мигрировать AssemblyShellBody / SegmentList / SegmentDetailPanel — самые heavy file consumers shape.
- K7-K9: мигрировать AssemblyHeader / AssemblySidebar / AssemblyToolbar.
- K10: AssemblyPrimersPanel / MethodPickerCard / useAssemblyPrimerWriting.
- K11: RealiseModal — переписать lib/assembly-realise.js без UI changes.
- K12: InsertGapModal — gap as special piece.
- K13: SegmentZonesOverlay → rename `coloredZones` → `pieceZones` prop с backward-compat alias.
- K14: Migration v6→v7.
- K15: Deprecate state.assemblyDrafts. Удалить ВСЕ usages assemblyDrafts из reducer.

После K15 — `editor/assembly-mode/` папка может быть переименована в `editor/sequence-mode/` (post-MVP). В T6 — НЕ переименовываем (риск breaking тестов и imports).

---

## 2. Стратегия

**Adapter-first.** Сначала создаём adapter — pure functions конвертирующие segment shape в piece shape и обратно. Тестируем adapter изолированно (~15 tests). После — постепенно правим UI components один за другим, передаём adapter helpers в место читания state.

**Transition window:** во время K4-K12 — некоторые компоненты читают piece shape, другие читают segment-like shape (через adapter wrap). Это допустимо потому что adapter — pure: один и тот же piece генерирует deterministic segment-like view.

**State migration в конце (K14).** До K14 — `state.assemblyDrafts` существует, новый код пишет в `state.pieces + state.zones`. Старые snapshots мигрируют по требованию (lazy). К K15 — assemblyDrafts удаляется из state.

**Tests-first:** для каждой sub-migration K4-K12 — сначала unit test, потом implementation. Регрессия assembly tests должна быть минимальной (~3 теста acceptable, остальные — переписаны на pieces shape).

---

## 3. Scope IN / OUT

### IN
- `lib/segment-to-piece-adapter.js` — adapter layer.
- Migration assembly UI components на pieces shape (14 файлов).
- Migration `lib/assembly-realise.js` → `lib/zone-pieces-to-dag.js` (rename + переписать).
- Schema migration v6→v7 в `skeleton-persistence.js`.
- Rename `coloredZones` prop в `SegmentZonesOverlay` → `pieceZones` (backward-compat alias).
- Add gap support — special piece (см. §5.4).
- Tests на adapter + всех мигрированных компонентов + integration migration v6→v7.

### OUT
- Переименование `editor/assembly-mode/` папки → `editor/sequence-mode/` (post-MVP).
- Удаление `state.assemblyDrafts` slice реально (deprecate в T6, удаление T-future).
- Удаление `lib/assembly-model.js` / `lib/assembly-invariants.js` / `lib/segment-color-palette.js` (deprecate, удаление в T-future).
- Toggle G/S — T7.
- Sequence-mode 3 состояния (пусто / палитра / собранная) rendering — T7.
- Drag piece в ленту — T7.

### NOT TOUCHED
- Library / Importer / SequenceView (только SegmentZonesOverlay prop renaming with alias).
- Operations adapters (T2 уже сделана интеграция через op-piece-bridge).
- Containers / pieces / zones data layer.
- PcrModeShell V71-V76.

---

## 4. Архитектурные решения

### DEC-T6-01 — Adapter pattern + поэтапная миграция, не одношаговый rewrite
Risk-уменьшение: 14 файлов мигрируются по одному, между К-точками — тесты validate equivalence.

### DEC-T6-02 — Gap segment → special piece (kind='gap')
Расширение Piece shape (T6 minor extension T1): новое поле `piece.kind: 'sourced' | 'gap'` (default 'sourced'). Gap-pieces имеют `sourceIds=[]`, `ranges=[]`, `gapLength: number`, `gapHint: 'linker'|'unknown'|'custom'`. Origin='manual-gap'.

Alternative — sentinel `sourceIds=['__gap__']` — rejected: invariant T1 требует `sourceIds.length === ranges.length` и каждый sourceId должен быть в state.containers. Sentinel ломает invariants.

Расширение piece-invariants.js: если `piece.kind='gap'` — пропускаем sourceIds/ranges checks, проверяем gapLength ≥ 0 & ≤ 10000 nt.

### DEC-T6-03 — viewMode='sequence' на zone activates assembly UI
T7 будет реализовывать reading zone.viewMode + rendering. В T6 — zone уже хранит viewMode (из T3 default 'graph'). Migration v6→v7 устанавливает viewMode='sequence' для zones созданных from assemblyDrafts.

### DEC-T6-04 — RealiseModal остаётся API-совместимым через переписанную assembly-realise.js
`realiseAssembly(state, draftId, perBoundaryMethods, opts)` — старый API. Новый: `realiseAssembly(state, zoneId, perBoundaryMethods, opts)` — same signature, different `id` semantics. Internal — читает pieces из zone, выводит diff (ops/junctions/containers). RealiseModal не знает что изменилось.

В T6 — переименовать `lib/assembly-realise.js` → `lib/zone-pieces-to-dag.js`. Старый файл — re-export через `lib/assembly-realise.js` для backward-compat (на 1 sprint, удалить T-future).

### DEC-T6-05 — ASSEMBLY_REALISE action remained, рассматривается как `ZONE_REALISE`
Семантически — то же самое. Reducer router (`handleAssemblyRealise` в `skeleton-state.js`) — переписать как `handleZoneRealise`. Action type 'ASSEMBLY_REALISE' keep как alias, dispatch'ит в новый handler.

### DEC-T6-06 — Migration v6→v7 — pure, idempotent, lossy на `lastRealisedAt`
- v6 snapshot имеет state.assemblyDrafts + state.zones (T3 added empty []) + state.pieces (T1 added empty [] OR populated через T2 migration).
- v7 migration: для каждого draft → создать zone с viewMode='sequence' + создать N pieces (origin='legacy-migration') + добавить zoneId=newZone.id на каждый piece.
- `draft.realiseRevision` / `lastRealisedAt` — DROP (lossy). Бумажная диаграмма ne knows о ревизиях.
- `state.assemblyDrafts` set to []. (Pre-T6 snapshots с assemblyDrafts будут мигрированы в zones.)

Idempotent: повторный вызов на v7 — schemaVersion stays 7, no new pieces (assemblyDrafts already empty).

### DEC-T6-07 — Adapter helpers — re-export через `selectors-pieces.js`
Не отдельный selectors-segments.js (избегаем дубль). `selectZonePiecesAsSegments(state, zoneId)` — re-export из `selectors-pieces.js` через adapter. Для backward-compat кода в RealiseModal.

### DEC-T6-08 — Tab.kind='assembly' оставляем (НЕ переименовываем в 'sequence-mode')
F1 tab system — биолог открывает существующий project, видит tab.kind='assembly'. Переименование внутри snapshot тождественно migration. Не делаем сейчас — post-MVP.

Mounting в `WorkspaceRouter` (F1) — `tab.kind='assembly'` mounts `AssemblyModeShell`, читает zone (не draft).

### DEC-T6-09 — Color palette — piece.color (T1 HSL hash) переиспользуется
`lib/segment-color-palette.js` deprecated. T1 generatePieceColor уже даёт стабильный hash. Migrated pieces при K14 v6→v7 — генерируется новый color из piece.id, не reused от segment.color (lossy). Биолог увидит другие цвета в migrated zone — minor inconvenience.

Альтернатива: preserve segment.color → piece.color при migration. Rejected: усложняет migration, биолог может перенастроить через UPDATE_PIECE_COLOR.

### DEC-T6-10 — Gap pieces invariants extension
piece-invariants.js — `validateCreate` / `validateUpdate` принимают `kind='gap'` flag:
- sourceIds = [] и ranges = [] OK.
- gapLength >= 0 && <= 10000 nt.
- name required (auto-name: «Гэп {length} нт»).
- functionalLabel = 'gap' (auto).

### DEC-T6-11 — InsertGapModal — переименован в InsertGapInZoneModal
Smaller scope rename. Внутри — uses piece.kind='gap' creation. Existing logic переиспользуется.

### DEC-T6-12 — useAssemblyPrimerWriting hook — переписан reading pieces вместо segments
`useAssemblyPrimerWriting(zoneId)` — replacing `useAssemblyPrimerWriting(draftId)`. Reads pieces в zone, computes assembly sequence через `computeAssemblySequence(pieces)` (новая lib функция, replacing legacy `computeAssemblySequence(segments)` в `lib/assembly-model.js`).

Primer writing logic unchanged (V72-V74 mechanism). Hook output — same shape (primer pair, recompute API).

### DEC-T6-13 — Tests baseline: 2822 (T5) → ~2870 (T6)
~48 новых tests (adapter + 14 component re-migrations + integration v6→v7).

Plus ~10 existing assembly tests — переписаны на pieces shape (не считаются как новые).

### DEC-T6-14 — Реализация переходит через transition в один sprint
NOT поэтапный multi-sprint (T6a / T6b / T6c). Один K1-K15 sprint. Чтобы тесты после K15 — green. Если К-точка не работает — Code останавливается и репортит в Chat, не двигается дальше.

### DEC-T6-15 — RealiseModal — переход с draftId на zoneId через ассist
RealiseModal принимает prop `draftId` сейчас. T6 расширяет — принимает `zoneId | draftId` (alias). Внутри — `targetId = props.zoneId || props.draftId` + бэкенд работает с zone.

В T-future — окончательное переименование prop в `zoneId`.

---

## 5. Adapter + shape changes + migration

### 5.1 segment-to-piece-adapter.js

```javascript
import { computePieceSize, autoPieceName } from './piece-model';
import { generatePieceColor } from './piece-model';
import { v7 as uuidv7 } from 'uuid';

/**
 * Конверсия segment (legacy) в pieceData (partial — без id/createdAt).
 */
export function segmentToPieceData(segment, container) {
  if (segment.kind === 'manual' || segment.kind === 'gap') {
    return {
      kind: 'gap',
      name: `Гэп ${segment.length || 0} нт`,
      sourceIds: [],
      ranges: [],
      gapLength: segment.length || 0,
      gapHint: segment.hint || 'unknown',
      origin: 'manual-gap',
      acquisitionMethod: 'synthesis',
      acquisitionParams: { type: 'manual-gap' },
      functionalLabel: 'gap',
    };
  }
  // sourced
  return {
    kind: 'sourced',
    name: segment.name || autoPieceName(container, { start: segment.start, end: segment.end }),
    sourceIds: [segment.sourceContainerId],
    ranges: [{
      sourceId: segment.sourceContainerId,
      start: segment.start,
      end: segment.end,
      orientation: segment.orientation || 'forward',
    }],
    origin: 'legacy-migration',
    acquisitionMethod: segment.acquisitionMethod || 'undefined',
    acquisitionParams: segment.acquisitionParams || {},
    functionalLabel: segment.functionalLabel || null,
  };
}

/**
 * Конверсия piece (4-tier) в segment-like shape (для backward-compat code, например RealiseModal которая reads segments).
 * Used в transition window K4-K12 + после T-future cleanup deprecated.
 */
export function pieceToSegmentShape(piece) {
  if (piece.kind === 'gap') {
    return {
      id: piece.id,
      kind: 'manual',
      length: piece.gapLength,
      hint: piece.gapHint,
      name: piece.name,
    };
  }
  const range = piece.ranges[0];
  return {
    id: piece.id,
    kind: 'sourced',
    sourceContainerId: range.sourceId,
    start: range.start,
    end: range.end,
    orientation: range.orientation,
    name: piece.name,
    color: piece.color,
    acquisitionMethod: piece.acquisitionMethod,
    acquisitionParams: piece.acquisitionParams,
    functionalLabel: piece.functionalLabel,
  };
}

/**
 * Все pieces в zone, представленные как assemblyDraft-like объект.
 * Used by RealiseModal и других legacy consumers.
 */
export function zonePiecesAsAssemblyDraft(state, zoneId) {
  const zone = (state.zones || []).find((z) => z.id === zoneId);
  if (!zone) return null;
  const pieces = (state.pieces || [])
    .filter((p) => p.zoneId === zoneId)
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));  // approx ordered
  return {
    id: zone.id,
    name: zone.name,
    topology: derivedTopology(zone, pieces, state),  // см. §5.5
    segments: pieces.map(pieceToSegmentShape),
    position: zone.bounds ? { x: zone.bounds.x, y: zone.bounds.y } : { x: 0, y: 0 },
    realiseRevision: 0,  // dropped в T6
    lastRealisedAt: null,
  };
}

/**
 * Compute assembly sequence из pieces (replacing computeAssemblySequence from lib/assembly-model.js).
 */
export function computeAssemblySequenceFromPieces(pieces, state) {
  let seq = '';
  for (const piece of pieces) {
    if (piece.kind === 'gap') {
      seq += 'N'.repeat(piece.gapLength);
    } else {
      // sourced — derived sequence (selectPieceSequence-like inline)
      for (const range of piece.ranges) {
        const container = (state.containers || []).find((c) => c.id === range.sourceId);
        if (!container) continue;
        let slice = container.sequence.slice(range.start, range.end);
        if (range.orientation === 'reverse') {
          slice = reverseComplement(slice);
        }
        seq += slice;
      }
    }
  }
  return seq;
}

import { reverseComplement } from '../../../sequence-utils';
```

### 5.2 Migration v6→v7

```javascript
function migrateV6toV7(snapshot) {
  if ((snapshot.schemaVersion ?? 6) >= 7) return snapshot;

  const assemblyDrafts = snapshot.assemblyDrafts || [];
  const existingZones = snapshot.zones || [];
  const existingPieces = snapshot.pieces || [];
  const containers = snapshot.containers || [];

  const newZones = [];
  const newPieces = [];

  let positionOffset = { x: 100, y: 100 };

  for (const draft of assemblyDrafts) {
    const newZoneId = `zn-${uuidv7()}`;
    const draftPosition = draft.position || positionOffset;
    const bounds = {
      x: draftPosition.x,
      y: draftPosition.y,
      width: 600,
      height: 400,
    };
    positionOffset = { x: positionOffset.x, y: positionOffset.y + 450 };

    const zone = {
      id: newZoneId,
      name: draft.name || `Сборка миграции`,
      bounds,
      collapsed: false,
      viewMode: 'sequence',  // DEC-T6-03
      autoResize: true,
      notes: `Мигрировано из assemblyDraft ${draft.id}. Topology: ${draft.topology}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    newZones.push(zone);

    // Конверсия каждого segment в piece
    for (const segment of (draft.segments || [])) {
      const container = containers.find((c) => c.id === segment.sourceContainerId);
      const pieceData = segmentToPieceData(segment, container || { name: 'unknown', id: segment.sourceContainerId, sequence: '' });
      const piece = {
        id: `pc-${uuidv7()}`,
        ...pieceData,
        color: generatePieceColor(`pc-tmp-${newPieces.length}`, newPieces.map((p) => p.color)),
        zoneId: newZoneId,
        derivedReactionId: null,
        frozen: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      newPieces.push(piece);
    }
  }

  return {
    ...snapshot,
    zones: [...existingZones, ...newZones],
    pieces: [...existingPieces, ...newPieces],
    assemblyDrafts: [],  // emptied (DEPRECATED keeping for back-compat reading)
    schemaVersion: 7,
  };
}
```

Idempotent: повторный вызов — schemaVersion stays 7, no new zones/pieces (assemblyDrafts already empty).

### 5.3 Piece shape extension для gap

```javascript
// piece-model.js extends:
const piece = {
  // ...existing fields (id, name, sourceIds, ranges, origin, acquisitionMethod, ...)
  kind: 'sourced' | 'gap',  // NEW T6, default 'sourced'
  gapLength?: number,        // NEW T6, only if kind='gap'
  gapHint?: 'linker' | 'unknown' | 'custom',  // NEW T6
};
```

`piece-invariants.js` — validateCreate расширяет:
- Если `rawPiece.kind === 'gap'` — пропускает sourceIds/ranges length checks. Проверяет gapLength ≥ 0 && ≤ 10000.
- Иначе — existing checks T1 applied.

### 5.4 InsertGapInZoneModal (renaming InsertGapModal)

Принимает `zoneId` вместо `draftId`. Внутри — same UX (gap length input + hint dropdown). On confirm:

```javascript
dispatch({
  type: 'CREATE_PIECE',
  piece: {
    kind: 'gap',
    gapLength: form.length,
    gapHint: form.hint,
    name: `Гэп ${form.length} нт`,
    origin: 'manual-gap',
    acquisitionMethod: 'synthesis',
    acquisitionParams: { type: 'manual-gap' },
    functionalLabel: 'gap',
    zoneId,
  },
});
```

### 5.5 derivedTopology helper

```javascript
/**
 * Топология зоны — derived от финального продукта.
 * Если zone имеет один circular финал — circular.
 * Иначе — linear.
 */
export function derivedTopology(zone, pieces, state) {
  // Финал зоны — container в zone без исходящих junctions.
  // Используется selector selectFinalProductsInZone из T3.
  const finals = (state.containers || []).filter((c) => 
    c.zoneId === zone.id &&
    !(state.junctions || []).some((j) => j.from === c.id)
  );
  if (finals.length === 0) return 'linear';  // default
  if (finals.some((c) => c.topology === 'circular')) return 'circular';
  return 'linear';
}
```

### 5.6 lib/zone-pieces-to-dag.js (renaming assembly-realise.js)

Same API:
```javascript
realiseAssembly(state, zoneId, perBoundaryMethods, opts = {})
// Returns:
//   { ok: true, diff: { containers, operations, junctions, positionsLayout, layoutShifted } }
//   { ok: false, error: string }
```

Internal logic — reading pieces from zone, computing N ops + N-1 junctions + N+1 containers. Mostly same as existing A4 code.

`lib/assembly-realise.js` — re-export:
```javascript
export { realiseAssembly } from './zone-pieces-to-dag';
```

### 5.7 SegmentZonesOverlay rename

`SegmentZonesOverlay.jsx` принимает `coloredZones` prop (existing). T6 alias `pieceZones`:
```javascript
function SegmentZonesOverlay({ coloredZones, pieceZones, ... }) {
  const zones = pieceZones ?? coloredZones;  // either prop works
  // ...
}
```

В новом code — используется `pieceZones`. Existing call sites — продолжают работать.

### 5.8 useAssemblyPrimerWriting rewrite

```javascript
export function useAssemblyPrimerWriting(zoneId, state, dispatch) {
  const pieces = useMemo(() => 
    (state.pieces || []).filter((p) => p.zoneId === zoneId)
                        .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)),
    [state.pieces, zoneId]
  );

  const sequence = useMemo(() => 
    computeAssemblySequenceFromPieces(pieces, state),
    [pieces, state.containers]
  );

  // ...rest unchanged (primer writing via V72-V74 hooks)
}
```

### 5.9 State.assemblyDrafts deprecation

`skeleton-state-assembly.js` reducer становится **read-only** (для backward-compat снапшотов):
- `buildInitialAssemblyState()` → returns `{ assemblyDrafts: [], assemblyDraftPrimers: {} }`.
- `assemblyReducer(state, action)` — все ASSEMBLY_* actions становятся NO-OP (return state). Comment: deprecated, replaced by piece-based actions.
- В T-future — full removal sub-reducer.

ASSEMBLY_REALISE action в router — переписать (DEC-T6-05).

---

## 6. Порядок выполнения

**K1.** Create `lib/segment-to-piece-adapter.js` (§5.1). Pure helpers. ~10 unit tests на adapter (`adapter.test.js`).

**K2.** Расширить piece-model.js — добавить `kind: 'sourced'|'gap'` + gap fields. Update createPiece.

**K3.** Расширить piece-invariants.js — gap-mode validation.

**K4.** Migration v6→v7 в `lib/skeleton-persistence.js` (§5.2). Add 5 unit tests на migration (idempotent + single draft + multi draft + gap segments + bad container refs).

**K5.** Create `lib/zone-pieces-to-dag.js` — переписать `lib/assembly-realise.js` reading pieces. ~8 unit tests на функцию.

**K6.** Re-export `assembly-realise.js` через alias на `zone-pieces-to-dag.js`. Existing callers unchanged.

**K7.** Migrate `editor/assembly-mode/AssemblyShellBody.jsx` — read pieces из zone (через selectors-pieces) вместо segments из draft. ~3 tests verify equivalence.

**K8.** Migrate `editor/assembly-mode/SegmentList.jsx` + `SegmentDetailPanel.jsx` — display pieces shape. ~3 tests.

**K9.** Migrate `editor/assembly-mode/AssemblyHeader.jsx` + `AssemblySidebar.jsx` + `AssemblyToolbar.jsx`. ~2 tests.

**K10.** Migrate `editor/assembly-mode/AssemblyPrimersPanel.jsx` + `MethodPickerCard.jsx` + `useAssemblyPrimerWriting.js`. ~2 tests.

**K11.** Migrate `editor/assembly-mode/RealiseModal.jsx` + `RealiseDagPreview.jsx` — accept `zoneId` prop with `draftId` alias. ~2 tests.

**K12.** Migrate `editor/assembly-mode/InsertGapModal.jsx` → renaming `InsertGapInZoneModal` + gap piece creation logic. ~2 tests.

**K13.** Rename `SegmentZonesOverlay.jsx` prop `coloredZones` → `pieceZones` с alias. ~1 test.

**K14.** Deprecate `state.assemblyDrafts` — assemblyReducer становится no-op. Update `buildInitialState` keep empty array. Migration v6→v7 emptys assemblyDrafts.

**K15.** Integration test full flow:
- Pre-T6 snapshot (имеет N assemblyDrafts) → migrate → state.zones.length+N, state.pieces.length+sum(segments).
- Open `tab.kind='assembly'` → AssemblyModeShell reads zone, displays pieces.
- RealiseModal — works through new shape, generates ops/junctions/containers identically to pre-T6.
- ~3 integration tests.

**K16.** Manual smoke:
1. Открыть pre-T6 snapshot (через localStorage или dev-tool import). Migration v6→v7 — automatic at load. Assembly draft из snapshot → zone visible (T4 если уже реализована, или check via state inspector).
2. Open assembly tab → AssemblyModeShell mounts → SegmentList показывает мигрированные pieces.
3. Insert gap — gap piece создаётся (kind='gap'), visible в SegmentList.
4. RealiseModal → click realise → ops/junctions/containers создаются как раньше.
5. Primer writing through assembly sequence — V72-V74 Ctrl+R/Ctrl+Alt+R работают на target zone.

**K17.** Size budget check.

---

## 7. STOP-условие

Code останавливается после K17.

Отчёт:
```
## T6 Sequence-Mode Migration — отчёт
Commits: ...
Vitest: 2822 → 2871 pass / 1 skip / 0 fail (+49) — including 12 переписанных assembly tests
pytest: 112/112
vite build: clean

Size budget:
- lib/segment-to-piece-adapter.js: X.X KB (new) ✓
- lib/zone-pieces-to-dag.js: X.X KB (new) ✓ (was assembly-realise.js)
- lib/assembly-realise.js: 0.X KB (alias re-export) ✓
- editor/assembly-mode/AssemblyShellBody.jsx: X.X KB (~+1) ✓
- editor/assembly-mode/SegmentList.jsx: X.X KB (~+1) ✓
- editor/assembly-mode/RealiseModal.jsx: X.X KB (~+0.5 alias) ✓
- store/skeleton-state-assembly.js: X.X KB (DEPRECATED, mostly empty) ✓
- lib/skeleton-persistence.js: X.X KB (+1.5 v6→v7) ✓
- piece-model.js: X.X KB (+0.5 gap fields) ✓
- piece-invariants.js: X.X KB (+0.5 gap validation) ✓

Migration verification:
- Pre-T6 snapshot с N assemblyDrafts → state.zones.length+N + state.pieces.length+sum(segments) all origin='legacy-migration' OR 'manual-gap'
- Idempotent — повторный v7 → no new zones/pieces
- Gap segments → piece.kind='gap', gapLength preserved
- assemblyDrafts: [] после migration
- RealiseModal — produces identical diff (ops/junctions/containers) для same input pre-T6 vs post-T6

Spec deviations: [list]
Открытые вопросы: [list]
```

---

## 8. Что делать при регрессии

1. **Existing assembly tests падают (>50% fail)** — migration сломала state shape. Откатить K7+ commit, переделать adapter подход.

2. **RealiseModal не находит pieces** — selector `selectPiecesByZoneId` (T1) не работает. Проверить что migration установила piece.zoneId правильно. Логи migration в console.

3. **gap pieces не визуализируются на ленте** — `computeAssemblySequenceFromPieces` пропустил gap. Проверить логику `kind='gap'` branch в helper.

4. **Tab.kind='assembly' tab не открывается после migration** — F1 router mountеджит на kind, не на zoneId. Tab.targetId должен point на zone.id (был draft.id). Проверить migration tabs если они persistent (не think они are — tabs живут transient в editorContext).

5. **Primer writing на assembly sequence ломается** — useAssemblyPrimerWriting hook читает pieces shape вместо segments. Re-check K10.

---

## 9. Риски

### R-T6-1 — Large-scale refactor (14 файлов) — high regression risk
**Risk:** 14 файлов assembly-mode + lib helpers + state slice + migration. Один pass — risky.
**Mitigation:** Adapter-first (K1). Test-first для каждого K (K4-K12). Между K-точками — full test run. Если K-точка fails — Code stops + reports.

### R-T6-2 — Gap shape change ломает existing assembly tests
**Risk:** Existing tests предполагали `segment.kind='manual'` + `segment.length`. New shape — `piece.kind='gap'` + `piece.gapLength`.
**Mitigation:** Adapter `segmentToPieceData` handles gap correctly. Tests переписаны на pieces shape в K7-K12.

### R-T6-3 — RealiseModal generates different ops после migration
**Risk:** `realiseAssembly` reading pieces vs segments — порядок может отличаться. Output diff non-equivalent.
**Mitigation:** Pieces сортируются по `createdAt` (которая для legacy-migration сохраняется из draft segment order). `zone-pieces-to-dag.js` имеет integration test с deterministic input → deterministic output.

### R-T6-4 — state.assemblyDrafts удаляется но snapshot has it
**Risk:** Pre-T6 snapshot загружается, migrate → snapshot has assemblyDrafts: []. Что если snapshot already corrupted?
**Mitigation:** REPLACE_STATE merge default — if loaded.assemblyDrafts present, use it (corrupt or not). Migration runs after. Pure idempotent.

### R-T6-5 — Tab.kind='assembly' ссылается на draftId, draft removed
**Risk:** Tab persistent (in editorContext) с targetId=draftId. После migration draft удалён. Tab сломан.
**Mitigation:** Migration v6→v7 — also rewrite editorContext.tabs: для каждого tab.kind='assembly' с targetId=draftId — заменить на targetId=newZone.id (mapping draft→zone остаётся в memory во время migration).

### R-T6-6 — `coloredZones` prop alias не работает в существующих call sites
**Risk:** SegmentZonesOverlay вызывается в Library/Importer/SequenceView с `coloredZones` prop. Alias backward-compat должен сохранить.
**Mitigation:** Alias `pieceZones ?? coloredZones` — both work. Test verifies both call patterns.

### R-T6-7 — Adapter helpers возвращают wrong shape
**Risk:** segmentToPieceData / pieceToSegmentShape mistakes — corrupt piece data.
**Mitigation:** Comprehensive unit tests на adapter (K1, ~10 тестов). Round-trip test: segment → piece → segment-shape должен быть equivalent.

---

## 10. Открытые вопросы для Chat

1. После K14 — `state.assemblyDrafts` empty array. Stub `assemblyReducer` no-op. Это удаление **функциональности**? — Нет, функциональность переходит в zone+pieces. Reducer keep для backward-compat REPLACE_STATE.
2. `editor/assembly-mode/` папка имя — не переименовываем в T6. Биолог откроет tab.kind='assembly', mount the same shell, читает zone. UI text changes "Сборка" / "Куски" вместо "Segment". Это OK?
3. Cross-zone piece references — если piece в zone A, но через `piece.sourceIds` ссылается на container в zone B — это legitimate?
   - Дефолт: yes. Piece is global (DEC-CANVAS-4T-04), container.zoneId — это location на canvas. Piece's source может быть anywhere.

---

## 11. Pre-handoff чеклист

- [x] Срез размеров в §0, watch на skeleton-state-assembly deprecate.
- [x] Контекст с existing assembly-mode реализацией (§1.1).
- [x] Стратегия: adapter-first + поэтапно (§2).
- [x] Scope IN/OUT.
- [x] DEC-T6-01..15.
- [x] Adapter helpers + migration + shape extensions (§5).
- [x] K1-K17 detailed.
- [x] STOP-условие.
- [x] 7 рисков с митигациями.
- [x] Открытые вопросы.
- [x] Размер 50-60 KB target.
- [x] Reference на якорь + T1, T2.
- [x] No переименование папки (post-MVP).

---

**Дата:** 16.05.2026.
**Якорь:** SPEC_M-CANVAS-FOUR-TIER-ARCHITECTURE.md DEC-CANVAS-4T-26, 29.
**Следующий sprint:** T7 — dual-mode toggle G/S + bidirectional sync + 3 состояния sequence-mode.
