# Agarose Gel — алгоритмическая модель

**Статус:** FUTURE / NOT ACTIVE
**Принцип:** детерминированная относительная модель для планирования, не симуляция конкретной лабораторной установки.

## 1. Почему модель ограничена

Для линейной dsDNA зависимость расстояния от размера в рабочем диапазоне обычно оценивают по логарифму длины и marker calibration. Но mobility также зависит от концентрации/структуры агарозы, напряжённости поля, буфера и размера. Топологические формы circular DNA мигрируют иначе, а порядок open-circle/linear/supercoiled не является универсальным для всех условий.

Следствия для продукта:

- linear fragments получают относительную migration position;
- uncut circular DNA не получает linear-size projection;
- gel percentage выбирает **профиль планирования**, а не обещает физический пробег;
- ось не подписывается сантиметрами/минутами;
- модель MUST называться estimate/preview.

Научные источники и разрешённые формулировки: [`REFERENCES.md`](./REFERENCES.md).

## 2. Чистая граница

Рекомендуемый public API:

```js
deriveGelLane(laneSpec, source, {
  enzymeRegistry,
  profile,
})

projectGelBands(bands, {
  profile,
  runFraction,
  contrast,
})
```

`deriveGelLane` владеет биологией и массой.
`projectGelBands` владеет только display projection.
Изменение `runFraction`/`contrast` MUST NOT повторять restriction scan.

Результат:

```js
{
  laneId,
  status,
  sourceBp,
  cuts,
  bands: [{
    id,
    bp,
    massNg,
    components,
  }],
  diagnostics: [],
}
```

Проекция:

```js
{
  ...band,
  migration: {
    status: 'visible' | 'above-range' | 'below-range',
    fraction: number | null,
  },
  displayIntensity: number,
}
```

## 3. Validation

### 3.1 Lane

- `laneId`, `sourceEntryId` — непустые строки;
- `mode` — closed union;
- `dnaMassNg` — finite `> 0`, рекомендуемый UI range 1–5000 ng;
- `enzymes` — array, максимум 4 unique strings;
- lane settings не приводятся через `|0`, `Number(...)` или truthy/falsy defaults.

### 3.2 Source

- `sequence` — непустая string;
- `topology` — строго `'linear' | 'circular'`;
- длина sequence — safe integer по определению JS string length;
- invalid/ambiguous DNA letters не мешают поиску recognition site только если действующий restriction core их уже определённо трактует. Gel layer не вводит новую нормализацию;
- unknown topology fail-closed.

### 3.3 Profile

```js
{
  id,
  agarosePct,
  minBp,
  maxBp,
}
```

Все значения finite; `minBp >= 1`; `maxBp > minBp`; `agarosePct > 0`.

## 4. Профили

Нормативные MVP defaults:

| id | UI label | agarose | planning window |
|---|---|---:|---:|
| `large` | крупные фрагменты | 0,7% | 800–20 000 bp |
| `standard` | стандарт | 1,0% | 400–12 000 bp |
| `small` | малые фрагменты | 1,5% | 150–4 000 bp |
| `fine` | мелкие фрагменты | 2,0% | 80–2 000 bp |

Эти окна — консервативные UI presets для относительного preview, не физические пределы любой агарозы. Пользовательская документация MUST содержать эту оговорку.

## 5. Получение фрагментов

### 5.1 Intact linear

```js
fragments = [{
  bp: sequence.length,
  start: 0,
  end: sequence.length,
  wraps: false,
  kind: 'intact',
}]
```

### 5.2 Complete digest

Сначала валидируются все enzyme names против merged RE registry. Затем используется topology-aware restriction core.

Адаптация существующего `digestFragments`:

```text
linear + 0 cuts   -> add intact full-length fragment
circular + 0 cuts -> unsupported uncut-circular
otherwise         -> use returned fragments
```

Инварианты:

```text
sum(bp) === sourceBp
every bp is a positive safe integer
no zero-length fragment
no duplicate physical cut boundary
target ranges remain topology-correct
```

`digestFragments` перед standalone reuse SHOULD быть перенесён в нейтральный `src/lib/` модуль. Старый CanvasSkeleton path остаётся re-export shim до отдельного удаления, чтобы не менять assembly consumers одним большим диффом.

## 6. Масса

Для `k` fragments полного digest:

```js
mass_i = laneMassNg * bp_i / sourceBp
```

Для intact linear:

```js
mass = laneMassNg
```

Группировка:

```js
groups = Map<integerBp, FragmentComponent[]>
```

На группу:

```js
{
  bp,
  massNg: sum(component.massNg),
  components: [...],
}
```

Численная проверка:

```js
Math.abs(sumBandMass - laneMassNg) <=
  Math.max(1e-9, laneMassNg * Number.EPSILON * fragmentCount * 8)
```

Если проверка не проходит, результат `fault`; значения не «нормализуются» молча.

## 7. Migration position

Для `minBp <= bp <= maxBp`:

```js
const top = Math.log10(profile.maxBp);
const bottom = Math.log10(profile.minBp);
const value = Math.log10(bp);
const normalized = (top - value) / (top - bottom);
const fraction = runFraction * normalized;
```

Где:

- `runFraction` finite в `[0.2, 1]`;
- `fraction = 0` — лунка;
- `fraction = 1` — нижняя граница usable gel area;
- renderer переводит fraction в pixels после layout.

Классификация:

```text
bp > maxBp -> above-range, fraction = null
bp < minBp -> below-range, fraction = null
else       -> visible
```

Свойства:

- для любых `a < b` внутри range: `fraction(a) > fraction(b)`;
- profile bounds отображаются точно в 0 и `runFraction`;
- функция не зависит от lane order, viewport pixels и contrast;
- resize не меняет biological result.

## 8. Display intensity

Яркость — визуальная компрессия динамического диапазона, не densitometry.

Reference mass:

```js
const referenceMassNg = 500;
const base = Math.log1p(massNg / 5) / Math.log1p(referenceMassNg / 5);
const clamped = Math.min(1, Math.max(0, base));
const displayIntensity = clamped ** (1 / contrast);
```

Где `contrast` finite в `[0.5, 2]`.

Свойства:

- mass 0 → intensity 0;
- больше mass не даёт меньшую intensity;
- saturation bounded `[0, 1]`;
- contrast не меняет mass или migration;
- marker `relativeMass` сначала нормализуется в marker-local mass scale, затем проходит тот же display projection.

Renderer MAY использовать intensity для alpha и thickness, но MUST оставить минимально различимый контур каждой ненулевой visible band.

## 9. Stable identity и сортировка

Sample band id:

```text
sample:<laneId>:<bp>
```

Marker band id:

```text
ladder:<presetId>:<bp>
```

Bands внутри lane сортируются `bp DESC`, затем id. Components одинакового размера сортируются по topology-aware coordinate tuple, не по insertion order.

Selected band очищается, если после source/mode/enzyme update id больше не существует.

## 10. Derived-only UI model

В Zustand сохраняются:

- session settings;
- lane specs;
- selected band id.

Не сохраняются:

- sequence copies;
- cuts;
- fragments;
- migration pixels;
- display intensity;
- rendered SVG geometry.

Это исключает два biological sources of truth.

## 11. Синхронность, worker и stale-drop

На старте реализации обязателен benchmark:

```text
A: 12 × (10 kbp × 2 enzymes)
B: 1 × (1 Mb × 2 enzymes)
C: 12 × visual-only reprojection
```

Если A и B стабильно укладываются в <50 ms на эталонной слабой машине, расчёт MAY остаться синхронным и pure.

Если B нарушает gate:

- restriction derivation переносится в worker;
- request включает lane generation/source identity;
- response проходит closed validation;
- source/mode/enzyme change отменяет или stale-drops предыдущий result;
- visual-only projection остаётся на UI thread;
- одна lane fault не стирает другие.

Нельзя добавлять worker «на всякий случай» до измерения. Нельзя оставлять measured long task на UI thread ради меньшего числа файлов.

## 12. Typed outcomes

Рекомендуемые коды:

```text
INVALID_GEL_INPUT
INVALID_GEL_PROFILE
INVALID_GEL_LADDER
INVALID_ENZYME
MISSING_SOURCE
UNSUPPORTED_TOPOLOGY
GEL_COMPUTE_FAILURE
CANCELLED
```

Biological expected states (`uncut-circular`, `no-cut-linear`, `above-range`) не маскируются generic Error. Programmer/data-contract faults не превращаются в biological states.

## 13. Обязательные property tests

1. Mass conservation.
2. Fragment-length conservation.
3. Migration strict monotonicity.
4. Projection invariance to lane order.
5. Visual-only controls do not call digest core.
6. Identical-size grouping is commutative and deterministic.
7. Circular rotation does not change multiset of fragment lengths for the same rotated sites.
8. Repeated derivation is byte-identical after stable serialization.
