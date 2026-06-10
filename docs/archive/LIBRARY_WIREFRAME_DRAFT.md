# Library window — wireframe concept для дизайнера

> **Статус:** rev 3, 08.05.2026 (закрытие после визуальной приёмки HTML mockup'а от дизайнера + создание спеки M-X.7a). Парный документ к `LIBRARY_MODEL_DRAFT.md` (data model + 3 зоны).
>
> **Назначение.** Этот документ — rationale-record процесса согласования Library design'а с дизайнером. Источник правды по визуалу теперь `design_assets/Library.html` (HTML mockup). Этот документ объясняет **зачем** принято каждое решение и **что закрыто** на каком этапе.
>
> **Изменения rev 3 относительно rev 2:**
> - §1 — добавлен Library.html как 4-й view + визуальный источник правды.
> - §2.1 — ASCII обновлён: контекст-баннер в Inspector'е, breadcrumb, mini-lineage в строках tree.
> - §4.10 — новая секция «Дополнения от дизайнера 08.05.2026» (type-badges, cross-link на DAG-node, counter на табах).
> - §9 — закрыты Q4 / Q-T1 / Q-T2 после скрин-приёмки.
> - §11 — новая секция «Закрыто скрин-приёмкой 08.05.2026» (список finalized decisions).
> - §12 — переход к спеке M-X.7a.

---

## 1. Что нужно нарисовать

**Источник правды по визуалу:** `D:/RESplasmide/docs/design_assets/Library.html` (HTML mockup от дизайнера, 08.05.2026). Все ASCII-схемы ниже — concept rationale до того как дизайнер отрисовал; при расхождении HTML mockup побеждает.

Четыре view'а в HTML mockup'е:

| # | View | Что показывает |
|---|------|----------------|
| 1 | **Library window — основной layout** | Двупанельное окно: tree слева, Inspector справа с tab bar (Обзор / Последовательность / Аннотации 14 / История 3). Активный таб «Аннотации» развёрнут с feature-bar. |
| 2 | **Inspector в 4 контекстах** | Action-row меняется по зоне: loose / active project / read-only project / primer in lab pool. Каждый контекст — отдельная карточка с context banner + actions + семантические буллеты-правила. |
| 3 | **Tab «История»** | Список ContainerCommit'ов с type-badge taxonomy (Manual edit / Gibson assembly / Initial import) и actions (Откатить / Ветка / просмотр). |
| 4 | **`+ Add` modal** | Source picker (4 опции) + target zone. |

---

## 2. View 1 — Library window основной layout

### 2.1 ASCII-схема (rev 3)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ b. BodgeGene > Активный проект: ChitinaseExpr (●сохранён)  [Поиск ⌘K] [user] │  ← app top bar
├─────────────────────────────────┬────────────────────────────────────────────┤
│                                 │   📦 ChitinaseExpr.bodge / 📥 Контейнеры / │  ← Inspector breadcrumb
│  [+ Добавить] [↗ collapse]     │                                            │
│  [Фильтр в дереве…]             │   pET28b-Chit  ✎  v1.2  [+ Gibson product] │  ← header + flags
│                                 │   circular · 7 382 bp · ChitinaseExpr /    │
│ ▾ CHITINASEEXPR.BODGE [active] │     Контейнеры · добавлен 06.05.2026       │
│   ▾ 📥 Контейнеры          12  │                                            │
│      ⊙ pET28b                  │   ─[Обзор]─ Последовательность 7382 ─      │
│        из ⚐ / Backbones /pET28b│     [Аннотации 14] ─ История 3 ─           │  ← tab bar with counters
│      ⊙ pET28b-Chit  v1.2  [+]  │                                            │
│        7 382 bp · Gibson product│  🔒 Просмотр read-only. Edit аннотаций —  │  ← inline RO banner
│      ⊙ insert.gb                │      → Container Window                    │
│        963 bp · linear          │                                            │
│      ⊙ pUC19-borrowed  🔗      │   Linear feature view · circular 7382 bp   │
│        из QuickTest.bodge·28.04 │                            [все] CDS primer│  ← filter chips
│   ▾ 🧬 Праймеры             6   │   ┌──────────────────────────────────┐    │
│      ⊳ M13F  22 nt · Tm 54.8°  │   │ T7promoter│ Chitinase CDS │T7│KanR │    │
│        из insert.dna            │   │ T...                       6×His    │    │
│      ⊳ Q158R-fwd ✎  38 nt      │   │                                      │    │
│        Tm 64.2 · designed       │   │ 1            1845      3691    7382 │    │
│                                 │   └──────────────────────────────────┘    │
│ ▾ BORROWEDPROJECT.BODGE 🔒 ro   │                                            │
│   ⊳ DAG read-only view          │   Region list:                             │
│   ▸ 📥 Контейнеры (3)          │     ▣ T7 promoter      134-152·19 bp       │
│   ▸ 🧬 Праймеры (2)            │     ▢ T7 promoter primer  137-156·20nt     │
│                                 │     ▣ Chitinase (CDS)  213-1397·394 aa    │
│ ▾ ЛАБОРАТОРНЫЙ ПУЛ primer'ы 14 │     ▣ 6×His tag        1374-1392           │
│   ▾ ❄️ В лаборатории        9   │     ▢ T7 terminator    1471-1518           │
│      ⊳ M13F-stock 22nt          │     ▣ KanR (CDS)       5191-6003·NeoR     │
│        used in 8 проектах       │     ▣ pBR322 origin    6415-7030·ColE1    │
│      ⊳ T7-rev-stock universal   │     ▢ MCS                                  │
│        used in 12               │                                            │
│   ▸ 📚 Из чужих проектов    5   │                                            │
│                                 │                                            │
│ BodgeGene v0.8.0  142 entries   │                                            │
└─────────────────────────────────┴────────────────────────────────────────────┘
   tree panel ~280 px                  inspector pane (flex-grow)
```

Дизайнер добавил относительно concept rev 2:
- **Inspector breadcrumb** сверху панели — якорь без необходимости смотреть в дерево.
- **Counters на табах** — `Последовательность 7382` (bp), `Аннотации 14`, `История 3`. At-a-glance density.
- **Mini-lineage в каждой строке tree** — `«из ⚐ / Backbones / pET28b»`, `«из QuickTest.bodge · 28.04»`. Origin виден до клика в Inspector.
- **Filter-chips** на feature view — `[все] CDS primer`. Полезно при 14+ аннотациях.
- **App-level command palette** в search field — placeholder `Поиск ⌘K`. Хоткей.
- **DAG sub-row отсутствует у активного проекта**, но есть у read-only `.bodge` (`⊳ DAG read-only view`). Q4 закрыт в сторону «убрать в активном».
- **Project header в дереве** включает badge `[active]` либо иконку `🔒 ro` для импортированного.
- **Counter рядом с heading'ом папки/секции** (`12`, `6`, `9`, `5` etc) — биолог видит scope сразу.

### 2.2 Layout-правила

См. `Library.html` для финальных размеров. Концепт-уровень:
- Tree panel ~280 px fixed width.
- Inspector flex-grow.
- Top bar — стандартный app shell над Library, не часть Library window per se.
- Tab bar в Inspector — sticky сверху при скролле tab content.

### 2.3 Selection state

Один selected item в дереве в момент времени. Подсветка строки secondary-bg либо accent-border. Inspector справа показывает выбранный item. Multi-select OUT (M-X.10+).

### 2.4 Tab persistence при смене selection'а

При выборе **того же** item'а — последний активный tab сохраняется. При выборе **другого** item'а — сброс на `Обзор`. Default = Обзор подтверждён скрин-приёмкой (см. §11 Q-T1).

---

## 3. Tree — три зоны и их правила

Не изменилось относительно rev 2. См. §3 в исторических версиях либо `LIBRARY_MODEL_DRAFT.md` §1-4 для полного описания зон.

Краткая таблица для удобства:

| Зона | FS-семантика | Read-only? | Что внутри |
|------|--------------|------------|------------|
| `⚐ Без проекта` | full (drag/move/folders) | нет | свободные containers/papers биолога |
| `📦 ProjectName.bodge` (active) | прибитая (3 sub-row) | нет на actions, но sequence через DAG | `🔀 DAG` + `📥 Контейнеры` + `🧬 Праймеры` |
| `📦 ProjectName.bodge` (imported) | прибитая | да на всё | то же что active, но read-only |
| `🧬 Лабораторный пул` | плоский | edit только metadata | `❄️ В лаборатории` + `📚 Из чужих проектов` |

---

## 4. View 2 — Inspector с табами и lineage trail

### 4.1 Структура Inspector'а

```
┌────────────────────────────────────────────────────────┐
│  📦 ChitinaseExpr.bodge / 📥 Контейнеры /             │  ← breadcrumb (новое в rev 3)
│  pET28b-Chit  ✎  v1.2  [+ Gibson product]              │  ← header + flags
│  circular · 7382 bp · ChitinaseExpr / Контейнеры ·     │  ← meta-line
│    добавлен 06.05.2026                                 │
├────────────────────────────────────────────────────────┤
│ [Обзор] Послед-сть 7382 Аннотации 14 История 3         │  ← tab bar with counters
├────────────────────────────────────────────────────────┤
│  📦 Активный проект · изменения сохраняются в …        │  ← context banner (новое в rev 3)
├────────────────────────────────────────────────────────┤
│                                                        │
│  [active tab content]                                  │
│                                                        │
└────────────────────────────────────────────────────────┘
```

Tab bar — underline-style: активный таб подчёркнут 2 px line цвета `--color-text-info` + medium font weight. Counter рядом с label — secondary-text 11px.

Context banner — persistent (не dismissable). Tone цвет соответствует зоне: neutral (Loose) / warning (active) / danger (read-only) / info (Lab pool).

### 4.2 — 4.6 без изменений относительно rev 2

См. соответствующие секции исторических версий для полного описания каждого таба.

Кратко:
- **Обзор** — lineage trail + preview + metadata + actions. Default tab.
- **Последовательность** — SequenceMapView readOnly + inline read-only banner + filter chips + region list справа.
- **Аннотации** — AnnotationEditor readOnly + inline read-only banner + filter chips.
- **История** — список ContainerCommit'ов (см. §4.10 ниже про type-badge taxonomy от дизайнера).

### 4.7 Табы per selection type

| Selection | Обзор | Последовательность | Аннотации | История | Actions footer |
|-----------|-------|---------------------|-----------|---------|--------------------|
| Container в активном `.bodge` | ✓ | ✓ readOnly | ✓ readOnly | ✓ if commits | Container Window / Use in DAG / Extract / Save as version / Delete |
| Container в `⚐ Без проекта` | ✓ | ✓ readOnly | ✓ readOnly | ✓ if manual-edit commits | Use in active / Open / Manual-edit branch / Move / Export / Delete |
| Container в read-only `.bodge` | ✓ | ✓ readOnly | ✓ readOnly | ✓ if commits, RO | Copy to active / Copy to loose / Open as active / View |
| Primer в Lab pool | ✓ | ✓ readOnly (sequence + Tm/GC) | — | — | Use in project / Edit notes / Toggle lab stock / Delete |
| Primer в активном `.bodge` | ✓ | ✓ readOnly | — | — | Open in wizard / Promote to lab / Delete from project |
| Folder в Loose | summary only | — | — | — | Rename / Add here / Delete folder |
| Zone heading | empty state | — | — | — | — |
| DAG sub-row | не Inspector — opens DAG fullscreen | | | | |

---

### 4.10 Дополнения от дизайнера 08.05.2026 (новое в rev 3)

Дизайнер при отрисовке HTML mockup'а добавил несколько elements которые в concept rev 2 были неявными. Принимаются в спеку M-X.7a:

#### 4.10.1 Type-badge taxonomy в табе «История»

ContainerCommit type-badges с цветом по семантике:

| Type group | Color | Examples |
|------------|-------|----------|
| Manual edit family | амбер (warning) | manual_edit, replace_nt, delete_range, insert_seq |
| Biological op family | зелёный (success) | mix_gibson, mix_gg, mix_kld, mix_re, pcr_amplify, digest_split, clone |
| Origin family | нейтрально-серый | initial_import, paste, catalog, file_import |

Биолог сканирует историю взглядом по цветам, не читает каждую запись. В спеке M-X.7b (когда пишется) — taxonomy фиксируется как часть data model.

#### 4.10.2 Cross-link на DAG-node в записях коммитов

Каждая запись таба «История» для biological op shows attribution на DAG-узел:
`Gibson assembly · Igor · DAG-node #7`

Семантика: ContainerCommit'ы которые соответствуют ProjectCommit'ам в DAG проекта несут back-reference. Кликабельно — переход в DAG view с подсвеченным узлом. Закрывает разрыв между «ContainerCommit'ы (внутри контейнера) ≠ ProjectCommit'ы (в DAG проекта)» — оба связаны для biological ops.

Реализация — M-X.7b (когда модель версионирования зафиксирована). В data model: `ContainerCommit.dagNodeRef?: { projectCommitId, dagPosition }`.

#### 4.10.3 Payload summary в человеческом формате

«Заменил 3 nt в позиции 142–145 — устранён внутренний BsaI сайт» вместо raw diff.

Для manual edit — автогенерируется при создании коммита (analyze diff на known patterns: «заменил N nt в X-Y», «добавил N bp», «удалил N bp», «инвертировал X-Y»). Для biological op — message из ProjectCommit (биолог пишет при коммите Gibson). Это уточнение к `ContainerCommit.message?: string` — в M-X.7b делаем required для UI-ценности.

#### 4.10.4 Counter рядом с tab label

`Аннотации 14` / `История 3` / `Последовательность 7382`. At-a-glance что внутри. Реализация — M-X.7a.

#### 4.10.5 Mini-lineage в строках tree

`«из ⚐ / Backbones / pET28b(+)»`, `«из QuickTest.bodge · 28.04»` под именем item'а.

Биолог видит origin до клика в Inspector. Снимает один клик на типичной задаче «откуда эта плазмида у меня?». Реализация — M-X.7a (DEC-MX7A-10).

#### 4.10.6 Inline read-only banner на табах

Persistent banner сверху Sequence / Annotations: «🔒 Просмотр read-only. Edit аннотаций — в Container Window».

Proactive UX (биолог видит режим до попытки edit) vs reactive (toast при попытке). Реализация — M-X.7a (DEC-MX7A-08).

#### 4.10.7 Inspector breadcrumb

Сверху Inspector header'а: `📦 ChitinaseExpr.bodge / 📥 Контейнеры /`. Якорь без необходимости смотреть налево в дерево. Реализация — M-X.7a.

#### 4.10.8 Filter-chips на feature view (Аннотации)

`[все] CDS primer` сверху feature-bar. Полезно при 14+ аннотациях. Реализация — M-X.7a (если AnnotationEditor уже это поддерживает — reuse; если нет — TD «AnnotationEditor filter chips»).

#### 4.10.9 Двухуровневый поиск

- App-level top-right: `Поиск ⌘K · >5kb · CDS` — command palette с filters.
- Tree-level: `Фильтр в дереве…` — простой text-search.

Семантически разные операции. Реализация в M-X.7a — простой text-фильтр по name на tree level. Command palette ⌘K — отложен в M-X.7c (DEC-MX7A-11).

#### 4.10.10 Action-row hierarchy через цвет, а не порядок

Primary амбер (главное действие в контексте), secondary outline-нейтральный (часто используемые), destructive красный outline (delete-семейство). Биолог видит не список из 6 кнопок, а 1+несколько+опасные.

Реализация — M-X.7a (DEC-MX7A-06 + ActionRow component).

---

## 5. View 4 — `+ Add` modal

Не изменилось относительно rev 2. См. соответствующую секцию исторических версий.

Краткая таблица target zone defaults:

| Источник | Default target | Можно изменить? |
|----------|----------------|------------------|
| Файл `.bodge` | Library root (новая `📦` папка) | Нет |
| Файл `.gb` / `.dna` / `.fasta` | Активный проект → `📥 Контейнеры`; иначе `⚐ Без проекта` | Да |
| Paste sequence | Тот же что file | Да |
| Catalog item | `⚐ Без проекта` | Да |
| Cross-project copy | Активный проект `📥 Контейнеры` | Только если есть активный |

---

## 6. Что дизайнер решил (закрыто 08.05.2026)

После HTML mockup'а §6 (что дизайнер должен решить) из rev 2 закрыт частично или полностью:

**§6.1 Зональные visual cues — закрыто.** Дизайнер использовал комбинацию: heading-icon + uppercase project name (CHITINASEEXPR.BODGE) + status badge `[active]` либо `🔒 ro`. Subtle background tint не применялся. OK.

**§6.2 Read-only marker — закрыто.** Heading lock-icon + opacity reduction на rows (не полная, ~0.55) + badge «read-only» в heading'е. Биолог видит сразу.

**§6.3 Lineage trail visual style — закрыто.** Vertical stack с иконкой `↑` между шагами + дата + agent. Cross-project шаги выделены иконкой 🔗 в источнике. См. концепт mockup в Library.html.

**§6.4 `+ Add` modal — tile vs list — закрыто.** Tile grid (2×2). Принято.

**§6.5 Empty states — частично, требует доработки.** Дизайнер показал base layout, empty states per zone — отложены в M-X.7c полировку.

**§6.6 Tab bar visual style — закрыто.** Underline-style (border-bottom 2px), как в Importer'е v0.8.0. Counter в стиле «Аннотации 14» — secondary text 11px рядом с label.

**§6.7 Keyboard navigation — отложено.** ⌘K hotkey hint в search присутствует, но Cmd+1..4 на табы — не показано. M-X.7c полировка.

---

## 7. Ограничения, которые дизайнер не должен пробовать обходить

Не изменилось относительно rev 2. Подтверждено что дизайнер их соблюл:

1. Структура `.bodge` папки прибитая (3 sub-row) — соблюдено.
2. Single selection — соблюдено.
3. Drag-rearrange внутри `.bodge` отсутствует — соблюдено.
4. Inline edit sequence отсутствует — соблюдено (через RO banner).
5. Контекст-меню не показано в HTML mockup'е — отложено в M-X.7a реализацию.
6. Edit на табах Sequence / Annotations — readOnly через inline banner — соблюдено.

---

## 8. Источники концепта

- **`docs/LIBRARY_MODEL_DRAFT.md`** — data model и зоны полностью.
- **`docs/design_assets/Library.html`** — визуальный источник правды (HTML mockup, 08.05.2026).
- **`docs/SPRINT_M-X.7a_LIBRARY_STRUCTURE.md`** — спека реализации M-X.7a (08.05.2026).
- **`docs/ARCHITECTURE_v2.md` §2.7** — старая модель Library (заменяется LIBRARY_MODEL_DRAFT).
- **`ANCHORS.md` DEC-LIB-01..17** — фундаментальные решения (часть пересматривается, см. LIBRARY_MODEL_DRAFT §7).
- **`docs/DESIGN_SYSTEM.md`** — tokens (цвета, типографика).
- **Importer v0.8.0** — паттерн tabs (Обзор / Последовательность / Аннотации / История) переиспользуется в Library Inspector.

---

## 9. Open questions (закрытые после 08.05.2026)

См. `LIBRARY_MODEL_DRAFT.md §6` Q1..Q6. Состояние после скрин-приёмки HTML mockup'а:

- **Q1 — Mark as completed global action.** Не нужен. Закрыто.
- **Q2 — Migration heuristic.** Решено в спеке M-X.7a (DEC-MX7A-02). Закрыто.
- **Q3 — Read-only `.bodge` физическое хранение.** Полная re-import в IndexedDB (как новый projectEntity с `isReadOnly: true`). Закрыто.
- **Q4 — `🔀 DAG` sub-row для активного проекта.** Закрыто скрин-приёмкой: **убрать в активном.** В импортированном `.bodge` остаётся (нужен для read-only DAG view).
- **Q5 — PrimerUsage tree representation.** Реализация в M-X.7a K6 (PrimerUsage counter inline в meta-line). Закрыто.
- **Q6 — Rename импортированной `.bodge` папки.** Не приоритет M-X.7a. Откладывается, скорее всего OUT для v1.0.

Tab questions:

- **Q-T1 — Default tab при смене selection'а.** **Закрыто скрин-приёмкой: Обзор default.** На скрине дизайнера 2 (История активна) — это была демонстрация контента таба, не default-state.
- **Q-T2 — Tab «История» при `commits.length === 0`.** **Закрыто: скрыть.** Counter (число рядом с label) корректно отражает что есть в data model. После M-X.7b placeholder заменится реальным списком, counter останется.

Новые questions из дизайнерских решений (отложены):

- **Q-D1 — Action `Использовать в DAG` semantics в активном проекте.** Дизайнер использовал ✎ иконку, но это не редактирование. Реализация M-X.7a — Code выбирает семантически корректную иконку. Уточнение поведения — TD после implementation.
- **Q-D2 — Action `Использовать в проекте` для primer'а в Lab pool.** Open Primer Wizard pre-filled (вариант A) — реализация M-X.7a default. Если поведение не нравится биологу — TD «primer wizard integration polish».
- **Q-D3 — Action `Сохранить как версию` отдельно от Container Window.** Quick-version-bump прямо из Library без full editing context. Закрыто как отдельный flow в M-X.7b (не дублирует Container Window).
- **Q-D4 — `Manual-edit ветка` label для биолога-новичка.** Альтернативы: «Создать редактируемую копию», «Разветвить для правки», «Новый вариант». Решение Code в M-X.7b (когда реализуется).
- **Q-D5 — Группировка по дате в табе История при 30+ коммитах.** Отложено в M-X.7c (когда возникнет реальная нужда).

---

## 10. Следующий шаг

Спека M-X.7a готова: `docs/SPRINT_M-X.7a_LIBRARY_STRUCTURE.md`. Реализация Code'ом по K1-K6 (см. §6 спеки).

После acceptance M-X.7a → пишется спека M-X.7b (versioning UI) когда Игорь зафиксирует модель версионирования.

Между M-X.7a и M-X.7b — биологу доступен Library workspace в полном объёме кроме version-actions (они disabled с tooltip).

---

## 11. Закрыто скрин-приёмкой 08.05.2026

Сводка финализированных decisions после визуальной приёмки HTML mockup'а от дизайнера. Эти решения **не пересматриваются в M-X.7a** — они зафиксированы как DEC-MX7A-* в спеке.

| Decision | Источник | Куда зашло |
|----------|----------|------------|
| Library = top-level workspace, не fullscreen | mockup landing | DEC-MX7A-01 |
| 3 зоны (Loose / `.bodge` / Lab pool) | LIBRARY_MODEL_DRAFT + mockup | librarySlice extension DEC-MX7A-02 |
| Tabbed Inspector по паттерну Importer'а | mockup view 1 | DEC-MX7A-04 |
| Default tab = Обзор | screenshot review | DEC-MX7A-05 + Q-T1 closed |
| Tab «История» скрывается при `commits.length === 0` | concept rev 2 + screenshot | DEC-MX7A-05 + Q-T2 closed |
| История = placeholder в M-X.7a | scope split | DEC-MX7A-05 |
| Counter на табах (Аннотации 14, История 3) | mockup view 1 | реализация в M-X.7a |
| Action-row через таблицу `{zone × kind}` | mockup view 2 | DEC-MX7A-06 |
| Context banner per zone | mockup view 2 | DEC-MX7A-07 |
| Inline read-only banner (не toast) | mockup view 1 | DEC-MX7A-08 |
| Drag-семантика per drop target | concept rev 2 + mockup view 2 буллеты | DEC-MX7A-09 |
| Mini-lineage в строках tree | mockup view 1 | DEC-MX7A-10 |
| Tile grid 2×2 для AddModal | mockup view 4 | concept |
| Underline tab style | mockup view 1 | concept |
| DAG sub-row отсутствует в активном `.bodge` | mockup view 1 | Q4 closed |
| Type-badge taxonomy (Manual / Gibson / Initial) | mockup view 3 | M-X.7b spec |
| Cross-link DAG-node в коммитах | mockup view 3 | M-X.7b spec |
| Inspector breadcrumb | mockup view 1 | реализация в M-X.7a |
| Filter chips на feature view | mockup view 1 | реализация в M-X.7a |
| App-level top-bar с command palette hint | mockup view 1 | DEC-MX7A-11 (palette = M-X.7c) |
| Sequence-match подсветка lab vs cross-project | concept | DEC-MX7A-12 |

---

## 12. Связи документов

- **Реализация в коде:** `docs/SPRINT_M-X.7a_LIBRARY_STRUCTURE.md`.
- **Версионирование (отдельная спека):** `docs/SPRINT_M-X.7b_VERSIONING.md` (будет написано после фиксации модели).
- **Data model:** `docs/LIBRARY_MODEL_DRAFT.md` (формализуется в `ARCHITECTURE_v2.md` §2.7 после acceptance M-X.7a).
- **Визуал:** `docs/design_assets/Library.html`.
- **Пользовательский гайд:** `docs/guides/USER_GUIDE_LIBRARY.md`.

---

**Дата:** 08.05.2026 rev 3 (после скрин-приёмки HTML mockup'а + создания спеки M-X.7a). Парный документ: `LIBRARY_MODEL_DRAFT.md`.
