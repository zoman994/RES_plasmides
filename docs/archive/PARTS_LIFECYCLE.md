# PARTS_LIFECYCLE.md — Управление запчастями: статусы, видимость, планировщик

**Статус (на 26.04.2026):** ✅ ЧАСТИЧНО РЕАЛИЗОВАНО. Блок 3a (баги + UI) ✅. Блок 3b (статусы + lifecycle) ✅. **Фаза 2** (Flow Canvas рамки) — частично реализована в Project Flow Phase 2 (см. `docs/archive/TASK_FLOW_PHASE2_3.md`). **Фаза 3** (Checkpoint → verified transition) — механизм перехода «draft → verified» через CheckpointNode на Flow на момент архивации не подтверждён в коде (CheckpointNode в PROJECT_STATE есть как node type, но его wiring к `parts.status` не обсуждался в последующих спринтах). Отложено на v1.0/v1.1.

**Спека исходно от 01.04.2026.** Архивировано 26.04.2026 в рамках финализации цикла Sprint X cycle (docs/ cleanup). Три ключевых принципа (parts глобальны, status + provenance определяют отображение; «Группировка вместо скрытия» в палитре; «Проект = workflow, запчасти переживают проект») остаются в действии в продукте.

---

# PARTS_LIFECYCLE.md — Управление запчастями: статусы, видимость, планировщик  
**Дата спеки:** 1 апреля 2026 (v2)  
**Зависит от:** ANNOTATION_VERSIONING.md (archive), BLOCK2_TOOLBAR_CONTEXT.md (archive)

---

## 1. Проблема

Текущая модель: `parts[]` — один плоский глобальный массив без понятия статуса. Мутанты, промежуточные split-фрагменты, assembly products, стандартные элементы — всё вперемешку. `completeAssembly()` дублирует данные в отдельный inventory в localStorage.

Результат: 200+ элементов после 100 операций. "Сборка 3" × 3 с разными последовательностями. Мутанты из Проекта 1 засоряют палитру Проекта 2.

Два бага: stale closure при загрузке (parts пропадают), hooks violation в PartsPalette.

---

## 2. Ключевые принципы

### 2.1 Проект = workflow, запчасти переживают проект

Плазмида = физический результат проекта, но она же = источник запчастей для следующего. Удалить проект, но сохранить плазмиду — нормально.

**Следствие: scope по проекту — неправильная модель.** Все parts глобальны. Status + provenance определяют отображение.

### 2.2 Группировка вместо скрытия

Палитра показывает ВСЕ non-archived parts. Ничего не прячется — но группируется по релевантности:
- «Этот проект» — draft-ы из текущего проекта (раскрыт)
- «Библиотека» — verified parts (раскрыт)
- «Другие проекты» — draft-ы из других проектов (свёрнут)
- «Инвентарь» — PCR products (свёрнут)

### 2.3 Миграция: не угадывать

ВСЕ существующие parts → `verified` при миграции. Без исключений. Пользователь может потом архивировать ненужное. Мы не знаем, что физически существует — не угадываем.

### 2.4 addFragment() не трогаем

Текущая проверка `!parts.some(p => p.id === part.id)` уже предотвращает дубли. Проблема загрязнения решается через фильтрацию, не через отключение сохранения.

### 2.5 Flow Canvas — только отображение

Flow показывает status цветом рамки (read-only). Status меняется ТОЛЬКО из палитры или контекстного меню. Checkpoint → verified автоматизация — Фаза 3, когда flow стабилен.

---

## 3. Три статуса part

### 3.1 `draft` (Запланирован)

Существует только в компьютере. Ещё не получен в лабе.

**Получают автоматически (только НОВЫЕ parts после обновления):**
- Результат мутагенеза (source: 'mutagenesis', 'mutation')
- Split/fusion результаты (source: 'split', 'fusion')
- Assembly products (source: 'assembly')
- Ручной ввод последовательности (source: 'manual')

**Видимость:** везде (в секции «Этот проект» или «Другие проекты»).

### 3.2 `verified` (Получен)

Существует физически. Подтверждён.

**Получают автоматически:**
- Импорт из .dna / .gb
- API fallback parts
- ВСЕ существующие parts при миграции v5→v6

**Получают вручную:**
- Кнопка "Mark as verified" в контекстном меню

**Видимость:** везде (в секции «Библиотека»).

### 3.3 `archived` (В архиве)

Скрыт из палитры. Не удалён — можно восстановить.

**Попадают сюда:**
- Вручную: "Archive" из контекстного меню
- При удалении проекта: все draft-ы этого проекта (с confirm)

**Видимость:** только через фильтр "Показать архив".

### 3.4 Переходы

```
draft → verified    : "Mark as verified" (правый клик)
draft → archived    : "Archive" / удаление проекта
verified → archived : "Archive"
archived → draft    : "Restore"
archived → verified : "Restore as verified"
```

---

## 4. Data model

```js
{
  id: 'part_abc123',
  name: 'pGAP-XynTL-D908A',
  type: 'plasmid',
  sequence: 'ATG...',
  length: 7200,
  topology: 'circular',
  annotations: [...],

  // ═══ НОВЫЕ ПОЛЯ ═══
  status: 'draft',           // 'draft' | 'verified' | 'archived'
  verifiedDate: null,         // ISO date | null
  origin: {                   // provenance, не ownership
    projectId: 'proj_1',
    projectName: 'Проект 1',
    assemblyId: 'asm_3',
    createdAt: '2026-03-30T14:22:00Z',
  },

  // ═══ СУЩЕСТВУЮЩИЕ ПОЛЯ (без изменений) ═══
  parentId, derivation, children, source, organism, tags
}
```

---

## 5. Палитра: группировка

### 5.1 Четыре секции

```
Палитра (Проект 2 активен)
│
├─ ЭТОТ ПРОЕКТ (раскрыт)
│  ├── PcbhI-BGL1 [Запланирован]
│  └── pCBH-BGL1  [Запланирован]
│
├─ БИБЛИОТЕКА (раскрыт, по категориям)
│  ├─ Coding (3)
│  ├─ Regulatory (2)
│  ├─ Plasmids (2)
│  └── ...
│
├─ ДРУГИЕ ПРОЕКТЫ (3) ▶ [свёрнут]
│
└─ ИНВЕНТАРЬ (7) ▶ [свёрнут]
```

### 5.2 Формула группировки

```js
// «Этот проект» — draft-ы текущего проекта
const thisProject = parts.filter(p =>
  p.status === 'draft' && p.origin?.projectId === activeProjectId
);

// «Библиотека» — verified
const library = parts.filter(p => p.status === 'verified' || !p.status);

// «Другие проекты» — draft-ы чужих проектов
const otherProjects = parts.filter(p =>
  p.status === 'draft' && p.origin?.projectId && p.origin.projectId !== activeProjectId
);
```

### 5.3 Поиск

Поиск ищет по ВСЕМ non-archived parts. Результат показывает статус-бейдж и origin.

---

## 6. Интеграция с Flow Canvas (Фаза 2+)

### 6.1 Фаза 2: read-only отображение

- PlasmidNode рамка = status цвет (зелёная/жёлтая)
- Badge: «Получен» / «Запланирован»
- Статус берётся из store по partId (реактивно)
- Status НЕ меняется из Flow — только отображается

### 6.2 Фаза 3: автоматизация

- CheckpointNode → "all pass" prompt → "Mark as verified?"
- Только после стабилизации Flow Canvas

---

## 7. Автоматические статусы при создании НОВЫХ parts

| Операция | source | status |
|----------|--------|--------|
| Import .dna/.gb | 'import' | verified |
| API fallback parts | 'api' | verified |
| Manual paste | 'manual' | draft |
| Mutagenesis | 'mutagenesis' | draft |
| Assembly product | 'assembly' | draft |
| Split | 'split' | draft |
| Fusion | 'fusion' | draft |

---

## 8. Persist migration v5 → v6

```js
// Безопасная миграция: все → verified
if (version < 6 && persisted?.parts) {
  persisted.parts = persisted.parts.map(p => {
    if (p.status) return p; // already migrated
    return { ...p, status: 'verified' }; // safe default
  });
}
```

---

## 9. При удалении проекта

1. Confirm: "В проекте N запланированных элементов. Архивировать?"
2. draft с origin.projectId === deleted → archived
3. verified → остаются
4. Assemblies и flow nodes удаляются

---

## 10. Product naming

При completeAssembly: `{projectName} — {assemblyName}` по умолчанию.
Проверка уникальности имени. Prompt при дублировании.

---

## 11. Фазы реализации

### Блок 3a (сейчас) — баги + UI, без риска

1. BUG-70: stale closure в App.jsx
2. BUG-71: hooks violation в PartsPalette
3. Inventory свёрнут по умолчанию
4. "Другие источники" → компактные кнопки

### Блок 3b (после проверки 3a) — status + lifecycle

5. status поле + миграция v5→v6 (все → verified)
6. origin поле при создании parts
7. Группировка палитры: 4 секции
8. Status badges
9. Context menu: verify / archive / restore
10. Product naming

### Фаза 2 (позже)

11. Inventory → partId ссылки
12. Flow Canvas рамки по status (read-only)

### Фаза 3 (ещё позже)

13. Checkpoint → verified автоматизация
14. Auto-archive old drafts
