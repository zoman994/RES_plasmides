# PlasmidVCS — Архитектура данных и взаимодействий

**Дата:** 28 марта 2026
**Цель:** Единый источник правды для всех компонентов системы

---

## 1. Модель данных — сущности и связи

### 1.1 Иерархия сущностей

```
Проект (Project)
 └── Эксперимент (Experiment)  ←  может быть несколько
      └── Сборка (Assembly)    ←  может быть несколько
           ├── Фрагменты (Fragment[])  ←  порядок важен
           ├── Стыки (Junction[])      ←  между фрагментами
           └── Праймеры (Primers)       ←  три категории
                ├── assembly[]
                ├── custom[]
                └── verification[]

Библиотека частей (PartsLibrary)  ←  глобальная, не привязана к эксперименту
 └── Часть (Part)
      └── Вариант (Part)  ←  дочерний, parentId → родитель

Инвентарь (Inventory)  ←  глобальный
 └── Запись (InventoryItem)  ←  привязана к Part или Assembly
```

### 1.2 Part (часть в библиотеке)

```
Part {
  id: string              // уникальный "part_PglaA"
  name: string            // "PglaA"
  type: string            // "promoter" | "CDS" | "terminator" | "marker" | "origin" | ...
  sequence: string        // полная нуклеотидная последовательность
  length: number          // длина (вычисляется из sequence)
  organism: string?       // "A. niger CBS 513.88"
  description: string?    // "Промотор глюкоамилазы, инд. мальтозой"
  ec: string[]?           // ["3.2.1.3"] — EC номера (для CDS)
  
  // Версионирование
  parentId: string?       // null = корневая, "part_PglaA" = вариант
  children: string[]      // id дочерних вариантов
  modification: {         // только для дочерних
    type: string          // "mutation" | "truncation" | "deletion" | "codon_opt"
    description: string   // "E33D, Q34A"
  }?
  
  // Домены (для CDS)
  domains: [{
    name: string          // "signal_peptide"
    start: number         // 0
    end: number           // 57
    type: string          // "signal" | "propeptide" | "catalytic" | "linker" | "tag"
  }]?
  
  // Тестирование
  testResults: [{
    date: string
    result: string        // "active" | "inactive" | "reduced" | "enhanced"
    activity: number?     // 0.0 - 1.0+ (относительно родителя)
    notes: string
    assemblyId: string?   // в какой сборке тестировали
  }]?
  
  // Метаданные
  source: string?         // "genome_import" | "manual" | "construct_extract" | "synthesis"
  genomeId: string?       // из какого генома импортирован
  locusTag: string?       // "An03g06550"
  createdAt: string
  updatedAt: string
}
```

### 1.3 Fragment (фрагмент на canvas)

Fragment — это ЭКЗЕМПЛЯР Part в конкретной сборке. Один Part может быть в нескольких сборках как разные Fragments.

```
Fragment {
  id: string              // уникальный в рамках сборки "frag_001"
  partId: string          // ссылка на Part в библиотеке
  name: string            // копия из Part (может отличаться при мутации)
  type: string            // копия из Part
  sequence: string        // копия (может быть изменена мутацией)
  length: number
  strand: 1 | -1          // направление (1 = sense, -1 = antisense/flipped)
  
  needsAmplification: boolean  // true = нужна ПЦР, false = из пробирки
  
  // Мутации (применённые в этом экземпляре)
  mutations: [{
    position: number      // позиция аминокислоты
    from: string          // "E"
    to: string            // "A"
    codonChange: string   // "GAG→GCG"
  }]?
}
```

**КЛЮЧЕВОЕ ПРАВИЛО:** Fragment.sequence может отличаться от Part.sequence (мутации, обрезки). При мутации создаётся НОВЫЙ Part-вариант в библиотеке И обновляется Fragment.

### 1.4 Junction (стык между фрагментами)

```
Junction {
  id: string
  type: string            // "overlap" | "golden_gate" | "re_ligation" | "kld"
  
  // Для overlap/gibson
  overlapLength: number?  // 30
  calcMode: string?       // "length" | "tm"
  targetTm: number?       // 62 (если calcMode === "tm")
  mode: string?           // "split" | "left_only" | "right_only"
  actualOverlap: number?  // после расчёта
  overlapTm: number?      // после расчёта
  
  // Для golden_gate
  enzyme: string?         // "BsaI"
  overhang: string?       // "AATG" (4 нт, авто или ручной)
  overhangValid: boolean? // уникальный и не палиндром
  
  // Для re_ligation
  restrictionEnzyme: string?  // "EcoRI"
  
  // Для kld
  // (нет доп. параметров — KLD определяется back-to-back праймерами)
  
  // Автоматическая настройка
  autoMode: boolean?      // true = режим выбран автоматически
  autoReason: string?     // "GA без ПЦР — overlap на fwd_EGFP"
}
```

### 1.5 Primers (три категории)

```
Primers {
  assembly: Primer[]      // авто-генерируемые для стыков
  custom: Primer[]        // пользовательские (из Sequence View)
  verification: Primer[]  // colony PCR + секвенирование
}

Primer {
  id: string
  name: string            // "IS001_fwd_PglaA" или "custom_fwd_1"
  category: string        // "assembly" | "custom" | "verification"
  direction: string       // "forward" | "reverse"
  
  sequence: string        // полная последовательность 5'→3'
  binding: string         // binding region
  tail: string            // tail (overlap/GG/пустой)
  
  tmBinding: number       // Tm binding региона
  tmFull: number?         // Tm полного праймера
  gcPercent: number
  length: number
  
  // Позиция в конструкте (абсолютная)
  positionStart: number   // начало binding на полной последовательности
  positionEnd: number     // конец binding
  
  // Привязка
  fragmentIndex: number?  // для assembly — индекс фрагмента
  fragmentName: string?   // имя фрагмента
  
  // Для assembly
  junctionIndex: number?  // какой стык обслуживает
  tailSource: string?     // "от GA" — откуда tail
  
  // Для custom
  createdAt: string?
  isCustom: boolean?
  
  // Модификации
  phosphorylated: boolean // 5'-фосфорилирование
  containsMutation: boolean?  // несёт мутацию в tail
  mutDescription: string?     // "E33D (GAG→GCG)"
}
```

### 1.6 Assembly (сборка)

```
Assembly {
  id: string
  name: string            // "Сборка 1"
  index: number           // порядковый номер в эксперименте
  
  fragments: Fragment[]
  junctions: Junction[]   // junctions.length === fragments.length - 1 (+ 1 если circular)
  primers: Primers         // { assembly, custom, verification }
  
  circular: boolean       // кольцевая/линейная
  calculated: boolean     // праймеры рассчитаны?
  
  // Стратегия сборки
  maxFinalParts: number   // 0=авто, 2, 3, или fragments.length
  
  // Протокол
  protocolStages: Stage[]?
  
  // Метаданные
  totalSize: number       // сумма длин фрагментов
  createdAt: string
  updatedAt: string
}
```

### 1.7 Experiment (эксперимент)

```
Experiment {
  id: string
  name: string            // "Проект 1"
  assemblies: Assembly[]  // может быть несколько
  activeAssemblyIndex: number
  createdAt: string
  updatedAt: string
}
```

### 1.8 InventoryItem (запись инвентаря)

```
InventoryItem {
  id: string
  partId: string?         // ссылка на Part
  assemblyId: string?     // ссылка на Assembly (продукт сборки)
  
  name: string            // "pET-AsCpf1 минипреп"
  format: string          // "plasmid" | "pcr_product" | "glycerol_stock" | "dna"
  concentration: number?  // нг/мкл
  volume: number?         // мкл
  
  location: {
    freezer: string?      // "-80°C №2"
    shelf: string?        // "Полка 3"
    rack: string?         // "Рэк A"
    box: string?          // "Бокс A3"
    position: string?     // "D7"
  }?
  
  createdAt: string
  notes: string?
}
```

---

## 2. Связи между сущностями

```
Part ←──parentId──→ Part (дерево вариантов)
Part ←──partId────→ Fragment (Part = шаблон, Fragment = экземпляр)
Part ←──partId────→ InventoryItem (что в морозилке)

Fragment ←──index──→ Junction (junction[i] = между fragment[i] и fragment[i+1])
Fragment ←──primers──→ Primer (assembly primers привязаны к fragmentIndex)

Assembly ←──assemblies──→ Experiment
Assembly ←──assemblyId──→ InventoryItem (продукт сборки в морозилке)

Primer.positionStart/End → абсолютная позиция на конструкте (для Sequence View)
```

---

## 3. Потоки данных — что от чего зависит

### 3.1 Действия с фрагментами

| Действие | fragments | junctions | primers.assembly | primers.custom | primers.verif | calculated |
|---|---|---|---|---|---|---|
| Добавить фрагмент | ✅ INSERT | ✅ INSERT junction | 🗑 CLEAR | 📐 REPOSITION | — | false |
| Удалить фрагмент | ✅ REMOVE | ✅ REMOVE junction | 🗑 CLEAR | 📐 REPOSITION | — | false |
| Переставить (drag) | ✅ REORDER | ✅ REBUILD | 🗑 CLEAR | 📐 REPOSITION | — | false |
| Перевернуть (flip) | ✅ UPDATE strand | — | 🗑 CLEAR | 📐 REPOSITION | — | false |
| Разрезать (split) | ✅ SPLIT→2 | ✅ INSERT junction | 🗑 CLEAR | 📐 REPOSITION | — | false |
| Редактировать seq | ✅ UPDATE seq | — | 🗑 CLEAR | 📐 REPOSITION | — | false |
| Мутировать AA | ✅ UPDATE seq+name | (может добавить KLD junction) | 🗑 CLEAR | 📐 REPOSITION | — | false |

**Правило: любое изменение fragments → assembly primers сбрасываются.**
Custom primers пересчитывают позиции (абсолютные координаты сдвигаются).

### 3.2 Действия со стыками

| Действие | fragments | junctions | primers.assembly | primers.custom | calculated |
|---|---|---|---|---|---|
| Сменить тип (overlap→GG) | — | ✅ UPDATE type | 🗑 CLEAR | — | false |
| Изменить overlap length | — | ✅ UPDATE | 🗑 CLEAR | — | false |
| Изменить calcMode | — | ✅ UPDATE | 🗑 CLEAR | — | false |
| Сменить mode (◀/◀▶/▶) | — | ✅ UPDATE | 🗑 CLEAR | — | false |
| Изменить GG enzyme | — | ✅ UPDATE | 🗑 CLEAR | — | false |
| Изменить GG overhang | — | ✅ UPDATE | — | — | — |

### 3.3 Действия с праймерами

| Действие | primers.assembly | primers.custom | primers.verif |
|---|---|---|---|
| Generate Primers (кнопка) | ✅ RECALCULATE | — (сохраняются) | — (сохраняются) |
| Select+P в Seq View | — | ✅ ADD | — |
| Select+R в Seq View | — | ✅ ADD | — |
| Удалить custom primer | — | ✅ REMOVE | — |
| Verification panel recalc | — | — | ✅ RECALCULATE |

### 3.4 Действия с частями (библиотека)

| Действие | Parts | Fragments | Assemblies |
|---|---|---|---|
| Добавить Part в библиотеку | ✅ ADD | — | — |
| Удалить Part из библиотеки | ✅ REMOVE | ⚠ WARNING если используется | — |
| Создать вариант (мутация) | ✅ ADD child, UPDATE parent.children | ✅ UPDATE если на canvas | — |
| Импорт генома → Parts | ✅ BULK ADD | — | — |
| Редактировать Part | ✅ UPDATE | ⚠ НЕ обновлять fragments автоматически! | — |

**КЛЮЧЕВОЕ ПРАВИЛО:** Редактирование Part в библиотеке НЕ меняет Fragment на canvas. Fragment — это снимок на момент добавления. Иначе редактирование Part в одной сборке сломает другую.

### 3.5 Переключение видов

| Действие | Данные | UI |
|---|---|---|
| Blocks → Sequence | НИЧЕГО не меняется | Рендер: двойная цепь + аннотации |
| Sequence → Map | НИЧЕГО не меняется | Рендер: кольцевая карта |
| Map → Blocks | НИЧЕГО не меняется | Рендер: блоки + стыки |
| Любое переключение | viewMode state меняется | Всё остальное сохраняется |

---

## 4. Пересчёт позиций custom-праймеров

Когда фрагменты меняются (добавление, удаление, перестановка), 
абсолютные позиции custom-праймеров нужно пересчитать.

```
Было:
  [PglaA 939bp] [GFP 720bp] [TtrpC 300bp]
  Custom primer на позиции 950 (начало GFP + 11bp)

Удалили PglaA:
  [GFP 720bp] [TtrpC 300bp]
  Custom primer теперь на позиции 11 (GFP + 11bp)

Логика:
  1. Custom primer хранит: fragmentName + positionInFragment
  2. При изменении fragments: найти fragment по имени → пересчитать 
     абсолютную позицию
  3. Если fragment удалён → ПРЕДУПРЕЖДЕНИЕ "Праймер custom_fwd_1 
     привязан к GFP, который удалён. Удалить праймер?"
```

```
CustomPrimer {
  ...
  // Относительная привязка (стабильная)
  fragmentName: string     // "GFP"
  positionInFragment: number  // 11 (от начала фрагмента)
  
  // Абсолютная позиция (пересчитывается)
  positionStart: number    // 950 → 11 после удаления PglaA
  positionEnd: number
}

function recalcCustomPositions(customPrimers, fragments) {
  // Вычислить смещение каждого фрагмента
  let offset = 0;
  const offsets = {};
  fragments.forEach(f => {
    offsets[f.name] = offset;
    offset += f.sequence.length;
  });
  
  return customPrimers.map(p => {
    if (offsets[p.fragmentName] !== undefined) {
      return {
        ...p,
        positionStart: offsets[p.fragmentName] + p.positionInFragment,
        positionEnd: offsets[p.fragmentName] + p.positionInFragment + p.binding.length,
      };
    } else {
      // Фрагмент удалён!
      return { ...p, orphaned: true };
    }
  }).filter(p => !p.orphaned); // или показать предупреждение
}
```

---

## 5. Auto-adjust логика для стыков

### 5.1 При изменении needsAmplification

```
Фрагмент A (ПЦР) ◀▶ Фрагмент B (без ПЦР)
→ Автоматически: junction.mode = "left_only"
→ junction.autoMode = true
→ junction.autoReason = "B без ПЦР — overlap на rev_A"
→ Кнопки ◀▶ и ▶ серые (disabled) в popup

Фрагмент A (без ПЦР) ◀▶ Фрагмент B (без ПЦР)
→ WARNING: "Оба фрагмента без ПЦР — overlap невозможен"
→ Предложить: добавить ПЦР одному из них
```

### 5.2 При мутации фрагмента

```
Мутация рядом с 5' концом (< 60bp от начала):
→ Встроить в tail fwd-праймера (overlap-стратегия)
→ Не нужен дополнительный KLD шаг
→ junction.type остаётся "overlap"

Мутация рядом с 3' концом (< 60bp от конца):
→ Встроить в tail rev-праймера
→ Не нужен дополнительный KLD шаг

Мутация в середине (> 60bp от обоих концов):
→ Предложить: 
  A) Разрезать фрагмент → мутация в overlap zone
  B) Отдельный KLD на матрице → использовать продукт в сборке

Один фрагмент (вся плазмида):
→ Inverse PCR + KLD
→ junction.type = "kld" (автоматически)
```

### 5.3 Golden Gate auto-overhang

```
При смене junction.type на "golden_gate":
1. Извлечь 4 нт из реальных последовательностей (2 от левого + 2 от правого)
2. Проверить уникальность среди ВСЕХ GG-стыков в сборке
3. Проверить не палиндром
4. Если конфликт → попробовать сдвиг ±1-3 bp
5. Если всё равно конфликт → пометить junction.overhangValid = false

При смене фермента (BsaI → SapI):
1. Проверить внутренние сайты во всех фрагментах
2. Если сайт найден → WARNING + предложить альтернативу
3. Пересчитать длину overhang (BsaI = 4nt, SapI = 3nt)
4. Заново проверить уникальность
```

---

## 6. Протокол — стадии и зависимости

### 6.1 Порядок стадий (неизменный)

```
1. ПЦР (все, параллельно)
   ↓
2. Гель + очистка
   ↓
3. Мутагенез KLD (если есть мутации в середине фрагментов)
   ↓
4. Overlap/Gibson попарное склеивание (если > maxFinalParts overlap-фрагментов)
   ↓
5. Гель + очистка
   ↓
6. Финальная сборка:
   - Gibson (если есть overlap-стыки) ИЛИ
   - Golden Gate (если есть GG-стыки) ИЛИ
   - RE/Лигирование (если есть RE-стыки) ИЛИ
   - KLD замыкание (если кольцевая с KLD)
   ↓
7. Трансформация
```

### 6.2 Мультиметодная сборка

```
Пример: [3xFLAG] -overlap- [GA] -KLD- [EGFP] -overlap- [tdc1] -GG- [pGPD]

Группы по overlap:
  Группа 1: [3xFLAG, GA] → overlap merge
  Группа 2: [EGFP, tdc1] → overlap merge
  Группа 3: [pGPD] → одиночный

Протокол:
  1. ПЦР всех 5 фрагментов (параллельно)
  2. Overlap merge: 3xFLAG+GA и EGFP+tdc1 (параллельно)
  3. KLD мутагенез: между продуктами шага 2 (если KLD = мутация)
     ИЛИ KLD-стык: ПЦР с back-to-back → KLD reaction
  4. Golden Gate: финальная сборка MergeA + MergeB + pGPD
  5. Трансформация
```

---

## 7. Палитра — раскрывающиеся карточки

### 7.1 Данные для карточки Part

```
При раскрытии Part в палитре, собрать:

1. Варианты: parts.filter(p => p.parentId === part.id)
   + рекурсивно для внуков

2. Использование: пройти ВСЕ эксперименты → ВСЕ сборки → 
   найти fragments где f.partId === part.id ИЛИ f.name === part.name

3. Инвентарь: inventory.filter(i => i.partId === part.id)

4. Инвентарь варинатов: для каждого child → тоже проверить inventory
```

### 7.2 Действия из карточки

| Действие | Что происходит |
|---|---|
| Drag part → canvas | Создать Fragment из Part, добавить в текущую сборку |
| Drag variant → canvas | Создать Fragment из variant Part |
| Клик "На canvas" | То же что drag |
| Клик на сборку | Переключить activeExperiment + activeAssembly |
| Клик "Редактировать" | Открыть SequenceEditor для Part в библиотеке |
| Клик "Вариант" | Открыть SequenceEditor в режиме "Сохранить как вариант" |

### 7.3 Конфликт: редактирование Part vs Fragment

```
СИТУАЦИЯ: Part "GFP" используется в 3 сборках как Fragment.
Пользователь редактирует Part "GFP" в библиотеке (добавил стоп-кодон).

НЕПРАВИЛЬНО: автоматически обновить все 3 Fragment → сломаются праймеры,
             изменятся размеры, junction overlaps станут неверными.

ПРАВИЛЬНО: 
  1. Обновить Part в библиотеке
  2. Показать предупреждение: "GFP используется в 3 сборках. Обновить?"
  3. Варианты:
     A) Обновить все фрагменты (перегенерировать праймеры)
     B) Обновить только в текущей сборке
     C) Не обновлять (фрагменты сохраняют старую версию)
  4. Пользователь выбирает.
```

---

## 8. localStorage — структура сохранения

```
localStorage keys:
  pvcs-experiments    → Experiment[]  (включая assemblies, fragments, junctions)
  pvcs-parts          → Part[]        (вся библиотека)
  pvcs-inventory      → InventoryItem[]
  pvcs-primers-{asmId}→ Primers       (для каждой сборки отдельно!)
  pvcs-genomes        → GenomeMeta[]  (метаданные импортированных геномов)
  pvcs-settings       → {
    expertMode: boolean
    viewMode: string        // "blocks" | "sequence" | "map"
    canvasHeight: number
    ggEnzyme: string        // "BsaI"
    polymerase: string      // "Phusion"
    prefix: string          // "IS"
    maxFinalParts: number   // 0
  }
```

### 8.1 Инициализация (первый запуск)

```
1. Проверить pvcs-experiments в localStorage
2. Если нет → создать дефолтный:
   - Experiment "Проект 1" 
   - Assembly "Сборка 1" (пустая)
   - Parts из test_parts.json (10 базовых)
3. Если есть → загрузить
4. try/catch на JSON.parse → если corrupt → сбросить к дефолту
```

### 8.2 Когда сохранять

```
Автосохранение через debounce (500ms):
- fragments изменились → сохранить experiments
- parts изменились → сохранить parts  
- primers изменились → сохранить primers
- settings изменились → сохранить settings

НЕ сохранять на каждый mouse move / hover / selection
```

---

## 9. Граничные случаи и конфликты

### 9.1 Удаление Part который используется

```
Пользователь удаляет Part "GFP" из библиотеки.
GFP используется как Fragment в Сборке 1 и Сборке 3.

Решение:
  1. Предупреждение: "GFP используется в 2 сборках"
  2. Удаление из библиотеки НЕ удаляет Fragment со canvas
  3. Fragment сохраняет свою копию sequence
  4. В палитре GFP исчезает, но на canvas остаётся
  5. partId у Fragment → помечается как orphaned
```

### 9.2 Два одинаковых фрагмента в сборке

```
Пользователь добавляет GFP дважды (легитимно: тандемный повтор).
Каждый Fragment получает УНИКАЛЬНЫЙ id (frag_001, frag_002).
Имена одинаковые: "GFP" и "GFP".
Праймеры: IS001_fwd_GFP и IS003_fwd_GFP_2 (суффикс _2).
```

### 9.3 Circular + KLD последний стык

```
Circular assembly: последний Junction (closing) = KLD.
Это значит: inverse PCR всей конструкции + KLD замыкание.
НО: если есть другие overlap-стыки, сначала собрать линейный 
    продукт overlap/Gibson, ПОТОМ KLD замкнуть.

Порядок:
  1. ПЦР фрагментов
  2. Overlap merge → линейный конструкт
  3. KLD замыкание линейного конструкта в кольцо
```

### 9.4 Fragment без sequence (placeholder)

```
Пользователь добавил "Мой новый ген" без последовательности 
(placeholder, длину указал вручную = 1500 bp).

Поведение:
  - На canvas показывается как обычный блок (серый/штрихованный)
  - Generate Primers → пропускает этот фрагмент
  - WARNING: "Мой новый ген: последовательность не указана"
  - Стыки с этим фрагментом: disabled (нельзя рассчитать overlap)
  - Протокол: "⚠ Добавьте последовательность для полного протокола"
```

### 9.5 Переключение эксперимента/сборки

```
Переключение Experiment или Assembly:
  1. Сохранить текущее состояние в localStorage
  2. Загрузить новое: fragments, junctions, primers
  3. viewMode — сохраняется (не сбрасывается при переключении)
  4. Canvas zoom — сбрасывается (fitToView)
  5. Selection в Sequence View — сбрасывается
  6. Expanded junction popup — закрывается
```

---

## 10. Правила именования праймеров

```
Assembly primers:
  {prefix}{number}_{direction}_{fragmentName}
  IS001_fwd_PglaA
  IS002_rev_PglaA
  IS003_fwd_GFP
  IS004_rev_GFP
  
  Нумерация сквозная по всей сборке.
  При пересчёте — перенумеровываются.

Custom primers:
  custom_{direction}_{number}
  custom_fwd_1
  custom_rev_2
  
  Пользователь может переименовать.
  Нумерация не сбрасывается при пересчёте assembly.

Verification primers:
  ver_{type}_{fragmentName}
  ver_colony_fwd_GFP
  ver_seq_fwd_001

Mutagenesis primers:
  {prefix}{number}_mut_{direction}_{fragmentName}
  IS005_mut_fwd_GA
  IS006_mut_rev_GA
```

---

## 11. Резюме: один источник правды

```
App.jsx state:
  experiments[]          — все эксперименты со сборками
  activeExperimentId     — текущий эксперимент
  activeAssemblyIndex    — текущая сборка
  
  // Derived (вычисляемые):
  activeExperiment = experiments.find(e => e.id === activeExperimentId)
  activeAssembly = activeExperiment.assemblies[activeAssemblyIndex]
  fragments = activeAssembly.fragments
  junctions = activeAssembly.junctions
  primers = activeAssembly.primers
  
  // Глобальные:
  parts[]                — библиотека частей
  inventory[]            — инвентарь
  genomes[]              — импортированные геномы
  
  // UI state:
  viewMode               — "blocks" | "sequence" | "map"
  expertMode              — true | false
  canvasHeight            — number
  selection               — { start, end } | null (для Sequence View)
  expandedPartId          — string | null (для палитры)
  selectedJunction        — number | null
```

Все компоненты получают данные через props из App.jsx.
Никаких параллельных state — один источник правды.
