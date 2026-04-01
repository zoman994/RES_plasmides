# CURRENT_TASK.md — Блок 3: Parts Lifecycle + Palette Fix

**Статус:** Готов к реализации  
**Зависит от:** Блок 1 (bugs + unified annotations) ✅, Блок 2 (toolbar + context menu) ✅  
**Спека:** `docs/PARTS_LIFECYCLE.md`

---

## Контекст

Parts lifecycle: каждый элемент в библиотеке получает статус `draft` / `verified` / `archived`. Статус определяет видимость в палитке. Плюс два бага: stale closure при загрузке, hooks violation в PartsPalette.

---

## Задачи

### BUG-FIX 1: Stale closure — запчасти пропадают при обновлении

**Файл:** `App.jsx`, строки ~210-230

**Проблема:** `mergeParts` захватывает `parts` из React-замыкания первого рендера. На первом рендере persist ещё не загрузился → `parts = []`. Когда `fetchParts()` вернёт пустой массив или ошибку → `mergeParts([])` → `setParts([])` → все данные стёрты.

**Исправление:**
```js
// БЫЛО:
const mergeParts = (apiParts) => {
  const existingIds = new Set(parts.map(p => p.id)); // ← stale closure!
  const userParts = parts.filter(p => p.parentId || p.source === 'mutagenesis');
  ...
  setParts([...baseParts, ...userParts]); // wipes on empty
};

// СТАЛО:
const mergeParts = (apiParts) => {
  const currentParts = useStore.getState().parts; // ← current, not stale
  if (!apiParts.length) return;                    // ← don't wipe on empty
  const existingIds = new Set(currentParts.map(p => p.id));
  const newOnly = apiParts.filter(p => !existingIds.has(p.id));
  if (newOnly.length > 0) {
    useStore.getState().setParts([...currentParts, ...newOnly]);
  }
};
```

**Тест:** `stale-closure-fix.test.js` — вызвать mergeParts с пустым массивом, убедиться parts не стёрты.

### BUG-FIX 2: Hooks violation в PartsPalette

**Файл:** `PartsPalette.jsx`, строки ~63-68

**Проблема:** `if (!initialized) return (...)` стоит ПЕРЕД вызовами useState, useMemo, useRef. Это нарушение React Hooks rules (hooks должны вызываться в одинаковом порядке при каждом рендере).

**Исправление:** Перенести ВСЕ хуки ПЕРЕД условной проверкой. Проверку `initialized` оставить перед JSX return:

```js
// СТАЛО:
export default function PartsPalette() {
  const parts = useStore(s => s.parts);
  const initialized = useStore(s => s.initialized);
  // ... ВСЕ остальные useStore, useState, useMemo, useRef...
  
  const partRefs = useRef({});
  const [search, setSearch] = useState('');
  // ... остальные хуки ...
  
  // Проверка ПОСЛЕ всех хуков
  if (!initialized) {
    return (<div className="p-4 text-center text-gray-400 text-sm">Загрузка библиотеки...</div>);
  }
  
  // ... остальной render ...
}
```

### TASK 1: Добавить status поле в Part model

**Файлы:** `store/fragmentSlice.js`, `store/index.js`

1. В `addPart()` — установить default status:
```js
const newPart = {
  ...part,
  status: part.status || 'draft',  // NEW
  origin: part.origin || {         // NEW
    projectId: get().activeProjectId,
    projectName: get().projectName,
    createdAt: new Date().toISOString(),
  },
  // ...existing fields...
};
```

2. В `addPart()` — автоопределение status по source:
```js
// Auto-determine status from source
if (!part.status) {
  if (['import', 'genbank_import', 'batch_import'].includes(part.source)) {
    newPart.status = 'verified';
  } else {
    newPart.status = 'draft';
  }
}
```

3. Новые store actions:
```js
updatePartStatus: (id, status) => set(state => {
  const p = state.parts.find(x => x.id === id);
  if (p) {
    p.status = status;
    if (status === 'verified') p.verifiedDate = new Date().toISOString();
  }
}, false, 'updatePartStatus'),

archivePart: (id) => set(state => {
  const p = state.parts.find(x => x.id === id);
  if (p) p.status = 'archived';
}, false, 'archivePart'),

restorePart: (id) => set(state => {
  const p = state.parts.find(x => x.id === id);
  if (p && p.status === 'archived') p.status = 'draft';
}, false, 'restorePart'),
```

### TASK 2: Persist migration v5 → v6

**Файл:** `store/index.js`

Добавить миграцию в `persistConfig.migrate`:
```js
// v5 → v6: add status field to parts
if (version < 6 && persisted?.parts) {
  persisted.parts = persisted.parts.map(p => {
    if (p.status) return p;
    if (['import', 'genbank_import', 'batch_import'].includes(p.source)) {
      return { ...p, status: 'verified' };
    }
    if (['mutagenesis', 'mutation', 'split', 'fusion', 'assembly'].includes(p.source)) {
      return { ...p, status: 'draft', origin: p.origin || { projectId: persisted.activeProjectId, createdAt: p.addedDate } };
    }
    return { ...p, status: 'verified' }; // old data = benefit of the doubt
  });
}
```

Обновить `version: 6` в persistConfig.

### TASK 3: Фильтрация палитры по status

**Файл:** `PartsPalette.jsx`

1. Добавить state для фильтра:
```js
const [statusFilter, setStatusFilter] = useState('default');
// 'default' | 'all' | 'verified' | 'project' | 'archived'
```

2. Изменить filtered useMemo:
```js
const filtered = useMemo(() => {
  let list = parts;
  
  // Status filter
  const activeProjectId = useStore.getState().activeProjectId;
  if (statusFilter === 'default') {
    list = list.filter(p => 
      p.status === 'verified' || 
      (p.status === 'draft' && p.origin?.projectId === activeProjectId) ||
      !p.status // backward compat: no status = show
    );
  } else if (statusFilter === 'verified') {
    list = list.filter(p => p.status === 'verified' || !p.status);
  } else if (statusFilter === 'project') {
    list = list.filter(p => p.origin?.projectId === activeProjectId);
  } else if (statusFilter === 'archived') {
    list = list.filter(p => p.status === 'archived');
  }
  // 'all' = no status filter
  
  // Collection filter
  if (activeCollId) {
    const coll = collections.find(c => c.id === activeCollId);
    if (coll) list = list.filter(p => coll.partIds.includes(p.id));
  }
  
  // Search filter
  if (search) list = list.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));
  
  return list;
}, [parts, activeCollId, collections, search, statusFilter]);
```

3. UI: фильтр-кнопки над поиском:
```jsx
<div className="flex gap-1 mb-2 flex-wrap">
  {[
    { val: 'default', label: 'Актуальные' },
    { val: 'all', label: 'Все' },
    { val: 'verified', label: 'Полученные' },
    { val: 'project', label: 'Этот проект' },
    { val: 'archived', label: 'Архив' },
  ].map(f => (
    <button key={f.val} onClick={() => setStatusFilter(f.val)}
      className={`text-[9px] px-2 py-0.5 rounded-full transition ${
        statusFilter === f.val ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
      }`}>{f.label}</button>
  ))}
</div>
```

### TASK 4: Status badge на элементах палитры

**Файл:** `PartsPalette.jsx`

В каждом part item показать бейдж статуса:
```jsx
{p.status === 'draft' && (
  <span className="text-[8px] px-1 py-0 rounded bg-amber-100 text-amber-700">Запл.</span>
)}
{p.status === 'verified' && (
  <span className="text-[8px] px-1 py-0 rounded bg-green-100 text-green-700">Получен</span>
)}
{p.status === 'archived' && (
  <span className="text-[8px] px-1 py-0 rounded bg-gray-100 text-gray-500">Архив</span>
)}
```

### TASK 5: Контекстное меню — status actions

**Файл:** `PartsPalette.jsx`, в ContextMenu items

Добавить пункты:
```js
...(p.status === 'draft' ? [
  { icon: '✅', label: 'Отметить как полученный', onClick: () => updatePartStatus(p.id, 'verified') },
] : []),
...(p.status !== 'archived' ? [
  { icon: '📦', label: 'В архив', onClick: () => archivePart(p.id) },
] : [
  { icon: '↩️', label: 'Восстановить', onClick: () => restorePart(p.id) },
]),
```

### TASK 6: origin при создании parts

**Файлы:** `store/fragmentSlice.js` (createMutant, splitPart, fuseParts, completeAssembly), `hooks/useFragmentHandlers.js`

При создании любого part добавлять origin:
```js
origin: {
  projectId: get().activeProjectId,
  projectName: get().projectName,
  createdAt: new Date().toISOString(),
},
```

Добавить в: `createMutant`, `splitPart`, `fuseParts`, `completeAssembly` (через addPart), `handleFileImport` (file-import.js).

### TASK 7: "Амплифицированные" — свернуть по умолчанию

**Файл:** `PartsPalette.jsx`

Секция "Амплифицированные" (PCR products + verified plasmids из inventory) — collapsed по умолчанию. Кликабельный заголовок с ► стрелкой:

```jsx
const [invOpen, setInvOpen] = useState(false);
// ...
{!activeCollId && (pcrProducts.length > 0 || plasmids.length > 0) && (
  <div>
    <div className="text-[10px] text-cyan-600 uppercase tracking-wider font-semibold mt-4 mb-1 cursor-pointer flex items-center gap-1"
      onClick={() => setInvOpen(!invOpen)}>
      <span className={`text-[8px] transition-transform ${invOpen ? 'rotate-90' : ''}`}>▶</span>
      <span>🧊 Инвентарь</span>
      <span className="text-gray-300">({pcrProducts.length + plasmids.length})</span>
    </div>
    {invOpen && (
      <>
        {pcrProducts.map(item => (/* existing render */))}
        {plasmids.map(item => (/* existing render */))}
      </>
    )}
  </div>
)}
```

---

## Порядок реализации

```
1. BUG-FIX 1: stale closure в App.jsx                — 5 мин
2. BUG-FIX 2: hooks violation в PartsPalette          — 10 мин
3. TASK 1: status поле + store actions                 — 20 мин
4. TASK 2: persist migration v5→v6                     — 10 мин
5. TASK 6: origin при создании parts                   — 15 мин
6. TASK 3: фильтрация палитры                          — 30 мин
7. TASK 4: status badges                               — 10 мин
8. TASK 5: context menu status actions                  — 10 мин
9. TASK 7: inventory collapsed                         — 10 мин
```

## Тесты

```
stale-closure-fix.test.js           — mergeParts([]) не стирает parts
parts-status-migration.test.js      — миграция v5→v6: correct status assignment
parts-visibility.test.js            — filter logic: verified+draft(project)
parts-status-transitions.test.js    — draft→verified, verified→archived, archived→draft
origin-tracking.test.js             — createMutant/split/fuse set origin
```

## Коммиты

```
fix: stale closure in App.jsx mergeParts (BUG-70)
fix: hooks violation in PartsPalette (BUG-71)
feat: part status field (draft/verified/archived)
feat: persist migration v5→v6 with status assignment
feat: origin tracking for part provenance
feat: palette filtering by status
feat: status badges in palette
feat: context menu status actions (verify/archive/restore)
refactor: inventory section collapsed by default
```
