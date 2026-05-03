# UX_POLISH.md — Action Bar + Header Cleanup + Construct↔Flow Link

**Статус:** ПЛАН  
**Приоритет:** P2 (после Quick Start)

---

## A. Action Bar после расчёта праймеров

### Проблема

Праймеры рассчитаны, но пользователь не видит "что дальше". Кнопки экспорта внизу после скролла. "Завершить сборку" спрятана во вкладке Protocol.

### Решение

Sticky action bar между canvas и tabs, появляется когда `calculated === true`:

```
┌─────────────────────────────────────────────────────────────┐
│ ✅ 6 пар праймеров  │  📋 Протокол  │  📧 Заказ  │  💾 GenBank  │  ✓ Завершить │
└─────────────────────────────────────────────────────────────┘
```

### Реализация

**Файл:** `src/components/ActionBar.jsx` (НОВЫЙ, ~50 строк)

```jsx
export default function ActionBar({ primerCount, onExportProtocol, onExportGenBank, onOrderOligos, onComplete }) {
  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-green-50 border border-green-200 rounded-lg">
      <span className="text-sm text-green-700 font-medium">✅ {primerCount} пар праймеров</span>
      <div className="flex-1" />
      <button onClick={onExportProtocol} className="text-xs ...">📋 Протокол</button>
      <button onClick={onOrderOligos} className="text-xs ...">📧 Заказ олигов</button>
      <button onClick={onExportGenBank} className="text-xs ...">💾 GenBank</button>
      <button onClick={onComplete} className="text-xs bg-green-600 text-white ...">✓ Завершить</button>
    </div>
  );
}
```

**Интеграция в App.jsx:** Вставить после DesignCanvas, перед tabs. Условие: `calculated && primers.length > 0 && !active.completed`.

Удалить дублирующие кнопки экспорта внизу (или оставить как secondary).

---

## B. Header Cleanup

### Проблема

Polymerase selector и Primer prefix в header занимают место и редко меняются.

### Решение

1. Убрать из header: polymerase select, primer prefix input
2. Перенести в ProjectBar (рядом с именем проекта) или в settings dropdown (⚙️)
3. В header оставить: Logo + Undo/Redo + (Олиги, Запчасти, Данные) + Clear

### Реализация

**Файл:** `App.jsx`

Вариант A (проще): Вынести polymerase/prefix в collapsible "⚙️ Настройки" dropdown в header:

```jsx
<details className="relative">
  <summary className="text-xs px-2 py-1 ...">⚙️</summary>
  <div className="absolute right-0 mt-1 bg-white rounded-lg shadow-lg p-3 z-50 min-w-[200px]">
    <label>Полимераза: <select ... /></label>
    <label>Prefix: <input ... /></label>
  </div>
</details>
```

Вариант B (чище): Перенести в ProjectBar под именем проекта — маленький текст "Q5 · Prefix: IS · Circular".

**Рекомендация:** Вариант A — минимальные изменения, 0 риска.

---

## C. Construct ↔ Flow Link

### Проблема

Construct View и Project Flow — два разных мира. Пользователь не видит связи.

### Решение

1. В Construct View добавить breadcrumb:
```
📂 Мой проект → ⚗️ Gibson Assembly #1 → 📦 Construct
```

2. Клик по "📂 Мой проект" → `setProjectView('flow')`

3. В Project Flow: double-click на AssemblyNode → `setProjectView('construct')` + `switchAssembly(node.data.assemblyId)`

### Реализация

**Breadcrumb в App.jsx** (перед DesignCanvas, после AssemblyTabs):

```jsx
{projectView === 'construct' && (
  <div className="flex items-center gap-1 px-6 py-0.5 text-[10px] text-gray-400">
    <button onClick={() => setProjectView('flow')} className="hover:text-blue-500">
      📂 {projectName}
    </button>
    <span>→</span>
    <span className="text-gray-600">{active.name}</span>
  </div>
)}
```

**AssemblyNode double-click:** уже частично реализован (аудит F3 ✅). Проверить что `assemblyId` корректно связан.

---

## Файлы затрагиваемые

| Файл | Изменение | Пункт |
|------|-----------|-------|
| `components/ActionBar.jsx` | НОВЫЙ (~50 строк) | A |
| `App.jsx` | +ActionBar, header simplify, breadcrumb | A+B+C |

---

## Тесты

UI-only изменения — визуальная проверка. Unit-тесты не нужны.
