# Sprint Map-WS-1-fix-B — патч после приёмки 21.04.2026

**Статус:** ✅ РЕАЛИЗОВАНО 21.04.2026 (визуальная приёмка PASS на «Сборка 7», см. PROJECT_STATE.md)
**Тип:** bugfix, 5 подзадач (K4.1–K4.5), ~0.5 дня Code.
**База:** `v0.5.1-alpha`, коммит `a7cbbee` (финал Map-WS-1-fix K1–K3).
**Предпосылка:** приёмка Map-WS-1-fix на «Сборка 7» (whole-plasmid import) дала FAIL на D1 и D3. D2 PASS. Новая находка — нечитаемые белые labels на карте поверх pastel palette. `SPRINT_MAP_WS_1_SKELETON.md` и `SPRINT_MAP_WS_1_FIX.md` остаются активными до приёмки этого патча.

---

## 1. Контекст

Полный разбор трёх проблем — в `CURRENT_TASK.md` блок «Приёмка 21.04.2026». Здесь коротко:

- **D1**: `annotation-model.js:getRegions` не генерирует `id` для annotations, у которых его нет. Каталожные импорты через визард («use whole») приходят без id → `sub.id = undefined` в `PlasmidMap.rawSubs` → `onSubClick` всегда падает в fallback `onSelectFragment(i)` → `Workspace.onMapFragmentFallback(i)` выделяет `regionsByFragment[i][0]` (первый region фрагмента), не тот, по которому кликнули. `SequencePane.handleNucleotideClick` аналогично пушит `undefined` в `setSelectedRegionId` → `isRegSel` всегда false → highlight на карте нулевой.
- **D3**: `min-w-full` на content-div SequencePane формально сработал (div = 100% parent), но внутри `whitespace-pre` spans `inline-block w-[1ch]` с фиксированным `CHARS_PER_LINE = 80` занимают только ~560px из ~1500px pane. Справа пустое пространство, region-backgrounds на spans — тоже только в левой трети.
- **Новая находка — labels**: `PlasmidMap` в двух местах рисует `<text fill='#fff'>` (sub-arc label ~строка 327, feature arc label ~строка 491) + direction-arrow polygon `fill='#fff'` (~строка 353). На новой pastel палитре белый не контрастит. На старой насыщенной FEATURE_COLORS читалось, но теперь нет.

## 2. Стратегия

Пять мелких правок, все мехАНистические, **без архитектурных изменений**:

1. Нормализация `id` в `getRegions` (одно место, все consumers чинятся автоматически) + defensive guard в `SequencePane` + рефакторинг Workspace на общий `getRegions`.
2. Тексты и стрелки на карте — warm-dark-brown `FEATURE_STROKE` вместо `#fff` (тот же модуль `feature-palette.js`, что применялся в K1/K2).
3. Responsive `charsPerLine` в `SequencePane` по `containerRef.offsetWidth` через `ResizeObserver`, clamp 60–120, кратность 10 (GenBank-habit-compat).

## 3. Scope

**IN:**
- `annotation-model.js` — `getRegions` + тесты.
- `components/PlasmidWorkspace.jsx` — `regionsByFragment` через `getRegions`.
- `components/SequencePane.jsx` — defensive guard, responsive charsPerLine, ResizeObserver.
- `components/PlasmidMap.jsx` — 3 точечные замены `fill='#fff'` → `fill={FEATURE_STROKE}`, чистка `textShadow`.

**OUT:**
- Импортёр (`snapgene_parser.py`, `auto-annotate.js`, `CatalogPanel`, store-slices) — **не трогаем**. Fix на read-path.
- `feature-palette.js` — **не трогаем** (палитра зафиксирована, D2 PASS).
- `PartBlock`, `AnnotationEditor`, `PlasmidViewer`, `SequenceMapView`, `theme.js` — не трогаем (Sprint UX-1).
- Map-WS-2..4, V1/V2/V6/V21/V22/V23/V24/V27 OPEN баги — не трогаем.

## 4. Архитектурные решения

1. **`id` — read-path contract.** `getRegions` гарантирует `id` у каждого возвращённого region. Если исходная annotation без id — генерируется deterministic fallback `region:${start}:${end}:${type}:${name || ''}`. Стабилен между рендерами (pure функция от полей, которые не меняются). Существующий `seen = Set` dedup в PlasmidMap по `${r.start}-${r.end}-${r.type}` остаётся корректным.
2. **Upstream id generation — deferred.** Идеальный fix — в импортёре ставить `crypto.randomUUID()` при парсинге `.dna`/GenBank. Не делаем сейчас: (а) трогает больше точек, (б) backward-compat: старые `.bodgegene` проекты пользователей идут без id в annotations, они тоже должны читаться. Read-path normalize закрывает и future-imports, и legacy storage. Upstream id — отдельная story для v1.0.
3. **Labels через `FEATURE_STROKE`.** Единая warm-dark-brown `#3A2F1F` для всех labels и directional markers поверх pastel. Адаптивный `textColorForBg(hex)` overkill: все текущие цвета палитры пастельные, warm-dark читается на каждом.
4. **Responsive charsPerLine — GenBank-habit-compat.** Кратность 10 (80/90/100/110/120), min 60, max 120. ResizeObserver на containerRef. Биологи привыкли к 80 в печатных отчётах; 90/100/110/120 тоже читаются без обучения. >120 делает строку слишком длинной для глаза; <60 тесно для AA-стрипа.

## 5. K4.1 — `annotation-model.js:getRegions` id fallback

**Файл:** `gui/designer/src/annotation-model.js`.

Функция `getRegions(annotations)` сейчас — чистый `filter(a => a.level === 'region')`. Переписать: после filter делать `.map(a => a.id ? a : { ...a, id: ... })`, где id deterministic:

```
region:${a.start}:${a.end}:${a.type || 'unknown'}:${a.name || ''}
```

Не мутировать исходный объект — возвращать новый spread'ом. Строка простая, не выделять в отдельную helper-функцию.

**Тесты** (новый файл `__tests__/annotation-model-get-regions.test.js`, ~4 теста):

1. `getRegions` возвращает id для annotation без id; id детерминированный (два вызова — одинаковый id).
2. `getRegions` не затирает существующий id.
3. Два разных region с одинаковым type/name, но разными start — разные id.
4. Пустой массив / null / undefined — пустой массив (regression-страховка).

## 6. K4.2 — `SequencePane.handleNucleotideClick` defensive guard

**Файл:** `gui/designer/src/components/SequencePane.jsx`.

Текущая функция:
```
const handleNucleotideClick = (region) => {
  if (!region || !onSelectRegion) return;
  onSelectRegion(region.id === selectedRegionId ? null : region.id);
};
```

Добавить проверку `region.id != null` перед вызовом — после K4.1 быть не должно, но страховка от будущих регрессий (напр. если источник аннотаций новый). Падение в noop вместо пуша `undefined` в state.

Тест: `handleNucleotideClick` с region без id — `onSelectRegion` НЕ вызван (+1 тест к существующему `sequence-pane.test.jsx`).

## 7. K4.3 — `PlasmidWorkspace.regionsByFragment` через `getRegions`

**Файл:** `gui/designer/src/components/PlasmidWorkspace.jsx`.

Текущий код строит `regionsByFragment` через рукописный filter:
```
const rs = rawAnns.filter(a => a && a.level === 'region' && typeof a.start === 'number');
```

Заменить на `getRegions(rawAnns)` (импорт уже есть по соседним путям; если нет — добавить `import { getRegions } from '../annotation-model'`). `typeof a.start === 'number'` guard можно оставить как дополнительный filter после `getRegions(rawAnns)`, или удалить (в репо нет кейса annotation с level=region без start — проверить и решить).

После K4.1 это автоматически даёт fallback id для fallback-пути `onMapFragmentFallback`, так что `frs[0].id` всегда валиден. Тесты существующие `plasmid-workspace.test.jsx` должны остаться PASS.

## 8. K4.4 — PlasmidMap labels: `#fff` → `FEATURE_STROKE`

**Файл:** `gui/designer/src/components/PlasmidMap.jsx`.

Три точки правки:

1. **Sub-arc label** (~строка 327, внутри `subs.map` второго прохода для textPath):
   ```
   style={{ fontSize: arcLen < 40 ? '5px' : '7px', fill: '#fff', fontWeight: 500 }}
   ```
   → `fill: FEATURE_STROKE`. Импорт `FEATURE_STROKE` уже есть (K2). `textShadow` нет в этом месте.

2. **Direction arrow polygon** (~строка 353, после feature arcs):
   ```
   fill="#fff" opacity={0.5}
   ```
   → `fill={FEATURE_STROKE}`, `opacity={0.6}` (darker fill на pastel нужен чуть больше opacity для visibility, но не максимум — остаётся декоративным).

3. **Feature arc label** (~строка 491, в textPath-цикле по `arcs`):
   ```
   <text ... fill="#fff" fontWeight={600}
     style={{ pointerEvents: 'none', textShadow: '0 0 3px rgba(0,0,0,0.3)' }}>
   ```
   → `fill={FEATURE_STROKE}`, `textShadow: 'none'` (warm-dark на pastel контрастен сам по себе, shadow только мутит).

**Что НЕ менять:**
- Hover tooltip text (строка ~500) — на тёмном rect-фоне, остаётся `fill="#fff"`.
- Center construct name + `{totalBp} п.н.` (строки ~474–475) — на белом фоне карты, уже dark (`#1a1a1a` и `#888`), не трогать.
- Primer label text (строка ~410) — на white-filled rect, уже `#333`.
- RE label text (строка ~448) — уже `fill={color}` (красный/оранжевый), не трогать.
- Junction hover label (~строка 367) — `fill='#3b82f6'`, blue, достаточно контраст.
- Zoom controls (HTML, не SVG).

**Тесты:** по существующим тестам PlasmidMap (если они проверяют label fill) — возможно потребуется minor update snapshot. Если тестов нет на этот конкретный стиль — новых не добавлять (визуальный контраст проверяется приёмкой).

## 9. K4.5 — SequencePane responsive `charsPerLine`

**Файл:** `gui/designer/src/components/SequencePane.jsx`.

**Логика:**
- Константа `CHARS_PER_LINE = 80` → state `const [charsPerLine, setCharsPerLine] = useState(80);`.
- Измеритель ширины символа: жёсткий `CHAR_PX = 7.3` (11px monospace `JetBrains Mono` через system font — Tailwind `font-mono`). Для pixel-perfect измерения — span с `1234567890` + `offsetWidth / 10` один раз при mount; но для первого прохода можно `7.3` константой.
- `ResizeObserver` на `containerRef.current` (scroll-контейнер `<div className="flex-1 overflow-y-auto">`). При resize:
  ```
  const available = containerRef.current.offsetWidth - 32; // px-4 × 2 = 32px паддинг
  const raw = Math.floor(available / CHAR_PX);
  const clamped = Math.max(60, Math.min(120, raw));
  const snapped = Math.floor(clamped / 10) * 10;
  if (snapped !== charsPerLine) setCharsPerLine(snapped);
  ```
- Заменить все `CHARS_PER_LINE` в useMemo для `seqLines`, `lineEnd`, `lineRegions`, `lineCDS` и т.д. на state `charsPerLine`.
- При изменении `charsPerLine` useMemo `seqLines` перестраивается (зависимость).

**Initial render:** до первого ResizeObserver callback — держать 80. Это безопасный default.

**Снять** `min-w-full` с content-div, который ставился в K3 — теперь не нужен, строки будут заполнять pane-ширину автоматически (при `charsPerLine` адаптивном). Оставить класс можно, он безвреден, но лучше убрать для чистоты.

**Тесты** (новый тест в `sequence-pane.test.jsx`):
1. `charsPerLine` = 80 при offsetWidth = 0 (jsdom без layout) — регрессия-дефолт.
2. Mock `offsetWidth = 900` → `charsPerLine` ≈ 110 после resize-trigger. В jsdom ResizeObserver мокать вручную (устанавливать state напрямую через TestingLibrary `act`).
3. Regression: `seqLines` длина корректна при `charsPerLine = 100` для 1000bp → 10 lines.

**Edge cases (не критичные, можно упомянуть в комменте):**
- Browser без ResizeObserver — fallback на `window.resize` + useEffect или просто 80 (all modern browsers support RO, не заморачиваться).
- Pane в collapsed state (offsetWidth = 0) — `snapped = 60` (min clamp). Когда развернут — ResizeObserver перевычислит.

## 10. Порядок выполнения

1. **K4.1** (getRegions id) — первым, независимый, unlocks остальные. ~30 мин + тесты.
2. **K4.2** (defensive guard) — тривиально. ~5 мин.
3. **K4.3** (Workspace → getRegions) — зависит от K4.1 (чтобы получить id). ~10 мин, regression-тесты не меняются.
4. **K4.4** (labels color) — независимый. ~10 мин, snapshot update если нужен.
5. **K4.5** (responsive charsPerLine) — independent, самый мясистый. ~1 ч + тесты.

Итого: **~2 часа работы + тесты + build**.

**Чек после всех коммитов:**
- `npx vitest run` — baseline 768 → ожидание 768 + 4 (getRegions) + 1 (SequencePane guard) + ~2 (responsive) = **775 ± 2**.
- `npx vite build` — clean.
- `npx eslint` — clean.

## 11. STOP-условие

После commit K4.5 Code останавливается. НЕ:
- обновляет `PROJECT_STATE.md`, `DECISIONS.md`, `BUGS.md`;
- архивирует `SPRINT_MAP_WS_1_SKELETON.md`, `SPRINT_MAP_WS_1_FIX.md`, `SPRINT_MAP_WS_1_FIX_B.md`;
- начинает Sprint UX-1 или Map-WS-2;
- трогает импортёр или upstream id-генерацию.

## 12. Формат отчёта (Code пишет в CURRENT_TASK.md)

```
## Отчёт Code по Map-WS-1-fix-B

- K4.1 коммит: <hash> — <message>
- K4.2 коммит: <hash> — <message>
- K4.3 коммит: <hash> — <message>
- K4.4 коммит: <hash> — <message>
- K4.5 коммит: <hash> — <message>
- Изменения размеров: annotation-model.js +N B, SequencePane.jsx +N B, PlasmidWorkspace.jsx ±N B, PlasmidMap.jsx ±N B
- Новые файлы: __tests__/annotation-model-get-regions.test.js (+4)
- Vitest: N/N (baseline 768, ожидание 775 ± 2)
- pytest: 112/112 (не трогалось)
- vite build: clean | warnings: <…> | errors: <…>
- Отклонения от спеки (§5/§6/§7/§8/§9): <точный список или «нет»>
- Size budget: OK | нарушители <…>
```

## 13. Риски

1. **Fallback id collision.** Два разных annotation с одинаковыми `start/end/type/name` получат одинаковый id. Для нормальных плазмид — не возникает (SnapGene уникализирует имена). Для деградированных случаев — dedup в PlasmidMap по тому же ключу сам отфильтрует дубликаты. Не митигируем дополнительно.
2. **`getRegions` после K4.1 меняет API контракт** (возвращает новые объекты вместо прямых ссылок). Если где-то есть `===` сравнение region-объектов между рендерами — сломается. Митигация: grep `getRegions(` перед коммитом, проверить нет ли сравнений. В известных consumers (PlasmidMap, SequencePane, Workspace, PlasmidViewer) сравнения идут по `.id`, не по ссылке — безопасно.
3. **ResizeObserver в jsdom.** Vitest jsdom по умолчанию не имеет ResizeObserver. Нужно мокать или использовать `@vitest/web-dom`. Если ломается существующий тест — mock через `global.ResizeObserver = class { observe(){} unobserve(){} disconnect(){} }` в `setup.js`.
4. **Labels на tiny sub-arc становятся менее заметны.** Warm-dark на малом fontSize 5px может "слиться" со stroke субарки. Митигация: visual-check на приёмке; если мешает — добавить thin paper-white textShadow (`textShadow: '0 0 2px rgba(248,245,238,0.7)'`), не чёрный.
5. **Responsive charsPerLine ломает AA-стрип alignment.** AA рендерится через exonIdx % 3 — привязано к позициям, не к charsPerLine как таковому. Regression-тест в K4.5 покрывает.
6. **Size budget.** Все файлы хорошо в пределах hard лимитов. SequencePane сейчас 11.79 KB + responsive logic ~0.8 KB = ~12.6 KB, далеко от 40 KB hard.

## 14. Открытые вопросы

1. **`CHAR_PX = 7.3` vs actual measurement.** Жёсткое значение подобрано под `JetBrains Mono 11px`. Если шрифт не тот (некоторые системы fallback на системный monospace) — снапп на 80/90 может давать overflow. Альтернатива: на mount измерить через span-reference `'1234567890'`. Overkill для первого подхода, если приёмка покажет problem — добавим. Решение: **жёсткое `7.3` до сигнала о проблеме**.
2. **Clamp 60–120 — достаточно ли?** 4K мониторы с pane 2000+px получат 120, остальное — пусто. Не критично, но теоретически можно поднять max до 160. Решение: **120 до жалобы биолога**; если скажет «всё ещё пусто на 4K» — поднимем.
3. **Убирать ли `textShadow` полностью в K4.4 feature arc label** или оставить лёгкий paper-tint (`rgba(248,245,238,0.4)`)? На chartreuse/sage warm-dark читается отлично без shadow, но paper-tint сгладит тонкие stroke'и textPath. Решение: **убрать полностью**; если визуально мешает — добавим на приёмке.
4. **K4.3 `typeof a.start === 'number'` guard.** В `getRegions` этого сейчас нет. Если annotations в репо реально могут иметь `start = undefined` — `getRegions` вернёт такие с fallback id типа `region:undefined:...`. Проверить grep по созданию annotations; если сомнения — добавить guard в `getRegions` же: `filter(a => a.level === 'region' && typeof a.start === 'number')`. Решение на Code: глянуть два характерных места (snapgene_parser output, auto-annotate output) и решить. Если неясно — defensive: добавить guard.
