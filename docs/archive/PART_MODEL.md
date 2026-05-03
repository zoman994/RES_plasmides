# Архитектура наследования блоков BodgeGene

## Три сущности, не две

Сейчас у нас Part (библиотека) и Fragment (на canvas). Нужно три:

```
Part (библиотека)           → источник истины, хранит последовательность
  ↓ наследование
Fragment (на canvas)        → экземпляр Part в конкретной сборке
  ↓ амплификация
PhysicalDNA (в морозилке)   → уже амплифицированный, праймеры не нужны
```

---

## Part — единица библиотеки

```js
Part {
  id: "part_001"
  name: "AsCpf1"
  type: "CDS" | "promoter" | "terminator" | "marker" | ...
  sequence: "ATGACACAGTTC..."
  length: 3921

  // ═══ Аннотация (ВСЕГДА присутствует) ═══
  annotations: [
    { name: "AsCpf1", type: "CDS", start: 0, end: 3921,
      auto: true }  // auto = сгенерирована автоматически
  ]

  // ═══ Домены (суб-аннотации внутри Part) ═══
  domains: [
    { name: "RuvC-I", type: "catalytic", start: 0, end: 450 },
    { name: "BH", type: "bridge_helix", start: 451, end: 600 },
    { name: "RuvC-II", type: "catalytic", start: 601, end: 900 },
    { name: "NUC", type: "nuclease", start: 901, end: 1200 },
    { name: "RuvC-III", type: "catalytic", start: 1201, end: 1500 },
    { name: "WED", type: "recognition", start: 1501, end: 1800 },
    { name: "PI", type: "PAM_interacting", start: 1801, end: 3921 },
  ]
  // Для промоторов:
  // { name: "TATA box", type: "core_element", start: 820, end: 828 }
  // { name: "-35 region", type: "core_element", start: 795, end: 801 }
  // { name: "UAS", type: "enhancer", start: 0, end: 400 }

  // ═══ Наследование ═══
  parentId: null              // null = корневой Part
  parentIds: []               // множественные родители (для слитых)
  derivation: null            // как получен от родителя
  // derivation = {
  //   type: "mutation",
  //   mutations: [{from:"T", to:"A", position: 332, aaFrom:"T", aaTo:"A"}],
  // }
  // derivation = {
  //   type: "truncation",
  //   originalStart: 0, originalEnd: 3921,
  //   trimStart: 100, trimEnd: 3800,
  // }
  // derivation = {
  //   type: "fusion",
  //   parts: ["part_001", "part_015"],  // какие Part слили
  //   junctionPosition: 1200,
  // }
  // derivation = {
  //   type: "split",
  //   sourceId: "part_001",
  //   region: { start: 0, end: 1200 },   // какой кусок вырезали
  // }

  children: ["part_002", "part_003"]  // дочерние варианты

  // ═══ Метаданные ═══
  organism: "Lachnospiraceae bacterium"
  source: "manual" | "genbank_import" | "batch_import" | "mutation" | "split" | "fusion"
  addedDate: "2026-03-28T..."
  tags: ["nuclease", "CRISPR", "Cpf1"]
}
```

---

## Автоматическая аннотация

При добавлении Part без аннотаций — система создаёт минимальную автоматически:

### Правила авто-аннотации:

```
CDS без аннотаций:
  → annotation: { name: Part.name, type: "CDS", start: 0, end: length, auto: true }
  → Попытка авто-детекции доменов через InterPro/UniProt (будущее)
  → Минимально: signal peptide (если начало = M + гидрофобные 15-25 а.к.)

Промотор без аннотаций:
  → annotation: { name: Part.name, type: "promoter", start: 0, end: length, auto: true }
  → Поиск TATA box (TATAAWR) в позициях -25..-30
  → Поиск CAAT box (CCAAT) в позициях -70..-80
  → Для бактериальных: -10 (TATAAT) и -35 (TTGACA) элементы

Терминатор без аннотаций:
  → annotation: { name: Part.name, type: "terminator", start: 0, end: length, auto: true }
  → Поиск poly-A сигнала (AATAAA) для эукариот
  → Поиск стем-лупа для прокариот

Маркер без аннотаций:
  → annotation: { name: Part.name, type: "marker", start: 0, end: length, auto: true }

Любой тип: auto: true означает "сгенерировано системой,
можно перезаписать пользовательской аннотацией"
```

---

## Граф наследования

```
                AsCpf1 (корневой, 3921 п.н.)
               /          |              \
    AsCpf1(D908A)    AsCpf1_part1     AsCpf1(T332A,G335A)
    мутация dead      split 1-1200      3 мутации
    nuclease          |                  |
                      |            AsCpf1(T332A,G335A,D908A)
                      |            мутация от мутанта
                      |
              [AsCpf1_part1 + EGFP]  ← fusion
              появляется в children
              И у AsCpf1_part1, И у EGFP
```

---

## PhysicalDNA — третий тип (уже существующий фрагмент)

```js
PhysicalDNA {
  id: "phys_001"
  name: "AsCpf1_part1 (амплифицирован)"
  partId: "part_012"        // из какого Part произведён
  sequence: "ATGACAC..."    // включая праймерные хвосты!
  length: 1260              // 1200 + 30 + 30 (overlap tails)

  status: "amplified"       // amplified | verified | sequenced
  needsAmplification: false // ← ключевое отличие!

  // Откуда взялся
  source: {
    type: "pcr",
    template: "part_001",   // с чего амплифицировали
    primers: ["IS001", "IS002"],
    assemblyId: "asm_001",  // в какой сборке создан
  }

  // Концы (важно для стыковки!)
  ends: {
    left: { type: "overlap", sequence: "GACTACAAAGACCATGAC...", length: 30 },
    right: { type: "golden_gate", overhang: "CCCT", enzyme: "BpiI" },
  }

  // Физическое местоположение
  location: "Морозилка -20°C, бокс 3, позиция A7"
  concentration: 45.2  // нг/мкл
  date: "2026-03-25"
}
```

Когда PhysicalDNA добавляется на canvas — НЕ нужны праймеры для этого фрагмента. Движок видит `needsAmplification: false` и пропускает его при генерации праймеров. Но проверяет совместимость концов с соседними фрагментами.

---

## Операции с Part в библиотеке

### Добавление поштучно:
```
Вставить последовательность → авто-тип (CDS если ATG...Stop)
→ авто-аннотация → авто-домены (если CDS) → Part в библиотеке
```

### Пакетный импорт:
```
GenBank файл с 15 фичами → 15 Part с аннотациями из файла
SnapGene .dna → то же + цвета + праймеры
Multi-FASTA → N Part, авто-тип по содержимому
```

### Мутация существующего:
```
AsCpf1 → клик "Создать мутант" → выбрать АК-замены
→ новый Part: AsCpf1(D908A), parentId = AsCpf1.id
→ AsCpf1.children.push(новый.id)
→ Оригинал НЕ МЕНЯЕТСЯ
```

### Обрезка (truncation):
```
AsCpf1 → клик "Обрезать" → указать регион 100-3800
→ новый Part: AsCpf1_truncated, derivation.type = "truncation"
→ Аннотации пересчитываются по новым координатам
→ Домены которые попали в обрезку — удаляются или обрезаются
```

### Разбиение (split):
```
AsCpf1 → клик "Разбить на 2" → указать позицию 1200
→ Part_1: AsCpf1_part1 (1-1200), derivation.type = "split"
→ Part_2: AsCpf1_part2 (1201-3921), derivation.type = "split"
→ Оба: parentId = AsCpf1.id
→ Домены распределяются по частям
```

### Слияние (fusion):
```
AsCpf1_part1 + EGFP → клик "Слить"
→ Новый Part: AsCpf1_part1-EGFP
→ parentIds: ["part1_id", "egfp_id"]  // ОБА родителя
→ Появляется в children И AsCpf1_part1, И EGFP
→ derivation.type = "fusion"
→ Аннотации обоих родителей сохраняются с пересчитанными координатами
```

---

## Проверка дупликатов при добавлении

При добавлении нового Part — автоматическое выравнивание:

```js
function checkDuplicates(newPart, library) {
  const results = [];

  for (const existing of library) {
    // 1. Точное совпадение
    if (newPart.sequence === existing.sequence) {
      results.push({
        part: existing,
        match: 'exact',
        identity: 100,
        message: `Идентичен ${existing.name}`
      });
      continue;
    }

    // 2. Быстрая проверка по длине (±10%)
    const lenRatio = newPart.length / existing.length;
    if (lenRatio < 0.9 || lenRatio > 1.1) continue;

    // 3. Hamming distance для одинаковой длины
    if (newPart.length === existing.length) {
      let mismatches = 0;
      for (let i = 0; i < newPart.length; i++) {
        if (newPart.sequence[i] !== existing.sequence[i]) mismatches++;
      }
      const identity = ((newPart.length - mismatches) / newPart.length) * 100;

      if (identity > 90) {
        results.push({
          part: existing,
          match: 'high_homology',
          identity: Math.round(identity * 10) / 10,
          mismatches,
          message: `${identity.toFixed(1)}% гомология с ${existing.name} (${mismatches} замен)`
        });
      }
    }

    // 4. Подстрока (один содержит другого)
    if (existing.sequence.includes(newPart.sequence)) {
      results.push({
        part: existing,
        match: 'subset',
        identity: 100,
        message: `Является частью ${existing.name} (${existing.length} п.н.)`
      });
    }
    if (newPart.sequence.includes(existing.sequence)) {
      results.push({
        part: existing,
        match: 'superset',
        identity: 100,
        message: `Содержит ${existing.name} (${existing.length} п.н.) целиком`
      });
    }
  }

  return results; // показать пользователю перед добавлением
}
```

### UI при совпадении:
```
┌─────────────────────────────────────────────────┐
│ ⚠ Найдены похожие последовательности            │
│                                                   │
│ 🔴 100% — Идентичен AsCpf1                       │
│    → Использовать существующий                    │
│                                                   │
│ 🟡 97.3% — 102 замены относительно AsCpf1(D908A) │
│    → Создать как вариант AsCpf1(D908A)?           │
│    → Добавить как новый Part?                     │
│                                                   │
│ 🟢 91.2% — Гомология с LbCpf1                    │
│    → Это ортолог? Добавить с тегом?               │
│                                                   │
│ [Добавить как новый]  [Отмена]                    │
└─────────────────────────────────────────────────┘
```

---

## Как это ложится на Zustand

```js
// store/fragmentSlice.js — расширение

// Parts library с наследованием
parts: [],

addPart: (part) => set(state => {
  // 1. Авто-аннотация если нет
  if (!part.annotations?.length) {
    part.annotations = generateAutoAnnotations(part);
  }

  // 2. Авто-домены для CDS
  if (part.type === 'CDS' && !part.domains?.length) {
    part.domains = detectDomains(part);
  }

  // 3. Проверка дупликатов
  // (вызывается ДО addPart, результат показывается в UI)

  state.parts.push({
    ...part,
    id: part.id || `part_${Date.now()}`,
    parentId: part.parentId || null,
    parentIds: part.parentIds || [],
    children: [],
    source: part.source || 'manual',
    addedDate: new Date().toISOString(),
  });

  // 4. Обновить children у родителя
  if (part.parentId) {
    const parent = state.parts.find(p => p.id === part.parentId);
    if (parent) parent.children.push(part.id);
  }
  if (part.parentIds?.length) {
    part.parentIds.forEach(pid => {
      const parent = state.parts.find(p => p.id === pid);
      if (parent) parent.children.push(part.id);
    });
  }
}),

// Создать мутант от существующего Part
createMutant: (parentId, mutations) => {
  const parent = get().parts.find(p => p.id === parentId);
  if (!parent) return;

  const mutSeq = applyMutations(parent.sequence, mutations);
  const mutName = parent.name + '(' +
    mutations.map(m => `${m.aaFrom}${m.position}${m.aaTo}`).join(',') + ')';

  get().addPart({
    name: mutName,
    type: parent.type,
    sequence: mutSeq,
    length: mutSeq.length,
    parentId: parentId,
    derivation: { type: 'mutation', mutations },
    annotations: recalcAnnotations(parent.annotations, mutations),
    domains: parent.domains, // домены наследуются
    source: 'mutation',
  });
},

// Физический ДНК (уже амплифицированный)
physicalDNA: [],

addPhysicalDNA: (phys) => set(state => {
  state.physicalDNA.push({
    ...phys,
    needsAmplification: false,
    status: phys.status || 'amplified',
  });
}),

// При завершении сборки — продукт становится PhysicalDNA
completeAssembly: () => {
  const asm = get().getActive();
  const fullSeq = asm.fragments.map(f => f.sequence).join('');

  get().addPhysicalDNA({
    id: `phys_${Date.now()}`,
    name: asm.name,
    partId: null, // это сборка, не один Part
    sequence: fullSeq,
    length: fullSeq.length,
    source: { type: 'assembly', assemblyId: asm.id },
  });

  // Каждый амплифицированный фрагмент тоже в PhysicalDNA
  asm.fragments.forEach((frag, i) => {
    if (frag.needsAmplification) {
      get().addPhysicalDNA({
        id: `phys_${Date.now()}_f${i}`,
        name: `${frag.name} (ПЦР)`,
        partId: frag.partId,
        sequence: frag.sequence, // TODO: + primer tails
        length: frag.length,
        source: {
          type: 'pcr',
          assemblyId: asm.id,
          primers: [asm.primers[i*2]?.name, asm.primers[i*2+1]?.name],
        },
      });
    }
  });
}
```

---

## Визуализация дерева наследования в палитре

```
📂 AsCpf1 (3921) ●         ← корневой, раскрывается
  ├── 🧬 AsCpf1(D908A) (3921)      ← мутант
  │   └── 🧬 AsCpf1(D908A,E993A)   ← мутант от мутанта
  ├── ✂️ AsCpf1_part1 (1200)        ← split
  │   └── 🔗 AsCpf1_part1-EGFP     ← fusion (также виден в EGFP)
  ├── ✂️ AsCpf1_part2 (2721)        ← split
  └── 🧬 AsCpf1(T332A,G335A) (3921) ← мутант

📂 EGFP (717) ●
  └── 🔗 AsCpf1_part1-EGFP         ← тот же fusion, два родителя

🧊 Амплифицированные (PhysicalDNA)
  ├── AsCpf1_part1 (ПЦР) — 1260 п.н., 45 нг/мкл
  └── EGFP (ПЦР) — 777 п.н., 62 нг/мкл
```

---

## Резюме архитектуры

| Сущность | Что | Хранит | Создаётся |
|----------|-----|--------|-----------|
| Part | Запись в библиотеке | Эталонную последовательность + аннотации + домены | Импорт, ввод, мутация, split, fusion |
| Fragment | Экземпляр на canvas | Ссылку на Part + позицию в сборке | Drag из библиотеки |
| PhysicalDNA | Реальная пробирка | Последовательность с хвостами + концы + концентрацию | При завершении сборки |

- **Part → Fragment:** один Part может быть в нескольких сборках.
- **Part → Part:** дерево наследования (мутации, splits, fusions).
- **Fragment → PhysicalDNA:** после амплификации, праймеры не нужны.
- **PhysicalDNA → Fragment:** можно использовать готовый ДНК как фрагмент (no PCR).

---

## Автоаннотация: модуль auto-annotate.js

При добавлении Part без аннотаций система автоматически анализирует последовательность и создаёт аннотации. Все авто-аннотации помечены `auto: true` — пользователь может перезаписать их своими.

### Формат аннотации

```js
{
  name: string,        // "TATA box", "EcoRI", "His6-tag"
  type: string,        // "CDS", "core_promoter", "restriction_site", "tag"
  start: number,       // 0-based nucleotide position
  end: number,         // exclusive end
  auto: true,          // always true for auto-generated
  confidence: number,  // 0-1, optional
  detector: string,    // "tata_scan", "re_scan", "vonHeijne", etc.
}
```

### Архитектура модуля

```
generateAutoAnnotations(part)
  ├── если part.annotations?.length → return part.annotations (не перезаписывать)
  ├── если !part.sequence → return []
  ├── makeBaseAnnotation(part) → {name, type, start:0, end:length, auto:true}
  ├── if CDS:
  │   ├── detectStopCodon(seq)
  │   ├── detectSignalPeptide(protein) → аннотация на ДНК-координатах
  │   ├── detectProteinTags(protein) → His, FLAG, Strep, TEV и ещё 10
  │   ├── detectLinkerRegions(protein)
  │   └── assessKozakContext(seq)
  ├── if promoter:
  │   ├── findTATABox(seq) — regex TATAA[AT][AG] в последних 50 нт
  │   ├── findCAATBox(seq) — CCAAT в позициях -120..-50
  │   ├── findPribnow(seq) — TATAAT ±2 мисматча
  │   ├── findMinus35(seq) — TTGACA ±2 мисматча
  │   └── findRBS(seq) — AGGAGG ±2 мисматча
  ├── if terminator:
  │   └── findPolyASignal(seq) — AATAAA
  ├── universal:
  │   └── findRestrictionSites(seq) — топ-20 RE
  └── deduplicateAndSort(annotations)
```

### Уровень 1: Чистая логика (реализовать сразу)

**CDS-детекция:**
- ATG в начале → предположительно CDS
- Длина кратна 3 → подтверждение
- Стоп-кодон в конце → подтверждение
- Нет внутренних стоп-кодонов → точно CDS
- Если всё совпало → аннотация CDS на всю длину, трансляция автоматически
- Стоп-кодон (TAA/TAG/TGA) — отдельная суб-аннотация

**Сигнальный пептид (von Heijne):**
- Первые 15-30 АК: Met + гидрофобный участок (A,V,L,I,F,W,M >60%)
- Сайт отщепления: позиции -3 и -1 мелкие незаряженные (A,G,S,T)
- Переиспользует `detectSignalPeptide()` из `domain-detection.js`

**Про-пептид (грибы):**
- После сигнального пептида: KR или RR сайт (Kex2 cleavage)
- Регион между сигнальным и KR = про-пептид
- Переиспользует `detectPropeptide()` из `domain-detection.js`

**Теги (11 штук):**

| Тег | Паттерн (АК) | Тип |
|-----|-------------|-----|
| His6-tag | HHHHHH | purification |
| FLAG | DYKDDDDK | detection |
| Strep-II | WSHPQFEK | purification |
| V5 | GKPIPNPLLGLD | detection |
| Myc | EQKLISEEDL | detection |
| HA | YPYDVPDYA | detection |
| TEV site | ENLYFQS | cleavage |
| Thrombin site | LVPRGS | cleavage |
| PreScission | LEVLFQGP | cleavage |
| Enterokinase | DDDDK | cleavage |
| Factor Xa | IEGR | cleavage |

**Линкеры:**
- Гибкие: (GGGGS)n
- S/T/P/G-rich регионы (>60% в окне 15 АК)
- Переиспользует `detectLinkers()` из `domain-detection.js`

**Промоторные элементы (эукариоты):**
- TATA box: консенсус `TATAAWR` (W=[AT], R=[AG]) в позициях -25..-35 от конца
- CAAT box: `CCAAT` в позициях -70..-120 от конца
- GC box: `GGGCGG` (Sp1 сайт)

**Промоторные элементы (прокариоты):**
- -10 (Pribnow box): `TATAAT` ±2 мисматча, в позициях -5..-50 от конца
- -35 элемент: `TTGACA` ±2 мисматча, в позициях -25..-60 от конца
- RBS (Shine-Dalgarno): `AGGAGG` ±2 мисматча, в последних 25 нт
- Расстояние -10 до -35 = 16-18 нт → повышает confidence

**Терминаторные элементы:**
- Эукариоты: poly-A сигнал `AATAAA`
- Прокариоты (будущее): стем-луп (палиндром) + поли-U хвост

**Рестрикционные сайты (23 фермента):**
- EcoRI, BamHI, HindIII, XbaI, SpeI, PstI, SalI, NcoI, NdeI, XhoI, NotI, NheI, BglII, KpnI, SacI, BsaI, BbsI, Esp3I, SapI, DpnI, EcoRV, SmaI, ClaI, AgeI
- Поиск на обеих цепях (прямой + reverse complement)

### Уровень 2: Средняя сложность (реализовать на 2-й неделе)

- **Kozak контекст**: gccRccAUGG — сильный; только R в -3 и G в +4 — средний; иначе — слабый
- **Codon usage / CAI**: таблица для организма из strains, пометить редкие кодоны (<10%)
- **Расширенные теги**: GST (MSPILGYWKIKGLVQP), MBP (MKIEEGKLVI), SUMO (MSDQEAKPSTEDLGDKKEG)
- **Интроны**: GT..AG правило (donor/acceptor)

### Уровень 3: Продвинутое (фаза 2-3, через месяц+)

- **BLAST-подобный поиск**: локальная база ~1500 известных фичей (SnapGene common features)
- **InterPro домены**: API или локальная Pfam-HMM — hmmscan на каждый белок
- **SignalP нейросеть**: настоящий SignalP (Уровень 1 использует упрощённый von Heijne)

### Что НЕ делать

- **Не делать BLAST.** Локальный BLAST для 1500 фичей — отдельный сервис, Python-зависимость, минуты на запрос.
- **Не делать InterPro/Pfam.** HMM-профили — отдельный мир, не для фронтенда.
- **Не детектировать тип Part по последовательности.** Пользователь сам указывает тип. Авто-детекция "это CDS" vs "это промотор" ненадёжна.
- **Не перезаписывать пользовательские аннотации.** `auto: true` означает "можно перезаписать", пользовательские — нет.
