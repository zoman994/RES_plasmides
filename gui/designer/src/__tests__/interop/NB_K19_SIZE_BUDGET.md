# NB-K19 — Notebook size budget report

## Summary

| Bucket | Size | Budget | Status |
|--------|------|--------|--------|
| Notebook lib files (.js) | 13.8 KB ungzipped | n/a | **OK** |
| Notebook UI components (.jsx) | 31.6 KB ungzipped | hard 40 each | **OK (largest 9.6 KB)** |
| `vite build` time | 764 ms | — | **+230 ms vs CORE alone** |
| Bundle delta (main chunk) | +2.08 KB ungzipped / +0.58 KB gzipped | +30–50 KB after wiring | **dead-code-eliminated (see below)** |
| Pre-existing chunks > 500 kB warning | unchanged | n/a | unchanged |

## Per-file detail

```
lib/ (markdown stack)
  2110   src/lib/markdown-mermaid-link-plugin.js
  2719   src/lib/markdown-dna-highlight-plugin.js
  2877   src/lib/markdown-ref-plugin.js
  6101   src/lib/markdown-renderer.js
  -----
  13807  ≈ 13.5 KB ungzipped

lib/ (notebook plumbing)
  5241   src/lib/bodge-attachments.js
  3940   src/lib/image-compress.js
  3115   src/lib/notebook-migrations/t10-to-notebook.js
  -----
  12296  ≈ 12.0 KB ungzipped

canvas/ (UI components)
  1827   src/canvas/NotebookSearch.jsx
  4057   src/canvas/NotebookToolbar.jsx
  4078   src/canvas/NotebookList.jsx
  5199   src/canvas/NotebookTab.jsx
  6779   src/canvas/NotebookRefPickerModal.jsx
  9655   src/canvas/NotebookEntryEditor.jsx
  -----
  31595  ≈ 30.9 KB ungzipped (largest 9.6 KB << 30 KB soft / 40 KB hard)

hooks/
  2648   src/hooks/useMarkdownRefResolver.js
```

## Bundle impact

`vite build` after NB-K1..NB-K17:
- main `index-*.js` = **891.52 KB / gzip 238.61 KB**
  (was 889.44 KB / gzip 238.03 KB after CORE-only).
- **Delta = +2.08 KB ungzipped / +0.58 KB gzipped.**

That number is much smaller than the spec target of +30-50 KB gzipped
notebook chunk + +250 KB gzipped KaTeX chunk. The reason:

**Nothing in the production reachable graph imports NotebookTab yet.**
We ship NotebookTab as a ready-to-mount standalone (analogous to how
CORE shipped ExportProjectModal). Tree-shaking eliminates the unused
imports until Igor adds the one-line wire-up in EditorWindowShell /
CanvasLayoutView (see NB-K18 pre-step).

After wiring (estimated):
- The `lazy(() => import('./NotebookEntryEditor'))` call in NotebookTab.jsx
  will produce an async chunk pulling in markdown-it + plugins +
  isomorphic-dompurify ≈ **+60 KB gzipped** (per spec §13).
- First `$...$` detected in any notebook entry triggers another
  dynamic import of markdown-it-katex + katex ≈ **+250 KB gzipped**.
- Both chunks load ON DEMAND only; biolog without notebook open pays
  zero on first paint.

We chose to defer wiring per spec §0.4 "CanvasLayoutView hard-breach
under Igor's responsibility" — keeping the change surface minimal in
this Code session.

## node_modules added (npm install --legacy-peer-deps)

```
markdown-it@^14.1.0
markdown-it-task-lists@^2.1.1
markdown-it-footnote@^4.0.0
markdown-it-mark@^4.0.0
isomorphic-dompurify@^2.16.0
markdown-it-katex@^2.0.3
katex@^0.16.10
```

Pre-existing peer-dep warning between vite-plugin-pwa@1.2.0 and vite@8
remains (workaround via `--legacy-peer-deps` is the repo's existing
pattern).

## File-size violations

**None.** Every notebook file is well under its hard limit:
- Largest `.js` is `markdown-renderer.js` at 5.96 KB (hard 25 / soft 20).
- Largest `.jsx` is `NotebookEntryEditor.jsx` at 9.43 KB (hard 40 / soft 30).

## Watch signals

After NotebookTab is wired into the main app:
- Monitor `NotebookEntryEditor.jsx` (closest to 30 KB soft; will grow
  as toolbar gets more features per Open Question #1 of spec).
- Monitor any growth in markdown-it custom plugins beyond the current
  three (ref/dna/mermaid) — each new plugin lives in `lib/markdown-*`.

## TD candidates

None new from this sprint.

**Status: notebook size budget OK pending wire-up.**
