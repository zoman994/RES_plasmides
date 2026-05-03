# Project Flow v2 — Последовательный планировщик операций

**Статус:** ⚱️ АРХИВ 22.04.2026. Universal ReactionNode концепция отвергнута в пользу 5-node-схемы (PlasmidNode/PCRNode/AssemblyNode/OligoNode/CheckpointNode). Ценные идеи (инвентарь 14 операций, primer auto-design в Flow, status tracking) извлечены в `docs/TASK_FLOW_PHASE2_3.md` (секция Reference в конце файла). **Не читать как план реализации** — файл сохранён как исторический контекст дизайн-решения.  
**Дата спеки:** 31 марта 2026  
**Принцип (исторический):** Каждый шаг = биологическая операция. Последовательное добавление от ноды к ноде. Праймеры предлагаются автоматически.

---

## Модель

### Тип ноды: ОДИН универсальный ReactionNode

Вместо 5 жёстких типов (plasmid/pcr/assembly/oligo/checkpoint) — **один тип ноды** с конфигурируемой операцией:

```
ReactionNode.data = {
  operation: string,        // тип операции (см. таблицу ниже)
  label: string,            // пользовательское имя ("ПЦР glaA cassette")
  status: 'planned' | 'in_progress' | 'done' | 'failed',
  
  // Operation-specific
  params: {},               // параметры (Tm, enzyme, time, temperature, etc.)
  inputs: [],               // что потребляет (template, primers, enzyme)
  outputs: [],              // что производит (product)
  
  // Primer integration
  primerFwd: null | Primer, // auto-designed или из registry
  primerRev: null | Primer,
  primerSource: 'auto' | 'registry' | 'manual',
}
```

### Типы операций

| Operation | Inputs | Outputs | Параметры |
|-----------|--------|---------|-----------|
| **source** | — | ДНК | Плазмида/геном из библиотеки |
| **pcr** | template + 2 primers | PCR product | Tm, polymerase, extension time, product size |
| **digest** | ДНК + enzyme(s) | Фрагменты | RE enzyme(s), buffer, time, temperature |
| **ligation** | 2+ фрагментов | Лигированный продукт | T4 ligase, ratio, time |
| **gibson** | 2+ фрагментов | Assembled product | Temperature (50°C), time (60 min) |
| **golden_gate** | 2+ фрагментов + enzyme | Assembled product | RE, cycles, time |
| **kld** | PCR product | Circularized product | KLD mix, time |
| **dpnI** | PCR product | Clean product | Time (1h), temperature (37°C) |
| **gel** | ДНК | Extracted band | Gel %, expected size, voltage |
| **purification** | ДНК | Clean DNA | Method (column/ethanol/beads) |
| **transformation** | ДНК | Colonies | Strain, method (chemical/electro), plates |
| **colony_pcr** | Colonies + 2 primers | Screening result | Expected size, # colonies |
| **sequencing** | ДНК + primer | Sequence data | Provider, turnaround |
| **miniprep** | Colonies | Plasmid DNA | Kit |

### Handles

Каждая нода:
- **Left** (target): основной вход (ДНК/product от предыдущего шага)
- **Right** (source): основной выход (product для следующего шага)
- **Top** (target, опционально): primer inputs для pcr/colony_pcr
- **Bottom** (source, опционально): waste/side products

### Edges

| Тип | Визуал | Семантика |
|-----|--------|-----------|
| **dna** | Solid blue | ДНК template/product flow |
| **primer** | Dashed teal | Primer connection |
| **reagent** | Dotted gray | Enzyme/buffer/reagent |

---

## UX: Последовательное добавление

### Click на + handle → выбор операции

```
[Plasmid] ─── + ─→ Dropdown:
                    🧪 ПЦР
                    ✂️  Рестрикция
                    🔗 Лигирование
                    ⚗️  Gibson
                    🔶 Golden Gate
                    🔄 KLD
                    💀 DpnI
                    📊 Гель
                    🧫 Трансформация
                    🔬 Colony PCR
                    📋 Секвенирование
                    🧹 Очистка
                    📦 Миниприп
```

### ПЦР с авто-праймерами

Когда создаётся PCR нода от PlasmidNode:

1. **Template** = source plasmid (автоматически из edge)
2. **Region** = пользователь выбирает регион (или весь фрагмент)
3. **Primers** = автоматический поиск:
   - Сначала: `findAllMatches()` из primer registry → если найдены → показать "✅ IS001 fwd (в наличии)"
   - Если нет: `findBinding()` → auto-design → показать "🆕 подобрать новые"
4. **Product** = автоматически: length = region + overlaps, name = region name

### Inline edit

Double-click на любое поле ноды → inline input:
- Label (имя операции)
- Product name
- Parameters (Tm, time, etc.)
- Status (click to cycle: planned → in_progress → done → failed)
- Notes (текстовое поле)

---

## Что ОСТАВИТЬ из текущего кода

| Компонент | Оставить | Изменить |
|-----------|----------|----------|
| ProjectFlowCanvas.jsx | ReactFlow, drop zone, auto-layout, export | MIRO+ dropdown → universal ops |
| PlasmidNode.jsx | Визуал, double-click → construct view | Dropdown → all operations |
| PCRNode.jsx | Базовый визуал | Добавить: primer handles, auto-design, inline edit |
| AssemblyNode.jsx | Визуал по методу | Добавить: link to assembly tab, inline edit |
| CheckpointNode.jsx | Визуал | Заменить на ReactionNode(sequencing/colony_pcr) |
| OligoNode.jsx | Визуал | Переименовать в PrimerNode, добавить handles |
| PCRPlanningPanel.jsx | Таблица ПЦР | Расширить: все операции, timeline view |
| projectFlowSlice.js | CRUD, edges, dagre | Добавить: universal addFlowReaction |

---

## Roadmap реализации

### Phase 1: Fix текущие баги (BUG-62..65)

1. PCRNode inline edit (productName, length, polymerase) → `updateFlowNodeData()`
2. CheckpointNode status toggle (click cycles pending→done→failed)
3. AssemblyNode → create new assembly tab + link by ID
4. MIRO+ dropdown: добавить RE, KLD, Overlap PCR, Transformation

### Phase 2: Primer connection

5. PCRNode auto-primer: при подключении template → lookup + auto-design
6. Primer handles на PCRNode (2 target handles сверху для fwd/rev)
7. PrimerNode (upgraded OligoNode) с sequence + Tm

### Phase 3: Universal ReactionNode

8. ReactionNode с configurable operation
9. Operation-specific parameter panels
10. Status tracking (planned → done → failed)

### Phase 4: Protocol timeline

11. Linear timeline view (parallel steps, times, dependencies)
12. Print-friendly protocol generation from flow
