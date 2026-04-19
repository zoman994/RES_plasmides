# HANDOFF_SPRINT1.md — для следующей сессии Claude Chat

**Дата:** 19 апреля 2026
**От:** Claude Chat (сессия после Этапа 1.2 + визуального тестирования)
**Кому:** Claude Chat (следующая сессия) — написать финальную спеку Sprint 1

---

## TL;DR

Этап 1.2 завершён. Визуальное тестирование выявило **7 новых багов (V1-V7)**. Составлен план Sprint 1 (V5+V3+V4, ~4ч) → Sprint 2 (V7 InsertionClock + связанные, ~10-12ч) → Sprint 3 (P4) → v1.1 (P1 архитектурный).

**Твоя задача:** написать финальную спеку Sprint 1 в `CURRENT_TASK.md` для Claude Code. Вся диагностика уже сделана — ниже **готовый материал с номерами строк**.

---

## Шаг 1. Загрузка контекста

1. Прочитай этот файл целиком.
2. Через `Filesystem:read_multiple_files` прочитай:
   - `C:\Users\Zoman\Desktop\RESplasmide\CLAUDE.md`
   - `C:\Users\Zoman\Desktop\RESplasmide\BUGS.md` (там все V1-V7 записаны)
   - `C:\Users\Zoman\Desktop\RESplasmide\PROJECT_STATE.md`
   - `C:\Users\Zoman\Desktop\RESplasmide\CURRENT_TASK.md` (там спека 1.2 со статусом ✅ — можно перезаписывать)
3. **Ключевые исходники (уже просмотрены, можешь читать выборочно):**
   - `gui/designer/src/components/AnnotationEditor.jsx` строки 227-246 (annotation bar)
   - `gui/designer/src/components/JunctionBlock.jsx` строки 150-200 (type switching)
   - `gui/designer/src/components/JunctionDNA.jsx` строки 95-100, 185-240 (что рендерит по типу)
   - `gui/designer/src/components/MutagenesisWizard.jsx` строки 325-340 (onComplete payload)
   - `gui/designer/src/hooks/useFragmentHandlers.js` строки 179-215 (handleSaveFragment vs handleMutagenesis)
   - `gui/designer/src/mutagenesis.js` строки 122-135 (makeKLDStrategy return shape)

---

## Шаг 2. Роль

Ты — Chat в паре с Code. Правила в `CLAUDE.md` секция «Правила». Ключевое: **не редактируешь src/**, пишешь спеку → Code реализует. Перед запуском Code — верифицируешь план через реальное чтение кода (обязательно).

Пользователь — Игорь. Русскоязычный, ценит прямоту. Использует терминал для Code. Запускает из Windows PowerShell.

---

## Шаг 3. Что произошло в текущей сессии

### Этап 1.2 ✅ закоммичен (`5837801`)
- TYPE_MAP пересмотрен в `import-annotations.js`
- 604/604 Vitest ✅, 112/112 pytest ✅, build clean
- 9 изменённых файлов, +454/-63

### Визуальное тестирование выявило 7 новых багов (V1-V7)

Все записаны в BUGS.md. Актуальный OPEN:

| # | Severity | Bug |
|---|---------|-----|
| P1 | CRIT | 1 фрагмент → 4 stale-праймеров (повтор, архитектурный, → v1.1) |
| V1 | CRIT | PlasmidMap нечитаем для плазмид с крупными region-аннотациями (repeat_region 22% кольца на pDHG25) |
| P4 | HIGH | Нет аннотаций на PartBlock после «Как backbone» (повтор) |
| V4 | HIGH | MutagenesisWizard не добавляет праймеры — **Sprint 1** |
| V7 | HIGH | InsertionClock: нет видимости места вставки в backbone — **Sprint 2** (циферблат компонент) |
| P6 | MED | 1-nt highlight подсвечивает триплет |
| V2 | MED | Дубликаты перекрывающихся regions при импорте (AMA1 5256+5226) |
| V3 | MED | Junction-stale-RE: смена ligation→GG оставляет Ncol/Kpnl labels — **Sprint 1** |
| V5 | MED | Annotation bar: белый текст на жёлтых фонах — **Sprint 1** |
| V6 | MED | RE labels в MCS сливаются (pUC118) |
| B7 | LOW | GG overhang palette stale state |

### План роадмапа

- **Sprint 1** (~4ч): V5 + V3 + V4 — **твоя задача написать спеку**
- **Sprint 2** (~10-12ч): V7 InsertionClock + может закрыть V1/V2/V6 как побочный эффект
- **Sprint 3** (~3ч): P4 + P6 + B7
- **v1.1**: P1 архитектурный рефакторинг

---

## Шаг 4. Готовый диагностический материал для Sprint 1 спеки

### V5 ANNOTATION-BAR-CONTRAST

**Файл:** `gui/designer/src/components/AnnotationEditor.jsx`
**Строки:** 227-244

**Что сейчас:**
```jsx
{!hideBar && annotations.length > 0 && seqLength > 0 && (
  <div className="relative h-5 rounded overflow-hidden border mb-1.5 bg-gray-100">
    {annotations.filter(a => a.level !== 'point').map((a, i) => {
      const left = (a.start / seqLength) * 100;
      const width = Math.max(1, ((a.end - a.start) / seqLength) * 100);
      const color = a.color || ANNOTATION_COLORS[a.type] || ANNOTATION_COLORS.misc;
      const opacity = a.level === 'region' ? 0.9 : 0.7;
      return (
        <div key={i} className="absolute top-0 h-full flex items-center justify-center text-[6px] text-white font-medium truncate px-0.5 cursor-pointer"
          style={{ left: `${left}%`, width: `${width}%`, backgroundColor: color, opacity }}
          ...>
          {width > 10 ? a.name : ''}
        </div>
      );
    })}
  </div>
)}
```

**Проблема:** `text-white` hardcoded. На жёлтом `#FBBF24` (marker), бледно-зелёных светлых CDS — нечитаем.

**Фикс:** вычислить luminance фона → выбрать белый или тёмный текст.

```jsx
// Добавить helper в начало файла или импортировать:
function getTextColor(bgHex) {
  if (!bgHex?.startsWith('#')) return '#FFFFFF';
  const hex = bgHex.slice(1);
  const r = parseInt(hex.slice(0, 2), 16) || 0;
  const g = parseInt(hex.slice(2, 4), 16) || 0;
  const b = parseInt(hex.slice(4, 6), 16) || 0;
  // Standard luminance formula (WCAG)
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.55 ? '#1F2937' : '#FFFFFF';
}
```

Затем заменить `text-white` в `className` на inline `color: getTextColor(color)`.

**Тесты:** unit-test на `getTextColor` (5-6 кейсов: чёрный→белый, белый→тёмный, жёлтый→тёмный, синий→белый, красный→белый, серый→тёмный).

**Оценка:** 45 минут.

---

### V3 JUNCTION-STALE-RE

**Файл:** `gui/designer/src/components/JunctionBlock.jsx`
**Строки:** 153-156, 175, 188, 281-286, 430

**Что сейчас (строки 153-156):**
```jsx
{ icon: '◀▶', label: 'Overlap', onClick: () => { onChange({ ...j, type: 'overlap' }); setCtxMenu(null); } },
{ icon: '🔶', label: 'Golden Gate', onClick: () => { onChange({ ...j, type: 'golden_gate' }); setCtxMenu(null); } },
{ icon: '🔪', label: 'RE лигирование', onClick: () => { onChange({ ...j, type: 'ligation' }); setCtxMenu(null); } },
{ icon: '🔄', label: 'KLD', onClick: () => { onChange({ ...j, type: 'kld' }); setCtxMenu(null); } },
```

**Проблема:** spread `...j` сохраняет `j.enzyme`, `j.reEnzyme`, `j.overhang` при смене type. При ligation→golden_gate `enzyme='NcoI'` остаётся, и `JunctionDNA.jsx:97` рендерит его как GG enzyme. В `JunctionDNA.jsx:185-187`:
```jsx
const enzKey = j.enzyme || 'BsaI';  // ← берёт stale 'NcoI'
```

**Фикс:** helper `resetJunctionForType(j, newType)`:

```js
function resetJunctionForType(j, newType) {
  const base = {
    id: j.id, overlapLength: j.overlapLength, overlapMode: j.overlapMode,
    autoMode: j.autoMode, calcMode: j.calcMode, tmTarget: j.tmTarget,
    type: newType,
  };
  if (newType === 'golden_gate') {
    return { ...base, enzyme: 'BsaI', overhang: '' };  // GG enzyme default
  }
  if (newType === 'ligation' || newType === 're_ligation') {
    return { ...base, reEnzyme: j.reEnzyme || '', enzyme: j.reEnzyme || '' };
    // сохраняем если был RE, иначе пусто
  }
  // overlap / kld — нет enzyme/overhang полей
  return base;
}
```

Затем заменить `onChange({ ...j, type: 'X' })` → `onChange(resetJunctionForType(j, 'X'))` в **5 местах**:
- Строка 153-156 (context menu, 4 кнопки)
- Строка 175 (`onChange({ ...j, type: 'golden_gate', enzyme: 'BsaI' })` — здесь уже GG с reset enzyme, но reEnzyme не чистится)
- Строка 188 (tab buttons `onChange({ ...j, type: tb.val })`)

**Тесты:** unit-test `resetJunctionForType` (4 кейса: all transitions + preservation of overlap length).

**Оценка:** 1 час.

---

### V4 MUTAGEN-NO-PRIMERS — **основной баг Sprint 1**

**Цепочка обрыва данных (3 места):**

**4a.** `gui/designer/src/mutagenesis.js:122-134` — `makeKLDStrategy` **ПРАВИЛЬНО** возвращает `primers: [...]`:
```js
return {
  strategy: 'kld',
  fragments: [{ name: 'template', ... }],
  junctions: [{ type: 'phosphorylated', ... }],
  primers,  // ← ЕСТЬ праймеры (generated от positions мутаций)
  protocol: '...',
  warnings,
  mutantSequence: mutantSeq,
  mutations,
};
```

**4b.** `gui/designer/src/components/MutagenesisWizard.jsx:328-336` — **ОБРЫВ**:
```jsx
onComplete({
  fragments: strategy.fragments.map((f, i) => ({...f, id: `mut_${i}`, isMutagenesis: true})),
  junctions: strategy.junctions,
  isMutagenesis: true,
  mutantSequence: strategy.mutantSequence,
  mutations: strategy.mutations,
  // ← strategy.primers ОТСУТСТВУЕТ в payload
});
```

**4c.** `gui/designer/src/hooks/useFragmentHandlers.js:209-214` — **тоже ОБРЫВ**:
```js
const handleMutagenesis = (result) => {
  updateActive({
    fragments: result.fragments.map(f => ({ ...f, id: `mf${Date.now()}_...`, isMutagenesis: true })),
    junctions: result.junctions,
    calculated: false,  // ← стоит false, надеясь на auto-design, но auto-design не знает что это KLD
  });
};
```

Для сравнения — **правильный паттерн в том же файле**, строки 155-182 (`handleSaveFragment` при ручном редактировании через FragmentEditor):
```js
// Auto-design KLD primers
const lastMut = updated.mutations[updated.mutations.length - 1];
if (lastMut?.codonStart != null || lastMut?.label) {
  const mutSite = lastMut.codonStart ?? (...);
  const kldP = designInlineKLDPrimers(updated.sequence, mutSite, 60);
  const kldPrimers = [/* fwd, rev */];
  const kldSteps = [/* pcr, kld_asm, transform, screening, sequencing */];
  const existingNonMut = (getActive()?.primers || []).filter(p => !p.isMutagenesis);
  updateActive({ 
    fragments: ..., 
    primers: [...existingNonMut, ...kldPrimers],  // ← ВОТ
    calculated: true, 
    protocolSteps: kldSteps 
  });
}
```

**Фикс:**

**4b фикс** — добавить `primers` и `protocol` в Wizard onComplete:
```jsx
onComplete({
  fragments: strategy.fragments.map((f, i) => ({...f, id: `mut_${i}`, isMutagenesis: true})),
  junctions: strategy.junctions,
  primers: strategy.primers,       // ← добавить
  protocol: strategy.protocol,     // ← добавить (string, переведётся в protocolSteps позже)
  warnings: strategy.warnings,     // ← добавить для UX
  isMutagenesis: true,
  mutantSequence: strategy.mutantSequence,
  mutations: strategy.mutations,
});
```

**4c фикс** — handleMutagenesis пишет primers + генерирует protocolSteps:
```js
const handleMutagenesis = (result) => {
  const primers = (result.primers || []).map(p => ({
    ...p,
    isMutagenesis: true,
    mutation: result.mutations?.[0]?.label || 'mutagenesis',
    // Примечание: имена праймеров из mutagenesis.js идут как KLD_fwd_*, 
    // можно перегенерировать с primerPrefix — см. как делает handleSaveFragment:161
  }));
  
  // Построить protocolSteps как в handleSaveFragment
  const protocolSteps = buildMutagenesisProtocolSteps(result);
  
  const existingNonMut = (getActive()?.primers || []).filter(p => !p.isMutagenesis);
  
  updateActive({
    fragments: result.fragments.map(f => ({ ...f, id: `mf${Date.now()}_${Math.random().toString(36).slice(2, 5)}`, isMutagenesis: true })),
    junctions: result.junctions,
    primers: [...existingNonMut, ...primers],
    calculated: primers.length > 0,  // ← true если pramers сгенерированы
    protocolSteps,
  });
};
```

**Альтернатива для 4c** (проще, не сохраняет протокол): скопировать блок из `handleSaveFragment:155-181` и просто его переиспользовать. Плюс: no регрессии. Минус: повтор кода.

**Вопрос к Chat (нужен ответ Игоря в следующей сессии):**
- Переиспользовать `designInlineKLDPrimers` (как `handleSaveFragment`) или положиться на primers из `computeMutagenesisStrategy`? Последнее семантически чище — strategy знает про multi-mutation и two_fragment, но primer naming в mutagenesis.js использует `KLD_fwd_*` вместо `IS001_mut_fwd_*`. Простой compromise: взять sequences из strategy, но применить правильный naming в handleMutagenesis.

**Тесты:** интеграционный тест что после `handleMutagenesis(result)` у активной assembly есть `primers.length > 0` и `primers[0].isMutagenesis === true`.

**Оценка:** 2-2.5 часа (включая выбор подхода, тесты, проверку edge cases — 2-fragment, multi_fragment из mutagenesis.js где `primers: []`).

---

## Шаг 5. Скелет спеки Sprint 1

```markdown
# CURRENT_TASK.md — Sprint 1: Quick Fixes + Mutagenesis

**Статус:** ⏳ К ВЫПОЛНЕНИЮ
**Приоритет:** V5 (MED, quick win) → V3 (MED, quick win) → V4 (HIGH, core workflow)
**Оценка времени:** 3.5-4 часа
**Ветка:** feat/sprint1-quickfixes

## Контекст
После Этапа 1.2 и визуального тестирования выявлены 3 бага которые можно закрыть одной сессией: два косметических quick wins (V5 contrast, V3 junction reset) и один HIGH (V4 mutagenesis primers).

## Scope
IN:
- V5: AnnotationEditor.jsx + helper getTextColor + тест
- V3: JunctionBlock.jsx + helper resetJunctionForType + тест
- V4: mutagenesis.js (проверить что primers генерятся), MutagenesisWizard.jsx onComplete payload, useFragmentHandlers.js handleMutagenesis + интеграционный тест

OUT:
- V1 PlasmidMap layout — Sprint 2 с InsertionClock
- V2 dup-regions — Sprint 2 (может решиться как side effect V7)
- V6 RE labels overlap — Sprint 2
- P4 backbone annotations — Sprint 3
- P6 1-nt highlight — Sprint 3
- B7 GG palette — Sprint 3
- P1 stale primers — v1.1

## Шаги
[Скопировать диагностику из этого HANDOFF секция 4. Каждый баг → файл + строки + БЫЛО + СТАЛО + тесты.]

## Чеклист для Code
- [ ] прочитать CLAUDE.md, BUGS.md, CURRENT_TASK.md
- [ ] прочитать AnnotationEditor.jsx строки 227-244
- [ ] прочитать JunctionBlock.jsx строки 150-200
- [ ] прочитать MutagenesisWizard.jsx строки 325-340
- [ ] прочитать useFragmentHandlers.js строки 155-215
- [ ] grep `text-white` в AnnotationEditor.jsx — только в annotation bar? (проверить что фикс не сломает tree list)
- [ ] **V4 вопрос к Chat ДО реализации**: какой подход к primers — strategy.primers или designInlineKLDPrimers?

[Остальное как в спеке 1.2]

## Регрессия
cd gui/designer && npx vitest run && npx vite build
Ожидание: 604 (было) + 3-5 новых = ~608 ✅
```

---

## Шаг 6. Что уточнить у Игоря ПЕРЕД запуском Code

1. **V4 approach** — использовать `strategy.primers` из `computeMutagenesisStrategy` или пересобирать через `designInlineKLDPrimers` в handleMutagenesis? Рекомендация: **strategy.primers** (чище, поддерживает multi-mutation), но с naming из handleMutagenesis (primerPrefix).
2. **V3 coverage** — resetJunctionForType применяется только в JunctionBlock context-menu и tab buttons, или ещё где-то меняется `j.type`? Grep `j\.type =` по src/ перед реализацией.
3. **Порядок выполнения** — V5 → V3 → V4 (рекомендация) или V4 первым (блокер workflow)?

---

## Контрольный список для следующей Chat сессии

- [ ] Прочитал HANDOFF_SPRINT1.md полностью
- [ ] Прочитал CLAUDE.md / BUGS.md / PROJECT_STATE.md / CURRENT_TASK.md (1.2 ✅)
- [ ] Задал Игорю 3 вопроса из Шага 6
- [ ] Составил финальную спеку в формате CURRENT_TASK.md
- [ ] Передал Игорю через outputs/ с PowerShell-скриптом применения
- [ ] НЕ писал спеку Sprint 2 (V7 Clock) — это отдельная большая задача

---

**Конец HANDOFF.**

Ключевые слова для `conversation_search` в истории: "Sprint 1", "V4 mutagenesis", "V5 contrast", "V3 junction", "handleMutagenesis", "makeKLDStrategy".
