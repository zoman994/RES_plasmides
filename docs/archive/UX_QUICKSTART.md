# UX_QUICKSTART.md — Welcome Screen + Smart Import Flow

**Статус:** ПЛАН  
**Приоритет:** P1 (после Блока 4b)  
**Зависимости:** Блок 4b (restriction cloning wizard) должен быть готов

---

## Проблема

1. Пользователь открывает BodgeGene впервые → пустой canvas + палитра 94+ запчастей. Непонятно с чего начать.
2. При импорте .dna/.gb файл уходит в библиотеку → нужно найти в палитре → drag → PlasmidUseWizard. Слишком много шагов.

---

## Решение A: Quick Start при пустом canvas

### Когда показывать

Условие: `fragments.length === 0 && !active.completed`

Вместо пустого canvas показать Quick Start panel прямо в DesignCanvas.jsx (не modal, а inline content).

### UI

```
┌─────────────────────────────────────────────────┐
│                                                   │
│          🧬 BodgeGene                             │
│          Конструктор генетических сборок           │
│                                                   │
│    Что вы хотите сделать?                         │
│                                                   │
│    🔪  Рестрикционное клонирование                │
│        Вставить ген в вектор по RE-сайтам         │
│                                                   │
│    ⚗️  Gibson / Overlap сборка                     │
│        Собрать конструкт из нескольких фрагментов │
│                                                   │
│    🔶  Golden Gate                                 │
│        Модульная сборка Type IIS                   │
│                                                   │
│    🔄  Мутагенез                                   │
│        Точечная мутация / делеция / инсерция       │
│                                                   │
│    📂  Импортировать плазмиду                      │
│        .dna · .gb · .gbk · .fasta                 │
│                                                   │
│    📦  Свободная сборка                            │
│        Перетащите запчасти из палитры              │
│                                                   │
│    ─── или перетащите файл сюда ───               │
│                                                   │
└─────────────────────────────────────────────────┘
```

### Действия по кликам

| Кнопка | Действие |
|--------|----------|
| Рестрикционное клонирование | `setModalMode('import')` → после импорта → `setWizardPlasmid(part)` → PlasmidUseWizard в режиме restriction_cloning |
| Gibson / Overlap | Скрыть Quick Start (пользователь переходит к drag из палитры). Показать tooltip "Перетащите фрагменты из палитры слева" |
| Golden Gate | То же + auto-set ggEnzyme |
| Мутагенез | `setShowMutagenesis(true)` (или `setModalMode('import')` → после импорта → мутагенез wizard) |
| Импортировать плазмиду | Открыть file picker (input type=file) |
| Свободная сборка | Скрыть Quick Start |

### Реализация

**Файл:** `src/components/QuickStart.jsx` (НОВЫЙ, ~80 строк)

```jsx
export default function QuickStart({ onAction }) {
  const actions = [
    { id: 'restriction', icon: '🔪', label: 'Рестрикционное клонирование', desc: '...' },
    { id: 'gibson', icon: '⚗️', label: 'Gibson / Overlap сборка', desc: '...' },
    { id: 'golden_gate', icon: '🔶', label: 'Golden Gate', desc: '...' },
    { id: 'mutagenesis', icon: '🔄', label: 'Мутагенез', desc: '...' },
    { id: 'import', icon: '📂', label: 'Импортировать плазмиду', desc: '...' },
    { id: 'free', icon: '📦', label: 'Свободная сборка', desc: '...' },
  ];
  
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="max-w-lg w-full ...">
        {actions.map(a => (
          <button key={a.id} onClick={() => onAction(a.id)} ...>
            <span>{a.icon}</span>
            <div><div>{a.label}</div><div>{a.desc}</div></div>
          </button>
        ))}
      </div>
    </div>
  );
}
```

**Интеграция в DesignCanvas.jsx:**
```jsx
if (fragments.length === 0 && !active.completed) {
  return <QuickStart onAction={handleQuickStartAction} />;
}
// ... existing canvas render
```

---

## Решение B: Smart Import Flow

### Текущий flow (5 шагов)
1. Drag файл на окно → handleFileDrop
2. `handleFileImport(file)` → parse
3. `setImportedData(data)` → `setModalMode('library')` → AddFragmentModal
4. Пользователь сохраняет в библиотеку
5. Находит в палитре → drag → wizard

### Новый flow (2 шага)
1. Drag файл на окно → parse
2. **Сразу показать ImportDecisionModal:**

```
┌────────────────────────────────────────────┐
│  📂 pAN7-1.dna                              │
│  7280 bp · circular · 12 features           │
│                                              │
│  Что сделать с этой плазмидой?              │
│                                              │
│  🔪  Клонировать (restriction)               │
│  ⚗️  Использовать как backbone (Gibson/GG)   │
│  🔄  Мутагенез                               │
│  👁  Просмотреть                             │
│  📚  Сохранить в библиотеку                  │
│  🧩  Разобрать на запчасти                   │
│                                              │
└────────────────────────────────────────────┘
```

### Действия

| Кнопка | Действие |
|--------|----------|
| Клонировать | `addPart(data)` → `setWizardPlasmid(part)` с preset mode 'restriction_cloning' |
| Backbone | `addPart(data)` → `setWizardPlasmid(part)` с preset mode 'use_whole' |
| Мутагенез | `addPart(data)` → `setWizardPlasmid(part)` с preset mode 'mutate' |
| Просмотреть | `addPart(data)` → `setViewerPart(part)` |
| В библиотеку | Текущий flow (AddFragmentModal) |
| Разобрать | `addPart(data)` → `setWizardPlasmid(part)` с preset mode 'disassemble' |

### Реализация

**Файл:** `src/components/ImportDecisionModal.jsx` (НОВЫЙ, ~100 строк)

**Изменения в App.jsx:**
```jsx
// Заменить:
//   setModalMode('library');
// На:
//   setImportDecision(data);  // показать ImportDecisionModal
```

### PlasmidUseWizard — preset mode

Добавить prop `presetMode`:
```jsx
<PlasmidUseWizard plasmid={wizardPlasmid} presetMode={wizardPresetMode} onClose={...} />
```

Если `presetMode` задан → пропустить step 'menu', сразу показать выбранный режим.

---

## Файлы затрагиваемые

| Файл | Изменение |
|------|-----------|
| `components/QuickStart.jsx` | НОВЫЙ (~80 строк) |
| `components/ImportDecisionModal.jsx` | НОВЫЙ (~100 строк) |
| `components/DesignCanvas.jsx` | Показать QuickStart при пустом canvas |
| `App.jsx` | handleFileDrop → ImportDecisionModal вместо library |
| `components/PlasmidUseWizard.jsx` | Принять presetMode prop |
| `store/uiSlice.js` | importDecisionData state |

---

## Тесты

Компоненты UI — визуальная проверка в браузере. Unit-тесты не нужны (нет бизнес-логики).
