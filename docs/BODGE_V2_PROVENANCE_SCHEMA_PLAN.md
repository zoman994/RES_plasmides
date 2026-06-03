# `.bodge` v2 — provenance-схема под модель канваса: план (deltas, не rewrite)

> **Тип:** план эволюции схемы (вход для M-FORMAT-V2). **Дата:** 02.06.2026.
> **РАСШИРЯЕТ** `SPEC_BODGE_FORMAT_V2_CORE.md` (канонический формат — ZIP layout, manifest, `containers/<id>.gb`+COMMENT, `assemblies/<zoneId>.json`). НЕ переписывает.
> **Опорная модель:** `CANVAS_DESIGN_PROPOSAL.md` (bipartite Material/Reaction, две оси, operation-union, праймеры). **Связь:** `PLASMID_GIT_REVIVE_DESIGN.md` (ось B).
> **Главный вывод:** существующая v2-схема **уже** кодирует provenance-граф — research это валидировал, а не опроверг. Нужны **точечные дельты**, не новая модель.

## 1. Что УЖЕ совпало (брать как есть)

`assemblies/<zoneId>.json` (§7 формата) уже = bipartite-граф:
- **`operations[]`** = **Reactions первого класса** (рёбра): `{id, kind, status, inputs, inputPieces, outputs, params, junctionRefs, materializedClones[], executedAt}`. Это и есть наш T3 Reaction. ✓
- **`pieces[]`** + `containers/<id>.gb` = **Materials** (узлы): `sourceIds`, `ranges`, `origin`, `derivedReactionId`. ✓
- **`inputs`/`outputs`** = рёбра графа (`op → c10FINAL-product`). ✓ = PROV `used`/`wasGeneratedBy`.
- **`materializedClones[]`** (Sanger verified/failed + notebook link) — лаб-исход на ребре. ✓
- **flat-by-id, cross-ref validation** (§7.1), **`schema_version` semver в manifest** (§3), **миграции** (`bodge-migrations/v1-to-v2.js`). ✓ — ровно то, что советует OpenCloning-разбор.

**Вывод:** формат опередил модель. Документ ниже — только **дельты**.

## 2. Дельты (что добавить/уточнить)

### Δ1. `operation.params` → discriminated union по `kind` (типизация без god-классов)
Сейчас `params: {}` — свободный мешок (`{primerPairId, templateId, range}` для pcr, `{}` для gibson). Проблема: нет валидации, метод-ограничения не выражены.

**Предложение:** `params` — типизированный вариант, выбираемый по `operation.kind` (TS discriminated union; в JSON — просто разный shape, дискриминатор = `kind`):

```jsonc
// kind: "pcr"
"params": { "primerPairId": "pp..", "templateId": "c..", "range": {"start":100,"end":500} }
// kind: "golden_gate"
"params": { "enzyme": "BsaI", "fusionSites": [{"pieceId":"pc..","left":"AATG","right":"GCTT"}] }   // ← Δ ограничение
// kind: "gibson"
"params": { "overlapLen": 25, "circular": true }
// kind: "restriction"
"params": { "enzymes": ["EcoRI","BamHI"], "buffer": "CutSmart" }
// kind: "gateway"
"params": { "reaction": "LR", "attSites": ["attB1","attB2"] }                                       // ← Δ ограничение
```
Метод-специфичные **ограничения** (GG fusion-site совместимость, MoClo level, Gateway att) — поля на варианте, не отдельные классы (контраст 16 god-классам OpenCloning). Валидатор экспорта проверяет вариант по `kind`.

### Δ2. Две оси — развести явно + сделать ось B round-trip-able
- **Ось A (provenance)** = `assemblies/*.json operations[]`. ✓ уже.
- **Ось B (sequence-edit history)** = `containers/<id>.gb` COMMENT `commits[]`. **Проблема:** текущий shape COMMENT-коммита (`{id,parent,timestamp,kind,diff}`, §6.2) — **lossy audit**, не replay-able; не совпадает с in-memory `plasmid-git` (`{id,type,parentPos,payload,applied,createdAt}` + `baseSnapshot`).

  **Предложение (реконсиляция с `PLASMID_GIT_REVIVE_DESIGN`):** хранить в COMMENT именно plasmid-git-форму, чтобы round-trip мог `replay`:
  ```jsonc
  "axisB": {
    "baseSnapshotHash": "sha256-…",        // base = что в LOCUS минус commits, или явный snapshot
    "commits": [
      { "id":"…", "type":"substitution", "parentPos":78, "payload":{"newCodon":"GCT"},
        "label":"G26A", "applied":true, "createdAt": 1712… }
    ]
  }
  ```
  GenBank LOCUS sequence = HEAD (replay-результат, читаемо сторонними тулзами); `axisB` в COMMENT = base+commits для нашего round-trip. Старый `diff`-audit можно оставить как доп. человекочитаемый лог ИЛИ выпилить (он выводится из commits). **Решение Игоря:** заменить diff-audit на plasmid-git-commits (один источник) — рекомендую.

### Δ3. Праймеры — пул + ссылки (явно)
Сейчас: `primersEmbedded` в COMMENT контейнера + `primerPairId` в pieces/operations. **Уточнить:** единый **пул** на уровне проекта (соответствует `primerSlice` + Dexie `primers`), не дублировать праймер в каждом контейнере.

**Предложение:** top-level `primers.json` (или `primers` map в manifest) = пул `{id, name, sequence, tail, binding, tm, direction}`; реакции/pieces ссылаются `primerPairId`/`primerId`. `primersEmbedded` в COMMENT → только для standalone-контейнера вне проекта (portable fallback). Tail(5′)/binding-модель (наш `local-primer-design`, V123-125) — поля `tail`+`binding`, не одна строка.

### Δ4. Material abstract↔concrete (план vs построенное)
Sequence-first: `Piece.kind: sourced` (есть ДНК) уже есть; `gap` (известный/неизвестный linker) тоже. **Добавить** `kind: "planned"` — абстрактный материал (только `role`/`type`, ДНК «дорисуется») для стадии дизайна. additive, не ломает.

### Δ5. SBOL-выравнивание (additive, под §6 предложения)
- На фичах GenBank: `/bodge_id` (есть), **`/so_term`** (additive — SO:0000316 и т.п.) для SBOL-глифов + будущего SBOL3-export.
- **SBOL3 export** — one-way файл `export/<project>.sbol` (pySBOL3, MIT), НЕ нативно (⚓ DEC-V2-10). Material→Component, ось A→PROV Activity. Отдельная фича.

## 3. Точки напряжения

> **⚠ COMMENT round-trip (§6.4).** Ось B в base64-COMMENT уязвима к SnapGene long-line wrap — уже отмечено в формате (K0 fixture probe + маркеры `##BodgeGene-Provenance-START/END##` + `bodge-snapgene-loss-detect.js`). Дельта Δ2 это НЕ ухудшает (тот же canal), но увеличивает payload → K0 тестировать с реалистичным размером (десятки коммитов).

> **⚠ Дубль ребра.** `piece.derivedReactionId` + `operation.outputs[]` + `operation.inputPieces[]` — ребро закодировано с трёх сторон. Валидатор §7.1 уже ловит orphan; держать как денормализацию ради навигации, единый источник = `operations[]`.

## 4. План (фазы; «с планом» — как просил Игорь)

| Фаза | Что | Зависит | Риск |
|---|---|---|---|
| **P0** | Зафиксировать в `SPEC_BODGE_FORMAT_V2_CORE` принцип «operations[] = ось A» + добавить раздел «две оси» (Δ2 концептуально). Док-онли. | — | низкий |
| **P1** | `operation.params` discriminated-union (Δ1) + валидатор по `kind` + метод-ограничения (GG/MoClo/Gateway). Тесты валидатора. | модель операций в state | средний (рефактор op-params) |
| **P2** | Праймер-пул (Δ3): `primers.json` + ref-модель + tail/binding. Миграция `primersEmbedded`→пул. | primerSlice | низкий |
| **P3** | Ось B (Δ2): `axisB` plasmid-git-commits в COMMENT + round-trip тест (export→import→replay==HEAD). | `PLASMID_GIT_REVIVE` P4 | **высокий** (SnapGene wrap, K0) |
| **P4** | additive `kind:"planned"` (Δ4) + `/so_term` (Δ5a). | — | низкий |
| **P5** | SBOL3 one-way export (Δ5b). | pySBOL3 | средний |

**bump:** P1-P2 → `.bodge` `schema_version` 2.0.0→2.1.0 (additive, semver-minor; миграция v2.0→v2.1 в `bodge-migrations/`). P3 — 2.2.0. Никакого wipe (взяли подход OpenCloning: версия в файле + пошаговые миграции, ⚓ пересмотр DEC-V2-08).

## 5. Решение для Игоря
- Формат **уже** правильной формы (bipartite operations) — это сильная валидация выбранной модели. Дельты — **типизация params, реконсиляция оси B с plasmid-git, пул праймеров** — некрупные и additive (semver-minor, без wipe).
- Порядок: P0 (док) сразу → P1+P2 в M-FORMAT-V2 → P3 после ревайва plasmid-git → P4/P5 по мере надобности.
- Сделано как **план** (а не одношаговая схема) — по твоему «после и с планом».
