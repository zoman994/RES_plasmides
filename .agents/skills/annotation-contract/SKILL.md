---
name: annotation-contract
description: Data contract for annotations in BodgeGene. Applies when Code touches annotation parsers (genbank-parser, snapgene_parser, auto-annotate, import-annotations), AnnotationEditor, getRegions, PlasmidMap region rendering, FragmentEditor annotation state, or anywhere fragment.annotations[] is read/written. Loads on work with annotation-model.js, import-annotations.js, auto-annotate.js, or annotation-identity.js.
---

# Контракт на аннотации BodgeGene

Один массив `fragment.annotations[]`, три уровня, жёсткий инвариант `id`. Нарушение инварианта — root cause class (Map-WS-1 FAIL 21.04.2026, D1 дефект: аннотации без id ломали `selectedRegionId` matching).

## 3-level model

```
region  — крупный биологический элемент (CDS, promoter, terminator, ori)
detail  — часть region'a (domain, signal peptide, tag, motif)
point   — точечная метка (mutation, RE site, start codon)
```

Всё в одном массиве `annotations[]`. `fragment.domains[]` или `fragment.regions[]` как отдельные поля — **запрещено** (см. `bio-invariants` Правило 4).

## Инвариант `id: string`

Каждый элемент `annotations[]` обязан иметь `id: string`. Используется:

- `PlasmidMapV2.jsx` — для `selectedRegionId` highlight matching
- `AnnotationEditor` — для updateById / deleteById
- `getRegions` — для стабильного React key

**Два контракта обеспечения инварианта:**

### Write-path (predecessor): импортёры генерируют id

`genbank-parser.js`, `snapgene_parser.py`, `auto-annotate.js`, `import-annotations.js`, каталог через `PlasmidUseWizard → use whole` — каждая функция, создающая annotation object, должна поставить id через **проектный стандарт**: `lib/ids.js::makeId` (`crypto.randomUUID` с feature-detect).

**Не** импортировать `nanoid` / `uuid` / прочие библиотеки — стандарт уже есть в `lib/ids.js` (`makeId`). Импортёры зовут его через `generateRegionId()` (`domain-detection.js`, делегирует в `makeId`).

**Incorrect:**
```js
// Импортёр возвращает annotations без id — write-path contract нарушен
return { type: 'CDS', start: 100, end: 500, name: 'lacZ' };
```

**Incorrect (новая зависимость вместо существующего helper):**
```js
import { nanoid } from 'nanoid';
annotation.id = nanoid();
```

**Correct:**
```js
import { makeId } from './lib/ids'; // shared crypto.randomUUID factory
annotation.id = makeId();
```

### Read-path (safety net): `getRegions` deterministic fallback

`annotation-model.js::getRegions()` достраивает id для legacy projects, где write-path ещё не прошёл. Deterministic = для одного и того же annotation всегда один и тот же fallback id (hash от type+start+end+name), не `Math.random()`:

```js
function fallbackId(a) {
  return `region:${a.start}:${a.end}:${a.type || 'unknown'}:${a.name || ''}`; // annotation-model.js:134, только read-path для legacy regions
}
```

Цель — чтобы повторный рендер давал тот же id, React keys не прыгали. `Math.random()` или счётчик-по-индексу = баг, ломает highlight при перерендере.

## Технодолг (TD-IMPORTER-NO-ID) — write-path закрыт 29.05.2026

`import-annotations.js` и `auto-annotate.js` (вкл. `enrichWithCommonFeatures`) стампят
`id` на КАЖДУЮ аннотацию (region / detail / point) перед возвратом — через
`generateRegionId()` → `lib/ids.js::makeId`. `snapgene_parser.py` сам id не ставит, но
его фичи проходят через `importFeatures`, который добивает id. `getRegions` read-path
fallback остаётся для legacy `.bodgegene`, сохранённых до фикса.

С ANN-INTEGRITY (рабочее дерево, 05.09.2026) единая точка входа — `ingestAnnotations`
из `lib/annotation-identity.js`: opaque id через `makeAnnotationId` → `lib/ids.js::makeId`,
first-wins repair дубликатов, adoption legacy `parentId` в `regionId`, detach висячих
ссылок. Через неё идут `import-annotations.js`, `lib/annotation-edit.js`
(create/create-batch), `library-sequence-edit.js` и `segment-annotation-transfer.js`;
`.bodge` open и cross-project import пока обходят gate (BACKLOG «Annotation UX
convergence»). Id стабилен при rename/move/type edit; удаление региона каскадно удаляет
его `regionId`-детей.

**Остаточный пункт (открыт):** read-path net (`getRegions`) бэкфиллит только region; для legacy detail/point без id он id не достраивает (`getDetails`/`getPoints` — чистый filter). Распространить при необходимости — новые данные уже приходят с id из write-path.

## Координаты

Хранение — **0-based, end-exclusive** `[start, end)` для `annotation.start` / `annotation.end` (⚓ DEC-ANN-10). Длина = `end - start`, фича вырезается `seq.slice(start, end)` без `±1`, соседство — `a.end === b.start`, совпадает с BioPython `FeatureLocation`. Это инвариант ВСЕГО кода: модель, оба парсера, auto-annotate, import, conflicts, feature-detection.

Конверсия систем — **только на границах**, никогда в модели:
- **Файл → store:** GenBank / SnapGene хранят 1-based inclusive; парсеры (`genbank-parser.js`, `snapgene_parser.py`) конвертят на входе (`start - 1`, `end` как есть → 0-based half-open).
- **Store → UI:** биологу показываем 1-based inclusive через `toUiCoords(start, end)` → `{ uiStart: start + 1, uiEnd: end }` (обратно — `fromUiCoords`, оба в `lib/annotation-edit.js`). Так делают линейка SequenceView, FeatureEditorModal, попапы create/edit, сборщик (RangePicker / SegmentList, V127).

Если функция принимает координаты — **явно** писать 0- или 1-based в JSDoc. Смешение = off-by-one во всех регионах (исторически: off-by-2 02.05, V50, V126).

## Pre-commit check для аннотаций

1. Каждый annotation имеет `id: string`?
2. Если работа в импортёре — `id` генерится в write-path через проектный helper (не новая зависимость), не откладывается на read-path?
3. Координаты в store — 0-based end-exclusive (⚓ DEC-ANN-10)? Конверсия в 1-based — только на UI-границе через `toUiCoords`/`fromUiCoords`, не в модели?
4. Уровень `level` проставлен (region / detail / point)?
5. Никаких `fragment.domains[]` / `fragment.regions[]`?
