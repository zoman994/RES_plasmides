# NB-K18 — Notebook manual smoke test plan

> **Why manual?** K2-K17 cover the markdown/sanitization/attachment/
> KaTeX/migration logic. The 7-step flow below verifies the full UX
> works as a coherent journal experience and the bundle splitting is
> real (notebook chunk ~60 KB lazy, KaTeX chunk ~250 KB lazy).
>
> Run this after the M-FORMAT-V2-CORE smoke plan acceptance (Igor +
> Chat session). Drop a screenshot per step into Chat for sign-off.

## Prerequisites

- BodgeGene v0.9.0+ (`npm run dev`, [http://127.0.0.1:3000](http://127.0.0.1:3000)).
- One v2 project from the CORE smoke plan with at least one container
  and one assembly.

## Pre-step — wire NotebookTab into CanvasLayoutView (one-time)

Currently the notebook UX ships as a standalone `NotebookTab.jsx`
ready to mount. CORE shipped ExportProjectModal the same way. To
exercise the smoke plan, add (one-line each):

1. `EditorWindowShell.jsx` — append a `{ key: 'notebook', label: 'Журнал' }`
   tab entry when `state.notebook.entries.length > 0` OR always
   (decision pending — see Open Question #6 in spec).
2. `EditorWindowShell.jsx` — render `<NotebookTab ... />` when active
   tab is `notebook`, with `notebookEntries={state.notebookEntries}`,
   `attachments={state.notebookAttachments}` (built via
   `loadAttachments` on file open), `entityState={...}`, and the
   four callback props.

Estimated diff: ~20 lines in EditorWindowShell.jsx, ~5 lines in
CanvasLayoutView.jsx (button on canvas → focusEditorTab('notebook')).
Under Igor's responsibility per spec §0.4 hard-breach note.

## Steps (7)

### 1. Open notebook tab — lazy chunk loads

1. Click «Журнал» tab (or the «+ Журнал» button if shown).
2. Observe: ~100-300 ms first-paint latency on the first open while
   markdown-it + plugins load. Subsequent tab opens are instant.
3. Verify in DevTools Network panel: a chunk like
   `NotebookEntryEditor-<hash>.js` (~60 KB gzipped) loaded only now.

✅ PASS if tab opens and lazy chunk visible in network log.

❌ FAIL if main bundle grew >50 KB (would mean lazy split didn't take).

### 2. Create entry + type markdown with table

1. Click «+ Запись» → new free-text entry appears in the list.
2. Type a title like «PCR test 19.05».
3. In the textarea, type:

```markdown
## Цель

Амплифицировать pks4 upstream homology.

| Праймер | Tm | Длина |
|---------|----|----|
| fwd | 60.2 | 25 |
| rev | 58.4 | 24 |

- [x] Запустить ПЦР
- [ ] Снять гель
```

4. Observe live preview render the table + task list.

✅ PASS if table + task list render correctly.

### 3. Drag-drop image → embeds in markdown

1. Take screenshot of gel (Win+Shift+S / Cmd+Shift+4) — save as gel.png.
2. Drag gel.png from desktop into the textarea.
3. Markdown snippet `![gel.png](att<id>.png)` inserted at cursor.
4. Preview shows the gel image rendered.

✅ PASS if image embeds and renders in preview.

❌ FAIL if drop is ignored, or image fails to render with «(missing)»
placeholder despite being in the attachments map.

### 4. Click @@ → ref picker → insert snippet

1. Click «@@» button in toolbar.
2. Ref picker modal opens with 7 tabs (Containers, Zones, ...).
3. Select «Zones» tab → click your assembly name.
4. Modal closes, snippet `@@ref:zone:zn<id>@@` inserted at cursor.
5. Preview shows clickable badge «→ <zone-name>».

✅ PASS if snippet inserts AND preview renders resolved label
(not just the short ID).

### 5. Type $T_m = 60°C$ → KaTeX lazy-loads

1. Add line: `Целевая Tm: $T_m = 60°C$`.
2. First $-detect triggers dynamic import of markdown-it-katex (~250 KB).
3. Preview renders the formula via KaTeX.
4. DevTools Network: KaTeX chunk visible (only this once per session).

✅ PASS if KaTeX renders + chunk visible in network log.

### 6. Ctrl+S → export .bodge → close → re-open → entry persists

1. Press Ctrl+S in the textarea (immediate flush of debounce).
2. File → Save (the existing v2 .bodge save path).
3. Close the project tab.
4. File → Open → pick the same .bodge.
5. Verify the notebook tab is visible with the entry intact, gel
   image renders, @@ref badge resolves to zone label, formula
   re-renders.

✅ PASS if all content survives round-trip.

❌ FAIL if image is broken (would mean
`notebook/attachments/<id>.<ext>` write or `loadAttachments` resolve
failed).

### 7. T10 migration: click clone row → opens auto-created Sanger entry

1. Open a v0.8.x project that has `op.materializedClones[].notes`
   from before the notebook layer existed.
2. On open, migration toast: «Конвертированы Sanger-заметки в журнал.»
3. Open the T10 right panel (hotkey B).
4. Click a clone row in the Sanger panel.
5. Notebook tab activates, jumps to the corresponding `kind: 'sanger'`
   entry. Text = original `clone.notes` content. Refs = [operation,
   clone].

✅ PASS if migration runs once + click routes to the right entry.

❌ FAIL if the toast appears twice on re-open (idempotency broken).

## Reporting

```
Step 1 (lazy chunk load):     PASS / FAIL — <ms latency>
Step 2 (markdown + table):    PASS / FAIL
Step 3 (drag-drop image):     PASS / FAIL
Step 4 (@@ ref picker):       PASS / FAIL
Step 5 (KaTeX lazy):          PASS / FAIL — <ms latency>
Step 6 (round-trip):          PASS / FAIL
Step 7 (T10 migration):       PASS / FAIL
```

Plus three screenshots:
- Network panel showing notebook chunk + KaTeX chunk.
- Preview pane rendering the table + image + @@ref badge + formula.
- Migration toast after opening v0.8.x file.

Drop in Chat to finalise the M-FORMAT-V2-NOTEBOOK acceptance.
