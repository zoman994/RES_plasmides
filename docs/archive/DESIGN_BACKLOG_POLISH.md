# DESIGN_BACKLOG_POLISH.md

> **Назначение.** Design idea storage для M-CANVAS-POLISH sprint (Wave 1, перед M-CANVAS-MERGE) либо future polish work. Содержит accumulated design ideas от Claude-design conversations + own observations + design issues замеченные by Игорь во время разработки.
>
> **Зачем сейчас.** Игорь упомянул что у него от Claude-design «куча полировочных вещей для интерфейса». Эти идеи **теряются между sessions** если не зафиксировать. Через 1-2 месяца half идей забудется.
>
> **Critical action для Игоря (NOW):** попроси Claude-design **прямо сейчас пока в памяти свежо** compile все накопленные design ideas в один list grouped by component (Sidebar / LibraryTree / Canvas / ContainerBlock / Editor / OpPopup / Modals / Typography). Скопируй сюда. Иначе через неделю context lost.
>
> **Правила.**
> - **Grouped by component** — easy to scan когда работаем над конкретным компонентом.
> - **Format каждой entry:** дата + 1-2 sentence description + tag (`[STRUCTURAL]` — actionable now, `[DECORATIVE]` — wait until POLISH).
> - **Structural vs decorative:**
>   - **Structural** = layout, accessibility, contrast, responsive behavior, keyboard navigation — **апплицировать в любое время**, не сломается от operations.
>   - **Decorative** = точные тени, micro-animations, easing curves, specific colour shades — **wait until M-CANVAS-POLISH** (после operations стабилизируются). Decorative может стать irrelevant если operations меняют layout.
>
> **Monthly review** — re-read, что-то deprecate (outdated после изменений), что-то promote в active sprint todo.
>
> **Создан:** 12.05.2026. Shell by Chat. Content fills in by Игорь.

---

## 1. Action для Игоря — collect design ideas now

**Не оставляй на потом.** Через неделю half идей забудется.

1. Открой свои Claude-design conversations (Projects → Claude design либо подобный).
2. Попроси Claude-design **новой одной просьбой**: «Compile all design suggestions ты дал за последние N conversations в structured list grouped by component (Sidebar / LibraryTree / Canvas / ContainerBlock / Editor / OpPopup / Modals / Typography). Each suggestion 1-2 sentences. Mark structural vs decorative.»
3. Скопируй output в sections 2-9 ниже.
4. Когда новые ideas придут в будущих Claude-design sessions — добавляй sразу сюда (append-only).

---

## 2. Sidebar

**Structural ideas:**
- (заполни — например, ширина sidebar / spacing tokens / sections collapsed by default / hover states / active section indicator)

**Decorative ideas:**
- (заполни — например, exact colours, transitions)

---

## 3. LibraryTree

**Structural ideas:**
- (заполни — tree row height, indent levels, icon sizes, drag-target affordance, hover preview)

**Decorative ideas:**
- (заполни)

**Sub-component: TrashZone (полировка post-acceptance):**
- (заполни)

**Sub-component: AddModal:**
- (заполни — first-screen visual, file-drop zone affordance)

---

## 4. Canvas

**Structural ideas:**
- (заполни — canvas background pattern, zoom levels, mini-map overlay, scroll behavior)
- Compact / Expanded view toggle (обсуждалось 12.05.2026) — circular ContainerBlock для review, rectangular для overview. ⇒ Кандидат на M-CANVAS-CONTAINER-VIZ либо M-CANVAS-POLISH.

**Decorative ideas:**
- (заполни — canvas grid опционально, smooth pan, drag-and-drop ghost preview)

**Sub-component: Junctions:**
- Per-kind stitch markers (overlap-parallelogram / GG-arrows / RE-zigzag / KLD-dots / ligation-bars) — harvested из v0.5 палитры, **structural OK** для current state.
- (заполни — improvements? animations on hover? clickable badge styling?)

**Sub-component: Operations (when ready post-OPS):**
- Status visualization (draft dashed / committed solid / executed checkmark / failed red) — обсуждалось в OPS sprint K5. (заполни — Claude-design suggestions?)

---

## 5. ContainerBlock

**Structural ideas:**
- (заполни — block size, hover state, drag feedback, selected state, frozen lock 🔒 overlay)
- Затенение «что удаляем» в Cut preview (12.05.2026 conversation) — для **preview в OpPopup**, не на canvas-level (М-CANVAS-OPS-PREVIEWS).
- Possibly затенение на canvas-level ContainerBlock когда operation hover — **открытый вопрос**, кандидат POLISH.

**Decorative ideas:**
- (заполни — colors per topology circular/linear, badge styling, text hierarchy)

**Sub-variant: OligonucleotideBlock (M-CANVAS-OPS K10):**
- (заполни — design suggestions для two-sequence display)

**Sub-variant: PlaceholderBlock:**
- (заполни — dashed border / + icon contrast / drag-target hint)

---

## 6. Editor (ContainerEditorSkeleton)

**Structural ideas:**
- (заполни — tabs layout, title bar height, content area scrolling, side panel proportions)
- Frozen banner styling — red banner при `container.frozen === true` (M-CANVAS-OPS DEC-OPS-08). (заполни — colour, position, dismiss?)
- Save As fork button styling.

**Decorative ideas:**
- (заполни)

**Sub-component: SequenceTab + LinearFeatureBar:**
- (заполни — track heights, feature label positioning, ruler tick marks)

**Sub-component: AnnotationsTab:**
- (заполни — annotation list density, sorting controls, filter affordance)

**Sub-component: HistoryTab:**
- (заполни — timeline density, commit message styling)

**Sub-component: FeatureEditorModal:**
- (заполни — modal proportions, field grouping, button hierarchy)

---

## 7. OpPopup (M-CANVAS-OPS)

**Structural ideas:**
- Inline popover positioning (anchored to operation), viewport-aware adjustment.
- Hard cap 8 KB на kind-specific popup (DEC-OPS-06). Если разрастается — extract sub-components.
- (заполни Claude-design suggestions — header / body / footer layout)

**Sub-component: OpKindPicker:**
- 3x2 grid (6 tiles: PCR / Cut / Gibson / Ligate / KLD / Mutagenesis).
- (заполни — tile sizes, icons, descriptions)

**Sub-component: PreviewSection (M-CANVAS-OPS-PREVIEWS):**
- Collapsible header «Preview» + body + error banner slot.
- (заполни — colour codes для error banner, visual hierarchy)

**Decorative ideas:**
- (заполни — popup shadow, entry/exit transitions)

---

## 8. Modals (PlaceholderTreePicker, JunctionMethodPicker, ManualEditConfirmModal, etc.)

**Structural ideas:**
- (заполни — modal proportions, backdrop, dismiss affordance)

**Decorative ideas:**
- (заполни — entrance transition, focus management)

---

## 9. Typography / spacing / colours (global)

**Structural ideas:**
- (заполни — typography scale, spacing tokens, focus ring styling, contrast ratios)
- Consistent с `lib/feature-palette.js` (⚓ DEC) + `canvas/junction-styles.js` (DEC-CANVAS-V2-JUNCTION-PALETTE-V05-01).

**Decorative ideas:**
- (заполни — exact colour values, shadow stack, transition timings)

---

## 10. Cross-cutting

**Accessibility:**
- (заполни — keyboard navigation, screen reader labels, focus indicators)
- TD-SEQUENCEVIEW-FOCUS-RING — existing tech debt, низкий priority.

**Responsive:**
- Mobile out of scope (DEC-V2-19 ⚓). Tablet — open question, низкий priority.
- Desktop minimum 1280px width — confirmed?

**Dark mode:**
- (заполни — supported, planned, либо явно не приоритет)

**Loading states:**
- (заполни — skeleton loaders, spinner styling)

**Error states:**
- (заполни — banner styling, recovery affordance)

**Empty states:**
- (заполни — first-time canvas, empty Library, no results search)

---

## 11. Monthly review notes

**Next review:** ~12.06.2026.

**Review actions:**
1. Re-read all sections.
2. Что-то outdated после code changes? Deprecate.
3. Что-то ready для M-CANVAS-POLISH? Tag `[ACTIONABLE]`, move в sprint todo.
4. Что-то structural и можно apply now? Move в current sprint scope (если он не blocking).

**Review log:**
- (placeholder для monthly entries)

---

_Создан 12.05.2026 поздний вечер. Shell by Chat. Action для Игоря — fill in design ideas из Claude-design conversations НЕМЕДЛЕННО пока в памяти свежо. Через неделю context lost._
