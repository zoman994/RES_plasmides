# CURRENT_TASK.md

> **Активная задача: common-features — раздел + промоут.** Тип **A**.
> Статус: **🔴 ПРИЁМКА 01.06 — FAIL → правки (Пачка 2).** Шаги 1–8 PASS; панель — FAIL (lean-список) + EN-строки. Спека правок: `docs/SPEC_COMMON_FEATURES.md` §10.
> ✅ 1–14 проверены: 1–8 + 9–14 (промоут/модалка/дубль-warning/палитра) PASS; FAIL только панель + EN. Инвентарь закрыт. Реализация правок — отдельной Code-сессией, приёмка после.

## ПРИЁМКА 01.06 — FAIL → правки (Пачка 2)

1–8 PASS (Игорь). Панель FAIL: lean-список не даёт верифицировать запись (нет ДНК/АА/аннотации/превью). Спека правок — `SPEC_COMMON_FEATURES.md` §10 (DEC-CF-10 деталь-вид, DEC-CF-11 EN).

- [x] **Панель master-detail** — список (мастер) + деталь по выбранной фиче: `LinearFeatureBar` + `SequenceView` (read-only) на single-region фрагменте записи (паттерн `SequenceTab.fragment`). ДНК + аннотация-трек + АА (CDS/marker/reporter) + колбаса. **НЕ** `LibrarySingleInspector` целиком. Edit/reset/delete → шапка детали; lean-редактор §9-B сохраняется.
- [x] **EN-строки** — namespace `commonFeatures` в `lib/strings.js` + menu label + `PromoteToCommonModal` → English (⚓ DEC-MA2-01; отклонение Code #5 отклонено).
- [x] 9–14 (промоут/модалка/дубль-warning/палитра) — PASS, доп. фейлов нет.
- [x] Тесты по §10 (деталь-вид + EN + регрессия lean/reset/delete/поиск/возврат common↔entry).

**Было / стало:**
- Панель: БЫЛО плоский список (сиквенс только в textarea при правке), нет АА/аннотации/превью → СТАЛО master-detail с инспекторным `SequenceView`.
- Строки: БЫЛО RU (отклонение #5) → СТАЛО English.

**STOP:** после правок + прогон. НЕ финализировать. Визуальная приёмка — отдельная сессия.

**Финализация (после приёмки правок, НЕ сейчас):** закрыть `TD-SIZE-FEATURE-DETECTION` (DONE, `feature-detection.js` 2.8 КБ); обновить размер `TD-SIZE-SEQUENCEVIEW-INDEX` (index.jsx 49.71); R5 COMPONENT_MAP для `feature-detection.js` (было 10 КБ, реально 26 до decomp); **PROJECT_STATE шапка «Schema v=10» → v6** (устаревшая строка, реальный `DB_VERSION=6` по `db/dexie-schema.js`); DEC-CF-01..11 в DECISIONS; ротация BUGS/PROJECT_STATE/RELEASES.

**Handoff Code (инвентарь закрыт):** «Прочитай CLAUDE/BUGS/CURRENT_TASK + SPEC_COMMON_FEATURES §10. Сделай Пачку 2, после последнего коммита стоп — жду визуальной приёмки, не финализируй PROJECT_STATE/DECISIONS/BUGS/RELEASES/ANCHORS/TECH_DEBT/CLAUDE/COMPONENT_MAP.»

## TL;DR

Overlay-стор для common-фич (built-in `common-features.json` read-only + Dexie net-new/оверрайды + reset). Раздел в Library (узел дерева + свап правой панели, §17). Промоут «Добавить в common-фичи» — пункт меню по выделению в 3 виверах. Decomp `feature-detection.js` первым пунктом (над hard + общий match-core для «дедуп=детекция»). Common-фичи НЕ в палитру (Req 3 по построению).

## Порядок чтения (Code)

`CLAUDE.md` → `BUGS.md` → этот файл → **`docs/SPEC_COMMON_FEATURES.md`** (контракт; тело не переписывать, только статус-шапка после реализации).

## Чеклист (= §6 спеки, артефакты)

- [x] **Шаг 1 — Decomp.** `lib/feature-match-core.js` (перенос engine из `feature-detection.js`, тела байт-в-байт), re-export из `feature-detection.js` (`detectCommonFeatures` + `featureRegionName` + `mergeCollinearPartials` + `PARTIAL_MERGE_MAX_GAP`). **Гейт: полный Vitest зелёный.** Без правки логики V134/V138.
- [x] **Шаг 2 — `featureMatchesExisting`** в match-core (DEC-CF-04) + тесты. *(в `lib/feature-dedup.js` — split из match-core по решению Игоря, size-budget; см. отчёт.)*
- [x] **Шаг 3 — Slice + Dexie.** `store/commonFeaturesSlice.js` (userFeatures/overrides + actions promote/override/reset/deleteUser + merged-селектор + hydrate) + таблица `commonFeatures` + миграция **v5→v6** (реальная версия из кода) + тесты.
- [x] **Шаг 4 — Merge.** `getMergedFeatureDB()` + `detectCommonFeaturesAsync` свитч на него + инвалидация merged-кэша на мутации slice + тесты.
- [x] **Шаг 5 — Промоут.** Пункт в `build-selection-menu-items.js` (+param `onPromoteToCommon`, гейт `matchedRegion`) + `PromoteToCommonModal.jsx` (по образцу `PrimerFromSelectionModal`) + `usePromoteToCommon.js` + проводка `SequenceView/index.jsx` + 2 вивера (Library-инспектор / ContainerEditor; Importer — нет inline-вивера, см. отчёт) + тесты.
- [x] **Шаг 6 — Раздел.** `Library/CommonFeaturesPanel/` + узел в `LibraryTreeRoot` + view-свап в `LibraryWorkspace` + тесты.
- [x] **Шаг 7 — Прогон.** Полный Vitest + size-budget строки + статус-шапка спеки `✅ РЕАЛИЗОВАНО [дата]`.

## STOP

После шага 6. **НЕ финализировать** PROJECT_STATE / DECISIONS / BUGS / RELEASES / ANCHORS / TECH_DEBT / CLAUDE.md / COMPONENT_MAP — жду визуальной приёмки (отдельная сессия).

## Формат отчёта (сюда, в конец)

Коммит-хэши по шагам; Vitest+pytest счётчики; build; сколько тестов переписано под перенос match-core; **отклонения от спеки** явным блоком; size-budget (новые hard-нарушители; файлы +>5 КБ; **подтвердить `feature-detection.js` < hard 25 после decomp**); статус-шапка спеки проставлена (да/нет).

## При регрессии

Перенос match-core (шаг 1) красит существующие тесты детекции → это пути импорта, чинить импорты, НЕ логику. Если Vitest падает не на импортах после шага 1 — стоп, перенос задел поведение, откат к байт-в-байт.

## Решения / рекомендации (Code берёт по умолчанию)

- **C — РЕШЕНО (Игорь 01.06): дедуп protein-путь типы (CDS/marker/reporter) по протеину, non-CDS по ДНК ≥96% RC.** = DEC-CF-04 финал. Так «дедуп=детекция» строго.
- **A** — промоут одним правым кликом по фиче зависит от того, выделяет ли правый клик фичу (как edit/del). Pre-existing; одно-клик-фикс — отдельная мелочь, реши надо ли (вне обязательного скоупа).
- **B/D** — редактор раздела lean (НЕ `FeatureEditorModal`); протеин промоутнутого CDS = трансляция ДНК-slice в рамке region. Рекомендации в спеке §9, Code берёт по умолчанию.

## Хвосты (НЕ часть задачи; при финализации)

`TD-SIZE-FEATURE-DETECTION` — закрывается decomp шага 1, залогировать DONE при правке TECH_DEBT. COMPONENT_MAP R5-дрифт: `feature-detection.js` помечен 10 КБ, реально 26.26 — поправить при R5-обновлении карты (на приёмке). Прочее (V130/V131/V137, docs/ ре-блоат, ⚓-промоция T-серии) — свои трекеры.

---

## Отчёт Code (01.06.2026) — реализация SPEC_COMMON_FEATURES, шаги 1–7

**Коммиты по шагам** (ветка `feature/m-x-7a-library-structure-v2`):
- Шаг 1 (decomp `feature-match-core`): `0d916c6`
- Шаг 2 (`featureMatchesExisting` → `lib/feature-dedup.js`): `482a18e`
- Шаги 3–4 (slice + Dexie v5→v6 + merged-детекция): `505c353`
- Шаг 5 (промоут из аннотации): `3c9f488`
- Шаг 6 (раздел Library): `7f39339`
- Шаг 7 (отчёт + статус-шапка спеки): этот коммит

**Прогон.** Vitest: **4210 pass / 0 fail / 17 skipped** (443 файла). pytest (бэкенд не тронут): **115 pass**. Build (`vite build`): **clean** (exit 0).

**Тестов переписано под перенос match-core: 0.** Re-export из `feature-detection.js` сохранил все пути импорта → existing detection-тесты (`feature-detection*.test.js`, `enrichment`, `feature-name-partial-v136`) зелёные без правок. Добавлен новый `feature-dedup.test.js` под `featureMatchesExisting`.

### Отклонения от спеки (явный блок)
1. **`featureMatchesExisting` в `lib/feature-dedup.js`, не в `feature-match-core.js`** (DEC-CF-04/08 буквально). Причина: движок после байт-в-байт переноса = **24.93 КБ** при hard 25 (спека §0 ожидала ~20); +`featureMatchesExisting` пробил бы hard. **Решение Игоря 01.06 — «отдельный модуль дедупа».** Импортирует примитивы движка (`dnaIdentity`, `PROTEIN_PATHWAY_TYPES`) → «дедуп=детекция» сохранён по построению.
2. **Миграция Dexie v5→v6, НЕ v10→v11** (спека §0/DEC-CF-02). Реальная `DB_VERSION` в коде = **5** (а не 10) → +1 = **6**. Спека ошиблась в baseline. Миграция аддитивная (новая таблица `commonFeatures`), без wipe; исключена из `clearAll` как `snippets` (account-global).
3. **`SequenceView/index.jsx` уже НАД hard 40 ДО правки.** Фактический размер на старте — **48.24 КБ** (спека §0: «~39, под hard 40, впритык» — ошибочный baseline). Правка минимальная по явному разрешению §0 + risk #4 (+пропы +1 строка +модалка): 48.24 → **49.71 КБ** (Δ+1.47). **Нужен отдельный decomp-таск** (risk #4: «decomp index.jsx отдельной задачей, не здесь»). → новый TD при финализации.
4. **Importer (3-й вивер по DEC-CF-05) — промоут не привязан: N/A в живом пути.** Текущий Importer (`AddModal` → file-picker → прямой импорт) НЕ рендерит inline context-menu `SequenceView`/`SequenceTab` (`PreImportModal`/`MultiImportView` без вивера). Привязаны 2 вивера: Library-инспектор (`LibrarySingleInspector`) + ContainerEditor (`ContainerEditorSkeleton`, основной + mutagenesis `SequenceTab`). Гейт по пропу — OUT-виверы (Annotator-preview/Assembly/PCR), хоть и используют `SequenceTab`, проп не получают → пункт не появляется.
5. **UI-строки `commonFeatures` — РУССКИЕ + EN-комменты,** а не «English UI-строки» (спека §5). Доминирующая свежая конвенция `strings.js` (appShell/startScreen — RU) + предпочтение Игоря. Соседние primer-пункты того же меню — RU.
6. **+`updateUserFeature` slice-экшн** (сверх списка §5) — для inline-правки net-new фич в панели (контрпарт `deleteUserFeature`).
7. **Тест merge назван `feature-detection-overlay.test.js`** (не `feature-detection-merge.test.js` из §5) — коллизия с существующим `feature-detection-merge-v134.test.js`.
8. **Хардненинг pre-existing флака `primer-wizard.test.jsx` (тест-1):** гонка async `resourceHash` (тест ждал чекбокс, не хэш); мой прирост тест-нагрузки её обнажил (шаг-1 полный прогон был чист). Добавил poll-ожидание хэша + mock `fetch` в `commonFeaturesSlice.test`. Тест-only, продукт не тронут.

### Size-budget
- `lib/feature-match-core.js`: новый, **24.93 КБ** (hard 25 — OK, под лимитом).
- `feature-detection.js`: 26.26 КБ → **2.79 КБ** (decomp; **подтверждено < hard 25** — `TD-SIZE-FEATURE-DETECTION` закрыт).
- `lib/feature-dedup.js` 4.56 · `store/commonFeaturesSlice.js` 7.30 · `PromoteToCommonModal.jsx` 7.36 · `usePromoteToCommon.js` 2.33 · `CommonFeaturesPanel/index.jsx` 10.23 · `build-selection-menu-items.js` 5.5→6.32 — все под лимитами.
- `components/SequenceView/index.jsx`: 48.24 → **49.71 КБ** (Δ+1.47; **БЫЛ над hard 40 до правки** — pre-existing нарушитель, нужен decomp).
- `ContainerEditorSkeleton.jsx`: ~38.2 → 38.5 КБ (Δ+0.3; soft-зона, под hard, pre-existing).
- **Новые hard-нарушители: НЕТ.** **Файлы +>5 КБ: НЕТ** (feature-match-core +24.93 — это перенос из feature-detection −23.5, нетто по репо ~0).
- **Size budget: OK** (единственный над-hard — `index.jsx`, pre-existing; флаг на отдельный decomp-таск).

**Статус-шапка спеки проставлена: ДА** — `✅ РЕАЛИЗОВАНО 01.06.2026` в `docs/SPEC_COMMON_FEATURES.md`.

### STOP
Шаги 1–6 + прогон сделаны. **НЕ финализировал** PROJECT_STATE / DECISIONS / BUGS / RELEASES / ANCHORS / TECH_DEBT / CLAUDE.md / COMPONENT_MAP — жду визуальной приёмки (отдельная сессия). Хвосты для финализации: закрыть `TD-SIZE-FEATURE-DETECTION` (DONE), завести TD на decomp `SequenceView/index.jsx` (над hard), R5-дрифт COMPONENT_MAP для `feature-detection.js`.

---

## Отчёт Code (02.06.2026) — Пачка 2 (приёмочная правка §10)

**Коммит:** деталь-вид панели + EN-строки — `<этот коммит>`.

**DEC-CF-10 — master-detail.** `CommonFeaturesPanel/index.jsx` переписан: мастер-список (имя · тип · длина · бейдж + поиск, строки кликабельны → `selectedKey`) + деталь-пейн по выбранной фиче. Деталь = шапка (имя · тип · длина · бейдж + Edit / Reset(overridden) / Delete(user) + inline-confirm) + `LinearFeatureBar` (колбаса) + read-only `SequenceView` на **синтезированном single-region фрагменте** (`{id,name,sequence,annotations:[{0..len, type, level:'region'}],type:'misc_feature',strand:1}` — паттерн `SequenceTab.fragment`). Даёт ДНК + аннотацию-трек + **АА-трек** (`AATrack` для CDS/marker/reporter — `TRANSLATABLE_TYPES`). НЕ `LibrarySingleInspector` целиком — только `SequenceView` + `LinearFeatureBar`. Lean-редактор §9-B сохранён (открывается из шапки детали). Пустой выбор → hint.

**DEC-CF-11 — EN-строки.** Namespace `commonFeatures` в `lib/strings.js` целиком → English (+ menu label промоута + `PromoteToCommonModal`). Отклонение Code #5 (RU) снято — ⚓ DEC-MA2-01 в силе.

**Прогон.** Vitest **4214 pass / 0 fail / 17 skipped** (444 файла). pytest (бэкенд не тронут) **115 pass**. Build clean.

**Тесты.** `CommonFeaturesPanel.test.jsx` переписан под master-detail: клик→деталь монтирует `SequenceView` (single-region фрагмент); CDS→`sequence-view-aa-row` present, promoter→absent; смена выбора→фрагмент меняется; пустой→hint; edit→override(badge overridden)/reset/delete(+clear→hint)/поиск — регрессия. Новый `strings-commonfeatures-en.test.js` (нет кириллицы в namespace + точные EN-лейблы). `PromoteToCommonModal`/`build-selection-menu-items`/`library-workspace` тесты зелёные (строки читаются из STRINGS, не хардкод).

**Size-budget.** `CommonFeaturesPanel/index.jsx` 10.23 → **15.48 КБ** (Δ+5.25; soft 30 — OK, не близко). `lib/strings.js` ~без изменения размера (RU↔EN). Новых hard-нарушителей нет. Size budget: OK.

**Отклонения от §10:** нет (контракт DEC-CF-10/11 выполнен как написан).

**Статус-шапка §10: ✅ РЕАЛИЗОВАНО 02.06.2026** проставлена.

**STOP:** жду визуальной приёмки (деталь-вид + EN) — отдельная сессия. Доки (PROJECT_STATE/DECISIONS/BUGS/RELEASES/ANCHORS/TECH_DEBT/CLAUDE/COMPONENT_MAP) НЕ финализированы.
