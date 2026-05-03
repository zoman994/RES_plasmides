# Sprint Map-WS-1 — PlasmidWorkspace Skeleton

**Статус:** ✅ РЕАЛИЗОВАНО 21.04.2026 (визуальная приёмка PASS после fix + fix-B, см. PROJECT_STATE.md)
**Тип:** feature, первый в серии Map-WS-N (4 спринта по publication-quality views)
**Оценка:** 1–1.5 недели Code (один связный коммит-сет K1–K4)
**Зависимости:** нет (работает на текущей v0.5.1-alpha)
**Откладывает:** Sprint 2a.2 (FragmentEditor state hook) — вернёмся после Map-WS-1..4 или по желанию Игоря.

---

## 1. Контекст

Игорь задал новое направление: «основные виды программы» — сделать 4 view modes DesignCanvas (`blocks` / `sequence` / `map` / `racetrack`) публикационного качества. Flow-модель из QnA-сессии 23.04.2026:

- **Entry 1** — сборка: работа с блоками → жест «замкнуть в кольцо» → workspace с плазмидой. Блоки доступны как один из views (свободное переключение между `blocks` / `map` / `sequence` / `racetrack` — все views работают на одной и той же плазмиде).
- **Entry 2** — прямой заход: открыли готовую плазмиду → тот же workspace, те же views. Блоки представляют её как декомпозицию фич (виртуальные блоки).
- Plasmid-workspace = multi-pane: основной pane (переключаемый между views) + **постоянный вторичный sequence-pane под ним** с synced cursor: клик на карте/блоке → позиция в sequence-pane → scroll.
- Мутации inline: (1) клик по AA → popup с кодон-таблицей, (2) text selection + keypress → substitute. Primer design сохраняется.

**Серия спринтов Map-WS-N (план; будет корректироваться):**

| Спринт | Scope | Зависимость |
|---|---|---|
| **Map-WS-1 Skeleton** *(эта спека)* | Multi-pane layout для DesignCanvas Map view + synced cursor + read-only sequence-pane | — |
| Map-WS-2 | Inline мутации (AA popup + text-select+type) + primer overlays на карте | Map-WS-1 |
| Map-WS-3 | Feature editing inline (rename / colour / type / delete) | Map-WS-2 |
| Map-WS-4 | Entry 2 routing + унификация PlasmidViewer на `<PlasmidWorkspace>` | Map-WS-3 |

---

## 2. Стратегия

Выделить из DesignCanvas Map view branch (сейчас — `<PlasmidMap fragments.../>` полноэкранно) отдельный компонент `<PlasmidWorkspace>` с vertical resizable split: сверху — PlasmidMap (как есть сейчас), снизу — новый `<SequencePane>`, который перерендеривает логику sequence-rendering из PlasmidViewer (строки ~228–430) в переиспользуемый read-only компонент.

**Synced cursor** через `selectedRegionId` state на уровне `<PlasmidWorkspace>`: клик по subarc в PlasmidMap → `onSelectFragment(idx)` → workspace матчит idx на region.id → оба pane получают `selectedRegionId`. SequencePane делает scrollIntoView к строке с этим регионом, PlasmidMap подсвечивает subarc.

**Sequence-pane read-only в этом спринте.** Мутации inline — осознанно отложено в Map-WS-2. Причина: мутации на assembly-level (несколько fragments, primer re-design, overlap zones) — новый flow, не быстрый переиспользование существующих popup'ов.

---

## 3. Scope

### IN

- Новый компонент `gui/designer/src/components/PlasmidWorkspace.jsx` (~10–12 KB): vertical split layout, resizable splitter (ручная реализация на mouse handlers), state `selectedRegionId`, прокидывание вниз.
- Новый компонент `gui/designer/src/components/SequencePane.jsx` (~15–18 KB): двойная цепь + region coloring + RE cut markers + AA translation + scrollIntoView. **Read-only.** Перенос логики из PlasmidViewer.jsx строки ~228–430 (sequence section) + вспомогательные (`seqLines`, `regionAt`, `isIntron`, CDS validation — что относится к чистому rendering sequence).
- Правка `gui/designer/src/components/DesignCanvas.jsx` строки ~404–411 (Map view branch): было `<PlasmidMap fragments... />`, станет `<PlasmidWorkspace fragments... />`.
- `PlasmidWorkspace` прокидывает вниз в PlasmidMap все текущие props (`fragments, constructName, totalBp, junctions, primers, onRemove, onFlip, onSplitSignal, onEditFragment`) — их DesignCanvas передавал напрямую, API PlasmidMap **не меняется**.
- Дополнительный prop на PlasmidMap: **не добавляется** в Map-WS-1. Используем существующий `onSelectFragment` — PlasmidWorkspace интерпретирует его идентично тому, как это делает PlasmidViewer (`idx → regions[idx].id → selectedRegionId`).
- `<SequencePane>` принимает: `fragments`, `primers` (для отображения в будущем), `selectedRegionId`, `onSelectRegion`. Concatenated sequence + annotations вычисляются внутри SequencePane из `fragments` (с учётом fragment offset и ориентации — функция `buildPlasmidSequence(fragments)` пишется новая, принципы те же что в `SequenceMapView.jsx`).
- Unit-тесты: минимум на `buildPlasmidSequence` (concatenation + offset annotations), render-тест на PlasmidWorkspace (mount + синхронизация `selectedRegionId` при клике). Ориентир: +5..+10 Vitest.

### OUT

- Inline мутации в sequence-pane (AA popup, DNA popup, text-selection + keypress) — **Map-WS-2**.
- Primer overlays на карте (стрелки fwd/rev + overlap zones как визуальные элементы) — **Map-WS-2**.
- Feature editing inline (rename / colour / type / delete через клик по subarc) — **Map-WS-3**.
- Right-side AnnotationEditor pane (как в PlasmidViewer) — **Map-WS-3** или позже.
- Entry 2 routing: открытие готовой плазмиды → в новый workspace вместо PlasmidViewer — **Map-WS-4**.
- Blocks decomposition для Entry 2 (фичи → виртуальные блоки) — **Map-WS-5** или позже.
- Унификация PlasmidViewer на `<PlasmidWorkspace>` — **Map-WS-4**.
- Linear-map для линейных сборок — остаётся circular-only, как сейчас.
- Racetrack multi-pane — не в серии Map-WS, отдельно.
- Rewrite PlasmidMap внутренностей (subarc rendering, RE labels, zoom) — не трогаем, баги V1/V2/V6 остаются OPEN до отдельного UX-спринта по circular map readability.
- Backend (112 pytest) — не трогается.

---

## 4. Архитектурные решения (для DECISIONS.md после приёмки)

1. **`<PlasmidWorkspace>` как wrapper, не подмена PlasmidMap.** PlasmidMap остаётся как есть (34 KB, самодостаточный SVG-renderer кольца). Workspace — thin layer выше: layout + shared state + routing к child panes. Это сохраняет PlasmidMap переиспользуемым в PlasmidViewer (который в Map-WS-1 не трогаем, унификация в Map-WS-4).
2. **`<SequencePane>` как новый компонент, не extract из PlasmidViewer напрямую.** PlasmidViewer sequence section останется как есть (не в этом спринте двигаем). SequencePane пишется как generic переиспользуемый — с прицелом, что в Map-WS-4 PlasmidViewer будет заменить свой inline-sequence на `<SequencePane>`. То есть дубль существует временно (один спринт), потом устраняется. Обоснование: если трогать PlasmidViewer сейчас, приёмка Map-WS-1 становится труднее (два контекста, два workflow, риск регрессии PlasmidViewer-каталога).
3. **Synced cursor через `selectedRegionId` на уровне PlasmidWorkspace**, не в DesignCanvas. Причина: этот state живёт внутри workspace, DesignCanvas о нём знать не должен — выше по дереву он не нужен.
4. **Resize splitter ручной.** Без библиотеки (react-split-pane / react-resizable-panels). Скелет splitter'а — ~30 строк: один state `bottomHeight`, mouseDown на ручке, mouseMove обновляет, mouseUp завершает. Min-height: 100px у обеих panes, начальное — 40% у bottom. **Persist** `bottomHeight` в localStorage под ключом `plasmid-workspace-bottom-h`, чтобы пользователь не выставлял заново при каждом открытии.
5. **SequencePane read-only в Map-WS-1.** Disclaimer в UI не требуется — sequence-pane просто не принимает клики-для-мутации и keypress. Мутации делаются, как сейчас: через blocks view → FragmentEditor. В Map-WS-2 это расширится.
6. **`buildPlasmidSequence(fragments)` helper.** Новая функция в `SequencePane.jsx` (или в `sequence-utils.js` если окажется переиспользуемой — на усмотрение Code). Берёт `fragments: Array<{sequence, annotations?, reversed?}>`, возвращает `{ sequence: string, annotations: Array<{start, end, ...}> }` — concatenated с сдвигом annotations по cumulative offset. Аналогичная логика уже есть частично в `SequenceMapView.jsx`, но он сделан для display-only и не отдаёт чистый computed объект; писать заново ~30 строк проще, чем вытаскивать из SequenceMapView.

---

## 5. Файлы и компоненты

### Новый: `components/PlasmidWorkspace.jsx` (~10–12 KB)

Props (mirror всего что сейчас DesignCanvas передаёт в PlasmidMap, плюс без изменений):

```
<PlasmidWorkspace
  fragments={fragments}
  constructName={constructName}
  totalBp={totalBp}
  junctions={junctions}
  primers={primers}
  onRemove={onRemove}
  onFlip={onFlip}
  onSplitSignal={onSplitSignal}
  onEditFragment={onEditFragment}
/>
```

Структура (логика, не JSX дословно):

- State: `selectedRegionId` (nullable string), `bottomHeight` (number, init из localStorage или 40% контейнера).
- Effect: persist `bottomHeight` в localStorage на изменение.
- Layout: flex-col, top-pane flex-1 с `minHeight: 100`, splitter (6px, cursor `ns-resize`, mouseDown starts drag), bottom-pane `height: bottomHeight`.
- Handlers: `onMapSelect(idx)` — см. `buildPlasmidRegions(fragments)` ниже + `selectedRegionId` update; `onSequenceSelect(regionId)` — прямая установка `selectedRegionId`.
- Резолв `idx → regionId`: aggregated regions (см. §6 ниже про `buildPlasmidRegions`).
- Render: `<PlasmidMap ... onSelectFragment={onMapSelect} />` + splitter + `<SequencePane fragments={fragments} selectedRegionId={selectedRegionId} onSelectRegion={onSequenceSelect} />`.

### Новый: `components/SequencePane.jsx` (~15–18 KB)

Props:

```
<SequencePane
  fragments={fragments}
  primers={primers}
  selectedRegionId={selectedRegionId}
  onSelectRegion={(id) => void}
/>
```

Внутри:
- `useMemo` → `{ seq, annotations }` = `buildPlasmidSequence(fragments)` (новый helper).
- `useMemo` → `regions` = `getRegions(annotations)`.
- `useMemo` → `seqLines` — split seq on CHARS_PER_LINE (80), как в PlasmidViewer.
- `useMemo` → `reCutMap` — scan RE sites через `scanAllSites` (как в PlasmidViewer).
- Sticky header с totalBp.
- Scrollable container, `data-line={lineIdx}` на каждой строке.
- Effect: `selectedRegionId` изменился → scrollIntoView к соответствующей line (логика из PlasmidViewer строки 36–42, переносим 1:1).
- Click по nucleotide → `onSelectRegion(region.id)` (toggle, как в PlasmidViewer).
- **Без** мутаций, без text selection, без keyboard handlers (кроме scroll).

### Изменение: `components/DesignCanvas.jsx`

Map view branch (сейчас строки ~404–411):

```jsx
) : viewMode === 'map' && circular ? (
  <div className="flex-1 flex items-center justify-center overflow-hidden min-h-0">
    <PlasmidMap fragments={fragments} constructName={constructName}
      totalBp={totalBp} junctions={junctions} primers={primers}
      onRemove={onRemove} onFlip={onFlip}
      onSplitSignal={onSplitSignal} onEditFragment={onEditFragment} />
  </div>
) : …
```

Становится:

```jsx
) : viewMode === 'map' && circular ? (
  <div className="flex-1 overflow-hidden min-h-0">
    <PlasmidWorkspace fragments={fragments} constructName={constructName}
      totalBp={totalBp} junctions={junctions} primers={primers}
      onRemove={onRemove} onFlip={onFlip}
      onSplitSignal={onSplitSignal} onEditFragment={onEditFragment} />
  </div>
) : …
```

Импорт `PlasmidMap` остаётся (он может использоваться где-то ещё внутри DesignCanvas, проверить grep'ом — если нет, импорт убирается; заменяется на `PlasmidWorkspace`).

Никаких изменений в state / handlers / других view branches DesignCanvas.

### Не трогаем в этом спринте

- `components/PlasmidMap.jsx` (34 KB) — внутренности, API.
- `components/PlasmidViewer.jsx` (20.6 KB) — inline sequence section останется дублем до Map-WS-4.
- `components/SequenceMapView.jsx` (22.4 KB) — отдельный main-view sequence, не трогаем.
- `components/FragmentEditor/` — не затрагивается (Sprint 2a.2 на паузе, не входит в views-roadmap).
- `components/AnnotationEditor.jsx` — в Map-WS-1 не нужен (right-side pane в Map-WS-3).
- `components/PartBlock.jsx`, `components/JunctionBlock.jsx` — blocks view не трогается.

---

## 6. Технические заметки

### `buildPlasmidSequence(fragments) → { sequence, annotations }`

Исходные данные: `fragments: Array<Fragment>` где `Fragment = { sequence, annotations? = [], reversed?: boolean, name, ... }`.

Выход: `{ sequence: string, annotations: Array<Annotation with start/end in concat coords> }`.

Логика:
- Iterate fragments, для каждого:
  - Если `reversed` — взять revComp sequence и invert annotations (`start = len - ann.end`, `end = len - ann.start`, swap strand если есть).
  - Concatenate на общий string.
  - Shift annotations по cumulative offset.
- Cumulative offset учитывает длину каждого fragment (overlap/junction zones считаются принадлежащими следующему фрагменту — для skeleton это OK, точное поведение junctions в concatenated display — вопрос детализации в Map-WS-2).

Приблизительно 30–40 строк. Pure function, легко тестируется.

### `buildPlasmidRegions(fragments) → regions[]`

Convenience: `getRegions(buildPlasmidSequence(fragments).annotations)`. Используется в PlasmidWorkspace для mapping `idx → regionId` при клике на subarc PlasmidMap'а.

**Альтернатива, если проще:** PlasmidMap уже внутри себя через `getRegions(a.annotations)` извлекает sub-arcs и кликает по их индексу в regions array (в PlasmidViewer `handleMapSelect` полагается именно на это). Значит в PlasmidWorkspace:

```
const { annotations } = buildPlasmidSequence(fragments);
const regions = useMemo(() => getRegions(annotations), [annotations]);
const onMapSelect = (idx) => {
  if (regions.length > idx) {
    setSelectedRegionId(regions[idx].id === selectedRegionId ? null : regions[idx].id);
  }
};
```

Это повторяет `handleMapSelect` из PlasmidViewer 1:1. Переиспользуем mental model.

### Splitter (ручная реализация)

```
const [bottomHeight, setBottomHeight] = useState(() =>
  Number(localStorage.getItem('plasmid-workspace-bottom-h')) || 0 // 0 → will init to 40% via ref
);
const containerRef = useRef(null);
const dragging = useRef(false);

useEffect(() => {
  if (bottomHeight || !containerRef.current) return;
  setBottomHeight(Math.round(containerRef.current.offsetHeight * 0.4));
}, []);

useEffect(() => {
  if (bottomHeight) localStorage.setItem('plasmid-workspace-bottom-h', String(bottomHeight));
}, [bottomHeight]);

const onMouseDown = (e) => { dragging.current = true; e.preventDefault(); };
const onMouseMove = (e) => {
  if (!dragging.current || !containerRef.current) return;
  const rect = containerRef.current.getBoundingClientRect();
  const newH = Math.max(100, Math.min(rect.height - 100, rect.bottom - e.clientY));
  setBottomHeight(newH);
};
const onMouseUp = () => { dragging.current = false; };

useEffect(() => {
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
  return () => {
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
  };
}, []);
```

~35 строк с comments. Локальные listeners (а не inline в splitter div) — чтобы drag работал при уходе курсора за splitter во время drag.

---

## 7. Порядок выполнения

Один спринт с коммит-сетом K1–K4:

- **K1** — helper `buildPlasmidSequence` + unit tests (+5 Vitest). Ориентир: отдельный файл `sequence-utils.js` или inline в `SequencePane.jsx` (Code решает).
- **K2** — компонент `<SequencePane>`, рендер без synced cursor пока (просто отображает concatenated sequence). Visual smoke: в DesignCanvas Map view временно можно рендерить `<SequencePane>` рядом с PlasmidMap для проверки. Тест: mount в jsdom, матч рендер-фрагментов (+3 Vitest).
- **K3** — компонент `<PlasmidWorkspace>` с splitter + `selectedRegionId` + wire up PlasmidMap и SequencePane. Synced cursor работает в обе стороны. Test: mount, клик по subarc → scrollIntoView вызывается (mock), клик по nucleotide → region highlight на map (через state) (+2 Vitest).
- **K4** — интеграция в DesignCanvas.jsx, замена Map view branch. Проверка: `npx vitest run` 738+ → 748+, `npx vite build` clean. Smoke в DesignCanvas реальный на circular assembly (pET-like).

Оценка: 1–1.5 недели Code. Если после K2 Code видит что SequencePane сильно превышает 20 KB — стоп, пересмотр (см. риски).

---

## 8. STOP-условие и формат отчёта

### STOP

После K4 Code останавливается. НЕ:
- обновляет PROJECT_STATE.md (журнал сессии — Chat следующей сессии после визуальной приёмки);
- обновляет DECISIONS.md (решения из §4 — Chat после приёмки);
- трогает BUGS.md (V1/V2/V6/V21 остаются OPEN — circular map readability не в скоупе Map-WS-1);
- начинает Map-WS-2 или любую другую задачу;
- перемещает спеку в `docs/archive/`.

### Отчёт (в CURRENT_TASK.md)

- Коммит-хэши K1–K4.
- Размеры новых файлов: `PlasmidWorkspace.jsx` (KB), `SequencePane.jsx` (KB).
- Финальный размер `DesignCanvas.jsx` (ожидание: чуть уменьшится — минус inline Map view branch + импорт изменён).
- Vitest: финальный N/N (baseline 738, ожидание +5..+10).
- pytest: 112/112 (не трогалось).
- Build: clean / warnings / errors.
- Тестов переписано: ожидание 0.
- Отклонения от спеки (§3/§4/§6) — явный блок.
- Size budget: новые нарушители / warning signal / OK.

---

## 9. Риски

1. **SequencePane разрастается >20 KB (soft .jsx 30 KB).** PlasmidViewer inline sequence — ~200 строк без CDS validation. Если добавить reCutMap + AA translation + scrollIntoView + buildPlasmidSequence вызов — ~400 строк ≈ 20 KB. Впритык. Митигация: если Code видит >25 KB после K2 — разделить на `SequencePane.jsx` + `sequence-pane/renderers.jsx` или `sequence-pane/lines.js` (вспомогательные helpers).
2. **`buildPlasmidSequence` edge cases:** reversed fragments, fragments с пересекающимися annotations, fragments без annotations. Unit-тесты должны покрывать все три. Митигация: K1 — прописываем 5+ тестов до написания компонента.
3. **Synced cursor бесконечный цикл.** Click по region в sequence → setSelectedRegionId → useEffect scrollIntoView → если scrollIntoView случайно триггерит click на следующем nucleotide → rerun. Митигация: scrollIntoView `block: 'nearest'`, клик имеет `onClick` не `onPointerDown`. Стандартная защита.
4. **Splitter drag: performance при больших плазмидах.** Sequence-pane с 10000 bp рендерит ~130 строк по 80 char, всего ~10000 span'ов. При drag splitter — re-render SequencePane целиком. Митигация: SequencePane обёрнут в React.memo с сравнением props кроме `selectedRegionId` (это да надо обновлять, но это легкое). Или `useMemo(() => seqLines.map(renderLine), [seqLines, selectedRegionId])`. Code решает в реализации.
5. **localStorage персист `bottomHeight`** может иметь stale значения при смене размера окна. Митигация: clamp при init (`Math.min(savedValue, container.height - 100)`).
6. **DesignCanvas.jsx Map view unused в linear mode.** Сейчас Map view доступен только когда `circular`. Это остаётся. Workspace тоже circular-only. Линейные — Map-WS-5 или отдельный спринт, не в Map-WS-серии.
7. **Регрессия PlasmidMap функционала:** PlasmidMap в DesignCanvas сейчас получает `onRemove / onFlip / onSplitSignal / onEditFragment` — эти handlers вызываются через кликабельные кнопки в popup'е по PlasmidMap. Если PlasmidWorkspace забудет их прокинуть — функционал сломается. Митигация: явный список props в §5, Code прокидывает все без изменений.

---

## 10. Открытые вопросы (не блокируют Map-WS-1)

1. **Junction sequence в concatenated seq для sequence-pane.** Сейчас junctions не имеют своей sequence (это overlap zone, просто идентичный конец одного fragment и начало следующего). При concatenation junction = просто границы. Для `blocks` view junction — отдельный элемент визуализации. Для sequence-pane — просто стык fragments. ОК для Map-WS-1. В Map-WS-2 при добавлении primer overlays возможно потребуется показать overlap-zone как самостоятельный segment с двойной подсветкой — отдельный UX-вопрос.
2. **AA translation для fragments без `type === 'CDS'`.** PlasmidViewer translates только под CDS/gene regions. В assembly fragments могут быть не CDS (promoters, terminators). В SequencePane держим ту же логику — AA только под CDS/gene. ОК для Map-WS-1.
3. **RE sites отображение на sequence-pane.** PlasmidViewer показывает через `reCutMap` маркеры `▼`. В SequencePane переиспользуем. Но RE visibility controls (showReSites, reFilter) — в PlasmidMap берутся из Zustand store. SequencePane тоже тянет из store? Или из PlasmidMap props? Для Map-WS-1: **тянет из store напрямую** (`useStore`), как PlasmidMap. Synced toggle через store.
4. **Entry 2 routing — когда?** Зафиксировано: Map-WS-4. До этого PlasmidViewer остаётся как модалка.
5. **`splitGroupFullSequence` поле** (Sprint 1.7 K11) не передаётся в PlasmidWorkspace — оно для FragmentEditor full-view. Не релевантно Map-WS-1. Если Code наткнётся на edge case в assembly с split-group fragments — просто concatenated как все остальные.

---

## 11. Проверка визуальной приёмки (следующая Chat-сессия)

После K4 Игорь проводит smoke на живом UI:

1. Открыть DesignCanvas с circular assembly (pET-like, 3+ фрагмента).
2. Переключиться в Map view (Ctrl+3). Вместо полноэкранной карты — split: сверху карта, снизу sequence.
3. Клик по subarc аннотации на карте → sequence pane скроллится к соответствующему region, subarc и sequence highlighted.
4. Клик по нуклеотиду в sequence → subarc на карте подсвечивается (если nucleotide попал в region).
5. Drag splitter посередине — heights меняются, minHeight работает (нельзя схлопнуть меньше 100px), position персистится после refresh.
6. Все текущие controls PlasmidMap (RE toggle, zoom, pan, wheel, click по fragment → context buttons remove/flip/split/edit) продолжают работать.
7. Переключение на blocks view (Ctrl+1), sequence view (Ctrl+2), racetrack (Ctrl+4) — работает как раньше, workspace только в Map.
8. Для линейной сборки Map mode недоступен (как сейчас) — переключение блокировано.
9. Нет регрессии PlasmidViewer — модалку из каталога открыть, убедиться что всё работает как раньше.
10. Билд clean, все 738+ тестов зелёные.

Ожидание: multi-pane layout работает, synced cursor работает, **мутации не работают** (это Map-WS-2).

---

_Конец спеки. Размер: ~22 KB._
