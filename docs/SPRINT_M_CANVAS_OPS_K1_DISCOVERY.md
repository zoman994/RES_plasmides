# SPRINT_M_CANVAS_OPS_K1_DISCOVERY.md

> **K1 — Разведка v0.5 algorithm core.** Output K1-step `SPRINT_M_CANVAS_OPS.md` §8.
> **Дата:** 12.05.2026 поздний вечер. **Без правок кода.**
> **Conclusion:** **БЛОКЕР НЕ СРАБОТАЛ.** Все 5 ядер pure, harvest через прямой импорт без extraction / refactoring v0.5 production code. K2 можно стартовать.

---

## 0. Метод

Для каждого из 5 файлов K1 проверил:

1. **Store-coupling** — `grep -E "useStore|getState\\(|setState|from\\s+['\"](\\./|\\.\\./)?store"` → должен быть 0 matches для «pure».
2. **External deps** — что импортирует, цепочка зависимостей.
3. **Pure-function signature** — какие public exports + их типы.
4. **Test coverage** — count `it(`/`test(` в `__tests__/`.
5. **Adapter shape** — какую обёртку напишем в `canvas/operations/lib-adapters.js` (K9).

Grep против всех 5 файлов одним вызовом:

```
useStore|getState|setState|from store
→ 0 matches
```

**Никаких store-deps. Никаких React-deps. Никаких UI deps.** Все 5 ядер — чистая алгоритмика на голом JS.

---

## 1. Table per algorithm

| Модуль | Размер | Store coupling | External deps | Public exports | Tests | Adapter status |
|--------|--------|----------------|---------------|----------------|-------|----------------|
| `tm-calculator.js` | 7.2 KB / 220 LOC | **0** | none (standalone) | `calcTmNN`, `calcTm`, `calcTmForPolymerase`, `gcPercent`, `checkHairpin`, `checkHomodimer` | 20 (`tm-calculator.test.js`) | direct import |
| `restriction-db.js` | 36.5 KB / 621 LOC | **0** | none (standalone) | `RE_ENZYMES`, `COMPATIBLE_OVERHANGS`, `siteToRegex`, `searchRE`, `getCompatible`, `getIsoschizomers`, `findSitesInSequence`, `checkAssemblyForSites`, `scanAllSites`, `detectMCS`, `generateRETail`, `checkReadingFrame`, `checkInsertSites`, `checkDoubleDigest`, `digest` | 75 (`restriction-db.test.js` 24 + `scan-all-sites.test.js` 24 + `restriction-digest.test.js` 21 + `re-primer-tail.test.js` 6) | direct import |
| `golden-gate.js` | 11.1 KB / 262 LOC | **0** | `./sequence-utils::reverseComplement` (pure) | `GG_ENZYMES`, `reverseComplement` (re-export), `checkInternalSites`, `designOverhangs`, `resolveConflicts`, `suggestBestEnzyme` | 17 (`golden-gate.test.js`) | direct import |
| `mutagenesis.js` | 17.7 KB / 426 LOC | **0** | `./codons::{translateDNA,translateCodon,getBestCodon,CODON_TABLE}`, `./tm-calculator::{calcTm,gcPercent}`, `./sequence-utils::reverseComplement` (все pure) | `chooseStrategy`, `applyMutation`, `computeMutagenesisStrategy`, `getCommonSubstitutions`, `chooseMutantCodon`, `inlineSubstitution`, `inlineDeletion`, `designInlineKLDPrimers`, `designQuikChangePrimers`, `validateMutations` | 34 (`mutagenesis.test.js` 28 + `mutagenesis-payload.test.js` 6) | direct import |
| `local-primer-design.js` | 19.8 KB / 460 LOC | **0** | `./tm-calculator::calcTmNN`, `./golden-gate::GG_ENZYMES`, `./tags-db::getTagByName` (pure data), `./restriction-db::generateRETail`, `./sequence-utils::reverseComplement` (все pure) | `designPrimersLocal` | 27 (`local-primer-design.test.js` 20 + `local-primer-design-overlap.test.js` 2 + `tag-aware-primer.test.js` 5) | direct import |

Helper deps (`sequence-utils.js` 134 LOC, `codons.js` 91 LOC, `tags-db.js` 49 LOC) — все pure const-data + pure functions, 0 store coupling.

**Total tests на алгоритмическое ядро:** ~173 теста (`bug-fixes-block1.test.js` + `split-annotations.test.js` добавляют cross-cutting проверок).

---

## 2. Predicted adapter shape (для K9 `lib-adapters.js`)

Поскольку coupling 0, адаптер в `canvas/operations/lib-adapters.js` — прямые `import` без extracts. **Никаких новых `*-pure.js` файлов не нужно.**

Шаблон каждой операции (по DEC-OPS-10 + DEC-OPS-07):

```js
// canvas/operations/lib-adapters.js
import { designPrimersLocal } from '../../../local-primer-design';
import { calcTmNN, calcTmForPolymerase } from '../../../tm-calculator';
import { digest, scanAllSites, findSitesInSequence, generateRETail,
         checkDoubleDigest, checkInsertSites } from '../../../restriction-db';
import { GG_ENZYMES, designOverhangs, resolveConflicts,
         suggestBestEnzyme, checkInternalSites } from '../../../golden-gate';
import { computeMutagenesisStrategy, applyMutation, validateMutations,
         designInlineKLDPrimers, designQuikChangePrimers,
         inlineSubstitution, inlineDeletion } from '../../../mutagenesis';
import { reverseComplement } from '../../../sequence-utils';

// (operation, contextSnapshot) → {outputs: Container[], error?: string}
export function executePCR(operation, ctx) { /* lookup inputs, call designPrimersLocal, build amplicon Container */ }
export function executeCut(operation, ctx) { /* digest(...) → fragment Containers */ }
export function executeGibson(operation, ctx) { /* designOverhangs / resolveConflicts → assembly Container */ }
export function executeLigate(operation, ctx) { /* sticky/blunt ligation → assembly Container */ }
export function executeKLD(operation, ctx) { /* mutagenesis strategy=kld → circular mutant */ }
export function executeMutagenesis(operation, ctx) { /* computeMutagenesisStrategy(...) → mutant Container */ }
```

Adapter — pure: `(operation, contextSnapshot) → {outputs, error?}`. ContextSnapshot = `{containers: {[id]: Container}}` — readonly view of `state.containers`. Никакой запись в store, никакой dispatch.

### 2.1. Маппинг operation kind → algorithm export

| Operation kind | Adapter fn | Underlying v0.5 fn | Inputs (operation.inputs[id]) | Outputs |
|----------------|-----------|---------------------|-------------------------------|---------|
| `pcr` | `executePCR` | `designPrimersLocal` (для primer design) + sequence assembly из template | template (molecule), primer pair (oligonucleotide либо 2 separate) | 1 linear amplicon Container |
| `cut` | `executeCut` | `digest` (1-2 enzymes) либо `findSitesInSequence` для multi-site | template (molecule, any topology), enzymes (по name из `restriction-db`) | N+1 linear fragments (linear template) либо N (circular) |
| `gibson` | `executeGibson` | `designOverhangs` / `resolveConflicts` + concatenate fragments + check overlap | ≥2 linear fragments + method ('overlap' / 'goldengate'), enzyme если goldengate | 1 Container (circular default / linear option) |
| `ligate` | `executeLigate` | sticky/blunt end matching из `container.ends` (компатибильность через `COMPATIBLE_OVERHANGS`) | ≥2 linear fragments | 1 Container (circular default / linear option) |
| `kld` | `executeKLD` | `computeMutagenesisStrategy` с `strategy='kld'` | 1 circular template + 1 oligonucleotide primer pair | 1 circular mutant Container |
| `mutagenesis` | `executeMutagenesis` | `computeMutagenesisStrategy` для full-container либо `applyMutation` для simple substitutions | 1 template + mutations array | 1 mutant Container same topology |

### 2.2. Container shape для outputs

Согласно DEC-OPS-03 + ARCHITECTURE_v2 §3 (Container shape):

```js
{
  id: uuidv7(),
  kind: 'molecule',  // outputs ВСЕГДА molecule (oligonucleotide outputs не предусмотрены в этом sprint'е)
  name: derivedFromOperation,  // e.g. `${operation.kind}_output_${index}` или explicit param
  payload: {
    sequence: '...',  // computed by adapter
    annotations: [...],  // shifted from template via _shiftAnnotations либо new
    topology: 'linear' | 'circular',
    length: sequence.length,
    ends: { leftEnd: {...}, rightEnd: {...} } | null,  // null для circular
  },
  origin: { kind: 'operation-output', operationId, operationKind, index },
  position: { x: opPosition.x + 280, y: opPosition.y + index * 96 },  // auto-layout right-of-op
  parentCommitId: null,
}
```

---

## 3. Особые случаи / edge cases

### 3.1. `designPrimersLocal` для PCR-from-template без явных primers

`designPrimersLocal(fragments, junctions, circular, opts)` принимает **fragments + junctions**, не «template + primer pair». Для PCROpPopup с "auto-design primers checkbox" (DEC-OPS-06 / §7) адаптер вызывает `designPrimersLocal([{sequence: template, name, annotations}], [], false, opts)` и берёт первые два primer'а из результата как primer pair. Для PCR с явными primers — primers напрямую переходят в amplicon без call в `designPrimersLocal`.

**Подтверждено в `local-primer-design.js:204-285`:** single-fragment path с `fragments.length === 1` → создаёт `terminal-pcr` primers (linear) либо `self-closure` (circular) без junctions. **Полностью pure, ничего extract-ить не надо.**

### 3.2. `digest` принимает только circular sequence

`digest(sequence, annotations, enzyme1, enzyme2?)` для circular topology (rotate / excise). Для **linear template** Cut операции — адаптер сам разрезает linear через `findSitesInSequence(enzyme, seq)` + split по cut позициям. Это **новый код в adapter**, не extract из v0.5 — но логика тривиальна (на основе `findSitesInSequence`).

**Decision:** в `executeCut` ветка по `template.topology`:
- `circular` → call `digest(...)` напрямую.
- `linear` → adapter computes cut positions через `findSitesInSequence(enzyme, seq)` (returns `[{position, strand}]`), splits sequence at `position + enzymeInfo.cut[0]`, returns N+1 fragments.

Оба пути используют `findSitesInSequence` + `RE_ENZYMES[enzyme]` напрямую — pure. **Никакого refactoring v0.5 кода.**

### 3.3. `computeMutagenesisStrategy` возвращает `{strategy, fragments, junctions, primers, protocol, warnings, mutantSequence}` — output для UI, не для container-shape

Адаптер `executeMutagenesis` использует только `mutantSequence` field из result + annotations нужно shift'нуть руками (мутации могут менять координаты при insertion/deletion). Helpers `applyMutation` + `inlineSubstitution` / `inlineDeletion` решают это per-mutation, адаптер aggregaет.

**Decision:** `executeMutagenesis(operation, ctx)`:
- Если mutations.length === 1 и type=substitution → `applyMutation` напрямую (быстрый path).
- Иначе → `computeMutagenesisStrategy(template, mutations, {fragmentContext: {topology: template.topology, isStandalone: true, length}})` + взять `mutantSequence`, скорректировать annotations через `_shiftAnnotations`-like логику (pure helper в adapter).

`executeKLD(operation, ctx)`:
- Принимает 1 circular template + oligonucleotide primer pair (либо derive primers через `designInlineKLDPrimers` если biolog не задал явно).
- `computeMutagenesisStrategy(template, [mutationFromPrimers], {fragmentContext: circular+standalone})` с `strategy='kld'` (форсируется heuristic).
- Output container — circular mutantSequence.

### 3.4. Golden Gate adapter в `executeGibson`

DEC-OPS-10 + §7 GibsonOpPopup поддерживает 2 methods: `overlap` (default Gibson) и `goldengate` (Type IIS BsaI / BsmBI).

- `method='overlap'`: adapter concatenates fragments через overlap-extension; sequences стыкуются на N bp overlap (default 20-30 bp). Logic в adapter, не extract из `golden-gate.js`.
- `method='goldengate'`: adapter вызывает `designOverhangs(fragments, enzymeKey, circular)` для проверки overhang compatibility + `resolveConflicts` если нужно. Output assembly sequence = concatenation после вырезания GG-сайтов из primer tails (логика overlap excision). Pure.

**Никаких modifications к `golden-gate.js`.**

### 3.5. `executeLigate` использует `COMPATIBLE_OVERHANGS` из `restriction-db.js`

Sticky-end ligation requires matching overhangs. Adapter:
- Reads `container.payload.ends.leftEnd.overhang` + `container.payload.ends.rightEnd.overhang` для each fragment.
- Checks pairwise compatibility через `COMPATIBLE_OVERHANGS[key]` lookup.
- Если pair compatible → concatenate. Если нет → `{error: 'Incompatible ends: ...'}`.

**Pure, использует только const-data из restriction-db.**

---

## 4. Тестируемость

Adapter — pure function. Тестируется без store / без React. Test patterns:

```js
// canvas/operations/__tests__/lib-adapters.test.js
import { executePCR, executeCut, executeGibson } from '../lib-adapters';

const containers = {
  'puc19-id': { id: 'puc19-id', kind: 'molecule', payload: { sequence: PUC19_SEQ, topology: 'circular', ... } },
  'primer-pair-id': { id: 'primer-pair-id', kind: 'oligonucleotide', payload: { sequences: [...] } },
};

const opPCR = { id: 'op1', kind: 'pcr', inputs: ['puc19-id', 'primer-pair-id'], params: {...} };
const result = executePCR(opPCR, { containers });
expect(result.outputs[0].kind).toBe('molecule');
expect(result.outputs[0].payload.topology).toBe('linear');
expect(result.outputs[0].payload.length).toBeGreaterThan(0);
```

`__tests__/lib-adapters.test.js` будет добавлен в K9 (≥10 tests из спеки §8 K9).

---

## 5. Заключение K1

**Все 5 ядер v0.5 algorithm core полностью pure и harvest-ready.**

| Проверка | Результат |
|----------|-----------|
| Store-coupling | **0 matches** — никаких useStore / getState / setState / store imports |
| Test coverage | **~173 tests** на algorithmic core (включая cross-cutting) |
| External deps | только pure helpers (`sequence-utils`, `codons`, `tags-db`) — все pure |
| Refactoring required | **НЕТ** — adapter — прямые imports |
| `*-pure.js` extraction | **НЕ нужна** |
| BLOCKER trigger | **НЕ сработал** |

**K2 (state.js split) можно стартовать немедленно после greenlight от Chat / Игоря.** Никаких изменений в v0.5 algorithm core в этом sprint'е не требуется.

Размер ядра (для справки):
- `tm-calculator.js` 7.2 KB
- `restriction-db.js` 36.5 KB (data-файл, не лимитируется по DEC-SIZE-CALIBRATION-01)
- `golden-gate.js` 11.1 KB
- `mutagenesis.js` 17.7 KB
- `local-primer-design.js` 19.8 KB (под hard 25 KB)
- `sequence-utils.js` ~4 KB
- `codons.js` ~3 KB

Все под hard / soft лимитами или явно data-исключены (DEC-SIZE-CALIBRATION-01).

---

_K1 завершён 12.05.2026 поздний вечер. Без правок кода. STOP per CHAT_PLAYBOOK_CORE.md §3 + CURRENT_TASK.md handoff log #6 — жду greenlight для K2._
