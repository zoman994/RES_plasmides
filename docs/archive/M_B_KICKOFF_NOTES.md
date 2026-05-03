# M-B Kickoff — мои решения

**Статус:** ✅ ФОРМАЛИЗОВАНО 01.05.2026 (третья сессия) — решения зафиксированы как ⚓ DEC-LIB-01..09 + DEC-IMP-01..05 + DEC-REUSE-01 в `DECISIONS.md`, секции §2.7 / §3.1 / §3.5 / §3.7 / §7 / §8.1 / §10 / §11 в `docs/ARCHITECTURE_v2.md` обновлены. Файл оставлен в archive как research-history snapshot решений Игоря между kickoff и формализацией.

Сессия от 01.05.2026. Тема: скоупинг milestone M-B (Importer) и переопределение Library в v0.6+.

Этот файл — мой персональный snapshot решений. Чтобы я сам мог открыть и вспомнить «что я решил и почему» в любой следующей сессии. Не для Code, не для другого Chat instance — для меня.

---

## Главное переопределение

**Library** — личная коллекция контейнеров вне проектов. Аналог `~/SnapGene Files/`. Это **не** 3-tier ownership как было прописано в `docs/ARCHITECTURE_v2.md` §2.7 — то определение **переписывается**.

**Importer** — точка входа внешних данных в BodgeGene в целом. Парсер `.dna` / `.gb` / `.fasta` / paste / `.bodge` → внутренние контейнеры и праймеры. Это **не** «выбор источника контейнера со включением library». Library — internal data, парсить там нечего.

**Три разделённые операции:**

| Операция | Триггер | Источник | Куда попадает |
|----------|---------|----------|---------------|
| Импорт в library | `+ Импорт` в Library toolbar | external file/paste/`.bodge` | только library |
| Импорт в проект | `+ Импорт` в DAG toolbar | external file/paste/`.bodge` | DAG + автоматом library |
| Добавить из library | `+ Из библиотеки` в DAG toolbar | library picker | DAG (как `library_clone` копия) |

Третья — это **library picker**, не Importer. Семантически другая задача.

---

## Мои решения по Library

✓ **Контейнеры — единый класс** (плазмиды + линейные фрагменты), различаются фильтром по топологии в UI, не разными типами данных.

✓ **Праймеры — отдельный раздел** library, в UI tab/filter `Контейнеры | Праймеры`. Праймеры и features — chrtовски разные вещи, разнесены полностью.

✓ **Features живут внутри контейнеров**, не browsable отдельно. Это разметка sequence, не самостоятельная сущность.

✓ **Sequence заморожен** после первой загрузки в library. Изменение sequence — **только два пути**:
  1. Момент первой загрузки (правка до commit-в-library)
  2. Клонирование контейнера в проект — копия живёт своей жизнью

✓ **Связь library ↔ project — копия, не ссылка.** Контейнер в проекте получает новый UUID и `origin: library_clone`. Изменения в проекте не влияют на источник в library. Обновлений после клона нет — explicit re-import если хочется обновить.

✓ **При просмотре фрагмента видны все ассоциированные праймеры** (back-references, derived list через `PrimerUsage`). Симметрично: на праймере видно где используется, на контейнере — какие сидят.

✓ **При импорте `.dna` с `primer_bind` features → доп визард-step** с checkbox-list:
> «В файле найдено N праймеров с известной последовательностью: [☑ M13F, ☑ T7-rev, ...]. Добавить отмеченные в библиотеку → раздел Праймеры?»
- Default = все галочки стоят
- Если в файле нет sequence у `primer_bind` (только имена) — step не появляется вообще
- НЕ silent auto-extract (это antipattern «half-broken auto-extraction злит больше чем отсутствие»)

✓ **Бенчлинг отвергнут как референс.** Причины: «отвратительно ванильный, функционал размазан, нет горячих клавиш». Ориентиры теперь: **SnapGene** (hotkeys + density), **ApE** (минимализм + скорость), **pLannotate** (compact data-density), частично **Geneious**.

✓ **Теги без папок** в library. Папки эмулируют filesystem mental model которая для биологии мешает (плазмида относится к проекту X и backbone-коллекции одновременно — папки требуют выбора одного, теги нет).

✓ **Library minimal CRUD в M-A scope**, с пометкой «переписать после взаимной реализации с DAG». Часть функционала проявится только когда library и DAG живут вместе.

✓ **Sync — отдельный скоп, не M-A.** Manual export `.bodge-library` минимально на старте; cloud-folder автосинк через Drive Desktop / Dropbox — позже. Group projects + shared library tier — после M-I (DEC-V2-29).

---

## Мои решения по Importer

✓ **3 источника в Importer** (не 4): file (`.dna`/`.gb`/`.fasta`), paste, cross-project `.bodge`. Library как источник — **НЕ Importer** (это library picker).

✓ **Со стартового экрана убираем `↓ Import sequence`.** Без проекта импортировать в проект некуда. Если есть только файл и нет `.bodge` — биолог идёт `+ New project` → потом Importer из DAG-toolbar. Двухступенчатый flow, но логически чистый (принцип 1.8: скорость не приоритет).

✓ **В M-B.1 skeleton — оба контекста сразу**: in-project (из DAG toolbar) и в library (из Library toolbar).

✓ **Все три формата файлов сразу** (`.dna` + `.gb` + `.fasta`) в M-B.1, не один. `.dna` PRIMARY уже работает в `snapgene_parser.py`, `.gb` через BioPython тривиально, FASTA тривиально. Скоуп растёт не х3, а ~х1.1.

✓ **Paste sequence (Ctrl+V) — отложено в M-B.2.** Другой UX path (textarea вместо file picker), валидация чуть другая. Не блокер skeleton.

✓ **Cross-project `.bodge` — отложено в M-B.3.** Это §3.4 fullscreen modal с `<DagView readOnly>`, отдельная большая фича.

✓ **URL-импорт (Addgene API) — v0.7+, не M-B.** Зафиксировано в §3.5.

✓ **Rich preview default**, не minimal. У нас есть готовые компоненты v0.5 (см. ниже).

---

## Что я нашёл в v0.5 для reuse в M-B и M-C

Полная экосистема визуализации готова к переиспользованию:

| Компонент | Размер | Куда применим |
|-----------|--------|---------------|
| **`PlasmidMiniMap.jsx`** | 20.6 KB | Те самые «минимапы». Two-mode (inline 32-180px / overlay с leader-labels). Hover-grow через portal. → **Preview в Importer wizard**. |
| **`PlasmidMap.jsx`** | 34.3 KB | Full circular viewer: feature arcs, sub-tracks, RE sites + MCS, primer arcs, junction zones, zoom/pan. → **Container Window M-C**. |
| **`PlasmidViewer.jsx`** | 20.1 KB | **Готовый three-section read-only modal**: map + annotations table + colored sequence + AA + RE markers. → почти готовая основа Container Window. |
| **`SequenceMapView.jsx`** | 21.8 KB | SnapGene-style double-strand, primer tracks, AA, hotkeys P/R/Ctrl+C для primer-from-selection. → секция Container Window. |
| **`SequencePreview.jsx`** | 15.0 KB | Inline preview с region labels, AA, ruler. |
| **`AnnotationEditor.jsx`** | 15.1 KB | Features table readOnly. |
| `RacetrackView.jsx` | 8.2 KB | Stadium для circular в Mix Workspace (M-E, не M-B). |

**Backend готов:**
- `snapgene_parser.py` PRIMARY .dna парсер
- BioPython fallback `.gb` / `.fasta`
- `common-features.json` (415 verified features) для авто-аннотатора

**v0.5 visualization → first-class reuse в M-B (preview) и M-C (read-only viewer).** Запишется как DEC при формализации в следующей сессии.

---

## Что точно не делаем

× Library как 3-tier ownership (project-local / shared / catalog) — упрощено до простой коллекции
× Бенчлинг как UX референс — отвергнут
× Папки в library — только теги
× Auto-extract primers из `primer_bind` без подтверждения биолога
× URL-импорт Addgene API — v0.7+
× Cloud-folder sync в M-A — позже
× Group projects + shared library — после M-I (⚓ DEC-V2-29)
× Старый ImportDecisionModal v0.5 переусложнённый паттерн «10 опций при импорте» — упрощаем до wizard step + preview + Импортировать

---

## Что отложено в подспринты M-B

- **M-B.2** Paste sequence (Ctrl+V в textarea)
- **M-B.3** Cross-project import (`.bodge` через DagView readOnly modal)

---

## Куда смотреть в следующей сессии

После compact работаем над тремя задачами в одной сессии:

1. **DECISIONS.md** — записи DEC-LIB-NN с ⚓ для всех решений выше
2. **ARCHITECTURE_v2.md** — обновить §2.7 (Library re-definition), §3.5 (Importer 3 источника), §3.1 (стартовый экран без `↓ Import sequence`), §7 (M-A scope расширен library minimal CRUD), §8 (visualization reuse list)
3. **PROJECT_STATE.md** — финальный summary этой сессии в журнал

Затем **отдельная сессия** — спека **M-A расширенный** (Start screen + Project shell + Library minimal CRUD).

Затем **отдельная сессия** — спека **M-B.1** (Importer wizard, 3 формата, оба контекста, rich preview, primer wizard step).

---

## Открытые вопросы для следующих kickoff-сессий

В этой сессии не успели разобрать (это вопросы 3-6 из исходных шести):

- **Q3 Source UX-paths.** Drag-drop поверх wizard / file picker button / оба? Drag-drop — minor (~30 строк native HTML5).
- **Q4 Промежуточный preview-step или сразу контейнер.** Мой rec был «есть preview-step, lightweight» (парсим → preview → один кнопкой Импортировать). Не утверждено.
- **Q5 Identity нового container — auto-detect vs user confirmation.** Topology / ends / features auto-detect, имя редактируемо inline. Не утверждено.
- **Q6 No-project flow** — что меняется после удаления `↓ Import sequence` со стартового экрана. Какие подсказки видит биолог в первый раз без `.bodge`? Onboarding-вопрос.

Эти 4 можно решить inline в спеке M-B.1 (если мелкие) либо отдельным mini-kickoff перед спекой.

---

## Связанные документы

- `docs/ARCHITECTURE_v2.md` — §2.7 Library, §3.1 окна, §3.4 cross-project modal, §3.5 Importer, §7 roadmap, §8 reuse list (после обновления в следующей сессии будут отражать решения этого файла)
- `CHAT_PLAYBOOK.md` §1 — milestone-сессии v0.6+ с дочитыванием ARCHITECTURE_v2
- `DECISIONS.md` — после следующей сессии будут DEC-LIB-NN записи

---

**Дата создания:** 01.05.2026  
**Автор решений:** Игорь Синельников  
**Формализатор:** Claude Chat  
**Статус:** утверждённый snapshot для personal review между сессиями. Формальные DEC-LIB-NN записи появятся в следующей сессии после compact.
