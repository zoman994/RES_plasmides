# BodgeGene — Концепция двух кликов: 10 атомарных операций

**Статус:** ✅ РЕАЛИЗОВАНО (сессии 24–26, март-апрель 2026). Справочный документ.  
**Дата спеки:** 31 марта 2026  
**Принцип:** Каждая операция = 1 самостоятельный коммит. Можно делать в любом порядке. Каждая проверяется отдельно.

---

## Аудит: что СДЕЛАНО и что НЕТ

### ✅ Уже работает
- Del удаляет выбранные фрагменты
- Escape сбрасывает selection
- Ctrl+A выбирает все
- Ctrl+1/2/3/4 view modes
- Floating merge pill (при Ctrl+Click selection)
- selectedFragIndices / toggleFragSelection / clearFragSelection / selectFragRange в store
- Auto-primer design (local-primer-design.js)
- Merged block visual с "шовчиками"
- Context menu на фрагменте (right-click)
- beforeunload force-save

### ❌ НЕ реализовано
- Expert mode ещё НЕ always-on (toggle в toolbar, first-launch wizard)
- Click ≠ select (нужен Ctrl+Click)
- Shift+Click range select (store есть, не подключён)
- Double-click fragment → Edit
- Double-click merged → Unfold
- Junction click gated по Expert mode
- Hotkeys: R, E/Enter, Ctrl+C, Ctrl+D
- Context menu на junction
- Context menu на пустом canvas
- Double-click tab → rename

---

## 10 ОПЕРАЦИЙ (от простого к сложному)

### OP-1: Expert mode = always ON
**Файлы:** `uiSlice.js`, `App.jsx`
**Что делать:**
1. `uiSlice.js`: `expertMode: true` (default)
2. `App.jsx`: убрать кнопку toggle Expert из toolbar (строка ~293-297)
3. `App.jsx`: убрать first-launch wizard с выбором Студент/Эксперт (строки ~717-735), заменить на ничего
4. НЕ трогать `expertMode &&` условия в PartBlock/JunctionBlock — они теперь всегда true
**Проверка:** Приложение открывается без wizard. Hover toolbar на фрагменте показывает ✏️ и ✂ сразу. Junction кликабелен сразу.
**Время:** 5 минут

---

### OP-2: Click = single select
**Файлы:** `PartBlock.jsx`
**Что делать:**
1. Заменить onClick handler:
```jsx
onClick={(e) => {
  e.stopPropagation();
  if (e.ctrlKey || e.metaKey) {
    toggleFragSelection(index);          // multi-select
  } else if (e.shiftKey && selectedFragIndices.length > 0) {
    const last = selectedFragIndices[selectedFragIndices.length - 1];
    useStore.getState().selectFragRange(Math.min(last, index), Math.max(last, index));
  } else {
    clearFragSelection();
    toggleFragSelection(index);          // single select
  }
  setHighlightedPartId(fragment.partId || null);
}}
```
**Проверка:** Click на фрагмент → выбран (обводка). Click на другой → первый деселектнулся. Ctrl+Click → оба выбраны. Shift+Click → диапазон.
**Время:** 5 минут

---

### OP-3: Double-click = Edit / Unfold
**Файлы:** `PartBlock.jsx`
**Что делать:**
1. Добавить `onDoubleClick` на root div (после onClick, перед onContextMenu):
```jsx
onDoubleClick={(e) => {
  e.stopPropagation();
  if (fragment.subFragments?.length > 0) {
    // Unfold merged block
    const store = useStore.getState();
    const active = store.getActive();
    if (!active) return;
    const expanded = [];
    let off = 0;
    for (const sub of fragment.subFragments) {
      expanded.push({
        id: `f${Date.now()}_${Math.random().toString(36).slice(2,5)}`,
        name: sub.name, type: sub.type,
        sequence: (fragment.sequence || '').slice(off, off + sub.length),
        length: sub.length, strand: 1, needsAmplification: true,
      });
      off += sub.length;
    }
    const newFragments = [...active.fragments];
    newFragments.splice(index, 1, ...expanded);
    const asmType = active.assemblyType || 'overlap';
    const isCirc = active.circular || false;
    const juncCount = isCirc ? newFragments.length : Math.max(0, newFragments.length - 1);
    const newJunctions = Array.from({ length: juncCount }, () => ({
      type: asmType === 'golden_gate' ? 'golden_gate' : 'overlap',
      overlapMode: 'split', overlapLength: 30, tmTarget: 62, calcMode: 'length',
    }));
    store.pushUndo();
    store.updateActive({ fragments: newFragments, junctions: newJunctions, calculated: false });
  } else {
    onEditFragment?.(index);
  }
}}
```
**Проверка:** Double-click на фрагмент → FragmentEditor. Double-click на merged → разворачивается.
**Время:** 10 минут

---

### OP-4: Junction click без Expert gate
**Файлы:** `JunctionBlock.jsx`
**Что делать:**
1. Строка ~124: убрать `expertMode &&`:
```jsx
// БЫЛО:
<div onClick={() => expertMode && setOpen(!open)}
  className={`... ${expertMode ? 'cursor-pointer hover:bg-blue-50' : 'cursor-default'}`}
  title={expertMode ? tip : `${tip}\n🔬 Эксперт: настройка`}>

// СТАЛО:
<div onClick={() => setOpen(!open)}
  className="w-6 h-14 flex items-center justify-center transition rounded cursor-pointer hover:bg-blue-50"
  title={tip}>
```
2. Можно убрать `const expertMode = useStore(...)` (строка 23) — больше не нужен.
**Проверка:** Click junction → panel открылся (без Expert mode).
**Время:** 3 минуты

---

### OP-5: Горячие клавиши R, E, Enter, Ctrl+C, Ctrl+D
**Файлы:** `DesignCanvas.jsx`
**Что делать:**
1. В keyboard handler (useEffect, после Escape block ~строка 130), ДОБАВИТЬ:
```js
// R = reverse complement selected
if (e.key === 'r' && !e.ctrlKey && !e.metaKey && selectedFragIndices.length === 1) {
  e.preventDefault();
  onFlip(selectedFragIndices[0]);
}
// E or Enter = edit selected
if ((e.key === 'e' || e.key === 'Enter') && !e.ctrlKey && !e.metaKey && selectedFragIndices.length === 1) {
  e.preventDefault();
  onEditFragment(selectedFragIndices[0]);
}
// Ctrl+C = copy sequence
if ((e.ctrlKey || e.metaKey) && e.key === 'c' && selectedFragIndices.length > 0) {
  const seqs = selectedFragIndices.map(i => fragments[i]?.sequence || '').join('');
  if (seqs) { navigator.clipboard.writeText(seqs); e.preventDefault(); }
}
// Ctrl+D = duplicate fragment
if ((e.ctrlKey || e.metaKey) && e.key === 'd' && selectedFragIndices.length === 1) {
  e.preventDefault();
  const frag = fragments[selectedFragIndices[0]];
  if (frag) onDrop({ ...frag, id: `dup_${Date.now()}`, name: frag.name + '_copy' });
}
```
2. Добавить `onFlip, onEditFragment, onDrop` в dependency array useEffect.
**Проверка:** Выбрать фрагмент → R → перевернулся. E → открылся редактор. Ctrl+C → sequence в clipboard.
**Время:** 10 минут

---

### OP-6: Context menu на junction
**Файлы:** `JunctionBlock.jsx`
**Что делать:**
1. Добавить `onContextMenu` на junction div (строка ~124):
```jsx
onContextMenu={(e) => {
  e.preventDefault();
  e.stopPropagation();
  // Быстрое переключение типа
  setCtxMenu({ x: e.clientX, y: e.clientY });
}}
```
2. Добавить state `const [ctxMenu, setCtxMenu] = useState(null);`
3. Добавить рендер ContextMenu (импортировать из `./ContextMenu`):
```jsx
{ctxMenu && (
  <ContextMenu position={ctxMenu} onClose={() => setCtxMenu(null)} items={[
    { icon: '◀▶', label: 'Overlap', onClick: () => onChange({ ...j, type: 'overlap' }) },
    { icon: '🔶', label: 'Golden Gate', onClick: () => onChange({ ...j, type: 'golden_gate' }) },
    { icon: '✂', label: 'RE/Лигирование', onClick: () => onChange({ ...j, type: 're_ligation' }) },
    { icon: '🔄', label: 'KLD', onClick: () => onChange({ ...j, type: 'kld' }) },
    { divider: true },
    { icon: '⚙️', label: 'Настройки...', onClick: () => { setCtxMenu(null); setOpen(true); } },
  ]} />
)}
```
**Проверка:** Right-click на junction → меню с типами. Click "Golden Gate" → junction переключился.
**Время:** 10 минут

---

### OP-7: Context menu на пустом canvas
**Файлы:** `DesignCanvas.jsx`
**Что делать:**
1. Добавить state: `const [canvasCtx, setCanvasCtx] = useState(null);`
2. На root div добавить `onContextMenu`:
```jsx
onContextMenu={(e) => {
  if (e.target === e.currentTarget || e.target.closest('[data-canvas-bg]')) {
    e.preventDefault();
    setCanvasCtx({ x: e.clientX, y: e.clientY });
  }
}}
```
3. Рендер ContextMenu:
```jsx
{canvasCtx && (
  <ContextMenu position={canvasCtx} onClose={() => setCanvasCtx(null)} items={[
    { icon: '➕', label: 'Добавить фрагмент', onClick: () => { setCanvasCtx(null); useStore.getState().setModalMode('library'); } },
    { icon: '📂', label: 'Импортировать файл', onClick: () => { setCanvasCtx(null); /* trigger file input */ } },
    { divider: true },
    { icon: circular ? '📏' : '⭕', label: circular ? 'Линейный' : 'Кольцевой', onClick: () => { setCanvasCtx(null); onToggleCircular(); } },
  ]} />
)}
```
**Проверка:** Right-click на пустое место canvas → меню.
**Время:** 10 минут

---

### OP-8: Double-click tab → rename assembly
**Файлы:** `AssemblyTabs.jsx`
**Что делать:**
1. Найти рендер каждого tab. Добавить `onDoubleClick`:
```jsx
onDoubleClick={(e) => {
  e.stopPropagation();
  setEditingId(asm.id);  // state для inline edit
}}
```
2. При `editingId === asm.id` → рендерить `<input>` вместо `<span>`:
```jsx
{editingId === asm.id ? (
  <input autoFocus defaultValue={asm.name}
    onBlur={(e) => { renameAssembly(asm.id, e.target.value); setEditingId(null); }}
    onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') setEditingId(null); }}
    className="text-xs bg-transparent border-b border-blue-400 outline-none w-20" />
) : (
  <span>{asm.name}</span>
)}
```
3. Добавить state: `const [editingId, setEditingId] = useState(null);`
**Проверка:** Double-click на tab "Сборка 1" → inline input → ввести новое имя → Enter.
**Время:** 10 минут

---

### OP-9: Context menu на tab — удалить сборку
**Файлы:** `AssemblyTabs.jsx`
**Что делать:**
1. Добавить `onContextMenu` на каждый tab:
```jsx
onContextMenu={(e) => { e.preventDefault(); setTabCtx({ id: asm.id, x: e.clientX, y: e.clientY }); }}
```
2. ContextMenu:
```jsx
{ icon: '✏️', label: 'Переименовать', onClick: () => setEditingId(tabCtx.id) },
{ icon: '📋', label: 'Дублировать', onClick: () => duplicateAssembly(tabCtx.id) },
{ divider: true },
{ icon: '🗑', label: 'Удалить', onClick: () => removeAssembly(tabCtx.id) },
```
**Проверка:** Right-click на tab → "Удалить" → сборка удалена.
**Время:** 10 минут

---

### OP-10: Визуальная подсказка hotkeys
**Файлы:** `DesignCanvas.jsx`
**Что делать:**
1. Когда фрагмент selected (selectedFragIndices.length > 0), показать floating toolbar с hotkey подсказками:
```jsx
{selectedFragIndices.length === 1 && (
  <div className="absolute top-2 right-2 z-20 bg-gray-800/80 text-white text-[9px] rounded-lg px-2 py-1 space-y-0.5">
    <div><kbd className="bg-gray-600 px-1 rounded">E</kbd> Редактировать</div>
    <div><kbd className="bg-gray-600 px-1 rounded">R</kbd> Перевернуть</div>
    <div><kbd className="bg-gray-600 px-1 rounded">Del</kbd> Удалить</div>
    <div><kbd className="bg-gray-600 px-1 rounded">Ctrl+C</kbd> Копировать</div>
  </div>
)}
```
**Проверка:** Click на фрагмент → в правом верхнем углу canvas появляется подсказка.
**Время:** 5 минут

---

## СВОДНАЯ ТАБЛИЦА

| OP | Название | Файлы | Время | Зависимости |
|----|----------|-------|-------|-------------|
| 1 | Expert always ON | uiSlice, App | 5 мин | нет |
| 2 | Click = select | PartBlock | 5 мин | нет |
| 3 | Double-click = Edit/Unfold | PartBlock | 10 мин | нет |
| 4 | Junction no gate | JunctionBlock | 3 мин | OP-1 (но работает и без) |
| 5 | Hotkeys R/E/Ctrl+C/D | DesignCanvas | 10 мин | OP-2 (нужен selection) |
| 6 | Context menu junction | JunctionBlock | 10 мин | нет |
| 7 | Context menu canvas | DesignCanvas | 10 мин | нет |
| 8 | Double-click tab rename | AssemblyTabs | 10 мин | нет |
| 9 | Context menu tab | AssemblyTabs | 10 мин | нет |
| 10 | Hotkey hints | DesignCanvas | 5 мин | OP-2, OP-5 |

**Общее время:** ~80 минут
**Нет циклических зависимостей** — можно делать в любом порядке.
**Рекомендованный порядок:** 1 → 2 → 4 → 3 → 5 → 10 → 6 → 7 → 8 → 9

---

## Каждая OP = отдельный CURRENT_TASK

Для Claude Code — копировать нужную OP в CURRENT_TASK.md и запускать:

```
/clear
Читай CURRENT_TASK.md — одна атомарная операция, N минут.
```

Или делать все 10 подряд за одну сессию (80 мин).
