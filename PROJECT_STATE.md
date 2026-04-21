# PROJECT_STATE.md — BodgeGene

> **Обновлено:** 22 апреля 2026
> **Версия:** v0.5.1-alpha (~241 коммит)
> **Тесты:** 850 (738 Vitest + 112 pytest)

---

## Что работает

### Canvas & UI
- Canvas: 4 вида (Blocks, Sequence, Map, Racetrack) + Project Flow DAG
- CSS zoom (не transform) — скролл работает корректно, auto-fit при изменении фрагментов
- Quick Start панель при пустом canvas (7 workflow actions + Каталог SnapGene)
- Smart Import modal (ImportDecisionModal) — выбор действия при file drop
- ImportPrompt — "Импортируйте вектор" при пустой библиотеке (restriction/mutagenesis)
- ActionBar: sticky панель после расчёта праймеров (протокол, заказ олигов, GenBank, завершить сборку)
- Header: polymerase/prefix в ⚙️ Настройки dropdown (position: top-full, не обрезается)
- Breadcrumb: Проект → Сборка навигация (Construct ↔ Flow)
- SnapGene Каталог (📚 Каталог в header): 2822 плазмид, 19 категорий, lazy-loaded
- Drag-and-drop фрагментов из палитры
- Click = select, двойной клик = edit, R/E/Del/Ctrl+C/Ctrl+D
- Compact header, type-dependent context menu
- Undo/Redo (50 levels)

### Assembly & Primer Design
- Авто-расчёт праймеров (клиентский, без API)
- 6 методов сборки: Overlap PCR, Gibson, Golden Gate, KLD, RE ligation, Restriction Cloning
- Merged fragments (склейка Ctrl+Click, развёртывание)
- Merge через ligation junction → заблокирован с warning
- Adaptive overlap (No-PCR сосед → full overlap)
- Tag-aware primer design (`findBindingTagAware()` — extend past low-complexity tags)
- Мутагенез + KLD primer design
- Фрагменты <18bp → warning "merge с соседним (Ctrl+Click)"

### PlasmidViewer
- Circular map: track-based arc layout (features по дорожкам, не пересекаются)
- Single-plasmid rendering (mapFragments = [{whole plasmid}], не массив регионов)
- Region selection: onSelectRegion callback → подсветка на карте + scroll к последовательности
- Sequence view: двуцепочечная + AA-трансляция + region labels + цветовой фон
- Первый нуклеотид: sanitize (strip BOM/null) — без артефакта ∅/N
- Footer action buttons: 🔪 Клонировать / ⚗️ Как backbone / 🔄 Мутагенез / 🧬 cDNA / GenBank
- presetMode instant actions: "Как backbone" → сразу на canvas (handleUseWhole), без меню
- RE sites toggle (1x / ≤2x / All)
- CDS validation warnings

### Restriction Cloning
- 3-step wizard: ферменты → insert → preview + создание на canvas
- Junction Sequence Preview на шаге 3: backbone + RE-site + insert, цветовое кодирование
- Reading frame check: "в рамке" / "не в рамке" warning
- digest() + checkDoubleDigest() + checkInsertSites() + checkReadingFrame() + generateRETail()
- RE-тейлы на праймерах (protective bases + site)
- Ligation junction display (🔪, red-400)

### SnapGene Каталог
- plasmids-index.json (~867KB): 2822 плазмид, 19 категорий, без sequences
- plasmids-data/*.json (19 файлов): lazy-loaded по категориям
- CatalogPanel: поиск по имени/feature, фильтр по категории
- Действия: В библиотеку / Просмотреть / Клонировать / Как backbone
- HTML в описаниях: stripHtml()
- Attribution: snapgene.com/resources

### Annotations
- 3-level model: region > detail > point (НЕТ отдельного domains[])
- Auto-annotate: CDS (signal peptide, tags, domains), promoter (-10/-35/TATA/CAAT), terminator (poly-A)
- RE sites: 63 фермента с IUPAC regex (restriction-db.js)
- ORF detection: ATG→stop ≥100aa, обе цепи, 3 рамки
- CRIT-1 fixed: DNA insert/delete в FragmentEditor сдвигает аннотации
- CRIT-2 fixed: autoAnnotate() перезапускается после мутаций (useEffect 500ms debounce)
- CRIT-4 fixed: flipFragment в GG → re-run autoDesignGGOverhangs() + apiWarning
- HIGH-1 fixed: flipFragment инвертирует strand аннотаций

### Import/Export
- .dna import: свой binary парсер (snapgene_parser.py) PRIMARY, BioPython FALLBACK
- .gb/.gbk import: parseGenBank (frontend) + enrichment pipeline
- .fasta import: sequence only + enrichment
- Enrichment: common-features.json (415 фичей из 2822 SnapGene плазмид) + ORF detection
- GenBank export, протокол export, clipboard

### Parts Library
- 94+ parts, draft/verified/archived lifecycle
- Duplicate detection при добавлении
- Part variants (мутагенез → новый part)
- Split/fuse/insert/delete operations
- Двойной клик "Создать фланки" — protection от дублирования

### Project Flow
- 5 node types (PlasmidNode, PCRNode, AssemblyNode, OligoNode, CheckpointNode)
- 3 edge types, dagre layout
- PCR node edit, real assemblies, MIRO+ с RE/KLD/лигирование

## Открытые баги

**BUGS.md** — 2 критичных (P1, V1), 2 высоких (P4, V7). 8 средних, 3 низких. 1 feature request (F1: custom primers).

## Что дальше

**Текущий статус:** Блоки 4b–10d завершены (03.04.2026). Визуальное тестирование проведено.

### Roadmap до публикации
1. Оставшиеся MED/LOW баги (один блок)
2. Docker Compose deployment
3. GitHub README + screenshots
4. Статья (Bioinformatics / JOSS)

---

## Журнал сессий

### Сессия 22.04.2026 — Sprint 1.7 «Unified Editor + Virtual Full Sequence + Topology» (full visual acceptance)

Визуальная приёмка 4 блоков на HygroR (1023 bp) + мутагенез (5 substitution: G26A, R135A, G77C, C403G, G404C + deletion regression). Все четыре блока Sprint 1.7 приняты.

- **Блок 1 — K10 Unified Editor (PASS).** Tabs удалены, mode switcher + sequence primary + 3 collapsible panel, AA-клики mode-dependent, mode-specific hint в footer. Отклонение Code от спеки (баннер «Режим просмотра» убран, заменён подсказкой в footer) — функционально эквивалентно.
- **Блок 2 — K9 V15/V16 (PASS).** На HygroR_2/HygroR_5 (sub'ы с templateStart > 0) подсвечены только реальные позиции мутаций (не «весь ген красный»), AA 3/5/6 больше не подсвечиваются от substring-match. **Deletion тоже корректна** — mapping не съезжает после indel (важный regression-проверка).
- **Блок 3 — K11 Virtual Full Sequence (PASS).** Toggle «Фрагмент / Полный ген», баннер «Виртуальный вид», read-only sequence, highlightRegion на sub, notice «аннотации недоступны», мутации в координатах parent по всей группе.
- **Блок 4 — K12 Topology + V17 (PASS).** `fragment.topology` персистится, toggle 📏/⭕ в header Editor и «Сделать линейной» в PartBlock context menu оба работают. Single-linear — нет decorative junction справа (V17 fix). Single-circular — self-closure (+30 bp PCR-тейлы, arc-indicator «⟲ замыкание»). Два linear рядом — 1 junction между ними. Split-группа — все sub'ы topology='linear'.

**Коммиты:** K9 `1cffe1b`, K10 `853535f`, K11 `b2e21ed`, K12 `2c6d735`, финализация спринта — предстоит. Тесты: 700 → **738 Vitest** (+38) + 112 pytest. Build clean на всех 4 коммитах.

**Новые находки в BUGS.md/OPEN по ходу приёмки:**
- **V18** — full-view DNA и Protein overview разорваны (в обычном fragment-view AA под кодоном, в full-view только отдельный блок «Белок (обзор)»). UX Sprint 3.
- **V19** — кнопка «Редакт. кодоны» непонятного назначения: нет bulk-delete по выделению, нет явного codon-usage table. Полный UX-редизайн Sprint 3.
- **V20** — split-алгоритм мутагенеза плодит микро-PCR 30–60 bp при близких мутациях; нужен `minFragmentLength` ~60–80 bp + multi-site primer. Алгоритм Sprint 2+.
- **V21** — single-circular arc-indicator не считывается как «замкнутая молекула». UX Sprint 3.

**Самое важное по ходу приёмки:** Игорь на установочном уровне попросил не упарываться по тестам (+38 Vitest на 4 коммита — избыточный темп). Фиксировано как ⚓ в DECISIONS.md: Тесты соразмерны коду — TDD для биологических алгоритмов/state management, для UX-компонентов — только happy path + 1–2 edge case. Ссылка для Code на будущие спринты.

Спека `docs/SPRINT_1_7_UNIFIED_EDITOR.md` → `docs/archive/` с пометкой ·✅ РЕАЛИЗОВАНО». CURRENT_TASK.md → заглушка. Visible успех спринта: суб-фрагменты мутагенеза теперь показывают биологически адекватную картину мутаций, есть виртуальный «полный ген» для навигации по split-группе, и каждый фрагмент имеет явную топологию linear/circular.

### Сессия 21.04.2026 — Sprint 1.6 «Мутагенез UX v2.1» (partial visual acceptance)

После технической приёмки Sprint 1.5 (663 Vitest, 4 коммита K1–K4) визуальная приёмка выявила 4 проблемы архитектурного уровня в K2 mode switcher. Sprint 1.6 закрывал их 4 коммитами:

- **K5** (`c899f6e`): белок read-only в `mode='edit'` — баннер «Режим просмотра» + кнопка «→ Мутагенез», AA-clicks no-op. Биологическое обоснование: bookkeeping белка без кодона невозможен.
- **K6** (`acbf515`): новый `lib/split-annotations.js::trimAnnotationsForSubFragment` с биологически корректными правилами (signal_peptide drop, CDS/gene rename с (5'/3' trimmed), point-like drop на границе). Заменил coordinate-only inline-логику в `handleSaveFragment`.
- **K8** (`b2ac6ec`): `computeMutationHighlights(fragment, parent)` через `sequenceDiff` → Map\<ntPos, 'silent'|'nonsilent'\>. Red/yellow подсветка в DNA и protein views. Fallback на `fragment.mutations` когда нет parent.
- **K7** (`d110272`): split-группа на canvas. `splitGroupId` + метаданные на sub-фрагментах. `DesignCanvas` оборачивает consecutive same-groupId в `.split-group-container` с 4 визуальными эффектами (пунктирная рамка, фон, badge, линия). Internal/external junction routing сохраняет цепочечную семантику.

Тесты: 663 → **700** (+37). Build clean на всех четырёх коммитах.

**Визуальная приёмка — partial acceptance.** Игорь протестировал на Gibson сборке HygroR+EGFP → обнаружил 3 критические проблемы и 1 архитектурный запрос:

- **V15** — `FragmentEditor.isMutated` использует `m.label?.includes(String(pos))` — substring match вместо числового сравнения. Для mutations с номерами `G26A, R135A, G77C, C403G, G404C` любая AA-позиция, номер которой встречается как подстрока, подсвечивается ложно. Фикс в Sprint 1.7 K10 (Unified Editor переписывает рендер).
- **V16** — `computeMutationHighlights` игнорирует `fragment.templateStart`. Для HygroR_2 (templateStart=42) diff с parent HygroR сравнивает «в лоб» → показывает всё как мутации. Фикс в Sprint 1.7 K9.
- **V17** — одиночный линейный фрагмент рендерит decorative 30-bp overlap-junction справа. Нужен явный topology toggle. Фикс в Sprint 1.7 K12.
- **Архитектурный запрос:** убрать tabs (Последовательность / Белок) из FragmentEditor. Последовательность — primary view, аннотации/белок — панель под ней. Mode (Правка/Мутагенез) остаётся как ортогональная ось. Реализация в Sprint 1.7 K10 Unified Editor.

**Решение:** Sprint 1.6 закрыт **partial** — технически реализованные фичи (K5–K8) остаются в ветке, все 700 тестов зелёные, билд чистый. Три новых бага (V15/V16/V17) + архитектурный запрос идут в Sprint 1.7. K2 mode switcher, `switchMode` helper и identity-guard в `handleSaveFragment` — база, на которую Sprint 1.7 K10 накладывает Unified Editor рефакторинг.

Спеку Sprint 1.7 пишет Claude Chat в следующей сессии.

### Сессия 21.04.2026 — Sprint 1.5 «Мутагенез v2» (formal acceptance, visual partial)

После Sprint 1 + визуальной приёмки сформирована спека `docs/SPRINT_1_5_MUTAGENESIS_V2.md` на 4 фикса мутагенеза. Реализованы в 4 коммитах:

- **K1 V14** (`f342c57`): `chooseStrategy(mutations, fragmentContext)` — KLD разрешён только при `topology==='circular' && isStandalone===true`. Linear/non-standalone → `two_fragment`/`multi_fragment` независимо от числа мутаций. Для single-mutation linear cut ставится в позиции мутации → мутация в overlap-зоне. `handleSaveFragment` + `MutagenesisWizard.compute` прокидывают context. +15 тестов.
- **K4 V11** (`67d2269`): KLD primers теперь с реальными Tm/GC через `calcTmNN` + готовую `gcPercent` из `tm-calculator.js` (DRY, не создавали новый `gcPctInt` helper из спеки CLEANUP_DEAD_CODE.md). `tmFull === tmBinding` для KLD (no tail). +2 теста.
- **K3 V13** (`e983fed`): Новое поле `uiSlice.mutagenesisInitialPlasmid` + setter. `PlasmidUseWizard` (оба пути — useEffect и menu-click при `presetMode='mutate'`) сохраняет plasmid перед закрытием. `MutagenesisWizard` принимает `initialTemplateSeq/Name/Organism/CdsStart/CdsEnd`, при наличии `initialTemplateSeq` стартует на Step 2. Initial seq санитизируется на mount. +3 теста.
- **K2 V12** (`c394c64`): Top-level mode switcher `edit | mutagenesis` в `FragmentEditor` (radio над tabs). AA-popup заблокирован в edit mode; DNA handlers не пишут в mutations в edit mode. Quick actions disabled в mutagenesis. `handleSave` разделён на `handleSaveEdit` (+editHistory writer) и `handleSaveMutagenesis`. Save button routed по mode. `switchMode` helper с confirm при накопленных mutations. +6 integration-тестов.

Тесты: 637 → **663** (+26). Build clean.

**Визуальная приёмка — partial.** K1/K3/K4 приняты. K2 технически правильный, но визуально обнаружены 4 проблемы (см. Sprint 1.6 сессия выше) → доработки в Sprint 1.6 и далее в Sprint 1.7.

### Сессия 20.04.2026 — Визуальная приёмка Sprint 1 + планирование Sprint 1.5

Игорь провёл 8-блочную визуальную приёмочную сессию Sprint 1 на живом UI (25+ скриншотов).

**Sprint 1 принят формально** — ключевые фичи работают:
- V5 контраст annotation bar — подтверждено на pUC-like плазмиде с AmpR/ori/f1_ori
- V3 junction reset в context-menu — подтверждено
- V3-bulk: bulk-переключение всей сборки на GG — подтверждено
- V4 Wizard KLD — `IS001_mut_fwd_pET-23(+)` пара корректно сгенерирована с полным protocolSteps
- V4 in-place KLD на circular standalone — Q35A на CmR: single fragment + 2 мутагенезных олига сохраняются после auto-design re-run

**Найдены 7 новых багов, вне скоупа Sprint 1:**
- V14 (CRIT, арх) — `chooseStrategy` слеп к контексту фрагмента. Линейный фрагмент в сборке получает KLD вместо two_fragment.
- V12 (HIGH) — вкладки «Редактирование» и «Мутагенез» в FragmentEditor имеют одинаковый UI но разное поведение при Save → пользователь-ловушка, мутации с «Редактирования» теряются.
- V13 (HIGH) — кнопка «Мутагенез» в footer PlasmidViewer открывает пустой Wizard без template.
- V11 (MED) — KLD-праймеры приходят с `tmBinding: 0, gcPercent: 0` вместо расчёта через `calcTmNN`.
- V8 (MED) — CDS validation warnings перекрывают sequence view в PlasmidViewer на плазмидах с partial CDS (28+ warnings).
- V9 (LOW) — подписи коротких аннотаций (<10%) скрыты в annotation bar.
- V10 (LOW) — SBOL глифы в tree list бледные (fillOpacity 0.15 на 14px).

**V11, V12, V13, V14 сгруппированы в Sprint 1.5 «Мутагенез v2»** — спека в `docs/SPRINT_1_5_MUTAGENESIS_V2.md`. Архитектурное решение: top-level mode switcher в FragmentEditor разделяет bookkeeping-правку sequence (без мутаций) от реального мутагенеза (с strategy engine). `chooseStrategy` расширяется до `chooseStrategy(mutations, fragmentContext)` с учётом topology + isStandalone.

V8, V9, V10 записаны в BUGS как UX-долг для Sprint 3.

**Решение:** Sprint 2 (V7 InsertionClock + V1/V2/V6) откладывается до завершения Sprint 1.5. Причина: V7 InsertionClock зависит от корректной работы мутагенеза, InsertionClock US-2 (cursor по кольцу для выбора позиции мутации) не имеет смысла без правильной стратегии.

### Сессия 20.04.2026 — MUTWIZ-SANITIZE quick-fix

Мелкая, но архитектурно чистая правка: `MutagenesisWizard.jsx` использовал два legacy inline-regex (`/[^ATCGatcg]/g`, `/[^ATCG]/g`) в обход `sanitizeSequence` — нарушение контракта Этапа 1.1. Биологическая цена: saturation codons (NNK/NNN/MNN) молча стирались из template/insert-вводов.

Фикс: импорт `sanitizeSequence` + 2 onChange-замены + обновлённый placeholder insert-поля (подсказка про saturation). +3 integration-теста (`mutagenesis-wizard-sanitize.test.jsx`) через `@testing-library/react` с fetch-моком.

Тесты: 634 → **637 ✅** (+3). Build: clean. `MUTWIZ-SANITIZE` перенесён из OPEN/MED в FIXED.

---

**Сессии старше MUTWIZ-SANITIZE (Sprint 1 за 19–20.04.2026; Этап 1.1 и 1.2 за 18.04.2026; 12 сессий 03.04.2026, блоки 4b–11b)** → архив `docs/archive/SESSIONS_2026_Q2.md`.

