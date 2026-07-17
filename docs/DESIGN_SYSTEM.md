# BodgeGene design system

**Status:** current implementation contract. CSS variables in `gui/designer/src/index.css`, icons in `components/icons/` and feature colors in `theme.js` / `feature-palette.js` are the executable source of truth.

## 1. Character

BodgeGene is a dense scientific workbench, not a marketing dashboard. The interface should feel calm, precise and inspectable: warm neutral surfaces, amber interaction accent, compact controls, clear hierarchy and monospaced biological data.

Avoid decorative gradients, arbitrary color families, emoji as production icons and oversized cards that reduce the amount of sequence or project context on screen.

## 2. Tokens

Use semantic CSS variables, never a raw theme-dependent color in a component.

### Surfaces and text

- `--surface-base`, `--surface-1`, `--surface-2`, `--surface-3`
- `--border-subtle`, `--border-default`, `--border-strong`
- `--text-primary`, `--text-secondary`, `--text-tertiary`, `--text-disabled`
- `--sequence-canvas-bg` for sequence-specific contrast

### Interaction and status

- `--accent-50/100/300/500/700`, `--accent-text`
- `--success-bg/fg`, `--warning-bg/fg`, `--danger-bg/fg`, `--info-bg/fg`

Status color must be accompanied by text, icon, pattern or geometry. Never encode a biological verdict by color alone.

### Geometry

- radii: `--radius-sm/md/lg/xl/pill`
- shadows: `--shadow-sm/md/lg/xl`
- UI font: `--font-ui` (Inter with system fallback)
- sequence/code font: `--font-mono` (JetBrains Mono with system fallback)

Use the existing spacing rhythm and nearby components. When a new shared spacing or size is genuinely recurrent, add a named token rather than scattering similar literals.

## 3. Light and dark themes

Every user-facing component must work under both `[data-theme="light"]` and `[data-theme="dark"]`.

- Prefer semantic tokens so theme changes are automatic.
- Do not add inline hex fallbacks such as `var(--token, #fff)` in React code. Missing design tokens should fail visibly in development and be fixed centrally.
- Data colors that carry stable biological meaning may remain theme-independent only when contrast is tested in both themes.
- Portals must receive the active theme context.

## 4. Biological colors

Feature colors follow the colorblind-conscious palette in `theme.js` and `feature-palette.js`. Components request a color from those modules; they do not maintain a second type-to-color map.

Nucleotide/Sanger colors and restriction/annotation colors are domain semantics, not general UI accents. Do not reuse them for ordinary buttons or navigation.

## 5. Components and interaction

### Buttons

- Primary: one clear action per local decision surface.
- Secondary/ghost: supporting actions.
- Destructive: explicit label and danger semantics; confirm when data loss is not immediately reversible.
- Icon-only controls require an accessible name and tooltip where the meaning is not universal.

### Fields and menus

- Every field has a visible label or an equivalent accessible name.
- Menus and comboboxes use the shared keyboard/ARIA primitives.
- Disabled controls are inert in both mouse and keyboard paths.
- Do not nest buttons or links inside `role="option"`.
- IME composition must not trigger commands, parsing or commits prematurely.

### Panels and dialogs

- Keep the biological object and action context visible.
- Use a dialog only for a bounded decision; use workspaces/panels for sustained editing.
- Escape closes only the current transient surface, not an unrelated parent workflow.
- Focus enters a newly opened transient surface and returns to its trigger on close.

### Feedback

- Loading, empty, incomplete, blocked and error are distinct states.
- “No matches” is shown only after the relevant check completed.
- Notifications state what happened and, when useful, the next action.
- Long operations expose progress/cancel when their duration is perceptible.

## 6. Accessibility

- Global `:focus-visible` must remain visible; never use `outline: none` without an equally visible replacement.
- Keyboard order follows visual order.
- Stable entity keys back selection and `aria-activedescendant`; array indices are not identities.
- One owner announces a changing state. Avoid nested or competing live regions.
- Localized text is provided by the domain container/i18n layer, not hard-coded inside generic primitives.
- Aim for readable contrast and zoom/reflow before visual polish.

## 7. Icons and typography

Use icons from `components/icons/`. Add a reusable SVG icon there if needed; do not introduce emoji or a one-off icon library for one control.

Use proportional text for UI and monospaced text for sequences, coordinates, enzyme sites, hashes and code-like identifiers. Disable ligatures in sequence/code contexts.

## 8. Implementation checklist

Before accepting a visual change:

1. Reuse existing component and token vocabulary.
2. Check light and dark themes.
3. Check keyboard, focus and accessible names.
4. Check empty/loading/error/incomplete/disabled states.
5. Verify long biological names, large coordinates and narrow panels.
6. Run focused component tests, scoped lint and the integrated browser smoke required by the task.

Mockups and prototypes are references, not runtime contracts. If they disagree with accessible working code, update the mockup or record a deliberate design decision rather than copying it blindly.
