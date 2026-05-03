# BodgeGene — Racetrack Canvas: дизайн-спецификация

**Дата:** 30 марта 2026  
**Статус:** Дизайн  
**Прототип:** `docs/racetrack-miro-prototype.html` (открой в браузере)

---

## Концепция

Circular конструкты = **стадион (racetrack)** + **MIRO-коннекторы**. Блоки на овале, вставка через клик на `+` между блоками → dropdown с библиотекой.

Четвёртый viewMode (`'racetrack'`, Ctrl+4), только для circular.

---

## Layout алгоритм

```js
const cx = W / 2, cy = H / 2;
const rx = W * 0.38, ry = H * 0.35;       // радиусы овала
const totalBp = fragments.reduce((s, f) => s + f.length, 0);
let cumAngle = -Math.PI / 2;               // старт с 12 часов

positions = fragments.map(frag => {
  const fraction = frag.length / totalBp;
  const arcAngle = fraction * 2 * Math.PI;
  const midAngle = cumAngle + arcAngle / 2;
  const blockW = Math.max(60, Math.min(140, fraction * W * 0.8));
  const x = cx + rx * Math.cos(midAngle) - blockW / 2;
  const y = cy + ry * Math.sin(midAngle) - 20;
  cumAngle += arcAngle;
  return { x, y, w: blockW, h: 42, midAngle, endAngle: cumAngle };
});
```

Junction кривые: Quadratic Bezier, контрольная точка на 70% радиуса → тянет к центру.

---

## MIRO-style коннекторы (основной способ сборки)

### Почему это лучше drag-and-drop

1. **Позиционная точность** — вставляешь именно между PglaA и eGFP
2. **Быстрее** — два клика вместо find→drag→drop
3. **Поиск встроен** — фильтр прямо в dropdown
4. **Import из junction** — "Import from file..." в конце
5. **Linear + Circular** — одна логика, два layout

### Connector point (+)
- Позиция: середина junction (Безье t=0.5)
- 20×20px circle, white fill, 2px #94A3B8 border
- Hover: border→#3B82F6, scale(1.3), fill→#EFF6FF

### Dropdown при клике
```
┌─────────────────────────┐
│ 🔍 Search library...    │
├─────────────────────────┤
│ PROMOTERS               │
│  ● P_glaA        850 bp│
│  ● P_tef1        420 bp│
│ CODING                  │
│  ● eGFP          720 bp│
│  ● Cas9         4100 bp│
│ TERMINATORS             │
│  ● T_trpC        567 bp│
├─────────────────────────┤
│  ○ Import from file...  │
└─────────────────────────┘
```
- Группировка по типу, фильтрация по имени/типу
- Escape / click outside → закрыть
- Выбор → `fragments.splice(afterIdx + 1, 0, part)` → layout reflow

---

## Компонентная архитектура

```
DesignCanvas.jsx
├── 'blocks'    → текущий flex layout
├── 'sequence'  → SequenceMapView
├── 'map'       → PlasmidMap
└── 'racetrack' → RacetrackView (NEW, Ctrl+4)
                   ├── SVG layer: junction Bezier curves
                   ├── HTML layer: PartBlock (absolute positioned)
                   ├── Connector points (+) на junction
                   └── ConnectorDropdown (createPortal)
```

### Новые файлы

| Файл | Строк | Описание |
|------|-------|----------|
| `RacetrackView.jsx` | ~200 | Layout + SVG + blocks + connectors |
| `ConnectorDropdown.jsx` | ~80 | Dropdown с поиском + groups |
| `racetrack-layout.js` | ~60 | computeRacetrackLayout() |

### ConnectorDropdown.jsx

```jsx
function ConnectorDropdown({ position, afterIdx, parts, onInsert, onClose, onImport }) {
  const [query, setQuery] = useState('');
  const groups = useMemo(() => {
    const filtered = parts.filter(p => 
      p.name.toLowerCase().includes(query.toLowerCase()) ||
      p.type.toLowerCase().includes(query.toLowerCase())
    );
    return groupByCategory(filtered);
  }, [parts, query]);
  
  return createPortal(
    <div style={{ left: position.x, top: position.y }}>
      <input placeholder="Search library..." value={query} onChange={...} />
      {CATEGORY_ORDER.map(cat => /* items */)}
      <div onClick={onImport}>Import from file...</div>
    </div>,
    document.body
  );
}
```

---

## Визуальные правила

### Блоки
- 42px height (compact PartBlock)
- 60-140px width ∝ bp (log scale)
- Цвет по типу из getFragColor
- Hover: box-shadow + tooltip

### Junctions
- Bezier curves, пунктир 5-3
- Цвет по типу: серый (overlap), зелёный (GG), оранжевый (RE)
- `+` connector на середине

### Центр овала
- Имя конструкта + "X.X kb circular"

### Адаптивность
- <4 фрагментов: вытянутый овал
- 4-8: классический стадион
- 9+: блоки уменьшаются

### Анимация
- transition: 300ms cubic-bezier(0.4, 0, 0.2, 1)
- Вставка: fade-in нового, плавное раздвигание

---

## DnD (fallback)

- Drag из палитки работает: позиция определяется углом курсора
- Connector dropdown — основной способ
- Drag — дополнительный

---

## Multi-plasmid canvas (фаза 2)

Несколько стадионов на одном canvas. Drag Part между ними = subcloning.

```
┌────────────────────────────────────┐
│  🏟 pUC19 (2.7 kb)  🏟 pET28 (5.4 kb) │
│   ┌──PglaA──┐         ┌──T7──┐        │
│  │          │        │       │        │
│  └──eGFP───┘         └──Cas9─┘        │
│                                        │
│  🏟 pCas-HygR (12 kb)                 │
│   ┌──HygR──P_tef1──┐                  │
│  └──Cas9──ori──AmpR─┘                 │
└────────────────────────────────────┘
```

Зависит от: RacetrackView, state нормализация (byId), multi-assembly rendering.

---

## Расширения (фаза 3)

- **Drag от коннектора** — зажать + и тянуть → стрелка → отпустить на Part
- **Quick add** — Enter при одном результате поиска
- **Recent** — "Недавно использованные" сверху dropdown
- **Smart suggest** — promoter → предложить CDS; CDS → предложить terminator

---

## Оценка

| Компонент | Строк | Сложность |
|-----------|-------|-----------|
| racetrack-layout.js | ~60 | Средняя |
| RacetrackView.jsx | ~200 | Средняя |
| ConnectorDropdown.jsx | ~80 | Низкая |
| Интеграция DesignCanvas | ~30 | Низкая |
| DnD на racetrack | ~80 | Высокая |
| **Итого** | **~450** | **Один блок** |
