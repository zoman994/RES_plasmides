# ANNOTATION_VERSIONING.md — Полная спецификация аннотаций

**Дата:** 1 апреля 2026  
**Статус:** Утверждённый дизайн-документ  
**Автор:** Игорь Синельников + Claude

---

## 1. Биологическая модель

### 1.1 Три уровня конструктов

```
Плазмида (Plasmid)                    ← контейнер, circular
├── Экспрессионная кассета             ← функциональная единица (view, не data)
│   ├── Промотор (PglaA)              ← region
│   │   ├── TATA box                   ← detail (нуклеотидные координаты)
│   │   └── CAAT box                   ← detail
│   ├── CDS (XynTL)                   ← region
│   │   ├── Signal peptide             ← detail (AA-based → nt coords)
│   │   ├── Catalytic domain           ← detail (AA-based → nt coords)
│   │   └── His6-tag                   ← detail (AA-based → nt coords)
│   └── Терминатор (TtrpC)            ← region
│       └── Poly-A signal              ← detail
├── Селекционная кассета
│   └── ...
├── Origin (pUC_ori)                   ← region, вне кассеты
└── [Junction zones]                   ← неаннотированные стыки
```

### 1.2 Кассета = view, не data

Кассета вычисляется на лету по правилу:
- Первый элемент — promoter (или regulatory)
- Последний элемент — terminator
- Между ними — CDS/gene/marker/tag
- Gap между regions ≤ 50bp

Всё остальное — самостоятельные regions вне кассет.

### 1.3 Два мира аннотаций

| Тип региона | Что содержит | Координаты деталей | UI показывает |
|---|---|---|---|
| CDS, gene, marker | Белок-кодирующую последовательность | AA → nt: `start = (aaPos-1)*3` | `SP: 1–22 а.о. (1–66 п.н.)` |
| promoter, terminator, rep_origin | Регуляторные элементы | Нуклеотидные напрямую | `TATA box: 803–809 п.н.` |

AA-координаты **нигде не хранятся**. Вычисляются на лету: `aaPos = Math.floor(ntStart / 3) + 1`.

---

## 2. Единая структура аннотации

```js
{
  name: 'Signal peptide',
  type: 'signal_peptide',
  start: 0,                   // нуклеотиды, 0-based, inclusive
  end: 66,                    // нуклеотиды, 0-based, exclusive
  level: 'detail',            // 'region' | 'detail' | 'point'
  regionId: 'r_1_abc123',    // ID родительского региона
  auto: true,                 // создана автоматически
  detector: 'vonHeijne',      // алгоритм
  confidence: 0.85,           // уверенность (0–1)
  color: '#CC79A7',           // опционально
  source: 'common_db',        // 'common_db' | 'import' | 'manual' | 'mutagenesis'
  id: 'r_1_abc123',          // только для region-level
}
```

---

## 3. Правила автоаннотации

### 3.1 Когда запускается

`autoAnnotate(part)` вызывается **всегда** при `addPart()`. Порядок:
1. Сохранить existing region-аннотации (из import)
2. Если regions нет → создать primary region из `part.type`
3. Запустить детекторы по типу региона
4. RE-сайты по всей последовательности
5. Сохранить ручные аннотации (`auto: false`)

### 3.2 Детекторы

**CDS / gene / marker:**
```
translateDNA() → белок
  → detectSignalPeptide(protein)     → detail, coords × 3
  → detectPropeptide(protein, spEnd) → detail
  → detectHisTag(protein)            → detail
  → KNOWN_TAGS scan (14 паттернов)   → detail
  → detectLinkers(protein)           → detail
  → Start codon (ATG)               → point
  → Stop codon (TAA/TAG/TGA)        → point
```

**promoter:**
```
  → -10 (TATAAT), mismatches ≤ 2     → detail
  → -35 (TTGACA), mismatches ≤ 2     → detail
  → RBS (AGGAGG), mismatches ≤ 2     → detail
  → TATA box (TATAA[AT][AG])         → detail
  → CAAT box (CCAAT)                  → detail
```

**terminator:**
```
  → Poly-A signal (AATAAA)           → detail
```

**Все типы:**
```
  → 16 common RE sites               → point
```

### 3.3 Enrichment (async)

После autoAnnotate → `enrichWithCommonFeatures()`:
- Гомология с common-features.json (96 features)
- Обогащает имена и типы regions
- Добавляет новые regions если нашёл

---

## 4. Операции и наследование аннотаций

### 4.0 Универсальный алгоритм сдвига координат

```js
function shiftAnnotations(annotations, editPoint, deltaL) {
  return annotations.map(a => {
    if (a.start >= editPoint) {
      // Целиком после точки редактирования → сдвинуть
      return { ...a, start: a.start + deltaL, end: a.end + deltaL };
    }
    if (a.start < editPoint && a.end > editPoint) {
      // Перекрывает точку → расширить/сузить end
      return { ...a, end: Math.max(a.start + 1, a.end + deltaL) };
    }
    // До точки → без изменений
    return a;
  });
}
```

Применяется ко ВСЕМ операциям, меняющим длину.

### 4.1 Substitution (замена кодона)

**Пример:** D908A в XynTL

| Параметр | Значение |
|---|---|
| ΔL | 0 (длина не меняется) |
| Координаты | Не сдвигаются |
| Annotations | Все копируются |
| Добавляется | `point: mutation D908A` с regionId CDS |
| Version | Minor (v1.x) |

**Множественный мутагенез (substitutions):**
- D908A + E993A + L1200V: три point-аннотации, координаты не сдвигаются
- В разных регионах (D908A в XynTL + K15R в pyrG): каждая привязана к своему regionId
- Strategy: chooseStrategy() → KLD (если близко) / multi-fragment (если далеко)

### 4.2 Deletion внутри региона

**Пример:** Удаление пропептида (69–148 а.о. = 207–444 п.н. relative) из CDS

| Параметр | Значение |
|---|---|
| ΔL | −238bp (deletedLength) |
| Region | end уменьшается на ΔL |
| Удалённые details | Пропептид (полностью внутри зоны делеции) |
| Обрезанные details | Если detail пересекает границу → trimmed |
| Сдвинутые | Все details после точки делеции внутри региона |
| Downstream | Все annotations после региона → shift(-ΔL) |
| Version | Major (v2.0) |
| Пересчёт | autoAnnotate для затронутого CDS-региона |

**Удаление интронов (множественная делеция):**
- Применяются от конца к началу (reverse order), чтобы координаты не поехали
- Каждый интрон: detail удалён, region shrinks
- `derivation: {type: 'intron_removal', count: 3}`

### 4.3 Insertion внутри региона

**Пример:** His6-tag (18bp) перед стоп-кодоном XynTL

| Параметр | Значение |
|---|---|
| ΔL | +18bp |
| Region | end расширяется на +ΔL |
| Новый detail | His6-tag с regionId CDS |
| Stop codon | Сдвигается на +18 |
| Downstream | Все после региона → shift(+ΔL) |
| Version | Minor (v1.x) если <100bp, Major если ≥100bp |

**N-terminal fusion (MBP-TEV-XynTL):**
- MBP (1060bp) + TEV site (21bp) вставляются в начало CDS
- Region расширяется на +1081bp
- Старый SP может быть удалён (MBP имеет свой)
- Все details внутри CDS сдвигаются на +1081
- Новые details: MBP (tag), TEV site (cleavage_site)
- Version: Major (v2.0)
- `derivation: {type: 'fusion', insertedParts: ['MBP', 'TEV']}`

### 4.4 Insertion между регионами

**Пример:** loxP (34bp) между TtrpC и PgpdA

| Параметр | Значение |
|---|---|
| ΔL | +34bp |
| Новый region | loxP (type: loxP, cassette: null) |
| Downstream | Все после insertion point → shift(+ΔL) |
| Кассеты | Не затрагиваются (loxP вне кассет) |
| Version | Major (v2.0) |

**NLS/линкер между регионами:**
- Если <50bp → detail-аннотация, привязанная к ближайшему region
- Если ≥50bp → самостоятельный region

### 4.5 Замена одного региона

**Пример:** PglaA → PcbhI (промотор swap)

| Параметр | Значение |
|---|---|
| ΔL | newLen − oldLen (920 − 850 = +70bp) |
| Удаляется | Старый region + все его details |
| Добавляется | Новый region + autoAnnotate |
| Downstream | shift(+ΔL) |
| Кассета | cassette tag сохраняется (expression) |
| Version | Major (v2.0) |

**Замена origin of replication:**
- То же самое, но cassette: null
- Замена pUC_ori → pBR322_ori: удалить старый region, вставить новый

### 4.6 Замена кассеты целиком

**Пример:** PglaA+XynTL+TtrpC → PcbhI+BGL1+TcbhI

| Параметр | Значение |
|---|---|
| ΔL | newCassetteLen − oldCassetteLen |
| Удаляется | Все regions с cassette='expression' + их details |
| Span | cassetteStart = min(starts), cassetteEnd = max(ends) |
| Добавляется | Новые regions + autoAnnotate для каждого |
| Downstream | shift(ΔL) |
| Version | Major (v2.0) |

### 4.7 Делеция региона

**Пример:** Удаление pyrG (нокаут маркера)

| Параметр | Значение |
|---|---|
| ΔL | −deletedRegionLen |
| Удаляется | Region + все его details |
| Downstream | shift(−ΔL) |
| Кассета | Может стать неполной (без маркера) |
| Version | Major (v2.0) |

### 4.8 Flip (reverse complement)

| Параметр | Значение |
|---|---|
| ΔL | 0 |
| Coordinates | start → seqLen − end, end → seqLen − start |
| Strand | ×(−1) |
| Details | Все пересчитываются |
| autoAnnotate | Пересчёт (белок стал другим) |
| Version | Major (v2.0) |

### 4.9 Комбинированные операции

**Substitution + Deletion (D908A + Δlinker):**
1. Применить substitution (ΔL = 0)
2. Применить deletion от конца к началу
3. Два point-аннотации: mutation + deletion point
4. Downstream shift по результату deletion

**Мутации в разных регионах (D908A в XynTL + K15R в pyrG):**
1. Каждая мутация привязана к своему regionId
2. Обе substitutions → ΔL = 0 → координаты не сдвигаются
3. Semantic diff: "D908A в XynTL, K15R в pyrG"

**Insert + Substitution (NLS перед pyrG + D908A в XynTL):**
1. Сначала substitution (не меняет длину)
2. Потом insert (сдвигает downstream)
3. Порядок важен: insert перед substitution → координаты substitution поедут

---

## 5. Правила версионирования

### 5.1 Semver-like версии

```
v1.0  → начальная версия (импорт / сборка)
v1.1  → minor: substitution, малый тег (<100bp), silent mutation
v1.2  → minor: ещё одна мутация
v2.0  → major: делеция, вставка >100bp, замена региона, замена кассеты
v2.1  → minor: мутация в v2.0
```

### 5.2 Автоопределение major/minor

```
function versionBump(operation):
  if operation.type === 'substitution' → minor
  if operation.type === 'insertion' && operation.deltaL < 100 → minor
  if operation.type === 'insertion' && operation.deltaL >= 100 → major
  if operation.type === 'deletion' → major
  if operation.type === 'replacement' → major
  if operation.type === 'cassette_replacement' → major
  if operation.type === 'flip' → major
  if operation.type === 'intron_removal' → major
```

### 5.3 derivation.operations[]

```js
derivation: {
  type: 'mutation',       // основной тип
  operations: [
    { type: 'substitution', regionName: 'XynTL', position: 908, from: 'D', to: 'A', dnaPos: 3572 },
    { type: 'substitution', regionName: 'pyrG', position: 15, from: 'K', to: 'R', dnaPos: 4143 },
  ],
  description: 'D908A в XynTL, K15R в pyrG',  // auto-generated
}
```

---

## 6. Semantic diff

### 6.1 annotationDiff(parentPart, childPart)

Сопоставляет regions по имени → типу → overlap координат.

Классифицирует:
- `deleted` — region есть в parent, нет в child
- `inserted` — region есть в child, нет в parent
- `replaced` — по позиции совпадает, но имя/тип другой
- `resized` — имя/тип совпадает, длина изменилась
- `mutated` — новые point annotations с type=mutation

### 6.2 Примеры

**v1.0 → v1.1 (D908A):**
```
[{ type: 'mutated', name: 'D908A', region: 'XynTL' }]
```

**v1.0 → v2.0 (замена кассеты):**
```
[
  { type: 'replaced', from: 'PglaA', to: 'PcbhI', regionType: 'promoter' },
  { type: 'replaced', from: 'XynTL', to: 'BGL1', regionType: 'CDS' },
  { type: 'replaced', from: 'TtrpC', to: 'TcbhI', regionType: 'terminator' },
]
```

---

## 7. detectCassettes()

```js
function detectCassettes(annotations, maxGap = 50):
  regions = getRegions(annotations).sort(by start)
  cassettes = []
  current = null
  
  for region in regions:
    if region.type is promoter/regulatory AND no current:
      current = {regions: [region]}
    elif current:
      gap = region.start - current.lastEnd
      if gap ≤ maxGap AND region.type is CDS/marker/terminator:
        current.regions.push(region)
        if region.type is terminator:
          cassette complete → push to cassettes, reset current
      else:
        incomplete cassette? → push if has CDS
        reset current
  
  return cassettes
```

---

## 8. Пересчёт аннотаций после операций

После ЛЮБОЙ операции, изменившей последовательность CDS-региона:
1. Сохранить ручные аннотации (`auto: false`)
2. Пересчитать autoAnnotate для затронутого региона
3. Сдвинуть downstream
4. Обновить кассеты

Ручные аннотации **никогда не удаляются** при пересчёте, кроме случая, когда они полностью попали в зону делеции.

---

## 9. Что НЕ делать

1. Кассета НЕ отдельный объект в store
2. AA-координаты НИГДЕ не хранятся
3. Полный git-like граф не нужен — parentId → дерево достаточно
4. Не форсить кассетную структуру — regions без cassette tag это нормально
