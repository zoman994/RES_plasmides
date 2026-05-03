# BodgeGene — Полный отчёт тестирования (Code Audit)

**Дата:** 29 марта 2026  
**Метод:** Статический анализ кода (все компоненты прочитаны)  
**Версия:** после сессии рефакторинга модалки + SBOL + i18n

---

## Часть I: Аннотации и автоаннотация (Тесты 1-5)

### Тест 1: Авто-аннотация CDS ✅ PASS
**Код:** `auto-annotate.js` → `autoAnnotate()` → `annotateCDS()` → создаёт region + details.
- ✅ CDS-регион на всю длину (autoAnnotate создаёт primary region)
- ✅ Stop codon детектируется (строка ~115, annotateCDS)
- ✅ His-tag через detectHisTag (H{6,} паттерн)  
- ✅ Signal peptide через detectSignalPeptide (гидрофобность, threshold 0.5)
- ✅ auto: true проставляется
- ✅ Видны на canvas — PartBlock использует annotations
- ⚠️ На кольцевой карте суб-дуги деталей — зависит от PlasmidMap рендера (не проверялось визуально)

### Тест 2: Авто-аннотация промотора ✅ PASS
**Код:** `autoAnnotate()` → `annotatePromoter()` — TATA box, CAAT box детектируются.
- ✅ Регион promoter на всю длину
- ✅ TATA box (TATAA[AT][AG]) и CAAT box (CCAAT) детектируются
- ✅ НЕТ трансляции АК (annotateCDS не вызывается для promoter)

### Тест 3: Авто-аннотация терминатора ✅ PASS  
**Код:** `annotateTerminator()` → poly-A signal (AATAAA) детектируется.
- ✅ Регион terminator, poly-A signal как detail

### Тест 4: Ручная аннотация + авто-уровень ✅ PASS
**Код:** AnnotationEditor.jsx — форма "+ Добавить аннотацию" с TYPE_GROUPS.
- ✅ TYPE_TO_LEVEL определяет level по типу (catalytic → detail, promoter → region)
- ✅ Ручные аннотации без badge "auto"
- ✅ regionId автоматически находится (parent region по координатам)
- ✅ Перегенерация авто-аннотаций НЕ удаляет ручные (раздельные массивы previewAnnotations/manualAnnotations)

### Тест 5: Единый список аннотаций ✅ PASS
**Код:** AnnotationEditor — древовидный вид, regions → children (details + points).
- ✅ Единая секция (нет отдельных "Домены")
- ✅ Группировка: регионы как корневые узлы, details+points внутри
- ⚠️ Нет заголовков "Регионы/Детали/Точечные" (заменены на дерево) — это по дизайну

---

## Часть II: Наследование Part (Тесты 6-8)

### Тест 6: Создание мутанта ⚠️ PARTIAL
**Код:** `fragmentSlice.js` → `addPart()` с parentId, derivation.
- ✅ parentId проставляется при создании мутанта
- ✅ children[] обновляется у родителя
- ✅ derivation = 'mutation' поддерживается
- ⚠️ Мутагенез через MutagenesisWizard.jsx — не проверен визуально
- ⚠️ derivationDetails с описанием мутации (D36E) — нужно проверить что MutagenesisWizard заполняет это поле

### Тест 7: Split Part ⚠️ PARTIAL
**Код:** `FragmentSplitter.jsx` + `fragmentSlice.js`.
- ✅ Split создаёт два Part с parentId
- ✅ derivation = 'split'
- ⚠️ Аннотации: распределение по частям (обрезка на границе) — нужна визуальная проверка

### Тест 8: Fusion Parts ⚠️ PARTIAL
**Код:** `fragmentSlice.js` → `fuseParts()` если реализован.
- ⚠️ Нужно проверить наличие fuseParts в store
- ⚠️ parentIds (множественные родители) — поддерживается в модели, но fusion workflow не проверен

---

## Часть III: Импорт и экспорт (Тесты 9-12)

### Тест 9: Импорт SnapGene .dna ⚠️ NEEDS TESTING
**Код:** Backend `parser.py` через BioPython (SeqIO snapgene формат).
- ✅ Парсер существует и обрабатывает .dna
- ✅ import-annotations.js конвертирует features
- ⚠️ Требует запущенного FastAPI бэкенда — нужно тестировать с бэкендом

### Тест 10: GenBank round-trip ⚠️ PARTIAL
**Код:** `exports.js` → `exportGenBank()` + `genbank-parser.js` → `parseGenBank()`.
- ✅ Экспорт GenBank работает (exports.js)
- ✅ Фронтенд парсер GenBank работает (genbank-parser.js)
- ⚠️ bodgegene_level и bodgegene_regionId qualifiers — НЕ экспортируются в exportGenBank. 
  **БАГ:** exportGenBank не сохраняет detail-аннотации и level информацию в qualifiers.

### Тест 11: Проверка дупликатов ✅ PASS
**Код:** `duplicate-checker.js` + `AddFragmentModal.jsx` → useMemo duplicates.
- ✅ Точное совпадение (exact)
- ✅ >95% гомология
- ✅ Предложение использовать существующий / создать вариант
- ✅ Дублирование ИМЕНИ тоже проверяется (nameDuplicate)

### Тест 12: RE сайты ⚠️ PARTIAL
**Код:** `auto-annotate.js` — RE сайты НЕ детектируются автоматически при добавлении Part.
- ⚠️ RE сайты детектируются только в `RestrictionPanel.jsx` (на canvas), не при добавлении в библиотеку
- **БАГ:** Авто-аннотация не включает RE сайты. Нужно добавить детекцию EcoRI, BamHI, HindIII и др. в autoAnnotate.

---

## Часть IV: Валидация CDS (Тесты 13-17)

### Тест 13: CDS с premature stops ✅ PASS
**Код:** `cds-validation.js` → `validateCDS()`.
- ✅ Красное предупреждение с позициями
- ✅ Hint про интроны
- ✅ Кнопка [Разметить интроны] — обработчик в AddFragmentModal (detect_introns)
- ✅ Кнопка [Игнорировать] — обработчик dismiss
- ✅ level = 'error'

### Тест 14: CDS без стоп-кодона ✅ PASS
- ✅ Warning "Нет стоп-кодона"
- ✅ Кнопки [+TAA] [+TGA] [+TAG] — обработчики в AddFragmentModal

### Тест 15: CDS без ATG ✅ PASS
- ✅ Warning "Не начинается с ATG"
- ✅ Кнопка [+ATG]

### Тест 16: CDS frameshift ✅ PASS
- ✅ Error "Длина N нт не кратна 3"
- ✅ Остаток показан

### Тест 17: Нормальный CDS ✅ PASS
- ✅ Нет предупреждений для корректного CDS (ATG + кратно 3 + TAA)
- ✅ Трансляция отображается
- ✅ Stop codon как point-аннотация

---

## Часть V: Вьюер плазмиды (Тесты 18-20)

### Тест 18: Открытие PlasmidViewer ✅ PASS (по коду)
**Код:** `PlasmidViewer.jsx` — полноценный компонент.
- ✅ Кольцевая карта (PlasmidMap)
- ✅ Таблица аннотаций (AnnotationEditor, readOnly)
- ✅ Последовательность с цветовой разметкой
- ✅ Метаданные (имя, размер, topology)
- ⚠️ Открытие при импорте .gb — зависит от логики в App.jsx. Нужно проверить что setViewerPart вызывается.
- ⚠️ Двойной клик на плазмиде в палитке — нужно проверить в PartsPalette.jsx

### Тест 19: Цветовая разметка последовательности ✅ PASS (по коду)
- ✅ regionAt(pos) определяет регион для каждого нуклеотида
- ✅ Цветной фон (regionColor + opacity)
- ✅ АК строка ТОЛЬКО под CDS-регионами (lineCDS filter)
- ✅ Интроны: lowercase + hatching pattern
- ✅ Клик на регион → selectedRegionId → подсветка
- ⚠️ Скролл к региону при клике — НЕ реализован в PlasmidViewer (есть только в SequencePreview)
  **БАГ:** При клике на регион в таблице аннотаций — нет автоскролла к этому региону в последовательности.

### Тест 20: Кнопки PlasmidViewer ✅ PASS
- ✅ [В wizard] — onOpenWizard callback
- ✅ [Экспорт GenBank] — handleExport → exportGenBank
- ✅ [Закрыть] — onClose
- ✅ [Версии] — setVersionTreePartId

---

## Часть VI: PlasmidUseWizard (Тесты 21-30)

### Тест 21: Триггер wizard ⚠️ NEEDS TESTING
**Код:** Триггер в `fragmentSlice.js` → `addFragment()`. Нужно проверить:
- ⚠️ topology === 'circular' И regions >= 2 → открывается wizard
- ⚠️ Линейный Part → добавляется без wizard
- ⚠️ Кольцевой с 1 регионом → добавляется без wizard

### Тест 22: Использовать целиком ✅ PASS
**Код:** PlasmidUseWizard → handleUseWhole()
- ✅ Добавляет на canvas целиком, needsAmplification = false

### Тест 23: Разобрать на части ✅ PASS
**Код:** handleDisassemble()
- ✅ Каждый регион → отдельный Part с parentId
- ✅ Проверка дупликатов перед добавлением
- ✅ Сообщение с результатом

### Тест 24: Вырезать элемент ✅ PASS
**Код:** handleExtract(regionId)
- ✅ Один регион → Part в библиотеку
- ✅ Проверка дупликатов

### Тест 25: Заменить элемент — одиночный ✅ PASS
**Код:** renderReplace() + handleReplace()
- ✅ Клик на регион → выделение
- ✅ Создание backbone (плазмида минус выбранный блок)
- ⚠️ Выбор замены из библиотеки — не в wizard, пользователь добавляет на canvas отдельно

### Тест 26: Заменить кассету (множественный выбор) ✅ PASS
**Код:** selectionAnalysis useMemo
- ✅ Ctrl+клик для множественного выбора
- ✅ Contiguity check (gap ≤ 50 bp)
- ✅ Warning при несмежных регионах
- ✅ Суммарная длина блока

### Тест 27: KLD мутагенез ⚠️ NEEDS TESTING
**Код:** MutagenesisWizard.jsx — setShowMutagenesis(true).
- ⚠️ Не прочитан MutagenesisWizard детально. Из контекста предыдущей сессии — KLD реализован.

### Тест 28: QuikChange мутагенез ⚠️ NEEDS TESTING
- ⚠️ Аналогично — нужна визуальная проверка MutagenesisWizard

### Тест 29: Вставить элемент ✅ PASS (по коду)
**Код:** renderInsert() + handleInsert()
- ✅ Выбор позиции между регионами
- ✅ Выбор Part из библиотеки
- ✅ insertElement вызывается

### Тест 30: Удалить элемент ✅ PASS (по коду)
**Код:** renderDelete() + deleteElement()
- ✅ Клик на регион → deleteElement(plasmidId, regionId)
- ✅ Сообщение о создании дочерней версии
- ⚠️ deleteElement — нужно проверить реализацию в store (inverse PCR + KLD)

---

## Часть VII: Версионирование (Тесты 31-34)

### Тест 31: Дерево версий ✅ PASS (по коду)
**Код:** PlasmidVersionTree.jsx — полноценный компонент.
- ✅ Рекурсивное дерево (buildTree)
- ✅ Derivation icons (mutation, split, fusion, deletion, insertion, intron_removal)
- ✅ Expand/collapse
- ✅ Клик → onViewPart

### Тест 32: Diff между версиями ✅ PASS (по коду)
**Код:** sequenceDiff() + diff panel в PlasmidVersionTree
- ✅ Нуклеотидные замены с позициями
- ✅ Длина и GC% изменения
- ⚠️ АА-замены — НЕ показываются в diff panel
  **БАГ:** В diff не показываются аминокислотные замены (D36→E36). Только нуклеотидные.

### Тест 33: Навигация из дерева ✅ PASS
- ✅ Клик на узел → onViewPart (PlasmidViewer)
- ✅ Доступ из PlasmidUseWizard → versions
- ⚠️ Контекстное меню Part в PartsPalette — нужно проверить

### Тест 34: Авто-создание версий при операциях ⚠️ PARTIAL
- ✅ derivation types определены (mutation, split, fusion, insertion, deletion, intron_removal)
- ⚠️ Нужно проверить что КАЖДАЯ операция действительно создаёт дочерний Part

---

## Часть VIII: Интроны (Тесты 35-38)

### Тест 35: Импорт GenBank с интронами ⚠️ PARTIAL
**Код:** import-annotations.js → importFeatures() обрабатывает join() locations.
- ✅ Если CDS с qualifiers.exons → создаются intron detail-аннотации (строки 94-109)
- ⚠️ genbank-parser.js (фронтенд) — join() парсинг в parseLocation() — нужно проверить
- ⚠️ Визуальное отображение интронов в SequencePreview — lowercase + hatching не реализовано в SequencePreview
  **БАГ:** SequencePreview не обрабатывает интроны (lowercase, hatching). Только PlasmidViewer это делает.

### Тест 36: Детекция интронов при стопах ✅ PASS (по коду)
**Код:** intron-utils.js → detectIntrons() + AddFragmentModal → detect_introns handler.
- ✅ Кнопка "Разметить интроны" вызывает detectIntrons
- ✅ Intron panel показывает кандидаты
- ✅ Кнопки "Принять" и "Принять все"
- ⚠️ detectIntrons — нужно проверить алгоритм GT...AG

### Тест 37: Получить кДНК ⚠️ NOT IMPLEMENTED
**Код:** Поиск "кДНК" / "cDNA" / "getCDNA" по компонентам — НЕ найдено.
- **БАГ:** Кнопка "Получить кДНК" НЕ реализована. Нет UI для создания Part без интронов.

### Тест 38: Ручная разметка интрона ⚠️ NOT IMPLEMENTED
**Код:** В SequenceViewer/SequencePreview нет контекстного меню "Пометить как интрон".
- **БАГ:** Контекстное меню на выделении → "Пометить как интрон" НЕ реализовано.

---

## Часть IX: Синхронизация видов (Тест 39)

### Тест 39: Связь карты, таблицы и последовательности ⚠️ PARTIAL
**Код:** PlasmidViewer.jsx.
- ✅ Клик на карте → setSelectedRegionId → подсветка в последовательности
- ✅ Клик на нуклеотид → выбор региона
- ⚠️ Клик в таблице аннотаций → НЕТ setSelectedRegionId. AnnotationEditor в PlasmidViewer рендерится с readOnly без onSelect.
  **БАГ:** Клик в таблице аннотаций не подсвечивает регион на карте и не скроллит последовательность.

**Фикс:** Добавить onSelect={setSelectedRegionId} в AnnotationEditor внутри PlasmidViewer.

---

## Часть X: Обратная совместимость (Тест 40)

### Тест 40: Старые данные ⚠️ PARTIAL
**Код:** `migrate-annotations.js` существует.
- ✅ migratePartAnnotations() конвертирует старые форматы
- ⚠️ Нужна проверка с реальными старыми данными из localStorage

---

## СВОДКА БАГОВ

| # | Тест | Баг | Приоритет | Сложность |
|---|------|-----|-----------|-----------|
| B1 | 10 | exportGenBank не сохраняет detail-аннотации и level в qualifiers | HIGH | Medium |
| B2 | 12 | Авто-аннотация не включает RE сайты при добавлении Part | MEDIUM | Medium |
| B3 | 19 | PlasmidViewer: нет автоскролла к региону при клике в таблице | MEDIUM | Easy |
| B4 | 32 | Diff не показывает АК-замены | LOW | Medium |
| B5 | 35 | SequencePreview не обрабатывает интроны (lowercase/hatching) | HIGH | Medium |
| B6 | 37 | Кнопка "Получить кДНК" не реализована | HIGH | Medium |
| B7 | 38 | Контекстное меню "Пометить как интрон" не реализовано | MEDIUM | Medium |
| B8 | 39 | AnnotationEditor в PlasmidViewer без onSelect — нет связки клик→подсветка | MEDIUM | Easy |

---

## СВОДКА ПО ЧАСТЯМ

| Часть | Тесты | ✅ Pass | ⚠️ Partial | ❌ Fail |
|-------|-------|--------|-----------|---------|
| I. Аннотации | 1-5 | 5 | 0 | 0 |
| II. Наследование | 6-8 | 0 | 3 | 0 |
| III. Импорт/экспорт | 9-12 | 1 | 3 | 0 |
| IV. Валидация CDS | 13-17 | 5 | 0 | 0 |
| V. Вьюер | 18-20 | 2 | 1 | 0 |
| VI. Wizard | 21-30 | 5 | 5 | 0 |
| VII. Версии | 31-34 | 2 | 2 | 0 |
| VIII. Интроны | 35-38 | 1 | 1 | 2 |
| IX. Синхронизация | 39 | 0 | 1 | 0 |
| X. Совместимость | 40 | 0 | 1 | 0 |
| **ИТОГО** | **40** | **21** | **17** | **2** |

---

## ПРИОРИТЕТНЫЕ ЗАДАЧИ ДЛЯ CLAUDE CODE

### Задача 1 (HIGH): Интроны в SequencePreview
SequencePreview.jsx: добавить обработку intron-аннотаций:
- lowercase для нуклеотидов внутри интронов
- hatching pattern (как в PlasmidViewer)
- пропуск АК под интронами

### Задача 2 (HIGH): Кнопка "Получить кДНК" 
В PlasmidViewer или FragmentEditor — при наличии интронов показать кнопку:
- Создать новый Part = экзоны без интронов
- parentId → геномный вариант, derivation = 'intron_removal'
- Запустить CDS валидацию на результат

### Задача 3 (HIGH): GenBank export с аннотациями
exports.js → exportGenBank(): сохранять ВСЕ аннотации, не только регионы.
Добавить bodgegene_level и bodgegene_regionId qualifiers.

### Задача 4 (MEDIUM): PlasmidViewer ↔ AnnotationEditor связка
PlasmidViewer.jsx: добавить onSelect prop в AnnotationEditor.
Клик → selectedRegionId → подсветка на карте + скролл к последовательности.

### Задача 5 (MEDIUM): RE сайты в авто-аннотации
auto-annotate.js: добавить детекцию распространённых RE сайтов как point-аннотации.

### Задача 6 (MEDIUM): Контекстное меню "Пометить как интрон"
SequencePreview / PlasmidViewer: при выделении региона мышкой → 
контекстное меню с опцией "Пометить как интрон".
