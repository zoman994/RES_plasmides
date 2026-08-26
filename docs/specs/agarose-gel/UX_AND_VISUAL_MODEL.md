# Agarose Gel — UX и визуальная модель

**Статус:** FUTURE / NOT ACTIVE
**Источник визуальных правил:** [`DESIGN_SYSTEM.md`](../../DESIGN_SYSTEM.md) и `.agents/skills/design-system`.
**Форма:** самостоятельный workspace для длительной работы; не modal и не вкладка SequenceView.

## 1. Информационная архитектура

```text
┌ Sidebar ──────────┬──────────────────── Agarose Gel Workspace ───────────────────┐
│ …                 │  Гель     Профиль: 1,0%   Пробег: 85%   Контраст: 1,0       │
│ Библиотека        ├──────────────────────────┬───────────────────────────────────┤
│ Праймеры          │ Дорожки                  │ Виртуальный гель                  │
│ Выравнивание      │                          │                                   │
│ Сайты рестрикции  │ [Маркер: generic 1 kb]  │  M    1    2    3                 │
│ Гель  ← active    │                          │ ┌──┬────┬────┬────┐                │
│                   │ [1] pUC19                │ │  │ ▬  │    │ ▬  │  10 kb        │
│                   │     Дайджест             │ │▬ │    │ ▬  │    │               │
│                   │     EcoRI + HindIII      │ │▬ │ ▬  │ ▬  │ ▬  │   3 kb        │
│                   │     500 ng               │ │▬ │    │ ▬  │    │               │
│                   │                          │ │▬ │ ▬  │    │ ▬  │ 500 bp         │
│                   │ [2] PCR product          │ └──┴────┴────┴────┘                │
│                   │     Линейная             │                                   │
│                   │     200 ng               │ Выбрано: pUC19 · 2686 bp · 186 ng │
│                   │                          │ EcoRI 396 ↔ HindIII 3082           │
│                   │ [+ Добавить дорожку]     │                                   │
└───────────────────┴──────────────────────────┴───────────────────────────────────┘
```

Desktop:

- lane editor: 280–340 px;
- gel viewport: всё оставшееся пространство;
- details bar: под gel viewport или справа при ширине >1400 px.

Narrow:

- toolbar переносится на две строки;
- lane editor становится верхним collapsible section;
- gel получает горизонтальный scroll при большом числе lanes;
- детали выбранной полосы идут под гелем;
- sample lanes не сжимаются уже минимальной ширины, при которой различимы bands.

## 2. Навигация

- В левой группе «Инструменты» появляется item «Гель».
- Icon — новый central domain glyph `gel`; локальный SVG и emoji запрещены.
- Route id: `agarose-gel`.
- Переход использует тот же паттерн, что Align и Restriction Sites:
  - `setActiveWorkspace('agarose-gel')`;
  - выход со стартовой поверхности на AppShell surface;
  - активен только nav item «Гель».
- Кнопка «Назад» вызывает workspace history, без принудительного перехода в Library после успешного `goBack`.
- Gel session не очищается при навигации назад/вперёд.

## 3. Верхняя панель

Постоянные элементы:

1. Заголовок «Гель».
2. `Профиль разделения`:
   - `0,7% · крупные`;
   - `1,0% · стандарт`;
   - `1,5% · малые`;
   - `2,0% · мелкие`.
3. `Пробег` — slider 20–100%; меняет только геометрию, restriction scan не запускается.
4. `Контраст` — slider 0,5–2,0; меняет только display intensity.
5. Secondary action `Сбросить сессию`.

Сброс — destructive для несохранённой конфигурации lanes, поэтому требует подтверждения. Обычное удаление одной lane сразу обратимо только если предусмотрен undo; иначе кнопка должна иметь ясное название и danger-семантику, но отдельный confirm для одной lane не нужен.

Не показывать:

- напряжение, минуты и сантиметры;
- «точность» в процентах;
- ложную температуру/буфер, которые алгоритм не использует.

Под панелью постоянно видна спокойная подсказка:

> Относительная оценка для линейной dsDNA. Реальный пробег зависит от агарозы, поля, буфера и конформации молекулы.

## 4. Добавление lane

Кнопка `Добавить дорожку` раскрывает inline panel с каноническим `LibrarySearchBar`.

Flow:

1. пользователь находит/выбирает molecule entry;
2. нажимает `Добавить`;
3. lane появляется и сразу рассчитывается в безопасном default mode:
   - linear source → `Линейная, без разрезания`;
   - circular source → `Дайджест`, без выбранного фермента и с явным запросом выбора.

Circular source MUST NOT автоматически получать fake intact band.

Повторное добавление одной entry разрешено: биолог может сравнить разные дайджесты одной плазмиды. Lane identity не равна source identity.

Picker фильтрует записи:

- допускает container/molecule с sequence;
- скрывает primers, projects, folders, enzyme catalog records;
- показывает имя, длину и topology;
- не копирует реализацию поиска из Library/Align.

## 5. Lane card

Каждая карточка содержит:

- номер lane и имя источника;
- длину и topology;
- mode switch:
  - `Линейная`;
  - `Дайджест`;
- enzyme picker при `Дайджест`;
- числовое поле `ДНК, ng`;
- status line;
- remove action;
- drag handle или доступные кнопки reorder.

### 5.1 Enzyme picker

- Ищет по merged classical RE registry.
- Позволяет до четырёх ферментов.
- Показывает site/cut count preview после расчёта.
- Type IIS Golden Gate не появляется.
- Unknown/deleted custom enzyme остаётся видимым как invalid selection до явной замены; не исчезает молча.

### 5.2 Status line

Примеры:

- `Готово · 4 полосы · 500 ng`;
- `EcoRI не режет эту линейную молекулу · 1 полоса`;
- `Кольцевая молекула не разрезана — выберите фермент`;
- `Источник удалён из библиотеки`;
- `Расчёт не выполнен`.

Статус сопровождается icon/text. Цвет — дополнительный сигнал.

## 6. Marker lane

- Marker всегда расположен первым.
- По умолчанию: `generic 1 kb`.
- Можно заменить на `generic 100 bp` или скрыть.
- Marker не считается одной из 12 sample lanes.
- Усиленные marker bands определяются `relativeMass` preset, а не специальными CSS-index rules.
- Hover/click marker band показывает только размер и название marker preset.

## 7. Gel viewport

### 7.1 Геометрия

- Лунки сверху.
- Движение ДНК — сверху вниз.
- Lane labels расположены над лунками.
- Size labels принадлежат marker lane; отдельная уверенная числовая ось не рисуется.
- Every band имеет стабильный id и отдельный hit target не меньше визуально доступного минимума.
- У полосы может быть более широкий прозрачный click target, но он не должен перекрывать соседнюю band без детерминированного выбора ближайшей.

### 7.2 Внешний вид

Gel-specific semantic tokens добавляются централизованно в `index.css`:

```css
--gel-canvas-bg
--gel-well-fill
--gel-well-stroke
--gel-band
--gel-band-selected
--gel-lane-divider
--gel-grid-label
```

Компонент не содержит raw hex/rgba. Если domain canvas сознательно одинаков в light/dark, это всё равно выражается через токены и проверяется в обеих темах.

Bands:

- толщина и alpha зависят от display intensity;
- selected band получает outline/halo и не кодируется только цветом;
- одинаковые `bp` в lane — одна band;
- близкие размеры MAY визуально перекрываться, но details сохраняет отдельные components;
- `above-range` показывается у лунки с текстовым badge;
- `below-range` не рисуется как полоса внизу: lane получает badge «ниже диапазона».

### 7.3 Details

Клик по sample band показывает:

- lane/source name;
- `bp`;
- расчётную массу `ng`;
- mode и enzyme list;
- число объединённых fragments;
- для digest component:
  - `start/end`;
  - `wraps origin`;
  - left/right enzyme, если доступны.

Координаты — half-open `[start, end)`; origin-crossing — два segments, не `min..max`.

Details не показывает sequence string, alignment, edit script или скрытые internal objects.

## 8. Состояния экрана

### Empty session

- Marker может оставаться видимым.
- Текст: «Добавьте молекулу из библиотеки, чтобы собрать ожидаемые дорожки».
- Primary action: `Добавить дорожку`.

### Computing

- Показывается только если measured implementation действительно уходит в worker/async.
- Старые bands изменяемой lane становятся неактивными и не считаются актуальным результатом.
- Остальные lanes остаются видимыми.

### Unsupported

- У lane нет fake bands.
- Есть объяснение и inline next action.

### Fault/incomplete

- «Полос нет» запрещено.
- Lane явно говорит, что расчёт не выполнен.
- Другие lanes сохраняются.

### Source changed

Gel store хранит только `sourceEntryId`, поэтому derived bands пересчитываются из актуальной записи. После изменения sequence:

- lane показывает краткий status `Источник обновлён`;
- предыдущий selected band очищается, если его id больше не существует;
- stale bands не остаются кликабельными.

## 9. Keyboard и accessibility

- Все fields имеют видимые labels.
- Tab order: toolbar → lane controls сверху вниз → gel lanes → details.
- Arrow keys MAY перемещать выбор между bands одной lane.
- `Enter`/`Space` выбирает band.
- `Delete` удаляет lane только когда focus/selection находится на lane card и не внутри input.
- Reorder доступен не только drag-and-drop.
- Gel viewport имеет понятный accessible summary:
  - число lanes;
  - число ready/unsupported/error lanes;
  - selected band.
- SVG/Canvas pixels не являются единственным представлением: каждая ready lane имеет screen-reader band list.
- Один live region сообщает завершение/ошибку расчёта; nested announcements запрещены.
- Focus-visible сохраняется.

## 10. i18n-группы

Конкретная структура сверяется с актуальным string owner при старте. Нужные смысловые группы:

```text
agaroseGel.title
agaroseGel.navLabel
agaroseGel.addLane
agaroseGel.profile.*
agaroseGel.runFraction
agaroseGel.contrast
agaroseGel.mode.*
agaroseGel.status.*
agaroseGel.marker.*
agaroseGel.details.*
agaroseGel.warning.relativeOnly
agaroseGel.warning.circularUnsupported
agaroseGel.action.linearizeOrDigest
```

Русский и английский добавляются одним атомом. Hard-coded user-facing strings в leaf components запрещены.

## 11. Browser acceptance

Обязательный живой сценарий:

1. открыть «Гель» из Sidebar;
2. добавить circular plasmid с двумя EcoRI sites и linear PCR product;
3. выбрать 1 kb marker;
4. получить topology-correct fragment counts;
5. выбрать band и сверить details;
6. переключить профиль/пробег/контраст без повторного scan;
7. вернуться в Library и обратно — session сохранилась;
8. изменить source sequence и убедиться, что stale band исчез;
9. проверить light/dark;
10. проверить narrow viewport и клавиатуру;
11. console errors = 0.
