# SPEC_BODGE_FORMAT_V2_CORE.md — `.bodge` v2 формат: structure + manifest + migration

> **Тип задачи:** A (architecture, alg, data-model). Размер спеки ~33 KB.
> **Решения Игоря (19.05.2026, переписывание):**
> - CORE НЕ режем на фазы — «не лимитированы по срокам, делаем качественно».
> - `CanvasLayoutView.jsx` hard-breach (41.35 KB, TD-SIZE Active) — допустимо под ответственность Игоря, декомпозиция как pre-step НЕ требуется. CORE этот файл не задевает; NOTEBOOK будет под ту же ответственность.
> - **Schema bump v=10→v=11 ОТМЕНЁН** — внутренний state shape не меняется. Единственная ручка версии формата — `fileFormatVersion: "2.0.0"`. `SCHEMA_VERSION` остаётся `10`.
> - **Future-proof scaffolding выпилен** — Игорь единственный пользователь, BodgeGene личный инструмент. Поля под воображаемого academic-юзера (ORCID, license, DOI, forkedFrom, embargo, lastEditor, contentDigest, readOnly) исключены из v2.0.0 schema. Когда понадобится — добавим semver-minor bump (forward-compatible).
> - **SnapGene round-trip loss-checklist — заполняется по реальным фикстурам** (K0 fixture probe, см. §15). Никаких предположений «COMMENT preserved verbatim» до эмпирической проверки.
> - **Library vs Containers canonical rule** — решение Chat под делегирование Игоря «решай сам»: см. §16.
> - **`README.md` в корне ZIP** (19.05.2026, решение Игоря): добавлен для archive longevity / sharing без BodgeGene / quick preview через файл-менеджер. Plain markdown, zero JS, zero attack surface. Generator — `lib/bodge-readme-writer.js`. Содержание — §2.3, реализация — K16.
> **Якорь будущий:** DEC-BODGE-FMT-V2-01..N — promotion candidates в ANCHORS.md после реальной приёмки + 6-12 месяцев живучести.
> **Связь с существующим:** выплата ⚓ DEC-INTEROP-01 (08.05.2026, anchor невыплачен по факту — в v1 нет ни одного `.gb` внутри `.bodge`). Параллельная спека **SPEC_BODGE_NOTEBOOK_MARKDOWN.md** реализуется ПОСЛЕ приёмки CORE (depend on K6-K7).
> **Сессионная стоимость:** Sprint M-FORMAT-V2-CORE монолитный. Изолирован от UI работы — биолог продолжает работать с v1 во время разработки v2.

---

## 0. Где задача сядет (карта связей)

### 0.1 Existing код, который меняется

| Файл | Изменение |
|------|-----------|
| `lib/bodge-zip.js` (4.4 KB) | Переписать с нуля. Точки входа `writeBodge(state, options)` / `readBodge(blob)` сохраняют сигнатуры — внутренности новые, call-sites не ломаются |
| `lib/version.js` | `APP_VERSION` bump v0.8.3-alpha → v0.9.0-alpha. `SCHEMA_VERSION` НЕ меняется, остаётся `10` |
| `store/skeleton-store.js` | Новый optional slice `state.extensions[<vendor>]` для extension preserve. Notebook slice добавит NOTEBOOK спека |
| `store/skeleton-state.js` | НЕТ изменений к state shape за пределами optional `extensions` slice |
| `Library/index.jsx`, `Library/inspector/*` | Без изменений — opaque через bodge-zip facade |
| `CanvasLayoutView.jsx` (41.35 KB hard-breached) | **CORE этот файл не трогает.** NOTEBOOK будет добавлять notebook-tab integration отдельно (под ответственность Игоря) |

### 0.2 Existing модули, на которые спека опирается (не меняет)

- `useEntryPrimers` hook + `selectEntryPrimers` selector — view над unified state.
- `transferAnnotations` + `concatSegmentAnnotations` (V84) — для container provenance encode/decode.
- `assembly-model.js` + `piece-model.js` (T1-T6) — read-only внутри bodge-assembly-json writer.
- `validate.js` end-scanning — для container topology determination при write `.gb`.
- Backend `snapgene_parser.py` + BioPython fallback — для compatibility check при K0 fixture probe.

### 0.3 Новые модули CORE

- `lib/bodge-manifest-v2.js` — manifest build/validate/addAsset.
- `lib/bodge-container-genbank.js` — container ↔ GenBank + COMMENT provenance encode/decode.
- `lib/bodge-assembly-json.js` — zone/pieces/operations/junctions split.
- `lib/bodge-primers-json.js` — primer pool serialization + sequence-hash dedup.
- `lib/bodge-migrations/v1-to-v2.js` — migration pipeline.
- `lib/bodge-atomic-write.js` — safeWriteBodge pattern.
- `lib/bodge-recovery.js` — corruption recovery walker.
- `lib/bodge-export-profiles.js` — profile presets + filters.
- `lib/bodge-extensions.js` — extension read/write (bit-perfect preserve).
- `lib/bodge-snapgene-loss-detect.js` — multi-line COMMENT reassembly + loss detection (К0 deliverable).
- `lib/bodge-readme-writer.js` — generates plain markdown `README.md` в корне ZIP (overview structure из manifest + assemblies).

JSON Schema файлы: `schemas/bodge-manifest-v2.json`, `schemas/bodge-project-v2.json`, `schemas/bodge-assembly-v2.json`, `schemas/bodge-primers-v2.json`, `schemas/container-provenance-v1.json`. `schemas/bodge-notebook-v2.json` consume отдельная NOTEBOOK спека.

Fixtures: `gui/designer/src/__tests__/interop/fixtures/{snapgene-export,ape-export,ncbi-canonical,geneious-export,plannotate-output,bodge-v1,bodge-v0_7}/...` — реальные binary файлы, собираются в K0.

### 0.4 Что может сломаться

- **`writeBodge(state)` / `readBodge(blob)` signatures.** Сохраняем имена, через optional `options` объект подмешиваем `exportProfile`, `exportType`, `singleAssemblyZoneId`. Если call-site игнорирует options — defaults `{exportType: 'project', exportProfile: 'full'}`. Call-sites Library/Importer не ломаются.
- **Primer pool merge при open `.bodge`.** Текущая логика «merge by id» расширяется на «merge by normalized-sequence-hash dedup» (§8.1). Поведение runtime меняется — regression-test обязателен.
- **Library entries при container re-import после external edit.** Правило резолва — §16 «library vs containers canonical».
- **T10 `op.materializedClones[].notes`.** CORE не трогает. NOTEBOOK мигрирует это в notebook entries — отдельная зависимая спека.

---

## 1. Контекст и мотивация

### 1.1 Что в v1 (актуальное на 19.05.2026)

`gui/designer/src/lib/bodge-zip.js` — 4.4 KB. ZIP v1 содержит:
- `manifest.json` — 5 полей: fileFormatVersion / schemaVersion / appVersion / createdAt / updatedAt.
- `project.json` — **весь Zustand state** одним JSON blob'ом.
- `library/entries.json` — добавлено 09.05.2026 для self-contained projects.

Внутри `.bodge` v1 **нет ни одного GenBank-файла**. ⚓ DEC-INTEROP-01 (08.05.2026) обещал «каждый container — valid `.gb` файл с COMMENT provenance», но в коде это **не реализовано** — `readBodge` warns `«Игнорирован раздел containers/ — поддержка появится в M-B+»`. M-B+ был месяц назад. Долг к выплате.

### 1.2 Что в state v0.8.3-alpha (Four-tier T1-T10 + T4.5)

После T-серии state содержит четыре slice'а первоклассно:
- `state.containers[]` — physical container ДНК records.
- `state.pieces[]` — концептуальные «куски» (T1, кандидат ⚓ DEC-CANVAS-4T-01).
- `state.operations[]` с `op.inputPieces[]` (T2 surgical migration).
- `state.zones[]` Miro-style рамки (T3, кандидат ⚓ DEC-CANVAS-4T-07).
- `op.materializedClones[]` (T9).
- `piece.sangerVerified + notes` (T10).
- `node.pinned` на containers/pieces/operations (T4.5).

После **реверса DEC-T3-08** (17.05.2026) — `state.zones[]` может быть пустым при чистом старте проекта. Это норма (зоны создаются явно через «+ Сборка»).

В v1 формате `.bodge` всё это сохраняется как побочный эффект сериализации всего `project.json`. Не дизайн — accidental. Работает при export → reload, но:
- Лишено GenBank interop (нельзя открыть container в SnapGene без BodgeGene).
- Не portable per-assembly.
- Нет provenance/audit trail.

### 1.3 Что биолог попросил (19.05.2026)

`.bodge` v2 содержит четыре first-class сущности:
1. **Containers** (много) — physical plasmid records.
2. **Assemblies** (много или одна) — zone + pieces + operations + junctions + materializedClones внутри.
3. **Primers** — project-scoped pool с container bindings (видимы в global pool runtime с badge «из проекта X»).
4. **Lab journal** — markdown с photo/attachments + cross-refs (детали в NOTEBOOK спеке).

Плюс: **обратная совместимость со SnapGene** (DEC-INTEROP-01) — критично. **Универсальность + расширяемость** встроены архитектурно. Файл компактный (типичный проект <10 MB).

Source файлы (`.dna` / `.gb` / `.fasta` импортов) — достаточно provenance trail в `COMMENT` containers, не хранятся как raw blobs (решение Игоря 19.05).

---

## 2. ZIP Layout v2 (full picture)

```
project.bodge (ZIP archive):

├── README.md                           # human-readable structure overview (zero-JS, archive-friendly)
├── manifest.json                       # signature / version / assets / refs / metadata
├── _recovery.json                      # parallel asset index для ZIP corruption recovery
├── project.json                        # lightweight: id / name / dates / focusedZoneId / UI state
│
├── containers/                         # ⚓ DEC-INTEROP-01 paid
│   ├── c01XYZABCDEF.gb                 # valid GenBank + COMMENT provenance
│   └── ...
│
├── assemblies/                         # NEW: каждая zone first-class
│   ├── zn01XYZABCDEF.json              # zone + pieces + operations + junctions + materializedClones
│   └── ...
│
├── primers/
│   └── pool.json                       # project-scoped primer pool, refs containerId
│
├── notebook/                           # детали — SPEC_BODGE_NOTEBOOK_MARKDOWN.md
│   ├── entries.json                    # markdown journal entries с typed refs
│   └── attachments/
│       ├── att01XYZABCDEF.png          # gel photos / lab notes images
│       ├── att02DEFGHIJKL.ab1          # Sanger chromatograms
│       └── ...
│
├── library/
│   └── entries.json                    # project-local library index/metadata (см. §16 canonical/index)
│
├── refs/
│   ├── projectDag.json                 # cross-zone DAG cache (regenerable)
│   └── external.json                   # DOI / NCBI accession / AddGene refs (минимальный slice)
│
└── extensions/                         # bit-perfect preserve unknown vendor data
    └── <vendor>/...                    # vendor-specific layout, no core validation
```

### 2.1 ASCII-safe internal names + display names

Все file names внутри ZIP — **ASCII-safe**: `c<uuidv7-prefix>.gb`, `zn<uuidv7-prefix>.json`, `att<uuidv7-prefix>.<ext>`.

Display names («pET-28b(+) копия 2», «pks4 knockout draft», «гель 14.05.png») — хранятся в `manifest.json::assets[].displayName` + соответствующих entity records. Решает Windows CP1251 / macOS HFS+ NFD normalization / cp866 ZIP tools одним ходом.

### 2.2 Per-asset compression policy

ZIP per-file compression задаётся в manifest:
- **DEFLATE level 6**: text (`.gb`, `.json`, `README.md`).
- **STORE** (no compression): already-compressed binaries (`.png`, `.jpg`, `.ab1`, `.pdf`).

Reasoning: повторное сжатие PNG/AB1 даёт +2-3% size (waste CPU). Text — наоборот 3-5x compression.

### 2.3 `README.md` — archive longevity preview

Plain markdown файл в корне ZIP. Назначение:
- **Archive longevity** — через 5-10 лет BodgeGene может не запуститься / API изменится, а README.md + `.gb` файлы остаются читаемыми любыми tools.
- **Sharing без BodgeGene** — collaborator получает `.bodge`, переименовывает в `.zip`, распаковывает, читает README.md в любом markdown viewer / просто текстовом редакторе.
- **Quick preview через файл-менеджер** — 7-Zip / WinRAR / macOS Finder Quick Look показывают README.md без распаковки.

**Zero JS, zero attack surface.** Не интерактивный по дизайну — никаких `<script>`, никакого second UI который мог бы разойтись с BodgeGene UI через 2-3 sprint'а. README.md не replacement для BodgeGene, это map для navigation внутри ZIP.

Генерируется при каждом save из manifest + assemblies. Не source of truth — derived artifact (как `_recovery.json` и `refs/projectDag.json`).

Шаблон содержимого (генерируется `lib/bodge-readme-writer.js::buildReadme(manifest, projectJson, assembliesMap, primerPool, notebookEntries) → string`):

```markdown
# pks4 knockout study

**BodgeGene project** | Created: 2026-04-01 | Updated: 2026-05-19
Author: Igor | BodgeGene v0.9.0-alpha | File format: 2.0.0

## Описание

Gibson assembly of 4 fragments для pks4 knockout study.

Tags: aspergillus, crispr, pks4

## Структура

### Containers (3)

- `containers/c01XYZ.gb` — **pET-28b(+)**, 5369 bp circular
- `containers/c02DEF.gb` — **pUC19**, 2686 bp circular
- `containers/c10FIN.gb` — **pks4-ko final**, 8210 bp circular (Gibson product)

### Assemblies (2)

- `assemblies/zn01ABC.json` — **pks4-knockout** (4 fragments, Gibson, executed 14.05.2026)
- `assemblies/zn02XYZ.json` — **pks4-rescue** (2 fragments, PCR, draft)

### Primers

- `primers/pool.json` — 20 primers (project-scoped)

### Lab journal

- `notebook/entries.json` — 50 entries
- `notebook/attachments/` — 10 photos + 5 Sanger chromatograms (~8 MB)

### Library index

- `library/entries.json` — 50 plasmids, 30 primers

## Как открыть

- **`.bodge` archive (canonical):** BodgeGene v0.9.0+
- **Individual `.gb` files:** SnapGene, ApE, Geneious Prime, любой GenBank viewer
- **`README.md` (этот файл):** любой markdown viewer / просто текстовый редактор
- **Notebook attachments (`.png`, `.ab1`):** стандартные tools

## Format documentation

https://bodgegene.dev/format/v2 (опубликовано вместе с v0.9.0 release)
```

Важно:
- README.md **не** содержит provenance hashes / sha256 / commit history — это quick overview, не audit log. Audit log живёт в `manifest.json::assets[].sha256` + container COMMENT provenance.
- README.md **не** воспроизводит full notebook content — только summary statistics (entry count + attachment count). Full content — `notebook/entries.json`.
- README.md **regenerated** при каждом write `.bodge`. Биолог editing README.md руками — теряются изменения при next save. UI hint в HelpModal: «README.md в `.bodge` — auto-generated, правьте проект в BodgeGene».

---

## 3. `manifest.json` schema v2 (минимальный, без future-proof scaffolding)

```json
{
  "$schema": "https://bodgegene.dev/schema/bodge-manifest-v2.json",
  "signature": "BODGE-V2",
  "fileFormatVersion": "2.0.0",
  "appVersion": "0.9.0-alpha",
  "exportType": "project",
  "exportProfile": "full",

  "metadata": {
    "createdAt": "2026-05-19T00:00:00.000Z",
    "updatedAt": "2026-05-19T14:32:11.847Z",
    "title": "pks4 knockout study",
    "description": "Gibson assembly of 4 fragments...",
    "tags": ["aspergillus", "crispr", "pks4"],
    "author": { "name": "Igor", "deviceId": "01XYZ-device-uuid" }
  },

  "assets": {
    "containers/c01XYZ.gb": {
      "sha256": "a3f12b...",
      "size": 5234,
      "compression": "deflate",
      "displayName": "pET-28b(+)",
      "mimeType": "chemical/seq-na-genbank",
      "kind": "container"
    },
    "assemblies/zn01ABC.json": {
      "sha256": "b8e34d...",
      "size": 60123,
      "compression": "deflate",
      "displayName": "pks4-knockout",
      "kind": "assembly"
    },
    "notebook/attachments/att01DEF.png": {
      "sha256": "c1d567...",
      "size": 4521008,
      "compression": "store",
      "displayName": "гель PCR 14.05.2026",
      "mimeType": "image/png",
      "kind": "attachment-image"
    }
  },

  "refs": {
    "containers": ["c01XYZ", "c02DEF"],
    "assemblies": ["zn01ABC", "zn02XYZ"],
    "primerPool": "primers/pool.json",
    "notebook": "notebook/entries.json",
    "library": "library/entries.json",
    "projectDag": "refs/projectDag.json"
  },

  "extensions": {
    "<vendor-name>": {
      "version": "1.0.0",
      "files": ["extensions/<vendor>/data.json"]
    }
  }
}
```

### 3.1 Что **есть** в v2.0.0 (необходимый минимум)

- `signature: "BODGE-V2"` — magic для quick detection.
- `fileFormatVersion: "2.0.0"` — semver. Major bump = incompatible. Minor = forward-compatible (новые optional поля). Patch = bug fixes.
- `appVersion` — версия BodgeGene которая export нула. Diagnostic.
- `exportType: "project" | "assembly" | "container"` — receiver знает что это.
- `exportProfile: "full" | "public-supp" | "containers-bundle" | "single-assembly" | "custom"` (см. §13).
- `metadata.title / description / tags` — human-readable.
- `metadata.author.name` — кто создал (свободный текст, по умолчанию OS username или `localStorage.user.name`).
- `metadata.author.deviceId` — UUIDv7 устройства (генерируется при первом запуске, хранится в `localStorage.deviceId`). Diagnostic only — «этот файл создан с этого устройства».
- `metadata.createdAt / updatedAt` — ISO8601.

### 3.2 Что **выпилено** из v2.0.0 (когда понадобится — semver-minor bump)

- `schemaVersion` field — нет такого поля. Schema не bump'ится; единственная ручка — `fileFormatVersion`.
- `metadata.author.email` / `metadata.author.orcid` — academic scaffolding, Игорь один пользователь.
- `metadata.license` / `metadata.doi` — same.
- `metadata.forkedFrom` — multi-user fork attribution, single-user не нужен.
- `metadata.lastEditor` — multi-device sync conflict detection, single-user не нужен.
- `metadata.contentDigest` — citation-grade reproducibility hash, не нужно.
- `metadata.readOnly` — view-only режим UI ещё не реализован; флаг без write-path = шум.

Все эти поля **могут быть добавлены позже** как optional (forward-compatible, без major bump). Сейчас отсутствуют в schema файле и в writer/reader.

### 3.3 `assets` map

Каждый file path в ZIP → record с:
- `sha256` — content hash (integrity + dedup).
- `size` — uncompressed size в bytes.
- `compression` — `"deflate" | "store"`.
- `displayName` — UTF-8 human-readable.
- `mimeType` — для attachment dispatch.
- `kind ∈ {container, assembly, primer-pool, notebook-entries, attachment-image, attachment-sanger, attachment-pdf, attachment-other, library, ref, extension}`.

### 3.4 `refs` map

Quick lookup без полного перебора `assets`. UI читает manifest → знает сколько containers / assemblies / etc., может show progress bar при load.

---

## 4. `_recovery.json` — parallel index для corruption recovery

Shape:
```json
{
  "version": "2.0.0",
  "files": [
    { "path": "manifest.json", "sha256": "...", "size": 8421 },
    { "path": "containers/c01XYZ.gb", "sha256": "...", "size": 5234 }
  ]
}
```

**Цель:** ZIP central directory повредился — стандартный `unzipSync` падает на parsing. `recoverCorruptBodge(blob)` walks raw bytes, находит local file headers (ZIP format invariant: каждый file имеет inline header before data), validates against `_recovery.json`. Saves 95% of recoverable files.

**Module:** `lib/bodge-recovery.js`. Helpers:
- `walkZipLocalHeaders(blob) → Array<{path, content}>` — byte-level walker.
- `recoverCorruptBodge(blob) → {recoveredFiles: Map<path, Uint8Array>, failed: Array<{path, reason}>}` — combine с recovery index.

Spawned manually через UI menu «Recover corrupt `.bodge`...» — не auto, биолог осознанно (см. §12.3).

---

## 5. `project.json` — lightweight

```json
{
  "$schema": "https://bodgegene.dev/schema/bodge-project-v2.json",
  "id": "p01XYZABCDEF",
  "name": "pks4 knockout study",
  "createdAt": "2026-04-01T10:00:00.000Z",
  "updatedAt": "2026-05-19T14:32:11.847Z",
  "focusedZoneId": "zn01ABC",
  "labels": { "color": "amber", "icon": "🧬" },
  "ui": {
    "lastOpenedTab": "library",
    "viewportZoom": 1.0,
    "viewportCenter": { "x": 0, "y": 0 }
  }
}
```

**Что НЕ в project.json (отличие от v1):**
- Containers / pieces / operations / zones / junctions — **вынесены** в `containers/` + `assemblies/`.
- `materializedClones` — внутри `assemblies/<zoneId>.json`.
- Primer pool — в `primers/pool.json`.

`project.json` теперь **только** metadata + UI state. Размер 1-5 KB (v1 имел 50-500 KB — там был state-blob).

---

## 6. `containers/<id>.gb` — valid GenBank + COMMENT provenance

### 6.1 GenBank standard fields

```
LOCUS       pET-28b               5369 bp DNA  circular  19-MAY-2026
DEFINITION  Expression vector with His-tag, KanR selection.
ACCESSION   c01XYZABCDEF
VERSION     c01XYZABCDEF.7
KEYWORDS    plasmid; expression; kanamycin.
SOURCE      synthetic DNA construct
  ORGANISM  synthetic DNA construct

FEATURES             Location/Qualifiers
     promoter        17..51
                     /label="T7 promoter"
                     /bodge_id="01ABCDEF"
                     /color="#E8A85F"
                     /note="Phi 10 promoter, recognized by T7 RNA polymerase"
     CDS             80..262
                     /label="6×His-tag"
                     /bodge_id="01DEFGHI"
                     /parent_feature="01ABCDEF"
                     /color="#D4C8A0"
     primer_bind     complement(120..145)
                     /label="T7-rev"
                     /note="sequence:ATACAAAATCTGTATTTCAGGGCATGGGCAGCAGC"
                     /bodge_id="01PRMR01"

ORIGIN
        1 atgcatatga agctttaata cgactcacta taggggaatt gtgagcggat aacaattccc
       61 ctctagaaat aattttgttt aactttaaga aggagatata ccatgggcag cagccatcat
      ...

COMMENT     ##BodgeGene-Provenance-START##
            schema      :: https://bodgegene.dev/schema/container-provenance-v1
            format      :: base64-json
            payload     :: eyJjb250YWluZXJJZCI6ImMwMVhZWi4uLi...
            ##BodgeGene-Provenance-END##
//
```

### 6.2 Provenance payload в COMMENT (base64-encoded JSON)

```json
{
  "containerId": "c01XYZABCDEF",
  "baseSnapshotHash": "sha256-aaa...",
  "currentHash": "sha256-zzz...",
  "topology": "circular",
  "ends": null,
  "origin": {
    "kind": "imported",
    "source": "addgene-13522",
    "importedAt": "2026-04-01T10:30:00.000Z"
  },
  "provenance": {
    "projectId": "p01XYZABCDEF",
    "createdInVersion": "0.8.3-alpha",
    "modifiedInVersion": "0.9.0-alpha"
  },
  "commits": [
    {
      "id": "01CMT01",
      "parent": null,
      "timestamp": "2026-04-01T10:30:00.000Z",
      "author": "Igor",
      "kind": "import_baseline",
      "diff": null
    },
    {
      "id": "01CMT02",
      "parent": "01CMT01",
      "timestamp": "2026-04-15T11:00:00.000Z",
      "author": "Igor",
      "kind": "annotation_edit",
      "diff": {
        "added": [{ "label": "His-tag", "range": [80, 262] }],
        "removed": [],
        "modified": []
      }
    }
  ],
  "primersEmbedded": [
    { "id": "01PRMR01", "name": "T7-rev", "sequence": "ATACAAAATCTGT..." }
  ]
}
```

`commits` структура — append-only audit trail внутри single container. Kinds: `import_baseline`, `annotation_edit`, `sequence_edit`, `primer_attach`, `primer_detach`. Diff shape kind-specific.

### 6.3 Custom GenBank qualifiers (non-breaking extensions)

- **`/bodge_id`** — stable feature ID. Без него при re-import все annotations получают новые UUID → annotation_edit commits рвутся.
- **`/parent_feature`** — sub-feature → parent reference (BodgeGene `level: 'detail'` + `parentId` иерархия, DEC-LIB-04).
- **`/color`** — hex feature color (DESIGN_SYSTEM §2.1 palette A+v2).
- **`/note=sequence:ATCG...`** на `primer_bind` — SnapGene-симметрия для primer round-trip (DEC-LIB-08).

### 6.4 SnapGene compatibility — TBD по результатам K0 fixture probe

**Важное изменение vs оригинала:** эта таблица **НЕ предполагается заранее**. Заполняется по результатам **K0 fixture probe** (см. §15).

Утверждение «COMMENT preserved verbatim» из оригинала **не верифицировано**. Реальное поведение SnapGene на long-line COMMENT (FASTA-style wrap >80 chars) неизвестно — base64 payload может разорваться на multi-line при round-trip и провенанс-цепь молча сломается.

K0 проверяет каждую строку в таблице с реальной фикстурой. Заполнение происходит в порядке:
1. Export reference container (pET-28b с искусственно созданным provenance COMMENT в ~3 KB base64).
2. Import в SnapGene → export обратно в `.gb`.
3. Re-import в BodgeGene.
4. Diff: что survived bit-perfect, что reformatted, что потеряно.

Таблица §6.4 заполняется по реальным данным. **До K0 — таблица помечена «TBD по результатам K0».**

**Mitigation strategy** если COMMENT действительно рвётся на multi-line: encoding payload в single-line base64 с явными маркерами `##BodgeGene-Provenance-START##` и `##BodgeGene-Provenance-END##`. При re-import — `bodge-snapgene-loss-detect.js` парсит COMMENT, объединяет multi-line строки между маркерами, decode base64. Робастно к long-line wrap. Если K0 покажет что SnapGene вставляет невидимые reformat-чары между markers — добавляем normalisation step (strip leading whitespace на каждой строке между markers).

### 6.5 External-edit detection

Биолог открывает экспортированный `pET-28b.gb` в SnapGene, правит sequence, save, возвращает в BodgeGene. При re-import:

1. `parseGenBank(content)` → extract sequence + features + COMMENT.
2. Extract provenance payload из COMMENT (re-assemble multi-line если нужно через `bodge-snapgene-loss-detect.js`).
3. Recompute hash from current sequence + features.
4. Compare с `payload.currentHash` — если расходятся → **toast warning** «External edit detected. Last BodgeGene state: <date>. Sequence differs from provenance baseline» с тремя выборами:
   - **[Treat as new baseline]** — discard provenance, новый baseline = текущий state. (Default highlight.)
   - **[Restore baseline]** — revert sequence к baseline, lose external edits.
   - **[Cancel import]** — не импортировать.

Никогда не восстанавливаем silently.

---

## 7. `assemblies/<zoneId>.json` — schema

```json
{
  "$schema": "https://bodgegene.dev/schema/bodge-assembly-v2.json",
  "id": "zn01XYZABCDEF",
  "name": "pks4-knockout",
  "createdAt": "2026-05-10T14:00:00.000Z",
  "updatedAt": "2026-05-19T11:00:00.000Z",

  "zone": {
    "bounds": { "x": 100, "y": 100, "width": 800, "height": 600 },
    "viewMode": "graph",
    "laneLayout": "auto",
    "collapsed": false,
    "notes": "Initial pks4 ko design — 4 fragments via Gibson",
    "autoResize": true
  },

  "pieces": [
    {
      "id": "pc01FRAG01",
      "name": "frag-1",
      "kind": "sourced",
      "sourceIds": ["c01XYZABCDEF"],
      "ranges": [
        { "start": 100, "end": 500, "strand": 1, "sourceId": "c01XYZABCDEF" }
      ],
      "origin": { "kind": "existing-primers", "primerPairId": "pp01PCR01" },
      "acquisitionMethod": "pcr",
      "acquisitionParams": {
        "primerPairId": "pp01PCR01",
        "templateId": "c01XYZABCDEF"
      },
      "derivedReactionId": "op01PCR01",
      "frozen": true,
      "color": "#D4A574",
      "functionalLabel": "Hyg-cassette upstream homology",
      "variantGroupId": null,
      "order": 0,
      "pinned": false,
      "zoneId": "zn01XYZABCDEF"
    },
    {
      "id": "pc02GAP01",
      "name": "T2A linker",
      "kind": "gap",
      "gapLength": 54,
      "gapSequence": "GAGGGCAGAGGAAGTCTGCTAACATGCGGTGACGTCGAGGAGAATCCTGGCCCT",
      "gapHint": "known",
      "order": 1,
      "color": "#A0A0A0",
      "zoneId": "zn01XYZABCDEF"
    }
  ],

  "operations": [
    {
      "id": "op01PCR01",
      "kind": "pcr",
      "status": "executed",
      "position": { "x": 200, "y": 300 },
      "inputs": ["c01XYZABCDEF"],
      "inputPieces": ["pc01FRAG01"],
      "outputs": ["c02FRAG01-product"],
      "params": {
        "primerPairId": "pp01PCR01",
        "templateId": "c01XYZABCDEF",
        "range": { "start": 100, "end": 500 }
      },
      "junctionRefs": [],
      "zoneId": "zn01XYZABCDEF",
      "createdAt": "2026-05-11T09:00:00.000Z",
      "executedAt": "2026-05-11T09:15:00.000Z",
      "error": null,
      "materializedClones": null,
      "pinned": false
    },
    {
      "id": "op02GIBSON01",
      "kind": "gibson",
      "status": "executed",
      "position": { "x": 600, "y": 400 },
      "inputs": [],
      "inputPieces": ["pc01FRAG01", "pc02GAP01", "pc03FRAG02", "pc04FRAG03"],
      "outputs": ["c10FINAL-product"],
      "params": {},
      "zoneId": "zn01XYZABCDEF",
      "executedAt": "2026-05-14T16:00:00.000Z",
      "materializedClones": [
        {
          "cloneId": "c11CLONE01",
          "label": "clone-1",
          "sangerVerified": "verified",
          "notes": "OK, no mutations.\n\nSee Sanger entry: nb01SANGER01.",
          "sangerNotebookEntryId": "nb01SANGER01"
        },
        {
          "cloneId": "c12CLONE02",
          "label": "clone-2",
          "sangerVerified": "failed",
          "notes": "C234T silent mutation, попробовать ещё.",
          "sangerNotebookEntryId": "nb02SANGER02"
        }
      ]
    }
  ],

  "junctions": [
    {
      "id": "jn01",
      "kind": "gibson",
      "leftPieceId": "pc01FRAG01",
      "rightPieceId": "pc02GAP01",
      "overlapLength": 25
    }
  ],

  "positions": {
    "pc01FRAG01": { "x": 150, "y": 250 },
    "pc02GAP01": { "x": 300, "y": 250 },
    "op01PCR01": { "x": 200, "y": 350 }
  }
}
```

### 7.1 Cross-references validation

Validation при export — orphan ref хоть из `piece.sourceIds[]`, `op.inputs[]`, `op.outputs[]`, `materializedClones[].cloneId` → **export error** (fail-fast, биолог не получает битый файл). При import — **import warn** (не падать на чужом `.bodge` с битой ссылкой; перечислить какие refs orphan, биолог решает).

### 7.2 Portable subset для `.bodgeassembly`

При export `exportType: 'assembly'`:
1. Dependency walker от `assemblies/<zoneId>.json` → collect all `sourceIds` + `inputs` + `outputs` + `cloneIds` → set containerIds.
2. ZIP layout = `{manifest (exportType='assembly') + project.json (minimal) + assemblies/<one>.json + containers/<refs>.gb + primers/pool.json filtered by refs + notebook/ filtered by zoneId refs}`.
3. Receiver при import — merge zone в свой project + dedup containers по sha256 + merge primers (политика §8.1) + import notebook entries (см. NOTEBOOK).

---

## 8. `primers/pool.json` — project-scoped primer pool

```json
{
  "$schema": "https://bodgegene.dev/schema/bodge-primers-v2.json",
  "primers": [
    {
      "id": "pp01PRMR01",
      "name": "T7-fwd",
      "sequence": "ATACGACTCACTATAGGGGAATTGTGAGCGGATAAC",
      "tm": 60.2,
      "origin": {
        "kind": "library-selection",
        "projectId": "p01XYZABCDEF",
        "containerId": "c01XYZABCDEF",
        "range": { "start": 17, "end": 51, "strand": 1 }
      },
      "tags": ["T7", "expression"],
      "notes": "Standard T7 forward primer",
      "createdAt": "2026-04-01T11:00:00.000Z",
      "boundContainers": [
        { "containerId": "c01XYZABCDEF", "bindStart": 17, "bindEnd": 51, "strand": 1 }
      ]
    },
    {
      "id": "pp01PRMRPAIR01",
      "kind": "pair",
      "forwardId": "pp01PRMR01",
      "reverseId": "pp01PRMR02",
      "name": "T7 amplification pair",
      "ampliconLength": 360
    }
  ]
}
```

### 8.1 Импорт + global pool merge policy

При open `.bodge`:
1. Parse `primers/pool.json` → array of primers с `origin.projectId == thisProject.id`.
2. Merge в **runtime global primer pool** (Zustand slice):
   - Если primer с identical **normalized sequence** (uppercase + trim) уже в pool — **add reference, не дублировать record**. Origin расширяется: `{kind: 'multi-project', sources: [origin1, origin2, ...]}`. ID существующего primer сохраняется.
   - UI badge «из проекта X, Y» под primer'ом в global pool.
3. При close project — primers с **only** этого проекта origin удаляются из runtime pool (остаются в `.bodge` файле на диске).

**Behavior change vs v1:** v1 merge by id. v2 merge by sequence-hash dedup. **Regression test обязателен**: open двух `.bodge` с identical primer sequence в разных id — после merge в runtime один record с двумя sources.

---

## 9. `refs/projectDag.json` + `refs/external.json`

### 9.1 `projectDag.json` — cross-zone DAG cache

Cross-zone references (piece sourceIds выходят за свою zone). Кэш для UI link-rendering без перебора всех assemblies.

```json
{
  "$schema": "https://bodgegene.dev/schema/bodge-projectdag-v2.json",
  "edges": [
    {
      "fromZone": "zn02XYZ",
      "toZone": "zn01ABC",
      "kind": "container-ref",
      "containerId": "c01XYZABCDEF",
      "pieceIds": ["pc05FRAG05"]
    }
  ]
}
```

Regenerable from assemblies content. Не source of truth — **cache**. Export перегенерирует. Import может игнорировать и перегенерить, или trust (быстрее).

### 9.2 `refs/external.json` — typed external references

```json
{
  "$schema": "https://bodgegene.dev/schema/bodge-external-refs-v2.json",
  "refs": [
    { "id": "ref01", "kind": "addgene", "accession": "13522", "url": "https://www.addgene.org/13522/", "title": "pET-28b(+)" },
    { "id": "ref02", "kind": "ncbi", "accession": "NC_001416", "url": "https://www.ncbi.nlm.nih.gov/nuccore/NC_001416" },
    { "id": "ref03", "kind": "doi", "doi": "10.1038/nmeth.1318", "title": "Gibson DG et al. 2009" }
  ]
}
```

Notebook entries могут `@@ref:external:ref01@@` для inline citation. UI рендерит badge с URL.

---

## 10. `extensions/<vendor>/<id>/` — extension points

### 10.1 Цель

Vendor-specific data (CRISPR scoring fork, custom annotation pipelines, internal lab forks BodgeGene) — preserve **bit-perfect** через round-trip даже если core BodgeGene не знает что это.

### 10.2 Layout

```
extensions/
├── crispr-fork/
│   ├── manifest.json           # vendor-provided
│   ├── scores.json             # vendor data
│   └── targets/
│       └── target-01.json
└── synbio-collab/
    └── ratings.json
```

Vendor решает внутреннюю структуру. BodgeGene v2 core:
- **Reads** все `extensions/<vendor>/...` files.
- **Stores** в memory как `state.extensions[<vendor>] = {<path>: blobOrJson}`.
- **Writes** обратно bit-perfect при save.

### 10.3 Vendor manifest (опциональный)

`extensions/<vendor>/manifest.json` (если присутствует):

```json
{
  "vendor": "crispr-fork",
  "version": "1.2.0",
  "description": "CRISPR guide RNA scoring добавление",
  "homepage": "https://github.com/...",
  "files": ["scores.json", "targets/target-01.json"]
}
```

Просто metadata. BodgeGene core читает, может show в UI «Этот `.bodge` использует extension X v1.2.0», но не парсит data.

### 10.4 Conflict policy

Два user'а edit `.bodge` через разные forks — extensions **независимы по vendor namespace**, нет conflict. Core data — single-writer assumed (см. §12.2).

### 10.5 Что **НЕ** делает BodgeGene core

- НЕ валидирует extension content.
- НЕ ограничивает extension size (vendor сам решает).
- НЕ удаляет extensions при export profile «Public-supp» (vendor сам должен respect privacy).

Это даёт max flexibility forks. Risk: malicious extension может positively raise file size. Mitigation: UI shows «Extensions: X MB total» в file info, биолог видит и решает.

---

## 11. Migration v1 → v2 (atomic chain)

### 11.1 Принципы

- **Migration работает на копии**, не in-place. Original `pks4.bodge-v1` сохраняется как `pks4.bodge.v1-backup` до successful v2 write.
- **Atomic** — либо весь migration succeeds, либо файл остаётся v1.
- **Idempotent** — повторный запуск migration на v2 файле — no-op (detection через `manifest.signature === "BODGE-V2"`).
- **Lossless где возможно**, documented lossy points (§11.4).

### 11.2 Migration pipeline (proza, не реализация)

Module: `lib/bodge-migrations/v1-to-v2.js`. Entry point: `async migrateBodgeV1toV2(blob) → Blob`.

Шаги:
1. **Read v1.** `readBodgeV1(blob)` парсит manifest + project.json (state-blob) + library/entries.json.
2. **Split state в v2 sections.** Helpers:
   - `extractProjectMetadata(v1.project) → projectJsonV2` (id, name, dates, focusedZoneId, UI state).
   - `extractContainers(v1.project.containers) → Array<ContainerRecord>`.
   - `extractAssemblies(v1.project.zones, v1.project.pieces, v1.project.operations, v1.project.junctions) → Map<zoneId, AssemblyJsonV2>`. Если `state.zones === []` (после реверса DEC-T3-08 или v0.7.x без zones) — assemblies map пустой, containers loose (§11.4 lossy).
   - `extractPrimerPool(v1.project.primers, projectId) → PrimerPoolV2`.
   - Notebook section — пустой `{entries: [], attachmentsManifest: {}}` (v1 не имел notebook).
3. **Generate `containers/<id>.gb` files** через `lib/bodge-container-genbank.js::writeContainerToGenBank(container) → string`. COMMENT provenance с `origin.kind: "migrated-from-v1"`, `commits: [import_baseline]` (предыдущая история plasmid-git в v1 отсутствует, §11.4).
4. **Build v2 manifest** через `lib/bodge-manifest-v2.js::buildManifest(assetsList)` — sha256 каждого asset + display names + kinds. extensions раздел `{}`.
5. **Write ZIP v2** — `lib/bodge-zip.js::writeBodgeV2({manifest, project, containerFiles, assemblies, primers, notebook, library})`.
6. **Backup v1.** Перед заменой original — `pks4.bodge` → `pks4.bodge.v1-backup`.

### 11.3 Что **lossless**

- Containers sequence + features — full preserve.
- Pieces + operations + junctions — full preserve (v0.8.3 уже в state).
- Zones bounds + viewMode + laneLayout — full preserve.
- materializedClones (T9) + sangerVerified (T10) — full preserve.
- node.pinned (T4.5) — full preserve.
- Library entries — full preserve (тот же JSON shape, переехал в `library/entries.json`).

### 11.4 Что **lossy** (documented)

- **v1 без zones** (post-T3-revert v0.8.0+ или pre-T3 v0.7.x) — все containers становятся **loose** (`zoneId: null` в assemblies секции). Биолог восстанавливает zone'ы вручную через «+ Сборка». UI toast при open: «Файл создан без сборок. Добавьте «+ Сборка» для группировки.»
- **v1 plasmid-git history** — в текущем v1 codebase plasmid-git **не имеет on-disk persistence** (только runtime). После migration `commits[]` всегда `[{kind: 'import_baseline', timestamp: file.updatedAt}]` без предыдущих edits. Это lossy для future (когда plasmid-git будет писать историю на диск — добавим v1→v2 mapping). Сейчас нет потерь, потому что нечего терять.
- **Notebook** — отсутствует в v1. Создаётся пустой `notebook/entries.json: {entries: []}`. T10 `op.materializedClones[].notes` мигрирует **NOTEBOOK спека** (CORE сюда не лезет).
- **Pre-T3 vs Post-T3 v0.8.x:** обе ветки имеют `state.containers`, но pre-T3 (v0.7.x) — `zones` поля нет вообще. `extractAssemblies` detect отсутствие zones → loose containers (см. выше). Post-T3-revert v0.8.x — `zones: []` явно. Обе case'ы обрабатываются одинаково (toast).

### 11.5 UI flow

1. Detect v1 (`manifest.fileFormatVersion: 1` или manifest без `signature` поля).
2. Modal: «Файл `pks4.bodge` создан в v1 формате. BodgeGene v0.9 использует v2 формат с поддержкой сборок и журнала. Конвертировать?»
   - **[Конвертировать]** — `pks4.bodge.v1-backup` создаётся + migration runs + new `pks4.bodge` v2.
   - **[Открыть как read-only]** — view-only, без save.
   - **[Отмена]** — close.
3. После migration — toast «Файл успешно конвертирован в v2. Backup сохранён как `pks4.bodge.v1-backup`. Удалить backup можно после проверки.»

---

## 12. Atomic write + recovery

### 12.1 Write pattern (cloud-sync-friendly)

Module: `lib/bodge-atomic-write.js`. Entry point: `async safeWriteBodge(path, blob) → void`.

Логика (5 шагов):
1. **Write tmp.** `${path}.writing-${uuidv7()}.tmp` — паттерн обычно ignored Dropbox/iCloud/Google Drive sync.
2. **Verify integrity.** Re-read tmp, run `verifyBodgeIntegrity(reread)` (sha256 каждого asset matches manifest). Если рассыпается — `unlink(tmp)` + throw.
3. **Backup existing.** Если `path` существует — rename в `${path}.bak`.
4. **Atomic rename.** `tmp` → `path`.
5. **Keep backup.** `.bak` остаётся до следующего successful save (recovery option).

При crash между шагами:
- 1-2: tmp удаляется на disk cleanup (UI menu «Clean up tmp files»).
- 3-4: backup остаётся, original missing → recovery prompt при next open (§12.2).
- 5: norm.

### 12.2 Concurrent writes — single-writer assumption + warning

**Что НЕ обрабатывается v2.0.0:** биолог открыл `.bodge` в **двух BodgeGene instances** одновременно (две вкладки браузера, две запущенные Electron-копии, etc.).

Текущая модель — **single-writer assumed**. При save второй instance может:
- Перезаписать первый (last-write-wins, изменения первого теряются).
- Видеть partial `.writing-*.tmp` файл — пытается читать, fail.

**Mitigation v2.0.0:** при detect `.writing-*.tmp` файл рядом с `.bodge` на open — UI warning «Файл сейчас сохраняется другим BodgeGene (или сохранение прервалось). Подождите 5 секунд и попробуйте снова, либо запустите recovery.» Простая защита, не lock.

При recovery prompt:
- Если `.bak` существует без `.bodge` — modal «Найден backup. Возможно предыдущее сохранение прервано. Восстановить?»
- Если `.writing-*.tmp` существует > 60 секунд — likely abandoned, prompt «Удалить заблудившийся temp-файл?»

**Реальный file-lock** (FS-level через `node:fs.flock` или browser-level через BroadcastChannel) — **T-future**. Достаточно warning'а в v2.0.0.

### 12.3 ZIP corruption recovery (via `_recovery.json`)

Module: `lib/bodge-recovery.js`. Entry point: `async recoverCorruptBodge(blob) → {recoveredFiles, failed}`.

Логика:
1. Try standard `readBodgeV2(blob)` first. Если parse error НЕ central-directory — rethrow.
2. ZIP central directory broken — `walkZipLocalHeaders(blob)` parsing raw bytes для local file headers (ZIP invariant).
3. Find `_recovery.json` среди recovered files.
4. Для каждого ожидаемого файла из recovery index: проверить наличие в recovered set + match sha256.
5. Return partition `{recoveredFiles: Map<path, content>, failed: Array<{path, reason: 'missing'|'corrupted'}>}`.

UI: модал «N файлов восстановлено, M потеряно. Сохранить partial recovery как `pks4.bodge.recovered`?» с tree-view деталей recovered/failed.

---

## 13. Export profiles matrix

Module: `lib/bodge-export-profiles.js`.

Profile presets (shape skeleton):
```json
{
  "full":               "все sections, все attachments, full history",
  "public-supp":        "containers + assemblies + primers, notebook text-only, no attachments, no Sanger details, strip metadata.author.deviceId",
  "containers-bundle":  "только containers/, no assemblies, binding-only primer refs, no notebook",
  "single-assembly":    "одна chosen assembly + referenced containers + referenced primers + zone-filtered notebook",
  "custom":             "UI checkbox matrix per section"
}
```

Profile определяет фильтры на 8 sections: `containers`, `containerHistory` (commits[] в COMMENT), `assemblies`, `primers`, `notebook.entries`, `notebook.attachments`, `sangerDetails`, `library`. Для каждой section — three states `full | filtered | excluded`. Profile = preset из combination.

Helper signatures:
- `applyProfile(profileName, state) → FilteredState` — фильтрует state перед write.
- `getCustomProfileFromUI(checkboxState) → ProfileSpec`.
- `EXPORT_PROFILES_REGISTRY` — readonly map of preset definitions.

`public-supp` дополнительно strip `metadata.author.deviceId` (обнуляет в `null`) — single fingerprintable identifier, при public sharing убирается.

### 13.1 UI export modal

```
┌─ Export project: pks4 knockout study ─────────┐
│                                                │
│ Profile: [Full ▾]                              │
│                                                │
│  ☑ Containers (all 10, 100 KB)                │
│  ☑   Plasmid-git history (50 commits, 200 KB) │
│  ☑ Assemblies (2 zones, 120 KB)               │
│  ☑ Primer pool (20 primers, 20 KB)            │
│  ☑ Library entries (50 plasmids, 50 KB)       │
│  ☑ Notebook                                    │
│  ☑   Text entries (50 entries, 100 KB)        │
│  ☑   Photo attachments (10 photos, 8 MB)      │
│  ☑   Sanger chromatograms (10 .ab1, 300 KB)   │
│  ☑ External refs (3 DOIs)                     │
│  ☐ Extensions (none in this project)          │
│                                                │
│ Total export size: ~8.7 MB                    │
│                                                │
│ [Cancel]              [Export to file...]     │
└────────────────────────────────────────────────┘
```

Component: `canvas/ExportProjectModal.jsx`. Реализация — K10.

---

## 14. SnapGene round-trip — fixtures + tests

### 14.1 Test suite layout

```
gui/designer/src/__tests__/interop/
├── fixtures/
│   ├── snapgene-export/
│   │   ├── pET-28b.dna           # SnapGene-exported binary
│   │   ├── pUC19.dna
│   │   └── pET-28b.gb            # SnapGene-exported to .gb
│   ├── ape-export/
│   │   └── pET-28b.gb            # ApE-exported
│   ├── ncbi-canonical/
│   │   ├── pET-28b.gb            # NCBI Entrez fetch
│   │   └── pUC19.gb
│   ├── geneious-export/
│   │   └── pET-28b.gb            # Geneious Prime export
│   ├── plannotate-output/
│   │   └── pET-28b-annotated.gb  # pLannotate output
│   ├── bodge-v1/
│   │   ├── v0_8_with_zones.bodge       # post-T3 with zones
│   │   └── v0_8_post_revert_empty_zones.bodge
│   └── bodge-v0_7/
│       └── legacy-no-zones.bodge
└── interop.test.js
```

### 14.2 Test cases (round-trip BodgeGene ↔ SnapGene)

Каждый case — describe-block. Названия:
- `preserves sequence bit-perfect through .dna → .bodge → .gb`
- `preserves FEATURES with /label and /color`
- `preserves /bodge_id qualifiers through SnapGene round-trip` (TBD K0)
- `preserves COMMENT provenance verbatim OR via multi-line reassembly` (TBD K0)
- `detects external edit when sequence modified`
- `re-detects sub-features via coordinate inclusion fallback if /bodge_id lost`
- `parses SnapGene v3.x .dna binary correctly` (через snapgene_parser.py backend)
- `parses pLannotate-annotated .gb without losing custom qualifiers`
- `migrates v0.7 (pre-T3) .bodge to v2 without losing containers (with loose-containers toast)`
- `migrates v0.8 (post-T3-revert) .bodge to v2 with loose-containers warning`

### 14.3 Loss-checklist (заполняется по результатам K0 fixture probe)

**TBD** — таблица §6.4 заполняется fixture probe данными. Не предполагается заранее. См. K0.

---

## 15. K-точки для Code (Sprint M-FORMAT-V2-CORE)

**K0 — SnapGene fixture probe (NEW, gate для K3-K7).** Перед началом implementation:
1. Создать reference container `pET-28b-bodge.gb` с искусственно заполненным provenance COMMENT (~3 KB base64 payload — достаточно чтобы тестировать long-line behavior).
2. Открыть в SnapGene → export обратно в `.gb`.
3. Diff: что survived bit-perfect, что reformatted, что потеряно.
4. Повторить с ApE, Geneious Prime, NCBI canonical, pLannotate fixtures (fetch/export для каждого tool).
5. Зафиксировать таблицу §6.4 эмпирическими данными.
6. Спроектировать mitigation `lib/bodge-snapgene-loss-detect.js` (multi-line COMMENT reassembly + normalisation) по реальному поведению.
7. Tests — 5-8 (round-trip fixture для каждого tool).

**Отчёт K0 — таблица §6.4 заполнена + mitigation работает на всех 5 сторонних tools. Этот K0 — gate для K3-K7.**

**K1 — Schema migration registry foundation.** `lib/bodge-migrations/` directory + skeleton v1-to-v2.js + test fixture (один reference v1 file, frozen as `tests/fixtures/legacy/v1-pks4-knockout.bodge`). Migration chain test (v1 → v2 → re-export → re-import → state-identity assertion). +5 tests.

**K2 — Manifest schema v2 + validators.** `lib/bodge-manifest-v2.js`. Helpers: `buildManifest(assetsList) → ManifestV2`, `validateManifest(manifest) → {ok, errors}`, `addAsset(manifest, path, content, displayName, kind)`. JSON Schema файл `schemas/bodge-manifest-v2.json` для external validators (Ajv-compatible). +8 tests.

**K3 — Container `.gb` writer + reader.** `lib/bodge-container-genbank.js`. Helpers: `writeContainerToGenBank(container) → string`, `readContainerFromGenBank(string) → container`. COMMENT provenance encoder/decoder (base64-json через multi-line wrap-safe encoding из K0). Custom qualifiers /bodge_id, /parent_feature, /color, /note=sequence:... . +15 tests including SnapGene fixture round-trips (use K0 fixtures).

**K4 — Assembly JSON writer + reader.** `lib/bodge-assembly-json.js`. Splits state.zones / pieces / operations / junctions / materializedClones into `assemblies/<zoneId>.json` per zone. Validation: cross-refs на containerIds должны резолвиться. +10 tests.

**K5 — Primer pool JSON.** `lib/bodge-primers-json.js`. `writePrimerPool(state.primers, projectId) → poolJson`. `readPrimerPool(poolJson, currentState) → mergedState` с sequence-hash dedup (§8.1). +5 tests включая behavior change regression.

**K6 — ZIP v2 writer (main entry point).** Rewrite `lib/bodge-zip.js::writeBodge(state, options)`. Generates manifest с sha256 для всех assets. Per-asset compression policy (DEFLATE level 6 для text, STORE для binary). ASCII-safe filenames с displayName mapping в manifest. `_recovery.json` parallel index. +12 tests.

**K7 — ZIP v2 reader (main entry point).** `lib/bodge-zip.js::readBodge(blob) → state`. Detect signature → dispatch v1 vs v2. Validate manifest signature. Read all sections in parallel. Merge into state. Cross-reference integrity check (warn on orphan refs, не падать). +12 tests.

**K8 — Migration v1→v2.** `lib/bodge-migrations/v1-to-v2.js` — full migration (§11.2). Atomic write pattern (§12.1). Tests с references: v0.7.x (no zones), v0.8.x (post-T3-revert, zones:[]), v0.8.x с zones из времён DEC-T3-08 (до реверса). +10 tests.

**K9 — Atomic write + recovery.** `lib/bodge-atomic-write.js` — `safeWriteBodge()` (§12.1). `lib/bodge-recovery.js` — `recoverCorruptBodge()` для ZIP central directory corruption (§12.3). Concurrent-write warning при detect `.writing-*.tmp` (§12.2). UI prompts для backup detection. +8 tests.

**K10 — Export profiles.** `lib/bodge-export-profiles.js` — profile definitions + filter functions per section (§13). `public-supp` strip `metadata.author.deviceId`. UI export modal — `canvas/ExportProjectModal.jsx`. +10 tests.

**K11 — `.bodgeassembly` portable subset.** Single-assembly export через `exportProfile: 'single-assembly'` + dependency walker (§7.2). Import flow — merge zone в существующий project с container dedup по sha256 + primer dedup по sequence-hash. +8 tests.

**K12 — Extension points read/write.** `lib/bodge-extensions.js` — read all `extensions/<vendor>/...` files into `state.extensions[<vendor>] = {<path>: data}`. Write back bit-perfect. Test fixture с mock vendor extension. +5 tests.

**K13 — SnapGene round-trip test suite.** Fixtures setup (§14.1). Full `interop.test.js` suite (§14.2). +15 round-trip tests. Использует таблицу §6.4 заполненную в K0 — каждая строка верифицируется.

**K14 — Manual smoke test.** Real biolog workflow:
1. Open v0.8.2 `pks4.bodge` (v1 format) → migrate to v2 → toast «Конвертирован».
2. Verify `containers/c01XYZ.gb` файл создан, открывается в SnapGene → видит features.
3. Edit container в SnapGene → save .gb → re-import в BodgeGene → detect external edit toast.
4. Export `single-assembly` для одной zone → `.bodgeassembly` файл.
5. Import `.bodgeassembly` в новый project → zone появилась с containers + primers.

**K15 — Size budget check.** Bundle size after K1-K14. Migration code не в production hot path (lazy-load при detect v1 file через dynamic import). Reader/writer на main thread пока, worker — T-future. Target: total +30-50 KB gzipped main bundle (вне lazy-loaded migration code).

**K16 — `README.md` writer.** `lib/bodge-readme-writer.js`. Entry point: `buildReadme(manifest, projectJson, assembliesMap, primerPool, notebookEntries) → string`. Шаблон §2.3. Hook в `lib/bodge-zip.js::writeBodge` — README.md генерируется автоматически при каждом write, кладётся в корень ZIP первым asset (DEFLATE-compressed). Validation: README.md не должен содержать sensitive personal data (sha256, deviceId, raw notebook text — только counts). +5 tests:
1. Generator produces valid markdown.
2. README.md в ZIP root после write.
3. Auto-regenerated при re-save (не stale).
4. Empty project (0 containers/assemblies) → minimal README с «Empty project» note.
5. `public-supp` profile strip — README.md уже не содержит deviceId, дополнительный strip не требуется (verified explicitly).

---

## 16. Library vs Containers — canonical / index rule (NEW, Chat decision)

**Решение Chat (под делегирование Игоря «6 не знаю, реши сам»):**

`containers/<id>.gb` — **canonical source of truth** для sequence, features, topology, provenance. Меняется только через container editor + plasmid-git commits.

`library/entries.json` — **index/metadata слой**, ссылающийся на container через `entry.resourceHash` (DEC-LIB-10). Хранит metadata, никогда не sequence:
- `entry.id` — own UUID (не containerId).
- `entry.kind: 'container' | 'primer'`.
- `entry.resourceHash` — sha256 от container.sequence (для cross-project lookup).
- `entry.containerId` — direct ref на container (для same-project lookup).
- `entry.name` — override (может отличаться от container.name; биолог может назвать «my favourite pET» вместо canonical «pET-28b(+)»).
- `entry.tags: string[]` — свободные tags биолога.
- `entry.status: 'draft' | 'verified' | 'archived'`.
- `entry.projectId` — origin project.

### 16.1 Резолв при расхождении

- **Sequence/features расходятся (external edit detected в §6.5)** — canonical container выигрывает. Library entry:
  - **НЕ обновляет** name (override биолога остаётся).
  - **Обновляет** `resourceHash` (cross-project lookup идёт по новому hash).
  - Если status был `verified` — автоматически сбрасывается на `draft` + UI warning «Container sequence changed; re-verify needed».
- **name отличается:** library.entry.name берётся в UI listing. Сам container.name не трогается. (Принцип: библиотечный entry — «как биолог это назвал у себя», container.name — «как это записано в файле».)
- **Container deleted, entry orphan:** entry автоматически отмечается `status: 'archived'` + UI warning «Container deleted». Entry удаляется только явно биологом.
- **Container exists, no entry:** auto-create library entry при import — `kind: 'container'`, `name: container.name`, `tags: []`, `status: 'draft'`, `projectId: currentProject`. Биолог потом дорабатывает.

### 16.2 Validation на export

Все `library.entries[].containerId` должны разрешаться в `containers/`. Orphan entry — **export warn** (не error). Entry может быть валиден если container приедет из другого импортированного `.bodge` позже.

### 16.3 DECISION зафиксировать

`DEC-FMT-V2-LIBRARY-CANONICAL-01` (sprint-level, кандидат в ANCHORS после 6+ месяцев живучести).

---

## 17. STOP-условие

Code останавливается после K16.

Отчёт:
```
## M-FORMAT-V2-CORE — отчёт
Commits: ...
Vitest: 3284 (или актуальное на старте) → ~3450 pass / 1 skip / 0 fail (~+170)
pytest: 112/112
vite build: clean

K0 SnapGene fixture probe (gate для implementation):
- Loss table §6.4 заполнена: [link на файл с empirically-collected данными]
- Multi-line COMMENT reassembly: ✓
- Все 5 сторонних tools (SnapGene/ApE/Geneious/NCBI/pLannotate) проходят round-trip: ✓

Migration verification:
- v1 → v2 idempotent: ✓
- v0.8.x post-T3-revert reference fixture migrates lossless modulo zone-recovery toast: ✓
- v0.7.x reference fixture migrates with documented loose-containers loss: ✓

SnapGene interop (K13 suite):
- Round-trip sequence bit-perfect: ✓
- FEATURES + qualifiers preserved (modulo §6.4 entries marked lossy): ✓
- COMMENT verbatim retention или multi-line reassembly: ✓
- External edit detection: ✓

Atomic write + recovery:
- crash mid-write recoverable from .bak: ✓
- ZIP central directory corruption recoverable from _recovery.json: ✓
- Concurrent-write warning при `.writing-*.tmp`: ✓

Library vs Containers canonical rule:
- Container edit → library entry status reset to draft: ✓
- Container delete → library entry status archived: ✓
- External edit detected → resourceHash updated, name override preserved: ✓

README.md generator:
- Generated на каждом write в корне ZIP: ✓
- Markdown valid, рендерится в стандартных viewers: ✓
- Не содержит sha256 / deviceId / raw notebook text: ✓
- Empty project edge case handled: ✓

Size budget:
- lib/bodge-*.js total: ~50 KB ungzipped, ~15 KB gzipped
- bundle impact: ~30 KB gzipped (lazy-loaded migration code excluded)

Spec deviations: [list]
Открытые вопросы: [list]
```

---

## 18. Открытые вопросы

1. **Content-addressable assets cross-`.bodge` dedup.** Если два containers в РАЗНЫХ `.bodge` имеют identical sha256 — стоит ли хранить один blob с двумя refs (external content store)? Сейчас sec.3.3 sha256 в manifest для integrity, ZIP-level dedup невозможен. T-future: cross-asset dedup через external content-addressable store. В v2.0.0 — дублирование честное.

2. **`exportType: 'container'` (single `.bodgebox`).** Упомянут в §3.1 (assets kind=container), но в K-точках full implementation отсутствует. Use case — share single container через `.bodgebox` файл. Решение: добавить как K11-bis рядом с `.bodgeassembly` либо отложить в follow-up sprint M-FORMAT-V2-CORE-FOLLOWUP. Решение Игоря в визуальной приёмке.

3. **JSON Schema URIs hosting.** `$schema: "https://bodgegene.dev/schema/bodge-manifest-v2.json"` — сами URIs нужно опубликовать. Это infra-вопрос, не блокер для v2 release. Хостинг — GitHub Pages под `github.com/zoman994/RES_plasmide-schemas` или подобное.

4. **Plasmid-git history persistence (T-future).** §11.4 говорит «v1 plasmid-git не имеет on-disk». Когда будет — `commits[]` array в provenance payload расширится. v2.0.0 schema уже поддерживает это (массив `commits`), forward-compatible. T-future plumbing — отдельный sprint.

5. **AB1 chromatogram viewer.** Sanger attachment `.ab1` — store as binary attachment. v2.0.0 не предоставляет viewer. T10 panel показывает status (verified/failed/pending) + notes (markdown через NOTEBOOK), но trace visualisation отсутствует. Viewer (chromatogram component) — отдельный T-future sprint M-SANGER-VIEWER.

6. **Concurrent edit conflict resolution beyond warning.** §12.2 пишет «warning на `.writing-*.tmp` detect». Beyond — three-way merge UI / OT / CRDT — T-future, не v2.0.0. Простой single-writer assumed.

7. **Extension size cap.** Vendor может писать многомегабайтный extension. Сейчас manifest показывает «Extensions: X MB total», биолог видит. Hard cap при write — T-future политика.

8. **Migration UX при ошибке в середине.** §11.1 говорит «atomic — либо весь succeeds, либо файл остаётся v1». Что если migration упала на container №5 из 10? `.v1-backup` есть, original тронут — atomic rename ещё не произошёл. UX: rollback автоматический + error report «Container c05XYZ не мигрировал: [reason]». Биолог отправляет error report в issues. Достаточно для v2.0.0; structured error log T-future.

---

**Дата:** 19.05.2026 (rewrite по review).
**Author:** Chat (BodgeGene Architecture).
**Реализация:** Sprint M-FORMAT-V2-CORE монолитный (Code, не лимитирован по срокам).
**Зависимости:** v0.8.3-alpha state shape; backend `snapgene_parser.py` (для K0 fixture probe).
**Parallel:** `SPEC_BODGE_NOTEBOOK_MARKDOWN.md` (markdown notebook layer, реализуется после CORE приёмки).
