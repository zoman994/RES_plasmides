# SPEC — Вставленный сиквенс → аннотировать и сохранить как фрагмент

**Тип:** B (UI-флоу поверх существующих `Annotator` + `librarySlice`, без новой data-model). **Статус:** готова к выдаче Code — отдельная от editable-assembly wave.
**Запрос Игоря (22.05.2026, на живом тесте):** вставил свой сиквенс в paste-секцию пикера — должно появляться ненавязчивое (сбоку) предложение открыть его в просмотрщике, аннотировать и сохранить как фрагмент.
**Решение Игоря по развилке:** «сохранить как фрагмент» = только положить в библиотеку, без авто-вставки в текущую сборку.
Диагноз/проектирование — чтением `LibrarySearchBar.jsx` (paste-секция), `Annotator/index.jsx` (API), `annotatorSlice.js` (`openAnnotator`/`closeAnnotator`), `librarySlice.js` (`addLibraryEntry`, shape entry, `getSuggestedLibraryName`), `SPEC_ASSEMBLY_CUSTOM_SEGMENT.md`.

---

## 0. Размеры затрагиваемых модулей

- `components/CanvasSkeleton/canvas/LibrarySearchBar.jsx` — 24.8 KB (под soft 30). Добавляется оффер-ссылка в paste-секцию (~+0.5 KB). Если с этой правкой перевалит soft 30 — paste-секцию вынести под-компонентом (custom-segment §9 уже предусмотрел).
- `components/CanvasSkeleton/editor/assembly-mode/AssemblyShellBody.jsx` — 23.5 KB (под hard 40). Монтаж `Annotator` + хендлеры (~+2–3 KB).
- `Annotator/index.jsx` — **не редактируется**: компонент контролируемый, `onApplyAnnotatorResults` решает хост. Размер для §0 нерелевантен.
- `store/librarySlice.js` — 43.83 KB. **Не редактируется** — `addLibraryEntry` уже есть.
- Новый `lib/pasted-fragment-entry.js` — чистый билдер entry из последовательности + аннотаций (~1–2 KB).

## 1. Контекст

Custom-segment SAFE (батч 22.05) дал paste-секцию в пикере: textarea ATGC + счётчик + кнопка «Вставить сегмент» → `onPasteSequence(seq)` → `insertManualSegment` → сегмент `kind:'gap'` в сборке. Это и весь объём — вставленное становится сырым one-off gap-сегментом: без аннотаций, не в библиотеке, не переиспользуемо.

Биолог вставляет 5941 bp — это целая молекула, а не безымянный спейсер. SnapGene/Benchling на вставленный сиквенс заводят полноценную сущность, которую аннотируешь и сохраняешь. Сейчас этого хода нет.

Строить почти нечего — всё переиспользуется:
- `Annotator` принимает сырой `sequence` пропом, на открытии сам гоняет L1-детектор (ghost-фичи без «Run»), footer `[Сохранить]` отдаёт принятые регионы через `onApplyAnnotatorResults` — что делать с ними, решает хост.
- `librarySlice.addLibraryEntry(entry)` создаёт `LibraryEntry`; shape: `{id, kind:'container', name, tags, folderPath, addedAt, origin, version, payload:{sequence,length,topology,ends,annotations,resourceHash,organism,description}, ext}`. `origin.kind:'paste_import'` — уже существующее значение (importer так метит вставленные). `getSuggestedLibraryName(base)` — авто-дедуп имени, `computeResourceHash` — хеш контента.

Фича = ненавязчивый оффер + открыть `Annotator` на вставленной последовательности + завязать его «Сохранить» на `addLibraryEntry`.

## 2. Где задача сядет (связи)

Точка оффера — paste-секция `LibrarySearchBar.jsx` (блок `data-testid=*-paste-section`, футер рядом с кнопкой «Вставить сегмент»). Новый опциональный проп `onAnnotatePaste(seq)`; при наличии и при fragment-sized валидной пасте — рендерится тихая вторичная ссылка.

Хост — `AssemblyShellBody.jsx` (он уже монтирует пикер и держит `onPasteSequence`). Добавляется: локальный state вставленной-под-аннотацию последовательности, монтаж `Annotator` (его обычный fullscreen-modal режим — поверх редактора сборки, БЕЗ ухода на отдельный экран, §17 R2/R3), хендлер сохранения → `addLibraryEntry`.

Ссылается на: `annotatorSlice` (`openAnnotator({sequenceId})` ставит `annotator.open=true` — модальная обёртка `Annotator` гейтится этим флагом; `closeAnnotator`). `librarySlice.addLibraryEntry`. Может конфликтовать: `AssemblyShellBody.jsx` правит и editable-assembly S1 (`onSequenceEdit`-хендлер) — разные секции файла, но **эту спеку не сливать одновременно с S1** (см. §9).

**§17-проверка:** оффер не создаёт ни нового окна, ни workspace — `Annotator` это существующая поверхность, открывается модалкой поверх текущего экрана (закрыл — вернулся в сборку). Пара кликов: paste → клик оффера → модалка. R2/R3 соблюдены.

## 3. Стратегия

Когда в paste-секцию введён валидный fragment-sized сиквенс — под кнопкой «Вставить сегмент» появляется тихая вторичная ссылка («↗ Открыть в просмотрщике — аннотировать и сохранить как фрагмент», формулировка финализируется). «Вставить сегмент» остаётся как есть — это два независимых маршрута.

Клик по ссылке:
1. Хост запоминает вставленную последовательность, диспатчит `openAnnotator({sequenceId:'pasted-custom-segment'})`.
2. Монтируется `Annotator` (fullscreen-modal) с `sequence` = вставленная, `annotations=[]`. L1-детектор гоняется сам — biolog сразу видит ghost-фичи.
3. Biolog принимает/правит аннотации, жмёт footer `[Сохранить]`.
4. Хендлер `onApplyAnnotatorResults` на этой точке входа **создаёт новый `LibraryEntry`** (последовательность + принятые аннотации) через `addLibraryEntry`, показывает тост «Сохранено в библиотеку», закрывает `Annotator`.
5. Новый entry — в библиотеке (`zone:'loose'`). Всплывает в секции «Недавно» того же пикера → biolog при желании вставляет его нормальным sourced-сегментом обычным путём пикера. Авто-вставки в сборку нет (решение Игоря).

## 4. Scope

**IN:**
- Оффер-ссылка в paste-секции `LibrarySearchBar` (проп `onAnnotatePaste`, gated на fragment-sized валидную пасту).
- Монтаж `Annotator` (fullscreen-modal) на вставленной последовательности из `AssemblyShellBody`.
- Хендлер «Сохранить» этой точки входа → `addLibraryEntry` с корректным shape (`kind:'container'`, `origin.kind:'paste_import'`, `topology:'linear'`, принятые аннотации, `resourceHash`).
- Мини-поле имени фрагмента при сохранении (дефолт — `getSuggestedLibraryName`).
- Тост успеха.

**OUT:**
- Авто-вставка сохранённого фрагмента в текущую сборку (решение Игоря — только в библиотеку).
- Правка самой последовательности в этом флоу (Annotator аннотирует; правка нуклеотидов — editable-wave / library manual-edit).
- Изменения `Annotator` (он контролируемый, не трогается).
- Canvas-контекст пикера paste-секцию и оффер не показывает (`onPasteSequence`/`onAnnotatePaste` передаёт только ассемблер).
- Распознавание circular-топологии вставленного (дефолт `linear`; biolog переключит топологию у entry позже).

## 5. Архитектурные решения

1. **Оффер — тихая вторичная ссылка, не баннер.** Игорь: «сбоку ненавязчиво». В футере paste-секции, accent-цветом, мелкая, под/рядом с «Вставить сегмент». Появляется только при `pasteValid && pasteClean.length > FRAGMENT_OFFER_MIN`. Никакой иконы-привлечения внимания.
2. **Gating по длине.** `FRAGMENT_OFFER_MIN` — константа, дефолт 100 нт. Ниже — паста это праймер-хвост/короткий спейсер, аннотировать/сохранять как фрагмент бессмысленно, оффер не показывается. (Концептуально тот же knob, что `synthesisLengthThreshold` editable-S1; объединять не обязательно — эта спека независима от wave, держит свою константу. Возможное слияние knob'ов — отдельный мелкий follow-up.)
3. **`Annotator` открывается модалкой поверх редактора сборки**, НЕ навигацией на importer/отдельный экран (§17 — не уходить с места). Используется штатный fullscreen-modal режим `Annotator` (`embedded={false}`), гейт видимости — `annotator.open`.
4. **Монтаж `Annotator` — задача локализации для Code (§0-first).** Code сперва находит, где сейчас монтируется модальный `Annotator` (importer / app-shell) и как он получает `sequence`. Затем — чище из двух: (а) расширить существующий хост источником «ad-hoc вставленная последовательность»; (б) добавить отдельный mount `<Annotator>` в assembly-стороне, гейтнутый на `annotator.scope.sequenceId === 'pasted-custom-segment'` чтобы не было двойного рендера. Рекомендация — (б): вставленная последовательность это assembly-локальный state, `Annotator` контролируемый, отдельный гейтнутый mount развязывает от importer. Решение — за Code по факту локализации, без возврата к Chat.
5. **«Сохранить» создаёт entry.** Новый чистый билдер `lib/pasted-fragment-entry.js` — `buildPastedFragmentEntry({sequence, annotations, name}) → entry`: собирает shape (`id` uuidv7, `kind:'container'`, `name`, `tags:[]`, `folderPath:''`, `addedAt`, `origin:{kind:'paste_import', sourceFileName:'', importedAt}`, `version:1`, `payload:{sequence, length, topology:'linear', ends:null, annotations, organism:'', description:'', resourceHash}`, `ext:{}`). `resourceHash` — через `computeResourceHash` (async, билдер либо async, либо хеш досчитывает хост перед `addLibraryEntry`). Хост зовёт `addLibraryEntry(entry)`.
6. **Имя фрагмента.** При сохранении — мини-поле имени, дефолт `getSuggestedLibraryName('Вставленный фрагмент')`. Минимально: поле в шапке/футере Annotator-модалки этой точки входа либо маленький prompt перед `addLibraryEntry`. Размещение — минимальное на усмотрение Code.
7. **`onApplyAnnotatorResults` контекстно-зависим.** Для библиотечного SingleInspector он патчит существующий entry; для этой точки входа — создаёт новый. `Annotator` это не различает (он просто отдаёт принятые регионы) — различие целиком в хендлере хоста. `Annotator` не трогается.
8. **После сохранения** — `closeAnnotator()`, очистка локального state вставленной последовательности, тост «Сохранено в библиотеку». paste-textarea можно очистить (паста «израсходована» как фрагмент) либо оставить — оставить (biolog может ещё и сегментом вставить); решение — оставить.

## 6. Файлы / сигнатуры

**`LibrarySearchBar.jsx`** — новый опциональный проп `onAnnotatePaste`. В футере paste-секции, при `pasteValid && pasteClean.length > FRAGMENT_OFFER_MIN` — кнопка-ссылка `data-testid=*-paste-annotate`, `onClick` → `onAnnotatePaste(pasteClean)`. Стиль — link-like, accent, мелкий.

**`lib/pasted-fragment-entry.js`** (новый) — `buildPastedFragmentEntry({sequence, annotations, name}) → entry` (§5.5). Чистый (хеш — либо async внутри, либо параметром). Юнит-тест на shape.

**`AssemblyShellBody.jsx`** — (а) state `pastedForAnnotation` (string|null); (б) `onAnnotatePaste` для пикера → `setPastedForAnnotation(seq)` + `openAnnotator({sequenceId:'pasted-custom-segment'})`; (в) монтаж `Annotator` по §5.4 с `sequence={pastedForAnnotation}`, `annotations={[]}`, `onApplyAnnotatorResults={handleSavePastedFragment}`; (г) `handleSavePastedFragment(acceptedRegions)` → `buildPastedFragmentEntry` → `addLibraryEntry` → тост → `closeAnnotator` → `setPastedForAnnotation(null)`.

**Тесты:** юнит `buildPastedFragmentEntry` (shape: kind/origin/payload/topology); юнит — оффер-ссылка не видна при короткой/невалидной пасте, видна при fragment-sized; интеграция — клик оффера открывает `Annotator` с вставленной последовательностью; интеграция — `[Сохранить]` создаёт `LibraryEntry` (kind container, paste_import origin, аннотации перенесены), entry появляется в `libraryEntries`; регрессия — «Вставить сегмент» не сломан, canvas-пикер оффер/paste не показывает.

## 7. Порядок выполнения

1. `lib/pasted-fragment-entry.js` + юнит-тест.
2. `LibrarySearchBar.jsx` — проп `onAnnotatePaste` + оффер-ссылка + юнит-тест видимости.
3. `AssemblyShellBody.jsx` — локализовать модальный `Annotator`-хост (§5.4), смонтировать, хендлеры, тост.
4. Интеграционные тесты + регрессия.
5. Полный Vitest + `vite build`.

## 8. STOP-условие и формат отчёта

После реализации §3 IN-scope и зелёного полного Vitest + `vite build` clean — STOP. Отчёт в `CURRENT_TASK.md`: commit range; Vitest counters; `vite build`; spec deviations; какой из вариантов §5.4 (а/б) выбран и почему; size budget (`LibrarySearchBar.jsx`, `AssemblyShellBody.jsx`). Визуальная приёмка — отдельная Chat-сессия. Координационные файлы не финализировать.

## 9. Риски

- **Двойной mount `Annotator`.** Если модальный `Annotator` уже смонтирован глобально и гейтится `annotator.open`, второй mount даст двойной рендер. Митигация: §5.4 — Code сперва локализует существующий хост; вариант (б) гейтит mount на `scope.sequenceId`.
- **Конфликт с editable-S1 по `AssemblyShellBody.jsx`.** Обе спеки правят этот файл. Митигация: не сливать одновременно — эту спеку выдавать Code отдельным `CURRENT_TASK`, после S1 (или позже в очереди wave). Code и так работает по одному `CURRENT_TASK`.
- **Topology вставленного.** Дефолт `linear` — для вставленной кольцевой плазмиды неверно, biolog переправит топологию у entry потом. Принято осознанно (§4 OUT) — распознавание/выбор топологии не в объёме.
- **`onApplyAnnotatorResults` семантика.** Тот же колбэк в библиотеке патчит entry, тут — создаёт. Митигация: §5.7 — различие целиком в хендлере хоста, `Annotator` не трогается; тест на создание-нового.
- **`resourceHash` async.** `computeResourceHash` асинхронна — `addLibraryEntry` должен получить готовый хеш. Митигация: §5.5 — хеш досчитывается до `addLibraryEntry` (паттерн `commitMultiImport`).

## 10. Открытые вопросы

1. Финальная формулировка оффер-ссылки. Low-stakes.
2. `FRAGMENT_OFFER_MIN` — 100 нт дефолт; объединять ли knob с `synthesisLengthThreshold` editable-S1. Спека: держать раздельно (независимость от wave), слияние — опциональный follow-up.
3. Размещение мини-поля имени (шапка модалки / prompt перед сохранением) — на усмотрение Code, минимально.
