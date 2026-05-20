# PC-K10 — Project canvas manual smoke plan

> Browser-level verification of `SPEC_PROJECT_CANVAS_CLEANUP` deltas.
> Implemented: K1 + K4 + K5 + K6 (counter conditional). Deferred:
> K2/K3 (LibrarySearchBar), K7 (Рабочие таблицы — no reachable hits in
> source), K9 (Restriction toggle relocation).

## Steps

### 1. Tree panel removed

- Open any project → no left tree panel (PC-K1).
- Canvas area uses full width (~300 px reclaimed).

### 2. Header title shows project name

- Click any project from sidebar pinned list.
- Top header text reads project's `name`, not "Canvas-скелет" (PC-K4).
- Switching projects updates the title.

### 3. ProtocolPanel + PrimerOrderPanel mounts gone

- Floating "📁 Протокол" and "🧪 Заказ олигов" buttons absent (PC-K5).
- Bottom-right floating stack now: `🗑 Очистить` + `+ Сборка` (+ `📋 Сборки (N)` when zones>0).

### 4. 📋 Сборки counter conditional

- Empty project — `📋 Сборки (0)` floating toggle HIDDEN (PC-K6).
- Click `+ Сборка` once — toggle appears showing `Сборки (1)`.

### 5. LibrarySearchBar (DEFERRED to follow-up wiring)

- Spec calls for full-width search above canvas (PC-K2/K3). Not
  implemented in this sprint to keep change surface minimal and
  avoid touching the 41 KB hard-breached CanvasLayoutView. Library
  drag-source remains accessible inside the assembly editor's
  AssemblySidebar (containers list).

## Reporting

```
Step 1 (no tree panel):    PASS / FAIL
Step 2 (project name):     PASS / FAIL
Step 3 (panels gone):      PASS / FAIL
Step 4 (counter cond.):    PASS / FAIL
Step 5 (search bar):       DEFERRED
```
