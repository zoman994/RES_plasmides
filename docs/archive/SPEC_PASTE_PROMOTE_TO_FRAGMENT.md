# SPEC — Вставленный сиквенс → продвинуть в библиотечный фрагмент

**Тип:** B (фича-мостик поверх custom-segment SAFE). **Статус:** готова к выдаче Code. Независима от editable-assembly wave (другие файлы) — может идти параллельно/в любом порядке.
**Запрос Игоря (22.05.2026, со скриншотом):** биолог вставил свой сиквенс в секцию «Вставить свой сиквенс» — рядом должно появляться ненавязчивое боковое предложение открыть его в sequence-viewer, аннотировать и сохранить как фрагмент.
Диагноз — чтением `COMPONENT_MAP.md` (карта surface'ов) + `AssemblyShellBody.jsx` (текущая разводка `onPasteSequence`).

---

## 0. Размеры затрагиваемых модулей

- `components/CanvasSkeleton/canvas/LibrarySearchBar.jsx` — 24.8 KB (под soft 30 / hard 40). Сюда — вторичная affordance в paste-секции.
- `components/CanvasSkeleton/editor/assembly-mode/AssemblyShellBody.jsx` — 27.3 KB (под hard 40, выше soft 30 — **watch-точка**, фича добавляет ~короткий хендлер, не декомпозиция). После S1 файл вырос 23.5→27.3; ещё +~1.5 KB допустимо, но это последняя свободная фича до декомпозиции.
- Новый `components/CanvasSkeleton/lib/pasted-fragment.js` — чистый билдер entry из сиквенса (~1–2 KB).
- Reuse без правок: `lib/build-library-entry` (или аналог, что зовёт `LibraryTreeHost`), `auto-annotate.js`, контейнер-редактор `ContainerEditorSkeleton`.

## 1. Контекст

custom-segment SAFE дал секцию «Вставить свой сиквенс» в едином пикере (`LibrarySearchBar`, opt-in `onPasteSequence`): textarea + ATGC-валидация + счётчик bp + кнопка «Вставить сегмент». `AssemblyShellBody.onPasteSequence` зовёт `insertManualSegment` — сиквенс падает в сборку как анонимный manual-сегмент (gap-путь V83).

Это единственный исход вставки. Биолог на скриншоте вставил **5941 bp** — фактически целую плазмиду. Единственное, что предлагает инструмент, — «закинуть как безымянный сегмент». Крупный вставленный сиквенс — это полноценный фрагмент: его хочется рассмотреть в редакторе, аннотировать, дать имя и сохранить в библиотеку как переиспользуемую сущность, а не растворить анонимной вставкой.

Все surface'ы для этого уже есть (`COMPONENT_MAP`): `build-library-entry` строит `LibraryEntry` из сиквенса; `addLibraryEntry` кладёт в библиотеку; `ContainerEditorSkeleton` — контейнер-редактор = SequenceView + табы + FeatureEditorModal + Аннотатор (открывается как `tab.kind='container'`); `auto-annotate.js` — гомологичная авто-аннотация. Не хватает **мостика**: ненавязчивого второго действия в paste-секции, продвигающего вставленный сиквенс в библиотечный фрагмент.

## 2. Где задача сядет (связи)

Две точки. **`LibrarySearchBar`** paste-секция — новый opt-in callback `onOpenPasteAsFragment(seq)` + вторичная ненавязчивая affordance (ghost-ссылка) рядом с/под кнопкой «Вставить сегмент», видна когда вставка валидна. Без prop'а affordance не рендерится — canvas-usage и прочие хосты `LibrarySearchBar` не задеты. **`AssemblyShellBody`** — wiring `onOpenPasteAsFragment`: построить `LibraryEntry` из сиквенса → авто-аннотировать → `addLibraryEntry` → открыть в контейнер-редакторе.

Затрагивает: `LibrarySearchBar.jsx`, `AssemblyShellBody.jsx`. Ссылается на: `build-library-entry`, `addLibraryEntry` (librarySlice), `auto-annotate.js`, контейнер-редактор-open путь (тот же, которым контейнер открывается из canvas), `ContainerEditorSkeleton`. Может сломаться: ничего критичного — affordance opt-in, существующий `onPasteSequence`-путь не трогается. **Не плодит окно** (§17): открытие — существующий контейнер-редактор как таб, не новый top-level.

## 3. Стратегия

paste-секция получает ДВА исхода вместо одного:
- **«Вставить сегмент»** (primary, как сейчас) — быстро, анонимно: сиквенс в сборку manual-сегментом.
- **«Открыть как фрагмент»** (вторичное, ненавязчивое) — продвинуть: вставленный сиквенс становится `LibraryEntry`, авто-аннотируется по гомологии, открывается в контейнер-редакторе. Биолог рассматривает, аннотирует глубже (Аннотатор), переименовывает inline — получает именованный аннотированный фрагмент в библиотеке. Дальше при желании вставляет его в сборку обычным путём из пикера (он появится в «Недавно»/«Из проекта»), через `RangePickerModal` — как любой источник.

«Сохранить как фрагмент» = само создание `LibraryEntry` (entry создаётся в момент клика — модель A, §5.4). «Аннотировать» = авто-аннотация на создании + контейнер-редактор для ручной доработки. «Открыть в sequence-viewer» = `ContainerEditorSkeleton`.

## 4. Scope

**IN:**
- `LibrarySearchBar` — вторичная ненавязчивая affordance в paste-секции + opt-in `onOpenPasteAsFragment`.
- `AssemblyShellBody` — хендлер: сиквенс → `LibraryEntry` → авто-аннотация → `addLibraryEntry` → открыть контейнер-редактор.
- Новый чистый билдер `pasted-fragment.js` — `buildPastedFragmentEntry`.
- Авто-имя вставленного фрагмента (биолог переименует в редакторе).

**OUT:**
- Авто-вставка продвинутого фрагмента обратно в сборку — purely promote (§10 Q1; биолог сам берёт из пикера).
- Размерный гейт affordance (показывать только для крупных вставок) — §5.3, показывается всегда при валидной вставке.
- Глубокая аннотация (предсказатели/BLAST) — это уже умеет Аннотатор, открывается из контейнер-редактора как обычно.
- Promote из canvas-usage `LibrarySearchBar` — affordance opt-in; если canvas-пикеру понадобится, wiring добавляется там отдельной задачей.
- Topology-детект вставленного сиквенса — дефолт linear, биолог переключает в редакторе.

## 5. Архитектурные решения

1. **`onOpenPasteAsFragment(seq)` — opt-in callback.** `LibrarySearchBar` paste-секция: если prop передан И textarea-вставка валидна (та же ATGC-валидация, что у «Вставить сегмент») — рендерится вторичная affordance. Клик → `onOpenPasteAsFragment(<очищенный сиквенс>)`. Prop отсутствует → affordance нет (canvas/прочие хосты не задеты, как `onPasteSequence`).
2. **Affordance — ненавязчивая, вторичная.** Ghost-ссылка/кнопка под строкой с «Вставить сегмент» (не конкурирует с primary). Текст вида «↗ Открыть и аннотировать как фрагмент библиотеки». Стиль — вторичный/ghost из дизайн-системы (не orange primary). «Сбоку ненавязчиво» — маленькая ссылка, не вторая крупная кнопка.
3. **Без размерного гейта.** Affordance видна при любой валидной вставке (она достаточно ненавязчива, чтобы не мешать на короткой вставке). Биолог сам решает, что вставленное — фрагмент.
4. **Модель «entry создаётся на клике» (A).** Клик → entry строится и сразу `addLibraryEntry` → контейнер-редактор открывается уже на сохранённой сущности. Причина против «отложенного явного сохранения после аннотации» (B): контейнер-редактору нужен реальный контейнер/entry (он открывается как `tab.kind='container'`), транзиентного-viewer-surface нет; модель A проще и безопаснее — вставка не теряется. Аннотации, сделанные в редакторе, персистятся в entry штатно.
5. **`buildPastedFragmentEntry(seq, ctx) → LibraryEntry`** — новый чистый билдер в `lib/pasted-fragment.js`. Внутри: `build-library-entry` (или его текущий аналог) с авто-именем + `topology:'linear'` + `projectId` из ctx (current project) + прогон `auto-annotate` (L1 гомология) → `annotations` на entry. Чистая (auto-annotate чистый). Тестируемая в изоляции.
6. **Открытие контейнер-редактора.** После `addLibraryEntry` — entry в библиотеке; открыть его в `ContainerEditorSkeleton` тем же путём, которым контейнер открывается из canvas (создать контейнер из entry + открыть `container`-таб). Точный action — Code берёт существующий (canonical container-editor-open путь; `addContainerFromEntry` + open-tab). Новый таб становится активным, таб сборки сохраняется в фоне — biolog возвращается на «Сборка N» без потери состояния.
7. **Авто-имя.** `«Вставленный фрагмент · <N> bp»` либо с датой — финальная формулировка low-stakes. Биолог переименовывает inline в контейнер-редакторе (`InlineEditableTitle` там есть).
8. **Закрытие пикера.** После клика «Открыть как фрагмент» — `setPickerOpen(false)` (как `onPasteSequence`), фокус уходит в открывшийся редактор.

## 6. Файлы / сигнатуры

**`lib/pasted-fragment.js`** (новый) — `buildPastedFragmentEntry(seq, { projectId }) → LibraryEntry` (§5.5). Чистая.

**`LibrarySearchBar.jsx`** — paste-секция: opt-in prop `onOpenPasteAsFragment`; при наличии prop + валидной вставке — вторичная ghost-affordance под кнопкой «Вставить сегмент», клик → `onOpenPasteAsFragment(cleanSeq)`.

**`AssemblyShellBody.jsx`** — хендлер `onOpenPasteAsFragment(seq)`: `buildPastedFragmentEntry(seq, {projectId:currentProjectId})` → `actions.addLibraryEntry(entry)` → открыть контейнер-редактор для entry (§5.6) → `setPickerOpen(false)`. Передать `onOpenPasteAsFragment` в оба инстанса `LibrarySearchBar` (empty-state inline + popover).

**Тесты:** юнит `buildPastedFragmentEntry` (entry-shape, авто-имя, topology linear, auto-annotate проставил annotations); юнит `LibrarySearchBar` (affordance видна при prop+валидной вставке, скрыта без prop, клик зовёт callback с очищенным сиквенсом); интеграция `AssemblyShellBody` (клик «Открыть как фрагмент» → entry в библиотеке + контейнер-редактор открыт + пикер закрыт; «Вставить сегмент» по-прежнему работает как раньше); регрессия (canvas-usage `LibrarySearchBar` без `onOpenPasteAsFragment` — affordance не появляется).

## 7. Порядок выполнения

1. `lib/pasted-fragment.js` — `buildPastedFragmentEntry` + юнит-тесты.
2. `LibrarySearchBar.jsx` — opt-in affordance + `onOpenPasteAsFragment` + юнит-тесты.
3. `AssemblyShellBody.jsx` — хендлер + проводка контейнер-редактора.
4. Интеграционные тесты + регрессия.
5. Полный Vitest + `vite build`.

## 8. STOP-условие и формат отчёта

После реализации §3 IN-scope и зелёного полного Vitest + `vite build` clean — STOP. Отчёт в `CURRENT_TASK.md`: commit range; Vitest counters; `vite build`; spec deviations; size budget (`LibrarySearchBar.jsx`, `AssemblyShellBody.jsx`). Визуальная приёмка — отдельная Chat-сессия. Координационные файлы не финализировать.

## 9. Риски

- **Контейнер-редактор-open из ассемблера.** Если canonical-путь открытия `ContainerEditorSkeleton` для entry не очевиден — Code сверяется с canvas double-click путём (он открывает контейнер-редактор). Митигация: `COMPONENT_MAP` подтверждает `tab.kind='container'` → `ContainerEditorSkeleton` + `addContainerFromEntry` существуют; путь есть.
- **`auto-annotate` на ~6 kb.** Гомологичная авто-аннотация быстрая, но если ощутимо тормозит UI на крупном сиквенсе — открыть редактор сразу, аннотацию догнать. Митигация: профилировать; при заметной задержке — авто-аннотацию вынести в редактор (после открытия), а не в билдер. Code отмечает в отчёте, если так сделал.
- **`AssemblyShellBody` у soft 30 KB.** Хендлер короткий, но файл растёт. Митигация: вынести логику в `buildPastedFragmentEntry` + тонкий хендлер; декомпозиция `AssemblyShellBody` — назревающий TECH_DEBT, не в этой спеке, отметить в отчёте если перевалил soft 30.
- **affordance не opt-in → протекает на canvas.** Митигация: §5.1 — рендер строго при наличии `onOpenPasteAsFragment`; тест на canvas-usage без prop'а.

## 10. Открытые вопросы

1. **(продуктовая развилка — нужно решение Игоря)** После того как фрагмент продвинут и аннотирован — должно ли что-то вернуть его в текущую сборку, или это purely promote (фрагмент в библиотеке, биолог сам берёт его из пикера через `RangePicker`)? Спека по умолчанию — **purely promote, без авто-вставки**: два исхода paste-секции остаются чистыми («Вставить сегмент» = быстрая анонимная вставка; «Открыть как фрагмент» = продвижение в переиспользуемую сущность). Если Игорь хочет «продвинуть И вставить» — добавляется шаг авто-вставки после сохранения.
2. Модель сохранения — спека выбрала A (entry на клике, §5.4). Если Игорь ждёт явной кнопки «Сохранить» уже после аннотации (модель B) — нужен транзиентный viewer-surface, которого сейчас нет; это бо́льшая работа. Флагую — поправить до выдачи Code, если A не то.
3. Авто-имя вставленного фрагмента — формулировка low-stakes, на усмотрение Code.
