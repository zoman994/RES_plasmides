# BodgeGene — Утверждённая архитектура v2

**Дата утверждения:** 31 марта 2026  
**Статус:** УТВЕРЖДЕНО

---

## Два уровня. Не больше.

### Уровень 1: ПРОЕКТ (Project Flow Canvas)

**Вопрос:** "Что я делаю в этом проекте?"

Свободный canvas (Miro-like). Элементы:
- **Source Parts** — плазмиды/фрагменты из библиотеки
- **Operations** — PCR, OV-PCR, рестрикция
- **Products** — "составные блоки" (assembled constructs)
- **Checkpoints** — секвенирование, colony PCR

Связи через edges. Группировка естественная через dagre layout (не контейнеры-прямоугольники — это overengineering).

**"Составной блок" (assembled product):**
```
┌──────────────────────────────────────────┐
│ P43_U3afu_Hyg  (5.6 kb) ✓ assembled     │
│ ┌─────────┐┌───────┐┌────────┐           │
│ │ U3 prom  ││ gRNA  ││  PyrG  │           │
│ └─────────┘└───────┘└────────┘           │
│ Gibson · 3 fragments · Protocol: done    │
└──────────────────────────────────────────┘
```

Видно: из чего склеен, метод, статус протокола. Аннотации читаемы — мини-полоска с именами фрагментов.

**Привязка к протоколу:**
- Каждый составной блок хранит `protocol: 'complete' | 'in_progress' | 'planned' | 'manual'`
- `manual` = "просто склеено, без детального протокола"
- При `complete` — ссылка на protocolSteps с ПЦР/сборкой/трансформацией

**Двойной клик на составной блок → Уровень 2.**

---

### Уровень 2: КОНСТРУКТ (Blocks View + Views)

**Вопрос:** "Из чего он состоит и как его собрать?"

Текущий Blocks View — ядро приложения:
```
[frag1] ─junction─ [frag2] ─junction─ [frag3]
```

4 таба визуализации одного и того же конструкта:
- **Blocks** (Ctrl+1) — рабочий экран, junctions, настройки
- **Sequence** (Ctrl+2) — нуклеотидная последовательность
- **Map** (Ctrl+3) — circular SVG карта
- **Racetrack** (Ctrl+4) — стадион для circular

---

## Правило двух кликов

**Любая операция ≤ 2 клика от текущего экрана:**

| Операция | Путь |
|----------|------|
| Редактировать последовательность | Blocks → клик на фрагмент → FragmentEditor |
| Заменить элемент плазмиды | PlasmidViewer → клик на регион → Replace/Delete |
| Рассчитать праймеры | Blocks → "Рассчитать праймеры" (1 клик) |
| Открыть конструкт из flow | Flow → двойной клик на ноду (1 действие) |
| Аннотации | Blocks → клик на фрагмент → AnnotationEditor |

---

## Составной блок (Merged Construct)

### Data model

```js
// В assembly после completeAssembly():
{
  completed: true,
  product: {
    name: 'P43_U3afu_Hyg',
    sequence: 'ATGC...', // полная склеенная последовательность
    length: 5600,
    subFragments: [
      { name: 'U3 prom', type: 'promoter', length: 800, pct: 14.3, color: '#22C55E' },
      { name: 'gRNA',    type: 'CDS',      length: 150, pct: 2.7,  color: '#3B82F6' },
      { name: 'PyrG',    type: 'marker',    length: 1440, pct: 25.7, color: '#FBBF24' },
    ],
    assemblyMethod: 'gibson',
    protocol: 'complete',  // | 'in_progress' | 'planned' | 'manual'
    protocolSteps: [...],  // ссылка на шаги протокола
    completedAt: '2026-03-31T...',
  },
}
```

### Визуал на Blocks View (свёрнутый продукт)

```
┌────────────────────────────────────────────┐
│ ✅ P43_U3afu_Hyg  (5.6 kb)                 │
│ ████████░░░░░░░░████████████░░░████████████│ ← цветная полоска subFragments
│ U3 prom · gRNA · PyrG                      │
│ Gibson · done · 31.03.2026                 │
│                                            │
│ [📋 Протокол] [🔍 Фрагменты] [📧 Export] │
└────────────────────────────────────────────┘
```

- Цветная полоска — пропорциональная длине каждого subFragment
- Имена фрагментов под полоской
- Метод сборки + дата
- Кнопка "Фрагменты" → развернуть обратно в blocks view

### Визуал на Flow Canvas (составной блок как нода)

Компактнее, но та же идея:
```
┌─────────────────────┐
│ ○ P43_U3afu_Hyg     │
│ 5.6 kb · assembled  │
│ ███░██████░████████ │ ← мини-полоска
│ Gibson · 3 frags    │
└─────────────────────┘
```

### Аннотации склеенного конструкта

**Проблема:** После склейки аннотации фрагментов должны быть видны на полной последовательности.

**Решение:** `product.annotations` = объединённые аннотации всех фрагментов со сдвинутыми координатами:

```js
// При completeAssembly():
const mergedAnnotations = [];
let offset = 0;
for (const frag of fragments) {
  for (const ann of (frag.annotations || [])) {
    mergedAnnotations.push({
      ...ann,
      start: ann.start + offset,
      end: ann.end + offset,
      sourceFragment: frag.name,  // откуда пришла
    });
  }
  offset += frag.sequence.length;
}
product.annotations = mergedAnnotations;
```

В PlasmidViewer/Map/Sequence — рендерить все аннотации с пометкой `sourceFragment` для трейсабилити.

---

## Проверка комплементарности концов

### Проблема

Два ПЦР-фрагмента рядом → overlap junction → праймеры подбираются по длине/Tm. Но **нет проверки что концы совместимы**. Если фрагменты из разных источников — overlap может попасть на несовместимую область.

### Что должно происходить

```
[Fragment A] ─── overlap 30bp ─── [Fragment B]
                    ↓
         ПРОВЕРКА перед расчётом праймеров:
         
1. Overlap зона определена (последние N bp A + первые N bp B)
2. Проверить: эта зона СУЩЕСТВУЕТ в обоих фрагментах?
   - Overlap = tail правого праймера A + tail левого праймера B
   - Tail = добавляется из ДРУГОГО фрагмента
   - Значит overlap всегда "искусственный" → комплементарность гарантирована дизайном
   
3. НО: проверить потенциальные проблемы:
   - ❌ Overlap попадает на повтор (та же последовательность в другом месте конструкта)
   - ❌ Overlap содержит palindrome (самокомплементарность → hairpin)
   - ❌ Overlap между ИДЕНТИЧНЫМИ фрагментами → сборка невозможна
   - ⚠ Overlap GC% экстремальный (<20% или >80%) → слабый отжиг
   - ⚠ Overlap Tm < 50°C или > 72°C → плохой отжиг
```

### Для RE/лигирования:

```
[Fragment A] ─── RE junction ─── [Fragment B]
                    ↓
         ПРОВЕРКА:
         
1. Фермент выбран (EcoRI)
2. Сайт EcoRI ЕСТЬ на концах обоих фрагментов?
   - Если нет → ⛔ "Концы не совместимы — нет сайта EcoRI"
   - Если да → ✅ + показать overhang (5' AATT)
3. Сайт EcoRI внутри фрагментов?
   - Если да → ⚠ "EcoRI разрежет фрагмент" (уже реализовано в checkAssemblyForSites)
4. Blunt ends → всегда совместимы, но направление неопределённо (⚠ предупреждение)
```

### Для Golden Gate:

```
[Fragment A] ─── GG junction ─── [Fragment B]
                    ↓
         ПРОВЕРКА (уже частично реализована):
         
1. Overhang уникальный? (нет дубликатов среди всех junction)
2. Overhang не palindrome?
3. Overhang не RC другого overhang?
4. GC в overhang 25-75%?
```

### Реализация: `validateJunctionEnds()` в validate.js

```js
/**
 * Validate junction end compatibility between adjacent fragments.
 * Called BEFORE primer calculation.
 * 
 * @returns {Array<{junction, severity, message}>}
 */
export function validateJunctionEnds(fragments, junctions, circular) {
  const warnings = [];
  const n = junctions.length;
  
  for (let i = 0; i < n; i++) {
    const j = junctions[i];
    const left = fragments[i];
    const right = fragments[(i + 1) % fragments.length];
    if (!left?.sequence || !right?.sequence) continue;
    
    if (j.type === 'overlap' || !j.type) {
      // Check: identical fragments → overlap impossible
      if (left.sequence === right.sequence) {
        warnings.push({ junction: i, severity: 'error',
          message: `⛔ Идентичные фрагменты — overlap невозможен` });
        continue;
      }
      
      // Check: overlap Tm and GC
      const overlapLen = j.overlapLength || 30;
      const leftEnd = left.sequence.slice(-Math.ceil(overlapLen / 2));
      const rightStart = right.sequence.slice(0, Math.floor(overlapLen / 2));
      const overlapZone = leftEnd + rightStart;
      const gc = (overlapZone.match(/[GC]/gi) || []).length / overlapZone.length * 100;
      
      if (gc < 20) warnings.push({ junction: i, severity: 'warning',
        message: `⚠ Junction ${i+1}: GC% overlap = ${gc.toFixed(0)}% (слишком низкий, слабый отжиг)` });
      if (gc > 80) warnings.push({ junction: i, severity: 'warning',
        message: `⚠ Junction ${i+1}: GC% overlap = ${gc.toFixed(0)}% (слишком высокий, вторичные структуры)` });
      
      // Check: overlap contains repeat elsewhere in construct
      const fullSeq = fragments.map(f => f.sequence).join('');
      const overlapSeq = left.sequence.slice(-overlapLen);
      const firstOccurrence = fullSeq.indexOf(overlapSeq);
      const secondOccurrence = fullSeq.indexOf(overlapSeq, firstOccurrence + 1);
      if (secondOccurrence >= 0) {
        warnings.push({ junction: i, severity: 'warning',
          message: `⚠ Junction ${i+1}: overlap последовательность повторяется в конструкте — возможна мисассембли` });
      }
    }
    
    if (j.type === 're_ligation' || j.type === 'sticky_end') {
      const enzyme = j.reEnzyme || j.enzyme;
      if (!enzyme) {
        warnings.push({ junction: i, severity: 'error',
          message: `⛔ Junction ${i+1}: рестриктаза не выбрана` });
        continue;
      }
      // End compatibility: both fragments must have the RE site at their ends
      // (or be cut from the same plasmid)
      // This is complex — simplified check: just warn if RE site not found near ends
      const leftEnd20 = left.sequence.slice(-20).toUpperCase();
      const rightStart20 = right.sequence.slice(0, 20).toUpperCase();
      const RE = require('./restriction-db').RE_ENZYMES[enzyme];
      if (RE) {
        const site = RE.site.toUpperCase();
        if (!leftEnd20.includes(site) && !rightStart20.includes(site)) {
          warnings.push({ junction: i, severity: 'warning',
            message: `⚠ Junction ${i+1}: сайт ${enzyme} (${site}) не найден на концах фрагментов — проверьте что фрагменты подготовлены` });
        }
      }
    }
  }
  
  return warnings;
}
```

---

## Что делать сейчас (приоритеты)

### Phase A: Стабилизация (1-2 дня)

1. **Починить 27 багов** (Batch 1-3 из аудита)
2. **clearFlow + rehydration validation** (orphaned ноды)
3. **flex-1 на ProjectFlowCanvas** (drag сломан)
4. **Тесты: убедиться что 480 тестов зелёные**

### Phase B: Составной блок + валидация (2-3 дня)

5. **`validateJunctionEnds()`** — проверка комплементарности ПЕРЕД расчётом праймеров
6. **Составной блок** — улучшить `completeAssembly()`:
   - Мержить аннотации с offset
   - subFragments с цветами
   - protocol привязка
   - Визуал на blocks view (цветная полоска)
7. **Составной блок на flow canvas** — PlasmidNode показывает subFragments

### Phase C: Flow Canvas polish (2-3 дня)

8. Составной блок как PlasmidNode с мини-полоской
9. Связь flow ↔ assembly: двойной клик product → blocks view
10. PCR Planning Panel с реальными данными

### Phase D: Публикация (1 неделя)

11. Docker Compose + CI
12. README + скриншоты
13. Use case: PglaA→XynTL→TtrpC
14. Bioinformatics / JOSS
