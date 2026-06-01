# SPEC_COMMON_FEATURES.md — раздел common-фич + промоут из аннотации

**Статус:** ✅ РЕАЛИЗОВАНО 01.06.2026 (шаги 1–6 + прогон; жду визуальной приёмки). Тип **A** (новый Zustand-slice + Dexie-таблица + миграция схемы v5→v6 [реальная версия из кода, спека §0 ошибочно «v10→v11»] + decomp `feature-detection.js` + merge в матчере + новый раздел Library + пункт меню в виверах).
**Дата:** 01.06.2026. **База:** v0.8.4-alpha (schema v10, Vitest 4094 pass).
**Источники истины прочитаны (§0):** `feature-detection.js`, `SequenceView/index.jsx`, `SequenceView/tracks/AnnotationTrack.jsx`, `SequenceView/popups/build-selection-menu-items.js`, `Library/LibraryWorkspace.jsx`, `docs/COMPONENT_MAP.md`.

---

## §0. Срез размеров затрагиваемых модулей

| Файл | Размер | Статус |
|------|--------|--------|
| `src/feature-detection.js` | **26.26 КБ** (26 892 B) | над hard .js 25 КБ → **decomp первым пунктом** (§6 шаг 1). COMPONENT_MAP показывает 10 КБ — **устарел** (не обновлён после V134/V136/V138), R5-дрифт. Дрифт-finding `TD-SIZE-FEATURE-DETECTION` — закрывается этим decomp. |
| `src/components/SequenceView/index.jsx` | ~39 КБ | под hard 40, **впритык**. Правка = +1 проп + 1 строка в вызове `buildSelectionMenuItems` + рендер модалки по образцу `PrimerFromSelectionModal`. Рост <1 КБ — допустимо, но дописывать сверх этого нельзя. |
| `src/components/SequenceView/popups/build-selection-menu-items.js` | мал | +1 пункт + 1 параметр. |
| `src/components/Library/LibraryWorkspace.jsx` | ~14 КБ | +view-state + ветка рендера правой панели. |
| `src/components/SequenceView/tracks/AnnotationTrack.jsx` | 52.6 КБ (hard) | **НЕ в скоупе правки.** Промоут идёт через `buildSelectionMenuItems`, не через onContextMenu rect'а. Размер — известный `TD-ANNOTATIONTRACK-DECOMPOSE-V2`, не трогаем. |

Новые модули создаются с нуля (под лимиты): `lib/feature-match-core.js` (~20 КБ после переноса, под hard 25), `store/commonFeaturesSlice.js`, `components/Library/CommonFeaturesPanel/`, `components/SequenceView/popups/PromoteToCommonModal.jsx`, `components/SequenceView/hooks/usePromoteToCommon.js`.

---

## §1. Контекст

В библиотеке нет места, где биолог видит **известные (common) фичи** и может их **поправить** (заводская БД `common-features.json` содержит несовершенные записи). Нет способа добавить вручную размеченную на молекуле фичу в общую БД, чтобы она **детектилась впредь**. Заводская БД — статик-ассет (`fetch('/common-features.json')`, `loadFeatureDB`), мутировать её нельзя: будущие версии приложения привезут улучшенную заводскую БД, апдейт не должен затирать пользовательское.

Три требования Игоря (CURRENT_TASK):
1. **Раздел в библиотеке** — просмотр + правка common-фич (вкл. заводские).
2. **Промоут из аннотации** — правый клик по самой фиче в вивере → «Добавить в common-фичи» → едет в БД, детектится впредь, с дедуп-чеком.
3. **Common-фичи НЕ доступны как блоки** — не источник палитры сборки.

---

## §2. Стратегия

**Overlay-стор** (залочено Игорем): shipped `common-features.json` остаётся read-only статиком; отдельный Dexie-стор держит net-new фичи + оверрайды заводских (по id). Матчер мёржит built-in + user перед детекцией. Правка несовершенной заводской = запись оверрайда поверх; заводская в бандле цела; есть **reset к заводской**.

**Общий match-core** (архитектурное обоснование decomp): дедуп промоута («такой фичи ещё нет») обязан использовать **ту же** identity-машину, что детекция — иначе «дедуп = детекция» не гарантировать. Сейчас scoring приватен в `feature-detection.js` (над hard). Извлекаем engine в `lib/feature-match-core.js`; детекция и дедуп импортируют один модуль → конвенция не разъедется + файл уходит под hard.

**Reuse, не новые сущности** (§17): промоут — пункт в существующем меню по выделению (`buildSelectionMenuItems`), модалка по образцу `PrimerFromSelectionModal` (в `index.jsx`), `SequenceView` остаётся decoupled (DEC-SQV-07: store не импортирует, эмитит через callback). Раздел в библиотеке — узел в `LibraryTreeRoot` + свап правой панели в `LibraryWorkspace`, **не** новое окно/воркспейс.

**Req 3 по построению:** палитра/блоки читают `libraryEntries` (`Dag/DagPalette` + `Library/tree/TreeItemRow` drag, MIME `application/x-bodge-entry-id`). Common-фичи живут в ОТДЕЛЬНОМ сторе, никогда не попадают в `libraryEntries`, `CommonFeaturesPanel` не drag-source → ничего «отключать» не нужно, констрейнт держится сам.

---

## §3. Scope

**IN:**
- Новый Zustand-slice `commonFeatures` + Dexie-таблица + миграция v10→v11.
- Decomp `feature-detection.js` → `lib/feature-match-core.js` (pure-перенос) + новый экспорт `featureMatchesExisting`.
- Merge built-in + overlay в детекции (`getMergedFeatureDB` + инвалидация кэша).
- Промоут: пункт `onPromoteToCommon` в `buildSelectionMenuItems` + `PromoteToCommonModal` + `usePromoteToCommon` hook + проводка в 3 виверах.
- Раздел `CommonFeaturesPanel` (просмотр built-in + user, бейдж происхождения, правка/reset/удаление-user) + узел в дереве + свап панели.

**OUT:**
- Изменение формата заводской `common-features.json` (read-only).
- Промоут в Annotator-preview / Assembly / PCR (synthetic/template — тот же scope, что аннотатор-тоггл).
- Common-фичи как drag-source / источник палитры.
- Рефакторинг `AnnotationTrack` / правка onContextMenu rect'а (промоут идёт мимо).
- V130/V131/V137 и прочие открытые хвосты (свои трекеры).

---

## §4. Архитектурные решения

**DEC-CF-01 — Overlay-стор, не третий `kind` в `LibraryEntry`.** Common-фичи = отдельный slice/таблица, НЕ `LibraryEntry`. Причина: третий kind протёк бы в `libraryEntries` → в дерево/палитру (против Req 3). Shape записи overlay'а = shape фичи матчера: `{ id, name, type, sequence?, protein?, length }` + служебное `{ kind: 'user'|'override', baseId?, createdAt }`.

**DEC-CF-02 — Dexie-таблица + миграция v10→v11, аддитивная.** Новая таблица `commonFeatures` (по образцу остальных stores). Миграция = создание пустой таблицы, идемпотентна, без потерь. Бамп `DB_VERSION` 10→11 (Dexie кодирует IDB ×10 — это IDB v110, норма, ср. снятый Dexie-фантом).

**DEC-CF-03 — Merge в `getMergedFeatureDB` + инвалидация кэша.** Built-in грузится `loadFeatureDB` (статик, кэш `_db`). Overlay читается из slice. Merge: оверрайды заменяют built-in по `baseId` (по id заводской), net-new добавляются. `detectCommonFeaturesAsync` зовёт `getMergedFeatureDB` вместо `loadFeatureDB`. **Статик-кэш `_db` НЕ переиспользуется для merged** — merged-результат кэшируется отдельно и инвалидируется при любой мутации overlay-slice (юзер добавил/поправил/сбросил → следующая детекция видит изменение). Built-in `_db` кэш живёт как есть.

**DEC-CF-04 — Дедуп = детекция, через общий `featureMatchesExisting`.** Дубль определяется ТОЙ ЖЕ конвенцией, что матч: identity-based, RC-aware. Non-CDS → DNA-идентичность ≥ `identityThreshold` (0.96). Protein-путь (`type ∈ {CDS, marker, reporter}` с protein) → protein-идентичность (exact / fuzzy ≥0.90), как `detectCommonFeatures` (см. §9 вопрос C — подтверждён Игорем 01.06.2026). Совпало **имя** при разной ПСО → **warning** в модалке, не молчаливый дубль; биолог решает (добавить как вариант / отменить). `featureMatchesExisting(candidate, existing, {threshold}) → { matches:boolean, identity:number, by:'dna'|'protein'|'name' }` живёт в `feature-match-core.js`, тот же scoring что детектор.

**DEC-CF-05 — Промоут = consumer-gated пункт меню, scope = 3 вивера.** Пункт «Добавить в common-фичи» добавляется в `buildSelectionMenuItems` под тем же `matchedRegion`-гейтом, что edit/del (показывается, когда выделение совпало с region-фичей). Гейт по новому параметру `onPromoteToCommon` (absent ⇒ нет пункта — паттерн `onWritePrimer`/`onCreatePiece`/`onBlastSelection`). Прокидывается новым пропом `SequenceView` через `index.jsx`. Вешается ТОЛЬКО в: Library-инспектор (`LibraryWorkspace → LibrarySingleInspector → tabs/SequenceTab → SequenceView`), ContainerEditor (`ContainerEditorSkeleton`, те же tabs), Importer-инспектор (`PreImportModal`/`MultiImportView`). Annotator-preview + Assembly/PCR монтируют `SequenceView` мимо `SequenceTab` → проп undefined → scope соблюдён по построению.

**DEC-CF-06 — Раздел = узел дерева + свап правой панели, НЕ новое окно (§17 R2).** В `LibraryTreeRoot` — отдельный узел «Common-фичи» (не зона `libraryEntries`). Выбор узла ставит во `LibraryWorkspace` view-флаг → правая `<main>` рендерит `CommonFeaturesPanel` вместо `LibrarySingleInspector`. Reuse Tree+right-panel shell, доступ в пару кликов.

**DEC-CF-07 — Req 3 держится по построению.** Палитра/блоки = `libraryEntries`. Common-фичи = отдельный стор, не entries, panel не drag-source. Негативной проводки не требуется; инвариант: НЕ добавлять common-фичи в `libraryEntries` и НЕ делать panel источником drag.

**DEC-CF-08 — Decomp `feature-match-core.js` первым пунктом.** Переносим из `feature-detection.js` в `lib/feature-match-core.js` (pure, тела байт-в-байт): `detectCommonFeatures` + приватные (`translateFrame`, `dnaIdentity`, `dnaIdentityOffset`, `extendSeedPartial`/`extendProteinPartial`/`extendDnaPartial`, `combineCluster`, `mergeCollinearPartials`, `pushDedupedPartials`), константы `PROTEIN_PATHWAY_TYPES` / `PARTIAL_MERGE_MAX_GAP`, `featureRegionName`. Добавляем `featureMatchesExisting` (DEC-CF-04). В `feature-detection.js` остаётся: `loadFeatureDB` (статик), `detectCommonFeaturesAsync` (зовёт `getMergedFeatureDB`), **re-export** `detectCommonFeatures` + `featureRegionName` + `mergeCollinearPartials` + `PARTIAL_MERGE_MAX_GAP` (обратная совместимость импортов). Закрывает `TD-SIZE-FEATURE-DETECTION`.

**DEC-CF-09 — `featureRegionName` re-export, импортёры не трогаем.** `featureRegionName` импортируют Annotator-plugin, enrich, file-import (по докстрингу). После переноса в match-core — re-export из `feature-detection.js`, существующие пути импорта не ломаются.

---

## §5. Файлы / сигнатуры / тесты

### Новые модули

**`src/lib/feature-match-core.js`** — engine (перенос из `feature-detection.js`, тела без изменений) + новый экспорт:
- `featureMatchesExisting(candidate, existing, { threshold = 0.96 }) → { matches, identity, by }` — переиспользует scoring движка. Логика (3-5 шагов): если оба protein-путь (тип в `PROTEIN_PATHWAY_TYPES` + есть protein) → protein exact/fuzzy(≥0.90), `by:'protein'`; иначе DNA-идентичность обеих цепей (seq + rc) ≥ threshold, `by:'dna'`; имя совпало при non-match по ПСО → `by:'name', matches:false` (сигнал для warning).

**`src/store/commonFeaturesSlice.js`** — Zustand-slice + Dexie-персист. State: `userFeatures: {}` (net-new по id), `overrides: {}` (по baseId заводской). Actions (сигнатуры, не код):
- `promoteFeature(payload) → { ok, dupBy? }` — дедуп через `featureMatchesExisting` против merged-БД; при match → `{ ok:false, dupBy }`; иначе пишет в `userFeatures`, персистит, инвалидирует merged-кэш.
- `overrideCommonFeature(baseId, patch)` — пишет/обновляет оверрайд заводской, персист, инвалидация.
- `resetCommonFeature(baseId)` — удаляет оверрайд (возврат к заводской), персист, инвалидация.
- `deleteUserFeature(id)` — удаляет net-new, персист, инвалидация.
- селектор `selectMergedCommonFeatures(state) → Array<feature + {origin:'factory'|'user'|'overridden'}>` — для panel.
- hydrate из Dexie на старте (по образцу `hydrateProjectsFromDexie`).

**`getMergedFeatureDB()`** (в `commonFeaturesSlice.js` или `feature-match-core.js`-adjacent helper) → `Promise<{features}>` — `loadFeatureDB()` + overlay из `useStore.getState().commonFeatures` (App-Decomp: не-React читает getState()), оверрайды по baseId, append net-new. Кэш merged + флаг инвалидации.

**`src/components/SequenceView/popups/PromoteToCommonModal.jsx`** — по образцу `PrimerFromSelectionModal`: префилл `{ name, type, sequence }` из region+slice; поля name/type/ПСО редактируемы; показывает warning при дубле (через `checkCommonDuplicate` проп); `onConfirm` → consumer callback. Рендерится в `index.jsx` при `promoteDraft && onPromoteToCommon`.

**`src/components/SequenceView/hooks/usePromoteToCommon.js`** — DRY для 3 виверов: возвращает `{ onPromoteToCommon, checkCommonDuplicate }` (обёртки над slice-actions + дедуп-чек). Вивер: `const p = usePromoteToCommon(); <SequenceView onPromoteToCommon={p.onPromoteToCommon} checkCommonDuplicate={p.checkCommonDuplicate} .../>`.

**`src/components/Library/CommonFeaturesPanel/`** — список merged-фич (имя · тип · длина · бейдж factory/user/overridden), правка (lean inline-редактор name/type/ПСО — см. §9 вопрос B), reset-к-заводской на overridden, удаление на user. Поиск по имени/типу. НЕ drag-source.

### Правки существующих
- `feature-detection.js` — DEC-CF-08/09 (вынос + re-export + `detectCommonFeaturesAsync` → `getMergedFeatureDB`).
- `build-selection-menu-items.js` — +параметр `onPromoteToCommon`; +пункт под `matchedRegion` (рядом с delete), label из STRINGS.
- `SequenceView/index.jsx` — +пропы `onPromoteToCommon` / `checkCommonDuplicate`; прокинуть `onPromoteToCommon` в `buildSelectionMenuItems({...})`; рендер `PromoteToCommonModal` по образцу `PrimerFromSelectionModal` (стейт `promoteDraft`).
- `Library/LibraryWorkspace.jsx` — view-state (`selectedView: 'entry'|'common'`); узел дерева выбирает `'common'` → правая `<main>` рендерит `CommonFeaturesPanel`.
- `Library/tree/LibraryTreeRoot.jsx` — +узел «Common-фичи» (не зона entries), `onSelectCommonSection`.
- `lib/strings.js` — namespace `commonFeatures` (label пункта, заголовки panel, бейджи, warning дубля, reset/delete confirms). English UI-строки.
- `store/db.js` (или где схема) — таблица `commonFeatures` + миграция v10→v11.
- Проводка `onPromoteToCommon`/`checkCommonDuplicate` в Importer (`PreImportModal`/`MultiImportView`) + ContainerEditor (`ContainerEditorSkeleton`).

### Тесты (red→green, тесты первыми)
- `feature-match-core.test.js` — перенос существующих тестов детекции (пути импорта); `featureMatchesExisting`: DNA-дубль ≥96%, RC-дубль, protein-дубль CDS, имя-коллизия→`by:'name'`, ниже порога→no-match. + ~N вариаций.
- `commonFeaturesSlice.test.js` — promote (успех/дубль), override, reset (возврат к заводской), delete-user, merged-селектор (factory/user/overridden), hydrate. + миграция v10→v11 идемпотентна.
- `feature-detection-merge.test.js` — `getMergedFeatureDB` мёржит built-in+overlay; net-new детектится; оверрайд по baseId побеждает заводскую; кэш инвалидируется после мутации.
- `build-selection-menu-items.test.js` — пункт промоута есть при `matchedRegion`+`onPromoteToCommon`, нет без пропа, нет без matchedRegion.
- Компонентные (паритет с существующими popup-тестами): `PromoteToCommonModal` префилл+warning; `CommonFeaturesPanel` список+reset+delete. + ~N вариаций по паттерну.
- Регрессия: Annotator/Assembly/PCR `SequenceView` БЕЗ пункта промоута (проп undefined); палитра/`DagPalette` не показывает common-фичи; полный Vitest 4094→зелёный после переноса.

---

## §6. Порядок выполнения

1. **Decomp** (DEC-CF-08): `lib/feature-match-core.js` — перенос engine, re-export из `feature-detection.js`, обновить импортёров (или положиться на re-export). **Полный Vitest зелёный — гейт, дальше не идти.** Перенос pure, без правки логики V134/V138.
2. **`featureMatchesExisting`** в match-core + тесты.
3. **Slice + Dexie + миграция** v10→v11 + hydrate + тесты.
4. **`getMergedFeatureDB`** + `detectCommonFeaturesAsync` свитч + инвалидация + тесты.
5. **Промоут**: `build-selection-menu-items` пункт + `PromoteToCommonModal` + `usePromoteToCommon` + проводка `index.jsx` + 3 вивера + тесты.
6. **Раздел**: `CommonFeaturesPanel` + узел дерева + свап панели в `LibraryWorkspace` + тесты.
7. Полный прогон + size-budget строки + статус-шапка спеки `✅ РЕАЛИЗОВАНО`.

---

## §7. STOP / формат отчёта

**STOP:** после шага 6 (раздел реализован + тесты). НЕ финализировать PROJECT_STATE/DECISIONS/BUGS/RELEASES/ANCHORS/TECH_DEBT/CLAUDE.md/COMPONENT_MAP — жду визуальной приёмки (отдельная сессия).

**Отчёт в CURRENT_TASK.md:** коммит-хэши по шагам; Vitest+pytest счётчики; build status; сколько тестов переписано под перенос match-core; **отклонения от спеки** явным блоком; size-budget (новые нарушители hard; файлы +>5 КБ; подтвердить `feature-detection.js` < hard после decomp); **статус-шапка спеки проставлена** (да/нет).

---

## §8. Риски

1. **Decomp ломает V134/V138-партиал** (engine — недавно чинённый интрикат). → перенос байт-в-байт тел, только импорты/экспорты; полный Vitest как гейт шага 1.
2. **Staleness merged-кэша** (юзер поправил фичу, детекция показывает старое). → инвалидация на ЛЮБОЙ мутации slice; тест на это.
3. **Дедуп разъезжается с детекцией** (две реализации identity). → митигировано общим match-core (DEC-CF-08): один код, разъехаться нечему.
4. **`index.jsx` впритык к hard 40** → правка строго +пропы+модалка по образцу; если перевалит — decomp `index.jsx` отдельной задачей, не здесь.
5. **Свап правой панели ломает per-entry state** `LibraryWorkspace` → view-флаг ортогонален `selectedId`/`perEntryState`, не сбрасывает их; тест на возврат entry↔common.

---

## §9. Открытые вопросы

**A. Промоут одним правым кликом?** Пункт едет по рельсе edit/del (гейт `matchedRegion` = выделение совпало с region). Открыт ли edit/del на ОДНОМ правом клике по фиче (т.е. правый клик уже выделяет фичу через data-region-start/-end в root pointerdown), или это «клик→правый клик»? Не проверял `useSelectionState.onRootPointerDown` на ветку button≠0. Если правый клик НЕ авто-выделяет — это **pre-existing** (касается edit/del так же), и одно-клик-выделение — отдельная мелкая правка select-on-contextmenu, в скоупе/нет — реши. Промоут ведёт себя как edit/del в любом случае.

**C. Дедуп CDS — по протеину или по ДНК?** Игорь залочил «по идентичности ПСО». Но детекция матчит CDS по ПРОТЕИНУ (6 рамок, exact/fuzzy). Строгий «ПСО=ДНК» дедуп ПРОПУСТИТ синонимичный-кодон вариант, который детекция считает тем же протеином → дубль в БД, детектящийся как одно. Рекомендация: для protein-путь типов дедуп по протеину (как детекция), для non-CDS по ДНК ≥96% RC-aware — так «дедуп=детекция» строго. ✅ РЕШЕНО 01.06.2026 (Игорь): protein-путь — по протеину, non-CDS — по ДНК ≥96% RC. DEC-CF-04 финал.

**D. Откуда протеин у промоутнутого CDS?** Чтобы net-new CDS детектился protein-путём, overlay-записи нужен `protein`. Промоут CDS-фичи: транслировать ДНК-slice в рамке region → записать `protein` + `sequence`. Non-CDS: только `sequence`. (Импл-деталь, фиксирую чтоб не потерять.)

**B. Редактор common-фичи — lean или reuse `FeatureEditorModal`?** `FeatureEditorModal` (26 КБ) — редактор АННОТАЦИИ (coords/strand/split/merge/introns), заточен под region на молекуле. Запись common-БД проще: name/type/ПСО (+reset). Coords/strand/split к референс-записи неприменимы. Рекомендация: lean inline-редактор в panel, НЕ `FeatureEditorModal`. Финал — оценить при импле (§17 R1 «смотри нет ли удачной реализации»), но почти наверняка lean.

---

## §10. Приёмочная правка (01.06.2026) — детальный вид панели + EN-строки

**Статус:** ✅ РЕАЛИЗОВАНО 02.06.2026 (Пачка 2; жду визуальной приёмки деталь-вида + EN). Правки по визуальной приёмке. Шаги 1–8 PASS; панель — **FAIL** (lean-список не даёт верифицировать запись: нет ДНК-просмотра, АА, аннотации-трека, превью). Уровень детали и язык подтверждены Игорем 01.06: богатый вьювер (без табов История/Теги), UI — English.

### DEC-CF-10 — Панель = master-detail; деталь переиспользует `SequenceView` (§17 R1).
Смысл раздела — проверять/чинить заводские записи; lean-список (§5) для этого недостаточен (нельзя проверить запись, которую не видишь).
- **Мастер** — текущий список (имя · тип · длина · бейдж + поиск). Строка кликабельна → выбирает фичу.
- **Деталь** (по выбранной) — `LinearFeatureBar` (колбаса-превью) + `SequenceView` (read-only), композиция как в `LibrarySingleInspector`. Кормятся **синтезированным single-region фрагментом** из записи фичи (паттерн `inspector/tabs/SequenceTab.jsx` → его `fragment` useMemo):
  `{ id: feature.id, name, sequence: feature.sequence, annotations: [{ start: 0, end: length, name, type: feature.type, level: 'region' }], topology: 'linear' }`
- Даёт ДНК-дорожку + аннотацию-трек + **АА-дорожку** (`AATrack` транслирует внутри CDS-бокса для protein-путь типов CDS/marker/reporter — V133/V138) + колбасу. = «как в библиотеке с обычными фрагментами».
- **НЕ** брать `LibrarySingleInspector` целиком — теги/история/save-flow/праймеры/project-scope к референс-записи неприменимы (форс-фит). Берём `SequenceView` + `LinearFeatureBar` напрямую.
- Шапка детали: имя · тип · длина · бейдж + Edit / Reset(overridden) / Delete(user). Lean inline-редактор (§9-B) — открывается из детали, сохраняется как есть.
- Перф: монтируется вьювер только выбранной фичи (одна за раз, 40–400 нт); `SequenceView` и так lazy-mount.
- Layout: список колонкой ~300–320px + деталь flex; пустой выбор → hint.

### DEC-CF-11 — UI-строки `commonFeatures` → English (⚓ DEC-MA2-01).
Отклонение Code #5 (RU-строки) отклонено: ⚓ DEC-MA2-01 (English UI) в силе. Весь namespace `commonFeatures` в `lib/strings.js` + label пункта меню промоута + строки `PromoteToCommonModal` → English. (Заметка: appShell/startScreen сейчас RU — pre-existing дрифт от DEC-MA2-01, который Code принял за «доминирующую конвенцию»; полная реконсиляция UI — i18n-спринт, НЕ здесь.)

### Файлы
- `components/Library/CommonFeaturesPanel/index.jsx` — +`selectedKey` state, +деталь-пейн (`LinearFeatureBar` + `SequenceView` на синтезированном фрагменте), сборка фрагмента по паттерну `SequenceTab.fragment`. Edit/reset/delete → шапка детали.
- `lib/strings.js` — namespace `commonFeatures` → English (+ menu label + modal-строки).
- size budget: `CommonFeaturesPanel/index.jsx` 10.23 КБ + деталь — следить за soft 30 (не близко).

### Тесты (red→green)
- Клик по фиче → деталь монтирует `SequenceView` с single-region фрагментом записи; смена выбора → фрагмент меняется; CDS-фича → АА-дорожка присутствует; non-CDS → АА нет; пустой выбор → hint.
- EN: namespace `commonFeatures` — латиница (нет кириллицы), снапшот/`strings-coverage`.
- Регрессия: lean-редактор / reset / delete / поиск / возврат common↔entry — без изменений.

### STOP
После правки + прогон. Визуальная приёмка (деталь-вид + EN-строки) — отдельная сессия.
