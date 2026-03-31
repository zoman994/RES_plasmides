# Project Flow Canvas — Фазы 2+3: Операции + Режим планирования

**Дата:** 31 марта 2026  
**Зависимости:** Block 11 Phase 1 (PlasmidNode, ProjectFlowCanvas, projectFlowSlice)  
**Библиотека:** @xyflow/react (уже установлена)

---

## Фаза 2: Новые типы нод + custom edges + MIRO

### 1. PCRNode.jsx (~100 строк)

**Файл:** `gui/designer/src/components/flow/PCRNode.jsx`

ПЦР-реакция как нода на flow canvas. Принимает template DNA (edge in) → производит PCR product (edge out).

```
┌──────────────────────────┐
│  🧪 PCR 1                │
│  Template: P46            │  ← from incoming edge
│  Product: 1000 bp         │
│  Primers: Fwd/Rev         │  ← кликабельные, показать последовательности
│  Tm: 62°C / 61°C         │
│  Polymerase: Q5           │
└──────────────────────────┘
```

**Props (data):**
```js
{
  label: 'PCR 1',
  templatePartId: string,      // Part ID матрицы
  productName: string,         // имя продукта
  productLength: number,       // bp
  primerFwd: string,           // последовательность (или ID)
  primerRev: string,
  tmFwd: number,
  tmRev: number,
  polymerase: 'Q5' | 'Phusion' | 'Taq' | 'custom',
  elongationTime: string,      // "30s/kb"
}
```

**Handles:**
- Left: `<Handle type="target" position={Position.Left} id="template" />` — template DNA
- Right: `<Handle type="source" position={Position.Right} id="product" />` — PCR product
- Bottom: `<Handle type="source" position={Position.Bottom} id="add" />` — MIRO + (see below)

**Визуал:**
- Скруглённый прямоугольник с зелёной левой полосой
- Иконка 🧪 + "PCR N" заголовок
- Collapsed: имя + product length
- Expanded (клик): все параметры + primer sequences

**Цвет:** border-teal-400, bg-teal-50

---

### 2. AssemblyNode.jsx (~120 строк)

**Файл:** `gui/designer/src/components/flow/AssemblyNode.jsx`

Реакция сборки (Gibson/GG/Overlap/KLD). Принимает несколько фрагментов (edges in) → производит конструкт (edge out).

```
┌──────────────────────────┐
│  ⚗️ Gibson Assembly       │
│  3 fragments              │
│  Method: Gibson           │
│  Expected: 5.6 kb         │
│  Protocol: 50°C, 60 min  │
└──────────────────────────┘
```

**Props (data):**
```js
{
  label: 'Gibson Assembly',
  method: 'gibson' | 'golden_gate' | 'overlap' | 'kld',
  fragmentCount: number,
  expectedSize: number,        // bp
  protocol: string,            // краткое описание
  assemblyId: string | null,   // ссылка на assembly в store (если есть)
}
```

**Handles:**
- Left: `<Handle type="target" position={Position.Left} id="fragment" style={{ top: '30%' }} />` (multiple — ReactFlow позволяет несколько edges в один handle)
- Дополнительные target handles: top, bottom для наглядности при >3 фрагментах
- Right: `<Handle type="source" position={Position.Right} id="product" />` — собранный конструкт

**Визуал по методу:**
| Метод | Цвет border | Иконка |
|-------|-------------|--------|
| gibson | blue-400 | ⚗️ |
| golden_gate | green-400 | 🔶 |
| overlap | blue-300 | ↔ |
| kld | purple-400 | 🔄 |

**Double-click:** Если `assemblyId` → переключить на Construct View этой assembly.

---

### 3. OligoNode.jsx (~60 строк)

**Файл:** `gui/designer/src/components/flow/OligoNode.jsx`

Синтетический олигонуклеотид / gRNA / адаптер / линкер.

```
┌──────────────────┐
│  🧬 gRNA(pks4)   │
│  150 bp           │
│  5'-ATGC...       │  ← первые 20 нт
└──────────────────┘
```

**Props (data):**
```js
{
  label: 'gRNA(pks4)',
  sequence: string,
  length: number,
  type: 'gRNA' | 'adapter' | 'linker' | 'primer' | 'custom',
}
```

**Handles:**
- Right: `<Handle type="source" position={Position.Right} />` — выход (куда этот олиго идёт)

**Визуал:** Маленький, компактный. border-amber-400, bg-amber-50. Для gRNA — зелёный.

---

### 4. Custom Edges — 3 типа

**Файл:** `gui/designer/src/components/flow/FlowEdges.jsx`

Все три типа в одном файле (простые, ~80 строк суммарно).

#### TemplateEdge — матрица для ПЦР
```jsx
import { BaseEdge, getSmoothStepPath } from '@xyflow/react';

function TemplateEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition }) {
  const [path] = getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
  return <BaseEdge id={id} path={path} style={{ stroke: '#94a3b8', strokeDasharray: '6 3', strokeWidth: 1.5 }} />;
}
```
- Пунктирная серая линия
- Label: "template" (опционально)

#### ProductEdge — результат реакции
```jsx
function ProductEdge({ ... }) {
  const [path] = getSmoothStepPath({ ... });
  return <BaseEdge id={id} path={path} style={{ stroke: '#3b82f6', strokeWidth: 2 }} />;
}
```
- Сплошная синяя линия
- Label: product name (опционально)

#### FragmentEdge — фрагмент для сборки
```jsx
function FragmentEdge({ ... }) {
  const [path] = getSmoothStepPath({ ... });
  return <BaseEdge id={id} path={path} style={{ stroke: '#22c55e', strokeWidth: 2 }} />;
}
```
- Сплошная зелёная линия

**Регистрация в ProjectFlowCanvas:**
```js
const edgeTypes = { template: TemplateEdge, product: ProductEdge, fragment: FragmentEdge };
// В <ReactFlow edgeTypes={edgeTypes} ... />
```

**При создании edge — указать тип:**
```js
onFlowConnect: (connection) => {
  // Определить тип по sourceNode и targetNode
  const sourceNode = get().flowNodes.find(n => n.id === connection.source);
  const targetNode = get().flowNodes.find(n => n.id === connection.target);
  
  let edgeType = 'product'; // default
  if (targetNode?.type === 'pcrNode') edgeType = 'template';
  if (targetNode?.type === 'assemblyNode') edgeType = 'fragment';
  
  const updated = addEdge({ ...connection, type: edgeType }, get().flowEdges);
  set(state => { state.flowEdges = updated; }, false, 'onFlowConnect');
},
```

---

### 5. MIRO + на handle — добавление операций

**Концепция:** На каждой ноде (PlasmidNode, PCRNode) — маленький `+` при hover на правом handle. Клик → dropdown: "ПЦР от этого фрагмента" / "В сборку (Gibson)" / "В сборку (GG)" / "Связать с...".

**Реализация — в каждой ноде:**

```jsx
// В PlasmidNode.jsx, PCRNode.jsx — рядом с source Handle:
const [showMenu, setShowMenu] = useState(false);

<div className="absolute -right-3 top-1/2 -translate-y-1/2 z-20"
  onMouseEnter={() => setShowMenu(true)}
  onMouseLeave={() => setShowMenu(false)}>
  <Handle type="source" position={Position.Right} ... />
  
  {showMenu && (
    <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 
      bg-white border rounded-lg shadow-lg py-1 min-w-[180px] z-50">
      <div className="px-3 py-1.5 text-xs hover:bg-teal-50 cursor-pointer"
        onClick={() => addPCRFromNode(id)}>
        🧪 ПЦР от этого фрагмента
      </div>
      <div className="px-3 py-1.5 text-xs hover:bg-blue-50 cursor-pointer"
        onClick={() => addAssemblyFromNode(id, 'gibson')}>
        ⚗️ В сборку (Gibson)
      </div>
      <div className="px-3 py-1.5 text-xs hover:bg-green-50 cursor-pointer"
        onClick={() => addAssemblyFromNode(id, 'golden_gate')}>
        🔶 В сборку (Golden Gate)
      </div>
    </div>
  )}
</div>
```

**Store actions:**
```js
// В projectFlowSlice.js:
addFlowPCR: (sourceNodeId) => set(state => {
  const sourceNode = state.flowNodes.find(n => n.id === sourceNodeId);
  if (!sourceNode) return;
  
  const pcrId = `pcr-${Date.now()}`;
  const pcrNum = state.flowNodes.filter(n => n.type === 'pcrNode').length + 1;
  
  state.flowNodes.push({
    id: pcrId,
    type: 'pcrNode',
    position: { x: sourceNode.position.x + 250, y: sourceNode.position.y },
    data: { label: `PCR ${pcrNum}`, templatePartId: sourceNode.data.partId },
  });
  
  // Auto-create template edge
  state.flowEdges.push({
    id: `e-${sourceNodeId}-${pcrId}`,
    source: sourceNodeId,
    target: pcrId,
    type: 'template',
  });
}, false, 'addFlowPCR'),

addFlowAssembly: (sourceNodeId, method) => set(state => {
  const sourceNode = state.flowNodes.find(n => n.id === sourceNodeId);
  if (!sourceNode) return;
  
  const asmId = `asm-${Date.now()}`;
  state.flowNodes.push({
    id: asmId,
    type: 'assemblyNode',
    position: { x: sourceNode.position.x + 250, y: sourceNode.position.y },
    data: { label: `${method === 'golden_gate' ? 'GG' : 'Gibson'} Assembly`, method, fragmentCount: 1 },
  });
  
  state.flowEdges.push({
    id: `e-${sourceNodeId}-${asmId}`,
    source: sourceNodeId,
    target: asmId,
    type: 'fragment',
  });
}, false, 'addFlowAssembly'),

addFlowOligo: (position) => set(state => {
  const oligoId = `oligo-${Date.now()}`;
  state.flowNodes.push({
    id: oligoId,
    type: 'oligoNode',
    position: position || { x: 100, y: 300 },
    data: { label: 'gRNA', sequence: '', length: 0, type: 'gRNA' },
  });
}, false, 'addFlowOligo'),
```

---

### 6. Обновить ProjectFlowCanvas

**Регистрация новых нод и edges:**
```js
import PCRNode from './PCRNode';
import AssemblyNode from './AssemblyNode';
import OligoNode from './OligoNode';
import { TemplateEdge, ProductEdge, FragmentEdge } from './FlowEdges';

const nodeTypes = {
  plasmidNode: PlasmidNode,
  pcrNode: PCRNode,
  assemblyNode: AssemblyNode,
  oligoNode: OligoNode,
};

const edgeTypes = {
  template: TemplateEdge,
  product: ProductEdge,
  fragment: FragmentEdge,
};
```

**Toolbar — добавить кнопки:**
```jsx
<button onClick={() => addFlowOligo(...)}>+ Олиго/gRNA</button>
```

---

## Фаза 3: Режим планирования + CheckpointNode + Export

### 7. CheckpointNode.jsx (~80 строк)

**Файл:** `gui/designer/src/components/flow/CheckpointNode.jsx`

Контрольная точка — секвенирование, colony PCR, рестрикционный анализ.

```
┌──────────────────────────┐
│  ✓ Секвенирование         │
│  Type: sequencing          │
│  Constructs: 4             │
│  Status: pending           │
└──────────────────────────┘
```

**Props (data):**
```js
{
  label: 'Секвенирование',
  checkType: 'sequencing' | 'colony_pcr' | 'restriction_digest' | 'custom',
  status: 'pending' | 'done' | 'failed',
  notes: string,
}
```

**Handles:** Left target only (принимает конструкты для проверки).

**Визуал:** border-emerald-400, bg-emerald-50. Иконка ✓ для done, ○ для pending, ✗ для failed.

---

### 8. PCR Planning Panel — режим планирования ПЦР

**Файл:** `gui/designer/src/components/flow/PCRPlanningPanel.jsx` (~150 строк)

Панель справа (или снизу) которая показывает ВСЕ PCR-ноды на flow canvas в виде таблицы.

```
┌─────────────────────────────────────────────────┐
│  📋 План ПЦР (8 реакций)                        │
├────┬──────────┬──────────┬────┬────┬────────────┤
│  # │ Template │ Product  │ Fwd│ Rev│ Polymerase │
├────┼──────────┼──────────┼────┼────┼────────────┤
│  1 │ P46      │ gRNA     │ ✓  │ ✓  │ Q5         │
│  2 │ P46      │ PyrG     │ ✓  │ ✓  │ Q5         │
│  3 │ P43      │ vector   │ ✓  │ ✓  │ Q5         │
│  ...                                             │
└─────────────────────────────────────────────────┘
```

**Как реализовать:**
```jsx
function PCRPlanningPanel() {
  const flowNodes = useStore(s => s.flowNodes);
  const parts = useStore(s => s.parts);
  
  const pcrNodes = flowNodes.filter(n => n.type === 'pcrNode');
  
  if (!pcrNodes.length) return null;
  
  return (
    <div className="border-t bg-white p-3 max-h-60 overflow-y-auto">
      <h3 className="text-sm font-semibold mb-2">📋 План ПЦР ({pcrNodes.length} реакций)</h3>
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b text-left text-gray-500">
            <th className="py-1 pr-2">#</th>
            <th className="py-1 pr-2">Матрица</th>
            <th className="py-1 pr-2">Продукт</th>
            <th className="py-1 pr-2">Размер</th>
            <th className="py-1 pr-2">Полимераза</th>
          </tr>
        </thead>
        <tbody>
          {pcrNodes.map((n, i) => {
            const template = parts.find(p => p.id === n.data.templatePartId);
            return (
              <tr key={n.id} className="border-b hover:bg-gray-50">
                <td className="py-1 pr-2 text-gray-400">{i + 1}</td>
                <td className="py-1 pr-2">{template?.name || '?'}</td>
                <td className="py-1 pr-2 font-medium">{n.data.productName || n.data.label}</td>
                <td className="py-1 pr-2">{n.data.productLength || '?'} bp</td>
                <td className="py-1 pr-2">{n.data.polymerase || 'Q5'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
```

**Показывать:** Под ProjectFlowCanvas, видимую по кнопке "📋 План ПЦР" в toolbar.

---

### 9. Sequencing Table — "На секвенирование"

**Файл:** В составе PCRPlanningPanel или отдельный `SequencingTable.jsx` (~80 строк)

Автоматически собирает все конструкты подключённые к CheckpointNode типа 'sequencing'.

```
┌─────────────────────────────────────┐
│  📧 На секвенирование (6 образцов)   │
├────┬──────────────────┬─────────────┤
│  # │ Конструкт        │ Праймер     │
├────┼──────────────────┼─────────────┤
│  1 │ P43_U3afu_Hyg/1  │ M13_F       │
│  2 │ P43_U3afu_Hyg/2  │ M13_F       │
│  3 │ P43_U6tre_PyrG/1 │ M13_F       │
│  ...                                 │
└─────────────────────────────────────┘
```

---

### 10. Export Flow

**Кнопки в toolbar ProjectFlowCanvas:**

#### Export as PNG/SVG
```js
import { toPng, toSvg } from '@xyflow/react';

// Кнопка в toolbar:
<button onClick={() => {
  toPng(document.querySelector('.react-flow'), { quality: 1 })
    .then(url => {
      const a = document.createElement('a');
      a.href = url; a.download = 'project-flow.png'; a.click();
    });
}}>
  📷 Export PNG
</button>
```

Примечание: `toPng` может потребовать `html-to-image` — проверить что @xyflow/react v12 включает эту функцию. Если нет — `npm install html-to-image`.

#### Export as JSON (для воспроизводимости)
```js
<button onClick={() => {
  const data = { nodes: flowNodes, edges: flowEdges, version: '1.0' };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'project-flow.json'; a.click();
}}>
  💾 Export JSON
</button>
```

---

## Обновления в Store

### Новые actions в projectFlowSlice.js:

```js
addFlowPCR: (sourceNodeId) => set(state => { ... }),
addFlowAssembly: (sourceNodeId, method) => set(state => { ... }),
addFlowOligo: (position) => set(state => { ... }),
addFlowCheckpoint: (checkType, position) => set(state => { ... }),

// Обновить данные ноды
updateFlowNodeData: (nodeId, newData) => set(state => {
  const node = state.flowNodes.find(n => n.id === nodeId);
  if (node) Object.assign(node.data, newData);
}, false, 'updateFlowNodeData'),
```

### Обновить onFlowConnect для auto-type edges:

```js
onFlowConnect: (connection) => {
  const sourceNode = get().flowNodes.find(n => n.id === connection.source);
  const targetNode = get().flowNodes.find(n => n.id === connection.target);
  
  let edgeType = 'product';
  if (targetNode?.type === 'pcrNode') edgeType = 'template';
  if (targetNode?.type === 'assemblyNode') edgeType = 'fragment';
  
  const newEdge = { ...connection, type: edgeType, id: `e-${connection.source}-${connection.target}-${Date.now()}` };
  const updated = addEdge(newEdge, get().flowEdges);
  set(state => { state.flowEdges = updated; }, false, 'onFlowConnect');
},
```

---

## Обновить dagre layout

Auto-layout должен учитывать разные размеры нод:

```js
autoLayoutFlow: () => {
  const { flowNodes, flowEdges } = get();
  if (flowNodes.length === 0) return;

  const g = new Dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'LR', ranksep: 150, nodesep: 60 });

  const NODE_SIZES = {
    plasmidNode: { width: 180, height: 80 },
    pcrNode: { width: 200, height: 90 },
    assemblyNode: { width: 200, height: 100 },
    oligoNode: { width: 140, height: 60 },
    checkpointNode: { width: 180, height: 70 },
  };

  for (const n of flowNodes) {
    const size = NODE_SIZES[n.type] || { width: 180, height: 80 };
    g.setNode(n.id, size);
  }
  for (const e of flowEdges) {
    g.setEdge(e.source, e.target);
  }
  Dagre.layout(g);

  set(state => {
    for (const n of state.flowNodes) {
      const pos = g.node(n.id);
      const size = NODE_SIZES[n.type] || { width: 180, height: 80 };
      if (pos) {
        n.position = { x: pos.x - size.width / 2, y: pos.y - size.height / 2 };
      }
    }
  }, false, 'autoLayoutFlow');
},
```

---

## Критические паттерны (из Phase 1)

1. **Immer + @xyflow:** `get().flowNodes` → `applyNodeChanges` → `set(state => { state.flowNodes = updated })`. НИКОГДА `set({...}, true)`.

2. **memo() для всех custom nodes** — ReactFlow перерендерит canvas часто.

3. **react-dnd + ReactFlow** — `!monitor.didDrop()` guard на drop.

4. **Custom nodes ОБЯЗАНЫ иметь Handle** — без Handle нельзя создавать edges.
