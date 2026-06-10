# ARCHITECTURE.md — архитектура BodgeGene v0.6+

> **Статус:** активный. Единая точка правды по архитектуре BodgeGene v0.6 и далее. При расхождении с любым другим документом — этот побеждает.
>
> **Создан:** 27.05.2026 — слияние трёх архитектурных доков в один референс (консолидация `docs/`, шаг S2):
> - `ARCHITECTURE_v2.md` (29.04.2026) — гранд-план v0.6+, до-канвасный.
> - `ARCHITECTURE_CANVAS_MODEL.md` (11.05.2026) — canvas-итерация, промежуточная.
> - `SPEC_M-CANVAS-FOUR-TIER-ARCHITECTURE.md` (16.05.2026) — four-tier-модель, **реализована** (спринты T1-T10, v0.8.3-alpha).
>
> Три исходных дока перенесены в `docs/archive/`. Эволюция: v2 → canvas-model → four-tier; каждый следующий супрессировал часть предыдущего. Реализованная four-tier-модель — основа §2-§3. Из `ARCHITECTURE_v2` сохранены пласты, которых four-tier не касался и которые не устарели (принципы, persistence, distribution).
>
> **Чего здесь нет:** UI-макеты (отдельные сессии); детальные спеки спринтов (`docs/SPRINT_*`, `docs/archive/`); тактический бэклог (`docs/BACKLOG.md`); регламент Chat ↔ Code (`CHAT_PLAYBOOK.md`); реестр решений (`DECISIONS.md` sprint-level, `ANCHORS.md` фундаментальные ⚓); карта компонентов (`docs/COMPONENT_MAP.md`); дизайн-токены (`docs/DESIGN_SYSTEM.md`).

---

## 0. TL;DR

BodgeGene — open-source web-редактор плазмид со структурированным cloning-провенансом в файле. Honest research tool для academic / teaching / personal use — не SnapGene-killer, не Benchling-конкурент.

**Архитектурное ядро.** Канвас проекта — четырёхуровневая модель данных `source → piece → reaction → product` внутри зон-фреймов (как Miro), с двумя режимами отображения зоны (graph / sequence). Source — существующий контейнер ДНК; piece — именованный логический отбор участка (план); reaction — операция получения/соединения (PCR, Gibson, restriction, …); product — derived-выход, материализуется в новый контейнер. Сборка — это операция-ребро графа, не отдельная сущность. Параллельно — ось версионирования внутри контейнера (ContainerCommit + replay).

**Формат и модель работы.** `.bodge` (ZIP проекта) и `.bodgebox` (один контейнер) построены на стандартном GenBank с провенанс-слоём в COMMENT — graceful degradation, не lock-in. Local-first: IndexedDB — рабочая копия, файл на диске — явно сохранённая версия. Identity = label, не account; sync через файл, не через сервер; backend stateless.

**Эволюция.** Архитектура прошла v2 (DAG-as-primary) → canvas-model → four-tier (реализована, спринты T1-T10, v0.8.x). Корневой view — канвас с зонами, не DAG и не список.

---

## 1. Принципы (immutable, ⚓)

Принципы зафиксированы и не меняются в пределах major-версии. Любое архитектурное решение проверяется на совместимость с ними; изменение принципа = major version bump. Формальные ⚓-записи — в `ANCHORS.md`.

**1.1 Контейнер = единственный класс молекулярного артефакта.** Один тип — `MoleculeContainer` (на канвасе в роли Source) с флагом `kind`, без подклассов AssemblyContainer / PrimerContainer / FragmentContainer. Праймеры — отдельная сущность (не молекулы в том же смысле). Library-entries — отдельная. Piece — логический отбор участка (см. §2), тоже отдельная сущность. Принцип про «один класс молекулы с флагом», а не «одна сущность на всё».

**1.2 Сборка = операция уровня проекта (Reaction), не объект.** Mix (Gibson/GG/RE/KLD/blunt), PCR, digest split, clone-on-import — рёбра в графе проекта. У них есть метаданные (класс реакции, params, agent, timestamp), но нет lifecycle planning/ready/committed. Операция атомарна: либо состоялась, либо нет.

**1.3 Концы контейнера — first-class свойство.** Для linear-контейнера концы (5'/3') с overhang-info видны в UI и валидируются при операциях. У circular концов нет. Инструменты модификации концов: PCR (ампликон с primer-tails), digest (разрез с overhangs), modify-ends (явная правка в контейнер-редакторе).

**1.4 Сшивающий участок не имеет отдельной сущности.** Overlap/homology, физически возникающий в продукте Gibson из primer-tails — часть концов исходных ампликонов, не отдельный объект. После операции mix эти overlap'ы материализуются в один шов в продукте; провенанс трекается через цепочку commits.

**1.5 Provenance = side-effect каждой операции.** Каждая операция (container-commit или reaction) автоматически создаёт provenance-запись. PROV-O как vocabulary (Entity / Activity / used / wasGeneratedBy / wasDerivedFrom / hadPlan), но хранение — plain JSON, не RDF.

**1.6 Canvas-as-primary-view.** ⚠️ *Принцип эволюционировал.* Изначально (v2, 29.04) формулировался как «DAG-as-primary-view»: корневой workspace проекта = DAG, не список/tree/table. С canvas-модели (11.05) и four-tier (16.05) корневой workspace = **бесконечный канвас с зонами-фреймами**; граф — это `viewMode: 'graph'` зоны, а не отдельный режим приложения. Суть USP сохранена: проект — визуальный граф материалов и операций, не список/таблица; список — projection (Tree-сайдбар). **Формальная ⚓-запись 1.6 в `ANCHORS.md` подлежит обновлению под canvas-модель** — хвост финализации, не сделан на момент создания этого файла.

**1.7 Local-first, открытый формат.** `.bodge` = ZIP с manifest.json + per-container .gb (со structured COMMENT-блоком для provenance) + dag.json. RO-Crate metadata добавляется в v0.9 для FAIR-claims в статье. Файл живёт на диске пользователя, не в облаке. Никакого SaaS.

**1.8 Скорость не приоритет. Качество и гибкость важнее.** Решение для UX-развилок (fragment-insert и т.п.). Прорабатываем через прототипы и дизайн-сессии, не оптимизируем под «сделать в один клик».

**1.9 Stack-навигация.** В canvas-модели сводится к паре «канвас ↔ контейнер-редактор»: двойной клик на блок открывает контейнер-редактор, `← Назад` возвращает на канвас с сохранением state. Фулскрин-стек из v2 (много экранов с back-стеком) упрощён — большинство «экранов» стали зонами одного канваса.

**1.10 Honest scope.** BodgeGene моделирует design intent provenance, не lab outcome verification. Не трекаем transformation efficiency, sequencing-verify, contamination, errors. Это design tool, не lab simulator.

**1.11 Identity = label, не account.** В системе нет понятия user account. `agent` (name + email) — label для commit attribution, без auth/permissions. Файл — единственный источник правды. Несколько agents в одном файле — нормальное явление. Backend остаётся stateless calculation service, не user service.

**1.12 Sync через файл, не через сервер.** `.bodge` — primary unit обмена. Cloud sync — через third-party providers (Drive Desktop, Dropbox, OneDrive) и File System Access API. Активная Google Drive API integration — opt-in convenience, не замена. Никакого built-in sync server, никакого real-time collab.

**1.13 Изоморфизм data ↔ протокол.** Каждая операция в data-модели соответствует реальной процедуре в боксе биолога. Контейнер = «виртуальный операционный стол» с одной активной молекулой + историей операций. Сознательное упрощение относительно физической реальности (где после digest в пробирке живёт смесь продуктов): в контейнере остаётся только тот продукт, с которым продолжается работа. Принцип жёстко привязывает data-model к биологическому процессу — каждая запись отвечает на вопрос «что биолог делал на столе, чтобы это получить».

**1.14 Разные операции = разные контейнеры.** Три pUC19 в трёх разных операциях = три контейнера, даже при идентичной стартовой молекуле. Биологически это три параллельных tube на столе, не один. Снимает соблазн «один контейнер с branch'ами» — branch'и естественно возникают через граф (split, повторное использование parent'а). Контейнер дёшев; архитектура не экономит на контейнерах ради чистоты модели и гибкости.

---

## 2. Data model

Проект — это **граф из четырёх уровней** (`source → piece → reaction → product`), разложенный по **зонам-фреймам**. Параллельно каждому контейнеру существует **ось версионирования** (ContainerCommit + Snapshot) — правки внутри одной молекулы. Сущности файла проекта: `Project` (корень), `MoleculeContainer` (уровень 1, Source), `Piece` (уровень 2), `Reaction`/`operation` (уровень 3), `Product` (уровень 4 — derived), `Zone` (фрейм канваса), `Primer`, `LibraryEntry`.

Четырёхуровневая модель — реализована (спринты T1-T10, v0.8.3-alpha). Решения — Блок `DEC-CANVAS-4T-01..30` в `DECISIONS.md` (часть — кандидаты на ⚓ promotion).

### 2.1 Project — корневой объект файла `.bodge`

```typescript
interface Project {
  id: UUID;                    // UUIDv7 (timestamp-prefixed)
  schemaVer: number;
  name: string;
  description: string;
  tags: string[];              // ⚓ project-level chips (DEC-V2-30, flat strings)
  createdAt: ISO8601;
  updatedAt: ISO8601;
  agent: Agent;                // name/email для commit attribution
  containerIds: UUID[];        // ordered, source of truth навигации
  projectCommitIds: UUID[];    // operations/reactions, ordered топологически
  primerIds: UUID[];           // project-local pool refs
  settings: ProjectSettings;
  ext: object;                 // forward-compat
}
```

### 2.2 Уровень 1 — Source (`MoleculeContainer`)

**Что это.** Существующий контейнер ДНК: плазмида, oligo, gBlock, материализованный продукт прошлой сборки. Единственный класс молекулярного артефакта (принцип 1.1). На канвасе в роли исходника называется Source.

```typescript
interface MoleculeContainer {
  id: UUID;
  schemaVer: number;
  kind: 'plasmid' | 'oligo' | 'gblock' | 'derived_product';  // DEC-CANVAS-4T-02
  name: string;
  description: string;
  origin: Origin;              // discriminated union, immutable (см. ниже)
  provenance: Provenance;      // «где создан», mutable пока в drafts (см. ниже)
  baseSnapshot: Snapshot;      // immutable, content-addressable
  commits: ContainerCommit[];  // [] на старте, не null (§2.7)
  currentHash: string;         // derived: hash после replay всех commits
  topology: Topology;          // {circular: bool}
  ends: Ends | null;           // {fivePrime, threePrime} для linear; null для circular
  zoneId?: string;             // фрейм канваса (§2.6)
  materializedFrom?: { reactionId: string, cloneNumber?: number };  // если это материализованный продукт
  position: { x, y };          // UI state на канвасе
  ext: object;
}
```

Поле `tagIds` убрано (⚓ DEC-LIB-10): теги — только на `LibraryEntry`, у молекул в проекте тегов нет, организация — через граф и зоны. `kind` влияет на визуал (синий прямоугольник для plasmid/derived_product, фиолетовый меньшего размера для oligo/gblock; gblock — пунктир до получения) и на поведение piece-selection (для oligo диапазон по умолчанию = вся последовательность).

**Origin — дискриминированное объединение, immutable после создания:**

```typescript
type Origin =
  | { kind: 'catalog';             catalogId: string; vendor: string; }
  | { kind: 'paste';               pastedAt: ISO8601; }
  | { kind: 'file';                sourceFile: string; sourceFormat: 'gb'|'dna'|'fasta'; }
  | { kind: 'library_clone';       sourceLibraryEntryId: UUID; sourceLibraryEntryHash: string; clonedAt: ISO8601; }
  | { kind: 'cross_project_clone'; sourceProjectId: UUID; sourceProjectName: string; sourceContainerId: UUID; sourceContainerHash: string; clonedAt: ISO8601; }
  | { kind: 'project_commit';      projectCommitId: UUID; role: 'product'|'split_product'; }
  | { kind: 'manual_create';       createdAt: ISO8601; };
```

`origin` фиксируется при создании и **никогда не меняется**. Форк/клон контейнера — новый контейнер со своим origin. `cross_project_clone` несёт `sourceProjectName` отдельно: файл-источник может стать недоступен, имя должно остаться видимым в provenance.

**Origin vs provenance — две раздельные семантические оси.** `origin.kind` отвечает «что это и откуда взялось» (catalog / paste / file / library_clone / project_commit). `provenance` отвечает «где и когда создан этот instance в наших workflows»:

```typescript
interface Provenance {
  projectId: UUID;
  projectName: string;         // имя на момент создания, для UI breadcrumb
  createdBy: { name, email };
  createdAt: ISO8601;
  note?: string;
}
```

Смешивать их в одном поле — антипаттерн (был в v0.5). UI пишет provenance в breadcrumb/inspector, origin — в badge/иконку.

### 2.3 Уровень 2 — Piece (Кусок)

**Что это.** Именованный логический отбор: биолог сказал «вот этот участок этой плазмиды я буду использовать». **Физически piece ещё не существует — это план.** Кусок становится физическим только когда reaction выполнена и product материализован. Piece — новая сущность four-tier-модели (спринт T1), отдельный slice. UI-термин — «Кусок».

```typescript
interface Piece {
  id: string;                  // 'pc-' + uuidv7()
  name: string;                // user-given, напр. «U3 A.fumigatus gRNA»
  sourceIds: string[];         // 1+ container id. 1 — selection-piece; 2+ — derived (OV_PCR из 275+279)
  ranges: Array<{              // параллельно sourceIds
    sourceId: string;
    start: number; end: number;
    orientation: 'forward' | 'reverse';
  }>;
  origin: 'selection' | 'feature' | 'existing-primers' | 'new-primers';  // 4 способа задать (§3)
  acquisitionMethod: 'undefined' | 'pcr' | 'ov-pcr' | 'restriction' | 'direct' | 'synthesis';
  // как биолог собирается получить piece физически. Смена поля → создание/удаление reaction (T8).
  acquisitionParams: object;   // primer pair / RE-сайты / pending-синтез — по методу
  color: string;               // HSL hex, автоген (стабильный hash от id), переопределяемый
  functionalLabel?: string;    // напр. «промотор», «маркер Hyg», «gRNA-spacer»
  kind: 'sourced' | 'gap';     // gap — кусок без источника (линкер/известная ПСО)
  gapSequence?: string;        // для kind='gap' с известной ПСО (V83)
  variantGroupId?: string;     // 'vg-<uuid>' — design variants (T9)
  zoneId?: string;
  derivedReactionId?: string;  // обратная ссылка на reaction (если acquisitionMethod ≠ undefined)
  pinned?: boolean;            // закреплён при auto-layout (T4.5)
  frozen?: boolean;
  createdAt: number; updatedAt: number;
}
```

Piece **не хранит**: вычисленную последовательность (derived через `selectPieceSequence` — изменение source.sequence обновляет piece автоматически); праймеры физически (они — отдельные `Primer` entries, piece ссылается через `acquisitionParams`); топологию (все pieces линейные). Размер piece = `Σ(range.end − range.start)` по всем ranges; для OV_PCR-derived — суммарная длина минус overlap.

**Reuse в нескольких зонах.** Один piece, N ссылок из разных узлов; rename / color / functionalLabel обновляются везде. Нужны разные параметры — биолог явно клонирует через `CLONE_PIECE`.

### 2.4 Уровень 3 — Reaction (операция)

**Что это.** Узел графа с методом получения piece или соединения нескольких piece. В коде — `state.operations` (отдельный slice). Эволюция понятия «ProjectCommit» из v2: операция уровня проекта, ребро графа.

```typescript
interface Reaction {              // в state — operation
  id: string;
  kind: 'pcr' | 'ov-pcr' | 'restriction' | 'ligation'
      | 'gibson' | 'golden-gate' | 'kld' | 'mutagenesis' | 'recombinase';
  inputPieces: string[];          // pieceId[] — T2 primary
  inputs: string[];               // legacy containerId[] — surgical-адаптеры (DEC-T2-09), артефакт миграции T2
  params: ReactionParams;         // без range — диапазон живёт в piece
  outputs: string[];              // pieceId[] — derived virtual products
  position: { x, y };
  zoneId?: string;
  status: 'planned' | 'executed' | 'failed';   // T9 materialization
  executedAt?: number;
  materializedClones?: Array<{ containerId: string, cloneNumber: number, status: string }>;
}
```

**Поле inputs vs inputPieces — артефакт миграции.** Four-tier-модель сделала piece первичным входом операции: `inputPieces` (piece-ids) — primary. Legacy-поле `inputs` (container-ids) сохранено для совместимости через точечные surgical-адаптеры (DEC-T2-09), не переписывалось целиком. Новый код пишет `inputPieces`.

**Типы reactions (kind):**
- `pcr` — амплификация одного piece (1 input, 2 праймера, 1 derived product).
- `ov-pcr` — overlap-PCR двух piece (2 input + overlap region, 2 внешних праймера, 1 derived product).
- `restriction` — вырезание по RE-сайтам.
- `ligation` — прямое соединение piece с compatible ends.
- `gibson` — Gibson assembly N piece (N inputs, overlap через extension, 1 product).
- `golden-gate` — Type IIS рестрикция-лигаза (N inputs с BsaI-подобными сайтами).
- `kld` — KLD ligation.
- `mutagenesis` — site-directed (kld / quikchange / overlap).
- `recombinase` — Gateway / Cre-loxP (post-MVP, T12).

```typescript
interface ReactionParams {        // type-specific, объединение по kind
  homologyLength?: number;        // gibson, bp
  enzyme?: GoldenGateEnzyme;      // golden-gate: BsaI | BsmBI | BbsI | SapI | ...
  overhangs?: string[];           // golden-gate: 4 nt overhangs по порядку
  enzymes?: RestrictionEnzyme[];  // restriction: 1 (single) или 2 (double digest)
  primerType?: 'phosphorylated';  // kld
  splitMode?: 'left_only' | 'right_only' | 'split';  // ov-pcr: куда падает overlap
  agent?: Agent;
  notes?: string;
}
```

**Как reaction появляется на канвасе.** Два пути: (1) **auto-create из `piece.acquisitionMethod`** (T8) — биолог установил метод piece → автоматически создаётся ромб reaction с этим piece как input; (2) **вручную** через floating-кнопку «+ Операция» или drag из палитры операций, биолог сам привязывает inputs.

**N inputs / M outputs = гиперребро.** Reaction с несколькими входами и выходами — гиперребро графа (один Activity-узел в PROV-O). На хранении — записи `inputPieces[]` / `outputs[]`. Рёбра для рендера деривируются: для каждого входа — ребро `used`, для каждого выхода — `wasGeneratedBy`. На канвасе reaction рендерится ромбом (отличие от прямоугольников-материалов).

**Warnings — отдельный канал.** Reaction-warnings (incompatible ends в Gibson, internal BsaI в Golden Gate, buffer mismatch в RE digest) живут на самой reaction. Это **отдельный канал** от commit-warnings контейнеров (§2.7). UI агрегирует их раздельно: узел reaction показывает свои reaction-warnings, история контейнера — свои commit-warnings. Разделение поддерживает принцип 1.13 — warnings от реакции и от мутации живут в разных физических контекстах.

### 2.5 Уровень 4 — Product (Продукт)

**Что это.** Выход reaction. **Всегда derived** — существует пока существует производящая reaction, исчезает при её удалении. Биолог НЕ создаёт product вручную; единственное user-action — `MATERIALIZE_REACTION(reactionId, {cloneNumber?, name?})` (T9).

Два состояния:

1. **Virtual product** — пунктирный синий прямоугольник. Reaction запланирована, не выполнена. Sequence — computed reactive selector («вот что получится, если reaction сработает»). Работает после F4 (Live Product Preview).
2. **Materialized product** — яркий синий прямоугольник. Биолог получил физическую ДНК и нажал «Выполнено» на reaction. Виртуальный product становится реальным `MoleculeContainer` с `kind='derived_product'` и `materializedFrom = {reactionId, cloneNumber?}`. Может использоваться как Source следующих сборок.

**Clone variants (T9).** При материализации биолог может пикнуть несколько колоний одной трансформации. Каждая колония — отдельный container с одинаковым `reactionId`, разным `cloneNumber`. Программно: один reaction → массив `materializedClones[]`. На канвасе — N синих прямоугольников от одного ромба (как /5 и /7 на бумажной диаграмме). Clone variants ≠ design variants: design variants — разные reactions с varying input (см. §2.6 ветвление), clone variants — одна reaction, N колоний (meta на продукте).

### 2.6 Зоны (Zone) — фреймы как в Miro

**Что это.** Визуально выделенная область канваса с рамкой и подписью. Биолог режет канвас на смысловые блоки сборок — без зон проект с шестью сборками превращается в кашу. Произвольное количество зон. Зоны формальные, как фреймы Miro (DEC-CANVAS-4T-07, кандидат на ⚓).

```typescript
interface Zone {
  id: string;                     // 'zn-' + uuidv7()
  name: string;                   // user-given, напр. «Сборка 1: P43_U3afu_Hyg»
  bounds: { x, y, width, height }; // resizable
  collapsed: boolean;              // свёрнута ли
  viewMode: 'graph' | 'sequence';  // per-zone, не глобально
  notes?: string;
  createdAt: number; updatedAt: number;
}
```

Поле `zoneId?: string` — на `container`, `piece`, `operation`; на `junction` — derived от соединяемых узлов. `zoneId = null` — «бесхозный» узел (backward-compat со старыми проектами, soft-migration T3).

**Поведение:**
- *Резиновый размер.* Зона автоматически расширяется при добавлении узлов; drag углов рамки — ручное увеличение; минимум — чтобы помещалась подпись.
- *Мутируемость.* Drag узла из зоны 1 в зону 2 — узел получает новый `zoneId`, junctions с узлами зоны 1 рвутся с предупреждением (toast + рамка вокруг разрываемых стыков). Drag границ — resize. Merge двух зон — выделить обе → context-menu «Объединить»; узлы обеих получают zoneId merged-зоны.
- *Soft-migration.* Узлы с `zoneId=null` работают без зоны. Новые проекты — `zones: []` (DEC-T3-08 реверс: дефолтная зона больше не засевается, чистый канвас). Биолог оборачивает бесхозные узлы через `WRAP_LOOSE_NODES_IN_ZONE`.
- *viewMode per zone.* Биолог может смотреть зону 1 в graph, зону 2 в sequence одновременно (§3).

**Чего зона НЕ имеет:** топологии (зона — контейнер для узлов, не сборка; топология — свойство финального product); финального продукта как явного поля (вычисляется: узлы без исходящих стыков = финалы); параметров реакций (они на reactions).

**Связи зона → зона.** Материализованный product зоны A может быть Source-ом в зоне B — **живая ссылка, не копия**: container существует один в `state.containers`, обе зоны ссылаются на него через узлы. UI: при drag container в зону B, если его `materializedFrom` указывает на reaction зоны A — badge «← из Зоны A»; клик на badge → фокус канваса на зону A с подсветкой product.

### 2.7 Ось версионирования — ContainerCommit + Snapshot

Параллельно графу четырёх уровней у каждого контейнера есть **ось внутренней истории** — модель Plasmid-Git: `baseSnapshot` (immutable) + `commits: ContainerCommit[]` + replay → `currentHash`.

**ContainerCommit — правка ВНУТРИ одного контейнера.** Не создаёт новый контейнер (в отличие от Reaction).

```typescript
interface ContainerCommit {
  id: UUID;
  parentId: UUID | null;
  hash: string;                // SHA-256(canonical JSON)
  type: ContainerCommitType;
  payload: object;             // type-specific
  warnings?: string[];         // предупреждения ОТ САМОЙ правки (см. ниже)
  createdAt: ISO8601;
  author: Agent;
  message?: string;
  frozenSnapshot?: Snapshot;    // каждые ~20 commits для perf
  schemaVer: number;
}

type ContainerCommitType =
  | 'substitution' | 'insertion' | 'deletion' | 'mutagenesis'
  | 'topology_change' | 'ends_change' | 'reverse_complement'
  | 'trim' | 'annotation_edit' | 'milestone';   // milestone — no-op semantic marker
```

**ContainerCommit НЕ моделирует «версии плазмиды».** Версия плазмиды = новый контейнер, произведённый Reaction (`origin.kind = 'project_commit'`). Биолог не видит «версии одной плазмиды» — видит дерево потомков через рёбра графа. ContainerCommit — только внутриконтейнерные ручные правки последовательности/аннотаций (паттерн `useManualEditDetection`, M-X.5 K10).

**Граница editable / frozen.** Пока контейнер editable, ручные character-level правки дописывают ContainerCommits на месте. Как только от контейнера зависит downstream-работа — он замораживается (⚓ `DEC-MUTABILITY-FREEZE-ON-USE-01`, наследуется `DEC-CANVAS-4T-22`); дальнейшие правки ветвятся в новый контейнер (`origin` manual-edit-branch). Editable-mode pill (`DEC-LIB-K6-EDIT-PILL-01`) — явный переключатель.

**`commit.warnings`** — предупреждения от самой правки (нестандартный кодон для E. coli при mutagenesis, internal-сайт). Остаются с контейнером навсегда, в истории. Это отдельный канал от reaction-warnings (§2.4).

**Snapshot + replay:**

```typescript
interface Snapshot {
  hash: string;                // SHA-256(canonical JSON без hash)
  sequence: string;            // IUPAC
  topology: Topology;
  ends: Ends | null;
  regions: Region[]; details: Detail[]; points: Point[];
}
```

Replay-инварианты: операции — pure functions (без `Date.now()`, `Math.random()`, без мутаций); вся недетерминированная data фиксируется при создании commit, лежит в payload; canonical JSON (sorted keys, no whitespace) перед хешированием; hash включает parentHash + baseSnapshotHash (защита от silent corruption); `frozenSnapshot` каждые N=20 commits — replay ×20. **Lazy commits — НЕТ:** контейнеры всегда `commits: []` при создании, не null.

### 2.8 Primer

Праймеры — отдельная сущность (не молекулы в смысле контейнера: короткие, single-strand, без аннотаций, с Tm/GC/binding-region). Project-local pool (`project.primerIds`), плюс раздел в Library.

```typescript
interface Primer {
  id: UUID;
  schemaVer: number;
  name: string;
  sequence: string;            // IUPAC, sanitized
  origin: PrimerOrigin;        // immutable
  tm?: number;                 // SantaLucia 1998 (project-wide стандарт Tm)
  tmBinding?: number;          // только binding region (для PCR annealing)
  gcContent?: number;
  hairpin?: HairpinAnalysis;
  tags: string[];
  vendor?: string; catalogId?: string; orderedAt?: ISO8601;
  backrefs: PrimerUsage[];      // computed/cached
  ext: object;
}

type PrimerOrigin =
  | { kind: 'catalog';            vendor: string; catalogId: string; }
  | { kind: 'paste';              pastedAt: ISO8601; }
  | { kind: 'file_import';        sourceFile: string; sourceContainerId: UUID; }
  | { kind: 'library_clone';      sourceProjectId: UUID; sourcePrimerId: UUID; }
  | { kind: 'designed';           designedAt: ISO8601; method: 'auto'|'manual'; targetContainerId?: UUID; targetRegion?: Region; }
  | { kind: 'overhang_extension'; basePrimerId: UUID; addedTail: string; reason: 'gibson_overlap'|'gg_overhang'|'re_site'; };

interface PrimerUsage {        // back-reference
  containerId: UUID;
  projectCommitId?: UUID;       // usage в reaction
  containerCommitId?: UUID;     // usage в правке внутри контейнера
  role: 'fwd' | 'rev' | 'binding' | 'mutagenesis';
}
```

Tm — стандарт SantaLucia NN по всему проекту. Legacy Wallace Tm в `primer-derive.js` — известный технический долг (тип-C спека на замену), не альтернативный дизайн.

### 2.9 Library

**Library = личная коллекция контейнеров и праймеров вне проектов** (⚓ DEC-LIB-01). Аналог `~/SnapGene Files/` — flat-коллекция в IndexedDB для накопления re-usable building blocks. **НЕ 3-tier ownership** (project-local / shared / catalog) — sharing-механика не оправдана для local-first single-user продукта (sync через `.bodge` и cloud-folder, §5).

```typescript
interface LibraryEntry {
  id: UUID;
  kind: 'container' | 'primer';   // только два — features живут внутри контейнеров (DEC-LIB-04)
  resourceId: UUID;               // ref на frozen MoleculeContainer / Primer body
  resourceHash: string;           // SHA-256 для дедупликации и source-of-truth marker
  name: string;
  tags: string[];                 // flat strings, без folder-иерархии (DEC-LIB-09)
  addedAt: ISO8601;
  ext: object;
}
```

- `kind: 'container'` — плазмиды и линейные фрагменты в одной коллекции; различие — топология-фильтр в UI, не разные классы (DEC-LIB-02).
- `kind: 'primer'` — отдельный раздел (UI-tab «Контейнеры | Праймеры»).
- **Features не browsable отдельно** (DEC-LIB-04) — аннотации живут внутри контейнера; `common-features.json` (~419 verified) — source для авто-аннотатора, не Library-tier.
- **Sequence заморожен после первой загрузки** (DEC-LIB-05). Правка только в двух точках: preview-step Importer-wizard (до commit-в-library) или клонирование в проект.
- **Library ↔ project — копия, не ссылка** (DEC-LIB-06). Контейнер из Library в проекте получает новый UUID и `origin.kind = 'library_clone'`; правки в проектной копии не влияют на Library entry. Обновление Library — только explicit re-import.
- **PrimerUsage back-references** (DEC-LIB-07) — на контейнере видны все ассоциированные праймеры, на праймере — где используется.

### 2.10 Что упрощается / не моделируется (честный список)

**Принимается как корректное упрощение:** multi-fragment assembly как один атомарный Reaction (биологически = одна реакция, одна тубочка); mutagenesis / cut-keep / fragment-insert как ContainerCommit (правка той же молекулы); один контейнер = одна молекула, не популяция; `origin` immutable.

**Документируется как НЕ моделируем (open для v1.5+):** transformation efficiency / strain context; sequencing-verification (Sanger/NGS validation); concentration / amount tracking; реальные lab-ошибки (PCR mismatch, contamination); failed experiments (возможен флаг `status: 'failed'` на Reaction); time-ordering между параллельными операциями; combinatorial / parametric design (SBOL3 `CombinatorialDerivation`).

---

## 3. Канвас, зоны, режимы отображения

Канвас — корневой workspace проекта (принцип 1.6). Эта секция — про взаимодействие и рендер; сама сущность `Zone` описана в §2.6, четырёхуровневые узлы — в §2.2-2.5.

### 3.1 Канвас и раскладка

Бесконечный канвас: hand-pan + wheel-zoom. Содержит зоны-фреймы (§2.6), внутри зон — узлы четырёх уровней. Бесхозные узлы (`zoneId=null`) лежат на канвасе вне зон.

**Auto-layout — 3-lane.** Узлы раскладываются по трём дорожкам (sources → pieces+reactions → products), dagre-подобный LR. `pinned`-узлы не сдвигаются при auto-relayout. 4-сторонние коннекторы на узлах.

### 3.2 Graph mode (по умолчанию)

Узлы всех 4 уровней + ромбы reactions + стыки (junctions) + product-блоки. Зелёные piece-карточки рядом с source-прямоугольниками; стрелка source → piece (origin reference); если piece имеет `derivedReactionId` — стрелка piece → ромб. Material/virtual product различаются визуально (яркий vs пунктирный синий).

### 3.3 Sequence mode

Рендер той же зоны через `editor/zone-sequence-mode/`. Три состояния по готовности зоны:

- **А — пустота.** В зоне только sources без отобранных pieces. Подсказка «Выбери диапазоны на источниках» + список sources как доступных для отбора.
- **Б — палитра.** Pieces есть, но не упорядочены в сборку. Каждый piece — отдельной короткой лентой со своим цветом, в столбик.
- **В — собранная лента.** Pieces упорядочены (есть цепочка стыков). Горизонтальная лента: цветные piece-зоны подряд, стыки с пометкой метода (Gibson 30bp / overlap-PCR 20bp / RE BsaI), под лентой — overlay подобранных праймеров. На стыках без праймеров — placeholder «клик для подбора» → PcrModeShell (V71-V76).

### 3.4 Bidirectional sync graph ↔ sequence

Sequence-mode — **активный**, не пассивный рендер графа:

- Drag piece в ленту (состояние Б → В) → auto-создание ромбов reactions в graph (если `acquisitionMethod ≠ 'undefined'`).
- Удаление piece из ленты → удаление piece из зоны + удаление derived reaction.
- Изменение порядка piece в ленте → изменение порядка inputs в Gibson reaction (порядок значим).
- Клик на стык → PcrModeShell (та же дверь, что двойной клик на ромб PCR в graph).

### 3.5 Toggle между режимами

Хоткей `G` / `S` (Tab занят системой табов editor). Клик на toggle в углу зоны — также переключает. **Per zone**, не глобально (`zone.viewMode`).

### 3.6 Ветвление при N финалах

Если зона имеет N финальных products (висящих концов графа) — sequence-mode показывает ленту с ветвлением, не табы. Применимо к design variants (N разных reaction-узлов с varying input). При clone variants (1 reaction, N материализованных колоний) ветвление НЕ показывается — clone это meta на продукте (§2.5).

### 3.7 Четыре способа задать piece

Переход с уровня 1 (Source) на уровень 2 (Piece) — одним из четырёх способов; способ фиксируется в `piece.origin`.

- **А — выделение диапазона.** Двойной клик на source → контейнер-редактор → выделение региона в SequenceView → context-menu / хоткей `P` → `PieceCreateModal` (имя по умолчанию `{containerName}({start}-{end})`, опциональная функциональная метка). Piece: `origin='selection'`, `acquisitionMethod='undefined'`.
- **Б — клик по фиче.** Тот же редактор → клик на feature (CDS / promoter / terminator / marker) → context-menu «Отметить как кусок по этой фиче» → `PieceCreateModal` с pre-filled именем = `feature.name` и диапазоном = feature range. Piece: `origin='feature'`.
- **В — существующие праймеры.** `PiecePrimersPickModal`: список primer-entries проекта, биолог выбирает forward + reverse → программа ищет binding каждого в source, вычисляет ампликон, показывает preview. Piece: `origin='existing-primers'`, `acquisitionMethod='pcr'`, **автоматически создаётся ромб PCR** (T8).
- **Г — новые праймеры на источнике.** Редактор → выделение → context-menu «Написать праймер вперёд» (`Ctrl+R`) / «назад» (`Ctrl+Alt+R`) — V72-V74 → `PieceCreateModal` с pre-filled диапазоном между 5'-концами. Piece: `origin='new-primers'`, `acquisitionMethod='pcr'`; новые primer-entries создаются автоматически.

### 3.8 Контейнер-редактор

Layer-обёртка над `SequenceView`. Сам SequenceView не изменяется — Importer / Library Inspector / Annotator продолжают использовать его как read-only / scoped flow без operation toolbar.

**Точка входа** — двойной клик на материал-блок (узел канваса или запись в Tree). Единственная точка входа.

**Композиция:** header (name + tags + meta + `← Назад`) → SequenceView (все tracks/overlays/popups сохранены) → **operation toolbar** (ПЦР, Restriction, Мутагенез, Replace) → **inline operation popups** (PrimerFromSelection, PCR inline confirmation, Mutagenesis parameters — поверх SequenceView, не modal-stack).

**Расширенный SelectionContextMenu** (правый клик на выделении): existing — Copy fwd / Copy rev / Copy AA; new — «Создать праймер из выделения» / «PCR этого региона» / «Мутагенез выделения» / «Замена выделения» / «Найти ферменты в выделении». `← Назад` возвращает на канвас (принцип 1.9).

### 3.9 Импорт — точка входа внешних данных

Importer — фулскрин для парсинга **внешних** форматов в внутренние сущности (DEC-IMP-01). Library — **не** источник Importer'а (там уже внутренние данные).

**Три разделённые операции:**
- *Импорт в library* (`+ Импорт` в Library toolbar) → внешний файл/paste/`.bodge` → только library.
- *Импорт в проект* (`+ Импорт` в toolbar канваса) → канвас + автоматом library.
- *Добавить из library* (library picker, не Importer) → канвас как `library_clone`-копия.

**Три типа источника** (DEC-IMP-02): sequence-файл `.gb`/`.dna`/`.fasta` → 1 контейнер (`snapgene_parser.py` PRIMARY + BioPython fallback); paste sequence → 1 контейнер; cross-project `.bodge` → N контейнеров. URL (Addgene API) — отложено v0.7+ (CORS proxy + OAuth). Два контекста запуска (in-project / into-library) — единый компонент, prop `target`.

**Rich preview default** (DEC-IMP-05) — preview-step рендерит rich preview (`PlasmidMiniMap` + 3-section), не minimal text. **Wizard primer-step** (DEC-LIB-08) — при парсинге `.dna`, если найдены primer_bind features с прикреплённой sequence — extra step с checkbox-list найденных праймеров (default все ☑). НЕ silent auto-extract.

**Cross-project import.** Импорт контейнеров из второго `.bodge`: модалка с **read-only вью проекта-донора** (ZIP парсится в память модалки, не в store), multi-select контейнеров, preview-pane. **Flat import:** переносится контейнер целиком (baseSnapshot + все ContainerCommits + currentHash + ends + topology + name), новый UUIDv7, `origin.kind='cross_project_clone'`. Upstream-subgraph (родители, рёбра-reactions, primer usage) **НЕ переносится** — при reuse концевые праймеры обычно переписываются, subgraph-import — false economy. Duplicate-имена допускаются.

---

## 4. Persistence

### 4.1 Форматы: `.bodge` и `.bodgebox`

Два родных расширения:
- **`.bodge`** — весь проект (граф + N контейнеров + primers + library + manifest). ZIP-архив.
- **`.bodgebox`** — один контейнер (sequence + commits + provenance). Raw GenBank, не ZIP. Аналог SnapGene `.dna`, но открытый.

*Этимология:* «to bodge» — британский инженерный жаргон «слепить наспех из подручного». Самоироничное название — биолог склеивает плазмиды из того что под рукой. `.bodgebox` — «коробка с одним bodge».

**Обязательство обратной совместимости** (⚓ DEC-INTEROP-01). Оба формата построены на стандартном GenBank с опциональным провенанс-слоём в structured COMMENT block. Биолог без BodgeGene открывает `.bodgebox`, переименовав в `.gb`, или распаковывает `.bodge` как `.zip` — с потерей DAG/commits, но без потери sequence + features + per-container provenance. Graceful degradation, не lock-in.

### 4.2 Структура `.bodge` (ZIP)

```
project.bodge/
├── manifest.json         ← {fileFormatVersion, schemaVersion, appVersion, kind:'project'}
├── project.json          ← Project entity (id/name/tags/agent/refs, без sequence)
├── containers/<id>.gb     ← валидный GenBank + BodgeGene-Provenance COMMENT (§4.4)
├── projectCommits/<hash>.json  ← plain JSON — рёбра графа (reactions), параметры
├── primers/primers.json   ← plain JSON — primer pool + back-refs
├── library/library.json   ← plain JSON — LibraryEntry refs
├── refs/refs.json         ← plain JSON — «project/<id>/main» → containerId
└── renders/<id>.png       ← optional PNG/SVG previews
```

Никаких proprietary-полей в core data layer. Sequence + features + ContainerCommits — в `containers/<id>.gb` (GenBank + COMMENT-payload). Рёбра графа / metadata / primers / library — plain JSON. Переименование `.bodge` → `.zip` + extract = working multi-file backup. RO-Crate `ro-crate-metadata.json` — добавляется в v0.9 для FAIR-claims.

`.bodgebox` — бит-в-бит равен файлу `containers/<id>.gb` внутри `.bodge`, различие только в паковке. Reuse export pipeline 95%.

### 4.3 IndexedDB через Dexie.js

Рабочая копия проекта живёт в IndexedDB. Базовая структура таблиц (`dexie-schema.js`):

```javascript
db.stores({
  projects:         '++id, name, createdAt, updatedAt',
  containers:       '++id, projectId, kind, name, [projectId+kind]',
  containerCommits: '++id, containerId, parentId, createdAt, [containerId+createdAt]',
  projectCommits:   '++id, projectId, type, createdAt, [projectId+createdAt]',
  primers:          '++id, projectId, sequence, name, *tags, [projectId+sequence]',
  primerUsage:      '++id, primerId, containerId, [primerId+containerId]',
  library:          '++id, kind, *tags, [kind]',
  blobs:            'id',    // PNG renders
  refs:             'name'   // 'project/<id>/main' → containerId
  // + pieces, zones — добавлены four-tier (T1 / T3)
});
```

**Schema version и точные индексы** — авторитетно в коде `dexie-schema.js`. four-tier ввёл таблицы `pieces` и `zones` через schema bump (`DEC-CANVAS-4T-29` — backward-compat миграция). История миграций — в архиве four-tier-спеки (§7.2).

### 4.4 GenBank экспорт + provenance COMMENT block

Провенанс-слой — структурированный COMMENT-блок:

```
COMMENT     ##BodgeGene-Provenance-START##
            schema  :: https://bodgegene.dev/schema/v1
            format  :: base64-json
            payload :: eyJjb250YWluZXJJZCI6...
            ##BodgeGene-Provenance-END##
```

`payload` — base64-encoded JSON (из-за NCBI-ограничения COMMENT 80 символов; опциональный gzip при >50 KB). Содержит: `containerId`, `baseSnapshotHash`, `currentHash`, `topology`, `ends`, `origin`, `provenance`, `commits[]` (все ContainerCommits — даёт полный round-trip lineage), `primersEmbedded[]`.

**Custom GenBank qualifiers** (non-breaking, ignored другими tools): `/bodge_id=...` (stable feature ID), `/parent_feature=...` (sub-feature hierarchy), `/note=sequence:...` на `primer_bind` (SnapGene-симметричный primer attachment).

NCBI-blessed pattern — все парсеры (SnapGene, Geneious, ApE, BioPython) сохраняют COMMENT byte-for-byte. **External-edit detection:** если sequence правлена вне BodgeGene, recomputed hash не совпадёт с hash в payload — при re-import toast с выбором [Treat as new] / [Restore baseline]. Lineage никогда не восстанавливается молча.

### 4.5 Auto-save

Writes в IndexedDB — throttle 2s + debounce 5s; `dirty`-флаг в топбаре; `beforeunload` при `dirty`; BroadcastChannel для cross-tab; `navigator.locks` для эксклюзивных DB-writes. Полный lifecycle между сессиями — §5.6.

---

## 5. Distribution / Identity / Sync

Как BodgeGene распространяется, как понимается «пользователь», как `.bodge`-файлы живут между устройствами. Все решения секции — ⚓ immutable для v1.0.

### 5.1 Distribution model

Канонический способ — hosted web app + open-source self-host.

| Path | Аудитория | Status v1.0 |
|------|----------|-------------|
| Hosted web app (`bodgegene.dev`) | casual users, студенты | Primary |
| Open-source repo + self-host | academic labs, privacy-focused | Supported |
| PWA installable (offline-capable) | power users, lab desktops | Built-in |
| Desktop app (Tauri .exe/.dmg/.AppImage) | regulatory environments | Отложен v1.5+ |

Хостинг — Cloudflare Pages / Vercel / Netlify (static SPA + IndexedDB, free-tier достаточен). Self-host: `git clone` → `npm ci && npm run build` → деплой `dist/`. Backend (FastAPI + BioPython) — **opt-in**: фронтенд работает в degraded mode без него. PWA (manifest, service worker, offline-кэш) — с v0.6. **НЕ делаем:** App/Play Store, Snap/Flatpak/AUR, Docker для фронтенда.

### 5.2 Identity = label, не account

BodgeGene не имеет понятия «user account». Identity — label для commit attribution, не единица security/permissions. Поля `name` / `email` в Settings, хранятся в **localStorage** (`appPreferences.agent`), не в `.bodge`. Используются как `commit.author` при любом commit. Несколько agents в одном файле — норма (передали файл коллеге → его commits с его label). Файл — единственный источник правды. **НЕ делаем:** регистрацию, auth-backend (OAuth/JWT/sessions), verified-signatures, public profiles / shared links, «Sign in with Google/GitHub».

### 5.3 Sync model: manual + cloud-folder + Drive API hybrid

`.bodge` живёт между устройствами через три параллельных механизма, ни один не требует BodgeGene-серверов:

1. **Manual file transfer.** `.bodge` — файл: email, USB, мессенджер. Fundamental способ, работает всегда.
2. **Cloud-folder через File System Access API.** `.bodge` в sync-папке Drive Desktop / Dropbox / OneDrive синкается провайдером. Для нас это просто локальная папка.
3. **Active Google Drive API.** Кнопки «Open/Save to Google Drive» — convenience для Drive-users, opt-in (OAuth при первом использовании). Дополняет уровень 2, не замещает.

**Conflict resolution — manual.** При параллельном редактировании провайдер создаёт conflicted-copy; user решает сам. **Auto-merge — нет в v1.0** (Merkle-DAG union возможен — research v1.5+). **НЕ делаем:** built-in sync server, real-time collab (CRDT/OT/WebRTC), sharing links, server-side version control.

### 5.4 Backend stateless

Backend — stateless calculation service: FastAPI endpoints для парсинга `.dna` (`snapgene_parser.py`) + BioPython-операции. Никакого user-state, database, sessions. Horizontally scalable, деплой через serverless, близкая к нулю стоимость, нет GDPR-обязательств. BodgeGene Hub (registry shared library) и account-based sync — возможны в v2.0+, это major version bump.

### 5.5 Архитектурные следствия

`agent` — label, не identity (никаких permission checks). `.bodge` — единственный источник правды (никаких «проектов на сервере»). Три уровня хранения: localStorage — UI, IndexedDB — projects, `.bodge` ZIP — transfer. File System Access API — first-class для Chrome/Edge, fallback для Safari/Firefox. PWA-first. Conflict resolution — ответственность user'а.

### 5.6 Project lifecycle (между сессиями)

Семантика — ⚓ immutable для v1.0.

**Три уровня состояния.** (A) Persistent — IndexedDB (рабочая копия, continuous autosave) + `.bodge` на диске (явно сохранённая версия); их расхождение = `dirty`. (B) In-memory Zustand — UI state, drafts, undo stack, domain state из IndexedDB. (C) UI flash — hover/focus, не персистится. **Главный принцип:** IndexedDB — невидимый continuous autosave; «Save» в UI — только про `.bodge`-файл.

**Lifecycle-поля Project** (в IndexedDB, НЕ в `.bodge`): `fileHandle?` (FileSystemFileHandle, Chrome/Edge), `fileName?`, `lastSavedToFileAt?`, `lastModifiedInIndexedDBAt`, `fileLastKnownModified?` (conflict detect), `cleanShutdown?` (crash detect). `dirty` derive: `lastModifiedInIndexedDBAt > lastSavedToFileAt || !fileHandle`.

**Open project — три пути:** (A) Новый — новый Project в IndexedDB, без disk-binding, «Untitled (unsaved)». (B) Открыть `.bodge` — file picker, ZIP в IndexedDB; если Project с таким id уже есть — диалог выбора (file wins / IndexedDB wins / cancel), никогда не перезаписываем молча. (C) Recent — из IndexedDB напрямую; если `fileHandle` есть — восстановление permission через `queryPermission`.

**Save в файл** — explicit (Cmd/Ctrl+S, меню, «Save As»). Если `fileHandle` ok и `lastModified` расходится с `fileLastKnownModified` (файл изменён извне) — warning перед write. **Auto-save в файл — НЕТ.** Mental model: файл = что я сохранил; рабочая копия = что в браузере, не теряется.

**Crash recovery** — IndexedDB transactions atomic; throttle 2-5s → потеря максимум 5s; при `cleanShutdown !== true` при старте — восстановление из IndexedDB + toast. **Multi-tab** — блокируется в v0.6 через `navigator.locks` (exclusive lock на projectId; вторая вкладка — экран «Перенять контроль»; пересмотр в v0.8+). **Conflict detection** при save — проверка `lastModified` перед write, не continuous polling. **Stale handle** — re-prompt permission + баннер в UI.

---

## 6. Zustand slices

Правило — один slice на сущность (`DEC-CANVAS-4T-27`). Шейпы сущностей — в §2; здесь — назначение slice'ов.

**Слайсы четырёхуровневого ядра:**
- `containers` — `{[id]: MoleculeContainer}` + `containerCommits` + memoized replay-snapshots.
- `pieces` — `{[id]: Piece}` (уровень 2, спринт T1).
- `operations` — `{[id]: Reaction}` (эволюция `projectCommitSlice` из v2; рёбра графа).
- `zones` — `{[id]: Zone}` (спринт T3).

**Поддерживающие slice'ы:**
- `project` — `currentProjectId`, `projects`, `recentProjectIds` + lifecycle-state (`fileHandle`, `dirty`, `saveStatus`, `cleanShutdown`, multi-tab lock — §5.6).
- `library` — `{[id]: LibraryEntry}` + фильтры (kind / топология).
- `primers` — `{[id]: Primer}` + computed usage back-refs.
- `canvas` — UI-state канваса (viewport, selection); НЕ undoable.
- `ui` — modals, theme; НЕ undoable.

**Legacy-двойник (техдолг).** Параллельно с operations-системой живёт легаси `assemblyDrafts` (+ `assembly-primer-utils.js`). Две primer/assembly-системы сосуществуют: op-groups + `primer-derive.js` (новая) vs `assemblyDrafts` + `assembly-primer-utils.js` (легаси). Cross-boundary баги между ними — известный класс проблем; консолидация — в техдолге.

**Undo policy.** Domain-slice'ы (containers / pieces / operations / zones / project / library / primers) — undoable. UI-slice'ы (canvas / ui) — нет. Undo откатывает Zustand-state, но **не удаляет commits из IndexedDB** (append-only): при undo визуальный откат, при следующей операции — форк (новый commit с пропуском отменённого).

---

## 7. Roadmap

Стратегические вехи к v1.0 — по порядку версий, без календарных оценок. Тактический бэклог (спринты, баги, ближайшие задачи) — в `docs/BACKLOG.md`; эта секция — только высокоуровневая траектория.

### 7.1 Где проект сейчас (v0.8.x-alpha)

Линия v0.6-v0.8 заложила:
- **Persistence + interop** — `.bodge`/`.bodgebox`, IndexedDB/Dexie, GenBank-экспорт с provenance-COMMENT.
- **Importer** — 3 формата (`.dna`/`.gb`/`.fasta`), rich preview, primer-step.
- **Контейнер-модель** — ContainerCommits, replay, Snapshot, редактирование последовательности/аннотаций.
- **Четырёхуровневый канвас** (спринты T1-T10) — зоны-фреймы, pieces, reactions, products, dual-mode graph/sequence, 3-lane auto-layout, четыре способа задать piece.

*Путь разошёлся с изначальным планом.* v2 (29.04) планировал линейный M-A..M-I (Importer → Container Window → Mix Workspace → Library). После canvas-kickoff (11.05) и four-tier-модели (16.05) разработка перешла на canvas-центричную серию F1-F4 + T1-T10. Исходные майлстоуны M-A..M-I как список устарели; результаты — выше.

### 7.2 К v0.9 — завершение операций + interop

- **Оставшиеся reaction-классы и post-MVP-элементы four-tier:** recombinase (Gateway / Cre-loxP), construct table, matrix expansion, Sanger-таблица полной глубины, primer pool.
- **Interop для статьи:** RO-Crate export, SBOL3 export (basic, за feature-flag), GenBank round-trip validation suite (набор плазмид).
- **Performance:** replay-бюджет на проектах >1000 commits; измерить snapshot frequency на реальных данных.
- **Документация:** user guide.
- **техдолг:** консолидация dual primer/assembly-системы (§6), Wallace→SantaLucia в `primer-derive.js`.

### 7.3 v1.0 — public release

- Bioinformatics Application Note submission («format-compatible plasmid editor with graph-of-operations data model for verifiable cloning *design* provenance»).
- JOSS submission.
- Публичное demo + блог-пост.
- UX-research сессия — один beta-user (academic lab).

### 7.4 За v1.0

- **Group projects** — мультитим в одном `.bodge` (DEC-V2-29).
- **Desktop app** — Tauri, v1.5+.
- **BodgeGene Hub** — registry shared library entries; opt-in account-based sync. v2.0+, major version bump.

---

## 8. Переиспользование / перепись / kill

Архитектурный уровень. Покомпонентная детализация (кто именно harvest / kill / DEAD) — в `docs/COMPONENT_MAP.md`, не дублируется здесь.

**Переиспользуется без изменений:**
- *Backend* — `snapgene_parser.py` (PRIMARY `.dna`), BioPython, FastAPI endpoints, pytest-сьют.
- *Algorithm core* (корень `gui/designer/src/`) — `tm-calculator.js` (SantaLucia NN), `golden-gate.js`, `restriction-db.js`, `local-primer-design.js`, `mutagenesis.js`, `orf-detection.js`, `validate.js`, `annotation-model.js`, `auto-annotate.js`. Это v0.5-legacy codebase в смысле алгоритмов, не superseded UI — переиспользуется целиком.
- *Данные* — `common-features.json` (~419 verified), `feature-palette.js` (⚓ цветовой контракт).
- *Visualization* — `SequenceView/` (universal viewer), `Annotator/`, `PlasmidMiniMap`.

**Переписывается / новое:** слайсы store (§6), persistence layer (Dexie), app shell + навигация, `.bodge` import/export, provenance COMMENT-блок, канвас с зонами, контейнер-редактор-обёртка.

**Kill:** `assemblies` slice (нет AssemblyContainer как класса), superseded UI v0.5 (старые QuickStart, 3LEVELS-era компоненты, UI-оболочки легаси-визардов — алгоритмы из них harvested). Важно: superseded UI (старые версии компонентов после rewrite) — не то же что v0.5 algorithm core; первое kill'ится, второе живёт.

---

## 9. Что НЕ делаем

Закрытые решения, попыток нет.

**Data model / архитектура:**
- **CRDT для real-time collab.** Биология не sequence-CRDT-friendly, single-user dominant. Если когда-нибудь collab — Linear-style server total order, не CRDT.
- **3-way merge как в Git.** Нет биологической семантики. Conflict resolution = явная новая операция.
- **AssemblyContainer как отдельный класс.** Сборка = ребро графа (Reaction), не сущность (⚓ DEC-V2-02).
- **Lazy commits.** Всегда `commits: []`, не null.
- **Адаптерный слой между v0.5 и v0.6 моделями.** Wipe data, чистый rewrite.
- **Chain-of-pairwise-edges для multi-fragment assembly.** Hyperedge правильно (один Reaction с N inputs).
- **Library как 3-tier ownership** (project-local / shared / catalog). Flat personal collection вне проектов (⚓ DEC-LIB-01). Sharing / promote — отвергнуто вместе с этим.
- **Features browser в Library** как отдельный tier (DEC-LIB-04). **Folder hierarchy в Library** — только flat tagging (DEC-LIB-09).
- **SBOL3 как нативный формат хранения.** Overhead RDF; SBOL3 — только export (secondary, v0.9+).
- **Декодирование SnapGene history blocks** (типы 7, 11). Закрытый формат, ничтожный ROI.
- **Auto-extract праймеров из `.dna` без подтверждения** (DEC-LIB-08). Wizard-step с checkbox-list.

**Distribution / Identity / Sync:** встроенный sync server; user accounts; real-time collaboration (OT/CRDT/WebRTC); sharing links; server-side mirror проектов; auto-merge `.bodge` в v1.0; mobile / responsive < 1024px; App/Play Store.

---

## 10. Глоссарий

Слияние глоссариев трёх исходных доков, дедуплицировано; термины four-tier-модели — текущие.

| Термин | Значение |
|--------|----------|
| **Project** | Корневой объект файла `.bodge`. Содержит containers, reactions, primers, library. |
| **Source / Контейнер / MoleculeContainer** | Уровень 1. Существующая ДНК (плазмида / oligo / gBlock / материализованный продукт). Единственный класс молекул, флаг `kind`. |
| **Piece / Кусок** | Уровень 2. Именованный логический отбор участка. План, не физическая ДНК. |
| **Source-piece / Derived-piece** | Piece с одним sourceId (выделение) / с N sourceIds (выход OV_PCR и подобных). |
| **Reaction / operation** | Уровень 3. Ромб на канвасе, метод получения/соединения piece. «ProjectCommit» — старое имя (v2). |
| **Product / Продукт** | Уровень 4. Выход reaction, всегда derived. Virtual (пунктир) → Materialized (яркий синий). |
| **Clone variant** | Одна reaction, N материализованных колоний (`cloneNumber`). Не отдельные финалы. |
| **Design variant** | N reaction-узлов с varying inputs. Отдельные финалы зоны (ветвление). |
| **Zone / Зона** | Фрейм на канвасе (как Miro). Резиновый, mutable, имеет `viewMode`. |
| **Loose node** | Узел с `zoneId=null`. Backward-compat для старых проектов. |
| **Graph mode / Sequence mode** | Два режима рендера зоны. Graph — узлы+ромбы+стыки. Sequence — лента piece-зон. Per-zone toggle `G`/`S`. |
| **Palette / Assembled state** | Состояния sequence-mode: pieces не упорядочены (столбик) / упорядочены (горизонтальная лента). |
| **acquisitionMethod** | Свойство piece — как биолог собирается получить его физически. Drives auto-creation reactions. |
| **materializedFrom** | Поле на `container.kind='derived_product'` — reaction-источник + cloneNumber. |
| **ContainerCommit** | Правка ВНУТРИ контейнера (substitution / insertion / mutagenesis / annotation_edit / …). Не создаёт новый контейнер. |
| **Origin** | Immutable discriminated union: откуда взялся контейнер/primer. |
| **Provenance** | Mutable metadata «где/когда создан в workflows». Отдельно от origin. |
| **Ends / Overhang / Sticky / Blunt** | Концы linear-контейнера (null для circular). Overhang — однонитевой выступ; sticky — несёт overhang; blunt — тупой. |
| **Snapshot / Replay / Frozen snapshot** | Immutable content-hashed состояние контейнера / применение всех ContainerCommits к baseSnapshot / cached snapshot каждые ~20 commits. |
| **Frozen-on-use** | ⚓ DEC-MUTABILITY-FREEZE-ON-USE-01. Контейнер/piece замораживается, как только от него зависит downstream-работа. |
| **Hyperedge** | Reaction с N inputs / M outputs. Один Activity-узел в PROV-O. |
| **Stitch / Стык** | Junction между piece-piece. Имеет метод (Gibson / overlap / RE / GG / KLD / ligation / blunt / sticky). |
| **ReactionParams** | Параметры reaction по kind (enzyme, homologyLength, overhangs, splitMode, …). |
| **Library / LibraryEntry** | Личная flat-коллекция контейнеров и праймеров вне проектов (⚓ DEC-LIB-01) / запись в ней (kind `container`/`primer`). |
| **Clone-on-import** | Создание контейнера из Library-entry: новый UUIDv7 + `origin: library_clone`. Изменения в копии не влияют на источник. |
| **PrimerUsage** | Computed back-reference: на контейнере видны праймеры, на праймере — где используется. |
| **PROV-O / RO-Crate** | W3C Provenance Ontology (vocabulary, не RDF storage) / Research Object packaging spec (v0.9+ для FAIR). |
| **`.bodge` / `.bodgebox`** | Родные форматы: проект (ZIP) / один контейнер (raw GenBank). |
| **BodgeGene-Provenance COMMENT** | Structured COMMENT-блок в GenBank с base64-JSON (commits / origin / provenance). NCBI-blessed, сохраняется другими tools byte-for-byte. |
| **External-edit detection** | Расхождение recomputed hash с hash в payload при re-import → toast [Treat as new] / [Restore baseline]. |
| **Cross-project import** | Импорт контейнеров из другого `.bodge` через модалку с read-only вью донора. Flat import, `origin: cross_project_clone`. |
| **Контейнер-редактор** | Layer-обёртка над SequenceView с operation toolbar. Вход — двойной клик на материал-блок. |
| **agent** | `{name, email}` — label для commit attribution, не account, без auth/permissions. |

---

## 11. Открытые архитектурные вопросы

Разрешённые four-tier-моделью вопросы убраны. Остались генуинно открытые:

**Ближайшие (измерить / решить на v0.7-v0.9):**
- Snapshot frequency N — измерить на реальных проектах (сейчас N=20 эмпирически).
- Hot/cold split commits в IndexedDB для проектов >1000 commits.
- Failed experiments на канвасе — greyed-out vs hidden (`reaction.status='failed'`).
- Визуализация концов на канвасе — текстовые пометки vs tongue-формы как в учебниках.
- Multi-tab sync через BroadcastChannel — пересмотр запрета v0.6 (сейчас блокируется) — если будет реальный use case.

**Отложено (v1.5+ / v2.0+):**
- OPFS migration для blobs.
- Auto-save в файл (Google-Docs style) — closed-no для v1.0, может пересмотреться по user feedback.
- Sequencing-verify как reaction; transformation / strain context (§2.10 «не моделируем»).
- Combinatorial / parametric design (SBOL3 `CombinatorialDerivation`).
- Auto-merge `.bodge` через Merkle-DAG union — research direction.

---

*Источники слияния (27.05.2026, шаг S2 консолидации `docs/`): `ARCHITECTURE_v2.md`, `ARCHITECTURE_CANVAS_MODEL.md`, `SPEC_M-CANVAS-FOUR-TIER-ARCHITECTURE.md` — все перенесены в `docs/archive/`.*
