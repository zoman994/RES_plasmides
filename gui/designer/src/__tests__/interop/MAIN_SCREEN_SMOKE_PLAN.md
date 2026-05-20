# MS-K7 — Main screen manual smoke plan

> Browser-level verification of `SPEC_MAIN_SCREEN_CLEANUP` deltas.
> Implemented: K1 (sidebar cleanup). Deferred: K2 (MainPanel restructure),
> K3 (HelpPopover), K4 (Drop file handler), K5 (Conditional rendering),
> K6 (Settings PWA install section).

## Steps

### 1. Sidebar cleanup

- Open the main screen (`http://127.0.0.1:3000`).
- Sidebar items present: «+ Создать проект» / «↑ Загрузить .bodge» / «⤓ Импорт .gb/.dna» / «⌂ Главная» / «▦ Библиотека» / «📂 Все проекты» / pinned projects / Theme toggle / Settings / version footer.
- Sidebar items REMOVED (MS-K1):
  - «📦 Праймеры soon» disabled stub.
  - «📂 Открыть проект» dev-only entry.
  - «РАБОЧЕЕ МЕСТО» / «СПРАВКА» section labels.
  - «📖 Руководство» / «⌨ Хоткеи» (moved to MainPanel «?» popover — MS-K3 follow-up).
  - «↓ Установить» PWA footer button (moved to SettingsModal — MS-K6 follow-up).

### 2. «Все проекты» opens command palette

- Click «📂 Все проекты» in sidebar.
- Command palette modal opens (existing behavior, just relocated entry).

### 3. Pinned projects unchanged

- «В работе N/15» section + pinned project rows still functional.
- Click pinned row → activates project.

### 4. Footer

- Footer shows: Theme toggle / Settings / version. No PWA install button.

### 5-7. Deferred items

- MS-K2 (MainPanel restructure to primary CTA + 2-card row): not implemented.
- MS-K3 (HelpPopover with 3 tabs): not implemented; Хоткеи modal accessible via legacy Ctrl+? hotkey path.
- MS-K4 (drop sequence files anywhere → Library): not implemented.
- MS-K5 (conditional library banner / ⭐): not implemented.
- MS-K6 (PWA install in SettingsModal): not implemented; install entry-point removed from sidebar but not yet relocated.

## Reporting

```
Step 1 (sidebar cleanup):     PASS / FAIL
Step 2 (Все проекты opens):   PASS / FAIL
Step 3 (pinned unchanged):    PASS / FAIL
Step 4 (footer no PWA):       PASS / FAIL
Step 5 (MainPanel):           DEFERRED
Step 6 (HelpPopover):         DEFERRED
Step 7 (drop handler):        DEFERRED
Step 8 (PWA in Settings):     DEFERRED
```
