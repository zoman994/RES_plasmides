# BodgeGene — Текущая задача

**Дата:** 30 марта 2026  
**Ветка:** `feature/racetrack-canvas`  
**Блок:** 10 — Racetrack Canvas + MIRO Connectors  
**Статус:** Ready for implementation  
**Дизайн-документ:** `docs/RACETRACK_DESIGN.md`  
**Прототип:** `docs/racetrack-miro-prototype.html` (открой в браузере для демо)

---

## Концепция

Circular конструкты отображаются как **стадион** — блоки на овале. Вставка фрагментов через **MIRO-коннекторы** — клик на `+` между блоками → dropdown с поиском по библиотеке → выбрал → вставлен. Четвёртый viewMode (`'racetrack'`, Ctrl+4).

---

## Задачи — порядок выполнения

### Task 1: racetrack-layout.js (~60 строк)

**Новый файл:** `gui/designer/src/racetrack-layout.js`

```js
export function computeRacetrackLayout(fragments, { width, height }) {
  // Возвращает:
  // { blocks: [{ x, y, w, h, midAngle, endAngle }], 
  //   junctions: [{ path, connX, connY }],
  //   center: { x, y } }
}
```

**Алгоритм:**
- Центр овала: `cx = W/2, cy = H/2`
- Радиусы: `rx = W * 0.38, ry = H * 0.35`
- Старт: `-Math.PI / 2` (12 часов)
- Угол каждого блока ∝ `frag.length / totalBp`
- Ширина блока: `Math.max(60, Math.min(140, fraction * W * 0.8))`
- Junction path: Quadratic Bezier `M...Q...`, контрольная точка на 70% радиуса
- Connector point: Bezier t=0.5 (середина кривой)

**Тест:**
```js
// racetrack-layout.test.js
it('places N blocks around ellipse', () => {
  const frags = [{ length: 100 }, { length: 200 }, { length: 300 }];
  const layout = computeRacetrackLayout(frags, { width: 800, height: 400 });
  expect(layout.blocks).toHaveLength(3);
  expect(layout.junctions).toHaveLength(3); // circular = N junctions
  // All blocks within canvas bounds
  layout.blocks.forEach(b => {
    expect(b.x).toBeGreaterThanOrEqual(0);
    expect(b.x + b.w).toBeLessThanOrEqual(800);
  });
});
```

---

### Task 2: ConnectorDropdown.jsx (~80 строк)

**Новый файл:** `gui/designer/src/components/ConnectorDropdown.jsx`

**Спецификация:**
- Props: `{ position, afterIdx, parts, onInsert, onClose, onImport }`
- `createPortal` в `document.body`
- Input с автофокусом + поиск по имени/типу
- Группировка через `groupByCategory()` из `part-categories.js`
- Items: цветная точка + имя + bp
- "Import from file..." в конце (с divider)
- Закрытие: Escape / mousedown вне / клик на пункт
- Flip: если выходит за правый/нижний край

**Стиль:**
```
bg-white rounded-lg shadow-lg border text-sm
min-w-[200px] max-h-[280px] overflow-y-auto
```

---

### Task 3: RacetrackView.jsx (~200 строк)

**Новый файл:** `gui/designer/src/components/RacetrackView.jsx`

**Props:**
```js
{ fragments, junctions, primers, circular, constructName, totalBp, zoom,
  parts,  // для ConnectorDropdown
  onRemove, onFlip, onEditFragment, onJunctionChange, onReorder,
  onInsertAt,     // NEW: вставить Part в позицию afterIdx
  onImportFile }  // NEW: открыть file picker
```

**Структура:**
1. `containerRef` + `ResizeObserver` → `size`
2. `useMemo(() => computeRacetrackLayout(fragments, size))`
3. SVG layer: junction Bezier paths (pointer-events: none)
4. Center label: constructName + "X.X kb circular"
5. HTML layer: PartBlock (absolute positioned, compact mode)
6. Connector `+` points на junction middleware
7. State: `connectorMenu: { afterIdx, position } | null`
8. ConnectorDropdown (conditional render)

**Каждый блок:**
```jsx
<div className="absolute transition-all duration-300"
  style={{ left: block.x, top: block.y, width: block.w, height: block.h }}>
  <PartBlock fragment={frag} index={i} compact
    onRemove={() => onRemove(i)}
    onFlip={() => onFlip(i)}
    onEdit={() => onEditFragment(i)} />
</div>
```

**Каждый connector:**
```jsx
<div className="absolute w-5 h-5 rounded-full bg-white border-2 border-gray-400 
  hover:border-blue-500 hover:scale-[1.3] hover:bg-blue-50 
  flex items-center justify-center cursor-pointer z-10 transition-all"
  style={{ left: conn.x - 10, top: conn.y - 10 }}
  onClick={() => setConnectorMenu({ afterIdx: i, position: { x: conn.x + 14, y: conn.y + 14 } })}>
  <svg width="10" height="10" viewBox="0 0 12 12">
    <line x1="6" y1="2" x2="6" y2="10" stroke="#94A3B8" strokeWidth="1.5"/>
    <line x1="2" y1="6" x2="10" y2="6" stroke="#94A3B8" strokeWidth="1.5"/>
  </svg>
</div>
```

---

### Task 4: Интеграция в DesignCanvas.jsx (~30 строк)

**Файл:** `gui/designer/src/components/DesignCanvas.jsx`

**Изменения:**

1. Import:
```js
import RacetrackView from './RacetrackView';
```

2. Keyboard shortcut Ctrl+4:
```js
if (e.key === '4') { setViewMode('racetrack'); e.preventDefault(); }
```

3. Кнопка в toolbar (только для circular):
```jsx
...(circular ? [
  { mode: 'map', label: '⭕ Карта', key: '3' },
  { mode: 'racetrack', label: '🏟 Стадион', key: '4' },
] : []),
```

4. Render в body:
```jsx
{viewMode === 'racetrack' && circular ? (
  <RacetrackView 
    fragments={fragments} junctions={junctions} primers={allPrimers}
    circular={circular} constructName={constructName} totalBp={totalBp}
    zoom={zoom} parts={parts}
    onRemove={onRemove} onFlip={onFlip}
    onEditFragment={onEditFragment} onJunctionChange={onJunctionChange}
    onReorder={onReorder}
    onInsertAt={(afterIdx, part) => onDrop(part, afterIdx)}
    onImportFile={() => { /* trigger file picker */ }} />
) : viewMode === 'map' && circular ? (
  <PlasmidMap ... />
) : ...}
```

5. Callback `onInsertAt` — в App.jsx или hooks:
```js
// Вставить Part в конкретную позицию (не в конец)
const handleInsertAt = (afterIdx, part) => {
  // Используем существующий addFragment + splice
  const newFrag = createFragmentFromPart(part);
  store.getState().insertFragmentAt(afterIdx + 1, newFrag);
};
```

6. Новый action в `fragmentSlice`:
```js
insertFragmentAt: (index, fragment) => set(state => {
  state.fragments.splice(index, 0, fragment);
  // Пересчитать junctions
  rebuildJunctions(state);
}),
```

---

### Task 5: DnD на racetrack (опционально, можно отложить)

Drag Part из палитки на racetrack → определить позицию вставки по углу курсора:
```js
const angle = Math.atan2(mouseY - cy, mouseX - cx);
// найти junction в диапазоне этого угла
```

**Сложность:** Высокая (angle-based positioning + useDrop). Можно отложить на отдельный PR — MIRO connectors уже дают вставку в любую позицию.

---

### Task 6: Тесты + визуальное тестирование

**Unit тесты:**
```bash
# racetrack-layout.test.js — 5+ тестов
# - N блоков размещаются в bounds
# - Junctions = N для circular
# - Connector points на кривых
# - Edge case: 2 блока, 10 блоков
# - Ширина пропорциональна bp
```

**Ручное тестирование:**
```
☐ Ctrl+4 → Racetrack view появился (только для circular)
☐ Блоки на овале, размер ∝ bp
☐ Junction кривые между блоками
☐ "Construct X.X kb circular" в центре
☐ Клик на + → dropdown с поиском
☐ Ввести "prom" → фильтрация работает
☐ Выбрать Part → вставлен в правильную позицию
☐ Стадион перестроился с анимацией
☐ "Import from file..." → file picker (если реализован)
☐ Escape / click outside → dropdown закрылся
☐ ПКМ на блоке → ContextMenu (из блока 9)
☐ Ctrl+1 → вернулся в blocks view
☐ Resize окна → layout адаптировался
☐ 2 фрагмента → работает
☐ 8+ фрагментов → блоки уменьшились, читаемо
```

---

## Порядок выполнения

```
Task 1 (layout) → Task 2 (dropdown) → Task 3 (view) → Task 4 (интеграция) → Task 6 (тесты)
Task 5 (DnD) — опционально, отдельный PR
```

---

## Верификация

```bash
cd C:\Users\Zoman\Desktop\RESplasmide\gui\designer
npx vitest run && npx vite build
```

**Новые файлы:**
- `src/racetrack-layout.js`
- `src/components/RacetrackView.jsx`
- `src/components/ConnectorDropdown.jsx`
- `src/__tests__/racetrack-layout.test.js`

**Изменённые файлы:**
- `src/components/DesignCanvas.jsx` (import + Ctrl+4 + toolbar button + render)
- `src/store/fragmentSlice.js` (insertFragmentAt action)
