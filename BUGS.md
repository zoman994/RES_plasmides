# BUGS.md — BodgeGene

Баги → сюда. Починены → `[x]`. Claude Code читает при старте сессии.

---

## OPEN

### Критичные

- [ ] **P1 (повтор):** 1 фрагмент → 4 праймера. Корень: App.jsx auto-design useEffect не очищает stale-праймеры.
- [ ] **V1 REGION-OVERFLOW:** PlasmidMap нечитаем для плазмид с крупными region-аннотациями (repeat_region 2440 bp на 10791 bp pDHG25 → 22% внешнего кольца серого цвета). Текст меток по арке не читается, мелкие regions (on, AmpR, platformer) перекрываются большими. Детектировано визуально после Этапа 1.2 — repeat_region теперь region-тип (раньше уходил в unknown-heuristic как misc_feature, но визуально было то же). Возможные направления: (а) limit для layout — regions >N% кольца → собственный внутренний track; (б) smarter font rotation + truncation rules; (в) интерактивный hover с полным именем при усечении; (г) top-K filter по priority. 19.04.2026 (after 1.2 visual testing).

### Высокие

- [ ] **P4 (повтор):** Нет аннотаций на PartBlock после «Как backbone». migratePartAnnotations не помог.
- [ ] **V7 INSERTION-CLOCK:** При сборке insert+backbone не видно в какое место backbone идёт вставка. Решение: reusable `<InsertionClock>` компонент (циферблат), стандартная метафора plasmid editors (SnapGene, Benchling, Geneious).

  **Дизайн:**
  - **Q1 (семантика):** Clock выбирает середину insert-region, cut = центр выбранного региона (интуитивно для юзера: «solid» вместо «как разорвать»).
  - **Q2 (размещение):** inline mini-clock в PartBlock (маленькая круговая иконка с pointer + маркер insert position); клик раскрывает full-modal с draggable cursor по кольцу + sequence-view ±50 nt внизу.
  - **Q3 (default):** авто-выбор safest place — середина самого длинного межгенного gap между features. Если авто не нашло (gaps < min-size или полное покрытие features) → блокировка сборки до явного выбора юзером.

  **User stories:**
  - **US-1 Assembly:** pUC118 + AsCpf1 → PartBlock backbone показывает mini-clock с pointer на autoshot safest position (напр. midgap между lacZα и AmpR). Клик → full clock modal → драг cursor по lacZα → inline warning "вставка разорвёт lacZα". «Выбрать» → пересчёт праймеров под новую cut position.
  - **US-2 Mutagenesis:** тот же компонент в MutagenesisWizard для выбора позиции мутации. Cursor по кольцу → внизу triplet highlight «AmpR кодон 245, AA=Glu».
  - **US-3 Linear:** для линейных фрагментов Clock вырождается в горизонтальную полоску (linear timeline), та же синхронизация с sequence-view.

  **Новые файлы:** `components/InsertionClock.jsx` (reusable). **Влияет на:** PartBlock.jsx (inline mini-clock), MutagenesisWizard.jsx (US-2), DesignCanvas.jsx (wiring), fragment-slice (поле `insertionPoint` у backbone-type fragments). **Влияет на primer design:** `local-primer-design.js` пересчитывает overlap-tails от `insertionPoint` backbone'а, не от позиции 0. **Sprint 2.** Оценка: ~8-10 ч. 19.04.2026.

### Средние

- [ ] **P6:** Мутагенез: клик на 1 нуклеотид подсвечивает 2 соседних (весь кодон). При режиме "Нуклеотид → мутация ДНК" должен подсвечиваться только 1 нуклеотид, не триплет. 03.04.2026.
- [ ] **V2 DUP-REGIONS:** Дубликаты перекрывающихся regions при импорте (pDHG25: AMA1 5256 bp + AMA1 5226 bp, разница 30 bp). Gene-filter (`GENE_CHILD_TYPES` из 1.2) не срабатывает, если gene и CDS почти совпадают по координатам, но не в contained-отношении. Плюс длинные имена ("Repeat Region 1") усекаются до "platfor" на арках — UX проблема. Связано с V1. 19.04.2026.
- [ ] **V6 RE-LABELS-OVERLAP:** Метки рестриктаз в MCS пересекаются и нечитаемы (pUC118: HindIII/EcoRI/KpnI/BamHI/XbaI/SalI сгруппированы в ~50 bp → labels сливаются в одну точку). Классическая проблема плазмидной визуализации. Варианты: (а) leader lines с разной длиной (vertical stacking); (б) cluster labels ("6 sites" + hover-popup); (в) hide-on-zoom <X% с опцией показать; (г) минимум 2-пиксельный gap между labels. Файл: PlasmidMap.jsx (RE site rendering). Связано с V1/V2 — UX-sprint на circular map. 19.04.2026.
- [ ] **V8 CDS-WARNINGS-OVERFLOW:** В `PlasmidViewer` при просмотре плазмид с множественными CDS без ATG/stop (пример: `pET_lacZ(35-1025)_6HIS` даёт 28 warning'ов) — блок валидации не имеет max-height и перекрывает sequence view + annotation bar (60% видимой высоты модалки). Классическая проблема UX «слишком длинный список предупреждений». Варианты: (а) collapsible блок с "N замечаний — развернуть/свернуть" (по умолчанию свёрнут); (б) max-height + внутренний scroll; (в) фильтр «только errors (красные)» / «только warnings (жёлтые)»; (г) группировка по CDS-фиче. Файл: `PlasmidViewer.jsx` (секция рендеринга validation warnings). Низкий приоритет для чистых каталожных плазмид (0–2 warnings), критично для плазмид с partial CDS. 19.04.2026.
- [ ] **V18 FULL-VIEW-SEQ-PROTEIN-DISJOINT:** В full-view FragmentEditor (K11) DNA рендерится в sequence grid вверху, белок — в отдельной панели «Белок (обзор)» внизу. В обычном fragment-view под каждым кодоном стоит AA (single character grid); в full-view этой связи нет — биолог теряет привычную модель «AA под кодоном». Решение: либо в full-view тоже рендерить AA под каждым кодоном как read-only char grid (убрав или сократив панель «Белок (обзор)»), либо добавить synced scroll между sequence grid и protein overview. Файл: `FragmentEditor` full-view branch (K11). Приоритет: Средний. Sprint 3 UX Polish. 22.04.2026.
- [ ] **V19 CODON-EDIT-UX-REDESIGN:** Кнопка «✏️ Редакт. кодоны» под sequence grid в FragmentEditor не соответствует ожиданиям. При тестировании обнаружилось: (1) пользователь ждал функцию **bulk-удаления нуклеотидов** (выделить диапазон → удалить) — её нет; (2) при AA-замене через этот механизм неясно, на какой **codon usage table** ориентируется выбор синонимичного кодона (E. coli / yeast / human / none?) — нет явной стратегии; (3) после K10 основная редактура кодонов доступна через mode switcher Правка/Мутагенез — существующая кнопка воспринимается как дубль непонятного назначения. Решение: полный UX-редизайн — разделить на явные операции «Удалить nt-диапазон» (bulk delete по выделению) + «Оптимизировать codon usage» (с явным выбором organism table). Файл: `FragmentEditor` footer + связанный editor. Приоритет: Средний. Sprint 3 UX Polish. 22.04.2026.
- [ ] **V20 MUTAGENESIS-SPLIT-MICRO-PCR:** Split-алгоритм in-place мутагенеза создаёт избыточно мелкие PCR-фрагменты при близко расположенных мутациях. Пример HygroR (1023 bp) + 5 замен (G26A, R135A, G77C, C403G, G404C) → split на 5 фрагментов, из которых HygroR_2=31 bp (PCR 61), HygroR_3=30 bp (PCR 60) — биологически/экономически неразумно пцрить фрагмент в 60 bp. При расстоянии между мутациями <~80 bp рационально объединить в один fragment с длинным multi-site primer (70–120 nt, IDT Ultramer). Предложение: параметр `minFragmentLength` в split-стратегии, пороговое значение ~60–80 bp; при попытке создать фрагмент ниже порога — merge с соседней мутацией + многосайтовый праймер. Файл: `mutagenesis.js::makeFragmentStrategy`. Приоритет: Средний, алгоритм. Sprint 2+. 22.04.2026.
- [ ] **V21 SINGLE-CIRCULAR-ARC-INDICATOR-INVISIBLE:** При переключении topology одиночного фрагмента в circular визуальное изменение на canvas слишком неочевидно. Корректные изменения есть: PCR +30 bp (тейлы на self-closure), счётчик стыков 0→1, пунктирная скобка «⟲ замыкание» под фрагментом. Но пользователь не считывает скобку как «замкнутая молекула» — ждёт дискретного значка или изменения рамки. Предложение: усилить arc-indicator (толще линия, явный значок ⭕ над фрагментом, изменение цвета рамки при topology='circular'), tooltip на hover «самозамыкание через overhang-tails (+30 bp)». Файл: `DesignCanvas.jsx` (single-circular render branch). Приоритет: Средний, UX. Sprint 3 UX Polish. 22.04.2026.

### Низкие

- [ ] **B7 (deferred):** GG overhang palette: stale state after re-render.
- [ ] **V9 SHORT-ANNOTATION-LABELS:** В `AnnotationEditor.jsx` annotation bar — подписи аннотаций скрываются если `width <= 10%` (код: `{width > 10 ? a.name : ''}`). На плотно аннотированных плазмидах (43 аннотации на 8 КБ) среднее окошко ~2% ширины, и практически все имена скрыты — видны только штрихи. Существующее поведение, не регрессия Sprint 1, но UX-долг. Варианты: (а) tooltip при hover показывает полное имя; (б) rotated/abbreviated labels; (в) leader lines с именами наружу полосы; (г) адаптивный threshold (если много коротких — показывать с truncation). 19.04.2026.
- [ ] **V10 SBOL-GLYPH-PALENESS:** SBOL глифы в `AnnotationEditor` tree list (размер 14px) выглядят бледными: в `sbol-glyphs.jsx` все глифы с заливкой используют `fillOpacity="0.15"` и `strokeWidth={2}` на viewBox 36×36. На 14px canvas stroke даёт <1px экранной линии, 15% fill — практически невидим на белом фоне списка. Fix: поднять `fillOpacity` до 0.3–0.4 и `strokeWidth` до 2.5 (или 3.0) в базовых глифах (CDSGlyph, MarkerGlyph, SignalGlyph, промоторы). Outline-only глифы (OriginGlyph, MiscGlyph, TerminatorGlyph) не требуют изменения fill. Проверить что не перегружает визуально tree list. 19.04.2026.

---

## FEATURE REQUESTS

- [ ] **F1:** Добавить свои праймеры на последовательность в PlasmidViewer. Primer mapping + визуализация на circular map и sequence view. Запрос 03.04.2026.

---

## FIXED

### 22.04.2026 — Sprint 1.7: Unified Editor + Virtual Full Sequence + Topology (full visual acceptance)

Sprint 1.7 закрыт по всем 4 блокам после визуальной приёмки на HygroR (1023 bp): 5 substitution (G26A, R135A, G77C, C403G, G404C) + deletion regression. K9/K10/K11/K12 приняты. 700 → 738 Vitest (+38), pytest 112. 4 новых UX/алгоритмических гэпа (V18/V19/V20/V21) зафиксированы сепаратно для Sprint 2+/Sprint 3.

- [x] **K9 V15+V16 FIX (commit `1cffe1b`):** в `FragmentEditor.jsx` `isMutated` переведён на численное сравнение `codonStart`/`position` вместо substring-match по `label` (фикс V15); `computeMutationHighlights` учитывает `fragment.templateStart` и сравнивает `parent.sequence.slice(templateStart, templateStart+length)` с `fragment.sequence` (фикс V16). Приёмка: на HygroR_2/HygroR_5 (sub'ы с templateStart > 0) подсвечены только реальные позиции мутаций; AA 3/5/6 больше не подсвечиваются от substring-match с 135/403/26. Deletion тоже корректно — mapping не съезжает после indel.
- [x] **K10 UNIFIED EDITOR (commit `853535f`):** tabs «Последовательность/Белок» удалены. Layout: mode switcher (Правка/Мутагенез) → sequence primary (DNA + AA под каждым codon) → 3 collapsible panel (Annotations, Mutations, Protein). AA-клики mode-dependent: default cursor в Правке, mut menu в Мутагенезе. Sequence footer: mode-specific hint. Отклонение от спеки: баннер «Режим просмотра» удалён целиком, заменён mode-specific подсказкой в footer — функционально эквивалентно.
- [x] **K11 VIRTUAL FULL SEQUENCE (commit `b2e21ed`):** toggle «Фрагмент N bp / Полный ген M bp» в header Editor для split-group sub-фрагментов. Full-view: sequence read-only + баннер «Виртуальный вид» + highlightRegion на текущий sub (templateStart..+length) + notice в annotations «В полном обзоре аннотации недоступны». Мутации в координатах parent по всей группе. Добавлен `data-testid="fragment-editor-full-view"` для integration-тестов.
- [x] **K12 TOPOLOGY + V17 FIX (commit `2c6d735`):** `fragment.topology` как persisted поле (linear|circular). Header Editor: toggle 📏 Линейная / ⭕ Кольцевая; PartBlock context menu: «Сделать линейной/кольцевой». Single-linear больше не рендерит decorative 30-bp junction справа (фикс V17). Single-circular: self-closure через overhang-tails, +30 bp в PCR, arc-indicator «⟲ замыкание» под фрагментом. Split-группа → все sub'ы topology='linear'. `expectedJunctionCount` = 0 для single-circular (self-closure без отдельного junction-объекта отложен до v1.1).

### Новые находки Sprint 1.7 (→ OPEN/Средние):
- **V18** — full-view DNA и Protein overview разорваны, нет AA под кодоном.
- **V19** — кнопка «Редакт. кодоны»: непонятный UX, нет bulk-delete, нет явного codon-usage table.
- **V20** — split плодит микро-PCR 30–60 bp при близких мутациях.
- **V21** — single-circular arc-indicator не считывается визуально.

---

История FIXED до Sprint 1.7 (Sprint 1.6 K5–K8, Sprint 1.5, MUTWIZ-SANITIZE, Sprint 1, Этап 1.1/1.2, Блоки 4b–11b, CRIT/HIGH, BUG-01..83) → `docs/archive/BUGS_HISTORY.md`.
