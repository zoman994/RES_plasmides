# ASSEMBLY_ENGINE_v2.md — Полная спецификация движка сборки PlasmidVCS

Положить в корень репозитория. Claude Code: прочти целиком перед реализацией.

---

## Фундаментальный принцип

Сборка ДНК — это НЕ "выбрал метод → получил праймеры". Это два независимых
решения на каждый фрагмент и каждый стык:

1. **Для каждого фрагмента:** нужна ли ПЦР-амплификация? Или фрагмент берётся
   как есть (рестрикция, синтез, выход предыдущего шага)?

2. **Для каждого стыка между фрагментами:** каким способом соединяются концы?
   Overlap? Sticky end? Golden Gate overhang? Blunt? Предварительно сформированный?

Метод сборки (overlap PCR, Gibson, Golden Gate, restriction/ligation, KLD) — это
просто комбинация типичных ответов на эти два вопроса. Но пользователь может
комбинировать произвольно.

---

## Архитектура: AssemblyPlan → AssemblyStep → Fragment + Junction

```
AssemblyPlan (верхний уровень — может содержать несколько шагов)
 │
 ├── AssemblyStep 1 (например Golden Gate кассеты)
 │    ├── Fragment 1 (PglaA, из parts library, нужна ПЦР)
 │    │    ├── fwd_primer (чистый binding, без хвоста)
 │    │    └── rev_primer (с GG-хвостом: spacer + BsaI + overhang)
 │    │
 │    ├── Junction 1→2 (тип: golden_gate, overhang: ATCG, enzyme: BsaI)
 │    │
 │    ├── Fragment 2 (XynTL, синтез Vazyme, НЕ нужна ПЦР — уже с BsaI сайтами)
 │    │    ├── fwd_primer: null (не нужен)
 │    │    └── rev_primer: null (не нужен)
 │    │
 │    ├── Junction 2→3 (тип: golden_gate, overhang: GCTA, enzyme: BsaI)
 │    │
 │    └── Fragment 3 (TtrpC, из parts, нужна ПЦР)
 │         ├── fwd_primer (с GG-хвостом)
 │         └── rev_primer (с GG-хвостом)
 │
 └── AssemblyStep 2 (Gibson кассеты в backbone)
      ├── Fragment 1 (выход Step 1, НЕ нужна ПЦР)
      ├── Junction 1→2 (тип: overlap, mode: right_only, 30 bp)
      └── Fragment 2 (pEXP backbone, нужна ПЦР для линеаризации)
```

---

## Модель данных

### Fragment (расширенная версия)

```python
@dataclass
class AssemblyFragment:
    id: str
    order: int                     # позиция в сборке (1, 2, 3...)
    name: str                      # "PglaA", "XynTL_Q158R"

    # ── Источник (откуда фрагмент) ──
    source_type: str               # "part" | "construct" | "sequence" | "previous_step" | "digest"
    source_part_id: str | None     # ID из библиотеки частей
    source_construct_id: str | None
    source_revision_id: str | None
    source_feature_name: str | None   # конкретный feature из конструкта
    source_step_id: str | None     # выход предыдущего шага (multi-step)
    raw_sequence: str | None       # вставленная последовательность (для "sequence")

    # ── Последовательность фрагмента ──
    sequence: str                  # итоговая последовательность фрагмента
    length: int

    # ── Нужна ли ПЦР-амплификация? ──
    needs_amplification: bool = True
    #   True:  генерируются fwd + rev праймеры
    #   False: фрагмент используется как есть (рестрикция, синтез, предыдущий шаг)
    #
    # Примеры когда False:
    #   - Синтетический фрагмент заказан с правильными концами
    #   - Вектор линеаризован рестрикцией (не ПЦР)
    #   - Выход предыдущего шага сборки
    #   - Фрагмент вырезан рестрикцией из другого конструкта

    amplification_note: str = ""   # "linearize with EcoRI/BamHI", "synthesized by Vazyme"
```

### Junction (стык между фрагментами)

```python
@dataclass
class Junction:
    id: str
    left_fragment_order: int       # фрагмент слева (N)
    right_fragment_order: int      # фрагмент справа (N+1)

    # ── Тип стыка ──
    junction_type: str
    #   "overlap"         — overlap PCR или Gibson (overlap в праймерных хвостах)
    #   "golden_gate"     — Type IIS RE → 4-нт overhang
    #   "sticky_end"      — классическая рестрикция → совместимые липкие концы
    #   "blunt"           — тупые концы (blunt-end ligation)
    #   "preformed"       — концы уже готовы, ничего добавлять не нужно
    #   "phosphorylated"  — KLD (back-to-back праймеры, фосфорилированные)

    # ── Для overlap / Gibson ──
    overlap_mode: str = "split"
    #   "split"       — overlap поделён: половина на rev праймере левого, половина на fwd правого
    #   "left_only"   — ВЕСЬ overlap на rev праймере левого фрагмента. fwd правого = чистый binding
    #   "right_only"  — ВЕСЬ overlap на fwd праймере правого фрагмента. rev левого = чистый binding
    #   "none"        — overlap не нужен (используется с junction_type="preformed")
    #
    # КОГДА КАКОЙ MODE:
    #   split      — стандарт, оба фрагмента амплифицируются ПЦР
    #   left_only  — правый фрагмент не амплифицируется (вектор, синтез) или
    #                хочешь весь overlap на одном праймере для простоты
    #   right_only — левый фрагмент не амплифицируется
    #   none       — оба фрагмента уже имеют правильные концы

    overlap_sequence: str = ""     # последовательность overlap-зоны
    overlap_length: int = 0
    overlap_tm: float = 0.0
    overlap_gc: float = 0.0

    # ── Для Golden Gate ──
    overhang_4nt: str = ""         # "ATCG" — 4-нуклеотидный overhang
    enzyme: str = ""               # "BsaI", "BbsI", "Esp3I"

    # ── Для restriction/ligation ──
    re_enzyme_name: str = ""       # "EcoRI", "BamHI"
    re_end_type: str = ""          # "5prime_overhang", "3prime_overhang", "blunt"
    re_overhang_seq: str = ""      # "AATT" для EcoRI

    # ── Предупреждения ──
    warnings: list[str] = field(default_factory=list)
```

### AssemblyStep

```python
@dataclass
class AssemblyStep:
    id: str
    plan_id: str
    order: int                     # порядок выполнения (1, 2, 3...)
    name: str                      # "Expression cassette GG" или "Gibson into backbone"

    method: str                    # "overlap_pcr", "gibson", "golden_gate",
                                   # "restriction_ligation", "kld", "other"

    fragments: list[AssemblyFragment]
    junctions: list[Junction]      # len = len(fragments) - 1 (линейная)
                                   # или len(fragments) (кольцевая)
    circular: bool = True          # кольцевой продукт?

    # ── Параметры метода (дефолты, переопределяемые на уровне junction) ──
    default_overlap_length: int = 22    # для overlap_pcr
    default_overlap_tm: float = 62.0
    default_binding_tm: float = 60.0    # целевой Tm binding-региона праймера
    salt_mm: float = 50.0

    # ── Сгенерированные праймеры ──
    primers: list[Primer] = field(default_factory=list)

    # ── Предсказанная последовательность продукта ──
    output_name: str = ""
    output_sequence: str = ""
    output_length: int = 0

    # ── Статус ──
    status: str = "design"         # "design","primers_ordered","pcr","assembly",
                                   # "transform","screen","verified"
    notes: str = ""
    created_at: str = field(default_factory=_now)
```

### AssemblyPlan

```python
@dataclass
class AssemblyPlan:
    id: str
    name: str                      # "pEXP-XynTL-v3 modular assembly"
    steps: list[AssemblyStep]      # упорядочены: ранние шаги кормят поздние
    status: str = "design"         # мин(step.status) по всем шагам
    notes: str = ""
    created_at: str = field(default_factory=_now)
```

---

## Логика генерации праймеров

### Ядро: binding region подбирается по Tm, а не фиксированные 20 bp

```python
def _select_binding_region(
    template_seq: str,
    start_pos: int,          # 0-based позиция на темплейте
    direction: str,          # "forward" | "reverse"
    tm_target: float = 60.0,
    min_len: int = 18,
    max_len: int = 28,
    salt_mm: float = 50.0,
) -> tuple[str, float]:
    """Расширяй binding region от min_len до max_len пока Tm < tm_target.

    forward: берём seq[start_pos : start_pos+len], расширяем вправо
    reverse: берём seq[start_pos-len : start_pos], reverse-complement, расширяем влево

    Возвращает (binding_sequence, actual_tm).
    Binding sequence для reverse уже reverse-complemented.
    """
```

### Для каждого фрагмента с needs_amplification=True генерируем 2 праймера

```python
def generate_primers_for_step(step: AssemblyStep) -> list[Primer]:
    primers = []

    for i, frag in enumerate(step.fragments):
        if not frag.needs_amplification:
            # Пропускаем — фрагмент не амплифицируется
            continue

        # ── Forward primer (5' конец фрагмента) ──
        fwd_binding, fwd_tm = _select_binding_region(
            frag.sequence, start_pos=0, direction="forward",
            tm_target=step.default_binding_tm,
        )

        fwd_tail = ""
        fwd_tail_purpose = ""

        # Смотрим junction СЛЕВА от этого фрагмента (junction[i-1])
        if i > 0:
            junc_left = step.junctions[i - 1]
            fwd_tail, fwd_tail_purpose = _compute_fwd_tail(junc_left, step, i)
        elif step.circular:
            # Кольцевая сборка: последний junction соединяет последний с первым
            junc_wrap = step.junctions[-1]
            fwd_tail, fwd_tail_purpose = _compute_fwd_tail(junc_wrap, step, i)

        fwd_primer = Primer(
            name=f"fwd_{frag.name}",
            sequence=fwd_tail.lower() + fwd_binding.upper(),  # tail строчные, binding ПРОПИСНЫЕ
            binding_sequence=fwd_binding,
            tm_binding=fwd_tm,
            tail_sequence=fwd_tail,
            tail_purpose=fwd_tail_purpose,
            ...
        )
        primers.append(fwd_primer)

        # ── Reverse primer (3' конец фрагмента) ──
        rev_binding, rev_tm = _select_binding_region(
            frag.sequence, start_pos=len(frag.sequence), direction="reverse",
            tm_target=step.default_binding_tm,
        )

        rev_tail = ""
        rev_tail_purpose = ""

        # Смотрим junction СПРАВА от этого фрагмента (junction[i])
        if i < len(step.junctions):
            junc_right = step.junctions[i]
            rev_tail, rev_tail_purpose = _compute_rev_tail(junc_right, step, i)

        rev_primer = Primer(
            name=f"rev_{frag.name}",
            sequence=rev_tail.lower() + rev_binding.upper(),
            binding_sequence=rev_binding,
            tm_binding=rev_tm,
            tail_sequence=rev_tail,
            tail_purpose=rev_tail_purpose,
            ...
        )
        primers.append(rev_primer)

    return primers
```

### Логика хвостов: _compute_fwd_tail и _compute_rev_tail

```python
def _compute_fwd_tail(junction: Junction, step: AssemblyStep, frag_index: int) -> tuple[str, str]:
    """Вычислить хвост для forward праймера ПРАВОГО фрагмента junction.

    Возвращает (tail_sequence, purpose_description).
    """

    # ── OVERLAP (overlap PCR / Gibson) ──
    if junction.junction_type == "overlap":
        if junction.overlap_mode == "right_only":
            # Весь overlap на fwd праймере ПРАВОГО фрагмента
            return junction.overlap_sequence, f"full overlap with {left_frag.name}"
        elif junction.overlap_mode == "split":
            # Половина overlap на fwd праймере
            half = junction.overlap_sequence[len(junction.overlap_sequence) // 2:]
            return half, f"overlap (split) with {left_frag.name}"
        else:
            # left_only или none — fwd правого фрагмента чистый, без хвоста
            return "", ""

    # ── GOLDEN GATE ──
    elif junction.junction_type == "golden_gate":
        # fwd праймер: spacer + RE_site + offset_nt + overhang + binding
        enzyme_data = GG_ENZYMES[junction.enzyme]
        site = enzyme_data["site"]
        offset = "A" * enzyme_data["cut_offset"]  # обычно 1 нт
        spacer = "TT"  # 2-нт spacer для эффективности рестрикции
        tail = spacer + site + offset + junction.overhang_4nt
        return tail, f"GG {junction.enzyme} + overhang {junction.overhang_4nt}"

    # ── RESTRICTION ──
    elif junction.junction_type == "sticky_end":
        re_data = RE_DATABASE[junction.re_enzyme_name]
        spacer = "TT"  # для эффективности рестрикции на конце ПЦР-продукта
        tail = spacer + re_data["site"]
        return tail, f"RE site {junction.re_enzyme_name}"

    # ── PREFORMED / BLUNT / PHOSPHORYLATED ──
    elif junction.junction_type in ("preformed", "blunt", "phosphorylated"):
        return "", ""

    return "", ""


def _compute_rev_tail(junction: Junction, step: AssemblyStep, frag_index: int) -> tuple[str, str]:
    """Вычислить хвост для reverse праймера ЛЕВОГО фрагмента junction.

    ВАЖНО: reverse праймер — это reverse complement. Хвост добавляется
    на 5' конец праймера (т.е. НЕ ревёрс-комплементируется — он и так
    будет на нужном конце после ПЦР).
    """

    if junction.junction_type == "overlap":
        if junction.overlap_mode == "left_only":
            # Весь overlap на rev праймере ЛЕВОГО фрагмента
            # ВАЖНО: overlap_sequence — это последовательность на sense strand.
            # Rev праймер идёт в обратном направлении, поэтому его хвост =
            # reverse complement overlap
            rc_overlap = reverse_complement(junction.overlap_sequence)
            return rc_overlap, f"full overlap with {right_frag.name}"
        elif junction.overlap_mode == "split":
            first_half = junction.overlap_sequence[:len(junction.overlap_sequence) // 2]
            rc_half = reverse_complement(first_half)
            return rc_half, f"overlap (split) with {right_frag.name}"
        else:
            return "", ""

    elif junction.junction_type == "golden_gate":
        # rev праймер: spacer + RC(RE_site) + offset + RC(overhang) + binding_RC
        enzyme_data = GG_ENZYMES[junction.enzyme]
        site_rc = reverse_complement(enzyme_data["site"])
        offset = "A" * enzyme_data["cut_offset"]
        overhang_rc = reverse_complement(junction.overhang_4nt)
        spacer = "TT"
        tail = spacer + site_rc + offset + overhang_rc
        return tail, f"GG {junction.enzyme} RC + overhang RC({junction.overhang_4nt})"

    elif junction.junction_type == "sticky_end":
        re_data = RE_DATABASE[junction.re_enzyme_name]
        spacer = "TT"
        site_rc = reverse_complement(re_data["site"])
        tail = spacer + site_rc
        return tail, f"RE site {junction.re_enzyme_name} RC"

    elif junction.junction_type in ("preformed", "blunt", "phosphorylated"):
        return "", ""

    return "", ""
```

---

## Пять методов — как наборы дефолтов

"Метод" — это просто preset который заполняет junction_type и параметры.
Пользователь может потом поменять любой junction индивидуально.

### Overlap PCR
```
- Все junctions: type="overlap", mode="split"
- Все fragments: needs_amplification=True
- default_overlap_length=22, default_overlap_tm=62
- Финальная сборка: fusion PCR
```

### Gibson / NEBuilder / In-Fusion / Pseudo-Gibson
```
- Все junctions: type="overlap", mode="split" (или left_only/right_only)
- default_overlap_length=30, default_overlap_tm=55
- Один фрагмент может быть needs_amplification=False (линеаризованный вектор)
- Финальная сборка: изотермальная реакция (Gibson mix, 50°C, 1 ч)
```

### Golden Gate (BsaI / BbsI / Esp3I)
```
- Все junctions: type="golden_gate", enzyme="BsaI"
- Overhang 4-nt на каждом стыке (уникальные, не палиндромные)
- Фрагменты: needs_amplification=True (если нет готовых GG-entry клонов)
  или needs_amplification=False (синтетические фрагменты с BsaI-сайтами)
- Валидации:
  1. Все overhangs уникальны
  2. Ни один overhang не палиндромный
  3. Нет внутренних RE-сайтов в фрагментах (иначе нужна доместикация)
- Финальная сборка: cyclic restriction + ligation (37/16°C, 30 циклов)
```

### Restriction + Ligation (классика)
```
- Обычно 1-2 junction: type="sticky_end"
- Fragment 1 (insert): needs_amplification=True (праймеры с RE-сайтами)
  или needs_amplification=False (вырезан рестрикцией из другого вектора)
- Fragment 2 (vector): needs_amplification=False (линеаризован рестрикцией)
- Валидации:
  1. Совместимость липких концов (5'/5', 3'/3', blunt/blunt)
  2. Нет внутренних RE-сайтов в инсерте
  3. Направленность (если разные ферменты на 5' и 3' — directional)
```

### KLD (Kinase-Ligase-DpnI)
```
- Ровно 1 fragment: template конструкт, needs_amplification=True
- Ровно 1 junction: type="phosphorylated"
  (back-to-back праймеры, фосфорилированные на 5' концах)
- Мутация закодирована в праймерах:
  - Point mutation: мутантный кодон в binding region одного праймера
  - Insertion: вставка между binding regions двух back-to-back праймеров
  - Deletion: праймеры перепрыгивают удаляемый регион
- Финальная сборка: PCR → DpnI (убить template) → KLD enzyme mix → transform
- ОСОБЕННОСТЬ: binding Tm считается иначе — оба праймера на ОДНОМ темплейте,
  ложатся back-to-back (один за другим, без зазора и без overlap)
```

---

## GUI: страница Assembly Pipeline

### Tab 1: "Планирование сборки" (wizard)

```
┌─────────────────────────────────────────────────────────────┐
│ Шаг 1: МЕТОД                                                │
│ ○ Overlap PCR  ○ Gibson  ○ Golden Gate  ○ Restriction  ○ KLD │
│                                                              │
│ Шаг 2: ФРАГМЕНТЫ                                            │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ #  Имя          Источник           Длина   Ампл.  [×]  │ │
│ │ 1  PglaA        Parts: PglaA       850 bp  ☑ ПЦР       │ │
│ │ 2  XynTL_Q158R  Синтез Vazyme      900 bp  ☐ Готов     │ │
│ │ 3  TtrpC        Parts: TtrpC       740 bp  ☑ ПЦР       │ │
│ │                                                          │ │
│ │ [+ Добавить фрагмент]                                    │ │
│ └──────────────────────────────────────────────────────────┘ │
│                                                              │
│ Шаг 3: СТЫКИ (для каждой пары фрагментов)                   │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ Стык 1→2 (PglaA → XynTL)                                │ │
│ │   Тип: [overlap ▼]                                       │ │
│ │   Overlap на: ○ Обоих  ● Только PglaA (rev)  ○ Только   │ │
│ │               праймерах    праймер              XynTL     │ │
│ │   Длина: [22 bp ◄═══►]   Tm: [62°C ◄═══►]              │ │
│ │   ─── Результат ───                                      │ │
│ │   Overlap: ATCGATCGATCGATCGATCGAT  Tm=63.2°C  GC=52%   │ │
│ │                                                          │ │
│ │ Стык 2→3 (XynTL → TtrpC)                                │ │
│ │   Тип: [overlap ▼]                                       │ │
│ │   Overlap на: ○ Обоих  ○ Только XynTL  ● Только TtrpC   │ │
│ │               праймерах   праймер          (fwd) праймер  │ │
│ │   ...                                                    │ │
│ └──────────────────────────────────────────────────────────┘ │
│                                                              │
│ Шаг 4: ПРАЙМЕРЫ                                              │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ Имя           Последовательность              Tm_bind   │ │
│ │                                                          │ │
│ │ fwd_PglaA     ATCGATCGATCGATCGATCG            60.2°C   │ │
│ │               ^^^^^^^^^^^^^^^^^^^^                       │ │
│ │               binding (no tail — first fragment)          │ │
│ │                                                          │ │
│ │ rev_PglaA     atcgatcgatcgatcgatcgatATCGATCGATCGAT      │ │
│ │               ~~~~~~~~~~~~~~~~~~~~~~^^^^^^^^^^^^^^^^^^   │ │
│ │               overlap with XynTL     binding on PglaA    │ │
│ │               (22 bp, full overlap)  Tm=61.1°C          │ │
│ │                                                          │ │
│ │ fwd_XynTL     — не нужен (фрагмент из синтеза)          │ │
│ │ rev_XynTL     — не нужен (фрагмент из синтеза)          │ │
│ │                                                          │ │
│ │ fwd_TtrpC     gctagctagctagctagctaATCGATCGATCGATCG      │ │
│ │               ~~~~~~~~~~~~~~~~~~~~^^^^^^^^^^^^^^^^^^^^   │ │
│ │               overlap with XynTL   binding on TtrpC      │ │
│ │               (20 bp, full overlap) Tm=59.8°C            │ │
│ │                                                          │ │
│ │ rev_TtrpC     ATCGATCGATCGATCGATCG            60.5°C   │ │
│ │               ^^^^^^^^^^^^^^^^^^^^                       │ │
│ │               binding (no tail — last fragment, linear)   │ │
│ │                                                          │ │
│ │ [Копировать для заказа]  [Сохранить в реестр праймеров]  │ │
│ └──────────────────────────────────────────────────────────┘ │
│                                                              │
│ Шаг 5: СОХРАНИТЬ                                             │
│   Имя конструкта: [pEXP-XynTL-v3]                           │
│   Заметки: [...]                                             │
│   [Создать сборку]                                           │
└─────────────────────────────────────────────────────────────┘
```

### Для Golden Gate интерфейс стыков другой:

```
│ Стык 1→2 (PglaA → XynTL)                                │
│   Тип: [golden_gate]  Фермент: [BsaI ▼]                 │
│   Overhang 4-нт: [ATCG]  ✓ уникальный  ✓ не палиндром   │
│                                                          │
│ Стык 2→3 (XynTL → TtrpC)                                │
│   Тип: [golden_gate]  Фермент: [BsaI ▼]                 │
│   Overhang 4-нт: [GCTA]  ✓ уникальный  ✓ не палиндром   │
│                                                          │
│ Замыкающий стык 3→1 (для кольцевого продукта)            │
│   Overhang 4-нт: [TTAC]  ✓ уникальный  ✓ не палиндром   │
│                                                          │
│ ⚠ Внутренний сайт BsaI найден в XynTL (pos 423)         │
│   → нужна доместикация (тихая мутация)                   │
```

### Для Restriction/Ligation:

```
│ Стык vector → insert (5' конец)                          │
│   Тип: [sticky_end]  Фермент: [EcoRI ▼]                 │
│   Overhang: AATT (5' выступ)                             │
│                                                          │
│ Стык insert → vector (3' конец)                          │
│   Тип: [sticky_end]  Фермент: [BamHI ▼]                 │
│   Overhang: GATC (5' выступ)                             │
│                                                          │
│ ✓ Направленное клонирование (разные ферменты)            │
│ ✓ Совместимость концов ОК                                │
│ ⚠ Внутренний EcoRI сайт в инсерте (pos 234) — ПРОБЛЕМА  │
```

### Для KLD:

```
│ Темплейт: [P42_pGAP_AMY:1.0 ▼]                         │
│ Мутация:  [Точечная ▼]                                   │
│                                                          │
│ Позиция: [158]  Feature: [CDS:amy]                       │
│ Старый кодон: CAG (Gln)  Новый кодон: [CGG] (Arg)       │
│                                                          │
│ Праймеры (back-to-back, 5'-фосфорилированные):           │
│ fwd: CGGАТCGATCGATCGATCG         Tm=62.1°C              │
│      ^^^                          мутантный кодон         │
│         ^^^^^^^^^^^^^^^^^^        binding downstream      │
│                                                          │
│ rev: TAGCTAGCTAGCTAGCTAGC         Tm=61.5°C              │
│      ^^^^^^^^^^^^^^^^^^^^         binding upstream (RC)   │
│                                                          │
│ [!] 5' фосфорилирование обязательно для обоих праймеров  │
│ Реакция: PCR → DpnI 1ч 37°C → KLD mix 5мин RT → трансф. │
```

---

## Форматирование праймеров для заказа

Кнопка "Копировать для заказа" генерирует tab-separated текст:

```
Name	Sequence	Scale	Purification	Modification
fwd_PglaA	ATCGATCGATCGATCGATCG	25 nmol	Desalt	—
rev_PglaA	atcgatcgatcgatcgatcgatATCGATCGATCGAT	25 nmol	Desalt	—
fwd_TtrpC	gctagctagctagctagctaATCGATCGATCGATCG	25 nmol	Desalt	—
rev_TtrpC	ATCGATCGATCGATCGATCG	25 nmol	Desalt	—
```

Для KLD:
```
fwd_Q158R	CGGATCGATCGATCGATCG	25 nmol	PAGE	5'-Phosphorylation
rev_Q158R	TAGCTAGCTAGCTAGCTAGC	25 nmol	PAGE	5'-Phosphorylation
```

Длинные праймеры (>40 нт) автоматически помечаются "PAGE purification".

---

## Валидации и предупреждения

Система должна проверять и предупреждать:

### Общие (все методы):
- Праймер длиннее 60 нт — дорого и менее эффективно
- Binding Tm < 55°C или > 68°C
- GC% binding < 35% или > 70%
- ΔTm binding между forward и reverse > 5°C
- Гомополимерные участки (>4 одинаковых нт подряд) в binding или overlap
- Потенциальные hairpin структуры (самокомплементарность)

### Overlap/Gibson специфичные:
- ΔTm между overlap зонами > 3°C
- Overlap < 15 bp (ненадёжно) или > 40 bp (лишнее)
- Overlap GC < 35% или > 70%

### Golden Gate специфичные:
- Дублирующиеся overhangs
- Палиндромные overhangs
- Внутренние сайты RE в фрагментах (нужна доместикация)
- Overhang AT% > 75% (менее эффективная лигация)

### Restriction специфичные:
- Внутренние сайты RE в инсерте
- Несовместимые концы
- Одинаковый фермент с обеих сторон без фосфатазной обработки → self-ligation

### KLD специфичные:
- Праймеры не back-to-back (есть зазор или overlap между ними)
- Мутация нарушает RE-сайт (может быть проблемой или преимуществом)

---

## Multi-step assembly (вложенные сборки)

GUI: кнопка "+ Добавить шаг" создаёт новый AssemblyStep.
В списке источников фрагментов появляется опция "Выход предыдущего шага".

Визуально — горизонтальная цепочка шагов:

```
[Step 1: Golden Gate] ──→ [Step 2: Gibson] ──→ Final
  3 parts → cassette        cassette + backbone → construct
```

При выборе source_type="previous_step":
- fragment.sequence автоматически заполняется из output_sequence предыдущего шага
- fragment.needs_amplification = False (если продукт предыдущего шага используется напрямую)
  или True (если нужна ПЦР-амплификация продукта)

---

## Файловая структура реализации

```
src/pvcs/
├── assembly_engine.py      # НОВЫЙ: AssemblyPlan, AssemblyStep, generate_primers_for_step()
├── junction_design.py      # НОВЫЙ: вычисление overlap/GG/RE/KLD для каждого junction
├── golden_gate.py          # НОВЫЙ: GG-специфичная логика
├── restriction.py          # НОВЫЙ: RE database, совместимость, поиск сайтов
├── kld.py                  # НОВЫЙ: back-to-back primer design
├── overlap.py              # ОБНОВИТЬ: _select_binding_region() по Tm
├── models.py               # ОБНОВИТЬ: новые dataclasses
├── database.py             # ОБНОВИТЬ: таблицы assembly_plans, assembly_steps, junctions
└── assembly.py             # ОБНОВИТЬ: CRUD для новых моделей

gui/gui/_pages/
└── p07_assembly.py         # ПЕРЕПИСАТЬ: wizard + pipeline + templates
```

---

## Реализация поэтапно

### Этап 1 (backend, приоритет: сегодня)
1. _select_binding_region() в overlap.py — Tm-based binding
2. Junction dataclass в models.py с overlap_mode
3. generate_primers_for_step() в assembly_engine.py — генерация по junction specs
4. Тест: 3-fragment overlap PCR с mode=left_only на junction 1

### Этап 2 (Golden Gate)
5. golden_gate.py: check_overhangs, check_internal_sites, suggest_overhangs
6. Генерация GG-праймеров: spacer + RE + offset + overhang + binding
7. Тест: 4-fragment BsaI Golden Gate

### Этап 3 (Restriction + KLD)
8. restriction.py: RE_DATABASE, find_sites, check_compatibility
9. kld.py: back-to-back primer design для point/insertion/deletion
10. Тест: EcoRI/BamHI клонирование; Q158R KLD

### Этап 4 (GUI)
11. p07_assembly.py: wizard с динамическими junction-настройками
12. Multi-step support

### Этап 5 (валидации)
13. Все предупреждения из секции "Валидации"
14. Визуальные индикаторы в GUI
