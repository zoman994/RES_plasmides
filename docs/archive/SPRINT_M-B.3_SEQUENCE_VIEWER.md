# Sprint M-B.3 — Sequence Viewer Rewrite (display-only + settings + foundation для контейнеров) v1.2

**Тип:** refactor + new architecture (rewrite SequenceMapView через SVG+HTML hybrid + унификация 5 sequence-related компонентов в один + user settings layer)
**База:** v0.7.0, ветка `feature/racetrack-canvas`, M-B FINAL HEAD + V50 parser coord fix (03.05.2026 PRE-K1)
**Bump после реализации:** v0.7.0 → v0.7.1.
**v1.2 diff vs v1.1:** добавлена PRE-K1 note про фикс V50 каскадного off-by-1 в backend parser pipeline; §5 (предположения) +1 о координатном контракте (DEC-PARSER-COORD-01 ⚓); §10 — добавлен closed item про coord verification.
**Предпосылка:** биолог на pre-acceptance review M-B.3 (02.05.2026) показал 3 фундаментальных бага текущего SequenceMapView (label дубль per line, sanitize artifact с N в начале, overlap collapse через latest-wins). Эталон — SnapGene Sequence View (скрин pNIC28 02.05.2026 в чат). 5 sequence-related файлов в `components/` (~72 KB) дублируют overlapping logic. Игорь выбрал rewrite, scope — display-only foundation для M-C Container Window read-only view + M-D edit interactions через optional callbacks. Все 4 visual aspects настраиваются пользователем через Settings popover (биолог: «лучше удалить потом то что плохо работает чем потом добавлять»).

---

## 0. Срез размеров затрагиваемых модулей

| Файл | Размер | Лимит | Статус в M-B.3 |
|------|--------|-------|----------------|
| `components/SequenceMapView.jsx` | 22.17 KB | 40 KB | **delete (K8)** |
| `components/SequencePane.jsx` | 12.81 KB | 40 KB | **delete (K8)** |
| `components/SequencePreview.jsx` | 15.04 KB | 40 KB | **delete (K8)** |
| `components/SequenceViewer.jsx` | 14.34 KB | 40 KB | **delete (K8)** |
| `components/SequenceEditor.jsx` | 8.26 KB | 40 KB | keep (modal, не viewer) |
| `components/PlasmidWorkspace.jsx` | 6.28 KB | 40 KB | **delete (K8)** |
| `components/Importer/inspector/tabs/SequenceTab.jsx` | 5.76 KB | 40 KB | rewire + ⚙ icon (K8) |
| `store/uiSlice.js` | ~10 KB | 25 KB | extend `sequenceView` slice (K7) |

Все green. Новые файлы в `components/SequenceView/` подпапке (~13 файлов / ~50 KB total). Самый большой `index.jsx` ~10 KB.

**Dead code подтверждён:** App.jsx mount'ит только StartScreen / Importer / DagPlaceholder / UnderConstruction / MultiTabBlocked / ReadOnlyForced + modals. SequenceMapView живой только через Importer SequenceTab. `components/__tests__/` не содержит тестов на 5 sequence-related файлов. Безопасно DELETE 5 файлов в K8.

---

## 0.5. Ответы Игоря (immutable)

### Direction:
- rewrite (б), не incremental.
- Эталон SnapGene Sequence View (скрин pNIC28 02.05.2026).

### PRE-K1 fix (03.05.2026 morning, immutable):
Был пойман и закрыт V50 — каскадный off-by-1 в backend parser pipeline (`snapgene_parser.py` хранил 1-based inclusive XML координаты без конверсии, `pvcs/parser.py` добавлял второй +1 на start → длины CDS не кратны 3 → reading frame ломался → AA-translation рисовалась по сдвинутым координатам, M не попадал на ATG'и). Фикс в `snapgene_parser.py` — `xml_start - 1`. **Контракт (⚓ DEC-PARSER-COORD-01):** 0-based exclusive end end-to-end. K1+ разработка пишет тесты под этот контракт. Детали — BUGS.md V50 и ANCHORS.md DEC-PARSER-COORD-01.

### Scope:
- Importer SequenceTab + foundation для **M-C Container Window** + **M-D Container Window edit** через optional callbacks.
- Display-only в M-B.3. Edit / select / hotkeys / find — отложены в M-D.
- Visual rendering primer features (если props.primers) — ОК. Без click handlers.

### User-controlled настройки (расширение 02.05.2026 PM):
Биолог: «снапген удобен и привычен а там две цепи — дадим волю пользователю», «фрэймы настраиваем», «надо оба и дать возможность настраивать», «настроить трешхолд у рамок надо», «лучше удалить потом то что плохо работает чем потом добавлять».

**5 настроек** через Settings popover в SequenceTab header (⚙ icon):

1. **Bottom strand visibility** — show / hide. Default: show.
2. **AA frames mode** — three-state: Auto / Single relevant only / All 6 frames always. Default: Auto.
3. **Auto threshold** (когда mode=Auto) — slider 50%-95%. Default: 80%. Когда detected CDS coverage > threshold → single relevant only.
4. **Primer style** — filled boxes (default) / outline-only.
5. **RE labels orientation** — vertical (default) / horizontal.

Persist в `uiSlice.sequenceView`. Применяется глобально к всем SequenceView mount'ам.

### Restriction click design:
Биолог: «решим потом когда я увижу контейнер на канвасе». **OUT of M-B.3.** RE display-only labels + cut indicator. Click — M-C Container Window kickoff.

### Контейнерная семантика:
Биолог: «помни мы работаем в контейнерах».

SequenceView в M-B.3 проектируется так, чтобы интеграция с M-C Container Window не требовала refactor. Props shape:
- parsedItem из Importer (M-B.3 use case): `{fragments, primers, annotations, circular}` — нет containerId, нет commits.
- MoleculeContainer из M-C: wrapper в Container Window resolve'ит `applied commits + baseSnapshot → fragments[]`, передаёт plain shape.

SequenceView — **дисплей-слой**, не знает про контейнеры. Wrapper делает resolve. Layer separation критично — иначе SequenceView обрастает container logic и не reusable.

---

## 1. Контекст

Текущий `SequenceMapView.jsx` (22.17 KB) v0.5 carryover (DEC-REUSE-01 ⚓). Используется через `Importer/inspector/tabs/SequenceTab.jsx`. На pre-acceptance review M-B.3 биолог обнаружил три фундаментальных бага через pmKate2-C (10.4 kb, 12 регионов) + pMFAPbeta1 (6.2 kb, 18 регионов).

**Баг 1 — annotation label дубль per line.** В `SequenceMapView` annotation bar строится отдельно на каждой `line`. Label центрируется в *spans within this line*, не в feature как целом. На 379 bp CMV enhancer'е разнесённом на 5 строк биолог видит «CMV enhancer (379)» 5 раз. Fundamental rendering issue, не one-line fix.

**Баг 2 — overlap collapse через latest-wins.** На каждой позиции `annMap[k] = f` — последнее iterated feature перезаписывает предыдущие. Если на позиции пересекаются promoter + RBS + CDS + tag — биолог видит только один. SnapGene использует multi-row tracks параллельно. Решение требует multi-row stacking algorithm.

**Баг 3 — bottom strand начинается с `N`.** Sanitize-at-entry violation на parser layer. **Не scope SQV.** TD на `file-import.js` или `snapgene_parser.py`.

**Эталон SnapGene Sequence View** (скриншот pNIC28 02.05.2026):
- Position ruler сверху с tick marks.
- Top 5'/3' + bottom 3'/5' с dotted base-pair connector.
- Multi-track annotations выше sequence (T7 promoter / lac operator / RBS / Feature 12 / rgpB параллельно).
- AA single-letter under CDS forward frame с position counter.
- AA single-letter в зелёных клетках под bottom strand — все 3 reverse frames с * stop markers.
- Restriction site labels вертикально over ruler без cut-line (XbaI / NdeI / AanI).
- Primer features как labeled boxes выше ruler с binding sequence prefix.
- Direction chevrons на feature tracks.
- Right-edge line numbers.

---

## 2. Стратегия

**Один новый `components/SequenceView/`** — папка с 13 файлами (~50 KB total). **Hybrid HTML char-grid + SVG overlay tracks** (perfect 1ch alignment + flexible track rendering).

Декомпозиция:
- `index.jsx` — orchestrator, line-wrap, container measurement, settings consumption.
- `SettingsPopover.jsx` — ⚙ icon + popover с 5 controls + threshold slider + Reset.
- `tracks/RulerTrack.jsx`, `StrandsTrack.jsx`, `AnnotationTrack.jsx`, `AATrack.jsx`, `PrimerTrack.jsx`, `RestrictionTrack.jsx`.
- `lib/grid.js`, `annotation-stacking.js`, `orf-ranges.js`, `codon-walker.js`, `frames-mode.js`, `aa-opacity.js`.

**Side-by-side rewrite** — новый компонент создаётся параллельно с SequenceMapView. K1-K7 разрабатывают изолированно. K8 переключает Importer SequenceTab + удаляет 5 dead файлов.

**Display-only scope** — никаких click-to-edit / select-to-mutate / hotkeys / find в M-B.3. Optional callback props (`onSelect`, `onAnnotationClick`, `onMutate`, `onAddPrimer`, `onRestrictionClick`) с default = `undefined` → no behaviour. M-D Container Window инжектирует через wrapped hook `useSequenceSelection()`.

**Smart 6-frame trinity** — three-state user setting:
- **Auto** (default): если detected CDS coverage > threshold (default 80%) → single forward frame под dominant CDS. Иначе hybrid с opacity 0.35 outside ORF / 1.0 inside.
- **Single relevant only**: всегда single forward frame под CDS.
- **All 6 frames always**: всегда все 6 frames с full opacity.

**User settings persist в `uiSlice.sequenceView`** через zustand persist middleware, key `bodgegene-ui-sequenceview`.

**Контейнерная foundation:** SequenceView не импортирует ничего container-specific. Wrapper в M-C resolve'ит applied commits → fragments. Layer separation сохранён.

---

## 3. Scope

### IN

**Новый компонент `components/SequenceView/`:**
- `index.jsx` (~10 KB target).
- `SettingsPopover.jsx` (~6 KB).
- `tracks/RulerTrack.jsx` (~3 KB).
- `tracks/StrandsTrack.jsx` (~4 KB).
- `tracks/AnnotationTrack.jsx` (~7 KB).
- `tracks/AATrack.jsx` (~5 KB).
- `tracks/PrimerTrack.jsx` (~3 KB).
- `tracks/RestrictionTrack.jsx` (~2 KB).
- `lib/grid.js` (~2 KB).
- `lib/annotation-stacking.js` (~3 KB).
- `lib/orf-ranges.js` (~2 KB).
- `lib/codon-walker.js` (~2 KB).
- `lib/frames-mode.js` (~2 KB).
- `lib/aa-opacity.js` (~2 KB).

**Store extension `store/uiSlice.js`:**
- Add `sequenceView` slice:
  ```
  sequenceView: {
    showBottomStrand: true,
    framesMode: 'auto',          // 'auto' | 'single' | 'all'
    autoThreshold: 0.8,          // 0.5 - 0.95
    primerStyle: 'filled',       // 'filled' | 'outline'
    reOrientation: 'vertical',   // 'vertical' | 'horizontal'
  }
  ```
- Actions: `setSequenceViewSetting(key, value)`, `resetSequenceViewSettings()`.
- Selector: `selectSequenceViewSettings(state) → state.sequenceView`.
- Persist через zustand `persist` middleware (key `bodgegene-ui-sequenceview`).

**Importer SequenceTab rewire (K8):**
- Switch import `SequenceMapView` → `SequenceView`.
- Add ⚙ Settings icon в header (правее origin-rotate UI).
- Origin-rotate UI keep (DEC-MB-02).

**DELETE в K8:**
- `components/SequenceMapView.jsx` (22.17 KB).
- `components/SequencePane.jsx` (12.81 KB).
- `components/SequencePreview.jsx` (15.04 KB).
- `components/SequenceViewer.jsx` (14.34 KB).
- `components/PlasmidWorkspace.jsx` (6.28 KB).
- Verify `components/__tests__/` — нет тестов на эти 5 файлов.
- Grep `import .* SequenceMapView|SequencePane|SequencePreview|SequenceViewer|PlasmidWorkspace` outside deleted files → 0 matches.

### OUT (явно отложено)

- **Edit interactions** — click annotation → edit, select → primer (P/R hotkeys), select → mutate, Ctrl+F find, Ctrl+G goto. M-D Container Window.
- **Restriction click design** — биолог: «решим потом когда я увижу контейнер на канвасе». M-C Container Window kickoff.
- **SequenceEditor.jsx** keep as-is (modal CDS quick-actions concept, не viewer).
- **Sanitize artifact «N в начале bottom strand»** — parser layer, **не SQV scope.** Новый TD-SANITIZE-IMPORT-FIRSTBYTE.
- **MoleculeWorkspace компонент** — keep для M-D (DEC-IMP-18 ⚓).
- **Synced cursor / scrollToPosition / scrollToRegion** — M-D через `scrollToPosition` callback.
- **CDS validation warnings** — M-D.
- **Domain rendering под protein view** — M-D.
- **`+ Скопировать ДНК` button** — M-D.
- **Container-specific UI** (commits history, applied state indicators, baseSnapshot diff) — M-C/M-D.

---

## 4. Архитектурные решения

Все sprint-level (без ⚓), кандидаты на promotion в M-D / M-E.

1. **DEC-SQV-01 — Hybrid HTML char-grid + SVG track overlay.** Strands и AA chars через HTML inline-block elements `width: 1ch`. Tracks (annotations / primers / restriction / chevrons / leader-labels) — SVG `<g>` overlay positioned by char-grid coords (`charPx` measured probe). Pure SVG отвергнут (text selection broken на Chrome/Vivaldi, AA не выровнены по 1ch). Pure HTML отвергнут (multi-row stacking + leader-labels требуют SVG flexibility).

2. **DEC-SQV-02 — Smart 6-frame trinity (Auto / Single / All) с пользовательским threshold.** Three-state setting persist в `uiSlice.sequenceView.framesMode`:
   - **Auto** (default): `detectORFRanges(seq, minAA=20)` + compute coverage = max coverage of single dominant CDS region. Если coverage > `autoThreshold` (default 0.8) → single forward frame under dominant CDS. Иначе → hybrid (single forward under CDS + все 6 frames с opacity 0.35 outside ORF / 1.0 inside).
   - **Single**: всегда single forward frame под CDS.
   - **All**: все 6 frames всегда, opacity 1.0 везде.
   - **autoThreshold slider** показывается только когда `framesMode === 'auto'`. Range 0.5 - 0.95, default 0.8.

   Detection через `lib/orf-ranges.js::detectORFRanges(seq, minAA=20)` — separate from `orf-detection.js` (auto-annotate использует minAA=100 + overlap filter; display использует minAA=20 без filter). Mode resolution в `lib/frames-mode.js::resolveFramesMode(framesMode, autoThreshold, regions, seqLen) → 'single' | 'hybrid'`. Opacity computation в `lib/aa-opacity.js::computeAAOpacity(...)`.

3. **DEC-SQV-03 — Multi-row annotation stacking (greedy-pack).** `stackAnnotations(regions, lineStart, lineEnd) → rows[][]`. Sort by start ascending. Place в lowest row index where `lastEnd[row] <= region.start`. Max `MAX_VISIBLE_ROWS = 4` visible. Overflow → leader-label «+N more» indicator amber.

4. **DEC-SQV-04 — Side-by-side rewrite, K8 last cleanup.** Новый `SequenceView/` параллельно с SequenceMapView. K1-K7 изолированы. K8 переключает Importer + удаляет 5 файлов. Visual regression в новом → K8 rollback, Importer не страдает.

5. **DEC-SQV-05 — Display-only scope, callbacks injection-ready.** В M-B.3 компонент рендерит. Никаких internal selection state / hotkey handlers / mutation API. Все edit interactions — через optional callback props в M-D: `onSelect(start, end)`, `onAnnotationClick(annotation)`, `onMutate(op)`, `onAddPrimer(primer)`, `onRestrictionClick(site)`. Default = `undefined` → no behaviour.

6. **DEC-SQV-06 — User settings persistence через `uiSlice.sequenceView` slice + zustand persist.** Settings persist в localStorage под key `bodgegene-ui-sequenceview`. Применяется глобально. **Кандидат на promotion в ⚓** если M-D Container Window повторит pattern (TabBar settings popover для Map / Sequence / Annotations tabs).

7. **DEC-SQV-07 — Layer separation: SequenceView не знает про контейнеры.** SequenceView принимает plain props (`fragments`, `primers`, `annotations`, `circular`). Container-specific логика (resolve applied commits + baseSnapshot → fragments shape, version history navigation, applied state indicators) — **wrapper level в M-C Container Window**, не в SequenceView. Reuse в Importer (no container) + M-C (container) + M-E Mix Workspace inline previews + M-D edit (через callbacks). **Foundation для контейнерной интеграции без refactor.**

---

## 5. Предположения

1. `getRegions(annotations)` deterministic id-backfill (⚓ ANCHORS).
2. `featureColorShaded(type, name)` (⚓ DEC-DS-02).
3. `CODON_TABLE` из `codons.js`.
4. `complement(nt)` / `reverseComplement(seq)` из `sequence-utils.js`.
5. ResizeObserver pattern из current SequenceMapView через `lib/grid.js::measureCharPx`.
6. `scanAllSites(seq, {circular, minSiteLen})` из `restriction-db.js`.
7. `store.showReSites` / `reFilter` / `reMinSiteLen` existing UI state.
8. Importer SequenceTab origin-rotate UI keep top of tab (DEC-MB-02). SettingsPopover ⚙ icon правее origin-rotate.
9. Zustand `persist` middleware уже используется. Reuse setup, новый persistence key.
10. `uiSlice.js` поддерживает добавление nested slice (`sequenceView` объект) без breaking changes для existing consumers (`showReSites`, `reFilter` остаются flat).

11. **Координатный контракт (⚓ DEC-PARSER-COORD-01).** Бэкенд парсер выдаёт координаты 0-based exclusive end. Для CDS region `(end - start) % 3 === 0` всегда. AA-translation forward — frame 0 от start, reverse — frame `(seqLen − end) % 3` от 3'-конца. **SequenceView не переобрабатывает координаты**, никаких +1/-1 внутри lib/* или tracks/*. Если backend вернул region с некратной 3 длиной для CDS — это backend bug, **не SQV bug**; SQV рендерит как есть (возможно без M / с ложными STOP), не пытается self-fix. Регрессия-тест в K4 (`aa-track.test.jsx::reverse-strand CDS shows M at the 3'-end`) работает исключительно благодаря V50 fix — без него тест проходил бы false-negative.

---

## 6. Задачи

K1..K8, 8 commits.

### K1 — `SequenceView/` skeleton + grid measurement + line-wrap
**Файлы (новые):** `index.jsx` (~6 KB на K1), `lib/grid.js` (~2 KB).
**Props API:**
```
SequenceView({
  fragments, circular = false, primers = [], readOnly = true,
  onSelect, onAnnotationClick, onMutate, onAddPrimer, onRestrictionClick,
}) → JSX
```
**lib/grid.js:** `measureCharPx`, `clampCharsPerLine` (snap multiples 10, clamp [30, 200]), `linesFromSeq`.
**Тесты:** +5 unit (measure / clamp snap / clamp range / lines chunk / empty).

### K2 — RulerTrack + StrandsTrack
**Файлы (новые):** `tracks/RulerTrack.jsx` (~3 KB), `tracks/StrandsTrack.jsx` (~4 KB).
**RulerTrack:** SVG `<g>` с tick lines + labels major (10 bp) + minor (5 bp) + line-end numbers.
**StrandsTrack:** top 5'/3' + bottom 3'/5' с complement, dotted base-pair connector, intron lowercase + diagonal hatching, region tint через `featureColorShaded` + alpha. **Consumes `uiSlice.sequenceView.showBottomStrand`** — если false, render только top strand.
**Тесты:** +5 integration (100 bp render / top + bottom present / region tint / intron lowercase / **bottom hidden when showBottomStrand=false**).

### K3 — AnnotationTrack + multi-row stacking
**Файлы (новые):** `tracks/AnnotationTrack.jsx` (~7 KB), `lib/annotation-stacking.js` (~3 KB).
**`stackAnnotations`:** Filter [lineStart, lineEnd). Sort by start. Greedy-pack: lowest row where `lastEnd[row] <= region.start`. Cap `MAX_VISIBLE_ROWS = 4`. Overflow flagged.
**AnnotationTrack:** SVG `<g>` per row. Rect fill `featureColorShaded` + warm-sepia stroke. Direction chevron. Label rendering: inside box если width > label-width / leader-line к external label если short / no label если width < 4 chars. **Per-line label rendering: один label per line per feature (закрывает Bug 1).** Overflow row «+N more» amber.
**Тесты:** +6 unit + 3 integration (включая **regression vs Bug 1: long feature 5 lines один label per line**).

### K4 — AATrack + frames trinity + opacity hybrid
**Файлы (новые):** `tracks/AATrack.jsx` (~5 KB), `lib/orf-ranges.js` (~2 KB), `lib/codon-walker.js` (~2 KB), `lib/frames-mode.js` (~2 KB), `lib/aa-opacity.js` (~2 KB).
**`detectORFRanges(seq, minAA=20) → [{start, end, strand, frame, aaLen}]`:** Walk codons all 6 frames. Find ATG → STOP. Push if aaLen >= minAA. Без overlap-filter.
**`walkCodons(seq, frame, strand) → [{aa, position, codon, isStart, isStop}]`:** Translate via CODON_TABLE.
**`resolveFramesMode(framesMode, autoThreshold, regions, seqLen) → 'single' | 'hybrid'`:**
- Если `framesMode === 'single'` → 'single'.
- Если `framesMode === 'all'` → 'hybrid'.
- Если `framesMode === 'auto'`: find dominant CDS, coverage = dominantCDS.length / seqLen. Если coverage > autoThreshold → 'single'. Иначе → 'hybrid'.
**`computeAAOpacity(position, frame, strand, mode, framesMode, orfRanges, dominantCDS) → number`:**
- mode='single': AA char видим только если position внутри dominant CDS forward frame.
- mode='hybrid' && framesMode='all': all 6 frames, opacity 1.0 везде.
- mode='hybrid' && framesMode='auto': all 6 frames, opacity 0.35 outside ORF range, 1.0 inside.
**AATrack:** Mode resolution через `resolveFramesMode`. Render single forward frame под CDS (всегда applicable). Render все 6 frames (если mode hybrid). Per AA char — opacity через `computeAAOpacity`. M green / * red.
**Тесты:** +6 unit + 4 integration.

### K5 — PrimerTrack + RestrictionTrack
**Файлы (новые):** `tracks/PrimerTrack.jsx` (~3 KB), `tracks/RestrictionTrack.jsx` (~2 KB).
**PrimerTrack:** Если `primers=[]` → track скрыт. Search binding в fullSeq (forward indexOf, reverse indexOf rc). Дедуп.
- **primerStyle='filled'** (default): forward blue full-opacity binding + dashed-50% tail; reverse red same.
- **primerStyle='outline'**: forward blue outline-only box, label с binding sequence text; reverse red outline-only.
- Setting через `useStore(s => s.sequenceView.primerStyle)`.
- Label выше box (8 px font): primer name + Tm. **No click handlers.**
**RestrictionTrack:** `useStore(s => s.showReSites / reFilter / reMinSiteLen / sequenceView.reOrientation)`. Если showReSites=false → пусто. `scanAllSites` + filter.
- **reOrientation='vertical'** (default): SVG `<text>` rotation 90deg.
- **reOrientation='horizontal'**: без rotation.
- Cut indicator ниже label. **No click handlers** (M-C scope).
**Тесты:** +4 integration.

### K6 — Composition в `index.jsx` + render path с settings
**Файлы:** `SequenceView/index.jsx` (final ~10 KB).
1. Container measurement через `measureCharPx` + ResizeObserver.
2. `useStore` selector на `uiSlice.sequenceView` (5 settings + threshold).
3. Resolve frames mode через `resolveFramesMode`.
4. Memoize `detectORFRanges` per fragment.
5. Compute lines via `linesFromSeq`.
6. Render layout per line top to bottom: PrimerTrack / RestrictionTrack / RulerTrack / AnnotationTrack / StrandsTrack top / AATrack forward / AATrack reverse (если hybrid) / StrandsTrack bottom (если showBottomStrand).
7. data-testid `sequence-view-root`.
**Тесты:** +3 integration (full render / framesMode='single' → no 6-frame / showBottomStrand=false → bottom absent).

### K7 — SettingsPopover + uiSlice.sequenceView slice
**Файлы (новые):** `SettingsPopover.jsx` (~6 KB).
**Файлы (extend):** `store/uiSlice.js`.
**uiSlice extension:**
```
sequenceView: {
  showBottomStrand: true,
  framesMode: 'auto',
  autoThreshold: 0.8,
  primerStyle: 'filled',
  reOrientation: 'vertical',
},
setSequenceViewSetting: (key, value) => set((s) => { s.sequenceView[key] = value; }),
resetSequenceViewSettings: () => set((s) => { s.sequenceView = {...defaults}; }),
```
Persist key `bodgegene-ui-sequenceview` через zustand persist partialize.
**SettingsPopover.jsx:** ⚙ icon trigger + popover (positioned absolute, click outside close). Controls: Bottom strand checkbox / AA frames radio Auto/Single/All / Auto threshold slider 0.5-0.95 step 0.05 (visible only when framesMode='auto') / Primer style radio Filled/Outline / RE labels radio Vertical/Horizontal. Reset button. STRINGS keys (`sequenceView` namespace).
**Тесты:** +5 unit + 3 integration.

### K8 — Importer rewire + cleanup 5 dead файлов
**Файлы:** `Importer/inspector/tabs/SequenceTab.jsx` — switch import + add ⚙ icon в header. **DELETE:** `SequenceMapView.jsx`, `SequencePane.jsx`, `SequencePreview.jsx`, `SequenceViewer.jsx`, `PlasmidWorkspace.jsx`.
1. SequenceTab.jsx import `SequenceMapView` → `SequenceView`. Same props.
2. Header: ⚙ icon trigger справа от origin-rotate UI. Click → toggle SettingsPopover mount.
3. **Manual visual check Игорем перед DELETE.**
4. После PASS — DELETE 5 файлов.
5. Grep verify 0 matches.
**Тесты:** +1 integration.

---

## 7. Порядок и оценка

K1 → K2 → K3 → K4 → K5 → K6 → K7 → K8. Между K-шагами Code НЕ останавливается.

| Сеанс | K-шаги | Оценка |
|-------|--------|--------|
| 1 | K1 + K2 | 7-8 ч |
| 2 | K3 + K4 | 8-10 ч |
| 3 | K5 + K6 | 6-7 ч |
| 4 | K7 + K8 | 5-6 ч |

Total ~26-31 ч Code, 4 сеанса. `/clear` между сеансами.

---

## 8. STOP-условие и формат отчёта

### STOP
После K8 Code останавливается. **НЕ:** обновляет PROJECT_STATE / RELEASES / DECISIONS / ANCHORS / BUGS / TECH_DEBT / ARCHITECTURE_v2; перемещает спеку в archive; начинает M-C kickoff; удаляет SequenceEditor.jsx; трогает sanitize artifact.

### Формат отчёта
Code дописывает в конец CURRENT_TASK.md блок «Отчёт Code по Sprint M-B.3 Sequence Viewer» с коммит-хешами, размерами всех новых/удалённых файлов, Vitest/pytest counts, build status, persistence verification (localStorage `bodgegene-ui-sequenceview`), grep-verification, visual acceptance status, bundle delta vs M-B FINAL baseline ~172 KB gzip.

---

## 9. Риски

1. **K7 SettingsPopover может разрастись больше 6 KB.** Mitigation: если >9 KB — split на subfolder `controls/`. Code останавливается на K7 и просит mini-spec.
2. **Multi-row annotation stacking может быть медленным на 50+ regions.** Mitigation: stacking — pure function, memoize per fragment. Optimize через windowing если >100 ms.
3. **SVG positioning через charPx ломается при font fallback.** Mitigation: явный `font-family: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace'`, force re-measure через FontFace API.
4. **Smart 6-frame opacity 0.35 на dark/light theme.** Mitigation: CSS variable `--aa-faded-opacity` per theme.
5. **K8 cleanup может сломать скрытый dynamic import.** Mitigation: K8 grep после DELETE, 0 matches required. Если что-то найдено — DO NOT delete, report.
6. **uiSlice.sequenceView extension может конфликтовать с persist middleware partialize.** Mitigation: K7 Code читает existing setup, добавляет sequenceView в partialize array. Тестирует reload.
7. **Bundle size +7-9 KB gzip.** Mitigation: build verify gzip <182 KB. Если >+10 KB — risk-bullet.
8. **Sanitize artifact (Bug 3) НЕ исчезнет после rewrite.** Mitigation: §3 OUT, новый TD-SANITIZE-IMPORT-FIRSTBYTE при финализации.
9. **Контейнерная foundation:** SequenceView не должен импортировать ничего container-specific. Mitigation: K6 Code проверяет imports — нет `containerCommits`, нет `useStore(s => s.containers)`, нет `applyCommits`. Wrapper в M-C сделает resolve.

---

## 10. Открытые вопросы

Все resolved через user settings:
- ✅ Primer style — settings option (default filled).
- ✅ Bottom strand — settings option (default show).
- ✅ Restriction labels orientation — settings option (default vertical).
- ✅ 6-frame в dominant CDS — Auto mode с user-controlled threshold (default 80%).
- ✅ Restriction click behaviour — OUT, отложено до M-C kickoff.
- ✅ **Coordinate convention** — 0-based exclusive end от backend, подтверждено PRE-K1 fix V50, закреплено ⚓ DEC-PARSER-COORD-01.

**Спека готова к Code start.**

---

_Spec v1.2 — 03.05.2026 morning. v1.2 diff vs v1.1: PRE-K1 fix V50 (каскадный off-by-1 в backend parser) зафиксирован в §0.5 как immutable PRE-K1; §5 +1 предположение про координатный контракт (⚓ DEC-PARSER-COORD-01); §10 добавлен закрытый item coord verification. Pre-implementation, ready for Code start. Источник правды — §0.5 kickoff Q&A 02.05.2026 PM (extended) + PRE-K1 fix 03.05.2026 + скриншот SnapGene Sequence View pNIC28._
