# Plasmid-git revive — ось B (sequence-edit history) в four-tier

> **Тип:** дизайн (вход для спринта). **Дата:** 02.06.2026. **База:** `CANVAS_DESIGN_PROPOSAL.md` §«Git / версионирование» (две оси истории).
> **Закрывает:** `TD-PLASMID-GIT-LOSS` (plasmid-git отвалился — был подключён только через снесённый FragmentEditor).
> **Уважает ⚓:** DEC-V2-02 (provenance = ось A, отдельно), sequence-first, DEC-ANN-10 (coords 0-based end-exclusive).

## 1. Две оси — напоминание

| | Ось A — provenance | Ось B — sequence-edit history |
|---|---|---|
| Вопрос | «из чего собрано» | «что правилось в ЭТОЙ молекуле» |
| Структура | bipartite-граф Material/Reaction (four-tier) | `baseSnapshot` + `commits[]` + replay (plasmid-git) |
| Кардинальность | N родителей у продукта | 1 предшественник (линейно) |
| Где живёт | `state.operations[]` + рёбра | поля на ОДНОМ `Material` |
| UI | timeline сборки на канвасе (мокап) | version-timeline в инспекторе записи |

Они **не схлопываются**. Эта спека — только ось B.

## 2. Что уже есть (инвентарь)

- **`lib/plasmid-git.js`** — полный движок, цел: `bootstrapBaseSnapshot`, `createCommit(type,parentPos,payload,label,msg)`, `replay(base,commits)→{sequence,annotations,warnings}`, `replayDiff(base,commits,cdsRegions)→Map<head,'silent'|'nonsilent'>`, `resolveAutoOverride`, `adjustAnnotationCoords`, `codonStart`. Типы коммитов: substitution (newCodon) / deletion (deleteLength) / insertion (insertSequence), coords = parentPos в baseSnapshot.
- **`lib/plasmid-git-reducers.js`** + **`lib/__tests__/plasmid-git.test.js`** — есть.
- **Референсы:** `useFragmentHandlers.js`, `SequenceView/index.jsx`, `bodge-container-genbank.js` (экспорт), `PlasmidVersionTree.jsx` (legacy UI).
- **Проблема:** нет живого write-path в four-tier. Редактирование сейчас идёт ТРЕМЯ несведёнными путями: (1) `library-sequence-edit.js::applySequenceEditToEntry` (наш common-features in-viewer editing, Пачка 3), (2) manual-edit-branching (Library), (3) orphaned plasmid-git. Ревайв = **свести их в один**.

## 3. Целевая модель

### 3.1 Где ось B живёт
На `Material` (Container/Piece, у которого есть собственная редактируемая последовательность):

```ts
Material {
  id, name, kind, ...
  // ── Ось B (sequence-edit history) ──
  baseSnapshot?: { sequence: string, annotations: Annotation[] },  // immutable bootstrap
  commits?: Commit[],          // append-journal
  // derived (НЕ персистится — replay): sequence, annotations
}
```
`commits == undefined` / `[]` → «не редактировалась» (length===0 — норма, DEC-V2-15). Производные `sequence`/`annotations` — через `replay`, не хранятся (single-source-of-truth = base+commits).

### 3.2 Единый write-path
Редактируемый `SequenceView` уже эмитит `onSequenceEdit(op)` с `op.kind ∈ {insert,delete,replace}` (см. `useSequenceKeyboard`). Новый store-action маппит op → commit:

```ts
commitSequenceEdit(materialId, op): { ok, caretAfter } {
  const m = get material;
  if (!m.baseSnapshot) m.baseSnapshot = bootstrapBaseSnapshot(m);   // ленивый bootstrap на 1-й правке
  const commit = opToCommit(op, m);   // insert→insertion, delete→deletion, replace→substitution|del+ins
  const { commits, overriddenId } = resolveAutoOverride(m.commits||[], commit);
  m.commits = [...commits, commit];
  const { sequence, annotations, warnings } = replay(m.baseSnapshot, m.commits);
  m.sequence = sequence; m.annotations = annotations;   // derived cache for render
  persist (debounced);  // см. §3.4
  return { ok:true, caretAfter: computeCaret(op) };
}
```

`opToCommit`: `replace` с заменой == codon-aligned → `substitution(newCodon)`; иначе `deletion`+`insertion` (composite, как `applySequenceEditToEntry`). Coords `op.pos`/`start` (HEAD-coord) → `parentPos` обратным remap через applied indels (инверсия `_remap`).

> **⚠ Tension.** Сейчас common-features Пачка 3 пишет правки через `applySequenceEditToEntry` (плоско, без истории) — для overlay-записей это ОК (они не версионируемы). Для **проектных Material** (контейнеры в .bodge) — нужен plasmid-git. Правило: **versioned material → `commitSequenceEdit`; ephemeral overlay (common-features) → `applySequenceEditToEntry`**. Один `onSequenceEdit`-проп, разные consumer-обработчики (DEC-SQV-07 consumer-gated — уже наш паттерн).

### 3.3 Diff-подсветка
`replayDiff` уже даёт `Map<headCoord, 'silent'|'nonsilent'>` (CDS-aware через CODON_TABLE). Прокинуть в `SequenceView` overlay-слой (как searchHits) → подсветка правок в HEAD-виде. Бесплатно из существующего кода.

### 3.4 Персист
- **In-memory:** `commits` в zustand немедленно; derived sequence/annotations — replay-cache.
- **Dexie:** debounced (как common-features editCommonFeature, 400 мс).
- **`.bodge`:** ось B в `containers/<id>.gb` COMMENT (base64 JSON `{baseSnapshot, commits}`) — см. `BODGE_V2_PROVENANCE_SCHEMA_PLAN.md` фаза 3. GenBank LOCUS = HEAD (replay-результат); провенанс-полезная-нагрузка = base+commits для round-trip.

## 4. UI — version timeline (ось B)
- В инспекторе записи (НЕ на канвасе — там ось A): горизонтальная strip коммитов `● base → ◆ G26A → ◆ +his-tag → ◇ HEAD`, цвет по типу (sub/del/ins).
- Hover → tooltip (label + AA-эффект из replayDiff). Click → переключить `applied` (toggle commit) → re-replay (revert/redo без потери истории — движок уже умеет `applied:false`).
- Возродить/упростить `PlasmidVersionTree.jsx` ИЛИ новый lean `VersionTimeline.jsx` (по образцу нашего canvas-timeline-мокапа).
- `resolveAutoOverride` уже даёт «новая правка того же кодона гасит старую» — показать как override-связь.

## 5. План (фазы, TDD-first)
1. **P1 — write-path.** `commitSequenceEdit` action + `opToCommit` + обратный remap; unit-тесты (op→commit→replay инвариант: HEAD после == ожидание). Гейт: full Vitest. Без UI.
2. **P2 — derived render + diff.** Прокинуть replay-derived sequence/annotations + `replayDiff`-overlay в four-tier `SequenceView`. Тест: правка → подсветка silent/nonsilent.
3. **P3 — version timeline UI** в инспекторе + toggle `applied`. Тест: toggle → re-replay.
4. **P4 — .bodge persist** (ось B в COMMENT) + round-trip тест (зависит от BODGE_V2 фаза 3).
5. **P5 — свести edit-paths:** versioned→commitSequenceEdit, overlay→applySequenceEditToEntry; убрать дубль логики; manual-edit-branching переключить на commits (ветка = fork baseSnapshot+commits).

## 6. Решение для Игоря
- **Возродить, не хоронить:** движок цел, тесты есть, модель верна (две оси) — стоимость ревайва = wiring, не переписывание.
- **Гейт:** P1+P2 за один спринт (write-path + diff), P3-P5 — следующий. Привязка к M-C Container Window (где Material редактируется как первоклассный).
- Размер: `plasmid-git.js` 7.6 КБ (OK); новый `VersionTimeline.jsx` < soft.
