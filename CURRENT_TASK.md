# CURRENT_TASK — ASM-6A: модалка владеет клавиатурой

**Статус:** ACTIVE, контракт заморожен 06.09.2026 после read-only аудита DOC-09.

## Основание и режим

- Accepted base: `47f72a2198dbc9b9b79bfe42bea93b22120b8b2b` (`INFRA-GATE-2`).
- Writer mode: solo; Integration owner: Codex; writable checkout только
  `D:\RESplasmide`.
- Владелец разрешил реализацию, exact stage/commit, bundle и обычный push. Tag не
  создаётся: имя не задано.
- Один decision center и один tracker. Три read-only аудита подтвердили, что DOC-09
  смешивал независимые UI, editor-flow и biological цели; этот пакет принимает только
  keyboard/modal boundary из BG-078/BG-079.

## Что это даст пользователю

Открытый диалог становится настоящей стеной: одно Escape закрывает только верхний
диалог; Ctrl+Z, Tab, E и Ctrl+R не меняют скрытый canvas и не перезагружают вкладку.
После закрытия вложенного SequenceView исходный assembly Ctrl+R снова работает, потому
что registry восстанавливает предыдущий handler.

## Наблюдаемый контракт

1. Общий modal-boundary регистрирует каждый открытый слой в LIFO-stack. Escape из
   верхнего слоя или при оставшемся на opener фокусе закрывает ровно topmost; cleanup
   non-top слоя не меняет topmost. Остальные keydown сначала доступны контролу внутри
   диалога, затем не всплывают в React-родителя.
2. Каждый целевой modal root несёт `data-modal-open=""` и
   `data-block-global-hotkeys="true"`: RangePickerModal, MutationModal,
   CircularizeModal, OpGroupPicker, AAMutationDialog, DigestFragmentPicker,
   PromptModal, SettingsModal, ProjectInfoModal, HotkeyCheatsheet.
3. Global resolver при открытом blocking-modal не вызывает app handler. Если chord
   совпадает с HOTKEYS, он гасит browser default; незарегистрированные браузерные/текстовые
   клавиши (например Ctrl+C) не гасит.
4. Registry хранит стек регистраций на id. Вызывается последний; exact unregister
   восстанавливает предыдущий, включая снятие non-top и повторную регистрацию той же
   функции.
5. Вне модалки отсутствие handler сохраняет прежний контракт: resolver возвращает
   false и не гасит browser Ctrl+R. Формулировка DOC-09 «гасить всегда» отклонена: она
   маскировала бы registry-дефект и навсегда отняла обычный reload вне PCR/assembly.
6. Expanded-primer Escape действует только в `sequence-view-root` event target. Для
   target вне любого viewer остаётся document fallback, чтобы не сломать принятый P16
   focus-outside контракт.
7. `useUndoHotkey` и `useTabHotkey` не меняются: они уже fail-closed при наличии
   `[data-modal-open]`; реальные тесты доказывают их поведение.

## Production manifest

- `CURRENT_TASK.md`;
- `gui/designer/src/hooks/useModalKeyboardBoundary.js` (new);
- `gui/designer/src/lib/hotkeys.js`;
- `gui/designer/src/components/SequenceView/hooks/usePrimerHotkeys.js` (comment-only,
  удаляет устаревшее описание однослотового registry);
- `gui/designer/src/components/CanvasSkeleton/editor/assembly-mode/RangePickerModal.jsx`;
- `gui/designer/src/components/CanvasSkeleton/editor/assembly-mode/MutationModal.jsx`;
- `gui/designer/src/components/CanvasSkeleton/editor/assembly-mode/CircularizeModal.jsx`;
- `gui/designer/src/components/CanvasSkeleton/editor/assembly-mode/OpGroupPicker.jsx`;
- `gui/designer/src/components/CanvasSkeleton/editor/assembly-mode/AAMutationDialog.jsx`;
- `gui/designer/src/components/CanvasSkeleton/editor/assembly-mode/DigestFragmentPicker.jsx`;
- `gui/designer/src/components/PromptModal.jsx`;
- `gui/designer/src/components/SettingsModal.jsx`;
- `gui/designer/src/components/ProjectInfoModal.jsx`;
- `gui/designer/src/components/HotkeyCheatsheet.jsx`.

Proof manifest:

- `gui/designer/src/hooks/__tests__/use-modal-keyboard-boundary.test.jsx` (new);
- `gui/designer/src/lib/__tests__/hotkeys.test.js`;
- `gui/designer/src/components/SequenceView/__tests__/use-primer-hotkeys.test.jsx`;
- `gui/designer/src/__tests__/hotkey-flow.integration.test.jsx`;
- `gui/designer/src/components/__tests__/modal-keyboard-boundary-wiring.test.jsx` (new);
- `gui/designer/src/components/CanvasSkeleton/editor/__tests__/use-undo-hotkey.test.jsx`;
- `gui/designer/src/components/CanvasSkeleton/editor/__tests__/use-tab-hotkey.test.jsx` (new).

Planner tracker sync после acceptance/blocker: `BUGS.md`, `docs/BACKLOG.md`,
`PROJECT_STATE.md`.

## OUT / исправления исходного DOC-09

- IntentDialog отсутствует и остаётся ACT-3 OUT.
- PiecePrimersPickModal, PieceCreateModal и AddModal audit — отдельный остаток BACKLOG.
- Deterministic range insertion, BG-081 primer context, BG-009 op-groups,
  REMOVE_ZONE и тестовый `__v88_re_click__` — отдельные последовательные пакеты.
- BG-010 ждёт продуктового выбора: реальный order workflow или удаление ложной команды.
- BG-005/BG-013 вынесены в high-risk MUT-1. Объект point annotation из DOC-09
  contract-invalid; KLD требует решения о 5′-фосфате, backbone и atomic derive/Realise.
- Не меняются App navigation, product biology, persistence, dependencies, Vitest pool,
  secondary worktrees, Graphify и release tag.

## TDD и gate

- [ ] RED: LIFO/exact unregister; blocking-modal browser default; two-viewer Escape;
      topmost/focus-outside Escape и десять реальных roots. Undo/tab — зелёная
      characterization уже существующего presence contract, production hooks не меняются.
- [ ] Минимальная реализация; focused tests с именованным вопросом и counts.
- [ ] Related tests один раз от accepted base, ненулевой inventory.
- [ ] Frozen manifest + SHA-256 package digest; до двух независимых read-only review.
- [ ] Максимум один correction pass; пережившая correction причина = STOP/replan.
- [ ] Один Planner full `test:gate`, production build и scoped ESLint; browser smoke
      Escape/Ctrl+R на реальном modal flow. Pytest вне scope (frontend-only).
- [ ] `git diff --check`, exact status, размеры. `RangePickerModal.jsx` уже hard-zone:
      keyboard ownership выносится в новый hook, в файл входит только тонкая проводка;
      новый hard-entrant запрещён, существующий размер честно фиксируется.

## Критерий завершения

BG-078/BG-079 можно закрыть только если production-shaped proof показывает: скрытый
canvas не получает команды, один Escape снимает один верхний слой, assembly handler
переживает mount/unmount вложенного viewer, а browser default блокируется только внутри
явной modal boundary. Широкий DOC-09 этим пакетом не объявляется завершённым.
