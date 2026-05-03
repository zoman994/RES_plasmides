# Задача: Полная библиотека рестриктаз с изошизомерами + анализ сборки

**Дата:** 30 марта 2026
**Адресация:** из CURRENT_TASK.md → "Прочитай docs/TASK_RE_FULL_DB.md"

---

## Часть 1: Расширенная RE база (~200+ ферментов с изошизомерами)

### Файл: `gui/designer/src/restriction-db.js`

Расширить `RE_ENZYMES` до полной библиотеки коммерчески доступных рестриктаз. Включить ВСЕ ферменты из каталогов NEB, Thermo Fisher, Promega.

### Формат записи:

```js
export const RE_ENZYMES = {
  // name: { site, cut: [fwd, rev], end, overhang, temp, buffer, isoschizomers: [], neoschizomers: [], supplier }
  EcoRI: {
    site: 'GAATTC', cut: [1, 5], end: '5prime', overhang: 'AATT',
    temp: 37, buffer: 'CutSmart',
    isoschizomers: ['Eco831I', 'SsoI'],    // режут так же
    neoschizomers: ['MfeI'],                // тот же сайт, другая позиция среза → совместимые концы
    supplier: 'NEB',
  },
  // ...
};
```

### Полный список ферментов для включения:

**6-cutters (самые используемые, ~80 ферментов):**

| Фермент | Сайт | Срез | Концы | Overhang | Изошизомеры |
|---------|------|------|-------|----------|-------------|
| EcoRI | GAATTC | 1/5 | 5' | AATT | Eco831I, SsoI |
| BamHI | GGATCC | 1/5 | 5' | GATC | BstI |
| HindIII | AAGCTT | 1/5 | 5' | AGCT | — |
| XbaI | TCTAGA | 1/5 | 5' | CTAG | — |
| XhoI | CTCGAG | 1/5 | 5' | TCGA | PaeR7I |
| SalI | GTCGAC | 1/5 | 5' | TCGA | — |
| NcoI | CCATGG | 1/5 | 5' | CATG | — |
| NdeI | CATATG | 2/4 | 5' | TA | — |
| PstI | CTGCAG | 5/1 | 3' | TGCA | BspMAI |
| SphI | GCATGC | 5/1 | 3' | CATG | — |
| KpnI | GGTACC | 5/1 | 3' | GTAC | Asp718I |
| SacI | GAGCTC | 5/1 | 3' | AGCT | Ecl136II |
| NheI | GCTAGC | 1/5 | 5' | CTAG | — |
| BglII | AGATCT | 1/5 | 5' | GATC | — |
| ClaI | ATCGAT | 2/4 | 5' | CG | BspDI, BanIII |
| MfeI | CAATTG | 1/5 | 5' | AATT | MunI |
| AgeI | ACCGGT | 1/5 | 5' | CCGG | PinAI |
| SpeI | ACTAGT | 1/5 | 5' | CTAG | — |
| AvrII | CCTAGG | 1/5 | 5' | CTAG | BlnI |
| BclI | TGATCA | 1/5 | 5' | GATC | — |
| MluI | ACGCGT | 1/5 | 5' | CGCG | — |
| NruI | TCGCGA | 3/3 | blunt | — | — |
| ScaI | AGTACT | 3/3 | blunt | — | — |
| AflII | CTTAAG | 1/5 | 5' | TTAA | BfrI |
| ApaI | GGGCCC | 5/1 | 3' | GGCC | — |
| BspEI | TCCGGA | 1/5 | 5' | CCGG | Kpn2I, BsuEII |
| BsrGI | TGTACA | 1/5 | 5' | GTAC | — |
| BstBI | TTCGAA | 2/4 | 5' | CG | — |
| BstEII | GGTNACC | 1/6 | 5' | GTNAC | — |
| DraI | TTTAAA | 3/3 | blunt | — | — |
| EagI | CGGCCG | 1/5 | 5' | GGCC | EclXI |
| Eco53kI | GAGCTC | 3/3 | blunt | — | — |
| EcoNI | CCTNNNNNAGG | 5/6 | 5' | — | — |
| EcoRV | GATATC | 3/3 | blunt | — | — |
| HincII | GTYRAC | 3/3 | blunt | — | HindII |
| HpaI | GTTAAC | 3/3 | blunt | — | — |
| MscI | TGGCCA | 3/3 | blunt | — | BalI |
| NarI | GGCGCC | 2/4 | 5' | CG | KasI, SfoI |
| PmlI | CACGTG | 3/3 | blunt | — | — |
| PpuMI | RGGWCCY | 2/5 | 5' | — | — |
| PvuI | CGATCG | 4/2 | 3' | AT | — |
| PvuII | CAGCTG | 3/3 | blunt | — | — |
| SacII | CCGCGG | 4/2 | 3' | GC | — |
| SmaI | CCCGGG | 3/3 | blunt | — | XmaI (1/5, 5') |
| SnaBI | TACGTA | 3/3 | blunt | — | — |
| StuI | AGGCCT | 3/3 | blunt | — | — |
| StyI | CCWWGG | 1/5 | 5' | CWWG | — |
| XmaI | CCCGGG | 1/5 | 5' | CCGG | — (SmaI — блант изошизомер) |
| XmnI | GAANNNNTTC | 5/5 | blunt | — | — |

**8-cutters (rare cutters):**

| Фермент | Сайт | Срез | Концы | Overhang | Изошизомеры |
|---------|------|------|-------|----------|-------------|
| NotI | GCGGCCGC | 2/6 | 5' | GGCC | — |
| AscI | GGCGCGCC | 2/6 | 5' | CGCG | — |
| FseI | GGCCGGCC | 6/2 | 3' | CCGG | — |
| PacI | TTAATTAA | 5/3 | 3' | AT | — |
| SbfI | CCTGCAGG | 6/2 | 3' | TGCA | Sse8387I |
| SwaI | ATTTAAAT | 4/4 | blunt | — | SmiI |
| SgrAI | CRCCGGYG | 2/6 | 5' | RCCGGY | — |
| AsiSI | GCGATCGC | 5/3 | 3' | AT | — |
| SfiI | GGCCNNNNNGGCC | 8/5 | 3' | NNN | — |
| PmeI | GTTTAAAC | 4/4 | blunt | — | MssI |

**Methylation-sensitive (часто нужны для клонирования из геномной ДНК):**

| Фермент | Сайт | Примечание |
|---------|------|------------|
| DpnI | GATC (met) | Режет ТОЛЬКО метилированную ДНК (dam+). Ключевой для KLD/QuikChange. |
| DpnII | GATC | Режет НЕметилированную. Изошизомер MboI. |
| MboI | GATC | Режет НЕметилированную. Изошизомер DpnII. |

### Функции для экспорта:

```js
/** Поиск по имени, сайту, или овехенгу */
export function searchRE(query) { ... }

/** Найти ферменты с совместимыми концами (тот же overhang + тот же тип конца) */
export function getCompatible(enzymeName) { ... }

/** Найти все изошизомеры и неошизомеры данного фермента */
export function getIsoschizomers(enzymeName) { ... }

/** Проверить есть ли сайт фермента в последовательности (обе цепи) */
export function findSitesInSequence(enzymeName, sequence) {
  // Вернуть: [{ position, strand: '+'/'-' }]
}

/** Проверить есть ли сайты фермента в ЛЮБОМ фрагменте сборки */
export function checkAssemblyForSites(enzymeName, fragments) {
  // Вернуть: [{ fragmentName, fragmentIndex, sites: [{position, strand}] }]
  // Пустой массив = фермент безопасен
}
```

---

## Часть 2: Анализ наличия RE сайтов в сборке + предупреждение

### Логика:

Когда пользователь выбирает рестриктазу в JunctionBlock popup (тип RE/Лигирование):
1. Вызвать `checkAssemblyForSites(selectedEnzyme, fragments)`
2. Если сайты найдены → показать предупреждение

### UI предупреждения в JunctionBlock popup:

```jsx
// После выбора фермента в dropdown:
{selectedEnzyme && internalSites.length > 0 && (
  <div className="bg-red-50 border border-red-200 rounded-lg p-2 mt-2 text-[10px]">
    <div className="font-semibold text-red-700 mb-1">
      ⚠️ {selectedEnzyme} сайт найден внутри сборки!
    </div>
    {internalSites.map((hit, i) => (
      <div key={i} className="text-red-600">
        {hit.fragmentName}: {hit.sites.length} сайт(ов) — позиции: {hit.sites.map(s => s.position).join(', ')}
      </div>
    ))}
    <div className="text-red-500 mt-1">
      Рестрикция разрежет фрагменты. Используйте другой фермент или проверьте совместимость.
    </div>
  </div>
)}
```

### Как получить fragments в JunctionBlock:

В JunctionBlock уже есть props `leftFrag` и `rightFrag`. Но для проверки нужны ВСЕ фрагменты сборки.

Два варианта:
1. Добавить prop `allFragments` в JunctionBlock
2. Использовать `useStore(s => s.assemblies.find(...)?.fragments)` напрямую из store

Вариант 2 проще — JunctionBlock уже импортирует useStore.

```js
// В JunctionBlock.jsx:
const fragments = useStore(s => {
  const asm = s.assemblies.find(a => a.id === s.activeId);
  return asm?.fragments || [];
});

// При выборе RE:
const internalSites = useMemo(() => {
  if (!j.reEnzyme) return [];
  return checkAssemblyForSites(j.reEnzyme, fragments);
}, [j.reEnzyme, fragments]);
```

### Также показывать в dropdown:

В списке ферментов в dropdown — пометить те что присутствуют в сборке:

```jsx
{reResults.map(([name, info]) => {
  const hasInternal = fragments.some(f =>
    f.sequence && f.sequence.toUpperCase().includes(info.site)
  );
  return (
    <div className={`... ${hasInternal ? 'bg-red-50' : ''}`}>
      <span>{name}</span>
      {hasInternal && <span className="text-[8px] text-red-500 ml-auto">⚠ в сборке</span>}
    </div>
  );
})}
```

---

## Часть 3: Аналогичная проверка для Golden Gate

Для Golden Gate уже есть `checkInternalSites()` в `golden-gate.js`. Убедиться что:
1. При выборе GG enzyme → автоматически проверяются internal sites
2. Предупреждение показывается если recognition site есть внутри фрагментов
3. Это уже частично реализовано — проверить и починить если сломано

---

## Тесты

```js
// restriction-db.test.js
describe('restriction-db', () => {
  it('contains 80+ enzymes', () => {
    expect(Object.keys(RE_ENZYMES).length).toBeGreaterThanOrEqual(80);
  });
  
  it('searchRE finds by name', () => {
    expect(searchRE('Eco').map(([n]) => n)).toContain('EcoRI');
  });
  
  it('searchRE finds by site', () => {
    expect(searchRE('GAATTC').map(([n]) => n)).toContain('EcoRI');
  });
  
  it('getCompatible finds MfeI for EcoRI', () => {
    expect(getCompatible('EcoRI')).toContain('MfeI');
  });
  
  it('getIsoschizomers returns known isoschizomers', () => {
    const iso = getIsoschizomers('EcoRI');
    expect(iso.isoschizomers).toContain('Eco831I');
    expect(iso.neoschizomers).toContain('MfeI');
  });
  
  it('findSitesInSequence detects EcoRI in sequence', () => {
    const sites = findSitesInSequence('EcoRI', 'ATGCGAATTCGATCG');
    expect(sites.length).toBe(1);
    expect(sites[0].position).toBe(4);
  });
  
  it('findSitesInSequence checks reverse complement', () => {
    const sites = findSitesInSequence('EcoRI', 'ATGCGATCGAATTCGATCG');
    expect(sites.length).toBeGreaterThanOrEqual(1);
  });
  
  it('checkAssemblyForSites warns about internal sites', () => {
    const frags = [
      { name: 'frag1', sequence: 'ATGCGAATTCGATCG' },
      { name: 'frag2', sequence: 'ATGCGATCGATCG' },
    ];
    const hits = checkAssemblyForSites('EcoRI', frags);
    expect(hits.length).toBe(1);
    expect(hits[0].fragmentName).toBe('frag1');
  });
  
  it('does not include Type IIS enzymes', () => {
    expect(RE_ENZYMES['BsaI']).toBeUndefined();
    expect(RE_ENZYMES['BpiI']).toBeUndefined();
    expect(RE_ENZYMES['BsmBI']).toBeUndefined();
  });
});
```
