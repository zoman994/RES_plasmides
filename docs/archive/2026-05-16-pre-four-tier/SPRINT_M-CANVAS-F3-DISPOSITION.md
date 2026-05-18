# SPRINT M-CANVAS-F3-DISPOSITION — Disposition of F3 PcrModeShell после Assembly Drafts (D1)

**Дата спеки:** 15.05.2026 (batch с A1-A4 assembly stack).
**Тип:** C (рефлексия + лёгкие правки + обновление документации).
**Target размер спеки:** ~9 KB.
**Источник:** chat-сессия 15.05 walkthrough Игоря assembly-workflow. F3 PcrModeShell после V71 rework и V72-V76 fixes реализован как **isolated PCR mode**. Assembly workflow (A1-A4) — большая отдельная парадигма. Эта спека формализует **сосуществование** двух workflow'ов.
**Цепочка:** A1-A4 (assembly stack) + **D1 этот sprint, disposition**.
**Статус:** черновик Chat 15.05.2026.
**Зависимости:** F3 PcrModeShell + A2 AssemblyDraftsPanel.

---

## 0. Срез

Эта спека — **не реализация new feature**. Это **рефлексия + лёгкие правки + обновление документации**. Реализационный объём минимален:

| Файл | Действие |
|---|---|
| `docs/SPRINT_M-CANVAS-PCR.md` (F3 спека) | Archive с пометкой «реализована V71-V76 rework. См. RELEASES.» |
| `docs/SPRINT_M-CANVAS-WINDOW.md` (F1) | Pointer note: «tab kind extended в A2 на 'assembly'» |
| `docs/COMPONENT_MAP.md` | Update: PcrModeShell + assembly/* placement |
| `docs/ARCHITECTURE_v2.md` §7 Roadmap | Add: «PCR-mode (isolated)» vs «Assembly Drafts (workflow)» дистинкция |
| Sidebar / Library entry (опционально) | Добавить link «📋 Assembly Drafts» рядом с «📂 Open project canvas» |

Новый код — минимальный (sidebar link опционально).

---

## 1. Контекст: два workflow'а сосуществуют

После A1-A4 в системе сосуществуют **два независимых workflow'а** биолога:

### Workflow 1 — Isolated PCR (F3, реализован V71-V76)

**Use case:** биолог хочет амплифицировать кусок ДНК. Цель — простой PCR продукт, не часть сборки.

**Примеры:**
- Праймеры для секвенирования участка.
- Check-PCR подтверждение результата клонирования.
- Амплификация ДНК-фрагмента из geneblock'а / source плазмиды для дальнейшего хранения.
- Mutagenesis primer pair (когда A4 mutagenesis-mode будет реализован — аналогичный F3 шаблон).

**Entry point:** hover ContainerBlock на canvas → 🔬 PCR icon → opens PcrModeShell tab (V70 flow). 1-2 клика.

**UI:** PcrModeShell (V71 reuse SequenceTab) + PrimerSuggestionsPanel + OrderOligosConfirmGate.

### Workflow 2 — Assembly Construction (A1-A4)

**Use case:** биолог хочет **собрать многокомпонентную конструкцию**. Цель — финальная плазмида или сложный intermediate из N фрагментов.

**Примеры:**
- Gibson assembly из 3-5 fragments.
- Multi-step overlap-PCR серия.
- Replacement стандартного backbone с custom MCS.
- Recombinase mediated assembly (когда method будет добавлен).

**Entry point:** «📋 Assembly Drafts» panel на canvas → «+ New Draft» → opens AssemblyShell tab. Дальше копипаст-style construction (A2).

**UI:** AssemblyShell (A2) + AssemblySegmentsPanel + AssemblyPrimerPanel + RealiseModal (A4).

### Линк между workflow'ами

A4 Realise as DAG **создаёт PCR ops** для каждого segment. Эти PCR ops — обычные operations в state.operations, доступные через **исходный** entry point Workflow 1 (двойной клик на op-ромб → PcrModeShell tab). Biolog может править их primers через standard PCR mode UI **после** realise.

То есть Workflow 1 — **fundamental atom** (один PCR-op tab), Workflow 2 — **composer** (создаёт N PCR-ops + junctions из higher-level спецификации).

---

## 2. Что меняется в существующем коде

Реализационный объём минимален:

### 2.1 Sidebar / Library entry для «Assembly Drafts»

Existing: «📂 Open project canvas» в StartScreen Sidebar (V65) + LibraryTopBar.

Добавляется: «📋 Assembly Drafts» рядом — opens canvas + auto-opens AssemblyDraftsPanel (A2).

Альтернатива: запустить через тот же «Open project canvas», а Drafts panel toggle button уже на самом canvas (A2 DEC-ASM-UX-10). Это **проще** — не загромождаем sidebar. Take this.

**Реализация:** opt-in — A2 sufficient.

### 2.2 Если biolog двойной кликает на op-ромб который A4 создал — что происходит?

Существующий V70 flow: double-click op-ромб → opens PcrModeShell tab. Op.params.userPrimers содержит primer pair (из A4 mapping). PCR mode уже знает template (op.inputs[0]) — V69 fix. PrimerSuggestionsPanel показывает primer pair.

То есть **существующий F3 flow работает** для derived ops без изменений. **Не делаем ничего.**

### 2.3 Indicator на op-ромбе что op «derived from assembly X»

Optional: на op-ромбе показывать badge «from Assembly: <name>» (subtle text below rhombus).

**Реализация:** opt-in. Можно отложить.

### 2.4 PrimerSuggestionsPanel «Open in Assembly» action

Optional: в PrimerSuggestionsPanel когда biolog видит op derived from assembly — добавить link «Open source assembly» → switches к assembly tab.

**Реализация:** opt-in. Optional.

---

## 3. Documentation updates

### 3.1 docs/SPRINT_M-CANVAS-PCR.md — archive

После acceptance F3 rework V71-V76 — F3 спека реализована. Перенести в `docs/archive/` с header note:

```
# [ARCHIVED] SPRINT M-CANVAS-PCR — PCR Operation Mode (F3)

**Archived:** 15.05.2026.
**Реализована через:** V71-V76 rework (см. BUGS_HISTORY / RELEASES блоки 15.05.2026).
**Use case:** isolated PCR. Assembly workflow — отдельная парадигма (A1-A4).
**См. также:**
- `docs/SPRINT_M-CANVAS-ASSEMBLY-MODEL.md`
- `docs/SPRINT_M-CANVAS-ASSEMBLY-CONSTRUCT.md`
- `docs/SPRINT_M-CANVAS-ASSEMBLY-PRIMER-DESIGN.md`
- `docs/SPRINT_M-CANVAS-ASSEMBLY-REALISE.md`
```

И оставить содержимое спеки как историю (не удалять).

### 3.2 docs/SPRINT_M-CANVAS-WINDOW.md (F1) — pointer note

F1 определила tab.kind = 'container' | 'operation'. A2 расширила на 'assembly'. Добавить inline pointer в F1 §4 DEC-WIN-01:

```
**Updated 15.05.2026:** tab.kind extended in A2 (SPRINT_M-CANVAS-ASSEMBLY-CONSTRUCT.md DEC-ASM-UX-01)
to 'container' | 'operation' | 'assembly'. Tab shape backward-compat preserved.
```

### 3.3 docs/COMPONENT_MAP.md — update

Add `editor/assembly/` directory listing с компонентами A2-A4.

Update mini-section «Operation modes»:

```
**Operation modes** (mounted in F1 editor tabs based on tab.kind):
- tab.kind='container' → ContainerEditorSkeleton (default, library viewer reuse)
- tab.kind='operation' + op.kind='pcr' → PcrModeShell (F3 V71-V76, isolated PCR)
- tab.kind='operation' + op.kind∈{mutagenesis,gibson,restriction,cut} → пока не реализованы (future)
- tab.kind='assembly' → AssemblyShell (A2, assembly construction workflow)
```

### 3.4 docs/ARCHITECTURE_v2.md §7 Roadmap

Add explicit разделение:

```
**Two coexisting workflows in canvas:**

1. **Isolated operations** (F3 PCR mode реализован; Mutagenesis/Restriction/Gibson/Cut — future).
   Биолог работает с одной операцией за раз: создаёт op-ромб, выбирает template, настраивает params.
   Entry: hover ContainerBlock → kind icon → operation tab.

2. **Assembly Drafts** (A1-A4).
   Биолог работает с высокоуровневой спецификацией финальной конструкции (assembly).
   Сборка через копипаст source фрагментов в continuous sequence. Primers пишутся на границах.
   Realise as DAG материализует assembly в N operations + N-1 junctions.
   Entry: «📋 Assembly Drafts» panel на canvas → «+ New Draft».
```

---

## 4. Tests + acceptance

Минимальный test набор:

1. **Sidebar entry visible после A2 mounted** (если опция выбрана).
2. **A4-created op double-click → PcrModeShell opens с primer mapped** — already covered в existing tests, regression check.
3. **PcrModeShell continues работает для standalone ops** — already in V71 tests, regression check.

Acceptance:

- Biolog клик «Assembly Drafts» button → DraftsPanel открывается.
- Biolog двойной клик A4-derived op → PcrModeShell tab открывается с primer pair видны.
- Biolog hover ContainerBlock → 🔬 PCR icon → standalone PCR работает как раньше.
- Documentation в `docs/` обновлена.

---

## 5. Risks

### R1 — Confusion biolog: «зачем мне Assembly когда есть PCR mode»?

Митigация: F5 Onboarding (post-MVP) explanation. В A2 — empty state hint в Drafts panel: «Assembly Drafts для сборки финальной конструкции из нескольких фрагментов. Для одного PCR используйте 🔬 icon на контейнере».

### R2 — A4 derived ops засоряют canvas

Realise creates N+ entities. Митigation: A2 DEC-ASM-UX-10 + A4 DEC-REAL-06 layout (entities placed в bottom area, не overlapping core). Biolog может удалить вручную.

### R3 — Параллельная разработка двух workflow'ов increases maintenance

A1-A4 — большой шкаф нового кода. Митigation: PcrModeShell (F3) живёт независимо, изменения в одном workflow не задевают другой через изоляцию kind dispatch в EditorWindowShell.

---

## 6. Acceptance

- Документация обновлена (3.1-3.4).
- Если sidebar entry добавлен (опционально) — visible.
- Tests regression — pass.

---

## 7. STOP

Code → Chat возвращает diff documentation files + optional sidebar entry + tests passing + sizes audit.

---

_Дата:_ 15.05.2026.
_Реализация Code:_ после A1-A4 acceptance.
_Acceptance:_ inline review documentation changes.
