# BodgeGene — Project Flow Canvas: дизайн-спецификация

**Дата:** 31 марта 2026  
**Статус:** Дизайн  
**Зависимости:** Racetrack View (Block 10), Zustand store, @xyflow/react

---

## Концепция

Свободный canvas для планирования **всего проекта клонирования** — не одного конструкта, а цепочки: источники → ПЦР → сборки → финальные конструкты. Каждая плазмида — кликабельный элемент (мини-стадион/кольцо), раскрывается в блоки.

**Аналог:** Miro / draw.io, но специализированный для молекулярной биологии.

---

## Два уровня canvas

### Уровень 1: Construct View (есть)
Один конструкт. Blocks / Sequence / Map / Racetrack. Работает сейчас.

### Уровень 2: Project Flow (НОВОЕ)
Весь проект. Несколько конструктов + связи между ними (ПЦР, assembly, трансформация).

```
┌─────────────────────────────────────────────────────────┐
│  PROJECT FLOW CANVAS                                     │
│                                                          │
│  [P46] ──PCR 1──┐                                       │
│  [P46] ──PCR 2──┤                                       │
│                  ├── Gibson ── [P43_U3afu_Hyg]           │
│  [P43] ──PCR 3──┤                                       │
│  [P43] ──PCR 4──┘                                       │
│                                                          │
│  [P43_U3afu_Hyg] ──PCR 9── [P50_U3afu_pyrG/5]          │
│                                                          │
│  [275] + [279] ──OV-PCR── [gRNA(pks4)] ──PCR 5          │
│  [275] + [285] ──OV-PCR── [gRNA(pepA)] ──PCR 6          │
│                                                          │
│  клик на [P43_U3afu_Hyg] → раскрывается в рейстрек     │
└─────────────────────────────────────────────────────────┘
```

---

## Технология: @xyflow/react (React Flow v12)

### Почему React Flow

- MIT license, 20k+ stars, активно поддерживается
- Нативная поддержка: nodes, edges, handles (connection points), pan/zoom, minimap
- Custom nodes (наш PartNode, AssemblyNode, PCRNode)
- Auto-layout через dagre/elkjs
- Drag + snap-to-grid
- Undo/redo поддержка (интеграция с Zustand)

### Установка

```bash
cd gui/designer && npm install @xyflow/react
```

---

## Типы нод (элементов на canvas)

### 1. PlasmidNode — плазмида/конструкт

```
┌──────────────────┐
│  ○ pUC19         │   ← мини-кольцо + имя
│  2.7 kb circular │
│  3 regions       │
└──────────────────┘
```

- **Collapsed:** карточка с иконкой, именем, размером
- **Expanded:** встроенный мини-стадион (RacetrackView в миниатюре)
- **Double-click:** открыть полный Construct View
- **Handles:** входные (левый) + выходные (правый) connection points
- **Цвет:** по типу (source = жёлтый, intermediate = синий, final = зелёный)

### 2. PCRNode — ПЦР-реакция

```
┌──────────┐
│  PCR 1   │
│  🧪      │
│  1000 bp │
└──────────┘
```

- Template (from edge) + primers → product
- Параметры: Tm, elongation time, polymerase
- **Handle in:** template DNA
- **Handle out:** PCR product

### 3. AssemblyNode — реакция сборки

```
┌──────────────┐
│  Gibson      │
│  ⚗️          │
│  3 fragments │
└──────────────┘
```

- Тип: Gibson / Golden Gate / Overlap / KLD
- **Multiple handles in** (фрагменты)
- **Handle out:** собранный конструкт
- Клик → настройки сборки (уже реализовано в текущем UI)

### 4. OligoNode — олигонуклеотид / gRNA

```
┌────────────┐
│ gRNA(pks4) │
│ 🧬 150 bp  │
└────────────┘
```

- Для gRNA, адаптеров, линкеров
- Синтетический (не из плазмиды)

### 5. CheckpointNode — контрольная точка

```
┌───────────────┐
│ ✓ Секвенс     │
│ на сиквенс: 6 │
└───────────────┘
```

- Верификация: секвенирование, colony PCR, рестрикционный анализ
- Группировка конструктов для отправки

---

## Типы рёбер (связей)

### TemplateEdge — "использовать как матрицу"
```
[P46] ──template── [PCR 1]
```
Пунктирная серая линия. Означает: P46 используется как матрица для ПЦР.

### ProductEdge — "результат реакции"
```
[PCR 1] ──product── [P43_U3afu_Hyg]
```
Сплошная цветная линия. ПЦР-продукт → входит в сборку.

### FragmentEdge — "фрагмент для сборки"
```
[PCR 1] ──fragment── [Gibson assembly]
[PCR 2] ──fragment── [Gibson assembly]
```
Зелёная линия. Множественные входы в один AssemblyNode.

---

## Hybrid layout: auto-grid + свободное перетаскивание

### Начальное размещение: dagre auto-layout
```js
import Dagre from '@dagrejs/dagre';

function autoLayout(nodes, edges) {
  const g = new Dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'LR', ranksep: 120, nodesep: 60 });
  
  nodes.forEach(n => g.setNode(n.id, { width: n.width || 180, height: n.height || 80 }));
  edges.forEach(e => g.setEdge(e.source, e.target));
  
  Dagre.layout(g);
  
  return nodes.map(n => {
    const pos = g.node(n.id);
    return { ...n, position: { x: pos.x - (n.width || 180) / 2, y: pos.y - (n.height || 80) / 2 } };
  });
}
```

### После auto-layout — свободное перетаскивание
Пользователь может двигать ноды куда хочет. Позиции сохраняются в store.

### Snap-to-grid
```jsx
<ReactFlow snapToGrid snapGrid={[20, 20]} ... />
```

---

## Интеграция с Zustand store

### Новый slice: `projectFlowSlice.js`

```js
export const createProjectFlowSlice = (set, get) => ({
  // Ноды и рёбра для React Flow
  flowNodes: [],    // [{ id, type, position, data }]
  flowEdges: [],    // [{ id, source, target, type }]
  
  setFlowNodes: (nodes) => set({ flowNodes: nodes }),
  setFlowEdges: (edges) => set({ flowEdges: edges }),
  
  // Добавить конструкт на canvas
  addFlowPlasmid: (partId) => set(state => {
    const part = state.parts.find(p => p.id === partId);
    if (!part) return;
    state.flowNodes.push({
      id: `plasmid-${partId}`,
      type: 'plasmidNode',
      position: { x: 100, y: 100 }, // auto-layout потом подвинет
      data: { partId, name: part.name, size: part.length, topology: part.topology },
    });
  }),
  
  // Добавить ПЦР ноду
  addFlowPCR: (templateId, productName) => { ... },
  
  // Добавить assembly ноду
  addFlowAssembly: (method, fragmentIds) => { ... },
  
  // Связать две ноды
  connectFlow: (sourceId, targetId, edgeType) => { ... },
  
  // Auto-layout
  autoLayoutFlow: () => { ... },
});
```

---

## Компонентная архитектура

```
App.jsx
├── ProjectBar (вкладки: конструкты)
├── PartsPalette (слева)
│
├── (текущий) DesignCanvas — Construct View
│   ├── Blocks (Ctrl+1)
│   ├── Sequence (Ctrl+2)
│   ├── Map (Ctrl+3)
│   └── Racetrack (Ctrl+4)
│
└── (НОВЫЙ) ProjectFlowCanvas — Project View
    ├── ReactFlow container
    ├── Custom nodes:
    │   ├── PlasmidNode.jsx — мини-стадион, collapsed/expanded
    │   ├── PCRNode.jsx — ПЦР реакция
    │   ├── AssemblyNode.jsx — Gibson/GG/etc
    │   ├── OligoNode.jsx — gRNA, адаптеры
    │   └── CheckpointNode.jsx — секвенирование, QC
    ├── Custom edges:
    │   ├── TemplateEdge — пунктирная (матрица)
    │   ├── ProductEdge — сплошная (продукт)
    │   └── FragmentEdge — зелёная (фрагмент для сборки)
    ├── FlowToolbar — добавить ноду, auto-layout, zoom
    └── FlowMinimap — мини-карта в углу
```

### Переключение между уровнями

```jsx
// В ProjectBar или в toolbar:
<button onClick={() => setView('construct')}>📦 Конструкт</button>
<button onClick={() => setView('flow')}>🔬 Проект</button>
```

- **Construct View:** текущий canvas (blocks/sequence/map/racetrack) для ОДНОГО выбранного конструкта
- **Project Flow:** свободный canvas с ВСЕМИ конструктами проекта

**Связь:** двойной клик на PlasmidNode в Project Flow → переключение на Construct View для этого конструкта.

---

## UX Flow: как пользователь работает

### 1. Начало проекта
Пользователь в Project Flow. Пустой canvas.

### 2. Добавление источников
Drag плазмиду из палитки → PlasmidNode на canvas. Или [+] → dropdown.

### 3. Планирование ПЦР
Клик на ручку PlasmidNode → "ПЦР от этого фрагмента" → PCRNode появляется с edge.

### 4. Сборка
Протащить edges от нескольких PCR/фрагментов к AssemblyNode → "Gibson" / "Golden Gate".

### 5. Результат
AssemblyNode → edge → новый PlasmidNode (конструкт-продукт).

### 6. Детализация
Double-click на любой PlasmidNode → Construct View (стадион) для детального дизайна праймеров.

### 7. QC
Добавить CheckpointNode → подключить конструкты для секвенирования.

---

## Оценка сложности

| Компонент | Строк | Сложность |
|-----------|-------|-----------|
| @xyflow/react setup | ~50 | Низкая (npm install + basic config) |
| PlasmidNode.jsx | ~120 | Средняя (collapsed/expanded, mini-racetrack) |
| PCRNode.jsx | ~60 | Низкая |
| AssemblyNode.jsx | ~80 | Средняя |
| OligoNode.jsx | ~40 | Низкая |
| CheckpointNode.jsx | ~40 | Низкая |
| Custom edges (3 типа) | ~60 | Низкая |
| ProjectFlowCanvas.jsx | ~200 | Средняя (ReactFlow wrapper + toolbar) |
| projectFlowSlice.js | ~150 | Средняя (nodes/edges CRUD + auto-layout) |
| Auto-layout (dagre) | ~40 | Низкая |
| **Итого** | **~840** | **2-3 блока работы** |

---

## Фазы реализации

### Фаза 1 (Блок 11): Базовый Project Flow
- npm install @xyflow/react dagre
- ProjectFlowCanvas с PlasmidNode (collapsed)
- Drag из палитки → PlasmidNode
- Кнопка "Проект" / "Конструкт" для переключения
- Auto-layout (dagre LR)
- Double-click → Construct View

### Фаза 2 (Блок 12): Операции
- PCRNode, AssemblyNode
- Edges (template, product, fragment)
- Добавление PCR/Assembly из контекстного меню ноды
- MIRO-style: + на handle ноды → dropdown (PCR / Assembly / etc)

### Фаза 3 (Блок 13): Polish + planning mode
- "Режим планирования ПЦР" — показать все ПЦР реакции с праймерами
- CheckpointNode
- OligoNode
- Таблица "на секвенирование" (автогенерация из CheckpointNode)
- Export flow as image/PDF
