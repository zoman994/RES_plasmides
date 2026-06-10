# SPEC_ASSEMBLY_WORKFLOW_UX.md — финальный workflow сборки на канвасе

**Статус:** ✅ РЕАЛИЗОВАНО — four-tier T-серия (T1-T10 + T4.5), 16-18.05.2026. Архивировано при консолидации `docs/` (S3, 27.05.2026). Базовая модель редактора сборки; две поздних правки ревизовали части (узел A — форма праймера §6.3; узел B — свободные контейнеры §3.1). См. `BACKLOG.md` §Редактор-сборки.

> **Тип задачи:** A (architecture + UX + data model + finalizer). Размер спеки ~32 KB.
> **Якорь будущий:** DEC-ASM-WORKFLOW-01..N — promotion candidates в ANCHORS.md после приёмки + 2-4 недели живучести.
> **Связь:** заменяет существующий RealiseModal (per-boundary picker) на group-based pipeline. Расширяет T-серию (T5-T8). Независим от `.bodge` v2 формата — может быть реализован до или параллельно с M-FORMAT-V2.
> **Sprint:** **M-CANVAS-WORKFLOW-UX** (Code ~10-14 дней). Приоритет ВЫШЕ `.bodge` v2 — биологическая ценность для биолога немедленная.

---

> ## 🔄 ПОПРАВКА 23.05.2026 — разбор узлов A + B
>
> Спека частично суперсежена решениями сессии 23.05.2026. Читать тело с учётом двух правок:
>
> **1. Форма праймера (§3 `deriveAutoPrimers`, §6.3 `Primer additions`) — суперсежена узлом A.** `SPEC_NODE_A_PRIMER_RECORD_UNIFY.md` вводит единый канонический record праймера: провенанс целиком в `source` (поле `origin` удалено), `binding`→`bindingSequence`, `tail`/`autoMode`/`gc`/`pairId`/`status` у всех. Старая форма `origin:{kind:'auto-from-group'}` в §3/§6.3 ниже — НЕДЕЙСТВИТЕЛЬНА. K11/K12 (primer derivation) реализуются против §4 узла A.
>
> **2. Свободный контейнер на канвасе упразднён — DEC-V0.8.3-CANVAS-FINAL-MODEL** (узел B). На канвасе живут только зоны-сборки; контейнера-ноды нет. §3.1 onboarding-хинт «📋 Двойной клик по плазмиде на канвасе» и «📚 Перетащите плазмиду… она появится как источник [на канвасе]» — НЕ ПРИМЕНЯЮТСЯ. Вход в скелет сборки — только через picker (`LibrarySearchBar` / entry-point «+ Плазмида»), молекула сразу становится piece в зоне, минуя канвас. Сама 4-entry-point модель (§3.1.A–D) остаётся верной — меняется только то, что «+ Плазмида» не тянет из канвас-нод. Чистка живого кода под это — `SPEC_CANVAS_NO_LOOSE_CONTAINERS.md`.

---

## 0. Scope & non-goals

### IN scope
- Финальная ментальная модель **zone = пробирки на лабораторном столе** (одна assembly intent = одна zone, в zone — dag из ops разных типов).
- 4 entry-points для piece creation (plasmid range / snippet / synthesis / gap).
- Snippet catalog (≥50 предзаданных + custom additions через UI).
- Snippets и mutations **визуально присутствуют как piece-блоки в strip**, **физически встроены в primer tails соседей** (decoupling visual / mechanism).
- Explicit grouping: «выделил подмножество → сшить → выбрал op.kind для этой группы».
- Multi-step pipeline в одной zone (например 12 source → 4 OvPCR groups → 4 intermediates → 1 Gibson → 1 final circular).
- Side panel «Схема сборки» (embedded RealiseModal — panel, не modal) с quick automode + manual group editing.
- Primer derivation как auto/manual flag, finalizer пересчитывает auto при skeleton/group changes.
- Заменяет per-boundary picker на per-group method picker (биологически корректно).

### OUT scope (отдельные спринты после)
- `.bodge` v2 формат — отдельная спека.
- Cross-zone connections (output одной zone → input другой) — T-future.
- Mutation как separate state slice — данная спека хранит mutation **внутри piece** как property (`piece.mutations[]`), отдельный slice — T-future.
- WYSIWYG primer editor — данная спека использует existing PrimerFromSelectionModal с расширением на 5'/3'-tail + helpers.

---

## 1. Контекст

### 1.1 Что сейчас (v0.8.3-alpha)

- **AssemblyDraftSequenceView** (`canvas/AssemblyDraft*`) — strip-view с раскрашенными pieces в порядке, restriction sites, primers panel сбоку (см. скриншот «Сборка 1 / 27478 bp / 3 сегм. linear»). Это **правильный паттерн**, ядро остаётся.
- **RealiseModal** (`assembly-mode/RealiseModal.jsx`) — модал по кнопке «Realise as DAG». Per-boundary picker: для каждой границы между segments выбирается метод из 5 (Overlap-PCR / Gibson / Golden Gate / Restriction / Direct ligation). Auto-suggest есть. Live DAG preview через `RealiseDagPreview`. Click «Реализовать» → `realiseAssembly(draftId, methods)` создаёт N PCR ops + N junctions + 1 final container.
- **State model**: `state.pieces[]` (T1) + `op.inputPieces[]` (T2) + `state.zones[]` (T3) + `op.materializedClones[]` (T9) + `piece.gapSequence` (V83).
- **T8 finalizer**: реагирует на `piece.acquisitionMethod` change, создаёт/удаляет auto-reaction. Не делает primer derivation.

### 1.2 Что не так с текущей моделью

**Per-boundary picker биологически некорректен.** Биолог не может выбрать Gibson на одну границу и Restriction на соседнюю **в одной reaction**. Метод сборки — свойство **группы фрагментов идущих в один op**, не отдельной границы.

**Нет multi-step pipeline UX.** Если биолог хочет 12 → 3 → 1 (4 Overlap PCR групп + 1 Gibson), сейчас он должен:
- Сделать одну Realise → получает 12 pieces, 11 границ all-PCR → 1 продукт. Не то.
- Или вручную создавать ops через context-menu на canvas. Громоздко.

**Нет snippets/mutations.** Биолог хочет добавить 6×His tag между фрагментами или mutation C234T в одну позицию piece. Сейчас — нет UI для этого внутри strip-view.

**Primers derivation отсутствует.** Primers создаются manual или через PCR mode shell. Нет auto-derivation от skeleton + junctions. Биолог теряет время на тривиальный дизайн стыков.

### 1.3 Биологические правила (важно)

| Метод | Topology продукта | Layer applicability |
|---|---|---|
| **Overlap PCR** | linear | Соединяет N → 1 linear intermediate. Может быть на любом layer pipeline. |
| **Gibson** | circular | Финальный layer для circular. Берёт N linear → 1 circular. |
| **Golden Gate / MoClo** | circular | Финальный layer для circular. Берёт N (circular OR linear) с Type IIS sites → 1 circular. |
| **KLD** | circular | Финальный layer для circular. Берёт 1 linear template + mutagenic primers → 1 circular. |
| **Restriction ligation** | circular | Финальный layer для circular. Берёт cut fragments → 1 circular. |
| **Snippet/tail embedding** | n/a | Не op. Mechanism — встраивается в primer tail соседа на pre-existing op (обычно OvPCR). |

**Multi-step рекомбинация:** биолог часто делает **OvPCR на нескольких слоях**, чтобы редуцировать большое число source фрагментов до меньшего числа intermediates, потом финальный Gibson/GG/etc. Это **normal practice** для assembly >6 фрагментов.

**Snippets / mutations** физически реализуются как modifications primer tail / mutagenic primer. Visually биолог видит их как блоки в strip, но не как отдельные ops.

---

## 2. Mental model: zone = пробирки на столе

Биолог в реальной лаборатории:
- Раскладывает пробирки с source фрагментами по столу (что есть, в каком порядке).
- Выделяет группы пробирок которые будут смешиваться в одной реакции.
- Решает что в каждой реакции (Gibson? OvPCR? Restriction?).
- Запускает каскад реакций.

Zone в BodgeGene — это **виртуальный стол**. Pieces — **пробирки**. Op-groups — **реакции**. Output одной группы становится input следующей.

**Принципы:**
1. **Все источники видны** на стол — никаких скрытых intermediates, всё в strip.
2. **Группировка явная** — биолог сам решает что в одной реакции, без AI-магии (но автомод доступен).
3. **Pipeline линеен сверху вниз** — layer 1 (sources) → layer 2 (intermediates) → ... → layer N (final). Никаких циклов.
4. **Side panel «Схема сборки»** показывает pipeline целиком как мини-DAG, синхронно со strip.

---

## 3. Линейный 5-step workflow

### Шаг 0 — создать zone + выбор final topology

```
[+ Сборка] → modal:

  Финальный продукт:
    ◉ Кольцевая плазмида
    ○ Линейный фрагмент
  
  Имя (опц): [_________________]
  
  [Отмена]    [Создать]
```

Final topology хранится в `zone.finalTopology = 'circular' | 'linear'`. Используется finalizer'ом для:
- Filter op.kind в group picker (Gibson / GG / KLD / Restriction доступны только для circular).
- Auto-suggest финальной op (см. шаг 4).
- Validation: если biolog tries assign Gibson group в zone с `finalTopology: 'linear'` → soft warning toast «Gibson создаёт кольцевой продукт. Для линейного финала используйте Overlap PCR».

### Шаг 1 — Skeleton building (источники)

Empty zone показывает onboarding-hint (4 строки) + кнопки внизу strip:

```
[ Скелет сборки пуст ]

📚 Перетащите плазмиду из библиотеки слева — она появится как источник.
📋 Двойной клик по плазмиде на канвасе — редактор, выделите участок, P → кусок.
⚗️ + Операция — Overlap PCR / Gibson / GG / etc — добавить группу.
🔗 + Кусок — добавьте linker / snippet / синтез / gap вручную.

──────────────────────────────────────────────────────────
  [+ Плазмида]   [+ Обвес]   [+ Синтез]   [+ Gap]
```

**4 entry-points для piece:**

#### 3.1.A «+ Плазмида» — sourced piece
1. Click → opens plasmid picker (Library tree встроен или modal с search).
2. Выбрал plasmid → opens range picker (inline mini SequenceView с draggable handles + числовые поля + dropdown features).
3. Confirm → piece создан с `kind='sourced'`, `sourceIds=[plasmidId]`, `ranges=[{start, end, strand}]`, `origin='picker-selection'`, `acquisitionMethod='pcr'` (default), `zoneId=current`.
4. Появляется в strip как цветной блок (auto color из existing HSL hash).

Альтернатива: drag-drop plasmid из Library tree → автоматически открывается range picker.

#### 3.1.B «+ Обвес» — snippet piece
1. Click → opens snippet catalog modal:

```
┌─ Каталог обвесов ─────────────────────────────────────┐
│ [Search: _____________]   [Категория: All ▾]         │
│                                                         │
│ ── Tags ──                                             │
│  [6×His] [8×His] [FLAG] [HA] [Myc] [V5] [Strep]      │
│  [AviTag]                                              │
│                                                         │
│ ── Linkers ──                                          │
│  [GS] [G4S] [T2A] [P2A] [2A-spacer]                  │
│                                                         │
│ ── Start/Stop ──                                       │
│  [ATG] [Kozak-ATG] [TAA] [TGA] [TAG]                 │
│                                                         │
│ ── Restriction sites ──                                │
│  [NdeI] [NcoI] [BamHI] [EcoRI] [HindIII] [XhoI]      │
│  [NotI] [SacI] [SalI] [KpnI] [BglII] ... (30 шт)     │
│                                                         │
│ ── Мои сниппеты ──                                     │
│  [+ Создать свой...]                                   │
│                                                         │
│ Preview: 6×His = CATCATCATCATCATCAT (18 nt)           │
│                                                         │
│ [Отмена]                          [Добавить →]        │
└────────────────────────────────────────────────────────┘
```

2. Click snippet → preview + confirm → piece создан с `kind='snippet'`, `sequence=<inline>`, `snippetType='6xHis'`, `embedsInPrimer=true`, `zoneId=current`.
3. Появляется в strip как **цветной блок с visual flag** (например — иконка `↳ primer` или dashed border) — биолог видит «вот тут His будет, но в primer соседа».

«**+ Создать свой**» — inline form: name + sequence (validate ATCG-only) + category → сохраняется в `state.snippetsLocal[]` (global для текущего user-account; project-local catalog — T-future через `.bodge` v2 extensions).

#### 3.1.C «+ Синтез» — synthesis piece
1. Click → opens text input modal:

```
┌─ Своя ПСО (синтез) ──────────────────────────────┐
│ Имя: [Hyg-cassette-optimized]                   │
│ Последовательность:                              │
│ ┌──────────────────────────────────────────────┐│
│ │ ATGAAAAAGCCTGAACTCACCGCGACGTCT...            ││
│ └──────────────────────────────────────────────┘│
│ Длина: 815 nt | GC: 52% | Topology: linear     │
│                                                  │
│ Режим:                                           │
│  ◉ Только в этой сборке (одноразовый кусок)    │
│  ○ Сохранить как контейнер (для переиспользования│
│    в других проектах)                           │
│                                                  │
│ [Отмена]                  [Добавить →]          │
└──────────────────────────────────────────────────┘
```

2. Confirm → piece создан с `kind='synthesis'`, `sequence=<input>`, `zoneId=current`.
3. Если выбран mode «сохранить как контейнер» → создаётся container в `containers[]` с этой sequence, piece становится `kind='sourced'` со ссылкой на новый container.

#### 3.1.D «+ Gap» — placeholder piece
1. Click → opens minimal modal: name + length + опц known sequence.
2. Confirm → piece создан с `kind='gap'`, `gapLength`, `gapSequence?`, `gapHint='known'|'unknown'`, `zoneId=current`.
3. Появляется в strip как **rhombus** или **серый блок с диагональной штриховкой** — биолог видит «here be dragons».

### Шаг 2 — Grouping (explicit)

После того как skeleton наполнен, биолог выделяет **подмножество подряд идущих pieces** и навешивает им op.kind.

**UX:**
1. Click-drag selection over pieces в strip (shift-click для прерывистого — НО для assembly требуется continuous range, поэтому только continuous).
2. Highlighted selection показывает кнопку **«🔗 Сшить эти»** floating над выделением.
3. Click «Сшить» → opens **OpGroupPicker** (mini modal или inline popover):

```
┌─ Соединить 4 куска в одну реакцию ──────────────┐
│ Куски: frag-1 → frag-2 → snippet-His → frag-3    │
│                                                    │
│ Метод соединения:                                  │
│  ◉ Overlap PCR    (даст линейный intermediate)   │
│  ○ Gibson         (даст кольцо — финал)          │
│  ○ Golden Gate    (даст кольцо — финал, нужны    │
│                    BsaI sites)                    │
│  ○ Restriction    (даст кольцо — финал)          │
│  ○ KLD            (mutagenesis, только 1 input)  │
│  ○ Direct ligation (бленд/sticky)                │
│                                                    │
│ ── Рекомендуется: Overlap PCR ──                  │
│ Это intermediate (не финал zone). Финал zone =   │
│ кольцо → требуется ещё один circular op после.   │
│                                                    │
│ Имя группы (опц): [layer1-frag123-His]            │
│                                                    │
│ [Отмена]                       [Создать группу →] │
└────────────────────────────────────────────────────┘
```

4. Confirm → создаётся **op-group**:
   - Новая запись в `state.operations[]` с `kind=<picked>`, `inputPieces=[ids подряд]`, `zoneId=current`, `groupLayer=<computed>`.
   - Pieces получают `pieceLayer = groupLayer + 1` (используется для visual placement в strip).
   - Создаётся intermediate piece (`kind='intermediate'`, `derivedFromOpId=<new>`) representing output этой op-group.
   - Strip перерисовывается: pieces группы получают **visual border вокруг них** (group container с border + label «OvPCR → intermediate-A»). Intermediate piece появляется в следующем layer строки strip.

**Visual в strip после grouping:**

```
Layer 1 (sources):
  ┌────────────────────────────────────────────┐
  │ [frag-1] [frag-2] [snippet-His] [frag-3]  │  ← group border
  │              Overlap PCR                    │
  └────────────────────────────────────────────┘
  ┌────────────────────────────────────────────┐
  │ [frag-4] [frag-5] [frag-6]                │  ← group border
  │              Overlap PCR                    │
  └────────────────────────────────────────────┘
  ...

Layer 2 (intermediates):
  [intermediate-A linear]  [intermediate-B linear]  ...

Layer 3 (final):
  ┌────────────────────────────────────────────┐
  │ [interm-A] [interm-B] [interm-C] [interm-D]│  ← group border
  │                Gibson                       │
  └────────────────────────────────────────────┘

  [final-product circular]
```

**Grouping rules:**
- Только **continuous** pieces — нельзя группировать с пропусками.
- Pieces одного **layer** — нельзя смешивать sources с intermediates в одной group.
- **Snippet/synthesis/gap pieces можно включать** в group — они станут частью op (snippet через primer tail, synthesis станет inline вставкой через primer, gap станет explicit placeholder с warning).
- **One piece can be in only one group** at the same layer.

**Ungrouping:** click на group border → context menu «Расформировать группу» → group destroyed, pieces возвращаются к их layer, intermediate piece removed.

### Шаг 3 — Auto-derived primers

Как только group создана, T8 finalizer **запускает primer derivation**:

```javascript
function deriveAutoPrimers(opGroup, state) {
  const pieces = opGroup.inputPieces.map(id => state.pieces.find(p => p.id === id));
  const primers = [];
  
  for (let i = 0; i < pieces.length; i++) {
    const piece = pieces[i];
    if (piece.kind === 'snippet' || piece.kind === 'gap') continue;  // не нуждаются в primers
    
    const prevPiece = pieces[i - 1];
    const nextPiece = pieces[i + 1];
    
    const fwdTail = buildLeftTail(piece, prevPiece, opGroup.kind);
    const revTail = buildRightTail(piece, nextPiece, opGroup.kind);
    
    const fwdBinding = piece.kind === 'sourced' 
      ? piece.source.sequence.slice(piece.range.start, piece.range.start + 20)
      : piece.sequence.slice(0, 20);
    
    const revBinding = piece.kind === 'sourced'
      ? reverseComplement(piece.source.sequence.slice(piece.range.end - 20, piece.range.end))
      : reverseComplement(piece.sequence.slice(-20));
    
    primers.push({
      id: `pr-${uuidv7()}`,
      name: `asm-fwd-${i + 1}`,
      sequence: fwdTail + fwdBinding,
      tm: calcTm(fwdBinding),
      origin: { kind: 'auto-from-group', opGroupId: opGroup.id, pieceId: piece.id, side: 'fwd' },
      tail: fwdTail,
      binding: fwdBinding,
      autoMode: 'auto',  // ← перезаписывается при skeleton change
    });
    
    primers.push({
      id: `pr-${uuidv7()}`,
      name: `asm-rev-${i + 1}`,
      sequence: revTail + revBinding,
      tm: calcTm(revBinding),
      origin: { kind: 'auto-from-group', opGroupId: opGroup.id, pieceId: piece.id, side: 'rev' },
      tail: revTail,
      binding: revBinding,
      autoMode: 'auto',
    });
  }
  
  return primers;
}

function buildLeftTail(piece, prevPiece, opKind) {
  if (!prevPiece) return '';  // первый piece — нет tail
  
  if (prevPiece.kind === 'snippet' && prevPiece.embedsInPrimer) {
    // Snippet встраивается в tail
    return prevPiece.sequence;
  }
  
  if (opKind === 'overlap_pcr' || opKind === 'gibson') {
    // 25 bp overlap с предыдущим piece
    const prevSeq = getPieceSequence(prevPiece);
    return reverseComplement(prevSeq.slice(-25));
  }
  
  if (opKind === 'golden_gate') {
    // 4 bp Type IIS overhang + BsaI site
    return 'GGTCTCN' + prevPiece.ggOverhang;
  }
  
  if (opKind === 'restriction') {
    // RE site + padding
    return prevPiece.reSite + 'GG';
  }
  
  return '';
}
```

**Panel «Праймеры» справа** (existing AssemblyPrimersPanel) показывает derived primers:

```
Праймеры (8 шт, границы 3/3 покрыты ✓)

🔧 asm-fwd-1   Tm 60° · GC 55%   binding 20nt              [✏️] [🔒]
🔧 asm-rev-1   Tm 58° · GC 50%   binding 20 + tail 25     [✏️] [🔒]
🔧 asm-fwd-2   Tm 61° · GC 52%   binding 20 + tail 43      ← snippet His встроен
                                                              [✏️] [🔒]
🔒 asm-rev-2   Tm 57° · GC 48%   binding 20 + tail 25     [✏️] [🔄]  ← manual override
🔧 asm-fwd-3   ...

[+ Создать праймер вручную]
```

- `🔧` = auto (derived), пересчитывается при skeleton change.
- `🔒` = manual (биолог отредактировал, finalizer не трогает).
- `[✏️]` = edit (открыть PrimerFromSelectionModal с этим primer).
- `[🔒]` = lock (превратить в manual).
- `[🔄]` = reset to auto (отбрасывает manual edit, возвращает в derived).

**Click [✏️]** на любом primer → opens PrimerFromSelectionModal:

```
┌─ Праймер asm-rev-2 ────────────────────────────────┐
│ Имя: [asm-rev-2]                                   │
│                                                     │
│ 5' tail (overhang, не binds на template):          │
│ ┌─────────────────────────────────────────────┐   │
│ │ CATCATCATCATCATCAT  + GCCATGGGCAGCAGCCAT    │   │  ← snippet His + Gibson overlap
│ └─────────────────────────────────────────────┘   │
│  Helpers: [6×His ▾] [Kozak] [NdeI] [...]          │
│                                                     │
│ Binding (на template):                             │
│ pET-28b range 8961..8981  Tm 60° GC 55%           │
│                                                     │
│ Полная последовательность (44 nt):                 │
│ CATCATCATCATCATCATGCCATGGGCAGCAGCCATATGCATATG     │
│                                                     │
│ ☑ Reverse complement (на bottom strand)            │
│                                                     │
│ Mode: ○ Auto (derived from group)                  │
│        ◉ Manual (биолог edited)                    │
│                                                     │
│ [Отмена]            [Применить] / [Reset to auto]  │
└─────────────────────────────────────────────────────┘
```

**Click «+ Создать праймер вручную»** в panel → пустая form, биолог пишет от нуля. Сам выбирает на каком piece этот primer binds (picker), на каком strand. Auto-detect binding если sequence match exists.

### Шаг 4 — Realise pipeline → DAG ops

После того как все pieces в zone сгруппированы (каждый piece принадлежит какой-то op-group; pieces без group — это **dangling** sources, не используются), биолог нажимает «Realise pipeline» в side panel «Схема сборки».

**Что происходит:**
1. Каждая op-group → создаётся реальный op-узел в `state.operations[]` (если был draft — promote to actual op).
2. T8 finalizer:
   - Для каждой op-group считает `op.outputs` = intermediate container (для не-final layers) или final container (для last layer).
   - Container created с topology согласно `op.kind` (`linear` от OvPCR, `circular` от Gibson/GG/KLD/restriction).
   - Sequence получается через `simulateAssembly(opGroup.inputPieces, primers, opGroup.kind)` — реальный biological simulation (existing `lib/assembly-realise.js` logic, extended на group-based).
   - Auto-primers persisted в primer pool с `origin.kind='auto-from-group'`.
3. На canvas появляются op-romb для каждой группы, connected wires от input pieces к op и от op к output container.

**Биолог может редактировать pipeline** даже после Realise:
- Изменил skeleton (добавил piece) → group invalidated → finalizer warns «Group A не соответствует pieces. Пересоздать?» → biolog confirms → primers/output recomputed.
- Changed primer manual → если он в auto group, group invalidated similar way.

---

## 4. Side panel «Схема сборки»

Существующий RealiseModal **превращается в side panel**, всегда видимый при работе с assembly zone (right side, ~280-340 px width). Назначение:
- Quick overview всего pipeline (mini-DAG).
- Quick grouping shortcuts (drag pieces in panel + assign op).
- Automode button.
- Show group-level params.

**Layout:**

```
┌─ Схема сборки ────────────────┐
│  pks4-knockout (circular)     │
│                                │
│  ⚡ Auto-собрать  [Применить]  │ ← automode
│  ────────────────────────────  │
│                                │
│  Layer 1 (sources, 12)         │
│   ┌──────────────────┐         │
│   │ Group A: OvPCR    │ [edit] │
│   │  frag1,2,His,3    │        │
│   │  → interm-A       │        │
│   └──────────────────┘         │
│   ┌──────────────────┐         │
│   │ Group B: OvPCR    │ [edit] │
│   │  frag4,5,6        │        │
│   │  → interm-B       │        │
│   └──────────────────┘         │
│   ...                          │
│                                │
│  Layer 2 (intermediates, 4)    │
│   ┌──────────────────┐         │
│   │ Group E: Gibson   │ [edit] │
│   │  intA,B,C,D       │        │
│   │  → final (circ)   │        │
│   └──────────────────┘         │
│                                │
│  ───────────────────────────   │
│  Mini DAG:                     │
│  [SVG preview, как сейчас]     │
│                                │
│  [Realise pipeline →]          │
└────────────────────────────────┘
```

**Automode logic:**

```javascript
function autoGroupPipeline(zone, state) {
  const sources = state.pieces.filter(p => p.zoneId === zone.id && !p.derivedFromOpId);
  
  if (sources.length === 0) return null;
  
  // Heuristic: if final = linear OR sources <= 6, single OvPCR group
  if (zone.finalTopology === 'linear' || sources.length <= 6) {
    return {
      groups: [{ kind: 'overlap_pcr', pieceIds: sources.map(p => p.id) }]
    };
  }
  
  // Final = circular, sources > 6 → multi-step
  // Layer 1: OvPCR groups of ~3-4 pieces each
  // Layer 2: Gibson final from N intermediates
  const groupSize = Math.ceil(Math.sqrt(sources.length));  // 12 → 4, 25 → 5
  const layer1Groups = [];
  for (let i = 0; i < sources.length; i += groupSize) {
    layer1Groups.push({
      kind: 'overlap_pcr',
      pieceIds: sources.slice(i, i + groupSize).map(p => p.id)
    });
  }
  
  // Layer 2: Gibson from intermediates
  // Intermediate ids generated by finalizer when groups applied
  // Here we return spec; finalizer assembles refs
  
  const layer2Groups = [{
    kind: zone.finalTopology === 'circular' ? 'gibson' : 'overlap_pcr',
    intermediateFromGroups: layer1Groups.map((_, i) => i)
  }];
  
  return { groups: [...layer1Groups, ...layer2Groups] };
}
```

**«⚡ Auto-собрать [Применить]»** click → automode runs → groups proposed как preview (грейский border вокруг proposed group в strip) → biolog click «Применить» → groups created actually, primers derived.

Если biolog хочет другую структуру (например 12 → 6 → 1 вместо 12 → 4 → 1) — он **переопределяет** через manual grouping в strip. Automode не блокирует.

---

## 5. Snippets & mutations: visual presence, primer mechanism

### 5.1 Snippet flow

1. **+ Обвес** → snippet catalog → выбран 6×His → piece с `kind='snippet'`, `sequence='CATCATCATCATCATCAT'`, `embedsInPrimer=true`.
2. Появляется в strip как блок с **visual indicator** «эта sequence будет встроена в primer соседа»:

```
Strip view:
[frag-1: 1500 bp]──[6×His: 18 bp ↳ primer]──[frag-2: 800 bp]
                       ↑
              цветная полоса + иконка ↳
              dashed border (vs solid у sourced)
              hover tooltip: «Встроен в 5'-tail asm-fwd-2»
```

3. Когда biolog групирует эти 3 pieces в OvPCR → finalizer derive'ит primers:
   - `asm-rev-1` (rev для frag-1) — стандартный.
   - `asm-fwd-2` (fwd для frag-2) — **получает в tail**: snippet sequence (18 bp) + overlap region с frag-1 (25 bp) = **43 bp tail** + 20 bp binding.
4. В panel primers видно: `asm-fwd-2  Tm 61° · GC 52%   binding 20 + tail 43 (His + overlap)`.

### 5.2 Mutation flow

1. Biolog double-click на nucleotide position в piece (в SequenceView open ed editor).
2. Context menu → «Добавить mutation» → modal:

```
┌─ Mutation на pET-28b position 234 ─────────────┐
│ Original base: C                                │
│ New base:      [T ▾]                            │
│ Kind: ◉ Silent  ○ Missense  ○ Nonsense         │
│ Notes (опц): [Test substitution for K77E]      │
│                                                  │
│ Эта mutation будет реализована через mutagenic  │
│ primer для куска [piece-X]. Это означает что    │
│ piece-X должен быть в op-group с методом       │
│ Overlap PCR или KLD.                           │
│                                                  │
│ [Отмена]                       [Применить]      │
└─────────────────────────────────────────────────┘
```

3. Confirm → piece получает `piece.mutations[] = [{position, fromBase, toBase, kind, notes}]`. Visual marker — **vertical line на позиции в piece-блоке strip** (как restriction site marker).
4. Когда piece попадает в op-group OvPCR/KLD → finalizer строит mutagenic primer:
   - Binding region containing position 234, but with `T` instead of `C` at the position.
   - Tail-and-overlap with neighbor as usual.
   - В panel: `asm-fwd-X-mut  Tm 59° · GC 50%  contains mutation C234T`.

5. Если piece в Gibson/GG group (не PCR-based) → toast warning «Mutation требует PCR/KLD. Эта группа использует Gibson — mutation не будет реализована. Поменяйте метод группы.»

### 5.3 Как донести до biolog'а

В strip-view иконография:
- 🧬 — sourced piece (полная цветная полоса).
- ✦ — snippet (цветная полоса + dashed + иконка ↳ primer).
- 🧪 — synthesis (цветная полоса + иконка ⚗️).
- ◊ — gap (диагональная штриховка).
- 💎 — mutation marker (vertical line on existing piece).

Onboarding tooltip first-time когда biolog добавляет snippet:

> **Обвес встраивается в праймер**
> Этот короткий участок не делается отдельной PCR — он добавляется в 5'-конец праймера соседнего куска. В финальном продукте он на своём месте, но в лаборатории это просто длинный праймер. Tm/GC соседнего праймера рассчитываются с учётом этого хвоста.
>
> [Понятно, не показывать снова]

---

## 6. Data model changes

### 6.1 Piece additions

```typescript
type Piece = {
  // existing T1 fields
  id, name, kind: 'sourced' | 'gap' | 'synthesis' | 'snippet' | 'intermediate',
  sourceIds, ranges, gapLength?, gapSequence?, gapHint?,
  acquisitionMethod, acquisitionParams, derivedReactionId, frozen,
  origin, color, functionalLabel, variantGroupId, order, pinned, zoneId,
  
  // NEW v0.9
  snippetType?: '6xHis' | 'FLAG' | 'T2A' | ... | 'custom',  // для kind='snippet'
  embedsInPrimer?: boolean,  // для kind='snippet', default true
  sequence?: string,  // для kind='snippet' | 'synthesis' | 'intermediate'
  mutations?: Array<{ position, fromBase, toBase, kind, notes }>,  // для kind='sourced'
  derivedFromOpId?: string,  // для kind='intermediate' (output какой op)
  groupId?: string,  // ID op-group куда этот piece принадлежит (Шаг 2)
  groupLayer?: number,  // 0 = sources, 1 = layer 1 intermediates, ...
};
```

### 6.2 Op additions

```typescript
type Operation = {
  // existing T1-T9 fields
  id, kind, status, position, inputs, inputPieces, outputs, params,
  junctionRefs, zoneId, createdAt, executedAt, error, materializedClones, pinned,
  
  // NEW v0.9
  isOpGroup?: boolean,  // marks this op как op-group (Шаг 2)
  groupLayer?: number,  // 0 = first layer (от sources), 1, 2, ...
  intermediateContainerId?: string,  // output для не-final layers
};
```

### 6.3 Primer additions

```typescript
type Primer = {
  // existing
  id, name, sequence, tm, gc, origin, ...
  
  // NEW v0.9
  binding: string,  // часть sequence binding на template
  tail: string,  // часть sequence overhang
  autoMode: 'auto' | 'manual' | 'locked',  // auto-recompute on skeleton change?
  derivedFrom?: { opGroupId, pieceId, side: 'fwd' | 'rev' },  // если autoMode='auto'
};
```

### 6.4 Zone additions

```typescript
type Zone = {
  // existing T3
  id, name, bounds, viewMode, laneLayout, collapsed, notes, autoResize,
  
  // NEW v0.9
  finalTopology?: 'linear' | 'circular',  // Шаг 0
};
```

### 6.5 Snippets catalog

Global slice `state.snippetsCatalog` — built-in 50-80 snippets (factory) + user-added.

```typescript
type SnippetEntry = {
  id, name, sequence, category, isCustom?, createdAt?,
};
```

Хранится в IndexedDB Dexie table `snippets` per user-account. Не привязано к проекту по умолчанию.

---

## 7. Finalizer extensions

### 7.1 Trigger events

T8 finalizer (existing) extended:
- **PIECE_ADDED to zone** → если zone имеет groups → invalidate affected groups, propose re-grouping (toast).
- **PIECE_REMOVED from zone** → if was in group → group invalidated.
- **PIECE_REORDERED** → groups recomputed pieceLayer; primers recomputed for affected groups.
- **OP_GROUP_CREATED** → derive auto-primers + create intermediate piece in next layer + recompute downstream groups.
- **OP_GROUP_KIND_CHANGED** (e.g. OvPCR → Gibson) → primer tails recomputed (different overlap length for Gibson).
- **OP_GROUP_REMOVED** → its pieces возвращены к их layer; downstream groups invalidated.
- **PIECE_RANGES_CHANGED** → primers recomputed (binding region на новой sequence).
- **PRIMER_MANUAL_EDIT** → primer.autoMode = 'manual', не recomputed automatically; warning если skeleton change invalidates binding.
- **PRIMER_RESET_TO_AUTO** → primer.autoMode = 'auto', recomputed from current group.

### 7.2 Multi-step pipeline derive

```javascript
function derivePipeline(zone, state) {
  const opGroups = state.operations.filter(op => op.isOpGroup && op.zoneId === zone.id);
  
  // Topological sort by layer
  const layers = groupBy(opGroups, op => op.groupLayer);
  const sortedLayers = Object.keys(layers).map(Number).sort();
  
  for (const layer of sortedLayers) {
    for (const opGroup of layers[layer]) {
      const inputs = opGroup.inputPieces.map(id => state.pieces.find(p => p.id === id));
      
      // Validate: все inputs существуют и правильного layer
      if (inputs.some(p => !p || p.groupLayer !== layer)) {
        opGroup.error = 'Inputs invalid';
        continue;
      }
      
      // Derive primers (если применимо для kind)
      if (['overlap_pcr', 'gibson', 'kld', 'golden_gate', 'restriction'].includes(opGroup.kind)) {
        const primers = deriveAutoPrimers(opGroup, state);
        // Persist primers в pool с origin
        for (const primer of primers) {
          state.primers.push(primer);
        }
      }
      
      // Derive intermediate output (для не-final layer)
      const isLastLayer = layer === Math.max(...sortedLayers);
      const outputTopology = isLastLayer 
        ? zone.finalTopology 
        : 'linear';  // OvPCR всегда linear, intermediate всегда linear
      
      const intermediate = {
        id: `c-interm-${uuidv7()}`,
        name: `${zone.name}-layer${layer}-${opGroup.name || opGroup.kind}`,
        sequence: simulateAssemblyOutput(inputs, primers, opGroup.kind),
        topology: outputTopology,
        derivedFromOpId: opGroup.id,
      };
      
      state.containers.push(intermediate);
      opGroup.outputs = [intermediate.id];
      
      // Create intermediate piece в next layer (если не final)
      if (!isLastLayer) {
        const intermPiece = {
          id: `pc-interm-${uuidv7()}`,
          kind: 'intermediate',
          sourceIds: [intermediate.id],
          ranges: [{ start: 0, end: intermediate.sequence.length, strand: 1 }],
          derivedFromOpId: opGroup.id,
          zoneId: zone.id,
          groupLayer: layer + 1,
          color: opGroup.color || '#888',
        };
        state.pieces.push(intermPiece);
      }
    }
  }
}
```

---

## 8. Snippet catalog (50-80 предзаданных)

### 8.1 Tags (8)
- 6×His: `CATCATCATCATCATCAT`
- 8×His: `CATCATCATCATCATCATCATCAT`
- FLAG: `GATTACAAGGATGACGATGACAAG`
- HA: `TATCCATATGATGTTCCAGATTATGCT`
- Myc: `GAACAAAAACTCATCTCAGAAGAGGATCTG`
- V5: `GGTAAGCCTATCCCTAACCCTCTCCTCGGTCTCGATTCTACG`
- Strep: `TGGAGCCACCCGCAGTTCGAGAAA`
- AviTag: `GGCCTGAACGACATCTTCGAGGCTCAGAAAATCGAATGGCACGAA`

### 8.2 Linkers (5)
- GS: `GGCAGT`
- G4S: `GGTGGCGGCGGCAGT`
- 2×G4S: `GGTGGCGGCGGCAGTGGTGGCGGCGGCAGT`
- T2A: `GAGGGCAGAGGAAGTCTGCTAACATGCGGTGACGTCGAGGAGAATCCTGGCCCT`
- P2A: `GCTACTAACTTCAGCCTGCTGAAGCAGGCTGGAGACGTGGAGGAGAACCCTGGACCT`

### 8.3 Start/Stop (5)
- ATG: `ATG`
- Kozak-ATG: `GCCACCATG`
- TAA: `TAA`
- TGA: `TGA`
- TAG: `TAG`

### 8.4 Restriction sites (30 most common)
- 6-cutters: NdeI, NcoI, BamHI, EcoRI, HindIII, XhoI, NotI, SacI, SalI, KpnI, BglII, SpeI, XbaI, PstI, SmaI, ApaI, ClaI, EcoRV, NheI, NaeI, MluI, BspEI, AflII, AvrII, PciI.
- Type IIS: BsaI, BsmBI, SapI, BbsI, AarI.

Каждый — recognition site + 2-3 bp padding для efficient cutting (например NotI = `GCGGCCGCG` с G-padding).

### 8.5 Custom snippets

UI «+ Создать свой» в catalog modal:
```
┌─ Создать свой обвес ──────────────────┐
│ Имя: [_______________]                │
│ Sequence: [_______________________]   │
│ Validate: ATCG-only, ≤200 nt          │
│ Категория: [Tag ▾]                    │
│                                        │
│ [Отмена]               [Сохранить]    │
└────────────────────────────────────────┘
```

Сохраняется в IndexedDB `snippets` table — viewable для всех проектов этого user account.

**Project-local snippets** — T-future через `.bodge` v2 `extensions/snippets/<project>.json`. Биолог делится с коллегами через `.bodge` (snippets travel with project).

---

## 9. Migration: existing draft → new model

Текущий state v0.8.3 имеет:
- `state.zones[]` (T3) — без `finalTopology`.
- `state.pieces[]` (T1) — без `groupId / groupLayer / snippetType / mutations`.
- `state.operations[]` — отдельные ops, не grouped.
- `state.assemblyDrafts[]` (legacy, T6 deviation kept) — с segments.

**Migration steps (v0.8.3 → v0.9.0):**

1. **Zones** получают `finalTopology` field. Default = `'circular'` (Gibson historically самый common). Биолог может изменить через zone context menu.
2. **Pieces** получают `groupLayer = 0` default (все sources). `groupId = null`.
3. **Operations** existing получают `isOpGroup = false` (старые ops остаются как graph ops, не grouped pipeline). Bioлог может «mergerе» legacy ops в groups через UI tool (T-future, не v0.9.0).
4. **Primers** existing получают `autoMode = 'manual'`, `binding = full sequence`, `tail = ''`. Все existing primers safe, finalizer не трогает.
5. **Assembly drafts** (legacy T6) — оставлены как есть, продолжают работать через legacy RealiseModal (которая теперь side panel). Постепенная миграция drafts → groups — T-future.

**Idempotent.** Повторное чтение state не меняет existing data.

---

## 10. K-точки Sprint M-CANVAS-WORKFLOW-UX

**K1 — Data model extension.** Добавить новые fields в piece/op/primer/zone (см. §6). Schema bump v10 → v11. Migration v10→v11 idempotent. +12 tests.

**K2 — Snippet catalog initial.** `lib/snippet-catalog.js` с 50-80 built-in snippets (см. §8). UI catalog modal (Tags/Linkers/Start/Stop/RE/Custom categories). Dexie table `snippets` для user-account custom. +8 tests.

**K3 — Entry-point «+ Обвес».** Replace existing simple buttons в empty zone toolbar на 4 entry-points. Snippet picker modal — открыть из toolbar. Piece создаётся с `kind='snippet'`, `embedsInPrimer=true`. +6 tests.

**K4 — Entry-point «+ Синтез».** Synthesis piece modal (text input + radio mode + length/GC live). Piece created с `kind='synthesis'`. +5 tests.

**K5 — Entry-point «+ Плазмида» + range picker.** Replaces existing add-via-canvas-drag flow с inline range picker (mini SequenceView + draggable handles + numerical input + features dropdown). Drop из Library tree автоматически открывает range picker. +8 tests.

**K6 — Strip rendering для snippet/synthesis/mutation.** Visual icons (✦ snippet, 🧪 synthesis, 💎 mutation marker on existing piece). Tooltip first-time onboarding. +6 tests.

**K7 — Grouping UX.** Selection over pieces в strip (drag-select continuous range). «🔗 Сшить» floating button. OpGroupPicker modal (выбор kind, name, auto-suggest based on zone topology). Op-group создание с pieces.groupId update. +10 tests.

**K8 — Group visual border в strip.** Render group container вокруг grouped pieces. Label «kind → intermediate name». Multi-layer rendering (layer 1 sources → layer 2 intermediates → layer N final). +6 tests.

**K9 — Side panel «Схема сборки».** Embed existing RealiseModal как right side panel (replacement of «open by button»). Panel показывает layered groups list + mini-DAG preview + automode button + realise button. +8 tests.

**K10 — Automode (auto-grouping).** `lib/auto-group-pipeline.js` — heuristic algorithm (см. §4). Preview proposed groups в strip с grey border, biolog confirm. +6 tests.

**K11 — Primer auto-derivation pipeline.** `lib/primer-derive.js` — `deriveAutoPrimers(opGroup, state)` (см. §3 шаг 3). `buildLeftTail / buildRightTail` per kind. Snippet встраивание в tail. Mutagenic primer для mutations. +15 tests.

**K12 — Primer auto/manual flag.** Primer.autoMode field. UI в panel — `🔧/🔒/[✏️]/[🔒]/[🔄]` buttons. Lock/unlock/reset actions. Finalizer recompute only for autoMode='auto' primers. +8 tests.

**K13 — PrimerFromSelectionModal extension.** Add 5'/3'-tail fields + helpers buttons + RC toggle + binding/tail split visualization. Helpers: snippet catalog access + recent restriction sites. +6 tests.

**K14 — Mutation entry в SequenceView.** Context menu на position «Добавить mutation» → modal. piece.mutations[] append. Visual marker render. Finalizer extension для mutagenic primer derive. +8 tests.

**K15 — Finalizer extensions (T8.5).** Trigger handlers (см. §7.1): piece change, group change, primer manual edit. derivePipeline для multi-step. +12 tests.

**K16 — Migration v10→v11.** Schema bump. Idempotent. Existing state safe. Tests с reference v0.8.3 fixture. +8 tests.

**K17 — Smoke test.** Real biolog workflow:
1. New zone, final = circular.
2. + Плазмида ×4 → 4 sources.
3. + Обвес 6×His между frag-2 и frag-3.
4. Mutation C234T on frag-1 (open editor → context menu).
5. Side panel: «⚡ Auto-собрать» → groups predicted (1 OvPCR with all 4 + 1 snippet + mutation → linear; 1 Gibson → circular)? Or biolog manual: select frag-1+2+His+3 → «Сшить» → OvPCR → interm-A; select frag-4 + interm-A → Gibson → final circular.
6. Panel «Праймеры» показывает 8-10 auto primers с правильными tails (His встроен, mutagenic для C234T).
7. Biolog edits asm-fwd-2 manually (adds extra restriction site в tail) → primer locked.
8. Realise pipeline → 2 ops на canvas, final container с правильной sequence.

**K18 — Size budget.** Component sizes after K1-K17. Side panel `AssemblyPipelinePanel.jsx` < 30 KB. `primer-derive.js` < 15 KB. Total bundle impact +25-40 KB gzipped.

---

## 11. STOP-условие

Code останавливается после K18.

Отчёт:
```
## M-CANVAS-WORKFLOW-UX — отчёт
Commits: ...
Vitest: 3276 → ~3450 pass / 1 skip / 0 fail (+~170)
pytest: 112/112
vite build: clean

Workflow verified:
- 4 entry-points (plasmid range / snippet / synthesis / gap): ✓
- Snippet catalog 50-80 built-in + custom add: ✓
- Snippet/mutation visual в strip + tooltip onboarding: ✓
- Explicit grouping via select + сшить: ✓
- Op-group visual border в multi-layer strip: ✓
- Side panel «Схема сборки»: ✓
- Automode auto-grouping: ✓
- Primer auto-derivation per group kind: ✓
- Manual primer override с auto/manual flag: ✓
- Mutation в primer как mutagenic: ✓

Migration v10 → v11 idempotent: ✓
Existing state v0.8.3 safe: ✓

Bundle impact: +~35 KB gzipped

Spec deviations: [list]
Открытые вопросы: [list]
```

---

## 12. Открытые вопросы

1. **Mutation как отдельный slice vs piece.mutations[]** — текущий spec выбрал `piece.mutations[]`. Альтернатива — `state.mutations[]` с refs на piece. Альтернатива даёт easier cross-piece mutation tracking (если мута на стыке между 2 pieces), но сложнее для типичного use-case (1 mutation = 1 piece). Решение принято: `piece.mutations[]` для MVP. T-future migration возможна.

2. **«Свои» snippets project-local vs account-global** — текущий spec выбрал **account-global** (хранятся в IndexedDB user-account). Project-local sharing через `.bodge` v2 `extensions/snippets/` — T-future, не v0.9.0. Подтверждение Игоря если другое предпочтение.

3. **Group renaming inline** в side panel — клик на name → editable inline? Или modal? Inline проще, но возможны накладки с click → expand group details. Решение в реализации.

4. **Drag-reorder pieces в strip переезжает в другую group** — если biolog ttнг piece из group A в group B, что происходит? Auto-move (piece.groupId update + primer recompute обеих) или ban (warning «remove first»)? Я склоняюсь к **auto-move с recompute** — более естественно. Подтверждение Игоря.

5. **Automode predictability** — heuristic в §4 (sqrt(N) groupSize) может быть unintuitive. Опция: biolog задаёт «макс кусков в одной reaction» в settings, automode respect. T-future enhancement, не v0.9.0.

---

**Дата:** 19.05.2026.
**Author:** Chat (BodgeGene Architecture).
**Реализация:** Sprint M-CANVAS-WORKFLOW-UX (Code, ~10-14 дней).
**Зависимости:** v0.8.3-alpha state shape (containers/pieces/operations/zones/junctions/materializedClones/pinned), existing AssemblyDraftSequenceView strip render, existing RealiseModal (converting to side panel), existing T8 finalizer (extending).
**Parallel:** не зависит от `.bodge` v2 формата — может быть реализован до, параллельно или после. Биологическая ценность ВЫШЕ `.bodge` v2 в краткосрочной перспективе.
