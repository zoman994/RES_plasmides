# Sprint Map-WS-1-fix — патч после приёмки 24.04.2026

**Статус:** ✅ РЕАЛИЗОВАНО 21.04.2026 (визуальная приёмка дала D2 PASS + D1/D3 FAIL → fix-B)
**Тип:** bugfix, 3 последовательные подзадачи (K1–K3), ~0.5–1 день Code.
**Зависимости:** `v0.5.1-alpha`, commit `ea1427a` как базовая точка (финал K1–K4 исходного Map-WS-1).
**Предпосылка:** приёмка Map-WS-1 завершилась FAIL на D1/D2/D3 из CURRENT_TASK.md (sessia 24.04.2026). Карта и sequence-pane живы, но synced cursor полуживой, цвет плоский, правый край пустой. `docs/SPRINT_MAP_WS_1_SKELETON.md` остаётся активным до приёмки этого фикса; `docs/archive/` не трогать.

---

## 1. Контекст

Smoke на «Сборка 5» (4934 bp, 3 фрагмента, circular) на коммите `ea1427a`:

- **D1 — back-sync map→sequence работает в одну сторону.** `PlasmidWorkspace` передаёт `selectedRegionId` в `SequencePane`, но **не в `PlasmidMap`**. `<PlasmidMap>` про внешне-выбранную регион ничего не знает → карта остаётся «немой». Дополнительно: текущий `onSelectFragment(i)` принимает **fragment index**, а `Workspace.onMapSelect` трактует `i` как индекс в агрегированном `regions[]` (построенном через `buildPlasmidSequence`). Для `Сборка 5` (3 фрагмента, разное число региона в каждом) это mis-index — forward синхронизация работает «случайно» на single-fragment и может лажать на multi-fragment.
- **D2 — палитра плоская.** `SequencePane.jsx:108-109/119/148` берёт цвет через `ANNOTATION_COLORS[r.type] || FEATURE_COLORS[r.type] || '#999'`. В assembly-контексте `region.type` приходит в форме, которая в обоих словарях не ключ → fallback `'#999'` / `'#666'`. Все регионы серые/синие.
- **D3 — sequence-pane не занимает full width.** В `SequencePane.jsx` контент `<div className="px-4 py-3 font-mono text-[11px] leading-[18px]">` без `min-w-full`, intrinsic width ~560px (80 × 1ch), справа ~240px белой зоны в scroll-контейнере.

## 2. Стратегия

Добираем **только три вещи**, ничего сверху:

1. `PlasmidMap` получает controlled `selectedRegionId` + новый callback `onSelectRegion(regionId)`. `onSelectFragment` не удаляем — остаётся fallback для arc без regions. В `Workspace` правим mapping так, чтобы selection проходил по `region.id` без индекс-lookup.
2. Новый модуль `feature-palette.js` (15 типов + misc по эталону `design_teasers/feature_palette.html`, stroke `#3A2F1F`), подключается **только** в `SequencePane` и в `PlasmidMap` (sub-arc highlight). Глобальный chrome (paper bg, terra cotta, AnnotationEditor chips) — отложен в Sprint UX-1.
3. Один CSS-класс `min-w-full` на content-div `SequencePane`.

## 3. Scope

**IN (делаем):**
- `PlasmidMap.jsx`: расширить props-сигнатуру, сохранить `region.id` и `region.type` в `rawSubs`, отрисовать highlight, прокинуть `onSelectRegion` с клика по subarc.
- `PlasmidWorkspace.jsx`: передавать `selectedRegionId` в `PlasmidMap`, принимать `onSelectRegion` напрямую, `onSelectFragment` → fallback на первый region фрагмента.
- `feature-palette.js` — новый файл.
- `SequencePane.jsx`: заменить palette lookup на `featureColor(type, name)`, добавить `min-w-full` на content-div.

**OUT (не трогаем в этом спринте):**
- UI chrome, paper-background, terra cotta chrome, AnnotationEditor chips, PartBlock colors — **Sprint UX-1 после Map-WS-4**.
- `PlasmidMap` внутренности beyond highlight-branch и прокидывания callback (subarc layout, tracks, RE labels) — не трогаем.
- `PlasmidViewer`, `SequenceMapView`, `FragmentEditor/`, `AnnotationEditor`, `PartBlock` — не трогаем (палитру к ним применим в UX-1).
- V1/V2/V6/V21 circular map readability — остаются в OPEN для UX-спринта.
- Map-WS-2..4 — следующие спринты после приёмки этого фикса.

## 4. Архитектурные решения (фундамент на будущие спринты)

1. **Controlled selection в PlasmidMap.** Prop `selectedRegionId: string|null` + callback `onSelectRegion(id|null)`. Внутренний local state `selected` (fragment-index) остаётся для UI-поповера с кнопками (remove/flip/split/edit) — этот UX живёт на уровне fragment, не region. Два уровня селекции (fragment-popover vs region-highlight) не пересекаются.
2. **Feature palette как данные, не как тема.** Файл `feature-palette.js` — только data + normalizer `featureColor(type, name?)`. НЕ изменяет `theme.js`, `AnnotationEditor`, `PartBlock`. Это единственный чистый путь ввести палитру точечно, не дёргая 43 места в коде. UX-1 позже вынесет её в общий theme.
3. **Stroke #3A2F1F.** Warm-dark brown как единый stroke для fill-features на paper. Не используется нигде кроме sub-arc highlight и region chips в SequencePane. В UX-1 поднимется в общий контракт.
4. **`region.id` пронизывает контракт карта ↔ sequence.** Не fragment-index, не aggregated-array-index. `id` уже приходит из `getRegions()` (annotation-model.js) — стабилен по фрагменту и переменам.

## 5. K1 — PlasmidMap controlled selection + back-sync

**Файлы:** `gui/designer/src/components/PlasmidMap.jsx`, `gui/designer/src/components/PlasmidWorkspace.jsx`.

### 5.1. PlasmidMap

Расширить props-сигнатуру (текущая строка ~63 `export default function PlasmidMap(...)`):
- Добавить `selectedRegionId` и `onSelectRegion` (оба optional).
- Остальные props без изменений.

В блоке где строятся `rawSubs` (сейчас ~строка 236 в ветке `subArcs ? subArcs.map(r => ({ startBp: r.start, endBp: r.end, color: FEATURE_COLORS[r.type] || a.color, name: r.name, label: r.name }))`):
- Добавить в объект `id: r.id` и `ftype: r.type` (название `ftype` чтобы не конфликтовать с fragment `type`).
- Цвет для subarc брать через `featureColor(r.type, r.name)` (импорт из `feature-palette.js`), fallback на `a.color` как сейчас. Stroke по умолчанию `FEATURE_STROKE` (тот же модуль).

В рендере `subs.map((sub, si) => <path ... />)` (сейчас ~строка 248):
- Вычислить `const isRegSel = selectedRegionId && sub.id === selectedRegionId;`.
- Когда `isRegSel`: `stroke={FEATURE_STROKE}`, `strokeWidth={1.5}`, `opacity={1}`, добавить к `style` `filter: 'drop-shadow(0 0 1.5px rgba(58,47,31,0.35))'`.
- Когда нет: как сейчас (`stroke="#fff"`, `strokeWidth={0.3}`).
- Обновить `onClick`: вместо `onSelectFragment?.(i)` сделать `if (onSelectRegion) { onSelectRegion(sub.id === selectedRegionId ? null : sub.id); } else { onSelectFragment?.(i); }`. Local `setSelected(isSel ? null : i)` остаётся — он управляет fragment-popover.

Для ветки «single solid arc, без subs» (строка ~229 `if (!hasSubs)`): `onClick` не трогаем, `onSelectFragment?.(i)` остаётся единственным сигналом. Эта ветка не имеет regions, так что back-sync для неё не нужен.

### 5.2. PlasmidWorkspace

- Добавить `selectedRegionId` в проброс: `<PlasmidMap ... selectedRegionId={selectedRegionId} onSelectRegion={setSelectedRegionId} onSelectFragment={onMapFragmentFallback} />`.
- `onMapSelect` (сейчас идёт через индекс в `regions`) **удалить**. Заменить на `onMapFragmentFallback(i)` — берёт **первый region i-го фрагмента** через корректный lookup: построить `regionsByFragment` из `buildPlasmidSequence.fragmentOffsets` (если helper уже отдаёт) либо вычислить offsets тут же, взять `regions.find(r => r.start >= offset[i] && r.start < offset[i+1])`. Если у фрагмента нет regions — сбрасывать selection (`setSelectedRegionId(null)`).
- Переменная `regions` на уровне Workspace остаётся нужной только для fallback-lookup.

### 5.3. Тесты

Добавить 2 теста в `__tests__/plasmid-workspace.test.jsx` (дополнить существующий файл, не создавать новый):

1. **Back-sync: sequence→map.** mount Workspace, задать `selectedRegionId` через `onSequenceSelect` (имитировать через query-selector клика в SequencePane или через пропс-инъекцию), проверить что у PlasmidMap subarc с matching id получил класс/атрибут highlight (через `data-testid` на path, см. 5.4). Ожидание: 1 подсвеченный, остальные — нет.
2. **Fallback: fragment без regions.** Собрать сборку с одним фрагментом без annotations, кликнуть по arc → `selectedRegionId` остаётся null (не падает), консоль чистая.

Regression-тест на forward sync (map→sequence) — добавить к тесту если его ещё нет или обновить существующий: клик по subarc с `data-testid="sub-arc-<id>"` → `selectedRegionId` равен `id`, повторный клик — `null`.

### 5.4. Маркер `data-testid`

В `PlasmidMap` рендере subarc: `<path ... data-testid={\`sub-arc-${sub.id}\`} ... />`. Нужен для тестов и для будущих e2e.

## 6. K2 — feature-palette.js + применение в SequencePane

**Файлы:** новый `gui/designer/src/feature-palette.js`, правка `gui/designer/src/components/SequencePane.jsx` (+ импорт в `PlasmidMap.jsx` из K1).

### 6.1. Модуль `feature-palette.js`

Экспортирует:
- `FEATURE_STROKE = '#3A2F1F'` — warm-dark brown (не чёрный), единый контур для fill-features на paper.
- `FEATURE_COLORS_V2` — объект по `design_teasers/feature_palette.html:10-50` (15 семейств + `misc`):

  | key | hex | семейство |
  |---|---|---|
  | promoter | `#F2C84B` | yellow |
  | ori | `#E8B333` | amber |
  | terminator | `#D97B3B` | burnt orange |
  | CDS | `#C8D570` | chartreuse (generic) |
  | resistance | `#9BC07C` | sage |
  | reporter | `#7CB49E` | teal |
  | LTR | `#ECB383` | peach |
  | enhancer | `#F2CDA9` | light peach |
  | signal | `#B8AA8A` | taupe |
  | tag | `#E091A2` | rose |
  | his | `#B884B8` | lilac |
  | linker | `#C4B8A8` | warm gray |
  | primer_bind | `#9EBAD9` | sky |
  | operator | `#6DA4C4` | medium blue |
  | cap | `#A5CFD5` | cyan |
  | misc | `#EEE7D5` | ivory (fallback, НЕ серый) |

- `featureColor(type, name?) → hex` — normalizer:
  - Если `type` напрямую ключ `FEATURE_COLORS_V2` — вернуть.
  - GenBank-aliases (case-insensitive): `promotor`→promoter, `rep_origin`→ori, `terminator_region`→terminator, `sig_peptide`|`polyA_signal`|`RBS`→signal, `primer_binding_site`→primer_bind, `CAP_binding_site`|`protein_bind`→cap (только если имя матчится `/CAP|CRP|GATA/i`, иначе operator), `LTR`|`long_terminal_repeat`→LTR, `enhancer`|`RRE`→enhancer.
  - Если `type === 'CDS'` или `'gene'` — refine через `name` (regex на name, case-insensitive, порядок важен):
    1. `/^(amp|kan|cm|hyg|neo|puro|bleo|tet|zeo|spec)r?\b/i` → resistance
    2. `/GFP|mCherry|mKate|mPlum|YFP|CFP|BFP|RFP|dsRed|luciferase|luc|lacZ|lacZα|β-gal/i` → reporter
    3. `/6×?His|HIS|GST|MBP|SUMO|Halo|MBP|Strep-tag|Strep[-_]?tag/i` → his
    4. `/3×?FLAG|FLAG|HA[-_]?tag|Myc|V5|T7[-_]?tag/i` → tag
    5. `/GS[-_]?linker|linker|TEV|PreScission/i` → linker
    6. default → CDS (chartreuse).
  - `type === 'misc_feature'` или `'unknown'` или пустой — `misc`.
  - Иначе — `misc` (ivory) как финальный fallback. **Никогда не возвращать `#999` или серый.**

**Тесты (`__tests__/feature-palette.test.js`, новый файл, ~8 тестов):**
- Прямые ключи (promoter, ori, CDS, misc).
- GenBank-aliases (promotor, rep_origin, RBS, protein_bind с именем `CAP operator` vs `lac operator`).
- CDS→refine: `AmpR`→resistance, `GFP`→reporter, `6×His`→his, `3×FLAG`→tag, `GS-linker`→linker, `lacI`→CDS.
- Unknown/empty type → misc.
- `FEATURE_STROKE` экспортируется и равен `#3A2F1F`.

### 6.2. SequencePane

Импорт:
```
import { featureColor, FEATURE_STROKE } from '../feature-palette';
```

Убрать импорты `ANNOTATION_COLORS` и `FEATURE_COLORS` (строки 22–23) — они остаются в других компонентах, в SequencePane больше не нужны.

Три места (по тексту текущего файла):
1. Region-header label (line ~108–111): цвет через `featureColor(r.type, r.name)`, маленький кружок — тот же цвет, stroke `FEATURE_STROKE` добавить как `border` через inline style (1px, solid).
2. Sense strand span (line ~119): `regionColor = featureColor(region.type, region.name)`. Значения alpha остаются (`+ '26'` для обычного, `+ '58'` для selected, `+ '08'` для intron hatched).
3. Antisense strand span (line ~148): аналогично, `featureColor(region.type, region.name)` + alpha `12`/`30`.

В region-header label добавить small stroke-ring (`box-shadow: inset 0 0 0 1px #3A2F1F` или `border: 1px solid var(--bio-stroke)` — выбирает Code, главное чтобы круг имел тёплый контур, не default ring).

### 6.3. Проверка `buildPlasmidSequence`

**Потенциальная ловушка:** если `plasmid-sequence.js` не протаскивает `type` в region (например, `type: a.type` игнорируется или перезаписывается) — `featureColor` получит undefined → misc. Code **перед K2**: `rg -n "type" gui/designer/src/plasmid-sequence.js` + прочитать helper. Если `annotations[i].type` не сохраняется — починить (одна строка) в том же коммите K2. Если сохраняется — просто продолжить.

### 6.4. Регрессия-чеки

- Остальные компоненты с `FEATURE_COLORS` / `ANNOTATION_COLORS` (PlasmidViewer, PartBlock, AnnotationEditor, SequenceMapView, theme.js импортёры) **не трогаются** — их палитра не меняется. Это сознательно: общий UX-refresh — Sprint UX-1.
- `AnnotationEditor` chips, `PartBlock` colors, `PlasmidViewer.jsx` sequence view — остаются с текущими цветами. Визуальная несогласованность карта+SequencePane (новая палитра) vs остальные — **принимается на время**, фиксируется в `DECISIONS.md` после приёмки.

## 7. K3 — SequencePane full width

**Файл:** `gui/designer/src/components/SequencePane.jsx`.

Один CSS-класс. Текущая строка (в районе ~103):
```
<div className="px-4 py-3 font-mono text-[11px] leading-[18px]">
```
Заменить на:
```
<div className="px-4 py-3 font-mono text-[11px] leading-[18px] min-w-full">
```

Тест: render в jsdom с imitированием container 800px — content-div `offsetWidth ≥ 800`. +1 тест в `__tests__/sequence-pane.test.jsx`.

Если `min-w-full` не даёт эффекта в jsdom (возможно, у jsdom issues с offsetWidth) — snapshot check на className, достаточно.

## 8. Порядок выполнения

1. **K2 первым** (палитра как отдельный модуль) — независимо, легко тестируется. ~1.5 ч.
2. **K1** — опирается на featureColor для sub-arc color в PlasmidMap. ~2 ч.
3. **K3** — 15 минут.
4. `npx vitest run` — baseline 756, ожидание 756 + 8 (feature-palette) + 3 (workspace) + 1 (sequence-pane) = **768 ± 2**. pytest не трогается (112/112).
5. `npx vite build` — clean, warnings только pre-existing.

Итого: **~4 часа работы + тесты + build**.

## 9. STOP-условие

После commit K3 Code **останавливается**. НЕ делает: обновление PROJECT_STATE / DECISIONS / BUGS / archive; не начинает Sprint UX-1 и Map-WS-2; не переносит `SPRINT_MAP_WS_1_SKELETON.md` (остаётся активным до визуальной приёмки фикса).

## 10. Формат отчёта (Code пишет в CURRENT_TASK.md)

```
## Отчёт Code по Map-WS-1-fix

- K1 коммит: <hash> — <message>
- K2 коммит: <hash> — <message>
- K3 коммит: <hash> — <message>
- Изменения размеров: PlasmidMap.jsx было X → стало Y, SequencePane.jsx было X → стало Y
- Новые файлы: feature-palette.js (Z KB), __tests__/feature-palette.test.js (+8)
- Изменения в plasmid-sequence.js: <нет | описать если пришлось чинить type propagation>
- Vitest: N/N (baseline 756, ожидание 768 ± 2)
- pytest: 112/112 (не трогалось)
- vite build: clean | warnings: <…> | errors: <…>
- Отклонения от спеки (§5/§6/§7): <точный список или «нет»>
- Size budget: OK | нарушители <…>
```

## 11. Риски

1. **`region.id` может отсутствовать в массиве из `buildPlasmidSequence`** — тогда back-sync в K1 ломается. Митигация: в K1 проверить первым шагом что `getRegions(annotations)` отдаёт `id`; если нет, починить в `plasmid-sequence.js` (один мелкий commit до K1 или внутри K1).
2. **Regression в forward sync map→sequence.** Текущий тест в `plasmid-workspace.test.jsx` проходил на случайном alignment fragment-index ↔ region-index. После fix он должен по-прежнему PASS. Митигация: сохранить существующий тест-сценарий, мутировать только если тест явно проверял сломанное поведение (проверить diff).
3. **`featureColor` неадекватно нормализует тип у SnapGene-плазмид** — на каталоге SnapGene `.dna` типы иногда кастомные (например `protein_bind` с разным именем). Митигация: fallback на `misc` (ivory) всегда лучше серого; тест на `misc_feature`→misc покрыт.
4. **Visual diff vs PartBlock/AnnotationEditor/PlasmidViewer.** На приёмке будет видно «карта + sequence в новой палитре, всё остальное в старой». Это осознанно, UX-1 унифицирует позже. Митигация: зафиксировать в отчёте + на приёмке.
5. **`min-w-full` в SequencePane может поломать horizontal scroll на очень узких экранах** (narrow window, <560px). Ожидаемо: content всё равно 560px intrinsic, parent расширяется по min-full = 100%. На 300px parent → content = 560px → появляется horizontal scroll внутри outer `overflow-y-auto`. Это корректно (80 chars не сжать). Митигация: не нужна; если баг проявится — отдельный OPEN.

## 12. Открытые вопросы

1. **`featureColor` для `CDS` без matching name** — дефолт chartreuse (`#C8D570`) или всё же misc (`#EEE7D5`)? В эталонной палитре chartreuse = generic CDS, именно «lacI, rop, cro» — неидентифицируемое кодирующее. Решил: chartreuse. Если Code увидит много серых-ожидаемых CDS на real plasmid и это визуально мешает — заменить на misc и доработать в UX-1.
2. **Stroke в SequencePane region chips** — `box-shadow inset` vs `border`. Второе добавляет 1px к габаритам точки, может сместить сопутствующий текст. Оставляю на Code, оба варианта ОК, главное — warm-dark, не default.
3. **`onSelectRegion(null)` при клике по не-region-области карты (backbone, пустое место).** Сейчас local `setSelected(null)` на `onMouseLeave` SVG — для fragment-popover. Для region clear — нужен ли? В Map-WS-1 pane-клик в SequencePane по пустой области не сбрасывает регион (не проверял). Оставляю как есть — поведение соответствует исходному Map-WS-1 (toggle on same region). Для UX-1 вернёмся.
4. **Feature palette в `theme.js`** — не трогаем сейчас. Риск: в Sprint UX-1 будет дублирование (`FEATURE_COLORS` в theme.js + `FEATURE_COLORS_V2` в feature-palette.js). План UX-1: мигрировать theme.js → feature-palette.js, удалить дубль. Сейчас — **две palette co-exist**, это accepted technical debt на один спринт.
