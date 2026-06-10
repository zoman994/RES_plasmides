# UX Audit Findings — BodgeGene v0.7.0

**Дата:** 2026-05-06.
**Метод:** живой проход через Chrome MCP на `localhost:3000`, параллельный
research SnapGene/Benchling/ApE/pLannotate UI patterns (3 фоновых агента).
v0.5 surface (`ImportStartScreen/`, `flow/`, `Prototype/`) намеренно
исключена — она изолирована и поднимется позже.

Категории:
- **P0** — broken / data loss / critical frustration trap
- **P1** — visible bug или significant friction
- **P2** — improvement (cleanup / consistency)
- **P3** — polish

Ссылки на эталоны:
- SnapGene support docs (auto-detect preview, History view, top-right floating toolbar, bottom info bar, minimap, project tree)
- Benchling help center (auto-annotate flow with checklist commit, gear-icon display toggles, side-rail navigation, real-time autosave)
- ApE / pLannotate (confidence visible in primary view, transparent algorithms, peer-status enzyme/ORF menus)

---

## P0 — broken / critical frustration

### UX-001 — `Guide` ссылка ведёт в `Under construction`
**Trigger:** StartScreen header → клик на «Guide»
**Observed:** пустая страница «Guide — Under construction / Coming in M-A.1.». Никаких external ссылок, README, FAQ, docs/.
**Impact:** новичок жмёт первое что выглядит как помощь — попадает в тупик. Это CRITICAL onboarding failure: один из ~3 entry points в первые 30 секунд.
**Reference:** Benchling делегирует onboarding на Help Center (живой), ApE имеет встроенный manual в File menu, SnapGene — обширные tutorials. Все три — НЕ tombstone.
**Fix:** в M-A.1 — реальный Guide. До тех пор: либо disabled с badge «soon» (как Group projects), либо ведёт на статичный markdown-рендер `docs/USER_GUIDE_*.md` (они уже в репо).

### UX-002 — Recent project «ролотл» — мусорная запись без удаления
**Trigger:** StartScreen → Recent projects.
**Observed:** карточка с именем «ролотл» (случайные кириллические символы — явно опечатка / тестовая запись). Нет × кнопки на карточке. Удалить можно только через Export-mode toggle (multi-select → Download Selected — но это **экспорт**, не удаление).
**Impact:** засоряет UI, формирует у пользователя ощущение что app «не моё». В долгосроке Recent — главная point of return; должен быть aspirational, не landfill.
**Reference:** Benchling Projects поддерживают star + hide. SnapGene Collections — File→Remove.
**Fix:** add `× delete` per RecentCard hover (с confirm); опционально `Hide from list` чтобы сохранить в All projects но убрать из Recent.

### UX-003 — Topology toggle десинхронизирует header
**Trigger:** в Inspector → переключить TOPOLOGY radio в правой колонке (Linear ↔ Circular).
**Observed:** правая колонка обновляется мгновенно — появляется секция `ORIGIN (BP)` + `INTERGENIC REGIONS: 1-144, 517-548, 712-1338, 1998-2681` для circular. Но **Inspector header `14 758 bp · linear · 14 regions` остаётся `linear`** хотя плазмида уже circular. Также LinearFeatureBar сверху не перерисовывается в круг.
**Impact:** биолог не уверен что переключение применилось. Если он сохранит — какой topology в .bodge файле?
**Fix:** unify state — при topology change перерисовать header строку и LinearFeatureBar в одной транзакции; в идеале внутри useStore.subscribe.

### UX-004 — Topology toggle блокирует main thread 5–6 сек
**Trigger:** тот же.
**Observed:** screenshot capture не отвечает 30 секунд после клика на topology radio. Renderer frozen → ResizeObserver / SequenceView re-layout / AATrack codon walk runs on main thread.
**Impact:** на средне-плотной плазмиде (14 758 bp) каждый toggle = «приложение замёрло». На слабом ПК — ещё хуже.
**Fix:** offload predictions / large re-layouts в Web Worker. Минимум — debounce + spinner overlay на колонке. Пометить как «recompute pending…» текстом.

### UX-005 — `Run` predictors в Annotator блокирует UI 5+ сек, без spinner
**Trigger:** Annotations tab → Level 2: Predictors → Run.
**Observed:** screenshot timeout 30 сек после клика. Когда восстанавливается — список из 5 hits появляется без анимации. Никакого «Запускается…» / progress bar / cancel.
**Impact:** биолог думает «Run не сработал» и кликает повторно → запускает ещё раз пока первый ещё считает.
**Reference:** Benchling `Auto annotate` показывает spinner; pLannotate streaming progress.
**Fix:** все predictors в Web Worker (`runAnnotatorPipeline.worker.ts`); UI показывает per-plugin spinner + percent + Cancel.

### UX-006 — Settings modal содержит ТОЛЬКО Identity и Advanced
**Trigger:** Topbar → Settings (Ctrl+,).
**Observed:** 2 tabs:
- **Identity**: Name + Email + Save — описание «Identity = a label for commit attribution. Not an account.»
- **Advanced**: (не открывал, но судя по `inventory` — reset-all с двойным confirm)
Theme toggle — отдельной кнопкой в Topbar. Polymerase / primer prefix / SnapGene-каталог-toggle / sequence-wrap-width — нигде не находятся.
**Impact:** пользователь не может настроить ничего из ожидаемого: цветовую схему по типу фичи, ширину строки последовательности, поведение auto-annotate при импорте, codon table. В Settings ВООБЩЕ нет user preferences.
**Reference:** SnapGene Preferences имеет 7+ подразделов; Benchling — display features per view + global preferences.
**Fix:** добавить разделы Display / Annotation / Cloning. Theme toggle перенести из Topbar в Display preferences (или дублировать).

### UX-007 — L1 Common Features даёт `0 hits` без объяснений
**Trigger:** Annotations tab на pBI121-derivative.
**Observed:** L1: 0 hits. «No hits.» Просто пустой блок. Биолог: «как такое может быть для известной плазмиды?». Нет диагностики (база загружена? threshold mismatch? sequence length под лимитом?).
**Impact:** понижает доверие к L1 в принципе. Если 0 hits — скорее всего bug.
**Fix:** при 0 hits показать diagnostic line «Поиск завершён за 0.4с по 1042 паттернам. Совпадений ≥96% identity нет.» + ссылка «Снизить порог до 90%» прямо в empty state.

### UX-008 — 26 кнопок без `aria-label` в каталоге
**Trigger:** `read_page` Importer surface.
**Observed:** из 33 интерактивных элементов — 26 кнопок имеют пустой aria-label / просто `button`. Все они — item rows / folder-collapse / category headers в каталоге.
**Impact:** screen reader полностью бесполезен. Keyboard navigation теряет контекст.
**Reference:** Benchling — все панели с `role="tree"` + per-row aria-label с item name. SnapGene desktop — нативные controls.
**Fix:** в `CatalogColumn.jsx` добавить `aria-label={item.name}` каждому row + `aria-expanded` на collapsibles.

### UX-009 — Theme toggle и Settings — два разных места для preferences
**Trigger:** StartScreen + Topbar.
**Observed:** ☀️ icon (theme) — топбар-икона. Settings — отдельная иконка-ссылка справа от theme. В Settings нет theme. Поэтому пользователь, который ищет "куда поменять тему", может пойти в Settings — ничего там не найдёт — расстроится.
**Reference:** Benchling — preferences single-rooted; SnapGene Preferences modal.
**Fix:** объединить. Theme в Settings → Display tab. Topbar icon — одна `⚙ Settings` (без отдельной theme).

### UX-010 — `Primer pool` и `All projects` в Browse — рабочие ссылки → UnderConstruction
**Trigger:** StartScreen → Browse sidebar → клик.
**Observed:** обе ведут в Under construction (M-F и TBD). Visually выглядят как live links.
**Impact:** биолог-новичок кликает «All projects» (логичное любопытство) → попадает в `Coming in M-F.` тупик. Потом не знает как вернуться кроме `‹` стрелки.
**Reference:** Group projects же — disabled с badge `soon`. **Несогласованность**: одни «coming soon» disabled, другие — кликабельны и фрустрируют.
**Fix:** обернуть Primer pool / All projects в тот же disabled+badge pattern. Уже есть UI шаблон.

### UX-011 — `pasted` всегда default name → collision на 2-м paste
**Trigger:** PreImportModal через paste textarea.
**Observed:** default Name = `pasted`. После первого Submit — следующий paste тоже default `pasted` → collision → AutonameModal.
**Impact:** каждый второй paste требует extra dialog. Биолог: «зачем спрашивать имя если оно всегда «pasted»?»
**Reference:** SnapGene при paste без имени ставит `Sequence 1`, `Sequence 2`. ApE — `untitled`, `untitled.1`.
**Fix:** при default → автоматически `pasted (N)` где N = инкремент пока не свободно. Или вообще дефолт по timestamp/первым 8 chars sequence.

### UX-012 — `+ 332123` мусорный тэг показан как suggestion
**Trigger:** в любом TagsEditor (PreImportModal + MetaColumn) — chip suggestion.
**Observed:** в наборе предложений тэга стоит «+ 332123» — явно случайный ввод сохранился в `localStorage[pvcs-tags-history]` и показывается всем.
**Impact:** загрязнение namespace. Биологу непонятно что это.
**Fix:** при добавлении тэга validate: нечисловое начало, длина ≥2, без junk patterns. Ретроактивно — фильтр в `tags-db` reader. Кнопка очистки tag history в Settings.

---

## P1 — visible friction

### UX-013 — Inspector header arrow `‹` рядом с именем «pasted»
**Trigger:** Inspector header.
**Observed:** «pasted ‹» — знак-стрелка после имени. Без иконки pencil / underline / tooltip. Biolog: «back? edit? expand?».
**Fix:** заменить на `✏️` (edit) или click-to-rename с focus state. Если ‹ означает collapsed metadata — добавить рамку «more details ▾».

### UX-014 — TOPOLOGY radio в MetaColumn без подписей
**Trigger:** Inspector → правая колонка.
**Observed:** 2 круглых icon без текста (○ и ⊝). В PreImportModal те же радио — С подписями «Linear» / «Circular».
**Reference:** ApE — явная toggle text «Linear/Circular».
**Fix:** добавить текстовые labels к MetaColumn radio. Унифицировать с PreImportModal.

### UX-015 — Inspector tabs: 3 instead of 4 (нет History tab)
**Trigger:** Inspector — Overview / Sequence / Annotations.
**Observed:** inventory обещал 4 tabs включая «История». В живом UI только 3.
**Impact:** код есть (`HistoryTab.jsx`), но не подключён? Или скрыт by-design? Документация рассинхронизирована.
**Reference:** SnapGene имеет полноценный History view с branching graph. ApE — недо-history но логирует операции.
**Fix:** либо включить tab (К1 простейший), либо удалить упоминания из comments / inventory. Если скрыто — почему?

### UX-016 — Confidence визуализирован только числом (`91%`)
**Trigger:** Annotator → L2 Predictors → list of hits.
**Observed:** каждый hit имеет `Probable σ70 promoter | 1992..2019 | 91%`. Confidence = текст. Нет цвета / прогресс-бара / outline pattern.
**Reference:** **pLannotate** — partial vs full hits = разный outline color, score visible в map. **SnapGene** — auto-detect preview ranks с прогресс-bars.
**Fix:** добавить вертикальный bar-indicator слева от каждой строки (3 цвета: ≥90% green, 75-89% amber, <75% gray). Опционально — sortable columns.

### UX-017 — 5 σ70 promoters неотличимы по имени
**Trigger:** Annotator L2.
**Observed:** все 5 hits имеют одно name «Probable σ70 promoter». Только координаты + confidence разные. Strand (+/-) не виден.
**Reference:** ApE Feature table — sortable name + direction column.
**Fix:** в name string добавить `↑ / ↓` strand indicator + (если предиктор знает соседние CDS) — `near trfA`. Или per-row: badge `+strand` / `-strand`.

### UX-018 — Confidence threshold 75% slider без tick marks
**Trigger:** Annotator header → slider.
**Observed:** ползунок без шкалы, только 75%. Нет указателя «по умолчанию», нет «recommended range».
**Fix:** добавить tick marks 50/75/90; tooltip над handle при drag.

### UX-019 — `Show duplicates` checkbox без объяснений
**Trigger:** Annotator header.
**Observed:** просто checkbox без описания what it does.
**Fix:** tooltip «Показывать предсказанные совпадения, дублирующие confirmed аннотации» + 1 пример.

### UX-020 — `Run again` после run — а где `Run all` для всех уровней?
**Trigger:** Annotator → видны Run / Run again per-level.
**Observed:** нет общей кнопки «Run all enabled levels». Биолог запускает L1 отдельно, потом L2 отдельно.
**Reference:** Benchling Auto-annotate — single button.
**Fix:** в Annotator header добавить `▶ Run all` + опцию «only re-run L2/L3 если L1 уже свежий».

### UX-021 — `Accept all (5)` primary orange — рискованно
**Trigger:** Annotator L2.
**Observed:** primary orange Accept-all делает массовый коммит без preview.
**Reference:** Benchling — checklist (pre-checked), explicit `Add Annotations` + per-row uncheck.
**Fix:** Accept all → secondary; primary — `Review →` (открывает per-row preview).

### UX-022 — Save status в топбаре — текстом, не visible glance
**Trigger:** Topbar после edits.
**Observed:** «Unsaved» / «Autosaved» / «Saved at HH:MM» — мелким серым справа от project name.
**Reference:** SnapGene — asterisk `*` около имени файла; Benchling — autosave invisible (нет dirty), version history замена.
**Fix:** dirty dot уже есть (6px amber) — расширить: при `Saved` показывать ✓ green icon на 1 сек после flush; при `Unsaved >30s` — bold amber + tooltip «Изменения не сохранены».

### UX-023 — Sequence wrap = 150 chars/line, не настраиваемо
**Trigger:** Inspector → Sequence tab.
**Observed:** строка 150 баз. Нет настройки.
**Reference:** SnapGene — 60/80/100/120 selectable; ApE — global preference.
**Fix:** SettingsPopover в Sequence tab — выбор 60/100/150/auto.

### UX-024 — `READ-ONLY` badge без объяснения
**Trigger:** Inspector header (на Sequence tab).
**Observed:** правее заголовка `READ-ONLY` orange badge. Биолог: «как сделать редактируемым?».
**Fix:** badge → button «✎ Сделать редактируемым» (или «Дублировать для редактирования»). Если read-only by-design (catalog item) — tooltip «Каталог — read-only. Кликните чтобы скопировать в Мою библиотеку».

### UX-025 — LinearFeatureBar — нет minimap для длинных плазмид
**Trigger:** Sequence tab на 14 кб плазмиде.
**Observed:** feature bar fixed width, фичи накладываются / горизонтальный scroll. Не видно общей картины.
**Reference:** SnapGene **Display a DNA Sequence Minimap** — отдельный узкий strip снизу с viewport rect.
**Fix:** добавить нижний strip-minimap «whole sequence» с rect показывающим current viewport; click-to-jump.

### UX-026 — Linear / Circular sub-tabs Annotator — Visual diff неясен
**Trigger:** Annotator → Linear / Circular sub-tabs.
**Observed:** клик на Circular — sequence view не меняется визуально (та же raster ATGC).
**Fix:** Circular sub-tab должен показывать PlasmidMap (round). Это явный mismatch с naming.

### UX-027 — Drop zone footer (~80px) всегда expanded
**Trigger:** Library / Importer surface.
**Observed:** «Drop or pick a file / .dna · .gb · .gbk · .fasta» + Paste textarea + Load button — постоянно занимают ~80px вертикали.
**Reference:** Benchling — drop is implicit anywhere in folder, no permanent zone.
**Fix:** collapse в `+` icon в нижнем углу; expanded только при hover / drag-over.

### UX-028 — Topbar `Settings` — текст-ссылка, theme — иконка
**Trigger:** топбар.
**Observed:** «Settings» текстом, ☀️ — иконкой. Несогласованно.
**Fix:** `⚙ Settings` иконка ИЛИ оба текстом.

### UX-029 — `From file 14` в INFO column — непонятная формулировка
**Trigger:** Inspector → правая колонка → INFO row.
**Observed:** «From file 14» (предположительно — «14 features came from the file»).
**Fix:** «Загружено из файла: 14 регионов».

### UX-030 — `(root)` в Folder dropdown
**Trigger:** PreImportModal → FOLDER select.
**Observed:** option = «(root)» — IT-термин.
**Fix:** «Без папки» или «↑ верхний уровень».

### UX-031 — `Next` button в PreImportModal
**Trigger:** PreImportModal → Submit.
**Observed:** primary button = «Next». Suggests «следующий шаг wizard» — но это финальный коммит.
**Fix:** «Добавить» (target=library) / «Импортировать» (target=project) — context-aware text.

### UX-032 — RecentCard «no description yet / no file location yet / no tags yet»
**Trigger:** StartScreen → Recent project с пустым проектом.
**Observed:** 3 серые строчки «no X yet». Заполняют пустоту, но визуально выглядят как 3 отсутствующих элемента — депрессивно.
**Fix:** показать только если хотя бы одна заполнена. Или централизованный «✏️ Add description / Pick location» CTA.

### UX-033 — `View all 1 projects →` — ссылка при N=1
**Trigger:** StartScreen.
**Observed:** ссылка показана даже когда projects=1. Single project карточка уже видна — нет что «view all».
**Fix:** show link только когда `projects.length > MAX_RECENT_VISIBLE` (e.g. 5).

### UX-034 — Search hint `name, description, >5kb, <2k, 2k-3k` — без примеров
**Trigger:** Catalog search.
**Observed:** placeholder намекает на синтаксис но без живого примера. Биолог: «как написать «между 5 и 10 кб»?»
**Reference:** ApE Find dialog — explicit mode picker. Benchling search — quick-filter chips.
**Fix:** под input — мелкая строка-help при focus: «Примеры: `>5kb` (длиннее 5 кб), `2k-3k` (от 2 до 3 кб), `gfp` (по имени)». Опционально — inline mode chips.

### UX-035 — INTERGENIC REGIONS координаты без действия
**Trigger:** MetaColumn → circular topology.
**Observed:** «1-144, 517-548, 712-1338, 1998-2681» — текст. Нет click-to-jump в SequenceView.
**Fix:** каждый range = clickable chip → SequenceView scrollToPosition.

### UX-036 — `ORIGIN (BP)` input + apply без объяснения
**Trigger:** MetaColumn → circular.
**Observed:** input «1» + apply button. Что меняет?
**Fix:** tooltip «Сменить координату начала кольцевой плазмиды (rotate origin)» + after-apply toast «Origin сменён на N. Все координаты регионов пересчитаны».

### UX-037 — Hotkeys нигде не отображены в UI
**Trigger:** глобально.
**Observed:** 7 зарегистрированных шорткатов (Ctrl+N/O/S/W/I/, , Esc). Только Settings tooltip показывает «⋅ Ctrl+,». Остальные не упомянуты ни в Topbar tooltip'ах, ни в menu.
**Reference:** Benchling — статья в Help; SnapGene — full menu с keystrokes; ApE — items в menus имеют shortcut text.
**Fix:** menu-style hover tooltip на каждой кнопке Topbar / sidebar / ActionsBar — `Save · Ctrl+S`. Плюс `?` overlay (HelpScreen) с full cheatsheet.

### UX-038 — Inspector «SELECTION (2)» в Overview — что это?
**Trigger:** Inspector → Overview.
**Observed:** секция «SELECTION (2): TetR, NeoR» — показана без context. «Selection» = current selection? = «маркеры»?
**Fix:** переименовать «MARKERS» если это маркер-слот, или явно «🔖 Selection markers» с иконкой.

### UX-039 — RESTRICTION SITES в Overview — как чипы, без действия
**Trigger:** Inspector Overview footer.
**Observed:** «1× ApaI 1× BamHI 1× BstEII ...» — чипы без click. Нельзя сразу перейти к месту cut.
**Reference:** ApE Enzyme Selector — клик подсвечивает.
**Fix:** chip click → SequenceView highlights all cuts of that enzyme + scrollToPosition.

### UX-040 — Annotator L2 description — техжаргон
**Trigger:** Annotator → L2 collapsed.
**Observed:** «ORF, σ70 promoter, terminator, sgRNA scaffold.»
**Fix:** двухслойно — header «Структурные предсказания» + sub-line с тех. деталями.

### UX-041 — Inspector → Sequence: AA `-2` frame без strand color
**Trigger:** Sequence tab.
**Observed:** AA подписан `-2` (число с минусом) — это reverse strand frame. Нет цветовой подсказки.
**Reference:** SnapGene — top-strand orange, bottom-strand green.
**Fix:** AA strands different colour (CSS variable; уже есть в design system).

### UX-042 — `pBI121` linear vs circular в Library list — иконка-стиль
**Trigger:** My Library list.
**Observed:** pBI121 (14 758 bp) — round icon. `pasted` (14 758 bp) — square icon (linear). Хорошо что отличаются. Но размер шрифта числа BP — серый мелкий — путается с tag count.
**Fix:** числа BP моноширинно, выровнены вправо, явно 'bp' suffix.

### UX-043 — Empty inspector hint `Pick a plasmid... 👆`
**Trigger:** Importer без selection.
**Observed:** «👆 Pick a plasmid from the catalog on the left / or drop a file into the zone below». 2 действия описаны, paste textarea не упомянут.
**Fix:** «Выберите плазмиду слева, перетащите файл в zone снизу или вставьте последовательность».

---

## P2 — improvement / consistency

### UX-044 — Identity description «commit attribution» — git-термин
**Settings → Identity:** «Identity = a label for commit attribution. Not an account.» Биолог не git developer.
**Fix:** «Имя автора правок — оно прописывается в .bodge файлах как метка авторства. Не связано с аккаунтом».

### UX-045 — `Save` в Settings без validation
**Settings.** Empty Name + Empty Email → Save (active). Что сохраняется?
**Fix:** disabled + tooltip «Заполните Name».

### UX-046 — Browse sidebar — все 3 elements с одинаковым стилем при разной судьбе
StartScreen → Library / Primer pool / All projects — выглядят одинаково, ведут в разные места (Importer / UC / UC).
**Fix:** + UX-010 — disabled на тех что UC. Бейдж `M-F →`.

### UX-047 — `Install as desktop app` всегда виден
StartScreen footer.
**Fix:** скрывать после успешной установки (PWA detection).

### UX-048 — `Export .bodge…` всегда активен
StartScreen sidebar — даже когда projects=0 в Recent. Что экспортирует?
**Fix:** disabled when no selectable projects.

### UX-049 — TOPOLOGY active radio — slim hilight
Active radio показан тонкой обводкой; non-active — серый круг. Easy miss.
**Fix:** active — заливка primary color + checkmark внутри.

### UX-050 — Catalog group counter color same as item count
«MY LIBRARY 7» (группа) и «10 444» (BP длина) одного серого. Глаз путается.
**Fix:** count группы — bold text-tertiary; bp — text-quaternary monospace right-aligned.

### UX-051 — Catalog item icons различны но нет легенды
Round vs square — circular/linear. Цвет иконки — категория. Нет hover-tooltip объясняющего.
**Fix:** на hover карточки показать tooltip «pUC19 · 2686 bp · circular · CRISPR Plasmids».

### UX-052 — SNAPGENE CATALOG категории показаны без иконок
Только текст «Basic Cloning Vectors / CRISPR Plasmids / ...».
**Reference:** SnapGene Collection Areas — у каждой свой icon.
**Fix:** category icons (можно SBOL glyph from `sbol-glyphs.jsx`).

### UX-053 — Annotator confidence threshold глобальная
75% применяется ко ВСЕМ levels. Но L1 (database lookup) и L2 (PWM scan) имеют разные шкалы — 91% PWM ≠ 91% identity.
**Fix:** per-level threshold; default presets (L1=96%, L2=70%, L3=80%).

### UX-054 — Annotator save button greyed initially without explanation
Save: greyed when 0 accepted. Нет пояснения что unlock'нет.
**Fix:** tooltip «Принимайте предсказания (Accept) — затем кнопка станет активной».

### UX-055 — Annotator footer: Accept / Reject / Edit без icons
Просто 3 текстовых button per row.
**Fix:** ✓ accept, ✕ reject, ✎ edit — для скан-readability.

### UX-056 — `Probable σ70 promoter` text wrapping
В narrow viewport row может уехать. Confidence на правом краю.
**Fix:** overflow ellipsis + full name in tooltip; confidence badge в новой строке если width < threshold.

### UX-057 — Restriction sites count в Overview lists 8 enzymes — но «Apal» (lowercase l)
«Apal» лучше «ApaI».
**Fix:** capitalisation в данных.

### UX-058 — Footer ActionsBar "..." menu без visible affordance
Inspector → bottom-right floating: «To canvas» + «...» — три точки. Что в меню?
**Fix:** hover tooltip «Доп. действия: Скачать GenBank, Удалить, Дублировать».

### UX-059 — `pasted` displayed как linear icon в Library (правильно после fix 2026-05-06)
Свежеисправленный bug — после починки `f5820a9` запись с пустым folderPath отображается. Подтверждено визуально.
**No action.** Тест-fixture.

### UX-060 — Drop or pick a file — single button
Footer кнопка `Drop or pick a file` — но это и dropzone и кнопка filepicker. Двойная функция, неоднозначно.
**Fix:** разделить: dropzone (whole footer) + кнопка `📁 выбрать файл` отдельная.

### UX-061 — LinearFeatureBar сверху + LinearFeatureBar в Annotator — два разных
Обе рисуют ту же sequence фичи. Дублирование visual real estate.
**Fix:** в Annotator показать **тот же** bar (shared component); или скрыть когда Annotator open чтобы избежать дублирования.

---

## P3 — polish

### UX-062 — `BodgeGene v0.7.0` в footer — не активный
Просто текст. Можно сделать link на release notes.

### UX-063 — Theme toggle ☀️ — нет screen reader text
A11y: только sun icon. Должно быть `aria-label="Switch to light theme"` (это уже есть в `read_page` — найдено) + при switch меняется на «moon». Хорошая практика.

### UX-064 — Tag chip `+ tag` без cursor pointer
В TagsEditor.

### UX-065 — Меню `‹ Library` в топбаре — back arrow + breadcrumb-like text
Только title + back. Нет breadcrumb «Project › Library».
**Fix:** при глубине ≥2 — breadcrumb chain.

### UX-066 — Empty Annotator state когда L1=0, L2=未run, L3=coming-soon
3 collapsed sections без headline.
**Fix:** общий empty state «Запустите анализ ▶ Run all».

### UX-067 — RecentCard hover — нет visual change
Карточка не реагирует на hover.
**Fix:** subtle bg darkening + cursor pointer.

### UX-068 — Search input placeholder text shrinks at narrow viewport
Не verified (resize_window не сработал в screenshot capture). Skip.

### UX-069 — Russian/English mixed
- StartScreen: «Recent projects» (EN) / «Library» (EN) / «Primer pool» (EN) / «New project» (EN)
- Inspector: «pasted» (EN), «Library» (EN)
- TOPOLOGY values: Linear/Circular (EN)
- BUT: `New folder name...` placeholder — EN; «Учебные» (RU); «Каталог SnapGene» (RU); «Моя библиотека» (RU).
**Reference:** CLAUDE.md упоминает Russian биолог-юзер audience.
**Fix:** определить язык приложения (ru/en) в `i18n.js` и **строго придерживаться одного**. Если ru — все strings на russian; если EN — то Library/Primer Pool/etc. Сейчас mix фрустрирует обе аудитории.

### UX-070 — Не отображается «origin» feature в LinearFeatureBar
Циркулярный плазмид имеет origin — может не отрисован отдельно.

### UX-071 — `+ tag` chip widths — variable
Visual jitter.

---

## Cross-cutting observations

### Что у BodgeGene уже хорошо

1. **3-column layout Importer** (Catalog / Inspector / Meta) — хорошая декомпозиция, лучше чем один-pane SnapGene.
2. **Inline-collapsible groups** в каталоге — без drill-down, как у Benchling tree.
3. **Auto-annotate ON-by-default** в PreImportModal — pro-active как SnapGene auto-detect.
4. **Lazy SnapGene catalog** — не блочит first paint (после precache fix).
5. **Toast queue** в bottom-left — не overlay critical content.
6. **Theme toggle live** — без reload.

### Самые большие дельты vs эталоны

1. **Нет History view** (SnapGene fundamental) — `HistoryTab.jsx` exists в коде но не подключен.
2. **Нет Restriction cloning planner** (SnapGene wizard / Benchling Assembly Wizard) — есть в `restriction-db.js` но без UI.
3. **Нет Virtual gel** (Benchling+ApE) — простая визуализация которую любят биологи.
4. **Нет split-window** (SnapGene 8.0 feature). LinearFeatureBar пробует это симулировать.
5. **Нет Find dialog** (ApE Find — 4 modes). Catalog search — не sequence search.
6. **Нет global keyboard cheatsheet** — Benchling тоже не имеет (минус), но SnapGene/ApE имеют.

### Performance UX

- **5 сек blocking** на L2 Run + topology toggle = main thread bottleneck. Web Worker offloading — top priority после browser rendering.
- **Smooth ResizeObserver** — нет visible re-flow flash. Хорошо.
- **PWA precache 833 KB** (после нашего fix) — стартует мгновенно. Хорошо.

### Accessibility (a11y)

- **26/33** interactive в каталоге без `aria-label` — P0.
- Theme toggle, Settings — labelled correctly.
- `Back` button — aria-label correct.
- **Focus ring visibility** — не verified, скорее всего есть (Tailwind defaults). Проверить tabindex на иконках без видимого фокус-кольца.
- **Color contrast** — не verified. Грубо: text-tertiary серый на серо-чёрном — пограничный.

### Internationalization

- Mix RU/EN — top fix UX-069. Решить язык, **i18n.js уже есть**, просто использовать.

---

## Топ-15 фиксов в порядке приоритета

| № | ID | P | Effort | Описание |
|---|----|---|--------|----------|
| 1 | UX-008 | P0 | M | aria-label на 26+ catalog rows |
| 2 | UX-001 | P0 | S | Guide → docs/USER_GUIDE_*.md или disabled |
| 3 | UX-010 | P0 | S | Primer pool / All projects — disabled+badge |
| 4 | UX-002 | P0 | S | × delete на RecentCard |
| 5 | UX-003 | P0 | M | Topology toggle: header в одном пакете state |
| 6 | UX-004+UX-005 | P0 | L | Web Worker для predictions + topology recompute |
| 7 | UX-007 | P0 | S | L1 0-hits diagnostic message |
| 8 | UX-006 | P0 | M | Settings — добавить Display tab (theme, wrap, polymerase) |
| 9 | UX-016 | P1 | S | Confidence visual bar |
| 10 | UX-014 | P1 | S | TOPOLOGY radio labels в MetaColumn |
| 11 | UX-011 | P1 | S | `pasted (N)` autoincrement |
| 12 | UX-012 | P1 | S | tag validate + cleanup `+ 332123` |
| 13 | UX-037 | P1 | M | Hotkey hints + cheatsheet `?` |
| 14 | UX-021 | P1 | S | Accept all → secondary button |
| 15 | UX-069 | P1 | M | Решить язык (ru/en) + полностью локализовать |

---

**Total findings: 71** (P0=12 · P1=32 · P2=18 · P3=9).
**Top recommendation:** проработать P0-блок целиком — это снимет blocking-frustration. P1 — следом по эффекту/effort соотношению.

---

# Walkthrough Overlap-PCR — UX-находки (2026-05-23)

Живой UX-прогон v0.8.3-alpha (overlap-PCR сборка двух фрагментов, Проект→импорт→канвас→редактор сборки→авто-праймеры→Realise as DAG). Полный реестр находок (баги, диагностика по коду) — `docs/WALKTHROUGH_OVERLAP_PCR_2026_05_23.md`. Баги WT-B-1..8 мигрированы в `BUGS.md` как V103–V110. Ниже — UX-находки (WT-UX) и согласованные продуктовые решения (WT-D). WT-префикс сохранён (связь с walkthrough-документом), не перенумеровывал.

## UX-находки (WT-UX)

### Онбординг / стартовый экран / импорт

- **WT-UX-1** — стартовый экран не раскрывает возможности инструмента; «Создать проект» дублирован (сайдбар + баннер); онбординг-подсказка указывает на векторы, не на пользовательские фрагменты.
- **WT-UX-2** — `ProjectInfoModal`: Save/Cancel на уже созданном проекте — неверные глаголы; форма метаданных блокирует первый контакт. Лучше: создать + сразу внутрь, переименование inline.
- **WT-UX-3** — два дерева в одном виде (проект + «свободный стол биолога»); лейбл «свободный стол» непонятен.
- **WT-UX-4** — три неразличимых «Новый проект» в радиокнопках `AddModal` (отличаются оранжевой точкой 4px).
- **WT-UX-5** — правая панель пуста после импорта; нет «показать импортированное» / подсказки «добавь первый фрагмент».
- **WT-UX-6** — textarea вводит в заблуждение: пробел после `>F` визуально выглядит как перенос строки (word-wrap). Прямой источник V103 (WT-B-1) для пользователя.
- **WT-UX-7** — `AddModal` не показывает и не даёт выбрать топологию; plain ACGT всегда → linear молча (молча неверно для сырой кольцевой). Нужен явный тумблер linear/circular.
- **WT-UX-8** — `AddModal` без поля имени для headerless-вставки → контейнер «imported».
- **WT-UX-9** — заголовок `AddModal` «+ Добавить в библиотеку» при цели по умолчанию «активный проект».

### Навигация / канвас (§17)

- **WT-UX-10** — «Открыть проект» — неочевидный primary-хук на сборочный канвас; глагол не соответствует действию. Нарушение §17. Дерево↔Канвас — явные режимы/табы.
- **WT-UX-11** — канвас V2 не гидрируется из проекта (изолированный `SkeletonProvider`); контейнеры заносятся вручную 3 раза между слоями (проект / канвас / редактор сборки). Из реестра 8 дублей.
- **WT-UX-12** — на канвасе нет пути «контейнер → PCR» (только через «+ Сборка» → редактор). Неочевидно.
- **WT-UX-13** — расхождение модели «контейнер на канвасе = сборка». **ОТЛОЖЕНО (не UX-находка).** Игорь 23.05 меняет модель (дроп контейнера → ленивая стартовая сборка-зона). Смена модели, спека после решения — см. `WALKTHROUGH_OVERLAP_PCR_2026_05_23.md` §F.

### Редактор сборки / праймеры

- **WT-UX-14** — «Tm» показывается для фрагмент-размерных выделений (≤1000+ бп); Tm осмысленна только для праймер-размера (~18–50 нт). Показывать только для праймер-размерных либо подписывать «Tm участка».
- **WT-UX-15** — лейбл «метод» в селекторе фрагмента вводит в заблуждение: «method: undefined/cursor» — это способ ВЫДЕЛЕНИЯ, читается как способ ДОБЫЧИ. Отложенность способа добычи — модель верная; проблема только в лейбле.
- **WT-UX-16** — вкладка «Границы» неинформативна — не показывает ни overlap, ни состояние стыка содержательно.
- **WT-UX-17** — overlap-Tm (отжиг ампликонов друг на друга) не считается и не показывается нигде — для overlap-PCR это самостоятельный параметр стыка.
- **WT-UX-18** — авто-праймеры не помечены как черновик; binding фикс. 20 нт (`BINDING_LEN`), длина не подгоняется под целевую Tm → AT-богатый конец даёт ~48°. Код сам помечает placeholder в докстринге, но в UX не помечено — ни флага «черновик», ни предупреждения «48° вне рабочего диапазона».

## Согласованные продуктовые решения (WT-D)

- **WT-D-1** — онбординг аннотатора пост-импортом: после импорта — ненавязчивое предложение (не блокирующая модалка) «обнаружено N features → открыть аннотатор». Один клик до аннотатора, ноль — если не надо.
- **WT-D-2** — тумблер `autoAnnotate` в `AddModal` (флаг, дефолт on) — для тех, кто хочет контроль.
- **WT-D-3** — common-features детект всегда (файл + вставка). Реализация смыкается с багом **V104** (WT-B-2) в `BUGS.md`.

_Источник: `docs/WALKTHROUGH_OVERLAP_PCR_2026_05_23.md` §B + §C. Мигрировано 23.05.2026._
