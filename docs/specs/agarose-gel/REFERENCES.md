# Agarose Gel — научные источники и продуктовые выводы

**Статус:** FUTURE / NOT ACTIVE — research basis для будущей реализации.
**Правило:** источники обосновывают границы модели; они не превращают относительный preview в калиброванный лабораторный прибор.

## 1. Линейная dsDNA: размер, агароза и поле

N. C. Stellwagen, *Electrophoresis of DNA in agarose gels, polyacrylamide gels and in free solution*, Electrophoresis / review:

- https://pmc.ncbi.nlm.nih.gov/articles/PMC2643323/

Поддерживаемые выводы:

- mobility линейной dsDNA зависит от molecular size;
- зависимость меняется с agarose concentration и electric field;
- большие молекулы переходят в другие режимы движения, поэтому один универсальный linear ruler невозможен;
- абсолютную distance/time модель нельзя выводить только из `bp` и `% agarose`.

Продуктовое следствие:

- используем относительную log-size projection;
- gel profile задаёт planning window;
- не показываем cm/min и не обещаем точное положение.

## 2. Log size и marker calibration

Lee P. Y. et al., *Agarose Gel Electrophoresis for the Separation of DNA Fragments*, Journal of Visualized Experiments:

- https://pmc.ncbi.nlm.nih.gov/articles/PMC4846332/

Поддерживаемые выводы:

- размер неизвестного линейного фрагмента оценивают по сравнению с DNA standard;
- стандартный подход использует связь между логарифмом размера и пройденным расстоянием;
- разные conformations DNA мигрируют с разной скоростью;
- очень крупные фрагменты требуют другого режима, включая PFGE.

Продуктовое следствие:

- marker lane обязательна по default;
- formula использует `log10(bp)`;
- uncut plasmid нельзя сравнивать с linear marker как обычный линейный fragment;
- PFGE остаётся OUT.

## 3. Topology влияет на mobility

P. Serwer, J. L. Allen, *Conformation of double-stranded DNA during agarose gel electrophoresis: fractionation of linear and circular molecules with molecular weights between 3×10^6 and 26×10^6*, Biochemistry, 1984:

- https://pubmed.ncbi.nlm.nih.gov/6370305/
- DOI: https://doi.org/10.1021/bi00300a020

Поддерживаемый вывод:

- mobility измеримо зависит от topological conformation, gel concentration, temperature и voltage gradient.

Продуктовое следствие:

- topology — обязательный input fact;
- unknown topology не становится linear;
- circular conformation нельзя «исправить» одним multiplier без calibration.

## 4. Open circular DNA ведёт себя нелинейно

S. D. Levene, B. H. Zimm, *Separations of open-circular DNA using pulsed-field electrophoresis*, PNAS, 1987:

- https://pmc.ncbi.nlm.nih.gov/articles/PMC305020/
- DOI: https://doi.org/10.1073/pnas.84.12.4054

Поддерживаемые выводы:

- high-field effect на open circular DNA резко отличается от linear DNA того же molecular weight;
- достаточно крупные circular forms могут задерживаться в gel;
- field conditions принципиально меняют поведение.

Продуктовое следствие:

- MVP не синтезирует open-circle band по размеру;
- отсутствие смоделированной band — честное unsupported, не biological zero.

## 5. Circular mobility меняет порядок с размером и условиями

K. D. Cole et al., *Separation of large circular DNA by electrophoresis in agarose gels*, Biotechnology Progress, 2002:

- https://pubmed.ncbi.nlm.nih.gov/11822904/
- DOI: https://doi.org/10.1021/bp010135o

Поддерживаемые выводы:

- supercoiled/open circular формы имеют нетривиальную size-dependent mobility;
- для open circles наблюдался mobility minimum около 20 kbp;
- относительный порядок open-circle и supercoiled forms менялся с размером/условиями.

Продуктовое следствие:

- правило «supercoiled всегда быстрее, open circle всегда медленнее» нельзя делать универсальным production contract;
- качественная circular simulation возможна только отдельным калиброванным scope.

## 6. Разрешённые пользовательские формулировки

Можно:

- «Относительная оценка для линейной двуцепочечной ДНК».
- «Реальное положение зависит от агарозы, поля, буфера и конформации».
- «Неразрезанная кольцевая плазмида не оценивается по линейному маркеру».
- «Расчётная масса полосы».
- «Ожидаемый полный дайджест».

Нельзя:

- «Точная эмуляция геля».
- «Эта полоса будет на 4,2 см».
- «Через 35 минут фрагмент окажется здесь».
- «3 kb plasmid = 3 kb linear band».
- «Полоса отсутствует», если lane unsupported/fault.
- «Фрагменты точно разделятся», если размеры лишь близки.

## 7. Что нужно исследовать отдельно для post-MVP

- calibrated mobility curves конкретного gel %, buffer и field;
- vendor ladder relative-mass profiles и лицензирование названий;
- partial digest kinetics;
- supercoiled/open-circle/nicked distributions;
- smear/degradation;
- real-image lane detection и densitometry;
- PFGE.

Ни один из этих пунктов не должен проникать в MVP скрытым коэффициентом.
