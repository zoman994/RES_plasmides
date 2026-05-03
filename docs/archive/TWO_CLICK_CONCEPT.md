# Концепция двух кликов — BodgeGene UX

**Дата:** 31 марта 2026  
**Принцип:** Любая операция ≤ 2 осознанных действия пользователя (клик, drag, горячая клавиша).  
**Исключение:** Операции с вводом данных (заполнение формы) — 2 клика до формы + заполнение.

---

## Аудит: текущее состояние

### ⛔ Нарушители (> 2 кликов)

| # | Операция | Сейчас | Кликов | Проблема |
|---|----------|--------|--------|----------|
| 1 | Редактировать фрагмент | Expert ON → hover → ✏️ | **3** | Expert mode gate |
| 2 | Разрезать фрагмент | Expert ON → hover → ✂ | **3** | Expert mode gate |
| 3 | Настроить junction | Expert ON → click junction | **2+1** | Expert mode gate |
| 4 | Мутагенез | Expert ON → кнопка Мутагенез | **2+1** | Expert mode gate |
| 5 | Олиго-менеджер | Expert ON → кнопка Олиги | **2+1** | Expert mode gate |
| 6 | Выбрать GG фермент | Expert ON → dropdown | **2+1** | Expert mode gate |
| 7 | Стратегия сборки (Авто/2ч.) | Expert ON → видно | **2+1** | Expert mode gate |
| 8 | Добавить свой фрагмент | + → заполнить форму → Save | **3+** | Нормально для формы |
| 9 | Склеить фрагменты | Ctrl+Click × N → Склеить | **N+1** | Ок для N=2, плохо для N>2 |

### ✅ Уже ≤ 2 кликов

| # | Операция | Действие | Кликов |
|---|----------|----------|--------|
| 1 | Добавить фрагмент | Drag из палитры | **1** |
| 2 | Удалить фрагмент | Ctrl+Click → Del | **2** |
| 3 | Перевернуть (RC) | Hover → ↻ | **2** |
| 4 | Скопировать sequence | Right-click → Copy | **2** |
| 5 | Toggle ПЦР | Hover → PCR btn | **2** |
| 6 | Circular/Linear | Click toggle | **1** |
| 7 | Метод сборки | Click в toolbar | **1** |
| 8 | Переключить view | Ctrl+1/2/3/4/5 | **1** |
| 9 | Рассчитать праймеры | Автоматически | **0** |
| 10 | Экспорт GenBank | Click button | **1** |
| 11 | Новая сборка | Click "+Новая" | **1** |
| 12 | Undo/Redo | Ctrl+Z / Ctrl+Shift+Z | **1** |

---

## Решение: Убрать Expert mode как gatekeeper

### Проблема

Expert mode прячет **8 из 9** нарушителей. Студенческий режим задумывался как "простой", но на практике делает приложение бесполезным — нельзя ни отредактировать фрагмент, ни настроить junction.

### Решение

**Expert mode = всегда ON.** Убрать toggle из тулбара. Все кнопки (✏️, ✂, junction click, мутагенез) доступны всегда.

Если нужен "студенческий" режим в будущем — реализовать как guided wizard, не как скрытие кнопок.

### Что это даёт

| Операция | Было | Стало |
|----------|------|-------|
| Редактировать фрагмент | 3 (Expert + hover + ✏️) | **2** (hover + ✏️) |
| Разрезать фрагмент | 3 | **2** (hover + ✂) |
| Настроить junction | 3 | **1** (click junction) |
| Мутагенез | 3 | **1** (кнопка в toolbar) |
| GG фермент | 3 | **1** (dropdown) |

---

## Полная карта: ≤ 2 клика на ВСЁ

### Фрагменты на canvas

| Операция | Клик 1 | Клик 2 | Горячая клавиша |
|----------|--------|--------|-----------------|
| Добавить | Drag из палитры | — | — |
| Удалить | Click (select) | Del | `Del` |
| Удалить несколько | Ctrl+Click × N | Del | `Ctrl+A, Del` |
| Редактировать | Click | ✏️ в hover toolbar | `Enter` (если selected) |
| Перевернуть (RC) | Click | ↻ в hover toolbar | `R` (если selected) |
| Разрезать | Click | ✂ в hover toolbar | `S` (если selected) |
| Toggle ПЦР | Click | PCR в hover toolbar | `P` (если selected) |
| Копировать sequence | Right-click | Copy | `Ctrl+C` (если selected) |
| Переместить | Drag на canvas | — | — |
| Склеить 2+ | Click первый → Click второй | Floating "Склеить" | — |
| Развернуть склейку | Click "Развернуть" | — | — |
| Заменить вариантом | Click badge "N" | Click variant | — |

**Ключевое изменение:** Обычный click = select (вместо Ctrl+Click). Ctrl+Click = добавить к selection. Это стандартный UX (как в проводнике файлов).

### Junctions

| Операция | Клик 1 | Клик 2 |
|----------|--------|--------|
| Настроить тип | Click junction | Click тип |
| Изменить overlap | Click junction | Ввести число |
| Переключить mode (split/left/right) | Click junction | Click mode |

Все за 2 клика — junction panel открывается сразу (без Expert gate).

### Views

| Операция | Горячая клавиша | Клик |
|----------|-----------------|------|
| Blocks | `Ctrl+1` | Click tab |
| Sequence | `Ctrl+2` | Click tab |
| Map | `Ctrl+3` | Click tab |
| Racetrack | `Ctrl+4` | Click tab |
| Flow | `Ctrl+5` | Click tab |

### Сборки (tabs)

| Операция | Действие |
|----------|----------|
| Новая сборка | Click "+ Новая" |
| Переключить | Click tab |
| Переименовать | Double-click tab |
| Удалить | Right-click tab → Delete |

### Экспорт

| Операция | Клик |
|----------|------|
| GenBank | 1 (кнопка внизу) |
| Протокол | 1 (кнопка внизу) |
| Сохранить .pvcs | 1 (кнопка внизу) |

### Toolbar

| Операция | Клик |
|----------|------|
| Undo | 1 / Ctrl+Z |
| Redo | 1 / Ctrl+Shift+Z |
| Метод (Overlap/GG) | 1 (click button) |
| Circular toggle | 1 |
| Мутагенез | 1 (если fragment selected) |
| Олиго-менеджер | 1 |
| Запчасти | 1 |
| Данные | 1 |

---

## Новые горячие клавиши (дополнение к существующим)

| Клавиша | Действие | Контекст |
|---------|----------|----------|
| `Del` / `Backspace` | Удалить выбранные | Фрагмент(ы) selected |
| `Escape` | Сбросить выбор | — |
| `Ctrl+A` | Выбрать все фрагменты | — |
| `Ctrl+Z` | Undo | Уже есть |
| `Ctrl+Shift+Z` | Redo | Уже есть |
| `Ctrl+1-5` | Переключить view | Уже есть |
| `R` | Reverse complement | Фрагмент selected |
| `E` или `Enter` | Редактировать фрагмент | Фрагмент selected |
| `Ctrl+C` | Копировать sequence | Фрагмент selected |
| `Ctrl+D` | Дублировать фрагмент | Фрагмент selected |

---

## Изменение модели selection

### Было (текущее)

```
Click = highlight в палитре (highlightedPartId)
Ctrl+Click = select для merge (selectedFragIndices)
```

Два разных механизма, визуально путаются.

### Стало (новое)

```
Click = select (selectedFragIndices) + highlight в палитке
Click на другой = переключить selection (single select)
Ctrl+Click = добавить к selection (multi-select)
Shift+Click = выбрать диапазон (range select)
Click на пустое = сбросить selection
```

Это стандартная модель (как Finder/Explorer/Figma). Один клик = один выбранный. Ctrl = добавить. Shift = диапазон.

**Merged блок:**
- Click на merged = select merged
- Double-click на merged = развернуть (unfold)

---

## Контекстное меню (right-click)

### На фрагменте:

```
┌─────────────────────────────┐
│ ✏️  Редактировать            │
│ ↻   Перевернуть (RC)        │
│ ✂   Разрезать                │
│ 📋  Копировать sequence      │
│ 🔗  Склеить с соседним →     │
│ ─────────────────────────── │
│ 🗑   Удалить                 │
└─────────────────────────────┘
```

### На merged блоке:

```
┌─────────────────────────────┐
│ 🔍  Развернуть              │
│ 📋  Копировать sequence      │
│ ─────────────────────────── │
│ 🗑   Удалить                 │
└─────────────────────────────┘
```

### На junction:

```
┌─────────────────────────────┐
│ ◀▶  Overlap                 │
│ 🔶  Golden Gate             │
│ ✂   RE/Лигирование         │
│ 🔄  KLD                     │
│ ─────────────────────────── │
│ ⚙️   Настройки стыка...      │
└─────────────────────────────┘
```

### На пустом canvas:

```
┌─────────────────────────────┐
│ ➕  Добавить фрагмент        │
│ 📂  Импортировать файл       │
│ ⭕  Circular / Linear        │
└─────────────────────────────┘
```

---

## Реализация: что менять

### 1. Expert mode → всегда ON

**Файл:** `App.jsx`

```js
// Убрать кнопку toggle Expert в toolbar
// Убрать все проверки `expertMode &&` в условиях рендера
// Или: в store initial state: expertMode: true, и убрать toggleExpertMode из toolbar
```

Проще всего: `expertMode` default = `true`, убрать кнопку toggle из toolbar. Код с проверками `expertMode &&` оставить — не сломается.

### 2. Selection model

**Файл:** `PartBlock.jsx`

```jsx
onClick={(e) => {
  e.stopPropagation();
  if (e.ctrlKey || e.metaKey) {
    // Multi-select: toggle
    toggleFragSelection(index);
  } else if (e.shiftKey && selectedFragIndices.length > 0) {
    // Range select
    const last = selectedFragIndices[selectedFragIndices.length - 1];
    useStore.getState().selectFragRange(last, index);
  } else {
    // Single select: replace selection
    clearFragSelection();
    toggleFragSelection(index);
  }
  setHighlightedPartId(fragment.partId || null);
}}
```

### 3. Double-click на merged = unfold

**Файл:** `PartBlock.jsx`

```jsx
onDoubleClick={(e) => {
  e.stopPropagation();
  if (fragment.subFragments?.length > 0) {
    // Unfold this specific merged block
    // ... dispatch unfold action
  } else {
    // Open editor
    onEditFragment?.(index);
  }
}}
```

### 4. Горячие клавиши R/E/Ctrl+C/Ctrl+D

**Файл:** `DesignCanvas.jsx` keyboard handler

```js
// R = reverse complement selected
if (e.key === 'r' && selectedFragIndices.length === 1) {
  onFlip(selectedFragIndices[0]);
}

// E or Enter = edit selected
if ((e.key === 'e' || e.key === 'Enter') && selectedFragIndices.length === 1) {
  onEditFragment(selectedFragIndices[0]);
}

// Ctrl+C = copy sequence
if (e.ctrlKey && e.key === 'c' && selectedFragIndices.length > 0) {
  const seqs = selectedFragIndices.map(i => fragments[i]?.sequence || '');
  navigator.clipboard.writeText(seqs.join(''));
}

// Ctrl+D = duplicate
if (e.ctrlKey && e.key === 'd' && selectedFragIndices.length === 1) {
  e.preventDefault();
  const frag = fragments[selectedFragIndices[0]];
  onDrop({ ...frag, id: `dup_${Date.now()}`, name: frag.name + '_copy' });
}
```

### 5. Context menu на junction

**Файл:** `JunctionBlock.jsx`

Убрать `expertMode &&` из onClick. Junction всегда кликабельный.

---

## Приоритеты реализации

### Фаза 1 (критично — прямо сейчас)

1. ☐ Expert mode default = true, убрать toggle из toolbar
2. ☐ Click = single select (не Ctrl+Click)
3. ☐ Junction click без Expert gate

### Фаза 2 (важно)

4. ☐ Double-click на фрагмент = Edit
5. ☐ Double-click на merged = Unfold
6. ☐ Shift+Click = range select
7. ☐ Горячие клавиши R/E/Enter

### Фаза 3 (полировка)

8. ☐ Context menu на junction (быстрый switch type)
9. ☐ Context menu на пустом canvas
10. ☐ Ctrl+C / Ctrl+D
11. ☐ Rename assembly по double-click на tab

---

## Визуальная карта (итого)

```
                    TOOLBAR (всё в 1 клик)
┌────────────────────────────────────────────────────────┐
│ Undo Redo │ Overlap GG │ Мутагенез Олиги Запчасти Данные │
└────────────────────────────────────────────────────────┘

                    CANVAS (блоки + junctions)
┌────────────────────────────────────────────────────────┐
│                                                        │
│  Click = select                     Del = delete       │
│  Ctrl+Click = multi-select          R = reverse        │
│  Shift+Click = range                E = edit           │
│  Double-click = edit/unfold         Esc = deselect     │
│  Right-click = context menu                            │
│  Drag = reorder                                        │
│                                                        │
│  Junction click = настройки (БЕЗ expert gate)          │
│                                                        │
│  [🔗 Склеить N фрагментов]  ← floating при selection   │
│                                                        │
└────────────────────────────────────────────────────────┘

                    TABS (views, 1 клик / Ctrl+N)
┌────────────────────────────────────────────────────────┐
│ 📦 Блоки │ 🧬 Посл. │ ⭕ Карта │ 🏟 Стадион          │
│ Ctrl+1     Ctrl+2      Ctrl+3     Ctrl+4               │
└────────────────────────────────────────────────────────┘
```

**Ни одна операция > 2 кликов.**
