# BLOCK2_TOOLBAR_CONTEXT.md — Toolbar Redesign + Context Menu Operations

**Дата:** 1 апреля 2026  
**Зависит от:** CURRENT_TASK.md (Блок 1: bugfixes + unified annotations)  
**Статус:** Готов к реализации после Блока 1

---

## Суть

Глобальный toolbar перегружен. Операции, которые относятся к конкретному фрагменту (мутагенез, замена, добавление тега), живут в хедере вместо того, чтобы быть на расстоянии правого клика. Блок 2 переносит всё контекстное в ContextMenu фрагмента, а toolbar оставляет только глобальные панели и настройки.

---

## 1. Что убрать из header (App.jsx)

### 1.1 Глобальный переключатель метода сборки

**Удалить:**
```jsx
// ❌ Весь блок (App.jsx, ~15 строк в header):
<span className="text-xs text-gray-400">Метод:</span>
<button onClick={() => setAssemblyType('overlap')} ...>Overlap / Gibson</button>
<button onClick={() => setAssemblyType('golden_gate')} ...>Golden Gate</button>
// + GG enzyme selector
```

**Причина:** Тип сборки теперь per-junction. Каждый JunctionBlock имеет свой тип: overlap, golden_gate, re_ligation, kld. Глобальный переключатель создаёт конфликт с per-junction настройками.

### 1.2 Кнопка "Мутагенез"

**Удалить:**
```jsx
// ❌ Кнопка Мутагенез из header:
<button onClick={() => setShowMutagenesis(true)} ...>🔬 Mutagenesis</button>
```

**Причина:** Мутагенез — операция над конкретным CDS-фрагментом. Переносится в контекстное меню.

### 1.3 `{expertMode && ...}` обёртки

**Удалить все проверки** — expertMode = always ON (решение от 31.03.2026).

### 1.4 Что остаётся в header

```
🧬 BodgeGene  [↶ ↷]  |  📦 Parts  📋 Oligos  💾 Data  |  [Phusion/Q5 ▼]  Pfx: [IS]  |  Clear
```

7 элементов вместо 11. Справа — настройки праймеров (polymerase + prefix), слева — панели + данные.

---

## 2. Новое контекстное меню PartBlock

### 2.1 Структура: items зависят от fragment.type

```js
// PartBlock.jsx → onContextMenu handler

function getContextMenuItems(fragment, index, handlers) {
  const isCDS = ['CDS', 'gene', 'marker', 'reporter'].includes(fragment.type);
  const isRegulatory = ['promoter', 'terminator', 'regulatory', 'enhancer'].includes(fragment.type);
  const isPlasmid = fragment.topology === 'circular' && 
    getRegions(fragment.annotations).length >= 2;
  
  const items = [
    // ═══ Общие для всех ═══
    { icon: '📋', label: 'Копировать последовательность', 
      onClick: () => navigator.clipboard.writeText(fragment.sequence || ''),
      shortcut: 'Ctrl+C' },
    { divider: true },
    
    // ═══ Редактирование ═══
    { icon: '✏️', label: 'Редактировать', 
      onClick: () => handlers.onEdit(index), shortcut: 'E / dbl-click' },
    { icon: '✂️', label: 'Разрезать', 
      onClick: () => handlers.onSplit(index) },
    { icon: '↻', label: 'Перевернуть (RC)', 
      onClick: () => handlers.onFlip(index), shortcut: 'R' },
    { divider: true },
    
    // ═══ CDS-specific: мутагенез и модификации ═══
    ...(isCDS ? [
      { icon: '🧬', label: 'Точечная мутация...', 
        onClick: () => handlers.onPointMutation(index),
        description: 'Выбрать АК → замена' },
      { icon: '🔬', label: 'Мутагенез (wizard)...', 
        onClick: () => handlers.onMutagenesisWizard(index),
        description: 'Несколько мутаций, стратегия' },
      { icon: '🏷️', label: 'Добавить тег/fusion...', 
        onClick: () => handlers.onAddTag(index),
        description: 'His6, FLAG, MBP, TEV...' },
    ] : []),
    
    // ═══ Замена (для всех типов) ═══
    { icon: '🔄', label: `Заменить${isRegulatory ? ` ${fragment.type}` : ''}...`, 
      onClick: () => handlers.onReplace(index, fragment.type),
      description: 'Выбрать из библиотеки' },
    
    // ═══ Плазмида: операции с кассетами ═══
    ...(isPlasmid ? [
      { divider: true },
      { icon: '🔄', label: 'Заменить кассету...', 
        onClick: () => handlers.onReplaceCassette(index) },
      { icon: '➕', label: 'Вставить элемент...', 
        onClick: () => handlers.onInsertElement(index) },
      { icon: '🗑', label: 'Удалить регион...', 
        onClick: () => handlers.onDeleteRegion(index) },
      { icon: '🌳', label: 'Дерево версий', 
        onClick: () => handlers.onVersionTree(fragment.partId || fragment.id) },
    ] : []),
    
    { divider: true },
    
    // ═══ Библиотека и удаление ═══
    { icon: '📦', label: 'Сохранить в библиотеку', 
      onClick: () => handlers.onSaveToLibrary(index) },
    { icon: '🗑', label: 'Удалить', 
      onClick: () => handlers.onRemove(index), shortcut: 'Del',
      danger: true },
  ];
  
  return items;
}
```

### 2.2 Handlers: новые и перемаппленные

| Handler | Текущий код | Новый код |
|---------|-------------|-----------|
| `onEdit(index)` | `onEditFragment(index)` | Без изменений |
| `onSplit(index)` | `onSplitSignal(index)` | Без изменений |
| `onFlip(index)` | `onFlip(index)` | Без изменений |
| `onRemove(index)` | `onRemove(index)` | Без изменений |
| **`onPointMutation(index)`** | ❌ Не существует | **NEW** — открыть FragmentEditor в режиме AA-view |
| **`onMutagenesisWizard(index)`** | `setShowMutagenesis(true)` (global) | **CHANGE** — `setMutagenesisTarget(index)` |
| **`onReplace(index, type)`** | ❌ Не существует | **NEW** — мини-picker из PartsLibrary |
| **`onAddTag(index)`** | ❌ Не существует | **NEW** — tag/fusion popup |
| **`onReplaceCassette(index)`** | через PlasmidUseWizard | Переиспользовать wizard |
| **`onInsertElement(index)`** | через PlasmidUseWizard | Переиспользовать wizard |
| **`onDeleteRegion(index)`** | через PlasmidUseWizard | Переиспользовать wizard |
| **`onVersionTree(partId)`** | через PlasmidUseWizard | `setVersionTreePartId(partId)` |
| **`onSaveToLibrary(index)`** | ❌ Не существует | **NEW** — `addPart(fragment)` |

---

## 3. Новые компоненты / модальные окна

### 3.1 PointMutationInline

Не отдельный wizard — **FragmentEditor открывается в режиме AA-view** с фокусом на белковую последовательность. Клик по аминокислоте → dropdown замен (предлагаются частые: Ala scan, изостерные, charge swap из `COMMON_SUBS`). Выбрал → мутация применяется → новая версия Part.

**Изменения в FragmentEditor.jsx:**
- Добавить prop `initialMode: 'dna' | 'protein' | 'mutations'`
- Если `initialMode === 'mutations'` → открыть сразу в protein view, каждая АК кликабельна
- Клик по АК → popover с `getCommonSubstitutions(aa)` + input для произвольной замены
- Apply → `inlineSubstitution()` → `createMutant()` → обновить fragment на canvas

### 3.2 ReplacePicker

Мини-модал: filtered PartsLibrary. Открывается из "Replace with..." в контекстном меню.

```jsx
function ReplacePicker({ fragmentIndex, fragmentType, onReplace, onClose }) {
  const parts = useStore(s => s.parts);
  const [search, setSearch] = useState('');
  
  // Filter by type: promoter → only promoters, CDS → only CDS/gene
  const typeFilter = {
    promoter: ['promoter'],
    terminator: ['terminator'],
    CDS: ['CDS', 'gene'],
    gene: ['CDS', 'gene'],
    marker: ['CDS', 'gene', 'marker'],
    rep_origin: ['rep_origin'],
  }[fragmentType] || [];
  
  const filtered = parts.filter(p => 
    typeFilter.includes(p.type) &&
    p.sequence &&
    p.name.toLowerCase().includes(search.toLowerCase())
  );
  
  return (
    // Modal with search + list of matching parts
    // Click on part → onReplace(fragmentIndex, selectedPart)
  );
}
```

**Store action:**
```js
replaceFragment: (index, newPart) => {
  get().pushUndo?.();
  set(state => {
    const asm = state.assemblies.find(a => a.id === state.activeId);
    if (!asm || !asm.fragments[index]) return;
    const old = asm.fragments[index];
    asm.fragments[index] = {
      ...createFragFromPart(newPart),
      strand: old.strand,
      needsAmplification: old.needsAmplification,
    };
    asm.calculated = false;
  }, false, 'replaceFragment');
},
```

### 3.3 TagFusionPicker

Мини-модал для добавления тега или fusion-партнёра.

```jsx
const TAG_PRESETS = [
  // C-terminal tags
  { name: 'His6-tag', sequence: 'CACCACCACCACCACCAC', position: 'C-term', type: 'tag' },
  { name: 'FLAG-tag', sequence: 'GACTACAAGGACGACGATGACAAG', position: 'C-term', type: 'tag' },
  { name: 'Strep-tag II', sequence: 'TGGAGCCACCCGCAGTTCGAGAAG', position: 'C-term', type: 'tag' },
  { name: 'V5-tag', sequence: 'GGTAAGCCTATCCCTAACCCTCTCCTCGGTCTCGATTCTACG', position: 'C-term', type: 'tag' },
  
  // N-terminal fusions
  { name: 'MBP', sequence: '...', position: 'N-term', type: 'fusion', length: 1100 },
  { name: 'GST', sequence: '...', position: 'N-term', type: 'fusion', length: 690 },
  { name: 'SUMO', sequence: '...', position: 'N-term', type: 'fusion', length: 300 },
  
  // Cleavage sites (insert between fusion partner and target)
  { name: 'TEV site', sequence: 'GAAAACCTGTATTTTCAGAGC', position: 'linker', type: 'cleavage_site' },
  { name: 'Thrombin site', sequence: 'CTGGTGCCGCGCGGCAGC', position: 'linker', type: 'cleavage_site' },
  
  // Linkers
  { name: '(G₄S)×3', sequence: 'GGTGGCGGTGGCTCGGGCGGTGGTGGGTCGGGTGGCGGCGGATCG', position: 'linker', type: 'linker' },
];

function TagFusionPicker({ fragmentIndex, fragment, onApply, onClose }) {
  const [position, setPosition] = useState('C-term'); // N-term | C-term
  const [selected, setSelected] = useState(null);
  
  const presets = TAG_PRESETS.filter(t => 
    position === 'N-term' ? t.position !== 'C-term' : t.position !== 'N-term'
  );
  
  // Apply: insert tag sequence at start/end of CDS
  // → updateFragment + add detail annotation + shift downstream
  // → creates new version via derivation
}
```

### 3.4 MutagenesisWizard — переключение на target mode

**Текущее:** Step 1 = выбор template из базы + paste sequence. Потом Step 2 = define mutations.

**Новое:** Если открыт из контекстного меню → Step 1 пропускается, template = fragment sequence, CDS bounds = fragment boundaries.

```js
// Store:
mutagenesisTarget: null,  // index | null (replaces showMutagenesis: boolean)

// App.jsx:
{mutagenesisTarget !== null && fragments[mutagenesisTarget] && (
  <MutagenesisWizard
    template={fragments[mutagenesisTarget]}  // NEW prop
    onComplete={handleMutagenesis}
    onClose={() => useStore.getState().setMutagenesisTarget(null)}
  />
)}
```

**MutagenesisWizard.jsx:**
```jsx
export default function MutagenesisWizard({ template, onComplete, onClose }) {
  // If template provided → skip Step 1, go directly to Step 2
  const [step, setStep] = useState(template ? 2 : 1);
  const [templateSeq, setTemplateSeq] = useState(template?.sequence || '');
  const [templateName, setTemplateName] = useState(template?.name || '');
  const [cdsStart, setCdsStart] = useState(0);
  const [cdsEnd, setCdsEnd] = useState(template?.sequence?.length || 0);
  // ... rest unchanged
```

---

## 4. Изменения в store

### 4.1 assemblyType → deprecated

```js
// projectSlice.js или fragmentSlice.js:

// assemblyType остаётся в данных (для backward compat), 
// но НЕ используется для создания junctions.

// БЫЛО:
addFragment: (part) => {
  ...
  asm.junctions.push({
    type: asm.assemblyType === 'golden_gate' ? 'golden_gate' : 'overlap',
    ...
  });
}

// СТАЛО:
addFragment: (part) => {
  ...
  asm.junctions.push({
    type: 'overlap',  // ВСЕГДА overlap по умолчанию
    overlapMode: 'split', overlapLength: 30, tmTarget: 62, calcMode: 'length',
  });
}
```

`autoAdjustJunctions()` уже умеет переключать на GG при идентичных соседях. Пользователь меняет тип в JunctionBlock.

### 4.2 Новые store actions

```js
// uiSlice.js:
mutagenesisTarget: null,     // index | null
replacingFragment: null,     // { index, type } | null  
tagFusionTarget: null,       // index | null

setMutagenesisTarget: (idx) => set({ mutagenesisTarget: idx }),
setReplacingFragment: (data) => set({ replacingFragment: data }),
setTagFusionTarget: (idx) => set({ tagFusionTarget: idx }),

// fragmentSlice.js:
replaceFragment: (index, newPart) => { ... },  // swap fragment at index
insertTagAtFragment: (index, tagSequence, position, tagName) => { ... },  // insert tag
```

### 4.3 Удалить из store

```js
// Удалить:
showMutagenesis: false,        // → заменён на mutagenesisTarget
setShowMutagenesis: (v) => {}, // → заменён на setMutagenesisTarget

// Deprecated (оставить, но не использовать в UI):
setAssemblyType: (type) => {}, // → junctions per-junction
```

---

## 5. Обновление ContextMenu.jsx

Текущий ContextMenu поддерживает только `{ icon, label, onClick, disabled, divider }`.

Добавить:
- `shortcut` — отображает хоткей справа серым
- `description` — мелкая подпись под label
- `danger` — красный текст для деструктивных действий

```jsx
// Расширенный item rendering:
<button ...>
  {item.icon && <span className="text-sm w-5 text-center">{item.icon}</span>}
  <div className="flex-1 min-w-0">
    <span className={`truncate ${item.danger ? 'text-red-600' : ''}`}>{item.label}</span>
    {item.description && (
      <span className="block text-[9px] text-gray-400 truncate">{item.description}</span>
    )}
  </div>
  {item.shortcut && (
    <span className="text-[10px] text-gray-400 ml-2 shrink-0">{item.shortcut}</span>
  )}
</button>
```

---

## 6. Что НЕ трогать

- `JunctionBlock.jsx` — уже полностью per-junction, не зависит от глобального assemblyType
- `designPrimersLocal()` — читает тип из каждого junction
- `validateJunctionEnds()` — per-junction
- `PlasmidUseWizard.jsx` — остаётся для плазмидных операций, вызывается из контекстного меню
- `golden-gate.js` — GG enzyme выбирается в JunctionBlock, не глобально

---

## 7. Порядок реализации

```
1. Расширить ContextMenu.jsx (shortcut, description, danger)  — 20 мин
2. Рефакторить PartBlock.jsx context menu items → type-dependent  — 30 мин
3. Удалить global method toggle + Mutagenesis button из App.jsx header  — 10 мин
4. mutagenesisTarget в store + MutagenesisWizard template prop  — 20 мин
5. ReplacePicker компонент + replaceFragment store action  — 40 мин
6. TagFusionPicker компонент + insertTagAtFragment action  — 40 мин
7. addFragment() → junction type: 'overlap' всегда  — 5 мин
8. Убрать все {expertMode &&} обёртки из App.jsx  — 10 мин
```

## Коммиты

```
refactor: extend ContextMenu with shortcuts, descriptions, danger
feat: type-dependent context menu for PartBlock
refactor: remove global assembly method toggle from header
refactor: mutagenesis via context menu (mutagenesisTarget)
feat: ReplacePicker — swap fragment from parts library
feat: TagFusionPicker — add tags and fusions to CDS
refactor: default junction type always overlap
cleanup: remove expertMode conditionals
```

## Тесты

```
context-menu-items.test.js       — CDS gets mutation items, promoter doesn't
replace-fragment.test.js         — replaceFragment preserves strand, needsAmplification
insert-tag.test.js               — tag insertion extends CDS, shifts downstream
mutagenesis-target.test.js       — wizard skips Step 1 when template provided
default-junction-overlap.test.js — addFragment creates overlap junction
```
