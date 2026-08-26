# SPEC AGAROSE-GEL — виртуальный агарозный гель

**Статус:** FUTURE / NOT ACTIVE
**Тип:** bounded product feature
**Нормативные слова:** MUST / MUST NOT — обязательно; SHOULD — отклонение объясняется; MAY — опция.
**Главная граница:** это инструмент планирования и интерпретации ожидаемого паттерна, не цифровой двойник конкретной камеры, буфера и партии агарозы.

> **Цель.** Биолог выбирает молекулы из библиотеки, задаёт полный рестрикционный дайджест и сразу видит ожидаемые дорожки: маркер, число полос, их относительное положение, размеры, массу и совпавшие по размеру фрагменты. Инструмент не выдаёт неподдержанную топологию или неопределённую лабораторную кинетику за точный результат.

---

## 1. Пользовательский результат

MVP обязан позволять:

1. открыть отдельный инструмент «Гель» из левой панели;
2. добавить до 12 sample-дорожек из канонической библиотеки;
3. добавить или заменить одну marker-дорожку;
4. для каждой sample-дорожки выбрать:
   - целую линейную dsDNA;
   - полный дайджест одной или несколькими классическими Type II рестриктазами;
   - массу внесённой ДНК;
5. видеть ожидаемый набор полос на одной шкале;
6. нажать полосу и получить её размер, расчётную массу, источник и ферменты;
7. отличать:
   - готовую дорожку;
   - неподдержанную неразрезанную кольцевую форму;
   - молекулу без последовательности;
   - фермент без сайта;
   - удалённый или изменившийся источник;
   - внутреннюю ошибку расчёта;
8. уйти в другой workspace и вернуться без потери собранной gel-сессии.

## 2. IN / OUT

### 2.1 Входит в MVP

- linear dsDNA;
- circular и linear complete restriction digest;
- built-in `RE_ENZYMES` и пользовательские Type II из merged RE registry;
- topology-aware cut geometry, включая сайт через origin;
- generic size markers без vendor/trademark-зависимости;
- относительная логарифмическая миграция;
- масса фрагмента и относительная яркость;
- объединение фрагментов с **одинаковым целым размером** в одну наблюдаемую полосу;
- visual overlap близких полос без уверенного заявления, что реальный гель их не разрешит;
- настройки профиля разделения, глубины пробега и контраста;
- light/dark theme, keyboard, focus, zoom/reflow;
- transient gel session в Zustand, без записи в `.bodge` в MVP.

### 2.2 Не входит в MVP

- анализ фотографии настоящего геля;
- распознавание дорожек, background subtraction и densitometry;
- RNA, ssDNA, белковый PAGE и capillary electrophoresis;
- PFGE и уверенное моделирование фрагментов >25 kbp;
- partial digest, star activity, methylation block, degradation и случайный smear;
- гарантированная предсказательная модель supercoiled/open-circle/nicked/concatemer форм;
- точные сантиметры, минуты, напряжение, температура или концентрация красителя;
- доказательство фактического выполнения лабораторного протокола;
- vendor-specific ladder intensity profiles;
- сохранение gel run как evidence или attachment;
- экспорт PNG/PDF;
- изменение `DigestFragmentPicker` или assembly-flow.

Любой пункт OUT требует отдельного scope после принятия MVP.

## 3. Канонические входы

### 3.1 Источник молекулы

Sample lane MUST ссылаться на существующую library entry:

```js
{
  sourceEntryId: string,
  label: string,
  mode: 'linear-intact' | 'complete-digest',
  enzymes: string[],
  dnaMassNg: number
}
```

Последовательность и topology берутся из актуального `entry.payload`, а не копируются в gel store:

```js
{
  sequence: string,
  topology: 'linear' | 'circular'
}
```

Если запись удалена, не содержит непустую последовательность или topology неизвестна, lane MUST стать `incomplete`; старые полосы MUST исчезнуть немедленно.

### 3.2 Рестриктазы

- `complete-digest` MUST использовать один merged registry классических Type II: built-in `RE_ENZYMES` + валидированные пользовательские RE.
- `GG_ENZYMES` MUST NOT попадать в lookup, picker или расчёт.
- Дубликаты имён ферментов удаляются до scan.
- Неизвестное имя фермента MUST давать `invalid-enzyme`, а не молча игнорироваться.
- MVP SHOULD ограничить lane четырьмя выбранными ферментами. Типичный single/double digest остаётся основным flow.

### 3.3 Маркер

Маркер — data preset, а не library entry:

```js
{
  kind: 'ladder',
  presetId: 'generic-1kb' | 'generic-100bp',
  label: string,
  bands: [{ bp: integer, relativeMass: positiveNumber }]
}
```

MVP поставляет два generic preset:

- **1 kb:** 10 000, 8 000, 6 000, 5 000, 4 000, 3 000, 2 000, 1 500, 1 000, 500 bp;
- **100 bp:** 1 500, 1 200, 1 000, 900, 800, 700, 600, 500, 400, 300, 200, 100 bp.

Это визуальные generic markers. UI MUST NOT называть их продуктом конкретного производителя.

## 4. Биологический контракт

### 4.1 Полная линейная молекула

`linear-intact` + topology `linear` даёт ровно один линейный фрагмент длиной `sequence.length`.

`linear-intact` + topology `circular` не даёт полосу. Lane получает состояние:

```js
{
  status: 'unsupported-topology',
  actionHint: 'linearize-or-digest'
}
```

UI объясняет: «Неразрезанная кольцевая плазмида мигрирует в разных конформациях; размер по линейному маркеру здесь не моделируется».

### 4.2 Полный рестрикционный дайджест

Для `N` уникальных физических разрезов:

| Топология | Результат |
|---|---|
| circular, `N = 0` | `uncut-circular`, без смоделированных полос |
| circular, `N = 1` | один линейный фрагмент полной длины |
| circular, `N > 1` | `N` фрагментов между соседними разрезами |
| linear, `N = 0` | один неразрезанный линейный фрагмент полной длины |
| linear, `N > 0` | `N + 1` фрагментов, включая два наружных |

Сумма длин полного дайджеста MUST равняться длине исходной молекулы.

Origin-crossing фрагмент сохраняет два диапазона; для миграции используется его суммарная длина. Координаты не схлопываются в ошибочный `min..max`.

Два фермента, режущие одну физическую связь, создают один cut boundary. В provenance полосы MAY храниться оба имени, но нулевой фрагмент между совпавшими cuts не создаётся.

### 4.3 Масса и яркость

Complete digest предполагает одну копию каждого фрагмента на одну молекулу исходника. Поэтому:

```text
fragmentMassNg = laneMassNg × fragmentBp / sourceBp
```

Инварианты:

- все значения конечные и неотрицательные;
- `sum(fragmentMassNg) = laneMassNg` с числовым допуском;
- яркость полосы монотонна по массе, но визуально насыщается;
- одинаковые размеры в одной lane объединяются: масса суммируется, `components[]` сохраняются;
- одинаковый размер из разных lanes никогда не объединяется.

UI подписывает это как «расчётная масса», а не измеренная концентрация.

### 4.4 Миграция

- Только линейная dsDNA получает числовую migration position.
- Меньший фрагмент внутри поддерживаемого диапазона MUST мигрировать дальше большего.
- Формула детерминирована и основана на `log10(bp)`.
- Значения вне выбранного окна размеров не прижимаются к ложной граничной полосе:
  - слишком большой → `above-range`, остаётся у лунки;
  - слишком маленький → `below-range`, считается ушедшим за фронт.
- UI показывает относительное положение. Он MUST NOT подписывать ось в сантиметрах или минутах.

Точная формула и профили находятся в [`ALGORITHM.md`](./ALGORITHM.md).

## 5. Состояния lane и session

### 5.1 Lane

```text
ready
empty-source
missing-source
invalid-sequence
invalid-enzyme
no-cut-linear
uncut-circular
unsupported-topology
out-of-range
fault
```

`no-cut-linear` является честным результатом с одной полосой.
`uncut-circular` является завершённым, но неподдержанным для размерного моделирования результатом.
`fault` не равен «полос нет».

### 5.2 Session

```js
{
  profileId: 'large' | 'standard' | 'small' | 'fine',
  runFraction: number,
  contrast: number,
  ladder: GelLadderSpec,
  lanes: GelLaneSpec[],
  selectedBandId: string | null
}
```

- Максимум 12 sample lanes + 1 marker lane.
- Lane identity — стабильный UUID/генерируемый id, не индекс массива.
- Reorder не меняет lane identity.
- Derived bands не сохраняются как второй source of truth.
- Любая правка lane пересчитывает только эту lane.

## 6. UX-контракт

- Отдельный workspace `agarose-gel`.
- Левый nav item: «Гель».
- Добавление молекулы — через существующий `LibrarySearchBar`.
- Настройки одной lane — inline; wizard/modal не нужен.
- Основной результат виден постоянно, пока пользователь редактирует lane.
- Добавление lane — не более двух действий: выбрать запись → «Добавить».
- Клик по полосе открывает details panel, а не навигирует в SequenceView.
- Empty, unsupported, fault и ready визуально и текстово различаются.
- Цвет не является единственным носителем состояния.
- Все размеры и массы — моноширинным шрифтом.
- UI strings — только через i18n/действующий string owner.
- Gel canvas использует централизованные semantic tokens; raw hex в JSX запрещён.

Подробная компоновка: [`UX_AND_VISUAL_MODEL.md`](./UX_AND_VISUAL_MODEL.md).

## 7. Производительность

Базовая платформа: 2 физических ядра / 4 потока, 8 GB RAM.

Целевые сценарии:

- 12 lanes × 10 kbp × до 2 ферментов;
- одна 1 Mb molecule × 2 фермента;
- 100 bands в одной lane;
- resize/contrast/selection без повторного restriction scan.

Гейты:

- изменение только visual controls: p95 <100 ms, без restriction rescan;
- обычный расчёт lane: long task <50 ms;
- если 1 Mb × 2 фермента нарушает <50 ms, restriction scan MUST быть вынесен из UI-потока до ship;
- отмена/замена источника не публикует stale bands;
- derived arrays bounded числом cuts/bands, а не длиной молекулы.

## 8. Fail-closed

- Ошибка расчёта одной lane не превращается в пустую дорожку.
- Ошибка одной lane не удаляет доказанные полосы других lanes.
- Неизвестная topology не трактуется как linear.
- Неподдержанная circular conformation не получает фиктивный linear size.
- Невалидные `bp`, `mass`, profile settings или ladder data отвергаются до render.
- `NaN`, `Infinity`, отрицательные и небезопасные целые запрещены.

## 9. Acceptance

Фича принимается только если одновременно:

1. чистый engine проходит topology/mass/migration/validation matrix;
2. мутации «circular no-cut → linear band», «не сохранять массу» и «меньшие едут меньше» дают RED;
3. workspace route и Sidebar работают через существующую history модель;
4. library picker не дублируется;
5. на геле видны marker + linear + circular digest lanes;
6. uncut circular показывает честное ограничение и не рисует fake band;
7. identical-size fragments суммируют массу и сохраняют состав;
8. light/dark, keyboard, narrow width и focus проверены;
9. related tests, полный test-run, lint, build и browser smoke зелёные;
10. размеры новых и изменённых файлов входят в budgets.
