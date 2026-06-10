# SPRINT_T10_SANGER_MVP_LAB_NOTEBOOK.md — Sanger lab notebook MVP

> **Тип:** A (data + UI).
> **Якорь:** `docs/SPEC_M-CANVAS-FOUR-TIER-ARCHITECTURE.md` (DEC-CANVAS-4T-18, 19).
> **Зависимости:** T9 (op.materializedClones + sangerVerified field shape).
> **Размер целевой:** 35-45 KB.
> **Цель:** реализовать MVP Sanger lab notebook — правая панель per-zone, биолог записывает Sanger результаты для каждой колонии (pending → verified / failed). Notebook hooks в BranchingVisual T9 (отображение clone verification status). Post-MVP: full read parsing, AB1 file upload.

---

## 0. Срез размеров затрагиваемых модулей

| Файл | Текущий | Лимит | Действие |
|------|---------|-------|----------|
| `store/skeleton-state-operations.js` | ? | soft 20 / hard 25 (.js) | +SET_CLONE_SANGER_STATUS action, +SET_CLONE_NOTES action, ~+1 KB |
| `canvas/SangerLabNotebook.jsx` | — (new) | soft 30 / hard 40 (.jsx) | ~10-12 KB main panel |
| `canvas/SangerCloneRow.jsx` | — (new) | soft 30 / hard 40 | ~4-5 KB single clone row |
| `canvas/SangerStatusPicker.jsx` | — (new) | soft 30 / hard 40 | ~3-4 KB status dropdown |
| `canvas/CanvasLayoutView.jsx` | ~24 KB | soft 30 / hard 40 | +mount SangerLabNotebook (toggleable right-panel), ~+1 KB |
| `canvas/zone-sequence-mode/BranchingVisual.jsx` | ~9 KB (T9) | soft 30 / hard 40 | +sangerVerified visual indicator на clone branches, ~+1 KB |
| `lib/sanger-helpers.js` | — (new) | soft 20 / hard 25 | ~3-4 KB pure helpers |
| `store/selectors-pieces.js` | ? | soft 20 / hard 25 | +selectSangerSummaryForZone, ~+0.5 KB |
| `lib/strings.js` | ? | hard 25 | +sanger strings ~+0.5 KB ⚠ check after T8 split |

---

## 1. Контекст

### 1.1 Что после T1-T9

- `op.materializedClones: Array<{cloneId, label, sangerVerified, notes}>` (T9 shape).
- BranchingVisual в T7+T9 показывает clones как vertical stack.
- sangerVerified field — `'pending' | 'verified' | 'failed' | null` (T9 default 'pending').
- T9 НЕ управляет sangerVerified — это T10.

### 1.2 Что добавляется в T10

**SangerLabNotebook panel** (правая боковая панель на canvas):
- Toggleable через icon-button в верхнем правом углу canvas. Hotkey `B` (от «laboratory book»).
- Per-zone: показывает все materialized clones в zone (все pieces × ops с materializedClones).
- Список rows, каждая строка — clone. В строке:
  - Clone label (editable).
  - Parent op name + kind.
  - Status picker (pending / verified / failed).
  - Notes textarea (short, multi-line).
  - Optional Sanger read button (post-MVP — open AB1 viewer).

**Status workflow:**
- 'pending' — default. Цвет: серый.
- 'verified' — биолог подтвердил. Цвет: зелёный.
- 'failed' — биолог проверил, не прошёл. Цвет: красный.
- `null` — Sanger не запланирован.

**Per-zone summary:**
- В header SangerLabNotebook — счётчик «N pending, M verified, K failed».
- Filter: показывать все / только pending / только verified / только failed.

**BranchingVisual integration:**
- Each clone branch получает цветную метку рядом с label, отражая sangerVerified.
- Hover показывает clone notes.
- Click → focuses SangerLabNotebook on этот clone (scroll into view + highlight).

### 1.3 Что НЕ в T10

- AB1 file parsing / upload (post-MVP).
- Sanger read sequence comparison с expected sequence (post-MVP).
- Primer-walking strategy planner (post-MVP).
- Bulk import Sanger results from external tools (post-MVP).
- OCR for handwritten Sanger notes (T-future, intersects gel-OCR ML feature).

### 1.4 Связь с бумажной диаграммой биолога

На исходной диаграмме (бумага) была таблица:

| Construct | gRNA primer | colonies | verified |
| --- | --- | --- | --- |
| P43_U3afu_Hyg/1 | 275 | 6 | 4 |
| P43_U3afu_Hyg/2 | 279 | 8 | 3 |
| P50_U3afu_pyrG/5 | 285 | 4 | 2 |
| P50_U3afu_pyrG/7 | 287 | 5 | 1 |

T10 — это **electronic version** этой таблицы, per-zone. Verified column reflects Sanger результаты.

T10 MVP не имеет «construct» столбца как parent group — каждая row = один clone. Filter «по parent op» позволяет grouping.

---

## 2. Стратегия

**Right panel UI, toggleable.** Не отдельный workspace (DEC §17 R3 CHAT_PLAYBOOK — никакого «новый workspace»). Inline panel — slides in from right edge canvas. Width ~360px.

**Data — derived from existing state.** Нет нового slice. SangerLabNotebook reads через selectors:
- `selectSangerSummaryForZone(state, zoneId)` returns `{clones, counts: {pending, verified, failed}}`.
- Iterates через operations с zoneId === current zoneId AND materializedClones != null.

**Actions:**
- `SET_CLONE_SANGER_STATUS(opId, cloneId, status)` — updates materializedClones[i].sangerVerified.
- `SET_CLONE_NOTES(opId, cloneId, notes)` — updates materializedClones[i].notes.
- `SET_CLONE_LABEL(opId, cloneId, label)` — updates label (rename clone).

**Visual integration:**
- BranchingVisual в T7+T9+T10 reads sangerVerified, applies color на clone branch.
- SangerLabNotebook scroll-to behaviour при click на BranchingVisual clone.

**Per-zone scope:** SangerLabNotebook shows clones for **current focused zone** (state.ui.focusedZoneId from T7). При hover/click на другую zone — panel content updates.

Alt: panel — global (показывает clones из всех zones, filter by zone). T10 — per-zone simpler. Если biolog wants global view — T-future enhancement.

---

## 3. Scope IN / OUT

### IN
- `canvas/SangerLabNotebook.jsx` — main panel.
- `canvas/SangerCloneRow.jsx` — clone row.
- `canvas/SangerStatusPicker.jsx` — status dropdown / segmented control.
- `lib/sanger-helpers.js` — pure helpers.
- Selectors: `selectSangerSummaryForZone`, `selectClonesInZone`, `selectCloneById`.
- Actions: SET_CLONE_SANGER_STATUS, SET_CLONE_NOTES, SET_CLONE_LABEL.
- BranchingVisual extension — sangerVerified visual indicator.
- Toggle UI — icon button + hotkey `B`.
- STRINGS extension.
- Tests (~30).

### OUT
- AB1 parsing / upload (post-MVP).
- Read sequence alignment (post-MVP).
- Primer-walking planner (post-MVP).
- Bulk import Sanger results (post-MVP).
- Construct grouping в notebook (T-future enhancement — filter by parent op approximates).

### NOT TOUCHED
- T9 op.materializedClones shape — unchanged.
- BranchingVisual core logic (kinds detection) — T10 only adds visual on clones branch.
- Library / Importer / SequenceView / Annotator.

---

## 4. Архитектурные решения

### DEC-T10-01 — Right panel, не floating window
DEC-CANVAS-4T-19: per-zone notebook integrated в canvas, не отдельный workspace. Slide-in right edge — minimum invasive.

### DEC-T10-02 — Per-zone scope (current focused zone)
DEC-CANVAS-4T-19: каждая zone имеет свой notebook. Switch zone → content updates.

Альтернатива (global with filter) — T-future.

### DEC-T10-03 — Status: 4 states ('pending' / 'verified' / 'failed' / null)
- 'pending' — default after MATERIALIZE_REACTION.
- 'verified' — biolog confirmed via Sanger.
- 'failed' — biolog confirmed Sanger failed (mutations / bad read).
- `null` — Sanger not planned (biolog skip'нул для этой колонии).

Не enum в reducer — string literals.

### DEC-T10-04 — Cycle status via segmented control, не dropdown
Visually: 3 segments (pending / verified / failed) + (×) reset to null. Click cycles. Faster than dropdown для quick triaging.

### DEC-T10-05 — Notes — short multi-line textarea inline
≤500 chars, free-form. Biolog часто пишет «mutation в position 234», «bad read», «redo». T10 — basic textarea. Post-MVP — markdown / linkable.

### DEC-T10-06 — Hotkey B — toggle SangerLabNotebook panel
Глобальный. Like G/S (T7). Scope-bound к canvas page.

### DEC-T10-07 — Visual в BranchingVisual — coloured dot после clone label
- Gray dot — pending.
- Green check — verified.
- Red × — failed.
- No dot — null.

Hover dot → tooltip с notes (если есть).

### DEC-T10-08 — Per-zone counter «N pending, M verified, K failed»
В header panel. Auto-update.

### DEC-T10-09 — Filter: all / pending / verified / failed
Segmented control top of panel. Hides rows mismatching filter.

### DEC-T10-10 — Click clone в BranchingVisual → focus в notebook
- Open panel если closed.
- Scroll к clone row.
- Brief highlight (500ms CSS animation).

### DEC-T10-11 — Migration v8→v9 — НЕ требуется
T9 уже добавил sangerVerified field в shape. T10 не меняет shape, только UI + actions. Migration не нужна.

### DEC-T10-12 — Tests baseline: 2985 (T9) → ~3015 (T10)
~30 новых tests.

---

## 5. Components / actions / API

### 5.1 Actions

**SET_CLONE_SANGER_STATUS**

```
dispatch({
  type: 'SET_CLONE_SANGER_STATUS',
  operationId,
  cloneId,        // === containerId
  status: 'pending' | 'verified' | 'failed' | null,
});
```

Логика:
1. Find op. Find clone в op.materializedClones. Если нет — state.
2. Update sangerVerified на clone.
3. Toast info: «Колония «{label}» отмечена как {status}».

**SET_CLONE_NOTES**

```
dispatch({ type: 'SET_CLONE_NOTES', operationId, cloneId, notes });
```

Validate length ≤ 500. Update.

**SET_CLONE_LABEL**

```
dispatch({ type: 'SET_CLONE_LABEL', operationId, cloneId, label });
```

Update label. Could be opt-in renaming (если biolog hates default «clone 1»).

### 5.2 selectors-pieces.js extension

```javascript
/**
 * Все clones в zone, grouped by parent op.
 * Returns Array<{
 *   op: Operation,
 *   clones: Array<MaterializedClone & {container?}>
 * }>
 */
export function selectClonesInZone(state, zoneId) {
  const ops = (state.operations || []).filter((op) =>
    op.zoneId === zoneId && op.materializedClones != null
  );
  return ops.map((op) => ({
    op,
    clones: op.materializedClones.map((c) => ({
      ...c,
      container: (state.containers || []).find((ctn) => ctn.id === c.cloneId),
    })),
  }));
}

/**
 * Summary: counts per status.
 */
export function selectSangerSummaryForZone(state, zoneId) {
  const grouped = selectClonesInZone(state, zoneId);
  const counts = { pending: 0, verified: 0, failed: 0, unplanned: 0 };
  for (const { clones } of grouped) {
    for (const c of clones) {
      if (c.sangerVerified === 'pending') counts.pending += 1;
      else if (c.sangerVerified === 'verified') counts.verified += 1;
      else if (c.sangerVerified === 'failed') counts.failed += 1;
      else counts.unplanned += 1;
    }
  }
  return { groupedByOp: grouped, counts };
}
```

### 5.3 sanger-helpers.js

```javascript
export const SANGER_STATUS_CYCLE = ['pending', 'verified', 'failed', null];

export function cycleSangerStatus(current) {
  const idx = SANGER_STATUS_CYCLE.indexOf(current);
  return SANGER_STATUS_CYCLE[(idx + 1) % SANGER_STATUS_CYCLE.length];
}

export function statusColor(status) {
  switch (status) {
    case 'verified': return 'var(--sanger-verified)';  // green
    case 'failed':   return 'var(--sanger-failed)';     // red
    case 'pending':  return 'var(--sanger-pending)';    // gray
    default:         return 'transparent';
  }
}

export function statusIcon(status) {
  switch (status) {
    case 'verified': return '✓';
    case 'failed':   return '✗';
    case 'pending':  return '○';
    default:         return ' ';
  }
}
```

### 5.4 SangerLabNotebook.jsx

```javascript
function SangerLabNotebook({ state, dispatch, zoneId, onClose }) {
  const summary = selectSangerSummaryForZone(state, zoneId);
  const [filter, setFilter] = useState('all');

  const filteredGroups = summary.groupedByOp.map(({ op, clones }) => ({
    op,
    clones: clones.filter((c) =>
      filter === 'all'
        || (filter === 'pending' && c.sangerVerified === 'pending')
        || (filter === 'verified' && c.sangerVerified === 'verified')
        || (filter === 'failed' && c.sangerVerified === 'failed')
    ),
  })).filter((g) => g.clones.length > 0);

  return (
    <aside className="sanger-lab-notebook">
      <header>
        <h3>{S.zones.sanger.title}</h3>
        <button onClick={onClose} aria-label="Закрыть">×</button>
      </header>
      
      <div className="summary-bar">
        <span className="count pending">{summary.counts.pending} {S.zones.sanger.pendingShort}</span>
        <span className="count verified">{summary.counts.verified} {S.zones.sanger.verifiedShort}</span>
        <span className="count failed">{summary.counts.failed} {S.zones.sanger.failedShort}</span>
      </div>
      
      <div className="filter-bar">
        {['all', 'pending', 'verified', 'failed'].map((f) => (
          <button
            key={f}
            className={`filter-button ${filter === f ? 'active' : ''}`}
            onClick={() => setFilter(f)}
          >
            {S.zones.sanger.filter[f]}
          </button>
        ))}
      </div>

      <div className="op-groups">
        {filteredGroups.map(({ op, clones }) => (
          <div key={op.id} className="op-group">
            <div className="op-header">
              <span className="op-kind">{op.kind}</span>
              <span className="op-name">{op.name || op.id.slice(0, 8)}</span>
            </div>
            {clones.map((clone) => (
              <SangerCloneRow
                key={clone.cloneId}
                clone={clone}
                opId={op.id}
                dispatch={dispatch}
              />
            ))}
          </div>
        ))}
      </div>
    </aside>
  );
}
```

### 5.5 SangerCloneRow.jsx

```javascript
function SangerCloneRow({ clone, opId, dispatch }) {
  const [notesValue, setNotesValue] = useState(clone.notes || '');
  const [editingLabel, setEditingLabel] = useState(false);
  const [labelValue, setLabelValue] = useState(clone.label || '');

  const handleStatusCycle = () => {
    const newStatus = cycleSangerStatus(clone.sangerVerified);
    dispatch({
      type: 'SET_CLONE_SANGER_STATUS',
      operationId: opId,
      cloneId: clone.cloneId,
      status: newStatus,
    });
  };

  const handleNotesBlur = () => {
    if (notesValue !== clone.notes) {
      dispatch({
        type: 'SET_CLONE_NOTES',
        operationId: opId,
        cloneId: clone.cloneId,
        notes: notesValue,
      });
    }
  };

  const handleLabelConfirm = () => {
    if (labelValue !== clone.label && labelValue.trim()) {
      dispatch({
        type: 'SET_CLONE_LABEL',
        operationId: opId,
        cloneId: clone.cloneId,
        label: labelValue.trim(),
      });
    }
    setEditingLabel(false);
  };

  return (
    <div className="sanger-clone-row" data-status={clone.sangerVerified || 'unplanned'}>
      <div className="label-area">
        {editingLabel ? (
          <input
            value={labelValue}
            onChange={(e) => setLabelValue(e.target.value)}
            onBlur={handleLabelConfirm}
            onKeyDown={(e) => { if (e.key === 'Enter') handleLabelConfirm(); }}
            autoFocus
          />
        ) : (
          <span onClick={() => setEditingLabel(true)} className="label-display">
            {clone.label}
          </span>
        )}
      </div>

      <SangerStatusPicker
        status={clone.sangerVerified}
        onCycle={handleStatusCycle}
        onSet={(status) => dispatch({
          type: 'SET_CLONE_SANGER_STATUS',
          operationId: opId,
          cloneId: clone.cloneId,
          status,
        })}
      />

      <textarea
        className="notes-area"
        value={notesValue}
        onChange={(e) => setNotesValue(e.target.value)}
        onBlur={handleNotesBlur}
        placeholder={S.zones.sanger.notesPlaceholder}
        rows={2}
        maxLength={500}
      />
    </div>
  );
}
```

### 5.6 SangerStatusPicker.jsx

```javascript
function SangerStatusPicker({ status, onCycle, onSet }) {
  return (
    <div className="sanger-status-picker">
      <button
        className={`segment ${status === 'pending' ? 'active' : ''}`}
        onClick={() => onSet('pending')}
        title={S.zones.sanger.statusLabel.pending}
        style={{ color: 'var(--sanger-pending)' }}
      >
        ○
      </button>
      <button
        className={`segment ${status === 'verified' ? 'active' : ''}`}
        onClick={() => onSet('verified')}
        title={S.zones.sanger.statusLabel.verified}
        style={{ color: 'var(--sanger-verified)' }}
      >
        ✓
      </button>
      <button
        className={`segment ${status === 'failed' ? 'active' : ''}`}
        onClick={() => onSet('failed')}
        title={S.zones.sanger.statusLabel.failed}
        style={{ color: 'var(--sanger-failed)' }}
      >
        ✗
      </button>
      <button
        className="reset"
        onClick={() => onSet(null)}
        title={S.zones.sanger.statusLabel.unplanned}
      >
        −
      </button>
    </div>
  );
}
```

### 5.7 BranchingVisual extension (T9 → T10)

Внутри clone-branch rendering:

```javascript
// В section 'clones' rendering:
{finals.map((c, idx) => {
  const op = parentOps[idx];  // или derived
  const cloneEntry = op?.materializedClones?.find((cl) => cl.cloneId === c.id);
  const status = cloneEntry?.sangerVerified;
  return (
    <div key={c.id} className="clone-branch">
      <span className="clone-label">{c.name || `clone ${idx + 1}`}</span>
      {status !== undefined && (
        <span
          className="sanger-indicator"
          style={{ color: statusColor(status) }}
          title={cloneEntry.notes || S.zones.sanger.statusLabel[status || 'unplanned']}
          onClick={(e) => {
            e.stopPropagation();
            dispatch({ type: 'SHOW_SANGER_LAB_NOTEBOOK', zoneId, focusCloneId: c.id });
          }}
        >
          {statusIcon(status)}
        </span>
      )}
    </div>
  );
})}
```

### 5.8 CanvasLayoutView mount extension

```javascript
const [sangerNotebookOpen, setSangerNotebookOpen] = useState(false);
const [sangerFocusCloneId, setSangerFocusCloneId] = useState(null);
const focusedZoneId = state.ui?.focusedZoneId;

// Hotkey B toggle
useHotkey('toggle-sanger-notebook', () => {
  setSangerNotebookOpen((v) => !v);
});

// Listen on dispatch SHOW_SANGER_LAB_NOTEBOOK (from BranchingVisual clone click)
// Implementation — пожалуй через ref pattern или global dispatch listener

return (
  <div className="canvas-page">
    <div className="canvas-area">
      {/* existing canvas content */}
    </div>
    {sangerNotebookOpen && focusedZoneId && (
      <SangerLabNotebook
        state={state}
        dispatch={dispatch}
        zoneId={focusedZoneId}
        focusCloneId={sangerFocusCloneId}
        onClose={() => setSangerNotebookOpen(false)}
      />
    )}
    {!sangerNotebookOpen && (
      <button className="open-sanger-button" onClick={() => setSangerNotebookOpen(true)} title={S.zones.sanger.openButton}>
        {S.zones.sanger.openIcon}
      </button>
    )}
  </div>
);
```

### 5.9 Hotkey B

`lib/hotkeys.js`:
```javascript
HOTKEYS['toggle-sanger-notebook'] = {
  keys: [{ key: 'b', ctrl: false, alt: false, shift: false }],
  scope: 'global',
  description: 'Открыть/закрыть Sanger lab notebook',
};
```

### 5.10 Design tokens (DESIGN_SYSTEM.md extension)

```
--sanger-verified: #16a34a;  /* green */
--sanger-failed:   #dc2626;  /* red */
--sanger-pending:  #6b7280;  /* gray */
--sanger-unplanned: transparent;
--sanger-notebook-bg: var(--surface-1);
--sanger-notebook-border: var(--border-1);
--sanger-row-hover: var(--surface-2);
```

### 5.11 STRINGS extension

```javascript
zones: {
  // ...existing
  sanger: {
    title: 'Sanger lab notebook',
    openButton: 'Открыть Sanger',
    openIcon: '📋',
    pendingShort: 'в ожидании',
    verifiedShort: 'подтверждено',
    failedShort: 'не прошло',
    filter: {
      all: 'Все',
      pending: 'В ожидании',
      verified: 'Подтверждено',
      failed: 'Не прошло',
    },
    statusLabel: {
      pending: 'В ожидании Sanger',
      verified: 'Подтверждено Sanger',
      failed: 'Не прошло Sanger',
      unplanned: 'Sanger не запланирован',
    },
    notesPlaceholder: 'Заметки (например: «мутация в позиции 234», «плохой read»)...',
    empty: 'Нет materialized колоний в этой зоне',
    hotkey: 'Хоткей: B',
  },
},
```

---

## 6. Порядок выполнения

**K1.** STRINGS check — после T8 strings.js может быть split'нут. Verify capacity. Если split — добавить strings в zones namespace file.

**K2.** `lib/sanger-helpers.js` — pure helpers (cycle, color, icon). ~5 unit tests.

**K3.** Actions:
- SET_CLONE_SANGER_STATUS.
- SET_CLONE_NOTES.
- SET_CLONE_LABEL.
- В `skeleton-state-operations.js`. ~6 reducer tests.

**K4.** Selectors:
- selectSangerSummaryForZone.
- selectClonesInZone.
- В `selectors-pieces.js`. ~4 tests.

**K5.** `canvas/SangerStatusPicker.jsx` — segmented control. ~3 component tests.

**K6.** `canvas/SangerCloneRow.jsx` — single row с editable fields. ~4 component tests.

**K7.** `canvas/SangerLabNotebook.jsx` — main panel. ~5 component tests.

**K8.** Hotkey B в `lib/hotkeys.js` + handler в `CanvasLayoutView.jsx`.

**K9.** SangerLabNotebook mount в `CanvasLayoutView.jsx` + toggle button (если notebook closed).

**K10.** Extend BranchingVisual для sangerVerified visual indicator (clones kind). ~3 tests.

**K11.** Design tokens (§5.10) + global CSS.

**K12.** STRINGS extension (§5.11).

**K13.** Manual smoke:
1. Создать zone, добавить piece с acquisitionMethod='pcr'. Auto-reaction (T8). Execute. Через op context-menu materialize 4 clones (T9 modal).
2. Hotkey B → SangerLabNotebook opens справа.
3. Видит 4 rows clone 1..4. All pending.
4. Click status «✓ verified» на clone 1 → row colors green. Counter updates.
5. Click «✗ failed» на clone 2 → row red.
6. Edit notes на clone 1 — «sequence verified, no mutations». Blur → saved.
7. Filter «verified» → только clone 1 visible.
8. Open BranchingVisual в sequence-mode (toggle S) — clones отображаются с цветными indicators (✓ зелёный clone 1, ✗ красный clone 2, ○ gray clones 3,4).
9. Click indicator на clone 1 в BranchingVisual → SangerLabNotebook focuses на clone 1.

**K14.** Size budget.

---

## 7. STOP-условие

Code останавливается после K14.

Отчёт:
```
## T10 Sanger MVP — отчёт
Commits: ...
Vitest: 2985 → 3015 pass / 1 skip / 0 fail (+30)
pytest: 112/112
vite build: clean

Size budget:
- canvas/SangerLabNotebook.jsx: ~11 KB (new) ✓
- canvas/SangerCloneRow.jsx: ~5 KB (new) ✓
- canvas/SangerStatusPicker.jsx: ~4 KB (new) ✓
- lib/sanger-helpers.js: ~3 KB (new) ✓
- CanvasLayoutView.jsx: ~25 KB (+1) ✓
- BranchingVisual.jsx: ~10 KB (+1) ✓
- store/skeleton-state-operations.js: X.X KB (+1) ✓
- store/selectors-pieces.js: X.X KB (+0.5) ✓

Manual smoke:
- Hotkey B toggles panel
- Status segments cycle через clicks
- Notes save on blur
- Filter работает
- BranchingVisual reflects status
- Click indicator → focus в notebook

Spec deviations: [list]
Открытые вопросы: [list]
```

---

## 8. Что делать при регрессии

1. **Status не сохраняется** — SET_CLONE_SANGER_STATUS reducer не находит clone. Verify cloneId === containerId.

2. **Notes ломаются длинные** — maxLength 500 enforced в textarea, но reducer не валидирует. Add validate (truncate or reject if > 500).

3. **Hotkey B активирует в textarea notes** — useHotkey resolver guard — пропустить если target — textarea.

4. **BranchingVisual indicator не updates** — selectSangerSummaryForZone re-computes но React не re-render. Verify dependencies в useMemo или re-fetch при state change.

5. **Filter «verified» показывает op group с 0 clones** — `.filter((g) => g.clones.length > 0)` сделать после filter clones.

---

## 9. Риски

### R-T10-1 — Panel ширина 360px перекрывает canvas
**Risk:** На narrow screen (1024×768) — canvas становится ~660px wide, узлы overlapped.
**Mitigation:** Panel default 360px. Resize handle — drag width 240-500px. Persist preferred width в local storage (post-MVP).

### R-T10-2 — Notes saving на blur — потеря если biolog закрыл panel прежде blur
**Risk:** Печатаешь notes, hotkey B closes panel → blur не fires? Browser может call blur при unmount, но не гарантировано.
**Mitigation:** save on each keystroke debounce 500ms ИЛИ on panel close — force flush pending writes. T10 — basic blur. Edge case bug — отмечается как открытый вопрос, fix в hotfix.

### R-T10-3 — Materialized clones удалены — clones в notebook stale
**Risk:** Биолог удалил materializedClones через op context-menu «un-materialize» (T-future feature). Notebook показывает gone clones.
**Mitigation:** T10 has no un-materialize. Если op деleted — cascade T9. selectClonesInZone refetches.

### R-T10-4 — BranchingVisual click on indicator — не открывает SangerLabNotebook
**Risk:** Dispatch SHOW_SANGER_LAB_NOTEBOOK не handled в CanvasLayoutView.
**Mitigation:** SHOW_SANGER_LAB_NOTEBOOK — это **UI state**, не data state. Реализовать через event bus / direct state setter. T10 — добавить ref-based mechanism или local state hook.

### R-T10-5 — Performance: 96 clones × textarea editing
**Risk:** Notebook с 96 rows — DOM heavy. Each row имеет textarea, status picker, label.
**Mitigation:** Virtualization (react-window) — post-MVP. T10 acceptable для realistic clone counts (4-12). Бумажная диаграмма — макс 8 colonies per construct.

### R-T10-6 — Per-zone scope confusing для biolog
**Risk:** Биолог смотрит на zone A, открывает Sanger panel, видит clones из A, переключился на zone B — panel content silently changed.
**Mitigation:** Header panel показывает «Zone: {name}». Если confusing — добавить explicit selector «Zone: ▾ {dropdown}». T10 — basic, biolog learns through usage.

---

## 10. Открытые вопросы для Chat

1. Panel toggle через hotkey B vs always-visible bottom bar? T10 default — toggle panel right. Если biolog wants persistent bottom drawer — T-future config.
2. Status reset (× button) — return к 'pending' или null? Default null (Sanger не запланирован). Biolog может потом set обратно 'pending'.
3. Clone label rename — persistent в op.materializedClones[i].label OR also на container.name? Default — only label. container.name — auto-name from MATERIALIZE_REACTION, biolog edit через container context-menu.
4. Notes на clone — что pre-fill при first edit? Default — empty. Если biolog wants template «mutation at: ___, read quality: ___» — T-future template feature.

---

## 11. Pre-handoff чеклист

- [x] Срез размеров + STRINGS post-T8 check.
- [x] Контекст + reference на T9.
- [x] Scope IN/OUT.
- [x] DEC-T10-01..12.
- [x] Components + actions + helpers.
- [x] K1-K14.
- [x] STOP-условие.
- [x] 6 рисков.
- [x] Открытые вопросы.
- [x] Размер 35-45 KB target.
- [x] Reference на якорь + T9.
- [x] No AB1 / read parsing (явный scope OUT, post-MVP).

---

**Дата:** 16.05.2026.
**Якорь:** SPEC_M-CANVAS-FOUR-TIER-ARCHITECTURE.md DEC-CANVAS-4T-18, 19.
**Следующее после T10:** Архивация F1-F4 + A1-A4+D1+G1+G2+PROTOTYPE-PCR в `docs/archive/2026-05-16-pre-four-tier/`. Update CURRENT_TASK.md, COMPONENT_MAP.md. Handoff Code на T1.
