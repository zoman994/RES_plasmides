# SPEC — WT-B Import Batch (V103 + V104 + WT-D-2)

**Тип:** C (bugfix-пакет одного пути — импорт). **Версия:** v0.8.3-alpha. **Дата:** 23.05.2026.
**Закрывает:** `BUGS.md` V103, V104; `docs/UX_AUDIT_FINDINGS.md` WT-D-2, WT-D-3 (WT-D-3 ≡ V104).
**Источник находок:** `docs/WALKTHROUGH_OVERLAP_PCR_2026_05_23.md` §A WT-B-1/B-2, §C WT-D-2/D-3.

---

## §0 Размеры затрагиваемых модулей

| Файл | Размер | Лимит | Примечание |
|---|---|---|---|
| `file-import.js` | ~8.0 KB | .js 25/20 | запас большой |
| `components/CanvasSkeleton/LibraryTreeHost.jsx` | ~8.0 KB | .jsx 40/30 | запас большой |
| `components/Library/AddModal/AddModal.jsx` | 12.66 KB | .jsx 40/30 | запас большой |

Декомпозиция не требуется.

---

## §1 Контекст

Два дефекта на пути импорта в canvas-скелете (`LibraryTreeHost`), оба воспроизведены живым прогоном overlap-PCR 23.05 и подтверждены чтением кода.

**V103 — `parseFasta` теряет сиквенс при header+sequence в одной строке.** `parseFasta` (`file-import.js`) для строки `>F1 ACGTACGT...`: ветка `line.startsWith('>')` берёт `name = line.slice(1).trim().split(/\s+/)[0]` (= `F1`), **остаток строки отбрасывается** — в `seqParts` не попадает. `sequence=''` → `parseFile` бросает `No sequence found in file`. Путь вставки: `LibraryTreeHost.onLaunchPreImport` (`source==='paste'`) при не-GenBank тексте создаёт синтетический `new File([text], 'pasted.fasta')` → `parseFile` по ext `.fasta` идёт прямо в `parseFasta`, raw-ACGT фолбэка на этой ветке нет. Биолог, вставивший FASTA одной строкой, получает тост ошибки.

**V104 — common-features не детектятся при импорте через canvas.** `enrichWithCommonFeatures` (homology-обогащение) вызывается только внутри `enrichAnnotations` (`file-import.js`), а та — только из `handleFileImport`/`handleFilesImport`. `LibraryTreeHost.importFiles` зовёт **голый `parseFile`** — и для вставки, и для файлового пикера (это общий путь обоих). Итог: в canvas-импорте обогащение не идёт ни для файла, ни для вставки. (Формулировка прогона «файл обогащается, вставка нет» относилась к production-импортеру `handleFileImport`-based; `LibraryTreeHost` — отдельный путь, в нём не обогащается ничто.) Подтверждено: F встал «456 bp · linear» без features.

**WT-D-2 — нет управления autoAnnotate.** `enrichAnnotations` уже принимает флаг `opts.autoAnnotate` (дефолт true). До UI он не доведён — биолог не может отключить авто-обогащение. Согласованное решение: тумблер в `AddModal` (дефолт on).

---

## §2 Стратегия

V103 — точечная правка `parseFasta`: спасать остаток header-строки **только когда иначе сиквенса нет вовсе** (нуклеотид-онли паттерн) — это не ломает ни нормальный multi-line FASTA, ни `>name описание`. V104 — `importFiles` после `parseFile` прогоняет `enrichAnnotations`; путь становится единым с файловым. WT-D-2 — флаг `autoAnnotate` пробрасывается `AddModal` → `preset` → `importFiles` → `enrichAnnotations`.

---

## §3 Где задача сядет (связи)

- **`file-import.js`** — `parseFasta` (правка), `enrichAnnotations` (без правок, переиспользуется). Алгоритмический модуль корня — реализует Code.
- **`LibraryTreeHost.jsx`** — `importFiles` (правка сигнатуры + тело), `onLaunchPreImport` (проброс флага). Импортирует `parseFile` из `file-import.js`; добавляет импорт `enrichAnnotations` оттуда же.
- **`AddModal.jsx`** — добавить чекбокс autoAnnotate в состояние модалки; включить в `preset`, передаваемый в `onLaunchPreImport`.
- Ничего нового не создаётся — расширяются существующие функции. `handleFileImport`/`handleFilesImport` не трогаются (production-импортеры на них завязаны).
- Риск регрессии: `buildLibraryEntry` потребляет `parsed`. `enrichAnnotations` возвращает `{...parsedItem, annotations, _fromFileCount}` — `_ext`/`_metadata` (нужны для .dna primers) сохраняются спредом. **Использовать `enrichAnnotations`, НЕ `handleFileImport`** — последний стрипает `_ext`/`_metadata`/`_fromFileCount`.

## Scope IN
- `parseFasta` — спасение header-остатка.
- `LibraryTreeHost.importFiles` — прогон `enrichAnnotations` + флаг.
- `AddModal` — UI-тумблер autoAnnotate.
- Тесты V103/V104 + регрессия.

## Scope OUT
- `handleFileImport`/`handleFilesImport`, production-импортеры (`PreImportModal`/`useImporterState`) — не трогать.
- WT-UX-6/7/8/9 (textarea word-wrap, тумблер топологии, поле имени, заголовок `AddModal`) — отдельная мини-спека по `AddModal`.
- Топология при FASTA-вставке (`parseFasta` хардкодит `linear`) — не V103.
- Случай `>F1ACGT` (имя слеплено с сиквенсом без пробела) — неразрешимо, OUT.

---

## §4 Архитектурные решения

1. **V103 — спасение только при пустом `seqParts`.** В ветке `>`-строки кроме `name` запоминать `headerRest` = часть строки после первого whitespace-токена (только у первого header'а). После цикла: если `seqParts` пуст И `headerRest` (после strip whitespace) непуст И полностью матчит нуклеотид-онли паттерн (`[ACGTURYSWKMBDHVN]`, без регистра) — затолкать stripped-`headerRest` в `seqParts`. Триггерится исключительно когда сиквенса иначе нет → multi-line FASTA и `>name текстовое описание` не задеты (описание с пробелами/не-ACGT не матчит; а при multi-line `seqParts` непуст и спасение не срабатывает).

2. **V103 — raw-ACGT фолбэк в `parseFile` НЕ добавляем.** После п.1 он избыточен: headerless raw-ACGT в `.fasta`-файле `parseFasta` и так берёт (нет `>`-строки → строка идёт в `seqParts`); `>F1 ACGT` — закрывает п.1. Минимизируем поверхность правки.

3. **V104 — `importFiles` через `enrichAnnotations`.** После `parseFile(f)` — `enrichAnnotations(parsed, { autoAnnotate })`, результат → `buildLibraryEntry({ parsed: enriched, ... })`. `enrichAnnotations` сам безопасен (динамический импорт `auto-annotate`, no-op при недоступности модуля / пустом сиквенсе / `autoAnnotate:false`).

4. **WT-D-2 — флаг сквозной, дефолт on.** `importFiles(files, projectId, { autoAnnotate = true })`. `onLaunchPreImport` берёт `preset.autoAnnotate` (дефолт true, если `AddModal` не передал). `onAddToLoose` (file-picker без `AddModal`) — дефолт true. `AddModal` — чекбокс «Авто-аннотация» (вкл. по умолчанию), значение кладётся в `preset`.

---

## §5 Файлы и правки

**`file-import.js` — `parseFasta`:**
- В цикле в ветке `line.startsWith('>')`: при первом header'е помимо `name` сохранить `headerRest` (остаток `line.slice(1).trim()` после удаления первого токена).
- После цикла перед `sanitizeSequence`: если `seqParts.length === 0` и `headerRest` непуст — `stripped = headerRest.replace(/\s/g,'')`; если `stripped` непуст и матчит `^[ACGTURYSWKMBDHVN]+$/i` — `seqParts.push(stripped)`.
- Остальное (`sanitizeSequence`, return-shape) без изменений.

**`LibraryTreeHost.jsx`:**
- Импорт: добавить `enrichAnnotations` из `'../../file-import'`.
- `importFiles(files, projectId, opts = {})` — после `const parsed = await parseFile(f)` добавить `const enriched = await enrichAnnotations(parsed, { autoAnnotate: opts.autoAnnotate !== false })`; `buildLibraryEntry({ parsed: enriched, fileName: f.name, projectId })`.
- `onLaunchPreImport` — оба вызова `importFiles(...)` (file + paste) получают третьим аргументом `{ autoAnnotate: preset?.autoAnnotate !== false }`.
- `onAddToLoose` — `importFiles(files, null)` оставить (дефолт true сработает сам).

**`AddModal.jsx`:**
- Локальное состояние `autoAnnotate` (init `true`); чекбокс/тумблер «Авто-аннотация» в теле модалки (строка STRINGS — `lib/strings.js`, namespace по месту `AddModal`).
- В `preset`, уходящий в `onLaunchPreImport`, добавить поле `autoAnnotate`.

---

## §6 Тесты

`file-import` (расширить существующий тест-файл `parseFasta`/`parseFile`):
- `parseFasta('>F1 ACGTACGTACGT')` → `sequence === 'ACGTACGTACGT'`, `name === 'F1'`.
- `parseFasta('>pUC19 cloning vector\nGGGG')` → `name === 'pUC19'`, `sequence === 'GGGG'` (спасение НЕ сработало — описание проигнорировано, сиквенс из строки ниже).
- `parseFasta('>ACGT')` (header-only, остатка нет) → `sequence === ''` (поведение не меняется).
- `parseFile` синтетического `new File(['>F1 ACGTACGT'], 'pasted.fasta')` → не бросает, `sequence` непуст.
- Плюс ~2 вариации по паттерну (IUPAC-коды в остатке; multi-line FASTA — регрессия, спасение не триггерится).

`LibraryTreeHost` (V104):
- `importFiles` с paste-`File` — спай/мок на `enrichAnnotations` (или `auto-annotate.enrichWithCommonFeatures`): путь проходит через обогащение, не оканчивается голым `parseFile`.
- `autoAnnotate:false` в opts → `enrichAnnotations` вызван с `{autoAnnotate:false}` (обогащение пропущено).
- Регрессия: существующие тесты импорта зелёные.

---

## §7 Порядок выполнения

1. `parseFasta` (V103) + тесты.
2. `LibraryTreeHost.importFiles` через `enrichAnnotations` (V104) + тесты.
3. `AddModal` тумблер + проброс флага (WT-D-2).
4. Полный Vitest + `vite build`.

---

## §8 STOP-условие и формат отчёта

После §3 IN + зелёного полного Vitest + `vite build` clean — **STOP**, отчёт в `CURRENT_TASK.md`: commit range (или working-tree), Vitest counters (pass/skip/fail), `vite build`, spec deviations, size budget по 3 файлам. Координационные файлы не финализировать. Визуальная приёмка — отдельная сессия.

---

## §9 Риски

- **R1 — нуклеотид-онли описание ложно опознано как сиквенс.** Митигация: спасение только при `seqParts.length===0`; реальный multi-line FASTA не задет; однословное ACGT-описание без строк сиквенса — патологический ввод, ущерб нулевой (это и есть тот сиквенс).
- **R2 — `enrichWithCommonFeatures` медленный на длинном сиквенсе** (homology-скан). Митигация: уже async, `enrichAnnotations` — отдельный await после `parseFile`; UX-спиннер вне scope, при жалобе — отдельный таск.
- **R3 — `buildLibraryEntry` ждёт поле, потерянное при обогащении.** Митигация: `enrichAnnotations` сохраняет `_ext`/`_metadata` спредом; использовать её, не `handleFileImport`. Code проверяет shape `enriched` против ожиданий `buildLibraryEntry`.
- **R4 — production-импортеры задеты.** Митигация: правится только `LibraryTreeHost.importFiles`; `handleFileImport`/`handleFilesImport`/`useImporterState` не трогаются.

---

## §10 Открытые вопросы

1. Нуклеотид-паттерн в п.4.1 — включать ли `*`/`-` (gap-символы FASTA-выравнивания)? Дефолт: нет (вставляют сырые фрагменты, не выравнивания). Если Игорь работает с aligned-FASTA — добавить.
2. `AddModal` тумблер autoAnnotate — место в layout (рядом с paste-textarea / в футере)? Дизайн-система `AddModal`, на усмотрение Code; при сомнении — скриншот Игорю.
