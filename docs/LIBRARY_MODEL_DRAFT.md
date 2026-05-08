# Library model — draft новой модели после сессии 08.05.2026

> **Статус:** draft, согласован на уровне mental model в сессии Igor ↔ Chat 08.05.2026. Ещё не зафиксирован как ⚓, не реализован в коде. Следующие шаги: простой wireframe-макет в новой сессии → дизайнер → нормальный HTML → спека реализации (M-X.7+).
>
> **Назначение.** Этот документ — единый source-of-truth для будущей перестройки Library. Заменяет рабочую модель из ARCHITECTURE_v2 §2.7 (DEC-LIB-01..17) после реализации. До реализации — старая модель остаётся в силе.
>
> **Что в этом документе:** концептуальная модель + структура дерева + правила для каждой зоны + revision требований к существующим ⚓ + open questions + scope разбиения на спринты.
>
> **Что НЕ в этом документе:** UI-макет (отдельная сессия), спека реализации (после макета), миграция данных существующих entries (часть спеки).

---

## 0. TL;DR

Library — твоя личная файловая система внутри BodgeGene. Три зоны с разными правилами:

1. **Свободная зона** — папки и контейнеры без проектной привязки. Drag/drop, rename, delete, create-folder. Аналог OS file manager.
2. **`.bodge` папки** — ZIP-архивы проектов с прибитой внутренней структурой. Read-only browse внутри (DAG / контейнеры / праймеры). Edit только через «открыть как активный проект» либо явные операции (склонировать container в свободную зону, скопировать primer в лабпул).
3. **Лабораторный пул primer'ов** — общий root-level раздел primer'ов которые физически есть у биолога в морозильнике. Привязан к проектам через PrimerUsage back-references (DEC-LIB-07).

Один и тот же `.bodge` отображается как папка-архив. Содержимое: DAG проекта (граф операций), плоский list контейнеров (только то что биолог *притащил* в проект — без результатов реакций), праймеры этого проекта.

**Ключевой принцип.** Library не отдельная коллекция «вне проектов» (старая DEC-LIB-01), а unified projection всего что у биолога лежит в IndexedDB, с двумя разными типами «единиц хранения» — свободные зоны (freely manipulable) и `.bodge` архивы (frozen structure). Это аналог OS file manager со ZIP'ами: ZIP можно распаковать в файловую систему, но пока он ZIP — внутри его не drag'аешь.

---

## 1. Принципы

**1.1 Свободная зона = full ФС-семантика.** В зоне `⚐ Без проекта` биолог свободно создаёт папки, перетаскивает items, переименовывает, удаляет. Никаких ограничений сверх «уникальные имена в одной папке». Аналог `~/SnapGene Files/` или Documents folder в OS.

**1.2 `.bodge` = прибитая структура, read-only browse.** Открыл `.bodge` (создал новый или импортировал старый) — в Library появляется папка `📦 ProjectName.bodge` с **фиксированной** внутренней структурой: `🔀 DAG` + `📥 Контейнеры` + `🧬 Праймеры этого .bodge`. Эту структуру нельзя переименовать, удалить, создать дополнительные подпапки. Items внутри read-only browse — нельзя drag, нельзя rename inline.

**1.3 Container = модель молекулы (не physical inventory).** Контейнер представляет цифровую запись о молекуле ДНК. Один и тот же container в моей библиотеке либо в чужом `.bodge` — одинаковая запись, разные origin. Биологически — у меня молекулы либо есть в морозильнике, либо нет. Это знание не отражается в data model. **Снимает 3-tier ownership** (DEC-LIB-01 ⚓ extends, не supersede — личная коллекция остаётся, просто структурируется иначе).

**1.4 Primer = physical inventory.** Это другой тип объекта, отличающийся от container. Primer можно «знать про него» (увидел в чьём-то `.bodge`) и при этом не иметь в трубке. Lab pool отражает «что физически у меня есть в морозильнике» — boolean флаг `inLabStock` либо отдельный pool. Это **legitimate ownership-уровень** для primer'ов, в отличие от containers.

**1.5 Импортируемые `.bodge` — read-only.** Чужой `.bodge` (или свой старый закрытый) импортируется в Library как read-only папка. DAG view открывается в read-only режиме. Контейнеры можно только клонировать (cross-project_clone) в свободную зону или активный проект, не редактировать. Чтобы редактировать — explicit «Open as active project» (= переход в обычный edit mode, тот же `.bodge` становится активным; принцип «один активный проект в один момент» из §5.6.8 ARCHITECTURE_v2).

**1.6 Cross-project copy = immutable copy с lineage trace.** При клонировании container'а из чужого `.bodge` в активный проект — создаётся **новый MoleculeContainer** с `origin: cross_project_clone` (immutable), хранящий sourceProjectId / sourceProjectName / sourceContainerId / sourceContainerHash / clonedAt. **Никакого forward-sync.** Если оригинал в Library entry потом меняется — копия не знает. Это закрывает класс «магических» surprises.

**1.7 Завершение проекта = явное действие.** «Сохранить container в Library» — explicit жест биолога на любом узле DAG (final, промежуточный, ПЦР-продукт, что угодно). Не автоматическое событие при close проекта. Это обеспечивает DEC-LIB-13 (annotations mutable через explicit save flow) расширенным образом — все Library-promotions явные.

**1.8 Lineage trail глубины N.** Контейнер несёт chain of origin'ов: `←` склонирован из Library / ChitinaseExpr / pET28b-Chit (на момент 06.05) `←` который сам склонирован из catalog Demo / pET28b. Trail рендерится в Inspector выбранного контейнера, не на узле DAG (узел и так несёт name + topology + ends, дополнительный badge сделает узел шумным).

**1.9 Manual-edit маркер.** Контейнер изменённый руками без cloning operation несёт `manualEditFlag: true` на entry-уровне (DEC-LIB-K10-MANUAL-BRANCH-01). Видно с первого взгляда в tree node — иконка `✎` рядом с именем. Дополнительно живёт в viewer и annotator inspector (как переиспользуемые tool-проекции, не только в Library).

**1.10 Lab pool primer'ов — opt-in.** Primer попадает в lab pool через explicit toggle `❄️ В лабораторию` на entry. Не silent auto-promote из проектных импортов. Снимается тем же toggle'ом — primer entry остаётся, флаг `inLabStock` снимается.

---

## 2. Структура Library tree

```
LIBRARY (root, твоя личная ФС)
│
├── ⚐ Без проекта                              ← свободная зона, full ФС-семантика
│   │                                            biolog freely creates/renames/moves
│   ├── 📁 Backbones (создана биологом)
│   │   ├── pUC19          [↑ загружен из pUC19.gb]
│   │   └── pET28b         [↑ загружен из catalog Demo / pET28b]
│   ├── 📁 Inserts
│   │   └── insert.gb      [↑ загружен]
│   └── pHDR-pepA          [↑ загружен]      ← items могут лежать в root зоны без папки
│
├── 📦 ChitinaseExpr.bodge                     ← активный либо ранее открытый проект
│   ├── 🔀 DAG                                   read-only browse + явные операции
│   │     (граф операций; в нём видны все
│   │      узлы включая результаты PCR/Gibson)
│   ├── 📥 Контейнеры                          ← плоский list того что биолог
│   │   │                                        притащил в проект (без results!)
│   │   ├── pET28b           [↑ из Library / pET28b]
│   │   ├── insert.gb        [↑ из insert.gb]
│   │   └── pUC19-borrowed   [🔗 из QuickTest.bodge]
│   └── 🧬 Праймеры этого .bodge
│       ├── M13F            [↑ из insert.dna primer-step]
│       └── Q158R-fwd       [✎ designed]
│
├── 📦 BorrowedProject.bodge (read-only)       ← чужой импортированный проект
│   ├── 🔀 DAG (read-only)                       либо «Open as active»
│   ├── 📥 Контейнеры
│   │   └── pUC19-test       [↑]
│   └── 🧬 Праймеры
│       └── ...
│
└── 🧬 Лабораторный пул primer'ов              ← общий root-level, opt-in promotion
    │                                            primer entry физически в одном
    │                                            месте; usage в проектах через
    │                                            PrimerUsage back-refs
    ├── M13F-stock          [used in 8 projects]
    ├── T7-rev-stock        [universal]
    └── Q158R-fwd           [Lab — used in ChitinaseExpr]
```

### 2.1 Иконки origin (видно с первого взгляда)

| Иконка | Origin kind                          | Семантика                                     |
|--------|--------------------------------------|-----------------------------------------------|
| `↑`    | `file_import` / `paste` / `catalog` / `demo_category` | Загружен извне |
| `✎`    | `manual_edit`                        | Правил руками без биологической операции     |
| `🔗`   | `cross_project_clone`                | Импортирован из другого `.bodge`             |
| `✦`    | `project_commit` (PCR/Gibson result) | Результат cloning operation в DAG (видно только в DAG view, в плоском list `📥 Контейнеры` НЕ показывается) |

### 2.2 Что НЕ в плоском list `📥 Контейнеры`

Контейнеры-результаты cloning operations (PCR-linear, pET28b-Chit Gibson product) физически живут в `containers/<id>.gb` внутри `.bodge` ZIP, но семантически они в **графе операций**. Их место — в DAG view. Плоский list = «что я в этот проект притащил/положил, без результатов реакций».

Это позволяет биологу при export `.gb` из `📥 Контейнеры` явно получить **только импортированные/исходные** молекулы, без полупроцессных результатов. Хотя если он хочет — открывает DAG, экспортирует оттуда любую молекулу.

---

## 3. Точки входа (как наполняется Library)

### 3.1 Из вне Library → Library

**`+ Add` button (амбер primary, tree-toolbar).** Единый entry с источниками:
- File (drag-drop / picker) — `.bodge` / `.bodgebox` / `.gb` / `.dna` / `.fasta`
- Paste sequence (textarea + format detection)
- BodgeGene catalog (curated 7 категорий + SnapGene 19 категорий)
- Из другого `.bodge` (cross-project import wizard)

После выбора источника — стандартный preview wizard (DEC-IMP-13 reuse) → confirm → entry попадает в **target zone**:

| Источник                          | Default target                        | Можно изменить?                   |
|-----------------------------------|---------------------------------------|-----------------------------------|
| File `.bodge`                     | Library root (новая `📦` папка)      | Нет                               |
| File `.bodgebox` / `.gb` / `.dna` / `.fasta` | Если активный проект — `📥 Контейнеры` его папки; иначе — `⚐ Без проекта` | Да, биолог может выбрать «положить в Loose даже если есть активный проект» |
| Paste sequence                    | Тот же что file                      | Да                                |
| Catalog item                      | `⚐ Без проекта` (по default)        | Да, можно в активный проект      |
| Cross-project copy                | Активный проект `📥 Контейнеры`      | Только если есть активный проект |

### 3.2 Из активного DAG → Library

**Context-action `📚 Save to library` на любом узле DAG.** Доступно на final, промежуточный, ПЦР-продукт — любом контейнере. После клика — модал с выбором target:
- В `📥 Контейнеры` этого же `.bodge` (default — semantically correct, container уже есть в проекте, просто становится visible в плоском list);
- В `⚐ Без проекта` (если биолог хочет «вытащить» container в свободную зону для использования в других проектах).

«Mark as completed → save outputs» **глобальное действие на проекте** — отвергнуто (см. open question Q1 в §6 — может вернуться в полировке).

### 3.3 Внутри Library (между зонами)

**Drag из `📥 Контейнеры` `.bodge` в `⚐ Без проекта`** — explicit copy (не move). Создаётся новый entry в Loose с `origin: cross_project_clone` (если из чужого `.bodge`) либо с `origin: project_extract` (новый kind, если из активного `.bodge`). Container внутри `.bodge` остаётся.

**Drag между папками `⚐ Без проекта`** — move (rename folder path в `tags` array, DEC-CAT-04 folder-as-slash-path).

**Drag из `🧬 Праймеры` `.bodge` в `🧬 Лабораторный пул`** — promotion в lab. Primer entry получает `inLabStock: true`, появляется в lab pool. **Не дубликат** — одна entry, два места отображения.

**Drag из `🧬 Лабораторный пул` в `⚐ Без проекта`** — НЕТ. Lab pool primer'ов отдельная единица, в свободную зону primer'ы не уходят (они везде primer'ы, не container'ы).

---

## 4. Правила по зонам

### 4.1 `⚐ Без проекта` (свободная зона)

- Items: `MoleculeContainer` entries без проектной привязки.
- Структура: папки (через `tags: ['Folder/Subfolder']` slash-paths, DEC-CAT-04). Hierarchy любой глубины (visual cap MAX_INDENT_DEPTH = 5).
- Operations: create folder, rename folder, move items between folders, rename item, delete item, drag items внутри зоны, drag-out в активный `.bodge` (clone).
- Frozen sequence (DEC-LIB-05) — да, sequence заморожен. Edit только через manual-edit branching (DEC-LIB-12) — создаёт новый entry с `origin: manual_edit` + parent reference.

### 4.2 `📦 ProjectName.bodge` (ZIP-папка)

#### 4.2.1 Активный `.bodge`

Это `.bodge` который сейчас открыт как активный проект (один в один момент, §5.6.8 ARCHITECTURE_v2).

- `🔀 DAG` sub-row → клик открывает **обычный** DAG fullscreen (через app-topbar / breadcrumb тоже доступен — это duplicate access).
- `📥 Контейнеры` плоский list:
  - Read-only browse в Library tree (нельзя rename inline, нельзя drag-rearrange — порядок определяется временем добавления в DAG).
  - Click на item → открывает Container Window для этого контейнера (как в DAG node click).
  - Context-action: «Извлечь в свободную зону» (clone-out в `⚐ Без проекта`), «Удалить из проекта» (= удалить узел из DAG со всеми связями, confirm dialog).
- `🧬 Праймеры этого .bodge` плоский list:
  - Read-only browse.
  - Click на primer → preview в Inspector (sequence, Tm, GC, usage в проекте).
  - Context-action: «В лабораторию» (promote в Lab pool через `inLabStock: true`).

#### 4.2.2 Импортированный (не активный) `.bodge` — read-only

Это чужой `.bodge` либо свой старый закрытый, импортированный через `+ Add → File (.bodge)`.

- Папка визуально маркируется (другой фон / `(read-only)` suffix к имени / lock icon).
- `🔀 DAG` sub-row → клик открывает **read-only DAG view** (тот же DagView компонент с `readOnly: true`, §3.4 ARCHITECTURE_v2).
- `📥 Контейнеры` плоский list:
  - Click на item → Container Window в read-only режиме.
  - Context-action: **«Скопировать в активный проект»** (cross-project_clone в `📥 Контейнеры` активного `.bodge`); **«Скопировать в свободную зону»** (cross-project_clone в `⚐ Без проекта`).
  - Context-action: **«Открыть как активный проект»** (= switch active project; текущий активный либо закрывается с warning'ом если dirty, либо просто становится не-активным; новый становится активным с edit-rights).
- `🧬 Праймеры` плоский list:
  - Click → preview, без edit.
  - Context-action: «Скопировать в Lab pool» (= cross-project_copy primer'а в `🧬 Лабораторный пул` с `inLabStock: false` по default; биолог отдельно promote'ит когда реально закажет/найдёт).

### 4.3 `🧬 Лабораторный пул` (общий root)

- Items: Primer entries с `inLabStock: true`.
- Структура: плоский list (без папок в v0.6, может усложниться в v0.9+).
- Operations: rename, edit (Tm/GC/notes), delete, toggle `inLabStock` обратно (демоция).
- При sequence match с primer'ом из чужого `.bodge` — UI подсвечивает: «Совпадает с твоим M13F-stock в лаборатории». Биолог сам решает merge'ить через explicit «attach to existing» action (без silent auto-merge).
- Cross-project primer попадает в **отдельную root-секцию** (или sub-секцию `🧬 Лабораторный пул / 📚 Из чужих проектов`) с `inLabStock: false` по default.

```
🧬 Лабораторный пул
├── ❄️ В лаборатории (inLabStock: true)
│   ├── M13F-stock
│   └── T7-rev-stock
└── 📚 Из чужих проектов (inLabStock: false)
    └── someone-elses-primer    [🔗 из BorrowedProject.bodge]
```

---

## 5. Data model adjustments

### 5.1 LibraryEntry simplification

Решение по «(a) убить wrapper, метаданные на ресурсах самих» vs «(b) сохранить wrapper как override layer» — **отложено в имплементационную спеку**. Принципиально влияет на migration scope и на семантику «entry в нескольких местах одновременно».

Гипотеза по умолчанию (для wireframe): **(b)** — сохраняем LibraryEntry как thin wrapper, потому что нужен слой «отображение в tree» отдельно от «сам ресурс»: container может быть в `📥 Контейнеры` активного `.bodge` И в `⚐ Без проекта` (если биолог его «извлёк») как два разных entries с разными origin, но один и тот же ресурс.

**Изменения в LibraryEntry:**
```typescript
interface LibraryEntry {
  id: UUID;
  kind: 'container' | 'primer';
  resourceId: UUID;
  resourceHash: string;
  name: string;
  tags: string[];                 // включая folder-paths (DEC-CAT-04)
  addedAt: ISO8601;

  // НОВОЕ:
  zone: 'loose' | 'project' | 'lab_pool';   // в какой зоне Library
  projectId?: UUID;               // обязательно если zone='project', null иначе
  inLabStock?: boolean;           // только для kind='primer', актуален только при zone='lab_pool'
  manualEditFlag?: boolean;       // DEC-LIB-K10
  parentEntryId?: UUID;           // если entry — manual-edit branch или cross-project copy
  parentEntryHash?: string;       // snapshot момента clone'а

  ext: object;
}
```

### 5.2 Project ↔ Library projection

Папка-проект `📦 ProjectName.bodge` в Library — это **derived view** над Project entity в IndexedDB. Не отдельная сущность.

```
Project (IndexedDB) ←→ Library projection
- containerIds[]    →  📥 Контейнеры (через `LibraryEntry where projectId=X and kind='container'`)
- primerIds[]       →  🧬 Праймеры (через `LibraryEntry where projectId=X and kind='primer'`)
- projectCommitIds[]→  🔀 DAG (через DAG view rendering)
- name              →  display name папки (плюс `.bodge` suffix если fileHandle есть)
- fileHandle        →  иконка active vs read-only
```

Проект без fileHandle (новый, ни разу не сохранён) — папка в Library с именем `📦 Untitled (не сохранён)`. После первого save — переименование с реальным `.bodge` именем.

### 5.3 Manual-edit branching scope

Применяется к: containers в `⚐ Без проекта` (frozen sequence — единственный путь edit'а), containers в `📥 Контейнеры` активного `.bodge` (как одна из опций edit'а наряду с DAG-операциями). НЕ применяется к: containers в read-only `.bodge` (там вообще edit недоступен, только copy-out).

---

## 6. Open questions → имплементационная спека

Эти вопросы не блокируют wireframe-макет (там можно выбрать default'ы), но решаются перед спекой M-X.7:

**Q1. «Mark as completed»** глобальное действие на проекте. Сейчас (см. §3.2) явно отвергнуто в пользу per-container `📚 Save to library`. Возможно полировка v0.9+ — global action для тех проектов где есть один очевидный final container. Не блокер.

**Q2. Migration существующих entries.** Текущие LibraryEntry не имеют `zone` / `projectId` / `manualEditFlag`. Hydrate-time migration (как DEC-LIB-MIGRATE-HEURISTIC-01 от 07.05): по `tags` определяем zone'у, по `origin.kind` (если есть) — manualEditFlag, по `resourceId` matching с containers — projectId. Idempotent. Loss-of-data acceptable (entries без явного projectId уезжают в Loose).

**Q3. Read-only `.bodge` папки — наполнение.** Импортируешь чужой `.bodge` через `+ Add`. ZIP парсится. **Все** контейнеры из `containers/` появляются в `📥 Контейнеры`, **все** primer'ы из `primers/` в `🧬 Праймеры`. DAG из `projectCommits/` рендерится в `🔀 DAG view`. Но где это **физически хранится**: ре-импорт всего ZIP содержимого в IndexedDB как полноценные records либо ZIP-blob отдельно + lazy-parse при unfold? Гипотеза по default: **полная re-import в IndexedDB** с `projectId` нового read-only project entity. Иначе read-only browse работает медленно (каждый unfold парсит ZIP). Нужно решить в спеке.

**Q4. `🔀 DAG` sub-row для активного проекта** — duplicate access. Биолог уже видит DAG через app-topbar / breadcrumb. Альтернатива: убрать sub-row для активного `.bodge`, оставить только для read-only импортированных. Не блокер для wireframe (нарисуем оба варианта).

**Q5. PrimerUsage tree representation.** Один primer показан в N местах (lab pool master + проектные папки через usage). UI implementation — нужна live cross-tree подсветка. Реализация: `PrimerUsage` table из IndexedDB → выборка по `primerId` → render badges/links в каждой проектной папке. Нагрузка: 100 primers × 10 projects = 1000 PrimerUsage records, тривиально.

**Q6. Rename импортированной `.bodge` папки.** Биолог импортировал `BorrowedProject.bodge`. Хочет переименовать в Library в «Sue's CRISPR project — backup». Допустимо? Или имя папки строго = имя `.bodge` файла? Голос: разрешить локальный rename Library projection (поле `displayName` на projectEntity), без изменения имени файла на диске. UI разделяет: «display name in Library» (mutable) vs «file name on disk» (mutable только через Save As).

---

## 7. Revision существующих ⚓ DEC-LIB-*

| ⚓                                | Статус после новой модели         | Действие                             |
|-----------------------------------|-----------------------------------|--------------------------------------|
| DEC-LIB-01 (flat collection)      | **Extends, не supersede**         | Личная коллекция — да, но с зонами   |
| DEC-LIB-02 (kind container/primer)| Без изменений                     | OK                                   |
| DEC-LIB-04 (sub-features inside containers) | Без изменений             | OK                                   |
| DEC-LIB-05 (frozen sequence)      | **Зональная**                     | Frozen в Loose, mutable в проектных папках через DAG/manual-edit |
| DEC-LIB-06 (clone, не reference)  | Без изменений                     | OK                                   |
| DEC-LIB-07 (PrimerUsage back-refs)| Без изменений                     | OK, расширяется на cross-project     |
| DEC-LIB-08 (wizard primer-step)   | Без изменений                     | Primer падает в проектную папку либо Loose в зависимости от target |
| DEC-LIB-09 (flat tagging, no folders) | **Уточнение**                 | Tags остаются flat, **но folders в Loose разрешены** через slash-paths (DEC-CAT-04 уже это покрывает); противоречие было с старой формулировкой «no folders в Library» — теперь явно: tags = семантика, folders = location в Loose. |
| DEC-LIB-10 (tagIds removed from MoleculeContainer) | Без изменений    | OK                                   |
| DEC-LIB-12 (manual-edit branching)| **Зональная**                     | Применима в Loose и активный `.bodge`, не в read-only |
| DEC-LIB-13 (annotations explicit save) | Без изменений                | OK                                   |
| DEC-LIB-14 (edit parity)          | Без изменений                     | OK                                   |
| DEC-LIB-15 (import targets)       | **Переформулирование**            | Старое: «Library only / Library + project». Новое: «target zone — Loose / project folder / Lab pool» (см. §3.1 таблица). |
| DEC-LIB-16 (read-only по default) | **Расширение**                    | Read-only теперь означает не только sequence editing, но и whole-project read-only для импортированных `.bodge` |
| DEC-LIB-17 (onboarding nudge)     | **Переформулирование**            | Старое: nudge для catalog onboarding. Новое: nudge для типичного first-touch сценария «положи pUC19 в Loose» либо «открой существующий .bodge». Catalog — один из источников `+ Add`, не отдельный nudge. |

---

## 8. Новый ⚓ кандидат

После реализации M-X.7 — single новый ⚓ для фундаментальной смены модели:

> **DEC-LIB-K11: Library = unified projection of IndexedDB grouped by ownership zones (Loose / `.bodge` projects / Lab pool).** Extends DEC-LIB-01 — личная коллекция остаётся, но структурируется по зонам с разными правилами манипуляции. Свободная зона = full ФС-семантика (drag/drop/rename/folders); `.bodge` = ZIP-папки с прибитой структурой и read-only browse; Lab pool primer'ов = общий root-level раздел с opt-in promotion. Импортированные не-активные `.bodge` — read-only (cross-project clone доступен, edit нет; «Open as active» переключает активный проект). Cross-project copy = immutable copy с lineage trace, без forward-sync.

---

## 9. Scope разбиения на спринты

Реалистично — 3 sprint'а:

**M-X.7 — Library tree rebuild + zones.**
- Data model adjustments (LibraryEntry +zone +projectId).
- Tree UI rewrite: 3 зоны (Loose / Projects / Lab pool), новая иерархия.
- `+ Add` modal с источниками (file/paste/catalog/cross-project — реюзит существующий Importer wizard).
- Migration heuristic для существующих entries.
- Базовый read-only mode для импортированных `.bodge` (без advanced features).

**M-X.8 — Primer pool split + Lab pool semantics.**
- `🧬 Лабораторный пул` root section, `inLabStock` toggle.
- `📚 Из чужих проектов` sub-секция.
- PrimerUsage rendering in projectных папках.
- Sequence-match подсветка между cross-project primer и lab-stock entry.
- Wizard primer-step (DEC-LIB-08) обновление под новые targets.

**M-X.9 — Read-only `.bodge` polish + cross-project copy.**
- Полный read-only DAG view для импортированных `.bodge` (реюзит DagView с readOnly:true, §3.4).
- «Open as active project» switching (с warning о dirty current).
- Cross-project copy container UI (Inspector preview + select destination).
- Lineage trail rendering в Inspector (chain of origins глубины N).
- Manual-edit `✎` иконка в tree node (расширение DEC-LIB-K10).

---

## 10. Sanity check после mental-model сессии

Проведён в обмене 08.05.2026 в конце сессии. Проверены три точки риска:

1. **First-touch onboarding** — биолог-новичок видит много концептов сразу. Митигация: empty state не показывает все зоны сразу (зоны появляются по мере наполнения); onboarding nudge направляет в один типичный сценарий. **Решается дизайном wireframe'а, не data model.**

2. **Mixed direct manipulation rules** — drag/drop в свободной зоне работает, в `.bodge` нет. Митигация: явный visual marker «эта зона read-only» (другой фон у `.bodge`-папок, hover-cursor not-allowed при попытке drag, tooltip объяснение).

3. **Lab pool dead feature risk** — биологи могут не поддерживать актуальность. Митигация: lab pool опционален, primer'ы могут жить в проектных папках без promotion. Биолог-халтурщик worst-case = просто общий пул без разделения.

**Финальный вердикт sanity check'а:** подход работает для целевого пользователя (serious wetlab workflow). Усложнённость не лишняя — каждая её часть отвечает на реальную задачу биолога. Главные риски решаемы дизайном или вне контроля BodgeGene. Не upgrade'ить под casual / teaching use case (это не наш use case, DEC-IMP-06).

---

## 11. Следующие шаги

1. **Простой wireframe-макет** в новой сессии (Chat рисует, Игорь скармливает дизайнеру для нормального HTML).
2. После HTML — спека M-X.7 (Tree rebuild + zones).
3. После M-X.7 — спека M-X.8 (Primer pool split).
4. После M-X.8 — спека M-X.9 (Read-only polish + cross-project).
5. После M-X.7 закрытия — promote DEC-LIB-K11 в ANCHORS.md.
6. После M-X.9 — обновление ARCHITECTURE_v2 §2.7 под новую модель (заменяет старую формулировку про flat collection vне проектов).

---

_Документ создан 08.05.2026 в сессии Igor ↔ Chat по итогам обсуждения структуры Library после Start screen review. Парный документ для биолога — `docs/guides/USER_GUIDE_LIBRARY.md`._
