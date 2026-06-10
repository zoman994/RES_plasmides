# CODE REPORT — Cleanup + Dead-Code Audit (сессия 2026-05-28)

> **Для Chat. Транзиентный handoff Code → Chat.** Прочитай, разнеси выводы в
> канонику (PROJECT_STATE / RELEASES / BACKLOG / TECH_DEBT / COMPONENT_MAP /
> CLAUDE.md), потом **удали этот файл**. Не превращать в постоянный трекер
> (иначе это ровно тот meta-док-балласт, на который жаловались в ревью §4).
>
> **Контекст.** Ad-hoc сессия по запросу Игоря: ревью «свежим взглядом» →
> снос легаси-верстака → аудит forward-работы. Вне обычного spec-flow.
> Партиал-детекшн (v0.8.4-alpha) — отдельная задача, см. низ `CURRENT_TASK.md`,
> ждёт визуальной приёмки; **этим отчётом не закрывается**.

---

## 1. Что сделано в коде (нужна запись в канонику — это твоя работа)

### 1.1 Снесён v0.5-верстак — 44 файла, ~404 КБ

**Удалено** (5 директорий + 6 корневых файлов + 1 css):
- `components/FragmentEditor/` (10 ф), `components/ImportStartScreen/` (10 ф),
  `components/flow/` (8 ф), `components/MoleculeWorkspace/` (4 ф),
  `components/Prototype/` (5 ф + prototype-tokens.css)
- `components/{DesignCanvas, PartsPalette, PartsLibrary, PartBlock, AddFragmentModal, ModalStack}.jsx`

**Верификация (метод — для доверия):**
- Граф достижимости от `src/main.jsx` (нет path-алиасов, импорты relative) — все 44 недостижимы.
- grep по всем `__tests__` — ни один тест не импортирует кластер.
- grep всех импортёров — кластер полностью изолирован (ссылается только сам на себя).
- `npx vite build` — **clean** (914 мс): жёсткое доказательство, билд резолвит и `new Worker(new URL())` рёбра.
- Полный Vitest — **4082 pass / 0 fail** (1 фейл на первом прогоне — известный флак `primer-wizard`, не воспроизвёлся; deletion-фейл был бы детерминированным).
- Реахабилити-переучёт: reachable неизменно, DEAD 141→97, ровно −44.

**Метрики:** компоненты `.jsx` (non-test) **242 → 206**; prod-файлы **497 → 454**; bundle precache 1769.83 → 1753.81 КиБ.

**Что НЕ тронуто и почему:**
- Остальные ~630 КБ недостижимого — по прямому решению Игоря (scope = только верстак). См. §3.
- `AnnotationEditor.jsx` **не удалён**, хотя план 09.05 велел: его держит ЖИВОЙ `Library/inspector/FeatureEditorModal.jsx` через `PART_TYPE_GROUPS`. Снёс бы → сломал Library. Теперь это легаси-компонент на одном экспорте → кандидат на микро-harvest (вынести `PART_TYPE_GROUPS` в мелкий модуль, потом удалить).
- `FragmentEditor/{mutation-normalize,region-types,color-palette}.js` план метил под будущий harvest (сериализация DAG-нод) — но они были недостижимы/не используются, удалены с кластером. В git-истории если M-C.2 понадобятся.

**НЕ закоммичено.** Явного запроса не было. Дерево уже несло кучу pre-existing
uncommitted-удалений от прошлых сессий (`CHAT_PLAYBOOK_{CORE,APPENDIX}.md`,
много `docs/*.md`, `CanvasSkeleton/editor/assembly-mode/*` + их тесты) — мои 44
легли поверх. **Рекомендация:** оформить ровно эти 44 удаления отдельным
сфокусированным коммитом, не мешать с pre-existing хвостом.

### 1.2 Каноника, которую Chat должен обновить

| Док | Что |
|-----|-----|
| `PROJECT_STATE.md` | snapshot: −404 КБ kill, компоненты 206; добавить плашку «forward-работа dark» (§3 A) |
| `COMPONENT_MAP.md` | DEAD-секция: верстак снесён; обновить остаток dead по §3 |
| `CLAUDE.md` | «48 React компонентов» → **206** (стале); версионная шапка всё ещё v0.8.1 (висит с Пачки 2) |
| `RELEASES.md` | без бампа версии (cleanup) — запись в текущий блок |
| `TECH_DEBT.md` | новые: plasmid-git loss (§3 C), ~630 КБ dead-остаток, category-C kill этап |
| `BACKLOG.md` | wiring-кластер A; зарезервированные wizards B (ждут M-C.2) |

---

## 2. Аудит достижимости — метод

Граф от `src/main.jsx` + reverse-map импортёров + worker-edge
(`new URL('./x', import.meta.url)`). После сноса верстака: **97 недостижимых
prod-файлов, ~630 КБ** (>1/5 живого `src/`). Анализатор был временный, удалён;
воспроизводится одним `.mjs` за минуту (BFS по relative-импортам). Разбивка ниже.

---

## 3. Недостижимый остаток (~630 КБ / 97 ф) — что с этим делать

### A. Forward-работа: построено + тесты, НЕ примонтировано → ПОДКЛЮЧАЕМО

Это не мусор — законченные оттестированные модули в шаге от «живого».

**A1. Лабораторный журнал (markdown notebook) — спека `SPEC_BODGE_NOTEBOOK_MARKDOWN` (активная), ~57 КБ, 7-8 тестов**
- `canvas/`: `NotebookTab, NotebookList, NotebookSearch, NotebookToolbar, NotebookEntryEditor, NotebookRefPickerModal, MarkdownView`
- `lib/`: `markdown-renderer` + 3 плагина (`markdown-ref-plugin`, `markdown-dna-highlight-plugin`, `markdown-mermaid-link-plugin`), `notebook-migrations/t10-to-notebook`, `hooks/useMarkdownRefResolver`
- **Статус:** шапка `NotebookTab.jsx` дословно — *«CanvasLayoutView integration is a follow-up wiring task — mount this component there once Igor wants the tab visible»*. Ждёт mount-решения Игоря.

**A2. `.bodge` v2 — портируемый экспорт/импорт — спека `SPEC_BODGE_FORMAT_V2_CORE` (активная), ~44 КБ, 15+ тестов**
- `lib/`: `bodge-assembly-portable` (§7.2), `bodge-export-profiles` (§13), `bodge-atomic-write`, `bodge-extensions`, `bodge-recovery`, `bodge-migrations/`
- UI: `canvas/ExportProjectModal` (§13.1)
- **Статус:** движок + модалка готовы+тесты; нет живого вызова `ExportProjectModal`/`applyProfile`. Нужна точка входа «Экспорт».

**A3. Canvas-аффордансы операций (T9 + assembly-views-unification), ~88 КБ, 12 тестов**
- `CanvasSkeleton/canvas/`: `MaterializeCloneModal` (T9 K10), `OpContextMenu`, `PieceContextMenu`, `JunctionPopover`, `StitchMarkers`, `zone-lane-divider` (T4.5), `AssemblyDraftBlock`, `OpRhombusTemplatePicker`, `HoverOpIconRow`
- `CanvasSkeleton/`: `PrimerOrderPanel` (заказ олигов TSV/FASTA/Evrogen), `ProtocolPanel`, `LibraryTreeHost`, `lib/snippet-catalog`
- **Статус:** это отложенные «K13/K14 wire trigger-points» из DEC-T9-13 — логика готова, не примонтирована в `CanvasLayoutView`. **Кластер смешанный** (фича-аффордансы + немного инфры типа `useCanvasLayoutDrag`) — при спеке триажить пофайлово.

**A4. Sanger-праймеры для секвенирования (T10/R7), ~12 КБ, 2 теста**
- `lib/bio/`: `sanger-primer-design`, `strain-compatibility`
- **Статус:** готово+тесты, нет вызывающей точки.

→ **Chat:** кандидат на **wiring-спринт**. A1 и A2 = активные спеки, самые «дешёвые» к подключению. Рекомендую начать с A1 (notebook буквально ждёт mount).

### B. Зарезервированные wizards (осознанно припаркованы под Container Window M-C.2) — ~190 КБ

`PlasmidUseWizard, JunctionBlock, JunctionDNA, MutagenesisWizard, OligoManager,
PrimerPanel, PlasmidViewer, PlasmidMap, PlasmidVersionTree, PlasmidWorkspace,
ProtocolTracker`.

→ **Chat:** не трогать; зафиксировать в `BACKLOG.md`, что висят до M-C.2. Если
M-C.2 отодвинут/отменён — это решение «harvest vs kill».

### C. Позади/мусор (не forward) — кандидаты на снос или решение

- **⚠️ ПОТЕРЯ ФИЧИ — `lib/plasmid-git` + `plasmid-git-reducers` (~14 КБ).** Модель
  версионирования плазмиды (baseSnapshot + commits[] + replay). `PROJECT_STATE`
  всё ещё числит её рабочей, но она была подключена ТОЛЬКО через мёртвый
  `FragmentEditor`/mutagenesis-путь — four-tier миграция её не перенесла. **Это
  отвалившаяся фича, а не мусор.** → Chat+Игорь: возродить в four-tier-модели
  или официально похоронить. В `TECH_DEBT.md`.
- **Осиротевшие алгоритмы (~94 КБ):** `validate.js`, `mutagenesis.js`,
  `racetrack-layout`, `part-{descriptions,variants,categories}`, `parts-grouping`,
  `plasmid-sequence`, `cds-validation`, `intron-utils`, `sequence-diff`,
  `assembly-utils`, `duplicate-checker`, `primer-reuse`, `protocol-data`,
  `migrate-annotations`, `collections`, `api`, `inventory`. Часть — v0.5-хелперы;
  `validate.js`/`mutagenesis.js` — биологика, которую новый канвас может
  реализовывать иначе. → пофайлово: перепривязать или снести.
- **Устаревшие оболочки/огрызки (безопасный следующий kill-этап):**
  `AppShell/{Topbar,NavRail}` (заменены Sidebar), `QuickStart`, `ActionBar`,
  `ContextMenu`, `ConnectorDropdown`, `ReplacePicker`, `DataManager`,
  `ConcentrationInput`, `CopySeqButton`, `ThemeToggle`, `SubFragmentBar`,
  `DagPlaceholder`, `Annotator/{ResultsPane,EmptyAnnotator}`,
  `StartScreen/start-screen-data`, hooks `useFragmentHandlers`/`useAppEffects`.

---

## 4. Прочие находки из ревью (Chat-actionable, дёшево)

- **Dexie «рассинхрон» — фантом.** «браузер v50 vs код v5» в CURRENT_TASK/
  PROJECT_STATE/BUGS — это ×10-кодировка версии Dexie (IDB version = dexie×10).
  `50 = 5×10` — норма. Будь реальный downgrade — приложение не открылось бы
  (VersionError), а оно работает. **Удалить пункт из трекеров.**
- **Doc-drift:** `ANCHORS.md` описан как «маленький ~61 ⚓», по факту **194 КБ**;
  `SequenceView/index.jsx` в PROJECT_STATE «~39 КБ, близко к hard 40» — по факту
  **49.4 КБ** (дрейф +10 незамечен).
- **Инверсия процесс/продукт:** код ~17K LOC, мета-доки (ANCHORS+DECISIONS+
  RELEASES+TECH_DEBT+CHANGELOG+CHAT_PLAYBOOK) ~730 КБ. Структурный вопрос для
  отдельного разговора.

---

## 5. Решения, нужные от Chat + Игоря

1. **Wiring-спринт:** что из A подключаем первым? (рекоменд. A1 notebook → A2 export).
2. **plasmid-git:** возродить в four-tier или похоронить?
3. **Category C kill:** запускать следующий этап (огрызки + осиротевшие алгоритмы) сейчас или после wiring?
4. Коммитить ли 44 удаления верстака отдельным коммитом (рекомендую да).
