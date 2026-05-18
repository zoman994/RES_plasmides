# ARCHITECTURE_CANVAS_MODEL.md — Canvas-модель BodgeGene v0.6+

> **Статус:** активный, фундамент v1.0. Дата — 11.05.2026 после Canvas-kickoff сессии Игорь ↔ Chat. Закрепляет DEC-CANVAS-01..08, кандидаты на ⚓ promotion после первой M-Canvas acceptance.
>
> **Что закрывает:** супрессирует `docs/ARCHITECTURE_3LEVELS.md` (DEC-NAV-3LEVEL-01 от 09.05.2026 — SUPERSEDED). Трёхуровневая навигация (макро DAG / мезо парт-канвас / микро Container Window) переписана на одно-workspace модель.
>
> **Соотношение с ARCHITECTURE_v2.md:** v2 остаётся центральным reference. §1 принципы (1.1-1.14) валидны без изменений. §2 data model — расширения здесь в §3 (semantics, не shape). §3 «Окна» v2 частично stale для M-C+ (DAG-as-primary-view → Canvas-as-primary-view), переписывается в M-Canvas v1.0.
>
> **Что не в этом документе:** UI-макеты (отдельные сессии), детальные спеки (`docs/SPRINT_M-C*.md`), регламент Chat ↔ Code (`CHAT_PLAYBOOK.md`).

---

## 0. TL;DR

**Три инструмента, три роли:**

1. **Canvas** (workspace с двумя view: Layout / Graph) — inter-container biology. Все материалы проекта + связи через operations. Layout: авторский spatial. Graph: auto-layout bipartite. Один dataset, два рендера.
2. **Контейнер-редактор** — intra-container biology. SequenceView + operation toolbar + inline popups + расширенный SelectionContextMenu. Точка входа: двойной клик на материал-блок canvas.
3. **Tree (Library-сайдбар)** — иерархия материалов по родословной (Итоги / Материалы / Праймеры). Навигация + импорт.

**Корневой инвариант:** DAG растворяется в Graph view canvas, парт-канвас исчезает как сущность, Library Inspector растворяется в Tree-сайдбар + редактор справа.

**Immutable model:** каждая операция → новый контейнер. In-place версий нет. Топология решает категорию (circular = ★ Итог, linear = Материал).

---

## 1. Контекст

**До 11.05.2026 (3LEVELS):** ARCHITECTURE_3LEVELS.md разделял UI на макро (DAG read-only) / мезо (парт-канвас fullscreen-overlay) / микро (Container Window drill-in). Три workspace'а, три state machine.

**Почему не пошло:** kickoff-сессия с reference-скриншотом (Graph view: PCR/Gibson/Cut/Library-clone-lazy рёбрами, минимап, Cmd+L / Cmd+K) обнажила — парт-канвас и DAG это один dataset с разным layout-алгоритмом (auto-layout dagre vs spatial авторский). Library Inspector в M-X.7a v2 уже работает как «Tree + drill-in» — Container Window M-C.2 тот же паттерн с другим набором tools. Три workspace'а → один с context-зависимым правым tray.

**Как пришли:** Игорь сформулировал «один workspace = canvas; DAG — это Graph view canvas, не отдельный режим». Дальше: materials всегда на canvas (не таскаются picker'ом), operations порождают новые containers (история бесплатна), Tree группирует по родословной с derived категорией. Reference-точки: Linear/Arc/Notion/Raycast ergonomics + SnapGene Map view + Benchling sequence editor.

---

## 2. Девять пунктов фундамента

Каждый пункт — кандидат на ⚓ promotion после первой M-Canvas acceptance. Полные формулировки и обоснования — в `DECISIONS.md` блок «Architecture session 11.05.2026 — Canvas-model fundament». Здесь — короткая форма.

**1. Один workspace = Canvas; DAG = Graph view, не отдельный режим. (DEC-CANVAS-01)** Три инструмента (Canvas / Контейнер-редактор / Tree). DAG как мезо/макро растворяется. Library Inspector как «отдельный workspace» тоже растворяется. **Supersedes** DEC-NAV-3LEVEL-01.

**2. Все проектные контейнеры на canvas всегда. (DEC-CANVAS-02)** Импорт контейнера = моментальный блок. Drag из Tree-сайдбара — только для импорта из других проектов. Picker'ы для «принести в контекст» не нужны.

**3. Immutable model: операция → новый контейнер (n→m). (DEC-CANVAS-03)** Substitution / mutagenesis / insertion / replace — все генерируют новые containers с явным `parentCommit`. ProjectCommit обобщается до `n inputs → m outputs`. История бесплатна. ContainerCommit как сущность для «версии плазмиды» отменяется. **Partially supersedes** DEC-CONTAINER-DIFF-STORAGE-01 (diff-storage — допустимая compression-техника, но не UX entity).

**4. Дубликаты от повторного запуска операций не сливаем. (DEC-CANVAS-04)** PCR того же template теми же primer'ами дважды → два разных containers. Honest к историчности.

**5. Топология решает категорию автоматически. (DEC-CANVAS-05)** Circular = ★ Итог. Linear = Материал. Derived из `topology`, не ручка биолога. Решает multi-parent проблему: Итоги — отдельная секция, не вложены под родителями.

**6. Tree — три раздела. (DEC-CANVAS-06)** `⭐ Итоги` (circular, плоский), `📥 Материалы` (linear с children-expansion inline), `🔬 Праймеры` (плоский). Циркуляры только в Итогах. Linear-цепочки терминируются `→ собрано в Y`. Раздел «Промежуточные» исчезает — родословная через expand/collapse в Материалах.

**7. SequenceView получает второй режим: plasmid map для circular. (DEC-CANVAS-07)** Toggle linear ⇄ circular в углу вивера. Бесплатно достаётся всем 4 контекстам (Importer / Library Inspector / Annotator / Контейнер-редактор). Глубина первой реализации — §7 вопрос №9.

**8. Контейнер-редактор — отдельная сущность поверх SequenceView. (DEC-CANVAS-08)** SequenceView (universal viewer) + operation toolbar (ПЦР, Restriction, Мутагенез, Replace) + inline operation popups + расширенный SelectionContextMenu. Двойной клик на материал-блок canvas. SequenceView сам не место для operations.

**9. Algorithm core v0.5 reuse, UI v0.5 wizards выбрасывается. (часть DEC-CANVAS-08)** Harvest: `golden-gate.js`, `restriction-db.js`, `tm-calculator.js`, `local-primer-design.js`, `mutagenesis.js`, junction-метод-по-концам из `JunctionBlock`. Kill UI: `PlasmidUseWizard`, `MutagenesisWizard`, `OligoManager` modal, `PrimerPanel` side-panel. Operations переписываются inline / popover / context menu.

---

## 3. Data model — semantic changes

Shape ARCHITECTURE_v2 §2 остаётся без structural изменений. Меняется semantics:

**Категория контейнера derived из `topology.circular`** (Пункт 5). Tree-рендер использует `topology.circular ? 'goal' : 'material'`. Поле `category` на контейнере **не вводится** — это denormalization, источник рассинхрона.

**ContainerCommit[]** остаётся для intra-container manual edits (existing `useManualEditDetection` pattern, M-X.5 K10), но **больше не используется для версий плазмиды**. Версия = новый контейнер с `origin.kind = 'project_commit'` + `origin.projectCommitId` + `origin.role: 'product' | 'split_product'`. Биолог не видит «версии одной плазмиды» — видит дерево потомков через DAG-рёбра.

**ProjectCommit generalised** до `n inputs → m outputs` (Пункт 3):
- PCR: 1 template → 1 amplicon (`amplify`).
- Restriction Cut: 1 plasmid → N fragments (`digest_split`, outputs = N).
- Gibson / Golden Gate / KLD / Ligation: n fragments → 1 product (`mix`).
- Mutagenesis: 1 template → 1 mutant (`mutate`, новый container с явным parentCommit).
- Insertion / Replace / Deletion: 1 source → 1 modified (новый container, явный parent).

Существующее поле `outputs.containerIds: UUID[]` остаётся; если не было — добавить.

**Tree рендер-алгоритм** (Пункт 6) — derived обход:

```
project.containerIds:
  if topology.circular → Итоги (плоский, ordered by createdAt)
  else (linear):
    if origin.kind === 'project_commit' AND ∃ circular output → terminate as "→ собрано в {Y.name}"
    else → Материалы.root, expandable children
       (children = containers где origin.projectCommit.inputs.containerIds includes self)
project.primerIds → Праймеры (плоский, by createdAt)
```

Children-expansion в Материалах — lazy на click ▸, не eager.

**Чего НЕТ в data model:** поля `category`, объекта «версия», ручных папок в Tree, layout-позиций для Graph view (derived dagre). Layout view хранит `container.position` per-container — §7 вопрос №3 уточняет жизненный цикл при переключении view.

---

## 4. Три инструмента — детализация

### 4.1 Canvas

**Layout view** — авторский spatial. Биолог расставляет блоки руками. Хранит `container.position`. Используется когда экспериментальный контекст требует группирования (backbone + 3 insert + 2 primer в pre-mix зоне). UX-инвариант: блоки не «прыгают» при появлении новых — § 7 вопрос №4.

**Graph view** — auto-layout bipartite (operations как ромбы, materials как прямоугольники, развёрнуто целиком, чтение картины эксперимента). Layout = dagre LR (как в `Dag/DagCanvas` M-C.1 K4) с разделением узлов на operation/material lanes.

**Toggle Layout ⇄ Graph** — control в углу canvas. Не отдельная команда меню. Цикл сохранения позиций — §7 вопрос №3.

Operations в Layout view: «+ Сборка» как UX-жест — §7 вопрос №1. Multi-step операции — §7 вопрос №2.

### 4.2 Контейнер-редактор

Layer-обёртка над SequenceView. SequenceView сам не изменяется — Importer / Library Inspector / Annotator продолжают использовать его как read-only / scoped flows без operation toolbar.

Композиция: header (name + tags + meta + ← Назад) → SequenceView (без изменений, все tracks/overlays/popups сохранены) → **operation toolbar** (новое: ПЦР, Restriction, Мутагенез, Replace, по мере harvest) → **inline operation popups** (новое: PrimerFromSelection, PCR inline confirmation, Mutagenesis parameters — не modal-stack, поверх SequenceView).

**Расширенный SelectionContextMenu** (правый клик на selection):
- Existing (DEC-SV-04): Copy fwd / Copy rev / Copy AA.
- New: «Создать праймер из выделения» / «PCR этого региона» / «Мутагенез выделения» / «Замена выделения» / «Найти ферменты в выделении».

Минимальный набор operations первой итерации — §7 вопрос №8 (ПЦР+Restriction+Мутагенез = 80%).

### 4.3 Tree (Library-сайдбар)

Три раздела (Пункт 6) с live связью с Canvas:
- Click container в Tree → highlight на canvas (Layout центрирует, Graph scroll-to-node).
- Click `→ собрано в Y` reference → активирует Y в Итогах + highlight.
- Двойной клик container → контейнер-редактор.
- Drag container из Tree другого проекта → cross-project clone.

Tree shared между Library Inspector и Canvas или дублируется — §7 вопрос №7. Интуиция: shared компонент, layout правой панели context-зависим.

---

## 5. Компонентная карта

### 5.1 Новое (требует разработки)

- **`components/Canvas/LayoutView/`** — spatial workspace с draggable container blocks.
- **`components/Canvas/`** Layout/Graph toggle — control в Canvas header.
- **`components/ContainerEditor/`** — layer-обёртка над SequenceView с operation toolbar.
- **`components/ContainerEditor/operations/`** — ПЦР / Restriction / Мутагенез / Replace inline actions.
- **Plasmid map mode в SequenceView** — circular ring rendering (Пункт 7) как новый track + toggle, в составе `components/SequenceView/`.
- **Tree 3-раздельная категоризация** — extension `components/Library/tree/` (новые компоненты разделов, derived из topology + DAG-обход).

### 5.2 Harvest (используется без переписи / с минимальными правками)

- `components/SequenceView/` (~330 KB) — universal viewer без изменений, оборачивается контейнер-редактором.
- `components/Annotator/` (~75 KB) — четвёртый context SequenceView, без изменений, живёт параллельно как fullscreen workflow.
- Algorithm core (`golden-gate.js`, `restriction-db.js`, `tm-calculator.js`, `local-primer-design.js`, `mutagenesis.js`, `validate.js`, и др. в корне `gui/designer/src/`) — без изменений, используется операциями контейнер-редактора.
- `components/Dag/` M-C.1 K4 (~30 KB) — harvest: ReactFlow setup, dagre LR config, drop-handling pattern для Graph view как стартовая точка. Остальное переписывается.
- `JunctionBlock.jsx` (29 KB) + `JunctionDNA.jsx` (14 KB) — 8 типов junction + алгоритм метод-по-концам, помещается в operations toolbar Mix-операций.
- `components/PlasmidMiniMap.jsx` (30 KB) — основа plasmid map mode (Пункт 7), extend до interactive.
- `feature-palette.js` ⚓, `common-features.json` (419 features) — без изменений.
- Library Workspace (~360 KB) — Tree + Inspector + AddModal + PreImportModal становятся Library-сайдбаром Canvas-модели; правая панель context-зависима.

### 5.3 Kill

- `components/Dag/` M-C.1 K4 — после §5.2 harvest.
- M-X.7a v2 Library Inspector как «отдельный workspace» концепция — растворяется в Canvas-модель (код не теряется).
- M-X.7c L2/L3 деление по 3LEVELS — отменяется (не было реализовано).
- `PlasmidUseWizard.jsx` (39 KB) — при реализации operations; harvest UX метода-по-концам.
- `MutagenesisWizard.jsx` (18 KB) — при реализации Мутагенез operation; harvest `mutagenesis.js` уже отдельно.
- `OligoManager.jsx` (13 KB) — при реализации primer-pool; harvest статусы заказа (localStorage `pvcs-oligo-registry`) + Tm.
- `PrimerPanel.jsx` (9 KB) — harvest категоризация (assembly / custom / verification) + reused tracking.
- `docs/ARCHITECTURE_3LEVELS.md` — на archive при acceptance этого документа.

### 5.4 Нетронуто

Backend (FastAPI / BioPython), Importer pipeline, AddModal/PreImportModal, StartScreen, modals/utility, Toast, hotkey system — без изменений в M-Canvas скоупе.

---

## 6. UX-инварианты

10 правил, проверяются в каждой M-Canvas макетной сессии:

1. **Двойной клик на материал-блок canvas** (Layout block / Graph material node / Tree entry) → контейнер-редактор. Единственная точка входа.
2. **Drag из Tree другого проекта** → cross-project clone. Drag внутри текущего проекта — позиционирование на Layout view, не клон.
3. **Импортированный контейнер** появляется на canvas автоматически (cascade или явное место — §7 вопрос №4).
4. **Toggle Layout ⇄ Graph** в углу canvas, не отдельная команда.
5. **Toggle linear ⇄ plasmid map** в углу SequenceView, не настройка приложения.
6. **★ Итог / Материал** — производное от `topology.circular`. В Tree — разный раздел; на canvas — разная визуальная идентичность блока (circle ring vs rectangular bar).
7. **Operations порождают новые containers** — биолог видит новый блок на canvas + новую запись в Tree сразу после confirm в контейнер-редакторе.
8. **Дубликаты не сливаются** — повторный PCR с теми же параметрами создаёт новый контейнер.
9. **Контейнер immutable после создания.** Manual edits в SequenceView возможны (`useManualEditDetection` pattern, M-X.5 K10), но создают branch (новый контейнер `manual_edit_branch`) при первой character-level правке. Editable mode toggle (DEC-LIB-K6-EDIT-PILL-01) сохраняется.
10. **Stack-навигация** (ARCHITECTURE_v2 принцип 1.9) — из контейнер-редактора `← Назад` возвращает на Canvas с сохранением state.

---

## 7. Открытые вопросы для следующих макетных сессий

10 вопросов, источник — DECISIONS.md блок 11.05.2026. Приоритизация для первых сессий + остальные by demand.

**Приоритет 1 (без них Canvas не функционален):**

- **№1 «+ Сборка» как UX-жест.** Ghost-placeholder operation + drag-to-port от materials? Кнопка `+` → wizard popup? Right-click multi-selection? Reference: DAG palette M-C.1 vs SnapGene «In-Fusion Cloning» wizard vs Benchling «Create Assembly».
- **№4 Layout algorithm.** Где появляется новый блок? Cascade от верхнего левого? Pre-defined zones (imports/intermediates/goals)? Rule «снаружи существующих»? Drag-to-place? Поведение при auto-relayout?
- **№10 Primer entity на Graph view.** Узлы рядом с PCR-ромбом или параметры PCR-узла? От этого зависит Tree раздел 🔬 Праймеры — отдельная секция или derived.

**Приоритет 2 (by demand):**

- **№2** Multi-step операции (PCR обоих → ligation как одна visual-сборка со стадиями vs два отдельных commit'а).
- **№3** Цикл переключения Layout ⇄ Graph — позиции Layout сохраняются или auto-relayout.
- **№5** Draft / verified state операции (failed pTest-GG со скриншота).
- **№6** Виртуальная сборка для проверки — zone «черновики» или draft-flag на блоке.
- **№7** Tree shared между Library Inspector и Canvas или дублируется.
- **№8** Operations toolbar минимальный набор для первой итерации.
- **№9** Plasmid map глубина для первой итерации (минимальная vs полная).

---

## 8. Roadmap до M-Canvas v1

Без оценок времени. Этапы и зависимости.

- **v0.1** — макеты Приоритет 1 (№1, №4, №10). Зависимость: этот документ accepted. Выход: 3 макетные сессии Игорь ↔ Chat с decision blocks в DECISIONS.md.
- **v0.2** — макеты Приоритет 2 (№2, №3, №5-9). Зависимость: v0.1 closed. Выход: 5-7 сессий, накопленные DEC → promotion в ⚓.
- **v0.3** — спека первой реализации (Graph view + Tree categorization + base навигация). Тип A. Harvest: Dag/ K4, Library Tree.
- **v0.4** — контейнер-редактор первая версия (минимальный operations set). Тип A. Harvest: SequenceView wrap, algorithm core, выбранные wizards.
- **v0.5+** — расширения (multi-step, primer pool, plasmid map полная глубина, virtual assembly drafts).
- **v1.0** — Canvas-модель закрывает DEC-CANVAS-01..08. ARCHITECTURE_3LEVELS.md archived. ARCHITECTURE_v2.md §3 «Окна» обновлён (Canvas-as-primary-view замещает DAG-as-primary-view принцип 1.6).

---

## 9. Связь с другими ARCHITECTURE-документами

- **`ARCHITECTURE_v2.md`** — активный центральный. §1 валиден без изменений. §2 — semantic extensions здесь в §3. §3 «Окна» переписывается в M-Canvas v1.0.
- **`ARCHITECTURE_3LEVELS.md`** — на archive при acceptance этого документа. Супрессирован DEC-CANVAS-01..08 целиком.
- **`docs/COMPONENT_MAP.md`** — обновляется после каждой M-Canvas acceptance (R5 §17 CHAT_PLAYBOOK).
- **`DECISIONS.md`** блок 11.05.2026 — первичный источник; этот документ — его официальное оформление. После первой M-Canvas acceptance DEC-CANVAS-01..08 → ANCHORS.md ⚓.
- **`CURRENT_TASK.md`** — блок «Canvas-model фундамент» закрывается при acceptance; переходит в M-Canvas v0.1 макетные сессии.

---

**Источник:** Canvas-kickoff сессия Игорь ↔ Chat 11.05.2026 + DECISIONS.md блок «Architecture session 11.05.2026 — Canvas-model fundament» (DEC-CANVAS-01..08) + reference-скриншот Graph view от Игоря.
**Кандидаты на ⚓ promotion** после первой M-Canvas acceptance: все 9 пунктов фундамента (DEC-CANVAS-01..08 — 8 решений + Пункт 9 как часть DEC-CANVAS-08).
