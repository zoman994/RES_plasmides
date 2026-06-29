# Система фич / аннотаций BodgeGene — справочник + логика + реестр нарушений

**Статус:** живой справочник (полировка фич, Игорь /loop 29.06.2026). Источник истины по поведению — код; здесь — консолидированная логика + аудит. Дев-контракт коротко — skill `annotation-contract`; этот файл — полная картина (возможности · хранение · логика · нарушения).

---

## 0. Что такое «фича» и «саб-фича»

**Фича** = биологическая аннотация на молекуле (CDS, промотор, терминатор, ori, маркёр…). **Саб-фича** = вложенный элемент внутри фичи (домен, сигнальный пептид, таг, интрон, сайт). Точечная метка (старт/стоп-кодон, сайт рестрикции, мутация) — отдельный уровень.

Три уровня в ОДНОМ массиве `annotations[]`:

| level | смысл | примеры | связь с родителем |
|-------|-------|---------|-------------------|
| `region` | целая фича (что есть ДНК) | CDS, promoter, ori, marker | — (верхний уровень) |
| `detail` | саб-фича внутри region | domain, signal_peptide, tag, intron, RBS | `regionId` → id региона |
| `point` | точечная метка | start_codon, restriction_site, mutation | `regionId` (опц.) |

---

## 1. Каноническая форма аннотации (как ПРАВИЛЬНО записывается)

```js
{
  id: string,          // ОБЯЗАТЕЛЬНО. UUID через lib/ids.js::makeId (импортёры — generateRegionId).
                       //   Read-path fallback (legacy без id): `region:<start>:<end>:<type>:<name>`
  name: string,        // имя фичи
  type: string,        // 'CDS' | 'promoter' | 'terminator' | 'ori' | 'tag' | 'intron' | 'restriction_site' | …
  start: number,       // 0-based, ВКЛЮЧИТЕЛЬНО
  end: number,         // 0-based, ИСКЛЮЧИТЕЛЬНО → length = end - start
  strand: 1 | -1,      // 1 forward, -1 reverse
  level: 'region' | 'detail' | 'point',
  regionId?: string,   // для detail/point — id родительского region
  // опционально:
  color?: string,      // кастомный цвет (SnapGene/ApE import); иначе из feature-palette по type/name
  predicted?: true, source?: string, confidence?: number, signals?: [], // метаданные предиктора (Annotator)
}
```

`type → level` дефолт — `levelForType()` ([annotation-edit.js:32-45](../gui/designer/src/lib/annotation-edit.js)). Неизвестный тип → `region` (безопасный дефолт).

---

## 2. Где хранится (одно каноническое место на сущность)

| Сущность | Поле | Persistence |
|----------|------|-------------|
| Library entry (контейнер/часть) | `entry.payload.annotations` | Dexie `library` (payload blob) |
| Canvas-фрагмент | `fragment.annotations` | через autosave в librarySlice |
| Assembly draft | `fragment.annotations` | на коммите |

**Запрещено:** отдельное поле `fragment.domains[]` / `fragment.regions[]`. Всё — в `annotations[]` с `level`. Legacy `domains[]` конвертится один раз `migrate-annotations.js` → `level:'detail'`.

---

## 3. Координаты (⚓ DEC-ANN-10)

- **Хранение:** 0-based half-open `[start, end)`. `length = end - start`, вырезка `seq.slice(start, end)` без ±1, соседство `a.end === b.start`. Совпадает с BioPython.
- **UI:** биологу 1-based inclusive через `toUiCoords(start,end) → {uiStart:start+1, uiEnd:end}` / обратно `fromUiCoords` ([annotation-edit.js:455-465](../gui/designer/src/lib/annotation-edit.js)).
- **Конверсия — ТОЛЬКО на границах** (файл↔store у парсеров; store↔UI у вьюеров/модалок). Никогда в модели.
- Валидация: `validateAnnotationCoords(start,end,seqLen)` — `start≥0`, `start<end`, `end≤seqLen`.

---

## 4. Инварианты («логика», нарушения которой = баг)

1. **id обязателен** на каждой аннотации (region/detail/point). Write-path стампит через `makeId`/`generateRegionId`; read-path `getRegions` достраивает детерминированный fallback ТОЛЬКО для region. Новая зависимость (nanoid/uuid) вместо `makeId` — нарушение.
2. **level проставлен** (region/detail/point) при создании всегда.
3. **Координаты 0-based end-exclusive** в store; 1-based только на UI-границе.
4. **detail/point связан с родителем через `regionId`** = id региона. При смене id региона связь ОБЯЗАНА сохраниться (иначе саб-фича — сирота: нет exon-блока, нет AA-сплайсинга, не находится в FeatureEditorModal `a.regionId === feature.id`).
5. **Один массив `annotations[]`**, без `domains[]`.
6. **Матчинг по id** должен переживать legacy-без-id: `matchesAnnotationId` сверяет `a.id === id` ИЛИ детерминированный fallback (только region).

---

## 5. Возможности пользователя (что можно делать с фичами и где)

| Действие | Где | Как |
|----------|-----|-----|
| Создать region | SequenceView (выделить → создать), Annotator (принять предсказание) | `applyAnnotationEdit kind:'create'` |
| Создать саб-фичу (detail) | SequenceView контекст-меню (напр. «Отметить как интрон»), FeatureEditorModal (split) | `level:'detail'` + `regionId` |
| Переименовать | dbl-click по подписи (Seq), модалки, inline (CommonFeatures) | patch `{name}` |
| Сменить тип | EditAnnotationModal, FeatureEditorModal | patch `{type}` (может сменить level + цвет) |
| Правка координат | EditAnnotationModal, FeatureEditorModal, drag-края в SequenceView | patch `{start,end}`, валидация границ |
| Сменить strand | EditAnnotationModal, FeatureEditorModal | patch `{strand}` |
| Split (N равных кусков) | FeatureEditorModal | `splitAnnotation` → дети наследуют type/strand/level |
| Merge соседних | FeatureEditorModal | `mergeAnnotations` (только смежные `a.end===b.start`) |
| Удалить | Seq/Annotator/Library/модалка | `deleteAnnotation` (без undo-истории) |
| Авто-детект | Annotator (ORF/PWM/stem-loop/sgRNA), auto-annotate | предсказания → accept/reject |
| Импорт | Importer (.dna/.gb) | парсер → `importFeatures` (стампит id на выходе) |
| Перекрасить | редактор записи | `annotation.color` |

---

## 6. Write-path (как фичи корректно записываются)

| Путь | Файл | id? | level? | coords |
|------|------|-----|--------|--------|
| Ручное создание/правка | `lib/annotation-edit.js` (createAnnotation/updateAnnotation/applyAnnotationEdit) | ✅ explicit или детерм. fallback | ✅ | store 0-based |
| Авто-аннотация | `auto-annotate.js` | ⏳ бэкфилл на выходе | ✅ | relative→absolute |
| ORF | `orf-detection.js` | ✅ generateRegionId сразу | ✅ region | absolute |
| Импорт | `import-annotations.js::importFeatures` | ⏳ бэкфилл шаг 5 | ✅ | 0-based из парсера |
| Миграция legacy | `migrate-annotations.js` | ⏳ бэкфилл на выходе | ✅ | 0-based |

«⏳ бэкфилл» = аннотации создаются в цикле без id, id проставляется единым проходом перед возвратом (TD-IMPORTER-NO-ID закрыт 29.05.2026). Контракт: НИ ОДНА аннотация не покидает write-path без id.

---

## 7. Read-path (как фичи отображаются)

| Поверхность | Файл | region | detail | point | выделение |
|-------------|------|--------|--------|-------|-----------|
| Кольцевая карта | `PlasmidMapV2.jsx` | ✅ дуги | ❌ | ❌ | click→onSelectRegion(id) |
| Линейная карта | `LinearMapV2.jsx` | ✅ стрелки (lanePack) | ❌ | ❌ (RE отдельным треком) | click→onSelectRegion(id) |
| Сиквенс — фичи | `SequenceView/tracks/AnnotationTrack.jsx` | ✅ стек | ✅ inset на родителе | ⚠️ нет выделенного трека | ⚠️ НЕ читает selectedRegionId |
| Сиквенс — AA | `AATrack.jsx` | трансляция CDS | — | — | — |
| Выравнивание | `Align/AlignMiniMap.jsx` | ✅ тики | ❌ | ❌ | click-jump |
| Библиотека | `tabs/AnnotationsTab.jsx` (Annotator embed) | ✅ | ✅ | ✅ | accept/reject |

Цвет: `feature-palette.js` — `featureColor(type,name)` (база) / `featureColorShaded(type,name)` (детерм. оттенок по имени для карт). Алиасы (AmpR/bla/β-lactamase → resistance).

---

## 8. Реестр нарушений логики (аудит 29.06.2026)

Проверено по коду (не догадки агентов). Подробности фиксов — в BUGS.md.

### ✅ ПОДТВЕРЖДЁННЫЕ (логические баги)

- **V-FEAT-1 — orphaning саб-фич при правке координат региона.** `updateAnnotation` ([annotation-edit.js:190-198](../gui/designer/src/lib/annotation-edit.js)) перегенерирует `id` региона на `region:start:end:type:name` при изменении start/end/type/name (или если id не было) — **даже если у региона был настоящий UUID**. Дети (`detail`/`point` с `regionId = старый id`) НЕ обновляются → сироты (нет exon-блока, AA-сплайсинга, не находятся в FeatureEditorModal). Инвариант №4 нарушен. Фикс: каскадно обновлять `regionId` детей ИЛИ не менять UUID-id (только бэкфилл для legacy-без-id).
- **V-FEAT-2 — нет sync выделения карта↔сиквенс.** `AnnotationTrack` не принимает/не читает `selectedRegionId` (grep пуст). Клик по фиче на карте не подсвечивает её в сиквенс-вьюере и наоборот. Фича «на 3+»: работает, но без двусторонней подсветки.

### ⚠️ КАНДИДАТЫ (требуют проверки в следующих итерациях)

- **V-FEAT-3 — detail/point невидимы на кольцевой/линейной картах.** Карты рендерят только `getRegions`; импортированный домен/RE-сайт виден в сиквенсе, но не на обзорной карте.
- **V-FEAT-4 — рассинхрон оттенка цвета.** Карты `featureColorShaded`, чипы редактора `featureColor` → один ген двумя оттенками рядом.
- **V-FEAT-5 — терминология координат в assembly.** Комментарии «1-based inclusive» в `segment-annotation-transfer.js` / `selectors-assembly.js` / `assembly-model.test.js` против канонических 0-based — вероятно коммент-баг, проверить что это не реальный сдвиг.
- **V-FEAT-6 — bulk import/auto-annotate без валидации координат.** `validateAnnotationCoords` срабатывает только на ручных правках; массовые пути принимают coords как есть (риск битых данных из источника).
- **V-FEAT-7 — orphan detail с `regionId:null` из импорта.** `import-annotations.js` допускает detail без родителя; UI ищет ближайший по координатам (fallback), но связь неявная.

---

## 9. Порядок полировки (план лупа)

1. **Эта итерация:** документация (этот файл) + проверенный реестр нарушений + BUGS.
2. **Далее:** фикс V-FEAT-1 (orphaning — TDD, каскад regionId) → V-FEAT-2 (sync выделения) → проверка/фикс кандидатов V-FEAT-3…7.
3. Каждый фикс — TDD-первым + регресс + браузер-верификация на реальной молекуле.
