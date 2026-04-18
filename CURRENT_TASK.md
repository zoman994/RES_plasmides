# CURRENT_TASK.md — Этап 1.2: TYPE_MAP пересмотр в import-annotations.js

**Статус:** ✅ ВЫПОЛНЕНО 18.04.2026
**Автор спеки:** Claude Chat, 18.04.2026 (v2, после верификации по коду)
**Приоритет:** Средний (TYPE_MAP из BUGS.md)
**Оценка времени:** 3–4 часа / Фактическое: ~1.5 часа
**Ветка:** работа выполнена на `feature/racetrack-canvas` (текущая; `feat/type-map-1.2` не создавалась из-за грязного рабочего дерева)
**Предыдущий этап:** 1.1 Центральный sanitizeSequence ✅
**Результат:** Vitest 604 ✅ (+21), Pytest 112 ✅, Build clean

---

## Контекст

`import-annotations.js` содержит семантически неверные маппинги:
- `gene/mRNA → CDS` — теряется ncRNA-gene и UTR-семантика
- `oriT → rep_origin` — биологически разные (конъюгация vs репликация)
- `mat_peptide/domain/region → catalytic` — только `active_site` реально каталитический
- `transit_peptide → signal_peptide` — разная биология (органелла vs секреция)
- `motif → binding` — мотив не всегда binding

Плюс структурная несогласованность: `REGION_TYPES` не содержит `gene`, хотя `annotation-model.js` имеет `REGION_RENDER_RULES.gene` и `auto-annotate.js` трактует gene как CDS-like через `CDS_TYPES`.

Пропущены INSDC-типы: `tRNA`, `rRNA`, `ncRNA`, `misc_RNA`, `repeat_region`, `mobile_element`, `unsure`.

### Верификация по коду (Chat, до запуска задачи)

Прочитано: `import-annotations.js`, `annotation-model.js`, `auto-annotate.js`, `file-import.js`, `genbank-parser.js`, `sbol-glyphs.jsx`, `snapgene_parser.py`, тесты, + grep по 10 компонентам.

Подтверждено:
- `normalizeType`/`normalizeDetailType` **нигде не импортируются снаружи** `import-annotations.js` — сигнатуру безопасно менять.
- `REGION_RENDER_RULES` **нигде не импортируется** в компонентах (grep по `AnnotationEditor`, `PlasmidMap`, `PlasmidViewer`, `SequenceViewer`, `SequenceMapView`, `FragmentEditor`, `CDSEditor`, `PartBlock`, `AddFragmentModal`, `PlasmidUseWizard`, `domain-detection`, `auto-annotate`). **Только экспорт в `annotation-model.js:16`.** Расширять его в рамках 1.2 не нужно — у него нет потребителя.
- SBOL glyph fallback работает через `|| MiscGlyph` → новые типы без glyph корректно отрендерятся.
- Backend `snapgene_parser.py` имеет СВОЙ `_TYPE_MAP` с `'gene': 'CDS'` → без правки backend фикс gene-семантики не сработает для `.dna` файлов.
- `file-import.js` после 1.1 санитизирует backend response — seq-часть R5 закрыта.

## Scope

**IN:**
- `src/import-annotations.js`: `TYPE_MAP`, `DETAIL_TYPE_MAP`, `REGION_TYPES`, `DETAIL_TYPES`, новая функция `normalizeGeneType`, сигнатура `normalizeType(type, feat)`, расширенный gene-filter, `extractColor` (revcolor), `strand` для details/points, `EXON_BEARING_TYPES`
- `src/auto-annotate.js`: `ANNOTATION_COLORS` — добавить цвета для новых типов (идемпотентно: если ключ уже существует — оставить старое значение)
- `src/pvcs/snapgene_parser.py`: удалить `'gene': 'CDS'` из `_TYPE_MAP` (минимальный backend diff)
- Тесты: обновить `src/__tests__/import-annotations.test.js` (4–5 тестов), создать новый `src/__tests__/import-annotations-typemap.test.js` (~20 тестов)

**OUT (отдельные задачи, не в 1.2):**
- `REGION_RENDER_RULES` в `annotation-model.js` — не трогаем. Нет потребителей. Расширим когда появится detail-picker UI или подобный consumer.
- Store migration v7→v8 для legacy-annotations — не делаем (обоснование в решении 1)
- SBOL glyphs для новых типов — fallback через `MiscGlyph` достаточен
- `primer_bind` /note parser для sequence extraction
- Heuristics на `/note` free-text для mat_peptide/domain классификации
- `COMPLEMENT_MAP` с IUPAC (v1.1)
- Разбор mRNA на 5'UTR + CDS + 3'UTR
- Backend `_TYPE_MAP` полный рефакторинг — только минимальный diff `'gene': 'CDS'` → `'gene': 'gene'`

## Архитектурные решения (Chat, 18.04.2026)

### 1. Migration v7→v8 — НЕ ДЕЛАЕМ

Legacy-плазмиды в store содержат annotations с типом `catalytic` (полученным из `mat_peptide/domain/region`). Автоматическая миграция невозможна: `catalytic` → `mat_peptide`/`domain`/`region`/`catalytic (real active_site)` — не различить без оригинального INSDC типа. Information loss необратим.

**Fix:** в BUGS.md раздел «Known limitations»: _«legacy-annotations с типом `catalytic` сохраняются как есть; для получения корректных типов переимпортируйте исходный `.gb`/`.dna` файл»_. Render от неправильного типа не ломается — `ANNOTATION_COLORS.catalytic` = `#2563EB` существует.

### 2. `domain → 'domain'` без эвристик

Не делаем heuristic «если `/note='catalytic site'` → catalytic». INSDC имеет отдельный feature type `active_site` именно для этого. Free-text эвристики — источник регрессий.

### 3. `gene` семантика

- gene с любым RNA/CDS-ребёнком внутри → пропускается (расширенный фильтр; см. решение 7)
- gene БЕЗ детей с `/ncRNA_class=*` → `type='ncRNA'`
- gene БЕЗ детей с `/product` содержащим `tRNA` (case-insensitive) → `type='tRNA'`
- gene БЕЗ детей с `/product` содержащим `rRNA` или `ribosomal RNA` → `type='rRNA'`
- gene БЕЗ детей в остальных случаях → `type='gene'` (region-level)

### 4. `mRNA → 'mRNA'` как новый region-тип

Не разбираем на 5'UTR + CDS + 3'UTR — отдельная задача. В плазмидах встречается редко, корректность типа важнее UX.

### 5. `oriT` отдельный region-тип

Биологически ≠ rep_origin (конъюгация vs репликация). Отдельный цвет в `ANNOTATION_COLORS`.

### 6. `D-loop` сохраняется как отдельный тип

TYPE_MAP['D-loop'] = 'D-loop' (не 'misc_feature'), цвет `#E0E7FF` в `ANNOTATION_COLORS`. Встречается редко (в основном митохондриальная ДНК), но раз добавляем — делаем корректно.

### 7. gene-filter расширен до всех RNA/CDS детей

Если внутри `gene` есть `CDS`, `tRNA`, `rRNA`, `ncRNA`, `misc_RNA`, `mRNA` — `gene` пропускается чтобы не создавать дубль-регион. Раньше фильтр был только для `CDS`.

### 8. `variation`/`modified_base` — остаются POINT, не трогаем

Сейчас они в `POINT_TYPES`. Не переносим в `DETAIL_TYPES`. Причина: в большинстве случаев это 1-nt изменения. Если в будущем реальные данные потребуют detail-уровня для больших variations — отдельная эвристика `span > 1 → detail`, но не в 1.2.

### 9. Backend `_TYPE_MAP` — минимальный diff

Удалить `'gene': 'CDS'` из `src/pvcs/snapgene_parser.py:27`. Остальное не трогать — это backend normalization от SnapGene XML-квирков к стандартному GenBank, пусть живёт.

### 10. Extension bearing types — `mRNA` может иметь exons

`EXON_BEARING_TYPES = new Set(['CDS', 'gene', 'mRNA'])`. Существующий код `if (feat.type === 'CDS' || feat.type === 'gene')` в first pass не покрывает mRNA.

---

## Таблица маппинга INSDC → наша модель

### Region-level (`TYPE_MAP`)

| INSDC type | Наш type | Уровень | Комментарий |
|------------|----------|---------|-------------|
| `CDS` | `CDS` | region | без изменений |
| `gene` | special (см. решение 3) | region | через `normalizeGeneType(feat)` |
| `mRNA` | `mRNA` | region | **новый**, было `→ CDS` |
| `tRNA` | `tRNA` | region | **новый** |
| `rRNA` | `rRNA` | region | **новый** |
| `ncRNA` | `ncRNA` | region | **новый** |
| `misc_RNA` | `misc_RNA` | region | **новый** |
| `promoter` | `promoter` | region | без изменений |
| `terminator` | `terminator` | region | без изменений |
| `rep_origin` | `rep_origin` | region | без изменений |
| `oriT` | `oriT` | region | **новый**, было `→ rep_origin` |
| `misc_feature` | `misc_feature` | region | без изменений |
| `misc_binding` | `misc_feature` | region | **В REGION_TYPES добавить** (раньше уходил в unknown-heuristic) |
| `regulatory` | `regulatory` | region | без изменений |
| `marker` | `marker` | region | без изменений |
| `repeat_region` | `repeat_region` | region | **новый** |
| `mobile_element` | `mobile_element` | region | **новый** |
| `D-loop` | `D-loop` | region | **новый**, отдельный тип (не fallback в misc_feature) |
| `source` | — | — | фильтруется (как сейчас) |

### Detail-level (`DETAIL_TYPE_MAP`)

| INSDC type | Был | Стал | Комментарий |
|------------|-----|------|-------------|
| `sig_peptide` | `signal_peptide` | `signal_peptide` | без изменений |
| `signal_peptide` | `signal_peptide` | `signal_peptide` | без изменений |
| `transit_peptide` | `signal_peptide` | **`transit_peptide`** | разная биология |
| `mat_peptide` | `catalytic` | **`mat_peptide`** | зрелый пептид ≠ каталитический |
| `propeptide` | (passthrough) | `propeptide` | явный identity (была регрессия через DETAIL_TYPES) |
| `domain` | `catalytic` | **`domain`** | общее понятие |
| `region` | `catalytic` | **`region`** | generic INSDC тип |
| `motif` | `binding` | **`motif`** | не обязательно binding |
| `binding_site` | `binding` | `binding` | без изменений |
| `metal_binding` | `binding` | `binding` | без изменений |
| `active_site` | `active_site` | `active_site` | без изменений |
| `disulfide_bond` | (passthrough) | `disulfide_bond` | явный identity |
| `TATA_signal` | `core_promoter` | `core_promoter` | без изменений |
| `-35_signal` | `core_promoter` | `core_promoter` | без изменений |
| `-10_signal` | `core_promoter` | `core_promoter` | без изменений |
| `CAAT_signal` | (passthrough) | `core_promoter` | **новый маппинг** |
| `GC_signal` | (passthrough) | `core_promoter` | **новый маппинг** (тип уже в DETAIL_TYPES) |
| `polyA_signal` | `poly_a` | `poly_a` | без изменений |
| `polyA_site` | (passthrough) | `poly_a` | **новый маппинг** |
| `RBS` | `regulatory` | `regulatory` | без изменений |
| `primer_bind` | `primer_bind` | `primer_bind` | без изменений (идёт через POINT) |
| `intron` | `intron` | `intron` | без изменений |
| `stem_loop` | (passthrough через DETAIL_TYPES) | `stem_loop` | явный identity |
| `unsure` | (unknown heuristic) | `unsure` | **новый** (добавить в DETAIL_TYPES) |

### Point-level (`POINT_TYPES`)

Не меняем. Сейчас: `primer_bind`, `restriction_site`, `variation`, `modified_base`.

---

## Шаги реализации

### Шаг 1: Backend — минимальный diff в `snapgene_parser.py`

**Файл:** `src/pvcs/snapgene_parser.py`, строка 27–35 (секция `_TYPE_MAP`).

**БЫЛО:**
```python
_TYPE_MAP = {
    'CDS': 'CDS', 'gene': 'CDS',
    'promoter': 'promoter', 'terminator': 'terminator',
    ...
}
```

**СТАЛО:**
```python
_TYPE_MAP = {
    'CDS': 'CDS',
    'gene': 'gene',  # было 'CDS' — frontend normalizeGeneType решает семантику
    'promoter': 'promoter', 'terminator': 'terminator',
    ...
}
```

**Проверка:** `cd /path/to/RESplasmide && pytest tests/ -x`. Ожидание — все 112 тестов зелёные (в `test_parser.py` и других `.py` backend-тестах мы не нашли проверок на gene→CDS mapping; regrep `grep -rn "gene.*CDS" tests/` перед изменением).

### Шаг 2: Расширить `REGION_TYPES`, `DETAIL_TYPES` в `import-annotations.js`

**БЫЛО (строки 12–27):**
```js
const REGION_TYPES = new Set([
  'CDS', 'promoter', 'terminator', 'rep_origin',
  'marker', 'misc_feature', 'regulatory',
]);

const DETAIL_TYPES = new Set([
  'sig_peptide', 'signal_peptide', 'mat_peptide',
  'transit_peptide', 'propeptide',
  'domain', 'region', 'motif', 'binding_site',
  'active_site', 'metal_binding', 'disulfide_bond',
  'TATA_signal', '-35_signal', '-10_signal',
  'polyA_signal', 'RBS', 'GC_signal',
  'intron',
]);

const POINT_TYPES = new Set([
  'primer_bind', 'restriction_site',
  'variation', 'modified_base',
]);
```

**СТАЛО:**
```js
const REGION_TYPES = new Set([
  'CDS', 'gene', 'mRNA', 'tRNA', 'rRNA', 'ncRNA', 'misc_RNA',
  'promoter', 'terminator',
  'rep_origin', 'oriT',
  'marker', 'misc_feature', 'misc_binding', 'regulatory',
  'repeat_region', 'mobile_element', 'D-loop',
]);

const DETAIL_TYPES = new Set([
  'sig_peptide', 'signal_peptide', 'transit_peptide',
  'mat_peptide', 'propeptide',
  'domain', 'region', 'motif',
  'binding_site', 'active_site', 'metal_binding', 'disulfide_bond',
  'TATA_signal', '-35_signal', '-10_signal',
  'CAAT_signal', 'GC_signal',
  'polyA_signal', 'polyA_site',
  'RBS', 'intron', 'stem_loop',
  'unsure',
]);

const POINT_TYPES = new Set([
  'primer_bind', 'restriction_site',
  'variation', 'modified_base',
]);

// Types that bear exons (for intron-from-gaps extraction)
const EXON_BEARING_TYPES = new Set(['CDS', 'gene', 'mRNA']);
```

### Шаг 3: Переписать `TYPE_MAP` и добавить `normalizeGeneType`

**БЫЛО (строки 31–40):**
```js
const TYPE_MAP = {
  CDS: 'CDS', gene: 'CDS', mRNA: 'CDS',
  promoter: 'promoter', terminator: 'terminator',
  rep_origin: 'rep_origin', oriT: 'rep_origin',
  misc_feature: 'misc_feature', misc_binding: 'misc_feature',
  regulatory: 'regulatory', marker: 'marker',
};
```

**СТАЛО:**
```js
const TYPE_MAP = {
  CDS: 'CDS',
  mRNA: 'mRNA',
  tRNA: 'tRNA',
  rRNA: 'rRNA',
  ncRNA: 'ncRNA',
  misc_RNA: 'misc_RNA',
  promoter: 'promoter',
  terminator: 'terminator',
  rep_origin: 'rep_origin',
  oriT: 'oriT',
  misc_feature: 'misc_feature',
  misc_binding: 'misc_feature',
  regulatory: 'regulatory',
  marker: 'marker',
  repeat_region: 'repeat_region',
  mobile_element: 'mobile_element',
  'D-loop': 'D-loop',
  // gene — обрабатывается в normalizeGeneType, не через TYPE_MAP
};

/**
 * Specialized gene classification based on qualifiers.
 * Called only for gene-features that survived the child-filter.
 */
function normalizeGeneType(feat) {
  const q = feat.qualifiers || {};
  if (q.ncRNA_class) return 'ncRNA';
  const product = String(q.product || '').toLowerCase();
  if (/\btrna\b/.test(product)) return 'tRNA';
  if (/\b(rrna|ribosomal\s+rna|16s|23s|5s|18s|28s)\b/.test(product)) return 'rRNA';
  return 'gene';
}
```

### Шаг 4: Обновить сигнатуру `normalizeType`

**БЫЛО (строки 55–57):**
```js
export function normalizeType(type) {
  return TYPE_MAP[type] || 'misc_feature';
}
```

**СТАЛО:**
```js
/**
 * Normalize a region-level feature type to our model.
 * @param {string} type — INSDC feature type
 * @param {Object} [feat] — full feature object (required for 'gene' classification)
 */
export function normalizeType(type, feat) {
  if (type === 'gene' && feat) return normalizeGeneType(feat);
  return TYPE_MAP[type] || 'misc_feature';
}
```

**Проверка:** grep `normalizeType\(` в `src/` — должно быть только в `import-annotations.js` и `__tests__/import-annotations.test.js`. Других импортов нет (подтверждено grep-ом Chat).

### Шаг 5: Переписать `DETAIL_TYPE_MAP`

**БЫЛО (строки 42–63):**
```js
const DETAIL_TYPE_MAP = {
  sig_peptide: 'signal_peptide',
  signal_peptide: 'signal_peptide',
  transit_peptide: 'signal_peptide',
  mat_peptide: 'catalytic',
  domain: 'catalytic',
  region: 'catalytic',
  motif: 'binding',
  binding_site: 'binding',
  metal_binding: 'binding',
  active_site: 'active_site',
  TATA_signal: 'core_promoter',
  '-35_signal': 'core_promoter',
  '-10_signal': 'core_promoter',
  polyA_signal: 'poly_a',
  RBS: 'regulatory',
  primer_bind: 'primer_bind',
  intron: 'intron',
};
```

**СТАЛО:**
```js
const DETAIL_TYPE_MAP = {
  sig_peptide: 'signal_peptide',
  signal_peptide: 'signal_peptide',
  transit_peptide: 'transit_peptide',   // было signal_peptide
  mat_peptide: 'mat_peptide',           // было catalytic
  propeptide: 'propeptide',             // явный identity
  domain: 'domain',                     // было catalytic
  region: 'region',                     // было catalytic
  motif: 'motif',                       // было binding
  binding_site: 'binding',
  metal_binding: 'binding',
  active_site: 'active_site',
  disulfide_bond: 'disulfide_bond',     // явный identity
  TATA_signal: 'core_promoter',
  '-35_signal': 'core_promoter',
  '-10_signal': 'core_promoter',
  CAAT_signal: 'core_promoter',         // новый
  GC_signal: 'core_promoter',           // новый маппинг (тип уже в DETAIL_TYPES)
  polyA_signal: 'poly_a',
  polyA_site: 'poly_a',                 // новый
  RBS: 'regulatory',
  primer_bind: 'primer_bind',
  intron: 'intron',
  stem_loop: 'stem_loop',               // явный identity
  unsure: 'unsure',                     // новый
};
```

### Шаг 6: Расширить gene-filter до RNA/CDS детей

**БЫЛО (строки ~110–122):**
```js
const cdsFeatures = features.filter(f => f.type === 'CDS');
const filtered = features.filter(f => {
  if (f.type === 'source') return false;
  if (f.type === 'gene') {
    return !cdsFeatures.some(cds => cds.start >= f.start && cds.end <= f.end);
  }
  return true;
});
```

**СТАЛО:**
```js
const GENE_CHILD_TYPES = new Set(['CDS', 'mRNA', 'tRNA', 'rRNA', 'ncRNA', 'misc_RNA']);
const geneChildren = features.filter(f => GENE_CHILD_TYPES.has(f.type));
const filtered = features.filter(f => {
  if (f.type === 'source') return false;
  if (f.type === 'gene') {
    // Skip gene if any RNA/CDS child is contained within it (avoid duplicate regions)
    return !geneChildren.some(child =>
      child.start >= f.start && child.end <= f.end
    );
  }
  return true;
});
```

**Комментарий:** константу `GENE_CHILD_TYPES` объявить рядом с другими `*_TYPES` Set'ами наверху файла.

### Шаг 7: Обновить первый проход — `normalizeType(feat.type, feat)`

**Найти в функции `importFeatures`, первый цикл for..of по `sorted`, создание объекта `ann`:**

**БЫЛО:**
```js
const ann = {
  id: regionId,
  name: extractName(feat),
  type: normalizeType(feat.type),
  ...
};
```

**СТАЛО:**
```js
const ann = {
  id: regionId,
  name: extractName(feat),
  type: normalizeType(feat.type, feat),  // ← feat для gene-классификации
  ...
};
```

### Шаг 8: `EXON_BEARING_TYPES` для intron-извлечения

**БЫЛО (внутри первого прохода):**
```js
if ((feat.type === 'CDS' || feat.type === 'gene') && feat.qualifiers?.exons) {
```

**СТАЛО:**
```js
if (EXON_BEARING_TYPES.has(feat.type) && feat.qualifiers?.exons) {
```

### Шаг 9: `extractColor` — учёт обратной цепи

**БЫЛО (строки ~87–93):**
```js
function extractColor(feat) {
  const q = feat.qualifiers || {};
  return q.ApEinfo_fwdcolor
    || q['SnapGene:color']
    || q.color
    || null;
}
```

**СТАЛО:**
```js
function extractColor(feat) {
  const q = feat.qualifiers || {};
  // For reverse-strand features, use ApEinfo_revcolor if present
  if (feat.strand === -1 && q.ApEinfo_revcolor) return q.ApEinfo_revcolor;
  return q.ApEinfo_fwdcolor
    || q['SnapGene:color']
    || q.color
    || null;
}
```

### Шаг 10: `strand` для details и points

В текущем коде `strand` присваивается только в первом проходе (regions). В detail-ветке и point-ветке (а также unknown-heuristic detail) `strand` игнорируется.

**Что сделать:** в 3 push-объектах (DETAIL_TYPES branch, POINT_TYPES branch, unknown-heuristic detail branch) **добавить** `strand: feat.strand || 1`.

Пример — **DETAIL_TYPES branch:**
```js
annotations.push({
  name: extractName(feat),
  type: normalizeDetailType(feat.type),
  start: feat.start,
  end: feat.end,
  strand: feat.strand || 1,  // ← добавить
  level: 'detail',
  regionId: parentRegion?.id || null,
  auto: false,
  source: 'import',
  color: extractColor(feat),
});
```

### Шаг 11: Добавить цвета в `ANNOTATION_COLORS`

**Файл:** `src/auto-annotate.js`, объект `ANNOTATION_COLORS` (строки ~260–300).

**Добавить (НЕ перезаписывая существующие ключи):**
```js
// Region types (новые)
mRNA: '#6366F1',           // indigo
tRNA: '#14B8A6',           // teal (matches existing ncRNA color)
rRNA: '#0D9488',           // teal-600
misc_RNA: '#14B8A6',       // teal
oriT: '#7C3AED',           // violet-700 (биологически ≠ rep_origin)
repeat_region: '#6B7280',  // gray
mobile_element: '#64748B', // slate-500
'D-loop': '#E0E7FF',       // indigo-100

// Detail types (новые)
mat_peptide: '#84CC16',    // lime — зрелый пептид
transit_peptide: '#C084FC',// purple-300 — органеллы
motif: '#A78BFA',          // violet-300
region: '#94A3B8',         // slate — generic
unsure: '#FCA5A5',         // red-300 — неуверенность
```

**Важно:** `ncRNA: '#14B8A6'` **уже существует** в `ANNOTATION_COLORS` (строка ~276). **Не дублировать, не менять.** Code должен проверить grep'ом `grep -n "ncRNA:" src/auto-annotate.js` перед добавлением.

`variation`, `modified_base` тоже уже есть (через `mutation`). `stem_loop` в `GLYPH_MAP` есть, но не в `ANNOTATION_COLORS` — можно добавить `stem_loop: '#FB923C'` (orange-400), необязательно.

### Шаг 12: Обновить существующие тесты (`import-annotations.test.js`)

**5 мест требуют правки:**

**12.1** Тест _«nested CDS with mat_peptide + sig_peptide → region + 2 details»_:
```js
// БЫЛО:
const mature = details.find(d => d.type === 'catalytic');

// СТАЛО:
const mature = details.find(d => d.type === 'mat_peptide');
```

**12.2** Тест _«gene WITHOUT overlapping CDS → kept as detail (unknown heuristic)»_ — название устарело, переписать:
```js
it('gene WITHOUT overlapping CDS → region with type="gene"', () => {
  const features = [
    feat('gene', 0, 1500, { gene: 'lacZ' }),
  ];
  const { annotations } = importFeatures(features, 5000);

  expect(annotations).toHaveLength(1);
  expect(annotations[0].level).toBe('region');
  expect(annotations[0].type).toBe('gene');  // было 'misc_feature'
  expect(annotations[0].name).toBe('lacZ');
});
```

**12.3** `describe('normalizeType')`:
```js
// БЫЛО:
expect(normalizeType('gene')).toBe('CDS');
expect(normalizeType('mRNA')).toBe('CDS');
expect(normalizeType('oriT')).toBe('rep_origin');

// СТАЛО:
expect(normalizeType('gene', { qualifiers: {} })).toBe('gene');
expect(normalizeType('gene', { qualifiers: { ncRNA_class: 'miRNA' } })).toBe('ncRNA');
expect(normalizeType('gene', { qualifiers: { product: 'tRNA-Ala' } })).toBe('tRNA');
expect(normalizeType('mRNA')).toBe('mRNA');
expect(normalizeType('oriT')).toBe('oriT');
// Без feat — gene становится misc_feature (TYPE_MAP не содержит gene)
expect(normalizeType('gene')).toBe('misc_feature');
```

**12.4** `describe('normalizeDetailType')`:
```js
// БЫЛО:
expect(normalizeDetailType('transit_peptide')).toBe('signal_peptide');
expect(normalizeDetailType('mat_peptide')).toBe('catalytic');

// СТАЛО:
expect(normalizeDetailType('transit_peptide')).toBe('transit_peptide');
expect(normalizeDetailType('mat_peptide')).toBe('mat_peptide');
// Остальное без изменений
```

**12.5** Не трогать тесты-регрессии: `small unknown → detail`, `large unknown → region`, `APE color preserved`, `primer_bind → primers array`, `source and gene (with CDS inside) → both skipped`, `multiple regions`, `extractName`, `null/empty`.

### Шаг 13: Создать `import-annotations-typemap.test.js`

Минимум 18 тестов. Группы:

**Group A: region types (7 тестов)**
1. `gene` с CDS внутри → только CDS, gene пропущен _(регрессия уже есть, но в новом файле для полноты)_
2. `gene` с tRNA внутри → только tRNA (**новый фильтр RNA-детей**)
3. `gene` без детей, без qualifiers → region type='gene'
4. `gene` с `/ncRNA_class='miRNA'` → region type='ncRNA'
5. `gene` с `/product='tRNA-Ala'` → region type='tRNA'
6. `gene` с `/product='16S ribosomal RNA'` → region type='rRNA'
7. `mRNA` + `oriT` + `repeat_region` → три region'а с корректными типами

**Group B: detail types (5 тестов)**
1. `mat_peptide` внутри CDS → detail type='mat_peptide' (**коррекция catalytic**)
2. `transit_peptide` → detail type='transit_peptide' (**коррекция signal_peptide**)
3. `domain` → detail type='domain' (**коррекция catalytic**)
4. `motif` → detail type='motif' (**коррекция binding**)
5. `active_site` → detail type='active_site' (регрессия — проверить что не сломали)

**Group C: новые DETAIL types (3 теста)**
1. `CAAT_signal` внутри promoter → detail type='core_promoter'
2. `polyA_site` → detail type='poly_a'
3. `unsure` → detail type='unsure'

**Group D: color + strand (3 теста)**
1. Reverse-strand feature с `/ApEinfo_revcolor` → color из revcolor
2. Forward-strand feature с обоими `fwdcolor` + `revcolor` → color из fwdcolor
3. Detail-level annotation имеет поле `strand` (поле существует, значение — `feat.strand || 1`)

**Group E: exons + round-trip (2 теста)**
1. `mRNA` с exons qualifier → region mRNA + intron-details в промежутках (**EXON_BEARING_TYPES**)
2. promoter + TATA + CAAT + -35 + -10 → 1 region + 4 details, все `regionId` совпадают

**Итого:** 20 тестов. Финал `import-annotations*.test.js`: 14 (обновлённые) + 20 новых ≈ 34 теста.

Общий прогноз: **583 (было) + 20 новых ≈ 603 теста**. Build clean.

### Шаг 14: Обновить координирующие файлы

После зелёного прогона:
- **BUGS.md:** `TYPE_MAP` из OPEN→FIXED с датой; добавить раздел «Known limitations»: legacy `catalytic` annotations
- **PROJECT_STATE.md:** журнал сессии «Этап 1.2: TYPE_MAP пересмотр»
- **DECISIONS.md:** архитектурные решения 1–10 из этой спеки (append-only)
- **CURRENT_TASK.md:** `Статус: ✅ ВЫПОЛНЕНО [дата]`

### Шаг 15: Финальная регрессия

```bash
# Frontend
cd gui/designer && npx vitest run && npx vite build

# Backend
cd .. && pytest tests/ -x
```

Ожидание:
- Vitest ≈ **603 ✅**
- Vite build: **clean**
- Pytest: **112 ✅** (backend — диф только в `_TYPE_MAP['gene']`, тесты парсера gene→CDS не проверяют — но подтвердить `grep -rn "gene.*CDS" tests/ src/pvcs/tests/` перед фиксом)

---

## Контрольные точки (для визуальной проверки Игорем)

После реализации проверить на реальных плазмидах:

1. **pET-28a** (pUC-like, GenBank): все существующие regions сохранены, регрессий нет
2. **pBAD24** (с AraC gene + CDS inside): gene отфильтрован, CDS рендерится как раньше
3. **Любая плазмида с `tRNA` geneом** (поискать в каталоге SnapGene через `grep -l "tRNA" gui/designer/public/plasmids-data/*.json`): tRNA рендерится teal (#14B8A6)
4. **Плазмида с `mat_peptide`** (любой CDS со зрелым белком): detail с цветом lime (#84CC16), НЕ каталитический синий
5. **Конъюгативная плазмида с `oriT`** (pRK2013 или pGem-T + oriT): oriT рендерится violet-700 (#7C3AED), **отдельно** от rep_origin

Если регрессий нет — Этап 1.2 успешен.

---

## Риски и митигация

### R1: SBOL glyphs для новых типов
**Закрыт.** Chat проверил `sbol-glyphs.jsx` — fallback `|| MiscGlyph` работает (строка ~690 в `SBOLIcon`). Новые типы без glyph отрендерятся как dashed rectangle. Приемлемо для 1.2.

### R2: `ANNOTATION_COLORS` fallback
**Закрыт.** Дефолт `#94A3B8` slate для отсутствующих типов. Плюс явные цвета добавляем (Шаг 11).

### R3: `REGION_RENDER_RULES` без правил для новых типов
**Закрыт.** Chat проверил grep — `REGION_RENDER_RULES` **нигде не импортируется** в компонентах. Расширять не нужно в 1.2.

### R4: Legacy-annotations с типом `catalytic`
**Принимаем.** Не ломаем render (fallback работает). Known limitation в BUGS.md.

### R5: Backend `snapgene_parser.py`
**Частично закрыт** минимальным diff в Шаге 1. Остальные backend маппинги (`signal_peptide → sig_peptide`, `origin of replication → rep_origin`) не трогаем — работают корректно через frontend двойную нормализацию.

### R6: Двойные region'ы на `gene`
**Закрыт** расширенным gene-filter (решение 7, Шаг 6).

---

## Что ДЕЛАТЬ / НЕ ДЕЛАТЬ

### НЕ делаем в этом этапе (зафиксировано Chat):
- Migration v7→v8 (information loss необратим)
- Heuristics на `/note` free-text
- `primer_bind` `/note` parser
- Расширение `REGION_RENDER_RULES` (нет потребителей)
- Новые SBOL glyphs
- Разбор mRNA на UTR+CDS
- `COMPLEMENT_MAP` с IUPAC
- Полный backend `_TYPE_MAP` рефакторинг

### Делаем:
- Всё из «Шаги реализации» 1–15
- Минимальный backend diff (Шаг 1)
- Тесты (Шаги 12–13)
- Координирующие файлы (Шаг 14)

---

## Чеклист для Claude Code

**Перед началом — прочитай:**
- [x] CLAUDE.md, BUGS.md, CURRENT_TASK.md (эту спеку)
- [ ] `src/import-annotations.js` целиком
- [ ] `src/auto-annotate.js` раздел `ANNOTATION_COLORS`
- [ ] `src/__tests__/import-annotations.test.js` — понять текущий контракт (14 тестов)
- [ ] `src/pvcs/snapgene_parser.py` секция `_TYPE_MAP` (строки 25–36)
- [ ] `grep -rn "gene.*CDS\|'gene'.*'CDS'" tests/` — удостовериться, что backend-тесты не проверяют `gene → CDS` маппинг
- [ ] `grep -n "ncRNA:" src/auto-annotate.js` — подтвердить что `ncRNA` уже есть в `ANNOTATION_COLORS`

**Реализация (TDD-first):**
1. [x] **Backend** — удалить `'gene': 'CDS'` из `snapgene_parser.py:27`
2. [x] Обновить `REGION_TYPES`, `DETAIL_TYPES`, `EXON_BEARING_TYPES`, `GENE_CHILD_TYPES`
3. [x] Переписать `TYPE_MAP` + добавить `normalizeGeneType` + обновить сигнатуру `normalizeType(type, feat)`
4. [x] Переписать `DETAIL_TYPE_MAP`
5. [x] Обновить gene-filter (`GENE_CHILD_TYPES` вместо только CDS)
6. [x] `extractColor` — учёт revcolor
7. [x] `strand: feat.strand || 1` в 3 push-объектах (detail + point + unknown-heuristic detail) + intron-push
8. [x] `EXON_BEARING_TYPES.has(feat.type)` вместо inline CDS/gene check
9. [x] Добавить цвета в `ANNOTATION_COLORS` (14 новых ключей; `ncRNA`/`domain`/`gene`/`RBS` не перезаписаны)
10. [x] Обновить существующие тесты `import-annotations.test.js` (5 правок + фикстура `misc_RNA`→`weird_feature` т.к. тип стал known)
11. [x] Создать `import-annotations-typemap.test.js` (20 тестов, red-first)
12. [x] `cd gui/designer && npx vitest run` — **604 ✅**
13. [x] `cd gui/designer && npx vite build` — **clean**
14. [x] `pytest tests/ -x` — **112 ✅**
15. [x] Обновить BUGS.md, PROJECT_STATE.md, DECISIONS.md
16. [x] Поставить `**Статус:** ✅ ВЫПОЛНЕНО [дата]` в этом файле

**Доп. правка по просьбе Chat:**
- В `import-annotations.js` добавлен комментарий рядом с unknown-heuristic веткой: `// Note: 'exon' features fall through here → typically become details. / // Explicit handling not needed — GenBank join() in CDS already extracts introns via EXON_BEARING_TYPES.` (защита от будущих правок).

**Если где-то упал (регрессия или неожиданность):**
- Остановись, не пытайся «починить» эвристиками
- Отчитайся Chat с конкретным stack trace / diff'ом
- Chat решит: fix или откат сегмента

**Отчёт финальный (после успеха):**
- Статистика тестов до/после (отдельно Vitest и pytest)
- Список файлов с изменениями (ожидаем: `import-annotations.js`, `auto-annotate.js`, `snapgene_parser.py`, 2 тестовых файла, 4 координирующих `.md`)
- Пример на 1 реальной плазмиде с новым типом (скриншот аннотации или дифф в annotations array)

---

## Вопросы к Chat при сомнении

1. Если `gene` содержит `CDS`, но у `gene` есть уникальный `/product` (например `"truncated product"`) — сохранить gene-name? **Сейчас ответ: нет, CDS берёт своё `/label` или `/product`.**
2. `exon` feature напрямую (не через `join()` в CDS) — добавить как detail или пропустить? **По умолчанию: пропустить, `exon` избыточен при наличии CDS с `/exons`.**
3. Heuristic «large unknown + not inside region → region» (текущий код, строки ~191–205) — оставить? **По умолчанию: да, safety net для нестандартных файлов.**

---

**Конец спеки.**

_Версия v2 после верификации Chat по коду: 18.04.2026. Scope сужен с v1 (REGION_RENDER_RULES в OUT, миграция v7→v8 не делаем, backend diff минимизирован до одной строки)._
