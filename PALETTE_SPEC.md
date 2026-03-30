# BodgeGene — Логика боковой панели и режимов работы

**Дата:** 29 марта 2026  
**Автор:** Игорь Синельников, ФИЦ Биотехнологии РАН  
**Файл кладётся в корень репо — Claude Code читает и реализует.**

---

## 1. Архитектура режимов приложения

### 1.1 Три режима работы

```
┌─────────────────────────────────────────────────────────┐
│                    BodgeGene                             │
│                                                         │
│  ┌──────────┐    ┌──────────────────────────────────┐   │
│  │          │    │                                    │   │
│  │ Palette  │    │          Main Area                 │   │
│  │ (всегда) │    │                                    │   │
│  │          │    │  Режим 1: Canvas (сборка)          │   │
│  │          │    │  Режим 2: PlasmidViewer (модалка)  │   │
│  │          │    │  Режим 3: PlasmidWizard (модалка)  │   │
│  │          │    │                                    │   │
│  └──────────┘    └──────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

**Режим 1: Canvas** — основной рабочий режим.  
Сборка конструкта из фрагментов. Drag-and-drop из палитры.
Генерация праймеров, протокол, экспорт.

**Режим 2: PlasmidViewer** — модальное окно поверх canvas.  
Просмотр плазмиды: карта + аннотации + последовательность.
Read-only. Вход: двойной клик на Part в палитре.

**Режим 3: PlasmidUseWizard** — модальное окно поверх canvas.  
9 операций с плазмидой. Вход: drag плазмиды на canvas.
Результат операции → фрагменты/Part добавляются на canvas или в библиотеку.

### 1.2 Переходы между режимами

```
Палитка                          Canvas
  │                                │
  ├── Drag линейный Part ────────► Добавить на canvas
  │                                │
  ├── Drag плазмиду ─────────────► PlasmidUseWizard (модалка)
  │   (circular + ≥2 regions)      │
  │                                ├── "Посмотреть" ──► PlasmidViewer
  │                                ├── "Использовать" ► на canvas
  │                                ├── "Заменить" ────► backbone на canvas
  │                                ├── "Разобрать" ───► Parts в библиотеку
  │                                ├── "Мутагенез" ───► MutagenesisWizard
  │                                ├── "Вставить" ────► на canvas
  │                                ├── "Удалить" ─────► дочерняя плазмида
  │                                └── "Версии" ──────► PlasmidVersionTree
  │
  ├── Double-click Part ─────────► PlasmidViewer (модалка)
  │
  ├── Click ▶ (expand) ─────────► Info card (inline в палитке)
  │
  └── Click "+ Canvas" ──────────► Добавить на canvas
```

### 1.3 Условие триггера PlasmidUseWizard

```
if (part.topology === 'circular' && getRegions(part.annotations).length >= 2) {
  // Открыть PlasmidUseWizard
} else {
  // Добавить на canvas напрямую (как обычный фрагмент)
}
```

---

## 2. Боковая панель (PartsPalette) — спецификация

### 2.1 Общая структура

```
┌── Библиотека ────────────────────────────┐
│                                           │
│  ┌─ HEADER ─────────────────────────────┐│
│  │ [🔍 Поиск____________] [+Add] [📂]  ││
│  │ [Все ▾] [Коллекция 1 ▾] [+Колл]     ││
│  └──────────────────────────────────────┘│
│                                           │
│  ┌─ ПЛАЗМИДЫ (секция) ─────────────────┐│
│  │ ○ pAN-GFP     5230 bp  5 reg   ···  ││
│  │ ○ pUC19       2686 bp  3 reg   ···  ││
│  │ ○ pET-28a     5369 bp  6 reg   ···  ││
│  └──────────────────────────────────────┘│
│                                           │
│  ┌─ ЗАПЧАСТИ (секции по категориям) ────┐│
│  │                                       ││
│  │ ── Кодирующие ──                      ││
│  │  ▷ GA          1920  CDS              ││
│  │     ├── GA(D36E)     мутагенез        ││
│  │     └── GA_trunc     split            ││
│  │  ▷ eGFP         720  CDS              ││
│  │  ★ mCherry       711  reporter        ││
│  │                                       ││
│  │ ── Регуляторные ──                    ││
│  │  → PglaA         850  promoter        ││
│  │  → T7             20  promoter        ││
│  │  T TtrpC          567  terminator     ││
│  │  T BGH pA         250  terminator     ││
│  │                                       ││
│  │ ── Маркеры ──                         ││
│  │  ■ AmpR           861  marker         ││
│  │  ■ pyrG          1563  marker         ││
│  │                                       ││
│  │ ── Ориджины ──                        ││
│  │  ○ pUC_ori        589  rep_origin     ││
│  │  ○ AMA1          5800  rep_origin     ││
│  │                                       ││
│  │ ── Структурные ──                     ││
│  │  △ glaA_SP         54  signal_pep     ││
│  │  🏷 His6-tag        18  tag            ││
│  │  ⚡ (GGS)3 linker   27  linker        ││
│  │                                       ││
│  │ ── РНК ──                             ││
│  │  〰 sgRNA_target1   20  gRNA          ││
│  │                                       ││
│  └──────────────────────────────────────┘│
│                                           │
│  ┌─ ИНВЕНТАРЬ (физическая ДНК) ─────────┐│
│  │ 🧊 Амплифицированные (3)             ││
│  │  🧪 PCR#1 (GA_fwd)        2100       ││
│  │  🧪 PCR#2 (backbone)      4500       ││
│  │  💊 Plasmid pAN-GFP       5230       ││
│  └──────────────────────────────────────┘│
│                                           │
│  ┌─ FOOTER (добавление) ────────────────┐│
│  │ [📂 Импорт .gb/.dna/.fasta]          ││
│  │ [🧪 Из пробирки / ПЦР-продукта]     ││
│  │ [📋 Извлечь из конструкта]            ││
│  │ [✏️ Вставить последовательность]       ││
│  │ [📦 Полная библиотека →]              ││
│  └──────────────────────────────────────┘│
└───────────────────────────────────────────┘
```

### 2.2 Секция: HEADER

**Поиск** — фильтрует по имени Part (case-insensitive).  
Ищет во всех секциях: плазмиды + запчасти + инвентарь.

**Кнопка [+Add]** — открывает AddFragmentModal в режиме 'library'.

**Кнопка [📂 Import]** — drag-and-drop зона или file picker.
Принимает: .gb, .gbk, .genbank, .dna, .fasta, .fa.
- Фронтенд: .gb/.fasta через genbank-parser.js
- Бэкенд: .dna через FastAPI (BioPython)
- Результат: Part в библиотеку (circular → секция "Плазмиды")

**Коллекции** — фильтр-селектор. "Все" показывает всё.
Коллекция = именованная папка с Part IDs.
Кнопка [+] создаёт новую коллекцию.

### 2.3 Секция: ПЛАЗМИДЫ

**Условие попадания:** `topology === 'circular' && getRegions(annotations).length >= 2`

**Визуал каждой плазмиды:**
```
○ pAN-GFP     5230 bp  5 reg  ···
│                              │
│  ○ = PlasmidGlyph (кольцо)  │
│  5 reg = количество регионов │
│  ··· = кнопка "ещё" (expand) │
```

**Действия:**
- **Клик** → expand: показать список регионов + actions
- **Double-click** → PlasmidViewer (просмотр)
- **Drag на canvas** → PlasmidUseWizard
- **Expand: actions** → [👁 Посмотреть] [+ Canvas] [🔄 Wizard] [📥 Export]

**Expanded view плазмиды:**
```
○ pAN-GFP     5230 bp  5 reg         ▼
  │ → PglaA       promoter     1..850
  │ ▷ GFP         CDS        851..1570
  │ T TtrpC       terminator 1571..2137
  │ ■ AmpR        marker     2138..2998
  │ ○ pUC_ori     rep_origin 2999..5230
  │
  │ [👁 Посмотреть] [🔄 Wizard] [📥 Export .gb]
```

### 2.4 Секция: ЗАПЧАСТИ

**Условие:** всё что НЕ плазмида (линейные Part, или circular с < 2 регионами).

**Группировка по биологическим категориям:**

| Категория | Типы | Иконки |
|-----------|------|--------|
| Кодирующие | CDS, reporter, marker | ▷ ★ ■ |
| Регуляторные | promoter, terminator, enhancer, 5UTR, 3UTR, RBS, Kozak, IRES, polyA_signal, insulator | → T ⌒ |
| Маркеры | marker (вынести отдельно если много) | ■ |
| Ориджины | rep_origin, ARS_CEN | ○ |
| Структурные | signal_peptide, propeptide, tag, linker, T2A, NLS, intron, MCS | △ 🏷 ⚡ |
| РНК | gRNA, ncRNA, aptamer | 〰 |
| Прочее | spacer, misc_feature | ⊡ |

**Student vs Expert mode:**
- Student: показывать только CDS, promoter, terminator, marker, rep_origin, misc_feature
- Expert: все категории
- Переключатель внизу: "🎓 Базовые элементы. Показать все →"

**Визуал каждого Part:**
```
[SBOL_GLYPH] PartName    Length  Type
```
- SBOL глиф = SBOLIcon по типу
- PartName = жирным, truncate если длинное
- Length = серым, п.н.
- Badge с количеством дочерних (если есть)
- Синяя точка если используется в сборке

**Дочерние Part (мутанты, splits):**
Показываются при expand, с tree connectors (├── └──) и derivation иконками.

**Действия (в expanded info card):**
- [+ Canvas] — добавить на canvas как фрагмент
- [✏️ Edit] — открыть в FragmentEditor / PartsLibrary
- [📝 Аннотации] — открыть PartsLibrary с фокусом на аннотации
- [🌳 Версии] — PlasmidVersionTree (если есть parent/children)

### 2.5 Секция: ИНВЕНТАРЬ (физическая ДНК)

Показывается только если есть PCR products или verified plasmids.

**PCR products** — результат ПЦР-амплификации из ProtocolTracker.
Не нуждаются в ПЦР при использовании (needsAmplification: false).
Drag на canvas → добавляются напрямую.

**Verified plasmids** — подтверждённые плазмиды из ProtocolTracker.
Трансформированы и проверены секвенированием.

**Визуал:**
```
🧊 Амплифицированные (3)
  🧪 PCR#1 (GA_fwd)     2100 bp
  🧪 PCR#2 (backbone)   4500 bp
  💊 Plasmid pAN-GFP    5230 bp
```

### 2.6 Секция: FOOTER (добавление)

Четыре способа добавить Part:

1. **📂 Импорт файла** — drag-and-drop или file picker
   - .gb/.gbk/.genbank → фронтенд genbank-parser.js
   - .dna → бэкенд BioPython
   - .fasta/.fa → фронтенд (имя из header, последовательность)
   - Результат → AddFragmentModal с предзаполненными полями

2. **🧪 Из пробирки / ПЦР-продукта** — AddFragmentModal mode='composite'
   - Физически существующий ПЦР-продукт
   - needsAmplification = false

3. **📋 Извлечь из конструкта** — AddFragmentModal mode='construct'
   - Выбрать конструкт из базы
   - Кликнуть на feature → извлечь

4. **✏️ Вставить последовательность** — AddFragmentModal mode='sequence'
   - Ввести имя + последовательность
   - Добавляется на canvas (не в библиотеку!)

5. **📦 Полная библиотека →** — открывает PartsLibrary модалку
   - Таблица всех Part с фильтрами, сортировкой, поиском

---

## 3. Логика drag-and-drop

### 3.1 Что можно перетаскивать

| Источник | DnD type | Что происходит при drop на canvas |
|----------|----------|----------------------------------|
| Part из "Запчасти" | PART | Добавить как фрагмент |
| Плазмида из "Плазмиды" | PART | PlasmidUseWizard |
| PCR product из инвентаря | PART | Добавить как фрагмент (no PCR) |
| Verified plasmid | PART | PlasmidUseWizard |
| Файл из проводника | FILE | Импортировать → AddFragmentModal |

### 3.2 Логика в addFragment (store)

```javascript
addFragment: (part) => {
  // 1. Проверить — это плазмида?
  const regions = getRegions(part.annotations);
  if (part.topology === 'circular' && regions.length >= 2) {
    // Открыть PlasmidUseWizard (НЕ добавлять на canvas)
    set({ pendingPlasmid: part });
    return;
  }
  
  // 2. Обычный Part → добавить на canvas
  pushUndo();
  set(state => {
    const asm = state.assemblies.find(a => a.id === state.activeId);
    asm.fragments.push({
      id: `f${Date.now()}`,
      name: part.name,
      type: part.type,
      sequence: part.sequence,
      length: part.length || part.sequence?.length,
      strand: part.strand || 1,
      needsAmplification: part.needsAmplification !== false,
      partId: part.id,
      annotations: part.annotations,
    });
    asm.calculated = false;
    asm.primers = [];
  });
}
```

---

## 4. Hover tooltip (будущее)

При наведении на Part в палитке (через 300ms):

```
┌── GA (Glucoamylase) ──────────────┐
│ CDS · 1920 bp · A. niger          │
│                                    │
│ [▷▷▷▷▷▷▷▷▷▷▷▷▷▷▷▷▷▷▷▷] CDS      │
│  △SP  ████████████████ ◆tag       │
│                                    │
│ Сильный секретируемый фермент.     │
│ Индуцибельный (мальтоза).          │
│                                    │
│ ATG CGT CTA CTG TCA CTG CTG...     │
│ M   R   L   L   S   L   L  ...    │
│                                    │
│ 🧬 3 мутанта · 📦 в 2 сборках     │
└────────────────────────────────────┘
```

Реализация: через state + debounce, не через CSS :hover 
(нужно отображать сложный контент).

---

## 5. Импорт файлов — drag-and-drop зона

### 5.1 Глобальная drop-зона

Вся область приложения принимает drag файлов из проводника:

```javascript
// В App.jsx
onDragOver={e => { e.preventDefault(); setDragOver(true); }}
onDragLeave={() => setDragOver(false)}
onDrop={e => {
  e.preventDefault();
  setDragOver(false);
  const files = Array.from(e.dataTransfer.files);
  files.forEach(file => handleFileImport(file));
}}
```

### 5.2 handleFileImport(file)

```javascript
async function handleFileImport(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  
  if (['gb', 'gbk', 'genbank'].includes(ext)) {
    const text = await file.text();
    const gb = parseGenBank(text);
    // Открыть AddFragmentModal с предзаполненными данными
    setImportedData(gb);
    setModalMode('library');
  }
  
  if (['fasta', 'fa', 'fna'].includes(ext)) {
    const text = await file.text();
    const { name, sequence } = parseFasta(text);
    setImportedData({ name, sequence });
    setModalMode('library');
  }
  
  if (ext === 'dna') {
    // SnapGene binary → отправить на бэкенд
    const formData = new FormData();
    formData.append('file', file);
    const resp = await fetch('/api/import', { method: 'POST', body: formData });
    const data = await resp.json();
    setImportedData(data);
    setModalMode('library');
  }
}
```

### 5.3 Визуальный индикатор drag

Когда файл перетаскивается над приложением:
```
┌─────────────────────────────────────┐
│                                     │
│     📂 Перетащите файл сюда         │
│                                     │
│     .gb  .dna  .fasta  .gbk        │
│                                     │
└─────────────────────────────────────┘
```
Полупрозрачный overlay поверх всего приложения.

---

## 6. Группировка Part по категориям

### 6.1 Маппинг тип → категория

```javascript
const TYPE_CATEGORIES = {
  // Кодирующие
  CDS: 'coding', gene: 'coding', reporter: 'coding',
  
  // Маркеры (отдельная категория)
  marker: 'markers',
  
  // Регуляторные
  promoter: 'regulatory', terminator: 'regulatory',
  enhancer: 'regulatory', '5UTR': 'regulatory', '3UTR': 'regulatory',
  RBS: 'regulatory', Kozak: 'regulatory', IRES: 'regulatory',
  polyA_signal: 'regulatory', insulator: 'regulatory',
  
  // Ориджины
  rep_origin: 'origins', ARS_CEN: 'origins',
  
  // Структурные
  signal_peptide: 'structural', propeptide: 'structural',
  tag: 'structural', linker: 'structural', T2A: 'structural',
  NLS: 'structural', intron: 'structural', MCS: 'structural',
  
  // Рекомбинационные
  loxP: 'recombination', FRT: 'recombination',
  homology_arm: 'recombination',
  
  // РНК
  gRNA: 'rna', ncRNA: 'rna', aptamer: 'rna',
  
  // Прочее
  spacer: 'other', misc_feature: 'other',
  regulatory: 'regulatory', fusion: 'other',
};

const CATEGORY_ORDER = [
  'coding', 'regulatory', 'markers', 'origins',
  'structural', 'recombination', 'rna', 'other',
];

const CATEGORY_LABELS = {
  coding: 'Кодирующие',
  regulatory: 'Регуляторные',
  markers: 'Маркеры',
  origins: 'Ориджины',
  structural: 'Структурные',
  recombination: 'Рекомбинация',
  rna: 'РНК',
  other: 'Прочее',
};
```

### 6.2 Student mode — скрытые категории

В student mode показываем только:
- coding (CDS)
- regulatory (promoter, terminator)
- markers
- origins
- other (misc_feature)

Скрыты: structural, recombination, rna, enhancer, UTR и т.д.

---

## 7. Полная библиотека (PartsLibrary модалка)

Открывается по кнопке "📦 Полная библиотека →".

Полноэкранная модалка с:
- Таблица всех Part (сортируемая по имени, типу, длине, дате)
- Фильтры по типу, организму, коллекции
- Поиск по имени и описанию
- Для каждого Part: аннотации (AnnotationEditor), последовательность, описание
- Batch operations: удалить, переместить в коллекцию, экспортировать

---

## 8. Связь палитки и canvas

### 8.1 Индикация использования

Part, используемый в текущей сборке → синяя точка справа.
Part, используемый в ДРУГОЙ сборке → серая точка.
Количество сборок в tooltip.

### 8.2 Обратная навигация

Клик на фрагмент на canvas → подсвечивает Part в палитке.
Клик на Part в палитке → подсвечивает фрагмент(ы) на canvas.

### 8.3 Auto-scroll палитки

При добавлении нового Part (импорт, разборка плазмиды) →
палитка скроллится к новому Part и он мигает (highlight animation).

---

## 9. Приоритеты реализации

### Фаза 1 (текущая сессия):
1. ✅ Разделение "Плазмиды" / "Запчасти" в палитке
2. ✅ Группировка запчастей по категориям (TYPE_CATEGORIES)
3. ✅ Expanded view плазмиды (список регионов)
4. Кнопка [📂 Import] с file picker

### Фаза 2 (следующая сессия):
5. Drag-and-drop файлов из проводника
6. Hover tooltip с мини-превью
7. Обратная навигация canvas ↔ палитка
8. Auto-scroll к новым Part

### Фаза 3 (будущее):
9. Полная библиотека (таблица + фильтры + batch)
10. Общие коллекции (shared между пользователями)
11. Онлайн-каталог (AddGene API интеграция)
