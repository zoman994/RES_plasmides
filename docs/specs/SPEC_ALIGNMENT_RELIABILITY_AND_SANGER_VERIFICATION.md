# SPEC M-ALIGN-TRUST — надёжное выравнивание и Sanger verification

**Статус:** 🟡 АКТИВНЫЙ BACKLOG-КОНТРАКТ; перед handoff обязателен повторный code audit  
**Тип:** Type A; фазы — спринты  
**База аудита:** исторический снимок 16.07.2026; пути, размеры и runtime gaps нельзя использовать без повторной сверки  
**Предпосылка:** аудит Align подтвердил ошибки на границах input → reference → compute → review/save → evidence.  
**Нормативные слова:** MUST / MUST NOT — обязательно; SHOULD — отклонение объясняется; MAY — опция.

> **Масштаб.** Фазы A–E выполняются отдельными bounded-задачами. A требует нового inventory; B зависит от A и quality policy; C — от B и corpus acceptance; D — от C и canonical repository/Bodge `2.0.0`; E — от D и полного продуктового потока.

---

## 0. Срез размеров и границы файлов

Размеры снимаются заново перед handoff. A1 выносит contracts/fingerprint/session orchestration из `alignmentSlice.js`; новая алгоритмическая логика в slice запрещена. `SequenceView/index.jsx` и `librarySlice.js` не расширяются в рамках Align-фазы без отдельного decomposition-среза. Quality/coverage остаются в Align adapters/leaf tracks существующего API, а новые файлы соблюдают политику размеров из `AGENTS.md`.

### 0.1 Visual reference

**No visual reference; design follows [`DESIGN_SYSTEM.md`](../DESIGN_SYSTEM.md) и существующий Align/SequenceView shell.** Новая самостоятельная карта последовательности не создаётся.

### 0.2 Component reuse audit

| Использовать | Не использовать | Причина |
|---|---|---|
| `components/Align/*` + существующий `SequenceView` adapter | rewrite workspace / второй sequence browser | функциональный каркас принят пользователем |
| текущий `lib/alignment/*` после унификации contracts | второй набор aligners | один differential-testable core |
| общий `BioComputeScheduler` для Search/Annotator/Align | Align-only semaphore или sync UI fallback | один heavy job на слабом ПК |
| `lib/bio/sanger-primer-design.js` | новый primer engine в Align | единая primer semantics |
| canonical project attachment/evidence repository | AB1 base64 в Zustand/notebook | воспроизводимость и revision binding |

UI-реализация следует `docs/DESIGN_SYSTEM.md`; annotation edits — `annotation-contract`; порядок TDD и финальной проверки определяют `AGENTS.md` и `docs/process/WORKFLOW.md`.

### 0.3 Kickoff

Kickoff-интервью не проводилось: пользователь поручил покрыть весь подтверждённый аудит, сохранив удачный текущий workflow. Нерешённые policy/schema choices перечислены в §12 D0 и §16.

---

## 1. Контекст и доказательства

Align уже имеет хорошую основу: local/global/semiglobal, reverse complement, AB1/chromatogram, multi-read, working copy, undo/redo, child copy, общий `SequenceView`, minimap и AA effects. Задача — не переписать UX, а убрать уверенные ложные результаты и построить проверяемую цепочку от bytes до evidence.

Подтверждённый runtime-дефект регистрируется в [`BUGS.md`](../../BUGS.md); эта спецификация задаёт будущие acceptance gates и не является вторым bug tracker.

Подтверждено кодом/тестовыми probes:

- parser принимает произвольные `A–Z`; `EEEEEEEE` против `ACGTACGT` дало identity 100%, score 16, 8 matches;
- AB1-first способен сделать trace reference, расходя визуальный, вычислительный и редактируемый объект;
- circular helper не является гарантированным production path; topology теряется в одном picker path, doubled coordinates выходят наружу;
- anchor выбрал повтор в позиции 200 со score 797, тогда как полный DP нашёл позицию 2000 со score 800;
- Gotoh и WFA расходятся по IUPAC (`AAAA`/`NNNN`: −4 против +8 при identity 100%);
- annotation-only draft не сохраняется; save/rebind/history допускают разные revisions;
- multi consensus не моделирует insertion/deletion alleles;
- heavy compute идёт синхронно, а banded allocation может запросить гигабайты;
- ABIF directory не проходит полный bounds/size preflight;
- verdict завышает уверенность коротких, partial и ambiguous hits;
- double peaks, reverse trace, intron-from-gap и AA-effect неполны.

Перед handoff нужен новый focused preflight на актуальном дереве, включая детерминированную загрузку route/chunk. Исторические счётчики тестов не являются доказательством текущего состояния; простое увеличение timeout запрещено.

---

## 2. Стратегия

Делаем один canonical alignment core с closed DTO и exact/preview разделением; запускаем тяжёлую работу через общий worker scheduler; поверх него строим Sanger QC, reference-aware consensus и immutable evidence. Так ускорение, UI и persistence не смогут независимо менять биологический смысл, а слабый ПК останется базовой платформой.

---

## 3. Scope

Все пути ниже относительны `gui/designer/src/`.

### 3.1 IN

- `store/alignmentSlice.js` — тонкий session adapter после A1 decomposition.
- `components/Align/{AlignInputPanel,AlignMiniMap,AlignReferenceView,AlignResultView,AlignWorkspace,SaveCorrectedVersionModal}.jsx` — существующий shell и lifecycle.
- `lib/alignment/{align-pairwise,wfa,anchor,align-circular,align-to-reference,multi-align,poa,abif-parse,double-peaks,alignment-quality,aa-effect,parse-multi-fasta}.js` — contracts/correctness.
- новые `lib/alignment/{contracts,fingerprint,session,reference-pileup,consensus-likelihood,chromatogram-model,verification-policy}.js`.
- новые `lib/bio-compute/{protocol,scheduler,client}.js`, `workers/alignment.worker.js` и worker core.
- `lib/{search-worker-client,annotator-worker-client}.js` — только регистрация heavy jobs в A2; search/annotation algorithms не меняются.
- новые leaf UI `components/Align/{AlignmentQualityTrack,AlignmentChromatogramPanel,AlignmentReviewPanel,AlignmentDiscrepancyInspector,AlignmentCoverageTrack}.jsx`.
- существующие project/library write APIs через adapters; в D — `db/dexie-schema.js`, canonical attachment/evidence repository после D0 inventory.
- canonical notebook/evidence UI и `sanger-primer-design.js` — только D3.
- соответствующие Vitest/browser/golden/adversarial fixtures.

Точные пути repository/evidence adapters D1–D2 фиксирует D0 inventory в phase handoff. До этого придумывать параллельное хранилище запрещено.

### 3.2 OUT

- de novo basecalling, NGS/Nanopore, demultiplexing, LIMS и cloud compute;
- автоматическое утверждение функции, чистоты клона или лабораторного процесса;
- новый sequence viewer, core-правка `SequenceView/index.jsx`, расширение `librarySlice.js`;
- de novo assembly как verification path; POA остаётся отдельной функцией;
- whole-plasmid pass из partial Sanger reads;
- Rust/WASM до измеренного gate §11;
- миграции промежуточных Bodge dev-форматов: формат остаётся `2.0.0`, fixtures пересоздаются;
- любые файлы/bugs вне phase IN и активной handoff-задачи.

---

## 4. Проверенные предпосылки и блокирующие gates

- **Local-first.** Align работает без backend. Источник: текущий code и DEC-ALIGN-01/04. Проверено: да.
- **Source не overwrite.** Текущий UX создаёт child/library copy. Проверено: да; canonical revision semantics пока нет.
- **Library entry не равен Bodge exact revision.** До canonical repository нет надёжного `{kind,id,revisionDigest}`. Проверено: да; поэтому A–C дают Compare/QC и diagnostics, но не persisted verification claim.
- **Vendor base calls/qualities используются как input.** Raw basecalling OUT. Проверено: да.
- **Текущий Bodge Sanger payload недостаточен.** Не хватает multi-read, policy, indels, unresolved, computed basis. Проверено по [`SPEC_BODGE_FORMAT_V2_CORE.md`](./SPEC_BODGE_FORMAT_V2_CORE.md).

Production `pass/fail`, durable Verify и evidence заблокированы до D0: canonical revision resolver/repository, утверждённая quality policy с golden vectors и нормативный Bodge `2.0.0` schema delta. До D0 тесты MAY использовать явно переданную fixture-policy; пользовательский результат остаётся `diagnostics-only/inconclusive`.

---

## 5. Архитектурные решения

1. **Compare и Verify — разные intents одного core.** Compare принимает произвольную DNA; Verify требует exact revision + verification plan.
2. **Preview отделён типом.** Только `completion:"final-exact"` допускается в read-supported correction; preview остаётся draft-only и никогда не сериализуется как evidence.
3. **Exactness важнее fallback.** Anchor/band формируют candidates/preview; final либо доказан canonical oracle, либо `ambiguous/resource-limit/inconclusive`.
4. **Один global heavy scheduler.** Search, Annotator и Align регистрируют jobs; Align-only lock не выполняет performance-манифест.
5. **Worker-only heavy path.** JS fallback — JS внутри Dedicated Worker, без скрытого main-thread compute.
6. **Canonical DNA-IUPAC semantics.** Validator, Gotoh, WFA, circular wrapper, stats и UI используют один versioned compatibility/scoring contract.
7. **Одна система координат.** Наружу только `0-based-half-open`; circular wrap — ordered segments, не doubled coordinates.
8. **Reference-aware verification.** Pileup имеет reference slots, insertion boundaries и deletion runs; POA не подменяет verification.
9. **Computed result immutable.** Manual review — отдельные decisions/assertion; reported review не переписывает computed evidence.
10. **Revision-bound editing.** Working copy привязана к исходному content/revision token; canonical save использует compare-and-swap и правильный parent digest.
11. **Correction не является независимой проверкой.** AB1, использованный для создания child sequence, не может тем же запуском подтвердить этот child.
12. **Sanger evidence региональное.** Partial reads подтверждают только заявленные regions/targets.
13. **Raw AB1 — attachment.** В store живут refs/hashes, не bytes/base64; durable storage появляется только через canonical repository.
14. **Policies versioned.** Scoring, trim, uniqueness, double-peak, pileup и verdict входят в fingerprint/evidence.
15. **Viewer сохраняется.** Новые tracks/panels — Align adapters; core `SequenceView` не растёт.

---

## 6. Closed data contracts

### 6.1 Inputs и verification plan

```text
AlignmentReference {
  inputId, name, normalizedSequence, sequenceContentHash,
  entityRef: {kind:"container", id, revisionDigest} | null,
  resolvedRecordDigest | null,
  alphabet:"DNA-IUPAC", topology:"linear"|"circular"|"unknown",
  strandedness:"single"|"double"|"unknown",
  annotations, source:"library"|"container"|"file"|"paste"
}

AlignmentRead = SequenceRead | TraceRead
SequenceRead {
  kind:"sequence", inputId, name, normalizedBases,
  sequenceContentHash, source:"paste"|"fasta"|"library"
}
TraceRead {
  kind:"trace", inputId, attachmentRef | null, fileName, fileSha256,
  observationIdentityDigest, importedAt,
  parser:{id,version}, bases, baseCallsDigest,
  qualities:Uint8Array|null, peakLocations:Uint32Array,
  traceChannels|null, traceSamplesDigest|null,
  expectedPrimerRef|null, expectedDirection:"forward"|"reverse"|"unknown"
}

VerificationPlan {
  schemaVersion,
  subjectRef:{kind:"container",id,revisionDigest},
  scope:{kind:"whole-molecule"} | {kind:"regions", locations[]},
  context:{assemblyRef|null, connectionRefs[], primerRefs[]},
  targets:[{id,location,required,primerRefs[]}],
  policyRef:{id,version,digest}, planDigest
}
```

`entityRef:null` допустим только в Compare. Paste/file reference можно сохранить как **новый root container/library entry**, не как child без родителя. Verify/evidence открываются после rebind к exact revision. Junction готового container проецируется в canonical `regions`; connection refs остаются typed context и не подменяют Bodge subject/scope union.

PBAS coordinates, trim и peaks хранятся в исходном read order. Reverse view применяет отдельное отображение `i ↔ length-1-i`, разворачивает sample axis и complement channel labels. `qualities:null` разрешает Compare, но без утверждённого альтернативного policy делает Verify inconclusive.

`observationIdentityDigest` строится из raw file SHA-256, base-call/trace digests и нормализованных run/sample metadata, но не из filename/inputId. Parser version входит в computation basis, а переимпорт/rename не создаёт новую observation.

Required targets лежат внутри scope; их normalized union равен requested regions либо `[0,L)` для whole molecule. Optional targets не закрывают required coverage. Runtime policy digest MUST совпасть с `policyRef.digest`; иное scope/policy меняет `planDigest` и fingerprint.

### 6.2 Settings, job и result

```text
AlignmentSettings {
  intent:"compare"|"verify-sanger", mode, scoringModel,
  orientationPolicy, circularPolicy, qualityTrimPolicy,
  pileupPolicy, uniquenessPolicy, verificationPolicy, algorithmVersion
}

BioComputeJob {
  protocolVersion, jobId, domain:"alignment",
  operation:"parse-abif"|"pairwise"|"multi-reference",
  purpose:"interactive-preview"|"verification-final",
  sessionEpoch, inputFingerprint, requestedResourceBudget, payload
}

BioComputeOutcome =
  {status:"ok", result} |
  {status:"cancelled"|"resource-limit"|"compute-unavailable"|
          "invalid-input"|"worker-failure"|"unsupported-scoring",
   diagnostics}

AlignmentReadResult = UnmappedResult | MappedResult
UnmappedResult {
  readId, completion:"preview"|"final-exact",
  mappingStatus:"unmapped", diagnostics
}
MappedResult {
  readId, completion:"preview"|"final-exact",
  mappingStatus:"unique"|"ambiguous",
  selectedPlacement, candidatePlacements[], additionalCandidateCount,
  trimMask, qualitySummary, variants, unresolvedEvents, diagnostics
}
Placement {rank,strand,score,cigar,refSpans,readSpan,wrapped}
```

Для ambiguous result UI получает минимум два placements либо `additionalCandidateCount>0`. Усечённый candidate search запрещает `unique`. Unmapped branch не содержит fake score/spans.

CIGAR использует run-length `=`, `X`, `I`, `D`: `I` потребляет read, `D` — reference; unaligned local flanks описываются `readSpan/trim`, не `S`. Circular placement разбивается по `refSpans`; CIGAR, spans и normalized variants взаимно валидируются.

### 6.3 Computed discrepancies и review

```text
ComputedDiscrepancy {
  id, kind:"substitution"|"insertion"|"deletion"|"complex"|"ambiguous",
  referenceLocation|insertionBoundary, expected, observed,
  supportingReadIds, opposingReadIds, depth, confidence,
  strandSupport, aaEffect
}

AlignmentReviewEvent {
  id, kind:"discrepancy"|"low-quality"|"mapping-ambiguity"|
           "double-peak"|"phase-shift"|"mixed-template"|"uncovered",
  discrepancyId|null, referenceSpans[], readSpans[], readIds[], details
}

DiscrepancyReviewDecision {
  discrepancyId, basisFingerprint,
  state:"reference-kept"|"variant-accepted"|"artifact"|"unresolved",
  agentRef, reviewedAt
}
```

Computed objects immutable. View-model объединяет их с decisions. Manual decision не меняет computed verdict; если ручная mask/classification влияет на итоговый record, он имеет `assessmentMode:"reported"` и сохраняет отдельную ссылку на computed basis.

### 6.4 Session, fingerprint и diagnostics

Session содержит `reference:AlignmentReference|null`, `reads:AlignmentRead[]`, `verificationPlan|null`, settings, `sessionEpoch`, monotonic `editGeneration`, fingerprint, job/outcome/result, working copy, review decisions и draft refs. AB1-first оставляет `reference:null`; compute запрещён до выбора reference. Инварианты:

1. trace никогда не reference; `reference.inputId` совпадает в viewer/compute/edit;
2. result принимается только при совпадении `jobId + sessionEpoch + fingerprint + editGeneration`;
3. новая session очищает history/draft и отменяет старый job;
4. dirty включает sequence и annotations; switch/close даёт Save/Discard/Cancel;
5. homology suggestions keyed по `referenceHash+topology+algorithmVersion` и очищаются при смене reference; unrelated trace не меняет mode/reference;
6. semantic read multiset канонически сортируется по stable identity/hash; presentation row order хранится отдельно и не меняет consensus/evidence digest;
7. `verificationPlan.planDigest` входит в final fingerprint.

Digest material имеет domain separator `bodge-align/<field>/v1\0`, length prefixes и фиксированную кодировку: normalized bases ASCII, qualities `Uint8`, peaks `Uint32LE`, traces A/C/G/T `Uint16LE`, policy/plan — canonical JSON. `planDigest` считается по plan без поля `planDigest`. Fingerprint material закрыт: reference hash + topology + strandedness + canonical read/base/Q/trace hashes + trim masks + normalized settings + algorithm/policy versions + purpose + planDigest|null. Raw SHA-256 считается один раз при import; edit сначала меняет generation, hash пересчитывается async/debounced.

Diagnostic contract: `{code,domain,stage,severity,path,pointer,entityRef,details}`; UI action определяется отдельным classifier. Unknown worker/persistence fields отклоняются или version-gate’ятся.

Domain DTO и worker wire DTO различаются. Wire передаёт transferable `Uint8Array/Uint32Array` и compact CIGAR; pairwise job не пересылает четыре trace channels. Ownership/detach фиксируется тестами, а UI получает только нужную проекцию.

---

## 7. Correctness requirements

### 7.1 Input и reference

- Разрешены `A C G T R Y S W K M B D H V N` после uppercase. Whitespace/FASTA breaks — syntax; цифры, punctuation, gaps и иные letters — error до store.
- `U` не меняется молча: UI предлагает явное RNA `U→T` с provenance warning.
- Ошибка показывает record, символ и 1-based input position. Engine повторно валидирует boundary.
- Stats разделяют exact concrete, compatible ambiguous, mismatch, gap и unresolved. Compatible ambiguity не даёт pass.
- AB1-first добавляет read без reference; radio reference для trace disabled с accessibility reason.
- Topology тестируется отдельно для container action, direct library picker, Align picker, drag/drop/import metadata, homology suggestion, restored draft и contextual Verify. Новый entry path без topology test запрещён.

### 7.2 Exact engine, repeats и circular

- Gotoh — canonical oracle; WFA final допустим только при эквивалентных alphabet/scoring/gap semantics. Differential сравнивает score, strand, spans, CIGAR и variants.
- Anchor/band не выбирает первый cluster. Final uniqueness требует полного distinct-placement search с completeness certificate. Masking допустим только если доказанно исключает ровно одну equivalence class, включая overlapping loci; truncated top-K не доказывает unique.
- Candidate loci дедуплицируются по одному biological placement; circular placements, отличающиеся на `L`, не являются разными.
- До утверждения uniqueness policy/golden corpus в A4 status=`policy-unavailable/ambiguous`; read-supported correction запрещена.
- Equal/near-equal placements → ambiguous. Low complexity не становится unique из-за cap.
- Doubled circular wrapper ограничивает path одним обходом reference. Наружу `0<=pos<L`, cross-origin — segments; insertion boundary canonical `0..L-1`.
- Linear indels left-normalized; circular indels используют versioned origin rule, независимый от UI rotation. Variant ID включает canonical location/boundary + expected + observed.
- Rotation и reverse-complement — metamorphic tests. Approximate/banded result никогда не маркируется final.

### 7.3 Verdict и downstream biology

Compare показывает exact identity, compatible ambiguity, query/reference coverage, variants, mapping status и preview/final. Короткий hit называется «точное локальное совпадение N nt», не «высокое сходство».

После D0 Verify semantics:

- `pass`: exact revision/plan, final exact, unique mapping, required scope покрыт, approved quality policy выполнен, variants/unresolved отсутствуют;
- `fail`: approved policy подтверждает variant внутри scope;
- `inconclusive`: low/missing Q, partial coverage, mixed peak, conflicting reads, ambiguity, preview, timeout/resource limit, unknown topology или policy unavailable.

До утверждения D0 quality policy production UI показывает diagnostics и `inconclusive`; fixture policy может тестировать ветви pass/fail. Identity threshold не скрывает confirmed variant.

«Интроны из gaps» доступны только read=`cDNA/mRNA`, reference=`genomic`, с strand-aware motif preview; обычный Sanger deletion не становится intron. AA effects покрывают synonymous, missense, nonsense, start/stop loss, in-frame insertion/deletion, frameshift, truncation/extension и splice-site; ambiguous mapping → `unknown`.

---

## 8. ABIF, quality и multi-read

### 8.1 Safe ABIF reader

До allocation parser проверяет magic/header, safe counts, checked `elementSize*numElements`, directory/data bounds, inline `<=4` rule, element type/size, channel lengths, peak `<sampleCount`, FWO как permutation A/C/G/T и policy caps. PBAS/PCON/PLOC выбираются одним согласованным generation/tag-set; смешивать их независимо запрещено. Unknown defined tag MAY игнорироваться opaque; invalid essential tag даёт typed error.

Начальные reader-policy caps, подтверждаемые corpus/benchmark: file 16 MiB, entries 10 000, calls 100 000, samples/channel 2 000 000. Это runtime policy, не предел ABIF.

До D1 raw File/Blob удерживается только transient session, SHA-256 проверяется в worker; durable persistence не обещается. С D1 bytes сначала пишутся в canonical attachment staging. Отдельный Align-only persistent blob store запрещён. `importedAt` — RFC 3339 UTC staging provenance; canonical projection утверждает D0.

Session preflight считает raw + decoded channels + align matrices + result + transfer copies. Import идёт последовательно; full-resolution channels лениво декодируются/удерживаются только для active trace, остальные имеют bounded downsampled display. Detached/temp buffers освобождаются. Превышение aggregate budget → `RESOURCE_LIMIT`, а не OOM.

### 8.2 Modified Mott trim

Raw calls/trace immutable; trim — reversible `[readStart,readEnd)` soft mask в исходных read coordinates и fingerprint. Для реального Q:

```text
p_i = 10^(-Q_i/10)
s_i = cutoff - p_i
maximum positive contiguous sum; running<0 resets
tie: longer segment, then smaller start
```

Начальный cutoff `0.05` — versioned engineering default, не биологический закон. Нет positive/minimum-length segment → `unusable-after-trim/inconclusive`. Missing Q не подменяется Q0/Q40. Manual handles инвалидируют result/draft и запускают coalesced job. Trimmed calls видимы по toggle, но исключены из metrics, consensus, verification coverage/verdict и evidence basis.

### 8.3 Chromatogram и mixed peaks

- Trace раскрывается и в pairwise, и в multi; legend/actions видимы только при channel data.
- Hover/focus показывает call, Q, sample и amplitudes; normalization per-read robust.
- Double-peak detector использует local baseline/noise, primary floor, secondary ratio и trim/Q gate.
- Reverse преобразует bases, Q, peak/sample coordinates и channel labels согласованно.
- Последовательные peaks после indel дают `phase-shift/mixed-template`, не «гетерозиготу» для plasmid sample.

### 8.4 Reference-aware consensus

Pileup содержит reference slots, insertion slots, deletion runs, depth, allele/strand support. Insertions/deletions обязаны попадать в consensus/CIGAR/variants.

Для concrete call с Q: `p=10^(-Q/10)`, likelihood true called base `1-p`, каждой другой concrete base `p/3`; суммирование в log-space. Ambiguous IUPAC и calls без Q дают compatibility/count support, но не выдуманный calibrated posterior и сами не разрешают verified base. Такие позиции остаются unresolved. Indel confidence до calibration называется только `support-score`.

UI показывает реальные interval sets, coverage/depth/confidence, holes, mapped/ambiguous/unmapped reads, orientation, retained length, primer и per-read trace. При `multi!=null` alignment, variants, consensus и quality layers остаются независимо переключаемыми. Полоса `min..max` не заменяет holes.

---

## 9. Lifecycle, persistence и evidence

### 9.1 Working copy и save

`dirty = sequenceChanged || annotationsChanged`; обе категории видимы в save modal/provenance и имеют undo/redo. Accept substitution/indel идёт через inspector и typed edit descriptor; low-Q/ambiguous/mixed/preview нельзя принять как уверенную correction.

В A–C доступен безопасный **manual library branch/copy** через существующий API и source content token. Он не заявляет Bodge revision/evidence semantics. Pasted reference сохраняется как новый root entry. Annotation-only save/revert обязателен.

Canonical D1 save:

```text
flush edit -> await required final exact -> CAS source revision/hash
-> create child(parentRevisionDigest = pre-edit source revisionDigest)
-> rebind exact child -> clear matching history -> recompute
```

Manual child edit не получает sequencing claim. Read-supported correction сохраняет basis observation digests/fingerprint. Та же observation, включая renamed/re-imported AB1, не может дать pass созданному child; нужен независимый read либо reported observation без verification claim. Source drift → `SOURCE_REVISION_CHANGED`, без ложной ancestry.

### 9.2 Durable draft

После явного save `AlignmentSessionDraft` MUST хранить exact input refs/hashes, settings/policy versions, trim masks, review decisions, unresolved events и evidence-draft refs. Viewport state MAY. Reload заново резолвит hashes/revisions; drift → stale. Untrusted draft не гидратируется прямо в runtime state.

До D1 допустим только transient draft. D1 зависит от canonical project repository; если его нет, фаза останавливается.

### 9.3 Bodge `2.0.0` evidence gate

D0 обновляет normative core/schema/implementation plan без migration API. Каждый `reads[]` содержит `traceAttachmentId`, `primerRef`, `readDirection`, parser/derived digests, trim, mapping, Q, variants и unresolved; aggregate — coverage, plan/policy digests, completion и result.

Evidence rules:

1. subject точно `{kind:"container",id,revisionDigest}`; scope `whole-molecule` или `regions`. Assembly/connection subject используется только по canonical union; готовый-container junction проверяется regions + typed context refs.
2. Preview никогда не сериализуется как canonical evidence, даже inconclusive; только final-exact basis.
3. `full` включает raw AB1 attachments через project notebook/attachment registry; missing bytes — validation error. `public-supp` полностью исключает Sanger records и AB1, если D0 явно не изменит profile.
4. Common envelope проверяет evidence ID/digest, `performedAt`, `agentRef`, assessment mode, method/capability, visibility/privacy.
5. Computed evidence immutable; manual record linked через утверждённый D0 `basisEvidenceRefs` contract.
6. `basisEvidenceRefs`: typed strong/weak relation, canonical sorting, digest material, no self/cycles, explicit supersession semantics и export dependency closure.
7. Regional evidence не повышает whole molecule; stale evidence остаётся валидным только для прежней revision.

`in-progress` — draft UI state, не evidence-derived status. Persisted selector выводит `not-checked`, `targets-confirmed`, `discrepancy-found`, `inconclusive`, `stale-evidence`, `conflict`; несколько актуальных несовместимых records дают conflict, не «последний победил».

### 9.4 Atomic finalize

Bytes сначала staging’ятся и хешируются. Одной Dexie transaction коммитятся attachment registry, evidence metadata и project refs; blob/OPFS bytes не объявляются частью физически общей transaction. Failure оставляет bounded orphan для TTL/quota-aware GC, но не partial evidence/status.

---

## 10. UX

### 10.1 Compare

Paste/FASTA/library/AB1, явный DNA reference, reads, topology/source и preview/final label. Local/global/semiglobal — в «Расширенных» с объяснением; скрытая настройка не меняет verification meaning.

### 10.2 Verify by sequencing

One-command contextual entry: «Проверить секвенированием» preselects exact revision, VerificationPlan, primers/directions. Единственное setup-действие — select/drop AB1; review и finalize — обязательные стадии подтверждения, не повторная настройка. До D0 entry показывает «диагностический анализ, evidence недоступно».

### 10.3 Review navigator

Previous/Next и filters охватывают variants, low-Q, mapping ambiguity, double/mixed peaks, phase shift, CDS effects и uncovered targets. Каждый `AlignmentReviewEvent` имеет canonical spans, центрирует viewer, раскрывает read trace и inspector; minimap ticks используют те же coordinates.

Keyboard/focus/ARIA обязательны; один live-region сообщает progress. Bulk import даёт per-file added/duplicate/limit/error. `RESOURCE_LIMIT`/`COMPUTE_UNAVAILABLE` не выглядят как «совпадений нет». Paste не очищается при нулевом принятии.

---

## 11. Performance contract

Baseline: Windows 10/11, 2 физических ядра / 4 потока, 8 GB RAM, integrated graphics.

1. Parse/pairwise/multi идут в persistent worker; global scheduler допускает один heavy job на baseline и оставляет ядро UI.
2. UI/cancel p95 `<100 ms`; alignment serialization не создаёт main-thread long task `>=50 ms`; обычный target scenario держит app memory `<250 MB`, stress ceiling `<500 MB`.
3. Client `requestedResourceBudget` может только уменьшить budget. Worker clamp’ит его hard runtime ceiling и до allocation считает rows/bands, traceback, decoded trace, result/transfer bytes с safety factor.
4. Cancel/crash/timeout/messageerror освобождают promises/buffers и возвращают разные typed outcomes. Non-cooperative kernel MAY terminate/recreate worker.
5. Cache key — exact final fingerprint; preview/final раздельны. Bounded byte-LRU не удерживает full chromatograms/projections; eviction освобождает buffers.
6. Edit updates UI сразу; compute coalesced/debounced. Save явно awaits fresh exact job. Progress throttled/coalesced не более 10 сообщений/с; fake percent запрещён, допускаются stages.
7. Transfer — typed arrays/compact CIGAR; viewport projection lazy. Approximate result не участвует в save/export/evidence.

Benchmark corpus: 5–12 kb circular plasmids, 0.5–1.5 kb clean/noisy reads, origin-crossing strands, 12-read holes, repeats/low complexity, 40 kb×1 kb memory case, divergent global/WFA cap и corrupt ABIF. Измеряются end-to-end, kernel, transfer, peak/aggregate memory, long tasks и cancel. Compute-time budget утверждается после baseline, не выдумывается заранее.

Rust/WASM разрешён только если kernel >30% target scenario, prototype даёт ≥2× end-to-end, memory ≤1.25× JS, golden/property/differential parity green, JS worker fallback/cancel/lazy load сохранены.

---

## 12. Поэтапная реализация

Каждый handoff содержит только K-checklist, scoped BUGS IDs, STOP и report; он ссылается на эту spec и не копирует DTO.

### Phase A — ALIGN-HARDEN

**A1 — Contracts/decomposition/routing.** `alignmentSlice.js` → thin adapter; новые contracts/fingerprint/session. RED: AB1-first, annotation dirty, session reset, same-length edit stale, suggestion invalidation, unrelated trace, deterministic route ≥20 runs. Gate: happy paths deep-equal; slice не растёт.

**A2 — BioCompute protocol/global scheduler.** `lib/bio-compute/*`, minimal worker transport. RED: ordering, cancel, crash, timeout, StrictMode, transfer ownership, budgets; registered Search/Annotator heavy job serializes with Align или измеренно classified non-heavy. Gate: application-wide contract доказан.

**A3 — Strict input/ABIF worker.** Parser/normalizer hardening, coherent PBAS/PCON/PLOC, transient bytes/hash, caps/session preflight. RED: `EEEE`, full IUPAC, explicit U, empty/multi FASTA, malformed integer/offset/type, generation mixing, FWO, oversized/aggregate memory, AB1-first. Gate: invalid input не входит в store; production parse/hash не в UI thread.

**A4 — Exact engine + alignment worker.** IUPAC parity, complete second-placement, circular wrapper, variants/CIGAR, limits. RED: exhaustive oracle, overlapping/equal repeats, 797/800, origin/reverse/indel, rotation, one-loop, worker parity. Gate: final differential-equal или non-final; Chat принимает uniqueness policy/golden vectors.

**STOP A:** correctness + weak-PC browser acceptance; Phase B не начинается автоматически.

### Phase B — SANGER-QC/LIFECYCLE

**B1 — Working copy/manual branch.** Annotation/sequence dirty, switch dialog, races, legacy child/root save, parent content token, rebind/recompute. Canonical CAS/evidence остаются D1. RED: annotation-only, paste as root, source drift, late success, undo/redo.

**B2 — Quality/chromatogram.** Modified Mott, manual handles, nullable Q, reverse raw coordinates, pairwise/multi traces, robust/double/phase-shift detection через Align leaf tracks без core SequenceView edits.

**B3 — Review events/diagnostics.** Navigator, minimap, safe correction, exact coverage/mapping labels, cDNA-only intron. Pass/fail tests используют fixture policy; production до D0 остаётся diagnostics-only/inconclusive.

**STOP B:** визуальная/биологическая приёмка clean/noisy/mixed fixtures.

### Phase C — CONSENSUS-2

**C1 — Reference pileup/likelihood.** Insertions, deletion runs, competing lengths, Q likelihood, ambiguous/missing-Q unresolved, strand/circular holes, read-order invariance.

**C2 — Multi UI/AA.** Coverage/confidence/read list/traces и multi-layer toggles; synonymous, missense, nonsense, start/stop loss, in-frame indel, frameshift, truncation/extension, splice; forward/reverse/circular CDS, ambiguous→unknown.

**STOP C:** corpus acceptance; D ожидает D0.

### Phase D — DURABLE VERIFY

**D0 — Chat/user gates, без production code:** inventory canonical repository/resolver; утвердить quality policy/vectors; обновить Bodge `2.0.0` core, evidence schema и implementation plan; определить `basisEvidenceRefs`, attachment registry/profile и exact D paths. Fixtures пересоздаются, migration нет.

**D1 — Canonical drafts/assets/save.** Durable trusted draft, attachment staging, revision resolver/CAS child, source parent digest, GC/quota tests. Если repository отсутствует — STOP, не Align-only store.

**D2 — Evidence finalize.** Schema validator, canonical digest, exact subject/plan, full/public profiles, computed/reported link, correction-read independence, atomic metadata commit/rollback.

**D3 — Contextual Verify.** Exact revision/plan/primer preselection, target closure, notebook refs без payload duplication, evidence-derived status/conflict.

**STOP D:** пользователь проверяет полный лабораторный flow и валидатор Bodge archive.

### Phase E — CONFORMANCE

Licensed/sanitized multi-instrument AB1 corpus, synthetic/corrupt builder, adversarial IUPAC/repeat/circular/indel/mixed fixtures, weak-PC benchmark, privacy scan, evidence/reference archive и interop. CI проверяет отсутствие sensitive sample canaries.

**STOP E:** только после всех gates Chat ставит `✅ РЕАЛИЗОВАНО [date]` и отдельно решает archive/docs rotation.

---

## 13. Traceability и acceptance

| ID | Требование | Минимальное доказательство |
|---|---|---|
| ALIGN-R01 | strict DNA-IUPAC/U policy | rejection + full compatibility matrix |
| ALIGN-R02 | один displayed/computed/edited reference | AB1-first integration |
| ALIGN-R03 | approximate никогда не final/evidence | resource/band adversarial cases |
| ALIGN-R04 | topology во всех routes | route matrix для 7 entry paths |
| ALIGN-R05 | optimal/ambiguous repeats | 797/800 + exact second placement |
| ALIGN-R06 | Gotoh/WFA common semantics | differential score/CIGAR/variants |
| ALIGN-R07 | circular canonical coordinates | seam/rotation/reverse/one-loop |
| ALIGN-R08 | safe ABIF + generation set | malformed/oversized/no-OOB corpus |
| ALIGN-R09 | global worker/cancel/stale | transport/browser/scheduler tests |
| ALIGN-R10 | resource/wire/fingerprint | typed transfer, aggregate budget, stale-drop |
| ALIGN-R11 | dirty/manual/canonical save | annotation-only, race, parent digest |
| ALIGN-R12 | deterministic Modified Mott | vector/reset/tie/minimum cases |
| ALIGN-R13 | trace/double/mixed peaks | pair/multi/reverse/noisy fixtures |
| ALIGN-R14 | honest verdict/quality gate | short/partial/low-Q/preview cases |
| ALIGN-R15 | navigable review events | keyboard Previous/Next all event kinds |
| ALIGN-R16 | indel-aware consensus | insertion/deletion majority corpus |
| ALIGN-R17 | calibrated substitution semantics | Q10/Q40 + missing/IUPAC unresolved |
| ALIGN-R18 | real coverage/multi traces/layers | holes/depth/trace + multi toggles |
| ALIGN-R19 | intron/complete AA effects | cDNA gate + full effect matrix |
| ALIGN-R20 | immutable plan/evidence | exact subject/plan digest/validator |
| ALIGN-R21 | correction-read independence | renamed/reimported same observation cannot pass child |
| ALIGN-R22 | durable trusted session/raw AB1 | reload/drift/hash/attachment tests |
| ALIGN-R23 | derived status/conflict/privacy | multi-record + public profile scan |
| ALIGN-R24 | one-command contextual Verify | exact ref/primer/scope flow |
| ALIGN-R25 | deterministic lazy route | ≥20 serial runs, no timeout inflation |
| ALIGN-R26 | measured weak-PC/Rust gate | p95/memory/long-task + differential report |

Gate A: R01–R10, R25 green. Gate B: R11–R15 green, production verdict still locked. Gate C: R16–R19 green. Gate D: R20–R24 + independent validator. Gate E: R26 + full corpus/privacy/interop.

---

## 14. TDD, проверки и STOP report

Каждое изменение проходит RED focused test → minimal GREEN → targeted/full tests → production build. Worker/UX/performance требуют browser acceptance; A/E также требуют differential corpus и измерения на эталонной слабой машине. Точные команды, формат отчёта и правила STOP принадлежат [`WORKFLOW.md`](../process/WORKFLOW.md), а не дублируются в этой спецификации.

Отсутствие RED proof, exact/preview separation, size report или A/E performance evidence означает NO-GO.

---

## 15. Основные риски

1. **Mega-sprint/docs drift.** Отдельные phase handoff/STOP; актуальный inventory до реализации.
2. **Ложная exactness.** Second-placement + differential oracle; resource limit честнее approximate pass.
3. **Worker/memory.** Epoch/fingerprint, bounded traffic/cache, aggregate preflight и crash tests.
4. **Недостоверное/partial evidence.** D0, VerificationPlan и coverage closure; никаких opaque workarounds.
5. **Размеры/privacy.** Slice decomposition, SequenceView/library OUT, sanitised corpus + CI canary scan.

---

## 16. Открытые решения

1. ABIF caps подтверждаются реальным corpus в A3; они не ослабляются без измерений.
2. A4 утверждает uniqueness policy; D0 — exact Q/retained length/coverage/support. До этих gates correction/pass/fail выключены.
3. Indel posterior OUT; используется честный `support-score`.
4. D0 определяет status copy (`targets-confirmed`), `basisEvidenceRefs`, Sanger cardinality и repository paths; при отсутствии repository D останавливается.

---

## 17. Источники

Внутренние:

- [`AGENTS.md`](../../AGENTS.md) — основной performance-манифест слабого ПК;
- [`BUGS.md`](../../BUGS.md) — canonical defect tracker;
- [`SPEC_BODGE_FORMAT_V2_CORE.md`](./SPEC_BODGE_FORMAT_V2_CORE.md) — revisions, Evidence record, attachments и profiles;
- [`ARCHITECTURE.md`](../ARCHITECTURE.md) — local-first архитектура;
- [`DESIGN_SYSTEM.md`](../DESIGN_SYSTEM.md) — UI tokens;
- [`WORKFLOW.md`](../process/WORKFLOW.md) — handoff и verification protocol.

Primary external references:

- SnapGene, [Align Sanger Reads to a Reference Sequence](https://support.snapgene.com/hc/en-us/articles/10384298841364-Align-Sanger-Reads-to-a-Reference-Sequence);
- Geneious, [Assembly, quality trimming and Modified Mott](https://manual.geneious.com/en/latest/AssemblyMapping.html);
- Ewing & Green, [Base-calling of automated sequencer traces using Phred](https://doi.org/10.1101/gr.8.3.186);
- Marco-Sola et al., [Fast gap-affine pairwise alignment using the wavefront algorithm](https://pubmed.ncbi.nlm.nih.gov/32915952/);
- Gotoh, [An improved algorithm for matching biological sequences](https://doi.org/10.1016/0022-2836(82)90398-9);
- Applied Biosystems, [ABIF File Format Specification](https://archive.gfjc.fiu.edu/workshops/resources/literature/ABIF_File_Format.pdf).
