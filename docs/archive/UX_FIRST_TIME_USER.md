# UX_FIRST_TIME_USER.md — Блок 9: Фиксы первого опыта пользователя

**Статус:** ПЛАН (после Блока 8)  
**Приоритет:** 🔴 — ломает первый опыт нового пользователя

---

## Проблемы

### U1: QuickStart "Restriction"/"Mutagenesis" при пустой библиотеке — broken flow

**Текущий код** (`DesignCanvas.jsx`, `handleQuickStart`):
```js
case 'restriction':
case 'mutagenesis': {
  const plasmids = parts.filter(p => p.topology === 'circular' || ...);
  if (plasmids.length > 0) setShowPartsLib(true);
  else setModalMode('import_any');  // ← 'import_any' НЕ существует как режим!
}
```

Первый пользователь: parts=[], plasmids=[] → `setModalMode('import_any')` → AddFragmentModal получает mode='import_any' → скорее всего ничего не показывает или крашится.

**Fix:** При пустой библиотеке → открыть file picker напрямую (тот же подход что и кнопка "Импортировать"):

```js
case 'restriction':
case 'mutagenesis': {
  const plasmids = parts.filter(p => p.topology === 'circular' || (p.annotations?.length >= 2 && p.sequence?.length > 2000));
  if (plasmids.length > 0) {
    useStore.getState().setShowPartsLib(true);
  } else {
    // Нет плазмид → предложить импортировать файл
    // Создать hidden file input и кликнуть (или использовать QuickStart fileRef)
    onAction('import_file_for_' + actionId);
  }
  break;
}
```

Но `onAction` не имеет доступа к fileRef из QuickStart после выхода. 

**Лучший подход:** Вместо file picker — показать inline подсказку в DesignCanvas:

```jsx
// Новое state в DesignCanvas:
const [pendingAction, setPendingAction] = useState(null); // 'restriction' | 'mutagenesis' | null

// В handleQuickStart:
case 'restriction':
case 'mutagenesis': {
  const plasmids = parts.filter(...);
  if (plasmids.length > 0) {
    setShowPartsLib(true);
  } else {
    setPendingAction(actionId);
    // QuickStart скрывается (pendingAction не null), показывается ImportPrompt
  }
  break;
}
```

**Показать ImportPrompt вместо QuickStart:**
```jsx
{n === 0 && !completed && !pendingAction && <QuickStart onAction={handleQuickStart} />}
{n === 0 && !completed && pendingAction && (
  <ImportPrompt
    action={pendingAction}
    onImportFile={(file) => {
      handleFileImport(file).then(data => {
        // Добавить presetMode в зависимости от pendingAction
        const preset = pendingAction === 'restriction' ? 'restriction_cloning' : 'mutate';
        useStore.getState().setImportDecision({ ...data, _presetMode: preset });
        setPendingAction(null);
      }).catch(err => alert(`Ошибка: ${err.message}`));
    }}
    onCancel={() => setPendingAction(null)}
  />
)}
```

**ImportPrompt — мини-компонент** (~30 строк):
```
┌─────────────────────────────────────────┐
│                                           │
│  🔪 Рестрикционное клонирование           │
│                                           │
│  Для начала импортируйте плазмиду-вектор  │
│                                           │
│  [📂 Выбрать файл .dna / .gb]            │
│                                           │
│  или перетащите файл в окно               │
│                                           │
│  [← Назад]                               │
└─────────────────────────────────────────┘
```

Файл: `gui/designer/src/components/ImportPrompt.jsx` (НОВЫЙ, ~40 строк)

После импорта → ImportDecisionModal подхватывает (уже работает). Но нужно передать presetMode чтобы ImportDecisionModal сразу предложил нужное действие:

В ImportDecisionModal — если `data._presetMode` задан, автоматически выполнить это действие (пропустить меню).

---

### U2: Нет видимой кнопки "Добавить фрагмент" после закрытия QuickStart

**Проблема:** Пользователь выбрал "Gibson / Overlap" или "Свободная сборка" → QuickStart скрывается → пустой canvas. Палитра видна слева, но если нужных запчастей нет → тупик. Нет видимой кнопки "Добавить по последовательности".

Скрытая возможность: правый клик → context menu → "Добавить фрагмент". Но новый пользователь этого не знает.

**Fix:** Показать inline hint с кнопкой когда canvas пуст но QuickStart уже скрыт (после выбора gibson/free/golden_gate):

В DesignCanvas.jsx — новое состояние `dismissed` (QuickStart был закрыт действием):
```jsx
const [dismissed, setDismissed] = useState(false);

// В handleQuickStart:
case 'gibson':
case 'free':
  setDismissed(true);
  break;
case 'golden_gate':
  setDismissed(true);
  useStore.getState().setAssemblyType('golden_gate');
  break;
```

Показать hint:
```jsx
{n === 0 && !completed && dismissed && !pendingAction && (
  <div className="flex-1 flex flex-col items-center justify-center gap-3 text-gray-400">
    <div className="text-sm">Перетащите запчасти из палитры слева</div>
    <div className="text-[10px] text-gray-300">или</div>
    <button onClick={() => useStore.getState().setModalMode('add')}
      className="text-xs px-4 py-2 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-100">
      + Добавить фрагмент по последовательности
    </button>
    <button onClick={() => { setDismissed(false); setPendingAction(null); }}
      className="text-[10px] text-gray-300 hover:text-gray-500 mt-2">
      ← Назад к выбору метода
    </button>
  </div>
)}
```

---

### U3: PlasmidViewer — нет action buttons

**Проблема:** PlasmidViewer имеет prop `onOpenWizard` и кнопку "🔄 В wizard", но в App.jsx **prop не передан**:

```jsx
// App.jsx текущий:
{viewerPart && (
  <PlasmidViewer part={viewerPart}
    onClose={() => useStore.getState().setViewerPart(null)} />
)}
```

**Fix:** Передать `onOpenWizard`:

```jsx
{viewerPart && (
  <PlasmidViewer part={viewerPart}
    onClose={() => useStore.getState().setViewerPart(null)}
    onOpenWizard={(part) => {
      useStore.getState().setViewerPart(null);
      useStore.getState().setWizardPlasmid(part);
    }}
  />
)}
```

**Дополнительно:** Расширить footer PlasmidViewer — вместо одной кнопки "🔄 В wizard" добавить конкретные actions (как в ImportDecisionModal):

В `PlasmidViewer.jsx`, секция footer, заменить одну кнопку wizard на три:

```jsx
{part.topology === 'circular' && (
  <div className="flex gap-1.5">
    <button onClick={() => openWithPreset('restriction_cloning')}
      className="text-xs px-2.5 py-1.5 bg-red-50 text-red-700 border border-red-200 rounded hover:bg-red-100">
      🔪 Клонировать
    </button>
    <button onClick={() => openWithPreset('use_whole')}
      className="text-xs px-2.5 py-1.5 bg-blue-50 text-blue-700 border border-blue-200 rounded hover:bg-blue-100">
      ⚗️ Как backbone
    </button>
    <button onClick={() => openWithPreset('mutate')}
      className="text-xs px-2.5 py-1.5 bg-purple-50 text-purple-700 border border-purple-200 rounded hover:bg-purple-100">
      🔄 Мутагенез
    </button>
  </div>
)}
```

Где `openWithPreset`:
```js
const openWithPreset = (mode) => {
  onClose();
  if (onOpenWizard) {
    useStore.getState().setWizardPresetMode(mode);
    onOpenWizard(part);
  }
};
```

---

### U4: Fallback parts — мёртвый код

**Проблема:** В App.jsx определён массив `fallback` с фейковыми последовательностями ('ATCG'×212), но он **никогда не используется** — `fetchParts().then(mergeParts).catch(() => {})`.

**Fix:** Удалить мёртвый код `const fallback = [...]` из App.jsx. Это 7 строк которые только путают при чтении кода.

---

## Файлы затрагиваемые

| Файл | Изменение |
|------|-----------|
| `components/ImportPrompt.jsx` | НОВЫЙ (~40 строк) — "Импортируйте вектор" с file picker |
| `components/DesignCanvas.jsx` | handleQuickStart fix (restriction/mutagenesis), pendingAction state, dismissed state, inline hint |
| `components/PlasmidViewer.jsx` | Footer: 3 action buttons (clone/backbone/mutate) вместо generic "В wizard" |
| `App.jsx` | PlasmidViewer: +onOpenWizard prop. Удалить fallback dead code |
| `components/ImportDecisionModal.jsx` | Поддержка `data._presetMode` → auto-execute action |

---

## Порядок выполнения

1. U4 (удалить fallback) → build
2. U3 (PlasmidViewer actions + App.jsx onOpenWizard) → build
3. U1 (ImportPrompt + DesignCanvas pendingAction) → build
4. U2 (dismissed state + inline hint) → build

Тесты не нужны — чистый UI.
