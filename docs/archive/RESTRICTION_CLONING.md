# RESTRICTION_CLONING.md — Restriction enzyme sites + restriction cloning

**Статус:** Фаза 1 (Блок 4a: RE на карте) = ✅ РЕАЛИЗОВАНО (02.04.2026). Фаза 2 (Блок 4b: restriction cloning → canvas) = ✅ РЕАЛИЗОВАНО (03.04.2026).  
**Дата спеки:** 1 апреля 2026 (v2)  
**Приоритет:** Критичный — операция #1 в молекулярной биологии

---

## 1. Архитектурный принцип

**Restriction cloning = 2-fragment assembly с ligation junctions на существующем canvas.**

Не отдельный workflow. Результат restriction cloning — два фрагмента (linearized backbone + insert) с junction type `'ligation'`. Primer design, protocol export, completeAssembly(), Flow Canvas — всё работает через существующую инфраструктуру.

```
Gibson:       [Backbone PCR]─overlap─[Insert PCR]     → primers: bind + overlap tail
Golden Gate:  [Backbone PCR]─gg_overhang─[Insert PCR] → primers: bind + TypeIIS tail
Restriction:  [Backbone digest]─ligation─[Insert PCR] → primers: bind + RE_site tail
                                                         backbone: needsAmplification=false
```

---

## 2. Фаза 1: RE-сайты на карте (отображение)

### 2.1 Сканирование: расширить findSitesInSequence()

Существующий `findSitesInSequence()` в restriction-db.js уже корректно обрабатывает обе цепи и palindromic сайты. НЕ дублировать логику. Добавить:

**a) Circular wrap-around fix:**
```js
// В findSitesInSequence() или обёртке scanAllSites():
const MAX_SITE_LEN = 13; // SfiI = GGCCNNNNNGGCC
const searchSeq = circular
  ? seq + seq.slice(0, MAX_SITE_LEN)
  : seq;
// После поиска: отфильтровать позиции >= seqLen (дубли от wrap-around)
// НО сохранить сайт если он НАЧИНАЕТСЯ < seqLen (пересекает origin)
```

**b) Обёртка scanAllSites():**
```js
export function scanAllSites(sequence, options = {}) {
  const { circular = false, minSiteLen = 6, enzymes = null } = options;
  const allEnzymes = { ...RE_ENZYMES };  // НЕ включать Type IIS по умолчанию
  const results = [];

  for (const [name, info] of Object.entries(allEnzymes)) {
    if (enzymes && !enzymes.includes(name)) continue;
    if (info.site.replace(/[^ATGC]/g, '').length < minSiteLen) continue;

    const sites = findSitesInSequence(name, circular ? seq + seq.slice(0, MAX_SITE_LEN) : sequence);
    // Filter wrap-around duplicates
    const filtered = sites.filter(s => s.position < sequence.length);

    if (filtered.length > 0) {
      results.push({
        enzyme: name,
        ...info,                    // site, cut, end, overhang, buffer, temp
        positions: filtered,
        cutCount: filtered.length,
        isUnique: filtered.length === 1,
      });
    }
  }
  return results;
}
```

**c) MCS auto-detection:**
```js
export function detectMCS(sites, seqLen, windowSize = 200) {
  // Собрать позиции unique cutters
  const uniquePositions = sites
    .filter(s => s.isUnique)
    .flatMap(s => s.positions.map(p => p.position));

  if (uniquePositions.length < 4) return null;

  // Sliding window: найти окно с max unique sites
  uniquePositions.sort((a, b) => a - b);
  let bestStart = 0, bestCount = 0;
  for (let i = 0; i < uniquePositions.length; i++) {
    let count = 1;
    for (let j = i + 1; j < uniquePositions.length && uniquePositions[j] - uniquePositions[i] < windowSize; j++) {
      count++;
    }
    if (count > bestCount) { bestCount = count; bestStart = uniquePositions[i]; }
  }
  if (bestCount >= 4) {
    return { start: bestStart, end: bestStart + windowSize, siteCount: bestCount };
  }
  return null;
}
```

### 2.2 PlasmidMap: tick marks

На SVG круговой карте, СНАРУЖИ кольца feature arcs:

```
Tick mark properties:
- Позиция: angle = (site.position / seqLen) * TAU
- Радиус: outerR + 4 → outerR + 16 (unique), outerR + 12 (2x), outerR + 8 (3+)
- Цвет: unique = красный (#E24B4A), 2-cut = оранжевый (#EF9F27), 3+ = серый (#888780)
- Ширина: 1.5px (unique), 1px (2-cut), 0.5px (3+)
- Label: имя фермента, only for unique cutters, размещён radially
- MCS region: дуга подсветки на outerR + 20, полупрозрачная

Hover: tooltip с { enzyme, position, site, overhang, end, buffer, temp }
Click: popup с детальной информацией + кнопки действий
```

**Label collision avoidance:** Если два unique сайта ближе 15° на карте — показать только один label, второй в tooltip. Или сгруппировать: "EcoRI, BamHI" на одном выносе.

### 2.3 SequenceMapView: cut position markers

Между sense и antisense цепями:

```
  1  G A A T T C G G A T C C A T A T G
     ▼                                    ← cut position top strand
     EcoRI                                ← enzyme name (small, below)
     ▲                                    ← cut position bottom strand
     C T T A A G C C T A G G T A T A C

Hover: подсветить весь recognition site (background color)
```

Для не-palindromic сайтов: ▼ и ▲ на разных горизонтальных позициях (staggered cut).

### 2.4 Фильтры RE-сайтов

Store state:
```js
// В restriction slice или UI state
showReSites: false,           // master toggle
reFilter: 'unique',           // 'unique' | 'double' | 'all'
reMinSiteLen: 6,              // 4, 5, 6, 8
reHighlightEnzyme: null,      // подсвечен на карте
reSelectedPair: [null, null], // для restriction cloning
```

UI: toggle-кнопка "RE" в toolbar PlasmidViewer / PlasmidUseWizard. При нажатии → показать tick marks + панель списка.

### 2.5 RE site click popup

```
┌─ EcoRI ────────────────────────────────┐
│ Позиция: 342                           │
│ Сайт: G▼AATTC                         │
│       CTTAA▲G                          │
│ Концы: 5' overhang AATT (4 nt)        │
│ Буфер: CutSmart, 37°C                 │
│ Unique cutter ✓                        │
│                                         │
│ Compatible: MfeI (тот же overhang)     │
│                                         │
│ [🔪 Линейризовать]  [🔪 Парный разрез] │
└─────────────────────────────────────────┘
```

"Линейризовать" → single cut → backbone на canvas.
"Парный разрез" → выбор второго фермента → restriction cloning wizard.

---

## 3. Фаза 2: Restriction cloning → canvas

### 3.1 Новый junction type: 'ligation'

```js
// В assembly model (junctions)
{
  type: 'ligation',          // alongside 'overlap', 'golden_gate'
  enzyme: 'EcoRI',
  overhang: 'AATT',
  overhangType: '5prime',    // '5prime' | '3prime' | 'blunt'
  compatible: true,           // overhangs match
  siteDestroyed: false,       // true if compatible-but-different enzymes (BamHI+BglII)
}
```

### 3.2 digest(plasmid, enzyme1, enzyme2?)

```js
/**
 * Digest a circular plasmid. Returns backbone + excised fragment.
 *
 * CRITICAL: overhang handling.
 * При 5' overhang (EcoRI: G|AATTC, cut [1,5]):
 *   Top strand cut after pos 1 → backbone ends with 5'-...G-3'
 *   Bottom strand cut after pos 5 → backbone has 3'-CTTAA...-5'
 *   Result: 5' ss overhang AATT on backbone left end
 *
 * При лигировании: overhang НЕ дублируется.
 * Backbone ...G + insert AATTC... → junction = GAATTC (RE site restored)
 * Овerhang — это ОБЩАЯ часть, не добавка.
 */
export function digest(sequence, annotations, enzyme1, enzyme2 = null) {
  const info1 = RE_ENZYMES[enzyme1];
  if (!info1) return { error: `Unknown enzyme: ${enzyme1}` };

  const sites1 = findSitesInSequence(enzyme1, sequence);
  if (sites1.length !== 1) {
    return { error: `${enzyme1} cuts ${sites1.length}× (need unique cutter)` };
  }

  if (!enzyme2) {
    // Single enzyme → linearize
    const cutPos = sites1[0].position + info1.cut[0]; // top strand cut
    const backbone = sequence.slice(cutPos) + sequence.slice(0, cutPos);
    const backboneAnnotations = shiftAnnotations(annotations, -cutPos, sequence.length);
    return {
      type: 'linearize',
      backbone: {
        sequence: backbone,
        annotations: backboneAnnotations,
        length: backbone.length,
        leftEnd: computeEnd(info1, 'left'),
        rightEnd: computeEnd(info1, 'right'),
      },
      excised: null,
      enzymes: [{ name: enzyme1, position: sites1[0].position, ...info1 }],
      selfLigationRisk: true, // same ends → can self-ligate
    };
  }

  // Two enzymes → excise
  const info2 = RE_ENZYMES[enzyme2];
  if (!info2) return { error: `Unknown enzyme: ${enzyme2}` };

  const sites2 = findSitesInSequence(enzyme2, sequence);
  if (sites2.length !== 1) {
    return { error: `${enzyme2} cuts ${sites2.length}× (need unique cutter)` };
  }

  const cut1 = sites1[0].position + info1.cut[0];
  const cut2 = sites2[0].position + info2.cut[0];

  // Order cuts (clockwise on circular map)
  let leftCut, rightCut, leftInfo, rightInfo, leftName, rightName;
  if (cut1 < cut2) {
    [leftCut, rightCut, leftInfo, rightInfo, leftName, rightName] = [cut1, cut2, info1, info2, enzyme1, enzyme2];
  } else {
    [leftCut, rightCut, leftInfo, rightInfo, leftName, rightName] = [cut2, cut1, info2, info1, enzyme2, enzyme1];
  }

  const excisedSeq = sequence.slice(leftCut, rightCut);
  const backboneSeq = sequence.slice(rightCut) + sequence.slice(0, leftCut);

  return {
    type: 'excise',
    backbone: {
      sequence: backboneSeq,
      length: backboneSeq.length,
      leftEnd: computeEnd(rightInfo, 'left'),   // right cut → backbone left end
      rightEnd: computeEnd(leftInfo, 'right'),   // left cut → backbone right end
      leftEnzyme: rightName,
      rightEnzyme: leftName,
    },
    excised: {
      sequence: excisedSeq,
      length: excisedSeq.length,
    },
    enzymes: [
      { name: leftName, position: leftCut, ...leftInfo },
      { name: rightName, position: rightCut, ...rightInfo },
    ],
    isDirectional: enzyme1 !== enzyme2,
    selfLigationRisk: enzyme1 === enzyme2, // same enzyme → can self-ligate
  };
}
```

### 3.3 Биологические проверки

```js
/**
 * Check if two enzymes can be used in a double digest.
 */
export function checkDoubleDigest(enzyme1, enzyme2) {
  const info1 = RE_ENZYMES[enzyme1];
  const info2 = RE_ENZYMES[enzyme2];
  if (!info1 || !info2) return { ok: false, error: 'Unknown enzyme' };

  const sameBuffer = info1.buffer === info2.buffer;
  const sameTemp = info1.temp === info2.temp;

  return {
    simultaneous: sameBuffer && sameTemp,
    buffer: sameBuffer ? info1.buffer : `Sequential: ${info1.buffer} → ${info2.buffer}`,
    temp: sameTemp ? `${info1.temp}°C` : `${info1.temp}°C → ${info2.temp}°C`,
    warnings: [
      ...(sameBuffer ? [] : ['Разные буферы → sequential digest']),
      ...(sameTemp ? [] : ['Разные температуры → sequential digest']),
      ...(info1.damSensitive ? [`${enzyme1}: Dam-чувствителен`] : []),
      ...(info2.damSensitive ? [`${enzyme2}: Dam-чувствителен`] : []),
    ],
  };
}

/**
 * Check insert for internal RE sites.
 * Returns warnings + alternative enzymes with same overhang.
 */
export function checkInsertSites(insertSeq, enzyme1, enzyme2) {
  const warnings = [];
  for (const enz of [enzyme1, enzyme2].filter(Boolean)) {
    const sites = findSitesInSequence(enz, insertSeq);
    if (sites.length > 0) {
      const alts = getCompatible(enz); // same overhang, different site
      warnings.push({
        enzyme: enz,
        count: sites.length,
        positions: sites.map(s => s.position),
        level: 'error',
        message: `Insert содержит ${enz}-сайт (${sites.length}×)! Будет разрезан.`,
        alternatives: alts.filter(alt => findSitesInSequence(alt, insertSeq).length === 0),
      });
    }
  }
  return warnings;
}

/**
 * Check reading frame for CDS insert.
 * RE site at junction adds N nucleotides. Check if in-frame.
 */
export function checkReadingFrame(vectorCutPos, insertStartsWithATG, enzyme) {
  const info = RE_ENZYMES[enzyme];
  if (!info) return null;

  // Nucleotides added by RE site between vector ATG and insert start
  const addedBases = info.cut[0]; // bases from RE site before cut on top strand
  const inFrame = addedBases % 3 === 0;

  // Special cases: NdeI/NcoI contain ATG
  const containsATG = info.site.includes('ATG');

  return {
    addedBases,
    inFrame,
    containsATG,
    warning: !inFrame ? `${enzyme} добавляет ${addedBases} п.н. → СДВИГ РАМКИ` : null,
    tip: containsATG ? `${enzyme} содержит ATG — можно использовать как старт-кодон` : null,
  };
}
```

### 3.4 Primer design для restriction cloning

Интеграция с `local-primer-design.js`:

```js
// При junction type 'ligation':
// tail = protective bases + RE recognition site

function generateRETail(enzymeName) {
  const info = RE_ENZYMES[enzymeName];
  if (!info) return '';

  const flanking = info.minFlanking || 2; // default 2 extra bases
  const protectiveBases = 'GC'.repeat(Math.ceil(flanking / 2)).slice(0, flanking);

  return protectiveBases + info.site;
  // Example: EcoRI → "GCGAATTC" (2bp protective + GAATTC)
  // Example: NotI → "GCGCGCGCGGCCGC" (6bp protective + GCGGCCGC)
}
```

Добавить поле `minFlanking` в restriction-db.js для ключевых ферментов:
```js
EcoRI: { ..., minFlanking: 1 },   // NEB: 1+ extra base
BamHI: { ..., minFlanking: 4 },   // NEB: 4+ extra bases
NotI:  { ..., minFlanking: 6 },   // NEB: 6+ extra bases
// Default: 2 if not specified
```

### 3.5 Wizard: режим "Рестрикционное клонирование"

Новый режим в PlasmidUseWizard (id: 'restriction_cloning'):

**Шаг 1: Выбор ферментов**
- RE-сайты показаны на карте (tick marks)
- MCS подсвечен если обнаружен
- Список: unique 6+ cutters, sorted by: in MCS → unique → CutSmart
- Клик на фермент → подсветка на карте + показать позицию разреза
- Клик на второй → показать excised fragment + backbone
- checkDoubleDigest() → warnings

**Шаг 2: Выбор insert**
- "Из библиотеки" → PartsPicker с фильтром
- "Вставить последовательность" → textarea
- "Потом добавлю" → placeholder fragment (можно заменить позже)
- checkInsertSites() → warnings + alternatives
- checkReadingFrame() → frame warning/tip

**Шаг 3: Preview + confirm**
- Backbone: N bp, enzyme1 overhang | enzyme2 overhang
- Insert: N bp + RE-тейлы на праймерах
- Warnings (если есть)
- Protocol summary
- [Создать на canvas]

**Шаг 4 (автоматически):**
- Создать 2 фрагмента на canvas:
  - Backbone: `needsAmplification: false`, sequence = digested backbone
  - Insert: `needsAmplification: true`, sequence = insert без RE-тейлов
- Создать 2 junction: `type: 'ligation'`, enzyme + overhang
- Запустить primer design для insert
- Protocol = digest + PCR + digest PCR + ligate

### 3.6 Protocol template для restriction cloning

```
RESTRICTION CLONING PROTOCOL
═══════════════════════════════

Vector: {vectorName} ({vectorLength} bp)
Insert: {insertName} ({insertLength} bp)
Enzymes: {enzyme1} + {enzyme2}
Product: {productName} ({productLength} bp, circular)

1. VECTOR DIGEST
   Digest {vectorName} with {enzyme1} + {enzyme2}
   Buffer: {buffer}, Temperature: {temp}°C
   Time: 1-2 hours
   {sequentialNote}
   Optional: Gel-purify backbone ({backboneLength} bp)

2. INSERT PREPARATION
   Option A: PCR with RE-tailed primers
     Fwd: 5'-{fwdTail}{fwdBinding}-3' (Tm={fwdTm}°C)
     Rev: 5'-{revTail}{revBinding}-3' (Tm={revTm}°C)
     Then digest PCR product with {enzyme1} + {enzyme2} (1h, {temp}°C)

   Option B: Digest insert from source plasmid
     {subcloning instructions if applicable}

3. LIGATION
   Mix: backbone (50 ng) + insert (3:1 molar ratio)
   T4 DNA Ligase, 16°C overnight (or 25°C 10 min for quick ligase)
   {selfLigationNote}

4. TRANSFORMATION
   Transform into competent cells ({organism})
   Plate on {selectionMarker} selection
   Expected colonies: {estimate}
```

---

## 4. Данные: расширение restriction-db.js

Добавить поля (обратно совместимо, существующий код не ломается):

```js
EcoRI: {
  // ...existing fields...
  minFlanking: 1,         // NEW: min extra bases for efficient cutting
  damSensitive: false,    // NEW: blocked by Dam methylation?
  dcmSensitive: false,    // NEW: blocked by Dcm methylation?
  heatInactivation: '65°C/20min', // NEW: for sequential digest
},
ClaI: {
  // ...existing...
  damSensitive: true,     // GATCGAT context
  heatInactivation: '65°C/20min',
},
BclI: {
  // ...existing...
  damSensitive: true,     // TGATCA — always Dam-sensitive
},
XbaI: {
  // ...existing...
  damSensitive: true,     // TCTAGATC context
},
```

Добавить таблицу compatible overhangs:

```js
export const COMPATIBLE_OVERHANGS = {
  'GATC_5prime': ['BamHI', 'BglII', 'BclI', 'MboI', 'DpnII'],
  'CTAG_5prime': ['XbaI', 'NheI', 'SpeI', 'AvrII'],
  'TCGA_5prime': ['XhoI', 'SalI'],
  'AATT_5prime': ['EcoRI', 'MfeI'],
  'CCGG_5prime': ['AgeI', 'BspEI', 'XmaI'],
  'CG_5prime':   ['ClaI', 'NarI', 'BstBI'],
  'GGCC_5prime': ['NotI', 'EagI'],
  'GGCC_3prime': ['ApaI', 'FseI'],  // NB: 3' overhang! NOT compatible with 5' GGCC
  'blunt':       ['EcoRV', 'SmaI', 'NruI', 'ScaI', 'StuI', 'HpaI', 'DraI', 'PvuII', 'HincII', 'MscI', 'PmlI', 'SnaBI', 'SwaI', 'PmeI'],
};

// IMPORTANT: 5' and 3' overhangs are NOT compatible even if same sequence!
// NcoI (5' CATG) ≠ SphI (3' CATG)
```

---

## 5. Чего НЕ делать

1. **Не создавать отдельный restriction-scanner.js** — расширить restriction-db.js: добавить `scanAllSites()` и `detectMCS()` туда же.
2. **Не менять findSitesInSequence()** — обернуть в scanAllSites() с circular fix.
3. **Не менять canvas model** — добавить junction type 'ligation', не трогать overlap/GG.
4. **Не менять local-primer-design.js binding logic** — только добавить RE-tail mode.
5. **Не делать partial digest.** Только complete digest с unique cutters.
6. **Не делать multi-fragment restriction ligation.** Только vector + 1 insert.
7. **Не симулировать гель.** Фаза 3.
8. **Не включать Type IIS в RE site display.** Они для Golden Gate, не для restriction cloning.

---

## 6. Фазы реализации

### Фаза 1: RE-сайты на карте (Блок 4a)

1. `restriction-db.js`: добавить damSensitive, minFlanking, heatInactivation, COMPATIBLE_OVERHANGS
2. `restriction-db.js`: добавить scanAllSites() + detectMCS()
3. Store: showReSites, reFilter, reHighlightEnzyme
4. PlasmidMap.jsx: ReSiteLayer (tick marks, labels, hover, click)
5. SequenceMapView.jsx: RE cut markers (▼▲)
6. PlasmidViewer / PlasmidUseWizard: RE filter panel + toggle

### Фаза 2: Restriction cloning (Блок 4b)

7. `restriction-db.js`: digest(), checkDoubleDigest(), checkInsertSites(), checkReadingFrame()
8. Assembly model: junction type 'ligation'
9. PlasmidUseWizard: режим 'restriction_cloning' (3 шага)
10. local-primer-design.js: RE-tail mode (generateRETail)
11. protocol-data.js: restriction cloning template
12. completeAssembly: обработка ligation junctions

### Фаза 3: Polish (позже)

13. Smart RE pair suggestions (MCS-aware)
14. Compatible pair warnings ("сайт уничтожен после лигирования")
15. Self-ligation warning + CIP/SAP suggestion
16. Subcloning (dual plasmid view)
17. Gel preview
