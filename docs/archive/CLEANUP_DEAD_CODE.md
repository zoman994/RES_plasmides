# CLEANUP_DEAD_CODE.md — Удаление мёртвого кода и документационные хвосты

**Статус:** ⚱️ АРХИВ 22.04.2026. Спека частично реализована в Sprint 1.5 K4 V11 (коммит `67d2269`): взяли готовые `calcTmNN` + `gcPercent` из `tm-calculator.js` вместо создания нового `gcPctInt` helper'a. Остальные планы спеки (4 коммита безопасных чисток: SequenceEditor/CDSEditor/collections/part-variants удаление) отменены как неактуальные после трёх прошедших спринтов — кандидаты могли начать использоваться или быть удалены естественной работой, проверять заново без пользы. **Не читать как план** — если нужен dead-code cleanup, запускать свежую инвентаризацию через `grep -rn 'from.*X'`, не полагаться на список в этом файле.  
**Автор спеки:** Claude Chat, 21.04.2026  
**Приоритет:** Средний (tech debt, безопасные изменения)  
**Оценка времени (историческая):** 3–4 часа в одну сессию  
**Ветка (историческая):** `chore/cleanup-dead-code` (отдельная от Sprint 1.5)

---

## Цель

Удалить накопившийся за 228 коммитов мёртвый код и артефакты миграций. Все правки — **безопасные**: никаких рефакторингов рабочей логики, никаких переездов палитр, никаких изменений в store/api. Просто удаление файлов без входящих импортов + два точечных фикса, которые давно числятся в BUGS.

Задача разбита на **4 коммита**. Каждый коммит зелёный по тестам, изолированный, откатываемый.

---

## Перед началом — обязательные проверки

Это важно: инвентаризация импортов **до** начала работы. Если какой-то грep дал результат, которого нет в этой спеке — останавливаемся и отчитываемся Chat.

### Проверка 1: изолированность кандидатов

```bash
cd gui/designer
grep -rn "from.*SequenceEditor" src/ || echo "SequenceEditor — clean"
grep -rn "from.*CDSEditor"      src/ || echo "CDSEditor — clean"
grep -rn "from.*collections"    src/ || echo "collections — clean"
grep -rn "from.*part-variants"  src/ || echo "part-variants — clean"
```

**Ожидаемый результат:** только упоминания в `exports.js` (для `collections`). Все остальные — `clean`.

**Если нашёлся непредвиденный импорт:** остановиться, сохранить grep-output, вернуться к Chat. Не удалять.

### Проверка 2: тесты, которые НЕЛЬЗЯ ломать

Эти файлы НЕ удаляются несмотря на отсутствие прямых UI-потребителей, потому что покрыты тестами:

- `domain-detection.js::autoDetectDomains` — тестируется в `modules.test.js`
- `domain-detection.js::DOMAIN_COLORS` — тестируется в `modules.test.js`
- `primer-reuse.js::findCompatiblePrimers`, `buildOrderSheet` — тестируется в `modules.test.js`

`domain-detection.js` остаётся целиком. `primer-reuse.js` остаётся (используется через `useGeneratePrimers` → `findAllMatches`/`addPrimersToRegistry`).

### Проверка 3: baseline

```bash
cd gui/designer && npx vitest run
```

Зафиксировать число тестов (ожидается ~637–640 после Sprint 1.5). Это baseline — после каждого коммита число должно **совпадать** с baseline (удаление файла без импортёров не меняет количество тестов).

---

## Коммит 1: удаление мёртвых JS-файлов

### Файлы к удалению

| Файл | Строк | Обоснование |
|---|---|---|
| `gui/designer/src/components/SequenceEditor.jsx` | ~195 | Legacy-редактор из ранних блоков. `FragmentEditor` покрывает всё + мутагенез. Не импортируется нигде |
| `gui/designer/src/components/CDSEditor.jsx` | ~236 | Старый доменный редактор. `PartsLibrary` имеет кнопку «Редактор доменов», но она открывает `FragmentEditor` через `globalCDSPart` — `CDSEditor` никем не маунтится |
| `gui/designer/src/collections.js` | ~42 | CRUD для `localStorage.pvcs-collections`. Никто не пишет в этот ключ и никто не читает. `exports.js` имеет его в `DATA_LS_KEYS` — уберём в Коммите 3 |
| `gui/designer/src/part-variants.js` | ~113 | `detectModification`, `suggestVariantName`, `findRoot`, `collectFamily`. Ни один импорт. `findRoot` логика дублируется inline в `useFragmentHandlers.handleSaveFragment` — пока оставляем inline-копию, не трогаем работающий хук |

### Шаги

```bash
rm gui/designer/src/components/SequenceEditor.jsx
rm gui/designer/src/components/CDSEditor.jsx
rm gui/designer/src/collections.js
rm gui/designer/src/part-variants.js
```

### Проверка

```bash
cd gui/designer && npx vitest run && npx vite build
```

- Тесты: baseline (без изменений)
- Build: clean, никаких "module not found"

### Коммит

```
chore(cleanup): remove 4 unused modules (SequenceEditor, CDSEditor, collections, part-variants)

Dead files with zero inbound imports, accumulated over 228 commits.
Covered by manual grep inventory before deletion.

- SequenceEditor.jsx: superseded by FragmentEditor (edit + mutagenesis)
- CDSEditor.jsx: orphaned after PartsLibrary was wired to FragmentEditor
- collections.js: no reader, no writer — pvcs-collections LS key was never used
- part-variants.js: zero imports; findRoot duplicated inline in useFragmentHandlers

~586 lines removed. No behavior change.
```

---

## Коммит 2: вычистить ссылки на collections из exports.js

Поскольку сам файл `collections.js` удалён (Коммит 1), нужно убрать хвосты из `exports.js`.

### Файл: `gui/designer/src/exports.js`

**Убрать строку из `DATA_LS_KEYS`:**

БЫЛО:
```js
const DATA_LS_KEYS = {
  projects: 'pvcs_designer_state',
  primers: 'pvcs-primer-registry',
  inventory: 'pvcs-inventory',
  collections: 'pvcs-collections',
  customTypes: 'pvcs-custom-part-types',
  customRegions: 'pvcs-custom-region-types',
  domains: 'pvcs-parts-domains',
  userColors: 'pvcs-user-palette',
  oligos: 'pvcs-oligos',
};
```

СТАЛО:
```js
const DATA_LS_KEYS = {
  projects: 'pvcs_designer_state',
  primers: 'pvcs-primer-registry',
  inventory: 'pvcs-inventory',
  customTypes: 'pvcs-custom-part-types',
  customRegions: 'pvcs-custom-region-types',
  domains: 'pvcs-parts-domains',
  userColors: 'pvcs-user-palette',
  oligos: 'pvcs-oligos',
};
```

**В функции `exportParts`:**

БЫЛО:
```js
  try { data.inventory = JSON.parse(localStorage.getItem(DATA_LS_KEYS.inventory) || '[]'); } catch {}
  try { data.collections = JSON.parse(localStorage.getItem(DATA_LS_KEYS.collections) || '[]'); } catch {}
  try { data.customTypes = JSON.parse(localStorage.getItem(DATA_LS_KEYS.customTypes) || '[]'); } catch {}
```

СТАЛО:
```js
  try { data.inventory = JSON.parse(localStorage.getItem(DATA_LS_KEYS.inventory) || '[]'); } catch {}
  try { data.customTypes = JSON.parse(localStorage.getItem(DATA_LS_KEYS.customTypes) || '[]'); } catch {}
```

**В функции `applyImport` (ветка `type === 'parts'`):**

БЫЛО:
```js
  if (type === 'parts') {
    if (data.inventory) localStorage.setItem(DATA_LS_KEYS.inventory, JSON.stringify(data.inventory));
    if (data.collections) localStorage.setItem(DATA_LS_KEYS.collections, JSON.stringify(data.collections));
    if (data.customTypes) localStorage.setItem(DATA_LS_KEYS.customTypes, JSON.stringify(data.customTypes));
    if (data.domains) localStorage.setItem(DATA_LS_KEYS.domains, JSON.stringify(data.domains));
    return `Импортировано: ${data.parts?.length || 0} запчастей, ${data.collections?.length || 0} коллекций. Перезагрузите страницу.`;
  }
```

СТАЛО:
```js
  if (type === 'parts') {
    if (data.inventory) localStorage.setItem(DATA_LS_KEYS.inventory, JSON.stringify(data.inventory));
    if (data.customTypes) localStorage.setItem(DATA_LS_KEYS.customTypes, JSON.stringify(data.customTypes));
    if (data.domains) localStorage.setItem(DATA_LS_KEYS.domains, JSON.stringify(data.domains));
    return `Импортировано: ${data.parts?.length || 0} запчастей. Перезагрузите страницу.`;
  }
```

**Обратная совместимость с бэкапами, где `collections` было:** они продолжат импортироваться через ветку `type === 'backup'` (там применяется только то, что есть в `DATA_LS_KEYS`, так что пустое поле `collections` в старом JSON просто не попадёт ни в один ключ — молча пропустится). Но если пользователь хочет восстановить старый бэкап с реальными коллекциями — они не применятся. Это приемлемо: поле было dead-feature, его никто не использовал.

### Проверка

```bash
cd gui/designer && npx vitest run && npx vite build
```

Тесты: baseline. Build: clean. Ручной smoke test DataManager не обязателен — код тривиальный.

### Коммит

```
chore(cleanup): drop collections field from exports.js

collections.js was removed in prev commit. Exports module had stale
DATA_LS_KEYS entry and three places where it referenced the now-unused
pvcs-collections localStorage key. Backward compat: backups with
collections field silently skip it (unknown key).
```

---

## Коммит 3: точечный фикс V11 (KLD tm/gc = 0)

### Проблема

`mutagenesis.js::makeKLDStrategy` возвращает KLD-праймеры с хардкодом:

```js
tmBinding: 0, tmFull: 0, gcPercent: 0
```

`calcTmNN` из `tm-calculator.js` уже импортирован на строке 5 — воспользоваться им.

`buildMutagenesisPayload` передаёт эти нули в primer panel, UI показывает `0°C / 0%`, `annealTemp` считается как `Math.min(0, 0) = 0°C`. Пользователь не получает корректной температуры отжига.

### Файл: `gui/designer/src/mutagenesis.js`

Найти функцию `makeKLDStrategy`, блок `const primers = [...]` (~строки 120–135).

### Helper (добавить наверх файла после импортов)

```js
// GC percent (0–100) for display.
const gcPctInt = (seq) => {
  const s = (seq || '').toUpperCase();
  if (!s.length) return 0;
  const gc = (s.match(/[GC]/g) || []).length;
  return Math.round((gc / s.length) * 100);
};
```

### Правка

БЫЛО:
```js
  const primers = [
    { name: fwdName, sequence: fwdSeq, bindingSequence: fwdSeq, tailSequence: '',
      tailPurpose: mut.type === 'substitution' ? `mutant codon ${mut.newCodon}` : mut.type,
      tmBinding: 0, tmFull: 0, gcPercent: 0, length: fwdSeq.length, direction: 'forward' },
    { name: revName, sequence: revSeq, bindingSequence: revSeq, tailSequence: '',
      tailPurpose: 'back-to-back with fwd',
      tmBinding: 0, tmFull: 0, gcPercent: 0, length: revSeq.length, direction: 'reverse' },
  ];
```

СТАЛО:
```js
  const fwdTm = Math.round(calcTmNN(fwdSeq));
  const revTm = Math.round(calcTmNN(revSeq));
  const primers = [
    { name: fwdName, sequence: fwdSeq, bindingSequence: fwdSeq, tailSequence: '',
      tailPurpose: mut.type === 'substitution' ? `mutant codon ${mut.newCodon}` : mut.type,
      tmBinding: fwdTm, tmFull: fwdTm,
      gcPercent: gcPctInt(fwdSeq),
      length: fwdSeq.length, direction: 'forward' },
    { name: revName, sequence: revSeq, bindingSequence: revSeq, tailSequence: '',
      tailPurpose: 'back-to-back with fwd',
      tmBinding: revTm, tmFull: revTm,
      gcPercent: gcPctInt(revSeq),
      length: revSeq.length, direction: 'reverse' },
  ];
```

Примечание: для мутагенезного праймера нет длинного tail — `tmFull` по сути равен `tmBinding`. Это корректно для KLD (no tail = no overhang).

### Тест — обновить существующий в `mutagenesis.test.js`

Найти блок с описанием `makeKLDStrategy` / `computeMutagenesisStrategy` + KLD. Если тест ожидает `tmBinding: 0` — поменять на `toBeGreaterThan(0)`. Если тест не трогал это поле — добавить новый ассерт:

```js
it('KLD primers carry computed Tm and GC%, not placeholder zeros', () => {
  const template = 'ATG' + 'GCC'.repeat(300) + 'TAA';
  const mut = { type: 'substitution', dnaPosition: 300, newCodon: 'GCG', label: 'A100A' };
  const result = computeMutagenesisStrategy(template, [mut]);
  expect(result.strategy).toBe('kld');
  for (const p of result.primers) {
    expect(p.tmBinding).toBeGreaterThan(40);
    expect(p.tmBinding).toBeLessThan(90);
    expect(p.gcPercent).toBeGreaterThan(0);
    expect(p.gcPercent).toBeLessThanOrEqual(100);
  }
});
```

### Проверка

```bash
cd gui/designer && npx vitest run mutagenesis
cd gui/designer && npx vitest run && npx vite build
```

Тесты: baseline + 1 новый (= baseline + 1). Build: clean.

### BUGS.md

Переместить V11 из OPEN → FIXED. Секция в FIXED:

```markdown
### 21.04.2026 — V11 KLD-PRIMERS-ZERO-TM

- [x] **V11:** `makeKLDStrategy` в `mutagenesis.js` возвращал хардкод `tmBinding: 0, tmFull: 0, gcPercent: 0`. Fix: использовать `calcTmNN` (уже импортирован) + новый helper `gcPctInt`. Теперь KLD-олиги приходят с корректными значениями, UI показывает правильную температуру отжига. +1 unit-тест.
```

### Коммит

```
fix(mutagenesis): compute Tm and GC% for KLD primers (V11)

makeKLDStrategy returned hardcoded zeros for tmBinding/tmFull/gcPercent,
breaking the annealTemp calculation in protocolSteps (Math.min(0,0) = 0°C
in UI). calcTmNN was already imported but unused in this path.

Fix: compute Tm via existing calcTmNN + add gcPctInt helper. For KLD
primers there's no tail, so tmFull == tmBinding is correct.

Closes V11.
```

---

## Коммит 4: AddFragmentModal cDNA sanitize

### Проблема

В `AddFragmentModal.jsx`, обработчик кнопки «🧬 cDNA» (в Intron detection panel) использует legacy-regex `/[^ATCGatcg]/g`. Это нарушение контракта Этапа 1.1 — должен быть `sanitizeSequence`.

Биологическая цена: если пользователь вставил последовательность с IUPAC-символами (NNK/NDT saturation codons, R/Y/S/W/K/M/B/D/H/V ambiguity) и жмёт кнопку «cDNA» — эти символы молча стираются, cDNA получается искажённая.

### Файл: `gui/designer/src/components/AddFragmentModal.jsx`

Найти обработчик кнопки cDNA. Ключевая строка (ищется по точному тексту `getCDNA`):

БЫЛО:
```js
              <button onClick={() => {
                // Accept all introns then create cDNA Part
                const region = allAnnotations.find(a => a.level === 'region' && (a.type === 'CDS' || a.type === 'gene'));
                const intronAnns = intronsToAnnotations(intronCandidates, region?.id, 0);
                const cleaned = (sequence || '').replace(/[^ATCGatcg]/g, '');
                const cdnaSeq = getCDNA(cleaned, intronAnns);
```

СТАЛО:
```js
              <button onClick={() => {
                // Accept all introns then create cDNA Part
                const region = allAnnotations.find(a => a.level === 'region' && (a.type === 'CDS' || a.type === 'gene'));
                const intronAnns = intronsToAnnotations(intronCandidates, region?.id, 0);
                const cleaned = sanitizeSequence(sequence);
                const cdnaSeq = getCDNA(cleaned, intronAnns);
```

`sanitizeSequence` уже импортирован в этом файле на строке с импортом `sequence-utils` — не нужно править импорты.

### Дополнительная проверка

После правки прогнать по файлу grep:
```bash
grep -n "replace(/\[^ATCG" gui/designer/src/components/AddFragmentModal.jsx
```

Должно вернуть пусто. Если осталось — найти и заменить аналогично.

### Тест — добавить в `mutagenesis-wizard-sanitize.test.jsx` или завести отдельный

Предпочтительно: добавить короткий интеграционный тест в **новый файл** `gui/designer/src/__tests__/add-fragment-modal-sanitize.test.jsx`:

```jsx
/**
 * AddFragmentModal cDNA button — verify sanitize-at-entry contract (Stage 1.1).
 * IUPAC codes (N, R, Y, ...) in saturation codons must survive the sanitize,
 * unlike legacy /[^ATCGatcg]/g which stripped them silently.
 */
import { describe, it, expect } from 'vitest';
import { sanitizeSequence } from '../sequence-utils';

describe('AddFragmentModal cDNA — sanitize-at-entry', () => {
  it('sanitizeSequence preserves IUPAC NNK saturation codon', () => {
    const input = 'ATG NNK GCC TAA';
    const out = sanitizeSequence(input);
    expect(out).toContain('NNK');
    expect(out).toBe('ATGNNKGCCTAA');
  });

  it('sanitizeSequence strips BOM and whitespace', () => {
    const input = '\uFEFFATG\tGCC \nTAA';
    expect(sanitizeSequence(input)).toBe('ATGGCCTAA');
  });

  it('sanitizeSequence preserves all IUPAC ambiguity codes', () => {
    const input = 'ATGNRYSWKMBDHVATGC';
    expect(sanitizeSequence(input)).toBe('ATGNRYSWKMBDHVATGC');
  });
});
```

Смысл теста — не UI-интеграция (React/testing-library), а утверждение контракта. Это соответствует решению из DECISIONS (18.04.2026) «sanitize-at-entry как архитектурный контракт».

### Проверка

```bash
cd gui/designer && npx vitest run && npx vite build
```

Тесты: baseline + 3 новых (= baseline + 4 от Коммита 3 и этого).

### BUGS.md — добавить короткую запись в FIXED

```markdown
### 21.04.2026 — ADDFRAG-CDNA-SANITIZE

- [x] **ADDFRAG-CDNA-SANITIZE:** Кнопка cDNA в `AddFragmentModal.jsx::intron detection panel` использовала legacy `/[^ATCGatcg]/g` вместо `sanitizeSequence`. IUPAC-символы (NNK/NDT saturation + R/Y/S/W/K/M/B/D/H/V) стирались при создании cDNA-Part. Fix: 1 строка + 3 unit-теста в новом `add-fragment-modal-sanitize.test.jsx`. Контракт Этапа 1.1 восстановлен на этой точке входа.
```

### Коммит

```
fix(import): sanitize cDNA sequence through sanitizeSequence (Stage 1.1 contract)

AddFragmentModal cDNA button bypassed sanitizeSequence with legacy regex
/[^ATCGatcg]/g, silently stripping IUPAC codes from user sequences with
saturation codons (NNK/NDT) or ambiguity characters. One-line swap to the
centralized helper + 3 unit tests asserting the contract.
```

---

## Документационная гигиена (без коммита — на вашей стороне)

Эти правки **не делает Claude Code** — они для Игоря, вручную. Включены в спеку для полноты инвентаризации.

### Удалить из корня репо

```bash
rm 1.zip
rm документация.zip
rm bodgegene-docs-update.zip
rm apply-docs-update.ps1
```

Артефакты миграции доков. Бесполезны, занимают место, путают grep.

### Переместить в архив

```bash
git mv HANDOFF_SPRINT1.md  docs/archive/
git mv docs/PLAN_SPRINT1.md    docs/archive/
git mv docs/PLAN_STAGE_1_2.md  docs/archive/
```

Sprint 1 принят 20.04, Этап 1.2 закрыт 18.04 — спеки выполнены.

### Удалить из docs/archive/ (явно-стейл)

```bash
rm docs/archive/MASTER_TODO_STALE.md
rm docs/archive/PROJECT_INDEX_STALE.md
rm docs/archive/AUDIT_RU_PK_STALE.md
```

Сами себя помечают как stale в имени. Нет причин хранить.

### Прояснить

- `new_docs/` в корне — не упоминается в CLAUDE.md. Либо переместить содержимое в `docs/`, либо удалить. Решает Игорь, осмотрев.
- `docs/FLOW_V2_DESIGN.md` и `docs/TASK_FLOW_PHASE2_3.md` — Flow Phase 2+3 числится «частично реализовано». Решение (откатить ли, довести ли) — отдельный архитектурный вопрос, не cleanup.

---

## Итоговая проверка всей сессии

После всех 4 коммитов:

```bash
cd gui/designer && npx vitest run && npx vite build
cd ../..
find gui/designer/src -name "*.jsx" -o -name "*.js" | wc -l  # счёт файлов — на ~4 меньше
git log --oneline -5  # 4 новых коммита
```

Ожидание:
- Тесты: baseline + 4 (= 641–644)
- Build: clean
- Удалено: 4 JS-файла, ~586 строк dead-кода
- Закрыто багов: V11, ADDFRAG-CDNA-SANITIZE

---

## Обновить координирующие файлы (в рамках Коммита 4)

### PROJECT_STATE.md — добавить сессию

```markdown
### Сессия 21.04.2026 — Cleanup dead code + V11 + cDNA sanitize

Вычистили 4 мёртвых JS-файла (SequenceEditor, CDSEditor, collections, part-variants)
без входящих импортов — ~586 строк за 228 коммитов накопленных хвостов.

Точечные фиксы:
- V11: KLD-праймеры теперь с реальными Tm и GC% (calcTmNN + gcPctInt helper).
- ADDFRAG-CDNA-SANITIZE: cDNA-button в AddFragmentModal переведён на sanitizeSequence.

Тесты: 637 → **641+** (зависит от Sprint 1.5 baseline). Build: clean.

Dark code pruning оставлено на v1.1:
- Консолидация 4 цветовых палитр (FEATURE_COLORS / ANNOTATION_COLORS / DOMAIN_COLORS / COLORS).
- Аудит api.js (validateGoldenGate/calcTm/saveToPVCS).
- Derived primers вместо imperative push.
- См. `docs/FUTURE_CLEANUP.md`.
```

### DECISIONS.md — добавить запись

```markdown
[2026-04-21] **Cleanup dead code — порог безопасности: "нет входящих импортов + нет тестов".** При проходе инвентаризации кодобазы (chat audit 21.04) обнаружено 4 JS-файла-сироты: SequenceEditor, CDSEditor, collections, part-variants. Удалены без замены. `domain-detection.js::autoDetectDomains` + `DOMAIN_COLORS` **сохранены** несмотря на отсутствие UI-потребителей — покрыты `modules.test.js`. Правило: удаляем только то, что не импортируется продовым кодом И не упоминается тестами. Всё остальное — в `docs/FUTURE_CLEANUP.md` до появления явного потребителя или рефакторинга.
```

---

## Чеклист для Claude Code

**Перед началом:**
- [ ] Прочитать CLAUDE.md, BUGS.md, CURRENT_TASK.md (должен быть пустым или следующим спринтом)
- [ ] Убедиться, что Sprint 1.5 полностью закрыт (V11/V12/V13/V14 в FIXED в BUGS.md)
- [ ] Выполнить проверку 1 (grep на импорты) — записать результаты в терминале
- [ ] Выполнить проверку 3 (baseline `npx vitest run`) — записать число тестов

**Коммит 1: удаление 4 файлов**
- [ ] `rm gui/designer/src/components/SequenceEditor.jsx`
- [ ] `rm gui/designer/src/components/CDSEditor.jsx`
- [ ] `rm gui/designer/src/collections.js`
- [ ] `rm gui/designer/src/part-variants.js`
- [ ] `npx vitest run && npx vite build` — baseline, clean
- [ ] `git commit -m "chore(cleanup): remove 4 unused modules..."`

**Коммит 2: вычистить exports.js от collections**
- [ ] Удалить ключ `collections` из `DATA_LS_KEYS`
- [ ] Удалить строку `data.collections = ...` из `exportParts`
- [ ] Удалить `if (data.collections) ...` из `applyImport` (ветка `parts`)
- [ ] Обновить текст сообщения в `applyImport` (убрать `, ${data.collections?.length || 0} коллекций`)
- [ ] `npx vitest run && npx vite build`
- [ ] `git commit -m "chore(cleanup): drop collections field from exports.js"`

**Коммит 3: V11 KLD Tm/GC**
- [ ] Добавить helper `gcPctInt` в `mutagenesis.js` после импортов
- [ ] Заменить хардкод нулей в `makeKLDStrategy` на `calcTmNN(...)` + `gcPctInt(...)`
- [ ] Проверить/добавить тест `'KLD primers carry computed Tm and GC%...'` в `mutagenesis.test.js`
- [ ] `npx vitest run mutagenesis` — новый тест зелёный
- [ ] `npx vitest run && npx vite build`
- [ ] Переместить V11 в BUGS.md → FIXED с датой 21.04.2026
- [ ] `git commit -m "fix(mutagenesis): compute Tm and GC% for KLD primers (V11)"`

**Коммит 4: AddFragmentModal cDNA**
- [ ] Заменить `.replace(/[^ATCGatcg]/g, '')` на `sanitizeSequence(sequence)` в cDNA-обработчике
- [ ] Создать `gui/designer/src/__tests__/add-fragment-modal-sanitize.test.jsx` с 3 тестами
- [ ] `grep -n "replace(/\[^ATCG" gui/designer/src/components/AddFragmentModal.jsx` — пусто
- [ ] `npx vitest run && npx vite build`
- [ ] Добавить ADDFRAG-CDNA-SANITIZE в BUGS.md → FIXED
- [ ] Обновить PROJECT_STATE.md (сессия 21.04.2026)
- [ ] Обновить DECISIONS.md (правило порога безопасности)
- [ ] `git commit -m "fix(import): sanitize cDNA sequence..."`

**Финальная проверка:**
- [ ] Все 4 коммита в истории
- [ ] Тесты: ≥ baseline + 4
- [ ] Build: clean
- [ ] `git log --oneline | head -5` показывает всю серию

---

## Что НЕ делаем в этой сессии (вынесено в FUTURE_CLEANUP.md)

- Консолидация цветовых палитр (breaking visual change, требует визуальной приёмки)
- Аудит api.js (требует подтверждения Игоря о roadmap бэкенда)
- i18n.js — поиск unused keys (низкий приоритет)
- Консолидация SequencePreview/SequenceMapView/SequenceViewer (риск регрессий)
- Primer derivation рефакторинг (архитектурный, v1.1)
- App.jsx декомпозиция (архитектурный, v1.1)

Всё это в `docs/FUTURE_CLEANUP.md`, читать не надо для этой сессии.

---

**Конец спеки.**
