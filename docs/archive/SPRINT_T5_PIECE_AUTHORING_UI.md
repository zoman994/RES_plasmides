# SPRINT_T5_PIECE_AUTHORING_UI.md — 4 способа задать piece (UI)

> **Тип:** A (UI + interaction).
> **Якорь:** `docs/SPEC_M-CANVAS-FOUR-TIER-ARCHITECTURE.md` (DEC-CANVAS-4T-01, 04, 06, 21, 25).
> **Зависимости:** T1 (`state.pieces` + actions). Параллелен T2/T3/T4.
> **Размер целевой:** 45-55 KB.
> **Цель:** реализовать 4 способа создания piece в ContainerEditorSkeleton — Способ А (выделение), Б (клик по фиче), В (existing primers), Г (новые primers). PieceCreateModal + PiecePrimersPickModal + расширения SequenceView context-menu + хоткей P.

---

## 0. Срез размеров затрагиваемых модулей

| Файл | Текущий | Лимит | Действие |
|------|---------|-------|----------|
| `components/SequenceView/popups/SelectionContextMenu.jsx` | ? (existing) | soft 30 / hard 40 (.jsx) | +2 пункта в extraItems API (мирный hook), ~+1 KB |
| `components/SequenceView/popups/PieceCreateModal.jsx` | — (new) | soft 30 / hard 40 | ~10-12 KB |
| `components/SequenceView/popups/PiecePrimersPickModal.jsx` | — (new) | soft 30 / hard 40 | ~8-10 KB |
| `components/SequenceView/hooks/usePieceHotkey.js` | — (new) | soft 20 / hard 25 (.js) | ~2-3 KB |
| `components/CanvasSkeleton/editor/ContainerEditorSkeleton.jsx` | ~25 KB (V2 К12) | soft 30 / hard 40 | +piece authoring wiring через props в SequenceTab, ~+2 KB → ~27 KB |
| `components/Library/inspector/tabs/SequenceTab.jsx` | ? | soft 30 / hard 40 | +prop pass-through для onCreatePiece, ~+0.5 KB |
| `components/CanvasSkeleton/lib/piece-authoring.js` | — (new) | soft 20 / hard 25 (.js) | ~5-7 KB orchestration helpers |
| `components/SequenceView/popups/SelectionContextMenu.jsx` extra items | (above) | (above) | пункт «Отметить как кусок» |
| `components/SequenceView/tracks/AnnotationTrack.jsx` | ~49 KB (heavy) | soft 30 / hard 40 | warn — close to soft limit. +context-menu пункт для feature click. T5 minimal extension через extraItems API, не direct edit |
| `lib/hotkeys.js` | (existing) | soft 20 / hard 25 (.js) | +1 entry `piece-create` (Ctrl+R-style global hotkey 'P' or 'Shift+P'), ~+0.2 KB |
| `lib/strings.js` | ~21 KB | soft 20 / hard 25 (.js) | warn. +`pieces.modal.*` strings ~+1 KB → ~22 KB |

**Watch:** `lib/strings.js` после T5 ~22 KB. Уже под hard 25, но close. Превентивный split возможен в T-future (например `strings-pieces.js`).

**AnnotationTrack.jsx** — 49 KB heavy. **Не редактируем direct.** Используем существующий `extraItems` API в SelectionContextMenu (uses hook in SequenceView root). Feature click context уже идёт через тот же `SelectionContextMenu`.

---

## 1. Контекст

### 1.1 Что после T1+T2

- `state.pieces` slice работает. CRUD pieces через actions.
- `op.inputPieces` поле существует. Bridge helpers резолвят inputs.
- Migration v3→v5 закрыта.
- **UI для создания piece отсутствует.** Биолог может создавать pieces только через dev-console.

### 1.2 Что в коде SequenceView сейчас

(По COMPONENT_MAP §2.) Modern viewer для 4 контекстов (Library / Importer / Annotator preview / Container Window). Прерасил поддержки:
- Selection через мышь — `useSelectionState` hook.
- Caret + DNA orange/AA blue overlays — `SelectionOverlay`, `CaretOverlay`.
- Hotkeys через `useSequenceKeyboard` — Ctrl+A/H/E/Del/copy.
- Right-click → `SelectionContextMenu` с tri-modal copy + опционально `extraItems` array от parent (V72-V74 уже использует для «Прямой/Обратный праймер»).
- Create annotation popup (H key) + Edit annotation modal (E key).
- Drag annotation edges с live preview.

**Расширение через extraItems:** existing pattern, использован для V72-V74 (запись праймера через right-click). Это **canonical способ** добавлять operations к SequenceView без изменения её core. Используем для piece creation.

### 1.3 PcrModeShell V71-V76 (existing, не задеваем)

- `Ctrl+R` / `Ctrl+Alt+R` — пишут forward/reverse primer (V72).
- Right-click → «Прямой праймер» / «Обратный праймер» (V74).
- При запросе primer запроса — `recomputeFromSelection` через v0.5 `designPrimersLocal` core.
- Primer pair appended в `op.params.userPrimers`.

**T5 НЕ ломает PcrModeShell.** Способ Г (новые primers) использует **тот же mechanism** в контексте ContainerEditorSkeleton, но не PcrModeShell.

### 1.4 Что добавляется в T5

**4 UI способа создать piece:**

**Способ А — Выделение диапазона** (selection):
- ContainerEditorSkeleton + SequenceView mounted (двойной клик на container).
- Биолог выделяет регион мышкой.
- Right-click → SelectionContextMenu (existing) → новый пункт «Отметить как кусок».
- Хоткей **P** — alt путь (если есть selection).
- Открывается `PieceCreateModal` с pre-filled диапазоном.
- Биолог называет, опционально functionalLabel, OK → CREATE_PIECE dispatched.

**Способ Б — Клик по фиче** (feature):
- ContainerEditorSkeleton + SequenceView. AnnotationTrack показывает features (CDS / promoter / terminator / marker).
- Right-click на feature (не на selection) — SelectionContextMenu активируется в feature-context (existing pattern in SequenceView — selection-overlay даже без drag покрывает feature range).
- В extraItems — новый пункт «Кусок по этой фиче».
- Pre-filled диапазон = feature range, имя = feature.name.
- Modal → CREATE_PIECE.

**Способ В — Existing primers** (existing-primers):
- ContainerEditorSkeleton — toolbar / context-menu пункт «Кусок из существующих праймеров».
- Открывается `PiecePrimersPickModal`:
  - Список primer entries из текущего проекта (фильтр Library inspector → tabs → primers — или dedicated query).
  - Биолог выбирает forward + reverse.
  - Программа ищет binding на target container (`indexOf` forward sequence + reverse-complement reverse on top strand).
  - Preview — найденный ампликон range.
  - Имя piece — auto или user.
- OK → CREATE_PIECE с acquisitionMethod='pcr', acquisitionParams.primerPairId.

**Способ Г — Новые primers** (new-primers):
- ContainerEditorSkeleton + SequenceView. Биолог выделяет регион. Ctrl+R → пишется forward. Ctrl+Alt+R → reverse.
- После того как pair заполнен — toast «Праймеры готовы. Создать кусок?» → клик → PieceCreateModal с pre-filled.
- Также context-menu пункт «Новые праймеры → Кусок» — открывает sub-flow «выделение → Ctrl+R → создать piece».

---

## 2. Стратегия

**Existing patterns переиспользуются maximally.** Никакого нового viewer, никакого нового SequenceView wrapper. T5 — это **handlers + modals + extraItems**.

**SequenceView extension через props (existing pattern from V72-V74):**
- Новый optional prop `onCreatePiece({rangeStart, rangeEnd, source, sourceContainerId, featureName?})`.
- Когда передан → extraItems get «Отметить как кусок» / «Кусок по этой фиче» в SelectionContextMenu.
- Когда не передан (Library Inspector general view) — пункты не появляются. Same как `onWritePrimer` в V74.

**ContainerEditorSkeleton wires:**
- При mount — передаёт `onCreatePiece` в SequenceTab → SequenceView.
- При вызове — открывает PieceCreateModal с pre-filled данными.

**PiecePrimersPickModal:**
- Standalone modal (не attached к SequenceView).
- Вызывается из toolbar/context-menu в ContainerEditorSkeleton.

**Hotkey P** — global (через `lib/hotkeys.js` HOTKEYS entry, как Ctrl+R/Ctrl+Alt+R). Активирован только когда есть selection в активной SequenceView. Resolver pattern из V72.

**piece-authoring.js** — orchestration helpers:
- `buildPieceFromSelection(container, rangeStart, rangeEnd, orientation?)` → piece data.
- `buildPieceFromFeature(container, feature)` → piece data.
- `buildPieceFromExistingPrimers(container, forwardSeq, reverseSeq)` → piece data + bindingInfo or error.
- `buildPieceFromNewPrimers(container, primerPair, selectionRange)` → piece data.

Это **pure functions** — принимают container + input, возвращают partial piece (для передачи в CREATE_PIECE action). Не вызывают reducer.

---

## 3. Scope IN / OUT

### IN
- Прop `onCreatePiece` в SequenceView (через root, не через каждый track).
- Пункт «Отметить как кусок» в SelectionContextMenu (через extraItems).
- Пункт «Кусок по этой фиче» (через extraItems on feature context).
- Хоткей **P** в `lib/hotkeys.js` + handler в SequenceView (через `useHotkey`).
- `popups/PieceCreateModal.jsx` — modal с полями name + functionalLabel + range preview.
- `popups/PiecePrimersPickModal.jsx` — modal с primer list + binding search.
- `hooks/usePieceHotkey.js` — registers P hotkey, wires onCreatePiece.
- `CanvasSkeleton/lib/piece-authoring.js` — 4 builders (selection / feature / existing-primers / new-primers).
- `ContainerEditorSkeleton.jsx` extensions — wire onCreatePiece + toolbar button для PiecePrimersPickModal.
- STRINGS namespace `pieces.modal.*` и `pieces.contextMenu.*`.
- Tests (~30 новых).

### OUT
- Drag piece из «бесхозного состояния» в canvas — T7.
- Sequence-mode rendering piece-зон — T7.
- Auto-create reaction из piece.acquisitionMethod — T8.
- Visual rendering зелёных piece-карточек на canvas — T4 (или T-future).
- Edit existing piece UI — T-future (post-MVP).
- Clone piece UI — T-future (action есть, UI добавляется по запросу).

### NOT TOUCHED
- PcrModeShell V71-V76 — Ctrl+R / Ctrl+Alt+R работают как раньше.
- Library Inspector standalone view — onCreatePiece не передаётся, пункты не появляются.
- Importer — pieces не интегрированы.
- Annotator preview — onCreatePiece не передаётся (Annotator — для batch annotations).

---

## 4. Архитектурные решения

### DEC-T5-01 — Reuse extraItems API в SelectionContextMenu
Не создаём `PieceContextMenu` отдельный. Существующий `extraItems` API (V72-V74) принимает array of `{label, onClick, danger?, disabled?}`. Расширяется на 2 пункта.

### DEC-T5-02 — Single hotkey P (не Ctrl+P или Alt+P)
- `P` без модификаторов — простой, легко запомнить.
- Не конфликтует с browser shortcuts (Ctrl+P = print, Cmd+P = command palette в M-X.8).
- Pattern из V72 `Ctrl+R` показывает что scope-bound hotkey работает (active только когда SequenceView mounted + has selection).

Альтернатива `Shift+P` (Path в Photoshop) — биолог Игорь явно вне Photoshop. `P` короче и без shift.

### DEC-T5-03 — PieceCreateModal через ModalStack (existing pattern)
Не Radix portal. Используем `components/ModalStack.jsx` (existing) для stacking + ESC handling. Pattern существует в `FeatureEditorModal`, `EditAnnotationModal`.

### DEC-T5-04 — PiecePrimersPickModal — отдельная modal, не extension PieceCreateModal
Разные UX flows: existing-primers — выбор из списка + preview, new-primers — последовательное написание + modal в конце. Объединение усложнит UI. Две modals разделяют concerns.

### DEC-T5-05 — buildPiece* helpers pure, без dispatch
Принимают inputs, возвращают partial piece object. Reducer dispatched отдельно. Это упрощает unit-тестирование (helpers — без mock state).

### DEC-T5-06 — Existing primer binding — `indexOf` + reverse-complement (legacy v0.5 mechanism)
Для buildPieceFromExistingPrimers — переиспользуем existing primer-binding logic из v0.5 (вероятно в `lib/primer-binding.js` или `local-primer-design.js`). Не пишем заново.

Если binding не найден — modal показывает error «Прямой/Обратный праймер не найден в источнике». Биолог может попробовать другие.

### DEC-T5-07 — Способ Г — orchestration через ContainerEditorSkeleton, не SequenceView
SequenceView не знает что есть `op` или PcrModeShell-like userPrimers. Она просто write primer entries в library через `onWritePrimer` callback (existing V74).

Container Editor (T5 context) переопределяет `onWritePrimer` — после написания пары → toast «Праймеры готовы. Создать кусок?» → клик → PieceCreateModal.

### DEC-T5-08 — Piece origin определяется способом
- A → 'selection'.
- Б → 'feature'.
- В → 'existing-primers'.
- Г → 'new-primers'.

(DEC-T1 origin enum уже допускает все 4.)

### DEC-T5-09 — Функциональная метка (functionalLabel) opt-in поле
В Modal — поле «Функциональная метка», пустое by default. Биолог может ввести «промотор», «маркер Hyg», «gRNA-spacer». Стored как `piece.functionalLabel: string | null`.

На бумажной диаграмме всегда заполнено. В T5 — необязательно. UX в T7 sequence-mode будет показывать label на piece-ленте.

### DEC-T5-10 — Auto-name template
`{containerName}({start}-{end})` — default. Биолог может override.

Если способ Б (feature) — default = `feature.name`. Биолог может override.

### DEC-T5-11 — Default zone assignment
Если container в zone X, новый piece automatically получает `zoneId = X` (через CREATE_PIECE action seeded from caller).

Если container loose (zoneId=null) — piece тоже loose.

Это T3 integration. T5 caller передаёт zoneId в action payload.

### DEC-T5-12 — Тестируемость через mock state
Tests на PieceCreateModal — full state мок, dispatcher функция-spy. Tests на PiecePrimersPickModal — primer list мок.

### DEC-T5-13 — Hotkey scope через `useHotkey` lifecycle
`useHotkey('piece-create', handler)` регистрирует handler только пока компонент mounted. Когда SequenceView unmounted — handler автоматически unregister. Pattern из V72.

Resolver в `lib/hotkeys.js` пропускает id без зарегистрированного handler'а БЕЗ `preventDefault` → P вне SequenceView работает как обычная буква (например biolog печатает в textarea — не активирует piece-create).

### DEC-T5-14 — Acquisition method derives from способ
- А → 'undefined' (биолог пока не решил как получать).
- Б → 'undefined' (то же).
- В → 'pcr' с primerPairId.
- Г → 'pcr' с primerPairId.

T8 будет auto-create reaction для acquisitionMethod='pcr'. В T5 — только устанавливаем поле.

### DEC-T5-15 — Tests baseline: 2792 (T4) → ~2825 (T5)
~33 новых тестов.

---

## 5. UI / API / actions

### 5.1 SequenceView `onCreatePiece` prop

Сигнатура:
```javascript
onCreatePiece(payload)
// payload:
{
  origin: 'selection' | 'feature' | 'existing-primers' | 'new-primers',
  rangeStart: number,
  rangeEnd: number,
  orientation: 'forward' | 'reverse',
  sourceContainerId: string,
  featureName?: string,           // если origin='feature'
  primerPairId?: {fwd, rev},      // если origin='existing-primers' или 'new-primers'
}
```

SequenceView (root) принимает prop. Если undefined — extraItems пункты не добавляются. Если задан — добавляются «Отметить как кусок» (если selection есть) + «Кусок по этой фиче» (если feature-context).

### 5.2 SelectionContextMenu extension

Existing API:
```javascript
<SelectionContextMenu
  extraItems={[
    { label: 'Прямой праймер (Ctrl+R)', onClick: ... },
    { label: 'Обратный праймер (Ctrl+Alt+R)', onClick: ... },
    // T5 NEW:
    { label: 'Отметить как кусок (P)', onClick: () => onCreatePiece({origin: 'selection', ...}) },
  ]}
/>
```

T5 extends inline в SequenceView root — если `onCreatePiece` prop передан + есть selection → добавить пункт.

### 5.3 PieceCreateModal.jsx

**Props:**
- `containerId: string` — source container id.
- `containerName: string` — для default name.
- `range: {start, end, orientation}` — pre-filled.
- `origin: string` — для info display.
- `featureName?: string` — если origin='feature', defaults name to feature.
- `primerPairId?: {fwd, rev}` — если origin='existing-primers' / 'new-primers'.
- `zoneId: string | null` — наследует от container.
- `onConfirm: ({name, functionalLabel, ...}) => void` — dispatches CREATE_PIECE.
- `onCancel: () => void`.

**UI структура:**

```
<Modal title="Создать кусок">
  <div className="piece-create-info">
    <span>Источник: {containerName}</span>
    <span>Диапазон: {start}–{end} ({end - start} п.о.)</span>
    <span>Ориентация: {orientation === 'forward' ? '→' : '←'}</span>
    <span>Способ: {originLabel(origin)}</span>
  </div>

  <Field label="Имя">
    <InlineEditableTitle value={name} onChange={setName} placeholder={defaultName} />
  </Field>

  <Field label="Функциональная метка (опционально)">
    <input value={functionalLabel} onChange={...} placeholder="напр. «промотор», «маркер Hyg»" />
  </Field>

  {origin === 'existing-primers' || origin === 'new-primers' ? (
    <div className="piece-create-primers-info">
      <span>Праймеры: forward {fwdName}, reverse {revName}</span>
      <span>Метод получения: ПЦР</span>
    </div>
  ) : (
    <div className="piece-create-method-info">
      <span>Метод получения: пока не определён (выберите позже)</span>
    </div>
  )}

  <ModalActions>
    <Button onClick={onCancel}>Отмена</Button>
    <Button primary onClick={() => onConfirm({name, functionalLabel})}>Создать</Button>
  </ModalActions>
</Modal>
```

OnConfirm dispatches:
```javascript
dispatch({
  type: 'CREATE_PIECE',
  piece: {
    name: name || defaultName,
    sourceIds: [containerId],
    ranges: [range],
    origin,
    acquisitionMethod: (origin === 'existing-primers' || origin === 'new-primers') ? 'pcr' : 'undefined',
    acquisitionParams: primerPairId ? { primerPairId } : {},
    functionalLabel: functionalLabel || null,
    zoneId,  // наследовано от container.zoneId
  },
});
```

### 5.4 PiecePrimersPickModal.jsx

**Props:**
- `containerId, containerName, containerSequence`.
- `primers: PrimerEntry[]` — список всех primer entries из текущего проекта.
- `onConfirm: (pieceData) => void`.
- `onCancel: () => void`.

**UI структура:**

```
<Modal title="Кусок из существующих праймеров">
  <div className="primer-pick-info">
    <span>Источник: {containerName}</span>
  </div>

  <Field label="Прямой праймер">
    <PrimerSelect primers={primers} value={fwdId} onChange={setFwdId} />
  </Field>

  <Field label="Обратный праймер">
    <PrimerSelect primers={primers} value={revId} onChange={setRevId} />
  </Field>

  {bindingResult ? (
    <div className="binding-preview">
      <span>Ампликон: {bindingResult.start}–{bindingResult.end} ({bindingResult.length} п.о.)</span>
      <span>Tm forward: {fwdTm}°C / reverse: {revTm}°C</span>
    </div>
  ) : (
    <div className="binding-error">
      <span>{bindingError || 'Выберите оба праймера для preview'}</span>
    </div>
  )}

  <Field label="Имя куска">
    <input value={name} placeholder={defaultName} onChange={...} />
  </Field>

  <ModalActions>
    <Button onClick={onCancel}>Отмена</Button>
    <Button primary onClick={confirmIfValid} disabled={!bindingResult}>Создать</Button>
  </ModalActions>
</Modal>
```

Binding logic:

```javascript
useEffect(() => {
  if (!fwdId || !revId) {
    setBindingResult(null);
    setBindingError(null);
    return;
  }
  const fwd = primers.find(p => p.id === fwdId);
  const rev = primers.find(p => p.id === revId);
  try {
    const result = buildPieceFromExistingPrimers(
      { id: containerId, name: containerName, sequence: containerSequence },
      fwd.sequence,
      rev.sequence
    );
    setBindingResult(result);
    setBindingError(null);
  } catch (e) {
    setBindingResult(null);
    setBindingError(e.message);
  }
}, [fwdId, revId, primers, containerSequence]);
```

OnConfirm dispatches CREATE_PIECE с origin='existing-primers', acquisitionMethod='pcr', acquisitionParams.primerPairId.

### 5.5 piece-authoring.js helpers

```javascript
import { reverseComplement } from '../../../sequence-utils';

/**
 * Способ А: piece из selection.
 * Returns partial piece (без id/color/createdAt — добавятся в CREATE_PIECE reducer).
 */
export function buildPieceFromSelection(container, rangeStart, rangeEnd, orientation = 'forward') {
  return {
    sourceIds: [container.id],
    ranges: [{
      sourceId: container.id,
      start: Math.min(rangeStart, rangeEnd),
      end: Math.max(rangeStart, rangeEnd),
      orientation,
    }],
    origin: 'selection',
    acquisitionMethod: 'undefined',
    acquisitionParams: {},
  };
}

/**
 * Способ Б: piece из feature click.
 */
export function buildPieceFromFeature(container, feature) {
  return {
    name: feature.name,  // pre-fill from feature
    sourceIds: [container.id],
    ranges: [{
      sourceId: container.id,
      start: feature.start,
      end: feature.end,
      orientation: feature.strand === -1 ? 'reverse' : 'forward',
    }],
    origin: 'feature',
    acquisitionMethod: 'undefined',
    acquisitionParams: {},
    functionalLabel: feature.type || feature.name,
  };
}

/**
 * Способ В: piece из existing primers.
 * Binding logic — find forward seq in container.sequence (top strand),
 * find reverse-complement of reverse seq in container.sequence.
 * Amplicon = от forward 5' до (reverse-complement reverse) 3'.
 *
 * Throws Error если binding не найден.
 */
export function buildPieceFromExistingPrimers(container, forwardSeq, reverseSeq) {
  const sequence = container.sequence.toUpperCase();
  const fwd = forwardSeq.toUpperCase();
  const revRC = reverseComplement(reverseSeq.toUpperCase());

  const fwdStart = sequence.indexOf(fwd);
  if (fwdStart < 0) throw new Error('Прямой праймер не найден в источнике');
  const revStart = sequence.indexOf(revRC, fwdStart + fwd.length);
  if (revStart < 0) throw new Error('Обратный праймер не найден в источнике после прямого');

  const amplStart = fwdStart;
  const amplEnd = revStart + revRC.length;
  return {
    sourceIds: [container.id],
    ranges: [{
      sourceId: container.id,
      start: amplStart,
      end: amplEnd,
      orientation: 'forward',
    }],
    origin: 'existing-primers',
    acquisitionMethod: 'pcr',
    acquisitionParams: {
      primerPairId: {
        forward: forwardSeq,  // или primer entry id если known
        reverse: reverseSeq,
      },
    },
  };
}

/**
 * Способ Г: piece из новых primers (записанных через V72-V74 mechanism в container editor context).
 * primerPair имеет {forward: {sequence, ...}, reverse: {sequence, ...}}.
 * selectionRange — range вокруг которого primers были написаны.
 */
export function buildPieceFromNewPrimers(container, primerPair, selectionRange) {
  return {
    sourceIds: [container.id],
    ranges: [{
      sourceId: container.id,
      start: selectionRange.start,
      end: selectionRange.end,
      orientation: 'forward',
    }],
    origin: 'new-primers',
    acquisitionMethod: 'pcr',
    acquisitionParams: {
      primerPairId: {
        forward: primerPair.forward.sequence,
        reverse: primerPair.reverse.sequence,
      },
    },
  };
}
```

### 5.6 ContainerEditorSkeleton extensions

```javascript
import PieceCreateModal from '../../SequenceView/popups/PieceCreateModal';
import PiecePrimersPickModal from '../../SequenceView/popups/PiecePrimersPickModal';
import {
  buildPieceFromSelection,
  buildPieceFromFeature,
  buildPieceFromExistingPrimers,
  buildPieceFromNewPrimers,
} from '../lib/piece-authoring';

function ContainerEditorSkeleton({ container, dispatch, state, ...props }) {
  const [pieceCreateModal, setPieceCreateModal] = useState(null);
  const [primersPickModal, setPrimersPickModal] = useState(null);

  const handleCreatePiece = useCallback((payload) => {
    let pieceData;
    switch (payload.origin) {
      case 'selection':
        pieceData = buildPieceFromSelection(container, payload.rangeStart, payload.rangeEnd);
        break;
      case 'feature':
        pieceData = buildPieceFromFeature(container, payload.feature);
        break;
      case 'existing-primers':
      case 'new-primers':
        // already built via modal flow
        pieceData = payload.pieceData;
        break;
    }
    setPieceCreateModal({
      ...pieceData,
      origin: payload.origin,
      containerName: container.name,
    });
  }, [container]);

  const onPieceCreateConfirm = useCallback((finalFields) => {
    dispatch({
      type: 'CREATE_PIECE',
      piece: {
        ...pieceCreateModal,
        name: finalFields.name,
        functionalLabel: finalFields.functionalLabel,
        zoneId: container.zoneId || null,
      },
    });
    setPieceCreateModal(null);
  }, [pieceCreateModal, container, dispatch]);

  return (
    <>
      {/* existing SequenceTab mount */}
      <SequenceTab
        item={...}
        onCreatePiece={handleCreatePiece}
        onWritePrimer={...existing V74 handler}
        // ...
      />

      {/* Toolbar button для PiecePrimersPickModal */}
      <Button onClick={() => setPrimersPickModal({})}>
        Кусок из праймеров
      </Button>

      {pieceCreateModal && (
        <PieceCreateModal
          {...pieceCreateModal}
          onConfirm={onPieceCreateConfirm}
          onCancel={() => setPieceCreateModal(null)}
        />
      )}

      {primersPickModal && (
        <PiecePrimersPickModal
          containerId={container.id}
          containerName={container.name}
          containerSequence={container.sequence}
          primers={state.primers || []}
          onConfirm={(pieceData) => {
            setPrimersPickModal(null);
            setPieceCreateModal({
              ...pieceData,
              origin: 'existing-primers',
              containerName: container.name,
            });
          }}
          onCancel={() => setPrimersPickModal(null)}
        />
      )}
    </>
  );
}
```

### 5.7 Hotkey P в lib/hotkeys.js

```javascript
HOTKEYS = {
  // ...existing
  'piece-create': {
    keys: [{ key: 'p', ctrl: false, alt: false, shift: false }],
    scope: 'global',
    description: 'Отметить выделение как кусок',
  },
}
```

В SequenceView root:
```javascript
useHotkey('piece-create', (e) => {
  if (!onCreatePiece) return;
  const sel = useSelectionState.current;
  if (sel.start === sel.end) return;  // нет selection
  onCreatePiece({
    origin: 'selection',
    rangeStart: sel.start,
    rangeEnd: sel.end,
    orientation: 'forward',
    sourceContainerId: containerIdProp,
  });
});
```

### 5.8 STRINGS extension

```javascript
pieces: {
  // ...T1 existing
  modal: {
    create: {
      title: 'Создать кусок',
      sourceLabel: 'Источник:',
      rangeLabel: 'Диапазон:',
      orientationLabel: 'Ориентация:',
      methodLabel: 'Способ:',
      nameLabel: 'Имя',
      functionalLabelLabel: 'Функциональная метка (опционально)',
      functionalLabelPlaceholder: 'напр. «промотор», «маркер Hyg»',
      acquisitionUndefinedHint: 'Метод получения: пока не определён',
      acquisitionPcrHint: 'Метод получения: ПЦР',
      cancel: 'Отмена',
      confirm: 'Создать',
    },
    primersPick: {
      title: 'Кусок из существующих праймеров',
      forwardLabel: 'Прямой праймер',
      reverseLabel: 'Обратный праймер',
      bindingPreviewLength: '{length} п.о.',
      bindingPreviewRange: 'Ампликон: {start}–{end}',
      bindingErrorFwd: 'Прямой праймер не найден в источнике',
      bindingErrorRev: 'Обратный праймер не найден в источнике после прямого',
      bindingHint: 'Выберите оба праймера для preview',
      nameLabel: 'Имя куска',
    },
  },
  contextMenu: {
    createFromSelection: 'Отметить как кусок (P)',
    createFromFeature: 'Кусок по этой фиче',
    createFromExistingPrimers: 'Кусок из существующих праймеров',
    createFromNewPrimers: 'Новые праймеры → Кусок',
  },
  originLabel: {
    selection: 'выделение',
    feature: 'по фиче',
    'existing-primers': 'существующие праймеры',
    'new-primers': 'новые праймеры',
    'legacy-migration': 'миграция',
  },
  hint: {
    primersReady: 'Праймеры готовы. Создать кусок?',
  },
},
```

---

## 6. Порядок выполнения

**K1.** `CanvasSkeleton/lib/piece-authoring.js` — 4 builders (selection/feature/existing-primers/new-primers). Pure.

**K2.** `lib/hotkeys.js` — `piece-create` entry.

**K3.** `SequenceView/hooks/usePieceHotkey.js` — registers `piece-create` hotkey, wires onCreatePiece.

**K4.** Расширить `SequenceView/index.jsx`:
- Принять prop `onCreatePiece`.
- Pass-through в SelectionContextMenu extraItems (новые 2 пункта).
- Mount `usePieceHotkey`.

**K5.** `SequenceView/popups/PieceCreateModal.jsx` — modal.

**K6.** `SequenceView/popups/PiecePrimersPickModal.jsx` — modal с binding search.

**K7.** Расширить `Library/inspector/tabs/SequenceTab.jsx` — pass-through prop `onCreatePiece`.

**K8.** Расширить `CanvasSkeleton/editor/ContainerEditorSkeleton.jsx` — wire onCreatePiece + state для modals + toolbar button для PiecePrimersPickModal.

**K9.** STRINGS namespace расширения (§5.8).

**K10.** Tests:
- `__tests__/lib/piece-authoring.test.js` — 4 builders, edge cases (empty range, reverse orientation, binding not found, multi-input — здесь не applicable). ~10 тестов.
- `__tests__/SequenceView/PieceCreateModal.test.jsx` — render + onConfirm dispatches с правильными polями + cancel works + auto-name template. ~6 тестов.
- `__tests__/SequenceView/PiecePrimersPickModal.test.jsx` — render primer list + binding preview правильный + error display + onConfirm dispatches. ~5 тестов.
- `__tests__/SequenceView/piece-hotkey.test.jsx` — P активирует только когда selection + onCreatePiece + mounted. ~3 теста.
- `__tests__/integration/container-editor-piece-flow.test.jsx`:
  - Selection → P → modal → confirm → state.pieces[].length+1.
  - Feature click → context-menu → «Кусок по этой фиче» → pre-filled name=feature.name.
  - Existing primers → toolbar → PiecePrimersPickModal → binding found → confirm → piece.acquisitionMethod='pcr'.
  - New primers → Ctrl+R+Ctrl+Alt+R → toast → click → modal → piece.origin='new-primers'.
  - ~6 тестов.

Total ~30 тестов. Baseline 2792 (T4) → ~2822.

**K11.** Manual smoke:
1. Открыть /canvas-skeleton. Двойной клик на container → ContainerEditorSkeleton mounts.
2. В SequenceView выделить регион 100-200. Нажать P → PieceCreateModal с pre-filled диапазоном 100-200. Имя default `{containerName}(100-200)`. Confirm → state.pieces.length+1.
3. Right-click на feature в AnnotationTrack → меню → «Кусок по этой фиче» → pre-filled name=feature.name. Confirm → piece создан с origin='feature'.
4. Toolbar «Кусок из праймеров» → modal. Выбрать forward + reverse → binding preview показывает ампликон 150-450 (если primers совпадают). Confirm → piece с origin='existing-primers', acquisitionMethod='pcr'.
5. Выделение 200-300 → Ctrl+R → forward primer written. Ctrl+Alt+R → reverse. Toast «Праймеры готовы. Создать кусок?» → click → modal → confirm → piece с origin='new-primers'.

**K12.** Size budget check.

---

## 7. STOP-условие

Code останавливается после K12.

Отчёт:
```
## T5 Piece Authoring UI — отчёт
Commits: ...
Vitest: 2792 → 2822 pass / 1 skip / 0 fail (+30)
pytest: 112/112
vite build: clean

Size budget:
- SequenceView/popups/PieceCreateModal.jsx: X.X KB (new) ✓
- SequenceView/popups/PiecePrimersPickModal.jsx: X.X KB (new) ✓
- SequenceView/hooks/usePieceHotkey.js: X.X KB (new) ✓
- SequenceView/index.jsx: X.X KB (+X) ✓
- ContainerEditorSkeleton.jsx: ~27 KB (was 25, +2) ✓ под soft 30
- CanvasSkeleton/lib/piece-authoring.js: X.X KB (new) ✓
- Library/inspector/tabs/SequenceTab.jsx: X.X KB (+0.5) ✓
- lib/strings.js: ~22 KB ✓ под hard 25 (warn — close)
- lib/hotkeys.js: X.X KB (+0.2) ✓

Manual smoke:
- Способ А (P key) — piece created
- Способ Б (feature click) — piece created с feature name
- Способ В (existing primers) — binding found + piece created
- Способ Г (new primers) — Ctrl+R/Ctrl+Alt+R → toast → modal → piece created

Spec deviations: [list]
Открытые вопросы: [list]
```

---

## 8. Что делать при регрессии

1. **Library Inspector SequenceTab tests падают** — onCreatePiece prop default undefined не должен добавлять extraItems. Проверить guard в SequenceView.

2. **Hotkey P активен в textarea** — `useHotkey` resolver должен пропускать события из input/textarea. Проверить existing pattern в `lib/hotkeys.js`.

3. **PcrModeShell V72-V74 ломаются** — T5 НЕ должна трогать PcrModeShell. Если упало — bug в SequenceView extension которое неверно reused hook.

4. **Binding logic в PiecePrimersPickModal возвращает wrong range** — проверить indexOf после fwdStart+fwd.length (rev должен быть downstream). Edge cases: fwd и rev binding overlap → primers могут не работать на реальной PCR, но в T5 — accept binding logic basic, error message достаточно.

---

## 9. Риски

### R-T5-1 — Hotkey P конфликтует с biolog typing в input
**Risk:** Biolog печатает имя в InlineEditableTitle → нажал P → активирует piece-create.
**Mitigation:** `useHotkey` resolver проверяет `event.target` — если input/textarea/contenteditable → пропустить. Существующий pattern (V72 Ctrl+R это уже делает).

### R-T5-2 — PiecePrimersPickModal binding logic некорректен для circular containers
**Risk:** Circular container — fwd может быть найден после rev (wrap-around). indexOf не учитывает.
**Mitigation:** Для circular — extend search через `sequence + sequence.slice(0, fwd.length)` (wraparound concat). T5 — basic поддержка linear; circular handled с warning «binding wraps origin».

### R-T5-3 — Способ Г (new primers) — orchestration сложен
**Risk:** Ctrl+R пишет forward, потом Ctrl+Alt+R пишет reverse, потом нужно знать что pair готова и показать toast. Тaiming сложный.
**Mitigation:** ContainerEditorSkeleton отслеживает `lastWrittenPrimerPair` через state. После каждого write — проверяет если pair complete. Toast triggered automatically.

### R-T5-4 — AnnotationTrack feature click требует prop передачи через 3 уровня
**Risk:** AnnotationTrack ~49 KB heavy. Передача onCreatePiece через AnnotationTrack → попадает в её heavy code path. Регрессия features rendering.
**Mitigation:** AnnotationTrack НЕ редактируется в T5. Feature context уже идёт в SelectionContextMenu через existing pattern (selection covers feature range, right-click → context-menu sees it). T5 — extraItems pункт добавляется на SequenceView root level.

### R-T5-5 — PieceCreateModal слишком много полей
**Risk:** 5 полей (name / functionalLabel + readonly info) — overwhelming в первом запуске.
**Mitigation:** functionalLabel — opt-in (placeholder, не required). Auto-name template — биолог может оставить default. UX-приёмка с биологом.

### R-T5-6 — PiecePrimersPickModal — primer list пустой в новом проекте
**Risk:** Биолог открыл новый project, primers list пуст. Modal показывает empty state.
**Mitigation:** Empty state с подсказкой «Праймеров пока нет. Создайте через `Способ Г` (новые праймеры).» Link на closing modal.

---

## 10. Открытые вопросы для Chat

1. AnnotationTrack feature click — реально работает через right-click на feature (без явного selection drag)? Если нет — нужно отдельное hit-test в AnnotationTrack (что увеличит её размер).
   - Дефолт ответа: проверить existing behavior в V72-V74. Если работает — OK. Если нет — добавить hit-test через extraItems sub-trigger.
2. Toolbar button «Кусок из праймеров» — где разместить в ContainerEditorSkeleton header? Рядом с «Закрыть»? Над SequenceView? Дефолт — в header справа от title, рядом с existing buttons.
3. Toast «Праймеры готовы. Создать кусок?» — auto-dismiss после 10 сек? Или persistent до явного клика? Дефолт — auto-dismiss + click=create. Если auto-dismissed — биолог может через toolbar button.

---

## 11. Pre-handoff чеклист

- [x] Срез размеров в §0, warn для strings.js + AnnotationTrack mitigated через extraItems.
- [x] Контекст + стратегия + reference на V72-V74 extraItems pattern.
- [x] Scope IN/OUT.
- [x] DEC-T5-01..15.
- [x] UI + helpers + STRINGS (§5).
- [x] K1-K12.
- [x] STOP-условие.
- [x] 6 рисков.
- [x] Открытые вопросы.
- [x] Размер 45-55 KB target.
- [x] Никакого piece visual rendering (T4 territory) — T5 чисто authoring.
- [x] Никакого sequence-mode (T7 territory).
- [x] Reference на якорь + T1 в заголовке.

---

**Дата:** 16.05.2026.
**Якорь:** SPEC_M-CANVAS-FOUR-TIER-ARCHITECTURE.md DEC-CANVAS-4T-01, 04, 06, 21, 25.
**Следующий sprint:** T6 — миграция assembly-mode shape segments → pieces.
